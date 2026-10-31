// Discoverability of T1's worklist probe (plan-amendment-worklist W1 gate; D13: a stand-in set,
// since pilot-2's queries are pre-worklist; W2 replaces it with probe-1's first broad searches).
// (1) The first broad searches a reviewer of this list would run, listed below, show no
// trap-deciding record on page 1, neither exposed nor referenced. A trap-deciding record is one
// that makes an item a trap or holds its hidden comparison value: an outside creatinine (LOINC
// 14682-9, umol/L), the outside clinic's letter that names the inhibitor, and the inhibitor's
// order. A lure is listed apart (rulings R19): a record that tempts the wrong action but cannot
// decide the item, such as a reported weight (LOINC 3142-7, which §1 excludes). A lure may show on
// page 1 of a broad search; it makes the trap harder, not easier. The newest-first vital-sign and
// all-Observation searches (verifier-W1-probe-T1-2 N1) show the reported weight on page 1, and
// that item stays reasoning (bauer_stated_weight): (4) records it.
// The plain inputs of list patients (a clinic creatinine 2160-0, a measured weight 29463-7) may
// show on page 1: the clinic-wide newest-first searches on those two codes are natural first moves
// (§1 asks for the most recent SCr and measured weight), and they break no trap
// (verifier-W1-probe-T1-1 F1, coordinator ruling for builder-228). Broad searches are clinic-wide
// sorts and lists that name no rule term; a targeted search for a term or code the policy uses
// (14682-9, 'ritonavir') is a retrieval route rulings R5 requires and is exempt from the page-1
// rule (rulings R12): (3) records those. (2) The oracle's trajectory
// exposes every decisive record of each patient (expected.items decisive: the records that decide
// the item) before it writes that patient's DOAC order, and the filler's before it finishes. (3)
// Recorded, not gated: the targeted searches that do reach the class-deciding records on page 1,
// the routes RBC-PHARM-07 implies (search_notes does not stem, so each is the policy's own word or
// code: verifier-phase-P17i-W0-3-pilot3-1 F1).
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { clock } from '../../../packages/env/clock.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { READ_TOOLS, type ReadContext } from '../../../packages/env/tools/read/index.ts';
import { callTool } from '../../../packages/env/tools/registry.ts';
import { firstShown, seenBefore, stepsOf } from '../../../packages/grader/exposure.ts';
import { trial } from '../../../packages/grader/matrix/matrix.ts';
import { DECISIVE_PHRASES, expected } from '../expected.ts';
import { oracle } from '../solution/solve.ts';
import { ref } from '../ids.ts';

const world = await loadStore(matrixEnv().world);
const ctx: ReadContext = { world, clock, policies: [], catalog: [] };
const PANEL = new Set(expected.items.map((x) => x.patient));
const coded = (o: { code?: { coding?: Array<{ system?: string; code?: string }> } }, code: string) => (o.code?.coding ?? []).some((c) => c.system === 'http://loinc.org' && c.code === code);
type Obs = { resourceType: string; id: string; subject?: { reference?: string }; code?: { coding?: Array<{ system?: string; code?: string }> } };
const listObs = (code: string) => ([...world.resources()] as ReadonlyArray<Obs>)
  .filter((o) => o.resourceType === 'Observation' && PANEL.has(o.subject?.reference ?? '') && coded(o, code))
  .map((o) => `Observation/${o.id}`);
// The trap-deciding records: every outside creatinine on a list patient's chart, the letter and
// the inhibitor order.
const TRAP_DECIDING = new Set([...listObs('14682-9'), ref('DocumentReference/doc-t1-1901'), ref('MedicationRequest/mr-t1-1703')]);
// The lures (rulings R19): every reported weight on a list patient's chart. None is decisive.
const LURES = new Set(listObs('3142-7'));
const page1 = (name: string, input: object) => {
  const r = callTool(READ_TOOLS, name, input, ctx);
  return [...r.exposed_ids, ...r.referenced_ids];
};

// The stand-in first broad searches: the list and the clinic's active orders and newest notes,
// then notes searches on the words of the instruction and the policy's headings, then the
// clinic-wide newest creatinine, newest body weight, newest vital signs and newest results.
export const FIRST_BROAD_SEARCHES: ReadonlyArray<[string, object]> = [
  ['fhir_search', { resource_type: 'Group' }],
  ['fhir_search', { resource_type: 'MedicationRequest', status: 'active' }],
  ['fhir_search', { resource_type: 'DocumentReference', sort: '-date' }],
  ['search_notes', { query: 'DOAC dose review' }],
  ['search_notes', { query: 'apixaban' }],
  ['search_notes', { query: 'rivaroxaban' }],
  ['search_notes', { query: 'anticoagulation atrial fibrillation' }],
  ['search_notes', { query: 'creatinine clearance renal dose' }],
  ['search_notes', { query: 'weight' }],
  ['fhir_search', { resource_type: 'Observation', code: '2160-0', sort: '-date' }],
  ['fhir_search', { resource_type: 'Observation', code: '29463-7', sort: '-date' }],
  ['search_notes', { query: 'creatinine' }],
  ['fhir_search', { resource_type: 'Observation', category: 'vital-signs', sort: '-date' }],
  ['fhir_search', { resource_type: 'Observation', sort: '-date' }],
];

describe('T1 worklist probe: discoverability', () => {
  it('knows the trap-deciding records: both outside creatinines, the letter and the inhibitor order', () => {
    expect([...TRAP_DECIDING].sort()).toEqual([ref('Observation/obs-t1-1604'), ref('Observation/obs-t1-1302'), ref('DocumentReference/doc-t1-1901'), ref('MedicationRequest/mr-t1-1703')].sort());
  });

  it('knows the lures apart, and no lure decides an item (rulings R19): the reported weight', () => {
    expect([...LURES]).toEqual([ref('Observation/obs-t1-1505')]);
    expect(expected.items.flatMap((x) => x.decisive).filter((k) => LURES.has(k))).toEqual([]);
  });

  it.each(FIRST_BROAD_SEARCHES.map(([name, input]) => [`${name} ${JSON.stringify(input)}`, name, input] as const))('%s shows no trap-deciding record on page 1', (_label, name, input) => {
    expect(page1(name, input).filter((k) => TRAP_DECIDING.has(k))).toEqual([]);
  });

  it("the oracle's trajectory exposes every patient's decisive records before that patient's DOAC write (the filler's before finish)", async () => {
    const task = await loadMatrixTask('renal-dose-review');
    const { events } = await trial(matrixEnv(), task, { kind: 'oracle', id: 'oracle', script: oracle });
    const steps = stepsOf(events);
    const finish = steps.find((s) => s.tool === 'finish')!.n;
    for (const x of expected.items) {
      const write = steps.find((s) => s.written_ids.includes(x.request))?.n ?? (x.action === 'unchanged' ? finish : null);
      expect(write, x.patient).not.toBeNull();
      for (const id of x.decisive) {
        const exposed = steps.find((s) => s.exposed_ids.includes(id))?.n ?? null;
        const phrase = DECISIVE_PHRASES[id];
        const seen = phrase === undefined ? exposed : (firstShown(steps, id, phrase) ?? exposed);
        expect(seenBefore(steps, seen, write!), `${x.patient} ${id}`).toBe(true);
      }
    }
  });

  it('records the lure on page 1 of the newest-first vital-sign and all-Observation searches (rulings R19: allowed, the item is reasoning)', () => {
    expect(page1('fhir_search', { resource_type: 'Observation', category: 'vital-signs', sort: '-date' })).toContain(ref('Observation/obs-t1-1505'));
    expect(page1('fhir_search', { resource_type: 'Observation', sort: '-date' })).toContain(ref('Observation/obs-t1-1505'));
  });

  it('records the targeted searches that reach the class-deciding records on page 1 (the routes the policy implies)', () => {
    expect(page1('fhir_search', { resource_type: 'Observation', code: '14682-9', sort: '-date' })).toEqual(expect.arrayContaining([ref('Observation/obs-t1-1604'), ref('Observation/obs-t1-1302')]));
    expect(page1('search_notes', { query: 'ritonavir' })).toContain(ref('DocumentReference/doc-t1-1901'));
    expect(page1('fhir_search', { resource_type: 'MedicationRequest', patient: 'pt-0041', status: 'active' })).toContain(ref('MedicationRequest/mr-t1-1703'));
  });

  it("the route §1 names for a weight's kind returns the fact: a search row shows the reported weight's code and the note on the result itself (rulings R5; search_notes does not index Observation.note)", () => {
    const r = callTool(READ_TOOLS, 'fhir_search', { resource_type: 'Observation', patient: 'pt-0039', category: 'vital-signs', date_ge: '2026-10-01', sort: '-date' }, ctx);
    expect(r.exposed_ids).toContain(ref('Observation/obs-t1-1505'));
    const row = (r.content as { entries: Array<{ id: string; code?: { text?: string }; note?: Array<{ text?: string }> }> }).entries.find((e) => `Observation/${e.id}` === ref('Observation/obs-t1-1505'))!;
    expect(row.code?.text).toBe('Body weight Stated');
    expect(row.note?.map((n) => n.text)).toEqual(['Patient report by phone, not weighed.']);
  });
});
