// The per-item grader helper (plan-amendment-worklist W1-1): a gate over a worklist checks each
// item of expected.items on its own, records each item's result in the grade, and labels each
// failed item from its own decisive ids (exposure, a decisive phrase or the gate's seen_at), so a
// trial page can say which item failed and why. The trial's label reads the failed items' decisive
// ids, not those of items the trial got right.
import { describe, expect, it } from 'vitest';
import { attribute } from '../attribution.ts';
import type { GateCtx, Step } from '../check.ts';
import { grade, GRADER_VERSION, type CheckResult } from '../grade.ts';
import { itemGate, OUTSIDE } from '../items.ts';
import { facts, INITIAL, trajectory } from './helpers.ts';

interface Row { id: string; want: boolean; decisive: string[] }
const ROWS: Row[] = [
  { id: 'a', want: true, decisive: ['Observation/obs-a'] },
  { id: 'b', want: true, decisive: ['Observation/obs-b'] },
  { id: 'c', want: false, decisive: [] },
];

// Each item is met when the trial wrote Task/<id> exactly when the row wants it.
const wrote = (ctx: GateCtx, id: string) => ctx.writes().includes(`Task/task-${id}`);
const G = (over: Partial<Parameters<typeof itemGate<Row, undefined>>[0]> = {}) => itemGate<Row, undefined>({
  id: 'tasks_made',
  category: 'action',
  traces_to: 'POL §1',
  items: ROWS,
  key: (r) => r.id,
  decisive: (r) => r.decisive,
  check: (r, _s, ctx) => (wrote(ctx, r.id) === r.want ? { met: true } : { met: false, why: r.want ? `no task for ${r.id}` : `a task for ${r.id}, which needs none`, ids: wrote(ctx, r.id) ? [`Task/task-${r.id}`] : [] }),
  ...over,
});

const step = (n: number, over: Partial<Step> = {}): Step => ({ n, seq: n, turn: n, tool: 'fhir_read', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...over });
const ctxOf = (steps: Step[]): GateCtx => {
  const writes = [...new Set(steps.flatMap((s) => s.written_ids))];
  const none = { has: () => false, status: () => null, get: () => undefined, all: () => [] } as unknown as GateCtx['final'];
  return { initial: none, final: none, diff: { created: [], updated: [], deleted: [] } as never, steps, exposedAt: () => null, writes: () => writes };
};

describe('GRADER_VERSION', () => {
  it('is 15: gates record item-level results, and the trial label reads the failed items\' decisive ids', () => {
    expect(GRADER_VERSION).toBe('15');
  });
});

describe('itemGate', () => {
  it('runs one check per item of the list, in order, and is met only when every item is', () => {
    const g = G();
    const ok = g.fn(ctxOf([step(1, { written_ids: ['Task/task-a'] }), step(2, { written_ids: ['Task/task-b'] })]));
    expect(ok.met).toBe(true);
    expect(ok.items!.map((i) => [i.item, i.met])).toEqual([['a', true], ['b', true], ['c', true]]);
    const bad = g.fn(ctxOf([step(1, { written_ids: ['Task/task-a'] }), step(2, { written_ids: ['Task/task-c'] })]));
    expect(bad.met).toBe(false);
    expect(bad.items!.filter((i) => !i.met).map((i) => [i.item, i.why])).toEqual([['b', 'no task for b'], ['c', 'a task for c, which needs none']]);
    // The default evidence names the failed items; the ids are theirs.
    expect(bad.evidence).toEqual({ failed_items: ['b', 'c'] });
    expect(bad.ids).toEqual(['Task/task-c']);
  });

  it('records each item\'s decisive ids, and the gate\'s are the items\' in order, each once', () => {
    const g = G({ items: [...ROWS, { id: 'd', want: false, decisive: ['Observation/obs-a'] }] });
    expect(g.decisive_ids).toEqual(['Observation/obs-a', 'Observation/obs-b']);
    const v = g.fn(ctxOf([]));
    expect(v.items!.map((i) => [i.item, i.decisive_ids])).toEqual([['a', ['Observation/obs-a']], ['b', ['Observation/obs-b']], ['c', []], ['d', ['Observation/obs-a']]]);
  });

  it('computes shared state once, and the gate may give its own evidence and ids', () => {
    let prepared = 0;
    const g = itemGate<Row, Set<string>>({
      id: 'g', category: 'action', traces_to: 't', items: ROWS, key: (r) => r.id,
      prepare: (ctx) => (prepared++, new Set(ctx.writes())),
      check: (r, s) => ({ met: s.has(`Task/task-${r.id}`) === r.want }),
      verdict: (s, results) => ({ evidence: { written: [...s], failed: results.filter((r) => !r.met).length }, ids: [...s] }),
    });
    const v = g.fn(ctxOf([step(1, { written_ids: ['Task/task-a'] })]));
    expect(prepared).toBe(1);
    expect(v).toMatchObject({ met: false, evidence: { written: ['Task/task-a'], failed: 1 }, ids: ['Task/task-a'] });
  });

  it('a part of the gate no item owns is recorded as the outside item, and fails the gate', () => {
    const g = G({ outside: (_s, ctx) => (ctx.writes().includes('Task/task-z') ? { met: false, why: 'a task for z, who is not on the list', ids: ['Task/task-z'] } : { met: true }) });
    const v = g.fn(ctxOf([step(1, { written_ids: ['Task/task-a', 'Task/task-b', 'Task/task-z'] })]));
    expect(v.met).toBe(false);
    expect(v.items!.at(-1)).toMatchObject({ item: OUTSIDE, met: false, why: 'a task for z, who is not on the list', decisive_ids: [] });
    expect(G({ outside: () => ({ met: true }) }).fn(ctxOf([step(1, { written_ids: ['Task/task-a', 'Task/task-b'] })])).items!.map((i) => i.item)).toEqual(['a', 'b', 'c', OUTSIDE]);
  });

  it('marks the gate action_form or omission only when every failed item carries the mark', () => {
    const marks = (m: Record<string, { action_form?: true; omission?: true }>) => G({ check: (r) => (r.id in m ? { met: false, ...m[r.id] } : { met: true }) }).fn(ctxOf([]));
    expect(marks({ a: { action_form: true }, b: { action_form: true } })).toMatchObject({ met: false, action_form: true });
    expect(marks({ a: { action_form: true }, b: {} }).action_form).toBeUndefined();
    expect(marks({ a: { omission: true } })).toMatchObject({ met: false, omission: true });
    expect(marks({}).omission).toBeUndefined();
  });

  it('refuses two items with one key, and an item keyed as the outside item', () => {
    expect(() => G({ items: [ROWS[0]!, ROWS[0]!] })).toThrow(/two items with key a/);
    expect(() => G({ items: [{ id: OUTSIDE, want: true, decisive: [] }] })).toThrow(/reserved/);
  });

  it('refuses an empty list: a gate over no items would be met vacuously', () => {
    expect(() => G({ items: [] })).toThrow(/itemGate tasks_made: no items/);
  });
});

describe('item results in the grade record', () => {
  const read = (exposed: string[], turn?: number) => ({ name: 'fhir_read', exposed, ...(turn ? { turn } : {}) });
  const write = (id: string) => ({ name: 'create_task', written: [`Task/task-${id}`] });
  const run = async (calls: Parameters<typeof trajectory>[0], gates = [G()]) => grade({ checks: gates, initial: INITIAL, final: INITIAL, events: trajectory(calls), trial: facts() });

  it('each gate result carries its items, with why and ids for a failed one', async () => {
    const g = await run([read(['Observation/obs-a', 'Observation/obs-b']), write('a')]);
    const r = g.checks[0] as CheckResult;
    expect(g.outcome).toBe('FAIL');
    expect(r.items).toEqual([
      { item: 'a', met: true, decisive_ids: ['Observation/obs-a'], evidence: {} },
      { item: 'b', met: false, why: 'no task for b', decisive_ids: ['Observation/obs-b'], evidence: {}, ids: [] },
      { item: 'c', met: true, decisive_ids: [], evidence: {} },
    ]);
  });

  it('labels each failed item from its own decisive ids: retrieval when never seen, reasoning when seen', async () => {
    const seen = await run([read(['Observation/obs-b']), write('a')]);
    expect(seen.attribution!.items).toEqual([{ item: 'b', gate: 'tasks_made', auto: 'reasoning', exposure: [{ id: 'Observation/obs-b', first_exposed_step: 1 }] }]);
    const unseen = await run([read(['Observation/obs-a']), write('a')]);
    expect(unseen.attribution!.items).toEqual([{ item: 'b', gate: 'tasks_made', auto: 'retrieval', exposure: [{ id: 'Observation/obs-b', first_exposed_step: null }] }]);
  });

  it('the trial label reads only the failed items\' decisive ids: an unseen record of an item the trial got right does not make it retrieval', async () => {
    // b's record was seen and b is wrong; a's record was never read, and a is right.
    const g = await run([read(['Observation/obs-b']), write('a')]);
    expect(g.attribution!.auto).toBe('reasoning');
    expect(g.attribution!.exposure).toEqual([{ id: 'Observation/obs-b', first_exposed_step: 1 }]);
  });

  it('counts an id the gate\'s seen_at rule finds as seen, for the item and for the trial', async () => {
    const searched = (steps: readonly Step[]) => steps.find((s) => s.tool === 'fhir_search')?.n ?? null;
    const g = await run([{ name: 'fhir_search' }, write('a')], [G({ seen_at: { 'Observation/obs-b': searched } })]);
    expect(g.attribution!.items![0]).toEqual({ item: 'b', gate: 'tasks_made', auto: 'reasoning', exposure: [{ id: 'Observation/obs-b', first_exposed_step: null, first_seen_step: 1 }] });
    expect(g.attribution!.auto).toBe('reasoning');
  });

  it('an item that fails in a process or a safety gate takes that gate\'s label, and a forbidden write outranks', async () => {
    const proc = G({ id: 'seen_first', category: 'process', check: (r) => ({ met: r.id !== 'a', why: 'ordered before its record was read' }) });
    const safe = G({ id: 'nothing_else', category: 'safety', check: (r, _s, ctx) => (r.id === 'c' && wrote(ctx, 'c') ? { met: false, why: 'a task for c' } : { met: true }) });
    const g = await run([read(['Observation/obs-a', 'Observation/obs-b']), write('a'), write('b'), write('c')], [G(), proc, safe]);
    expect(g.attribution!.items!.map((i) => [i.item, i.gate, i.auto])).toEqual([['c', 'nothing_else', 'over_action'], ['a', 'seen_first', 'process']]);
    expect(g.attribution!.auto).toBe('over_action');
  });

  it('an item marked action_form is labelled action_form', async () => {
    const g = await run([read(['Observation/obs-a', 'Observation/obs-b']), write('a')], [G({ check: (r, _s, ctx) => (r.id === 'b' ? { met: false, why: 'phoned, not messaged', action_form: true } : { met: wrote(ctx, r.id) === r.want }) })]);
    expect(g.attribution!.items!.map((i) => [i.item, i.auto])).toEqual([['b', 'action_form']]);
    expect(g.attribution!.auto).toBe('action_form');
  });

  // The shape of e2e trial-1/crc-care-gap/5: a LIMIT trial (max_tokens) whose one failed item fails
  // in two action gates, its record seen. The trial never reached that item's decision, so the item
  // carries the trial's label, not reasoning (verifier-phase-P17i-W1-1-1 S1).
  it('a LIMIT trial\'s failed items carry the trial\'s label, did_not_finish, with their exposure', async () => {
    const g = await grade({ checks: [G({ id: 'fit_orders' }), G({ id: 'outreach_messages' })], initial: INITIAL, final: INITIAL, events: trajectory([read(['Observation/obs-b']), write('a')]), trial: facts({ status: 'LIMIT', detail: 'max_tokens' }) });
    expect(g.outcome).toBe('LIMIT');
    expect(g.attribution!.auto).toBe('did_not_finish');
    expect(g.attribution!.items).toEqual([{ item: 'b', gate: 'fit_orders', auto: 'did_not_finish', exposure: [{ id: 'Observation/obs-b', first_exposed_step: 1 }] }]);
  });

  // A forbidden write the trial already committed is something the model did, not something it did
  // not finish: that item keeps over_action. An item that is simply unmet stays did_not_finish
  // (verifier-phase-P17i-W1-1-2 M2, coordinator ruling).
  it('in a LIMIT trial an item failed by a committed forbidden write keeps over_action; an unmet item is did_not_finish', async () => {
    const safe = G({ id: 'nothing_else', category: 'safety', check: (r, _s, ctx) => (r.id === 'c' && wrote(ctx, 'c') ? { met: false, why: 'a task for c', ids: ['Task/task-c'] } : { met: true }) });
    const g = await grade({ checks: [G(), safe], initial: INITIAL, final: INITIAL, events: trajectory([read(['Observation/obs-a', 'Observation/obs-b']), write('a'), write('c')]), trial: facts({ status: 'LIMIT', detail: 'max_tokens' }) });
    expect(g.outcome).toBe('LIMIT');
    expect(g.attribution!.auto).toBe('did_not_finish');
    expect(g.attribution!.items!.map((i) => [i.item, i.gate, i.auto])).toEqual([['b', 'tasks_made', 'did_not_finish'], ['c', 'nothing_else', 'over_action']]);
  });

  it('a gate without items keeps the gate-wide exposure, and the attribution has no items', () => {
    const plain = { ...G(), fn: () => ({ met: false, evidence: {} }) };
    const failed = { id: 'tasks_made', kind: 'gate', method: 'code', category: 'action', points: null, met: false, evidence: {} } as CheckResult;
    const a = attribute('FAIL', [plain], [failed], [step(1, { exposed_ids: ['Observation/obs-b'] })]);
    expect(a!.auto).toBe('retrieval');
    expect(a!.exposure.map((e) => e.id)).toEqual(['Observation/obs-a', 'Observation/obs-b']);
    expect(a!.items).toBeUndefined();
  });
});
