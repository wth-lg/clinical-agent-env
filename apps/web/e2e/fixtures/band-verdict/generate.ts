// Writes the committed runs the band verdict spec (e2e/band-verdict.spec.ts, plan-amendment-w4
// PW4-F F-2) builds against, RESULTS_ROOT=apps/web/e2e/fixtures/band-verdict:
//   results/official.json                 {"run": "runs/band-1"}
//   results/runs/band-1/trials/<task>/<index>.json, summary.json
//   results/runs/band-1/manifest.json, matrix.json  the sample's, the manifest as run band-1, so
//                                         reachability answers for every record (M1)
//     20 valid trials of each of three tasks: message-queue 20/20 (Saturated, no failures),
//     discharge-medrec 16/20 (Above band), contrast-ct-prep 10/20 (In band)
//   results/pilot-4a/trials/<task>/<index>.json
//     8 trials of each: 8/8, 6/8 and 2/8, the difficulty history's earlier column
// Each record is a copy of one PASS or FAIL record of that task in the sample run
// (../sample-results, real scripted runs), with its index, trial id and run id set and its
// trajectory left out (these specs never open a trial). summary.json is packages/core/summary.ts
// summarize() over the records. A rerun writes the same bytes.
//   node apps/web/e2e/fixtures/band-verdict/generate.ts
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSummary, summarize, type SummaryTrial } from '../../../../../packages/core/summary.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(HERE, '../sample-results/results/runs/sample-1');
export const RUN_ID = 'band-1';
export const PILOT_ID = 'pilot-4a';
// Passes of trials, per task, in the official run and in the pilot.
export const OFFICIAL: Readonly<Record<string, { passes: number; trials: number }>> = {
  'contrast-ct-prep': { passes: 10, trials: 20 },
  'discharge-medrec': { passes: 16, trials: 20 },
  'message-queue': { passes: 20, trials: 20 },
};
export const PILOT: Readonly<Record<string, { passes: number; trials: number }>> = {
  'contrast-ct-prep': { passes: 2, trials: 8 },
  'discharge-medrec': { passes: 6, trials: 8 },
  'message-queue': { passes: 8, trials: 8 },
};

type Record_ = SummaryTrial & { index: number; run_id?: string; trial_id?: string; trajectory?: string };

// The first PASS and the first FAIL record of a task in the sample run, by index.
function source(task: string, outcome: 'PASS' | 'FAIL'): Record_ {
  const dir = join(SAMPLE, 'trials', task);
  const all = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record_).sort((a, b) => a.index - b.index);
  const r = all.find((x) => x.outcome === outcome && (x.regrades ?? []).length === 0);
  if (r === undefined) throw new Error(`the sample run has no ${outcome} record of ${task}`);
  return r;
}

function writeRun(dir: string, runId: string, counts: typeof OFFICIAL): Record_[] {
  const out: Record_[] = [];
  for (const [task, { passes, trials }] of Object.entries(counts)) {
    for (let i = 0; i < trials; i++) {
      const { trajectory: _trajectory, ...from } = source(task, i < passes ? 'PASS' : 'FAIL');
      const r: Record_ = { ...from, index: i, run_id: runId, trial_id: `run:${runId}:${task}/${i}` };
      mkdirSync(join(dir, 'trials', task), { recursive: true });
      writeFileSync(join(dir, 'trials', task, `${i}.json`), `${JSON.stringify(r, null, 2)}\n`);
      out.push(r);
    }
  }
  return out;
}

function main() {
  rmSync(join(HERE, 'results'), { recursive: true, force: true });
  mkdirSync(join(HERE, 'results'), { recursive: true });
  writeFileSync(join(HERE, 'results/official.json'), `${JSON.stringify({ run: `runs/${RUN_ID}` })}\n`);
  const run = join(HERE, 'results/runs', RUN_ID);
  const records = writeRun(run, RUN_ID, OFFICIAL);
  const summary = summarize({ run_id: RUN_ID, trials: records, requeued: [], replay: null, mode: 'mock-sample', expected: { tasks: Object.keys(OFFICIAL).sort(), from: 'generate.ts' }, audit: null });
  assertSummary(summary);
  writeFileSync(join(run, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  copyFileSync(join(SAMPLE, 'matrix.json'), join(run, 'matrix.json'));
  writeFileSync(join(run, 'manifest.json'), `${JSON.stringify({ ...(JSON.parse(readFileSync(join(SAMPLE, 'manifest.json'), 'utf8')) as object), run_id: RUN_ID }, null, 2)}\n`);
  writeRun(join(HERE, 'results', PILOT_ID), PILOT_ID, PILOT);
  console.log(`wrote ${records.length} official records and the pilot ${PILOT_ID}; verdicts ${Object.entries(summary.tasks).map(([id, t]) => `${id} ${t.passes}/${t.trials} ${t.band_verdict}`).join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
