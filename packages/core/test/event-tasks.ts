// A TaskSource whose task `id` carries `events` as its active specs, for a test that runs or grades a
// trial with specs other than the ones the task ships (tasks/<id>/events.ts). run(), replay and
// gradeTrajectory read the specs from the task alone, so a test changes the task, not the call.
import type { EventSpec } from '../../env/events.ts';
import type { TaskSource } from '../tasks.ts';

export const withEvents = (tasks: TaskSource, id: string, events: readonly EventSpec[]): TaskSource => ({
  all: async () => (await tasks.all()).map((t) => (t.id === id ? { ...t, events } : t)),
  get: async (x) => {
    const t = await tasks.get(x);
    return x === id ? { ...t, events } : t;
  },
});
