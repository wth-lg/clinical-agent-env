// The committed sample run the browse and Findings specs check the built UI against
// (fixtures/sample-results, built with RESULTS_ROOT pointed there), read in Node: its summary,
// records, audit rows and matrix.json, each record's explainTrial, and the six task ids.
import { execFile, spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explainContext } from '../../../../../cli/audit-check.ts';
import { explainContext as contextOf } from '../../../../../packages/core/explain-context.ts';
import { explainTrial, formatCriterion, type AuditRow, type CheckText, type ExplainRecord, type Explanation } from '../../../../../packages/core/explain.ts';
import { checkText as contrast } from '../../../../../tasks/contrast-ct-prep.check-text.ts';
import { checkText as crc } from '../../../../../tasks/crc-care-gap.check-text.ts';
import { checkText as medrec } from '../../../../../tasks/discharge-medrec.check-text.ts';
import { checkText as queue } from '../../../../../tasks/message-queue.check-text.ts';
import { checkText as renal } from '../../../../../tasks/renal-dose-review.check-text.ts';
import { checkText as inbox } from '../../../../../tasks/results-inbox.check-text.ts';
import type { ReplayVerdict } from '../../../../../packages/core/replay.ts';
import { trialName, type Summary } from '../../../../../packages/core/summary.ts';
import { taskVersions } from '../../../../../packages/core/tasks.ts';
import { parseTrajectory } from '../../../../../packages/core/trajectory.ts';
import { nodeTaskSource } from '../../../../../cli/adapters/tasks-node.ts';

export const SAMPLE = fileURLToPath(new URL('./', import.meta.url));
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
export const RUN_DIR = join(SAMPLE, 'results', (JSON.parse(readFileSync(join(SAMPLE, 'results/official.json'), 'utf8')) as { run: string }).run);
export const MANIFEST_HASH = (JSON.parse(readFileSync(join(REPO, 'fixtures/manifest.json'), 'utf8')) as { world: { state_hash: string } }).world.state_hash;
export const summary = JSON.parse(readFileSync(join(RUN_DIR, 'summary.json'), 'utf8')) as Summary;

export type SampleRecord = ExplainRecord & { task_id: string; index: number; trajectory: string; grader_task_version: string | null };
export const audit: AuditRow[] = readFileSync(join(RUN_DIR, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as AuditRow);

export const records: SampleRecord[] = readdirSync(join(RUN_DIR, 'trials'), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.json'))
  .map((e) => JSON.parse(readFileSync(join(e.parentPath, e.name), 'utf8')) as SampleRecord);

// Each task's check text (tasks/<id>.check-text.ts), as the Runs view and audit-check pass it.
export const CHECK_TEXT: Readonly<Record<string, CheckText>> = {
  'contrast-ct-prep': contrast, 'crc-care-gap': crc, 'discharge-medrec': medrec, 'message-queue': queue, 'renal-dose-review': renal, 'results-inbox': inbox,
};

// The run's manifest.json; the sample run has none, so M3 is pending.
const RUN_MANIFEST: unknown = existsSync(join(RUN_DIR, 'manifest.json')) ? JSON.parse(readFileSync(join(RUN_DIR, 'manifest.json'), 'utf8')) : null;

// The list row's explanation, as the Runs view builds it (packages/core/explain-context.ts, with
// the run's manifest and matrix.json): explainTrial reads the trajectory only for a REFUSAL's or LIMIT's sentence.
export function explain(r: SampleRecord): Explanation {
  const row = audit.find((a) => a.trial === trialName(r)) ?? null;
  const events = r.outcome === 'REFUSAL' || r.outcome === 'LIMIT' ? parseTrajectory(readFileSync(join(RUN_DIR, r.trajectory), 'utf8')) : [];
  return explainTrial(r, row, contextOf({ record: r, events, manifest: RUN_MANIFEST, matrix: matrixJson, text: CHECK_TEXT[r.task_id] ?? null }));
}

// audit-check's M1-M5 for every record of the sample run (cli/audit-check.ts explainContext, then
// explainTrial), joined as the trial detail's data-criteria joins them.
export async function cliCriteria(): Promise<Record<string, string>> {
  const ctxOf = await explainContext(RUN_DIR);
  const out: Record<string, string> = {};
  for (const r of records) {
    const { criteria: _criteria, ...row } = audit.find((a) => a.trial === trialName(r)) ?? ({} as AuditRow);
    out[trialName(r)] = explainTrial(r, 'trial' in row ? row : undefined, await ctxOf(r as never)).criteria.map(formatCriterion).join(', ');
  }
  return out;
}

export const TASK_IDS = readdirSync(join(REPO, 'tasks'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(REPO, 'tasks', d.name, 'task.toml')))
  .map((d) => d.name)
  .sort();

export interface MatrixEntry {
  task_id: string;
  pass: boolean;
  probes: Array<{ kind: string; id: string; outcome: string; as_expected: boolean; failed_checks: string[] }>;
}
// `pnpm cli matrix --task <id> --out <run>` wrote it (generate.ts --matrix), keyed by
// grader_task_version: the entry for the task as it is now, so a stale matrix.json fails. Each
// probe keeps the fields browse.spec.ts reads from the page (matrix.json also records reachable_ids).
const matrixJson = JSON.parse(readFileSync(join(RUN_DIR, 'matrix.json'), 'utf8')) as { grader_task_versions: Record<string, MatrixEntry> };
export async function cliMatrix(id: string): Promise<MatrixEntry> {
  const task = await nodeTaskSource({ testMode: false }).get(id);
  const { grader_task_version } = await taskVersions(task, MANIFEST_HASH);
  const entry = matrixJson.grader_task_versions[grader_task_version];
  if (entry === undefined || entry.task_id !== id) throw new Error(`matrix.json has no entry for ${id} at grader_task_version ${grader_task_version}; rerun node apps/web/e2e/fixtures/sample-results/generate.ts --matrix`);
  return { ...entry, probes: entry.probes.map(({ kind, id, outcome, as_expected, failed_checks }) => ({ kind, id, outcome, as_expected, failed_checks })) };
}

// `pnpm cli replay --json` over one task's trials of the sample run: a copy holding only that
// task's records and trajectories (replay writes replay.json into the run, and the whole run takes
// minutes), so each task's spec compares the browser's verdicts with the CLI's.
export async function cliReplay(id: string): Promise<Record<string, ReplayVerdict>> {
  const dir = join(mkdtempSync(join(tmpdir(), 'clinenv-replay-')), 'run');
  for (const d of ['trials', 'trajectories']) cpSync(join(RUN_DIR, d, id), join(dir, d, id), { recursive: true });
  const stdout = await new Promise<string>((resolve, reject) =>
    execFile(process.execPath, [join(REPO, 'cli/index.ts'), 'replay', dir, '--json'], { cwd: REPO, maxBuffer: 1 << 24 }, (err, out, errOut) =>
      // Exit 1 means a trial does not match, which the caller compares; anything else failed.
      err && err.code !== 1 ? reject(new Error(`cli replay ${id}: ${err.message}\n${errOut}`)) : resolve(out)));
  return (JSON.parse(stdout) as { trials: Record<string, ReplayVerdict> }).trials;
}

// The base URL of a build of this sample. The gate builds it (RESULTS_ROOT pointed here) and the
// Playwright config serves it, so that one is used when it serves this run; otherwise (CI's
// `pnpm build` holds no results) the sample is built into a temp directory once per worker
// process and served by its own vite preview, killed when the process exits.
let served: Promise<string> | undefined;
export function sampleBase(baseURL: string): Promise<string> {
  return (served ??= (async () => {
    // vite preview answers a missing file with index.html, so data/index.json says what is there.
    const json = (path: string) => fetch(new URL(path, baseURL)).then((r) => r.json() as Promise<unknown>).catch(() => null);
    const files = ((await json('data/index.json')) as { files?: string[] } | null)?.files ?? [];
    const run = files.includes('results/official.json') ? ((await json('data/results/official.json')) as { run: string }).run : null;
    if (run !== null && ((await json(`data/results/${run}/summary.json`)) as { run_id?: string } | null)?.run_id === summary.run_id) return baseURL;
    const web = join(REPO, 'apps/web');
    const out = mkdtempSync(join(tmpdir(), 'clinenv-sample-build-'));
    const b = spawnSync(join(web, 'node_modules/.bin/vite'), ['build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: web, encoding: 'utf8', env: { ...process.env, RESULTS_ROOT: SAMPLE } });
    if (b.status !== 0) throw new Error(`sample build failed: ${b.stdout}${b.stderr}`);
    return serve(out);
  })());
}

export async function serve(outDir: string): Promise<string> {
  const port = await new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port: p } = srv.address() as { port: number };
      srv.close(() => resolve(p));
    });
  });
  // One explicit host for the listener and the probe: in the CI image `localhost` resolves to ::1
  // first, so vite preview listened there while fetch tried 127.0.0.1 and was refused.
  const base = `http://127.0.0.1:${port}/clinical-agent-env/`;
  const child = spawn(join(REPO, 'apps/web/node_modules/.bin/vite'), ['preview', '--outDir', outDir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: join(REPO, 'apps/web'), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (b: Buffer) => (log += b.toString()));
  child.stderr.on('data', (b: Buffer) => (log += b.toString()));
  let exited: string | null = null;
  child.once('exit', (code, signal) => (exited = `exited with ${code ?? signal}`));
  process.once('exit', () => child.kill());
  let last = '';
  for (let i = 0; i < 200 && exited === null; i++) {
    if (await fetch(base).then((r) => r.ok, (e: unknown) => ((last = String((e as { cause?: unknown }).cause ?? e)), false))) return base;
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error(`vite preview of ${outDir} did not start (${exited ?? 'still running'}); last fetch of ${base}: ${last}\n${log}`);
}
