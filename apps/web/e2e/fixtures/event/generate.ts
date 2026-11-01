// Writes the committed run the trial arrival spec (e2e/trial-arrival.spec.ts, PW4-E1) builds
// against, RESULTS_ROOT=apps/web/e2e/fixtures/event:
//   results/official.json                     {"run": "runs/event-1"}
//   results/runs/event-1/trials/_toy/0.json, trajectories/_toy/0.jsonl, summary.json
//   results/runs/event-1/manifest.json      the run manifest a batch writes (packages/core/batch.ts
//                                           RunManifest, no batches), so M1 reads reachability
//   results/runs/event-1/matrix.json        written by `pnpm cli matrix --task _toy --out <run>`
// The one trial is a real scripted run through run() of the toy's alternative
// event_handled_inbox_closed (tasks/_toy/tests/alternatives.ts): opening problem cond-00002 fires
// the toy's two events (tasks/_toy/events.ts), so the trajectory holds two env_event lines; the
// agent reads both arrivals, cites the final result in its note and completes that result's inbox
// item. It is graded from the toy's canned judge cache, so its trajectory replays to the record's
// final hash. The clock is fixed and the cost synthetic, so a rerun writes the same bytes.
//   node apps/web/e2e/fixtures/event/generate.ts
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMatrixTask, matrixEnv } from '../../../../../cli/matrix.ts';
import type { RunManifest } from '../../../../../packages/core/batch.ts';
import { assertSummary, summarize, type SummaryTrial } from '../../../../../packages/core/summary.ts';
import { toJsonl } from '../../../../../packages/core/trajectory.ts';
import { gradeRun, selectCases, trial } from '../../../../../packages/grader/matrix/matrix.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../../../..');
export const RUN_ID = 'event-1';
export const TASK = '_toy';
export const CASE = 'event_handled_inbox_closed';
// The trial's name in the run, <task>/<index>.
export const TRIAL = `${TASK}/0`;
const T0 = Date.parse('2026-10-23T12:00:00Z');

const write = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

async function main() {
  rmSync(join(HERE, 'results'), { recursive: true, force: true });
  let tick = 0;
  const env = { ...matrixEnv(), now: () => T0 + 1000 * tick++ };
  const task = await loadMatrixTask(TASK);
  const run = await trial(env, task, selectCases(task, [CASE])[0]!);
  const grade = await gradeRun(env, task, task.checks, run);
  if (grade.outcome !== 'PASS') throw new Error(`${CASE} graded ${grade.outcome}, not PASS`);
  const fired = run.events.filter((e) => e.type === 'env_event').length;
  if (fired !== 2) throw new Error(`${CASE} fired ${fired} events, not 2`);
  const dir = join(HERE, 'results/runs', RUN_ID);
  const trajectory = `trajectories/${TRIAL}.jsonl`;
  const rec = { ...run.record, ...grade, trial_id: `${RUN_ID}:${TASK}:0`, index: 0, trajectory, cost_usd: 0.5, judge_cost_usd: 0 };
  write(join(dir, 'trials', `${TRIAL}.json`), `${JSON.stringify(rec, null, 2)}\n`);
  write(join(dir, trajectory), toJsonl(run.events));
  const summary = summarize({ run_id: RUN_ID, trials: [rec as unknown as SummaryTrial], requeued: [], replay: null, mode: 'mock-sample', expected: { tasks: [TASK], from: 'generate.ts' }, audit: null });
  assertSummary(summary);
  write(join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const versions = (k: 'task_version' | 'env_version' | 'grader_task_version') => ({ [TASK]: rec[k] ?? (() => { throw new Error(`the record has no ${k}`); })() });
  const manifest: RunManifest = {
    run_id: RUN_ID, model: rec.model_requested, effort: rec.effort, mode: 'mock-sample', world_hash: env.worldHash, api_version: rec.api_version, trials: 1,
    task_versions: versions('task_version'), env_versions: versions('env_version'), grader_task_versions: versions('grader_task_version'), batches: [],
  };
  write(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  write(join(HERE, 'results/official.json'), `${JSON.stringify({ run: `runs/${RUN_ID}` })}\n`);
  const m = spawnSync('node', ['cli/index.ts', 'matrix', '--task', TASK, '--out', dir], { cwd: REPO, encoding: 'utf8' });
  if (m.status !== 0) throw new Error(`pnpm cli matrix --task ${TASK} failed:\n${m.stdout}${m.stderr}`);
  console.log(`wrote ${RUN_ID} ${TRIAL} (${CASE}): ${grade.outcome}, ${fired} env_event lines`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
