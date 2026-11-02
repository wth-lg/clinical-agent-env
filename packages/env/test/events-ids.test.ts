// Every resource a task's mid-trial events deliver (tasks/<id>/events.ts SPECS, active or not)
// carries an id in the world's own form, `<prefix>-<digits>` (obs-00708, doc-00901), as a record
// filed today is numbered. An id with any other segment (a task tag like 't3', a phase or event
// tag like 'e3', a class letter, a spec name) would set the arrival apart by its id alone, beyond
// the stamp and inbox id docs/tasks.md discloses (coordinator, PW4-T handshake).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { EventSpec } from '../events.ts';

const TASKS = join(import.meta.dirname, '../../../tasks');
// The six tasks; tasks/_toy is a test fixture no model trial runs (docs/tasks.md), so its ids are
// left in its own form.
const withEvents = readdirSync(TASKS).filter((t) => !t.startsWith('_') && existsSync(join(TASKS, t, 'events.ts')));

describe.each(withEvents)('%s events.ts', (task) => {
  it("every arrival resource id has the world's <prefix>-<digits> form", async () => {
    const { SPECS } = (await import(pathToFileURL(join(TASKS, task, 'events.ts')).href)) as { SPECS: readonly EventSpec[] };
    const bad = SPECS.flatMap((s) => s.resources.map((r) => `${s.id}: ${r.resourceType}/${r.id}`).filter((x) => !/\/[a-z]+-\d+$/.test(x)));
    expect(bad).toEqual([]);
  });
});
