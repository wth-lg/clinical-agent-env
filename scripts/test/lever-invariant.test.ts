// The W5 lever invariant (the #215 gate, F1; plan-amendment-w5 Correction 3(b)): a LEVER toggle
// moves no world id outside its own item's added-Patient block. One harness, run over every task
// whose expected.ts exports LEVER_ITEMS: with the task's lever.ts mocked to each state (every
// subset of the declared items, the committed LEVER first, so a record that depends on a
// combination of items is built too; at most three items, eight builds), the world fixtures:build
// assembles (scripts/fixtures-build.ts assembleWorld, every overlay, the overlays' edits returned
// with it) is built per state, and from those builds:
//   (a) the overlay's edits carry OverlayEdits.lever; it lists every key the states add (a put key
//       present in one state and absent in another); every key it lists is put in some state (a
//       typo is caught); and no state changes the overlay's removals (a LEVER-driven remove is of
//       a cohort resource and would renumber the cohort; applyOverlays refuses one that is
//       declared, N3). Reported once per task: the keys, not the items, are what a gap names.
//   (b) the world differs between any two states only in the toggled items' own blocks: every
//       registry key present in both states keeps its world id, every other task's registry and
//       the cohort's map (synthea) are identical. Reported per pair of states.
// A task exporting an empty LEVER_ITEMS is refused (the loop would pass it vacuously). On main today
// no task exports LEVER_ITEMS, so the loop over this checkout's tasks is vacuous: it binds once the
// W5-E branches land. The same harness (the task scan, the lever.ts mock, assembleWorld with the
// tasks root pointed at a temporary task directory) runs here on a synthetic lever task: `good`
// passes; `omit` (no lever list) fails (a); `late` (an undeclared cohort resource that sorts last
// in its type, so no other id moves) passes (b) and fails (a), which is why (a) carries the rule;
// `typo` (a listed key never put) fails (a); `combo` (a cohort record put only with A off and B on,
// a state one toggle from the committed ['A'] never reaches) fails (a) and (b); `empty` is refused.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { TASKS, type OverlayEdits, type TaskId, type World } from '../../packages/env/overlay.ts';
import { assembleWorld, repo } from '../fixtures-build.ts';

// (a)'s rules over one task's edits per state (the committed state first): the keys the states add
// that `lever` does not list, the listed keys no state puts, and the removals that differ.
export function leverGaps(states: ReadonlyArray<OverlayEdits>): { undeclared: string[]; unput: string[]; removes: string[] } {
  const keys = (e: OverlayEdits) => new Set((e.put ?? []).map((r) => r.id!));
  const removes = (e: OverlayEdits) => new Set((e.remove ?? []).map((r) => `${r.resourceType}/${r.id}`));
  const all = states.map(keys);
  const union = new Set(all.flatMap((s) => [...s]));
  const toggled = [...union].filter((k) => all.some((s) => !s.has(k))).sort();
  const declared = new Set(states[0]?.lever ?? []);
  const rs = states.map(removes);
  const ru = new Set(rs.flatMap((s) => [...s]));
  return { undeclared: toggled.filter((k) => !declared.has(k)), unput: [...declared].filter((k) => !union.has(k)).sort(), removes: [...ru].filter((k) => rs.some((s) => !s.has(k))).sort() };
}

// (b)'s rule: the ids a toggle moved: every registry key present in both worlds whose world id
// differs, and every cohort (synthea) entry that differs or is missing on one side.
export function movedIds(on: World, off: World): string[] {
  const out: string[] = [];
  for (const task of new Set([...Object.keys(on.ids), ...Object.keys(off.ids)]) as Set<TaskId>) {
    const [a, b] = [on.ids[task] ?? {}, off.ids[task] ?? {}];
    for (const k of Object.keys(a)) if (k in b && a[k] !== b[k]) out.push(`${task} ${k}: ${a[k]} -> ${b[k]}`);
  }
  for (const k of new Set([...Object.keys(on.synthea), ...Object.keys(off.synthea)])) if (on.synthea[k] !== off.synthea[k]) out.push(`cohort ${k}: ${on.synthea[k] ?? 'absent'} -> ${off.synthea[k] ?? 'absent'}`);
  return out.sort();
}

// The lever tasks under a tasks root: each <root>/tasks/<id> whose expected.ts exports LEVER_ITEMS,
// with its committed LEVER (lever.ts, which the task loader reads and this harness mocks per state).
interface LeverTask { id: string; dir: string; items: string[]; lever: string[] }
export async function leverTasks(root: string): Promise<LeverTask[]> {
  const out: LeverTask[] = [];
  const tasks = join(root, 'tasks');
  for (const id of readdirSync(tasks, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
    const dir = join(tasks, id);
    if (!existsSync(join(dir, 'expected.ts'))) continue;
    const mod = (await import(pathToFileURL(join(dir, 'expected.ts')).href)) as { LEVER_ITEMS?: ReadonlyArray<{ id: string }>; LEVER?: readonly string[] };
    if (mod.LEVER_ITEMS === undefined) continue;
    if (mod.LEVER_ITEMS.length === 0) throw new Error(`${id}: LEVER_ITEMS is empty; a task with no lever item does not export it (the invariant would hold vacuously)`);
    if (!existsSync(join(dir, 'lever.ts'))) throw new Error(`${id} declares LEVER_ITEMS: its LEVER must live in lever.ts (the file this test mocks per state)`);
    out.push({ id, dir, items: mod.LEVER_ITEMS.map((i) => i.id), lever: [...(mod.LEVER ?? [])] });
  }
  return out;
}
// Every state of a task's items (each subset, in the items' order), the committed LEVER first.
export function leverStates(items: readonly string[], lever: readonly string[]): string[][] {
  const committed = items.filter((i) => lever.includes(i));
  const all: string[][] = [];
  for (let bits = 0; bits < 1 << items.length; bits++) all.push(items.filter((_, i) => bits & (1 << i)));
  const label = (st: readonly string[]) => st.join(',');
  return [committed, ...all.filter((st) => label(st) !== label(committed))];
}
const stateLabel = (st: readonly string[]) => `[${st.join(',')}]`;
// The world and the overlays' edits assembled with the task's lever.ts mocked to `state`.
async function buildIn(root: string, dir: string, state: readonly string[]): Promise<{ world: World; edits: Partial<Record<TaskId, OverlayEdits>> }> {
  vi.resetModules();
  vi.doMock(join(dir, 'lever.ts'), () => ({ LEVER: state }));
  try {
    const { world, edits } = await assembleWorld({ tasksRoot: root });
    return { world, edits };
  } finally {
    vi.doUnmock(join(dir, 'lever.ts'));
  }
}
// The TaskId of a task directory: the TASKS entry of its slug (a synthetic task names its own).
const taskOf = (slug: string): TaskId => {
  const t = (Object.keys(TASKS) as TaskId[]).find((id) => TASKS[id].slug === slug);
  if (t === undefined) throw new Error(`tasks/${slug} is no TASKS entry (packages/env/overlay.ts)`);
  return t;
};

// Every finding of the harness on one lever task: (a) once for the task, (b) per pair of states
// (`[A] vs [A,B]`), every state built once.
interface Findings { noLever: boolean; gaps: { undeclared: string[]; unput: string[]; removes: string[] }; moved: Record<string, string[]> }
export async function checkTask(root: string, t: LeverTask, task?: TaskId): Promise<Findings> {
  const id = task ?? taskOf(t.id);
  const states = leverStates(t.items, t.lever);
  const builds: Array<{ label: string; world: World; edits: OverlayEdits }> = [];
  for (const st of states) {
    const b = await buildIn(root, t.dir, st);
    builds.push({ label: stateLabel(st), world: b.world, edits: b.edits[id]! });
  }
  const findings: Findings = { noLever: builds[0]!.edits.lever === undefined, gaps: leverGaps(builds.map((b) => b.edits)), moved: {} };
  for (let i = 0; i < builds.length; i++) for (let j = i + 1; j < builds.length; j++) findings.moved[`${builds[i]!.label} vs ${builds[j]!.label}`] = movedIds(builds[i]!.world, builds[j]!.world);
  return findings;
}
const pairs = (items: readonly string[], lever: readonly string[]): string[] => {
  const labels = leverStates(items, lever).map(stateLabel);
  return labels.flatMap((a, i) => labels.slice(i + 1).map((b) => `${a} vs ${b}`));
};
const clean = (items: readonly string[], lever: readonly string[]): Findings => ({ noLever: false, gaps: { undeclared: [], unput: [], removes: [] }, moved: Object.fromEntries(pairs(items, lever).map((p) => [p, []])) });

// ---- the synthetic lever task, written to a temporary tasks root inside the repo ----
// Its overlay is T1's shape: a result on the cohort's pt-0045 (a T1 slot) in every state, as a real
// task writes on its slots, and item B adds a host (slot 0 of T1's range) with a result. `omit`
// leaves the lever list out; `late` adds, while B is on, an EpisodeOfCare on pt-0045 that sorts
// last in its type (the cohort's two are on pt-0011 and pt-0020), undeclared; `typo` lists a key
// the overlay never puts; `combo` declares two items, A (adding nothing) and B, committed ['A'],
// and puts an undeclared result on pt-0045 only with A off and B on; `empty` exports no item.
type Variant = 'good' | 'omit' | 'late' | 'typo' | 'combo' | 'empty';
const ENV = join(repo, 'packages', 'env');
function plant(root: string, variant: Variant): string {
  const dir = join(root, 'tasks', 'lever-fixture');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'lever.ts'), variant === 'combo' ? "export const LEVER = ['A'];\n" : "export const LEVER = ['B'];\n");
  const items = variant === 'empty' ? '' : variant === 'combo' ? "{ id: 'A', kind: 'A', item: 'dose' }, { id: 'B', kind: 'B', item: 'host' }" : "{ id: 'B', kind: 'B', item: 'host' }";
  writeFileSync(join(dir, 'expected.ts'), `export { LEVER } from './lever.ts';\nexport const LEVER_ITEMS = [${items}];\n`);
  const lever = variant === 'omit' ? '' : variant === 'typo' ? "lever: ['pt-t1-host', 'obs-t1-hots']," : "lever: ['pt-t1-host', 'obs-t1-host-cr'],";
  const late = variant === 'late' ? "put.push({ resourceType: 'EpisodeOfCare', id: 'eoc-t1-late', status: 'active', patient: { reference: 'Patient/pt-0045' }, period: { start: '2026-10-01T09:00:00-04:00' } } as Resource);" : '';
  const combo = variant === 'combo' ? "if (!(LEVER as readonly string[]).includes('A') && (LEVER as readonly string[]).includes('B')) put.push(cr('obs-t1-combo', 'pt-0045'));" : '';
  writeFileSync(
    join(dir, 'overlay.ts'),
    `import type { Overlay } from '${ENV}/overlay.ts';
import type { Resource } from '${ENV}/store.ts';
import { LEVER } from './lever.ts';
const host: Resource = { resourceType: 'Patient', id: 'pt-t1-host', birthDate: '1961-04-02', gender: 'female', name: [{ use: 'official', family: 'Host', given: ['Ada'] }] } as Resource;
const cr = (id: string, subject: string): Resource => ({ resourceType: 'Observation', id, status: 'final', category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }], code: { coding: [{ system: 'http://loinc.org', code: '2160-0', display: 'Creatinine' }] }, subject: { reference: 'Patient/' + subject }, effectiveDateTime: '2026-10-01T09:00:00-04:00', valueQuantity: { value: 1.1, unit: 'mg/dL', system: 'http://unitsofmeasure.org', code: 'mg/dL' } }) as Resource;
const overlay: Overlay = {
  task: 'T1',
  added: { 'pt-t1-host': 0 },
  build() {
    const put: Resource[] = [cr('obs-t1-slot-cr', 'pt-0045')];
    if ((LEVER as readonly string[]).includes('B')) { put.push(host, cr('obs-t1-host-cr', 'pt-t1-host')); ${late} }
    ${combo}
    return { ${lever} put };
  },
};
export default overlay;
`,
  );
  return dir;
}
const roots: string[] = [];
const fixture = (variant: Variant) => {
  const root = mkdtempSync(join(repo, 'scripts', 'test', '.lever-fixture-'));
  roots.push(root);
  return { root, dir: plant(root, variant) };
};
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe('the lever invariant harness on a synthetic lever task (the real loops, a temporary tasks root)', () => {
  it('finds the fixture as a lever task and passes the well-formed variant', { timeout: 300_000 }, async () => {
    const { root } = fixture('good');
    const tasks = await leverTasks(root);
    expect(tasks.map((t) => [t.id, t.items, t.lever])).toEqual([['lever-fixture', ['B'], ['B']]]);
    expect(await checkTask(root, tasks[0]!, 'T1')).toEqual({ noLever: false, gaps: { undeclared: [], unput: [], removes: [] }, moved: { '[B] vs []': [] } });
  });

  it('fails (a) when the lever list is left out', { timeout: 300_000 }, async () => {
    const { root } = fixture('omit');
    const f = await checkTask(root, (await leverTasks(root))[0]!, 'T1');
    expect(f.noLever).toBe(true);
    expect(f.gaps).toEqual({ undeclared: ['obs-t1-host-cr', 'pt-t1-host'], unput: [], removes: [] });
    expect(f.moved).toEqual({ '[B] vs []': [] });
  });

  it('fails (a) and passes (b) on an undeclared cohort resource that sorts last in its type: (a) carries the rule', { timeout: 300_000 }, async () => {
    const { root } = fixture('late');
    const f = await checkTask(root, (await leverTasks(root))[0]!, 'T1');
    expect(f.noLever).toBe(false);
    expect(f.gaps).toEqual({ undeclared: ['eoc-t1-late'], unput: [], removes: [] });
    expect(f.moved).toEqual({ '[B] vs []': [] });
  });

  it('fails (a) on a listed key the overlay never puts', { timeout: 300_000 }, async () => {
    const { root } = fixture('typo');
    const f = await checkTask(root, (await leverTasks(root))[0]!, 'T1');
    expect(f.gaps).toEqual({ undeclared: ['obs-t1-host-cr'], unput: ['obs-t1-hots'], removes: [] });
  });

  it('fails (a) and (b) on an undeclared cohort record put only in a combination of items the committed LEVER does not reach by one toggle', { timeout: 300_000 }, async () => {
    const { root } = fixture('combo');
    const t = (await leverTasks(root))[0]!;
    expect(leverStates(t.items, t.lever)).toEqual([['A'], [], ['B'], ['A', 'B']]);
    const f = await checkTask(root, t, 'T1');
    expect(f.gaps).toEqual({ undeclared: ['obs-t1-combo'], unput: [], removes: [] });
    const moved = Object.fromEntries(Object.entries(f.moved).map(([k, v]) => [k, v.length > 0]));
    // Only the pairs with [B] on one side differ: the combination record moves pt-0045's later
    // results and every later chart's, and [A] vs [A,B] and [A] vs [] are the single toggles that
    // passed the committed-state harness.
    expect(moved).toEqual({ '[A] vs []': false, '[A] vs [B]': true, '[A] vs [A,B]': false, '[] vs [B]': true, '[] vs [A,B]': false, '[B] vs [A,B]': true });
  });

  it('refuses a task whose LEVER_ITEMS is empty', { timeout: 300_000 }, async () => {
    const { root } = fixture('empty');
    await expect(leverTasks(root)).rejects.toThrow(/LEVER_ITEMS is empty/);
  });
});

describe("the lever invariant over this checkout's lever tasks (vacuous until a task exports LEVER_ITEMS)", () => {
  it('(a) every lever task lists every key its states add and no key it never puts, no state changes its removals; (b) no two states differ in a world id outside the toggled items\' blocks', { timeout: 3_600_000 }, async () => {
    const tasks = await leverTasks(repo);
    for (const t of tasks) {
      expect(t.items.length, `${t.id}: ${t.items.length} lever items; the harness builds every subset`).toBeLessThanOrEqual(3);
      const f = await checkTask(repo, t);
      expect(f.noLever, `${t.id}: the overlay's edits must carry lever (the keys its toggles add)`).toBe(false);
      expect(f, t.id).toEqual(clean(t.items, t.lever));
    }
  });
});
