// The trial arrival fixture (generate.ts writes it), read in Node: the one record, its trajectory's
// env_event lines, and the base URL of a build of it.
import { mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../sample-results/sample.ts';
import { RUN_ID, TRIAL } from './generate.ts';

export { RUN_ID, TRIAL };
export const ROOT = fileURLToPath(new URL('./', import.meta.url));
const RUN = join(ROOT, 'results/runs', RUN_ID);
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
export const record = JSON.parse(readFileSync(join(RUN, 'trials', `${TRIAL}.json`), 'utf8')) as { outcome: string; trajectory: string };
export const arrivals = readFileSync(join(RUN, record.trajectory), 'utf8').split('\n').filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { type: string; spec?: string; keys?: string[] })
  .filter((e) => e.type === 'env_event') as Array<{ spec: string; keys: string[] }>;

// The served build when it holds this run, else a build into a temp directory with its own vite
// preview, once per worker process.
let served: Promise<string> | undefined;
export function eventBase(baseURL: string): Promise<string> {
  return (served ??= (async () => {
    const json = (path: string) => fetch(new URL(path, baseURL)).then((r) => r.json() as Promise<unknown>).catch(() => null);
    const files = ((await json('data/index.json')) as { files?: string[] } | null)?.files ?? [];
    if (files.includes(`results/runs/${RUN_ID}/summary.json`)) return baseURL;
    const web = join(REPO, 'apps/web');
    const out = mkdtempSync(join(tmpdir(), 'clinenv-event-build-'));
    const b = spawnSync(join(web, 'node_modules/.bin/vite'), ['build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: web, encoding: 'utf8', env: { ...process.env, RESULTS_ROOT: ROOT } });
    if (b.status !== 0) throw new Error(`event fixture build failed: ${b.stdout}${b.stderr}`);
    return serve(out);
  })());
}
