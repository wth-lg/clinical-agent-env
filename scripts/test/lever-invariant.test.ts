// The W5 lever invariant (the #215 gate, F1; plan-amendment-w5 Correction 3(b)): a LEVER toggle
// moves no world id outside its own item's added-Patient block. Two standing checks over every task
// whose expected.ts exports LEVER_ITEMS, each run with the task's lever.ts mocked to each state
// (the committed LEVER, then each declared item toggled):
//   (a) the overlay's edits carry OverlayEdits.lever, and it lists every key the toggles add
//       (a put key present in one state and not another), and no toggle changes the overlay's
//       removals (a LEVER-driven remove is of a cohort resource and would renumber the cohort;
//       applyOverlays refuses one that is declared, N3);
//   (b) the world fixtures:build assembles (scripts/fixtures-build.ts assembleWorld, every overlay)
//       differs between the states only in the toggled item's own block: every registry key present
//       in both states keeps its world id, every other task's registry and the cohort's map
//       (synthea) are identical.
// On main today no task exports LEVER_ITEMS, so both loops are vacuous: they bind once the W5-E
// branches land. The synthetic fixtures below prove the checks bite today: an undeclared toggled
// resource on a cohort Patient is reported by (a)'s rule and moves cohort ids under (b)'s.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { applyOverlays, type Overlay, type OverlayEdits, type TaskId, type World } from '../../packages/env/overlay.ts';
import type { Resource } from '../../packages/env/store.ts';
import { assembleWorld, repo } from '../fixtures-build.ts';

// (a)'s rule: the keys the toggles add that `lever` (of the all-on edits) does not list, and the
// removals that differ between states.
export function leverGaps(on: OverlayEdits, off: OverlayEdits): { undeclared: string[]; removes: string[] } {
  const keys = (e: OverlayEdits) => new Set((e.put ?? []).map((r) => r.id!));
  const removes = (e: OverlayEdits) => new Set((e.remove ?? []).map((r) => `${r.resourceType}/${r.id}`));
  const [a, b] = [keys(on), keys(off)];
  const toggled = [...new Set([...a, ...b])].filter((k) => a.has(k) !== b.has(k)).sort();
  const declared = new Set(on.lever ?? []);
  const [ra, rb] = [removes(on), removes(off)];
  return { undeclared: toggled.filter((k) => !declared.has(k)), removes: [...new Set([...ra, ...rb])].filter((k) => ra.has(k) !== rb.has(k)).sort() };
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

// The lever tasks of this checkout: each tasks/<id> whose expected.ts exports LEVER_ITEMS, with its
// committed LEVER (lever.ts, which the task loader reads and this test mocks per state).
async function leverTasks(): Promise<Array<{ id: string; dir: string; items: string[]; lever: string[] }>> {
  const out = [];
  for (const id of readdirSync(join(repo, 'tasks'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
    const dir = join(repo, 'tasks', id);
    if (!existsSync(join(dir, 'expected.ts'))) continue;
    const mod = (await import(pathToFileURL(join(dir, 'expected.ts')).href)) as { LEVER_ITEMS?: ReadonlyArray<{ id: string }>; LEVER?: readonly string[] };
    if (mod.LEVER_ITEMS === undefined) continue;
    expect(existsSync(join(dir, 'lever.ts')), `${id} declares LEVER_ITEMS: its LEVER must live in lever.ts (the file this test mocks per state)`).toBe(true);
    out.push({ id, dir, items: mod.LEVER_ITEMS.map((i) => i.id), lever: [...(mod.LEVER ?? [])] });
  }
  return out;
}
const toggled = (lever: readonly string[], item: string) => (lever.includes(item) ? lever.filter((l) => l !== item) : [...lever, item]);
// The overlay module of a task imported fresh under a LEVER state.
async function overlayIn(dir: string, state: readonly string[]): Promise<Overlay> {
  vi.resetModules();
  vi.doMock(join(dir, 'lever.ts'), () => ({ LEVER: state }));
  try {
    return ((await import(pathToFileURL(join(dir, 'overlay.ts')).href)) as { default: Overlay }).default;
  } finally {
    vi.doUnmock(join(dir, 'lever.ts'));
  }
}
async function worldIn(dir: string, state: readonly string[]): Promise<World> {
  vi.resetModules();
  vi.doMock(join(dir, 'lever.ts'), () => ({ LEVER: state }));
  try {
    return (await assembleWorld()).world;
  } finally {
    vi.doUnmock(join(dir, 'lever.ts'));
  }
}

// ---- the synthetic fixtures ----
const id4 = (n: number) => `pt-${String(n).padStart(4, '0')}`;
const COHORT: Resource[] = Array.from({ length: 60 }, (_, i) => ({ resourceType: 'Patient', id: id4(i + 1), birthDate: '1970-01-01', name: [{ family: `F${i + 1}` }] }) as Resource);
const generated = (n: number, subject: string, at: string): Resource =>
  ({ resourceType: 'Observation', id: `obs-${String(n).padStart(5, '0')}`, status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '2160-0' }] }, subject: { reference: `Patient/${subject}` }, effectiveDateTime: at }) as Resource;
const BASE: Resource[] = [...COHORT, generated(1, 'pt-0001', '2026-01-01T09:00:00-05:00'), generated(2, 'pt-0002', '2026-02-01T09:00:00-05:00'), generated(3, 'pt-0060', '2026-03-01T09:00:00-05:00')];
const patient = (key: string, family: string): Resource => ({ resourceType: 'Patient', id: key, birthDate: '1961-04-02', gender: 'female', name: [{ use: 'official', family, given: ['Ada'] }] }) as Resource;
const obs = (key: string, subject: string, at = '2026-10-01T09:00:00-04:00'): Resource =>
  ({ resourceType: 'Observation', id: key, status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '2160-0' }] }, subject: { reference: `Patient/${subject}` }, effectiveDateTime: at }) as Resource;
// A synthetic lever task: item B adds a host and her result; `badly` also plants a result on the
// cohort's pt-0001 while B is on, undeclared.
const synthetic = (b: boolean, badly: boolean): Overlay => ({
  task: 'T1',
  added: { 'pt-t1-host': 0 },
  build: () => ({
    put: [obs('obs-t1-always', 'pt-0002'), ...(b ? [patient('pt-t1-host', 'Host'), obs('obs-t1-host-cr', 'pt-t1-host'), ...(badly ? [obs('obs-t1-slip', 'pt-0001')] : [])] : [])],
    lever: ['pt-t1-host', 'obs-t1-host-cr'],
  }),
});
const other: Overlay = { task: 'T6', added: { 'pt-t6-k': 0 }, build: () => ({ put: [patient('pt-t6-k', 'K'), obs('obs-t6-k-cr', 'pt-t6-k')] }) };
const build = (overlays: Overlay[]) => applyOverlays(BASE, [], {}, overlays);

describe('the lever invariant, proven on synthetic fixtures today', () => {
  it('(a) reports a toggled key the overlay does not declare, and a removal a toggle changes; a well-formed overlay has no gap', () => {
    expect(leverGaps(synthetic(true, true).build(null as never), synthetic(false, true).build(null as never))).toEqual({ undeclared: ['obs-t1-slip'], removes: [] });
    expect(leverGaps(synthetic(true, false).build(null as never), synthetic(false, false).build(null as never))).toEqual({ undeclared: [], removes: [] });
    const removing = (on: boolean): OverlayEdits => ({ put: [], remove: on ? [{ resourceType: 'Observation', id: 'obs-00001' }] : [] });
    expect(leverGaps(removing(true), removing(false))).toEqual({ undeclared: [], removes: ['Observation/obs-00001'] });
  });

  it('(b) sees the cohort ids an undeclared toggled resource moves, and none when every toggled resource is on the added Patient', () => {
    // The slip sits on pt-0001 after its generated result, so every later id of the cohort's
    // sequence shifts, the task's own always-present key among them.
    expect(movedIds(build([synthetic(true, true), other]), build([synthetic(false, true), other]))).toEqual(['T1 obs-t1-always: obs-00004 -> obs-00003', 'cohort obs-00002: obs-00003 -> obs-00002', 'cohort obs-00003: obs-00005 -> obs-00004']);
    expect(movedIds(build([synthetic(true, false), other]), build([synthetic(false, false), other]))).toEqual([]);
  });
});

describe('the lever invariant over this checkout\'s lever tasks (vacuous until a task exports LEVER_ITEMS)', () => {
  it('(a) every lever task\'s overlay declares lever, listing every key its toggles add, and no toggle changes its removals', { timeout: 600_000 }, async () => {
    for (const t of await leverTasks()) {
      const on = (await overlayIn(t.dir, t.lever)).build(null as never);
      expect(on.lever, `${t.id}: the overlay's edits must carry lever (the keys its toggles add)`).toBeDefined();
      for (const item of t.items) {
        const off = (await overlayIn(t.dir, toggled(t.lever, item))).build(null as never);
        expect(leverGaps(on, off), `${t.id} toggling ${item}`).toEqual({ undeclared: [], removes: [] });
      }
    }
  });

  it('(b) toggling any item of any lever task moves no world id outside the item\'s own block', { timeout: 1_800_000 }, async () => {
    const tasks = await leverTasks();
    if (tasks.length === 0) return;
    for (const t of tasks) {
      const on = await worldIn(t.dir, t.lever);
      for (const item of t.items) {
        const off = await worldIn(t.dir, toggled(t.lever, item));
        expect(movedIds(on, off), `${t.id} toggling ${item}`).toEqual([]);
      }
    }
  });
});
