// Residual tells (builder-189's open risks, verifier P17i W0 S1 and S2): nothing in the committed
// world (fixtures/world.ndjson.gz) may tell a resource a task overlay planted from one the Synthea
// cohort generated, apart from what the record says.
//   - Ids. Every numbered id follows Synthea's own rule (scripts/fixtures-synthea.ts): per type,
//     numbered 1..N in (patient, date) order. So a planted id sits inside its patient's block, by
//     date, among the generated ones, never above the type's base range or in a run of its own,
//     and the types only overlays write (Task, Communication, ServiceRequest, Appointment,
//     EpisodeOfCare) are numbered the same way. An id then says nothing a reader cannot see in the
//     record's patient and date.
//   - Shape. Every planted resource's set of top-level fields is one some generated resource of
//     its type also has, and no field path (code.text, dosageInstruction.route, ...) appears only
//     on planted resources of a type, or on every generated one but not on a planted one.
//   - Values (builder-203, verifier P17i W0-1b F1, F4): no value form is planted-only, and within a
//     task chart no field path is, and no one feature separates planted from generated records.
// Planted means named in a task's id registry (tasks/planted.ts).
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fhirOrder } from '../../packages/env/canonical.ts';
import { clock } from '../../packages/env/clock.ts';
import { TASKS } from '../../packages/env/overlay.ts';
import { HOSPITAL_PROCEDURES } from '../../packages/env/profile.ts';
import { Store, type Resource } from '../../packages/env/store.ts';
import { READ_TOOLS, type ReadContext } from '../../packages/env/tools/read/index.ts';
import { callTool } from '../../packages/env/tools/registry.ts';
import { isPlanted } from '../../tasks/planted.ts';
import { gunzip } from '../fixtures-lib.ts';
import { repoRoot } from './helpers.ts';
import { idForm, SEMANTIC_TAG, scoreTells, type TypeScore } from './tells.ts';

type R = Record<string, unknown> & { resourceType: string; id: string };
const world = gunzip(readFileSync(join(repoRoot, 'fixtures/world.ndjson.gz')))
  .toString('utf8')
  .split('\n')
  .filter((l) => l !== '')
  .map((l) => JSON.parse(l) as R);

const NUMBERED = /^[a-z]+-(\d{5})$/;
const num = (r: R) => Number(NUMBERED.exec(r.id)![1]);

// The patient a resource is about: its first Patient reference, at any depth.
function patientOf(v: unknown): string | undefined {
  if (Array.isArray(v)) {
    for (const x of v) {
      const p = patientOf(x);
      if (p) return p;
    }
  } else if (v !== null && typeof v === 'object') {
    const ref = (v as { reference?: unknown }).reference;
    if (typeof ref === 'string' && ref.startsWith('Patient/')) return ref.slice(8);
    for (const x of Object.values(v)) {
      const p = patientOf(x);
      if (p) return p;
    }
  }
  return undefined;
}

// The record's clinical date, as Synthea's numbering reads it (fixtures-synthea.ts dateOf), plus
// the date fields of the types only overlays write.
function dateOf(r: R): number {
  for (const k of ['effectiveDateTime', 'onsetDateTime', 'authoredOn', 'performedDateTime', 'recordedDate', 'date', 'sent', 'start']) {
    if (typeof r[k] === 'string') return Date.parse((r[k] as string).length === 10 ? `${r[k] as string}T00:00:00Z` : (r[k] as string));
  }
  for (const k of ['period', 'performedPeriod', 'effectivePeriod']) {
    const start = (r[k] as { start?: string } | undefined)?.start;
    if (start) return Date.parse(start);
  }
  return -Infinity;
}

const byType = new Map<string, R[]>();
for (const r of world) if (NUMBERED.test(r.id)) byType.set(r.resourceType, [...(byType.get(r.resourceType) ?? []), r]);
for (const rs of byType.values()) rs.sort((a, b) => num(a) - num(b));

describe('planted ids are numbered as the generated ones are', () => {
  it('every type is numbered 1..N with no gap', () => {
    const gaps = [...byType].filter(([, rs]) => rs.some((r, i) => num(r) !== i + 1)).map(([t, rs]) => `${t}: ${rs.length} ids, last ${rs.at(-1)!.id}`);
    expect(gaps).toEqual([]);
  });

  it('no planted id sorts above its type\'s generated range', () => {
    const above = [...byType].flatMap(([, rs]) => {
      const base = rs.filter((r) => !isPlanted(r.id));
      if (!base.length) return [];
      const max = Math.max(...base.map(num));
      return rs.filter((r) => isPlanted(r.id) && num(r) > max).map((r) => `${r.resourceType}/${r.id} > ${base.find((b) => num(b) === max)!.id}`);
    });
    expect(above).toEqual([]);
  });

  it("each patient's resources of a type hold one contiguous block of ids, planted and generated together", () => {
    const split = [...byType].flatMap(([t, rs]) => {
      const blocks = new Map<string, number[]>();
      for (const r of rs) {
        const p = patientOf(r) ?? '(none)';
        blocks.set(p, [...(blocks.get(p) ?? []), num(r)]);
      }
      return [...blocks].filter(([, ns]) => ns.at(-1)! - ns[0]! + 1 !== ns.length).map(([p, ns]) => `${t} ${p}: ${ns.length} ids over ${ns[0]}-${ns.at(-1)}`);
    });
    expect(split).toEqual([]);
  });

  it('ids follow (patient, date) order in every type, the planted-only types included', () => {
    const order = (r: R) => [patientOf(r) ?? '￿', dateOf(r)] as const;
    const out = [...byType].flatMap(([, rs]) =>
      rs.slice(1).flatMap((r, i) => {
        const [pa, da] = order(rs[i]!);
        const [pb, db] = order(r);
        return pa < pb || (pa === pb && da <= db) ? [] : [`${rs[i]!.resourceType}/${rs[i]!.id} (${pa}) before ${r.id} (${pb})`];
      }),
    );
    expect(out.slice(0, 20)).toEqual([]);
  });
});

// Every key path of a resource (arrays flattened): 'code', 'code.coding', 'code.coding.system', ...
function paths(v: unknown, at = '', out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) paths(x, at, out);
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const p = at ? `${at}.${k}` : k;
      out.add(p);
      paths(x, p, out);
    }
  }
  return out;
}

describe('planted resources have the shape of generated ones', () => {
  const types = [...new Set(world.filter((r) => isPlanted(r.id)).map((r) => r.resourceType))].filter((t) => world.some((r) => r.resourceType === t && !isPlanted(r.id) && NUMBERED.test(r.id)));
  const of = (t: string, planted: boolean) => world.filter((r) => r.resourceType === t && isPlanted(r.id) === planted && (planted || NUMBERED.test(r.id)));

  it('every planted top-level field set is one a generated resource of its type has', () => {
    const out = types.flatMap((t) => {
      const base = new Set(of(t, false).map((r) => Object.keys(r).sort().join(',')));
      return of(t, true).filter((r) => !base.has(Object.keys(r).sort().join(','))).map((r) => `${t}/${r.id}: ${Object.keys(r).sort().join(',')}`);
    });
    expect(out).toEqual([]);
  });

  it('no field path appears only on planted resources of a type', () => {
    const out = types.flatMap((t) => {
      const base = new Set(of(t, false).flatMap((r) => [...paths(r)]));
      const only = new Set(of(t, true).flatMap((r) => [...paths(r)].filter((p) => !base.has(p))));
      return [...only].sort().map((p) => `${t}.${p}`);
    });
    expect(out).toEqual([]);
  });

  it('no field path on every generated resource of a type is missing from a planted one', () => {
    const out = types.flatMap((t) => {
      const base = of(t, false).map((r) => paths(r));
      const everywhere = [...base[0]!].filter((p) => base.every((s) => s.has(p)));
      return of(t, true).flatMap((r) => {
        const own = paths(r);
        return everywhere.filter((p) => !own.has(p)).map((p) => `${t}/${r.id} lacks ${p}`);
      });
    });
    expect(out).toEqual([]);
  });
});

// Value formats (verifier P17i W0-1b F1). A field can carry a value in a form only overlays write:
// a timestamp to the minute where Synthea writes seconds and milliseconds, a dose in mg where every
// generated dose counts tablets, a category code no generated record uses. format() gives a leaf
// value's form: a date or timestamp digit for digit (seconds kept when they are 00, which Synthea
// rarely writes), a coded enumeration (status, category, interpretation, class, system, ...) as
// itself, a number as its count of decimals, other strings by character class. Free text has no
// form here.
const FREE = /(^|\.)(id|reference|div|data|text|display|comment|conclusion|title|description|name|family|given|line|url|valueString|unit)$/;
const EXACT = /(^|\.)(system|status|intent|docStatus|priority|criticality|severity|contentType|use)$|^(category|type)$|(^|\.)(category|interpretation|class)(\.coding)?\.code$/;
const DATE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;
function format(path: string, v: unknown): string | null {
  if (typeof v === 'number') return `${(String(v).split('.')[1] ?? '').length}dp`;
  if (typeof v !== 'string') return typeof v;
  if (DATE.test(v)) return v.replace(/(T\d{2}:\d{2}:)00/, '$1§').replace(/\d/g, '9').replace('§', '00');
  if (FREE.test(path)) return null;
  if (EXACT.test(path)) return JSON.stringify(v);
  // A quantity's unit code by kind: an annotation ({tablet}), a customary unit ([lb_av], mm[Hg]) or
  // a plain UCUM unit (mg, mmol/L). The unit itself is the test's or the drug's, like its code.
  if (/(Quantity|quantity|Duration|low|high)\.code$/.test(path)) return /^\{[^}]*\}$/.test(v) ? 'annotation' : v.includes('[') ? 'customary' : 'ucum';
  return v.replace(/[A-Z]/g, 'A').replace(/[a-z]/g, 'a').replace(/\d/g, '9').replace(/(.)\1+/g, '$1+');
}
function formats(v: unknown, at = '', out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) formats(x, at, out);
  else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) formats(x, at ? `${at}.${k}` : k, out);
  else {
    const f = format(at, v);
    if (f !== null) out.add(`${at}=${f}`);
  }
  return out;
}

// The value forms the verifier's probe reads (evidence/verifier-P17i-W0-1b-1/probe.mjs), so that this
// test holds the gate's number: free text and names as their type, every other leaf by character
// class with runs collapsed (an enumeration's value is one such shape, a timestamp another).
const PROBE_FREE = /(^|\.)(id|reference|div|data|text|display|value|valueString|comment|conclusion|title|description|name|family|given|line|url)$/;
const PROBE_TIME = /(Date|date|Time|time|start|end|issued|authoredOn|sent|period|recorded)/i;
function probeFormats(v: unknown, at = '', out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) probeFormats(x, at, out);
  else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) probeFormats(x, at ? `${at}.${k}` : k, out);
  else if (typeof v === 'string' && PROBE_FREE.test(at) && !PROBE_TIME.test(at)) out.add(`${at}=<string>`);
  else out.add(`${at}=${typeof v !== 'string' ? typeof v : v.replace(/[A-Z]/g, 'A').replace(/[a-z]/g, 'a').replace(/\d/g, '9').replace(/(.)\1+/g, '$1+')}`);
  return out;
}

const comparable = [...new Set(world.filter((r) => isPlanted(r.id)).map((r) => r.resourceType))].filter((t) => world.some((r) => r.resourceType === t && !isPlanted(r.id) && NUMBERED.test(r.id)));

describe('planted values have the formats of generated ones', () => {
  it('no (field path, value format) pair appears only on planted resources of a type', () => {
    const out = comparable.flatMap((t) => {
      const base = new Set(world.filter((r) => r.resourceType === t && !isPlanted(r.id)).flatMap((r) => [...formats(r)]));
      const only = new Map<string, string[]>();
      for (const r of world.filter((x) => x.resourceType === t && isPlanted(x.id))) for (const f of formats(r)) if (!base.has(f)) only.set(f, [...(only.get(f) ?? []), r.id]);
      return [...only].sort().map(([f, ids]) => `${t}.${f} (${ids.length}: ${ids.slice(0, 3).join(' ')})`);
    });
    expect(out).toEqual([]);
  });
});

// Within one chart (verifier P17i W0-1b F4). The agent reads a task patient's chart, not the world:
// a field that, in that chart, only planted records carry (a lab comment on the one hemolysed
// potassium) points at them even when other charts' generated records carry it too.
const taskCharts = [...new Set(world.filter((r) => isPlanted(r.id)).map((r) => patientOf(r)).filter((p): p is string => p !== undefined))].sort();
const inChart = (t: string, p: string) => world.filter((r) => r.resourceType === t && patientOf(r) === p);

describe('within a task chart, planted resources look like the generated ones', () => {
  it('lists the charts that hold no generated resource of a planted type', () => {
    // Nothing to compare against there: every record of the type in the chart is planted. The
    // global tests above cover them. A cell leaves this list when its chart gains a generated record.
    const empty = taskCharts.flatMap((p) => comparable.filter((t) => inChart(t, p).some((r) => isPlanted(r.id)) && !inChart(t, p).some((r) => !isPlanted(r.id))).map((t) => `${p} ${t}`));
    expect(empty).toEqual(EMPTY_CELLS);
  });

  it('no field path on a planted resource is absent from every generated resource of its type in the chart', () => {
    const out = taskCharts.flatMap((p) =>
      comparable.flatMap((t) => {
        const rs = inChart(t, p);
        const base = rs.filter((r) => !isPlanted(r.id));
        if (!base.length) return [];
        const have = new Set(base.flatMap((r) => [...paths(r)]));
        return rs.filter((r) => isPlanted(r.id)).flatMap((r) => [...paths(r)].filter((x) => !have.has(x)).map((x) => `${p} ${t}/${r.id} ${x}`));
      }),
    );
    expect(out).toEqual([]);
  });

  it('no one feature (a field path, a field set or a value format) separates planted from generated in the task charts: balanced accuracy at most 0.70', () => {
    const charts = new Set(taskCharts);
    const features = (r: R) => new Set([...[...paths(r)].map((x) => `P:${x}`), `K:${Object.keys(r).sort().join(',')}`, ...[...probeFormats(r)].map((x) => `V:${x}`)]);
    const out = comparable.flatMap((t) => {
      const pop = world.filter((r) => r.resourceType === t && charts.has(patientOf(r) ?? ''));
      const pos = pop.filter((r) => isPlanted(r.id));
      const neg = pop.filter((r) => !isPlanted(r.id));
      if (!pos.length || !neg.length) return [];
      const count = (rs: R[]) => {
        const m = new Map<string, number>();
        for (const r of rs) for (const f of features(r)) m.set(f, (m.get(f) ?? 0) + 1);
        return m;
      };
      const [cp, cn] = [count(pos), count(neg)];
      return [...new Set([...cp.keys(), ...cn.keys()])].flatMap((f) => {
        const ba = ((cp.get(f) ?? 0) / pos.length + 1 - (cn.get(f) ?? 0) / neg.length) / 2;
        return Math.max(ba, 1 - ba) > 0.7 ? [`${t} ${f.slice(0, 140)}: ${Math.max(ba, 1 - ba).toFixed(3)} (planted ${cp.get(f) ?? 0}/${pos.length}, generated ${cn.get(f) ?? 0}/${neg.length})`] : [];
      });
    });
    expect(out).toEqual([]);
  });
});

// Synthea's text fingerprint (verifier P17i W0-1b r3 F2): a SNOMED semantic tag ending a display
// or a text ('Colonoscopy (procedure)'), and a visit note in Synthea's markdown ('# Chief
// Complaint'). Pilot models set such records aside as 'generic synthea notes', and every record that
// carried one was generated, so no record in the world carries either (profileWorld, plainText).
describe("no record carries Synthea's text fingerprint", () => {
  const decode = (v: string) => Buffer.from(v, 'base64').toString('utf8');
  const hits = (pred: (at: string, v: string) => boolean) =>
    world.flatMap((r) => {
      const out: string[] = [];
      const walk = (v: unknown, at: string): void => {
        if (Array.isArray(v)) for (const x of v) walk(x, at);
        else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k);
        else if (typeof v === 'string' && pred(at, v)) out.push(`${r.resourceType}/${r.id} ${at}: ${(at.endsWith('data') ? decode(v) : v).slice(0, 80)}`);
      };
      walk(r, '');
      return out;
    });

  it('no display, text or attachment text holds a SNOMED semantic tag', () => {
    const out = hits((at, v) => (/(^|\.)(display|text|description)$/.test(at) && SEMANTIC_TAG.test(v)) || (at.endsWith('data') && SEMANTIC_TAG.test(decode(v))));
    expect(out.slice(0, 20)).toEqual([]);
  });

  it('no attachment text is in markdown', () => {
    expect(hits((at, v) => at.endsWith('data') && /^#+ /m.test(decode(v))).slice(0, 20)).toEqual([]);
  });
});

// The MRN (builder-208, pilot-3): the task overlays gave their patients an MRN of the form NNNN-NN
// and the cohort's carried 1000NN, its id number, so the form marked seven task patients. Every
// Patient's MRN now comes from one rule (packages/env/mrn.ts), whoever writes the patient.
describe('every MRN has one form, and none marks a task patient', () => {
  const MRN_SYSTEM = 'urn:riverbend:mrn';
  const slots = new Set(Object.values(TASKS).flatMap((t) => t.slots as readonly string[]));
  const pts = world.filter((r) => r.resourceType === 'Patient');
  const mrnOf = (r: R) => ((r.identifier ?? []) as Array<{ system?: string; value?: string }>).filter((i) => i.system === MRN_SYSTEM).map((i) => i.value ?? '');

  it('every Patient has one MRN, unique in the world, of the form 9999-99, and it does not carry its id number', () => {
    expect(pts.filter((r) => mrnOf(r).length !== 1).map((r) => r.id)).toEqual([]);
    const all = pts.map((r) => mrnOf(r)[0]!);
    expect(new Set(all).size).toBe(all.length);
    expect([...new Set(all.map(idForm))]).toEqual(['9999-99']);
    expect(pts.filter((r) => mrnOf(r)[0]!.replace('-', '').includes(r.id.slice(3))).map((r) => `${r.id} ${mrnOf(r)[0]}`)).toEqual([]);
  });

  it('no identifier form (IDF) is held only by task patients, or only by the others', () => {
    const forms = (keep: (r: R) => boolean) => new Set(pts.filter(keep).flatMap((r) => mrnOf(r).map(idForm)));
    const task = forms((r) => slots.has(r.id));
    const other = forms((r) => !slots.has(r.id));
    expect({ taskOnly: [...task].filter((f) => !other.has(f)), otherOnly: [...other].filter((f) => !task.has(f)) }).toEqual({ taskOnly: [], otherOnly: [] });
  });
});

// The verifier's extended classifier (verifier P17i W0-1b r2 probe2 and r3 probe3, builder-205 F4,
// builder-206; scripts/test/tells.ts): timestamp minute and seconds, the chart's own clock, issued
// against effective time, exact codes, categories, performers and providers, the visit, order in the
// chart, attachment length and text shape, and every AND / OR of two of the 150 strongest features.
// The coordinator's bar (decisions.tsv, W0-1b round 3): per type in the task charts, best single
// feature at most 0.75 and best pair at most 0.80. A feature over the bar that follows from what the
// task is, not from how the record was written, is a named residual below: its exact feature values
// are scored apart and held to a cap, and so is every pair that holds one.
const SINGLE_BAR = 0.75;
const PAIR_BAR = 0.8;
// A type with fewer than five planted records in the task charts is held to the 95th percentile of a
// random-label baseline instead: drop the type's planted records, label four generated records of the
// type in the task charts as planted, run the same search, 100 draws (builder-206 evidence,
// perm-tells.ts). This is the tail of chance, not its middle: the null's mean is about 0.79 / 0.90
// (AllergyIntolerance) and 0.76 / 0.88 (Procedure). A small type over it is a design residual, not
// small n: Procedure's planted records are hospital procedures (the last residual below).
const SMALL = 5;
const SMALL_BARS: Readonly<Record<string, readonly [number, number]>> = { AllergyIntolerance: [0.893, 0.964], Procedure: [0.859, 0.955] };

// Order in the chart is one fact, the record's date against its chart's, seen through several
// features (newest tenth, last three, newest, newest of its code, how many share its code, age), so
// the whole family is the residual. Every other residual names its exact feature values: a new
// planted-only code, category or performer stays in the search.
const ORDER_CAPS: Readonly<Record<string, readonly [number, number]>> = {
  AllergyIntolerance: [0.7, 0.87], Condition: [0.69, 0.75], DiagnosticReport: [0.89, 1], DocumentReference: [0.75, 0.84], Encounter: [0.72, 0.83], MedicationRequest: [0.76, 0.89], Observation: [0.85, 0.9], Procedure: [0.61, 0.98],
};
const RESIDUALS: ReadonlyArray<{ type: string; features: readonly string[] | 'order'; cap: number; pairCap: number; why: string }> = [
  ...Object.entries(ORDER_CAPS).map(([type, [cap, pairCap]]) => ({
    type, features: 'order' as const, cap, pairCap,
    why: 'order in the chart: the planted records are the recent events the task is about (the newest report, the last results, a drug new to the chart)',
  })),
  { type: 'MedicationRequest', features: ['TH:authoredOn=am', 'TH:authoredOn=pm'], cap: 0.83, pairCap: 0.91, why: 'hour of the day: the overlays write orders at morning clinic, and the planted times keep their hour (coordinator brief, builder-205 F1)' },
  { type: 'MedicationRequest', features: ['E:status=completed'], cap: 0.77, pairCap: 0.87, why: 'status: the planted orders are the current regimen the task reviews; most generated orders are past ones' },
  { type: 'MedicationRequest', features: ['E:requester.reference=Practitioner/pr-reyes'], cap: 0.76, pairCap: 0.87, why: "prescriber: the planted orders are the task's clinicians' (Dr. Okafor, Dr. Lin); Synthea's spread over the three staff" },
  {
    type: 'DiagnosticReport', features: ['E:category.coding.code=RAD', 'E:category.coding.display=Radiology', 'E:category.coding.code=OTH', 'E:category.coding.display=Other', 'HHMM:presentedForm.data=true', 'DLINES:presentedForm.data=10', 'DHEAD:presentedForm.data=heading - place', 'DIGITS:presentedForm.data=true', 'TBRK:code.coding.display', 'TBRK:code.text', 'BRACE:presentedForm.data=true', 'BRACE:presentedForm.data=false'], cap: 0.79, pairCap: 0.9,
    why: 'report kind: the planted reports are the imaging and laboratory results a task acts on (four radiology reports, headed by the imaging department, with their long text and the times a radiologist signs at); the generated ones are mostly questionnaires, whose LOINC names carry their abbreviation in brackets ("[AUDIT-C]"), in the code and on the printed form',
  },
  {
    type: 'AllergyIntolerance', features: ['TY:recordedDate=1975', 'CMODE:onsetDateTime=true', 'CSS:onsetDateTime=true', 'CSSTOP3:onsetDateTime=true', 'CTOP3:onsetDateTime=true', 'E:category=environment'], cap: 0.81, pairCap: 0.98,
    why: "Synthea records every generated allergy at the patient's birth, to the second, and only Synthea's allergies are environmental; the four planted ones are drug and food allergies recorded at visits",
  },
  { type: 'DocumentReference', features: ['CRARE:context.period.end=false', 'CRARE:context.period.end=true'], cap: 0.77, pairCap: 0.88, why: "a note's period end against the chart's clock: 31 of the 55 planted notes sit in one chart (pt-0028) beside one generated visit, so that chart's clock has nothing to draw a visit's end from; Synthea's notes keep their visit's end, and moving a generated time would break the base cohort's order (world-hygiene.test.ts). Its strongest pair adds the note's date off the chart's modal minute: Synthea dates a note at its visit's start, and a planted discharge summary is signed when the visit ends (builder-206 F6)" },
  {
    type: 'Procedure', features: ['E:performer.actor.reference=Organization/org-riverbend', 'E:performer.actor.reference=Organization/org-st-brigid', 'TH:performedDateTime=am', 'E:outcome.text=Normal, no polyps'], cap: 0.95, pairCap: 1,
    why: "the four planted procedures are hospital procedures (colonoscopies, a hip replacement) done in the morning at St. Brigid, three with a colonoscopy's finding; most of Synthea's are the clinic's (dental work, screens, assessments). Above the small-n bar on 100 of 100 random draws (builder-206 evidence), so this is the design, not chance",
  },
];

describe("the extended classifier (probe2) cannot tell planted from generated in the task charts", () => {
  const residual = (type: string, f: string) => RESIDUALS.find((x) => x.type === type && (x.features === 'order' ? f.startsWith('O:') : x.features.includes(f)));
  const scores = scoreTells(world, isPlanted, { residual });

  const bars = (s: TypeScore) => (s.planted < SMALL ? SMALL_BARS[s.type] ?? [0, 0] : [SINGLE_BAR, PAIR_BAR]);

  it(`best single feature at most ${SINGLE_BAR} per type (the random-label 95th percentile under ${SMALL} planted), named residuals aside`, () => {
    expect(scores.filter((s) => s.single.ba > bars(s)[0]!).map((s) => `${s.type} ${s.single.ba.toFixed(3)} ${s.single.f.slice(0, 120)} (planted ${s.single.tp}/${s.planted}, generated ${s.single.fp}/${s.n - s.planted})`)).toEqual([]);
  });

  it(`best pair of features at most ${PAIR_BAR} per type (the random-label 95th percentile under ${SMALL} planted), named residuals aside`, () => {
    expect(scores.filter((s) => s.pair.ba > bars(s)[1]!).map((s) => `${s.type} ${s.pair.ba.toFixed(3)} ${s.pair.rule.slice(0, 200)} (planted ${s.pair.tp}/${s.planted}, generated ${s.pair.fp}/${s.n - s.planted})`)).toEqual([]);
  });

  it('each named residual feature stays at or under its cap, and every pair that holds one under its pair cap', () => {
    const over = scores.flatMap((s) => [
      ...s.residuals.filter((x) => x.ba > x.cap).map((x) => `${s.type} ${x.f}: ${x.ba.toFixed(3)} > ${x.cap}`),
      ...(s.residualPair.ba > s.residualPair.cap ? [`${s.type} pair ${s.residualPair.rule.slice(0, 200)}: ${s.residualPair.ba.toFixed(3)} > ${s.residualPair.cap}`] : []),
    ]);
    expect(over).toEqual([]);
  });

  it('every small type has a measured random-label bar', () => {
    expect(scores.filter((s) => s.planted < SMALL && !SMALL_BARS[s.type]).map((s) => s.type)).toEqual([]);
  });
});

// The (task chart, type) cells with no generated resource of the type (coordinator ruling on
// builder-203's question, option A: a tell needs a contrast, and adding generated notes, orders or
// allergies to these charts would change what their searches return).
const EMPTY_CELLS = [
  'pt-0002 DocumentReference', 'pt-0005 DocumentReference', 'pt-0013 DocumentReference', 'pt-0015 DocumentReference', 'pt-0026 DocumentReference',
  'pt-0027 DocumentReference', 'pt-0027 MedicationRequest', 'pt-0028 AllergyIntolerance', 'pt-0028 DocumentReference', 'pt-0029 DocumentReference',
  'pt-0029 MedicationRequest', 'pt-0030 DocumentReference', 'pt-0030 MedicationRequest', 'pt-0033 DocumentReference', 'pt-0053 DocumentReference',
];

// Key order (verifier P17i W0-1c V1): the overlays wrote each resource in their literal key order
// and Synthea in its own, and the read tools hand the agent the stored order, so a dosage that lists
// route before timing named every planted order. fixtures:build lists every key of every resource, at
// every depth, in FHIR element order (packages/env/canonical.ts), and fhir_read and fhir_search keep it.
describe('every resource lists its keys in one order, and the read tools keep it', () => {
  const order = fhirOrder(JSON.parse(readFileSync(join(repoRoot, 'fixtures/definitions-pruned.json'), 'utf8')));
  // The key sequence at every path, a read tool's attachment fields (size, read_with for data) aside.
  const sequence = (v: unknown, at = ''): string[] =>
    Array.isArray(v) ? v.flatMap((x) => sequence(x, at))
      : v !== null && typeof v === 'object' ? [`${at}=${Object.keys(v).filter((k) => !['data', 'size', 'read_with'].includes(k)).join(',')}`, ...Object.entries(v).flatMap(([k, x]) => sequence(x, at ? `${at}.${k}` : k))] : [];

  it('every key in FHIR element order at every depth', () => {
    expect(world.filter((r) => JSON.stringify(order(r)) !== JSON.stringify(r)).map((r) => `${r.resourceType}/${r.id}`).slice(0, 20)).toEqual([]);
  });

  it('fhir_read and fhir_search return each resource in its stored order', () => {
    const ctx = { world: new Store(world as unknown as Resource[]), clock, policies: [], catalog: [] } as unknown as ReadContext;
    const out: string[] = [];
    for (const p of taskCharts) {
      for (const t of comparable) {
        const rs = inChart(t, p);
        if (!rs.length) continue;
        const found = callTool(READ_TOOLS, 'fhir_search', { resource_type: t, patient: p, count: 50 }, ctx) as { content: { entries?: Array<{ id: string }> } };
        for (const e of found.content.entries ?? []) {
          const stored = rs.find((r) => r.id === e.id);
          if (stored && sequence(e).join('|') !== sequence(stored).join('|')) out.push(`fhir_search ${t}/${e.id}`);
        }
        for (const r of [rs.find((x) => isPlanted(x.id)), rs.find((x) => !isPlanted(x.id))].filter((x): x is R => x !== undefined)) {
          const read = callTool(READ_TOOLS, 'fhir_read', { resource_type: t, id: r.id }, ctx) as { content: { resource: unknown } };
          if (sequence(read.content.resource).join('|') !== sequence(r).join('|')) out.push(`fhir_read ${t}/${r.id}`);
        }
      }
    }
    expect(out.slice(0, 20)).toEqual([]);
  });
});

// The generated visit note in clinic form (verifier P17i W0-1c V2): Synthea's note listed every drug
// it had ever ordered as raw RxNorm strings (contraceptive packs in braces, a check-up's propofol
// and rocuronium), its Plan line named dental and questionnaire procedures, and it wrote 'No
// complaints.' where a clinician writes why the patient came. A planted note is a clinician's own.
describe('generated visit notes are written as the clinic writes them', () => {
  const decode = (d: string) => Buffer.from(d, 'base64').toString('utf8');
  const notes = world.filter((r) => !isPlanted(r.id) && (r.resourceType === 'DocumentReference' || r.resourceType === 'DiagnosticReport')).flatMap((r) => {
    const forms = r.resourceType === 'DocumentReference' ? (r.content as Array<{ attachment: { data?: string } }>).map((c) => c.attachment) : ((r.presentedForm as Array<{ data?: string }> | undefined) ?? []);
    return forms.filter((a) => a.data).map((a) => ({ id: `${r.resourceType}/${r.id}`, chart: patientOf(r) ?? '', text: decode(a.data!) }));
  });
  const visitNotes = notes.filter((n) => /^(Allergies|Medications|Plan):/m.test(n.text) || /\nPlan: /.test(n.text));
  const lines = (label: string) => visitNotes.flatMap((n) => n.text.split('\n').filter((l) => l.startsWith(`${label}: `)).map((l) => `${n.id}: ${l}`));

  it('lists only outpatient drugs, by name, strength and sig, never as RxNorm strings', () => {
    const raw = (l: string) => /[{}[\]]|\d mg\/ml\b|\d MG\b/.test(l) || /\b(oral (tablet|capsule|solution|suspension)|injectable|ophthalmic solution|extended release|pack)\b/i.test(l);
    const inpatient = /propofol|rocuronium|isoflurane|sevoflurane|sufentanil|fentanyl|alfentanil|remifentanil|midazolam|piperacillin|tazobactam|alteplase|heparin|sodium chloride|vecuronium|succinylcholine|desflurane|ketamine|tropicamide|proparacaine|atropine/i;
    expect(lines('Medications').filter((l) => raw(l) || inpatient.test(l)).slice(0, 20)).toEqual([]);
  });

  it('names no dental or questionnaire procedure in a Plan line', () => {
    const notMedical = /tooth|teeth|dental|oral evaluation|sealant|periodon|gingiv|fluoride|prophylaxis|denture|questionnaire|screening|assessment|\bscale\b|reconciliation|evaluation of/i;
    expect(lines('Plan').filter((l) => notMedical.test(l)).slice(0, 20)).toEqual([]);
  });

  it("says why the patient came, never 'No complaints.', and opens no more than a fifth of notes alike", () => {
    expect(visitNotes.filter((n) => /No complaints/.test(n.text)).map((n) => n.id).slice(0, 20)).toEqual([]);
    const body = (t: string) => t.trim().split('\n').slice(1).map((l) => l.trim()).find((l) => l && !/^[A-Z][A-Za-z ]{1,25}:/.test(l) && !/^[A-Z][a-z]+(?: [A-Z][a-z]+)*(?:, \d+ (?:y\/o|mo))? [MF]\.$/.test(l)) ?? '';
    const opening = new Map<string, number>();
    for (const n of visitNotes) { const w = body(n.text).toLowerCase().split(/\s+/).slice(0, 2).join(' '); opening.set(w, (opening.get(w) ?? 0) + 1); }
    expect([...opening].filter(([, c]) => c > visitNotes.length / 5).map(([w, c]) => `'${w}' opens ${c} of ${visitNotes.length}`)).toEqual([]);
  });
});

// A sig starts with the dose when the order gives one (verifier P17i W0-1c V3): planted sigs read
// '81 mg by mouth daily', Synthea's '1 tablet by mouth once daily'.
describe('generated sigs give the dose first', () => {
  it('every sig of a dose in mg starts with that dose', () => {
    const out = world.filter((r) => r.resourceType === 'MedicationRequest' && !isPlanted(r.id)).flatMap((r) =>
      ((r.dosageInstruction as Array<{ text?: string; doseAndRate?: Array<{ doseQuantity?: { value?: number; unit?: string } }> }> | undefined) ?? []).flatMap((d) => {
        const q = d.doseAndRate?.[0]?.doseQuantity;
        return q?.unit === 'mg' && !d.text?.startsWith(`${q.value} mg `) ? [`${r.id}: ${q.value} mg, sig '${d.text}'`] : [];
      }),
    );
    expect(out.slice(0, 20)).toEqual([]);
  });
});

// Hospital procedures in the day (verifier P17i W0-1c V5): five of the eight generated colonoscopies
// were stamped between 21:56 and 03:18. A scheduled hospital procedure (an endoscopy, an echo, an
// ultrasound), and the visit it was done at, falls in 07:00-17:59 local time; what an emergency or an
// inpatient stay needed is done when it was needed.
describe('generated hospital procedures are done in the day', () => {
  it('every scheduled hospital procedure and its visit start between 07:00 and 17:59', () => {
    const byKey = new Map(world.map((r) => [`${r.resourceType}/${r.id}`, r]));
    const out = world.filter((r) => r.resourceType === 'Procedure' && !isPlanted(r.id) && HOSPITAL_PROCEDURES.has((r.code as { coding?: Array<{ code?: string }> }).coding?.[0]?.code ?? '')).flatMap((r) => {
      const visit = byKey.get((r.encounter as { reference?: string } | undefined)?.reference ?? '') as { class?: { code?: string }; period?: { start?: string } } | undefined;
      const when = (r.performedDateTime as string | undefined) ?? (r.performedPeriod as { start?: string } | undefined)?.start;
      // Done in an emergency visit or an inpatient stay (or within six hours of its end).
      const stay = world.some((e) => {
        const p = e.period as { start?: string; end?: string } | undefined;
        return e.resourceType === 'Encounter' && patientOf(e) === patientOf(r) && ['EMER', 'IMP'].includes((e.class as { code?: string }).code ?? '') && p?.start !== undefined && when !== undefined && Date.parse(p.start) <= Date.parse(when) && Date.parse(when) <= Date.parse(p.end ?? p.start) + 21_600_000;
      });
      if (stay || (visit && ['EMER', 'IMP'].includes(visit.class?.code ?? ''))) return [];
      const times = [when, visit?.period?.start].filter((t): t is string => t !== undefined);
      return times.filter((t) => Number(t.slice(11, 13)) < 7 || Number(t.slice(11, 13)) >= 18).map((t) => `${r.id} ${t}`);
    });
    expect(out).toEqual([]);
  });
});
