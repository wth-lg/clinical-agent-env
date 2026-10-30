// pnpm cli context-budget <run>[,<run>...] [--task all|<id,...>] [--observed-items <id=n,...>]
//                         [--project --items <n | id=n,...>] [--cost-from <run,...>] [--json]
// The context and cost meter (plan-amendment-worklist.md, W0-B). Each request re-reads the whole
// context, so a trial's cost grows with the square of its request count T. Per trial with first-
// request context C0, growth g tokens per request and o output tokens per request:
//   cache_read ~ T x C0 + g x T x (T - 1) / 2; cache_write ~ C0 + g x (T - 1); output ~ o x T
//   cost = 0.2e-6 x cache_read + 5e-6 x cache_write + 20e-6 x output (packages/core/cost.ts prices)
//   T ~ 2 + k x n for a list of n items at k requests per item; peak context ~ C0 + g x (T - 1)
// From each settled, valid record (summary.ts currentGrade, so outcomes.ts isValid: an ENV_* or
// INFRA_* trial is left out) and its trajectory it prints per trial T and the peak per-request
// context (input + cache_read + cache_creation), and per task the medians of T, C0, g, o and
// working time per request over its trials, k = (median T - 2) / the items the run's tasks held,
// and the median of each trial's modelled cost (its own T, C0, g and o) against the observed
// median loop cost (record cost_usd). The items are the task's packages/env/overlay.ts slots
// when every trial ran at the checkout's env_version; otherwise the slots may have changed since,
// so --observed-items is required. A fit more than 10% under or 40% over the observed median is
// a broken line: a projection from it is not trusted. A trial with T < 2 is warned about.
// --project --items projects each trial at n items with its own k = (T - 2) / items, C0, g and o,
// and takes the medians of T, cost, peak context and working time; p90 = P90_OVER_MEDIAN x median.
// It checks the budget lines: p90 at most PER_TRIAL_BUDGET_USD, peak under 0.6 x
// CONTEXT_WINDOW_TOKENS, T under 0.5 x the task's max_turns, working time under 0.5 x MAX_WALL_MS,
// and, over two or more tasks, a mean p90 at most MEAN_P90_BUDGET_USD; with fewer than
// PLANNED_TASKS projected it says which tasks the mean line covered. It also
// prints the projection correction for `spend --check --projected`: `run --dry-run` and the final
// reserve price a new task_version at the p90 of its latest earlier version, which is far too low
// for a longer list. The correction is, per projected task, its remaining final trials (20 before
// the final run) x (projected p90 + median judge cost - the spend tool's per-trial cost from
// --cost-from, default the fitted runs) x RERUN_FACTOR, never below 0; add it to the dry-run value.
// --json prints only {tasks, breaks, correction_usd} on stdout (the lines go to stderr).
// Exit 0 when every line holds; 1 when one breaks or a run cannot be read; 2 on a usage error.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONTEXT_WINDOW_TOKENS, finalReserve, money, PER_TRIAL_BUDGET_USD, PLANNED_TASKS, PRICE_USD_PER_MTOK, RERUN_FACTOR } from '../packages/core/cost.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import { MAX_WALL_MS } from '../packages/core/run.ts';
import { currentGrade } from '../packages/core/summary.ts';
import type { TaskSource } from '../packages/core/tasks.ts';
import { TASKS } from '../packages/env/overlay.ts';
import { loadFinalTrials, loadTrialObservations } from './adapters/ledger-node.ts';
import { settledRecords, trajectoryOf } from './adapters/result-sink-node.ts';
import { nodeTaskSource } from './adapters/tasks-node.ts';
import { checkoutVersions } from './replay.ts';

// The plan sizes on p90 ~ 1.25 x median: pilot-2's max/median trial cost was 1.12-1.46 per task.
export const P90_OVER_MEDIAN = 1.25;
// The mean projected p90 across tasks the final reserve is planned at (plan "Budget lines").
export const MEAN_P90_BUDGET_USD = 2.4;
// The fit band: the model's median may be at most 10% under and 40% over the observed median.
export const FIT_BAND = [0.9, 1.4] as const;

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
  // Resolves --task all and each task's max_turns; default this checkout's tasks.
  tasks?: TaskSource;
  // The checkout's env_version of a task, null when it has none; default from tasks. A throw or
  // rejection (no such task, a broken task or world file) is reported as the reason.
  checkoutEnv?: (id: string) => Promise<string | null>;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const USAGE = 'usage: pnpm cli context-budget <run>[,<run>...] [--task all|<id,...>] [--observed-items <id=n,...>] [--project --items <n|id=n,...>] [--cost-from <run,...>] [--json]';

// The items each task's list held in the world the pilot runs used: its overlay slots.
const SLOT_ITEMS: Record<string, number> = Object.fromEntries(Object.values(TASKS).map((t) => [t.slug, t.slots.length]));

export interface TrialUsage {
  index: number | null;
  env_version: string | null;
  T: number;
  C0: number;
  g: number;
  o: number;
  peak_context: number;
  cost_usd: number;
  judge_cost_usd: number;
  ms_per_request: number | null;
}

export interface Fit {
  items: number;
  T: number;
  C0: number;
  g: number;
  o: number;
  k: number;
  ms_per_request: number | null;
  judge_median_usd: number;
  observed_median_usd: number;
  fitted_median_usd: number;
  peak_median: number;
  skipped_invalid: number;
}

export interface Projection {
  task_id: string;
  items: number;
  T: number;
  median_usd: number;
  p90_usd: number;
  peak_context: number;
  working_ms: number | null;
  max_turns: number | null;
}

// The model's cost of a trial with T requests.
export function modelCost(m: { T: number; C0: number; g: number; o: number }): number {
  const p = PRICE_USD_PER_MTOK;
  const read = m.T * m.C0 + (m.g * m.T * (m.T - 1)) / 2;
  const write = m.C0 + m.g * (m.T - 1);
  return (read * p.cache_read + write * p.cache_write_5m + m.o * m.T * p.output) / 1e6;
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

interface Usage {
  input_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  output_tokens?: number;
}

// One trial's request usage from its trajectory, or null when it made no request.
function trialUsage(dir: string, r: Record<string, unknown>): TrialUsage | null {
  const responses = readFileSync(trajectoryOf(dir, r as never), 'utf8')
    .split('\n')
    .filter((l) => l.includes('"type":"response"'))
    .map((l) => JSON.parse(l) as { type: string; usage?: Usage })
    .filter((e) => e.type === 'response' && e.usage);
  if (responses.length === 0) return null;
  const ctx = responses.map(({ usage: u }) => (u!.input_tokens ?? 0) + (u!.cache_read_input_tokens ?? 0) + (u!.cache_creation_input_tokens ?? 0));
  const T = ctx.length;
  const out = responses.reduce((s, e) => s + (e.usage!.output_tokens ?? 0), 0);
  const started = typeof r.started === 'string' ? Date.parse(r.started) : NaN;
  const ended = typeof r.ended === 'string' ? Date.parse(r.ended) : NaN;
  // Working time, as MAX_WALL_MS bounds it: elapsed less retry waits (packages/core/explain.ts).
  const working = ended - started - (typeof r.retry_wait_ms === 'number' ? r.retry_wait_ms : 0);
  return {
    index: typeof r.index === 'number' ? r.index : null,
    env_version: typeof r.env_version === 'string' ? r.env_version : null,
    T,
    C0: ctx[0] as number,
    g: ((ctx[T - 1] as number) - (ctx[0] as number)) / Math.max(1, T - 1),
    o: out / T,
    peak_context: Math.max(...ctx),
    cost_usd: typeof r.cost_usd === 'number' ? r.cost_usd : 0,
    judge_cost_usd: typeof r.judge_cost_usd === 'number' ? r.judge_cost_usd : 0,
    ms_per_request: Number.isFinite(working) ? working / T : null,
  };
}

// Medians over the trials: of each parameter on its own, for the printed fit and k, and of each
// trial's modelled cost for the fitted median. A median of parameters taken from different
// trials can cost less than the median trial (pilot-1 crc-care-gap: -7%).
export function fitTask(trials: readonly TrialUsage[], items: number, skipped_invalid = 0): Fit {
  const m = (f: (t: TrialUsage) => number) => median(trials.map(f));
  const T = m((t) => t.T);
  const C0 = m((t) => t.C0);
  const g = m((t) => t.g);
  const o = m((t) => t.o);
  const timed = trials.flatMap((t) => (t.ms_per_request === null ? [] : [t.ms_per_request]));
  return {
    items, T, C0, g, o, k: (T - 2) / items,
    ms_per_request: timed.length > 0 ? median(timed) : null,
    judge_median_usd: m((t) => t.judge_cost_usd),
    observed_median_usd: m((t) => t.cost_usd),
    fitted_median_usd: m(modelCost),
    peak_median: m((t) => t.peak_context),
    skipped_invalid,
  };
}

// Each trial at n items, with its own k = (T - 2) / the observed items, C0, g, o and working time
// per request; the medians over the trials.
export function project(task_id: string, trials: readonly TrialUsage[], observedItems: number, items: number, max_turns: number | null): Projection {
  const at = trials.map((t) => ({ t, T: 2 + ((t.T - 2) / observedItems) * items }));
  const median_usd = median(at.map((x) => modelCost({ ...x.t, T: x.T })));
  const timed = at.flatMap((x) => (x.t.ms_per_request === null ? [] : [x.t.ms_per_request * x.T]));
  return {
    task_id, items, T: median(at.map((x) => x.T)), median_usd, p90_usd: P90_OVER_MEDIAN * median_usd,
    peak_context: median(at.map((x) => x.t.C0 + x.t.g * (x.T - 1))), working_ms: timed.length > 0 ? median(timed) : null, max_turns,
  };
}

const kTok = (n: number): string => `${(n / 1000).toFixed(1)}k`;
const minutes = (ms: number): string => `${(ms / 60_000).toFixed(1)} min`;

// Every budget line a set of projections breaks, one sentence each.
export function budgetBreaks(projections: readonly Projection[], caps: { maxWallMs: number } = { maxWallMs: MAX_WALL_MS }): string[] {
  const breaks = projections.flatMap((p) => [
    ...(p.p90_usd > PER_TRIAL_BUDGET_USD ? [`${p.task_id}: projected p90 ${money(p.p90_usd)} > ${money(PER_TRIAL_BUDGET_USD)} per trial`] : []),
    ...(p.peak_context >= 0.6 * CONTEXT_WINDOW_TOKENS ? [`${p.task_id}: projected peak context ${kTok(p.peak_context)} >= 0.6 x the ${CONTEXT_WINDOW_TOKENS / 1000}k window`] : []),
    ...(p.max_turns !== null && p.T >= 0.5 * p.max_turns ? [`${p.task_id}: projected T ${p.T.toFixed(1)} >= 0.5 x max_turns ${p.max_turns}`] : []),
    ...(p.working_ms !== null && p.working_ms >= 0.5 * caps.maxWallMs ? [`${p.task_id}: projected working time ${minutes(p.working_ms)} >= 0.5 x ${caps.maxWallMs / 60_000} min`] : []),
  ]);
  if (projections.length >= 2) {
    const mean = projections.reduce((s, p) => s + p.p90_usd, 0) / projections.length;
    if (mean > MEAN_P90_BUDGET_USD) breaks.push(`mean projected p90 ${money(mean)} over ${projections.length} tasks > ${money(MEAN_P90_BUDGET_USD)}`);
  }
  return breaks;
}

// "36" for every task, or "id=n,id=n"; null when malformed.
function parseCounts(spec: string, ids: readonly string[]): Record<string, number> | null {
  const whole = (s: string) => (/^[1-9][0-9]*$/.test(s) ? Number(s) : null);
  if (!spec.includes('=')) {
    const n = whole(spec);
    return n === null ? null : Object.fromEntries(ids.map((id) => [id, n]));
  }
  const out: Record<string, number> = {};
  for (const part of spec.split(',')) {
    const [id, value] = part.split('=');
    const n = whole(value ?? '');
    if (!id || n === null) return null;
    out[id] = n;
  }
  return out;
}

const WITH_VALUE = new Set(['--task', '--items', '--observed-items', '--cost-from']);
const FLAGS = new Set(['--project', '--json']);

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  const usage = (problem: string) => (deps.err(`context-budget: ${problem}`), deps.err(USAGE), 2);
  const opts = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (WITH_VALUE.has(a)) {
      const v = args[++i];
      if (v === undefined) return usage(`${a} needs a value`);
      opts.set(a, v);
    } else if (FLAGS.has(a)) opts.set(a, '');
    else if (a.startsWith('--')) return usage(`unknown option ${a}`);
    else positional.push(a);
  }
  if (positional.length !== 1) return usage('give one run directory, or a comma list');
  const project_ = opts.has('--project');
  if (project_ !== opts.has('--items')) return usage('--project and --items go together');
  if (opts.has('--cost-from') && !project_) return usage('--cost-from goes with --project');
  const json = opts.has('--json');
  const say = json ? deps.err : deps.out;
  const runs = (positional[0] as string).split(',').filter((s) => s !== '');

  // Valid trials by task, over every run given, and how many invalid ones each task had.
  const byTask = new Map<string, TrialUsage[]>();
  const invalid = new Map<string, number>();
  try {
    for (const dir of runs) {
      if (!existsSync(join(dir, 'trials'))) throw new Error(`${dir}: no trials/ directory`);
      for (const { record } of settledRecords(dir)) {
        const r = record as unknown as Record<string, unknown>;
        const grade = currentGrade({ outcome: typeof r.outcome === 'string' ? r.outcome : '', ...(Array.isArray(r.regrades) ? { regrades: r.regrades as never } : {}) });
        if (!grade.valid) {
          if (typeof r.task_id === 'string') invalid.set(r.task_id, (invalid.get(r.task_id) ?? 0) + 1);
          continue;
        }
        const u = trialUsage(dir, r);
        if (u === null || typeof r.task_id !== 'string') continue;
        byTask.set(r.task_id, [...(byTask.get(r.task_id) ?? []), u]);
      }
    }
  } catch (e) {
    deps.err(`context-budget: ${(e as Error).message}`);
    return 1;
  }

  const want = opts.get('--task') ?? 'all';
  const ids = want === 'all' ? [...new Set([...byTask.keys(), ...invalid.keys()])].sort() : [...new Set(want.split(',').filter((s) => s !== ''))];
  if (ids.length === 0) {
    deps.err(`context-budget: no valid trials with requests in ${runs.join(', ')}`);
    return 1;
  }
  const missing = ids.filter((id) => !byTask.has(id));
  if (missing.length > 0) {
    deps.err(`context-budget: no valid trials of ${missing.join(', ')} in ${runs.join(', ')}`);
    return 1;
  }
  const observed = opts.has('--observed-items') ? parseCounts(opts.get('--observed-items') as string, ids) : {};
  if (observed === null) return usage('--observed-items takes id=n,...');
  const counts = project_ ? parseCounts(opts.get('--items') as string, ids) : {};
  if (counts === null) return usage('--items takes a whole number, or id=n,...');
  const stray = Object.keys(counts).filter((id) => !ids.includes(id));
  if (stray.length > 0) return usage(`--items names ${stray.join(', ')}, not among the tasks measured`);

  const tasks = deps.tasks ?? nodeTaskSource();
  let versions: ReturnType<typeof checkoutVersions> | undefined;
  const checkoutEnv = deps.checkoutEnv ?? (async (id: string) => (await (versions ??= checkoutVersions(tasks))(id)).env_version);
  const result: Record<string, { trials: TrialUsage[]; fit: Fit; projection?: Projection }> = {};
  const breaks: string[] = [];
  const projections: Projection[] = [];
  for (const id of ids) {
    const trials = byTask.get(id) as TrialUsage[];
    let items = observed[id];
    if (items === undefined) {
      const slots = SLOT_ITEMS[id];
      if (slots === undefined) return usage(`${id}: no item count; give --observed-items ${id}=n`);
      let now: string | null;
      try {
        now = await checkoutEnv(id);
      } catch (e) {
        return usage(`${id}: cannot read the checkout's env_version (${(e as Error).message}); give --observed-items ${id}=n`);
      }
      // A record from before env_version has none, and never matches.
      const ran = [...new Set(trials.map((t) => t.env_version))].filter((v) => v === null || v !== now);
      if (ran.length > 0) return usage(`${id}: the run's env_version ${ran.map((v) => v ?? '(none)').join(', ')} is not the checkout's ${now ?? '(none)'}, so the ${slots} overlay slots may not be the items it held; give --observed-items ${id}=n`);
      items = slots;
    }
    const skipped = invalid.get(id) ?? 0;
    const fit = fitTask(trials, items, skipped);
    result[id] = { trials, fit };
    say(`${id}: ${trials.length} trials, ${items} items: T ${fit.T.toFixed(1)}, C0 ${kTok(fit.C0)}, g ${kTok(fit.g)}/req, o ${Math.round(fit.o)}/req, k ${fit.k.toFixed(2)} req/item`);
    if (skipped > 0) say(`  ${skipped} invalid trial${skipped === 1 ? '' : 's'} left out (ENV_*, INFRA_* and other outcomes isValid rejects)`);
    for (const t of trials) say(`  #${t.index ?? '?'} T ${t.T} peak ${kTok(t.peak_context)}`);
    for (const t of trials.filter((x) => x.T < 2)) say(`  warning: #${t.index ?? '?'} made ${t.T} request (T < 2): its k is negative, and its projection means nothing`);
    const ratio = fit.fitted_median_usd / fit.observed_median_usd;
    const pct = `${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%`;
    say(`  median cost observed ${money(fit.observed_median_usd)}, fitted ${money(fit.fitted_median_usd)} (${pct}); median peak ${kTok(fit.peak_median)}${fit.ms_per_request === null ? '' : `, ${(fit.ms_per_request / 1000).toFixed(1)} s working time per request`}`);
    if (!(ratio >= FIT_BAND[0] && ratio <= FIT_BAND[1])) breaks.push(`${id}: fitted median ${money(fit.fitted_median_usd)} is outside -10%..+40% of the observed ${money(fit.observed_median_usd)}`);
    const n = counts[id];
    if (n === undefined) continue;
    let maxTurns: number | null = null;
    try {
      maxTurns = (await tasks.get(id)).maxTurns;
    } catch {
      say(`  ${id} is not a task in this checkout: the max_turns line is not checked`);
    }
    const p = project(id, trials, items, n, maxTurns);
    result[id].projection = p;
    projections.push(p);
    say(`  at ${n} items: T ${p.T.toFixed(1)}, median ${money(p.median_usd)}, p90 ${money(p.p90_usd)}, peak ${kTok(p.peak_context)} (${(p.peak_context / CONTEXT_WINDOW_TOKENS).toFixed(2)} of the window)${p.working_ms === null ? '' : `, working ${minutes(p.working_ms)}`}`);
  }
  breaks.push(...budgetBreaks(projections));
  if (project_ && projections.length < PLANNED_TASKS) {
    const which = projections.map((p) => p.task_id).join(', ');
    say(projections.length >= 2
      ? `mean p90 line checked over ${projections.length} of ${PLANNED_TASKS} tasks (${which}), not the full set`
      : `mean p90 line not checked: ${projections.length} task projected (${which}), it needs two or more of ${PLANNED_TASKS}`);
  }

  let correction: number | undefined;
  if (project_) {
    const costFrom = opts.has('--cost-from') ? (opts.get('--cost-from') as string).split(',').filter((s) => s !== '') : runs;
    const finalRun = join(process.env.RESULTS_ROOT || process.cwd(), 'results', 'runs', 'final-1');
    let reserve;
    try {
      reserve = finalReserve({ plannedTasks: projections.map((p) => p.task_id), observations: loadTrialObservations(costFrom), finalTrials: loadFinalTrials(finalRun), auditorDone: true });
    } catch (e) {
      deps.err(`context-budget: ${(e as Error).message}`);
      return 1;
    }
    correction = reserve.lines.reduce((s, l) => {
      const p = projections.find((x) => x.task_id === l.task_id);
      const judge = l.task_id === null ? 0 : (result[l.task_id]?.fit.judge_median_usd ?? 0);
      return p === undefined ? s : s + Math.max(0, l.trials * RERUN_FACTOR * (p.p90_usd + judge - l.per_trial.usd));
    }, 0);
    say(`projection correction +${money(correction)}: add to the dry-run value for spend --check --projected (per task, remaining final trials x (projected p90 + median judge - the spend tool's p90 from ${costFrom.join(',')}) x ${RERUN_FACTOR}, never below 0)`);
  }

  for (const b of breaks) say(b);
  say(breaks.length === 0 ? 'ok: every budget line holds' : `over: ${breaks.length} budget line${breaks.length === 1 ? '' : 's'} broken`);
  if (json) deps.out(JSON.stringify({ tasks: result, breaks, ...(correction === undefined ? {} : { correction_usd: correction }) }));
  return breaks.length === 0 ? 0 : 1;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2));
}
