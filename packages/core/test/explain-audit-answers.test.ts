// The audit row's two answers (plan phase P17i C5, R14-31): clinically_acceptable and
// tool_rejections_correct, after adjudication, reach AttributionFacts.audit and the explanation,
// and a tool_rejections_correct no makes the fault environment (E6); and the explain.ts
// sentences C1 deferred: an INFRA trial ended by a C1 bound names it, and a wall-clock LIMIT
// with no limit event counts working time (elapsed less retry_wait_ms), as MAX_WALL_MS does.
import { describe, expect, it } from 'vitest';
import { explainTrial, formatAuditAnswers, type AuditRow, type ExplainContext, type ExplainRecord } from '../explain.ts';

const ctx: ExplainContext = { events: [], world_state_hash: 'h-manifest', matrix: { grader_task_version: 'g-1', oracle_pass: true, alternatives_pass: true } };
const record = (outcome: string, over: Partial<ExplainRecord> = {}): ExplainRecord => ({
  task_id: 'renal-dose-review', task_version: 'v-1', grader_task_version: 'g-1', outcome, valid: ['FAIL', 'PASS', 'LIMIT', 'REFUSAL'].includes(outcome), status: outcome === 'FAIL' ? 'COMPLETED' : outcome, detail: null,
  turns: 12, cost_usd: 0.8, started: '2026-10-24T00:00:00.000Z', ended: '2026-10-24T00:50:00.000Z', tool_errors: { INTERNAL: 0 },
  state_hash: { initial: 'h-manifest', final: 'h-final', replay_final: 'h-final' },
  checks: outcome === 'FAIL' ? [{ id: 'G1', kind: 'gate', met: false, evidence: { expected: 'a', found: 'b' } }] : [],
  attribution: outcome === 'FAIL' ? { auto: 'reasoning', first_failed: 'G1', decisive_step: 2, exposure: [] } : null, ...over,
});
const row = (over: Partial<AuditRow> = {}): AuditRow => ({ trial: 'renal-dose-review/5', outcome: 'FAIL', taxonomy: 'reasoning', model_fault: 'yes', decisive_step: 2, evidence_ids: ['Patient/pt-0001'], llm_auditor_agrees: true, note: 'n', ...over });

// order_medication input its schema accepts, and a trajectory whose step 1 fhir_read succeeds and
// whose step 2 call to tool (order_medication), with the recorded input, the tool refused with the error.
const VALID = { patient: 'Patient/pt-0001', rxnorm_code: '860975', dose_value: 500, dose_unit: 'mg', route: 'oral', frequency: 'BID', reason: 'type 2 diabetes' };
const NOT_FOUND = { code: 'NOT_FOUND', message: 'rxnorm_code 860975 is not in the catalog', field: 'rxnorm_code' };
const refused = (input: unknown, error: { code: string; message: string; field?: string }, tool = 'order_medication'): ExplainContext => {
  const call = (seq: number, name: string, input: unknown) => ({ v: 2, seq, ts: 't', turn: 1, type: 'tool_call', tool_use_id: `toolu_${seq}`, name, input });
  const result = (seq: number, name: string, err: typeof error | null) => ({
    v: 2, seq, ts: 't', turn: 1, type: 'tool_result', tool_use_id: `toolu_${seq}`, name, executed: true, is_error: err !== null, error_code: err?.code ?? null, content: err === null ? {} : { error: err }, exposed_ids: [], referenced_ids: [],
  });
  return { ...ctx, events: [call(1, 'fhir_read', { reference: 'Patient/pt-0001' }), result(1, 'fhir_read', null), call(2, tool, input), result(2, tool, error)] as unknown as ExplainContext['events'] };
};

describe('audit answers', () => {
  it('an audit row\'s clinically_acceptable and tool_rejections_correct are on the explanation, null when the row has none', () => {
    const x = explainTrial(record('FAIL'), row({ clinically_acceptable: 'no', tool_rejections_correct: 'yes' }), ctx);
    expect(x.audit_answers).toEqual({ clinically_acceptable: 'no', tool_rejections_correct: 'yes', overruled: [] });
    expect(formatAuditAnswers(x.audit_answers)).toBe('recorded outcome clinically right: no; tool rejections correct: yes');
    expect(explainTrial(record('FAIL'), row(), ctx).audit_answers).toEqual({ clinically_acceptable: null, tool_rejections_correct: null, overruled: [] });
    expect(formatAuditAnswers(explainTrial(record('FAIL'), row(), ctx).audit_answers)).toBe('recorded outcome clinically right: not answered; tool rejections correct: not answered');
    expect(explainTrial(record('FAIL'), undefined, ctx).audit_answers).toBeNull();
  });

  it('an adjudicated answer is the one counted; an overruled auditor no is marked, not counted (decisions.tsv 2026-10-27T02:10)', () => {
    const x = explainTrial(record('FAIL'), row({ clinically_acceptable: 'no', adjudicated_clinically_acceptable: 'yes', adjudicated_label: 'model' }), ctx);
    expect(x.audit_answers).toEqual({ clinically_acceptable: 'yes', tool_rejections_correct: null, overruled: ['clinically_acceptable'] });
    expect(formatAuditAnswers(x.audit_answers)).toBe('recorded outcome clinically right: yes (an auditor no, overruled); tool rejections correct: not answered');
    expect(explainTrial(record('FAIL'), row({ clinically_acceptable: 'yes', adjudicated_clinically_acceptable: 'no' }), ctx).audit_answers!.clinically_acceptable).toBe('no');
  });

  it('E6: a confirmed tool_rejections_correct no citing a refused call makes the fault environment; a successful step, no step, no confirmation or an overruled no does not', () => {
    const fault = (over: Partial<AuditRow>) => explainTrial(record('FAIL'), row({ tool_rejections_correct: 'no', taxonomy: 'environment', model_fault: 'no', ...over }), refused(VALID, NOT_FOUND));
    const env = fault({ decisive_step: 2 });
    expect(env).toMatchObject({ fault: 'env', label: 'environment', deciding: { id: 'E6', evidence: 'tool_rejections_correct no, step 2 order_medication refused (NOT_FOUND), LLM auditor agrees' } });
    expect(fault({ decisive_step: 2, llm_auditor_agrees: null, adjudicated_label: 'environment' }).deciding).toMatchObject({ id: 'E6', evidence: expect.stringMatching(/, adjudicated environment$/) });
    expect(fault({ decisive_step: 1 }).fault_criteria.env.find((c) => c.id === 'E6')).toMatchObject({ met: false, evidence: 'tool_rejections_correct no, step 1 fhir_read succeeded, LLM auditor agrees' });
    expect(fault({ decisive_step: 9 }).fault_criteria.env.find((c) => c.id === 'E6')!.evidence).toMatch(/step 9 is not in the trajectory/);
    expect(fault({ decisive_step: 2, llm_auditor_agrees: null }).fault_criteria.env.find((c) => c.id === 'E6')).toMatchObject({ met: false, evidence: expect.stringMatching(/not confirmed$/) });
    expect(fault({ decisive_step: null }).fault).toBe('model');
    expect(fault({ decisive_step: 2, adjudicated_tool_rejections_correct: 'yes' }).fault).toBe('model');
    expect(explainTrial(record('FAIL'), undefined, ctx).fault_criteria.env.find((c) => c.id === 'E6')).toMatchObject({ met: false, evidence: 'not human-audited' });
  });

  it('E6: a refusal of input that breaks the tool\'s schema was right, so it does not make the fault environment (decisions.tsv 2026-10-27T08:50, F9)', () => {
    const { dose_value: _, ...noDose } = VALID;
    const x = explainTrial(record('FAIL'), row({ tool_rejections_correct: 'no', taxonomy: 'environment', model_fault: 'no', decisive_step: 2 }), refused(noDose, { code: 'INVALID_INPUT', message: "'dose_value' is required", field: 'dose_value' }));
    expect(x.fault).toBe('model');
    expect(x.fault_criteria.env.find((c) => c.id === 'E6')).toMatchObject({ met: false, evidence: 'tool_rejections_correct no, step 2 order_medication refused (INVALID_INPUT) for input that breaks its schema (dose_value), LLM auditor agrees' });
    // An INVALID_INPUT the schema does not reproduce (here a catalog check inside the tool) can still be wrong.
    const semantic = refused(VALID, { code: 'INVALID_INPUT', message: 'dose_unit mg does not fit rxnorm_code 860975', field: 'dose_unit' });
    expect(explainTrial(record('FAIL'), row({ tool_rejections_correct: 'no', taxonomy: 'environment', model_fault: 'no', decisive_step: 2 }), semantic).fault).toBe('env');
  });

  it('E6: a refusal of a call to a tool the model was not given was right, so it does not make the fault environment (decisions.tsv 2026-10-27T09:30, F13)', () => {
    const audit = row({ tool_rejections_correct: 'no', taxonomy: 'environment', model_fault: 'no', decisive_step: 2 });
    const x = explainTrial(record('FAIL'), audit, refused(VALID, { code: 'NOT_SUPPORTED', message: "unknown tool 'bogus_tool'; tools: fhir_read" }, 'bogus_tool'));
    expect(x.fault).toBe('model');
    expect(x.fault_criteria.env.find((c) => c.id === 'E6')).toMatchObject({ met: false, evidence: 'tool_rejections_correct no, step 2 bogus_tool refused (NOT_SUPPORTED) for input that breaks its schema (name: no tool bogus_tool), LLM auditor agrees' });
    // A NOT_SUPPORTED from a tool the model was given, which its schema does not reproduce, can still be wrong.
    expect(explainTrial(record('FAIL'), audit, refused(VALID, { code: 'NOT_SUPPORTED', message: 'oral route is not supported' })).fault).toBe('env');
  });

  it('E6: only an adjudicated_label environment or an agreeing LLM auditor confirms it; an adjudicated model label does not (decisions.tsv 2026-10-27T08:50, F11)', () => {
    const x = explainTrial(record('FAIL'), row({ tool_rejections_correct: 'no', taxonomy: 'environment', model_fault: 'no', decisive_step: 2, llm_auditor_agrees: null, adjudicated_label: 'model' }), refused(VALID, NOT_FOUND));
    expect(x.fault).toBe('model');
    expect(x.fault_criteria.env.find((c) => c.id === 'E6')).toMatchObject({ met: false, evidence: expect.stringMatching(/, not confirmed \(adjudicated model\)$/) });
  });
});

describe('C1 bounds in the reason', () => {
  it('an INFRA trial ended by a C1 bound says which bound', () => {
    const reason = (outcome: string, detail: string) => explainTrial(record(outcome, { detail }), undefined, ctx).reason;
    expect(reason('INFRA_API', 'elapsed_bound')).toMatch(/^INFRA_API \(elapsed_bound\): total elapsed time, failed attempts and retry waits included, passed its hard bound; /);
    expect(reason('INFRA_API', 'spend_bound')).toMatch(/^INFRA_API \(spend_bound\): the settled cost, worst cases of dropped attempts included, would pass twice the per-trial cap; /);
    expect(reason('INFRA_HARNESS', 'unpriced_usage')).toMatch(/^INFRA_HARNESS \(unpriced_usage\): a response's usage cannot be priced, a harness defect; /);
    expect(reason('INFRA_API', 'overloaded_error')).toBe("INFRA_API (overloaded_error): the infrastructure's fault, not a trial of the model; excluded and rerun");
  });

  it('a wall-clock LIMIT with no limit event counts working time: elapsed less retry_wait_ms', () => {
    const r = record('LIMIT', { detail: 'wall_clock', retry_wait_ms: 1_200_000 });
    expect(explainTrial(r, undefined, ctx).reason).toBe('time limit reached: 1800 s of ? s');
  });
});
