// pnpm cli events-solve <run>[,<run>...] | --classes <classes.json> [--cost-from <run,...>]
//                       [--items <id=n,...>] [--emax <id=e,...>] [--current <id=e,...>]
//                       [--req-per-event <r>] [--observed-items <id=n,...>] [--base <id=b,...>] [--json]
// Stop rule S-1 and S-2 of plan-amendment-w4 as a command (PW4-H0b): each task's event count e*
// and predicted pass, from the class table (cli/classes.ts, run on the runs given or read from a
// saved --json file) and the context-budget projection of the --cost-from runs (default the runs).
// Pooled over the tasks, with +0.5 smoothing (S):
//   f = (amend fails among seen amend events + 0.5) / (seen amend events + 1)   (classes A, B, C, O)
//   q = (trials that saw every arrival + 0.5) / (valid trials + 1)
//   p_D = 1 - (lure fails + 0.5) / (lure observations + 1)
// and per task b_t = the product over its classes of (1 - base_fails / observations), the base list
// rate with the event gates left out (--base overrides). pred_t(e) = q x b_t x (1 - f)^(e - 1) x p_D:
// of e events one is the lure.
// S-1: zero event failures of any kind (amend, missed arrival, lure, and an event gate failure no
// spec takes: classes' unattributed_event_failures) over every observation: every
// task freezes on v1. S-2: a task with pred_t(e_max) > FREEZE_ABOVE freezes on v1 at its current
// count. The others' e* are solved together, because the mean-p90 line binds across tasks: every
// vector of e_t in 1..e_max_t is tried, those with each p90 <= PER_TRIAL_BUDGET_USD and the mean
// p90 over all tasks (frozen ones at their current count) <= MEAN_P90_BUDGET_USD are kept, and the
// one with the least sum of (pred_t - TARGET)^2 wins; ties go to the lower mean p90, then to fewer
// events in task order (the vectors compared as numbers). Cost per task and e is context-budget's
// per-trial projection at n items and e events of r requests each (p90 = P90_OVER_MEDIAN x median).
// r is --req-per-event, else refit from the cost source when its trajectories hold event arrivals
// (S-2 "refit r"; context-budget resolveReqPerEvent: within-task least squares, each trial's k net
// of its own arrivals), else DEFAULT_REQ_PER_EVENT. A cost source with arrivals whose r cannot be
// fitted, and no --req-per-event, exits 2 with the reason. The action is v1_plus_4 when e* is
// the current count (4 more trials on v1), otherwise v2_8 (ACTIVE becomes e*, 8 trials on v2).
// n, e_max and the current count default to the checkout: the length of the task's item list
// (cli/classes.ts itemClassesOf), and the SPECS and ACTIVE lengths of tasks/<id>/events.ts.
// A run directory given twice (by its resolved path) is read once, with a warning on stderr.
// Exit 0 when solved (S-1 included); 1 when a run, file or task cannot be read, no event was
// observed, or no vector meets the cost lines; 2 on a usage error or an r that cannot be fitted.
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { money, PER_TRIAL_BUDGET_USD } from '../packages/core/cost.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import { type ClassesJson, classesJsonProblems, classesOf, itemClassesOf, taskEventsOf, uniqueRuns } from './classes.ts';
import { main as contextBudget, MEAN_P90_BUDGET_USD, project, resolveReqPerEvent, type TrialUsage } from './context-budget.ts';

export const TARGET = 0.45;
export const FREEZE_ABOVE = 0.7;
export const DEFAULT_REQ_PER_EVENT = 3;
const AMEND = new Set(['A', 'B', 'C', 'O']);

export interface Pooled {
  f: number;
  q: number;
  p_d: number;
  b: Record<string, number>;
  seen: number;
  amend_fails_seen: number;
  q_trials: number;
  q_seen_all: number;
  lure_observations: number;
  lure_fails: number;
  event_observations: number;
  // Every event failure: an amend fail, a missed arrival (event_seen fails the event), a lure, or
  // an event gate failure no spec takes.
  event_fails: number;
  // Of event_fails, those no spec takes; left out when 0, so the output is what it was before.
  unattributed_event_fails?: number;
}

export function pooled(c: ClassesJson): Pooled {
  let seen = 0, amend = 0, qt = 0, qs = 0, lo = 0, lf = 0, eo = 0, ef = 0, un = 0;
  const b: Record<string, number> = {};
  for (const [id, t] of Object.entries(c.tasks)) {
    for (const e of t.events) {
      eo += e.observations;
      ef += e.fails;
      if (e.class === 'D') { lo += e.observations; lf += e.fails; }
      if (e.class !== null && AMEND.has(e.class)) { seen += e.seen; amend += e.amend_fails_seen; }
    }
    if (t.q !== null) { qt += t.q.trials; qs += t.q.seen_all; }
    un += t.unattributed_event_failures?.length ?? 0;
    b[id] = t.classes.reduce((p, k) => p * (k.observations > 0 ? 1 - k.base_fails / k.observations : 1), 1);
  }
  return {
    f: (amend + 0.5) / (seen + 1), q: (qs + 0.5) / (qt + 1), p_d: 1 - (lf + 0.5) / (lo + 1), b,
    seen, amend_fails_seen: amend, q_trials: qt, q_seen_all: qs, lure_observations: lo, lure_fails: lf, event_observations: eo, event_fails: ef + un,
    ...(un > 0 ? { unattributed_event_fails: un } : {}),
  };
}

export const pred = (p: Pick<Pooled, 'f' | 'q' | 'p_d'>, b: number, e: number): number => p.q * b * (1 - p.f) ** (e - 1) * p.p_d;

export type Action = 'freeze_v1' | 'v1_plus_4' | 'v2_8';
export interface TaskSolve {
  items: number;
  e_max: number;
  current: number;
  b: number;
  e_star: number;
  pred: number;
  pred_at_emax: number;
  p90_usd: number;
  action: Action;
  // pred and p90 at every e in 1..e_max.
  by_e: Array<{ e: number; pred: number; p90_usd: number }>;
}
export interface SolveJson {
  pooled: Pooled;
  req_per_event: number;
  s1_lever_dead: boolean;
  mean_p90_usd: number;
  tasks: Record<string, TaskSolve>;
}

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
}
const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const USAGE = 'usage: pnpm cli events-solve <run>[,<run>...] | --classes <classes.json> --cost-from <run,...> [--items id=n,...] [--emax id=e,...] [--current id=e,...] [--req-per-event r] [--observed-items id=n,...] [--base id=b,...] [--json]';
const WITH_VALUE = new Set(['--classes', '--cost-from', '--items', '--emax', '--current', '--req-per-event', '--observed-items', '--base']);

function parseMap(spec: string, re: RegExp): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const part of spec.split(',')) {
    const [id, v] = part.split('=');
    if (!id || !re.test(v ?? '')) return null;
    out[id] = Number(v);
  }
  return out;
}
const WHOLE = /^(0|[1-9][0-9]*)$/;
const NUMBER = /^[0-9]+(\.[0-9]+)?$/;

// a before b, element by element as numbers.
function before(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] as number) < (b[i] as number);
  return false;
}

// The best vector of event counts for the open tasks, or null when none meets the cost lines.
export function solve(open: string[], fixedP90: number, all: number, table: Record<string, TaskSolve['by_e']>): Record<string, number> | null {
  let best: { key: [number, number, number[]]; es: number[] } | null = null;
  const es = open.map(() => 1);
  const walk = (i: number, sq: number, p90: number): void => {
    if (i === open.length) {
      const mean = (fixedP90 + p90) / all;
      if (mean > MEAN_P90_BUDGET_USD + 1e-9) return;
      const key: [number, number, number[]] = [sq, mean, [...es]];
      const better = best === null || key[0] < best.key[0] - 1e-12 || (Math.abs(key[0] - best.key[0]) <= 1e-12 && (key[1] < best.key[1] - 1e-12 || (Math.abs(key[1] - best.key[1]) <= 1e-12 && before(key[2], best.key[2]))));
      if (better) best = { key, es: [...es] };
      return;
    }
    for (const row of table[open[i] as string] as TaskSolve['by_e']) {
      if (row.p90_usd > PER_TRIAL_BUDGET_USD + 1e-9) continue;
      es[i] = row.e;
      walk(i + 1, sq + (row.pred - TARGET) ** 2, p90 + row.p90_usd);
    }
  };
  walk(0, 0, 0);
  const found = best as { es: number[] } | null;
  return found === null ? null : Object.fromEntries(open.map((id, i) => [id, found.es[i] as number]));
}

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  const usage = (problem: string) => (deps.err(`events-solve: ${problem}`), deps.err(USAGE), 2);
  const fail = (problem: string) => (deps.err(`events-solve: ${problem}`), 1);
  const opts = new Map<string, string>();
  const positional: string[] = [];
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (WITH_VALUE.has(a)) {
      const v = args[++i];
      if (v === undefined) return usage(`${a} needs a value`);
      opts.set(a, v);
    } else if (a === '--json') json = true;
    else if (a.startsWith('--')) return usage(`unknown option ${a}`);
    else positional.push(a);
  }
  const say = json ? deps.err : deps.out;
  const warn = (l: string) => deps.err(`events-solve: ${l}`);
  const runs = uniqueRuns(positional.flatMap((p) => p.split(',')).filter((s) => s !== ''), warn);
  if (runs.length > 0 && opts.has('--classes')) return usage('give run directories or --classes, not both');
  if (runs.length === 0 && !opts.has('--classes')) return usage('give run directories or --classes <file>');
  if (opts.has('--classes') && !opts.has('--cost-from')) return usage('--classes needs --cost-from <run,...>');
  const maps: Record<string, Record<string, number>> = {};
  for (const [flag, re] of [['--items', WHOLE], ['--emax', WHOLE], ['--current', WHOLE], ['--base', NUMBER]] as const) {
    if (!opts.has(flag)) continue;
    const m = parseMap(opts.get(flag) as string, re);
    if (m === null) return usage(`${flag} takes id=value,...`);
    maps[flag] = m;
  }
  const rRaw = opts.get('--req-per-event');
  if (rRaw !== undefined && !NUMBER.test(rRaw)) return usage('--req-per-event takes a number >= 0');
  const given = rRaw === undefined ? undefined : Number(rRaw);

  let classes: ClassesJson;
  try {
    if (opts.has('--classes')) {
      const file = opts.get('--classes') as string;
      if (!existsSync(file)) return fail(`${file} not found`);
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      const problems = classesJsonProblems(parsed);
      if (problems.length > 0) return fail(`${file} is not a ClassesJson: ${problems.slice(0, 5).join('; ')}`);
      classes = parsed as ClassesJson;
    } else classes = await classesOf(runs);
  } catch (e) {
    return fail((e as Error).message);
  }
  const ids = Object.keys(classes.tasks).sort();
  const p = pooled(classes);
  if (p.event_observations === 0) return fail('no event observations in the classes: S needs a run with events (pilot-4a)');

  // n, e_max and the current count per task.
  const sizes: Record<string, { items: number; e_max: number; current: number }> = {};
  for (const id of ids) {
    try {
      const items = maps['--items']?.[id] ?? (await itemClassesOf(id)).length;
      const ev = maps['--emax']?.[id] === undefined || maps['--current']?.[id] === undefined ? await taskEventsOf(id) : null;
      const e_max = maps['--emax']?.[id] ?? ev?.SPECS.length;
      const current = maps['--current']?.[id] ?? ev?.ACTIVE.length;
      if (e_max === undefined || current === undefined) return usage(`${id}: tasks/${id}/events.ts not found; give --emax and --current`);
      if (e_max < 1) return usage(`${id}: e_max must be at least 1`);
      sizes[id] = { items, e_max, current };
    } catch (e) {
      return fail(`${id}: ${(e as Error).message}`);
    }
  }

  // Each task's trials as context-budget fits them.
  const costFrom = opts.has('--cost-from') ? uniqueRuns((opts.get('--cost-from') as string).split(',').filter((s) => s !== ''), warn).join(',') : runs.join(',');
  const lines: string[] = [];
  const cbArgs = [costFrom, '--task', ids.join(','), '--json', ...(opts.has('--observed-items') ? ['--observed-items', opts.get('--observed-items') as string] : [])];
  const cbCode = await contextBudget(cbArgs, { out: (l) => lines.push(l), err: (l) => lines.push(l) });
  const raw = lines.find((l) => l.startsWith('{'));
  if (raw === undefined) return fail(`context-budget ${cbArgs.join(' ')} exited ${cbCode}: ${lines.slice(-3).join(' | ')}`);
  const cb = JSON.parse(raw) as { tasks: Record<string, { trials: TrialUsage[]; fit: { items: number } }>; breaks: string[] };
  if (cb.breaks.length > 0) return fail(`the cost fit is not trusted: ${cb.breaks.join('; ')}`);
  const rate = resolveReqPerEvent(ids.map((id) => (cb.tasks[id] as { trials: TrialUsage[] }).trials), given);
  if ('error' in rate) return usage(rate.error);
  const r = rate.r ?? DEFAULT_REQ_PER_EVENT;

  const tasks: Record<string, TaskSolve> = {};
  const table: Record<string, TaskSolve['by_e']> = {};
  for (const id of ids) {
    const { items, e_max, current } = sizes[id] as { items: number; e_max: number; current: number };
    const fit = cb.tasks[id] as { trials: TrialUsage[]; fit: { items: number } };
    const b = maps['--base']?.[id] ?? (p.b[id] as number);
    const p90At = (e: number) => project(id, fit.trials, fit.fit.items, items, null, { events: e, req_per_event: r }).p90_usd;
    table[id] = Array.from({ length: e_max }, (_, k) => ({ e: k + 1, pred: pred(p, b, k + 1), p90_usd: p90At(k + 1) }));
    const atCurrent = { e: current, pred: pred(p, b, current), p90_usd: p90At(current) };
    tasks[id] = { items, e_max, current, b, e_star: current, pred: atCurrent.pred, pred_at_emax: pred(p, b, e_max), p90_usd: atCurrent.p90_usd, action: 'freeze_v1', by_e: table[id] };
  }

  const s1 = p.event_fails === 0;
  const open = s1 ? [] : ids.filter((id) => (tasks[id] as TaskSolve).pred_at_emax <= FREEZE_ABOVE);
  const fixedP90 = ids.filter((id) => !open.includes(id)).reduce((s, id) => s + (tasks[id] as TaskSolve).p90_usd, 0);
  const chosen = open.length === 0 ? {} : solve(open, fixedP90, ids.length, table);
  if (chosen === null) return fail(`no event counts in 1..e_max meet p90 <= ${money(PER_TRIAL_BUDGET_USD)} per task and mean p90 <= ${money(MEAN_P90_BUDGET_USD)}`);
  for (const [id, e] of Object.entries(chosen)) {
    const t = tasks[id] as TaskSolve;
    const row = (table[id] as TaskSolve['by_e'])[e - 1] as TaskSolve['by_e'][number];
    Object.assign(t, { e_star: e, pred: row.pred, p90_usd: row.p90_usd, action: e === t.current ? 'v1_plus_4' : 'v2_8' });
  }
  const mean = ids.reduce((s, id) => s + (tasks[id] as TaskSolve).p90_usd, 0) / ids.length;

  say(`pooled over ${ids.length} tasks: f ${p.f.toFixed(3)} (${p.amend_fails_seen} amend fails among ${p.seen} seen), q ${p.q.toFixed(3)} (${p.q_seen_all}/${p.q_trials} trials saw every arrival), p_D ${p.p_d.toFixed(3)} (${p.lure_fails}/${p.lure_observations} lure fails); r ${r}`);
  for (const l of rate.lines) say(l);
  const un = p.unattributed_event_fails ?? 0;
  if (un > 0) say(`${un} event gate failure${un === 1 ? '' : 's'} no spec takes (classes: unattributed_event_failures) counted as event failures`);
  if (s1) say(`S-1: zero event failures in ${p.event_observations} observations: the lever is dead; every task freezes on v1`);
  for (const id of ids) {
    const t = tasks[id] as TaskSolve;
    const why = t.action === 'freeze_v1' ? (s1 ? 'S-1' : `pred at e_max ${t.e_max} is ${t.pred_at_emax.toFixed(2)} > ${FREEZE_ABOVE}`) : t.action === 'v1_plus_4' ? 'e* is the current count: 4 more trials on v1' : `ACTIVE ${t.current} -> ${t.e_star}: 8 trials on v2`;
    say(`${id}: n ${t.items}, b ${t.b.toFixed(2)}, e* ${t.e_star} of ${t.e_max}, pred ${t.pred.toFixed(2)}, p90 ${money(t.p90_usd)}; ${t.action} (${why})`);
  }
  say(`mean p90 ${money(mean)} over ${ids.length} tasks (line ${money(MEAN_P90_BUDGET_USD)})`);
  if (json) deps.out(JSON.stringify({ pooled: p, req_per_event: r, s1_lever_dead: s1, mean_p90_usd: mean, tasks } satisfies SolveJson));
  return 0;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2));
}
