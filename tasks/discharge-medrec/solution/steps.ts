// The tool calls T4's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). Each case varies only what its clinician would vary, so they share
// these calls and the notes' and messages' wording.
import type { Script, ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { id, ref } from '../ids.ts';

export const PT = { kim: 'pt-0005', stark: 'pt-0004', thompson: 'pt-0042', roberts: 'pt-0044' } as const;
export type Who = keyof typeof PT;
export const WHO: readonly Who[] = ['kim', 'stark', 'thompson', 'roberts'];
const NAME: Record<Who, string> = { kim: 'walter kim', stark: 'terence stark', thompson: 'adelaide thompson', roberts: 'earnest roberts' };
const PCP = 'Practitioner/pr-okafor';

export const RX = {
  furosemide40: '313988', carvedilol12_5: '200032', carvedilol6_25: '200031', nifedipine60: '198035', nifedipine30: '198034', lisinopril20: '314077', lisinopril10: '314076',
  pantoprazole40: '314200', kcl20: '198116', atorvastatin20: '617310', glipizide5: '310490', sertraline100: '312938', hctz25: '310798', levothyroxine100: '892246', aspirin81: '243670',
} as const;
export const MR = {
  kimFurosemide: id('mr-t4-kim-furosemide'), kimLisinopril: id('mr-t4-kim-lisinopril'), kimKcl: id('mr-t4-kim-kcl'), kimOmeprazole: id('mr-t4-kim-omeprazole'), kimAspirin: id('mr-t4-kim-aspirin'), kimMetoprolol: id('mr-t4-kim-metoprolol'), kimAtorvastatin: id('mr-t4-kim-atorvastatin'),
  starkCarvedilol: id('mr-t4-stark-carvedilol'), starkAtorvastatin: id('mr-t4-stark-atorvastatin'), starkAspirin: id('mr-t4-stark-aspirin'),
  thompsonNifedipine: id('mr-t4-thompson-nifedipine'), thompsonHctz: id('mr-t4-thompson-hctz'), thompsonLevothyroxine: id('mr-t4-thompson-levothyroxine'),
  robertsLisinopril: id('mr-t4-roberts-lisinopril'), robertsRosuvastatin: id('mr-t4-roberts-rosuvastatin'),
} as const;
export const DOC = {
  kimSummary: id('doc-t4-kim-dc'), kimAddendum: id('doc-t4-kim-add'), kimFills: id('doc-t4-kim-fills'), kimLab: id('doc-t4-kim-lab'),
  starkSummary: id('doc-t4-stark-dc'), starkFills: id('doc-t4-stark-fills'), starkOutFills: id('doc-t4-stark-outfills'),
  thompsonSummary: id('doc-t4-thompson-dc'), thompsonAddendum: id('doc-t4-thompson-add'), thompsonFills: id('doc-t4-thompson-fills'),
  robertsSummary: id('doc-t4-roberts-dc'), robertsFills: id('doc-t4-roberts-fills'), robertsOutFills: id('doc-t4-roberts-outfills'), robertsLab: id('doc-t4-roberts-lab'),
} as const;
export type DocKey = keyof typeof DOC;

export const read = (resource_type: string, rid: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type, id: rid } });
export const policy: ScriptCall = { name: 'read_policy', input: { policy_id: 'RBC-TOC-02' } };
export const findPatient = (w: Who): ScriptCall => ({ name: 'search_patients', input: { name: NAME[w] } });
export const meds = (w: Who): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'MedicationRequest', patient: PT[w] } });
// The route RBC-TOC-02 implies: each patient's documents since the admission (§1 the summary and
// any addendum, §5 the fill history, §2/§7 a filed laboratory report), then each one read whole.
export const docs = (w: Who): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'DocumentReference', patient: PT[w], date_ge: '2026-10-01', sort: '-date' } });
export const results = (w: Who): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'Observation', patient: PT[w], date_ge: '2026-10-01', sort: '-date' } });
const DOCS_OF: Record<Who, readonly DocKey[]> = {
  kim: ['kimSummary', 'kimAddendum', 'kimFills', 'kimLab'],
  stark: ['starkSummary', 'starkFills', 'starkOutFills'],
  thompson: ['thompsonSummary', 'thompsonAddendum', 'thompsonFills'],
  roberts: ['robertsSummary', 'robertsFills', 'robertsOutFills', 'robertsLab'],
};
export const readDoc = (d: DocKey): ScriptCall => read('DocumentReference', DOC[d]);
// A targeted search of one patient's notes; its rows show cut snippets of long notes.
export const searchNotes = (w: Who, query: string): ScriptCall => ({ name: 'search_notes', input: { query, patient: PT[w] } });

// The oracle's reads, turn by turn; `skip` leaves out the reads of the named documents (a reviewer
// who never opened them), `also` adds calls to the reading turn (a targeted search in place of
// a whole read), and `noResults` leaves out the named patients' Observation searches.
export function reads(skip: readonly DocKey[] = [], also: readonly ScriptCall[] = [], noResults: readonly Who[] = []): Script {
  return [
    { calls: [policy, ...WHO.map(findPatient)] },
    { calls: WHO.flatMap((w) => [meds(w), docs(w), ...(noResults.includes(w) ? [] : [results(w)])]) },
    { calls: [...WHO.flatMap((w) => DOCS_OF[w].filter((d) => !skip.includes(d)).map(readDoc)), ...also] },
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

// ---- the oracle's writes, one per item (the filler included) ----
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
  thompsonNifedipine: modify(MR.thompsonNifedipine, { value: 60, unit: 'mg', frequency: 'QD' }, "St. Brigid discharge summary 10/17: 'Procardia XL 60 mg daily' is her nifedipine ER, increased from 30 mg", RX.nifedipine60),
  thompsonHctz: change(MR.thompsonHctz, 'stop', 'Signed discharge addendum 10/17: stop hydrochlorothiazide (thiazide-associated hyponatremia); corrects the summary\'s continue'),
  thompsonLevothyroxine: message('Adelaide Thompson: levothyroxine not being filled',
    "Adelaide Thompson's discharge summary continues levothyroxine 100 mcg daily, but her fills (30 days each on 03/30, 06/11 and 08/24/2026) cover 73 of the 180 days before her 10/13 admission (41%), so she is not taking it as prescribed (inpatient TSH 7.9). Per RBC-TOC-02 §5(b) I left the order unchanged; please address adherence.",
    [`MedicationRequest/${MR.thompsonLevothyroxine}`]),
  robertsLisinopril: change(MR.robertsLisinopril, 'resume', 'Discharge summary: resume when SCr < 1.3; Northgate 10/22: SCr 1.08 and potassium 4.6, the most recent after discharge (RBC-TOC-02 §2, §7)'),
  robertsSertraline: message('Earnest Roberts: sertraline from an outside prescriber',
    "Earnest Roberts' pharmacy fill history shows sertraline 100 mg daily filled 09/08 and 10/06/2026, prescribed by Dr. Priya Nair (Lakeside Behavioral Health). It is not on our medication list and the St. Brigid discharge documents do not address it. Per RBC-TOC-02 §5(a) I did not order or change anything; please review and add it to his list if he still takes it.",
    [`DocumentReference/${DOC.robertsOutFills}`]),
} as const;
export type WriteKey = keyof typeof W;
export const WRITES: readonly WriteKey[] = Object.keys(W) as WriteKey[];

// ---- the notes (§6) ----
export const NOTE: Record<Who, string> = {
  kim:
    'Post-discharge medication reconciliation under RBC-TOC-02.\n\nSources: St. Brigid discharge summary 10/19/2026 and its signed addendum of 10/19/2026; Northgate outside lab report 10/21/2026 (potassium 5.4 mmol/L, creatinine 1.32 mg/dL); pharmacy fill history 10/20/2026.\n\n' +
    'Changes: furosemide 20 mg daily changed to 40 mg twice daily (the signed addendum corrects the summary\'s 40 mg daily). Potassium chloride stopped (summary). Lisinopril 10 mg kept on hold: the potassium of 5.4 is above 5.0 (RBC-TOC-02 §7), although SCr 1.32 meets the summary\'s resume line; Task for Dr. Okafor due 10/26 to recheck.\n\n' +
    'No change: omeprazole 20 mg kept, pantoprazole was a formulary substitution (§3); metoprolol XL is his metoprolol succinate ER 50 mg; atorvastatin 40 mg and aspirin 81 mg continued. Fills cover his prescriptions.',
  stark:
    'Post-discharge medication reconciliation under RBC-TOC-02.\n\nSources: St. Brigid discharge summary 10/20/2026; Riverbend Pharmacy and outside pharmacy fill histories 10/21/2026.\n\n' +
    "Changes: carvedilol 6.25 mg twice daily changed to 12.5 mg twice daily (summary: 'Coreg 12.5 mg twice daily', the same drug, §4).\n\n" +
    'No change: atorvastatin 80 mg (continued, but fills cover 24% of the 180 days before admission: flagged to Dr. Okafor, §5b); aspirin 81 mg and insulin 70/30 18 units twice daily continued.\n\n' +
    'Flagged to Dr. Okafor: glipizide 5 mg daily filled from Valley Endocrinology, not on the list and not addressed by the discharge documents (§5a).',
  thompson:
    'Post-discharge medication reconciliation under RBC-TOC-02.\n\nSources: St. Brigid discharge summary 10/17/2026 and its signed addendum of 10/17/2026; pharmacy fill history 10/19/2026.\n\n' +
    "Changes: nifedipine ER 30 mg daily changed to 60 mg daily (summary: 'Procardia XL 60 mg daily', the same drug, §4). Hydrochlorothiazide stopped (the signed addendum corrects the summary's continue; thiazide-associated hyponatremia).\n\n" +
    'No change: levothyroxine 100 mcg (continued, but fills cover 41% of the 180 days before admission: flagged to Dr. Okafor, §5b).',
  roberts:
    'Post-discharge medication reconciliation under RBC-TOC-02.\n\nSources: St. Brigid discharge summary 10/19/2026; Northgate outside lab report 10/22/2026 (potassium 4.6 mmol/L, creatinine 1.08 mg/dL), the most recent after the clinic draw of 10/20 (potassium 5.3); Riverbend Pharmacy and outside pharmacy fill histories 10/20/2026.\n\n' +
    'Changes: lisinopril 20 mg daily resumed: SCr 1.08 is under the summary\'s 1.3 and the most recent potassium, 4.6, is not above 5.0 (§2, §7).\n\n' +
    'No change: rosuvastatin 10 mg kept, atorvastatin was a formulary substitution (§3); insulin glargine 22 units at bedtime and insulin lispro 6 units with meals continued.\n\n' +
    'Flagged to Dr. Okafor: sertraline 100 mg daily filled from Lakeside Behavioral Health, not on the list and not addressed by the discharge documents (§5a).',
};
export const CITES: Record<Who, string[]> = {
  kim: [ref('DocumentReference/doc-t4-kim-dc'), ref('DocumentReference/doc-t4-kim-add'), ref('DocumentReference/doc-t4-kim-lab')],
  stark: [ref('DocumentReference/doc-t4-stark-dc'), ref('DocumentReference/doc-t4-stark-fills'), ref('DocumentReference/doc-t4-stark-outfills')],
  thompson: [ref('DocumentReference/doc-t4-thompson-dc'), ref('DocumentReference/doc-t4-thompson-add'), ref('DocumentReference/doc-t4-thompson-fills')],
  roberts: [ref('DocumentReference/doc-t4-roberts-dc'), ref('DocumentReference/doc-t4-roberts-lab'), ref('DocumentReference/doc-t4-roberts-fills'), ref('DocumentReference/doc-t4-roberts-outfills')],
};
export const note = (w: Who, text: string = NOTE[w], cites: string[] = CITES[w]): ScriptCall => ({
  name: 'write_note',
  input: { patient: PT[w], type: 'progress_note', title: 'Post-discharge medication reconciliation (RBC-TOC-02)', text, cites, cites_policies: ['RBC-TOC-02'] },
});
export const notes = (over: Partial<Record<Who, ScriptCall>> = {}): ScriptCall[] => WHO.map((w) => over[w] ?? note(w));
export const finish = (summary = 'Reconciled the four post-discharge patients under RBC-TOC-02; changes made, flags sent to Dr. Okafor, and a note for each.'): ScriptCall => ({ name: 'finish', input: { summary } });

// The oracle with its writes replaced: `over` maps a write to its replacement calls ([] drops it).
export function withWrites(over: Partial<Record<WriteKey, readonly ScriptCall[]>> = {}, extra: readonly ScriptCall[] = []): ScriptCall[] {
  return [...WRITES.flatMap((k) => over[k] ?? [W[k]]), ...extra];
}
export const script = (opts: { skip?: readonly DocKey[]; also?: readonly ScriptCall[]; noResults?: readonly Who[]; over?: Partial<Record<WriteKey, readonly ScriptCall[]>>; extra?: readonly ScriptCall[]; notes?: Partial<Record<Who, ScriptCall>> } = {}): Script => [
  ...reads(opts.skip, opts.also, opts.noResults),
  { calls: withWrites(opts.over, opts.extra) } as ScriptTurn,
  { calls: notes(opts.notes) },
  { calls: [finish()] },
];
