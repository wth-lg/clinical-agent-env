// pnpm cli summary <run> [--require <spec>] [--task all|<id,...> | --tasks <id,...>] [--allow-mock] [--json] [--write]
// Summarizes a run (packages/core/summary.ts): per task pass k/n over its valid trials with a
// Wilson 95% interval, every figure at each record's current grade (its last cli regrade, else
// its recorded outcome; a task with regraded records also prints its recorded k/n, as disclosure), ENV_ERROR counted raw over settled and re-queued attempts, ENV_LIMIT over the same, the models seen,
// the initial state hashes and replay.json's verdicts. With --write it writes <run>/summary.json,
// validated against the schema first; without it, it only prints, so a summary of a committed run
// leaves its file alone (verifier-phase-P17i-JG8a-1 P-1). --require checks the run:
//   valid=N          every task has exactly N valid trials (donewhen: trials=N)
//   band=a-b         every task passes a to b of them (donewhen: pass-min=a,pass-max=b), or,
//                    with a decimal point (band=0.2-0.7, the final run's FINAL_PASS_BAND), a
//                    proportion of its valid trials, k/N inclusive (P21); band=0-1, counts or
//                    proportions, is refused as ambiguous (write 0.0-1.0, or the aliases)
//   env_error_raw=N  at most N ENV_ERROR attempts in the run, re-queued ones included
//   env_limit=N      at most N attempts whose current grade is ENV_LIMIT (a stop at the context
//                    window, or at a turn, cost or time cap that rule P-L does not find looping:
//                    the environment's, never re-queued, so the batch leaves it unsettled); every
//                    pilot and the final run require env_limit=0, so a human reviews each one
//                    (plan-amendment-worklist W0-A)
//   model=M          every record requested M and every response came from M
//   replay=all       replay.json exists and every trial reproduced (a trial replay.json marks
//                    world_mismatch, run on another world than the replaying checkout's, is named
//                    with the two-step replay, cli/replay.ts header, R37); every record's replay_final
//                    equals its final hash
//   grader_error=N   at most N records whose current grade (the last regrade, else the recorded
//                    outcome) is GRADER_ERROR. GRADER_ERROR is settled, never re-queued as a
//                    model trial; the records that were GRADER_ERROR in an earlier grade are
//                    printed as history, never required. The policy: fix the grader, regrade
//                    the run offline (cli/regrade.ts), disclose the history; a final run passes
//                    grader_error=0 and replay=all (replay compares env_version only)
//   mode=M           the manifest's mode is M (mode=live)
// With any requirement, every task the run must hold has records: those of --task (all, or a
// comma list), else the manifest's task_versions; and a run that is not live is a violation
// unless --allow-mock is given. --tasks <id,...> (P21) holds the per-task requirements, valid
// and band, to those tasks alone, each of which must have records: the final run directory
// collects each task's trials as that task is frozen, so the frozen ones are checked without
// reading the rest. The run-wide requirements (env_error_raw, env_limit, grader_error, model,
// replay, mode) stay run-wide. --task and --tasks do not combine. Each task line names the env_versions its records ran at and the
// grader_task_versions of their current grades (packages/core/tasks.ts), first 12 characters.
// Under each task line, the metrics beside k/n (packages/core/summary.ts header), each with its
// denominator: mean score, raw (unclipped) mean, mean fraction of gates met, pass_no_harm,
// pass^1, pass^3 and pass^5, LIMIT counts by kind, re-queued attempts by outcome and the
// infra-counted rate (passes over the valid trials plus the INFRA, ENV_ERROR and ENV_LIMIT attempts). A
// task the consistency flag marks (packages/core/summary.ts header: most valid failures fail
// the same check first, or 0 passes in 10 or more valid trials) gets a third line naming it;
// audit-check requires a task-validity review for it. A run line gives the model and effort its
// records share, and each task's fault box line its valid failures by kind (TAXONOMY of the current
// grade), by audit label when <run>/audit.jsonl is present, its infra re-runs and its top failed
// checks (packages/core/summary.ts faultCounts, P17j JG7).
// The run's superseded task versions (R42, <run>/superseded/<task>-v<n>/ with trials/) are
// summarized under superseded and printed one line each, never counted or required; a directory
// not named so, or holding another task's records, is an error (exit 1).
// Trials are named by trialName, as replay.json names them. --json prints only the summary on stdout (the lines go to stderr). Exit 0 when every
// requirement holds; 1 on a violation or a missing run; 2 on a usage error.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BatchRecord } from '../packages/core/batch.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import { isValid } from '../packages/core/outcomes.ts';
import { readLabels, rowLabel } from './audit-check.ts';
import { replayStateOf, whyStale, type ReplayEntry, type ReplayRecord } from '../packages/core/replay.ts';
import { assertSummary, checkRequirements, describeConsistency, parseRequire, PASS_K, summarize, trialName, type RegradeGrade, type ReplayState, type Requirements, type SummaryTrial, type SupersededInput } from '../packages/core/summary.ts';
import type { TaskSource } from '../packages/core/tasks.ts';
import { readManifest, requeuedRecords, settledRecords, writeJson } from './adapters/result-sink-node.ts';
import { nodeTaskSource } from './adapters/tasks-node.ts';

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
  // Resolves --task all; default this checkout's tasks.
  tasks?: TaskSource;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const USAGE = 'usage: pnpm cli summary <run> [--require valid=N,band=a-b,env_error_raw=N,env_limit=N,grader_error=N,model=M,replay=all,mode=live] [--task all|<id,...> | --tasks <id,...>] [--allow-mock] [--json] [--write]';

// A record as cli regrade leaves it: its regrades[] entries appended.
// A run-one record has no index: summary names it by its trajectory, as replay does (trialName).
const toTrial = (r: BatchRecord & { regrades?: RegradeGrade[] }): SummaryTrial => ({
  task_id: r.task_id, task_version: r.task_version ?? null, env_version: r.env_version ?? null, grader_task_version: r.grader_task_version ?? null,
  ...(typeof r.index === 'number' ? { index: r.index } : {}), ...(r.trajectory ? { trajectory: r.trajectory } : {}), ...(r.trial_id ? { trial_id: r.trial_id } : {}),
  outcome: r.outcome, detail: r.detail ?? null, ...(r.checks ? { checks: r.checks } : {}), model_requested: r.model_requested,
  models_returned: r.models_returned ?? [], effort: r.effort ?? null, attribution: r.attribution ?? null, state_hash: r.state_hash, tool_errors: r.tool_errors ?? {}, cost_usd: r.cost_usd ?? 0,
  judge_cost_usd: r.judge_cost_usd ?? 0, score: r.score ?? null,
  ...(r.regrades ? { regrades: r.regrades } : {}),
});

// replay.json as trial -> verdict (packages/core/replay.ts replayStateOf: the named verdict, or
// match or mismatch from the match field of a file written before verdicts were named), for the
// entries that are verdicts of the run's settled records as they are now (isVerdictOf: the
// outcomes the entry names are the record's, and a match or mismatch stamped with replayed_at
// was made at the record's env_version). A stale entry, of a record rewritten under the same
// trial name with no replay since (R42; verifier-phase-P17i-TWOW-229-1 S2), is left out of
// states, so summary lists the trial as not replayed, and named in stale with why. An entry of
// no settled record is left out too. null when replay has not run.
export function readReplay(dir: string, records: ReadonlyArray<ReplayRecord>): { states: Record<string, ReplayState>; stale: Record<string, string> } | null {
  const file = join(dir, 'replay.json');
  if (!existsSync(file)) return null;
  const trials = (JSON.parse(readFileSync(file, 'utf8')) as { trials?: Record<string, ReplayEntry> }).trials ?? {};
  const byName = new Map(records.map((r) => [trialName(r), r]));
  const states: Record<string, ReplayState> = {};
  const stale: Record<string, string> = {};
  for (const [name, entry] of Object.entries(trials)) {
    const r = byName.get(name);
    if (r === undefined) continue;
    const why = whyStale(entry, r);
    if (why === null) states[name] = replayStateOf(entry);
    else stale[name] = why;
  }
  return { states, stale };
}

// The run's superseded task versions (R42): each <run>/superseded/<task>-v<n>/ with a trials/
// directory, its settled records as summary reads them, and its own audit labels when it holds
// an audit.jsonl (cli supersede moves the version's rows there). Throws on a directory not named
// so, or whose records are of another task.
export function readSuperseded(dir: string): SupersededInput[] {
  const base = join(dir, 'superseded');
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(base, d.name, 'trials')))
    .map((d) => d.name)
    .sort()
    .map((key) => {
      const m = /^(.+)-v(\d+)$/.exec(key);
      if (m === null) throw new Error(`${base}/${key}: a superseded version directory is named <task>-v<n>`);
      const task = m[1] as string;
      const trials = settledRecords(join(base, key)).map((x) => toTrial(x.record));
      const other = [...new Set(trials.map((t) => t.task_id).filter((id) => id !== task))];
      if (other.length > 0) throw new Error(`${base}/${key}: holds records of ${other.join(', ')}, not of ${task}`);
      const own = join(base, key);
      return { key, task, version: `v${m[2]}`, trials, ...(existsSync(join(own, 'audit.jsonl')) ? { audit: readAuditLabels(own) } : {}) };
    });
}

// audit.jsonl's label of each audited trial, by trial; null without the file. The rows are read by
// cli/audit-check.ts readLabels and labelled by its rowLabel, so the two commands count the same
// rows (verifier-phase-P17i-JG7-1 F2); audit-check reports the rows it cannot read.
export function readAuditLabels(dir: string): Record<string, string | null> | null {
  if (!existsSync(join(dir, 'audit.jsonl'))) return null;
  return Object.fromEntries((readLabels(dir, []) ?? []).flatMap(({ label }) => (label === null ? [] : [[label.trial, rowLabel(label)]])));
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fixed = (x: number | null) => (x === null ? 'n/a' : x.toFixed(6));
const counts = (h: Record<string, number>) => Object.entries(h).map(([k, n]) => `${k} ${n}`).join(', ');

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  let dir: string | undefined;
  let spec = '';
  let json = false;
  let allowMock = false;
  let write = false;
  let taskArg: string | undefined;
  let tasksArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--json') json = true;
    else if (a === '--allow-mock') allowMock = true;
    else if (a === '--write') write = true;
    else if (a === '--require' && args[i + 1] !== undefined) spec = args[++i] as string;
    else if (a === '--task' && args[i + 1] !== undefined) taskArg = args[++i] as string;
    else if (a === '--tasks' && args[i + 1] !== undefined) tasksArg = args[++i] as string;
    else if (!a.startsWith('--') && dir === undefined) dir = a;
    else {
      deps.err(`summary: unexpected argument ${a}\n${USAGE}`);
      return 2;
    }
  }
  if (dir === undefined) {
    deps.err(`summary: a run directory is required\n${USAGE}`);
    return 2;
  }
  if (taskArg !== undefined && tasksArg !== undefined) {
    deps.err(`summary: --task and --tasks do not combine\n${USAGE}`);
    return 2;
  }
  const held = tasksArg === undefined ? undefined : tasksArg.split(',').map((t) => t.trim()).filter((t) => t !== '');
  if (held !== undefined && held.length === 0) {
    deps.err(`summary: --tasks needs at least one task id\n${USAGE}`);
    return 2;
  }
  let req: Requirements;
  try {
    req = parseRequire(spec);
  } catch (e) {
    deps.err(`summary: ${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  if (!existsSync(join(dir, 'trials'))) {
    deps.err(`summary: ${dir} has no trials/ directory`);
    return 1;
  }
  if (allowMock) req.allow_mock = true;
  if (held !== undefined) req.tasks = held;
  const manifest = readManifest(dir);
  let expected: { tasks: string[]; from: string } | undefined;
  if (held !== undefined) expected = { tasks: held, from: '--tasks' };
  else if (taskArg !== undefined) {
    try {
      const tasks = taskArg === 'all' ? (await (deps.tasks ?? nodeTaskSource({ testMode: false })).all()).map((t) => t.id) : taskArg.split(',').map((t) => t.trim()).filter((t) => t !== '');
      expected = { tasks, from: '--task' };
    } catch (e) {
      deps.err(`summary: --task: ${(e as Error).message}`);
      return 1;
    }
  } else if (manifest?.task_versions) expected = { tasks: Object.keys(manifest.task_versions), from: 'the run manifest' };
  let superseded: SupersededInput[];
  try {
    superseded = readSuperseded(dir);
  } catch (e) {
    deps.err(`summary: ${(e as Error).message}`);
    return 1;
  }
  const settled = settledRecords(dir).map((x) => x.record);
  const replay = readReplay(dir, settled);
  const s = summarize({
    run_id: manifest?.run_id ?? basename(dir),
    trials: settled.map(toTrial),
    requeued: requeuedRecords(dir).map((x) => toTrial(x.record)),
    replay: replay === null ? null : replay.states,
    superseded,
    mode: manifest?.mode ?? null,
    ...(expected ? { expected } : {}),
    audit: readAuditLabels(dir),
  });
  s.requirements = req;
  s.violations = checkRequirements(s, req);
  assertSummary(s);
  if (write) writeJson(join(dir, 'summary.json'), s);

  const say = json ? deps.err : deps.out;
  say(`model ${s.model ?? '(the records differ or none is recorded)'}, effort ${s.effort ?? '(the records differ or none is recorded)'}`);
  const width = Math.max(...Object.keys(s.tasks).map((id) => id.length), 4);
  for (const [id, t] of Object.entries(s.tasks)) {
    const w = t.wilson95 === null ? 'n/a' : `${pct(t.wilson95.lo)}-${pct(t.wilson95.hi)}`;
    const recorded = Object.entries(t.recorded_outcomes).filter(([o]) => isValid(o));
    const disclosed = t.regraded === 0 ? '' : `  regraded ${t.regraded} (recorded ${t.recorded_outcomes.PASS ?? 0}/${recorded.reduce((a, [, n]) => a + n, 0)})`;
    const short = (vs: string[]) => (vs.length === 0 ? '(none)' : vs.map((v) => v.slice(0, 12)).join(','));
    say(`${id.padEnd(width)}  ${t.passes}/${t.trials}  Wilson 95% ${w}  ENV_ERROR raw ${t.env_error_raw}  ENV_LIMIT ${t.env_limit}  re-queued ${t.requeued}${disclosed}  env ${short(t.env_versions)}  grader ${short(t.grader_task_versions)}`);
    const m = t.metric_trials;
    say(
      `${' '.repeat(width)}  mean score ${fixed(t.mean_score)} (${m.mean_score} valid)  raw mean ${fixed(t.raw_mean_score)} (${m.raw_mean_score})  gates met ${fixed(t.gate_fraction)} (${m.gate_fraction})  pass_no_harm ${t.pass_no_harm}/${t.trials}  ${PASS_K.map((k) => `pass^${k} ${fixed(t.pass_k[k])}`).join(' ')}  ` +
        `LIMIT ${counts(t.limits)}  re-queued ${Object.keys(t.requeued_outcomes).length === 0 ? 'none' : counts(t.requeued_outcomes)}  infra-counted ${t.passes}/${t.infra_counted_attempts} (${fixed(t.infra_counted_rate)})`,
    );
    const f = t.fault_counts;
    const nonzero = (h: Record<string, number>) => counts(Object.fromEntries(Object.entries(h).filter(([, n]) => n > 0))) || 'none';
    const top = t.top_failed_checks.map((c) => `${c.check} ${c.count}`).join(', ') || 'none';
    say(`${' '.repeat(width)}  failures ${f.failures}: by kind ${nonzero(f.taxonomy)}; by audit label${f.label === null ? ': no audit.jsonl' : ` ${nonzero(f.label)}`}; infra re-runs ${f.infra_reruns}; top failed checks ${top}`);
    const flagged = describeConsistency(t.consistency);
    if (flagged.length > 0) say(`${' '.repeat(width)}  consistency flagged: ${flagged.join('; ')} (audit-check requires a task-validity review)`);
  }
  for (const [key, v] of Object.entries(s.superseded)) {
    const t = v.summary;
    const w = t.wilson95 === null ? 'n/a' : `${pct(t.wilson95.lo)}-${pct(t.wilson95.hi)}`;
    say(`superseded ${key}: ${v.task} ${v.version}  ${t.passes}/${t.trials}  Wilson 95% ${w}  ${t.band_verdict ?? 'no valid trials'}  world ${v.initial_state_hashes.map((h) => h.slice(0, 12)).join(',') || '(none)'}  env ${t.env_versions.map((x) => x.slice(0, 12)).join(',') || '(none)'}  grader ${t.grader_task_versions.map((x) => x.slice(0, 12)).join(',') || '(none)'}; not counted in the tasks above`);
  }
  if (s.replay.ran && s.replay.other_world.length > 0) say(`replay: ${s.replay.other_world.length} trial(s) ran on another world than the replaying checkout's (replay.json world_mismatch): ${s.replay.other_world.join(', ')}`);
  const staleNames = Object.keys(replay?.stale ?? {}).sort();
  if (staleNames.length > 0) say(`replay: ${staleNames.length} ${staleNames.length === 1 ? 'entry of replay.json is not a verdict of its record' : 'entries of replay.json are not verdicts of their records'} as it is now (stale; replay the task again): ${staleNames.map((n) => `${n} (${replay!.stale[n]})`).join(', ')}`);
  say(
    `GRADER_ERROR ${s.totals.grader_error} at the current grade; history ${s.totals.grader_error_history} (GRADER_ERROR in an earlier grade, disclosed only). ` +
      'A GRADER_ERROR is a grader bug, never re-queued as a model trial: fix the grader, regrade the whole run offline (pnpm cli regrade), and disclose the history; ' +
      'a final run requires grader_error=0 and replay=all, and replay compares env_version only, so a grader fix does not break it',
  );
  for (const v of s.violations) say(`violation: ${v}`);
  say(`summary: ${s.violations.length === 0 ? 'every requirement holds' : `${s.violations.length} violation(s)`}; ${write ? `wrote ${join(dir, 'summary.json')}` : 'summary.json not written (pass --write to write it)'}`);
  if (json) deps.out(JSON.stringify(s));
  return s.violations.length === 0 ? 0 : 1;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2));
}
