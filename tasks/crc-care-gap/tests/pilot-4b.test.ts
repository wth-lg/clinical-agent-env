// The pilot-4b grader fault on T3 (results/pilot-4b/classes.md G5; builder-293, builder-294), pinned
// on the shape of the real trial that showed it.
//
// G5 (crc-care-gap/1, steps 71-73): Elly Trantow's Observations from 2017 newest first (total 76; the
// page is cut at 24 rows by the tool's size cap, down to Jan 6, 2026, next 24), then the same search
// bounded by date_le at that day (total 54), read to its end in two pages. No arrival comes between.
// Every row the first page did not show sorts at or before that day, so the narrower search holds
// it, and the two together show all 76 (R27, R36; R34, R16: a gate is never stricter than the
// policy). The verdict before grader 20: no screening kind shown absent, fit_orders and
// gap_seen_before_order fail her as retrieval.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import type { Step, StepSearch } from '../../../packages/grader/check.ts';
import { gradeRun, trial, type Miss } from '../../../packages/grader/matrix/matrix.ts';
import type { ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { SCREENING } from '../expected.ts';
import { G1_LAST_SHOWN, G1_NARROWED } from './alternatives.ts';
import { absenceShownAt } from './grader.ts';

const step = (n: number, search?: StepSearch, more: Partial<Step> = {}): Step => ({ n, seq: n, turn: n, tool: search ? 'fhir_search' : 'fhir_read', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...(search ? { search } : {}), ...more });
const TRANTOW = 'Patient/pt-0009';
// crc-care-gap/1 steps 71, 72 and 73, as stepsOf derives them from the recorded results.
const STEP_71: StepSearch = { type: 'Observation', whole: false, patient: TRANTOW, date_ge: '2017-01-01', sort: '-date', offset: 0, next_offset: 24, total: 76, span: [1767728830000, 1791564349000] };
const STEP_72: StepSearch = { type: 'Observation', whole: false, patient: TRANTOW, date_ge: '2017-01-01', date_le: G1_LAST_SHOWN, sort: '-date', next_offset: 27, total: 54, span: [1765914430000, 1767728830000] };
const STEP_73: StepSearch = { type: 'Observation', whole: false, patient: TRANTOW, date_ge: '2017-01-01', date_le: G1_LAST_SHOWN, sort: '-date', offset: 27, total: 54, span: [1735645630000, 1765914430000] };
const SDNA = SCREENING.find((a) => a.type === 'Observation' && a.from === '2024-01-01')!;
const FOBT = SCREENING.find((a) => a.type === 'Observation' && a.from === '2026-01-01')!;
const real = () => [step(71, STEP_71), step(72, STEP_72), step(73, STEP_73)];

describe('G5: a stopped run completed by a narrower query (crc-care-gap/1)', () => {
  it('shows the sDNA-FIT window absent at step 73; step 72 already passes the FOBT window\'s edge (R36)', () => {
    expect(absenceShownAt(real(), TRANTOW, SDNA)).toBe(73);
    expect(absenceShownAt(real(), TRANTOW, FOBT)).toBe(72);
    // Before the narrower query, neither window.
    expect(absenceShownAt([step(71, STEP_71)], TRANTOW, FOBT)).toBe(null);
  });

  it('still refuses a gap, a wrong sort, a stop-short, a changed non-date filter, an arrival between the queries and a failed call\'s reference', () => {
    const both = (patch: Partial<StepSearch>) => [step(71, STEP_71), step(72, { ...STEP_72, ...patch }), step(73, { ...STEP_73, ...patch })];
    // date_le 2025-12-31 leaves the rows of Jan 1 to Jan 6, 2026 the first page did not show.
    expect(absenceShownAt(both({ date_le: '2025-12-31' }), TRANTOW, SDNA)).toBe(null);
    expect(absenceShownAt(both({ sort: 'date' }), TRANTOW, SDNA)).toBe(null);
    expect(absenceShownAt([step(71, STEP_71), step(72, STEP_72)], TRANTOW, SDNA)).toBe(null);
    expect(absenceShownAt(both({ category: 'vital-signs' }), TRANTOW, SDNA)).toBe(null);
    expect(absenceShownAt(both({ date_ge: '2024-01-01' }), TRANTOW, SDNA)).toBe(null);
    // An Observation of hers arrives between step 71 and step 72: an unknown key, not a correction
    // of a record already shown (M3).
    const added = { spec: 'x', keys: ['Observation/obs-new', 'Task/inbox-x'] };
    expect(absenceShownAt([step(71, STEP_71), step(71.5, undefined, { arrivals: [added] }), step(72, STEP_72), step(73, STEP_73)], TRANTOW, SDNA)).toBe(null);
    // N4: a failed read that named that key earlier does not make it a known record.
    const failedRead = step(70, undefined, { is_error: true, exposed_ids: ['Observation/obs-new'], referenced_ids: ['Observation/obs-new'] });
    expect(absenceShownAt([failedRead, step(71, STEP_71), step(71.5, undefined, { arrivals: [added] }), step(72, STEP_72), step(73, STEP_73)], TRANTOW, SDNA)).toBe(null);
  });
});

const env = matrixEnv();
const task = await loadMatrixTask('crc-care-gap');
const failed = (checks: ReadonlyArray<{ kind?: string; met: unknown; id: string }>) => checks.filter((c) => c.kind === 'gate' && c.met === false).map((c) => c.id);
async function graded(script: ScriptTurn[]) {
  const run = await trial(env, task, { kind: 'mutant', id: 'pilot-4b', script } as Parameters<typeof trial>[2]);
  const misses: Miss[] = [];
  const grade = await gradeRun(env, task, task.checks, run, misses);
  expect(misses).toEqual([]);
  return grade;
}

describe('G5 end to end: crc-care-gap/1 passes', () => {
  it('Trantow\'s review by the same three calls, then the oracle\'s actions, is a PASS', async () => {
    const grade = await graded(G1_NARROWED);
    expect([grade.outcome, failed(grade.checks)]).toEqual(['PASS', []]);
  });
});
