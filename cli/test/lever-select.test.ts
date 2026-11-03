// pnpm cli lever-select (plan-amendment-w5 W5-H): stop rule S5-2 and S5-6 computed from a classes
// JSON (pnpm cli classes --json, its per-task `lever` block), never by hand. The first block is the
// W5-H gate: on a synthetic classes JSON with the four sizing rows, the command returns the sets a
// hand computation of S5-2 gives, with the formulas written out here independently of
// cli/lever-select.ts. The later blocks cover the band edges (reserve, S5-3, a tie, no set in band),
// S5-6 over --p90, the run-directory input and the usage errors.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import type { ClassesJson, LeverRow, TaskClasses } from '../classes.ts';
import { type Deps, type LeverSelectJson, main } from '../lever-select.ts';

interface Spec { n: number; pass: number; base_pass: number; items: Array<{ id: string; kind: 'A' | 'B'; passed: number; observed: number; active?: boolean }> }

function taskOf(s: Spec): TaskClasses {
  const row = (i: Spec['items'][number]): LeverRow => ({
    id: i.id, kind: i.kind, item: `item-${i.id}`, spec: i.kind === 'A' ? `ev-${i.id}` : null, active: i.active ?? true,
    observed: i.observed, passed: i.passed, catch_rate: i.observed > 0 ? i.passed / i.observed : null, wilson: null,
    split: { retrieval: 0, reasoning: 0, process: 0, other: 0 }, sibling_exposed: null, fails: [],
  });
  return {
    trials_valid: s.n, pass: s.pass, wilson: null, split: { model: s.n - s.pass, environment: 0, grader: 0, infra: 0 }, guard_fires: 0, q: null,
    classes: [], events: [], outside_failures: [], independence: { all_items_pass: 0, expected_per_item: 0, expected_per_class: 0 }, outcomes: [],
    lever: { base_pass: s.base_pass, items: s.items.map(row) },
  };
}

function classesJson(tasks: Record<string, Spec | TaskClasses>): ClassesJson {
  return { schema_version: 1, run_dirs: ['results/synthetic'], grader_versions: ['20'], tasks: Object.fromEntries(Object.entries(tasks).map(([id, t]) => [id, 'lever' in t || 'trials_valid' in t ? (t as TaskClasses) : taskOf(t as Spec)])) };
}

function file(name: string, json: unknown): string {
  const f = join(tempDir(`lever-select-${name}`), 'classes.json');
  writeFileSync(f, JSON.stringify(json));
  return f;
}

async function run(args: string[], deps: Partial<Deps> = {}): Promise<{ code: number; out: string[]; err: string[]; json: LeverSelectJson | null }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(args, { out: (l) => out.push(l), err: (l) => err.push(l), ...deps });
  const raw = args.includes('--json') && code === 0 ? out.join('\n') : undefined;
  return { code, out, err, json: raw ? (JSON.parse(raw) as LeverSelectJson) : null };
}

// S5-2 by hand: smoothed rates, every non-empty set, nearest 0.45 inside [0.30, 0.60].
const cHat = (passed: number, observed: number) => (passed + 1) / (observed + 2);
const bHat = (basePass: number, n: number) => (basePass + 1) / (n + 2);
function byHand(s: Spec): { sets: Array<[string[], number]>; selected: string[] } {
  const b = bHat(s.base_pass, s.n);
  const ids = s.items.filter((i) => i.active ?? true).map((i) => i.id);
  const sets: Array<[string[], number]> = [];
  for (let mask = 1; mask < 1 << ids.length; mask++) {
    const set = ids.filter((_, k) => mask & (1 << k));
    sets.push([set, b * set.reduce((p, id) => p * cHat(s.items.find((i) => i.id === id)!.passed, s.items.find((i) => i.id === id)!.observed), 1)]);
  }
  const inBand = sets.filter(([, p]) => p >= 0.3 && p <= 0.6);
  const [best] = [...inBand].sort((x, y) => Math.abs(x[1] - 0.45) - Math.abs(y[1] - 0.45) || y[0].length - x[0].length);
  return { sets, selected: best![0] };
}

// The four sizing rows of plan-amendment-w5 (expected sets {A,B}, {A,B}, {A}, {B}) at 8 trials.
const SIZING: Record<string, Spec> = {
  t1: { n: 8, pass: 3, base_pass: 8, items: [{ id: 'A', kind: 'A', passed: 5, observed: 8 }, { id: 'B', kind: 'B', passed: 6, observed: 8 }] },
  t2: { n: 8, pass: 4, base_pass: 8, items: [{ id: 'A', kind: 'A', passed: 5, observed: 8 }, { id: 'B', kind: 'B', passed: 7, observed: 8 }] },
  t4: { n: 8, pass: 2, base_pass: 8, items: [{ id: 'A', kind: 'A', passed: 4, observed: 8 }, { id: 'B', kind: 'B', passed: 6, observed: 8 }] },
  t6: { n: 8, pass: 1, base_pass: 8, items: [{ id: 'A', kind: 'A', passed: 3, observed: 8 }, { id: 'B', kind: 'B', passed: 4, observed: 8 }] },
};

describe('W5-H gate: lever-select reproduces the hand-computed S5-2 sets on the four sizing rows', () => {
  it('selects {A,B}, {A,B}, {A}, {B} and prints the smoothed rates and every prediction', async () => {
    const { code, err, json, out } = await run(['--classes', file('sizing', classesJson(SIZING)), '--json']);
    expect([code, err]).toEqual([0, []]);
    expect(Object.keys(json!.tasks)).toEqual(['t1', 't2', 't4', 't6']);
    expect(Object.values(json!.tasks).map((t) => t.selected)).toEqual([['A', 'B'], ['A', 'B'], ['A'], ['B']]);
    for (const [id, s] of Object.entries(SIZING)) {
      const t = json!.tasks[id]!;
      const hand = byHand(s);
      expect(t.selected, id).toEqual(hand.selected);
      expect(t.b_hat, id).toBeCloseTo(bHat(s.base_pass, s.n), 12);
      for (const i of s.items) expect(t.items.find((x) => x.id === i.id)!.c_hat, `${id} ${i.id}`).toBeCloseTo(cHat(i.passed, i.observed), 12);
      expect(t.predictions.map((p) => p.set), id).toEqual(hand.sets.map(([set]) => set));
      t.predictions.forEach((p, k) => expect(p.pred, `${id} ${p.set.join(',')}`).toBeCloseTo(hand.sets[k]![1], 12));
    }
    // S5-2 freeze: observed both-active pass 3-5 of 8 and {A,B} selected: freeze v2, no pilot-5b.
    expect(Object.values(json!.tasks).map((t) => [t.rule, t.freeze, t.reserve])).toEqual([['S5-2 freeze', true, false], ['S5-2 freeze', true, false], ['S5-2', false, false], ['S5-2', false, false]]);
    // What each pick changes against the active set {A,B}: a B toggle is a static chart record (rebuild).
    expect(Object.values(json!.tasks).map((t) => t.toggles)).toEqual([[], [], [{ id: 'B', kind: 'B', on: false, rebuild: true }], [{ id: 'A', kind: 'A', on: false, rebuild: false }]]);
    expect(json!.tasks.t4!.notes.join('\n')).toMatch(/toggling B off changes static chart records: fixtures:build, and every task's env_version moves \(R40\)/);
    expect(json!.tasks.t6!.notes.join('\n')).toMatch(/toggling A off is a LEVER and events\.ts ACTIVE edit \(this task's env_version moves\)/);
    expect(out.join('\n')).toMatch(/^\{/);
    const text = (await run(['--classes', file('sizing-text', classesJson(SIZING))])).out.join('\n');
    expect(text).toContain('t1: 8 valid trials, PASS 3/8; b_hat 0.900 (8 passed every non-lever item)');
    expect(text).toContain('  A (A item on item-A, event ev-A): passed 5 of 8 observed, c_hat 0.600');
    expect(text).toContain('  {A} 0.540 in band; {B} 0.630 above; {A,B} 0.378 in band');
    expect(text).toContain('  selected {A,B}: S5-2 freeze (both-active PASS 3/8 is 3-5 of 8 and {A,B} is selected: freeze v2, no pilot-5b)');
    expect(text).toContain('t6: 8 valid trials, PASS 1/8');
    expect(text).toContain('  selected {B}: S5-2 (nearest 0.45 inside [0.30, 0.60])');
  });
});

describe('S5-2 band edges', () => {
  it('a tie on distance prefers the larger set', async () => {
    const spec: Spec = { n: 8, pass: 3, base_pass: 8, items: [{ id: 'A', kind: 'A', passed: 5, observed: 8 }, { id: 'B', kind: 'B', passed: 5, observed: 7 }] };
    const { json } = await run(['--classes', file('tie', classesJson({ t: spec })), '--json']);
    const t = json!.tasks.t!;
    expect(t.predictions.map((p) => [p.set, Number(p.pred.toFixed(6))])).toEqual([[['A'], 0.54], [['B'], 0.6], [['A', 'B'], 0.36]]);
    expect(t.selected).toEqual(['A', 'B']);
  });

  it('every prediction above 0.60: the set nearest 0.45 with the reserve activated (v3), the reserve in final and marked for the rebuild it needs (F1)', async () => {
    const spec: Spec = { n: 8, pass: 7, base_pass: 8, items: [{ id: 'A', kind: 'A', passed: 7, observed: 8 }, { id: 'B', kind: 'B', passed: 8, observed: 8 }, { id: 'reserve', kind: 'B', passed: 0, observed: 0, active: false }] };
    const { json } = await run(['--classes', file('reserve', classesJson({ t: spec })), '--json']);
    const t = json!.tasks.t!;
    expect([t.selected, t.rule, t.reserve, t.freeze]).toEqual([['A', 'B'], 'S5-2 reserve', true, false]);
    expect(t.final).toEqual(['A', 'B', 'reserve']);
    expect(t.toggles).toEqual([{ id: 'reserve', kind: 'B', on: true, rebuild: true }]);
    expect(t.notes.join('\n')).toMatch(/toggling reserve on changes static chart records: fixtures:build, and every task's env_version moves \(R40\)/);
    const text = (await run(['--classes', file('reserve-text', classesJson({ t: spec }))])).out.join('\n');
    expect(text).toContain('selected {A,B}: S5-2 reserve (every prediction is above 0.60: activate the reserve alongside {A,B}, v3)');
    expect(text).toContain('final {A,B,reserve}');
    // An A reserve toggles by LEVER and events.ts; a task with no inactive item has no reserve to activate.
    const aReserve: Spec = { ...spec, items: [...spec.items.slice(0, 2), { id: 'reserve', kind: 'A', passed: 0, observed: 0, active: false }] };
    const ar = (await run(['--classes', file('reserve-a', classesJson({ t: aReserve })), '--json'])).json!.tasks.t!;
    expect(ar.toggles).toEqual([{ id: 'reserve', kind: 'A', on: true, rebuild: false }]);
    const none: Spec = { ...spec, items: spec.items.slice(0, 2) };
    const nr = (await run(['--classes', file('reserve-none', classesJson({ t: none })), '--json'])).json!.tasks.t!;
    expect([nr.reserve, nr.final, nr.toggles]).toEqual([true, ['A', 'B'], []]);
    expect(nr.notes.join('\n')).toMatch(/no inactive reserve item is declared: the reserve is missing/);
  });

  it('every prediction below 0.30: S5-3, naming the set nearest 0.45', async () => {
    const spec: Spec = { n: 8, pass: 0, base_pass: 8, items: [{ id: 'A', kind: 'A', passed: 1, observed: 8 }, { id: 'B', kind: 'B', passed: 1, observed: 8 }] };
    const { json } = await run(['--classes', file('s53', classesJson({ t: spec })), '--json']);
    const t = json!.tasks.t!;
    expect([t.selected, t.rule, t.reserve, t.freeze]).toEqual([['A'], 'S5-3', false, false]);
    expect(t.notes.join('\n')).toMatch(/every prediction is below 0\.30: S5-3 \(fairness audit, then the pre-declared softening once, v3\)/);
    // F4 ruling: under S5-3 the set does not change; the nearest set is advisory.
    expect([t.final, t.toggles]).toEqual([['A', 'B'], []]);
    expect(t.notes.join('\n')).toMatch(/S5-3 changes no item: final stays the active set \{A,B\}; \{A\} is nearest 0\.45, advisory only \(toggling B off\)/);
  });

  it('F4 ruling: an exact {A}/{B} tie goes to the lower --item-cost, else to {A}', async () => {
    const spec: Spec = { n: 8, pass: 2, base_pass: 8, items: [{ id: 'A', kind: 'A', passed: 4, observed: 8 }, { id: 'B', kind: 'B', passed: 4, observed: 8 }] };
    const plain = (await run(['--classes', file('tie-ab', classesJson({ t: spec })), '--json'])).json!.tasks.t!;
    expect(plain.predictions.map((p) => Number(p.pred.toFixed(6)))).toEqual([0.45, 0.45, 0.225]);
    expect(plain.selected).toEqual(['A']);
    expect(plain.notes.join('\n')).toMatch(/\{A\} and \{B\} tie at 0\.450: \{A\} \(the measured mechanism\)/);
    const priced = (await run(['--classes', file('tie-ab-cost', classesJson({ t: spec })), '--item-cost', 't.A=0.30,t.B=0.10', '--json'])).json!.tasks.t!;
    expect(priced.selected).toEqual(['B']);
    expect(priced.notes.join('\n')).toMatch(/\{A\} and \{B\} tie at 0\.450: \{B\} \(lower projected p90 by --item-cost, \$0\.10 vs \$0\.30\)/);
    // The B-only order puts {B} first, so {A} does not win by enumeration.
    const ba: Spec = { ...spec, items: [spec.items[1]!, spec.items[0]!] };
    expect((await run(['--classes', file('tie-ba', classesJson({ t: ba })), '--json'])).json!.tasks.t!.selected).toEqual(['A']);
  });

  it('no set in band and the predictions straddle it: the set nearest 0.45, flagged for a ruling', async () => {
    const spec: Spec = { n: 8, pass: 1, base_pass: 8, items: [{ id: 'A', kind: 'A', passed: 1, observed: 8 }, { id: 'B', kind: 'B', passed: 8, observed: 8 }] };
    const { json } = await run(['--classes', file('straddle', classesJson({ t: spec })), '--json']);
    const t = json!.tasks.t!;
    expect([t.selected, t.rule]).toEqual([['A'], 'S5-2 no set in band']);
    expect(t.notes.join('\n')).toMatch(/no set is inside \[0\.30, 0\.60\] and the predictions straddle it: coordinator ruling/);
  });

  it('an inactive item is not a candidate; an active item with no observation is flagged', async () => {
    const spec: Spec = { n: 8, pass: 4, base_pass: 8, items: [{ id: 'A', kind: 'A', passed: 0, observed: 0 }, { id: 'B', kind: 'B', passed: 6, observed: 8 }, { id: 'R', kind: 'B', passed: 0, observed: 0, active: false }] };
    const { json } = await run(['--classes', file('inactive', classesJson({ t: spec })), '--json']);
    const t = json!.tasks.t!;
    expect(t.predictions.map((p) => p.set)).toEqual([['A'], ['B'], ['A', 'B']]);
    expect(t.items.map((i) => [i.id, i.active, i.c_hat])).toEqual([['A', true, 0.5], ['B', true, 0.7], ['R', false, null]]);
    expect(t.notes.join('\n')).toMatch(/A was never observed \(its arrival never fired\): its c_hat is the prior 0\.5/);
  });
});

describe('S5-6 over --p90', () => {
  it('a task whose p90 exceeds $3.00 drops its most expensive lever item: an A over a B, the later-declared among equals', async () => {
    const { json } = await run(['--classes', file('cap', classesJson(SIZING)), '--p90', 't1=3.10,t2=2.00,t4=2.00,t6=2.00', '--json']);
    expect(Object.values(json!.tasks).map((t) => [t.p90, t.drop, t.final])).toEqual([[3.1, 'A', ['B']], [2, null, ['A', 'B']], [2, null, ['A']], [2, null, ['B']]]);
    expect(json!.tasks.t1!.notes.join('\n')).toMatch(/p90 \$3\.10 exceeds \$3\.00: drops A \(an A item, one event, \$0\.20\); p90 \$2\.90 after it/);
    expect(json!.mean_p90).toBeCloseTo(2.275, 9);
    expect(json!.mean_p90_after).toBeCloseTo(2.225, 9);
    expect(json!.steps).toEqual(['t1: p90 $3.10 exceeds $3.00: drops A ($0.20), p90 $2.90']);
  });

  it('F5 ruling: while the four-task mean exceeds $2.40, the highest-p90 task drops one item, each step printed', async () => {
    const { json } = await run(['--classes', file('mean', classesJson(SIZING)), '--p90', 't1=2.30,t2=2.50,t4=2.45,t6=2.50', '--json']);
    expect(json!.mean_p90).toBeCloseTo(2.4375, 9);
    // t2 and t6 tie at $2.50; the earlier task drops first; one drop brings the mean to $2.3875.
    expect(Object.values(json!.tasks).map((t) => [t.drop, t.final, t.p90_after])).toEqual([[null, ['A', 'B'], 2.3], ['A', ['B'], 2.3], [null, ['A'], 2.45], [null, ['B'], 2.5]]);
    expect(json!.steps).toEqual(['mean p90 $2.44 exceeds $2.40: t2 has the highest p90 and drops A ($0.20), p90 $2.30; mean $2.39']);
    expect(json!.mean_p90_after).toBeCloseTo(2.3875, 9);
    // Every task high: the loop walks the highest task each time, until the mean holds or no item is left.
    const high = await run(['--classes', file('mean-high', classesJson(SIZING)), '--p90', 't1=2.60,t2=2.60,t4=2.60,t6=2.60', '--json']);
    expect(high.json!.steps).toEqual([
      'mean p90 $2.60 exceeds $2.40: t1 has the highest p90 and drops A ($0.20), p90 $2.40; mean $2.55',
      'mean p90 $2.55 exceeds $2.40: t2 has the highest p90 and drops A ($0.20), p90 $2.40; mean $2.50',
      'mean p90 $2.50 exceeds $2.40: t4 has the highest p90 and drops A ($0.20), p90 $2.40; mean $2.45',
      // (2.40 + 2.40 + 2.40 + 2.50) / 4 = 2.425, printed by toFixed as $2.42.
      'mean p90 $2.45 exceeds $2.40: t6 has the highest p90 and drops B ($0.10), p90 $2.50; mean $2.42',
      'mean p90 $2.42 exceeds $2.40: t1 has the highest p90 with an item left and drops B ($0.10), p90 $2.30; mean $2.40',
    ]);
    expect(Object.values(high.json!.tasks).map((t) => [t.drops, t.final])).toEqual([[['A', 'B'], []], [['A'], ['B']], [['A'], []], [['B'], []]]);
    expect(high.json!.mean_p90_after).toBeCloseTo(2.4, 9);
  });

  it('--item-cost prices the drops; dropping the only item leaves the set empty; --p90 needs all four tasks', async () => {
    const { json } = await run(['--classes', file('item-cost', classesJson(SIZING)), '--p90', 't1=3.10,t2=2.00,t4=3.50,t6=2.00', '--item-cost', 't1.B=0.90,t1.A=0.20', '--json']);
    expect([json!.tasks.t1!.drop, json!.tasks.t1!.final, json!.tasks.t1!.p90_after]).toEqual(['B', ['A'], 2.2]);
    expect([json!.tasks.t4!.drop, json!.tasks.t4!.final]).toEqual(['A', []]);
    expect(json!.tasks.t4!.notes.join('\n')).toMatch(/no lever item is left/);
    expect([json!.tasks.t2!.p90, json!.tasks.t2!.drop]).toEqual([2, null]);
    expect(json!.mean_p90).toBeCloseTo(2.65, 9);
    expect(json!.mean_p90_after).toBeCloseTo(2.375, 9);
    const two = await run(['--classes', file('p90-two', classesJson(SIZING)), '--p90', 't1=3.10,t4=3.50']);
    expect(two.code).toBe(2);
    expect(two.err.join('\n')).toMatch(/S5-6's mean is over the four W5 tasks: give --p90 for all four \(got 2: t1, t4\)/);
  });
});

describe('inputs and usage', () => {
  it('reads run directories through classes, and names them as the source', async () => {
    const classes = async (runs: readonly string[]) => ({ ...classesJson(SIZING), run_dirs: [...runs] });
    const { code, json } = await run(['results/a,results/b', '--json'], { classes });
    expect(code).toBe(0);
    expect(json!.source).toEqual(['results/a', 'results/b']);
    expect(json!.tasks.t4!.selected).toEqual(['A']);
  });

  it('skips a task without lever items, with a line', async () => {
    const plain = taskOf(SIZING.t1!);
    delete (plain as { lever?: unknown }).lever;
    const { code, json } = await run(['--classes', file('skip', classesJson({ ...SIZING, t3: plain })), '--json']);
    expect(code).toBe(0);
    expect(Object.keys(json!.tasks)).toEqual(['t1', 't2', 't4', 't6']);
    expect(json!.skipped).toEqual(['t3']);
    const text = (await run(['--classes', file('skip-text', classesJson({ ...SIZING, t3: plain }))])).out.join('\n');
    expect(text).toContain('t3: no lever items; skipped');
  });

  it('exits 2 on a usage error and 1 on an unreadable classes file', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(['--classes'])).code).toBe(2);
    expect((await run(['--classes', 'x.json', 'results/a'])).code).toBe(2);
    expect((await run(['--classes', file('p90-bad', classesJson(SIZING)), '--p90', 't1=abc'])).code).toBe(2);
    expect((await run(['--classes', file('cost-bad', classesJson(SIZING)), '--p90', 't1=2', '--item-cost', 't1=2'])).code).toBe(2);
    expect((await run(['--classes', file('p90-stray', classesJson(SIZING)), '--p90', 'nope=2'])).code).toBe(2);
    expect((await run(['--classes', join(tempDir('lever-select-missing'), 'none.json')])).code).toBe(1);
    const bad = await run(['--classes', file('bad', { schema_version: 1, tasks: {} })]);
    expect(bad.code).toBe(1);
    expect(bad.err.join('\n')).toMatch(/run_dirs/);
  });
});
