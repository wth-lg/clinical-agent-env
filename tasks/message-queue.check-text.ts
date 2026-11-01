// message-queue's gate checks in words (packages/core/explain.ts CheckText): what each one
// requires, and the first difference its evidence (tests/grader.ts) shows. The Tasks view and the
// failure reasons read it. It sits beside the task directory, not in it, so neither task version
// covers it: rewording it regrades nothing.
import { items, show, type CheckText } from '../packages/core/explain.ts';
import { ITEMS } from './message-queue/expected.ts';

// A queue item as a reader knows it: 'Task/task-00008 (m1, lisinopril for Patient/pt-0026)'.
const which = (item: unknown) => {
  const x = ITEMS.find((i) => i.item === item);
  return x === undefined ? show(item) : `${x.item} (${x.name}, ${x.drug} for ${x.patient})`;
};
// The first failed item and why it failed.
const first = (ev: Record<string, unknown>) => {
  const item = items(ev.failed_items)[0];
  const why = items(ev.why)[0];
  if (item === 'outside') return why === null || why === undefined ? 'an order, task or message about a patient outside the queue' : String(why);
  return why === null || why === undefined ? which(item) : `${which(item)} ${String(why)}`;
};


export const checkText: CheckText = {
  refill_decision: {
    requires: `each of the ${ITEMS.length} refill requests decided by RBC-RX-05 on the chart's valid results: a renewal for 90 days with 1 refill or a 30-day supply, each with the lab the protocol orders with it, or a hold with a task to the PCP whose focus is the drug's order; a request a mid-trial arrival changed is graded by amended instead`,
    found: first,
  },
  decisive_seen: {
    requires: 'every record that decides an item read before the end of the trial, once that item was decided: its results, outside reports and visit (Encounter status finished), for a result the window must lack (no BMP in 12 months, no HbA1c in 6) a complete search of the window that could not hide one, and for a repeated request the first message',
    found: first,
  },
  seen_before_change: {
    requires: 'every record that decides an item read in a turn before the item was decided, not only afterwards',
    found: first,
  },
  no_forbidden_order: {
    requires: 'no new order of a drug the protocol holds (once an arrival that holds it was read, no order written after it), no second live order for a repeated request, and no order, task or message about a patient outside the queue',
    found: first,
  },
  all_cleared: {
    requires: `all ${ITEMS.length} queue items completed, cancelled or rejected, and a message that arrived in the queue for one of them (a resent request) closed too, after it was read`,
    found: first,
  },
  // The event gates (packages/grader/events.ts) over the items an active mid-trial event bears on
  // (message-queue/events.ts); their evidence lists the failed items, each with its own why.
  event_delivered: {
    requires: "each active mid-trial arrival whose trigger held (a write on that patient) is in the chart at the end, and nothing arrived without its trigger; a failure is the environment's, not the model's",
    found: (ev) => `the arrival for ${which(items(ev.failed_items)[0])} is missing`,
  },
  had_turn: {
    requires: 'the model had a turn after each arrival',
    found: (ev) => `${which(items(ev.failed_items)[0])}: an arrival came in the model's last turn`,
  },
  event_seen: {
    requires: "each arrival read after it came in, before finish: the result opened or shown in a result list, the outside report opened or a search snippet showing its deciding line (its potassium, its entered-in-error notice), the message opened; an inbox row alone does not show it, and closing the item by its id does not either",
    found: (ev) => `the arrival for ${which(items(ev.failed_items)[0])} was never read`,
  },
  amended: {
    requires: 'each request an arrival changes ends where RBC-RX-05 puts it on the chart as delivered (a hold and a task to the PCP after a valid potassium of 5.5 or higher or a corrected creatinine more than 30% up, with the order sent before voided; a 30-day supply and an HbA1c once the only HbA1c in 6 months is entered in error), written after the arrival was read',
    found: (ev) => `${which(items(ev.failed_items)[0])} does not reflect what arrived`,
  },
  kept: {
    requires: "no second live order on account of an arrival RBC-RX-05 does not count as a new request: a pharmacy's resent request for a medication already requested",
    found: (ev) => `${which(items(ev.failed_items)[0])} was ordered again on an arrival that is the same request`,
  },
};
