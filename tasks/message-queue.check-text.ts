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

const counts = { renew: ITEMS.filter((x) => x.action === 'renew').length, bridge: ITEMS.filter((x) => x.action === 'bridge').length, hold: ITEMS.filter((x) => x.action === 'hold').length };

export const checkText: CheckText = {
  refill_decision: {
    requires: `each of the ${ITEMS.length} refill requests decided by RBC-RX-05 on the chart's valid results: ${counts.renew} renewals for 90 days with 1 refill and ${counts.bridge} 30-day supplies, each with the lab the protocol orders with it, and ${counts.hold} holds with a task to the PCP whose focus is the drug's order`,
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
    requires: 'no new order of a drug the protocol holds, no second live order for a repeated request, and no order, task or message about a patient outside the queue',
    found: first,
  },
  all_cleared: {
    requires: `all ${ITEMS.length} queue items completed, cancelled or rejected`,
    found: first,
  },
};
