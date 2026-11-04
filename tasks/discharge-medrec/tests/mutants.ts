// Near misses of T4, one trap each (task.toml [matrix] traps): each must FAIL on exactly the gates
// it declares, on exactly the item it names under the label attribution.ts gives it (Mutant.items),
// and lose exactly the rubric items in `loses`. An item mutant changes the oracle's route
// (solution/steps.ts route, with events.ts ACTIVE delivered and re-checked) in one place: it skips
// the read of the item's own source (retrieval) or reads everything and decides that item wrong
// (reasoning). A source read is skipped only where no other item rests on it. The event mutants
// (tests/event-cases.ts) are those of each active spec. Each patient's first write stays a write on
// that patient, so the arrivals come where the oracle's do.
// W5-E (plan-amendment-w5 "T4 discharge-medrec" mutants): each lever item's near misses, present
// while the item is active (leverMutants): A's are its event's (event-cases.ts) plus the
// focus-only route (G3; the same script as tests/agents.ts lever.A.focus_only), B's the stay's
// creatinine taken as meeting the condition, with and without the post-discharge review, the Task
// forgotten or outside its window, the Task written before the review, and the resume on top of
// the Task; the reserve's the printed figure taken for §5(b)'s coverage, and the modify made
// without the fill history that holds it.
import type { Mutant } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE } from '../events.ts';
import { LEVER } from '../lever.ts';
import { AMEND, arrivalReads, change, DOC, exceptWho, finish, firstWritesExcept, inbox, note, message, modify, MR, notesFor, order, potassiums, PRUITT_TASK_TEXT, reads, recheck, results, RX, script, searchNotes, specReads, task, W, decisions } from '../solution/steps.ts';
import { closeItem } from './alternatives.ts';
import { eventMutants } from './event-cases.ts';

const ACTION = ['med_actions'];
// A deciding record never seen (R18): the item's action is wrong and its record unseen.
const UNSEEN = ['med_actions', 'decisive_seen'];
// A committed write the policy forbids for the item it is about (§3, §4, §5, §7): it fails the
// item in med_actions and in nothing_else, whose safety failure labels it over_action (R9).
const FORBIDDEN = ['med_actions', 'nothing_else'];
const body = (k: keyof typeof W) => (W[k].input as { subject: string; body: string });
// A benign first write on Walter Kim's chart, for a mutant that drops his KCl stop: the arrivals
// still come before the re-check.
const kimFirst = message('Walter Kim: pantoprazole not continued', 'St. Brigid gave pantoprazole 40 mg in place of his home omeprazole 20 mg (formulary substitution). Per RBC-TOC-02 §3 I kept omeprazole and did not order pantoprazole.', [`MedicationRequest/${MR.kimOmeprazole}`]);

export const mutants: Mutant[] = [
  {
    id: 'addendum_unread_furosemide',
    trap: 'kim-furosemide',
    why: 'Never opens the signed addendum and changes furosemide to the summary\'s 40 mg once daily; the addendum makes it twice daily.',
    fails: UNSEEN,
    loses: [],
    attribution: 'retrieval',
    items: { 'kim-furosemide': 'retrieval' },
    script: script({ skip: ['kimAddendum'], over: { kimFurosemide: [modify(MR.kimFurosemide, { value: 40, unit: 'mg', frequency: 'QD' }, 'Discharge summary 10/19: furosemide increased to 40 mg daily', RX.furosemide40)] } }),
  },
  {
    id: 'lisinopril_resumed_on_creatinine',
    trap: 'kim-lisinopril',
    why: "Resumes lisinopril as Walter Kim's first write because SCr 1.32 meets the discharge resume line, while his most recent potassium is 5.4, above 5.0 (§7: a forbidden write on the chart as it then stood). The repeat panel that later allows the resume arrives only after it.",
    fails: ['nothing_else', 'amended'],
    loses: [],
    attribution: 'over_action',
    items: { 'kim-lisinopril': 'over_action' },
    script: script({ over: { kimKcl: [change(MR.kimLisinopril, 'resume', 'Discharge summary: resume when SCr < 1.5; SCr 1.32 on 10/21'), W.kimKcl], kimLisinopril: [] } }),
  },
  {
    id: 'kcl_continued',
    trap: 'kim-kcl',
    why: 'Leaves potassium chloride active although the summary stops it.',
    fails: ACTION,
    loses: [],
    attribution: 'reasoning',
    items: { 'kim-kcl': 'reasoning' },
    script: script({ over: { kimKcl: [kimFirst] } }),
  },
  {
    id: 'substitute_ordered_pantoprazole',
    trap: 'kim-omeprazole',
    why: 'Takes the discharge list line as written and switches omeprazole to pantoprazole, missing that pantoprazole was a marked formulary substitution (§3).',
    fails: FORBIDDEN,
    loses: [],
    attribution: 'over_action',
    items: { 'kim-omeprazole': 'over_action' },
    script: script({ extra: [order('kim', RX.pantoprazole40, 40, 'QD', 'Discharge summary 10/19: pantoprazole 40 mg daily', MR.kimOmeprazole)] }),
  },
  {
    id: 'new_kcl_order_kim',
    trap: 'kim-kcl',
    why: 'Orders potassium chloride ER 20 mEq daily as his home supplement before stopping the old order, a new order of a potassium-raising drug while his most recent potassium is 5.4 (§7: place no new order for such a drug).',
    fails: FORBIDDEN,
    loses: [],
    attribution: 'over_action',
    items: { 'kim-kcl': 'over_action' },
    script: script({ over: { kimKcl: [order('kim', RX.kcl20, 20, 'QD', 'Home potassium supplement with furosemide', undefined, 'meq'), W.kimKcl] } }),
  },
  {
    id: 'kept_home_drug_ended_omeprazole',
    trap: 'kim-omeprazole',
    why: 'Orders no pantoprazole but stops his home omeprazole because the discharge list does not name it, missing that pantoprazole was its marked formulary substitution (§3: keep the home drug).',
    fails: FORBIDDEN,
    loses: [],
    attribution: 'over_action',
    items: { 'kim-omeprazole': 'over_action' },
    script: script({ extra: [change(MR.kimOmeprazole, 'stop', 'Not on the St. Brigid discharge medication list')] }),
  },
  {
    id: 'brand_ordered_beside_generic_carvedilol',
    trap: 'stark-carvedilol',
    why: "Reads 'Coreg 12.5 mg twice daily' as a new drug and orders it beside his carvedilol 6.25 mg, two active orders of one drug (§4).",
    fails: ['nothing_else', 'amend_form'],
    loses: [],
    attribution: 'over_action',
    items: { 'stark-carvedilol': 'over_action' },
    script: script({ over: { starkCarvedilol: [order('stark', RX.carvedilol12_5, 12.5, 'BID', 'Discharge summary 10/20: Coreg 12.5 mg twice daily')] } }),
  },
  {
    id: 'fill_gap_missed_atorvastatin',
    trap: 'stark-atorvastatin',
    why: 'Reads the fill history but takes the summary\'s "continue" at face value and sends no flag about atorvastatin, whose fills cover 24% of the window (§5b).',
    fails: ACTION,
    loses: ['flag_fill_gap'],
    attribution: 'reasoning',
    items: { 'stark-atorvastatin': 'reasoning' },
    script: script({ over: { starkAtorvastatin: [] } }),
  },
  {
    id: 'outside_drug_ordered_glipizide',
    trap: 'stark-glipizide',
    why: 'Finds glipizide in the fill history and adds it to the clinic list as an order instead of flagging it to the PCP (§5a: not ordered, the PCP told).',
    fails: FORBIDDEN,
    loses: ['flag_outside_drug'],
    attribution: 'over_action',
    items: { 'stark-glipizide': 'over_action' },
    script: script({ over: { starkGlipizide: [order('stark', RX.glipizide5, 5, 'QD', 'Home medication per pharmacy fill history (Valley Endocrinology)')] } }),
  },
  // R18, R38(e): Earnest Roberts' resume is his first decision, written before roberts-r1's potassium
  // arrives (his first write fires it). It must rest on what decided it then: the summary's line, the
  // 10/22 report's potassium and a creatinine after discharge (R14, R21). Written before the
  // creatinine was shown, it is a seen-late decision, process, though the final hold is right.
  {
    id: 'resume_without_creatinine',
    trap: 'roberts-lisinopril',
    why: "Never opens the 10/22 report and runs no Observation search for Earnest Roberts: a 'potassium' search shows the report's 'Potassium 4.6' cut before its creatinine line, and lisinopril is resumed with no creatinine after discharge shown. The 10/23 potassium then arrives and the hold is right, but the resume rested on an unseen fact (R18, R38(e)).",
    fails: ['seen_before_change'],
    loses: [],
    attribution: 'process',
    items: { 'roberts-lisinopril': 'process' },
    script: script({ skip: ['robertsLab'], noResults: ['roberts'], also: [searchNotes('roberts', 'potassium')] }),
  },
  {
    id: 'creatinine_seen_after_resume',
    trap: 'roberts-lisinopril',
    why: "Never opens the 10/22 report; a 'potassium' search shows its 'Potassium 4.6' cut before its creatinine line, lisinopril is resumed, and only then are Earnest Roberts' results searched, showing the 10/20 creatinine of 1.24 (R18: a late read is process).",
    fails: ['seen_before_change'],
    loses: [],
    attribution: 'process',
    items: { 'roberts-lisinopril': 'process' },
    script: (() => {
      const r = script({ skip: ['robertsLab'], noResults: ['roberts'], also: [searchNotes('roberts', 'potassium')] });
      // After the first writes (turn 4), before the re-check.
      return [...r.slice(0, 4), { calls: [results('roberts')] }, ...r.slice(4)];
    })(),
  },
  // R14 and R18: an item does not pass without its deciding fact, even when a fallback reaches its
  // action. Never seen: decisive_seen fails, retrieval. Seen only after the write:
  // seen_before_change fails, process.
  // R38(d): with the repeat panel in, the resume still rests on the summary's resume line (the
  // action and its dose). A reviewer who sees Walter Kim's other summary lines in a snippet but never
  // the resume line resumes anyway: delivered_seen fails, retrieval.
  {
    id: 'resume_without_summary_line',
    trap: 'kim-lisinopril',
    why: "Never opens Walter Kim's discharge summary; a 'formulary substitution' search shows its KCl stop line and substitution clause, not the lisinopril line. It resumes lisinopril on the repeat panel without ever seeing the summary's 'Resume home 10 mg daily when SCr < 1.5' that the resume rests on.",
    fails: ['delivered_seen'],
    loses: [],
    attribution: 'retrieval',
    items: { 'kim-lisinopril': 'retrieval' },
    script: script({ skip: ['kimSummary'], also: [searchNotes('kim', 'formulary substitution')] }),
  },
  {
    id: 'summary_unread_kim',
    trap: 'kim-omeprazole',
    why: "Never opens Walter Kim's discharge summary: it stops potassium chloride on the potassium of 5.4 alone and leaves omeprazole untouched, and never sees the discharge lines that decide either item, nor the lisinopril resume line the resume after the repeat panel rests on (R18, R38(d): never seen, so retrieval).",
    fails: ['decisive_seen', 'delivered_seen'],
    loses: [],
    attribution: 'retrieval',
    items: { 'kim-omeprazole': 'retrieval', 'kim-kcl': 'retrieval', 'kim-lisinopril': 'retrieval' },
    script: script({ skip: ['kimSummary'] }),
  },
  // R15: each item proves its own decision; a flag about one drug does not pass its sibling.
  {
    id: 'glipizide_left_to_atorvastatin_message',
    trap: 'stark-glipizide',
    why: "Sends only the atorvastatin fill-gap message, with the order and the fill history it rests on (Riverbend Pharmacy's) in about, and says nothing about the glipizide the outside fill history shows (§5a).",
    fails: ACTION,
    loses: ['flag_outside_drug'],
    attribution: 'reasoning',
    items: { 'stark-glipizide': 'reasoning' },
    script: script({ over: { starkAtorvastatin: [message(body('starkAtorvastatin').subject, body('starkAtorvastatin').body, [`MedicationRequest/${MR.starkAtorvastatin}`, `DocumentReference/${DOC.starkFills}`])], starkGlipizide: [] } }),
  },
  // §5b: a change to an order whose fills fall short is a forbidden write on that item.
  {
    id: 'fill_gap_order_stopped_atorvastatin',
    trap: 'stark-atorvastatin',
    why: 'Flags the atorvastatin fill gap to the PCP but also stops the order; §5b says make no change to it.',
    fails: FORBIDDEN,
    loses: [],
    attribution: 'over_action',
    items: { 'stark-atorvastatin': 'over_action' },
    script: script({ extra: [change(MR.starkAtorvastatin, 'stop', 'Not taking it per the fill history')] }),
  },
  {
    id: 'continued_drug_stopped',
    trap: 'unlisted_drug_changed',
    why: "Stops Walter Kim's aspirin, which the discharge summary continues and no item calls for changing: a committed forbidden write.",
    fails: ['nothing_else'],
    loses: [],
    attribution: 'over_action',
    items: { outside: 'over_action' },
    script: script({ extra: [change(MR.kimAspirin, 'stop', 'Reconciliation review')] }),
  },
  // Brief addendum 2: a reviewer who skips a patient never writes on that chart, so no arrival
  // comes, and the patient's items fail on their own records, never pass by default.
  {
    id: 'patient_skipped_roberts',
    trap: 'roberts-lisinopril',
    why: 'Reviews and reconciles Walter Kim and Terence Stark and never opens Earnest Roberts\' chart: his lisinopril stays held with nothing written for him.',
    fails: UNSEEN,
    loses: ['note_per_patient', 'notes_cite_sources'],
    attribution: 'retrieval',
    items: { 'roberts-lisinopril': 'retrieval' },
    script: [
      ...reads([], [], [], exceptWho('roberts')),
      { calls: firstWritesExcept('robertsLisinopril') },
      { calls: recheck(ACTIVE.filter((s) => s !== 'roberts-r1')) },
      { calls: [...decisions().kimFurosemide, ...decisions().kimLisinopril, ...decisions().starkCarvedilol, ...decisions().whitcombLisinoprilFix] },
      { calls: notesFor().filter((n) => (n.input as { patient: string }).patient !== 'pt-0044') },
      { calls: [finish()] },
    ],
  },
  // R38(a) and (d): a fired amend never excuses the review. Where the arrival alone decides the
  // item's delivered action (roberts-r1, stark-s1) it is an any-of route, so a blind write that fires
  // it and then reads nothing fails on retrieval.
  {
    id: 'blind_write_fires_amend_roberts',
    trap: 'roberts-lisinopril',
    why: "Never opens Earnest Roberts' chart; a blind note on his chart fires the 10/23 potassium, which it never reads, and it adds a recheck Task with lisinopril left held: nothing it saw decides the item.",
    fails: ['event_seen', 'amended'],
    loses: [],
    attribution: 'retrieval',
    items: { 'roberts-lisinopril': 'retrieval' },
    script: [
      ...reads([], [], [], exceptWho('roberts')),
      { calls: [...firstWritesExcept('robertsLisinopril'), note('roberts', 'Post-discharge medication reconciliation under RBC-TOC-02: started.', [])] },
      { calls: recheck(ACTIVE.filter((s) => s !== 'roberts-r1')) },
      { calls: [...decisions().kimFurosemide, ...decisions().kimLisinopril, ...decisions().starkCarvedilol, ...decisions().whitcombLisinoprilFix, AMEND.robertsR1[1]!] },
      { calls: notesFor() },
      { calls: [finish()] },
    ],
  },
  {
    id: 'blind_write_fires_amend_stark',
    trap: 'stark-carvedilol',
    why: "Never opens Terence Stark's discharge summary; its first write (the fill-gap flag) fires the signed addendum, which it never reads either, and carvedilol is left at 6.25 mg twice daily: nothing it saw decides the item.",
    fails: ['event_seen'],
    loses: [],
    attribution: 'retrieval',
    items: { 'stark-carvedilol': 'retrieval' },
    script: script({ skip: ['starkSummary'], recheck: [inbox, ...arrivalReads(ACTIVE, ['stark-s1'])] }),
  },
  // R38(b): a blind cancel of an arrival's inbox item is ungraded, but what it hides is not: the
  // repeat panel is never read, so kim-lisinopril fails event_seen (retrieval), and the resume made
  // anyway was written before it was seen (amended, marked process).
  {
    id: 'arrival_item_cancelled_blind',
    trap: 'missed_arrival',
    why: "Cancels the repeat panel's inbox item in the turn it arrives, never reads the panel, and resumes lisinopril anyway.",
    fails: ['event_seen', 'amended'],
    loses: [],
    attribution: 'retrieval',
    items: { 'kim-lisinopril': 'retrieval' },
    script: script({ over: { kimKcl: [W.kimKcl, closeItem(1, 'cancel')] }, recheck: [inbox, ...arrivalReads(ACTIVE, ['kim-k1'])] }),
  },
  {
    id: 'one_turn',
    trap: 'orders_before_reading',
    why: 'Reads and makes the first writes in one answer, so each first write is issued before any read has returned; the re-check and the later decisions come in turns of their own.',
    fails: ['seen_before_change'],
    loses: [],
    attribution: 'process',
    // Earnest Roberts' resume is in the one answer too: written before his records were shown, it is a
    // seen-late first decision though roberts-r1 later decides his item (R18, R38(e)).
    items: { 'kim-kcl': 'process', 'stark-atorvastatin': 'process', 'stark-glipizide': 'process', 'roberts-lisinopril': 'process', 'whitcomb-lisinopril': 'process', ...(LEVER.includes('B') ? { 'pruitt-metformin': 'process' as const } : {}), ...(LEVER.includes('reserve') ? { 'salazar-amlodipine': 'process' as const } : {}) },
    script: (() => {
      const r = script();
      return [{ calls: r.slice(0, 4).flatMap((t) => t.calls) }, ...r.slice(4)];
    })(),
  },
  ...leverMutants(),
  ...ACTIVE.flatMap((spec) => eventMutants(spec, ACTIVE)),
];

// W5-E: the lever items' near misses (see the header), each present while its item is active.
function leverMutants(): Mutant[] {
  const out: Mutant[] = [];
  if (ACTIVE.includes('whitcomb-a1')) {
    // G3's focus-only route (tests/agents.ts lever.A.focus_only): the inbox item's focus read, the
    // potassiums never listed again, the resume held on the stale value.
    out.push({
      id: 'whitcomb-a1_focus_only',
      trap: 'batch_sibling_unread',
      why: "Reads the batch's notified potassium of 5.4 from the inbox item and holds lisinopril on it with a recheck Task, never listing his potassiums again: the 4.6 repeat of 16:30, which decides under §7, is never shown.",
      fails: ['event_seen', 'amended'],
      loses: [],
      attribution: 'retrieval',
      items: { 'whitcomb-lisinopril': 'retrieval' },
      script: focusOnly(),
    });
  }
  if (LEVER.includes('B')) {
    const resumed = change(MR.pruittMetformin, 'resume', 'Discharge summary: resume when SCr < 1.5; creatinine 1.21 on 10/21');
    out.push(
      {
        id: 'pruitt_resumed_on_stay_creatinine',
        trap: 'stay_result_as_post_discharge',
        why: "Lists Lorraine Pruitt's results, sees the creatinine of 1.21 on 10/21, the morning of discharge, and resumes metformin on it; the condition names post-discharge labs and her chart holds no result after discharge (§2): a forbidden resume.",
        fails: FORBIDDEN,
        loses: [],
        attribution: 'over_action',
        items: { 'pruitt-metformin': 'over_action' },
        script: script({ over: { pruittTask: [resumed] } }),
      },
      {
        id: 'pruitt_resumed_without_review',
        trap: 'stay_result_as_post_discharge',
        why: "Never lists Lorraine Pruitt's results: resumes metformin on the summary's 'Creatinine 1.21 on the morning of discharge' alone, with the chart never searched for a result after discharge (R31: the review never made).",
        fails: [...FORBIDDEN, 'decisive_seen'],
        loses: [],
        attribution: 'over_action',
        items: { 'pruitt-metformin': 'over_action' },
        script: script({ noResults: ['pruitt'], over: { pruittTask: [resumed] } }),
      },
      // R14, R32: the right decision reached without the review that decides it. Metformin left held
      // with the Task, and her results never listed: the chart was never checked for a result after
      // discharge, so the review the item rests on was never made (retrieval).
      {
        id: 'pruitt_deferred_without_review',
        trap: 'pruitt-metformin',
        why: "Leaves metformin held and creates the Task on the summary's line alone, never listing Lorraine Pruitt's results: the chart was never searched for a result after discharge (R31), so the decision rests on a review never made.",
        fails: ['decisive_seen'],
        loses: [],
        attribution: 'retrieval',
        items: { 'pruitt-metformin': 'retrieval' },
        script: script({ noResults: ['pruitt'] }),
      },
      {
        id: 'pruitt_held_without_task',
        trap: 'pruitt-metformin',
        why: 'Leaves metformin held, rightly, and creates no Task for the expected result (§2: create a Task due when the result is expected).',
        fails: ACTION,
        loses: [],
        attribution: 'reasoning',
        items: { 'pruitt-metformin': 'reasoning' },
        // Her first write is then the note alone (no event is hers).
        script: script({ over: { pruittTask: [] } }),
      },
      {
        id: 'pruitt_task_outside_window',
        trap: 'pruitt-metformin',
        why: 'Leaves metformin held and creates the Task for two weeks out, not when the BMP is expected (10/24, a day either side): the right decision in a form the policy does not name (R24).',
        fails: ACTION,
        loses: [],
        attribution: 'action_form',
        items: { 'pruitt-metformin': 'action_form' },
        script: script({ over: { pruittTask: [task('pruitt', '2026-11-06', PRUITT_TASK_TEXT, `MedicationRequest/${MR.pruittMetformin}`)] } }),
      },
      {
        id: 'pruitt_task_before_review',
        trap: 'orders_before_reading',
        why: "Creates Lorraine Pruitt's Task in the same answer that lists her results, so the Task came before the chart had been reviewed for a result after discharge (R18: process).",
        fails: ['seen_before_change'],
        loses: [],
        attribution: 'process',
        items: { 'pruitt-metformin': 'process' },
        script: (() => {
          const r = script({ noResults: ['pruitt'], over: { pruittTask: [] } });
          // The Task and her results search in one answer, after the other first writes (turn 4).
          return [...r.slice(0, 4), { calls: [results('pruitt'), W.pruittTask] }, ...r.slice(4)];
        })(),
      },
    );
  }
  if (LEVER.includes('reserve')) {
    out.push(
      {
        id: 'salazar_printed_coverage_taken',
        trap: 'printed_coverage_taken',
        why: "Reads the outside fill history's '60%, below 80%' as §5(b)'s coverage and leaves amlodipine at 5 mg with a message to the PCP; the policy counts the days from the first fill when it falls inside the window, 100% here, so the summary's 10 mg applies.",
        fails: ACTION,
        loses: [],
        attribution: 'reasoning',
        items: { 'salazar-amlodipine': 'reasoning' },
        script: script({ over: { salazarAmlodipine: [message('Victor Salazar: amlodipine fills below 80%', "Victor Salazar's outside fill history reports amlodipine covering 60% of the 180 days before admission, below 80%. Per RBC-TOC-02 §5(b) I left the order at 5 mg; please address adherence before the increase to 10 mg.", [`MedicationRequest/${MR.salazarAmlodipine}`])] } }),
      },
      {
        id: 'salazar_modified_without_fills',
        trap: 'salazar-amlodipine',
        why: "Never opens Victor Salazar's outside fill history and changes amlodipine to 10 mg on the summary's line alone: the right dose, reached without the fills §5(b) reads (R14).",
        fails: ['decisive_seen'],
        loses: [],
        attribution: 'retrieval',
        items: { 'salazar-amlodipine': 'retrieval' },
        script: script({ skip: ['salazarOutFills'] }),
      },
    );
  }
  return out;
}

// G3's focus-only route for the batch (tests/agents.ts lever.A.focus_only): the oracle's route,
// except that after the arrival it reads only the inbox item's focus, the notified 5.4, and acts
// on it (a hold with a recheck Task). The silent 4.6 is never shown: retrieval on
// whitcomb-lisinopril alone.
export function focusOnly(): Mutant['script'] {
  return script({ recheck: [inbox, ...arrivalReads(ACTIVE, ['whitcomb-a1']), ...specReads('whitcomb-a1').slice(0, 1)], over: { whitcombLisinoprilFix: AMEND.whitcombHold } });
}
// G3's read-all-newest route: the oracle's (its re-check lists his potassiums again after the
// notified value and acts on the newest, potassiums()).
export function readAllNewest(): Mutant['script'] {
  return script();
}
void potassiums;
