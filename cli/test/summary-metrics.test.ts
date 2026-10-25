// The summary metrics beside k/n (plan phase P17i C2, R14-15): on a run of four attempts at one
// task (a PASS at score 0.8 with a met -8 item, a LIMIT cost, a FAIL whose raw score is -0.2,
// and a re-queued INFRA_API attempt) summary prints and writes mean_score, the raw unclipped
// mean, the mean fraction of gates met, pass_no_harm, LIMIT counts by kind, re-queued counts by
// outcome and the rate that counts INFRA and ENV_ERROR attempts as failures; k/n and Wilson 95%
// are those of the 3 valid trials, as before.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../packages/core/anthropic.ts';
import { assertSummary, rawScore, wilson } from '../../packages/core/summary.ts';
import { score } from '../../packages/grader/grade.ts';
import { main as summary } from '../summary.ts';
import { tempDir } from '../../scripts/test/helpers.ts';

const TASK = 't-gamma';
const gate = (id: string, met: boolean) => ({ id, kind: 'gate', method: 'deterministic', category: 'safety', points: null, met, evidence: {} });
const item = (id: string, points: number, met: boolean) => ({ id, kind: 'rubric', method: 'deterministic', category: 'documentation', points, met, evidence: {} });
// Positive points 40; H1 is the -8 harm item.
const checks = (gates: number, r1: boolean, r2: boolean, h1: boolean) => [
  ...['G1', 'G2', 'G3', 'G4'].map((id, i) => gate(id, i < gates)),
  item('R1', 20, r1), item('R2', 20, r2), item('H1', -8, h1),
];

function record(index: number, outcome: string, over: Record<string, unknown>): Record<string, unknown> {
  const valid = ['PASS', 'FAIL', 'LIMIT', 'REFUSAL'].includes(outcome);
  return {
    trial_id: `run:fx:${TASK}/${index}`, run_id: 'metrics-1', task_id: TASK, task_version: 'v-gamma', env_version: 'e-gamma', grader_task_version: 'g-gamma', index, attempt: 'a-1', mode: 'live',
    model_requested: MODEL, models_returned: [MODEL], effort: 'high', status: 'COMPLETED', detail: null, outcome, valid, cost_usd: 0.4, judge_cost_usd: 0, turns: 2, tool_calls: 2,
    tool_errors: { INTERNAL: 0 }, state_hash: { initial: 'h-initial', final: 'h-final', replay_final: 'h-final' }, settled: true, trajectory: `trajectories/${TASK}/${index}.jsonl`,
    ...over,
  };
}

function writeRun(dir: string): void {
  const put = (rel: string, x: unknown) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), `${JSON.stringify(x, null, 2)}\n`);
  };
  put(`trials/${TASK}/0.json`, record(0, 'PASS', { score: 0.8, checks: checks(4, true, true, true) }));
  put(`trials/${TASK}/1.json`, record(1, 'LIMIT', { status: 'LIMIT', detail: 'cost', score: 0, checks: checks(0, false, false, false) }));
  put(`trials/${TASK}/2.json`, record(2, 'FAIL', { score: 0, checks: checks(3, false, false, true) }));
  put(`requeued/${TASK}/3.a-0.json`, record(3, 'INFRA_API', { status: 'INFRA_API', detail: 'overloaded_error', attempt: 'a-0', settled: false, requeue_reason: 'INFRA_API', score: null, checks: [] }));
  put('manifest.json', { run_id: 'metrics-1', model: MODEL, effort: 'high', mode: 'live', trials: 3, world_hash: 'h-initial', task_versions: { [TASK]: 'v-gamma' }, batches: [] });
}

async function cli(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await summary(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('summary metrics beside k/n', () => {
  it('writes each metric with its denominator for the four-attempt fixture', async () => {
    const dir = tempDir('summary-metrics');
    writeRun(dir);
    const r = await cli([dir, '--json']);
    expect(r.code, r.err).toBe(0);
    const s = JSON.parse(r.out);
    expect(() => assertSummary(s)).not.toThrow();
    const t = s.tasks[TASK];
    // The primary metric is unchanged: 1 pass of 3 valid trials, Wilson 95% over the same.
    expect(t).toMatchObject({ trials: 3, passes: 1, requeued: 1 });
    expect(t.wilson95).toEqual(wilson(1, 3));
    expect(t.mean_score).toBeCloseTo(0.266667, 6);
    expect(t.raw_mean_score).toBeCloseTo(0.2, 6);
    expect(t.gate_fraction).toBeCloseTo(0.583333, 6);
    expect(t).toMatchObject({ pass_no_harm: 0, pass_no_harm_rate: 0 });
    expect(t.limits).toEqual({ turns: 0, cost: 1, wall_clock: 0, max_tokens: 0 });
    expect(t.requeued_outcomes).toEqual({ INFRA_API: 1 });
    // Passes over the valid trials plus the INFRA and ENV_ERROR attempts: 1/4.
    expect(t).toMatchObject({ infra_counted_attempts: 4, infra_counted_rate: 0.25, metric_trials: { mean_score: 3, raw_mean_score: 3, gate_fraction: 3 } });
  });

  it('prints the metrics on a line under the k/n line', async () => {
    const dir = tempDir('summary-metrics-print');
    writeRun(dir);
    const r = await cli([dir]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/t-gamma\s+1\/3\s+Wilson 95% 6\.1%-79\.2%/);
    expect(r.out).toContain('mean score 0.266667 (3 valid)  raw mean 0.200000 (3)  gates met 0.583333 (3)  pass_no_harm 0/3');
    expect(r.out).toContain('LIMIT turns 0, cost 1, wall_clock 0, max_tokens 0  re-queued INFRA_API 1  infra-counted 1/4 (0.250000)');
  });

  it('rawScore is the grader score before clipping', () => {
    const fail = checks(3, false, false, true) as Parameters<typeof score>[0];
    expect(rawScore(fail)).toBeCloseTo(-0.2, 10);
    expect(score(fail)).toBe(0);
    const pass = checks(4, true, true, true) as Parameters<typeof score>[0];
    expect(rawScore(pass)).toBeCloseTo(0.8, 10);
    expect(score(pass)).toBeCloseTo(0.8, 10);
  });
});
