// T4's spray and output-gap agents (the null agent is built into the matrix). Each must FAIL.
// T4 declares no status-only case: its only inbox items are the mid-trial arrivals (events.ts),
// which the policy asks to review, not to close.
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { change, finish, MR, notesFor, order, reads, RX, script } from '../solution/steps.ts';

// Changes everything it can name: the oracle's writes, plus a stop of each continued statin and
// aspirin and the inpatient substitute ordered.
export const spray: Script = script({
  extra: [change(MR.kimAspirin, 'stop', 'Review'), change(MR.starkAtorvastatin, 'stop', 'Not taking'), change(MR.robertsRosuvastatin, 'stop', 'Review'), order('kim', RX.pantoprazole40, 40, 'QD', 'Discharge list')],
});

// Complete, correct notes and no medication change or flag: state is graded, not prose. Its notes
// are writes on each chart, so the arrivals come; it never reviews them.
export const output_gap: Script = [...reads(), { calls: notesFor() }, { calls: [finish()] }];
