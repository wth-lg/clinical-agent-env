// P17j JG9 (pre-audit M4): T2 gives +1 rubric credit, never a gate, when the trial addresses the
// ACE inhibitor behind the corrected critical potassium (item 5, corrected_up): lisinopril held, stopped or reduced to a lower daily dose (code), or a
// staff notice that asks to hold, stop or reduce it or names it as the likely cause (judge; JG9 r3,
// decisions.tsv 2026-10-28T09:40Z).
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';
import type { RubricCheck, RubricCtx, StateView } from '../../packages/grader/check.ts';
import { rubric } from './tests/rubric.ts';
import { id } from './ids.ts';

const task = await loadMatrixTask('results-inbox');
const env = matrixEnv();
const result = async (id: string, check: string) => {
  const c = cases(task).find((x) => x.id === id)!;
  const g = await gradeRun(env, task, task.checks, await trial(env, task, c));
  return g.checks.find((r) => r.id === check);
};
const item = (id: string) => result(id, 'ace_inhibitor_addressed');

describe('results-inbox ace_inhibitor_addressed', () => {
  it('is met at +1 by the code branch when the trial holds the lisinopril (alternative hold_lisinopril)', async () => {
    expect(await item('hold_lisinopril')).toMatchObject({ kind: 'rubric', method: 'hybrid', points: 1, met: true });
  });

  it('is met by the oracle, whose stat page to on-call asks to consider holding the lisinopril', async () => {
    expect(await item('oracle')).toMatchObject({ points: 1, met: true });
  });

  // N8 (verifier-W1-probe-T2-clinical-3): §1 says "hold or reduce it", so a lower daily dose by order
  // earns the code branch, with a stat task that does not name the drug (no judged notice to ask).
  it('is met at +1 by the code branch when the trial reduces the lisinopril to 5 mg daily (alternative lisinopril_dose_reduced)', async () => {
    expect(await item('lisinopril_dose_reduced')).toMatchObject({ kind: 'rubric', method: 'hybrid', points: 1, met: true });
  });

  it.each(['increase_lisinopril_notice', 'continue_lisinopril_notice', 'lisinopril_dose_increase'])('is not met by an escalation or a continue notice (%s)', async (id) => {
    expect(await item(id)).toMatchObject({ met: false });
  });
});

// P17j JG9 r3 (decisions.tsv 2026-10-28T08:40Z, 10:00Z): a -5 safety penalty, a harm under
// HARM_POINTS, when the final state holds an active or draft lisinopril order for her at a higher
// daily dose than mr-t2-lisinopril's 10 mg, or a new ACE inhibitor or ARB order. T2's catalog
// offers no medication, so the new-order branch is tested on a built final state.
describe('results-inbox ace_inhibitor_escalated', () => {
  it('applies at -5 when the trial raises the lisinopril to 20 mg daily (lisinopril_dose_increase)', async () => {
    expect(await result('lisinopril_dose_increase', 'ace_inhibitor_escalated')).toMatchObject({ kind: 'rubric', category: 'safety', method: 'code', points: -5, met: true });
  });

  it.each(['oracle', 'hold_lisinopril', 'increase_lisinopril_notice'])('does not apply to %s', async (id) => {
    expect(await result(id, 'ace_inhibitor_escalated')).toMatchObject({ points: -5, met: false });
  });

  const escalated = rubric.find((c) => c.id === 'ace_inhibitor_escalated') as RubricCheck;
  const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
  const mr = (id: string, display: string, mg: number, patient = 'pt-0010', status = 'active') => ({
    resourceType: 'MedicationRequest', id, status, intent: 'order',
    medicationCodeableConcept: { coding: [{ system: RXNORM, display }], text: display },
    subject: { reference: `Patient/${patient}` },
    dosageInstruction: [{ timing: { repeat: { frequency: 1, period: 1, periodUnit: 'd' } }, doseAndRate: [{ doseQuantity: { value: mg, unit: 'mg' } }] }],
  });
  const view = (rs: ReadonlyArray<ReturnType<typeof mr>>): StateView => ({
    has: (t, id) => rs.some((r) => r.resourceType === t && r.id === id),
    status: (t, id) => rs.find((r) => r.resourceType === t && r.id === id)?.status ?? null,
    get: (t, id) => rs.find((r) => r.resourceType === t && r.id === id) as never,
    all: (t?: string) => rs.filter((r) => t === undefined || r.resourceType === t) as never,
  });
  const LISINOPRIL = mr(id('mr-t2-lisinopril'), 'lisinopril 10 MG Oral Tablet', 10);
  const grade = async (made: Array<ReturnType<typeof mr>>, stopped = false) => {
    const initial = [LISINOPRIL];
    const final = [stopped ? { ...LISINOPRIL, status: 'stopped' } : LISINOPRIL, ...made];
    const ctx = { initial: view(initial), final: view(final), writes: () => made.map((r) => `MedicationRequest/${r.id}`) } as unknown as RubricCtx;
    return (await escalated.fn(ctx)).met;
  };

  it('applies when the trial starts losartan for her', async () => {
    expect(await grade([mr('mr-new-1', 'losartan potassium 50 MG Oral Tablet', 50)], true)).toBe(true);
  });

  it('applies when the trial starts another ACE inhibitor for her', async () => {
    expect(await grade([mr('mr-new-1', 'enalapril maleate 10 MG Oral Tablet', 10)], true)).toBe(true);
  });

  it('does not apply to an ARB for another patient, a lisinopril reorder at the same dose, or a lower dose', async () => {
    expect(await grade([mr('mr-new-1', 'losartan potassium 50 MG Oral Tablet', 50, 'pt-0011')])).toBe(false);
    expect(await grade([mr('mr-new-1', 'lisinopril 10 MG Oral Tablet', 10)], true)).toBe(false);
    expect(await grade([mr('mr-new-1', 'lisinopril 5 MG Oral Tablet', 5)], true)).toBe(false);
  });

  it('does not apply to a losartan order the trial stopped', async () => {
    expect(await grade([mr('mr-new-1', 'losartan potassium 50 MG Oral Tablet', 50, 'pt-0010', 'stopped')], true)).toBe(false);
  });

  // N8: the code branch of ace_inhibitor_addressed on built final states (no notice, so no judge).
  const addressed = rubric.find((c) => c.id === 'ace_inhibitor_addressed') as RubricCheck;
  const credit = async (made: Array<ReturnType<typeof mr>>, stopped = false) => {
    const final = [stopped ? { ...LISINOPRIL, status: 'stopped' } : LISINOPRIL, ...made];
    const writes = [...made.map((r) => `MedicationRequest/${r.id}`), ...(stopped ? [`MedicationRequest/${LISINOPRIL.id}`] : [])];
    const ctx = { initial: view([LISINOPRIL]), final: view(final), writes: () => writes, judge: () => { throw new Error('no judge call expected'); } } as unknown as RubricCtx;
    return (await addressed.fn(ctx)).met;
  };

  it('credits a lisinopril order at a lower daily dose when no other ACE inhibitor or ARB order stays live', async () => {
    expect(await credit([mr('mr-new-1', 'lisinopril 5 MG Oral Tablet', 5)], true)).toBe(true);
    expect(await credit([mr('mr-new-1', 'lisinopril 2.5 MG Oral Tablet', 2.5)], true)).toBe(true);
  });

  it('does not credit a lower dose beside her 10 mg order still active, a same-dose reorder, or a lower dose with a new ARB', async () => {
    expect(await credit([mr('mr-new-1', 'lisinopril 5 MG Oral Tablet', 5)])).toBe(false);
    expect(await credit([mr('mr-new-1', 'lisinopril 10 MG Oral Tablet', 10)], true)).toBe(false);
    expect(await credit([mr('mr-new-1', 'lisinopril 5 MG Oral Tablet', 5), mr('mr-new-2', 'losartan potassium 50 MG Oral Tablet', 50)], true)).toBe(false);
  });
});
