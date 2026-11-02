// The Grading tab's item lines (plan-amendment-worklist W1-1): a gate over a worklist says how many
// items it found right and, for each failed one, why and its kind of failure, so the page keeps
// telling which item failed and why.
import { describe, expect, it } from 'vitest';
import { currentAttribution, fittingAttribution, type ExplainRecord } from '../../../packages/core/explain.ts';
import { failedItems, itemLabelsOf, itemsMetText } from '../src/trial/items.ts';

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

// verifier-phase-P17i-S0-208-1 S1: the trial page reads its labels from the current grade. A regrade
// stores the attribution of the grade it computes (cli/regrade.ts), so a FAIL that stays a FAIL
// under a grader fix shows the new labels, not the replaced grade's and not none (pilot-4a
// crc-care-gap/0: event_seen at grader 18, fit_orders at grader 19). A regrade entry written before
// regrades stored labels shows no item labels, as before.
describe('the trial page labels read the current grade', () => {
  const recorded = { auto: 'retrieval', first_failed: 'event_seen', decisive_step: 82, exposure: [], items: [{ item: 'Patient/pt-0024', gate: 'event_seen', auto: 'retrieval' }] };
  const regraded = { auto: 'retrieval', first_failed: 'fit_orders', decisive_step: 69, exposure: [], items: [{ item: 'Patient/pt-0024', gate: 'fit_orders', auto: 'retrieval' }] };
  const base = { outcome: 'FAIL', task_version: null, state_hash: { initial: null, final: null, replay_final: null }, attribution: recorded };
  it('a regrade with stored attribution: its own labels and kind', () => {
    const r = { ...base, regrades: [{ outcome: 'FAIL', changed: false, attribution: regraded }] };
    expect(itemLabelsOf(r)).toEqual(regraded.items);
    expect(currentAttribution(r)?.first_failed).toBe('fit_orders');
    expect(failedItems('fit_orders', [{ item: 'Patient/pt-0024', met: false, why: 'ordered without the review', ids: [] }], itemLabelsOf(r)).map((i) => i.label)).toEqual(['retrieval']);
  });
  it('no regrade: the recorded labels; an older regrade entry without attribution: no item labels', () => {
    expect(itemLabelsOf(base)).toEqual(recorded.items);
    expect(itemLabelsOf({ ...base, regrades: [{ outcome: 'FAIL', changed: false }] })).toBe(null);
    expect(currentAttribution({ ...base, regrades: [{ outcome: 'FAIL', changed: false }] })?.first_failed).toBe('event_seen');
  });
  it('the Attribution tab\'s automatic kind: the stored regrade attribution; none when an older entry\'s fallback names another decisive check', () => {
    const failing = (id: string) => [{ id, kind: 'gate', met: false }];
    const rec = { ...base, checks: failing('event_seen') } as unknown as ExplainRecord;
    expect(fittingAttribution(rec)?.first_failed).toBe('event_seen');
    expect(fittingAttribution({ ...rec, regrades: [{ outcome: 'FAIL', changed: false, checks: failing('fit_orders'), attribution: regraded }] } as unknown as ExplainRecord)?.first_failed).toBe('fit_orders');
    expect(fittingAttribution({ ...rec, regrades: [{ outcome: 'FAIL', changed: false, checks: failing('fit_orders') }] } as unknown as ExplainRecord)).toBe(null);
  });
});
