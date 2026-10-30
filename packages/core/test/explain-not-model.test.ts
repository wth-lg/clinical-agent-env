// A trial whose fault is not the model's is never explained as a model failure (review-ui-P16-1
// F3): no taxonomy (the kind of model failure), no decisive step (the model step that decided);
// on an excluded trial (GRADER_ERROR, ENV_ERROR, INFRA), no decisive check either, so no "found"
// value, since a check that threw or a trial that never finished has no verdict on the model. A
// valid trial with an environment, grader or infra fault keeps its decisive check: the
// ui-contract reason form names it, then says whose fault it is.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { explainTrial, type ExplainContext, type ExplainRecord } from '../explain.ts';
import { NOT_RERUN_REASON } from '../outcomes.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';

const MANIFEST = 'h-manifest';
const G = 'g-1';
const ctx: ExplainContext = {
  events: [],
  world_state_hash: MANIFEST,
  exposable: () => true,
  matrix: { grader_task_version: G, oracle_pass: true, alternatives_pass: true },
  checks: [{ id: 'G1', traces_to: 'RBC-PHARM-07 §2' }],
};
const G1_FAILED = { id: 'G1', kind: 'gate', met: false, evidence: { expected: 'apixaban 5 mg 2/day', found: 'apixaban 2.5 mg 2/day' } };
const REASONING = { auto: 'reasoning', first_failed: 'G1', decisive_step: 9, exposure: [{ id: 'Observation/obs-wt-1', first_exposed_step: 6 }] };

function record(outcome: string, over: Partial<ExplainRecord> = {}): ExplainRecord {
  const valid = ['REFUSAL', 'LIMIT', 'FAIL', 'PASS'].includes(outcome);
  return {
    task_id: 'renal-dose-review', task_version: 'v-1', grader_task_version: G, outcome, valid, status: valid || outcome === 'GRADER_ERROR' ? 'COMPLETED' : outcome, detail: null,
    turns: 12, cost_usd: 0.8, started: '2026-10-24T00:00:00.000Z', ended: '2026-10-24T00:05:00.000Z', summary: null, refusal_category: null,
    model_requested: 'claude-opus-5-5', models_returned: ['claude-opus-5-5'],
    tool_errors: { INVALID_INPUT: 0, NOT_FOUND: 0, CONFLICT: 0, NOT_SUPPORTED: 0, INTERNAL: 0 },
    state_hash: { initial: MANIFEST, final: 'h-final', replay_final: 'h-final' },
    checks: [G1_FAILED], attribution: REASONING, error: null,
    ...over,
  };
}

describe('an excluded trial has no model taxonomy, decisive check or decisive step', () => {
  it.each([
    ['GRADER_ERROR', record('GRADER_ERROR', { error: { check: 'G1', message: "TypeError: Cannot read properties of undefined (reading 'status')", stops_batch: false } }), 'grader'],
    ['ENV_ERROR', record('ENV_ERROR', { detail: 'INTERNAL', tool_errors: { INVALID_INPUT: 0, NOT_FOUND: 0, CONFLICT: 0, NOT_SUPPORTED: 0, INTERNAL: 1 } }), 'env'],
    ['INFRA_API', record('INFRA_API', { detail: 'overloaded_error after 4 retries' }), 'infra'],
  ] as const)('%s, even when the record still holds a failed check and a model attribution', (_, rec, fault) => {
    const x = explainTrial(rec, undefined, ctx);
    expect(x.fault).toBe(fault);
    expect(x.taxonomy).toBeNull();
    expect(x.decisive_check).toBeNull();
    expect(x.decisive_step).toBeNull();
    expect(x.reason).not.toMatch(/found|Kind: reasoning/);
  });

  // W0-A: an ENV_LIMIT is the environment's (E7 or E8), excluded and never run again; its reason
  // says why it is not run again and never says it is.
  it.each([
    ['context_window', 'E7', /^context_window limit: stop_reason model_context_window_exceeded with 191500 tokens in context$/],
    ['turns', 'E8', /^turns limit; last 20 calls: 0 repeats \(share 0\.00\), 20 new ids; progressing$/],
  ] as const)('ENV_LIMIT at %s: decided by %s, no taxonomy, check or step, and "not run again" with its reason', (detail, id, evidence) => {
    const calls = Array.from({ length: 24 }, (_, i) => [
      { v: 2, seq: 2 * i, ts: 't', turn: i + 1, type: 'tool_call', tool_use_id: `u${i}`, name: 'fhir_read', input: { id: `o-${i}` } },
      { v: 2, seq: 2 * i + 1, ts: 't', turn: i + 1, type: 'tool_result', tool_use_id: `u${i}`, name: 'fhir_read', executed: true, is_error: false, error_code: null, content: {}, exposed_ids: [`Observation/o-${i}`], referenced_ids: [] },
    ]).flat() as unknown as ExplainContext['events'];
    const stop = detail === 'context_window'
      ? { v: 2, seq: 99, ts: 't', turn: 24, type: 'limit', limit: 'context_window', cap: 191_500, value: 191_500, code: 'stop_reason' }
      : { v: 2, seq: 99, ts: 't', turn: 24, type: 'limit', limit: 'turns', cap: 24, value: 24 };
    const rec = record('ENV_LIMIT', { status: 'LIMIT', detail, stop_reason: detail === 'context_window' ? 'model_context_window_exceeded' : 'tool_use', checks: [], attribution: null });
    const x = explainTrial(rec, undefined, { ...ctx, events: [...calls, stop] as ExplainContext['events'] });
    expect(x).toMatchObject({ outcome: 'ENV_LIMIT', valid: false, fault: 'env', label: 'environment', deciding: { id }, taxonomy: null, decisive_check: null, decisive_step: null, confirmation: 'confirmed' });
    expect(x.deciding!.evidence).toMatch(evidence);
    expect(x.reason).toContain(`not run again: ${NOT_RERUN_REASON.ENV_LIMIT}`);
    expect(x.reason).not.toMatch(/excluded and rerun|run again;|is run again/);
    expect(x.fault_criteria.model.find((c) => c.id === 'MF2')!.met).toBe(false);
  });

  // The exemplar lives in the sample's pilot run since the official run's GRADER_ERROR was regraded
  // (decisions.tsv 2026-10-29T17:50).
  it('the sample GRADER_ERROR trial (message-queue/12), whose record carries a model label (over_action)', () => {
    const file = join(repoRoot, 'apps/web/e2e/fixtures/sample-results/results/pilot-grader-error/trials/message-queue/12.json');
    const rec = JSON.parse(readFileSync(file, 'utf8')) as ExplainRecord;
    expect(rec.attribution?.auto).toBe('over_action');
    const x = explainTrial(rec, undefined, { ...ctx, world_state_hash: null, matrix: null, checks: [] });
    expect(x).toMatchObject({ outcome: 'GRADER_ERROR', fault: 'grader', taxonomy: null, decisive_check: null, decisive_step: null });
  });
});

describe('a valid trial with a fault that is not the model\'s', () => {
  it('infra (the API returned another model): the check stays, with no taxonomy and no decisive step', () => {
    const x = explainTrial(record('FAIL', { models_returned: ['claude-opus-5-5', 'claude-other'] }), undefined, ctx);
    expect(x.fault).toBe('infra');
    expect(x.taxonomy).toBeNull();
    expect(x.decisive_step).toBeNull();
    expect(x.decisive_check?.id).toBe('G1');
  });

  it('grader (the matrix fails the check): the check stays, with Kind: grader, no taxonomy and no decisive step', () => {
    const x = explainTrial(record('FAIL'), undefined, { ...ctx, matrix: { grader_task_version: G, oracle_pass: false, alternatives_pass: true, failed_checks: ['G1'] } });
    expect(x).toMatchObject({ fault: 'grader', deciding: { id: 'GR4' }, taxonomy: null, decisive_step: null, decisive_check: { id: 'G1' } });
    expect(x.reason).toMatch(/; Kind: grader/);
  });

  it('a model FAIL keeps its taxonomy, decisive check and decisive step', () => {
    const x = explainTrial(record('FAIL'), undefined, ctx);
    expect(x).toMatchObject({ fault: 'model', taxonomy: 'reasoning', decisive_step: 9, decisive_check: { id: 'G1' } });
  });
});
