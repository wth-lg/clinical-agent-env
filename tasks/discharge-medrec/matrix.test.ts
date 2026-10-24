// T4's matrix cases against what they declare beyond the matrix's own checks: each mutant and
// alternative loses exactly the rubric items in its `loses` (a positive item not met, or a
// negative item met), and G8 (sources_before_orders) reads the text a step showed, so a
// search_notes snippet that shows the addendum's correction counts and one that cuts it off does
// not.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import type { GateCtx, Step } from '../../packages/grader/check.ts';
import { runCases, selectCases } from '../../packages/grader/matrix/matrix.ts';
import { expected } from './expected.ts';
import { alternatives } from './tests/alternatives.ts';
import { checks } from './tests/grader.ts';
import { mutants } from './tests/mutants.ts';

describe('discharge-medrec declared losses', async () => {
  const task = await loadMatrixTask('discharge-medrec');
  const declared = new Map([...alternatives, ...mutants].map((a) => [a.id, a.loses]));
  const results = await runCases(matrixEnv(), task, selectCases(task, [...declared.keys()]), { trials: 1, regrades: 1, isolation: false });
  for (const r of results) {
    it(`${r.case.kind} ${r.case.id} loses exactly ${JSON.stringify(declared.get(r.case.id))}`, () => {
      const lost = r.grade.checks.filter((c) => c.kind === 'rubric' && (c.points! > 0 ? c.met !== true : c.met === true)).map((c) => c.id);
      expect(lost.sort()).toEqual([...declared.get(r.case.id)!].sort());
    });
  }
});

describe('sources_before_orders reads the text shown', () => {
  const g8 = checks.find((c) => c.id === 'sources_before_orders')!;
  const ADD = expected.sources.addendum;
  const SCR = expected.scr.id;
  const SPIRO = 'MedicationRequest/new-spiro';
  // Step 1 reads the creatinine, step 2 is a notes search or read, step 3 orders spironolactone.
  const ctxWith = (second: Partial<Step> & { shown?: Record<string, string> }): GateCtx => {
    const step = (n: number, s: Partial<Step>): Step => ({ n, seq: n, tool: 'fhir_read', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], ...s });
    const steps = [step(1, { exposed_ids: [SCR], shown: {} } as Partial<Step>), step(2, second), step(3, { tool: 'order_medication', written_ids: [SPIRO], shown: {} } as Partial<Step>)];
    const spiro = { resourceType: 'MedicationRequest', id: 'new-spiro', status: 'active', subject: { reference: expected.patient }, medicationCodeableConcept: { text: 'spironolactone 25 MG Oral Tablet' } };
    const final = { get: (type: string, id: string) => (`${type}/${id}` === SPIRO ? spiro : undefined) };
    return { steps, final, exposedAt: (id: string) => steps.find((s) => s.exposed_ids.includes(id))?.n ?? null } as unknown as GateCtx;
  };
  const met = async (ctx: GateCtx) => (g8.kind === 'gate' ? (await g8.fn(ctx)).met : null);

  it('passes when a search_notes snippet showed the correction before the order', async () => {
    expect(await met(ctxWith({ tool: 'search_notes', referenced_ids: [ADD], shown: { [ADD]: '…Correction: spironolactone 25 mg daily, not 12.5 m…' } }))).toBe(true);
  });
  it('fails when the snippet cut the correction off', async () => {
    expect(await met(ctxWith({ tool: 'search_notes', referenced_ids: [ADD], shown: { [ADD]: '…Discharge Summary Addendum (signed) Patient: Walter Kim…' } }))).toBe(false);
  });
  it('fails when nothing showed the addendum', async () => {
    expect(await met(ctxWith({ tool: 'search_notes', shown: {} }))).toBe(false);
  });
  it('passes on a read of the addendum from a grader that predates Step.shown', async () => {
    const ctx = ctxWith({ exposed_ids: [ADD] });
    for (const s of ctx.steps) delete (s as { shown?: unknown }).shown;
    expect(await met(ctx)).toBe(true);
  });
});
