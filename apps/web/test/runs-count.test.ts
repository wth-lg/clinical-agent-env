// The Runs count line (P25u J9): it leads with the official trials, the ones the results count,
// and names the pilot and superseded trials on the page as "more ... not counted", so the lead's
// 120 and the count line's number agree. With a filter it reads "<shown> of <total> official
// trials"; the kinds that hold no listed trial are left out of the parenthesis.
import { describe, expect, it } from 'vitest';
import { shownCountLine } from '../src/runs/count.ts';

describe('shownCountLine', () => {
  it('leads with the official trials and names the others as not counted', () => {
    expect(shownCountLine({ official: { shown: 120, total: 120 }, pilots: 225, superseded: 20, filtered: false }))
      .toBe('Showing 120 official trials (245 more in pilots and superseded versions, not counted)');
  });
  it('with a filter, shows the matched count over the total, and only the kinds with a listed trial', () => {
    expect(shownCountLine({ official: { shown: 20, total: 120 }, pilots: 23, superseded: 0, filtered: true }))
      .toBe('Showing 20 of 120 official trials (23 more in pilots, not counted)');
    expect(shownCountLine({ official: { shown: 0, total: 120 }, pilots: 0, superseded: 1, filtered: true }))
      .toBe('Showing 0 of 120 official trials (1 more in superseded versions, not counted)');
  });
  it('has no parenthesis when no pilot or superseded trial is listed', () => {
    expect(shownCountLine({ official: { shown: 120, total: 120 }, pilots: 0, superseded: 0, filtered: false })).toBe('Showing 120 official trials');
  });
  it('with no official run, counts the pilot trials and says they are not counted', () => {
    expect(shownCountLine({ official: null, pilots: 75, superseded: 0, filtered: false })).toBe('Showing 75 trials in pilots, not counted in the results');
    expect(shownCountLine({ official: null, pilots: 0, superseded: 0, filtered: true })).toBe('Showing 0 trials');
  });
});
