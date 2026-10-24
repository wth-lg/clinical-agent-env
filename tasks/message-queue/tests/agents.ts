// T6's spray, output-gap and status-only agents (the null agent is built into the matrix). Each
// must FAIL.
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { oracle } from '../solution/solve.ts';
import { close, DONE, finish, inbox, PT, refill, RX } from '../solution/steps.ts';


// Does everything the oracle does and also fills every request it was asked for: the
// atorvastatin refill and the amoxicillin-clavulanate. Over-action.
export const spray: Script = [
  ...oracle.slice(0, -1),
  { calls: [refill(PT.odum, RX.atorvastatin40, 40, 'QHS', 90, 1, 'Refill request'), refill(PT.park, RX.amoxClav, 875, 'BID', 7, 0, 'Sinusitis per NP Reyes')] },
  { calls: [finish(DONE)] },
];

// Every message and reply, no order, task, allergy or closure: state is graded, not prose.
export const output_gap: Script = [...oracle.map((t) => ({ ...t, calls: t.calls.filter((c) => !['order_medication', 'order_service', 'create_task', 'record_allergy', 'update_inbox_item'].includes(c.name)) })).filter((t) => t.calls.length > 0)];

// Closes every item and does nothing else.
export const status_only: Script = [{ calls: [inbox] }, { calls: [1, 2, 3, 4, 5, 6].map((n) => close(n)) }, { calls: [finish('Cleared the messages queue.')] }];

