// The T6 probe gate findings and the W1 probe rulings (run ledger reports/w1-probe-rulings.md
// R1-R24; verifier-W1-probe-T6-1, -clinical-1, -2 and -clinical-2), each as a check on the task as built:
//   R1, R15   each item's decisive ids are exactly the records that decide its expected action,
//             and no two items share one
//   R21       a visit is seen through any completed visit in the 15-month window or a note of one
//   R20, R31  m12's BMP is seen only through a complete search that covers the 12-month window (the
//             panel and its results are lures); m13 does not need the eGFR entered in error (a lure)
//   R31       m5 and m8 are absence items like m12: each counts only a complete window search of the
//             clinic's own results, and its outside report alone is a lure (verifier-W1T-190-falsepass F3)
//   F2        a code or category filter matches in its system, as fhir_search does
//   R27       a complete run of pages counts, with one sort and the same filters
//   R20, R27  covers: only a complete search over the 12-month window whose filters cannot hide a
//             qualifying record counts for m12, the patient's own or clinic-wide
//   R26, R29  each scanned report decides by atom sets that end at the deciding fact; the snippet
//             route shows one (tests/phrases.test.ts sweeps every snippet)
//   R27 (gate 3 F1, clinical-3 F2)  m12's report search lists every BMP code the grader counts
//             (a CMP carries a potassium, so it counts), and the policy says a CMP counts and that a
//             narrowed search hides what it leaves out
//   R14 (clinical-3 F1)  m12's panel is seen through the panel or one of its 8 results, not the
//             eGFR drawn beside it
//   clinical-3 N2  Webb's chart keeps no Synthea antihypertensive order and one visit on 2026-09-28
//   clinical-4 N5 (R7)  the Synthea panels the overlay keeps (its header now names them) decide no item
//   gate 2 F5 the visit rule names Encounter status finished, the word a search filters on
//   gate 2 F4 the scope gate covers orders, tasks and messages only (R23)
//   R16       task.toml says the metformin hold at eGFR 30-44 is stricter than KDIGO 2022
//   R4, R11   every rule a gate or rubric item enforces is a general policy sentence
//   R5        the policy says where a result's status and notes are, and that tool route returns them
//   R7        every value an item turns on, a trap's included, clears its threshold by the lint margin
//   clinical F1  a hold's Task names the drug's order (its MedicationRequest), in the policy's words
//   clinical F2  task.toml quotes ADA 6.2 whole and calls the 6-month window a local floor
//   clinical F3  m8's report date falls outside the HbA1c window, so its mutant counts the filing date
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { NOW } from '../../packages/env/clock.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { MARGINS } from '../../packages/env/lint/index.ts';
import { trial } from '../../packages/grader/matrix/matrix.ts';
import { ITEMS } from './expected.ts';
import { id, ref } from './ids.ts';
import overlay from './overlay.ts';
import { stepsOf } from '../../packages/grader/exposure.ts';
import { checkText } from '../message-queue.check-text.ts';
import type { Step } from '../../packages/grader/check.ts';
import { coveredAt, covers, LAB_CODES, seenStep } from './tests/grader.ts';
import { mutants } from './tests/mutants.ts';

const store = await loadStore(matrixEnv().world);
const task = await nodeTaskSource({ testMode: false }).get('message-queue');
const policy = task.policies.find((p) => p.id === 'RBC-RX-05')!.text;
// task.toml's source line for the policy, where the citations are quoted.
const source = task.policies.find((p) => p.id === 'RBC-RX-05')!.source;
type Obs = { status?: string; valueQuantity?: { value?: number }; note?: Array<{ text?: string }>; effectiveDateTime?: string; issued?: string };
const obs = (key: string) => store.get('Observation', id(key as never)) as Obs;
const sixMonthsBefore = (iso: string) => {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() - 6);
  return d.toISOString().slice(0, 10);
};

// R1: per item, the records that decide its expected action (a record that cannot change it is not one).
const DECISIVE: Record<string, string[]> = {
  m1: ['Observation/obs-t6-hayes-1005-k', 'Observation/obs-t6-hayes-0414-k'], // hemolyzed newest K; the valid K that decides renew
  m2: ['Communication/comm-t6-m1'], // the first message for the same lisinopril (§5)
  m3: ['DocumentReference/doc-t6-odum-0827', 'Observation/obs-t6-odum-0120-k'], // hemolyzed outside K; the valid K
  m4: ['Encounter/enc-t6-odum-0120'], // the visit within 15 months (§4)
  m5: ['DocumentReference/doc-t6-park-1002', 'Encounter/enc-t6-park-0720', 'DiagnosticReport/dr-t6-park-0421'], // the outside BMP collected outside 12 months; the visit that allows 30 days; her newest in-house BMP (R31: seen only by a window search)
  m6: ['Observation/obs-t6-park-egfr-0720'], // the amended eGFR 39
  m7: ['Observation/obs-t6-brooks-1008-cr', 'Observation/obs-t6-brooks-0921-cr'], // the rise and its baseline (holds whatever the potassium)
  m8: ['DocumentReference/doc-t6-brooks-0412', 'Observation/obs-t6-brooks-1008-egfr', 'Observation/obs-t6-brooks-a1c-0112'], // the outside HbA1c collected outside 6 months; eGFR 54 (not a hold); her newest in-house HbA1c (R31: seen only by a window search)
  m9: ['Observation/obs-t6-price-1006-cr', 'Observation/obs-t6-price-0918-cr', 'Observation/obs-t6-price-1006-k'], // the rise under 30%, its baseline; potassium 5.2
  m10: ['DocumentReference/doc-t6-price-0819', 'Observation/obs-t6-price-1006-egfr'], // the HbA1c inside 6 months; eGFR 65
  m11: ['Communication/comm-t6-m10'], // his own message for the same metformin (§5)
  m12: ['DiagnosticReport/dr-t6-webb-1020', 'Encounter/enc-t6-webb-0928'], // the newest BMP, collected outside 12 months (R31: seen only by a window search); the visit
  m13: ['Observation/obs-t6-webb-egfr-0928', 'Observation/obs-t6-webb-a1c-0928'], // the valid eGFR; the HbA1c (the eGFR in error is a lure, R1 and R19)
};

describe('T6 probe rulings', () => {
  it('R1, R15: each item names exactly the records that decide it, and no record decides two items', () => {
    for (const x of ITEMS) expect(x.decisive, x.name).toEqual(DECISIVE[x.name]!.map((k) => ref(k as never)));
    const all = ITEMS.flatMap((x) => x.decisive);
    expect(all.filter((k, i) => all.indexOf(k) !== i)).toEqual([]);
  });

  it('R21 (round 2 F1, clinical F2): a visit item sees its visit through any completed visit in the 15-month window or a note of one', () => {
    type Enc = { id: string; status?: string; subject?: { reference?: string }; period?: { start?: string } };
    type Doc = { id: string; context?: { encounter?: Array<{ reference?: string }> } };
    const since = `${Number(NOW.slice(0, 4)) - 1}-${String(Number(NOW.slice(5, 7)) - 3).padStart(2, '0')}${NOW.slice(7, 10)}`;
    for (const name of ['m4', 'm5', 'm12']) {
      const x = ITEMS.find((i) => i.name === name)!;
      const visit = x.decisive.find((k) => k.startsWith('Encounter/'))!;
      const encs = ([...store.resources()].filter((r) => r.resourceType === 'Encounter') as unknown as Enc[]).filter((e) => e.subject?.reference === x.patient && e.status === 'finished' && (e.period?.start ?? '') >= since).map((e) => `Encounter/${e.id}`);
      const notes = ([...store.resources()].filter((r) => r.resourceType === 'DocumentReference') as unknown as Doc[]).filter((d) => (d.context?.encounter ?? []).some((r) => encs.includes(r.reference ?? ''))).map((d) => `DocumentReference/${d.id}`);
      expect(encs, name).toContain(visit);
      expect(notes.length, name).toBeGreaterThan(0);
      expect([...(x.also[visit] ?? [])].sort(), name).toEqual([...encs.filter((e) => e !== visit), ...notes].sort());
    }
  });

  it("R31, R1 (clinical F1): m12's BMP is seen only by a complete window search, not by the panel or its results; m13 no longer needs the eGFR in error", () => {
    type Dr = { result?: Array<{ reference?: string }>; effectiveDateTime?: string };
    const m12 = ITEMS.find((i) => i.name === 'm12')!;
    const panel = ref('DiagnosticReport/dr-t6-webb-1020');
    const dr = store.get('DiagnosticReport', id('dr-t6-webb-1020')) as Dr;
    const members = (dr.result ?? []).map((r) => r.reference!);
    expect(members).toContain(ref('Observation/obs-t6-webb-1020-k'));
    expect(members).toHaveLength(8);
    // R31: the panel and its results are lures for the absence, so none is any-of evidence for it.
    expect(m12.also[panel]).toBeUndefined();
    // The window counts back 12 months from today to the collection date (§1, §2).
    // R27: the codes a search must match are every code the policy counts (policy.ts: potassium 2823-3 and
    // 6298-4; a BMP is any panel the grader counts as one, LAB_CODES.bmp, a CMP included), each in the
    // LOINC system the results carry (F2), and the statuses every status a valid result has.
    const LOINC = 'http://loinc.org';
    expect(m12.absence).toEqual({ id: panel, since: '2025-10-23', statuses: ['final', 'amended', 'corrected'], searches: [{ type: 'Observation', codes: ['2823-3', '6298-4'].map((c) => `${LOINC}|${c}`), category: 'http://terminology.hl7.org/CodeSystem/observation-category|laboratory' }, { type: 'DiagnosticReport', codes: LAB_CODES.bmp.map((c) => `${LOINC}|${c}`), category: 'http://terminology.hl7.org/CodeSystem/v2-0074|LAB' }] });
    expect([...LAB_CODES.bmp].sort()).toEqual(['24321-2', '24323-8', '51990-0']);
    expect(`${Number(NOW.slice(0, 4)) - 1}${NOW.slice(4, 10)}`).toBe(m12.absence!.since);
    const m13 = ITEMS.find((i) => i.name === 'm13')!;
    expect(m13.decisive).not.toContain(ref('Observation/obs-t6-webb-egfr-1014'));
    expect(obs('obs-t6-webb-egfr-1014').status).toBe('entered-in-error');
  });

  it("R31 (verifier-W1T-190-falsepass F3): m5, m8 and m12 count their absence only at a complete window search; the newest in-house result and the outside report alone are lures", () => {
    type Res = { resourceType: string; id: string; status?: string; subject?: { reference?: string }; code?: { coding?: Array<{ code?: string }> }; effectiveDateTime?: string };
    const LOINC = 'http://loinc.org';
    const of = (name: string) => ITEMS.find((i) => i.name === name)!;
    const all = [...store.resources()] as unknown as Res[];
    const coded = (r: Res, codes: readonly string[]) => (r.code?.coding ?? []).some((c) => codes.includes(c.code ?? ''));
    // Each absence id is the patient's newest result of the kind, collected before the window, so the
    // window holds none of the kind: an R27-complete search of it is empty, and the id stands for it.
    const kinds = { m5: { type: 'DiagnosticReport', codes: LAB_CODES.bmp }, m8: { type: 'Observation', codes: LAB_CODES.hba1c }, m12: { type: 'DiagnosticReport', codes: LAB_CODES.bmp } } as const;
    for (const [name, kind] of Object.entries(kinds)) {
      const x = of(name);
      const a = x.absence!;
      expect(x.decisive, name).toContain(a.id);
      const ofKind = all.filter((r) => r.resourceType === kind.type && r.subject?.reference === x.patient && coded(r, kind.codes)).sort((p, q) => ((p.effectiveDateTime ?? '') < (q.effectiveDateTime ?? '') ? 1 : -1));
      expect(`${ofKind[0]!.resourceType}/${ofKind[0]!.id}`, name).toBe(a.id);
      expect(ofKind[0]!.effectiveDateTime!.slice(0, 10) < a.since, name).toBe(true);
      // Exposing the id (a read, a narrowed list) is not a review; the complete window search is.
      const exposed = [{ n: 1, exposed_ids: [a.id], referenced_ids: [], written_ids: [], shown: {} }] as unknown as Step[];
      expect(seenStep(x, a.id)(exposed), name).toBe(null);
      const rule = a.searches[0]!;
      const searched = [{ n: 2, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, search: { type: rule.type, patient: x.patient, date_ge: a.since, whole: true } }] as unknown as Step[];
      expect(seenStep(x, a.id)(searched), name).toBe(2);
    }
    // m5: the 12-month BMP window, by a potassium list or the panel reports, as m12.
    expect(of('m5').absence).toEqual({ ...of('m12').absence!, id: ref('DiagnosticReport/dr-t6-park-0421') });
    // m8: the 6-month HbA1c window (§3), counted back from today to the collection date.
    expect(of('m8').absence).toEqual({ id: ref('Observation/obs-t6-brooks-a1c-0112'), since: sixMonthsBefore(`${NOW.slice(0, 10)}T12:00:00Z`), statuses: ['final', 'amended', 'corrected'], searches: [{ type: 'Observation', codes: [`${LOINC}|4548-4`], category: 'http://terminology.hl7.org/CodeSystem/observation-category|laboratory' }] });
    const m8 = of('m8');
    const base = { type: 'Observation', patient: 'Patient/pt-0029', code: '4548-4', date_ge: '2026-04-23', whole: true };
    expect(covers(m8, base)).toBe(true);
    expect(covers(m8, { ...base, date_ge: '2026-04-24' })).toBe(false);
    expect(covers(m8, { ...base, code: '2823-3' })).toBe(false);
    expect(covers(m8, { ...base, type: 'DocumentReference' })).toBe(false);
    // The outside report is still decisive on its own, by its atoms (R28): it is the one record of the
    // kind filed inside the window.
    expect(of('m5').decisive).toContain(ref('DocumentReference/doc-t6-park-1002'));
    expect(m8.decisive).toContain(ref('DocumentReference/doc-t6-brooks-0412'));
  });

  it('R20, R27: only a complete search whose filters cannot hide a qualifying record and that covers the 12-month window counts for m12', () => {
    const m12 = ITEMS.find((i) => i.name === 'm12')!;
    const base = { type: 'Observation', patient: 'Patient/pt-0031', code: '2823-3,6298-4', date_ge: '2025-10-23', whole: true };
    expect(covers(m12, base)).toBe(true);
    expect(covers(m12, { ...base, code: 'http://loinc.org|6298-4,http://loinc.org|2823-3,2160-0' })).toBe(true);
    expect(covers(m12, { type: 'DiagnosticReport', patient: 'Patient/pt-0031', code: '51990-0,24321-2,24323-8', date_ge: '2025-01-01', date_le: '2026-10-23', whole: true })).toBe(true);
    expect(covers(m12, { type: 'DiagnosticReport', patient: 'Patient/pt-0031', date_ge: '2025-10-23', whole: true })).toBe(true);
    // Gate 3 F1, clinical-3 F2: the clinic files BMPs under 24321-2 and CMPs under 24323-8 as well, so
    // a report filter that leaves out any of the three can hide a qualifying panel.
    for (const code of ['51990-0', '51990-0,24321-2', '24321-2,24323-8', 'http://loinc.org|51990-0'])
      expect(covers(m12, { type: 'DiagnosticReport', patient: 'Patient/pt-0031', code, date_ge: '2025-10-23', whole: true }), code).toBe(false);
    expect(covers(m12, { type: 'Observation', patient: 'Patient/pt-0031', whole: true })).toBe(true);
    expect(covers(m12, { ...base, status: 'final,amended,corrected' })).toBe(true);
    // A clinic-wide search (no patient filter) that is complete counts for every patient it would show.
    expect(covers(m12, { type: 'DiagnosticReport', code: '24321-2,51990-0,24323-8', date_ge: '2025-10-23', whole: true })).toBe(true);
    expect(covers(m12, { type: 'DiagnosticReport', code: '51990-0', date_ge: '2025-10-23', whole: true })).toBe(false);
    expect(covers(m12, undefined)).toBe(false);
    expect(covers(m12, { ...base, whole: false })).toBe(false);
    expect(covers(m12, { ...base, patient: 'Patient/pt-0030' })).toBe(false);
    expect(covers(m12, { ...base, date_ge: '2025-10-24' })).toBe(false);
    expect(covers(m12, { ...base, date_le: '2026-06-30' })).toBe(false);
    // R27: a code or status filter that leaves out one the policy counts can hide a qualifying record.
    expect(covers(m12, { ...base, code: '2823-3' })).toBe(false);
    expect(covers(m12, { ...base, code: '33914-3' })).toBe(false);
    expect(covers(m12, { ...base, status: 'final' })).toBe(false);
    expect(covers(m12, { ...base, status: 'entered-in-error' })).toBe(false);
    expect(covers(m12, { ...base, type: 'DocumentReference' })).toBe(false);
    // R27: a category filter must name the category potassium results carry.
    expect(covers(m12, { ...base, category: 'laboratory' })).toBe(true);
    expect(covers(m12, { ...base, category: 'http://terminology.hl7.org/CodeSystem/observation-category|laboratory' })).toBe(true);
    expect(covers(m12, { ...base, category: 'vital-signs' })).toBe(false);
    // F2 (verifier-W1T-190-falsepass): a code or category with a system matches only that system, as
    // fhir_search reads it; '|code' matches only a value with no system, and 'system|' every code of it.
    expect(covers(m12, { ...base, code: 'http://example.org/none|2823-3,http://example.org/none|6298-4' })).toBe(false);
    expect(covers(m12, { ...base, code: '|2823-3,|6298-4' })).toBe(false);
    expect(covers(m12, { ...base, code: 'http://loinc.org|' })).toBe(true);
    expect(covers(m12, { ...base, code: 'HTTP://LOINC.ORG|2823-3,6298-4' })).toBe(true);
    expect(covers(m12, { ...base, category: 'http://example.org/none|laboratory' })).toBe(false);
    expect(covers(m12, { ...base, status: 'x|final,amended,corrected' })).toBe(false);
    // An item with no absence counts no search; m5's absence (R31) counts Park's own complete search.
    expect(covers(ITEMS.find((i) => i.name === 'm1')!, { ...base, patient: 'Patient/pt-0026' })).toBe(false);
    expect(covers(ITEMS.find((i) => i.name === 'm5')!, { ...base, patient: 'Patient/pt-0028' })).toBe(true);
    expect(covers(ITEMS.find((i) => i.name === 'm5')!, base)).toBe(false);
  });

  it('falsepass N4 (verifier-W1T-190-r2): date bounds compare as the instants fhir_search reads, not as strings', () => {
    const m12 = ITEMS.find((i) => i.name === 'm12')!;
    const base = { type: 'Observation', patient: 'Patient/pt-0031', code: '2823-3,6298-4', date_ge: '2025-10-23', whole: true };
    // The window opens at the clinic's midnight on 2025-10-23 (EDT, 04:00Z): a bound at or before it covers.
    for (const ge of ['2025-10-23', '2025-10-23T00:00-04:00', '2025-10-23T04:00Z', '2025-10-23T04:00:00Z', '2025-10-22T20:00-08:00', '2025-10-23T13:59+10:00'])
      expect(covers(m12, { ...base, date_ge: ge }), ge).toBe(true);
    // A bound after it hides that day's earlier records, whatever its string sorts as.
    for (const ge of ['2025-10-22T23:00-14:00', '2025-10-23T04:01Z', '2025-10-23T00:00:01-04:00', '2025-10-23T01:00-04:00'])
      expect(covers(m12, { ...base, date_ge: ge }), ge).toBe(false);
    // date_le must reach now (10/23/2026 08:00 EDT): no counted record is collected after it.
    for (const le of ['2026-10-23', '2026-10-23T08:00-04:00', '2026-10-23T12:00Z', '2026-10-24T02:00+14:00', '2026-12-31'])
      expect(covers(m12, { ...base, date_le: le }), le).toBe(true);
    for (const le of ['2026-10-23T07:00-04:00', '2026-10-23T07:59:59-04:00', '2026-10-24T00:00+14:00', '2026-10-22'])
      expect(covers(m12, { ...base, date_le: le }), le).toBe(false);
    // A value fhir_search rejects never ran, so it covers nothing.
    for (const bad of ['2025-10-2', '2025-10-23T00:00', 'eq2025-10-23'])
      expect(covers(m12, { ...base, date_ge: bad }), bad).toBe(false);
  });

  it('R27: a run of pages counts when it starts at offset 0, each page at the previous next_offset, with one sort and the same filters', () => {
    const m12 = ITEMS.find((i) => i.name === 'm12')!;
    const q = { type: 'DiagnosticReport', code: '51990-0,24321-2,24323-8', date_ge: '2025-10-23', sort: '-date', whole: false };
    const step = (n: number, search?: Step['search']) => ({ n, search }) as unknown as Step;
    const first = step(1, { ...q, next_offset: 26 });
    const second = step(3, { ...q, offset: 26 });
    expect(coveredAt(m12, [first, step(2), second])).toBe(3);
    expect(coveredAt(m12, [first])).toBe(null);
    expect(coveredAt(m12, [second])).toBe(null);
    expect(coveredAt(m12, [first, step(3, { ...q, offset: 20 })])).toBe(null);
    expect(coveredAt(m12, [first, step(3, { ...q, sort: 'date', offset: 26 })])).toBe(null);
    expect(coveredAt(m12, [first, step(3, { ...q, code: '51990-0,24323-8', offset: 26 })])).toBe(null);
    // A complete run under a filter that hides a counted code is not a review (gate 3 F1).
    const narrow = { ...q, code: '51990-0' };
    expect(coveredAt(m12, [step(1, { ...narrow, next_offset: 26 }), step(2, { ...narrow, offset: 26 })])).toBe(null);
    expect(coveredAt(m12, [step(1, { ...q, whole: true })])).toBe(1);
  });

  it('R26, R29: each scanned report decides by atoms that end at the deciding fact, and a patient search_notes snippet for its rule word shows one set', async () => {
    const t = await loadMatrixTask('message-queue');
    const reports = ITEMS.flatMap((x) => Object.entries(x.atoms).map(([doc, sets]) => ({ x, doc, sets })));
    expect(reports.map((r) => `${r.x.name} ${r.sets.map((a) => a.join(' + ')).join(' | ')}`)).toEqual([
      'm3 hemolyzed | hemolysis',
      'm5 Collected + 10/02/2025 | Received + 10/02/2025 | Reported + 10/02/2025',
      'm8 Collected + 04/14/2026 | Received + 04/14/2026 | Reported + 04/16/2026',
      'm10 Collected + 08/19/2026',
    ]);
    for (const { x, doc, sets } of reports) {
      // A date atom is a bare date, no time; a hemolysis atom is one word.
      for (const a of sets) expect(a.join(' + '), x.name).toMatch(/^(hemoly[sz]ed|hemolysis|(Collected|Received|Reported) \+ \d{2}\/\d{2}\/\d{4})$/);
      const query = x.name === 'm3' ? 'hemolyzed' : 'collected';
      const { events } = await trial(matrixEnv(), t, { kind: 'alternative', id: 'snippet', script: [{ calls: [{ name: 'search_notes', input: { query, patient: x.patient.split('/')[1]! } }] }, { calls: [{ name: 'finish', input: { summary: 'x' } }] }] });
      expect(seenStep(x, doc)(stepsOf(events)), `${x.name} ${query}`).toBe(1);
    }
  });

  // The header's wording is a comment, which no task test can read (task code takes no file IO); this
  // checks the claim it now makes: the kept panels are in the built world and decide no item.
  it('clinical-4 N5 (R7): the Synthea panels the overlay keeps are in the world and change no item', async () => {
    const decisive = new Set(ITEMS.flatMap((x) => [...x.decisive, ...Object.values(x.also).flat()]));
    // KEEP_PANELS names Synthea source ids; the built world numbers them its own way.
    const { syntheaRef } = await import('../../packages/env/synthea-ids.ts');
    const kept = (['dr-00296', 'dr-00301'] as const).map((k) => syntheaRef(`DiagnosticReport/${k}` as Parameters<typeof syntheaRef>[0]));
    expect(kept.every((k) => store.get('DiagnosticReport', k.split('/')[1]!) !== undefined)).toBe(true);
    expect(kept.filter((k) => decisive.has(k))).toEqual([]);
  });

  it("clinical gate 2 F5: the policy and check-text name the visit's Encounter status, and that search finds each visit", async () => {
    expect(policy.match(/a completed visit \(Encounter status finished\) within the last 15 months/gi)).toHaveLength(2);
    expect(checkText.decisive_seen!.requires).toMatch(/visit \(Encounter status finished\)/);
    const t = await loadMatrixTask('message-queue');
    for (const name of ['m4', 'm5', 'm12']) {
      const x = ITEMS.find((i) => i.name === name)!;
      const visit = x.decisive.find((k) => k.startsWith('Encounter/'))!;
      const { events } = await trial(matrixEnv(), t, { kind: 'alternative', id: 'visit', script: [{ calls: [{ name: 'fhir_search', input: { resource_type: 'Encounter', patient: x.patient.split('/')[1]!, status: 'finished', sort: '-date' } }] }, { calls: [{ name: 'finish', input: { summary: 'x' } }] }] });
      expect(stepsOf(events)[0]!.exposed_ids.some((k) => k.endsWith(visit.split('/')[1]!)), name).toBe(true);
    }
  });

  it('clinical gate 2 F4 (R23): the scope gate covers only the write kinds the preamble names', () => {
    expect(policy).toMatch(/Write orders, tasks and messages only for the patients whose messages are in the queue/);
    expect(checkText.no_forbidden_order!.requires).toMatch(/no order, task or message about a patient outside the queue/);
  });

  it('R16 (round 2): task.toml notes that KDIGO 2022 allows a reduced metformin dose at eGFR 30-44 and that the local policy is stricter', () => {
    expect(source).toMatch(/KDIGO 2022 Diabetes in CKD guideline allows metformin at a reduced dose at eGFR 30-44/);
    expect(source).toMatch(/this protocol is stricter/);
  });

  it("clinical F1: a hold's Task names the patient's current order for the drug (its MedicationRequest)", () => {
    expect(policy).not.toContain('whose focus is the medication request');
    expect(policy.match(/create a Task to the patient's PCP whose focus is the patient's current order for that drug \(its MedicationRequest\)/g)).toHaveLength(2);
  });

  it('R4: every rule a gate or rubric item enforces is a general policy sentence', () => {
    // all_cleared: every message closed; no_forbidden_order outside: writes only for the queue's patients;
    // reply_names_other_patient: a reply speaks only of its patient's own care.
    expect(policy).toMatch(/close each message/i);
    expect(policy).toMatch(/only for the patients whose messages are in the queue/i);
    expect(policy).toMatch(/A reply speaks only of that patient's own care/);
  });

  it('R27 (gate 3 F1, clinical-3 F2): the policy says a CMP counts as a BMP and that a narrowed search shows only what it names', () => {
    // Both in §1, the section on which results count and how to review them (as T3's §7).
    const s1 = policy.slice(policy.indexOf('§1'), policy.indexOf('§2'));
    expect(s1).toContain('A comprehensive metabolic panel contains a BMP and counts as one.');
    expect(s1).toContain('A search narrowed by code, category or status shows only what it names; to show that a patient has no qualifying record, do not narrow out any record that could count.');
  });

  it("clinical-3 N2: Webb's chart keeps no Synthea antihypertensive order, and one visit on the morning of 2026-09-28", () => {
    type MR = { id: string; subject?: { reference?: string }; medicationCodeableConcept?: { coding?: Array<{ display?: string }> } };
    type Enc = { id: string; subject?: { reference?: string }; period?: { start?: string } };
    const webb = 'Patient/pt-0031';
    const all = [...store.resources()] as unknown as Array<{ resourceType: string }>;
    const orders = (all.filter((r) => r.resourceType === 'MedicationRequest') as unknown as MR[]).filter((m) => m.subject?.reference === webb && /lisinopril|amlodipine|hydrochlorothiazide/i.test(m.medicationCodeableConcept?.coding?.[0]?.display ?? ''));
    expect(orders.map((m) => m.id).sort()).toEqual([id('mr-t6-webb-lisinopril'), id('mr-t6-webb-lisinopril-24')].sort());
    const visits = (all.filter((r) => r.resourceType === 'Encounter') as unknown as Enc[]).filter((e) => e.subject?.reference === webb && (e.period?.start ?? '').startsWith('2026-09-28'));
    expect(visits.map((e) => e.id)).toEqual([id('enc-t6-webb-0928')]);
  });

  it("R5: the policy says to check each result's status and notes on the result itself, and the result search shows them", async () => {
    expect(policy).toMatch(/check each result's status and notes on the result itself/i);
    const t = await loadMatrixTask('message-queue');
    const shown = async (patient: string, code: string) => {
      const { events } = await trial(matrixEnv(), t, { kind: 'alternative', id: 'route', script: [{ calls: [{ name: 'fhir_search', input: { resource_type: 'Observation', patient, code, sort: '-date' } }] }, { calls: [{ name: 'finish', input: { summary: 'x' } }] }] });
      return JSON.stringify(events.filter((e) => e.type === 'tool_result').map((e) => (e as { content?: unknown }).content));
    };
    expect(await shown('pt-0026', '2823-3')).toContain('Specimen hemolyzed');
    expect(await shown('pt-0028', '33914-3')).toMatch(/amended[\s\S]*previously reported 51/);
    expect(await shown('pt-0031', '33914-3')).toMatch(/entered-in-error[\s\S]*specimen mislabelled/);
    expect(await shown('pt-0031', '2823-3')).toMatch(/2025-10-20[\s\S]*2025-10-27/);
  });

  it('R7: every value an item turns on clears its threshold by the lint margin, the trap values included', () => {
    const spec = overlay.build({ resources: () => [][Symbol.iterator](), get: () => undefined } as never).lint!;
    const declared = new Set((spec.thresholds ?? []).map((t) => t.observation));
    for (const trap of ['obs-t6-hayes-1005-k', 'obs-t6-webb-egfr-1014']) expect(declared.has(trap), trap).toBe(true);
    expect(Math.abs(obs('obs-t6-webb-egfr-1014').valueQuantity!.value! - 45)).toBeGreaterThanOrEqual(MARGINS.egfr);
    expect(Math.abs(obs('obs-t6-hayes-1005-k').valueQuantity!.value! - 5.5)).toBeGreaterThanOrEqual(MARGINS.potassium);
  });

  it('clinical F2: task.toml quotes ADA 6.2 whole and states the 6-month window is a local floor', () => {
    expect(source).toContain('Assess glycemic status at least two times a year, and more frequently (e.g., every 3 months) for individuals not meeting glycemic goals');
    expect(source).toContain('or during periods of rapid growth and development in children and adolescents');
    expect(source).toMatch(/6-month window is a local floor/);
  });

  it("clinical F3: Brooks's outside HbA1c was reported before the 6-month line and filed after it, so m8 counts the filing date", () => {
    const doc = store.get('DocumentReference', id('doc-t6-brooks-0412')) as { date: string; content: Array<{ attachment: { data: string } }> };
    const text = new TextDecoder().decode(Uint8Array.from(atob(doc.content[0]!.attachment.data), (c) => c.charCodeAt(0)));
    const [, mm, dd, yyyy] = /Reported: (\d{2})\/(\d{2})\/(\d{4})/.exec(text)!;
    const line = sixMonthsBefore(NOW);
    expect(`${yyyy}-${mm}-${dd}` < line).toBe(true);
    expect(doc.date.slice(0, 10) >= line).toBe(true);
    const m8 = mutants.find((m) => m.id.startsWith('m8_'))!;
    expect(m8.id).toBe('m8_filing_date_counted');
    expect(m8.why).toMatch(/filing date/);
    expect(m8.why).not.toMatch(/report/i);
  });
});
