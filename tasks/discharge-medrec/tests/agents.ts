// T4's spray and output-gap agents (the null agent is built into the matrix). Each must FAIL.
// T4 declares no status-only case: it has no inbox items to close.
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { change, finish, MR, notes, order, reads, RX, script } from '../solution/steps.ts';

// Changes everything it can name: the oracle's writes, plus a stop of each continued statin and
// aspirin and the inpatient substitutes ordered.
export const spray: Script = script({
  extra: [change(MR.kimAspirin, 'stop', 'Review'), change(MR.starkAtorvastatin, 'stop', 'Not taking'), order('kim', RX.pantoprazole40, 40, 'QD', 'Discharge list'), order('roberts', RX.atorvastatin20, 20, 'QHS', 'Discharge list')],
});

// Complete, correct notes and no medication change or flag: state is graded, not prose.
export const output_gap: Script = [...reads(), { calls: notes() }, { calls: [finish()] }];
