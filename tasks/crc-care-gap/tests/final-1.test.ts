// The final-1 grader faults on T3 (results/runs/final-1/classes.md G6, G7; builder-303, builder-304;
// ruling R41), each pinned on the shape of a real trial that showed it, replayed call for call
// against the frozen world (alternatives.ts D1_PARTITIONED, G1_COUNT_PROVEN, G1_GAP_DAY_UNSORTED,
// G1_INTERLEAVED), and the two final-1 model failures that stay (mutants.ts, from /3 and /4).
//
// R41: a window review is complete when every record of the reviewed kind for the patient inside
// the window was exposed before the decision write, by any combination of searches, pages or reads
// (exposure.ts windowExposed over windowTargets). Search-shape rules (one run, a sorted run past the
// edge, a narrower query) stay as sufficient routes, never required ones. Before grader 22 the
// grader held the twelve G6 and G7 trials to a shape rule none of them had, though every laboratory
// result of the sDNA-FIT and FOBT windows had been shown (results/runs/final-1/classes.md).
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { gradeRun, trial, type Miss } from '../../../packages/grader/matrix/matrix.ts';
import type { ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { PT } from '../solution/steps.ts';
import { D1_PARTITIONED, G1_COUNT_PROVEN, G1_GAP_DAY_UNSORTED, G1_INTERLEAVED, review } from './alternatives.ts';
import { mutants } from './mutants.ts';

const env = matrixEnv();
const task = await loadMatrixTask('crc-care-gap');
const failed = (checks: ReadonlyArray<{ kind?: string; met: unknown; id: string }>) => checks.filter((c) => c.kind === 'gate' && c.met === false).map((c) => c.id);
async function graded(id: string, script: readonly ScriptTurn[]) {
  const run = await trial(env, task, { kind: 'mutant', id, script } as Parameters<typeof trial>[2]);
  const misses: Miss[] = [];
  const grade = await gradeRun(env, task, task.checks, run, misses);
  expect(misses).toEqual([]);
  return grade;
}
const itemLabels = (grade: Awaited<ReturnType<typeof graded>>) => Object.fromEntries((grade.attribution?.items ?? []).map((i) => [i.item, [i.gate, i.auto]]));

describe('R41 end to end: the final-1 G6 and G7 reviews pass', () => {
  it('G6: Tiny Koss reviewed by two whole searches that partition her window (final-1 /0, /7)', async () => {
    const grade = await graded('final-1-g6', review('D1', D1_PARTITIONED));
    expect([grade.outcome, failed(grade.checks)]).toEqual(['PASS', []]);
  });
  it('G7: Elly Trantow reviewed by two pages of 76 and a whole search of the rest (final-1 /7)', async () => {
    const grade = await graded('final-1-g7-count', review('G1', G1_COUNT_PROVEN));
    expect([grade.outcome, failed(grade.checks)]).toEqual(['PASS', []]);
  });
  it('G7: Elly Trantow reviewed with the day between two whole searches shown by an unsorted page (final-1 /6)', async () => {
    const grade = await graded('final-1-g7-gap', review('G1', G1_GAP_DAY_UNSORTED));
    expect([grade.outcome, failed(grade.checks)]).toEqual(['PASS', []]);
  });
  it('G7: Elly Trantow reviewed by a laboratory page and the no-category pages after it (final-1 /8)', async () => {
    const grade = await graded('final-1-g7-interleaved', review('G1', G1_INTERLEAVED));
    expect([grade.outcome, failed(grade.checks)]).toEqual(['PASS', []]);
  });
});

describe('R41 end to end: the two final-1 stop-short reviews still fail as retrieval', () => {
  const mutant = (id: string) => mutants.find((m) => m.id === id)!;
  it('final-1 /3: three laboratory results of Dec 31, 2024 never shown', async () => {
    const grade = await graded('final-1-3', mutant('g1_stop_short_leaves_results_unshown').script);
    expect([grade.outcome, failed(grade.checks)]).toEqual(['FAIL', ['fit_orders', 'gap_seen_before_order']]);
    expect(itemLabels(grade)).toEqual({ [`Patient/${PT.G1}`]: ['fit_orders', 'retrieval'] });
  });
  it('final-1 /4: the results of Jun 2, 2025 past the cut page never shown', async () => {
    const grade = await graded('final-1-4', mutant('a1_gap_day_leaves_results_unshown').script);
    expect([grade.outcome, failed(grade.checks)]).toEqual(['FAIL', ['fit_orders', 'gap_seen_before_order']]);
    expect(itemLabels(grade)).toEqual({ [`Patient/${PT.A1}`]: ['fit_orders', 'retrieval'] });
  });
});
