// context-budget --events <task=e,...> --req-per-event <r> (plan-amendment-w4 PW4-H0b): the cost
// model with mid-trial events, T = 2 + k x n + r x e, each trial projected at its own k. The last
// block is the PW4-H0b gate: on results/probe-1 the projection at the pilot-4a lists (n from the
// sizing table, 4 events, r = 3) prints the sizing table's "p90 at 4a e, r=3" column within $0.05.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import { type Deps, main, type Projection } from '../context-budget.ts';
import { quadCost, type QuadTrial, writeQuadRun } from './fixtures/context-budget/make-run.ts';

const CRC: QuadTrial[] = [26, 28, 30].map((T) => ({ T, C0: 10_000, g: 5_000, o: 500 }));
const INBOX: QuadTrial[] = [10, 12, 14, 16].map((T) => ({ T, C0: 8_000, g: 2_000, o: 400 }));
const ITEMS: Record<string, number> = { 'crc-care-gap': 14, 'results-inbox': 8 };
const sameEnv: Partial<Deps> = { checkoutEnv: async (id) => `ev-${id}`, taskItems: async (id) => ITEMS[id] ?? null };

function fixture(name: string): string {
  const dir = tempDir(`context-budget-events-${name}`);
  writeQuadRun(dir, { 'crc-care-gap': CRC, 'results-inbox': INBOX });
  return dir;
}

interface Out { tasks: Record<string, { projection?: Projection & { events: number; req_per_event: number } }>; breaks: string[] }

async function run(args: string[], deps: Partial<Deps> = sameEnv): Promise<{ code: number; json: Out | null; lines: string[] }> {
  const lines: string[] = [];
  const code = await main(args, { out: (l) => lines.push(l), err: (l) => lines.push(l), ...deps });
  const raw = args.includes('--json') ? lines.find((l) => l.startsWith('{')) : undefined;
  return { code, json: raw ? (JSON.parse(raw) as Out) : null, lines };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

describe('pnpm cli context-budget --project --items --events --req-per-event', () => {
  it('adds r x e requests to each trial\'s projected T, at its own k', async () => {
    const { json, lines } = await run([fixture('add'), '--project', '--items', 'crc-care-gap=10,results-inbox=6', '--events', 'crc-care-gap=4,results-inbox=2', '--req-per-event', '3', '--json']);
    const crc = json!.tasks['crc-care-gap']!.projection!;
    const Ts = CRC.map((t) => 2 + ((t.T - 2) / 14) * 10 + 3 * 4);
    expect(crc.T).toBeCloseTo(median(Ts), 9);
    expect(crc.median_usd).toBeCloseTo(median(CRC.map((t, i) => quadCost({ ...t, T: Ts[i]! }))), 9);
    expect(crc).toMatchObject({ events: 4, req_per_event: 3 });
    const inbox = json!.tasks['results-inbox']!.projection!;
    expect(inbox.T).toBeCloseTo(median(INBOX.map((t) => 2 + ((t.T - 2) / 8) * 6 + 3 * 2)), 9);
    expect(lines.some((l) => /at 10 items and 4 events \(r 3\)/.test(l))).toBe(true);
  });

  it('a task --events leaves out projects at 0 events; with no --events the projection is unchanged', async () => {
    const dir = fixture('zero');
    const plain = await run([dir, '--project', '--items', '10', '--json']);
    const some = await run([dir, '--project', '--items', '10', '--events', 'crc-care-gap=2', '--req-per-event', '3', '--json']);
    expect(some.json!.tasks['results-inbox']!.projection!.T).toBe(plain.json!.tasks['results-inbox']!.projection!.T);
    expect(some.json!.tasks['results-inbox']!.projection!.events).toBe(0);
    expect(some.json!.tasks['crc-care-gap']!.projection!.T).toBeCloseTo(plain.json!.tasks['crc-care-gap']!.projection!.T + 6, 9);
  });

  it('refuses --events without --project or without --req-per-event, a malformed count, and a task not measured', async () => {
    const dir = fixture('usage');
    expect((await run([dir, '--events', 'crc-care-gap=2', '--req-per-event', '3'])).code).toBe(2);
    expect((await run([dir, '--project', '--items', '10', '--events', 'crc-care-gap=2'])).code).toBe(2);
    expect((await run([dir, '--project', '--items', '10', '--req-per-event', '3'])).code).toBe(2);
    expect((await run([dir, '--project', '--items', '10', '--events', 'crc-care-gap=x', '--req-per-event', '3'])).code).toBe(2);
    expect((await run([dir, '--project', '--items', '10', '--events', 'crc-care-gap=2', '--req-per-event', '-1'])).code).toBe(2);
    expect((await run([dir, '--project', '--items', '10', '--events', 'nope=2', '--req-per-event', '3'])).code).toBe(2);
  });

  it('accepts 0 events for a task and a fractional r', async () => {
    const { code, json } = await run([fixture('frac'), '--project', '--items', '10', '--events', 'crc-care-gap=0,results-inbox=1', '--req-per-event', '3.5', '--json']);
    expect(code).toBe(0);
    expect(json!.tasks['results-inbox']!.projection!).toMatchObject({ events: 1, req_per_event: 3.5 });
  });
});

// The item counts results/probe-1 ran with. Its records predate TOOLS_VERSION 8 (PW4-E1), so their
// env_version is not the checkout's and context-budget will not take the counts from expected.ts.
const PROBE_1_ITEMS = 'renal-dose-review=9,results-inbox=13,crc-care-gap=13,discharge-medrec=13,contrast-ct-prep=7,message-queue=13';

describe('PW4-H0b gate: results/probe-1 at the pilot-4a lists', () => {
  // The pilot-4a p90 column, r = 3, by the tool's per-trial method (each trial projected at its own
  // k, C0, g and o; the median of their costs). The plan's first draft computed its column from the
  // task-level median parameters (1.94, 1.89, 2.55, 1.50, 2.23, 2.19), which understates T1 by
  // $0.15 and T4 by $0.05; the coordinator ruled the per-trial column the gate's (builder-275).
  const P90: Record<string, number> = { 'renal-dose-review': 1.79, 'results-inbox': 1.89, 'crc-care-gap': 2.5, 'discharge-medrec': 1.45, 'contrast-ct-prep': 2.25, 'message-queue': 2.17 };
  it('prints the per-trial pilot-4a p90 column within $0.05 and exits 0', async () => {
    const { code, json } = await run([
      'results/probe-1', '--task', 'all', '--project',
      '--items', 'renal-dose-review=5,results-inbox=7,crc-care-gap=4,discharge-medrec=8,contrast-ct-prep=4,message-queue=6',
      '--events', 'renal-dose-review=4,results-inbox=4,crc-care-gap=4,discharge-medrec=4,contrast-ct-prep=4,message-queue=4',
      '--req-per-event', '3', '--cost-from', 'results/probe-1', '--observed-items', PROBE_1_ITEMS, '--json',
    ], {});
    expect(json!.breaks).toEqual([]);
    expect(code).toBe(0);
    for (const [id, p90] of Object.entries(P90)) expect(Math.abs(json!.tasks[id]!.projection!.p90_usd - p90), id).toBeLessThanOrEqual(0.05);
  }, 120_000);
});

// PW4-H0b2 F1 (verifier-phase-P17i-W4H0B-195-1): a cost source whose trajectories hold event
// arrivals (env_event lines) already carries r requests per arrival inside T. k is fitted net of
// them, and r is refit from those trials by within-task least squares (coordinator ruling for
// builder-277: option A, at least 5 trials off their task's most common event count, r printed with its
// standard error; an explicit --req-per-event overrides the fit and both are printed).
function withEvents(name: string, tasks: Record<string, Array<QuadTrial & { e: number }>>): string {
  const dir = tempDir(`context-budget-events-${name}`);
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
// T = 2 + k x items + r x e exactly: k 2 (crc, 10 items) and 1 (inbox, 8 items), r = 2.
const R2 = {
  'crc-care-gap': [0, 1, 2, 3, 4, 4].map((e) => ({ T: 22 + 2 * e, C0: 10_000, g: 5_000, o: 500, e })),
  'results-inbox': [2, 3, 4, 4].map((e) => ({ T: 10 + 2 * e, C0: 8_000, g: 2_000, o: 400, e })),
};
const ITEMS_R2: Partial<Deps> = { checkoutEnv: async (id) => `ev-${id}`, taskItems: async (id) => ({ 'crc-care-gap': 10, 'results-inbox': 8 })[id] ?? null };

describe('PW4-H0b2 F1: an event-bearing cost source', () => {
  it('refits r from the trials (known r = 2 recovered within 1e-9) and nets k by it', async () => {
    const { code, json, lines } = await run([withEvents('r2', R2), '--project', '--items', 'crc-care-gap=10,results-inbox=8', '--events', 'crc-care-gap=4,results-inbox=4', '--json'], ITEMS_R2);
    expect(code).toBe(0);
    const crc = json!.tasks['crc-care-gap']!.projection!;
    expect(crc.req_per_event).toBeCloseTo(2, 9);
    // every crc trial nets to k = 2, so each projects at T = 2 + 2 x 10 + 2 x 4 = 30
    expect(crc.T).toBeCloseTo(30, 9);
    expect(crc.median_usd).toBeCloseTo(quadCost({ T: 30, C0: 10_000, g: 5_000, o: 500 }), 9);
    expect(json!.tasks['results-inbox']!.projection!.T).toBeCloseTo(2 + 8 + 8, 9);
    expect(lines.join('\n')).toMatch(/r fitted 2\.00 \(SE 0\.00\) from 6 trials off their task's most common event count, 9 trials with events/);
  });

  it('an explicit --req-per-event overrides the fit and prints both', async () => {
    const { code, json, lines } = await run([withEvents('r2-given', R2), '--project', '--items', 'crc-care-gap=10,results-inbox=8', '--events', 'crc-care-gap=4,results-inbox=4', '--req-per-event', '3', '--json'], ITEMS_R2);
    expect(code).toBe(0);
    expect(json!.tasks['crc-care-gap']!.projection!.req_per_event).toBe(3);
    const text = lines.join('\n');
    expect(text).toMatch(/r given 3, not fitted/);
    expect(text).toMatch(/fitted r 2\.00 \(SE 0\.00\)/);
  });

  it('every trial at the same event count: exit 2 with the reason, unless r is given; given, no double count', async () => {
    const base = [26, 28, 30, 32].map((T) => ({ T, C0: 10_000, g: 5_000, o: 500 }));
    const flat = withEvents('flat', { 'crc-care-gap': base.map((t) => ({ ...t, T: t.T + 12, e: 4 })) });
    const plain = withEvents('flat-plain', { 'crc-care-gap': base.map((t) => ({ ...t, e: 0 })) });
    const args = ['--project', '--items', '10', '--events', 'crc-care-gap=4'];
    const refused = await run([flat, ...args], { checkoutEnv: async (id) => `ev-${id}`, taskItems: async () => 14 });
    expect(refused.code).toBe(2);
    expect(refused.lines.join('\n')).toMatch(/event arrivals in 4 trials but r cannot be fitted: every trial of a task had the same number of events/);
    const given = await run([flat, ...args, '--req-per-event', '3', '--json'], { checkoutEnv: async (id) => `ev-${id}`, taskItems: async () => 14 });
    const clean = await run([plain, ...args, '--req-per-event', '3', '--json'], { checkoutEnv: async (id) => `ev-${id}`, taskItems: async () => 14 });
    expect(given.code).toBe(0);
    expect(given.lines.join('\n')).toMatch(/r given 3, not fitted; r not fittable: every trial of a task had the same number of events/);
    const g = given.json!.tasks['crc-care-gap']!.projection!;
    const c = clean.json!.tasks['crc-care-gap']!.projection!;
    expect(g.T).toBeCloseTo(c.T, 9);
    expect(g.p90_usd).toBeCloseTo(c.p90_usd, 12);
  });

  it('fewer than 5 trials off their task\'s most common event count: exit 2, unless r is given (fitted r beside)', async () => {
    const few = withEvents('few', { 'crc-care-gap': [4, 4, 4, 4, 4, 3, 4, 4].map((e, i) => ({ T: 22 + i + 3 * e, C0: 10_000, g: 5_000, o: 500, e })) });
    const deps: Partial<Deps> = { checkoutEnv: async (id) => `ev-${id}`, taskItems: async () => 10 };
    const refused = await run([few, '--project', '--items', '10', '--events', 'crc-care-gap=4'], deps);
    expect(refused.code).toBe(2);
    expect(refused.lines.join('\n')).toMatch(/only 1 trial off its task's most common event count \(5 needed\)/);
    const given = await run([few, '--project', '--items', '10', '--events', 'crc-care-gap=4', '--req-per-event', '3'], deps);
    expect(given.code).toBe(0);
    expect(given.lines.join('\n')).toMatch(/r given 3, not fitted; fitted r -?[0-9.]+ \(SE [0-9.]+\) from 1 trial off/);
  });
});
