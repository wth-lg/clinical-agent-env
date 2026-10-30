// The W1-0 slot map (plan-amendment-worklist.md W1): each task holds a disjoint set of the world's
// patients for its item-class probe, sized to the probe (T1 9, T2 8, T3 17, T4 4, T5 7, T6 6 = 51 of
// 60), and keeps every patient its current overlay writes on, so no current answer moves.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { TASKS, type TaskId } from '../overlay.ts';

const root = new URL('../../../', import.meta.url);
const patients = (path: string) =>
  new Set(
    gunzipSync(readFileSync(new URL(path, root)))
      .toString('utf8')
      .split('\n')
      .filter((l) => l.includes('"resourceType":"Patient"'))
      .map((l) => (JSON.parse(l) as { resourceType: string; id: string }))
      .filter((r) => r.resourceType === 'Patient')
      .map((r) => r.id),
  );

const SIZES: Record<TaskId, number> = { T1: 9, T2: 8, T3: 17, T4: 4, T5: 7, T6: 6 };
// The slots before W1-0 (origin/main 712f1d13): the patients the current overlays write on.
const CURRENT: Record<TaskId, readonly string[]> = {
  T1: ['pt-0002', 'pt-0003'],
  T2: ['pt-0006', 'pt-0007', 'pt-0008', 'pt-0010', 'pt-0013', 'pt-0016', 'pt-0033', 'pt-0053'],
  T3: ['pt-0009', 'pt-0011', 'pt-0014', 'pt-0017', 'pt-0018', 'pt-0019', 'pt-0020', 'pt-0021', 'pt-0022', 'pt-0023', 'pt-0024', 'pt-0025', 'pt-0034', 'pt-0035'],
  T4: ['pt-0004', 'pt-0005'],
  T5: ['pt-0012', 'pt-0015'],
  T6: ['pt-0026', 'pt-0027', 'pt-0028', 'pt-0029', 'pt-0030', 'pt-0031'],
};
const tasks = Object.keys(TASKS) as TaskId[];

describe('the probe slot map', () => {
  it('gives each task its probe size, 51 patients in all', () => {
    expect(Object.fromEntries(tasks.map((t) => [t, TASKS[t].slots.length]))).toEqual(SIZES);
    expect(tasks.reduce((n, t) => n + TASKS[t].slots.length, 0)).toBe(51);
  });

  it('keeps the slot sets disjoint, with no slot listed twice', () => {
    const all = tasks.flatMap((t) => TASKS[t].slots);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps every patient a current overlay writes on in its own task', () => {
    for (const t of tasks) expect(TASKS[t].slots, t).toEqual(expect.arrayContaining([...CURRENT[t]]));
  });

  it('puts every slot inside the base cohort and the committed world', () => {
    const base = patients('fixtures/synthea/base.ndjson.gz');
    const world = patients('fixtures/world.ndjson.gz');
    for (const t of tasks) for (const id of TASKS[t].slots) {
      expect(base.has(id), `${t} ${id} in base`).toBe(true);
      expect(world.has(id), `${t} ${id} in world`).toBe(true);
    }
  });
});
