// builder-292, N1 (pilot-4a contrast-ct-prep/0, /1, /2; R9, R38(g)): an event gate's decisive_ids,
// seen_at and exposure report name every resource its seen rule requires, not only the spec's focus.
// Mohr's arrival is two creatinines; the trials opened obs-07502 (1.52, the inbox item's focus) and
// never saw obs-07501 (1.04). The records named only obs-07502, "exposed, never seen", and never the
// record that was missed. Reporting only: no grade changes.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { cases, gradeRun, trial, type Miss } from '../../../packages/grader/matrix/matrix.ts';

const env = matrixEnv();
const task = await loadMatrixTask('contrast-ct-prep');
const MOHR = 'Patient/pt-0047';

describe('N1: Mohr\'s event gates name both creatinines', () => {
  it('event_seen and amended declare obs-07501 and obs-07502 as decisive ids', () => {
    for (const id of ['event_seen', 'amended']) {
      const g = task.checks.find((c) => c.id === id)!;
      expect([id, g.kind === 'gate' && g.decisive_ids.includes('Observation/obs-07501'), g.kind === 'gate' && g.decisive_ids.includes('Observation/obs-07502')]).toEqual([id, true, true]);
    }
  });

  it('a trial that opens only the 1.52 and gives no saline names obs-07501 as the record never seen; its grade is unchanged', async () => {
    const c = cases(task).find((x) => x.id === 'mohr_arrival_1_52_only_no_saline')!;
    const misses: Miss[] = [];
    const grade = await gradeRun(env, task, task.checks, await trial(env, task, c), misses);
    expect(misses).toEqual([]);
    expect([grade.outcome, grade.attribution?.auto]).toEqual(['FAIL', 'retrieval']);
    const item = grade.attribution!.items!.find((i) => i.item === MOHR)!;
    expect(item.gate).toBe('event_seen');
    const seen = Object.fromEntries(item.exposure.map((e) => [e.id, e.first_seen_step ?? null]));
    expect(Object.keys(seen).sort()).toEqual(['Observation/obs-07501', 'Observation/obs-07502']);
    expect(seen['Observation/obs-07501']).toBe(null);
    expect(seen['Observation/obs-07502']).not.toBe(null);
    const r = grade.checks.find((x) => x.id === 'event_seen') as { items?: Array<{ item: string; decisive_ids: string[] }> };
    expect(r.items!.find((i) => i.item === MOHR)!.decisive_ids.sort()).toEqual(['Observation/obs-07501', 'Observation/obs-07502']);
  });
});
