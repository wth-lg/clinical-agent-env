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
const firstFailed = (ev: Record<string, unknown>) => {
  const f = fields(items(ev.failed)[0]);
  if (f.item === undefined) return '';
  const x = I.find((i) => i.key === f.item);
  return `${show(f.item)}${x ? ` (${x.patient})` : ''}: ${f.why === null || f.why === undefined ? 'failed' : show(f.why)}`;
};

export const checkText: CheckText = {
  item_orders: {
    requires: `the order each of the ${ACTIONABLE} items that need action calls for under the current version of its result: the screening LDCT in its window, an urgent repeat BMP by the next business day for a hemolyzed potassium or acute kidney injury, a stat BMP and a stat on-call notice for a corrected critical potassium, and the urgent specialist referral a final report recommends; an existing active order that meets the same terms counts`,
    found: firstFailed,
  },
  item_no_forbidden: {
    requires: 'no write the policies forbid for an item: no on-call notice for a hemolyzed potassium, no urgent on-call notice for a potassium corrected to normal, no urgent or next-day repeat on a first-reported or withdrawn value, no GI referral on a withdrawn FIT, no diagnostic chest CT for a nodule a final report withdrew, no on-call notice that names no patient, no order on a normal result',
    found: firstFailed,
  },
  decisive_seen: {
    requires: `each record an item's decision rests on seen at some point: read, or every atom of one of its deciding facts shown in one note search snippet; for the withdrawn comparison creatinine, a complete search of the patient's serum or plasma creatinines (the results RBC-LAB-03 counts) over the 7 days before the result`,
    found: firstFailed,
  },
  items_closed: {
    requires: `all ${I.length} inbox items completed, and each of the ${ACTIONABLE} that need action linked to what closes it, a new action or an existing active order of the right kind (or the corrected critical potassium handed to on-call after a stat notice)`,
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
};
