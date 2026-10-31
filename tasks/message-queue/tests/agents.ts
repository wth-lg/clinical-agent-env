// T6's spray, output-gap and status-only agents (the null agent is built into the matrix). Each
// must FAIL.
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { oracle } from '../solution/solve.ts';
import { close, finish, inbox, order, PT, RX, type Msg } from '../solution/steps.ts';

// Does everything the oracle does and also fills the two refills RBC-RX-05 holds: Lena Park's
// metformin (amended eGFR 39) and Evelyn Brooks's lisinopril (creatinine rise). Over-action.
export const spray: Script = [
  ...oracle.slice(0, -1),
  { calls: [order(PT.park, RX.met500, 500, 'BID', 90, 1, 'Refill request'), order(PT.brooks, RX.lis20, 20, 'QD', 90, 1, 'Refill request')] },
  { calls: [finish('Cleared the queue.')] },
];

// Every reply, no order, task or closure: state is graded, not prose.
export const output_gap: Script = [...oracle.map((t) => ({ ...t, calls: t.calls.filter((c) => !['order_medication', 'order_service', 'create_task', 'update_inbox_item', 'change_medication'].includes(c.name)) })).filter((t) => t.calls.length > 0)];

// Closes every item and does nothing else.
const ALL: Msg[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const status_only: Script = [{ calls: [inbox] }, { calls: ALL.map((n) => close(n)) }, { calls: [finish('Cleared the messages queue.')] }];
