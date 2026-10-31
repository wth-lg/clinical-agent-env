// The tool calls T1's scripts are made of (worklist probe, builder-211): the oracle (solve.ts) and
// the matrix's alternatives, mutants and agents (tests/). The oracle takes the route RBC-PHARM-07
// implies, one patient at a time: the policy and the review list first; then, per patient, the
// Patient (age), the active orders (the DOAC and any inhibitor), the recent laboratory results of
// every code (an outside creatinine in umol/L is under its own code), the measured weights, and the
// notes of the last 90 days (an outside clinic's letter), reading a letter from outside the clinic;
// then the change and its note. Each case varies only what its clinician would vary.
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { id, ref } from '../ids.ts';

export const RX = {
  apixaban2_5: '1364435',
  apixaban5: '1364445',
  rivaroxaban15: '1232082',
  rivaroxaban20: '1232086',
} as const;

export const policy: ScriptCall = { name: 'read_policy', input: { policy_id: 'RBC-PHARM-07' } };
export const groups: ScriptCall = { name: 'fhir_search', input: { resource_type: 'Group' } };
export const group: ScriptCall = { name: 'fhir_read', input: { resource_type: 'Group', id: id('grp-t1-doac') } };
export const read = (resource_type: string, rid: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type, id: rid } });
export const search = (resource_type: string, patient: string, more: { [k: string]: string | number } = {}): ScriptCall => ({ name: 'fhir_search', input: { resource_type, patient, ...more } });
export const calc = (expression: string): ScriptCall => ({ name: 'calculate', input: { expression } });
export const finish = (summary: string): ScriptCall => ({ name: 'finish', input: { summary } });

// One patient's reads, as §1 lists the inputs.
export const patientRead = (p: string): ScriptCall => read('Patient', p);
export const activeMeds = (p: string): ScriptCall => search('MedicationRequest', p, { status: 'active' });
export const labs = (p: string): ScriptCall => search('Observation', p, { category: 'laboratory', date_ge: '2026-04-01', sort: '-date' });
export const clinicScr = (p: string): ScriptCall => search('Observation', p, { code: '2160-0', sort: '-date' });
export const weights = (p: string): ScriptCall => search('Observation', p, { code: '29463-7', sort: '-date' });
export const weightsOldestFirst = (p: string): ScriptCall => search('Observation', p, { code: '29463-7' });
export const allVitals = (p: string): ScriptCall => search('Observation', p, { category: 'vital-signs', date_ge: '2026-04-01', sort: '-date' });
export const recentNotes = (p: string): ScriptCall => search('DocumentReference', p, { date_ge: '2026-07-25', sort: '-date' });
export const reads = (p: string): ScriptCall[] => [patientRead(p), activeMeds(p), labs(p), weights(p), recentNotes(p)];

type Dose = { value: number; unit: string; frequency: string };
export const modify = (request: string, new_dose: Dose, reason: string, medication_code?: string): ScriptCall => ({
  name: 'change_medication',
  input: { medication_request: request, action: 'modify', reason, new_dose, ...(medication_code ? { medication_code } : {}) },
});
export const stop = (request: string, reason: string): ScriptCall => ({ name: 'change_medication', input: { medication_request: request, action: 'stop', reason } });
export const order = (patient: string, rxnorm_code: string, dose_value: number, frequency: string, reason: string, replaces?: string): ScriptCall => ({
  name: 'order_medication',
  input: { patient, rxnorm_code, dose_value, dose_unit: 'mg', route: 'oral', frequency, reason, ...(replaces ? { replaces } : {}) },
});
export const note = (patient: string, text: string, cites: string[]): ScriptCall => ({
  name: 'write_note',
  input: { patient, type: 'progress_note', title: 'DOAC dose review (RBC-PHARM-07)', text, cites, cites_policies: ['RBC-PHARM-07'] },
});

// The list, by family name (overlay.ts PANEL), with what the oracle does for each.
export interface Case {
  patient: string;
  name: string;
  // Extra reads after the first read turn (a letter from outside the clinic).
  more?: ScriptCall[];
  calcs: ScriptCall[];
  // The change, or none when the dose is right.
  change?: ScriptCall;
  note?: { text: string; cites: string[] };
}

const apixabanTo = (request: string, mg: 2.5 | 5, why: string) => modify(request, { value: mg, unit: 'mg', frequency: 'BID' }, why, mg === 2.5 ? RX.apixaban2_5 : RX.apixaban5);
const rivaroxabanTo = (request: string, mg: 15 | 20, why: string) => modify(request, { value: mg, unit: 'mg', frequency: 'QD' }, why, mg === 15 ? RX.rivaroxaban15 : RX.rivaroxaban20);

export const CASES: Record<string, Case> = {
  ashworth: {
    patient: 'pt-0040', name: 'Dorothy Ashworth',
    calcs: [calc('150 / 88.4')],
    change: apixabanTo(id('mr-t1-1601'), 2.5, 'RBC-PHARM-07 §2: age 83 and SCr 1.70 mg/dL (150 umol/L, St. Brigid 10/15/2026): two criteria'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 150 umol/L at St. Brigid on 10/15/2026 = 1.70 mg/dL (newer than the clinic\'s 1.28 mg/dL of 8/11); weight 68.0 kg (10/2); age 83. §2: age 80 or older and SCr 1.5 or higher, two criteria: apixaban reduced from 5 mg to 2.5 mg twice daily.', cites: [ref('Observation/obs-t1-1603'), ref('Observation/obs-t1-1604')] },
  },
  bauer: {
    patient: 'pt-0039', name: 'Clarence Bauer',
    calcs: [calc('(140 - 81) * 59.0 / (72 * 1.10)')],
    change: rivaroxabanTo(id('mr-t1-1501'), 15, 'RBC-PHARM-07 §3: CrCl 44 mL/min (Cockcroft-Gault, measured weight 59.0 kg, SCr 1.10)'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 1.10 mg/dL (10/14/2026); measured weight 59.0 kg (10/14); the 168 lb of 10/21 is his estimate by phone, not a measured weight; age 81. §3: CrCl (140 - 81) x 59.0 / (72 x 1.10) = 44 mL/min, 50 or lower: rivaroxaban reduced from 20 mg to 15 mg once daily with the evening meal.', cites: [ref('Observation/obs-t1-1503'), ref('Observation/obs-t1-1504')] },
  },
  delgado: {
    patient: 'pt-0003', name: 'Frank Delgado',
    calcs: [calc('(140 - 76) * 90.0 / (72 * (160 / 88.4))')],
    change: rivaroxabanTo(id('mr-t1-1301'), 15, 'RBC-PHARM-07 §3: CrCl 44 mL/min (SCr 160 umol/L = 1.81 mg/dL at St. Brigid, weight 90.0 kg)'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 160 umol/L at St. Brigid on 10/19/2026 = 1.81 mg/dL (newer than the clinic\'s 1.30 mg/dL of 7/21); weight 90.0 kg (10/21); age 76. §3: CrCl (140 - 76) x 90.0 / (72 x 1.81) = 44 mL/min, 50 or lower: rivaroxaban reduced from 20 mg to 15 mg once daily with the evening meal.', cites: [ref('Observation/obs-t1-1304'), ref('Observation/obs-t1-1302')] },
  },
  duquette: {
    patient: 'pt-0041', name: 'Raymond Duquette',
    calcs: [],
    change: apixabanTo(id('mr-t1-1701'), 2.5, 'RBC-PHARM-07 §2: no dose criterion, but itraconazole (combined P-gp and strong CYP3A4 inhibitor) started 10/6/2026'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 0.98 mg/dL (8/19/2026); weight 84.0 kg; age 70; itraconazole 200 mg daily ordered by dermatology on 10/6. §2: no dose criterion met (5 mg), but itraconazole is a combined P-gp and strong CYP3A4 inhibitor: apixaban reduced from 5 mg to 2.5 mg twice daily for as long as he takes it. Itraconazole not changed.', cites: [ref('Observation/obs-t1-1701'), ref('Observation/obs-t1-1702'), ref('MedicationRequest/mr-t1-1703')] },
  },
  kowalczyk: {
    patient: 'pt-0001', name: 'Walter Kowalczyk',
    calcs: [],
    change: apixabanTo(id('mr-t1-1101'), 2.5, 'RBC-PHARM-07 §2: age 84 and weight 57.6 kg (10/14/2026): two criteria'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): most recent measured weight 57.6 kg (10/14/2026; 62.4 kg in April); SCr 1.18 mg/dL (10/14); age 84. §2: age 80 or older and weight 60 kg or less, two criteria: apixaban reduced from 5 mg to 2.5 mg twice daily.', cites: [ref('Observation/obs-t1-1103'), ref('Observation/obs-t1-1105')] },
  },
  lindahl: {
    patient: 'pt-0045', name: 'Gregory Lindahl',
    more: [read('DocumentReference', id('doc-t1-1901'))],
    calcs: [],
    change: apixabanTo(id('mr-t1-1901'), 2.5, 'RBC-PHARM-07 §2: no dose criterion, but ritonavir-boosted darunavir per the St. Brigid ID letter of 9/18/2026'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 1.02 mg/dL (10/2/2026); weight 78.0 kg; age 66. The St. Brigid infectious disease letter of 9/18/2026 lists darunavir 800 mg with ritonavir 100 mg daily. §2: no dose criterion met (5 mg), but ritonavir is a combined P-gp and strong CYP3A4 inhibitor: apixaban reduced from 5 mg to 2.5 mg twice daily. Antiretrovirals not changed.', cites: [ref('Observation/obs-t1-1901'), ref('Observation/obs-t1-1902'), ref('DocumentReference/doc-t1-1901')] },
  },
  moravec: {
    patient: 'pt-0038', name: 'Eugene Moravec',
    calcs: [calc('(140 - 79) * 96.0 / (72 * 1.45)')],
    change: rivaroxabanTo(id('mr-t1-1401'), 20, 'RBC-PHARM-07 §3: CrCl 56 mL/min on actual body weight 96.0 kg (SCr 1.45)'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 1.45 mg/dL (10/9/2026); measured weight 96.0 kg (10/9); age 79. §3: CrCl on actual body weight (140 - 79) x 96.0 / (72 x 1.45) = 56 mL/min, above 50; the May reduction used ideal body weight, which §3 does not allow: rivaroxaban increased from 15 mg to 20 mg once daily with the evening meal.', cites: [ref('Observation/obs-t1-1404'), ref('Observation/obs-t1-1405')] },
  },
  pellegrino: {
    patient: 'pt-0043', name: 'Marjorie Pellegrino',
    calcs: [calc('(140 - 75) * 71.0 / (72 * 0.92) * 0.85')],
  },
  vance: {
    patient: 'pt-0002', name: 'Harold Vance',
    calcs: [calc('143 * 0.45359237')],
    change: apixabanTo(id('mr-t1-apixaban'), 5, 'RBC-PHARM-07 §2: one criterion (age 82); weight 64.9 kg and SCr 1.21 (10/20/2026)'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 1.21 mg/dL (10/20/2026); measured weight 143 lb = 64.9 kg (10/20); age 82. The February values (57.0 kg, SCr 1.71) that set 2.5 mg at discharge are no longer current. §2: one criterion (age): apixaban increased from 2.5 mg to 5 mg twice daily.', cites: [ref('Observation/obs-t1-wt-1020'), ref('Observation/obs-t1-scr-1020')] },
  },
};

export const ORDER = ['ashworth', 'bauer', 'delgado', 'duquette', 'kowalczyk', 'lindahl', 'moravec', 'pellegrino', 'vance'] as const;
export type Label = (typeof ORDER)[number];

export const DONE =
  'Reviewed the 9 patients on the DOAC dose review list under RBC-PHARM-07. Changed: Ashworth apixaban 5 -> 2.5 mg BID (outside SCr 1.70); Bauer rivaroxaban 20 -> 15 mg daily (CrCl 44); ' +
  'Delgado rivaroxaban 20 -> 15 mg daily (outside SCr 1.81, CrCl 44); Duquette apixaban 5 -> 2.5 mg BID (itraconazole); Kowalczyk apixaban 5 -> 2.5 mg BID (age 84, 57.6 kg); ' +
  'Lindahl apixaban 5 -> 2.5 mg BID (ritonavir); Moravec rivaroxaban 15 -> 20 mg daily (CrCl 56 on actual weight); Vance apixaban 2.5 -> 5 mg BID (one criterion). Pellegrino unchanged (CrCl 59). A progress note on each changed chart.';

// One patient's turns: the reads, any extra reads, then calculations, the change and its note.
// `vary` replaces parts for a case.
export interface Vary {
  reads?: ScriptCall[];
  more?: ScriptCall[];
  calcs?: ScriptCall[];
  // null drops the change (and its note).
  change?: ScriptCall[] | null;
  note?: ScriptCall[] | null;
}
export function patientTurns(label: Label, vary: Vary = {}): ScriptTurn[] {
  const c = CASES[label]!;
  const more = vary.more ?? c.more ?? [];
  const change = vary.change === null ? [] : (vary.change ?? (c.change ? [c.change] : []));
  const noteCalls = vary.note === null || vary.change === null ? [] : (vary.note ?? (c.note ? [note(c.patient, c.note.text, c.note.cites)] : []));
  const calcs = vary.calcs ?? c.calcs;
  return [
    { calls: vary.reads ?? reads(c.patient) },
    ...(more.length > 0 ? [{ calls: more }] : []),
    ...(calcs.length > 0 || change.length > 0 ? [{ calls: [...calcs, ...change] }] : []),
    ...(noteCalls.length > 0 ? [{ calls: noteCalls }] : []),
  ];
}

export const START: ScriptTurn[] = [{ calls: [policy, groups] }, { calls: [group] }];

// The whole review, with one patient's turns varied.
export function review(vary: Partial<Record<Label, Vary>> = {}, summary = DONE): ScriptTurn[] {
  return [...START, ...ORDER.flatMap((l) => patientTurns(l, vary[l])), { calls: [finish(summary)] }];
}
