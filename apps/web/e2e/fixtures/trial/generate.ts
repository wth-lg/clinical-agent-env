// Writes the committed trials the trial detail spec (e2e/trial.spec.ts) builds against
// (RESULTS_ROOT=apps/web/e2e/fixtures/trial, plan phase P16), copied from the sample run
// (../sample-results, real scripted runs whose trajectories replay to their final hashes):
//   results/official.json                    {"run": "runs/trial-1"}
//   results/runs/trial-1/trials/<task>/<index>.json, trajectories/<task>/<index>.jsonl
//     one trial of each non-pass outcome (FAIL audited and not audited, LIMIT, REFUSAL,
//     ENV_ERROR, GRADER_ERROR, INFRA_API), a PASS, and a FAIL whose trajectory is left out, so
//     the trajectory pane shows its error state
//   results/runs/trial-1/audit.jsonl         the sample's audit rows for those trials
//   results/runs/trial-1/matrix.json         the sample's matrix.json (M4, GR4)
//   results/runs/trial-1/summary.json        packages/core/summary.ts summarize() over the records
//   results/pilot-pass/                      one PASS, so first-nonpass finds nothing there
// A rerun writes the same bytes.
//   node apps/web/e2e/fixtures/trial/generate.ts
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuditRow } from '../../../../../packages/core/explain.ts';
import { assertSummary, summarize, trialName, type SummaryTrial } from '../../../../../packages/core/summary.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(HERE, '../sample-results/results/runs/sample-1');
export const RUN_ID = 'trial-1';
const RUN = join(HERE, 'results/runs', RUN_ID);
const PILOT = join(HERE, 'results/pilot-pass');

// The trials, by what each one shows.
export const TRIALS = {
  failAudited: 'renal-dose-review/5',
  failUnaudited: 'renal-dose-review/11',
  refusal: 'renal-dose-review/4',
  infra: 'renal-dose-review/12',
  pass: 'renal-dose-review/0',
  limit: 'crc-care-gap/5',
  envError: 'discharge-medrec/12',
  graderError: 'message-queue/12',
  noTrajectory: 'contrast-ct-prep/7',
} as const;

const write = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const copy = (from: string, to: string) => {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
};

function main() {
  rmSync(join(HERE, 'results'), { recursive: true, force: true });
  write(join(HERE, 'results/official.json'), `${JSON.stringify({ run: `runs/${RUN_ID}` })}\n`);
  const names = Object.values(TRIALS);
  const records = names.map((name) => {
    copy(join(SAMPLE, 'trials', `${name}.json`), join(RUN, 'trials', `${name}.json`));
    if (name !== TRIALS.noTrajectory) copy(join(SAMPLE, 'trajectories', `${name}.jsonl`), join(RUN, 'trajectories', `${name}.jsonl`));
    return JSON.parse(readFileSync(join(SAMPLE, 'trials', `${name}.json`), 'utf8')) as SummaryTrial;
  });
  const audit = readFileSync(join(SAMPLE, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as AuditRow).filter((a) => (names as readonly string[]).includes(a.trial));
  write(join(RUN, 'audit.jsonl'), audit.map((a) => `${JSON.stringify(a)}\n`).join(''));
  copy(join(SAMPLE, 'matrix.json'), join(RUN, 'matrix.json'));
  const summary = summarize({ run_id: RUN_ID, trials: records, requeued: [], replay: null, mode: 'mock-sample', expected: { tasks: [...new Set(records.map((r) => r.task_id))].sort(), from: 'generate.ts' } });
  assertSummary(summary);
  write(join(RUN, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  copy(join(SAMPLE, 'trials', `${TRIALS.pass}.json`), join(PILOT, 'trials', `${TRIALS.pass}.json`));
  copy(join(SAMPLE, 'trajectories', `${TRIALS.pass}.jsonl`), join(PILOT, 'trajectories', `${TRIALS.pass}.jsonl`));
  console.log(`wrote ${records.length} trials (${records.map((r) => trialName(r)).join(', ')}), ${audit.length} audit rows`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
