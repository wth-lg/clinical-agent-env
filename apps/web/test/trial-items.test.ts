// The Grading tab's item lines (plan-amendment-worklist W1-1): a gate over a worklist says how many
// items it found right and, for each failed one, why and its kind of failure, so the page keeps
// telling which item failed and why.
import { describe, expect, it } from 'vitest';
import { failedItems, itemsMetText } from '../src/trial/items.ts';

const ITEMS = [
  { item: 'Patient/pt-0017', met: false, why: 'needs one new FIT order; the trial placed none', ids: [] },
  { item: 'Patient/pt-0018', met: true },
  { item: 'Patient/pt-0019', met: false, why: 'needs no new FIT order (excluded: hospice); the trial placed 1', ids: ['ServiceRequest/sr-00001'] },
  { item: 'outside', met: false, why: 'a FIT order for Patient/pt-0059, not on the panel', ids: ['ServiceRequest/sr-00002'] },
];
const LABELS = [
  { item: 'Patient/pt-0017', gate: 'fit_orders', auto: 'reasoning' },
  { item: 'Patient/pt-0019', gate: 'nothing_for_others', auto: 'over_action' },
];

describe('item lines of a gate check', () => {
  it('counts the list\'s items met, leaving out the outside item', () => {
    expect(itemsMetText(ITEMS)).toBe('1 of 3 items met');
  });

  it('lists each failed item with why, its ids, and its label on the gate that decided it', () => {
    expect(failedItems('fit_orders', ITEMS, LABELS)).toEqual([
      { item: 'Patient/pt-0017', name: 'Patient/pt-0017', why: 'needs one new FIT order; the trial placed none', ids: [], label: 'reasoning' },
      { item: 'Patient/pt-0019', name: 'Patient/pt-0019', why: 'needs no new FIT order (excluded: hospice); the trial placed 1', ids: ['ServiceRequest/sr-00001'], label: null },
      { item: 'outside', name: 'outside the list', why: 'a FIT order for Patient/pt-0059, not on the panel', ids: ['ServiceRequest/sr-00002'], label: null },
    ]);
  });

  it('shows no label when the record has no item labels', () => {
    expect(failedItems('fit_orders', ITEMS, null).map((i) => i.label)).toEqual([null, null, null]);
  });
});
