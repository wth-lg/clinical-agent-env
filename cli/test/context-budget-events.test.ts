// context-budget --events <task=e,...> --req-per-event <r> (plan-amendment-w4 PW4-H0b): the cost
// model with mid-trial events, T = 2 + k x n + r x e, each trial projected at its own k. The last
// block is the PW4-H0b gate: on results/probe-1 the projection at the pilot-4a lists (n from the
// sizing table, 4 events, r = 3) prints the sizing table's "p90 at 4a e, r=3" column within $0.05.
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
      '--req-per-event', '3', '--cost-from', 'results/probe-1', '--json',
    ], {});
    expect(json!.breaks).toEqual([]);
    expect(code).toBe(0);
    for (const [id, p90] of Object.entries(P90)) expect(Math.abs(json!.tasks[id]!.projection!.p90_usd - p90), id).toBeLessThanOrEqual(0.05);
  }, 120_000);
});
