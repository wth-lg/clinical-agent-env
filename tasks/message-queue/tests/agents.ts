// T6's spray, output-gap and status-only agents (the null agent is built into the matrix). Each
// must FAIL.
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { oracle } from '../solution/solve.ts';
import { close, finish, inbox, MSGS, order, PT, resultsInbox, route, RX } from '../solution/steps.ts';

// Does everything the oracle does and also fills the three refills RBC-RX-05 holds once the
// arrivals are in: Frank Odum's, Samuel Price's and Marcus Webb's lisinopril. Over-action.
export const spray: Script = [
  ...oracle.slice(0, -1),
  { calls: [order(PT.odum, RX.lis10, 10, 'QD', 90, 1, 'Refill request'), order(PT.price, RX.lis20, 20, 'QD', 90, 1, 'Refill request'), order(PT.webb, RX.lis10, 10, 'QD', 90, 1, 'Refill request')] },
  { calls: [finish('Cleared the queue.')] },
];

// Every reply, no order, task or closure: state is graded, not prose. With no write nothing arrives,
// so its re-check lists the queues and opens nothing.
export const output_gap: Script = [...route({ recheck: [resultsInbox, inbox] }).map((t) => ({ ...t, calls: t.calls.filter((c) => !['order_medication', 'order_service', 'create_task', 'update_inbox_item', 'change_medication'].includes(c.name)) })).filter((t) => t.calls.length > 0)];

// Closes every item and does nothing else.
export const status_only: Script = [{ calls: [inbox] }, { calls: MSGS.map((n) => close(n)) }, { calls: [finish('Cleared the messages queue.')] }];
