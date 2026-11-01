// pnpm cli classes <run>[,<run>...] (plan-amendment-w4 PW4-H0b): the class table from records.
// The first block is the PW4-H0b fixture gate: on results/probe-1 (grader 16) the command
// reproduces classes.md's per-class and per-instance fails, its pass rates, Wilson intervals,
// failure labels, outcome lines and the independence table, row for row, and its --json validates
// against ClassesJson (the field contract builder-276's result-card reads). The later blocks run
// on synthetic run directories: the outcome split, events, q and finish-guard fires, and the
// guard against a run whose item list is not the checkout's.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import { type ClassesJson, classesJsonProblems, type Deps, main, type TaskEvents } from '../classes.ts';

async function run(args: string[], deps: Partial<Deps> = {}): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(args, { out: (l) => out.push(l), err: (l) => err.push(l), ...deps });
  return { code, out, err };
}

// classes.md's "## Classes" section: per task, its outcome line and its table rows; and the rows of
// the independence table.
function readClassesMd(file: string): { tasks: Record<string, { outcomes: string; rows: string[]; outside: string }>; independence: string[] } {
  const text = readFileSync(file, 'utf8');
  const classes = text.slice(text.indexOf('\n## Classes\n'), text.indexOf('\n## Independence'));
  const tasks: Record<string, { outcomes: string; rows: string[]; outside: string }> = {};
  for (const block of classes.split('\n### ').slice(1)) {
    const lines = block.split('\n');
    tasks[lines[0]!.trim()] = {
      outcomes: lines.find((l) => /valid trials; outcomes:/.test(l))!,
      rows: lines.filter((l) => l.startsWith('| ') && !l.startsWith('| class |')),
      outside: lines.find((l) => l.startsWith('Outside-the-list failures:'))!,
    };
  }
  const indep = text.slice(text.indexOf('\n## Independence'));
  const independence = indep.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| task |') && !l.startsWith('|---')).slice(0, 6);
  return { tasks, independence };
}

describe('PW4-H0b fixture gate: pnpm cli classes results/probe-1 reproduces classes.md', () => {
  const md = readClassesMd('results/probe-1/classes.md');

  it('prints every class row, outcome line and outside line of classes.md, byte for byte', async () => {
    const { code, out } = await run(['results/probe-1']);
    expect(code).toBe(0);
    const text = out.join('\n');
    const mine = readClassesMd.call(null, (() => {
      const f = join(tempDir('classes-md'), 'classes.md');
      writeFileSync(f, `# x\n\n## Classes\n${text.slice(text.indexOf('\n### '))}`);
      return f;
    })());
    expect(Object.keys(mine.tasks)).toEqual(Object.keys(md.tasks));
    for (const [task, want] of Object.entries(md.tasks)) {
      expect(mine.tasks[task]!.rows, task).toEqual(want.rows);
      expect(mine.tasks[task]!.outcomes, task).toBe(want.outcomes);
      expect(mine.tasks[task]!.outside, task).toBe(want.outside);
    }
    expect(mine.independence).toEqual(md.independence);
  }, 120_000);

  it('--json gives the same counts and validates against ClassesJson', async () => {
    const { code, out } = await run(['results/probe-1', '--json']);
    expect(code).toBe(0);
    const json = JSON.parse(out.join('\n')) as ClassesJson;
    expect(classesJsonProblems(json)).toEqual([]);
    expect(json.schema_version).toBe(1);
    expect(json.run_dirs).toEqual(['results/probe-1']);
    // Every trial is read at its grader 17 regrade (builder-273).
    expect(json.grader_versions).toEqual(['17']);
    const t5 = json.tasks['contrast-ct-prep']!;
    expect([t5.trials_valid, t5.pass]).toEqual([6, 5]);
    expect(t5.split).toEqual({ model: 1, environment: 0, grader: 0, infra: 0 });
    const mh = t5.classes.find((c) => c.class === 'metformin_hold')!;
    expect([mh.fails, mh.observations]).toEqual([1, 12]);
    expect(mh.instances.map((i) => [i.instance, i.label, i.fails, i.observations])).toEqual([[1, 'Anisha Margarita Schuster', 1, 6], [2, 'Salvador Logan Brakus', 0, 6]]);
    expect(mh.labels).toEqual([{ trial: 3, run: 'results/probe-1', item: 'Patient/pt-0049', gate: 'saline_prophylaxis', label: 'retrieval' }]);
    expect(mh.wilson!.lo).toBeCloseTo(0.6461, 3);
    const all = Object.values(json.tasks).flatMap((t) => t.classes);
    expect(all).toHaveLength(37);
    // 36 at grader 17: message-queue metformin_two_series was 1/12 at grader 16 (a grader fault, R27).
    expect(all.filter((c) => c.fails === 0)).toHaveLength(36);
    for (const t of Object.values(json.tasks)) {
      expect(t.events).toEqual([]);
      expect(t.q).toBeNull();
      expect(t.guard_fires).toBe(0);
      expect(t.outside_failures).toEqual([]);
    }
    expect(json.tasks['message-queue']!.independence).toEqual({ all_items_pass: 6, expected_per_item: 6, expected_per_class: 6 });
  }, 120_000);
});

describe('classesJsonProblems', () => {
  it('names a missing or mistyped field', () => {
    expect(classesJsonProblems({ schema_version: 1, run_dirs: [], grader_versions: [], tasks: {} })).toEqual([]);
    expect(classesJsonProblems({ schema_version: 2, run_dirs: [], grader_versions: [], tasks: {} })).toEqual(['schema_version: expected 1']);
    expect(classesJsonProblems({ schema_version: 1, run_dirs: [], grader_versions: [], tasks: { t: { pass: 1 } } }).join('\n')).toMatch(/tasks\.t\.trials_valid/);
  });
});

// A synthetic run: one task with items a (class x), b (class x), c (class y); events e1 (A, on a)
// and e2 (D, a lure on a) and e3 (O, on c).
const ITEMS = [{ key: 'a', class: 'x', label: 'A' }, { key: 'b', class: 'x', label: 'B' }, { key: 'c', class: 'y', label: 'C' }];
const EVENTS: TaskEvents = { SPECS: [{ id: 'e1', item: 'a', class: 'A' }, { id: 'e2', item: 'a', class: 'D' }, { id: 'e3', item: 'c', class: 'O' }, { id: 'e4', item: 'b', class: 'B' }], ACTIVE: ['e1', 'e2', 'e3'] };

interface Fake { outcome: string; fails?: Array<[string, string, string?]>; labels?: Array<[string, string, string]>; fired?: string[]; guard?: number; items?: string[]; checkEvent?: Record<string, string> }

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function writeRun(dir: string, trials: Fake[]): void {
  trials.forEach((t, index) => {
    const keys = t.items ?? ['a', 'b', 'c', 'outside'];
    const gates = [...new Set(['g', ...(t.fails ?? []).map(([, gate]) => gate)])];
    const checks = gates.map((id) => ({
      id, kind: 'gate', met: true, ...(t.checkEvent?.[id] ? { event: t.checkEvent[id] } : {}),
      items: keys.map((item) => {
        const f = (t.fails ?? []).find(([i, g]) => i === item && g === id);
        return { item, met: f === undefined, ...(f?.[2] ? { event: f[2] } : {}) };
      }),
    }));
    const valid = ['PASS', 'FAIL', 'LIMIT', 'REFUSAL'].includes(t.outcome);
    put(join(dir, 'trials', 'tk', `${index}.json`), JSON.stringify({
      task_id: 'tk', index, outcome: t.outcome, valid, grader_version: 18, task_version: 'v1', checks,
      attribution: t.labels ? { items: t.labels.map(([item, gate, auto]) => ({ item, gate, auto })) } : null,
    }));
    const lines = [
      ...(t.fired ?? []).map((spec, k) => ({ v: 2, seq: k, ts: 'x', turn: 3, type: 'env_event', spec, arrivalSeq: k + 1, keys: [`DocumentReference/doc-${spec}`] })),
      ...Array.from({ length: t.guard ?? 0 }, (_, k) => ({ v: 2, seq: 100 + k, ts: 'x', turn: 4, type: 'tool_result', name: 'finish', is_error: true, error_code: 'CONFLICT', content: { error: 'new items arrived in your queues during this turn; review them before finishing' } })),
      { v: 2, seq: 200, ts: 'x', turn: 5, type: 'tool_result', name: 'finish', is_error: false, error_code: null, content: { ok: true } },
    ];
    put(join(dir, 'trajectories', 'tk', `${index}.jsonl`), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  });
}

const deps: Partial<Deps> = { itemClasses: async () => ITEMS, events: async () => EVENTS };

async function synth(name: string, trials: Fake[], d: Partial<Deps> = deps): Promise<{ code: number; json: ClassesJson | null; err: string[] }> {
  const dir = tempDir(`classes-${name}`);
  writeRun(dir, trials);
  const r = await run([dir, '--json'], d);
  return { code: r.code, json: r.code === 0 ? (JSON.parse(r.out.join('\n')) as ClassesJson) : null, err: r.err };
}

describe('pnpm cli classes on synthetic runs', () => {
  it('splits failed trials into model, environment, grader and infra; only valid trials enter the class table', async () => {
    const { code, json } = await synth('split', [
      { outcome: 'PASS' }, { outcome: 'FAIL', fails: [['b', 'g']] }, { outcome: 'LIMIT' }, { outcome: 'ENV_ERROR' }, { outcome: 'ENV_LIMIT' }, { outcome: 'GRADER_ERROR' }, { outcome: 'INFRA_API' }, { outcome: 'REFUSAL' },
    ]);
    expect(code).toBe(0);
    const t = json!.tasks.tk!;
    expect(t.split).toEqual({ model: 3, environment: 2, grader: 1, infra: 1 });
    expect([t.trials_valid, t.pass]).toEqual([4, 1]);
    expect(t.classes.map((c) => [c.class, c.fails, c.observations])).toEqual([['x', 1, 8], ['y', 0, 4]]);
    expect(classesJsonProblems(json)).toEqual([]);
  });

  it('counts each event\'s fails out of the trials it fired in, q over trials with an arrival, and guard fires', async () => {
    const { json } = await synth('events', [
      { outcome: 'PASS', fired: ['e1', 'e2', 'e3'], guard: 1 },
      // missed e3's arrival: event_seen fails on c
      { outcome: 'FAIL', fired: ['e1', 'e2', 'e3'], fails: [['c', 'event_seen']], labels: [['c', 'event_seen', 'retrieval']] },
      // acted on the lure: kept fails on a, which is the D event's gate
      { outcome: 'FAIL', fired: ['e1', 'e2'], fails: [['a', 'kept']], labels: [['a', 'kept', 'over_action']] },
      // the amend on a is missing; the check names its event
      { outcome: 'FAIL', fired: ['e1', 'e2', 'e3'], fails: [['a', 'amended', 'e1']], guard: 2 },
      { outcome: 'PASS' },
    ]);
    const t = json!.tasks.tk!;
    const ev = Object.fromEntries(t.events.map((e) => [e.id, e]));
    expect(Object.keys(ev)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect([ev.e1!.active, ev.e1!.fired, ev.e1!.observations, ev.e1!.fails, ev.e1!.seen, ev.e1!.amend_fails_seen]).toEqual([true, 4, 4, 1, 4, 1]);
    expect([ev.e2!.class, ev.e2!.fails, ev.e2!.observations]).toEqual(['D', 1, 4]);
    expect(ev.e2!.labels).toEqual([{ trial: 2, run: expect.any(String), item: 'a', gate: 'kept', label: 'over_action' }]);
    expect([ev.e3!.fails, ev.e3!.observations, ev.e3!.seen, ev.e3!.amend_fails_seen]).toEqual([1, 3, 2, 0]);
    expect([ev.e4!.active, ev.e4!.fired, ev.e4!.observations, ev.e4!.wilson]).toEqual([false, 0, 0, null]);
    // q over every valid trial, as rule S writes it (PW4-H0b2 F3): the trial with no arrival saw every
    // arrival (there were none); the one that missed e3's arrival did not.
    expect(t.q).toEqual({ trials: 5, seen_all: 4, rate: 0.8 });
    expect(t.unattributed_event_failures).toBeUndefined();
    expect(t.guard_fires).toBe(3);
    // Event gates fail the item too; base_fails leaves them out (the base list rate b_t).
    const x = t.classes.find((c) => c.class === 'x')!;
    expect([x.fails, x.base_fails]).toEqual([2, 0]);
  });

  it('exits 1 when the run graded an item list that is not the checkout\'s', async () => {
    const missing = await synth('missing', [{ outcome: 'PASS', items: ['a', 'c'] }]);
    expect(missing.code).toBe(1);
    expect(missing.err.join('\n')).toMatch(/b/);
    const extra = await synth('extra', [{ outcome: 'PASS', items: ['a', 'b', 'c', 'd'] }]);
    expect(extra.code).toBe(1);
    expect(extra.err.join('\n')).toMatch(/d/);
  });

  it('counts an outside-the-list failure apart from the classes', async () => {
    const { json } = await synth('outside', [{ outcome: 'FAIL', fails: [['outside', 'nothing_else']] }]);
    expect(json!.tasks.tk!.outside_failures).toEqual([{ trial: 0, run: expect.any(String), gates: ['nothing_else'] }]);
    expect(json!.tasks.tk!.classes.every((c) => c.fails === 0)).toBe(true);
    expect(json!.tasks.tk!.independence.all_items_pass).toBe(1);
  });

  it('pools several run directories, naming each label\'s run', async () => {
    const a = tempDir('classes-pool-a');
    const b = tempDir('classes-pool-b');
    writeRun(a, [{ outcome: 'FAIL', fails: [['b', 'g']] }]);
    writeRun(b, [{ outcome: 'PASS' }, { outcome: 'FAIL', fails: [['b', 'g']] }]);
    const r = await run([`${a},${b}`, '--json'], deps);
    const t = (JSON.parse(r.out.join('\n')) as ClassesJson).tasks.tk!;
    expect(t.trials_valid).toBe(3);
    expect(t.classes[0]!.labels.map((l) => [l.run, l.trial])).toEqual([[a, 0], [b, 1]]);
  });

  it('PW4-H0b2 F2: a repeated run directory is read once, with a warning on stderr', async () => {
    const a = tempDir('classes-repeat');
    writeRun(a, [{ outcome: 'PASS' }, { outcome: 'FAIL', fails: [['b', 'g']] }]);
    const r = await run([`${a},${a}/`, '--json'], deps);
    expect(r.code).toBe(0);
    const json = JSON.parse(r.out.join('\n')) as ClassesJson;
    expect(json.run_dirs).toEqual([a]);
    expect(json.tasks.tk!.trials_valid).toBe(2);
    expect(r.err).toEqual([`classes: warning: ${a}/ repeats ${a}; read once`]);
  });

  it('PW4-H0b2 F3: an unnamed event_seen failure on an item where two events fired is unattributed, not the amend event\'s', async () => {
    const { json } = await synth('unattributed', [
      { outcome: 'FAIL', fired: ['e1', 'e2'], fails: [['a', 'event_seen']] },
      { outcome: 'PASS', fired: ['e1', 'e2'] },
    ]);
    const t = json!.tasks.tk!;
    const ev = Object.fromEntries(t.events.map((e) => [e.id, e]));
    expect([ev.e1!.fails, ev.e1!.seen, ev.e1!.amend_fails_seen]).toEqual([0, 2, 0]);
    expect([ev.e2!.fails, ev.e2!.seen]).toEqual([0, 2]);
    expect(t.unattributed_event_failures).toEqual([{ trial: 0, run: expect.any(String), item: 'a', gate: 'event_seen' }]);
    // the trial missed an arrival, whichever it was
    expect(t.q).toEqual({ trials: 2, seen_all: 1, rate: 0.5 });
    expect(classesJsonProblems(json)).toEqual([]);
  });

  it('PW4-H0b2 F3: an event_seen failure goes to the event its gate names', async () => {
    const { json } = await synth('gate-named', [{ outcome: 'FAIL', fired: ['e1', 'e2'], fails: [['a', 'event_seen']], checkEvent: { event_seen: 'e2' } }]);
    const t = json!.tasks.tk!;
    const ev = Object.fromEntries(t.events.map((e) => [e.id, e]));
    expect([ev.e1!.fails, ev.e2!.fails, ev.e2!.seen]).toEqual([0, 1, 0]);
    expect(t.unattributed_event_failures).toBeUndefined();
  });

  it('refuses no run directory and an unknown option', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(['results/probe-1', '--nope'])).code).toBe(2);
  });
});
