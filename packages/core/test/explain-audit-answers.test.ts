// The audit row's two answers (plan phase P17i C5, R14-31): clinically_acceptable and
// tool_rejections_correct reach AttributionFacts.audit and the explanation; and the explain.ts
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

describe('audit answers', () => {
  it('an audit row\'s clinically_acceptable and tool_rejections_correct are on the explanation, null when the row has none', () => {
    const x = explainTrial(record('FAIL'), row({ clinically_acceptable: 'no', tool_rejections_correct: 'yes' }), ctx);
    expect(x.audit_answers).toEqual({ clinically_acceptable: 'no', tool_rejections_correct: 'yes' });
    expect(formatAuditAnswers(x.audit_answers)).toBe('clinically acceptable grade: no; tool rejections correct: yes');
    expect(explainTrial(record('FAIL'), row(), ctx).audit_answers).toEqual({ clinically_acceptable: null, tool_rejections_correct: null });
    expect(formatAuditAnswers(explainTrial(record('FAIL'), row(), ctx).audit_answers)).toBe('clinically acceptable grade: not answered; tool rejections correct: not answered');
    expect(explainTrial(record('FAIL'), undefined, ctx).audit_answers).toBeNull();
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
