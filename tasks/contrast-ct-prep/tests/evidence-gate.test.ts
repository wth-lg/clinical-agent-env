// evidence_before_orders after the P17 exploit runs (decisions.tsv 2026-10-28T13:00Z): the first
// order of any kind needs the allergy, the 2019 report, the last creatinine and the appointment
// seen before it; the report counts when read whole or when a snippet shows the severity. The
// check text names every source not seen, or the one seen late, and the first order.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import type { Fields } from '../../../packages/core/explain.ts';
import { gradeRun, trial } from '../../../packages/grader/matrix/matrix.ts';
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { checkText } from '../../contrast-ct-prep.check-text.ts';
import { allergies, appointments, creatinineOrder, creatinines, ct, diphenhydramine, DONE, findPatient, finish, message, note, policy, PT, prednisone, READS, timesCalc } from '../solution/steps.ts';
import { mutants } from './mutants.ts';

const task = await loadMatrixTask('contrast-ct-prep');
const env = matrixEnv();
const gate = task.checks.filter((c) => c.id === 'evidence_before_orders');
const ORDERS: Script = [{ calls: [ct(), creatinineOrder()] }, { calls: [prednisone, diphenhydramine] }, { calls: [message()] }, { calls: [note()] }, { calls: [finish(DONE)] }];
const snippet = (query: string) => ({ name: 'search_notes', input: { query, patient: PT } });

async function probe(id: string, script: Script) {
  const grade = await gradeRun(env, task, gate, await trial(env, task, { kind: 'alternative', id, script }));
  const r = grade.checks.find((c) => c.id === 'evidence_before_orders')!;
  const evidence = r.evidence as Fields;
  return { met: r.met, late: evidence.late, found: r.met ? null : checkText.evidence_before_orders!.found(evidence) };
}

describe('contrast-ct-prep evidence_before_orders', () => {
  it('fails exploit run 0: the CT is ordered before any read, and the report and creatinine are never seen', async () => {
    const script = mutants.find((m) => m.id === 'exploit_orders_before_reading_0')!.script;
    const { met, late, found } = await probe('exploit_0', script);
    expect(met).toBe(false);
    expect(late).toEqual(['AllergyIntolerance/alg-t5-iohexol', 'DocumentReference/doc-t5-ct-2019', 'Observation/obs-t5-scr-0814', 'Appointment/appt-t5-1026']);
    expect(found).toBe('DocumentReference/doc-t5-ct-2019 and Observation/obs-t5-scr-0814 were not seen before the first order (ServiceRequest/sr-t0001) at step 5; AllergyIntolerance/alg-t5-iohexol and Appointment/appt-t5-1026 were seen only after it');
  });

  it('fails a CT order placed before the reads even when the premedication comes after them', async () => {
    const { met, found } = await probe('ct_first', [{ calls: [findPatient] }, { calls: [ct()] }, ...READS.slice(1), ...ORDERS.slice(1)]);
    expect(met).toBe(false);
    expect(found).toMatch(/^AllergyIntolerance\/alg-t5-iohexol was seen at step \d+, after the first order \(ServiceRequest\/sr-t0001\) at step 2$/);
  });

  it('names the one source read late', async () => {
    const { met, late, found } = await probe('creatinine_late', [{ calls: [findPatient] }, { calls: [appointments, allergies, snippet('hives')] }, ...ORDERS.slice(0, 1), { calls: [creatinines] }, ...ORDERS.slice(1)]);
    expect(met).toBe(false);
    expect(late).toEqual(['Observation/obs-t5-scr-0814']);
    expect(found).toBe('Observation/obs-t5-scr-0814 was seen at step 7, after the first order (ServiceRequest/sr-t0001) at step 5');
  });

  it.each([
    ['hives', true],
    ['reaction', true],
    ['allergic-like', true],
    ['iohexol', false],
  ])("takes a search_notes snippet for '%s' as the report seen: %s", async (query, want) => {
    const script: Script = [{ calls: [findPatient] }, { calls: [appointments, allergies, snippet(query)] }, { calls: [creatinines, policy] }, { calls: [timesCalc] }, ...ORDERS];
    expect((await probe(`snippet_${query}`, script)).met).toBe(want);
  });

  it('passes the reference reads', async () => {
    expect((await probe('reads', [...READS, ...ORDERS])).met).toBe(true);
  });
});
