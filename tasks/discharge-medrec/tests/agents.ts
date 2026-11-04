// T4's spray and output-gap agents (the null agent is built into the matrix). Each must FAIL.
// T4 declares no status-only case: its only inbox items are the mid-trial arrivals (events.ts),
// which the policy asks to review, not to close.
import type { Agents, Script } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE } from '../events.ts';
import { change, finish, MR, notesFor, order, reads, RX, script } from '../solution/steps.ts';
import { focusOnly, readAllNewest } from './mutants.ts';

// Changes everything it can name: the oracle's writes, plus a stop of each continued statin and
// aspirin and the inpatient substitute ordered.
export const spray: Script = script({
  extra: [change(MR.kimAspirin, 'stop', 'Review'), change(MR.starkAtorvastatin, 'stop', 'Not taking'), change(MR.robertsRosuvastatin, 'stop', 'Review'), order('kim', RX.pantoprazole40, 40, 'QD', 'Discharge list')],
});

// Complete, correct notes and no medication change or flag: state is graded, not prose. Its notes
// are writes on each chart, so the arrivals come; it never reviews them.
export const output_gap: Script = [...reads(), { calls: notesFor() }, { calls: [finish()] }];

// W5-E, plan-amendment-w5 G3: the two offline agents of the active A lever item (W5-H's matrix
// `lever` cases). focus_only reads the batch's notified potassium from its inbox item and acts on
// it (a hold with a recheck Task), never listing his potassiums again: it must fail
// whitcomb-lisinopril alone, as retrieval (the silent sibling never shown). read_all_newest lists
// his potassiums again after the arrival, the route RBC-TOC-02 §2 and §7 name, and acts on the
// newest (the oracle's own route): it must pass. focus_only is also the mutant
// whitcomb-a1_focus_only (tests/mutants.ts).
export const lever: Agents['lever'] = ACTIVE.includes('whitcomb-a1') ? { A: { focus_only: focusOnly(), read_all_newest: readAllNewest(), loses: [] } } : {};
