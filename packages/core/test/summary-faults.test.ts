// Why a task fails, in summary.json (plan P17j JG7, pre-audit S4 and M1): the model and effort of
// the run's trials; per task, fault_counts (the valid failures by TAXONOMY of the current grade,
// by audit label when the caller gives the audit, and the infra re-runs) and top_failed_checks
// (the decisive failed check of each valid failure, by count then id). Hand counts over 8
// records and 2 re-queued attempts with 2 audit labels.
import { describe, expect, it } from 'vitest';
import { SUMMARY_SCHEMA_VERSION, summarize, validateSummary, type SummaryTrial } from '../summary.ts';
import { MODEL } from '../anthropic.ts';

const gate = (id: string, met: boolean) => ({ id, kind: 'gate', category: 'action', met });
function trial(index: number, outcome: string, over: Partial<SummaryTrial> = {}): SummaryTrial {
  return {
    task_id: 't', task_version: 'v', env_version: 'e', grader_task_version: 'g', index, outcome, detail: null, model_requested: MODEL, models_returned: [MODEL], effort: 'high',
    state_hash: { initial: 'h', final: 'f', replay_final: 'f' }, tool_errors: { INTERNAL: 0 }, cost_usd: 0.5, judge_cost_usd: 0, score: outcome === 'PASS' ? 1 : outcome === 'FAIL' ? 0 : null,
    checks: outcome === 'PASS' ? [gate('G1', true), gate('G2', true)] : [], ...over,
  };
}
const att = (auto: string, first_failed: string) => ({ attribution: { auto, first_failed } });
const TRIALS = [
  trial(0, 'PASS'),
  trial(1, 'PASS'),
  trial(2, 'FAIL', { checks: [gate('G1', false), gate('G2', true)], ...att('retrieval', 'G1') }),
  trial(3, 'FAIL', { checks: [gate('G1', false), gate('G2', true)], ...att('reasoning', 'G1') }),
  trial(4, 'FAIL', { checks: [gate('G1', true), gate('G2', false)], ...att('reasoning', 'G2') }),
  // Its attribution names G2, an earlier grade's check: the current grade fails G1, so no kind.
  trial(5, 'FAIL', { checks: [gate('G1', false), gate('G2', true)], ...att('over_action', 'G2') }),
  trial(6, 'LIMIT', { detail: 'turns' }),
  trial(7, 'REFUSAL'),
];
const REQUEUED = [trial(8, 'INFRA_API'), trial(9, 'ENV_ERROR')];
const AUDIT = { 't/2': 'model', 't/4': 'grader', 't/0': null };

describe('fault_counts, top_failed_checks, model and effort', () => {
  const s = summarize({ run_id: 'r', trials: TRIALS, requeued: REQUEUED, replay: null, audit: AUDIT });

  it('equal the hand counts', () => {
    expect(s.schema_version).toBe(SUMMARY_SCHEMA_VERSION);
    expect(s).toMatchObject({ model: MODEL, effort: 'high' });
    expect(s.tasks.t!.fault_counts).toEqual({
      failures: 6,
      taxonomy: { retrieval: 1, reasoning: 2, output_gap: 0, over_action: 0, process: 0, action_form: 0, did_not_finish: 1, refusal: 1, unattributed: 1 },
      label: { model: 1, environment: 0, grader: 1, unlabelled: 4 },
      infra_reruns: 1,
    });
    expect(s.tasks.t!.top_failed_checks).toEqual([{ check: 'G1', count: 3 }, { check: 'G2', count: 1 }]);
    expect(validateSummary(s)).toEqual([]);
  });

  it('without the audit the labels are null; a run of mixed efforts or models has none', () => {
    const plain = summarize({ run_id: 'r', trials: TRIALS, requeued: REQUEUED, replay: null });
    expect(plain.tasks.t!.fault_counts.label).toBeNull();
    expect(validateSummary(plain)).toEqual([]);
    const mixed = summarize({ run_id: 'r', trials: [...TRIALS, trial(10, 'PASS', { effort: 'low', model_requested: 'claude-other' })], requeued: [], replay: null });
    expect(mixed).toMatchObject({ model: null, effort: null });
  });

  it('the schema rejects a summary without them, or with counts that do not add up', () => {
    const { model: _m, ...noModel } = s;
    expect(validateSummary(noModel)).toContainEqual(expect.stringMatching(/^model/));
    const t = s.tasks.t!;
    const bad = { ...s, tasks: { t: { ...t, fault_counts: { ...t.fault_counts, failures: 5 } } } };
    expect(validateSummary(bad)).toContainEqual(expect.stringMatching(/^tasks\.t\.fault_counts/));
  });
  // verifier-phase-P17i-JG7-1 F3: an INFRA attempt the batch settled after its reruns ran out was
  // not run again, so it is not an infra re-run; the re-queued attempts are.
  it('infra_reruns counts the re-queued attempts only', () => {
    const settledInfra = trial(11, 'INFRA_API');
    const s2 = summarize({ run_id: 'r', trials: [...TRIALS, settledInfra], requeued: REQUEUED, replay: null, audit: AUDIT });
    expect(s2.tasks.t!.fault_counts.infra_reruns).toBe(1);
  });
});
