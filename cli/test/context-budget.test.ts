// The context and cost meter (plan-amendment-worklist.md W0-B): `pnpm cli context-budget` fits
// the quadratic cost model per task from per-request usage, prints each trial's peak context and
// T, and with --project --items projects median and p90 cost, peak context, T and working time,
// exiting 1 when a projection breaks a budget line. Fixture runs have a known peak and a known
// quadratic cost (fixtures/context-budget/make-run.ts); the last block is the W0-B gate on the
// committed pilot-2 run.
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_TOKENS, PER_TRIAL_BUDGET_USD, RERUN_FACTOR } from '../../packages/core/cost.ts';
import { MAX_WALL_MS } from '../../packages/core/run.ts';
import { expected as crcExpected } from '../../tasks/crc-care-gap/expected.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { budgetBreaks, type Deps, main, type Projection } from '../context-budget.ts';
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
    fit: { items: number; T: number; C0: number; g: number; o: number; k: number; observed_median_usd: number; fitted_median_usd: number; skipped_invalid: number };
    projection?: Projection;
  }>;
  breaks: string[];
  correction_usd?: number;
}

// Fixture records carry env_version ev-<task>; by default the fake checkout is at that version too,
// and its expected.items hold 14 crc-care-gap items and 8 results-inbox items (pilot-2's lists).
const ITEMS: Record<string, number> = { 'crc-care-gap': 14, 'results-inbox': 8 };
const taskItems: Deps['taskItems'] = async (id) => ITEMS[id] ?? null;
const sameEnv: Partial<Deps> = { checkoutEnv: async (id) => `ev-${id}`, taskItems };

async function run(args: string[], deps: Partial<Deps> = sameEnv): Promise<{ code: number; json: Out | null; lines: string[] }> {
  const lines: string[] = [];
  const code = await main(args, { out: (l) => lines.push(l), err: (l) => lines.push(l), ...deps });
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

  // Pilot-1's crc-care-gap trials, (T, g) = (19, 5234), (24, 6447), (21, 7564): the median T is one
  // trial's and the median g another's, and their product costs less than the median trial.
  const SPREAD: QuadTrial[] = [[19, 5_234], [24, 6_447], [21, 7_564]].map(([T, g]) => ({ T: T!, C0: 13_700, g: g!, o: 674 }));

  it('fits the median of each trial\'s modelled cost, not the cost of the per-parameter medians', async () => {
    const dir = tempDir('context-budget-spread');
    writeQuadRun(dir, { 'crc-care-gap': SPREAD });
    const { code, json } = await run([dir, '--json']);
    const fit = json!.tasks['crc-care-gap']!.fit;
    const perTrial = SPREAD.map(quadCost).sort((a, b) => a - b);
    expect(quadCost({ T: 21, C0: 13_700, g: 6_447, o: 674 })).toBeLessThan(perTrial[1]! * 0.95);
    expect(fit.fitted_median_usd).toBeCloseTo(perTrial[1]!, 12);
    expect(fit.observed_median_usd).toBeCloseTo(perTrial[1]!, 12);
    expect(code).toBe(0);
  });

  it('leaves out invalid trials (isValid), and says how many', async () => {
    const dir = tempDir('context-budget-invalid');
    const planted: QuadTrial[] = [{ T: 120, C0: 10_000, g: 5_000, o: 500, outcome: 'ENV_ERROR' }, { T: 121, C0: 10_000, g: 5_000, o: 500, outcome: 'INFRA_API' }];
    writeQuadRun(dir, { 'crc-care-gap': [...CRC, ...planted] });
    const { code, json, lines } = await run([dir, '--json']);
    expect(code).toBe(0);
    const crc = json!.tasks['crc-care-gap']!;
    expect(crc.trials.map((t) => t.T)).toEqual([26, 28, 30]);
    expect(crc.fit).toMatchObject({ T: 28, skipped_invalid: 2 });
    expect(crc.fit.observed_median_usd).toBeCloseTo(quadCost(CRC[1]!), 12);
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}2 invalid trials left out \(ENV_\*, INFRA_\* and other outcomes isValid rejects\)$/));
  });

  it('a task with only invalid trials exits 1', async () => {
    const dir = tempDir('context-budget-all-invalid');
    writeQuadRun(dir, { 'crc-care-gap': CRC.map((t) => ({ ...t, outcome: 'ENV_ERROR' })) });
    const { code, lines } = await run([dir, '--task', 'crc-care-gap']);
    expect(code).toBe(1);
    expect(lines).toContainEqual(expect.stringMatching(/no valid trials of crc-care-gap/));
  });

  it('--task names each task once, however often it is given', async () => {
    const { lines } = await run([fixture('dup'), '--task', 'crc-care-gap,crc-care-gap', '--project', '--items', '10']);
    expect(lines.filter((l) => l.startsWith('crc-care-gap: 3 trials'))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith('  at 10 items:'))).toHaveLength(1);
  });

  it('warns when a trial made fewer than two requests', async () => {
    const dir = tempDir('context-budget-short');
    writeQuadRun(dir, { 'crc-care-gap': [...CRC, { T: 1, C0: 10_000, g: 0, o: 500 }] });
    const { lines } = await run([dir]);
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}warning: #3 made 1 request \(T < 2\): its k is negative, and its projection means nothing$/));
  });

  it('requires --observed-items when the run\'s env_version is not the checkout\'s', async () => {
    const other: Partial<Deps> = { checkoutEnv: async (id) => (id === 'crc-care-gap' ? 'ev-new' : `ev-${id}`), taskItems };
    const bare = await run([fixture('env'), '--json'], other);
    expect(bare.code).toBe(2);
    expect(bare.lines).toContainEqual(expect.stringMatching(/^context-budget: crc-care-gap: the run's env_version ev-crc-care-gap is not the checkout's ev-new, so the 14 items of its expected\.items may not be the items it held; give --observed-items crc-care-gap=n$/));
    const given = await run([fixture('env2'), '--observed-items', 'crc-care-gap=12', '--json'], other);
    expect(given.code).toBe(0);
    expect(given.json!.tasks['crc-care-gap']!.fit.items).toBe(12);
    // A task this checkout does not have has no env_version to match.
    expect((await run([fixture('env3'), '--json'], { checkoutEnv: async () => null, taskItems })).code).toBe(2);
  });

  it('by default takes the item count from the task\'s expected.items, and asks for --observed-items when the task has none', async () => {
    const atCheckout: Partial<Deps> = { checkoutEnv: async (id) => `ev-${id}` };
    const { code, json } = await run([fixture('items'), '--task', 'crc-care-gap', '--json'], atCheckout);
    expect(code).toBe(0);
    expect(json!.tasks['crc-care-gap']!.fit.items).toBe(crcExpected.items.length);
    // Since the W1 probes every task has an items list; the toy's expected.ts has none (builder-249).
    const dir = tempDir('context-budget-no-items');
    writeQuadRun(dir, { '_toy': CRC });
    const none = await run([dir], atCheckout);
    expect(none.code).toBe(2);
    expect(none.lines).toContainEqual('context-budget: _toy: tasks/_toy/expected.ts has no items list; give --observed-items _toy=n');
    expect((await run([dir, '--observed-items', '_toy=2', '--json'], atCheckout)).json!.tasks['_toy']!.fit.items).toBe(2);
  });

  it('never takes the item count from the overlay slots', async () => {
    const { json } = await run([fixture('not-slots'), '--task', 'crc-care-gap', '--json'], { checkoutEnv: async (id) => `ev-${id}`, taskItems: async () => 5 });
    expect(json!.tasks['crc-care-gap']!.fit.items).toBe(5);
  });

  it('names the error when the checkout\'s env_version cannot be read, thrown or rejected', async () => {
    for (const checkoutEnv of [() => { throw new Error('ENOENT fixtures/world.ndjson.gz'); }, async () => { throw new Error('task.toml: parse error'); }] as Array<NonNullable<Deps['checkoutEnv']>>) {
      const { code, lines } = await run([fixture('env-err')], { checkoutEnv, taskItems });
      expect(code).toBe(2);
      expect(lines).toContainEqual(expect.stringMatching(/^context-budget: crc-care-gap: cannot read the checkout's env_version \((ENOENT fixtures\/world\.ndjson\.gz|task\.toml: parse error)\); give --observed-items crc-care-gap=n$/));
    }
  });

  it('a record with no env_version never matches the checkout', async () => {
    const dir = tempDir('context-budget-no-env');
    writeQuadRun(dir, { 'crc-care-gap': CRC });
    const { readdirSync, readFileSync, writeFileSync } = await import('node:fs');
    for (const f of readdirSync(`${dir}/trials/crc-care-gap`)) {
      const path = `${dir}/trials/crc-care-gap/${f}`;
      const { env_version: _, ...rest } = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      writeFileSync(path, JSON.stringify(rest));
    }
    expect((await run([dir], { checkoutEnv: async () => null, taskItems })).code).toBe(2);
  });

  it('--task all reports a task whose trials are all invalid, and exits 1', async () => {
    const dir = tempDir('context-budget-all-invalid-all');
    writeQuadRun(dir, { 'crc-care-gap': CRC.map((t) => ({ ...t, outcome: 'ENV_ERROR' })), 'results-inbox': INBOX });
    const { code, lines } = await run([dir]);
    expect(code).toBe(1);
    expect(lines).toContainEqual(expect.stringMatching(/no valid trials of crc-care-gap/));
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

  it('projects each trial with its own k, C0, g and o and takes the medians', async () => {
    const dir = tempDir('context-budget-spread-project');
    const SPREAD: QuadTrial[] = [[19, 5_234], [24, 6_447], [21, 7_564]].map(([T, g]) => ({ T: T!, C0: 13_700, g: g!, o: 674 }));
    writeQuadRun(dir, { 'crc-care-gap': SPREAD }, 10_000);
    const { json } = await run([dir, '--project', '--items', '36', '--json']);
    const p = json!.tasks['crc-care-gap']!.projection!;
    const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[1]!;
    const at36 = SPREAD.map((t) => ({ ...t, T: 2 + ((t.T - 2) / 14) * 36 }));
    expect(p.T).toBeCloseTo(mid(at36.map((t) => t.T)), 9);
    expect(p.median_usd).toBeCloseTo(mid(at36.map(quadCost)), 9);
    expect(p.p90_usd).toBeCloseTo(1.25 * mid(at36.map(quadCost)), 9);
    expect(p.peak_context).toBeCloseTo(mid(at36.map((t) => t.C0 + t.g * (t.T - 1))), 6);
    expect(p.working_ms).toBeCloseTo(10_000 * mid(at36.map((t) => t.T)), 3);
  });

  it('states the scope of the mean p90 line when fewer than six tasks are projected', async () => {
    const two = await run([fixture('scope2'), '--project', '--items', '10']);
    expect(two.lines).toContainEqual('mean p90 line checked over 2 of 6 tasks (crc-care-gap, results-inbox), not the full set');
    const one = await run([fixture('scope1'), '--task', 'crc-care-gap', '--project', '--items', '10']);
    expect(one.lines).toContainEqual('mean p90 line not checked: 1 task projected (crc-care-gap), it needs two or more of 6');
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

// The item counts each pilot's world held (its overlay slots at its manifest's env_git_sha): pilot-1
// ran at d9d0d706, where crc-care-gap had 12 slots; pilot-2 at a5048ad4, the same slots as now.
// Neither run's env_version is this checkout's, so the counts are given.
const PILOT_ITEMS = {
  'pilot-1': 'contrast-ct-prep=2,crc-care-gap=12,discharge-medrec=2,message-queue=6,renal-dose-review=2,results-inbox=8',
  'pilot-2': 'contrast-ct-prep=2,crc-care-gap=14,discharge-medrec=2,message-queue=6,renal-dose-review=2,results-inbox=8',
};
const SIX = ['contrast-ct-prep', 'crc-care-gap', 'discharge-medrec', 'message-queue', 'renal-dose-review', 'results-inbox'];

describe('W0-B gate on results/pilot-2', () => {
  it('without --observed-items it exits 2: the run is not at this checkout\'s env_version', async () => {
    expect((await run(['results/pilot-2'], {})).code).toBe(2);
  });

  it('each task\'s fitted median is never more than 10% under the observed median and at most 40% over it', async () => {
    const { code, json } = await run(['results/pilot-2', '--observed-items', PILOT_ITEMS['pilot-2'], '--json'], {});
    expect(code).toBe(0);
    expect(Object.keys(json!.tasks).sort()).toEqual(SIX);
    for (const [id, t] of Object.entries(json!.tasks)) {
      const ratio = t.fit.fitted_median_usd / t.fit.observed_median_usd;
      expect(ratio, id).toBeGreaterThanOrEqual(0.9);
      expect(ratio, id).toBeLessThanOrEqual(1.4);
    }
  });

  it('crc-care-gap at 36 items exits 1 (over the $3.00 line)', async () => {
    const { code, json } = await run(['results/pilot-2', '--task', 'crc-care-gap', '--observed-items', 'crc-care-gap=14', '--project', '--items', '36', '--json'], {});
    expect(code).toBe(1);
    expect(json!.breaks).toContainEqual(expect.stringMatching(/^crc-care-gap: projected p90 \$\d+\.\d\d > \$3\.00 per trial$/));
  });
});

describe('W0-B held-out check on results/pilot-1', () => {
  it('never under-predicts a task: each fitted median is at least the observed median and at most 40% over it', async () => {
    const { code, json } = await run(['results/pilot-1', '--observed-items', PILOT_ITEMS['pilot-1'], '--json'], {});
    expect(code).toBe(0);
    expect(Object.keys(json!.tasks).sort()).toEqual(SIX);
    for (const [id, t] of Object.entries(json!.tasks)) {
      const ratio = t.fit.fitted_median_usd / t.fit.observed_median_usd;
      expect(ratio, id).toBeGreaterThanOrEqual(1);
      expect(ratio, id).toBeLessThanOrEqual(1.4);
    }
  });
});
