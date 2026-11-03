// The tool calls T4's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). Each case varies only what its clinician would vary, so they share
// these calls and the notes' and messages' wording.
//
// The route (PW4-E3, with mid-trial events, events.ts): read every patient's documents; make the
// first writes, which decide items no event bears on and so bring each patient's arrivals
// (after_write); re-check the results queue (one complete page of list_inbox) and read each
// arrival, and after a potassium batch list the patient's potassiums again (the route RBC-TOC-02
// §2 and §7 name, W5-E); then decide the items the arrivals bear on, on the chart as delivered
// (C1); then the notes and finish. A script is built for a set of active specs (default events.ts
// ACTIVE), so the per-spec tests (tests/events.test.ts) run the same route with any one spec active.
// W5-E: the lever hosts (lever.ts) are on the route while on the list: the A host always (his
// first write is the resume that brings the batch), the B host (her first write is the §2 Task) and
// the reserve host (the amlodipine modify) while their item is in LEVER.
import type { Script, ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE, ARRIVAL, SPECS } from '../events.ts';
import { id, idOf, ref, refOf } from '../ids.ts';
import { HOSTS, LEVER } from '../lever.ts';

export const PT = { kim: 'pt-0005', stark: 'pt-0004', roberts: 'pt-0044', whitcomb: idOf(HOSTS.A), pruitt: idOf(HOSTS.B), salazar: idOf(HOSTS.reserve) } as const;
export type Who = keyof typeof PT;
// The patients on the list in this LEVER state, in the instruction's order.
export const WHO: readonly Who[] = ['kim', 'stark', 'roberts', 'whitcomb', ...(LEVER.includes('B') ? ['pruitt' as const] : []), ...(LEVER.includes('reserve') ? ['salazar' as const] : [])];
export const exceptWho = (...skip: readonly Who[]): Who[] => WHO.filter((w) => !skip.includes(w));
const NAME: Record<Who, string> = { kim: 'walter kim', stark: 'terence stark', roberts: 'earnest roberts', whitcomb: 'gerald whitcomb', pruitt: 'lorraine pruitt', salazar: 'victor salazar' };
const PCP = 'Practitioner/pr-okafor';

export const RX = {
  furosemide20: '310429', furosemide40: '313988', carvedilol12_5: '200032', carvedilol6_25: '200031', lisinopril20: '314077', lisinopril10: '314076',
  pantoprazole40: '314200', kcl20: '198116', glipizide5: '310490', aspirin81: '243670', amlodipine5: '197361', amlodipine10: '308135', metformin1000: '860981',
} as const;
export const MR = {
  kimFurosemide: id('mr-t4-kim-furosemide'), kimLisinopril: id('mr-t4-kim-lisinopril'), kimKcl: id('mr-t4-kim-kcl'), kimOmeprazole: id('mr-t4-kim-omeprazole'), kimAspirin: id('mr-t4-kim-aspirin'), kimMetoprolol: id('mr-t4-kim-metoprolol'), kimAtorvastatin: id('mr-t4-kim-atorvastatin'),
  starkCarvedilol: id('mr-t4-stark-carvedilol'), starkAtorvastatin: id('mr-t4-stark-atorvastatin'), starkAspirin: id('mr-t4-stark-aspirin'),
  robertsLisinopril: id('mr-t4-roberts-lisinopril'), robertsRosuvastatin: id('mr-t4-roberts-rosuvastatin'),
  whitcombLisinopril: idOf('mr-t4-whitcomb-lisinopril'), whitcombAmlodipine: idOf('mr-t4-whitcomb-amlodipine'),
  pruittMetformin: idOf('mr-t4-pruitt-metformin'), pruittAmlodipine: idOf('mr-t4-pruitt-amlodipine'),
  salazarAmlodipine: idOf('mr-t4-salazar-amlodipine'), salazarAtorvastatin: idOf('mr-t4-salazar-atorvastatin'),
} as const;
export const DOC = {
  kimSummary: id('doc-t4-kim-dc'), kimAddendum: id('doc-t4-kim-add'), kimFills: id('doc-t4-kim-fills'), kimLab: id('doc-t4-kim-lab'),
  starkSummary: id('doc-t4-stark-dc'), starkFills: id('doc-t4-stark-fills'), starkOutFills: id('doc-t4-stark-outfills'),
  robertsSummary: id('doc-t4-roberts-dc'), robertsFills: id('doc-t4-roberts-fills'), robertsOutFills: id('doc-t4-roberts-outfills'), robertsLab: id('doc-t4-roberts-lab'),
  whitcombSummary: idOf('doc-t4-whitcomb-dc'), whitcombFills: idOf('doc-t4-whitcomb-fills'),
  pruittSummary: idOf('doc-t4-pruitt-dc'), pruittFills: idOf('doc-t4-pruitt-fills'),
  salazarSummary: idOf('doc-t4-salazar-dc'), salazarFills: idOf('doc-t4-salazar-fills'), salazarOutFills: idOf('doc-t4-salazar-outfills'),
} as const;
export type DocKey = keyof typeof DOC;
export const OBS = { whitcombK: idOf('obs-t4-whitcomb-k-1021'), whitcombScr: idOf('obs-t4-whitcomb-scr-1021'), pruittStayScr: idOf('obs-t4-pruitt-scr-1021') } as const;
// The id a write of a trial gives a resource it creates: <prefix>-t<seq>, seq counting committed
// writes from 1 (packages/env/tools/write/commit.ts). A script that changes an order it created
// names it this way.
export const made = (prefix: string, seq: number) => `${prefix}-t${String(seq).padStart(4, '0')}`;

export const read = (resource_type: string, rid: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type, id: rid } });
export const policy: ScriptCall = { name: 'read_policy', input: { policy_id: 'RBC-TOC-02' } };
export const findPatient = (w: Who): ScriptCall => ({ name: 'search_patients', input: { name: NAME[w] } });
export const meds = (w: Who): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'MedicationRequest', patient: PT[w] } });
// The route RBC-TOC-02 implies: each patient's documents since the admission (§1 the summary and
// any addendum, §5 the fill history, §2/§7 a filed laboratory report), then each one read whole.
export const docs = (w: Who): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'DocumentReference', patient: PT[w], date_ge: '2026-10-01', sort: '-date' } });
// The patient's results since the admission (§2 'a result in the patient's results'): one page,
// sorted newest first from 10/01, so it is a complete review of the days after discharge (R27).
export const results = (w: Who): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'Observation', patient: PT[w], date_ge: '2026-10-01', sort: '-date' } });
// The patient's potassiums, newest first (§7 'the most recent potassium after discharge'): the
// re-search after a potassium arrival that shows every result of its batch (W5-E).
export const potassiums = (w: Who): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'Observation', patient: PT[w], code: '2823-3', sort: '-date' } });
const DOCS_OF: Record<Who, readonly DocKey[]> = {
  kim: ['kimSummary', 'kimAddendum', 'kimFills', 'kimLab'],
  stark: ['starkSummary', 'starkFills', 'starkOutFills'],
  roberts: ['robertsSummary', 'robertsFills', 'robertsOutFills', 'robertsLab'],
  whitcomb: ['whitcombSummary', 'whitcombFills'],
  pruitt: ['pruittSummary', 'pruittFills'],
  salazar: ['salazarSummary', 'salazarFills', 'salazarOutFills'],
};
export const readDoc = (d: DocKey): ScriptCall => read('DocumentReference', DOC[d]);
// A targeted search of one patient's notes; its rows show cut snippets of long notes.
export const searchNotes = (w: Who, query: string): ScriptCall => ({ name: 'search_notes', input: { query, patient: PT[w] } });

// The oracle's reads, turn by turn; `skip` leaves out the reads of the named documents (a reviewer
// who never opened them), `also` adds calls to the reading turn (a targeted search in place of
// a whole read), `noResults` leaves out the named patients' Observation searches, and `only`
// limits the reads to the named patients (a reviewer who skipped the others).
export function reads(skip: readonly DocKey[] = [], also: readonly ScriptCall[] = [], noResults: readonly Who[] = [], only: readonly Who[] = WHO): Script {
  return [
    { calls: [policy, ...only.map(findPatient)] },
    { calls: only.flatMap((w) => [meds(w), docs(w), ...(noResults.includes(w) ? [] : [results(w)])]) },
    { calls: [...only.flatMap((w) => DOCS_OF[w].filter((d) => !skip.includes(d)).map(readDoc)), ...also] },
  ];
}

type Dose = { value: number; unit: string; frequency: string };
export const modify = (request: string, new_dose: Dose, reason: string, medication_code?: string): ScriptCall => ({
  name: 'change_medication',
  input: { medication_request: request, action: 'modify', reason, new_dose, ...(medication_code ? { medication_code } : {}) },
});
export const change = (request: string, action: string, reason: string): ScriptCall => ({ name: 'change_medication', input: { medication_request: request, action, reason } });
export const order = (w: Who, rxnorm_code: string, dose_value: number, frequency: string, reason: string, replaces?: string, dose_unit = 'mg'): ScriptCall => ({
  name: 'order_medication',
  input: { patient: PT[w], rxnorm_code, dose_value, dose_unit, route: 'oral', frequency, reason, ...(replaces ? { replaces } : {}) },
});
export const message = (subject: string, body: string, about: string[]): ScriptCall => ({ name: 'send_message', input: { recipient: PCP, priority: 'routine', subject, body, about } });
export const task = (w: Who, due: string, description: string, focus?: string): ScriptCall => ({
  name: 'create_task',
  input: { patient: PT[w], owner: PCP, due, priority: 'routine', description, ...(focus ? { focus } : {}) },
});
export const bmp = (w: Who, start: string, end: string, reason: string): ScriptCall => ({ name: 'order_service', input: { patient: PT[w], code: '24321-2', priority: 'routine', occurrence_start: start, occurrence_end: end, reason } });

// ---- the oracle's writes, one per item (the filler included), before any arrival ----
export const PRUITT_TASK_TEXT = 'Metformin stays on hold: the discharge resume condition names post-discharge labs, and the chart holds no creatinine after her 10/21 discharge (the 1.21 is from the morning of discharge). The BMP is expected 10/24 (RBC-TOC-02 §2); please resume at 1000 mg daily if SCr < 1.5.';
export const W = {
  kimFurosemide: modify(MR.kimFurosemide, { value: 40, unit: 'mg', frequency: 'BID' }, 'Signed discharge addendum 10/19: furosemide 40 mg twice daily (corrects the summary\'s 40 mg daily)', RX.furosemide40),
  kimKcl: change(MR.kimKcl, 'stop', 'St. Brigid discharge summary 10/19: stop potassium chloride'),
  kimLisinoprilTask: task('kim', '2026-10-26', 'Lisinopril stays on hold: potassium 5.4 mmol/L on 10/21 is above 5.0 (RBC-TOC-02 §7). Please recheck his potassium.', `MedicationRequest/${MR.kimLisinopril}`),
  starkCarvedilol: modify(MR.starkCarvedilol, { value: 12.5, unit: 'mg', frequency: 'BID' }, "St. Brigid discharge summary 10/20: 'Coreg 12.5 mg twice daily' is his carvedilol, increased from 6.25 mg", RX.carvedilol12_5),
  starkAtorvastatin: message('Terence Stark: atorvastatin not being filled',
    "Terence Stark's discharge summary continues atorvastatin 80 mg nightly, but his pharmacy fill history shows the last fill on 03/04/2026 (90 days), which covers only 44 of the 180 days before his 10/16 admission (24%), so he is not taking it as prescribed. Per RBC-TOC-02 §5(b) I left the order unchanged; please address adherence.",
    [`MedicationRequest/${MR.starkAtorvastatin}`]),
  starkGlipizide: message('Terence Stark: glipizide from an outside prescriber',
    "Terence Stark's pharmacy fill history shows glipizide 5 mg daily filled 07/30, 08/29 and 09/28/2026, prescribed by Dr. Anil Desai (Valley Endocrinology). It is not on our medication list and the St. Brigid discharge documents do not address it. A sulfonylurea at 76 with CKD stage 3 is a hypoglycemia risk beside his insulin. Per RBC-TOC-02 §5(a) I did not order or change anything; please review.",
    [`DocumentReference/${DOC.starkOutFills}`]),
  robertsLisinopril: change(MR.robertsLisinopril, 'resume', 'Discharge summary: resume when SCr < 1.3; Northgate 10/22: SCr 1.08 and potassium 4.6, the most recent after discharge (RBC-TOC-02 §2, §7)'),
  // W5-E: the A host's resume (his first write, which brings the batch), the B host's §2 Task, the
  // reserve host's dose change.
  whitcombLisinopril: change(MR.whitcombLisinopril, 'resume', 'Discharge summary: resume when SCr < 1.5; Northgate 10/21: SCr 1.12 and potassium 4.4, the most recent after discharge (RBC-TOC-02 §2, §7)'),
  pruittTask: task('pruitt', '2026-10-24', PRUITT_TASK_TEXT, `MedicationRequest/${MR.pruittMetformin}`),
  salazarAmlodipine: modify(MR.salazarAmlodipine, { value: 10, unit: 'mg', frequency: 'QD' }, "St. Brigid discharge summary 10/20: amlodipine 10 mg daily, increased from 5 mg. His outside fill history covers every day since the first fill on 07/02 (RBC-TOC-02 §5(b)); the network's 180-day figure is not the policy's window", RX.amlodipine10),
} as const;
export type WriteKey = keyof typeof W;

// ---- the amends: each event's action on the chart as delivered (events.ts; tests/grader.ts) ----
export const AMEND = {
  // kim-k1: the repeat panel's potassium of 4.7 is the most recent and SCr 1.21 meets the resume
  // line (§2, §7): resume.
  kimK1: [
    change(MR.kimLisinopril, 'resume', 'Northgate repeat panel 10/23: potassium 4.7 (the most recent after discharge, not above 5.0) and SCr 1.21 meet the discharge resume line (RBC-TOC-02 §2, §7)'),
  ],
  // kim-k2: the amended addendum's correction is 40 mg once daily (§1).
  kimK2: (request: string) => modify(request, { value: 40, unit: 'mg', frequency: 'QD' }, 'Signed addendum, amended 10/23: furosemide 40 mg daily (the latest signed addendum, RBC-TOC-02 §1)', RX.furosemide40),
  // stark-s1: the signed addendum keeps carvedilol at 6.25 mg twice daily, his home dose (§1, §4).
  starkS1: (request: string) => modify(request, { value: 6.25, unit: 'mg', frequency: 'BID' }, 'Signed addendum 10/23: carvedilol 6.25 mg twice daily, the increase reversed before discharge (RBC-TOC-02 §1)', RX.carvedilol6_25),
  // stark-s2: the mail-order fills cover the window (§5b no longer applies): correct the flag.
  starkS2: message('Terence Stark: correction, atorvastatin is being filled',
    "Correction to my earlier message: CareFirst Mail Pharmacy's dispensing record shows atorvastatin 80 mg filled 06/02 and 08/31/2026 (90 days each). With the Riverbend fills that covers the 180 days before his admission, so he is taking it as prescribed. The order stays as it is; no adherence follow-up is needed.",
    [`MedicationRequest/${MR.starkAtorvastatin}`]),
  // roberts-r1: a clinic potassium of 5.5 on 10/23 is now the most recent (§7): hold, and a Task.
  robertsR1: [
    change(MR.robertsLisinopril, 'hold', 'Clinic potassium 5.5 mmol/L on 10/23, the most recent after discharge, is above 5.0 (RBC-TOC-02 §7)'),
    task('roberts', '2026-10-27', 'Lisinopril back on hold: potassium 5.5 mmol/L on 10/23 is above 5.0 (RBC-TOC-02 §7). Please recheck his potassium.', `MedicationRequest/${MR.robertsLisinopril}`),
  ],
  // whitcomb-a1: the batch's most recent potassium is the silent 4.6 (§7, §8): the resume stands,
  // nothing to write. The hold a reviewer makes on the notified 5.4 instead (the twin's amend, and
  // whitcomb-a1's near miss): held, and a Task 2 to 7 days after the 10/22 result.
  whitcombHold: [
    change(MR.whitcombLisinopril, 'hold', 'Northgate potassium 5.4 mmol/L on 10/22, the most recent after discharge, is above 5.0 (RBC-TOC-02 §7)'),
    task('whitcomb', '2026-10-26', 'Lisinopril back on hold: potassium 5.4 mmol/L on 10/22 is above 5.0 (RBC-TOC-02 §7). Please recheck his potassium.', `MedicationRequest/${MR.whitcombLisinopril}`),
  ],
} as const;

// The arrival each spec brings, as a read of its focus; its kind of resource from events.ts.
export const arrivalRead = (spec: string): ScriptCall => {
  const s = SPECS.find((x) => x.id === spec);
  if (s === undefined) throw new Error(`no T4 event ${spec}`);
  const r = s.resources[0]!;
  return read(r.resourceType, r.id!);
};
// What the route reads for each arrival: its focus, and after a potassium batch the patient's
// potassiums listed again, which shows every result of the batch (W5-E; R39(a)).
const FOLLOW_UP: Readonly<Record<string, readonly ScriptCall[]>> = { 'whitcomb-a1': [potassiums('whitcomb')], 'whitcomb-a1-twin': [potassiums('whitcomb')] };
export const specReads = (spec: string): ScriptCall[] => [arrivalRead(spec), ...(FOLLOW_UP[spec] ?? [])];
// The reads of every active arrival but `except`'s, in firing order.
export const arrivalReads = (active: readonly string[] = ACTIVE, except: readonly string[] = []): ScriptCall[] => SPECS_READ(active).filter((s) => !except.includes(s)).flatMap(specReads);
// The results queue, one complete page (13 standing items and at most 11 arrivals).
export const inbox: ScriptCall = { name: 'list_inbox', input: { queue: 'results', status: 'requested', count: 50 } };

// ---- the notes (§6) ----
export const NOTE: Record<Who, string> = {
  kim:
    'Post-discharge medication reconciliation under RBC-TOC-02.\n\nSources: St. Brigid discharge summary 10/19/2026 and its signed addendum; Northgate outside lab reports of 10/21/2026 (potassium 5.4 mmol/L, creatinine 1.32 mg/dL) and any repeat since; pharmacy fill history 10/20/2026.\n\n' +
    "Changes: furosemide changed to the signed addendum's dose. Potassium chloride stopped (summary). Lisinopril 10 mg: held while the most recent potassium after discharge is above 5.0 (RBC-TOC-02 §7), resumed once it is not and SCr is under 1.5 (§2).\n\n" +
    'No change: omeprazole 20 mg kept, pantoprazole was a formulary substitution (§3); metoprolol XL is his metoprolol succinate ER 50 mg; atorvastatin 40 mg and aspirin 81 mg continued. Fills cover his prescriptions.',
  stark:
    'Post-discharge medication reconciliation under RBC-TOC-02.\n\nSources: St. Brigid discharge summary 10/20/2026 and any signed addendum; Riverbend Pharmacy and outside pharmacy fill histories.\n\n' +
    "Carvedilol: the discharge summary's 'Coreg 12.5 mg twice daily' is his carvedilol (§4); the signed addendum, where there is one, rules (§1).\n\n" +
    'Atorvastatin 80 mg continued; its fills were checked against the 180 days before admission and flagged to Dr. Okafor where they fell short (§5b). Aspirin 81 mg and insulin 70/30 18 units twice daily continued.\n\n' +
    'Flagged to Dr. Okafor: glipizide 5 mg daily filled from Valley Endocrinology, not on the list and not addressed by the discharge documents (§5a).',
  roberts:
    'Post-discharge medication reconciliation under RBC-TOC-02.\n\nSources: St. Brigid discharge summary 10/19/2026; Northgate outside lab report 10/22/2026 (potassium 4.6 mmol/L, creatinine 1.08 mg/dL), after the clinic draw of 10/20 (potassium 5.3), and any result since; Riverbend Pharmacy and outside pharmacy fill histories 10/20/2026.\n\n' +
    "Lisinopril 20 mg: resumed by the summary's line (SCr under 1.3), and held whenever the most recent potassium after discharge is above 5.0, with a recheck Task (§2, §7).\n\n" +
    'No change: rosuvastatin 10 mg, insulin glargine 22 units at bedtime and insulin lispro 6 units with meals continued.',
  whitcomb:
    'Post-discharge medication reconciliation under RBC-TOC-02.\n\nSources: St. Brigid discharge summary 10/19/2026; Northgate results of 10/21/2026 (potassium 4.4 mmol/L, creatinine 1.12 mg/dL) and every potassium filed since, the most recent of them read against §7; Riverbend Pharmacy fill history 10/20/2026.\n\n' +
    "Lisinopril 20 mg: resumed by the summary's line (SCr under 1.5 after discharge) with the most recent potassium after discharge not above 5.0 (§2, §7); a later potassium changes that only if it is the most recent and above 5.0 (§8).\n\n" +
    'No change: amlodipine 5 mg and atorvastatin 40 mg continued. Fills cover his prescriptions.',
  pruitt:
    'Post-discharge medication reconciliation under RBC-TOC-02.\n\nSources: St. Brigid discharge summary 10/21/2026; her results since admission (creatinine 2.0 on 10/18 and 1.21 on 10/21, both from the stay; nothing after discharge); Riverbend Pharmacy fill history 10/22/2026.\n\n' +
    "Metformin 1000 mg: stays on hold. The summary's resume condition names post-discharge labs, and no result after discharge is in the chart; the 10/21 creatinine is from the morning of discharge and does not satisfy it (§2). Task to Dr. Okafor due 10/24, when the BMP is expected.\n\n" +
    'No change: amlodipine 5 mg and atorvastatin 40 mg continued. Fills cover her prescriptions.',
  salazar:
    'Post-discharge medication reconciliation under RBC-TOC-02.\n\nSources: St. Brigid discharge summary 10/20/2026; Riverbend Pharmacy and outside pharmacy fill histories 10/21/2026.\n\n' +
    "Amlodipine: changed to the summary's 10 mg daily (§4, §6). The outside fill history prints a 180-day coverage of 60%, but he first filled amlodipine on 07/02, inside the window, and has refilled on time since, so §5(b) counts the days from that first fill: 100%, taken as prescribed, and the dose change applies.\n\n" +
    'No change: atorvastatin 40 mg continued; its fills cover the window.',
};
export const CITES: Record<Who, string[]> = {
  kim: [ref('DocumentReference/doc-t4-kim-dc'), ref('DocumentReference/doc-t4-kim-add'), ref('DocumentReference/doc-t4-kim-lab'), ref('DocumentReference/doc-t4-kim-fills')],
  stark: [ref('DocumentReference/doc-t4-stark-dc'), ref('DocumentReference/doc-t4-stark-fills'), ref('DocumentReference/doc-t4-stark-outfills')],
  roberts: [ref('DocumentReference/doc-t4-roberts-dc'), ref('DocumentReference/doc-t4-roberts-lab'), ref('DocumentReference/doc-t4-roberts-fills'), ref('DocumentReference/doc-t4-roberts-outfills')],
  whitcomb: [refOf('DocumentReference/doc-t4-whitcomb-dc'), `Observation/${OBS.whitcombK}`, `Observation/${OBS.whitcombScr}`, refOf('DocumentReference/doc-t4-whitcomb-fills')],
  pruitt: [refOf('DocumentReference/doc-t4-pruitt-dc'), `Observation/${OBS.pruittStayScr}`, refOf('DocumentReference/doc-t4-pruitt-fills')],
  salazar: [refOf('DocumentReference/doc-t4-salazar-dc'), refOf('DocumentReference/doc-t4-salazar-fills'), refOf('DocumentReference/doc-t4-salazar-outfills')],
};
// The arrivals a note also cites, by spec, when that spec fired (§6: the documents relied on).
const CITES_ARRIVAL: Record<string, Who> = { 'kim-k1': 'kim', 'kim-k2': 'kim', 'stark-s1': 'stark', 'stark-s2': 'stark', 'roberts-r1': 'roberts', 'whitcomb-a1': 'whitcomb', 'whitcomb-a1-twin': 'whitcomb' };
export const note = (w: Who, text: string = NOTE[w], cites: string[] = CITES[w]): ScriptCall => ({
  name: 'write_note',
  input: { patient: PT[w], type: 'progress_note', title: 'Post-discharge medication reconciliation (RBC-TOC-02)', text, cites, cites_policies: ['RBC-TOC-02'] },
});
export const finish = (summary = `Reconciled the ${['three', 'four', 'five', 'six'][WHO.length - 3]} post-discharge patients under RBC-TOC-02; rechecked the results queue for anything that arrived, made the changes, flagged Dr. Okafor, and wrote a note for each.`): ScriptCall => ({ name: 'finish', input: { summary } });

// ---- the route ----
export interface RouteOpts {
  // The active specs the route answers (default events.ts ACTIVE).
  active?: readonly string[];
  // Reads: as reads().
  skip?: readonly DocKey[];
  also?: readonly ScriptCall[];
  noResults?: readonly Who[];
  only?: readonly Who[];
  // The first writes, the decisions after the re-check, and extra calls in the decisions turn:
  // `over` maps a named write to its replacement calls ([] drops it).
  over?: Partial<Record<FirstKey | DecideKey, readonly ScriptCall[]>>;
  extra?: readonly ScriptCall[];
  // The re-check: the inbox listing and the arrival reads (default: list_inbox and the reads of
  // each active spec's arrival, specReads); `recheck: null` drops the whole turn.
  recheck?: readonly ScriptCall[] | null;
  notes?: Partial<Record<Who, ScriptCall>>;
}
// The first writes: each decides an item no event bears on, and is its patient's first write.
// The atorvastatin flag comes before the glipizide flag, so stark-s2's mail-order fills arrive after
// it (a flag that needs correcting). The lever hosts' come last, so the base cases' created ids
// (made) keep their numbers.
export const FIRST: readonly FirstKey[] = ['kimKcl', 'starkAtorvastatin', 'starkGlipizide', 'robertsLisinopril', 'whitcombLisinopril', ...(LEVER.includes('B') ? ['pruittTask' as const] : []), ...(LEVER.includes('reserve') ? ['salazarAmlodipine' as const] : [])];
export type FirstKey = 'kimKcl' | 'starkAtorvastatin' | 'starkGlipizide' | 'robertsLisinopril' | 'whitcombLisinopril' | 'pruittTask' | 'salazarAmlodipine';
// The decisions after the re-check, on the chart as delivered.
const DECIDE = ['kimFurosemide', 'kimLisinopril', 'starkCarvedilol', 'starkAtorvastatinFix', 'robertsLisinoprilFix', 'whitcombLisinoprilFix'] as const;
export type DecideKey = (typeof DECIDE)[number];

const fired = (active: readonly string[], spec: string) => active.includes(spec);
export function decisions(active: readonly string[] = ACTIVE): Record<DecideKey, readonly ScriptCall[]> {
  return {
    // No earlier write of furosemide, so the decision acts on the home order: the addendum's dose,
    // or the amended addendum's.
    kimFurosemide: [fired(active, 'kim-k2') ? AMEND.kimK2(MR.kimFurosemide) : W.kimFurosemide],
    kimLisinopril: fired(active, 'kim-k1') ? [...AMEND.kimK1] : [W.kimLisinoprilTask],
    // With the addendum, his home order already is the dose: nothing to write.
    starkCarvedilol: fired(active, 'stark-s1') ? [] : [W.starkCarvedilol],
    starkAtorvastatinFix: fired(active, 'stark-s2') ? [AMEND.starkS2] : [],
    robertsLisinoprilFix: fired(active, 'roberts-r1') ? [...AMEND.robertsR1] : [],
    // whitcomb-a1 leaves the resume; the twin holds on its notified newest value.
    whitcombLisinoprilFix: fired(active, 'whitcomb-a1-twin') ? [...AMEND.whitcombHold] : [],
  };
}
export const firstWrites = (): Record<FirstKey, readonly ScriptCall[]> => ({
  kimKcl: [W.kimKcl], starkAtorvastatin: [W.starkAtorvastatin], starkGlipizide: [W.starkGlipizide], robertsLisinopril: [W.robertsLisinopril],
  whitcombLisinopril: [W.whitcombLisinopril], pruittTask: [W.pruittTask], salazarAmlodipine: [W.salazarAmlodipine],
});
// The first writes of every listed patient but `skip`'s.
export const firstWritesExcept = (...skip: readonly FirstKey[]): ScriptCall[] => FIRST.filter((k) => !skip.includes(k)).flatMap((k) => firstWrites()[k]);
// The active specs, in SPECS order (the order they fire in).
export const SPECS_READ = (active: readonly string[]): string[] => SPECS.filter((s) => active.includes(s.id)).map((s) => s.id);
export const recheck = (active: readonly string[] = ACTIVE): ScriptCall[] => [inbox, ...arrivalReads(active)];
export const notesFor = (active: readonly string[] = ACTIVE, over: Partial<Record<Who, ScriptCall>> = {}): ScriptCall[] =>
  WHO.map((w) => over[w] ?? note(w, NOTE[w], [...CITES[w], ...SPECS.filter((s) => active.includes(s.id) && CITES_ARRIVAL[s.id] === w).flatMap((s) => s.resources.map((r) => `${r.resourceType}/${r.id}`))]));

export function route(opts: RouteOpts = {}): Script {
  const active = opts.active ?? ACTIVE;
  const first = { ...firstWrites(), ...opts.over };
  const decide = { ...decisions(active), ...opts.over };
  const turn = (calls: readonly ScriptCall[]): ScriptTurn => ({ calls: [...calls] });
  const firstCalls = FIRST.flatMap((k) => first[k]);
  const decideCalls = [...DECIDE.flatMap((k) => decide[k]), ...(opts.extra ?? [])];
  const check = opts.recheck === undefined ? recheck(active) : opts.recheck;
  return [
    ...reads(opts.skip, opts.also, opts.noResults, opts.only),
    ...(firstCalls.length > 0 ? [turn(firstCalls)] : []),
    ...(check === null ? [] : [turn(check)]),
    ...(decideCalls.length > 0 ? [turn(decideCalls)] : []),
    turn(notesFor(active, opts.notes)),
    turn([finish()]),
  ];
}
// The oracle's route for the default active set; kept under its old name for the cases.
export const script = (opts: RouteOpts = {}): Script => route(opts);
export { ARRIVAL };
