// Trial durations on screen (P25c, Overview): a duration in words, and the median over a task's
// records from each record's started and ended.
import { describe, expect, it } from 'vitest';
import { formatDuration, medianSeconds } from '../src/data/duration.ts';

describe('formatDuration', () => {
  it('reads seconds under a minute, else minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(59)).toBe('59 s');
    expect(formatDuration(60)).toBe('1 min 0 s');
    expect(formatDuration(170.4)).toBe('2 min 50 s');
  });
});

describe('medianSeconds', () => {
  const rec = (s: number) => ({ started: '2026-10-23T12:00:00.000Z', ended: new Date(Date.parse('2026-10-23T12:00:00.000Z') + s * 1000).toISOString() });
  it('is the middle value of an odd count and the mean of the two middle values of an even count', () => {
    expect(medianSeconds([rec(10), rec(30), rec(20)])).toBe(20);
    expect(medianSeconds([rec(10), rec(40), rec(30), rec(20)])).toBe(25);
  });
  it('leaves out a record whose times it cannot read, and is null with none', () => {
    expect(medianSeconds([rec(10), { started: 'soon', ended: 'later' }, { started: undefined, ended: undefined }])).toBe(10);
    expect(medianSeconds([])).toBeNull();
    expect(medianSeconds([{ started: 'soon', ended: 'later' }])).toBeNull();
  });
});
