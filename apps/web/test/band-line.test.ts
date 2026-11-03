// The Overview band line (ui-contract P14, pre-audit F1): `<k> of <n> tasks in band`, k the tasks
// whose summary.json band_verdict is In band, n the tasks with a final result (a verdict), both
// read from the official run's summary, never a constant; and the note naming the tasks with no
// final result yet, which the count leaves out. The line matches the ax_match pattern trace.json
// holds for the rows the line serves (W1, W2, W3, U21, U26), so P25c's check and this text agree.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bandCount, bandLine, notFinalLine } from '../src/overview/band.ts';

const inBand = { band_verdict: 'In band' as const };
const above = { band_verdict: 'Above band' as const };
const ALL = ['renal-dose-review', 'results-inbox', 'crc-care-gap', 'discharge-medrec', 'contrast-ct-prep', 'message-queue'];

describe('bandCount', () => {
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

  it('a task with no final result is left out of n and named in the note, in task-list order', () => {
    const c = bandCount({ 'crc-care-gap': above, 'contrast-ct-prep': inBand }, ALL);
    expect(c).toEqual({ inBand: 1, final: 2, notFinal: ['renal-dose-review', 'results-inbox', 'discharge-medrec', 'message-queue'] });
    expect(bandLine(c)).toBe('1 of 2 tasks in band');
    expect(notFinalLine(c)).toBe('4 tasks have no final result yet and are not counted: renal-dose-review, results-inbox, discharge-medrec, message-queue.');
  });

  it('a task in the summary with no verdict (no valid trials) has no final result either', () => {
    const c = bandCount({ 'crc-care-gap': inBand, 'message-queue': { band_verdict: null } }, ['crc-care-gap', 'message-queue']);
    expect(c).toEqual({ inBand: 1, final: 1, notFinal: ['message-queue'] });
    expect(notFinalLine(c)).toBe('1 task has no final result yet and is not counted: message-queue.');
  });

  it('with no task list yet, the note names only the summary tasks with no verdict', () => {
    expect(bandCount({ 'crc-care-gap': inBand, 'message-queue': { band_verdict: null } }, null)).toEqual({ inBand: 1, final: 1, notFinal: ['message-queue'] });
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
