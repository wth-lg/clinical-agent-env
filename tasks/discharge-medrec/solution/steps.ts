// The tool calls T4's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). Each case varies only what its clinician would vary, so they
// share these calls and the note's and message's wording.
import type { ScriptCall } from '../../../packages/grader/matrix/types.ts';

export const PT = 'pt-0005';
export const RX = {
  furosemide20: '310429', furosemide40: '313988', spironolactone25: '313096', spironolactone50: '198223', lisinopril10: '314076',
  metoprololSucc50: '866436', pantoprazole40: '314200',
} as const;
export const MR = {
  furosemide: 'mr-t4-furosemide', lisinopril: 'mr-t4-lisinopril', kcl: 'mr-t4-kcl', succ: 'mr-t4-metoprolol-succ', tart: 'mr-t4-metoprolol-tart', omeprazole: 'mr-t4-omeprazole', atorvastatin: 'mr-t4-atorvastatin',
} as const;

export const findPatient: ScriptCall = { name: 'search_patients', input: { name: 'walter kim' } };
export const allMeds: ScriptCall = { name: 'fhir_search', input: { resource_type: 'MedicationRequest', patient: PT } };
export const summaries: ScriptCall = { name: 'search_notes', input: { query: 'discharge medications', patient: PT, type: 'discharge-summary' } };
export const read = (resource_type: string, id: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type, id } });
export const summary = read('DocumentReference', 'doc-t4-dc-1019');
export const addendum = read('DocumentReference', 'doc-t4-dc-1019-add');
export const scr: ScriptCall = { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT, code: '2160-0', sort: '-date' } };
export const policy: ScriptCall = { name: 'read_policy', input: { policy_id: 'RBC-TOC-02' } };

type Dose = { value: number; unit: string; frequency: string };
export const modify = (request: string, new_dose: Dose, reason: string, medication_code?: string): ScriptCall => ({
  name: 'change_medication',
  input: { medication_request: request, action: 'modify', reason, new_dose, ...(medication_code ? { medication_code } : {}) },
});
export const change = (request: string, action: string, reason: string): ScriptCall => ({ name: 'change_medication', input: { medication_request: request, action, reason } });
export const order = (rxnorm_code: string, dose_value: number, frequency: string, reason: string, replaces?: string, dose_unit = 'mg'): ScriptCall => ({
  name: 'order_medication',
  input: { patient: PT, rxnorm_code, dose_value, dose_unit, route: 'oral', frequency, reason, ...(replaces ? { replaces } : {}) },
});

export const furosemideUp = modify(MR.furosemide, { value: 40, unit: 'mg', frequency: 'QD' }, 'St. Brigid discharge summary 10/19: furosemide increased to 40 mg daily', RX.furosemide40);
export const spironolactone = order(RX.spironolactone25, 25, 'QD', 'Signed addendum 10/19: spironolactone 25 mg daily (corrects 12.5 mg)');
export const kclStop = change(MR.kcl, 'stop', 'St. Brigid discharge summary 10/19: stop potassium chloride');
export const lisinoprilResume = change(MR.lisinopril, 'resume', 'Discharge summary: resume when SCr < 1.5; SCr 1.32 on 10/21');
// A potassium and creatinine recheck (BMP) for 2026-10-26 to 2026-10-28, a week after spironolactone
// is started with lisinopril resumed (the discharge summary asks for a BMP a week after starting
// spironolactone; P17j JG9, decisions 2026-10-28T02:10Z).
export const bmpRecheck: ScriptCall = {
  name: 'order_service',
  input: { patient: PT, code: '24321-2', priority: 'routine', occurrence_start: '2026-10-26', occurrence_end: '2026-10-28', reason: 'BMP (potassium, creatinine) 1 week after starting spironolactone with lisinopril resumed' },
};
export const writes = [furosemideUp, spironolactone, kclStop, lisinoprilResume, bmpRecheck];

export const MESSAGE =
  'Walter Kim has two beta-blockers on his outpatient list: metoprolol succinate ER 50 mg daily, which the St. Brigid discharge documents continue as "metoprolol XL", ' +
  'and metoprolol tartrate 25 mg twice daily (since 2023), which no discharge document mentions. Taking both is a duplicate beta-blocker. Per RBC-TOC-02 §5 I left the tartrate unchanged; please review.';
export const message = (body: string = MESSAGE, about: string[] = [`MedicationRequest/${MR.tart}`]): ScriptCall => ({
  name: 'send_message',
  input: { recipient: 'Practitioner/pr-okafor', priority: 'routine', subject: 'Walter Kim: duplicate beta-blocker after discharge reconciliation', body, about },
});

export interface NoteFacts { sources: string; changes: string; kept: string; flagged: string }
export const ORACLE_NOTE: NoteFacts = {
  sources: 'Sources: St. Brigid Regional discharge summary of 10/19/2026 and its signed addendum of 10/19/2026 (RBC-TOC-02 §1); creatinine 1.32 mg/dL on 10/21/2026.',
  changes:
    'Changes: furosemide increased from 20 mg to 40 mg daily (discharge summary). Spironolactone 25 mg daily started (signed addendum, which corrects the summary\'s 12.5 mg). ' +
    'Potassium chloride stopped (discharge summary). Lisinopril 10 mg daily resumed: the summary resumes it when SCr is below 1.5, and SCr was 1.32 on 10/21 (discharge summary; lab 10/21).',
  kept: 'No change: metoprolol XL is his metoprolol succinate ER 50 mg daily; atorvastatin 40 mg continued; omeprazole 20 mg kept because pantoprazole was a formulary substitution (RBC-TOC-02 §3).',
  flagged: 'Flagged to Dr. Okafor: metoprolol tartrate 25 mg twice daily is not in the discharge documents, a duplicate beta-blocker; left unchanged (RBC-TOC-02 §5).',
};
export const noteText = (f: NoteFacts) => ['Post-discharge medication reconciliation under RBC-TOC-02.', f.sources, f.changes, f.kept, f.flagged].join('\n\n');
export const CITES = ['DocumentReference/doc-t4-dc-1019', 'DocumentReference/doc-t4-dc-1019-add', 'Observation/obs-t4-scr-1021'];
export const note = (f: Partial<NoteFacts> = {}, cites: string[] = CITES): ScriptCall => ({
  name: 'write_note',
  input: { patient: PT, type: 'progress_note', title: 'Discharge medication reconciliation (RBC-TOC-02)', text: noteText({ ...ORACLE_NOTE, ...f }), cites, cites_policies: ['RBC-TOC-02'] },
});
export const finish = (summary = 'Reconciled Walter Kim after discharge: furosemide 40 mg, spironolactone 25 mg started, KCl stopped, lisinopril resumed; duplicate metoprolol tartrate flagged to Dr. Okafor; note written.'): ScriptCall => ({ name: 'finish', input: { summary } });

export const reads = [{ calls: [findPatient] }, { calls: [allMeds, summaries, policy] }, { calls: [summary, addendum, scr] }];
