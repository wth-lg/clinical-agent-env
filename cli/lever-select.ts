// pnpm cli lever-select <run>[,<run>...] | --classes <classes.json> [--p90 <task=usd,...>]
//                       [--item-cost <task.item=usd,...>] [--json]
// Stop rule S5-2 and S5-6 of plan-amendment-w5, computed from records and never by hand: which
// lever items each task freezes with, from `pnpm cli classes --json` (its per-task `lever` block:
// each item's passes and observations, and base_pass, the trials that passed every non-lever item).
// Run directories are tabulated through classes; --classes reads a saved JSON instead (the W5-H
// gate runs it on a synthetic one). Per task with lever items:
//   b_hat = (base_pass + 1) / (valid trials + 2)        everything but the lever items
//   c_hat_i = (passed_i + 1) / (observed_i + 2)         each active lever item's smoothed catch
//   pred(set) = b_hat x prod c_hat_i over the set       every non-empty set of the active items
// S5-2 picks the set nearest 0.45 inside [0.30, 0.60]; on a tie the larger set; between sets of one
// size, the lower projected p90 by --item-cost when every item of both is priced, else the set with
// more A items (the measured mechanism), else declaration order (ruling F4, decisions.tsv
// 2026-11-03T08:29Z); the same tie-break names the nearest set out of band, where two sets can be
// equally far from 0.45 on opposite sides (R44), and the tie is printed there too. When the both-active PASS count is 3-5 of 8 (as a rate, 0.375-0.625 of the
// valid trials) and the full active set is picked, the task freezes on it with no pilot-5b
// (`freeze`). When no set is inside the band: every prediction above 0.60 activates the reserve,
// the task's inactive item(s), alongside the set nearest 0.45 (`reserve`, v3; the reserve goes into
// `final` and `toggles`, a B reserve marked for the rebuild it needs; a task with no inactive item
// is told the reserve is missing); every prediction below 0.30 is S5-3 (a fairness audit, then the
// pre-declared softening once): `final` stays the active set and the nearest set is printed as
// advisory only (F4); predictions on both sides are a coordinator ruling, named as such. An active
// item never observed (its arrival never fired) keeps the prior c_hat 0.5, with a note.
// S5-6, with --p90 (each task's refit p90 at its selected set, from `context-budget --lever`, for
// all four W5 tasks; ruling F5): first, a task whose p90 exceeds $3.00 (PER_TRIAL_BUDGET_USD) drops
// its most expensive lever item; then, while the four-task mean p90 exceeds $2.40
// (MEAN_P90_BUDGET_USD), the task with the highest p90 that still has an item drops one, each step
// printed (`steps`), until the mean holds or no item is left. Each drop lowers its task's p90 by the
// item's price: --item-cost, else the plan's sizing split of "$0.20-0.35 per trial at both active"
// (an A item, one event of about 4 requests, $0.20; a B item, one patient or document, $0.10;
// DEFAULT_ITEM_COST_USD). The most expensive item is the one priced highest, the later-declared
// among equals. `drops` is the order dropped, `drop` the first (null for none), `final` the set
// after them, `p90_after` the task's p90 after them. `toggles` says what moving from the active set
// to `final` changes: an A item is a LEVER and events.ts ACTIVE edit (no world rebuild) unless its
// declaration names a `world` field its toggle moves (results-inbox A: the inbox item's owner), in
// which case it needs fixtures:build like a B item; a B item (the reserve included) is a static
// chart record, so its toggle needs fixtures:build and moves every task's env_version (R40; a plan
// defect builder-300 found, so the output never says "no rebuild" for a B).
// Text on stdout by default; --json prints LeverSelectJson. Exit 0 on success, 1 when a run or
// the classes file cannot be read, 2 on a usage error. Nothing here selects by hand: the rule's
// numbers are in the output beside the pick.
import { existsSync, readFileSync } from 'node:fs';
import { PER_TRIAL_BUDGET_USD, money } from '../packages/core/cost.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import { type ClassesJson, classesJsonProblems, classesOf, type LeverRow, type TaskLever, taskLeverOf, uniqueRuns } from './classes.ts';
import { MEAN_P90_BUDGET_USD } from './context-budget.ts';

export const TARGET = 0.45;
export const BAND = [0.3, 0.6] as const;
// S5-2's "3-5 of 8" both-active passes, as a rate of the valid trials.
export const FREEZE_BAND = [3 / 8, 5 / 8] as const;
// S5-6's tasks: the four W5 tasks, so the mean line is the plan's.
export const W5_TASKS = 4;
// What a dropped item takes off its task's p90 when --item-cost does not price it (the header).
export const DEFAULT_ITEM_COST_USD = { A: 0.2, B: 0.1 } as const;

export interface ItemEstimate { id: string; kind: 'A' | 'B'; item: string; spec: string | null; active: boolean; passed: number; observed: number; c_hat: number | null; world: string | null }
export interface Prediction { set: string[]; pred: number; in_band: boolean }
export type Rule = 'S5-2' | 'S5-2 freeze' | 'S5-2 reserve' | 'S5-3' | 'S5-2 no set in band';
// `world`: the world field an A item's toggle moves (LeverItem.world), which makes it a rebuild too.
export interface Toggle { id: string; kind: 'A' | 'B'; on: boolean; rebuild: boolean; world: string | null }
export interface TaskSelection {
  trials: number;
  pass: number;
  base_pass: number;
  b_hat: number;
  items: ItemEstimate[];
  predictions: Prediction[];
  selected: string[];
  rule: Rule;
  freeze: boolean;
  reserve: boolean;
  // S5-6: the task's p90 as given, the items dropped in order (drop: the first, or null), the set
  // after them and the p90 after them.
  p90: number | null;
  drop: string | null;
  drops: string[];
  final: string[];
  p90_after: number | null;
  // Each item `final` switches on or off against the active set, and what the switch costs.
  toggles: Toggle[];
  notes: string[];
}
export interface LeverSelectJson {
  schema_version: 1;
  source: string[];
  tasks: Record<string, TaskSelection>;
  // Tasks of the classes JSON without lever items.
  skipped: string[];
  // The mean of the p90s given, before and after the S5-6 drops; null without --p90.
  mean_p90: number | null;
  mean_p90_after: number | null;
  // Each S5-6 drop, in order.
  steps: string[];
}

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
  // The classes JSON of run directories; default classesOf.
  classes?: (runs: readonly string[]) => Promise<ClassesJson>;
  // The checkout's lever declaration of a task (for an item's `world` when the run's rows, pinned
  // at an older commit, carry none); default taskLeverOf, null for a task the checkout lacks.
  lever?: (task: string) => Promise<TaskLever | null>;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const USAGE = 'usage: pnpm cli lever-select <run>[,<run>...] | --classes <classes.json> [--p90 <task=usd,...>] [--item-cost <task.item=usd,...>] [--json]';

const setText = (set: readonly string[]) => `{${set.join(',')}}`;
const near = (p: number) => Math.abs(p - TARGET);
const EPS = 1e-9;

type Costs = Readonly<Record<string, number>>;

// S5-2 for one task; `cost` is the task's --item-cost prices, for the one-size tie-break.
export function select(t: Pick<ClassesJson['tasks'][string], 'trials_valid' | 'pass'> & { lever: { base_pass: number; items: readonly LeverRow[] } }, cost: Costs = {}): Omit<TaskSelection, 'p90' | 'drop' | 'drops' | 'final' | 'p90_after' | 'toggles'> {
  const n = t.trials_valid;
  const b_hat = (t.lever.base_pass + 1) / (n + 2);
  const notes: string[] = [];
  const items = t.lever.items.map((i): ItemEstimate => ({ id: i.id, kind: i.kind, item: i.item, spec: i.spec, active: i.active, passed: i.passed, observed: i.observed, c_hat: i.active ? (i.passed + 1) / (i.observed + 2) : null, world: i.world ?? null }));
  for (const i of items) if (i.active && i.observed === 0) notes.push(`${i.id} was never observed (${i.kind === 'A' ? 'its arrival never fired' : 'no valid trial'}): its c_hat is the prior 0.5`);
  const active = items.filter((i) => i.active);
  const predictions: Prediction[] = [];
  for (let mask = 1; mask < 1 << active.length; mask++) {
    const set = active.filter((_, k) => mask & (1 << k));
    const pred = b_hat * set.reduce((p, i) => p * (i.c_hat as number), 1);
    predictions.push({ set: set.map((i) => i.id), pred, in_band: pred >= BAND[0] - EPS && pred <= BAND[1] + EPS });
  }
  // Nearest 0.45; a tie prefers the larger set, then (F4) the lower --item-cost when every item of
  // both sets is priced, then more A items, then declaration order. `tie` records how the best and
  // its runner-up were separated when they tied on distance and size.
  const priced = (set: readonly string[]) => (set.every((id) => cost[id] !== undefined) ? set.reduce((s, id) => s + (cost[id] as number), 0) : null);
  const aCount = (set: readonly string[]) => set.filter((id) => items.find((i) => i.id === id)!.kind === 'A').length;
  const better = (x: Prediction, y: Prediction): number => {
    if (Math.abs(near(x.pred) - near(y.pred)) > EPS) return near(x.pred) - near(y.pred);
    if (x.set.length !== y.set.length) return y.set.length - x.set.length;
    const [px, py] = [priced(x.set), priced(y.set)];
    if (px !== null && py !== null && px !== py) return px - py;
    return aCount(y.set) - aCount(x.set);
  };
  // `x` won over `y`; the two are named in enumeration order, the winner after the colon. Equal
  // predictions tie at that value; two predictions equally far from 0.45 on opposite sides are each
  // named with its value, and when both are outside the band (a straddle) the tie is quoted as R44
  // does, by the distance from the band's nearer edge (the same ranking as the distance from 0.45).
  const bandDist = (p: number) => (p < BAND[0] ? BAND[0] - p : p > BAND[1] ? p - BAND[1] : 0);
  const tieNote = (x: Prediction, y: Prediction): string | null => {
    if (Math.abs(near(x.pred) - near(y.pred)) > EPS || x.set.length !== y.set.length) return null;
    const [first, second] = predictions.indexOf(x) < predictions.indexOf(y) ? [x, y] : [y, x];
    const outside = !x.in_band && !y.in_band;
    const pair = Math.abs(x.pred - y.pred) <= EPS
      ? `${setText(first.set)} and ${setText(second.set)} tie at ${x.pred.toFixed(3)}: ${setText(x.set)}`
      : `${setText(first.set)} ${first.pred.toFixed(3)} and ${setText(second.set)} ${second.pred.toFixed(3)} tie at ${outside ? `${bandDist(x.pred).toFixed(3)} from the band [${BAND[0].toFixed(2)}, ${BAND[1].toFixed(2)}]` : `${near(x.pred).toFixed(3)} from ${TARGET}`}: ${setText(x.set)}`;
    const [px, py] = [priced(x.set), priced(y.set)];
    if (px !== null && py !== null && px !== py) return `${pair} (lower projected p90 by --item-cost, ${money(px)} vs ${money(py)})`;
    if (aCount(x.set) !== aCount(y.set)) return `${pair} (the measured mechanism)`;
    return `${pair} (declaration order)`;
  };
  const nearest = (xs: readonly Prediction[]): Prediction[] => [...xs].sort(better);
  const inBand = predictions.filter((p) => p.in_band);
  const all = active.map((i) => i.id);
  const passRate = n > 0 ? t.pass / n : 0;
  let rule: Rule;
  let selected: string[];
  let freeze = false;
  let reserve = false;
  if (predictions.length === 0) {
    rule = 'S5-2 no set in band';
    selected = [];
    notes.push('no active lever item: nothing to select');
  } else if (inBand.length > 0) {
    const [best, runnerUp] = nearest(inBand);
    selected = best!.set;
    const full = selected.length === all.length;
    freeze = full && passRate >= FREEZE_BAND[0] - EPS && passRate <= FREEZE_BAND[1] + EPS;
    rule = freeze ? 'S5-2 freeze' : 'S5-2';
    if (freeze) notes.push(`both-active PASS ${t.pass}/${n} is 3-5 of 8 and ${setText(all)} is selected: freeze v2, no pilot-5b`);
    else notes.push('nearest 0.45 inside [0.30, 0.60]');
    const tie = runnerUp === undefined ? null : tieNote(best!, runnerUp);
    if (tie !== null) notes.push(tie);
  } else {
    // Out of band the nearest set can still be a tie (R44: {A} 0.090 and {B} 0.810 are both 0.360
    // from 0.45), broken the same way and named the same way (P5A-230 M1).
    const [best, runnerUp] = nearest(predictions);
    selected = best!.set;
    const tie = runnerUp === undefined ? null : tieNote(best!, runnerUp);
    const nearestText = `${setText(selected)} is nearest 0.45${tie === null ? '' : ', by the tie-break'}`;
    if (predictions.every((p) => p.pred > BAND[1])) {
      rule = 'S5-2 reserve';
      reserve = true;
      notes.push(`every prediction is above 0.60: activate the reserve alongside ${setText(selected)}, v3${tie === null ? '' : ` (${nearestText})`}`);
    } else if (predictions.every((p) => p.pred < BAND[0])) {
      rule = 'S5-3';
      notes.push(`every prediction is below 0.30: S5-3 (fairness audit, then the pre-declared softening once, v3); ${nearestText}`);
    } else {
      rule = 'S5-2 no set in band';
      notes.push(`no set is inside [0.30, 0.60] and the predictions straddle it: coordinator ruling; ${nearestText}`);
    }
    if (tie !== null) notes.push(tie);
  }
  return { trials: n, pass: t.pass, base_pass: t.lever.base_pass, b_hat, items, predictions, selected, rule, freeze, reserve, notes };
}

// What one item takes off its task's p90 when dropped.
const priceOf = (t: TaskSelection, id: string, cost: Costs): number => cost[id] ?? DEFAULT_ITEM_COST_USD[t.items.find((i) => i.id === id)!.kind];

// The most expensive item of a set: the highest price, the later-declared among equals.
function mostExpensive(t: TaskSelection, cost: Costs): string | null {
  if (t.final.length === 0) return null;
  const rank = (id: string) => [priceOf(t, id, cost), t.items.findIndex((i) => i.id === id)] as const;
  return [...t.final].sort((a, b) => rank(b)[0] - rank(a)[0] || rank(b)[1] - rank(a)[1])[0]!;
}

// S5-6 over the selections, in place: the per-task cap, then the mean loop (the header). Returns
// the mean before and after the drops and each step; nulls when no --p90 was given.
export function applyCost(tasks: Record<string, TaskSelection>, p90: Costs, cost: Readonly<Record<string, Costs>>): { before: number | null; after: number | null; steps: string[] } {
  const given = Object.keys(tasks).filter((id) => p90[id] !== undefined);
  const steps: string[] = [];
  if (given.length === 0) return { before: null, after: null, steps };
  const current: Record<string, number> = {};
  for (const id of given) {
    tasks[id]!.p90 = p90[id]!;
    tasks[id]!.p90_after = p90[id]!;
    current[id] = p90[id]!;
  }
  const kindText = (t: TaskSelection, id: string) => (t.items.find((i) => i.id === id)!.kind === 'A' ? 'an A item, one event' : 'a B item, one patient or document');
  // Drops `id`'s most expensive item; `why` ends in "drops". Returns the item and its price, or null.
  const drop = (id: string, why: string): { item: string; price: number } | null => {
    const t = tasks[id]!;
    const item = mostExpensive(t, cost[id] ?? {});
    if (item === null) {
      t.notes.push(`${why} nothing: no lever item is left to drop`);
      return null;
    }
    const price = priceOf(t, item, cost[id] ?? {});
    t.drops.push(item);
    t.drop ??= item;
    t.final = t.final.filter((x) => x !== item);
    current[id] = Math.max(0, (current[id] as number) - price);
    t.p90_after = current[id]!;
    t.notes.push(`${why} ${item} (${kindText(t, item)}, ${money(price)}); p90 ${money(current[id]!)} after it${t.final.length === 0 ? '; no lever item is left' : ''}`);
    return { item, price };
  };
  const mean = () => given.reduce((s, id) => s + (current[id] as number), 0) / given.length;
  const before = mean();
  for (const id of given) {
    if (p90[id]! > PER_TRIAL_BUDGET_USD) {
      const d = drop(id, `p90 ${money(p90[id]!)} exceeds ${money(PER_TRIAL_BUDGET_USD)}: drops`);
      if (d !== null) steps.push(`${id}: p90 ${money(p90[id]!)} exceeds ${money(PER_TRIAL_BUDGET_USD)}: drops ${d.item} (${money(d.price)}), p90 ${money(current[id]!)}`);
    }
  }
  while (mean() > MEAN_P90_BUDGET_USD + EPS) {
    const m = mean();
    const byP90 = [...given].sort((a, b) => (current[b] as number) - (current[a] as number) || given.indexOf(a) - given.indexOf(b));
    const highest = byP90[0]!;
    const candidate = byP90.find((id) => tasks[id]!.final.length > 0);
    if (candidate === undefined) {
      steps.push(`mean p90 ${money(m)} exceeds ${money(MEAN_P90_BUDGET_USD)} and no task has a lever item left: user decision`);
      break;
    }
    const who = candidate === highest ? `${candidate} has the highest p90` : `${candidate} has the highest p90 with an item left`;
    const d = drop(candidate, `mean p90 ${money(m)} over ${given.length} tasks exceeds ${money(MEAN_P90_BUDGET_USD)}: ${who} and drops`)!;
    steps.push(`mean p90 ${money(m)} exceeds ${money(MEAN_P90_BUDGET_USD)}: ${who} and drops ${d.item} (${money(d.price)}), p90 ${money(current[candidate]!)}; mean ${money(mean())}`);
  }
  return { before, after: mean(), steps };
}

function parsePairs(spec: string, what: string, key: RegExp): Record<string, number> | string {
  const out: Record<string, number> = {};
  for (const part of spec.split(',')) {
    const at = part.lastIndexOf('=');
    const k = at < 0 ? '' : part.slice(0, at);
    const v = at < 0 ? '' : part.slice(at + 1);
    if (!key.test(k) || !/^[0-9]+(\.[0-9]+)?$/.test(v)) return `${what} takes ${what === '--p90' ? 'task=usd' : 'task.item=usd'},...; got ${JSON.stringify(part)}`;
    out[k] = Number(v);
  }
  return out;
}

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  const usage = (problem: string) => (deps.err(`lever-select: ${problem}`), deps.err(USAGE), 2);
  const opts = new Map<string, string>();
  const positional: string[] = [];
  const WITH_VALUE = new Set(['--classes', '--p90', '--item-cost']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (WITH_VALUE.has(a)) {
      const v = args[++i];
      if (v === undefined || v.startsWith('--')) return usage(`${a} needs a value`);
      opts.set(a, v);
    } else if (a === '--json') opts.set(a, '');
    else if (a.startsWith('--')) return usage(`unknown option ${a}`);
    else positional.push(a);
  }
  const file = opts.get('--classes');
  if ((file === undefined) === (positional.length === 0)) return usage('give run directories or --classes <file>, not both');
  const p90 = opts.has('--p90') ? parsePairs(opts.get('--p90') as string, '--p90', /^[A-Za-z0-9_-]+$/) : {};
  if (typeof p90 === 'string') return usage(p90);
  const costs = opts.has('--item-cost') ? parsePairs(opts.get('--item-cost') as string, '--item-cost', /^[A-Za-z0-9_-]+\.[^.=]+$/) : {};
  if (typeof costs === 'string') return usage(costs);

  let classes: ClassesJson;
  let source: string[];
  try {
    if (file !== undefined) {
      if (!existsSync(file)) throw new Error(`${file}: no such file`);
      classes = JSON.parse(readFileSync(file, 'utf8')) as ClassesJson;
      const problems = classesJsonProblems(classes);
      if (problems.length > 0) throw new Error(`${file}: not a classes JSON (${problems.join('; ')})`);
      source = [file];
    } else {
      source = uniqueRuns(positional.flatMap((p) => p.split(',')).filter((s) => s !== ''), (l) => deps.err(`lever-select: ${l}`));
      classes = await (deps.classes ?? classesOf)(source);
    }
  } catch (e) {
    deps.err(`lever-select: ${(e as Error).message}`);
    return 1;
  }

  // --item-cost by task, checked against the lever items once the tasks are known.
  const cost: Record<string, Record<string, number>> = {};
  for (const [k, v] of Object.entries(costs)) (cost[k.slice(0, k.indexOf('.'))] ??= {})[k.slice(k.indexOf('.') + 1)] = v;

  const tasks: Record<string, TaskSelection> = {};
  const skipped: string[] = [];
  for (const [id, t] of Object.entries(classes.tasks)) {
    if (t.lever === undefined) {
      skipped.push(id);
      continue;
    }
    const sel = select({ trials_valid: t.trials_valid, pass: t.pass, lever: t.lever }, cost[id] ?? {});
    const active = sel.items.filter((i) => i.active).map((i) => i.id);
    const inactive = sel.items.filter((i) => !i.active).map((i) => i.id);
    // F1: the reserve (the inactive items) joins the set; F4: S5-3 changes nothing.
    let final = [...sel.selected];
    if (sel.reserve) {
      if (inactive.length === 0) sel.notes.push('no inactive reserve item is declared: the reserve is missing');
      else final = [...final, ...inactive];
    }
    if (sel.rule === 'S5-3') {
      const advisory = [...active.filter((x) => !sel.selected.includes(x)).map((x) => `toggling ${x} off`), ...sel.selected.filter((x) => !active.includes(x)).map((x) => `toggling ${x} on`)];
      sel.notes.push(`S5-3 changes no item: final stays the active set ${setText(active)}; ${setText(sel.selected)} is nearest 0.45, advisory only${advisory.length > 0 ? ` (${advisory.join(', ')})` : ''}`);
      final = [...active];
    }
    tasks[id] = { ...sel, p90: null, drop: null, drops: [], final, p90_after: null, toggles: [] };
  }
  const stray = Object.keys(p90).filter((id) => tasks[id] === undefined);
  if (stray.length > 0) return usage(`--p90 names ${stray.join(', ')}, which ${stray.length === 1 ? 'is not a task' : 'are not tasks'} with lever items here`);
  const givenP90 = Object.keys(p90);
  if (givenP90.length > 0 && givenP90.length !== W5_TASKS) return usage(`S5-6's mean is over the four W5 tasks: give --p90 for all four (got ${givenP90.length}: ${givenP90.join(', ')})`);
  for (const [task, items] of Object.entries(cost)) {
    for (const item of Object.keys(items)) if (tasks[task] === undefined || !tasks[task].items.some((i) => i.id === item)) return usage(`--item-cost names ${task}.${item}, which is not a lever item of a task here`);
  }
  const { before: mean_p90, after: mean_p90_after, steps } = applyCost(tasks, p90, cost);
  for (const [id, t] of Object.entries(tasks)) {
    const active = t.items.filter((i) => i.active).map((i) => i.id);
    const kindOf = (x: string) => t.items.find((i) => i.id === x)!.kind;
    // An A item's `world` (W5S-232 F2): from the run's rows, else the checkout's declaration (a
    // historical run's pinned rows predate the field).
    let decl: TaskLever | null = null;
    try {
      decl = await (deps.lever ?? taskLeverOf)(id);
    } catch {
      decl = null;
    }
    const worldOf = (x: string): string | null => t.items.find((i) => i.id === x)!.world ?? decl?.items.find((i) => i.id === x)?.world ?? null;
    t.toggles = [...active.filter((x) => !t.final.includes(x)).map((x) => ({ id: x, on: false })), ...t.final.filter((x) => !active.includes(x)).map((x) => ({ id: x, on: true }))]
      .map(({ id: x, on }): Toggle => ({ id: x, kind: kindOf(x), on, rebuild: kindOf(x) === 'B' || worldOf(x) !== null, world: worldOf(x) }));
    const flip = (x: Toggle) => `${x.id} ${x.on ? 'on' : 'off'}`;
    const statics = t.toggles.filter((x) => x.kind === 'B');
    if (statics.length > 0) t.notes.push(`toggling ${statics.map(flip).join(', ')} changes static chart records: fixtures:build, and every task's env_version moves (R40)`);
    for (const x of t.toggles.filter((y) => y.kind === 'A' && y.world !== null)) t.notes.push(`toggling ${flip(x)} moves a world field, ${x.world}: fixtures:build, and every task's env_version moves (R40)`);
    const a = t.toggles.filter((x) => !x.rebuild);
    if (a.length > 0) t.notes.push(`toggling ${a.map(flip).join(', ')} is a LEVER and events.ts ACTIVE edit (this task's env_version moves)`);
  }

  if (opts.has('--json')) {
    deps.out(JSON.stringify({ schema_version: 1, source, tasks, skipped, mean_p90, mean_p90_after, steps } satisfies LeverSelectJson, null, 1));
    return 0;
  }
  for (const [id, t] of Object.entries(tasks)) {
    deps.out(`${id}: ${t.trials} valid trials, PASS ${t.pass}/${t.trials}; b_hat ${t.b_hat.toFixed(3)} (${t.base_pass} passed every non-lever item)`);
    for (const i of t.items) {
      deps.out(i.active
        ? `  ${i.id} (${i.kind} item on ${i.item}${i.spec === null ? '' : `, event ${i.spec}`}): passed ${i.passed} of ${i.observed} observed, c_hat ${(i.c_hat as number).toFixed(3)}`
        : `  ${i.id} (${i.kind} item on ${i.item}): inactive, not a candidate`);
    }
    if (t.predictions.length > 0) deps.out(`  ${t.predictions.map((p) => `${setText(p.set)} ${p.pred.toFixed(3)} ${p.in_band ? 'in band' : p.pred > BAND[1] ? 'above' : 'below'}`).join('; ')}`);
    const [first, ...rest] = t.notes;
    deps.out(`  selected ${setText(t.selected)}: ${t.rule}${first === undefined ? '' : ` (${first})`}`);
    for (const n of rest) deps.out(`  ${n}`);
    if (t.p90 !== null) deps.out(`  S5-6: p90 ${money(t.p90)}, ${t.drops.length === 0 ? 'no drop' : `drops ${t.drops.join(', ')}`}, p90 ${money(t.p90_after as number)} after`);
    deps.out(`  final ${setText(t.final)}`);
  }
  for (const id of skipped) deps.out(`${id}: no lever items; skipped`);
  for (const s of steps) deps.out(`S5-6 step: ${s}`);
  if (mean_p90 !== null) deps.out(`mean p90 ${money(mean_p90)} over ${Object.keys(p90).length} tasks before S5-6, ${money(mean_p90_after as number)} after (line ${money(MEAN_P90_BUDGET_USD)})`);
  return 0;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};
