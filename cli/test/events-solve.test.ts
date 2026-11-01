// pnpm cli events-solve (plan-amendment-w4 PW4-H0b, stop rule S-2): picks each task's event count
// e* from a classes JSON and the context-budget projection. The PW4-H0b gate is the first block: a
// synthetic classes JSON with pooled f = 0.12 over the sizing table's lists (n, e_max, pilot-4a's 4
// events, r = 3, T5's base rate 11/12), costed from results/probe-1 by the per-trial projection,
// returns the corrected e* column (coordinator ruling for builder-275: T2 7 where the plan's first
// draft, costed by median parameters, had 6); at f = 0.15 it returns the draft's column.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import type { ClassesJson, EventRow, TaskClasses } from '../classes.ts';
import { type Deps, main, pooled, RULE_S_TEXT, solve, type SolveJson } from '../events-solve.ts';
import { type QuadTrial, writeQuadRun } from './fixtures/context-budget/make-run.ts';

const N = { 'renal-dose-review': 5, 'results-inbox': 7, 'crc-care-gap': 4, 'discharge-medrec': 8, 'contrast-ct-prep': 4, 'message-queue': 6 };
const EMAX = { 'renal-dose-review': 6, 'results-inbox': 8, 'crc-care-gap': 4, 'discharge-medrec': 9, 'contrast-ct-prep': 5, 'message-queue': 6 };
const TASKS = Object.keys(N);
const spec = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(',');

const ev = (id: string, cls: EventRow['class'], obs: number, seen: number, fails: number): EventRow => ({
  id, item: `item-${id}`, class: cls, active: true, fired: obs, fails, observations: obs, wilson: null, labels: [], seen, amend_fails_seen: cls === 'D' ? 0 : fails,
});

// Six tasks of 16 trials: 4 amend events, each observed and seen 4 times (16 seen per task, 96
// pooled), one lure observed 16 times, and amendFails spread over the 24 amend events.
function synthetic(amendFails: number, lureFails = 0): ClassesJson {
  const tasks: Record<string, TaskClasses> = {};
  TASKS.forEach((id, t) => {
    const fails = [0, 1, 2, 3].map((k) => Math.floor((amendFails + ((t * 4 + k) % 24)) / 24));
    tasks[id] = {
      trials_valid: 16, pass: 8, wilson: null, split: { model: 8, environment: 0, grader: 0, infra: 0 }, guard_fires: 0,
      q: { trials: 16, seen_all: 16, rate: 1 },
      classes: [{ class: 'base', fails: 0, base_fails: id === 'contrast-ct-prep' ? 1 : 0, observations: 12, pass_rate: 1, wilson: null, labels: [], instances: [] }],
      events: [...fails.map((f, k) => ev(`${id}-a${k}`, 'A', 4, 4, f)), ev(`${id}-d`, 'D', 16, 16, t === 0 ? lureFails : 0)],
      outside_failures: [], independence: { all_items_pass: 0, expected_per_item: 0, expected_per_class: 0 }, outcomes: [],
    };
  });
  return { schema_version: 1, run_dirs: ['synthetic'], grader_versions: ['18'], tasks };
}

function file(json: ClassesJson, name: string): string {
  const f = join(tempDir(`events-solve-${name}`), 'classes.json');
  writeFileSync(f, JSON.stringify(json));
  return f;
}

async function run(args: string[], deps: Partial<Deps> = {}): Promise<{ code: number; json: SolveJson | null; lines: string[] }> {
  const lines: string[] = [];
  const code = await main(args, { out: (l) => lines.push(l), err: (l) => lines.push(l), ...deps });
  const raw = args.includes('--json') ? lines.find((l) => l.startsWith('{')) : undefined;
  return { code, json: raw ? (JSON.parse(raw) as SolveJson) : null, lines };
}

const sized = (f: string, extra: string[] = []) => ['--classes', f, '--cost-from', 'results/probe-1', '--items', spec(N), '--emax', spec(EMAX), '--current', spec(Object.fromEntries(TASKS.map((t) => [t, 4]))), '--req-per-event', '3', ...extra, '--json'];
const eStar = (j: SolveJson) => Object.fromEntries(Object.entries(j.tasks).map(([id, t]) => [id, t.e_star]));

describe('PW4-H0b gate: events-solve on a synthetic classes JSON', () => {
  it('pooled f = 0.12 returns the corrected e* column under both cost lines', async () => {
    const synth = synthetic(11);
    expect(pooled(synth).f).toBeCloseTo(0.12, 2);
    const { code, json } = await run(sized(file(synth, 'f12')));
    expect(code).toBe(0);
    expect(eStar(json!)).toEqual({ 'contrast-ct-prep': 5, 'crc-care-gap': 4, 'discharge-medrec': 6, 'message-queue': 6, 'renal-dose-review': 6, 'results-inbox': 7 });
    expect(json!.mean_p90_usd).toBeLessThanOrEqual(2.4);
    expect(json!.mean_p90_usd).toBeCloseTo(2.38, 2);
    for (const t of Object.values(json!.tasks)) expect(t.p90_usd).toBeLessThanOrEqual(3);
    expect(json!.s1_lever_dead).toBe(false);
    expect(json!.tasks['crc-care-gap']!.action).toBe('v1_plus_4');
    expect(json!.tasks['results-inbox']!.action).toBe('v2_8');
  }, 120_000);

  it('pooled f = 0.15 returns the draft plan\'s column (T2 6)', async () => {
    const synth = synthetic(14);
    expect(pooled(synth).f).toBeCloseTo(0.15, 2);
    const { json } = await run(sized(file(synth, 'f15')));
    expect(eStar(json!)).toEqual({ 'contrast-ct-prep': 5, 'crc-care-gap': 4, 'discharge-medrec': 6, 'message-queue': 6, 'renal-dose-review': 6, 'results-inbox': 6 });
  }, 120_000);
});

describe('pooled estimates (stop rule S, +0.5 smoothing)', () => {
  it('f = (amend fails among seen + 0.5) / (seen + 1), q and p_D the same way', () => {
    const p = pooled(synthetic(11, 2));
    expect(p.f).toBeCloseTo(11.5 / 97, 12);
    expect(p.q).toBeCloseTo(96.5 / 97, 12);
    expect(p.p_d).toBeCloseTo(1 - 2.5 / 97, 12);
    expect(p.event_fails).toBe(13);
    expect(p.b['contrast-ct-prep']).toBeCloseTo(11 / 12, 12);
    expect(p.b['crc-care-gap']).toBe(1);
  });
});

describe('S-1 and S-2 actions', () => {
  it('S-1: zero event failures in every observation freezes every task on v1', async () => {
    const { code, json, lines } = await run(sized(file(synthetic(0), 's1')));
    expect(code).toBe(0);
    expect(json!.s1_lever_dead).toBe(true);
    expect(Object.values(json!.tasks).every((t) => t.action === 'freeze_v1')).toBe(true);
    expect(lines.some((l) => /S-1/.test(l))).toBe(true);
  }, 120_000);

  it('a task whose pred at e_max is above 0.70 freezes on v1 at its current count', async () => {
    const { json } = await run(sized(file(synthetic(2), 'freeze')));
    const crc = json!.tasks['crc-care-gap']!;
    expect(crc.pred_at_emax).toBeGreaterThan(0.7);
    expect([crc.action, crc.e_star]).toEqual(['freeze_v1', 4]);
  }, 120_000);

  it('exits 1 when no event counts meet the cost lines', async () => {
    const { code, lines } = await run(['--classes', file(synthetic(11), 'over'), '--cost-from', 'results/probe-1', '--items', spec({ ...N, 'crc-care-gap': 40 }), '--emax', spec(EMAX), '--current', spec(Object.fromEntries(TASKS.map((t) => [t, 4])))]);
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/no event counts/);
  }, 120_000);

  it('refuses --classes without --cost-from, both a run and --classes, and a classes file of another schema', async () => {
    const f = file(synthetic(11), 'usage');
    expect((await run(['--classes', f])).code).toBe(2);
    expect((await run(['results/probe-1', '--classes', f, '--cost-from', 'results/probe-1'])).code).toBe(2);
    const bad = file({ ...synthetic(11), schema_version: 2 as 1 }, 'schema');
    expect((await run(['--classes', bad, '--cost-from', 'results/probe-1'])).code).toBe(1);
  });

  it('exits 1 when no event was observed', async () => {
    const none = synthetic(0);
    for (const t of Object.values(none.tasks)) t.events = [];
    const { code, lines } = await run(sized(file(none, 'none')));
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/no event observations/);
  });
});

// PW4-H0b2 (verifier-phase-P17i-W4H0B-195-1 F1-F3).
const TWO = { 'crc-care-gap': 10, 'results-inbox': 8 };
function costRun(name: string, tasks: Record<string, Array<QuadTrial & { e: number }>>): string {
  const dir = tempDir(`events-solve-cost-${name}`);
  writeQuadRun(dir, tasks);
  for (const [task, trials] of Object.entries(tasks)) {
    trials.forEach((t, i) => {
      const f = join(dir, 'trajectories', task, `${i}.jsonl`);
      const ev = Array.from({ length: t.e }, (_, k) => JSON.stringify({ v: 2, seq: 1000 + k, ts: 'x', turn: 2, type: 'env_event', spec: `${task}-s${k}`, arrival_seq: k + 1, keys: [] }));
      writeFileSync(f, readFileSync(f, 'utf8') + ev.map((l) => `${l}\n`).join(''));
    });
  }
  return dir;
}
function twoTasks(): ClassesJson {
  const s = synthetic(11);
  return { ...s, tasks: { 'crc-care-gap': s.tasks['crc-care-gap']!, 'results-inbox': s.tasks['results-inbox']! } };
}
const twoArgs = (f: string, cost: string, extra: string[] = []) => ['--classes', f, '--cost-from', cost, '--observed-items', spec(TWO), '--items', spec({ 'crc-care-gap': 4, 'results-inbox': 7 }), '--emax', spec({ 'crc-care-gap': 4, 'results-inbox': 8 }), '--current', spec({ 'crc-care-gap': 4, 'results-inbox': 4 }), ...extra, '--json'];

describe('PW4-H0b2 F1: events-solve on an event-bearing cost source', () => {
  const R2 = {
    'crc-care-gap': [0, 1, 2, 3, 4, 4].map((e) => ({ T: 22 + 2 * e, C0: 10_000, g: 5_000, o: 500, e })),
    'results-inbox': [2, 3, 4, 4].map((e) => ({ T: 10 + 2 * e, C0: 8_000, g: 2_000, o: 400, e })),
  };

  it('refits r (known r = 2) and prints it', async () => {
    const { code, json, lines } = await run(twoArgs(file(twoTasks(), 'r2'), costRun('r2', R2)));
    expect(code).toBe(0);
    expect(json!.req_per_event).toBeCloseTo(2, 9);
    expect(lines.join('\n')).toMatch(/r fitted 2\.00 \(SE 0\.00\)/);
    expect(lines).toContain(RULE_S_TEXT);
    expect(RULE_S_TEXT).toMatch(/modal \(most common\) event count/);
    expect(RULE_S_TEXT).toMatch(/one event fired on its item, otherwise unattributed/);
  });

  it('does not count the event requests twice: p90 at every e equals the event-free twin\'s', async () => {
    const base = { 'crc-care-gap': [24, 26, 28, 30].map((T) => ({ T, C0: 10_000, g: 5_000, o: 500 })), 'results-inbox': [12, 14, 16].map((T) => ({ T, C0: 8_000, g: 2_000, o: 400 })) };
    const plain = costRun('plain', Object.fromEntries(Object.entries(base).map(([k, ts]) => [k, ts.map((t) => ({ ...t, e: 0 }))])));
    const ev = costRun('ev4', Object.fromEntries(Object.entries(base).map(([k, ts]) => [k, ts.map((t) => ({ ...t, T: t.T + 12, e: 4 }))])));
    const f = file(twoTasks(), 'twin');
    const a = await run(twoArgs(f, plain, ['--req-per-event', '3']));
    const b = await run(twoArgs(f, ev, ['--req-per-event', '3']));
    expect([a.code, b.code]).toEqual([0, 0]);
    for (const id of Object.keys(TWO)) {
      b.json!.tasks[id]!.by_e.forEach((row, i) => expect(row.p90_usd, `${id} e=${row.e}`).toBeCloseTo(a.json!.tasks[id]!.by_e[i]!.p90_usd, 12));
    }
    expect(eStar(b.json!)).toEqual(eStar(a.json!));
    expect(b.lines.join('\n')).toMatch(/r given 3, not fitted/);
  });

  it('exits 2 with the reason when the cost source has events but r cannot be fitted', async () => {
    const flat = costRun('flat', { 'crc-care-gap': [36, 38, 40].map((T) => ({ T, C0: 10_000, g: 5_000, o: 500, e: 4 })), 'results-inbox': [24, 26].map((T) => ({ T, C0: 8_000, g: 2_000, o: 400, e: 4 })) });
    const { code, lines } = await run(twoArgs(file(twoTasks(), 'flat'), flat));
    expect(code).toBe(2);
    expect(lines.join('\n')).toMatch(/event arrivals in 5 trials but r cannot be fitted: every trial of a task had the same number of events/);
  });
});

describe('PW4-H0b2 F2: a repeated run directory', () => {
  it('warns on stderr and reads it once', async () => {
    const out: string[] = [];
    const err: string[] = [];
    await main(['results/probe-1,./results/probe-1', '--json'], { out: (l) => out.push(l), err: (l) => err.push(l) });
    expect(err.join('\n')).toMatch(/warning: \.\/results\/probe-1 repeats results\/probe-1; read once/);
  }, 120_000);
});

describe('PW4-H0b2 F3', () => {
  it('ties on squares and mean go to fewer events compared as numbers (9,10 before 10,9)', () => {
    const rows = (p90: (e: number) => number) => Array.from({ length: 10 }, (_, k) => ({ e: k + 1, pred: k + 1 === 10 ? 0.45 : k + 1 === 9 ? 0.5 : 0, p90_usd: p90(k + 1) }));
    const t = rows((e) => (e === 10 ? 2.9 : 1.9));
    expect(solve(['x', 'y'], 0, 2, { x: t, y: t })).toEqual({ x: 9, y: 10 });
  });

  it('an unattributed event failure counts as an event failure, so S-1 does not fire', () => {
    const s = synthetic(0);
    s.tasks['crc-care-gap']!.unattributed_event_failures = [{ trial: 1, run: 'synthetic', item: 'x', gate: 'event_seen' }];
    const p = pooled(s);
    expect(p.event_fails).toBe(1);
    expect(p.unattributed_event_fails).toBe(1);
  });
});
