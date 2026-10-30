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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPlanted } from '../../tasks/planted.ts';
import { gunzip } from '../fixtures-lib.ts';
import { repoRoot } from './helpers.ts';

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

// The (task chart, type) cells with no generated resource of the type (coordinator ruling on
// builder-203's question, option A: a tell needs a contrast, and adding generated notes, orders or
// allergies to these charts would change what their searches return).
const EMPTY_CELLS = [
  'pt-0002 DocumentReference', 'pt-0005 DocumentReference', 'pt-0013 DocumentReference', 'pt-0015 DocumentReference', 'pt-0026 DocumentReference',
  'pt-0027 DocumentReference', 'pt-0027 MedicationRequest', 'pt-0028 AllergyIntolerance', 'pt-0028 DocumentReference', 'pt-0029 DocumentReference',
  'pt-0029 MedicationRequest', 'pt-0030 DocumentReference', 'pt-0030 MedicationRequest', 'pt-0033 DocumentReference', 'pt-0053 DocumentReference',
];
