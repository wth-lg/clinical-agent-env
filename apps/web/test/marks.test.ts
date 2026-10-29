// markOf (src/data/marks.ts), the mark every chip, swatch and legend shows, from a trial's outcome and
// the fault its caller passes, shownFault (src/data/failures.ts). A false PASS (outcomes.ts GR5) takes
// the grader mark, a blocking mark; a PASS with no fault keeps the pass mark
// (verifier-phase-P17j-retro-JG5-unread-1 m3).
import { describe, expect, it } from 'vitest';
import { explainTrial, type AuditRow, type ExplainContext, type ExplainRecord } from '../../../packages/core/explain.ts';
import { shownFault } from '../src/data/failures.ts';
import { BLOCKING_MARKS, markOf } from '../src/data/marks.ts';

const ctx: ExplainContext = { events: [], world_state_hash: 'h', matrix: null };
const pass: ExplainRecord = {
  task_id: 't', task_version: 'v', grader_task_version: 'g', outcome: 'PASS', valid: true, status: 'COMPLETED', detail: null,
  tool_errors: { INTERNAL: 0 }, state_hash: { initial: 'h', final: 'f', replay_final: 'f' }, checks: [{ id: 'G1', kind: 'gate', met: true }], attribution: null, error: null,
};
const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  trial: 't/0', outcome: 'PASS', taxonomy: null, model_fault: null, decisive_step: 3, evidence_ids: ['MedicationRequest/mr-1'], llm_auditor_agrees: true, ...over,
});
const markOfTrial = (audit: AuditRow | null) => {
  const e = explainTrial(pass, audit, ctx);
  return markOf(e.outcome, shownFault(e));
};

describe('markOf', () => {
  it("markOf('PASS', 'grader') is the grader mark, a blocking mark", () => {
    expect(markOf('PASS', 'grader')).toBe('grader');
    expect(BLOCKING_MARKS).toContain('grader');
  });

  it('a PASS with no fault, or the default fault, keeps the pass mark', () => {
    expect(markOf('PASS')).toBe('pass');
    expect(markOf('PASS', null)).toBe('pass');
  });

  it('as the callers pass it: a GR5 trial takes the grader mark; a PASS unaudited, confirmed, or confirmed by adjudicated_label pass keeps the pass mark', () => {
    expect(markOfTrial(row({ label: 'grader' }))).toBe('grader');
    expect(markOfTrial(null)).toBe('pass');
    expect(markOfTrial(row())).toBe('pass');
    expect(markOfTrial(row({ label: 'grader', llm_auditor_agrees: false, adjudicated_label: 'pass' }))).toBe('pass');
  });

  it('failures keep their marks', () => {
    expect(markOf('FAIL', 'grader')).toBe('grader');
    expect(markOf('FAIL', 'env')).toBe('environment');
    expect(markOf('FAIL')).toBe('model');
    expect(markOf('LIMIT')).toBe('limit');
    expect(markOf('REFUSAL')).toBe('refusal');
    expect(markOf('INFRA')).toBe('infra');
  });
});
