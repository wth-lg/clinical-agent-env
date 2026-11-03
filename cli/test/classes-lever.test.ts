// pnpm cli classes: the per-lever-item rows (plan-amendment-w5 W5-H, stop rule S5). On a synthetic
// run whose task declares lever items (tasks/<id>/expected.ts LEVER_ITEMS and LEVER), the table
// adds one row per item: catch = item passed / item observed (an A item is observed in a trial when
// its arrival fired, a B item in every valid trial while it is active), Wilson 95% over the
// observations, each failure's label and the retrieval / reasoning / process split, and how many
// observed trials exposed every sibling record the item declares (the trajectory's exposed ids), with
// the task's base_pass (trials passing every non-lever item) for S5's b_t. A task without lever
// items prints exactly what it printed before (no `lever` key), which is the gate on
// results/pilot-4a and results/pilot-4b.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import { type ClassesJson, classesJsonProblems, type Deps, main, type TaskEvents, type TaskLever } from '../classes.ts';

async function run(args: string[], deps: Partial<Deps> = {}): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(args, { out: (l) => out.push(l), err: (l) => err.push(l), ...deps });
  return { code, out, err };
}

// The task: base items a, b (class x) and c (class y); la hosts lever item A (its arrival ea), lb
// hosts lever item B; the reserve R is inactive and its list entry absent (G1).
const ITEMS = [{ key: 'a', class: 'x', label: 'A' }, { key: 'b', class: 'x', label: 'B' }, { key: 'c', class: 'y', label: 'C' }, { key: 'la', class: 'z', label: 'LA' }, { key: 'lb', class: 'z', label: 'LB' }];
const EVENTS: TaskEvents = { SPECS: [{ id: 'e1', item: 'a', class: 'A' }, { id: 'ea', item: 'la', class: 'A' }], ACTIVE: ['e1', 'ea'] };
const LEVER: TaskLever = {
  active: ['A', 'B'],
  items: [
    { id: 'A', kind: 'A', item: 'la', spec: 'ea', sibling: ['Observation/sib-1'] },
    { id: 'B', kind: 'B', item: 'lb', sibling: ['DocumentReference/doc-b'] },
    { id: 'R', kind: 'B', item: 'lr', sibling: [] },
  ],
};

interface Fake { outcome: string; fails?: Array<[string, string]>; labels?: Array<[string, string, string]>; fired?: string[]; exposed?: string[]; items?: string[] }

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function writeRun(dir: string, trials: Fake[]): void {
  trials.forEach((t, index) => {
    const keys = t.items ?? ['a', 'b', 'c', 'la', 'lb', 'outside'];
    const gates = [...new Set(['g', ...(t.fails ?? []).map(([, gate]) => gate)])];
    const checks = gates.map((id) => ({ id, kind: 'gate', met: true, items: keys.map((item) => ({ item, met: !(t.fails ?? []).some(([i, g]) => i === item && g === id) })) }));
    const valid = ['PASS', 'FAIL', 'LIMIT', 'REFUSAL'].includes(t.outcome);
    put(join(dir, 'trials', 'tk', `${index}.json`), JSON.stringify({
      task_id: 'tk', index, outcome: t.outcome, valid, grader_version: 20, task_version: 'v1', checks,
      attribution: t.labels ? { items: t.labels.map(([item, gate, auto]) => ({ item, gate, auto })) } : null,
    }));
    const lines = [
      { v: 2, seq: 1, ts: 'x', turn: 1, type: 'tool_call', tool_use_id: 'c1', name: 'fhir_read', input: {} },
      { v: 2, seq: 2, ts: 'x', turn: 1, type: 'tool_result', tool_use_id: 'c1', name: 'fhir_read', is_error: false, error_code: null, executed: true, exposed_ids: t.exposed ?? [], referenced_ids: ['Patient/pt-ref'], written_ids: [], content: {} },
      // An errored call exposes nothing, whatever its ids say.
      { v: 2, seq: 3, ts: 'x', turn: 1, type: 'tool_result', tool_use_id: 'c2', name: 'fhir_read', is_error: true, error_code: 'NOT_FOUND', executed: true, exposed_ids: ['Observation/sib-1', 'DocumentReference/doc-b'], referenced_ids: [], written_ids: [], content: {} },
      ...(t.fired ?? []).map((spec, k) => ({ v: 2, seq: 10 + k, ts: 'x', turn: 3, type: 'env_event', tool_use_id: 'c1', spec, arrivalSeq: k + 1, keys: [`Observation/obs-${spec}`] })),
      { v: 2, seq: 200, ts: 'x', turn: 5, type: 'tool_result', name: 'finish', is_error: false, error_code: null, content: { ok: true } },
    ];
    put(join(dir, 'trajectories', 'tk', `${index}.jsonl`), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  });
}

const SIB = 'Observation/sib-1';
const DOC = 'DocumentReference/doc-b';
const TRIALS: Fake[] = [
  { outcome: 'PASS', fired: ['e1', 'ea'], exposed: [SIB, DOC] },
  { outcome: 'FAIL', fired: ['e1', 'ea'], fails: [['la', 'dose']], labels: [['la', 'dose', 'retrieval']], exposed: [] },
  { outcome: 'FAIL', fired: ['e1', 'ea'], fails: [['la', 'dose']], labels: [['la', 'dose', 'reasoning']], exposed: [SIB, DOC] },
  // ea did not fire: A is not observed; B fails.
  { outcome: 'FAIL', fired: ['e1'], fails: [['lb', 'dose']], labels: [['lb', 'dose', 'reasoning']], exposed: [DOC] },
  { outcome: 'PASS', fired: ['e1', 'ea'], exposed: [SIB] },
  // A base item fails: counts against base_pass, not against the lever items.
  { outcome: 'FAIL', fired: ['e1', 'ea'], fails: [['b', 'g']], labels: [['b', 'g', 'retrieval']], exposed: [SIB, DOC] },
  { outcome: 'ENV_ERROR', fired: ['e1', 'ea'], exposed: [SIB, DOC] },
  { outcome: 'FAIL', fired: ['e1', 'ea'], fails: [['la', 'event_seen'], ['la', 'amended']], labels: [['la', 'event_seen', 'retrieval'], ['la', 'amended', 'retrieval']], exposed: [] },
];

const deps: Partial<Deps> = { itemClasses: async () => ITEMS, events: async () => EVENTS, checkoutVersion: async () => 'v1', lever: async () => LEVER };

async function synth(name: string, trials: Fake[], d: Partial<Deps> = deps): Promise<{ code: number; json: ClassesJson | null; err: string[]; out: string[] }> {
  const dir = tempDir(`classes-lever-${name}`);
  writeRun(dir, trials);
  const r = await run([dir, '--json'], d);
  return { code: r.code, json: r.code === 0 ? (JSON.parse(r.out.join('\n')) as ClassesJson) : null, err: r.err, out: r.out };
}

describe('pnpm cli classes lever rows (W5-H)', () => {
  it('one row per lever item: catch over its observations, labels and their split, sibling exposure, and base_pass', async () => {
    const { code, json, err } = await synth('rows', TRIALS);
    expect([code, err]).toEqual([0, []]);
    expect(classesJsonProblems(json)).toEqual([]);
    const t = json!.tasks.tk!;
    expect(t.trials_valid).toBe(7);
    const lever = t.lever!;
    // Trials passing every non-lever item (a, b, c and outside): all but trial 5.
    expect(lever.base_pass).toBe(6);
    expect(lever.items.map((i) => i.id)).toEqual(['A', 'B', 'R']);
    const [A, B, R] = lever.items;
    expect(A).toMatchObject({ id: 'A', kind: 'A', item: 'la', spec: 'ea', active: true, observed: 6, passed: 3, catch_rate: 0.5, split: { retrieval: 2, reasoning: 1, process: 0, other: 0 }, sibling_exposed: 4 });
    expect(A!.wilson!.lo).toBeCloseTo(0.1876, 3);
    expect(A!.fails).toEqual([
      { trial: 1, run: expect.any(String), gates: ['dose'], label: 'retrieval', sibling_exposed: false },
      { trial: 2, run: expect.any(String), gates: ['dose'], label: 'reasoning', sibling_exposed: true },
      { trial: 7, run: expect.any(String), gates: ['event_seen', 'amended'], label: 'retrieval', sibling_exposed: false },
    ]);
    expect(B).toMatchObject({ id: 'B', kind: 'B', item: 'lb', spec: null, active: true, observed: 7, passed: 6, split: { retrieval: 0, reasoning: 1, process: 0, other: 0 }, sibling_exposed: 4 });
    expect(B!.catch_rate).toBeCloseTo(6 / 7, 9);
    expect(B!.fails).toEqual([{ trial: 3, run: expect.any(String), gates: ['dose'], label: 'reasoning', sibling_exposed: true }]);
    // The inactive reserve: no observations, no interval, and its absent list entry is no error.
    expect(R).toMatchObject({ id: 'R', kind: 'B', item: 'lr', spec: null, active: false, observed: 0, passed: 0, catch_rate: null, wilson: null, sibling_exposed: null, fails: [] });
    // The class table is what it was: la and lb are ordinary items of class z there.
    expect(t.classes.find((c) => c.class === 'z')!.instances.map((i) => [i.item, i.fails])).toEqual([['la', 3], ['lb', 1]]);
  });

  it('an item that declares its gates fails the lever only on those gates; a label with no attribution is ?', async () => {
    const gated: TaskLever = { active: ['A'], items: [{ id: 'A', kind: 'A', item: 'la', spec: 'ea', sibling: [SIB], gates: ['dose'] }] };
    const { json } = await synth('gates', [
      { outcome: 'FAIL', fired: ['ea'], fails: [['la', 'event_seen']], labels: [['la', 'event_seen', 'retrieval']] },
      { outcome: 'FAIL', fired: ['ea'], fails: [['la', 'dose'], ['la', 'event_seen']], labels: [['la', 'event_seen', 'retrieval'], ['la', 'dose', 'process']] },
      { outcome: 'FAIL', fired: ['ea'], fails: [['la', 'dose']] },
    ], { ...deps, lever: async () => gated });
    const A = json!.tasks.tk!.lever!.items[0]!;
    expect([A.observed, A.passed]).toEqual([3, 1]);
    expect(A.fails.map((f) => [f.trial, f.gates, f.label])).toEqual([[1, ['dose'], 'process'], [2, ['dose'], '?']]);
    expect(A.split).toEqual({ retrieval: 0, reasoning: 0, process: 1, other: 1 });
    // la is an active lever item's list item, so its gates outside the declared ones count against
    // neither the lever item nor base_pass, which reads the non-lever items only.
    expect(json!.tasks.tk!.lever!.base_pass).toBe(3);
  });

  it('prints the lever table in markdown', async () => {
    const dir = tempDir('classes-lever-md');
    writeRun(dir, TRIALS);
    const { code, out } = await run([dir], deps);
    expect(code).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |');
    expect(text).toMatch(/^\| A \| A \| la \| ea \| yes \| 0\.50 \(3 \/ 6\) \| \[0\.19, 0\.81\] \| 2 \/ 1 \/ 0 \/ 0 \| 4 \/ 6 \| #1: dose -> retrieval, no<br>#2: dose -> reasoning, yes<br>#7: event_seen, amended -> retrieval, no \|$/m);
    expect(text).toMatch(/^\| R \| B \| lr \| {2}\| no \| \(0 \/ 0\) \| {2}\| 0 \/ 0 \/ 0 \/ 0 \| {2}\| {2}\|$/m);
    expect(text).toContain('base_pass 6 / 7 valid trials passed every non-lever item');
  });

  it('a task without lever items has no lever key and prints no lever table', async () => {
    const { json, out } = await synth('none', [{ outcome: 'PASS', fired: ['e1', 'ea'] }], { ...deps, lever: async () => null });
    expect(json!.tasks.tk!.lever).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain('"lever"');
    expect(out.join('\n')).not.toContain('lever item');
  });

  it('exits 1 when an active lever item names a list item the checkout does not grade, or an A item names no event', async () => {
    const stray = await synth('stray', [{ outcome: 'PASS' }], { ...deps, lever: async () => ({ active: ['B'], items: [{ id: 'B', kind: 'B', item: 'nope', sibling: [] }] }) });
    expect(stray.code).toBe(1);
    expect(stray.err.join('\n')).toMatch(/lever item B names item nope, which is not in the checkout's list/);
    const noEvent = await synth('no-event', [{ outcome: 'PASS' }], { ...deps, lever: async () => ({ active: ['A'], items: [{ id: 'A', kind: 'A', item: 'la', sibling: [] }] }) });
    expect(noEvent.code).toBe(1);
    expect(noEvent.err.join('\n')).toMatch(/lever item A is an A item and names no event spec/);
  });

  it('R37: a historical run takes its lever table from item-classes.json', async () => {
    const dir = tempDir('classes-lever-historical');
    writeRun(dir, [{ outcome: 'PASS', fired: ['ea'], exposed: [SIB] }, { outcome: 'FAIL', fired: ['ea'], fails: [['la', 'dose']], labels: [['la', 'dose', 'retrieval']] }]);
    put(join(dir, 'item-classes.json'), JSON.stringify({ schema_version: 1, commit: 'abc', tasks: { tk: { items: ITEMS, events: EVENTS, lever: LEVER } } }));
    const r = await run([dir, '--json'], { ...deps, checkoutVersion: async () => 'v2', lever: async () => null });
    expect([r.code, r.err]).toEqual([0, []]);
    const t = (JSON.parse(r.out.join('\n')) as ClassesJson).tasks.tk!;
    expect(t.historical).toEqual({ task_versions: ['v1'], checkout: 'v2' });
    expect(t.lever!.items.map((i) => [i.id, i.observed, i.passed])).toEqual([['A', 2, 1], ['B', 2, 2], ['R', 0, 0]]);
    expect(t.lever!.base_pass).toBe(2);
  });

  it('classesJsonProblems names a malformed lever block', () => {
    const base = { schema_version: 1, run_dirs: [], grader_versions: [], tasks: {} };
    const task = (lever: unknown) => ({ ...base, tasks: { t: { trials_valid: 0, pass: 0, wilson: null, guard_fires: 0, split: { model: 0, environment: 0, grader: 0, infra: 0 }, q: null, classes: [], events: [], outside_failures: [], independence: { all_items_pass: 0, expected_per_item: 0, expected_per_class: 0 }, outcomes: [], lever } } });
    expect(classesJsonProblems(task({ base_pass: 0, items: [] }))).toEqual([]);
    expect(classesJsonProblems(task({ base_pass: 0 }))).toEqual(['tasks.t.lever: wrong type']);
    expect(classesJsonProblems(task({ base_pass: 0, items: [{ id: 'A' }] }))).toEqual(['tasks.t.lever: wrong type']);
  });
});
