// The W5 lever invariant (the #215 gate, F1; plan-amendment-w5 Correction 3(b)): a LEVER toggle
// moves no world id outside its own item's added-Patient block. One harness, run over every task
// whose expected.ts exports LEVER_ITEMS: with the task's lever.ts mocked to each state (the
// committed LEVER, then each declared item toggled), the world fixtures:build assembles
// (scripts/fixtures-build.ts assembleWorld, every overlay, the overlays' edits returned with it)
// is built per state, and from those builds:
//   (a) the overlay's edits carry OverlayEdits.lever; it lists every key the toggles add (a put key
//       present in one state and absent in another); every key it lists is put in some state (a
//       typo is caught); and no toggle changes the overlay's removals (a LEVER-driven remove is of
//       a cohort resource and would renumber the cohort; applyOverlays refuses one that is
//       declared, N3);
//   (b) the world differs between the states only in the toggled item's own block: every registry
//       key present in both states keeps its world id, every other task's registry and the
//       cohort's map (synthea) are identical.
// On main today no task exports LEVER_ITEMS, so the loop over this checkout's tasks is vacuous: it
// binds once the W5-E branches land. The same harness (the task scan, the lever.ts mock,
// assembleWorld with the tasks root pointed at a temporary task directory) runs here on a synthetic
// lever task in four variants: `good` passes; `omit` (no lever list) fails (a); `late` (an undeclared
// cohort resource that sorts last in its type, so no other id moves) passes (b) and fails (a), which
// is why (a) carries the rule; `typo` (a listed key never put) fails (a).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { TASKS, type OverlayEdits, type TaskId, type World } from '../../packages/env/overlay.ts';
import { assembleWorld, repo } from '../fixtures-build.ts';

// (a)'s rules over one task's edits per state (the committed state first): the keys the toggles add
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
    if (!existsSync(join(dir, 'lever.ts'))) throw new Error(`${id} declares LEVER_ITEMS: its LEVER must live in lever.ts (the file this test mocks per state)`);
    out.push({ id, dir, items: mod.LEVER_ITEMS.map((i) => i.id), lever: [...(mod.LEVER ?? [])] });
  }
  return out;
}
const toggled = (lever: readonly string[], item: string) => (lever.includes(item) ? lever.filter((l) => l !== item) : [...lever, item]);
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

// Every finding of the harness on one lever task: (a) and (b) per toggled item.
interface Findings { noLever: boolean; gaps: Record<string, { undeclared: string[]; unput: string[]; removes: string[] }>; moved: Record<string, string[]> }
export async function checkTask(root: string, t: LeverTask, task?: TaskId): Promise<Findings> {
  const on = await buildIn(root, t.dir, t.lever);
  const id = task ?? taskOf(t.id);
  const edits = [on.edits[id]!];
  const findings: Findings = { noLever: on.edits[id]?.lever === undefined, gaps: {}, moved: {} };
  for (const item of t.items) {
    const off = await buildIn(root, t.dir, toggled(t.lever, item));
    edits.push(off.edits[id]!);
    findings.moved[item] = movedIds(on.world, off.world);
  }
  const g = leverGaps(edits);
  if (g.undeclared.length || g.unput.length || g.removes.length) for (const item of t.items) findings.gaps[item] = g;
  return findings;
}
const clean = (items: readonly string[]): Findings => ({ noLever: false, gaps: {}, moved: Object.fromEntries(items.map((i) => [i, []])) });

// ---- the synthetic lever task, written to a temporary tasks root inside the repo ----
// Its overlay is T1's shape: a result on the cohort's pt-0045 (a T1 slot) in every state, as a real
// task writes on its slots, and item B adds a host (slot 0 of T1's range) with a result. `omit`
// leaves the lever list out; `late` adds, while B is on, an EpisodeOfCare on pt-0045 that sorts
// last in its type (the cohort's two are on pt-0011 and pt-0020), undeclared; `typo` lists a key
// the overlay never puts.
type Variant = 'good' | 'omit' | 'late' | 'typo';
const ENV = join(repo, 'packages', 'env');
function plant(root: string, variant: Variant): string {
  const dir = join(root, 'tasks', 'lever-fixture');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'lever.ts'), "export const LEVER = ['B'];\n");
  writeFileSync(join(dir, 'expected.ts'), "export { LEVER } from './lever.ts';\nexport const LEVER_ITEMS = [{ id: 'B', kind: 'B', item: 'host' }];\n");
  const lever = variant === 'omit' ? '' : variant === 'typo' ? "lever: ['pt-t1-host', 'obs-t1-hots']," : "lever: ['pt-t1-host', 'obs-t1-host-cr'],";
  const late = variant === 'late' ? "put.push({ resourceType: 'EpisodeOfCare', id: 'eoc-t1-late', status: 'active', patient: { reference: 'Patient/pt-0045' }, period: { start: '2026-10-01T09:00:00-04:00' } } as Resource);" : '';
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
    expect(await checkTask(root, tasks[0]!, 'T1')).toEqual(clean(['B']));
  });

  it('fails (a) when the lever list is left out', { timeout: 300_000 }, async () => {
    const { root } = fixture('omit');
    const f = await checkTask(root, (await leverTasks(root))[0]!, 'T1');
    expect(f.noLever).toBe(true);
    expect(f.gaps.B).toEqual({ undeclared: ['obs-t1-host-cr', 'pt-t1-host'], unput: [], removes: [] });
    expect(f.moved.B).toEqual([]);
  });

  it('fails (a) and passes (b) on an undeclared cohort resource that sorts last in its type: (a) carries the rule', { timeout: 300_000 }, async () => {
    const { root } = fixture('late');
    const f = await checkTask(root, (await leverTasks(root))[0]!, 'T1');
    expect(f.noLever).toBe(false);
    expect(f.gaps.B).toEqual({ undeclared: ['eoc-t1-late'], unput: [], removes: [] });
    expect(f.moved.B).toEqual([]);
  });

  it('fails (a) on a listed key the overlay never puts', { timeout: 300_000 }, async () => {
    const { root } = fixture('typo');
    const f = await checkTask(root, (await leverTasks(root))[0]!, 'T1');
    expect(f.gaps.B).toEqual({ undeclared: ['obs-t1-host-cr'], unput: ['obs-t1-hots'], removes: [] });
  });
});

describe("the lever invariant over this checkout's lever tasks (vacuous until a task exports LEVER_ITEMS)", () => {
  it('(a) every lever task lists every key its toggles add and no key it never puts, no toggle changes its removals; (b) no toggle moves a world id outside its own block', { timeout: 1_800_000 }, async () => {
    const tasks = await leverTasks(repo);
    for (const t of tasks) {
      const f = await checkTask(repo, t);
      expect(f.noLever, `${t.id}: the overlay's edits must carry lever (the keys its toggles add)`).toBe(false);
      expect(f, t.id).toEqual(clean(t.items));
    }
  });
});
