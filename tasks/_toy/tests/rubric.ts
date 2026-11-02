// The toy's rubric items: two judge items on the finish summary, one code item on the note, and one
// UI-plumbing hybrid item (ui_long_question, 0 points).
// states_note is note_on_patient's stated_by item, so a summary that claims a note the state
// lacks is attributed output_gap.
import { hybrid, judged, rubric as item, type Check } from '../../../packages/grader/check.ts';
import { expected } from '../expected.ts';

const summary = (ctx: { final_text: string | null }) => ctx.final_text ?? '';

export const rubric: Check[] = [
  judged({
    id: 'states_note',
    category: 'documentation',
    points: 2,
    traces_to: 'instruction.md:6',
    decisive_ids: [],
    criterion: "The text says that a note was written in the patient's chart.",
    text: summary,
  }),
  judged({
    id: 'summary_names',
    category: 'documentation',
    points: 5,
    traces_to: 'instruction.md:6',
    decisive_ids: [expected.patient],
    criterion: `The text names the signed-in user, ${expected.user_name}, and the patient by full name, ${expected.patient_name}.`,
    text: summary,
  }),
  // UI plumbing, not a check of the toy's work: it exists for the trial page's long-question toggle
  // test (apps/web/e2e/trial-polish.spec.ts F2 and 3.2), which needs a rubric item whose question
  // runs past the page's 160-character clamp; no clinical task has one since T4 split its flag item.
  // Its text always holds the number its pattern reads, so code answers it on every trial: it never
  // calls the judge and needs no cache entry. 0 points, so no score or loss moves.
  hybrid({
    id: 'ui_long_question',
    category: 'documentation',
    points: 0,
    traces_to: 'instruction.md:4',
    decisive_ids: [],
    field: "the number of the patient chart this tool check opens, read from the chart identifier that step 2 of the instruction names, written out so the trial page shows a rubric question long enough to fold behind its toggle",
    text: () => 'Patient pt-0001',
    pattern: /pt-0*(\d+)/,
    truth: 1,
    tolerance: { abs: 0 },
  }),
  item({
    id: 'note_names_user',
    category: 'documentation',
    points: 3,
    method: 'code',
    traces_to: 'instruction.md:5',
    decisive_ids: [],
    fn: (ctx) => {
      const notes = ctx.notes.filter((n) => n.patient === expected.patient);
      return { met: notes.length > 0 && notes.every((n) => n.text.includes(expected.user_name)), evidence: { notes: notes.map((n) => n.id) } };
    },
  }),
];
