// results-inbox's gate checks in words (packages/core/explain.ts CheckText): what each one requires,
// and the first difference its evidence (tests/grader.ts) shows. Every gate checks each inbox item on
// its own and records each failed item with why, so found names the first failed item and its why.
// The Tasks view and the failure reasons read it. It sits beside the task directory, not in it, so
// neither task version covers it: rewording it regrades nothing.
import { fields, items, show, type CheckText } from '../packages/core/explain.ts';
import { expected } from './results-inbox/expected.ts';

const I = expected.items;
const ACTIONABLE = I.filter((x) => x.action === 'order').length;

// The first failed item and why: 'aki_48h (Patient/pt-0007): no urgent repeat BMP by 2026-10-26'.
// The event gates (packages/grader/events.ts) record the failed items by key.
const firstItem = (ev: Record<string, unknown>) => {
  const failed = items(ev.failed_items);
  if (failed.length === 0) return '';
  const x = I.find((i) => i.key === failed[0]);
  return `${show(failed[0])}${x ? ` (${x.patient})` : ''}${failed.length > 1 ? ` (and ${failed.length - 1} more)` : ''}`;
};
const firstFailed = (ev: Record<string, unknown>) => {
  const f = fields(items(ev.failed)[0]);
  if (f.item === undefined) return '';
  const x = I.find((i) => i.key === f.item);
  return `${show(f.item)}${x ? ` (${x.patient})` : ''}: ${f.why === null || f.why === undefined ? 'failed' : show(f.why)}`;
};

export const checkText: CheckText = {
  item_orders: {
    requires: `the order each of the ${ACTIONABLE} items that need action calls for under the current version of its result: the screening LDCT in its window, an urgent repeat BMP by the next business day for a hemolyzed potassium or acute kidney injury, and, for a hemolyzed potassium where the policy's exception applies (an eGFR below 30 or a potassium-raising drug), a stat BMP today, a stat on-call notice and that drug held or reduced; an existing active order that meets the same terms counts (an item whose decision an arrival changed is graded by amended instead)`,
    found: firstFailed,
  },
  item_no_forbidden: {
    requires: 'no write the policies forbid for an item: no on-call notice for a hemolyzed potassium, no urgent on-call notice for a potassium corrected to normal, no urgent or next-day repeat on a first-reported or withdrawn value, no diagnostic chest CT for a nodule a final report withdrew, no on-call notice that names no patient, no order on a normal result, and nothing on a patient\'s chart from an outside record whose header names another person\'s date of birth and MRN: no screening CT in the window it recommends and no message to the patient about it (an item whose decision an arrival changed is graded by amended instead)',
    found: firstFailed,
  },
  decisive_seen: {
    requires: `each record an item's decision rests on seen at some point: read, or every atom of one of its deciding facts shown in one note search snippet; for the withdrawn comparison creatinine, a complete search of the patient's serum or plasma creatinines (the results RBC-LAB-03 counts) over the 7 days before the result; for an outside record filed to the wrong chart, the record and the patient's own identifiers (the Patient record, or a patient search row); for a hemolyzed potassium under the policy's exception, the potassium-raising drug or the eGFR that makes it apply`,
    found: firstFailed,
  },
  items_closed: {
    requires: `all ${I.length} inbox items completed, and each of the ${ACTIONABLE} that need action linked to what closes it, a new action or an existing active order of the right kind (the item of an outside record that is not the patient's is ungraded: closed, cancelled, reassigned or left open)`,
    found: firstFailed,
  },
  result_seen_before_action: {
    requires: `each of the ${I.length} items' results read before any of its orders is placed or the item is closed or reassigned`,
    found: firstFailed,
  },
  seen_before_change: {
    requires: `each record an item's decision rests on seen before the orders it leads to and before the item is closed`,
    found: firstFailed,
  },
  patient_contact: {
    requires: `each patient of the ${ACTIONABLE} items that need action told of that item's result: a message to the patient that lists the result in about, a call task focused on the result due by the next business day for an urgent result or within 7 days for any other (a task on an order tracks it), or a staff message the item's closure links`,
    found: firstFailed,
  },
  // The mid-trial events (results-inbox/events.ts) and RBC-INBOX-01 §8, the arrivals sentence.
  event_delivered: { requires: "every active event whose trigger held arrived in the chart and the inbox (the environment's part: a miss is an environment error)", found: firstItem },
  had_turn: { requires: 'a model turn after every arrival', found: firstItem },
  event_seen: { requires: 'each result or report that arrived during the trial opened, or its deciding line shown, before finishing (§8: review anything that arrived after you started); a batch of results that arrived together is seen only when every result of it was, the notified one and the one filed with no inbox item', found: firstItem },
  amended: { requires: "each decision an arrival changes corrected on the chart as delivered (the order the arrival calls for, a stat on-call notice for a potassium that proves critical, and the patient told where the policy asks), written after the arrival was read; the arrival's item not cancelled, written only after it was read, and, if completed, linking what closes the loop (§3)", found: firstItem },
  kept: { requires: "a decision left in place when an arrival does not change it (no on-call notice for a hemolyzed potassium, no repeat on a creatinine outside the 7-day window, no chest CT and no closure on a preliminary read with no final version)", found: firstItem },
};
