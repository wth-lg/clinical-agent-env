// The committed trials the trial detail spec checks the built UI against (generate.ts writes
// them), read in Node: each record, its audit row, and its explanation as cli/audit-check.ts
// gives it (the one explanation context the trial page uses too, packages/core/explain-context.ts).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explainContext } from '../../../../../cli/audit-check.ts';
import { explainTrial, type AuditRow, type Explanation } from '../../../../../packages/core/explain.ts';
import { trialName, type Summary } from '../../../../../packages/core/summary.ts';
import { serve, type SampleRecord } from '../sample-results/sample.ts';
import { PILOT_ERROR_ID, RUN_ID, TRIALS } from './generate.ts';

export { PILOT_ERROR_ID, RUN_ID, TRIALS };
export const ROOT = fileURLToPath(new URL('./', import.meta.url));
export const RUN_DIR = join(ROOT, 'results/runs', RUN_ID);
// The GRADER_ERROR exemplar lives in its own pilot run (generate.ts); every other trial in trial-1.
const PILOT_ERROR_DIR = join(ROOT, 'results', PILOT_ERROR_ID);
export const runOf = (name: string): string => (name === TRIALS.graderError ? PILOT_ERROR_ID : RUN_ID);
const dirOf = (name: string): string => (name === TRIALS.graderError ? PILOT_ERROR_DIR : RUN_DIR);
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));

export type TrialFixture = Omit<SampleRecord, 'checks' | 'attribution'> & {
  checks: Array<{ id: string; kind: string; method: string; points: number | null; met: unknown; evidence: Record<string, unknown>; ids?: string[] }> | null;
  attribution?: { auto: string; first_failed: string | null; decisive_step: number | null; exposure: Array<{ id: string; first_exposed_step: number | null }>; items?: Array<{ item: string; gate: string; auto: string }> } | null;
};

export const summary = JSON.parse(readFileSync(join(RUN_DIR, 'summary.json'), 'utf8')) as Summary;
export const audit: AuditRow[] = readFileSync(join(RUN_DIR, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as AuditRow);
export const records: TrialFixture[] = readdirSync(join(RUN_DIR, 'trials'), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.json'))
  .map((e) => JSON.parse(readFileSync(join(e.parentPath, e.name), 'utf8')) as TrialFixture);
const read = (dir: string): TrialFixture[] => readdirSync(join(dir, 'trials'), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.json'))
  .map((e) => JSON.parse(readFileSync(join(e.parentPath, e.name), 'utf8')) as TrialFixture);
const pilotRecords = read(PILOT_ERROR_DIR);
export const record = (name: string): TrialFixture => (name === TRIALS.graderError ? pilotRecords : records).find((r) => trialName(r) === name)!;
export const auditOf = (name: string): AuditRow | null => audit.find((a) => a.trial === name) ?? null;
export const hasTrajectory = (name: string): boolean => existsSync(join(dirOf(name), record(name).trajectory));

// explainTrial(record, audit) with audit-check's context.
const ctx = new Map<string, ReturnType<typeof explainContext>>();
export async function explain(name: string): Promise<Explanation> {
  const dir = dirOf(name);
  if (!ctx.has(dir)) ctx.set(dir, explainContext(dir));
  const of = await ctx.get(dir)!;
  return explainTrial(record(name), dir === RUN_DIR ? auditOf(name) : null, await of(record(name) as never));
}

// The base URL of a build of these fixtures: the served build when it holds this run, else a
// build into a temp directory with its own vite preview, once per worker process.
let served: Promise<string> | undefined;
export function trialBase(baseURL: string): Promise<string> {
  return (served ??= (async () => {
    const json = (path: string) => fetch(new URL(path, baseURL)).then((r) => r.json() as Promise<unknown>).catch(() => null);
    const files = ((await json('data/index.json')) as { files?: string[] } | null)?.files ?? [];
    if (files.includes(`results/runs/${RUN_ID}/summary.json`)) return baseURL;
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { spawnSync } = await import('node:child_process');
    const web = join(REPO, 'apps/web');
    const out = mkdtempSync(join(tmpdir(), 'clinenv-trial-build-'));
    const b = spawnSync(join(web, 'node_modules/.bin/vite'), ['build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: web, encoding: 'utf8', env: { ...process.env, RESULTS_ROOT: ROOT } });
    if (b.status !== 0) throw new Error(`trial fixture build failed: ${b.stdout}${b.stderr}`);
    return serve(out);
  })());
}
