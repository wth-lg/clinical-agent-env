// The band verdict fixture (generate.ts writes it), read in Node: the official run's summary.json,
// and the base URL of a build of it.
import { mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Summary } from '../../../../../packages/core/summary.ts';
import { serve } from '../sample-results/sample.ts';
import { OFFICIAL, PILOT, PILOT_ID, RUN_ID } from './generate.ts';

export { OFFICIAL, PILOT, PILOT_ID, RUN_ID };
export const ROOT = fileURLToPath(new URL('./', import.meta.url));
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
export const summary = JSON.parse(readFileSync(join(ROOT, 'results/runs', RUN_ID, 'summary.json'), 'utf8')) as Summary;

// The served build when it holds this run, else a build into a temp directory with its own vite
// preview, once per worker process.
let served: Promise<string> | undefined;
export function bandBase(baseURL: string): Promise<string> {
  return (served ??= (async () => {
    const json = (path: string) => fetch(new URL(path, baseURL)).then((r) => r.json() as Promise<unknown>).catch(() => null);
    const files = ((await json('data/index.json')) as { files?: string[] } | null)?.files ?? [];
    if (files.includes(`results/runs/${RUN_ID}/summary.json`)) return baseURL;
    const web = join(REPO, 'apps/web');
    const out = mkdtempSync(join(tmpdir(), 'clinenv-band-build-'));
    const b = spawnSync(join(web, 'node_modules/.bin/vite'), ['build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: web, encoding: 'utf8', env: { ...process.env, RESULTS_ROOT: ROOT } });
    if (b.status !== 0) throw new Error(`band verdict build failed: ${b.stdout}${b.stderr}`);
    return serve(out);
  })());
}
