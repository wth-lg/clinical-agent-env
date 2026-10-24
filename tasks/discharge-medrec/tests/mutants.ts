// Near misses of T4, one trap each (task.toml [matrix] traps; design "T4" prior): each must FAIL
// on exactly the gates it declares and lose exactly the rubric items in `loses`.
import type { Mutant } from '../../../packages/grader/matrix/types.ts';
import { addendum, allMeds, change, findPatient, finish, furosemideUp, kclStop, lisinoprilResume, message, MR, note, ORACLE_NOTE, order, policy, read, reads, RX, scr, spironolactone, summaries, summary } from '../solution/steps.ts';

const changes = (drop: string, add = '') => ({ changes: ORACLE_NOTE.changes.split('. ').filter((s) => !s.toLowerCase().includes(drop)).join('. ') + add });

// `loses` is spelled out in the type until the matrix's Mutant declares it (builder-49).
export const mutants: Array<Mutant & { loses: readonly string[] }> = [
  {
    id: 'furosemide_unchanged',
    trap: 'furosemide_dose',
    why: 'Reads the summary and leaves furosemide at 20 mg daily.',
    fails: ['furosemide_40'],
    loses: ['note_lists_changes'],
    script: [...reads, { calls: [spironolactone, kclStop, lisinoprilResume] }, { calls: [message()] }, { calls: [note(changes('furosemide'))] }, { calls: [finish()] }],
  },
  {
    id: 'spironolactone_12_5',
    trap: 'addendum_missed',
    why: 'Never opens the signed addendum and starts spironolactone at the summary\'s 12.5 mg (half a 25 mg tablet).',
    fails: ['spironolactone_25', 'sources_before_orders'],
    loses: ['note_lists_changes', 'note_cites_sources'],
    script: [
      { calls: [findPatient] },
      { calls: [allMeds, summaries, policy] },
      { calls: [summary, scr] },
      { calls: [furosemideUp, order(RX.spironolactone25, 12.5, 'QD', 'Discharge summary: spironolactone 12.5 mg daily'), kclStop, lisinoprilResume] },
      { calls: [message()] },
      { calls: [note({ sources: 'Sources: St. Brigid Regional discharge summary of 10/19/2026; creatinine 1.32 mg/dL on 10/21/2026.', changes: ORACLE_NOTE.changes.replace("Spironolactone 25 mg daily started (signed addendum, which corrects the summary's 12.5 mg)", 'Spironolactone 12.5 mg daily started (discharge summary)') }, ['DocumentReference/doc-t4-dc-1019', 'Observation/obs-t4-scr-1021'])] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'lisinopril_task',
    trap: 'conditional_resume',
    why: 'Treats the resume condition as unmet and creates a Task to recheck creatinine, although the 10/21 SCr of 1.32 already satisfies it.',
    fails: ['lisinopril_resumed'],
    loses: ['note_lists_changes'],
    script: [
      ...reads,
      { calls: [furosemideUp, spironolactone, kclStop, { name: 'create_task', input: { patient: 'pt-0005', owner: 'Practitioner/pr-okafor', due: '2026-10-28', priority: 'routine', description: 'Recheck SCr; resume lisinopril 10 mg daily if below 1.5' } }] },
      { calls: [message()] },
      { calls: [note(changes('lisinopril', '. Lisinopril still held; task created to recheck creatinine.'))] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'kcl_kept',
    trap: 'kcl_continued',
    why: 'Leaves potassium chloride active beside the new spironolactone.',
    fails: ['kcl_stopped'],
    loses: ['note_lists_changes'],
    script: [...reads, { calls: [furosemideUp, spironolactone, lisinoprilResume] }, { calls: [message()] }, { calls: [note(changes('potassium'))] }, { calls: [finish()] }],
  },
  {
    id: 'xl_ordered',
    trap: 'alias_duplicated',
    why: 'Reads "metoprolol XL 50 mg" as a new drug and orders metoprolol succinate ER 50 mg daily beside the one he has.',
    fails: ['others_unchanged'],
    loses: [],
    script: [...reads, { calls: [furosemideUp, spironolactone, kclStop, lisinoprilResume, order(RX.metoprololSucc50, 50, 'QD', 'Discharge: metoprolol XL 50 mg daily')] }, { calls: [message()] }, { calls: [note()] }, { calls: [finish()] }],
  },
  {
    id: 'tartrate_stopped',
    trap: 'tartrate_stopped',
    why: 'Stops metoprolol tartrate as a duplicate instead of leaving it for the PCP, then messages about it.',
    fails: ['others_unchanged'],
    loses: ['tartrate_stopped'],
    script: [...reads, { calls: [furosemideUp, spironolactone, kclStop, lisinoprilResume, change(MR.tart, 'stop', 'Duplicate beta-blocker')] }, { calls: [message()] }, { calls: [note()] }, { calls: [finish()] }],
  },
  {
    id: 'pantoprazole_ordered',
    trap: 'substitute_ordered',
    why: 'Follows the discharge list literally: orders pantoprazole 40 mg in place of omeprazole.',
    fails: ['omeprazole_kept'],
    loses: [],
    script: [...reads, { calls: [furosemideUp, spironolactone, kclStop, lisinoprilResume, order(RX.pantoprazole40, 40, 'QD', 'Discharge: pantoprazole 40 mg daily', MR.omeprazole)] }, { calls: [message()] }, { calls: [note()] }, { calls: [finish()] }],
  },
  {
    id: 'no_pcp_message',
    trap: 'pcp_not_messaged',
    why: 'Makes every change right and mentions the tartrate only in the note, without messaging the PCP.',
    fails: ['pcp_message'],
    loses: ['message_explains_duplicate'],
    script: [...reads, { calls: [furosemideUp, spironolactone, kclStop, lisinoprilResume] }, { calls: [note()] }, { calls: [finish()] }],
  },
  {
    id: 'resume_before_lab',
    trap: 'resume_before_lab',
    why: 'Resumes lisinopril before looking at any post-discharge creatinine: the right order, but the condition was not checked first.',
    fails: ['sources_before_orders'],
    loses: [],
    script: [
      { calls: [findPatient] },
      { calls: [allMeds, summaries, policy] },
      { calls: [summary, addendum] },
      { calls: [furosemideUp, spironolactone, kclStop, lisinoprilResume] },
      { calls: [scr] },
      { calls: [message()] },
      { calls: [note()] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'old_summary',
    trap: 'old_summary',
    why: 'Reconciles against the 2025 discharge summary: furosemide stays at 20 mg and potassium chloride stays on.',
    fails: ['furosemide_40', 'kcl_stopped'],
    loses: ['note_lists_changes', 'used_2025_summary'],
    script: [
      ...reads,
      { calls: [read('DocumentReference', 'doc-t4-dc-2025')] },
      { calls: [spironolactone, lisinoprilResume] },
      { calls: [message()] },
      {
        calls: [
          note({
            changes: "Per the 2025 discharge summary, furosemide stays at 20 mg daily and potassium chloride 20 mEq daily continues. Spironolactone 25 mg daily started (signed addendum, which corrects the summary's 12.5 mg). Lisinopril 10 mg daily resumed: SCr 1.32 on 10/21.",
          }, ['DocumentReference/doc-t4-dc-2025', 'DocumentReference/doc-t4-dc-1019-add', 'Observation/obs-t4-scr-1021']),
        ],
      },
      { calls: [finish()] },
    ],
  },
];
