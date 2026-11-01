// Other correct solutions of T4, one per item and one for the nothing_else gate: each must PASS
// and lose exactly the rubric items it declares. Each changes the oracle's route (solution/steps.ts
// route, events.ts ACTIVE delivered and re-checked) in one place, the way another clinician would
// reach the same end state, so the gates are shown to read the state and not the oracle's form. The
// event alternatives (tests/event-cases.ts) are those of each active spec; two more re-check the
// queue another complete way (R27).
import type { Alternative } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE } from '../events.ts';
import { arrivalRead, change, DOC, message, modify, MR, order, RX, script, searchNotes, SPECS_READ, task, W } from '../solution/steps.ts';
import { eventAlternatives } from './event-cases.ts';

const reads = SPECS_READ(ACTIVE).map(arrivalRead);
const page = (count: number, offset: number) => ({ name: 'list_inbox', input: { queue: 'results', status: 'requested', count, offset } });

export const alternatives: Alternative[] = [
  {
    id: 'furosemide_by_new_order',
    why: 'Places a new furosemide 40 mg twice-daily order that replaces the old one, instead of modify (§6: stop it and replace it).',
    script: script({ over: { kimFurosemide: [order('kim', RX.furosemide40, 40, 'BID', 'Signed discharge addendum 10/19: furosemide 40 mg twice daily', MR.kimFurosemide)] } }),
  },
  {
    id: 'kcl_completed',
    why: 'Completes the potassium chloride order instead of stopping it.',
    script: script({ over: { kimKcl: [change(MR.kimKcl, 'complete', 'St. Brigid discharge summary 10/19: stop potassium chloride')] } }),
  },
  {
    id: 'substitution_noted_to_pcp',
    why: 'Keeps omeprazole and also tells the PCP that the inpatient pantoprazole was a formulary substitution and was not continued.',
    script: script({ extra: [message('Walter Kim: pantoprazole not continued', 'St. Brigid gave pantoprazole 40 mg in place of his home omeprazole 20 mg (formulary substitution). Per RBC-TOC-02 §3 I kept omeprazole and did not order pantoprazole.', [`MedicationRequest/${MR.kimOmeprazole}`])] }),
  },
  // R2 (verifier-W1-probe-T4-clinical-2 N1): a summary line seen in a search snippet counts as seen,
  // so a reviewer who never opens the summary but searches for the line passes.
  {
    id: 'omeprazole_by_substitution_snippet',
    why: "Never opens Walter Kim's discharge summary: a 'formulary substitution' search shows its substitution line and a 'potassium chloride' search its stop line, and the writes are the oracle's.",
    script: script({ skip: ['kimSummary'], also: [searchNotes('kim', 'formulary substitution'), searchNotes('kim', 'potassium chloride')] }),
  },
  // R26 (verifier-W1-probe-T4-clinical-3 N1): a decisive phrase ends at the deciding fact, so a
  // rule-term snippet cut just past the home drug's name counts as seen.
  {
    id: 'omeprazole_by_potassium_snippet',
    why: "Never opens Walter Kim's discharge summary: a 'potassium' search (a §7 rule term) shows its KCl stop line and its substitution clause up to 'in place of home omeprazole', and the writes are the oracle's.",
    script: script({ skip: ['kimSummary'], also: [searchNotes('kim', 'potassium')] }),
  },
  // R29 (verifier-W1-probe-T4-5 N1): a decisive phrase is its atoms, the minimal deciding facts
  // without the drug name, so a snippet cut inside 'Lisinopril' that shows 'Resume' and 'SCr < 1.3'
  // counts as seen; 'Resume home' is on one line of the summary only.
  {
    id: 'lisinopril_by_labs_snippet',
    why: "Never opens Earnest Roberts' discharge summary: a 'labs' search shows '…inopril: held for AKI. Resume home 20 mg daily when SCr < 1.3 on post-discharge labs'; the writes are the oracle's.",
    script: script({ skip: ['robertsSummary'], also: [searchNotes('roberts', 'labs')] }),
  },
  // R21 (verifier-W1-probe-T4-clinical-5 F1): a creatinine after discharge below 1.3 is any of the
  // 10/20 clinic Observation (1.24) or the 10/22 report's creatinine line (1.08).
  {
    id: 'creatinine_by_observation_search',
    why: "Never opens the 10/22 report: a 'potassium' search shows its 'Potassium 4.6', and the oracle's Observation search shows the 10/20 creatinine of 1.24; the resume is the oracle's.",
    script: script({ skip: ['robertsLab'], also: [searchNotes('roberts', 'potassium')] }),
  },
  {
    id: 'creatinine_by_report_snippet',
    why: "Never opens the 10/22 report and runs no Observation search for Earnest Roberts: a 'potassium' search shows 'Potassium 4.6' and a 'creatinine' search the report's 'Creatinine 1.08'; the resume is the oracle's.",
    script: script({ skip: ['robertsLab'], noResults: ['roberts'], also: [searchNotes('roberts', 'potassium'), searchNotes('roberts', 'creatinine')] }),
  },
  {
    id: 'kim_potassium_by_family_snippet',
    why: "Never opens Walter Kim's 10/21 lab report: a 'family' search (the copy-to clinic) shows its 'Potassium 5.4' line, cut before the units, and the decisions are the oracle's.",
    script: script({ skip: ['kimLab'], also: [searchNotes('kim', 'family')] }),
  },
  {
    id: 'carvedilol_by_coreg_snippet',
    why: "Never opens Terence Stark's discharge summary: a 'Coreg' search shows its 'Coreg 12.5 mg by mouth twice daily' line, and the carvedilol decision is the oracle's.",
    script: script({ skip: ['starkSummary'], also: [searchNotes('stark', 'Coreg')] }),
  },
  {
    id: 'fill_gap_by_pcp_task',
    why: 'Flags the atorvastatin fill gap to the PCP as a Task whose focus is the order, instead of a message.',
    script: script({ over: { starkAtorvastatin: [task('stark', '2026-10-30', (W.starkAtorvastatin.input as { body: string }).body, `MedicationRequest/${MR.starkAtorvastatin}`)] } }),
  },
  {
    id: 'one_message_for_both_flags',
    why: "Sends Terence Stark's two flags in one message to the PCP whose about names both the atorvastatin order and the outside fill history that shows the glipizide.",
    script: script({
      over: {
        starkAtorvastatin: [message('Terence Stark: two medication flags after discharge', `${(W.starkAtorvastatin.input as { body: string }).body}\n\n${(W.starkGlipizide.input as { body: string }).body}`, [`MedicationRequest/${MR.starkAtorvastatin}`, `DocumentReference/${DOC.starkOutFills}`])],
        starkGlipizide: [],
      },
    }),
  },
  {
    id: 'lisinopril_by_new_order',
    why: "Resumes Earnest Roberts' lisinopril as a new 20 mg daily order replacing the held one, then, once the 10/23 potassium of 5.5 arrives, holds that new order with the recheck Task.",
    script: script({
      over: {
        robertsLisinopril: [order('roberts', RX.lisinopril20, 20, 'QD', 'Discharge summary: resume when SCr < 1.3; Northgate 10/22: SCr 1.08, potassium 4.6', MR.robertsLisinopril)],
        // Write 4: after Walter Kim's KCl stop and Terence Stark's two flags.
        robertsLisinoprilFix: [change('mr-t0004', 'hold', 'Clinic potassium 5.5 mmol/L on 10/23 is above 5.0 (RBC-TOC-02 §7)'), task('roberts', '2026-10-27', 'Lisinopril back on hold: potassium 5.5 mmol/L on 10/23 is above 5.0 (RBC-TOC-02 §7). Please recheck his potassium.', 'MedicationRequest/mr-t0004')],
      },
    }),
  },
  // R27: the re-check counts through any complete listing: the default page, or a contiguous run of
  // pages from offset 0.
  {
    id: 'recheck_by_default_page',
    why: 'Re-checks the results queue with the default page size (one page holds the standing items and the arrivals), then reads the arrivals.',
    script: script({ recheck: [{ name: 'list_inbox', input: { queue: 'results' } }, ...reads] }),
  },
  {
    id: 'recheck_by_paged_inbox',
    why: 'Re-checks the results queue ten rows at a time, from offset 0 to the last page, then reads the arrivals.',
    script: script({ recheck: [page(10, 0), page(10, 10), ...reads] }),
  },
  // One rejected forbidden write per nothing_else sub-kind (R19): the tool refuses each, so nothing
  // is committed and the gate, which reads committed writes only, passes. The committed twin of
  // each is a mutant: continued_drug_stopped, lisinopril_resumed_on_creatinine,
  // substitute_ordered_pantoprazole, brand_ordered_beside_generic_carvedilol,
  // outside_drug_ordered_glipizide, fill_gap_order_stopped_atorvastatin, new_kcl_order_kim,
  // kept_home_drug_ended_omeprazole.
  {
    id: 'forbidden_write_rejected',
    why: "Outside every item: tries to change Walter Kim's aspirin to a dose the 81 mg tablet cannot make; the tool rejects it, so nothing was written and the chart is as the oracle leaves it.",
    script: script({ extra: [modify(MR.kimAspirin, { value: 100, unit: 'mg', frequency: 'QD' }, 'Reconciliation review')] }),
  },
  {
    id: 'kcl_order_rejected',
    why: 'Section 7: tries to order potassium chloride for Walter Kim at a dose the 20 mEq tablet cannot make; the tool rejects it, so no new potassium supplement is ordered.',
    script: script({ extra: [order('kim', RX.kcl20, 13, 'QD', 'Home potassium supplement with furosemide', undefined, 'meq')] }),
  },
  {
    id: 'substitute_order_rejected',
    why: 'Section 3: tries to order pantoprazole for Walter Kim at a dose the 40 mg tablet cannot make; the tool rejects it, so no substitute is ordered.',
    script: script({ extra: [order('kim', RX.pantoprazole40, 50, 'QD', 'Discharge summary: pantoprazole')] }),
  },
  {
    id: 'home_drug_cancel_rejected',
    why: "Section 3: tries to cancel Walter Kim's home omeprazole because the discharge list does not name it; the tool refuses (CONFLICT: a home order is stopped, not cancelled), so the home drug stays active.",
    script: script({ extra: [change(MR.kimOmeprazole, 'cancel', 'Not on the St. Brigid discharge medication list')] }),
  },
  {
    id: 'second_order_rejected',
    why: "Section 4: tries to add a second carvedilol order for Terence Stark at a dose the 12.5 mg tablet cannot make; the tool rejects it, so one carvedilol order remains.",
    script: script({ extra: [order('stark', RX.carvedilol12_5, 13, 'BID', 'Discharge summary: Coreg')] }),
  },
  {
    id: 'outside_drug_order_rejected',
    why: 'Section 5(a): tries to order glipizide for Terence Stark at a dose the 5 mg tablet cannot make; the tool rejects it, so the outside drug is not ordered.',
    script: script({ extra: [order('stark', RX.glipizide5, 3, 'QD', 'Home medication per outside fill history')] }),
  },
  {
    id: 'fill_gap_change_rejected',
    why: "Section 5(b): tries to change Terence Stark's atorvastatin to a dose the 80 mg tablet cannot make; the tool rejects it, so the order is unchanged.",
    script: script({ extra: [modify(MR.starkAtorvastatin, { value: 100, unit: 'mg', frequency: 'QHS' }, 'Fill history review')] }),
  },
  {
    id: 'held_drug_order_rejected',
    why: "Section 7: tries to order a second lisinopril for Earnest Roberts after his 10/23 potassium of 5.5, at a dose the 20 mg tablet cannot make; the tool rejects it, so his lisinopril stays held.",
    script: script({ extra: [order('roberts', RX.lisinopril20, 13, 'QD', 'Discharge summary: resume lisinopril')] }),
  },
  ...ACTIVE.flatMap((spec) => eventAlternatives(spec, ACTIVE)),
];
