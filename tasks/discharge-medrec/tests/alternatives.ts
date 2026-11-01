// Other correct solutions of T4, one per item and one for the nothing_else gate: each must PASS
// and lose exactly the rubric items it declares. Each changes the oracle in one place, the way
// another clinician would reach the same end state, so the gates are shown to read the state and
// not the oracle's form.
import type { Alternative } from '../../../packages/grader/matrix/types.ts';
import { change, DOC, message, modify, MR, order, RX, script, searchNotes, task, W } from '../solution/steps.ts';

const BMP = (patient: string, start: string, end: string, reason: string) => ({ name: 'order_service', input: { patient, code: '24321-2', priority: 'routine', occurrence_start: start, occurrence_end: end, reason } });

export const alternatives: Alternative[] = [
  {
    id: 'furosemide_by_new_order',
    why: 'Places a new furosemide 40 mg twice-daily order that replaces the old one, instead of modify (§6: stop it and replace it).',
    script: script({ over: { kimFurosemide: [order('kim', RX.furosemide40, 40, 'BID', 'Signed discharge addendum 10/19: furosemide 40 mg twice daily', MR.kimFurosemide)] } }),
  },
  {
    id: 'lisinopril_recheck_by_bmp_order',
    why: "Keeps lisinopril held and orders the potassium recheck as a BMP for 10/26-10/28 instead of a Task (§7's recheck as an order).",
    script: script({ over: { kimLisinoprilTask: [BMP('pt-0005', '2026-10-26', '2026-10-28', 'BMP: potassium 5.4 on 10/21, lisinopril held (RBC-TOC-02 §7)')] } }),
    loses: ['flags_explained'],
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
  // rule-term snippet cut just past the home drug's name, or past a brand's strength, counts as seen.
  {
    id: 'omeprazole_by_potassium_snippet',
    why: "Never opens Walter Kim's discharge summary: a 'potassium' search (a §7 rule term) shows its KCl stop line and its substitution clause up to 'in place of home omeprazole', and the writes are the oracle's.",
    script: script({ skip: ['kimSummary'], also: [searchNotes('kim', 'potassium')] }),
  },
  {
    id: 'nifedipine_by_tsh_snippet',
    why: "Never opens Adelaide Thompson's discharge summary: a 'TSH' search shows its 'Procardia XL 60 mg' line, cut before the route, and the nifedipine change is the oracle's.",
    script: script({ skip: ['thompsonSummary'], also: [searchNotes('thompson', 'TSH')] }),
  },
  // R26 sweep (builder-245; tests/phrases.test.ts): each route below shows its item's deciding facts
  // in a cut snippet, and failed while the phrase ran past them (verifier-W1-probe-T4-4 N1,
  // verifier-W1-probe-T4-clinical-4 F1 and M1).
  {
    id: 'lisinopril_by_continue_snippet',
    why: "Never opens Earnest Roberts' discharge summary: a 'continue' search shows the lisinopril line through 'when SCr < 1.3', cut before 'labs', and a 'formulary substitution' search the rosuvastatin clause; the writes are the oracle's.",
    script: script({ skip: ['robertsSummary'], also: [searchNotes('roberts', 'continue'), searchNotes('roberts', 'formulary substitution')] }),
  },
  // R29 (verifier-W1-probe-T4-5 N1): a decisive phrase is its atoms, the minimal deciding facts
  // without the drug name, so a snippet cut inside 'Lisinopril' that shows 'Resume' and 'SCr < 1.3'
  // counts as seen; 'Resume home' is on one line of the summary only.
  {
    id: 'lisinopril_by_labs_snippet',
    why: "Never opens Earnest Roberts' discharge summary: a 'labs' search shows '…inopril: held for AKI. Resume home 20 mg daily when SCr < 1.3 on post-discharge labs' and the rosuvastatin clause; the writes are the oracle's.",
    script: script({ skip: ['robertsSummary'], also: [searchNotes('roberts', 'labs')] }),
  },
  {
    id: 'lisinopril_by_atorvastatin_snippet',
    why: "Never opens Earnest Roberts' discharge summary: an 'atorvastatin' search shows '…held for AKI. Resume home 20 mg daily when SCr < 1.3' and the rosuvastatin clause; the writes are the oracle's.",
    script: script({ skip: ['robertsSummary'], also: [searchNotes('roberts', 'atorvastatin')] }),
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
    id: 'hctz_by_follow_up_snippet',
    why: "Never opens Adelaide Thompson's addendum: a 'follow-up' search shows its 'hydrochlorothiazide: stop' correction, cut before 'Correction:', and the stop is the oracle's.",
    script: script({ skip: ['thompsonAddendum'], also: [searchNotes('thompson', 'follow-up')] }),
  },
  {
    id: 'kim_potassium_by_family_snippet',
    why: "Never opens Walter Kim's lab report: a 'family' search (the copy-to clinic) shows its 'Potassium 5.4' line, cut before the units, and the hold is the oracle's.",
    script: script({ skip: ['kimLab'], also: [searchNotes('kim', 'family')] }),
  },
  {
    id: 'carvedilol_by_coreg_snippet',
    why: "Never opens Terence Stark's discharge summary: a 'Coreg' search shows its 'Coreg 12.5 mg by mouth twice daily' line, and the carvedilol change is the oracle's.",
    script: script({ skip: ['starkSummary'], also: [searchNotes('stark', 'Coreg')] }),
  },
  {
    id: 'carvedilol_by_new_order',
    why: "Orders carvedilol 12.5 mg twice daily replacing the 6.25 mg order (one active carvedilol, §4 and §6).",
    script: script({ over: { starkCarvedilol: [order('stark', RX.carvedilol12_5, 12.5, 'BID', "Discharge summary 10/20: 'Coreg 12.5 mg twice daily' is his carvedilol", MR.starkCarvedilol)] } }),
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
    id: 'nifedipine_stop_then_order',
    why: 'Stops the nifedipine ER 30 mg order, then orders nifedipine ER 60 mg daily as a new order.',
    script: script({ over: { thompsonNifedipine: [change(MR.thompsonNifedipine, 'stop', "Discharge summary 10/17: 'Procardia XL 60 mg daily' replaces 30 mg"), order('thompson', RX.nifedipine60, 60, 'QD', "Discharge summary 10/17: 'Procardia XL 60 mg daily' (nifedipine ER)")] } }),
  },
  {
    id: 'hctz_completed',
    why: 'Completes the hydrochlorothiazide order instead of stopping it.',
    script: script({ over: { thompsonHctz: [change(MR.thompsonHctz, 'complete', 'Signed discharge addendum 10/17: stop hydrochlorothiazide')] } }),
  },
  {
    id: 'levothyroxine_gap_by_pcp_task',
    why: 'Flags the levothyroxine fill gap to the PCP as a Task whose focus is the order, instead of a message.',
    script: script({ over: { thompsonLevothyroxine: [task('thompson', '2026-10-30', (W.thompsonLevothyroxine.input as { body: string }).body, `MedicationRequest/${MR.thompsonLevothyroxine}`)] } }),
  },
  {
    id: 'lisinopril_by_new_order',
    why: 'Places a new lisinopril 20 mg daily order replacing the held one, instead of resume.',
    script: script({ over: { robertsLisinopril: [order('roberts', RX.lisinopril20, 20, 'QD', 'Discharge summary: resume when SCr < 1.3; Northgate 10/22: SCr 1.08, potassium 4.6', MR.robertsLisinopril)] } }),
  },
  {
    id: 'rosuvastatin_substitution_noted_to_pcp',
    why: 'Keeps rosuvastatin and also tells the PCP that the inpatient atorvastatin was a formulary substitution and was not continued.',
    script: script({ extra: [message('Earnest Roberts: atorvastatin not continued', 'St. Brigid gave atorvastatin 20 mg in place of his home rosuvastatin 10 mg (formulary substitution). Per RBC-TOC-02 §3 I kept rosuvastatin and did not order atorvastatin.', [`MedicationRequest/${MR.robertsRosuvastatin}`])] }),
  },
  {
    id: 'sertraline_by_pcp_task',
    why: 'Flags the outside sertraline to the PCP as a Task whose focus is the fill history, instead of a message.',
    script: script({ over: { robertsSertraline: [task('roberts', '2026-10-30', (W.robertsSertraline.input as { body: string }).body, `DocumentReference/${DOC.robertsOutFills}`)] } }),
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
    id: 'held_drug_order_rejected',
    why: 'Section 7: tries to order lisinopril for Walter Kim at a dose the 10 mg tablet cannot make; the tool rejects it, so lisinopril stays held.',
    script: script({ extra: [order('kim', RX.lisinopril10, 13, 'QD', 'Discharge summary: resume lisinopril')] }),
  },
  {
    id: 'kcl_order_rejected',
    why: 'Section 7: tries to order potassium chloride for Walter Kim, whose potassium is 5.4, at a dose the 20 mEq tablet cannot make; the tool rejects it, so no new potassium supplement is ordered.',
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
];
