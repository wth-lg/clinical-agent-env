// The pilot-4a grader faults on T3 (results/pilot-4a/classes.md G1, G2; builder-292), each pinned on
// the shape of the real trial that showed it.
//
// G1 (crc-care-gap/0, /1): the trial read the arrival before it wrote, but its base absence review
// stayed incomplete. event_seen and missed_arrival turn on the arrival alone (R38(g), (j)); the
// incomplete review fails the member's own base gate as retrieval (R2, R31, R38(a)), and a review
// completed only after the order fails gap_seen_before_order as process (R18).
//
// G2 (crc-care-gap/2): an Observation run newest first, date_ge 2017 at offset 0 (total 45, next 28),
// then offset 28 with date_ge dropped (total 45, no next). Dropping a filter can only widen the
// match set, and the totals agree, so both pages list the same 45 records in the same order and
// together show every one (R27, R36; R34, R16: a gate is never stricter than the policy).
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import type { Step, StepSearch } from '../../../packages/grader/check.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { gradeRun, trial, type Miss } from '../../../packages/grader/matrix/matrix.ts';
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { DELIVERED, SCREENING } from '../expected.ts';
import { actions, arrivals, finish, PT, reads, recheck, search, STOOL_CODES, type Label } from '../solution/steps.ts';
import { absenceShownAt } from './grader.ts';

const at = (iso: string) => Date.parse(iso);
const step = (n: number, search?: StepSearch): Step => ({ n, seq: n, turn: n, tool: search ? 'fhir_search' : 'fhir_read', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...(search ? { search } : {}) });
const KOSS = 'Patient/pt-0022';
// crc-care-gap/2 steps 37 and 41, as stepsOf derives them from the recorded results.
const PAGE_1: StepSearch = { type: 'Observation', patient: KOSS, date_ge: '2017-01-01', sort: '-date', next_offset: 28, total: 45, span: [1713070793000, 1777035593000], whole: false };
const PAGE_2: StepSearch = { type: 'Observation', patient: KOSS, sort: '-date', offset: 28, total: 45, span: [1616936393000, 1713070793000], whole: false };
const SDNA = SCREENING.find((a) => a.type === 'Observation' && a.from === '2024-01-01')!;
const FOBT = SCREENING.find((a) => a.type === 'Observation' && a.from === '2026-01-01')!;

describe('G2: a page run whose later page drops a filter, same total and order (crc-care-gap/2)', () => {
  it('is complete for the sDNA-FIT window at its last page; page 1 already passes the FOBT window\'s edge (R36)', () => {
    const steps = [step(37, PAGE_1), step(38), step(41, PAGE_2)];
    expect(absenceShownAt(steps, KOSS, SDNA)).toBe(41);
    expect(absenceShownAt(steps, KOSS, FOBT)).toBe(37);
  });

  it('still refuses a run that stops short, leaves a gap, changes order, disagrees on total or narrows to other records', () => {
    expect(absenceShownAt([step(37, PAGE_1)], KOSS, SDNA)).toBe(null);
    expect(absenceShownAt([step(37, PAGE_1), step(41, { ...PAGE_2, offset: 30 })], KOSS, SDNA)).toBe(null);
    expect(absenceShownAt([step(37, PAGE_1), step(41, { ...PAGE_2, sort: 'date', span: [at('2017-01-01T00:00:00Z'), at('2019-01-01T00:00:00Z')] })], KOSS, SDNA)).toBe(null);
    expect(absenceShownAt([step(37, PAGE_1), step(41, { ...PAGE_2, total: 46 })], KOSS, SDNA)).toBe(null);
    const { total: _total, ...noTotal } = PAGE_2;
    expect(absenceShownAt([step(37, PAGE_1), step(41, noTotal)], KOSS, SDNA)).toBe(null);
    // date_ge 2017 then date_le 2016: neither holds the other, so equal totals prove nothing.
    expect(absenceShownAt([step(37, PAGE_1), step(41, { ...PAGE_2, date_le: '2016-12-31' })], KOSS, SDNA)).toBe(null);
    // Another patient's records on the later page.
    expect(absenceShownAt([step(37, PAGE_1), step(41, { ...PAGE_2, patient: 'Patient/pt-0024' })], KOSS, SDNA)).toBe(null);
  });
});

const env = matrixEnv();
const task = await loadMatrixTask('crc-care-gap');
const P = (l: Label) => `Patient/${PT[l]}`;
// The reads without member l's stool-test search, which the case replaces with its own review.
const withoutStool = (l: Label) => (turns: readonly ScriptTurn[]): ScriptTurn[] => turns.map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT[l] && c.input.code === STOOL_CODES)) }));
const failed = (checks: ReadonlyArray<{ kind?: string; met: unknown; id: string }>) => checks.filter((c) => c.kind === 'gate' && c.met === false).map((c) => c.id);
async function graded(script: ScriptTurn[]) {
  const run = await trial(env, task, { kind: 'mutant', id: 'pilot-4a', script } as Parameters<typeof trial>[2]);
  const misses: Miss[] = [];
  const grade = await gradeRun(env, task, task.checks, run, misses);
  expect(misses).toEqual([]);
  return { grade, steps: stepsOf(run.events) };
}
const itemLabels = (grade: Awaited<ReturnType<typeof graded>>['grade']) => Object.fromEntries((grade.attribution?.items ?? []).map((i) => [i.item, [i.gate, i.auto]]));

// crc-care-gap/2's review of Tiny Koss: page 1 from 2017 newest first (it fires crc-b2), page 2
// with date_ge dropped.
const KOSS_PAGES: ScriptCall[] = [search('Observation', PT.D1, { date_ge: '2017-01-01', sort: '-date', count: 28 }), search('Observation', PT.D1, { sort: '-date', offset: 28, count: 28 })];
// crc-care-gap/0's review of Delaine MacGyver: 2017 to 2025-06-01 newest first, one page. It fires
// crc-o1 but its date_le stops short of today, so it covers no screening kind.
const MACGYVER_SHORT: ScriptCall = search('Observation', PT.A1, { date_ge: '2017-01-01', date_le: '2025-06-01', sort: '-date', count: 26 });
// crc-care-gap/1's review of Elly Trantow: 2016 to 2025-12-31, one page; it covers no kind.
const TRANTOW_SHORT: ScriptCall = search('Observation', PT.G1, { date_ge: '2016-01-01', date_le: '2025-12-31', sort: '-date', count: 28 });

describe('G2 end to end: crc-care-gap/2 passes', () => {
  it('a Koss review by a page run that drops date_ge, then the oracle\'s actions, is a PASS', async () => {
    const { grade } = await graded([...withoutStool('D1')(reads()), { calls: [KOSS_PAGES[0]!] }, { calls: [KOSS_PAGES[1]!] }, recheck, arrivals(), { calls: actions() }, { calls: [finish()] }]);
    expect([grade.outcome, failed(grade.checks)]).toEqual(['PASS', []]);
  });
});

describe('G1: the base absence review is its own gate, not event_seen (crc-care-gap/0, /1)', () => {
  it('/0: MacGyver\'s arrival read before the writes, her review incomplete: fit_orders fails her as retrieval; event_seen is met', async () => {
    const { grade, steps } = await graded([...withoutStool('A1')(reads()), { calls: [MACGYVER_SHORT] }, recheck, arrivals(), { calls: actions() }, { calls: [finish()] }]);
    expect(steps.some((s) => (s.arrivals ?? []).some((a) => a.spec === 'crc-o1'))).toBe(true);
    expect(grade.outcome).toBe('FAIL');
    expect(failed(grade.checks)).toEqual(['fit_orders', 'gap_seen_before_order']);
    expect(itemLabels(grade)).toEqual({ [P('A1')]: ['fit_orders', 'retrieval'] });
    expect(grade.attribution?.auto).toBe('retrieval');
  });

  it('/1: Trantow\'s arrival read before the writes, her review incomplete: fit_orders fails her as retrieval', async () => {
    const { grade } = await graded([...withoutStool('G1')(reads()), { calls: [TRANTOW_SHORT] }, recheck, arrivals(), { calls: actions() }, { calls: [finish()] }]);
    expect(failed(grade.checks)).toEqual(['fit_orders', 'gap_seen_before_order']);
    expect(itemLabels(grade)).toEqual({ [P('G1')]: ['fit_orders', 'retrieval'] });
  });

  it('a review completed only after the order fails gap_seen_before_order as process (R18)', async () => {
    const { grade } = await graded([...withoutStool('A1')(reads()), { calls: [MACGYVER_SHORT] }, recheck, arrivals(), { calls: actions() }, { calls: [search('Observation', PT.A1, { code: STOOL_CODES })] }, { calls: [finish()] }]);
    expect(failed(grade.checks)).toEqual(['gap_seen_before_order']);
    expect(itemLabels(grade)).toEqual({ [P('A1')]: ['gap_seen_before_order', 'process'] });
  });

  it('the event gates read the arrival only: each delivered member\'s base review is not in its event_seen rule', async () => {
    const { grade } = await graded([...withoutStool('A1')(reads()), { calls: [MACGYVER_SHORT] }, recheck, arrivals(), { calls: actions() }, { calls: [finish()] }]);
    for (const id of ['event_seen', 'amended']) expect([id, grade.checks.find((c) => c.id === id)?.met]).toEqual([id, true]);
    expect(Object.keys(DELIVERED)).toContain('crc-o1');
  });
});
