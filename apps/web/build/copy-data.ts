// Copies the committed results the static site serves into <outDir>/data/ and writes
// <outDir>/data/index.json listing every copied file (paths relative to data/).
// Sources, relative to the source root (env RESULTS_ROOT, resolved against the repo root so the
// same value works from the repo root and from `pnpm --filter web`; default the repo root):
//   results/official.json and, from the run directory it names ({"run": "runs/<id>"},
//   relative to results/), trials/, trajectories/, summary.json, audit.jsonl, matrix.json and regrade/;
//   each pilot run, results/pilot-<n>/ or results/runs/pilot-<n>/ with a trials/ directory (not
//   counted in the results; the Runs view lists them), with the same entries;
//   docs/findings.md; fixtures/world.ndjson.gz and fixtures/manifest.json.
// A missing source is skipped, so a tree with no results/ yields an empty index.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// matrix.json (pnpm cli matrix --out) for the trial detail's criteria, and regrade/ (an offline
// regrade of the run's records) for the line that says whether a later grader changes them.
const RUN_ENTRIES = ['trials', 'trajectories', 'summary.json', 'audit.jsonl', 'matrix.json', 'regrade'];
const FIXED_FILES = ['results/official.json', 'docs/findings.md', 'fixtures/world.ndjson.gz', 'fixtures/manifest.json'];

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function listFiles(root: string, rel: string): string[] {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile()).map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join('/'));
}

// The copied entries of one run directory, relative to the source root.
function runFiles(root: string, runDir: string): string[] {
  const runRel = relative(root, runDir).split(sep).join('/');
  return RUN_ENTRIES.flatMap((entry) => {
    const rel = `${runRel}/${entry}`;
    const stat = statSync(join(root, rel), { throwIfNoEntry: false });
    if (!stat) return [];
    return stat.isDirectory() ? listFiles(root, rel) : [rel];
  });
}

function officialRunFiles(root: string): string[] {
  const official = join(root, 'results/official.json');
  if (!existsSync(official)) return [];
  const { run } = JSON.parse(readFileSync(official, 'utf8')) as { run?: unknown };
  if (typeof run !== 'string') throw new Error('results/official.json: expected {"run": "runs/<id>"}');
  const results = join(root, 'results');
  const runDir = resolve(results, run);
  if (!runDir.startsWith(results + sep)) throw new Error(`results/official.json: run path ${run} is outside results/`);
  return runFiles(root, runDir);
}

const PILOT = /^pilot-[A-Za-z0-9._-]+$/;

function pilotRunFiles(root: string): string[] {
  return ['results', 'results/runs'].flatMap((parent) => {
    const abs = join(root, parent);
    if (!existsSync(abs)) return [];
    return readdirSync(abs, { withFileTypes: true })
      .filter((d) => d.isDirectory() && PILOT.test(d.name) && existsSync(join(abs, d.name, 'trials')))
      .flatMap((d) => runFiles(root, join(abs, d.name)));
  });
}

export function copyData({ root, outDir }: { root: string; outDir: string }): string[] {
  const files = [...new Set([...FIXED_FILES.filter((f) => existsSync(join(root, f))), ...officialRunFiles(root), ...pilotRunFiles(root)])].sort();
  const dataDir = join(outDir, 'data');
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  for (const f of files) cpSync(join(root, f), join(dataDir, f));
  writeFileSync(join(dataDir, 'index.json'), `${JSON.stringify({ files }, null, 2)}\n`);
  return files;
}

export function copyDataPlugin(): Plugin {
  let outDir = '';
  return {
    name: 'copy-data',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const root = resolve(repoRoot, process.env.RESULTS_ROOT ?? '.');
      // A RESULTS_ROOT that names nothing is a typo, not a tree with no results.
      if (!existsSync(root)) throw new Error(`RESULTS_ROOT ${process.env.RESULTS_ROOT}: no such directory (resolved to ${root})`);
      copyData({ root, outDir });
    },
  };
}
