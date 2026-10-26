// pass^k beside k/n (plan phase P17j JG6, pre-audit S8): the chance that k trials drawn without
// replacement from a task's n valid trials all pass, C(c,k) / C(n,k) for c passes, for k = 1, 3
// and 5, null when n < k. On a run of three tasks (14 of 20, 3 of 5 and 1 of 2 valid trials
// passing) summary writes and prints pass^1, pass^3 and pass^5; k/n and Wilson 95% stay as they were.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../packages/core/anthropic.ts';
import { assertSummary, passK, wilson } from '../../packages/core/summary.ts';
import { main as summary } from '../summary.ts';
import { tempDir } from '../../scripts/test/helpers.ts';

const RUN: Record<string, { n: number; passes: number }> = { 't-alpha': { n: 20, passes: 14 }, 't-beta': { n: 5, passes: 3 }, 't-gamma': { n: 2, passes: 1 } };

function record(task: string, index: number, outcome: 'PASS' | 'FAIL'): Record<string, unknown> {
  return {
    trial_id: `run:fx:${task}/${index}`, run_id: 'passk-1', task_id: task, task_version: `v-${task}`, env_version: `e-${task}`, grader_task_version: `g-${task}`, index, attempt: 'a-1', mode: 'live',
    model_requested: MODEL, models_returned: [MODEL], effort: 'high', status: 'COMPLETED', detail: null, outcome, valid: true, score: outcome === 'PASS' ? 1 : 0, cost_usd: 0.4, judge_cost_usd: 0,
    turns: 2, tool_calls: 2, tool_errors: { INTERNAL: 0 }, state_hash: { initial: 'h-initial', final: 'h-final', replay_final: 'h-final' }, settled: true, trajectory: `trajectories/${task}/${index}.jsonl`,
  };
}

function writeRun(dir: string): void {
  const put = (rel: string, x: unknown) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), `${JSON.stringify(x, null, 2)}\n`);
  };
  for (const [task, { n, passes }] of Object.entries(RUN)) for (let i = 0; i < n; i++) put(`trials/${task}/${i}.json`, record(task, i, i < passes ? 'PASS' : 'FAIL'));
  const tasks = Object.keys(RUN);
  put('manifest.json', { run_id: 'passk-1', model: MODEL, effort: 'high', mode: 'live', trials: 20, world_hash: 'h-initial', task_versions: Object.fromEntries(tasks.map((t) => [t, `v-${t}`])), batches: [] });
}

async function cli(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await summary(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('pass^k', () => {
  it('is C(c,k) / C(n,k), and null when n < k', () => {
    expect(passK(14, 20, 1)).toBeCloseTo(0.7, 12);
    expect(passK(14, 20, 3)).toBeCloseTo(364 / 1140, 12);
    expect(passK(14, 20, 5)).toBeCloseTo(2002 / 15504, 12);
    expect(passK(3, 5, 5)).toBe(0);
    expect(passK(2, 2, 3)).toBeNull();
    expect(passK(0, 0, 1)).toBeNull();
  });

  it('summary writes pass^1, pass^3 and pass^5 per task, k/n and Wilson unchanged', async () => {
    const dir = tempDir('summary-passk');
    writeRun(dir);
    const r = await cli([dir, '--json']);
    expect(r.code, r.err).toBe(0);
    const s = JSON.parse(r.out);
    assertSummary(s);
    const round = (x: number | null) => (x === null ? null : Number(x.toFixed(6)));
    const got = (task: string) => Object.fromEntries(Object.entries(s.tasks[task]!.pass_k as Record<string, number | null>).map(([k, v]) => [k, round(v)]));
    expect(got('t-alpha')).toEqual({ 1: 0.7, 3: 0.319298, 5: 0.129128 });
    expect(got('t-beta')).toEqual({ 1: 0.6, 3: 0.1, 5: 0 });
    expect(got('t-gamma')).toEqual({ 1: 0.5, 3: null, 5: null });
    for (const [task, { n, passes }] of Object.entries(RUN)) {
      expect([s.tasks[task]!.passes, s.tasks[task]!.trials]).toEqual([passes, n]);
      expect(s.tasks[task]!.wilson95).toEqual(wilson(passes, n));
    }
  });

  it('prints pass^1, pass^3 and pass^5 on each task line', async () => {
    const dir = tempDir('summary-passk-print');
    writeRun(dir);
    const r = await cli([dir]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/^t-alpha +14\/20 .*$\n.*pass\^1 0\.700000 pass\^3 0\.319298 pass\^5 0\.129128/m);
    expect(r.out).toMatch(/pass\^1 0\.600000 pass\^3 0\.100000 pass\^5 0\.000000/);
    expect(r.out).toMatch(/pass\^1 0\.500000 pass\^3 n\/a pass\^5 n\/a/);
  });
});
