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
// S5-2 picks the set nearest 0.45 inside [0.30, 0.60]; on a tie the larger set. When the
// both-active PASS count is 3-5 of 8 (as a rate, 0.375-0.625 of the valid trials) and the full
// active set is picked, the task freezes on it with no pilot-5b (`freeze`). When no set is inside
// the band: every prediction above 0.60 activates the reserve alongside the set nearest 0.45
// (`reserve`, v3); every prediction below 0.30 is S5-3 (a fairness audit, then the pre-declared
// softening once); predictions on both sides are a coordinator ruling, named as such. An active
// item never observed (its arrival never fired) keeps the prior c_hat 0.5, with a note.
// S5-6, with --p90 (each task's refit p90 at its selected set, from `context-budget --lever`):
// a task whose p90 exceeds $3.00 (PER_TRIAL_BUDGET_USD) drops its most expensive lever item; when
// the mean p90 over the tasks given exceeds $2.40 (MEAN_P90_BUDGET_USD), the task with the highest
// p90 drops its most expensive item, once (a task that already dropped one drops no second). The
// most expensive item is the one --item-cost prices highest, else an A item before a B (an A adds
// one event, about 4 requests; a B one patient or document, 1-3), the later-declared among equals.
// `final` is the set after S5-6; `drop` the item dropped, or null. `toggles` says what moving from
// the active set to `final` changes: an A item is a LEVER and events.ts ACTIVE edit (no world
// rebuild); a B item (the reserve included) is a static chart record, so its toggle needs
// fixtures:build and moves every task's env_version (R40; a plan defect builder-300 found, so the
// output never says "no rebuild" for a B).
// Text on stdout by default; --json prints LeverSelectJson. Exit 0 on success, 1 when a run or
// the classes file cannot be read, 2 on a usage error. Nothing here selects by hand: the rule's
// numbers are in the output beside the pick.
import { existsSync, readFileSync } from 'node:fs';
import { PER_TRIAL_BUDGET_USD, money } from '../packages/core/cost.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import { type ClassesJson, classesJsonProblems, classesOf, type LeverRow, uniqueRuns } from './classes.ts';
import { MEAN_P90_BUDGET_USD } from './context-budget.ts';

export const TARGET = 0.45;
export const BAND = [0.3, 0.6] as const;
// S5-2's "3-5 of 8" both-active passes, as a rate of the valid trials.
export const FREEZE_BAND = [3 / 8, 5 / 8] as const;

export interface ItemEstimate { id: string; kind: 'A' | 'B'; item: string; spec: string | null; active: boolean; passed: number; observed: number; c_hat: number | null }
export interface Prediction { set: string[]; pred: number; in_band: boolean }
export type Rule = 'S5-2' | 'S5-2 freeze' | 'S5-2 reserve' | 'S5-3' | 'S5-2 no set in band';
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
  // S5-6: the task's p90 as given, the item dropped, and the set after the drop.
  p90: number | null;
  drop: string | null;
  final: string[];
  // Each item `final` switches on or off against the active set, and what the switch costs.
  toggles: Array<{ id: string; kind: 'A' | 'B'; on: boolean; rebuild: boolean }>;
  notes: string[];
}
export interface LeverSelectJson {
  schema_version: 1;
  source: string[];
  tasks: Record<string, TaskSelection>;
  // Tasks of the classes JSON without lever items.
  skipped: string[];
  // The mean of the p90s given, null without --p90.
  mean_p90: number | null;
}

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
  // The classes JSON of run directories; default classesOf.
  classes?: (runs: readonly string[]) => Promise<ClassesJson>;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const USAGE = 'usage: pnpm cli lever-select <run>[,<run>...] | --classes <classes.json> [--p90 <task=usd,...>] [--item-cost <task.item=usd,...>] [--json]';

const setText = (set: readonly string[]) => `{${set.join(',')}}`;
const near = (p: number) => Math.abs(p - TARGET);
const EPS = 1e-9;

// S5-2 for one task.
export function select(t: Pick<ClassesJson['tasks'][string], 'trials_valid' | 'pass'> & { lever: { base_pass: number; items: readonly LeverRow[] } }): Omit<TaskSelection, 'p90' | 'drop' | 'final' | 'toggles'> {
  const n = t.trials_valid;
  const b_hat = (t.lever.base_pass + 1) / (n + 2);
  const notes: string[] = [];
  const items = t.lever.items.map((i): ItemEstimate => ({ id: i.id, kind: i.kind, item: i.item, spec: i.spec, active: i.active, passed: i.passed, observed: i.observed, c_hat: i.active ? (i.passed + 1) / (i.observed + 2) : null }));
  for (const i of items) if (i.active && i.observed === 0) notes.push(`${i.id} was never observed (${i.kind === 'A' ? 'its arrival never fired' : 'no valid trial'}): its c_hat is the prior 0.5`);
  const active = items.filter((i) => i.active);
  const predictions: Prediction[] = [];
  for (let mask = 1; mask < 1 << active.length; mask++) {
    const set = active.filter((_, k) => mask & (1 << k));
    const pred = b_hat * set.reduce((p, i) => p * (i.c_hat as number), 1);
    predictions.push({ set: set.map((i) => i.id), pred, in_band: pred >= BAND[0] - EPS && pred <= BAND[1] + EPS });
  }
  const nearest = (xs: readonly Prediction[]) => [...xs].sort((x, y) => (Math.abs(near(x.pred) - near(y.pred)) <= EPS ? y.set.length - x.set.length : near(x.pred) - near(y.pred)))[0];
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
    selected = nearest(inBand)!.set;
    const full = selected.length === all.length;
    freeze = full && passRate >= FREEZE_BAND[0] - EPS && passRate <= FREEZE_BAND[1] + EPS;
    rule = freeze ? 'S5-2 freeze' : 'S5-2';
    if (freeze) notes.push(`both-active PASS ${t.pass}/${n} is 3-5 of 8 and ${setText(all)} is selected: freeze v2, no pilot-5b`);
    else notes.push('nearest 0.45 inside [0.30, 0.60]');
  } else {
    selected = nearest(predictions)!.set;
    if (predictions.every((p) => p.pred > BAND[1])) {
      rule = 'S5-2 reserve';
      reserve = true;
      notes.push(`every prediction is above 0.60: activate the reserve alongside ${setText(selected)}, v3`);
    } else if (predictions.every((p) => p.pred < BAND[0])) {
      rule = 'S5-3';
      notes.push(`every prediction is below 0.30: S5-3 (fairness audit, then the pre-declared softening once, v3); ${setText(selected)} is nearest 0.45`);
    } else {
      rule = 'S5-2 no set in band';
      notes.push(`no set is inside [0.30, 0.60] and the predictions straddle it: coordinator ruling; ${setText(selected)} is nearest 0.45`);
    }
  }
  return { trials: n, pass: t.pass, base_pass: t.lever.base_pass, b_hat, items, predictions, selected, rule, freeze, reserve, notes };
}

// The most expensive item of a set: by --item-cost, else an A before a B, the later-declared first.
function mostExpensive(set: readonly string[], items: readonly ItemEstimate[], cost: Readonly<Record<string, number>>): string | null {
  if (set.length === 0) return null;
  const rank = (id: string) => {
    const i = items.find((x) => x.id === id)!;
    return [cost[id] ?? (i.kind === 'A' ? 1 : 0), items.indexOf(i)] as const;
  };
  return [...set].sort((a, b) => rank(b)[0] - rank(a)[0] || rank(b)[1] - rank(a)[1])[0]!;
}

// S5-6 over the selections, in place.
export function applyCost(tasks: Record<string, TaskSelection>, p90: Readonly<Record<string, number>>, cost: Readonly<Record<string, Record<string, number>>>): number | null {
  const given = Object.keys(tasks).filter((id) => p90[id] !== undefined);
  if (given.length === 0) return null;
  // `prefix` ends in "drops"; the item and its kind follow.
  const drop = (id: string, prefix: string) => {
    const t = tasks[id]!;
    const item = mostExpensive(t.final, t.items, cost[id] ?? {});
    if (item === null) {
      t.notes.push(`${prefix} nothing: no lever item is left to drop`);
      return;
    }
    const kind = t.items.find((i) => i.id === item)!.kind;
    t.drop = item;
    t.final = t.final.filter((x) => x !== item);
    t.notes.push(`${prefix} ${item} (${kind === 'A' ? 'an A item, one event' : 'a B item, one patient or document'})${t.final.length === 0 ? '; no lever item is left' : ''}`);
  };
  for (const id of given) {
    tasks[id]!.p90 = p90[id]!;
    if (p90[id]! > PER_TRIAL_BUDGET_USD) drop(id, `p90 ${money(p90[id]!)} exceeds ${money(PER_TRIAL_BUDGET_USD)}: drops`);
  }
  const mean = given.reduce((s, id) => s + p90[id]!, 0) / given.length;
  if (mean > MEAN_P90_BUDGET_USD) {
    const highest = given.reduce((best, id) => (p90[id]! > p90[best]! ? id : best), given[0]!);
    const why = `mean p90 ${money(mean)} over ${given.length} tasks exceeds ${money(MEAN_P90_BUDGET_USD)}: ${highest} has the highest p90`;
    if (tasks[highest]!.drop !== null) tasks[highest]!.notes.push(`${why} and already dropped ${tasks[highest]!.drop}; no second drop (re-measure p90 after it)`);
    else drop(highest, `${why} and drops`);
  }
  return mean;
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

  const tasks: Record<string, TaskSelection> = {};
  const skipped: string[] = [];
  for (const [id, t] of Object.entries(classes.tasks)) {
    if (t.lever === undefined) {
      skipped.push(id);
      continue;
    }
    tasks[id] = { ...select({ trials_valid: t.trials_valid, pass: t.pass, lever: t.lever }), p90: null, drop: null, final: [], toggles: [] };
    tasks[id].final = [...tasks[id].selected];
  }
  const stray = Object.keys(p90).filter((id) => tasks[id] === undefined);
  if (stray.length > 0) return usage(`--p90 names ${stray.join(', ')}, which ${stray.length === 1 ? 'is not a task' : 'are not tasks'} with lever items here`);
  const cost: Record<string, Record<string, number>> = {};
  for (const [k, v] of Object.entries(costs)) {
    const [task, item] = [k.slice(0, k.indexOf('.')), k.slice(k.indexOf('.') + 1)];
    if (tasks[task] === undefined || !tasks[task].items.some((i) => i.id === item)) return usage(`--item-cost names ${k}, which is not a lever item of a task here`);
    (cost[task] ??= {})[item] = v;
  }
  const mean_p90 = applyCost(tasks, p90, cost);
  for (const t of Object.values(tasks)) {
    const active = t.items.filter((i) => i.active).map((i) => i.id);
    t.toggles = [...active.filter((id) => !t.final.includes(id)).map((id) => ({ id, on: false })), ...t.final.filter((id) => !active.includes(id)).map((id) => ({ id, on: true }))]
      .map(({ id, on }) => ({ id, kind: t.items.find((i) => i.id === id)!.kind, on, rebuild: t.items.find((i) => i.id === id)!.kind === 'B' }));
    const rebuild = t.toggles.filter((x) => x.rebuild);
    if (rebuild.length > 0) t.notes.push(`toggling ${rebuild.map((x) => `${x.id} ${x.on ? 'on' : 'off'}`).join(', ')} changes static chart records: fixtures:build, and every task's env_version moves (R40)`);
    const a = t.toggles.filter((x) => !x.rebuild);
    if (a.length > 0) t.notes.push(`toggling ${a.map((x) => `${x.id} ${x.on ? 'on' : 'off'}`).join(', ')} is a LEVER and events.ts ACTIVE edit (this task's env_version moves)`);
  }

  if (opts.has('--json')) {
    deps.out(JSON.stringify({ schema_version: 1, source, tasks, skipped, mean_p90 } satisfies LeverSelectJson, null, 1));
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
    if (t.p90 !== null) deps.out(`  S5-6: p90 ${money(t.p90)}, ${t.drop === null ? 'no drop' : `drops ${t.drop}`}; final ${setText(t.final)}`);
  }
  for (const id of skipped) deps.out(`${id}: no lever items; skipped`);
  if (mean_p90 !== null) deps.out(`mean p90 ${money(mean_p90)} over ${Object.keys(p90).length} tasks (S5-6 line ${money(MEAN_P90_BUDGET_USD)})`);
  return 0;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};
