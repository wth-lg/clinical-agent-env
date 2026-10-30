// Run directories for the context-budget tests, written into a temp dir at test time: each trial
// has T requests whose per-request context is exactly C0 + g x i (i = 0..T-1) and o output tokens,
// so its peak is C0 + g x (T - 1), and its record's cost_usd is the quadratic model's cost, so
// the fitted median equals the observed one; costScale multiplies the recorded cost, to make a fit
// miss. Working time is msPerRequest x T.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface QuadTrial {
  T: number;
  C0: number;
  g: number;
  o: number;
}

// The plan's cost model (plan-amendment-worklist.md "Cost model and sizing"), written out here
// independently of cli/context-budget.ts so the tests check it rather than copy it.
export function quadCost(t: QuadTrial): number {
  const read = t.T * t.C0 + (t.g * t.T * (t.T - 1)) / 2;
  const write = t.C0 + t.g * (t.T - 1);
  return 0.2e-6 * read + 5e-6 * write + 20e-6 * t.o * t.T;
}

const START = Date.parse('2026-10-30T06:00:00.000Z');

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function writeQuadRun(dir: string, tasks: Record<string, QuadTrial[]>, msPerRequest = 10_000, costScale = 1): void {
  for (const [task, trials] of Object.entries(tasks)) {
    trials.forEach((t, index) => {
      const lines: string[] = [];
      for (let i = 0; i < t.T; i++) {
        const usage = { input_tokens: 0, cache_creation_input_tokens: i === 0 ? t.C0 : t.g, cache_read_input_tokens: i === 0 ? 0 : t.C0 + t.g * (i - 1), output_tokens: t.o };
        lines.push(JSON.stringify({ v: 2, seq: 2 * i + 1, type: 'request', turn: i + 1 }));
        lines.push(JSON.stringify({ v: 2, seq: 2 * i + 2, type: 'response', turn: i + 1, stop_reason: i === t.T - 1 ? 'end_turn' : 'tool_use', usage, cost_usd: null }));
      }
      const trajectory = `trajectories/${task}/${index}.jsonl`;
      put(join(dir, trajectory), lines.join('\n') + '\n');
      const record = {
        trial_id: `run:fixture:${task}/${index}`, task_id: task, task_version: `tv-${task}`, env_version: `ev-${task}`, index, turns: t.T,
        started: new Date(START).toISOString(), ended: new Date(START + msPerRequest * t.T).toISOString(), retry_wait_ms: 0,
        cost_usd: quadCost(t) * costScale, judge_cost_usd: 0, status: 'COMPLETED', outcome: 'PASS', valid: true, settled: true, trajectory,
      };
      put(join(dir, 'trials', task, `${index}.json`), JSON.stringify(record, null, 2) + '\n');
    });
  }
}
