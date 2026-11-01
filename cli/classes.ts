// pnpm cli classes <run>[,<run>...] [--json]
// The class table of plan-amendment-w4 (PW4-H0b): every class, event, q and split number in the
// W4 route comes from records, never by hand. Per task, over the settled records of every run given
// (trials/; re-queued attempts are not counted), read at their current grade (summary.ts
// currentGrade: the last regrade when there is one):
// - pass count and Wilson 95% over valid trials (outcomes.ts isValid), and each trial's outcome;
// - the split of failed trials by fault (outcomes.ts FAULT and AUDIT_LABEL): model (FAIL, LIMIT,
//   REFUSAL), environment (ENV_*), grader (GRADER_ERROR), infra (INFRA_*, CANCELLED, INVALID);
// - per class, over valid trials: fails out of trials x instances, pass rate, Wilson 95%, and each
//   failure's label (trial: gate -> the grader's auto label, attribution.items; '?' when the current
//   grade is a regrade that changed the grade, because the labels belong to the recorded grade);
//   per instance, fails out of trials. An item fails a trial when any check marks it not met.
//   base_fails leaves out the event gates (EVENT_GATES): it is the base list's own failure count;
// - the 'outside' pseudo-item's failures apart from the classes;
// - independence (descriptive): trials where every item passed against trials x the product of
//   each item's pass rate, and trials x the product of the class pass rates;
// - per event spec (tasks/<id>/events.ts SPECS and ACTIVE, PW4-E1): the trials it fired in (an
//   env_event line in the trajectory names its spec), and of those the fails, the trials that saw
//   it (no event_seen or event_delivered failure) and, for an amend event (A, B, C, O), the amend
//   fails among the seen; a fired spec the checkout does not hold is listed with class null;
// - q: of the valid trials in which any event fired, those that saw every arrival;
// - guard fires: finish answers CONFLICT for a same-turn arrival, counted over every settled trial.
// An event gate failure is the event's when the check item names it ({event: <spec id>}); without a
// name, `kept` is the item's lure (class D) and every other event gate the item's other events,
// among the specs that fired in that trial.
// The item list and its classes come from the checkout's tasks/<id>/expected.ts: its ITEM_CLASSES
// export ([{key, class, label}] in list order) when it has one, otherwise the shape each of the six
// tasks has today. A valid trial whose graded items are not exactly that list (the checkout's list
// changed since the run) exits 1: counts against a different list would be wrong.
// Markdown on stdout by default, in classes.md's table form; --json prints ClassesJson.
// Exit 0 on success, 1 when a run or task cannot be read, 2 on a usage error.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installEgressGuard } from '../packages/core/egress.ts';
import { AUDIT_LABEL, FAULT, type Outcome } from '../packages/core/outcomes.ts';
import { currentGrade, type RegradeGrade, type SummaryCheck, wilson } from '../packages/core/summary.ts';
import { settledRecords, trajectoryOf } from './adapters/result-sink-node.ts';
import { TASKS_DIR } from './adapters/tasks-node.ts';

// ---- The JSON contract (schema_version 1). builder-276's result-card reads exactly these names.

export interface Interval { lo: number; hi: number }
export interface Label { trial: number; run: string; item: string; gate: string; label: string }
export interface InstanceRow { instance: number; item: string; label: string; fails: number; observations: number }
export interface ClassRow {
  class: string;
  fails: number;
  // Fails with the event gates left out.
  base_fails: number;
  observations: number;
  pass_rate: number | null;
  wilson: Interval | null;
  labels: Label[];
  instances: InstanceRow[];
}
export type EventClass = 'A' | 'B' | 'C' | 'O' | 'D';
export interface EventRow {
  id: string;
  item: string | null;
  class: EventClass | null;
  active: boolean;
  fired: number;
  fails: number;
  observations: number;
  // Pass-rate interval over the observations.
  wilson: Interval | null;
  labels: Label[];
  seen: number;
  amend_fails_seen: number;
}
export interface TaskClasses {
  trials_valid: number;
  pass: number;
  wilson: Interval | null;
  split: { model: number; environment: number; grader: number; infra: number };
  guard_fires: number;
  q: { trials: number; seen_all: number; rate: number } | null;
  classes: ClassRow[];
  events: EventRow[];
  outside_failures: Array<{ trial: number; run: string; gates: string[] }>;
  independence: { all_items_pass: number; expected_per_item: number; expected_per_class: number };
  outcomes: Array<{ trial: number; run: string; outcome: string }>;
}
export interface ClassesJson {
  schema_version: 1;
  run_dirs: string[];
  // The current grade's grader_version of each record, as recorded (a string).
  grader_versions: string[];
  tasks: Record<string, TaskClasses>;
}

// Every place a value breaks ClassesJson, as 'path: problem'; [] when it conforms.
export function classesJsonProblems(v: unknown): string[] {
  const out: string[] = [];
  const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const interval = (x: unknown) => x === null || (obj(x) && num(x.lo) && num(x.hi));
  const need = (o: Record<string, unknown>, path: string, fields: Record<string, (x: unknown) => boolean>) => {
    for (const [k, ok] of Object.entries(fields)) if (!(k in o) || !ok(o[k])) out.push(`${path}.${k}: missing or wrong type`);
  };
  const label = (x: unknown) => obj(x) && num(x.trial) && typeof x.gate === 'string' && typeof x.label === 'string';
  const arr = (each: (x: unknown) => boolean) => (x: unknown) => Array.isArray(x) && x.every(each);
  if (!obj(v)) return ['root: not an object'];
  if (v.schema_version !== 1) out.push('schema_version: expected 1');
  if (!arr((x) => typeof x === 'string')(v.run_dirs)) out.push('run_dirs: missing or wrong type');
  if (!arr((x) => typeof x === 'string')(v.grader_versions)) out.push('grader_versions: missing or wrong type');
  if (!obj(v.tasks)) return [...out, 'tasks: missing or wrong type'];
  for (const [id, t] of Object.entries(v.tasks)) {
    const p = `tasks.${id}`;
    if (!obj(t)) { out.push(`${p}: not an object`); continue; }
    need(t, p, {
      trials_valid: num, pass: num, wilson: interval, guard_fires: num,
      split: (x) => obj(x) && ['model', 'environment', 'grader', 'infra'].every((k) => num(x[k])),
      q: (x) => x === null || (obj(x) && num(x.trials) && num(x.seen_all) && num(x.rate)),
      classes: arr((c) => obj(c) && typeof c.class === 'string' && num(c.fails) && num(c.observations) && (c.pass_rate === null || num(c.pass_rate)) && interval(c.wilson)
        && arr(label)(c.labels) && arr((i) => obj(i) && num(i.instance) && typeof i.item === 'string' && typeof i.label === 'string' && num(i.fails) && num(i.observations))(c.instances)),
      events: arr((e) => obj(e) && typeof e.id === 'string' && (e.item === null || typeof e.item === 'string') && (e.class === null || typeof e.class === 'string')
        && typeof e.active === 'boolean' && num(e.fired) && num(e.fails) && num(e.observations) && interval(e.wilson) && arr(label)(e.labels)),
      outside_failures: arr((o) => obj(o) && num(o.trial) && arr((g) => typeof g === 'string')(o.gates)),
      independence: (x) => obj(x) && num(x.all_items_pass) && num(x.expected_per_item) && num(x.expected_per_class),
    });
  }
  return out;
}

// ---- Inputs.

export interface ItemClass { key: string; class: string; label: string }
export interface EventSpecLike { id: string; item: string; class: EventClass }
export interface TaskEvents { SPECS: readonly EventSpecLike[]; ACTIVE: readonly string[] }

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
  // A task's items in list order with their classes; default from the checkout (itemClassesOf).
  itemClasses?: (task: string) => Promise<ItemClass[]>;
  // A task's event specs and ACTIVE list, null when it has no tasks/<id>/events.ts.
  events?: (task: string) => Promise<TaskEvents | null>;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const USAGE = 'usage: pnpm cli classes <run>[,<run>...] [--json]';

// The gates of an event-bearing item (plan-amendment-w4 "Gates per event-bearing item").
export const EVENT_GATES = ['event_delivered', 'had_turn', 'event_seen', 'amended', 'amend_form', 'kept'] as const;
const EVENT_GATE_SET: ReadonlySet<string> = new Set(EVENT_GATES);
const SEEN_GATES: ReadonlySet<string> = new Set(['event_delivered', 'event_seen']);
const AMEND_CLASSES: ReadonlySet<string> = new Set(['A', 'B', 'C', 'O']);
// What finish answers when an event fired in the same turn (packages/env/events.ts, PW4-E1).
export const GUARD_TEXT = 'arrived in your queues';
// The pseudo-item task graders use for writes outside the list.
const OUTSIDE = 'outside';

type Row = { key: string; class: string; label: string };
type Mod = Record<string, unknown>;
type Rec = Record<string, unknown>;
const listOf = (x: unknown): Rec[] => (Array.isArray(x) ? (x as Rec[]) : []);
const itemsOf = (m: Mod): Rec[] => listOf((m.expected as { items?: unknown } | undefined)?.items);
const row = (key: unknown, cls: unknown, label: unknown): Row => ({ key: String(key), class: String(cls), label: String(label) });
// The shape each task's expected.ts has today, for a task without ITEM_CLASSES.
const ADAPTERS: Record<string, (m: Mod) => Row[]> = {
  'contrast-ct-prep': (m) => itemsOf(m).map((i) => row(i.patient, i.class, i.name)),
  'crc-care-gap': (m) => itemsOf(m).map((i) => row(i.patient, (m.classOf as (p: unknown) => string)(i.patient), i.name)),
  'discharge-medrec': (m) => itemsOf(m).map((i) => row(i.key, i.cls, i.key)),
  // m1..m13 in number order.
  'message-queue': (m) => [...listOf(m.ITEMS)].sort((a, b) => String(a.name).length - String(b.name).length || (String(a.name) < String(b.name) ? -1 : 1)).map((i) => row(i.item, i.klass, i.name)),
  'renal-dose-review': (m) => itemsOf(m).map((i) => row(i.patient, i.class, i.name)),
  'results-inbox': (m) => listOf(m.items).map((i) => row(i.key, i.class, i.key)),
};

export async function itemClassesOf(task: string, root: string = TASKS_DIR): Promise<ItemClass[]> {
  const file = join(root, task, 'expected.ts');
  if (!existsSync(file)) throw new Error(`tasks/${task}/expected.ts not found`);
  const m = (await import(pathToFileURL(file).href)) as Mod;
  const rows: Row[] | undefined = Array.isArray(m.ITEM_CLASSES) ? (m.ITEM_CLASSES as Row[]) : ADAPTERS[task]?.(m);
  if (rows === undefined) throw new Error(`tasks/${task}/expected.ts exports no ITEM_CLASSES ([{key, class, label}])`);
  for (const r of rows) if (typeof r.key !== 'string' || typeof r.class !== 'string' || typeof r.label !== 'string') throw new Error(`tasks/${task}: an item row lacks key, class or label`);
  return rows.map((r) => ({ key: r.key, class: r.class, label: r.label }));
}

export async function taskEventsOf(task: string, root: string = TASKS_DIR): Promise<TaskEvents | null> {
  const file = join(root, task, 'events.ts');
  if (!existsSync(file)) return null;
  const m = (await import(pathToFileURL(file).href)) as { SPECS?: unknown; ACTIVE?: unknown };
  if (!Array.isArray(m.SPECS) || !Array.isArray(m.ACTIVE)) throw new Error(`tasks/${task}/events.ts must export SPECS and ACTIVE`);
  return { SPECS: m.SPECS as EventSpecLike[], ACTIVE: m.ACTIVE as string[] };
}

// ---- One trial as the table reads it.

interface Trial {
  run: string;
  index: number;
  outcome: string;
  valid: boolean;
  // item -> failed gates, and per failed (item, gate) the event the check names, if any.
  failed: Map<string, string[]>;
  named: Map<string, string>;
  labels: Map<string, Array<{ gate: string; label: string }>>;
  items: Set<string>;
  fired: string[];
  guard: number;
}

interface CheckItem { item?: unknown; met?: unknown; event?: unknown }

function readTrajectory(file: string): { fired: string[]; guard: number } {
  if (!existsSync(file)) return { fired: [], guard: 0 };
  const fired: string[] = [];
  let guard = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"env_event"') && !line.includes('"finish"')) continue;
    const e = JSON.parse(line) as Record<string, unknown>;
    if (e.type === 'env_event') {
      const spec = e.spec ?? e.spec_id;
      if (typeof spec === 'string' && !fired.includes(spec)) fired.push(spec);
    } else if (e.type === 'tool_result' && e.name === 'finish' && e.error_code === 'CONFLICT' && JSON.stringify(e.content ?? '').includes(GUARD_TEXT)) guard++;
  }
  return { fired, guard };
}

// What the table reads of a settled record.
interface RawRecord {
  task_id?: unknown;
  index?: unknown;
  outcome?: unknown;
  grader_version?: unknown;
  trajectory?: string;
  checks?: SummaryCheck[] | null;
  regrades?: Array<RegradeGrade & { changed?: boolean; grader_version?: unknown }>;
  attribution?: { items?: Rec[] } | null;
}

function readTrial(dir: string, r: RawRecord): Trial {
  const grade = currentGrade({ outcome: String(r.outcome ?? ''), checks: r.checks ?? null, ...(Array.isArray(r.regrades) ? { regrades: r.regrades } : {}) });
  const failed = new Map<string, string[]>();
  const named = new Map<string, string>();
  const items = new Set<string>();
  for (const c of grade.checks ?? []) {
    for (const it of ((c as { items?: CheckItem[] }).items ?? [])) {
      if (typeof it.item !== 'string') continue;
      items.add(it.item);
      if (it.met === false) {
        failed.set(it.item, [...(failed.get(it.item) ?? []), c.id]);
        if (typeof it.event === 'string') named.set(`${it.item}\u0000${c.id}`, it.event);
      }
    }
  }
  const last = Array.isArray(r.regrades) ? r.regrades.at(-1) : undefined;
  const attribution = last !== undefined && last.changed ? null : r.attribution;
  const labels = new Map<string, Array<{ gate: string; label: string }>>();
  for (const a of attribution?.items ?? []) {
    if (typeof a.item !== 'string') continue;
    labels.set(a.item, [...(labels.get(a.item) ?? []), { gate: String(a.gate ?? '?'), label: String(a.auto ?? '?') }]);
  }
  const { fired, guard } = readTrajectory(trajectoryOf(dir, r as never));
  return { run: dir, index: Number(r.index), outcome: grade.outcome, valid: grade.valid, failed, named, labels, items, fired, guard };
}

function labelsOf(t: Trial, item: string, gates?: readonly string[]): Label[] {
  const failed = (t.failed.get(item) ?? []).filter((g) => gates === undefined || gates.includes(g));
  const own = (t.labels.get(item) ?? []).filter((l) => gates === undefined || gates.includes(l.gate));
  const rows = own.length > 0 ? own : failed.map((gate) => ({ gate, label: '?' }));
  return rows.map((l) => ({ trial: t.index, run: t.run, item, gate: l.gate, label: l.label }));
}

const product = (xs: number[]): number => xs.reduce((p, x) => p * x, 1);

export function tabulate(trials: readonly Trial[], items: readonly ItemClass[], events: TaskEvents | null): TaskClasses {
  const valid = trials.filter((t) => t.valid);
  const n = valid.length;
  const split = { model: 0, environment: 0, grader: 0, infra: 0 };
  for (const t of trials) {
    const fault = FAULT[t.outcome as Outcome] ?? null;
    if (fault === null) continue;
    const label = AUDIT_LABEL[fault];
    if (label === null) split.infra++;
    else split[label.label]++;
  }
  const failsItem = (t: Trial, key: string, base: boolean) => (t.failed.get(key) ?? []).some((g) => !base || !EVENT_GATE_SET.has(g));

  const order: string[] = [];
  for (const it of items) if (!order.includes(it.class)) order.push(it.class);
  const classes: ClassRow[] = order.map((cls) => {
    const its = items.filter((i) => i.class === cls);
    const instances = its.map((it, j) => ({ instance: j + 1, item: it.key, label: it.label, fails: valid.filter((t) => failsItem(t, it.key, false)).length, observations: n }));
    const fails = instances.reduce((s, i) => s + i.fails, 0);
    const base_fails = its.reduce((s, it) => s + valid.filter((t) => failsItem(t, it.key, true)).length, 0);
    const observations = n * its.length;
    const labels = its.flatMap((it) => valid.filter((t) => failsItem(t, it.key, false)).flatMap((t) => labelsOf(t, it.key)));
    return { class: cls, fails, base_fails, observations, pass_rate: observations > 0 ? 1 - fails / observations : null, wilson: wilson(observations - fails, observations), labels, instances };
  });

  // Events: the checkout's specs in SPECS order, then any spec that fired but the checkout lacks.
  const specs = new Map<string, EventSpecLike | null>((events?.SPECS ?? []).map((s) => [s.id, s]));
  for (const t of valid) for (const id of t.fired) if (!specs.has(id)) specs.set(id, null);
  // The failed event gates of a trial that belong to one spec.
  const gatesOf = (t: Trial, spec: EventSpecLike): string[] => (t.failed.get(spec.item) ?? []).filter((g) => {
    if (!EVENT_GATE_SET.has(g)) return false;
    const name = t.named.get(`${spec.item}\u0000${g}`);
    if (name !== undefined) return name === spec.id;
    const siblings = t.fired.map((id) => specs.get(id)).filter((s): s is EventSpecLike => !!s && s.item === spec.item);
    const lure = g === 'kept';
    return siblings.filter((s) => (s.class === 'D') === lure).some((s) => s.id === spec.id);
  });
  const eventRows: EventRow[] = [...specs].map(([id, spec]) => {
    const fired = valid.filter((t) => t.fired.includes(id));
    if (spec === null) return { id, item: null, class: null, active: false, fired: fired.length, fails: 0, observations: fired.length, wilson: wilson(fired.length, fired.length), labels: [], seen: 0, amend_fails_seen: 0 };
    const per = fired.map((t) => ({ t, gates: gatesOf(t, spec) }));
    const failing = per.filter((p) => p.gates.length > 0);
    const seen = per.filter((p) => !p.gates.some((g) => SEEN_GATES.has(g)));
    const amend_fails_seen = AMEND_CLASSES.has(spec.class) ? seen.filter((p) => p.gates.length > 0).length : 0;
    return {
      id, item: spec.item, class: spec.class, active: (events?.ACTIVE ?? []).includes(id), fired: fired.length,
      fails: failing.length, observations: fired.length, wilson: wilson(fired.length - failing.length, fired.length),
      labels: failing.flatMap((p) => labelsOf(p.t, spec.item, p.gates)), seen: seen.length, amend_fails_seen,
    };
  });
  const withArrival = valid.filter((t) => t.fired.length > 0);
  const sawAll = withArrival.filter((t) => t.fired.every((id) => {
    const spec = specs.get(id);
    return !spec || !gatesOf(t, spec).some((g) => SEEN_GATES.has(g));
  }));

  const keys = new Set(items.map((i) => i.key));
  const all_items_pass = valid.filter((t) => ![...t.failed.keys()].some((k) => keys.has(k))).length;
  const perItem = classes.flatMap((c) => c.instances.map((i) => (n > 0 ? 1 - i.fails / n : NaN)));
  return {
    trials_valid: n,
    pass: valid.filter((t) => t.outcome === 'PASS').length,
    wilson: wilson(valid.filter((t) => t.outcome === 'PASS').length, n),
    split,
    guard_fires: trials.reduce((s, t) => s + t.guard, 0),
    q: withArrival.length === 0 ? null : { trials: withArrival.length, seen_all: sawAll.length, rate: sawAll.length / withArrival.length },
    classes,
    events: eventRows,
    outside_failures: valid.filter((t) => t.failed.has(OUTSIDE)).map((t) => ({ trial: t.index, run: t.run, gates: t.failed.get(OUTSIDE) as string[] })),
    independence: { all_items_pass, expected_per_item: n * product(perItem), expected_per_class: n * product(classes.map((c) => c.pass_rate ?? NaN)) },
    outcomes: trials.map((t) => ({ trial: t.index, run: t.run, outcome: t.outcome })),
  };
}

// ---- Markdown, in classes.md's form.

const f2 = (x: number | null): string => (x === null ? '' : x.toFixed(2));
const iv = (w: Interval | null): string => (w === null ? '' : `[${w.lo.toFixed(2)}, ${w.hi.toFixed(2)}]`);
const trialRef = (l: { trial: number; run: string }, many: boolean): string => `${many ? `${l.run}` : ''}#${l.trial}`;

export function markdown(json: ClassesJson): string {
  const many = json.run_dirs.length > 1;
  const L: string[] = [`# classes: ${json.run_dirs.join(', ')}`, '', `grader ${json.grader_versions.join(', ')}`, '', '## Per task', '',
    '| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |', '|---|---|---|---|---|---|---|---|---|'];
  for (const [id, t] of Object.entries(json.tasks)) {
    L.push(`| ${id} | ${t.pass}/${t.trials_valid} | ${iv(t.wilson)} | ${t.split.model} | ${t.split.environment} | ${t.split.grader} | ${t.split.infra} | ${t.q === null ? 'no arrivals' : `${t.q.seen_all}/${t.q.trials}`} | ${t.guard_fires} |`);
  }
  L.push('', '## Classes', '');
  for (const [id, t] of Object.entries(json.tasks)) {
    L.push(`### ${id}`, '', `${t.trials_valid} valid trials; outcomes: ${t.outcomes.map((o) => `${many ? `${o.run}` : ''}${o.trial} ${o.outcome}`).join(', ')}`, '');
    L.push('| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |', '|---|---|---|---|---|---|---|');
    for (const c of t.classes) {
      c.instances.forEach((i, j) => {
        const labs = c.labels.filter((l) => l.item === i.item);
        const byTrial: string[] = [];
        for (const l of labs) {
          const ref = trialRef(l, many);
          const prefix = `${ref}: `;
          const k = byTrial.findIndex((s) => s.startsWith(prefix));
          if (k >= 0) byTrial[k] += `; ${l.gate} -> ${l.label}`;
          else byTrial.push(`${prefix}${l.gate} -> ${l.label}`);
        }
        const first = j === 0;
        L.push(`| ${first ? c.class : ''} | ${i.instance} (${i.label}) | ${i.fails}/${i.observations} | ${first ? `${c.fails}/${c.observations}` : ''} | ${first ? f2(c.pass_rate) : ''} | ${first ? iv(c.wilson) : ''} | ${byTrial.join('<br>')} |`);
      });
    }
    const outside = t.outside_failures.map((o) => `${trialRef(o, many)}: ${o.gates.join(', ')}`);
    L.push('', `Outside-the-list failures: ${outside.length > 0 ? outside.join(', ') : 'none'}.`, '');
    if (t.events.length > 0) {
      L.push('| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |', '|---|---|---|---|---|---|---|---|---|');
      for (const e of t.events) {
        L.push(`| ${e.id} | ${e.item ?? '(not in the checkout)'} | ${e.class ?? ''} | ${e.active ? 'yes' : 'no'} | ${e.fails}/${e.observations} | ${e.seen} | ${e.amend_fails_seen} | ${iv(e.wilson)} | ${e.labels.map((l) => `${trialRef(l, many)}: ${l.gate} -> ${l.label}`).join('<br>')} |`);
      }
      L.push('');
    }
  }
  L.push('## Independence (descriptive, gates nothing)', '', '| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |', '|---|---|---|---|---|---|');
  for (const [id, t] of Object.entries(json.tasks)) {
    L.push(`| ${id} | ${t.trials_valid} | ${t.pass} | ${t.independence.all_items_pass} | ${t.independence.expected_per_item.toFixed(2)} | ${t.independence.expected_per_class.toFixed(2)} |`);
  }
  return L.join('\n');
}

// ---- The command.

export async function classesOf(runs: readonly string[], deps: Pick<Deps, 'itemClasses' | 'events'> = {}): Promise<ClassesJson> {
  const byTask = new Map<string, Trial[]>();
  const graders = new Set<string>();
  for (const dir of runs) {
    if (!existsSync(join(dir, 'trials'))) throw new Error(`${dir}: no trials/ directory`);
    for (const { record } of settledRecords(dir)) {
      const r = record as unknown as RawRecord;
      if (typeof r.task_id !== 'string') continue;
      const last = Array.isArray(r.regrades) ? r.regrades.at(-1) : undefined;
      const gv = last?.grader_version ?? r.grader_version;
      if (typeof gv === 'string' || typeof gv === 'number') graders.add(String(gv));
      byTask.set(r.task_id, [...(byTask.get(r.task_id) ?? []), readTrial(dir, r)]);
    }
  }
  if (byTask.size === 0) throw new Error(`no settled records in ${runs.join(', ')}`);
  const tasks: Record<string, TaskClasses> = {};
  for (const id of [...byTask.keys()].sort()) {
    const trials = (byTask.get(id) as Trial[]).sort((a, b) => runs.indexOf(a.run) - runs.indexOf(b.run) || a.index - b.index);
    const items = await (deps.itemClasses ?? itemClassesOf)(id);
    const keys = new Set(items.map((i) => i.key));
    for (const t of trials.filter((x) => x.valid)) {
      const graded = new Set([...t.items].filter((k) => k !== OUTSIDE));
      const missing = [...keys].filter((k) => !graded.has(k));
      const extra = [...graded].filter((k) => !keys.has(k));
      if (missing.length > 0 || extra.length > 0) {
        throw new Error(`${id}: ${t.run} trial ${t.index} graded a different item list from the checkout's tasks/${id}/expected.ts`
          + `${missing.length > 0 ? `; not graded: ${missing.join(', ')}` : ''}${extra.length > 0 ? `; not in the checkout's list: ${extra.join(', ')}` : ''}`);
      }
    }
    tasks[id] = tabulate(trials, items, await (deps.events ?? taskEventsOf)(id));
  }
  return { schema_version: 1, run_dirs: [...runs], grader_versions: [...graders].sort((a, b) => Number(a) - Number(b) || (a < b ? -1 : a > b ? 1 : 0)), tasks };
}

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  const usage = (problem: string) => (deps.err(`classes: ${problem}`), deps.err(USAGE), 2);
  const positional: string[] = [];
  let json = false;
  for (const a of args) {
    if (a === '--json') json = true;
    else if (a.startsWith('--')) return usage(`unknown option ${a}`);
    else positional.push(a);
  }
  const runs = positional.flatMap((p) => p.split(',')).filter((s) => s !== '');
  if (runs.length === 0) return usage('give one run directory or more');
  let result: ClassesJson;
  try {
    result = await classesOf(runs, deps);
  } catch (e) {
    deps.err(`classes: ${(e as Error).message}`);
    return 1;
  }
  deps.out(json ? JSON.stringify(result, null, 1) : markdown(result));
  return 0;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};
