// T6's spray, output-gap and status-only agents (the null agent is built into the matrix). Each
// must FAIL. W5-E (plan-amendment-w5 G3): `lever`, the two offline agents of each active A lever
// item (W5-H's matrix `lever` cases): focus_only reads each arrival's focus and acts on it, and must
// fail the item as retrieval; read_all_newest searches again by the route the policy names and acts
// on the newest result, and must pass. Both are also a mutant (tests/mutants.ts) and the oracle's
// own route.
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE } from '../events.ts';
import { LEVER } from '../lever.ts';
import { oracle } from '../solution/solve.ts';
import { close, finish, HOLD_TASK, inbox, mercerLisinopril, MSGS, order, PT, recheck, resultsInbox, route, RX, voided } from '../solution/steps.ts';

// Does everything the oracle does and also fills the refills RBC-RX-05 holds: Frank Odum's and
// Samuel Price's lisinopril once the arrivals are in, Marcus Webb's while webb-c1 is active, and the
// W5-E holds (Leonard Kaplan's lisinopril; Rosalind Mercer's refills once her correction is in).
// Over-action.
export const spray: Script = [
  ...oracle.slice(0, -1),
  {
    calls: [
      order(PT.odum, RX.lis10, 10, 'QD', 90, 1, 'Refill request'),
      order(PT.price, RX.lis20, 20, 'QD', 90, 1, 'Refill request'),
      ...(ACTIVE.includes('webb-c1') ? [order(PT.webb, RX.lis10, 10, 'QD', 90, 1, 'Refill request')] : []),
      ...(LEVER.includes('B') ? [order(PT.kaplan, RX.lis20, 20, 'QD', 90, 1, 'Refill request')] : []),
      ...(ACTIVE.includes('mercer-b1') ? [order(PT.mercer, RX.lis20, 20, 'QD', 90, 1, 'Refill request'), order(PT.mercer, RX.met1000, 1000, 'BID', 90, 1, 'Refill request')] : []),
    ],
  },
  { calls: [finish('Cleared the queue.')] },
];

// Every reply, no order, task or closure: state is graded, not prose. With no write nothing arrives,
// so its re-check lists the queues and opens nothing.
export const output_gap: Script = [...route({ recheck: [resultsInbox, inbox] }).map((t) => ({ ...t, calls: t.calls.filter((c) => !['order_medication', 'order_service', 'create_task', 'update_inbox_item', 'change_medication'].includes(c.name)) })).filter((t) => t.calls.length > 0)];

// Closes every item and does nothing else.
export const status_only: Script = [{ calls: [inbox] }, { calls: MSGS.map((n) => close(n)) }, { calls: [finish('Cleared the messages queue.')] }];

// The lever agents (W5-H Agents.lever), one pair per active A lever item. A (webb-a1): focus_only
// opens the potassium alone and keeps the 30-day supply (the panel report never read: retrieval on
// event_seen and amended); read_all_newest is the oracle's route (the potassium, then the panel
// report, then the 90-day renewal). The reserve (mercer-b1), while active: focus_only opens the
// corrected creatinine, holds the lisinopril and leaves the metformin (the eGFR never listed);
// read_all_newest lists her eGFRs again and holds both.
// (W5-H's Agents.lever shape, typed here so the file compiles before and after that unit lands.)
export const lever: Readonly<Record<string, { focus_only: Script; read_all_newest: Script; loses?: readonly string[] }>> = {
  ...(ACTIVE.includes('webb-a1') ? { A: { focus_only: route({ recheck: recheck(ACTIVE, [], ['webb-a1']), amend: { 'webb-a1': () => [] } }), read_all_newest: route(), loses: [] } } : {}),
  ...(ACTIVE.includes('mercer-b1')
    ? { reserve: { focus_only: route({ recheck: recheck(ACTIVE, [], ['mercer-b1']), amend: { 'mercer-b1': (m) => [voided(m, mercerLisinopril), HOLD_TASK.mercerLis] } }), read_all_newest: route(), loses: [] } }
    : {}),
};
