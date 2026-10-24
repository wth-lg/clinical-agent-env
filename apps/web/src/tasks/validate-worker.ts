// Grader validation in a module Worker, with no key and no network but same-origin fetches: the
// oracle (as `pnpm cli oracle` runs it: one run, one grade), the whole matrix (as `pnpm cli
// matrix` runs it, without the two Node-only checks, the fresh-process isolation grade and
// policy.ts's import graph), and replay of a published run's trials (as `pnpm cli replay`
// does: the tool log against a fresh store, the final hash and the grade compared with the
// record's current grade).
import { browserNow } from '../adapters/clock-browser.ts';
import { browserTaskSource } from '../adapters/tasks-browser.ts';
import { gradeTrajectory, type GradeTrajectoryOptions } from '../../../../packages/core/run.ts';
import { RERUN_OUTCOMES } from '../../../../packages/core/outcomes.ts';
import { currentGrade } from '../../../../packages/core/summary.ts';
import { taskVersions } from '../../../../packages/core/tasks.ts';
import { parseTrajectory } from '../../../../packages/core/trajectory.ts';
import { runCases, runMatrix, selectCases, type MatrixEnv } from '../../../../packages/grader/matrix/matrix.ts';
import { MANIFEST, worldDefinitions, worldSource } from '../data/world.ts';
import { loadMatrixTask, taskChecks } from './matrix-task.ts';
import type { OracleResult, ReplayRow, ValidateReply, ValidateRequest } from './validate-protocol.ts';

let env: Promise<MatrixEnv> | undefined;
const matrixEnv = () =>
  (env ??= worldDefinitions().then((definitions): MatrixEnv => ({
    tasks: browserTaskSource({ testMode: false }),
    world: worldSource(),
    worldHash: MANIFEST.world.state_hash,
    definitions: definitions as NonNullable<MatrixEnv['definitions']>,
    now: browserNow,
  })));

async function oracle(id: string): Promise<OracleResult> {
  const task = await loadMatrixTask(id);
  if (task.oracle === null) return { outcome: null, score: null, unknown: 0, misses: [], problems: ['no oracle (solution/solve.ts)'] };
  const [r] = await runCases(await matrixEnv(), task, selectCases(task, ['oracle']), { trials: 1, regrades: 1 });
  return { outcome: r!.grade.outcome, score: r!.grade.score, unknown: r!.unknown, misses: r!.misses.map((m) => `${m.check} ${m.key}`), problems: r!.problems };
}

async function matrix(id: string) {
  const task = await loadMatrixTask(id);
  const result = await runMatrix(await matrixEnv(), task);
  const probes = result.results.map((r) => ({ kind: r.case.kind, id: r.case.id, outcome: r.grade.outcome, as_expected: r.problems.length === 0, failed_checks: r.failed_gates }));
  return { pass: result.pass, lines: result.lines, probes };
}

async function replay(id: string, trials: ValidateRequest & { op: 'replay' }): Promise<ReplayRow[]> {
  const e = await matrixEnv();
  const task = await e.tasks.get(id);
  const { env_version } = await taskVersions(task, e.worldHash);
  const checks = await taskChecks(id);
  const rows: ReplayRow[] = [];
  for (const t of trials.trials) {
    const r = t.record;
    const base = { name: t.name, final: r.state_hash.final, recorded: currentGrade(r).outcome };
    // An excluded outcome that is rerun (INFRA, CANCELLED, INVALID, ENV_ERROR) is not graded, so
    // there is nothing to compare; a GRADER_ERROR is, and replays.
    if (r.state_hash.final === null || (RERUN_OUTCOMES as readonly string[]).includes(r.outcome)) {
      rows.push({ ...base, status: 'skipped', regraded: null, message: r.state_hash.final === null ? 'no final state to replay (the trial did not finish)' : `${r.outcome} is excluded and rerun, not graded` });
      continue;
    }
    if (r.env_version && r.env_version !== env_version) {
      rows.push({ ...base, status: 'env-changed', regraded: null, message: `environment changed: run at env_version ${r.env_version.slice(0, 12)}, this build at ${env_version.slice(0, 12)}` });
      continue;
    }
    const res = await fetch(t.trajectoryUrl);
    if (!res.ok) {
      rows.push({ ...base, status: 'error', regraded: null, message: `trajectory: HTTP ${res.status}` });
      continue;
    }
    try {
      const g = await gradeTrajectory(id, { tasks: e.tasks, world: e.world, checks, events: parseTrajectory(await res.text()), record: r as unknown as GradeTrajectoryOptions['record'], ...(e.definitions ? { definitions: e.definitions } : {}) });
      const hashMiss = g.outcome === 'GRADER_ERROR' && g.error?.check === null && g.error.message.startsWith('regrade:');
      rows.push({ ...base, status: hashMiss ? 'hash-differs' : 'reproduced', regraded: g.outcome, message: hashMiss ? g.error!.message : `replayed state hash equals the record's final ${r.state_hash.final}` });
    } catch (err) {
      rows.push({ ...base, status: 'error', regraded: null, message: (err as Error).message });
    }
  }
  return rows;
}

async function handle(req: ValidateRequest): Promise<unknown> {
  if (req.op === 'oracle') return oracle(req.task);
  if (req.op === 'matrix') return matrix(req.task);
  return replay(req.task, req);
}

addEventListener('message', (ev: MessageEvent<{ id: number; req: ValidateRequest }>) => {
  const { id, req } = ev.data;
  handle(req).then(
    (result) => postMessage({ id, ok: true, result } satisfies ValidateReply),
    (e: unknown) => postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) } satisfies ValidateReply),
  );
});
