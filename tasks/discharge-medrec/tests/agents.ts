// T4's spray and output-gap agents (the null agent is built into the matrix). Each must FAIL.
// T4 declares no status-only case: it has no inbox items to close.
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { change, finish, message, MR, note, order, reads, RX, writes } from '../solution/steps.ts';

// Changes everything it can name: stops both beta-blockers' duplicate and swaps the PPI.
export const spray: Script = [
  ...reads,
  { calls: [...writes, change(MR.tart, 'stop', 'Duplicate'), change(MR.atorvastatin, 'stop', 'Review'), order(RX.pantoprazole40, 40, 'QD', 'Discharge list', MR.omeprazole)] },
  { calls: [message()] },
  { calls: [note()] },
  { calls: [finish()] },
];

// A complete, correct note and message and no medication change: state is graded, not prose.
export const output_gap: Script = [...reads, { calls: [message()] }, { calls: [note()] }, { calls: [finish()] }];
