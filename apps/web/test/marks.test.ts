// markOf (src/data/marks.ts), the mark every chip, swatch and legend shows, from a trial's outcome and
// the fault its caller passes, shownFault (src/data/failures.ts). A false PASS (outcomes.ts GR5) takes
// the grader mark, a blocking mark; a PASS with no fault keeps the pass mark
// (verifier-phase-P17j-retro-JG5-unread-1 m3).
import { describe, expect, it } from 'vitest';
import { explainTrial, type AuditRow, type ExplainContext, type ExplainRecord } from '../../../packages/core/explain.ts';
import { blocksTheRun, shownFault } from '../src/data/failures.ts';
import { BLOCKING_MARKS, faultNote, markOf, NOT_COUNTED_LINE, notCounted, notCountedText } from '../src/data/marks.ts';
import { NOT_RERUN_REASON } from '../../../packages/core/outcomes.ts';

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
    expect(markOfTrial(row({ label: 'grader', llm_auditor_agrees: false, adjudicated_label: 'pass', note: 'the grader was right to pass it' }))).toBe('pass');
  });

  it('an adjudicated_label pass that nothing called for, or that overrules a label grader with no note, leaves the false PASS (verifier-phase-P17i-P17j-S3retro-1 A1)', () => {
    expect(markOfTrial(row({ label: 'grader', adjudicated_label: 'pass', note: 'looks fine' }))).toBe('grader');
    expect(markOfTrial(row({ label: 'grader', llm_auditor_agrees: false, adjudicated_label: 'pass' }))).toBe('grader');
    // B1n (verifier-phase-P17i-P17j-S3retror2-1): a note that is not text is no note, not a crash.
    expect(markOfTrial(row({ label: 'grader', llm_auditor_agrees: false, adjudicated_label: 'pass', note: 7 as unknown as string }))).toBe('grader');
  });

  it('U1 (probe A7): a FAIL labelled environment or grader with adjudicated_label pass keeps its mark and blocks the run (verifier-phase-P17i-P17j-S3retro-1 U1)', () => {
    const fail: ExplainRecord = { ...pass, outcome: 'FAIL', checks: [{ id: 'G1', kind: 'gate', met: false }] };
    for (const [label, mark] of [['environment', 'environment'], ['grader', 'grader']] as const) {
      const e = explainTrial(fail, row({ outcome: 'FAIL', model_fault: 'no', label, adjudicated_label: 'pass' }), ctx);
      expect(markOf(e.outcome, shownFault(e))).toBe(mark);
      expect(blocksTheRun(e)).toBe(true);
    }
  });

  // W0-A: ENV_LIMIT is the environment's, excluded and never run again; the note beside its label,
  // on the trial page and in Runs, says why, in NOT_RERUN_REASON's words, and never "run again".
  it('an ENV_LIMIT takes the environment mark, and its note says it is not run again and why', () => {
    expect(markOf('ENV_LIMIT')).toBe('environment');
    const limit: ExplainRecord = { ...pass, outcome: 'ENV_LIMIT', valid: false, status: 'LIMIT', detail: 'context_window', checks: [] };
    const e = explainTrial(limit, null, ctx);
    expect(markOf(e.outcome, shownFault(e))).toBe('environment');
    expect(faultNote(e, true, false)).toBe(`Not counted; it is not run again: ${NOT_RERUN_REASON.ENV_LIMIT}.`);
    expect(faultNote(e, true, true)).toBe(`It is not run again: ${NOT_RERUN_REASON.ENV_LIMIT}.`);
    // An ENV_ERROR is still run again.
    const env = explainTrial({ ...pass, outcome: 'ENV_ERROR', valid: false, status: 'ENV_ERROR', detail: 'INTERNAL', tool_errors: { INTERNAL: 1 }, checks: [] }, null, ctx);
    expect(faultNote(env, true, false)).toBe('Not counted; it is run again.');
  });

  it('the plain "Not counted" line lists ENV_LIMIT and GRADER_ERROR under "not run again", each with its reason', () => {
    expect(NOT_COUNTED_LINE).toBe(`INVALID, INFRA_HARNESS, INFRA_API, CANCELLED, ENV_ERROR (run again), GRADER_ERROR (not run again: ${NOT_RERUN_REASON.GRADER_ERROR}), and ENV_LIMIT (not run again: ${NOT_RERUN_REASON.ENV_LIMIT}).`);
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

// verifier-phase-P17i-W0-A-1 F4: beside each task's k/n, Findings and Runs say how many trials it
// leaves out as ENV_LIMIT and as the other excluded outcomes, and why.
describe('notCounted', () => {
  it('lists each excluded outcome with its count and why, in outcome order; valid outcomes never', () => {
    const parts = notCounted({ outcomes: { PASS: 8, FAIL: 4, LIMIT: 1, REFUSAL: 1, INFRA_API: 1, ENV_ERROR: 2, GRADER_ERROR: 1 } });
    expect(parts).toEqual([
      { outcome: 'INFRA_API', n: 1, why: 'run again' },
      { outcome: 'ENV_ERROR', n: 2, why: 'run again' },
      { outcome: 'GRADER_ERROR', n: 1, why: `not run again: ${NOT_RERUN_REASON.GRADER_ERROR}` },
    ]);
    expect(notCountedText(parts)).toBe(`Not counted: 1 INFRA_API (run again), 2 ENV_ERROR (run again), 1 GRADER_ERROR (not run again: ${NOT_RERUN_REASON.GRADER_ERROR}).`);
  });

  it('ENV_LIMIT counts every attempt from env_limit, settled or not, with NOT_RERUN_REASON', () => {
    expect(notCounted({ outcomes: { PASS: 8, ENV_LIMIT: 1 }, env_limit: 2 })).toEqual([{ outcome: 'ENV_LIMIT', n: 2, why: `not run again: ${NOT_RERUN_REASON.ENV_LIMIT}` }]);
    expect(notCountedText(notCounted({ outcomes: { PASS: 8 }, env_limit: 1 }))).toBe(`Not counted: 1 ENV_LIMIT (not run again: ${NOT_RERUN_REASON.ENV_LIMIT}).`);
    // A pilot's counts have no env_limit: its trials' outcomes say.
    expect(notCounted({ outcomes: { ENV_LIMIT: 1 } })).toMatchObject([{ outcome: 'ENV_LIMIT', n: 1 }]);
  });

  it('nothing left out: no line', () => {
    expect(notCountedText(notCounted({ outcomes: { PASS: 3, FAIL: 9 }, env_limit: 0 }))).toBeNull();
  });
});
