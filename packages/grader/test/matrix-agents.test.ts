// The matrix's lever agents (plan-amendment-w5 G3, W5-H): for every active A lever item of a task
// (tasks/<id>/expected.ts LEVER_ITEMS and LEVER), tests/agents.ts declares two offline agents under
// `lever[<item id>]`: focus_only, which reads each arrival's focus and acts on it and must fail that
// item as retrieval, and read_all_newest, which searches again by the policy's route and acts on
// the newest and must pass. The declaration check runs before any case, like loses: an active A
// item without both agents, an agent for an id that is no active A item, a LEVER id no item has, an
// active A item whose event is not an active spec, or an inactive A item whose event is active,
// fails the task with nothing run. The toy stands in for a lever task: its toy-a1 arrival on `note`
// is the A item, and its event mutants and alternatives are the agents' scripts.
import { describe, expect, it } from 'vitest';
import { matrixLever } from '../matrix/matrix.ts';
import type { Agents, Lever, LeverAgents } from '../matrix/types.ts';
import { matrix, ONE, TOY } from '../matrix/test/harness.ts';

const LEVER: Lever = { active: ['A'], items: [{ id: 'A', kind: 'A', item: 'note', spec: 'toy-a1', sibling: ['Observation/obs-toy-a1'] }] };
const script = (kind: 'mutants' | 'alternatives', id: string) => (TOY[kind] as ReadonlyArray<{ id: string; script: LeverAgents['focus_only'] }>).find((x) => x.id === id)!.script;
const unread = script('mutants', 'event_cited_unread');
const notAmended = script('mutants', 'event_not_amended');
const handled = script('alternatives', 'event_handled');
const agents = (lever: Agents['lever']): Agents => ({ ...TOY.agents, ...(lever === undefined ? {} : { lever }) });
const GOOD: Agents['lever'] = { A: { focus_only: unread, read_all_newest: handled } };

describe('lever agent declarations are checked before any case runs', () => {
  it('an active A item needs both agents', async () => {
    const { code, text } = await matrix({ lever: LEVER }, { ...ONE, cases: ['null'] });
    expect(code).toBe(1);
    expect(text).toMatch(/cases: not run/);
    expect(text).toMatch(/active A lever item A has no focus_only agent \(tests\/agents\.ts lever\.A\)/);
    expect(text).toMatch(/active A lever item A has no read_all_newest agent/);
    const half = await matrix({ lever: LEVER, agents: agents({ A: { focus_only: unread } as LeverAgents }) }, { ...ONE, cases: ['null'] });
    expect(half.text).toMatch(/has no read_all_newest agent/);
    expect(half.text).not.toMatch(/has no focus_only agent/);
  });

  it('refuses agents for an id that is no active A item, a LEVER id no item has, a bad event and a duplicate id', async () => {
    const b: Lever = { active: ['B'], items: [{ id: 'B', kind: 'B', item: 'note', sibling: [] }] };
    const forB = await matrix({ lever: b, agents: agents({ B: GOOD.A! }) }, { ...ONE, cases: ['null'] });
    expect(forB.code).toBe(1);
    expect(forB.text).toMatch(/tests\/agents\.ts lever\.B: B is not an active A lever item/);
    const unknown = await matrix({ lever: { ...LEVER, active: ['A', 'Z'] }, agents: agents(GOOD) }, { ...ONE, cases: ['null'] });
    expect(unknown.text).toMatch(/LEVER names Z, which no lever item has/);
    const noEvent = await matrix({ lever: { active: ['A'], items: [{ id: 'A', kind: 'A', item: 'note', sibling: [] }] }, agents: agents(GOOD) }, { ...ONE, cases: ['null'] });
    expect(noEvent.text).toMatch(/lever item A is an A item and names no event spec/);
    const inactiveSpec = await matrix({ lever: { active: ['A'], items: [{ id: 'A', kind: 'A', item: 'note', spec: 'toy-x', sibling: [] }] }, agents: agents(GOOD) }, { ...ONE, cases: ['null'] });
    expect(inactiveSpec.text).toMatch(/active A lever item A names event toy-x, which is not an active spec/);
    const inactiveItem = await matrix({ lever: { active: [], items: [{ id: 'A', kind: 'A', item: 'note', spec: 'toy-a1', sibling: [] }] } }, { ...ONE, cases: ['null'] });
    expect(inactiveItem.text).toMatch(/inactive lever item A names event toy-a1, which is active \(an inactive item's event is absent, G1\)/);
    const dup = await matrix({ lever: { active: ['A'], items: [...LEVER.items, ...LEVER.items] }, agents: agents(GOOD) }, { ...ONE, cases: ['null'] });
    expect(dup.text).toMatch(/lever item A is declared twice/);
    // Every A item declares the deciding sibling records (R39(b)); a B item need not.
    const noSibling = await matrix({ lever: { active: ['A'], items: [{ id: 'A', kind: 'A', item: 'note', spec: 'toy-a1' }] }, agents: agents(GOOD) }, { ...ONE, cases: ['null'] });
    expect(noSibling.code).toBe(1);
    expect(noSibling.text).toMatch(/lever item A is an A item and declares no sibling \(the deciding sibling record ids, R39\(b\)\)/);
    const emptySibling = await matrix({ lever: { active: ['A'], items: [{ ...LEVER.items[0]!, sibling: [] }] }, agents: agents(GOOD) }, { ...ONE, cases: ['null'] });
    expect(emptySibling.text).toMatch(/declares no sibling/);
    const bNoSibling = await matrix({ lever: { active: ['B'], items: [{ id: 'B', kind: 'B', item: 'note' }] } }, { ...ONE, cases: ['null'] });
    expect(bNoSibling.code).toBe(0);
  });

  it('a task without lever items runs as before, with no lever line', async () => {
    const { code, text } = await matrix({}, { ...ONE, cases: ['null'] });
    expect(code).toBe(0);
    expect(text).not.toMatch(/lever/);
  });
});

describe('the lever cases', () => {
  it('focus-only fails the item as retrieval and read-all-newest passes; both are listed', async () => {
    const { code, text } = await matrix({ lever: LEVER, agents: agents(GOOD) }, { ...ONE, cases: ['focus-only:A', 'read-all-newest:A'] });
    expect(code).toBe(0);
    expect(text).toMatch(/^lever: 1 active item \(A: A\), 1 active A item with focus-only and read-all-newest agents$/m);
    expect(text).toMatch(/^ {2}focus-only A: FAIL failed \[event_seen, amended\] items \{note retrieval\} ok$/m);
    expect(text).toMatch(/^ {2}read-all-newest A: PASS score 1\.000 judge\.unknown 0, lost \[\] declared \[\]$/m);
  });

  it('focus-only that passes, or fails the item under another label, fails the task', async () => {
    const passes = await matrix({ lever: LEVER, agents: agents({ A: { focus_only: handled, read_all_newest: handled } }) }, { ...ONE, cases: ['focus-only:A'] });
    expect(passes.code).toBe(1);
    expect(passes.text).toMatch(/focus-only A: outcome PASS, want a model FAIL/);
    const reasoning = await matrix({ lever: LEVER, agents: agents({ A: { focus_only: notAmended, read_all_newest: handled } }) }, { ...ONE, cases: ['focus-only:A'] });
    expect(reasoning.code).toBe(1);
    expect(reasoning.text).toMatch(/focus-only A: item note fails as reasoning, want retrieval/);
  });

  it('read-all-newest that fails, or loses an undeclared rubric item, fails the task', async () => {
    const fails = await matrix({ lever: LEVER, agents: agents({ A: { focus_only: unread, read_all_newest: unread } }) }, { ...ONE, cases: ['read-all-newest:A'] });
    expect(fails.code).toBe(1);
    expect(fails.text).toMatch(/read-all-newest A: outcome FAIL, want PASS \(failed: event_seen, amended\)/);
    const loses = await matrix({ lever: LEVER, agents: agents({ A: { focus_only: unread, read_all_newest: handled, loses: ['nope'] } }) }, { ...ONE, cases: ['read-all-newest:A'] });
    expect(loses.code).toBe(1);
    expect(loses.text).toMatch(/lever\.A read_all_newest declares loses nope, which is not a rubric item of the task/);
  });

  it('the cases are selectable by id, and an unknown id names them', async () => {
    const { text } = await matrix({ lever: LEVER, agents: agents(GOOD) }, { ...ONE, cases: ['oracle'] });
    expect(text).toMatch(/^ {2}focus-only A: not run$/m);
    expect(text).toMatch(/^ {2}read-all-newest A: not run$/m);
    await expect(matrix({ lever: LEVER, agents: agents(GOOD) }, { ...ONE, cases: ['focus-only:Z'] })).resolves.toMatchObject({ code: 1 });
  });
});

describe('matrixLever reads expected.ts LEVER_ITEMS and LEVER as the loaders hand them over', () => {
  const mod = { LEVER_ITEMS: LEVER.items, LEVER: ['A'] };
  it('returns the lever, or undefined for a task without LEVER_ITEMS', () => {
    expect(matrixLever(mod, ['A'], 'tasks/t')).toEqual(LEVER);
    expect(matrixLever({}, null, 'tasks/t')).toBeUndefined();
    expect(matrixLever({ expected: {} }, null, 'tasks/t')).toBeUndefined();
  });

  it('refuses a LEVER export that differs from the list the task loader read, and a malformed item', () => {
    expect(() => matrixLever(mod, ['A', 'B'], 'tasks/t')).toThrow(/tasks\/t\/expected\.ts: LEVER as exported \[A\] differs from the list the task loader read \[A, B\]/);
    expect(() => matrixLever({ LEVER_ITEMS: LEVER.items }, null, 'tasks/t')).toThrow(/LEVER_ITEMS without LEVER/);
    expect(() => matrixLever({ LEVER_ITEMS: [{ id: 'A', kind: 'C', item: 'note' }], LEVER: ['A'] }, ['A'], 'tasks/t')).toThrow(/LEVER_ITEMS\[0\]: kind must be A or B/);
    expect(() => matrixLever({ LEVER_ITEMS: [{ id: 'A', kind: 'A', item: 'note', spec: 'e', sibling: 'x' }], LEVER: ['A'] }, ['A'], 'tasks/t')).toThrow(/LEVER_ITEMS\[0\]: sibling must be a list of ids/);
    expect(() => matrixLever({ LEVER_ITEMS: 'x', LEVER: [] }, [], 'tasks/t')).toThrow(/LEVER_ITEMS must be a list/);
  });
});
