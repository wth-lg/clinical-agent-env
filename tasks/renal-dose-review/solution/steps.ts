// The tool calls T1's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). Each case varies only what its clinician would vary, so they
// share these calls and the note's wording.
import type { ScriptCall } from '../../../packages/grader/matrix/types.ts';

export const PT = 'pt-0002';
export const RX = {
  apixaban2_5: '1364435',
  apixaban5: '1364445',
  metformin500: '861007',
  metforminEr500: '860975',
  gabapentin100: '310430',
  gabapentin300: '310431',
  gabapentin400: '310432',
  atorvastatin20: '617310',
} as const;

export const findPatient: ScriptCall = { name: 'search_patients', input: { mrn: '4410-22' } };
export const activeMeds: ScriptCall = { name: 'fhir_search', input: { resource_type: 'MedicationRequest', patient: PT, status: 'active' } };
export const observations = (code: string, more: { sort?: string; count?: number } = { sort: '-date' }): ScriptCall => ({
  name: 'fhir_search',
  input: { resource_type: 'Observation', patient: PT, code, ...more },
});
export const scrResults = observations('2160-0');
// Every result of his, newest first, as the pilot-0 trials searched: it shows the stated weight
// (3142-7) of 10/22 above the measured one of 10/20.
export const allObservations: ScriptCall = { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT, sort: '-date', count: 50 } };
// The pharmacist's flag (doc-t1-rx-1021), found as the pilot-0 trials searched the notes.
export const apixabanNotes: ScriptCall = { name: 'search_notes', input: { query: 'apixaban dose', patient: PT } };
export const weights = observations('29463-7');
export const policy: ScriptCall = { name: 'read_policy', input: { policy_id: 'RBC-PHARM-07' } };
export const read = (resource_type: string, id: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type, id } });
export const calc = (expression: string): ScriptCall => ({ name: 'calculate', input: { expression } });
export const egfrCalc = calc('142 * (1.21 / 0.9)^(-1.2) * 0.9938^82');
export const crclCalc = calc('(140 - 82) * 143 * 0.45359237 / (72 * 1.21)');

type Dose = { value: number; unit: string; frequency: string };
export const modify = (request: string, new_dose: Dose, reason: string, medication_code?: string): ScriptCall => ({
  name: 'change_medication',
  input: { medication_request: request, action: 'modify', reason, new_dose, ...(medication_code ? { medication_code } : {}) },
});
export const stop = (request: string, reason: string): ScriptCall => ({ name: 'change_medication', input: { medication_request: request, action: 'stop', reason } });
export const order = (rxnorm_code: string, dose_value: number, frequency: string, reason: string, replaces?: string): ScriptCall => ({
  name: 'order_medication',
  input: { patient: PT, rxnorm_code, dose_value, dose_unit: 'mg', route: 'oral', frequency, reason, ...(replaces ? { replaces } : {}) },
});

// The pilot path (P19 lever, researcher-16 T1): §2's three criteria applied without the
// indication, one met (age), so apixaban raised to 5 mg. A mutant now: the order is the
// extended-phase dose after pulmonary embolism, which §2 does not cover.
export const apixabanUp = modify('mr-t1-apixaban', { value: 5, unit: 'mg', frequency: 'BID' }, 'RBC-PHARM-07 §2: one dose criterion met (age); back to 5 mg twice daily', RX.apixaban5);
// The extended-phase hematology letter of 2/5/2026 (doc-t1-heme-0205), found as the pilot
// trials searched the notes.
export const hemeLetter = read('DocumentReference', 'doc-t1-heme-0205');
export const gabapentinBid = modify('mr-t1-gabapentin', { value: 600, unit: 'mg', frequency: 'BID' }, 'RBC-PHARM-07 §4: CrCl 43 mL/min, 400-1400 mg/day twice daily');
// Gabapentin on the 300 mg capsule (600 mg a dose unless given) at explicit administration times,
// replacing the TID order.
export const gabapentinEvents = (timing_events: string[], dose_value = 600): ScriptCall => ({
  name: 'order_medication',
  input: { patient: PT, rxnorm_code: RX.gabapentin300, dose_value, dose_unit: 'mg', route: 'oral', timing_events, reason: 'RBC-PHARM-07 §4: CrCl 43 mL/min, 400-1400 mg/day twice daily', replaces: 'mr-t1-gabapentin' },
});

// The note's paragraphs; a case overrides the ones its clinician writes differently.
export interface NoteFacts {
  inputs: string;
  apixaban: string;
  metformin: string;
  gabapentin: string;
  others: string;
}

export const ORACLE_NOTE: NoteFacts = {
  inputs:
    'Inputs (§1): current SCr 1.21 mg/dL (10/20/2026). The SCr of 1.88 mg/dL dated 10/21/2026 was entered in error (specimen mislabelled, belongs to another patient) and was not used. ' +
    'Weight 143 lb = 64.9 kg (10/20/2026); the 57.0 kg inpatient weight from February is stale. Age 82.',
  apixaban:
    'Apixaban (§2): his apixaban is for a history of pulmonary embolism, the extended-phase dose after 6 months of treatment, not for non-valvular atrial fibrillation. ' +
    '§2 applies only to non-valvular atrial fibrillation, so its dose criteria do not apply and the policy does not cover this order: apixaban 2.5 mg twice daily continued unchanged.',
  metformin: 'Metformin (§3): eGFR 59.8 mL/min/1.73 m2 by CKD-EPI 2021, 45 or higher: no change to metformin 1000 mg twice daily.',
  gabapentin:
    'Gabapentin (§4): CrCl 43.2 mL/min by Cockcroft-Gault with actual weight, in the 30 to 59 band: 400 to 1400 mg per day, twice daily. ' +
    'Reduced from 600 mg three times daily (1800 mg/day) to 600 mg twice daily (1200 mg/day).',
  others: 'Atorvastatin, metoprolol, amlodipine, acetaminophen and nitroglycerin are not covered by the policy and were not changed.',
};

export const noteText = (f: NoteFacts): string =>
  ['Renal and age dose review under RBC-PHARM-07, after the pharmacy flag on this week\'s labs.', f.inputs, f.apixaban, f.metformin, f.gabapentin, f.others].join('\n\n');

export const CITES = ['Observation/obs-t1-scr-1020', 'Observation/obs-t1-wt-1020'];

export const note = (f: Partial<NoteFacts> = {}, cites: string[] = CITES, patient = PT): ScriptCall => ({
  name: 'write_note',
  input: { patient, type: 'progress_note', title: 'Renal and age dose review (RBC-PHARM-07)', text: noteText({ ...ORACLE_NOTE, ...f }), cites, cites_policies: ['RBC-PHARM-07'] },
});

export const finish = (summary: string): ScriptCall => ({ name: 'finish', input: { summary } });
export const DONE = 'Reviewed Harold Vance under RBC-PHARM-07: apixaban 2.5 mg twice daily unchanged (extended phase after pulmonary embolism, not covered by §2), metformin unchanged, gabapentin reduced to 600 mg twice daily; progress note written.';
