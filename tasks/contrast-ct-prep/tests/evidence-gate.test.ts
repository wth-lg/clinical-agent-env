// evidence_before_orders after the P17 exploit runs (decisions.tsv 2026-10-28T13:00Z): the first
// order of any kind needs the allergy, the 2019 report, the last creatinine and the appointment
// seen before it; the report counts when read whole or when a snippet shows the severity. From
// P19 the 10/17 ED summary of the AKI must be seen before the metformin decision (a hold, stop,
// change or new metformin order), not before every order (ruling 2026-10-30T01:12Z T5 D1): read
// whole, or a snippet that shows the AKI ('acute kidney injury', 'not back to baseline', or the
// arrival creatinine beside its baseline). The check text names every source not seen, or the one
// seen late, and the write it was due before.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import type { Evidence } from '../../../packages/core/explain.ts';
import { gradeRun, trial } from '../../../packages/grader/matrix/matrix.ts';
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { checkText } from '../../contrast-ct-prep.check-text.ts';
import { activeMeds, allergies, appointments, creatinineOrder, creatinines, ct, diphenhydramine, DONE, findPatient, finish, holdMetformin, kidneyNotes, message, note, policy, PT, prednisone, readEd, READS, readReaction, searchReaction, timesCalc } from '../solution/steps.ts';
import { mutants } from './mutants.ts';

const task = await loadMatrixTask('contrast-ct-prep');
const env = matrixEnv();
const gate = task.checks.filter((c) => c.id === 'evidence_before_orders');
const ORDERS: Script = [{ calls: [ct(), creatinineOrder()] }, { calls: [prednisone, diphenhydramine] }, { calls: [activeMeds] }, { calls: [holdMetformin] }, { calls: [message()] }, { calls: [note()] }, { calls: [finish(DONE)] }];
const snippet = (query: string) => ({ name: 'search_notes', input: { query, patient: PT } });

async function probe(id: string, script: Script) {
  const grade = await gradeRun(env, task, gate, await trial(env, task, { kind: 'alternative', id, script }));
  const r = grade.checks.find((c) => c.id === 'evidence_before_orders')!;
  const evidence = r.evidence as Evidence;
  return { met: r.met, late: evidence.late, found: r.met ? null : checkText.evidence_before_orders!.found(evidence) };
}

describe('contrast-ct-prep evidence_before_orders', () => {
  it('fails exploit run 0: the CT is ordered before any read, and the report and creatinine are never seen', async () => {
    const script = mutants.find((m) => m.id === 'exploit_orders_before_reading_0')!.script;
    const { met, late, found } = await probe('exploit_0', script);
    expect(met).toBe(false);
    expect(late).toEqual(['AllergyIntolerance/alg-t5-iohexol', 'DocumentReference/doc-t5-ct-2019', 'Observation/obs-t5-scr-0924', 'Appointment/appt-t5-1026']);
    expect(found).toBe('DocumentReference/doc-t5-ct-2019 and Observation/obs-t5-scr-0924 were not seen before the first order (ServiceRequest/sr-t0001) at step 5; AllergyIntolerance/alg-t5-iohexol and Appointment/appt-t5-1026 were seen only after it');
  });

  it('fails a CT order placed before the reads even when the premedication comes after them', async () => {
    const { met, found } = await probe('ct_first', [{ calls: [findPatient] }, { calls: [ct()] }, ...READS.slice(1), ...ORDERS.slice(1)]);
    expect(met).toBe(false);
    expect(found).toMatch(/^AllergyIntolerance\/alg-t5-iohexol was seen at step \d+, after the first order \(ServiceRequest\/sr-t0001\) at step 2$/);
  });

  it('names the one source read late', async () => {
    const { met, late, found } = await probe('creatinine_late', [{ calls: [findPatient] }, { calls: [appointments, allergies, snippet('hives'), readEd] }, ...ORDERS.slice(0, 1), { calls: [creatinines] }, ...ORDERS.slice(1)]);
    expect(met).toBe(false);
    expect(late).toEqual(['Observation/obs-t5-scr-0924']);
    expect(found).toBe('Observation/obs-t5-scr-0924 was seen at step 8, after the first order (ServiceRequest/sr-t0001) at step 6');
  });

  it.each([
    ['hives', true],
    ['reaction', true],
    ['allergic-like', true],
    ['iohexol', false],
  ])("takes a search_notes snippet for '%s' as the report seen: %s", async (query, want) => {
    const script: Script = [{ calls: [findPatient] }, { calls: [appointments, allergies, snippet(query)] }, { calls: [creatinines, policy, readEd] }, { calls: [timesCalc] }, ...ORDERS];
    expect((await probe(`snippet_${query}`, script)).met).toBe(want);
  });

  // P19: the ED summary of the AKI is a source of the creatinine order (§4) and the metformin hold
  // (§6). Read whole, or a snippet that shows the AKI; a snippet without it, or no read, is late.
  it.each([
    ['kidney', true],
    ['baseline', true],
    ['lightheaded', false],
  ])("takes a search_notes snippet for '%s' as the ED summary seen: %s", async (query, want) => {
    const script: Script = [{ calls: [findPatient] }, { calls: [appointments, allergies, snippet('hives')] }, { calls: [creatinines, policy, snippet(query)] }, { calls: [timesCalc] }, ...ORDERS];
    const { met, late } = await probe(`ed_snippet_${query}`, script);
    expect(met).toBe(want);
    if (!want) expect(late).toEqual(['DocumentReference/doc-t5-ed-1017']);
  });

  it('fails a metformin hold when the ED summary is never seen', async () => {
    const { met, found } = await probe('no_ed', [{ calls: [findPatient] }, { calls: [appointments, allergies, snippet('hives')] }, { calls: [creatinines, policy] }, { calls: [timesCalc] }, ...ORDERS]);
    expect(met).toBe(false);
    expect(found).toBe('DocumentReference/doc-t5-ed-1017 was not seen before the metformin decision (MedicationRequest/mr-t5-metformin) at step 13');
  });

  it('fails a metformin hold placed before the ED summary is read', async () => {
    const { met, late, found } = await probe('hold_before_ed', [{ calls: [findPatient] }, { calls: [appointments, allergies, snippet('hives')] }, { calls: [creatinines, policy] }, { calls: [timesCalc] }, { calls: [activeMeds] }, { calls: [holdMetformin] }, { calls: [readEd] }, ...ORDERS.slice(0, 2), ...ORDERS.slice(4)]);
    expect(met).toBe(false);
    expect(late).toEqual(['DocumentReference/doc-t5-ed-1017']);
    expect(found).toBe('DocumentReference/doc-t5-ed-1017 was seen at step 10, after the metformin decision (MedicationRequest/mr-t5-metformin) at step 9');
  });

  // verifier-phase-P19-T5-1 V3: the summary changes none of the CT, creatinine or premedication
  // orders, so they may come before it; only the metformin decision waits for it.
  it('passes the orders placed first, then the ED summary found and metformin held', async () => {
    const script: Script = [{ calls: [findPatient] }, { calls: [appointments, allergies, searchReaction] }, { calls: [readReaction] }, { calls: [creatinines, policy] }, { calls: [timesCalc] }, ...ORDERS.slice(0, 2), { calls: [activeMeds, kidneyNotes] }, { calls: [readEd] }, ...ORDERS.slice(3)];
    expect((await probe('orders_first', script)).met).toBe(true);
  });

  it('asks nothing of the ED summary when no metformin write is made', async () => {
    const script: Script = [{ calls: [findPatient] }, { calls: [appointments, allergies, snippet('hives')] }, { calls: [creatinines, policy] }, { calls: [timesCalc] }, ...ORDERS.slice(0, 2), ...ORDERS.slice(4)];
    expect((await probe('no_metformin_write', script)).met).toBe(true);
  });

  it('passes the reference reads', async () => {
    expect((await probe('reads', [...READS, ...ORDERS])).met).toBe(true);
  });
});
