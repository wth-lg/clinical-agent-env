// Writes the committed sample run the browse and Findings specs build against
// (RESULTS_ROOT=apps/web/e2e/fixtures/sample-results, plan phase P14):
//   results/official.json                 {"run": "runs/sample-1"}
//   results/runs/sample-1/trials/<task>/<index>.json, trajectories/<task>/<index>.jsonl
//   results/runs/sample-1/summary.json    packages/core/summary.ts summarize() over the records
//   results/runs/sample-1/audit.jsonl     human audit rows for some non-pass trials
//   results/runs/sample-1/manifest.json   the run manifest a batch writes (packages/core/batch.ts
//                                         RunManifest, no batches), so M1 reads reachability
//   results/runs/sample-1/matrix.json     written by `pnpm cli matrix --task <id> --out` (below)
//   results/pilot-grader-error/           a pilot run of one GRADER_ERROR, the trial above unregraded
//   docs/findings.md                      a short write-up of the sample, from summary.json
// Every trial is a real scripted run through run() (packages/grader/matrix: the oracle and the
// alternatives pass, the mutants and the null, spray and output-gap agents fail), graded from
// the task's canned judge cache, so its trajectory replays to the record's final hash. A few
// records are then rewritten to the outcomes a scripted model cannot produce (REFUSAL, LIMIT,
// ENV_ERROR, GRADER_ERROR, INFRA_API) and graded again from the rewritten record. The run's
// GRADER_ERROR carries the regrade of a fixed grader (a regrades[] entry with the trial's real
// grade, a model FAIL), as cli regrade leaves it: a committed run with a current GRADER_ERROR is
// blocked (DENOMINATOR_RULE), and the record still shows in grader_error_history. The same trial
// without the regrade is the GRADER_ERROR exemplar of the pilot run pilot-grader-error
// (decisions.tsv 2026-10-29T17:50). Each task
// has 12 valid trials; the excluded records sit at index 12, as a batch's reruns would leave
// 12 valid ones. Costs are synthetic (scripted runs cost nothing) and fixed per index.
// The clock is fixed, so a rerun writes the same bytes.
//   node apps/web/e2e/fixtures/sample-results/generate.ts            records, summary, findings
//   node apps/web/e2e/fixtures/sample-results/generate.ts --matrix   also matrix.json (slow)
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMatrixTask, matrixEnv, matrixTaskIds } from '../../../../../cli/matrix.ts';
import type { RunManifest } from '../../../../../packages/core/batch.ts';
import type { ToolResultEvent, TrialEvent } from '../../../../../packages/core/events.ts';
import { auditLabelOf, type AuditRow } from '../../../../../packages/core/explain.ts';
import type { TrialRecord } from '../../../../../packages/core/run.ts';
import { assertSummary, summarize, type SummaryTrial } from '../../../../../packages/core/summary.ts';
import { toJsonl } from '../../../../../packages/core/trajectory.ts';
import { cases, gradeRun, trial, type Case, type CaseRun } from '../../../../../packages/grader/matrix/matrix.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../../../..');
export const RUN_ID = 'sample-1';
const RUN = join(HERE, 'results/runs', RUN_ID);
export const PILOT_ERROR_ID = 'pilot-grader-error';
const PILOT_ERROR = join(HERE, 'results', PILOT_ERROR_ID);
export const TRIALS_PER_TASK = 12;
const T0 = Date.parse('2026-10-23T12:00:00Z');
// The regrade of the run's GRADER_ERROR, a fixed day after the clock starts: after every trial ended.
const REGRADED_AT = new Date(T0 + 24 * 3600 * 1000).toISOString();

// Passes per task, in task id order, so the six intervals differ.
const PASSES = [3, 5, 7, 9, 4, 8];
// The non-FAIL outcomes each task holds, by task position: valid ones take an index below 12,
// excluded ones index 12.
const SPECIAL: Record<number, Array<'REFUSAL' | 'LIMIT' | 'ENV_ERROR' | 'GRADER_ERROR' | 'INFRA_API'>> = {
  0: ['REFUSAL'],
  1: ['LIMIT'],
  2: ['ENV_ERROR'],
  3: ['GRADER_ERROR'],
  4: ['INFRA_API', 'REFUSAL'],
};

type Rec = TrialRecord & { index: number; trajectory: string; regrades?: ReturnType<typeof regradeOf>[] };

const write = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

let tick = 0;
const now = () => T0 + 1000 * tick++;

async function main(withMatrix: boolean) {
  // matrix.json stays unless --matrix writes it again.
  for (const d of ['trials', 'trajectories']) rmSync(join(RUN, d), { recursive: true, force: true });
  rmSync(PILOT_ERROR, { recursive: true, force: true });
  if (withMatrix) rmSync(join(RUN, 'matrix.json'), { force: true });
  const ids = matrixTaskIds().filter((id) => !id.startsWith('_'));
  const env = { ...matrixEnv(), now };
  const records: Rec[] = [];
  const audit: AuditRow[] = [];
  for (const [t, id] of ids.entries()) {
    const task = await loadMatrixTask(id);
    const all = cases(task);
    const pass = all.filter((c) => c.kind === 'oracle' || c.kind === 'alternative');
    const fail = all.filter((c) => c.kind !== 'oracle' && c.kind !== 'alternative');
    const specials = SPECIAL[t] ?? [];
    const validSpecials: string[] = specials.filter((s) => s === 'REFUSAL' || s === 'LIMIT');
    const plan: Array<{ c: Case; as: string | null }> = [];
    for (let i = 0; i < PASSES[t]!; i++) plan.push({ c: pass[i % pass.length]!, as: null });
    for (const s of validSpecials) plan.push({ c: fail[0]!, as: s });
    while (plan.length < TRIALS_PER_TASK) plan.push({ c: fail[(plan.length - PASSES[t]!) % fail.length]!, as: null });
    for (const s of specials.filter((x) => !validSpecials.includes(x))) plan.push({ c: fail[1 % fail.length]!, as: s });
    // A task with a GRADER_ERROR: its first FAIL is the GRADER_ERROR a fixed grader regraded, which
    // stays in the run; the excluded GRADER_ERROR goes to the pilot run (header). The trials run in
    // the same order as before, so the clock gives every other record the same times.
    if (specials.includes('GRADER_ERROR')) plan[PASSES[t]! + validSpecials.length]!.as = 'REGRADED';

    for (const [index, { c, as }] of plan.entries()) {
      const scripted = await trial(env, task, c);
      const run = as === 'ENV_ERROR' ? internalAt(scripted, INTERNAL_CALL) : scripted;
      const facts = rewrite(run.record, as);
      const graded: CaseRun = { record: facts, events: run.events };
      const real = await gradeRun(env, task, task.checks, graded);
      // A GRADER_ERROR (regraded or not) has no score, so no score bounds either (grade.ts judgeOf).
      const errored = as === 'GRADER_ERROR' || as === 'REGRADED';
      const grade = errored
        ? { ...real, judge: { ...real.judge, score_penalties_met: null, score_penalties_not_met: null }, outcome: 'GRADER_ERROR' as const, valid: false, fault: 'grader' as const, score: null, error: { check: task.checks.find((k) => k.kind === 'gate')!.id, message: "TypeError: Cannot read properties of undefined (reading 'status')", stops_batch: false } }
        : real;
      const cost = { cost_usd: Number((0.6 + 0.07 * t + 0.03 * index).toFixed(4)), judge_cost_usd: 0 };
      if (as === 'GRADER_ERROR') {
        // The exemplar: not regraded, in its own pilot run.
        const exemplar = { ...facts, ...grade, trial_id: `${PILOT_ERROR_ID}:${id}:${index}`, index, trajectory: `trajectories/${id}/${index}.jsonl`, ...cost };
        write(join(PILOT_ERROR, 'trials', id, `${index}.json`), `${JSON.stringify(exemplar, null, 2)}\n`);
        write(join(PILOT_ERROR, exemplar.trajectory), toJsonl(run.events));
        continue;
      }
      const trajectory = `trajectories/${id}/${index}.jsonl`;
      const rec: Rec = { ...facts, ...grade, trial_id: `${RUN_ID}:${id}:${index}`, index, trajectory, ...cost, ...(as === 'REGRADED' ? { regrades: [regradeOf(real, facts.grader_task_version)] } : {}) };
      records.push(rec);
      write(join(RUN, 'trials', id, `${index}.json`), `${JSON.stringify(rec, null, 2)}\n`);
      write(join(RUN, trajectory), toJsonl(run.events));
      // Every FAIL but the last of each task is audited, so each task keeps one unaudited FAIL.
      const lastFail = plan.map((p, i) => ((p.as === null || p.as === 'REGRADED') && !pass.includes(p.c) ? i : -1)).filter((i) => i >= 0).at(-1);
      // The regraded GRADER_ERROR is a FAIL at its current grade, so it is audited as one.
      if ((rec.regrades?.at(-1)?.outcome ?? rec.outcome) === 'FAIL' && index !== lastFail) {
        audit.push({ trial: `${id}/${index}`, outcome: 'FAIL', taxonomy: rec.attribution?.auto ?? null, model_fault: 'yes', decisive_step: rec.attribution?.decisive_step ?? null, evidence_ids: rec.attribution?.exposure.map((e) => e.id).slice(0, 2) ?? [], llm_auditor_agrees: true });
      }
    }
  }

  // The audit's labels, as cli summary reads them from audit.jsonl, give fault_counts.label.
  const labels = Object.fromEntries(audit.map((a) => [a.trial, auditLabelOf(a)]));
  const summary = summarize({ run_id: RUN_ID, trials: records as unknown as SummaryTrial[], requeued: [], replay: null, mode: 'mock-sample', expected: { tasks: ids, from: 'generate.ts' }, audit: labels });
  assertSummary(summary);
  write(join(HERE, 'results/official.json'), `${JSON.stringify({ run: `runs/${RUN_ID}` }, null, 2)}\n`);
  write(join(RUN, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  write(join(RUN, 'audit.jsonl'), audit.map((a) => `${JSON.stringify(a)}\n`).join(''));
  write(join(RUN, 'manifest.json'), `${JSON.stringify(manifestOf(records, env.worldHash), null, 2)}\n`);
  write(join(HERE, 'docs/findings.md'), findings(summary));
  if (withMatrix) {
    for (const id of ids) {
      const r = spawnSync('node', ['cli/index.ts', 'matrix', '--task', id, '--out', RUN], { cwd: REPO, encoding: 'utf8' });
      process.stdout.write(`matrix ${id}: exit ${r.status}\n`);
      if (r.status !== 0) throw new Error(`pnpm cli matrix --task ${id} failed:\n${r.stdout}${r.stderr}`);
    }
  }
}

// The run manifest a batch of these records would have written (packages/core/batch.ts), with no
// batch entries: the world it ran on and each task's versions, which M1's reachability compares
// with matrix.json (verifier-phase-P17i-C4r5-1 F2).
function manifestOf(records: readonly Rec[], worldHash: string): RunManifest {
  const first = records[0]!;
  const versions = (k: 'task_version' | 'env_version' | 'grader_task_version') =>
    Object.fromEntries(records.map((r) => [r.task_id, r[k] ?? (() => { throw new Error(`${r.trial_id} has no ${k}`); })()]));
  return {
    run_id: RUN_ID, model: first.model_requested, effort: first.effort, mode: 'mock-sample', world_hash: worldHash, api_version: first.api_version, trials: TRIALS_PER_TASK,
    task_versions: versions('task_version'), env_versions: versions('env_version'), grader_task_versions: versions('grader_task_version'), batches: [],
  };
}

// An ENV_ERROR's run as packages/core/loop.ts leaves it when a tool fails with an internal error:
// the nth executed call returns the INTERNAL error, the error event ends the trial there, and no
// later call ran (verifier-ui-copy-1 m4: the record said INTERNAL, its trajectory did not). The
// graded event is the scripted run's, dropped; the trajectory holds no grade of an ungraded trial.
const INTERNAL_CALL = 3;
const INTERNAL_MESSAGE = 'the FHIR store failed';
function internalAt(run: CaseRun, n: number): CaseRun {
  let ran = 0;
  const at = run.events.findIndex((e) => e.type === 'tool_result' && e.executed && ++ran === n);
  const { written_ids: _, ...ok } = run.events[at] as ToolResultEvent;
  const failed: ToolResultEvent = { ...ok, is_error: true, error_code: 'INTERNAL', content: { error: { code: 'INTERNAL', message: INTERNAL_MESSAGE } }, exposed_ids: [], referenced_ids: [] };
  const events: TrialEvent[] = [...run.events.slice(0, at), failed, { v: failed.v, seq: failed.seq + 1, ts: failed.ts, turn: failed.turn, type: 'error', status: 'ENV_ERROR', code: 'INTERNAL', message: INTERNAL_MESSAGE }];
  const calls = events.filter((e) => e.type === 'tool_call').length;
  return { record: { ...run.record, turns: failed.turn, tool_calls: calls, stop: null, summary: null, ended: failed.ts }, events };
}

// The regrades[] entry cli regrade writes after a grader fix (cli/regrade.ts RegradeEntry): the
// trial's real grade, a model FAIL.
function regradeOf(g: Awaited<ReturnType<typeof gradeRun>>, graderTaskVersion: string | null) {
  if (g.outcome !== 'FAIL') throw new Error(`the regraded GRADER_ERROR must be a model FAIL, not ${g.outcome}`);
  return { grader_version: g.grader_version, grader_task_version: graderTaskVersion, outcome: g.outcome, score: g.score, valid: g.valid, checks: g.checks, error: null, changed: true, at: REGRADED_AT };
}

// The record as the outcome `as` would have left it; null keeps the scripted run's.
function rewrite(r: TrialRecord, as: string | null): TrialRecord {
  switch (as) {
    case 'REFUSAL':
      return { ...r, status: 'REFUSAL', stop_reason: 'refusal', summary: 'I cannot place or change orders for this patient without a clinician reviewing the chart first.' };
    case 'LIMIT':
      return { ...r, status: 'LIMIT', detail: 'turns' };
    case 'ENV_ERROR':
      return { ...r, status: 'ENV_ERROR', detail: 'INTERNAL', tool_errors: { ...r.tool_errors, INTERNAL: 1 }, state_hash: { ...r.state_hash, final: null, replay_final: null } };
    case 'INFRA_API':
      return { ...r, status: 'INFRA_API', detail: 'overloaded_error after 4 retries' };
    default:
      return r;
  }
}

const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(100 * x)}%`);

function findings(s: ReturnType<typeof summarize>): string {
  const rows = Object.entries(s.tasks).map(([id, t]) => `| ${id} | ${t.passes}/${t.trials} | ${pct(t.wilson95?.lo ?? null)} to ${pct(t.wilson95?.hi ?? null)} |`);
  return [
    '# Findings (sample run)',
    '',
    `This is the sample run \`${s.run_id}\` that the browse tests build against. Its trials are scripted, not model runs, so the numbers say nothing about the model.`,
    '',
    '## Pass rates',
    '',
    '| Task | Passes | Wilson 95% interval |',
    '| --- | --- | --- |',
    ...rows,
    '',
    '## Failures',
    '',
    'Most failures are mutants of the reference solution that fall into one trap each. One refusal and one limit stand in for the outcomes a scripted model cannot produce.',
    '',
  ].join('\n');
}

await main(process.argv.includes('--matrix'));
