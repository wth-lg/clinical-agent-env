// The context and cost meter (plan-amendment-worklist.md W0-B): `pnpm cli context-budget` fits
// the quadratic cost model per task from per-request usage, prints each trial's peak context and
// T, and with --project --items projects median and p90 cost, peak context, T and working time,
// exiting 1 when a projection breaks a budget line. Fixture runs have a known peak and a known
// quadratic cost (fixtures/context-budget/make-run.ts); the last block is the W0-B gate on the
// committed pilot-2 run.
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_TOKENS, PER_TRIAL_BUDGET_USD, RERUN_FACTOR } from '../../packages/core/cost.ts';
import { MAX_WALL_MS } from '../../packages/core/run.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { budgetBreaks, main, type Projection } from '../context-budget.ts';
import { quadCost, writeQuadRun, type QuadTrial } from './fixtures/context-budget/make-run.ts';

const CRC: QuadTrial[] = [26, 28, 30].map((T) => ({ T, C0: 10_000, g: 5_000, o: 500 }));
const INBOX: QuadTrial[] = [10, 12, 14, 16].map((T) => ({ T, C0: 8_000, g: 2_000, o: 400 }));

function fixture(name: string): string {
  const dir = tempDir(`context-budget-${name}`);
  writeQuadRun(dir, { 'crc-care-gap': CRC, 'results-inbox': INBOX });
  return dir;
}

interface Out {
  tasks: Record<string, {
    trials: Array<{ index: number; T: number; peak_context: number }>;
    fit: { items: number; T: number; C0: number; g: number; o: number; k: number; observed_median_usd: number; fitted_median_usd: number };
    projection?: Projection;
  }>;
  breaks: string[];
  correction_usd?: number;
}

async function run(args: string[]): Promise<{ code: number; json: Out | null; lines: string[] }> {
  const lines: string[] = [];
  const code = await main(args, { out: (l) => lines.push(l), err: (l) => lines.push(l) });
  const raw = args.includes('--json') ? lines.find((l) => l.startsWith('{')) : undefined;
  return { code, json: raw ? (JSON.parse(raw) as Out) : null, lines };
}

describe('budget constants', () => {
  it('CONTEXT_WINDOW_TOKENS is the 1M window of claude-opus-5-5 and the per-trial budget line is $3, half the cap', () => {
    expect(CONTEXT_WINDOW_TOKENS).toBe(1_000_000);
    expect(PER_TRIAL_BUDGET_USD).toBe(3);
  });
});

describe('pnpm cli context-budget <run> (fit)', () => {
  it('prints each trial\'s peak context and T, and per task the fitted C0, g, o and k', async () => {
    const { code, json, lines } = await run([fixture('fit'), '--json']);
    expect(code).toBe(0);
    const crc = json!.tasks['crc-care-gap']!;
    expect(crc.trials.map((t) => [t.T, t.peak_context])).toEqual(CRC.map((t) => [t.T, t.C0 + t.g * (t.T - 1)]));
    expect(crc.fit).toMatchObject({ items: 14, T: 28, C0: 10_000, g: 5_000, o: 500 });
    expect(crc.fit.k).toBeCloseTo(26 / 14, 12);
    expect(crc.fit.fitted_median_usd).toBeCloseTo(quadCost({ T: 28, C0: 10_000, g: 5_000, o: 500 }), 12);
    expect(crc.fit.observed_median_usd).toBeCloseTo(crc.fit.fitted_median_usd, 12);
    // Even trial count: the median of T is the mean of the middle two (12 and 14).
    const inbox = json!.tasks['results-inbox']!;
    expect(inbox.fit).toMatchObject({ items: 8, T: 13 });
    expect(inbox.fit.k).toBeCloseTo(11 / 8, 12);
    expect(lines).toContainEqual(expect.stringMatching(/^crc-care-gap: 3 trials, 14 items: T 28\.0, C0 10\.0k, g 5\.0k\/req, o 500\/req, k 1\.86 req\/item$/));
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}#2 T 30 peak 155\.0k$/));
  });

  it('exits 1 when the fitted median is more than 10% under or 40% over the observed median', async () => {
    for (const [scale, code] of [[1 / 1.45, 1], [1 / 1.35, 0], [1 / 0.95, 0], [1 / 0.85, 1]] as const) {
      const dir = tempDir('context-budget-band');
      writeQuadRun(dir, { 'crc-care-gap': CRC }, 10_000, scale);
      const { code: got, json } = await run([dir, '--json']);
      expect(got, `cost x ${scale}`).toBe(code);
      expect(json!.breaks, `cost x ${scale}`).toEqual(code === 0 ? [] : [expect.stringMatching(/^crc-care-gap: fitted median \$1\.44 is outside -10%\.\.\+40% of the observed \$\d\.\d\d$/)]);
    }
  });

  it('a run with no trials exits 1', async () => {
    const dir = tempDir('context-budget-empty');
    writeQuadRun(dir, {});
    const { mkdirSync } = await import('node:fs');
    mkdirSync(`${dir}/trials`);
    expect((await run([dir])).code).toBe(1);
  });

  it('--task limits the tasks', async () => {
    const { json } = await run([fixture('task'), '--task', 'results-inbox', '--json']);
    expect(Object.keys(json!.tasks)).toEqual(['results-inbox']);
  });
});

describe('pnpm cli context-budget <run> --project --items <n>', () => {
  const T36 = 2 + (26 / 14) * 36;

  it('projects median and p90 cost, peak, T and working time from the model, and exits 1 over the $3.00 line', async () => {
    const { code, json, lines } = await run([fixture('over'), '--task', 'crc-care-gap', '--project', '--items', '36', '--json']);
    expect(code).toBe(1);
    const p = json!.tasks['crc-care-gap']!.projection!;
    const median = quadCost({ T: T36, C0: 10_000, g: 5_000, o: 500 });
    expect(p.items).toBe(36);
    expect(p.T).toBeCloseTo(T36, 9);
    expect(p.median_usd).toBeCloseTo(median, 9);
    expect(p.p90_usd).toBeCloseTo(1.25 * median, 9);
    expect(p.peak_context).toBeCloseTo(10_000 + 5_000 * (T36 - 1), 6);
    expect(p.working_ms).toBeCloseTo(10_000 * T36, 3);
    expect(json!.breaks).toEqual([expect.stringMatching(/^crc-care-gap: projected p90 \$6\.\d\d > \$3\.00 per trial$/)]);
    expect(lines).toContainEqual(expect.stringMatching(/^over: 1 budget line broken$/));
  });

  it('exits 0 when every line holds', async () => {
    const { code, json } = await run([fixture('within'), '--task', 'crc-care-gap', '--project', '--items', '10', '--json']);
    expect(code).toBe(0);
    expect(json!.breaks).toEqual([]);
  });

  it('takes per-task item counts', async () => {
    const { json } = await run([fixture('per-task'), '--project', '--items', 'crc-care-gap=10,results-inbox=20', '--json']);
    expect(json!.tasks['crc-care-gap']!.projection!.items).toBe(10);
    expect(json!.tasks['results-inbox']!.projection!.T).toBeCloseTo(2 + (11 / 8) * 20, 9);
  });

  it('prints the projection correction: 20 final trials x (projected p90 - the spend tool\'s fallback p90) x 1.15, never below 0', async () => {
    const dir = fixture('correction');
    // The fallback is the nearest-rank p90 of the three crc trials: the T = 30 trial.
    const fallback = quadCost(CRC[2]!);
    const over = await run([dir, '--task', 'crc-care-gap', '--project', '--items', '36', '--json']);
    const p90 = over.json!.tasks['crc-care-gap']!.projection!.p90_usd;
    expect(over.json!.correction_usd).toBeCloseTo(20 * RERUN_FACTOR * (p90 - fallback), 9);
    expect(over.lines).toContainEqual(expect.stringMatching(/^projection correction \+\$\d+\.\d\d: add to the dry-run value/));
    const under = await run([dir, '--task', 'crc-care-gap', '--project', '--items', '10', '--json']);
    expect(under.json!.correction_usd).toBe(0);
  });

  it('usage errors exit 2; a missing run exits 1', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run([fixture('usage'), '--items', '10'])).code).toBe(2);
    expect((await run([fixture('usage2'), '--project'])).code).toBe(2);
    expect((await run([fixture('usage3'), '--project', '--items', 'x'])).code).toBe(2);
    expect((await run([fixture('usage4'), '--project', '--items', 'no-such-task=3'])).code).toBe(2);
    expect((await run([tempDir('context-budget-missing') + '/nope'])).code).toBe(1);
  });
});

describe('budgetBreaks', () => {
  const ok: Projection = { task_id: 't', items: 10, T: 30, median_usd: 2, p90_usd: 2.5, peak_context: 100_000, working_ms: 60_000, max_turns: 80 };
  const caps = { maxWallMs: MAX_WALL_MS };

  it('passes a projection under every line', () => {
    expect(budgetBreaks([ok], caps)).toEqual([]);
  });

  it('breaks on peak context at 0.6 x the window, T at 0.5 x max_turns and working time at 0.5 x MAX_WALL_MS', () => {
    expect(budgetBreaks([{ ...ok, peak_context: 0.6 * CONTEXT_WINDOW_TOKENS }], caps)).toEqual([expect.stringMatching(/^t: projected peak context 600\.0k >= 0\.6 x the 1000k window$/)]);
    expect(budgetBreaks([{ ...ok, T: 40 }], caps)).toEqual([expect.stringMatching(/^t: projected T 40\.0 >= 0\.5 x max_turns 80$/)]);
    expect(budgetBreaks([{ ...ok, working_ms: MAX_WALL_MS / 2 }], caps)).toEqual([expect.stringMatching(/^t: projected working time 15\.0 min >= 0\.5 x 30 min$/)]);
  });

  it('breaks when the mean projected p90 over two or more tasks is above $2.40, and not for one task', () => {
    const a = { ...ok, task_id: 'a', p90_usd: 2.9 };
    const b = { ...ok, task_id: 'b', p90_usd: 2.9 };
    expect(budgetBreaks([a], caps)).toEqual([]);
    expect(budgetBreaks([a, b], caps)).toEqual(['mean projected p90 $2.90 over 2 tasks > $2.40']);
    expect(budgetBreaks([a, { ...b, p90_usd: 1.8 }], caps)).toEqual([]);
  });
});

describe('W0-B gate on results/pilot-2', () => {
  it('each task\'s fitted median is never more than 10% under the observed median and at most 40% over it', async () => {
    const { code, json } = await run(['results/pilot-2', '--json']);
    expect(code).toBe(0);
    expect(Object.keys(json!.tasks).sort()).toEqual(['contrast-ct-prep', 'crc-care-gap', 'discharge-medrec', 'message-queue', 'renal-dose-review', 'results-inbox']);
    for (const [id, t] of Object.entries(json!.tasks)) {
      const ratio = t.fit.fitted_median_usd / t.fit.observed_median_usd;
      expect(ratio, id).toBeGreaterThanOrEqual(0.9);
      expect(ratio, id).toBeLessThanOrEqual(1.4);
    }
  });

  it('crc-care-gap at 36 items exits 1 (over the $3.00 line)', async () => {
    const { code, json } = await run(['results/pilot-2', '--task', 'crc-care-gap', '--project', '--items', '36', '--json']);
    expect(code).toBe(1);
    expect(json!.breaks).toContainEqual(expect.stringMatching(/^crc-care-gap: projected p90 \$\d+\.\d\d > \$3\.00 per trial$/));
  });
});
