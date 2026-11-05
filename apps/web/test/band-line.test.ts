// The Overview band line (ui-contract P14, pre-audit F1): `<k> of <n> tasks in band`, k the tasks
// whose summary.json band_verdict is In band, n the tasks with a final result: FINAL_TRIALS_PER_TASK
// valid trials in the official run (packages/core/cost.ts), so a verdict over the whole sample.
// Both are read from the summary, never a constant. A task part way through the run (fewer valid
// trials) is in progress: never counted in n or k, named in the note with its count; a task with no
// record in the run is named plainly. The line matches the ax_match pattern trace.json holds for the
// rows the line serves (W1, W2, W3, U21, U26), so P25c's check and this text agree.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FINAL_TRIALS_PER_TASK } from '../../../packages/core/cost.ts';
import { bandCount, bandLine, isFinalTask, notFinalLine, officialRunLabel, verdictLabel } from '../src/overview/band.ts';
import { bandVerdict } from '../../../packages/core/summary.ts';

const N = FINAL_TRIALS_PER_TASK;
const inBand = { band_verdict: 'In band' as const, trials: N };
const above = { band_verdict: 'Above band' as const, trials: N };
const ALL = ['renal-dose-review', 'results-inbox', 'crc-care-gap', 'discharge-medrec', 'contrast-ct-prep', 'message-queue'];

describe('bandCount', () => {
  it('the threshold is the final run\'s trials per task, 20', () => {
    expect(N).toBe(20);
  });

  it('every task in band: k equals n, and nothing is left out', () => {
    const c = bandCount({ 'crc-care-gap': inBand, 'contrast-ct-prep': inBand, 'message-queue': inBand }, ['crc-care-gap', 'contrast-ct-prep', 'message-queue']);
    expect(c).toEqual({ inBand: 3, final: 3, notFinal: [] });
    expect(bandLine(c)).toBe('3 of 3 tasks in band');
    expect(notFinalLine(c)).toBeNull();
  });

  it('one task above the band: it counts in n and not in k', () => {
    const c = bandCount({ 'crc-care-gap': above, 'contrast-ct-prep': inBand, 'message-queue': inBand }, ['crc-care-gap', 'contrast-ct-prep', 'message-queue']);
    expect(c).toEqual({ inBand: 2, final: 3, notFinal: [] });
    expect(bandLine(c)).toBe('2 of 3 tasks in band');
  });

  it('a task with no record in the run is left out of n and named in the note, in task-list order', () => {
    const c = bandCount({ 'crc-care-gap': above, 'contrast-ct-prep': inBand }, ALL);
    expect(c).toEqual({ inBand: 1, final: 2, notFinal: [{ id: 'renal-dose-review', trials: null }, { id: 'results-inbox', trials: null }, { id: 'discharge-medrec', trials: null }, { id: 'message-queue', trials: null }] });
    expect(bandLine(c)).toBe('1 of 2 tasks in band');
    expect(notFinalLine(c)).toBe('4 tasks have no final result yet and are not counted: renal-dose-review, results-inbox, discharge-medrec, message-queue.');
  });

  it('19 of 20 valid trials is in progress: not final, not in band, named with its count, whatever its verdict', () => {
    const c = bandCount({ 'crc-care-gap': { band_verdict: 'In band', trials: 19 }, 'contrast-ct-prep': inBand }, ['crc-care-gap', 'contrast-ct-prep']);
    expect(c).toEqual({ inBand: 1, final: 1, notFinal: [{ id: 'crc-care-gap', trials: 19 }] });
    expect(bandLine(c)).toBe('1 of 1 tasks in band');
    expect(notFinalLine(c)).toBe('1 task is in progress and not counted, 19 of 20 valid trials: crc-care-gap.');
  });

  it('20 of 20 valid trials is final, and more than 20 still is', () => {
    expect(bandCount({ a: { band_verdict: 'In band', trials: 20 } }, ['a'])).toEqual({ inBand: 1, final: 1, notFinal: [] });
    expect(bandCount({ a: { band_verdict: 'Below band', trials: 21 } }, ['a'])).toEqual({ inBand: 0, final: 1, notFinal: [] });
  });

  it('a task in the summary with no valid trial is in progress at 0 of 20', () => {
    const c = bandCount({ 'crc-care-gap': inBand, 'message-queue': { band_verdict: null, trials: 0 } }, ['crc-care-gap', 'message-queue']);
    expect(c).toEqual({ inBand: 1, final: 1, notFinal: [{ id: 'message-queue', trials: 0 }] });
    expect(notFinalLine(c)).toBe('1 task is in progress and not counted, 0 of 20 valid trials: message-queue.');
  });

  it('in-progress and absent tasks share one note, each in its own words', () => {
    const c = bandCount({ 'crc-care-gap': inBand, 'results-inbox': { band_verdict: 'In band', trials: 12 } }, ['renal-dose-review', 'results-inbox', 'crc-care-gap']);
    expect(notFinalLine(c)).toBe('2 tasks have no final result yet and are not counted: renal-dose-review, results-inbox (in progress, 12 of 20 valid trials).');
  });

  it('in-progress tasks at different counts are each named with their count', () => {
    const c = bandCount({ a: { band_verdict: 'In band', trials: 12 }, b: { band_verdict: null, trials: 0 }, c: inBand }, ['a', 'b', 'c']);
    expect(notFinalLine(c)).toBe('2 tasks have no final result yet and are not counted: a (in progress, 12 of 20 valid trials), b (in progress, 0 of 20 valid trials).');
  });

  it('every task in progress at one count collapses to one line', () => {
    const run = Object.fromEntries(ALL.map((t) => [t, { band_verdict: 'In band' as const, trials: 12 }]));
    const c = bandCount(run, ALL);
    expect(c.final).toBe(0);
    expect(bandLine(c)).toBe('0 of 0 tasks in band');
    expect(notFinalLine(c)).toBe('All six tasks are in progress: 12 of 20 valid trials each.');
    expect(notFinalLine(bandCount({ a: { band_verdict: 'Below band', trials: 3 }, b: { band_verdict: 'In band', trials: 3 } }, ['a', 'b']))).toBe('Both tasks are in progress: 3 of 20 valid trials each.');
    expect(notFinalLine(bandCount({ a: { band_verdict: 'In band', trials: 3 }, b: { band_verdict: 'In band', trials: 3 }, c: { band_verdict: 'In band', trials: 3 } }, ['a', 'b', 'c']))).toBe('All three tasks are in progress: 3 of 20 valid trials each.');
  });

  it('some tasks final and the rest in progress at one count: one line that names them', () => {
    const c = bandCount({ a: inBand, b: { band_verdict: 'In band', trials: 12 }, c: { band_verdict: 'Above band', trials: 12 } }, ['a', 'b', 'c']);
    expect(notFinalLine(c)).toBe('2 tasks are in progress and not counted, 12 of 20 valid trials each: b, c.');
  });

  it('with no task list yet, the note names only the summary tasks short of the sample', () => {
    expect(bandCount({ 'crc-care-gap': inBand, 'message-queue': { band_verdict: 'In band', trials: 5 } }, null)).toEqual({ inBand: 1, final: 1, notFinal: [{ id: 'message-queue', trials: 5 }] });
    expect(bandCount({ 'crc-care-gap': inBand }, null).notFinal).toEqual([]);
  });

  it('a summary task the task list does not name still counts', () => {
    expect(bandCount({ 'crc-care-gap': inBand, '_toy': above }, ['crc-care-gap'])).toEqual({ inBand: 1, final: 2, notFinal: [] });
  });

  it('with no final result at all, the line is 0 of 0 and the note names every task', () => {
    const c = bandCount({}, ['a', 'b']);
    expect(bandLine(c)).toBe('0 of 0 tasks in band');
    expect(notFinalLine(c)).toBe('2 tasks have no final result yet and are not counted: a, b.');
  });
});

describe('verdictLabel', () => {
  it('a verdict over the final sample is itself, with no count', () => {
    expect(verdictLabel('In band', 20)).toEqual({ label: 'In band', count: null });
    expect(verdictLabel('Saturated', 21)).toEqual({ label: 'Saturated', count: null });
  });

  it('a verdict over fewer valid trials is provisional, with its count', () => {
    expect(verdictLabel('In band', 12)).toEqual({ label: 'In band, provisional', count: '12 of 20 valid trials' });
    expect(verdictLabel('Above band', 19)).toEqual({ label: 'Above band, provisional', count: '19 of 20 valid trials' });
    expect(verdictLabel('Below band', 8)).toEqual({ label: 'Below band, provisional', count: '8 of 20 valid trials' });
  });
});

describe('officialRunLabel', () => {
  // A task at n valid trials with the verdict of k passes (bandVerdict), as summary.json gives it.
  const at = (trials: number, passes = Math.floor(trials / 2)) => ({ trials, band_verdict: bandVerdict(passes, trials) });
  const every = (trials: number) => Object.fromEntries(ALL.map((t) => [t, at(trials)]));

  it('is (final) only when the run covers every task of the environment and each has the final sample of valid trials', () => {
    expect(officialRunLabel(every(20), ALL)).toBe('(final)');
    expect(officialRunLabel({ ...every(20), 'crc-care-gap': at(21) }, ALL)).toBe('(final)');
    expect(officialRunLabel({ ...every(20), 'crc-care-gap': at(12) }, ALL)).toBe('(official, in progress)');
    expect(officialRunLabel({}, ALL)).toBe('(official, in progress)');
  });

  it('a run that covers only some tasks of the environment is in progress, even when every task it holds has the final sample (UIBAND-219-4 M1: final-1 at 2 of 6)', () => {
    expect(officialRunLabel({ 'contrast-ct-prep': at(20), 'crc-care-gap': at(20) }, ALL)).toBe('(official, in progress)');
    expect(officialRunLabel(Object.fromEntries(ALL.slice(1).map((t) => [t, at(20)])), ALL)).toBe('(official, in progress)');
  });

  it('a task the run holds beyond the environment list counts too, as in bandCount', () => {
    expect(officialRunLabel({ ...every(20), _toy: at(20) }, ALL)).toBe('(final)');
    expect(officialRunLabel({ ...every(20), _toy: at(3) }, ALL)).toBe('(official, in progress)');
  });

  // HARD2-228-1 m1: while the task list is null (loading, or its load failed) the label cannot know
  // the run covers every task, so it never claims (final).
  it('while the task list is null (loading or failed) the label is (official, in progress), never (final)', () => {
    expect(officialRunLabel(every(20), null)).toBe('(official, in progress)');
    expect(officialRunLabel({ a: at(20), b: at(21) }, null)).toBe('(official, in progress)');
    expect(officialRunLabel({ a: at(12) }, null)).toBe('(official, in progress)');
    expect(officialRunLabel({}, null)).toBe('(official, in progress)');
  });

  // HARD2-228-1 m2: one isFinal predicate (the final sample and a band verdict) for the label and
  // the band count, so a task at 20 trials with no verdict is final in neither.
  it('shares bandCount\'s isFinal predicate: 20 valid trials and a band verdict', () => {
    const noVerdict = { ...every(20), 'crc-care-gap': { trials: 20, band_verdict: null } };
    expect(isFinalTask(noVerdict['crc-care-gap'])).toBe(false);
    expect(isFinalTask(at(20))).toBe(true);
    expect(isFinalTask(at(19))).toBe(false);
    expect(isFinalTask(undefined)).toBe(false);
    expect(officialRunLabel(noVerdict, ALL)).toBe('(official, in progress)');
    expect(bandCount(noVerdict, ALL).final).toBe(ALL.length - 1);
    expect(bandCount(every(20), ALL).final).toBe(ALL.length);
    expect(officialRunLabel(every(20), ALL)).toBe('(final)');
  });
});

describe('the line and the trace agree', () => {
  type Row = { id: string; expect?: ({ ax_match?: { pattern: string } } | { ax_text?: { text: string } })[] };
  const rows = (JSON.parse(readFileSync(join(import.meta.dirname, '../../../docs/requirements/trace.json'), 'utf8')) as { rows: Row[] }).rows;
  const BAND_ROWS = ['W1', 'W2', 'W3', 'U21', 'U26'];

  it.each(BAND_ROWS)('%s holds one ax_match pattern that the computed line matches, and the text the line holds', (id) => {
    const row = rows.find((r) => r.id === id)!;
    const patterns = (row.expect ?? []).flatMap((e) => ('ax_match' in e && e.ax_match ? [e.ax_match.pattern] : []));
    const texts = (row.expect ?? []).flatMap((e) => ('ax_text' in e && e.ax_text ? [e.ax_text.text] : []));
    expect(patterns.filter((p) => p.includes('tasks in band'))).toHaveLength(1);
    const re = new RegExp(patterns.find((p) => p.includes('tasks in band'))!);
    for (const c of [bandCount({ a: inBand, b: above }, ['a', 'b', 'c']), bandCount({}, []), bandCount(Object.fromEntries(ALL.map((t) => [t, inBand])), ALL)]) expect(bandLine(c)).toMatch(re);
    expect(re.test('6 of 6 tasks in band')).toBe(true);
    expect(re.test('tasks in band')).toBe(false);
    expect(texts.filter((t) => t.includes('tasks in band'))).toHaveLength(1);
    expect(bandLine(bandCount({ a: inBand }, ['a']))).toContain(texts.find((t) => t.includes('tasks in band'))!);
  });
});
