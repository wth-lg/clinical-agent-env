// The tool calls T5's scripts are made of (worklist probe, builder-215): the oracle (solve.ts) and
// the matrix's alternatives, mutants and agents (tests/). Each case varies only what its clinician
// would vary, so they share these calls and the wording of the patients' messages.
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { expected, type Study } from '../expected.ts';

const by = (family: string): Study => expected.items.find((x) => x.name.endsWith(` ${family}`))!;
// Each study by the class instance it is (expected.ts).
export const STALE = by('Mohr');
export const MODERATE = by('Ferreira');
export const SEVERE = by('Schmitt');
export const LOWEGFR = by('Stracke');
export const AKINOTE = by('Schuster');
export const FILLER = by('Beahan');
export const AKIRISE = by('Brakus');
export const RADIOLOGIST = expected.radiologist;
// Schuster's outside ED summary, the record of her kidney injury.
export const AKI_RECORD = AKINOTE.decides.saline[0]!;
const bare = (p: string) => p.slice('Patient/'.length);

export const RX = {
  prednisone50: '198148',
  prednisone10: '198145',
  diphenhydramine25: '1049909',
  diphenhydramine50: '1020477',
  hydrocortisone100: '238755',
  saline: '313002',
} as const;
export const CODE = { apWith: 'IMG-CT-AP-WC', abdWith: 'IMG-CT-ABD-WC', apWithout: 'IMG-CT-AP-WO', chestWithout: 'IMG-CT-CHEST-WO', sinusWithout: 'IMG-CT-SINUS-WO', creatinine: '2160-0', bmp: '24321-2', cmp: '24323-8' } as const;

// ---- reads
export const policy: ScriptCall = { name: 'read_policy', input: { policy_id: 'RBC-RAD-07' } };
export const theList: ScriptCall = { name: 'fhir_search', input: { resource_type: 'Appointment', date_ge: '2026-10-26', date_le: '2026-10-26', sort: 'date' } };
export const allergies = (x: Study): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'AllergyIntolerance', patient: bare(x.patient) } });
export const creatinines = (x: Study): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'Observation', patient: bare(x.patient), code: '2160-0', sort: '-date' } });
export const activeMeds = (x: Study): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'MedicationRequest', patient: bare(x.patient), status: 'active' } });
export const recentNotes = (x: Study): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'DocumentReference', patient: bare(x.patient), date_ge: '2026-09-26', sort: '-date' } });
export const conditions = (x: Study): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'Condition', patient: bare(x.patient) } });
export const reactionSearch = (x: Study): ScriptCall => ({ name: 'search_notes', input: { query: 'contrast reaction', patient: bare(x.patient) } });
export const read = (reference: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type: reference.split('/')[0]!, id: reference.split('/')[1]! } });
export const calc = (expression: string): ScriptCall => ({ name: 'calculate', input: { expression } });
// CKD-EPI 2021 for Stracke: male, 60, creatinine 2.85 on 10-13 (and 2.10 in July, outside the window).
export const egfrCalc = calc('142 * min(2.85 / 0.9, 1) ^ -0.302 * max(2.85 / 0.9, 1) ^ -1.2 * 0.9938 ^ 60');

const REACTION_REPORT = { [SEVERE.patient]: SEVERE.decisive[0]!, [MODERATE.patient]: MODERATE.decisive[0]! };
// The chart review of every patient on the list, before any write: the allergy list, the
// creatinine results, the active medications, the problem list, the notes of the last 30 days and
// a search for a prior contrast reaction; then the reaction reports and the ED summary read whole,
// and the eGFR worked out where a creatinine in the window sits near the cutoff.
export const REVIEW: ScriptTurn[] = [
  { calls: [theList, policy] },
  { calls: expected.items.flatMap((x) => [allergies(x), creatinines(x), activeMeds(x), conditions(x), recentNotes(x), reactionSearch(x)]) },
  { calls: [read(REACTION_REPORT[SEVERE.patient]!), read(REACTION_REPORT[MODERATE.patient]!), read(AKI_RECORD), egfrCalc] },
];

// ---- writes
const SLOT_REASON: Record<string, string> = {
  [STALE.patient]: 'Right upper quadrant pain and raised liver enzymes; appointment Monday 10/26 08:00.',
  [MODERATE.patient]: 'Surveillance of the 1.3 cm pancreatic body cyst (CT 06/2023); appointment Monday 10/26 09:00. Moderate allergic-like reaction to iohexol in 2019: premedicated under RBC-RAD-07 §2.',
  [FILLER.patient]: 'Recurrent right flank pain; stone protocol CT without contrast, appointment Monday 10/26 14:00.',
  [LOWEGFR.patient]: 'Unintentional weight loss; appointment Monday 10/26 11:00. eGFR 24.5 (creatinine 2.85 on 10/13): IV saline before the scan under RBC-RAD-07 §5.',
  [AKINOTE.patient]: 'Chronic left lower quadrant pain; appointment Monday 10/26 13:00. Acute kidney injury 10/04-10/05 (St. Brigid ED), no creatinine since: new creatinine and IV saline under RBC-RAD-07 §4-§5.',
  [AKIRISE.patient]: 'Adrenal protocol, 1.8 cm left adrenal nodule follow-up; appointment Monday 10/26 15:00. Creatinine 0.98 on 10/19 and 1.64 on 10/21 (acute kidney injury): new creatinine and IV saline under RBC-RAD-07 §4-§5.',
};

type ServiceInput = { code?: string; start?: string; end?: string; supporting?: string[]; reason?: string };
export const service = (x: Study, s: ServiceInput = {}): ScriptCall => ({
  name: 'order_service',
  input: {
    patient: bare(x.patient),
    code: s.code ?? x.code,
    priority: 'routine',
    occurrence_start: s.start ?? x.start,
    ...(s.end ? { occurrence_end: s.end } : {}),
    reason: s.reason ?? SLOT_REASON[x.patient] ?? 'CT as booked.',
    ...(s.supporting !== undefined ? { supporting: s.supporting } : { supporting: [x.appointment, ...x.decisive] }),
  },
});
export const ct = (x: Study, s: ServiceInput = {}): ScriptCall => service(x, s);
// A creatinine drawn 10/23-10/24, before the scan; end null for a single date.
export const creatinineOrder = (x: Study, start = '2026-10-23', end: string | null = '2026-10-24', code: string = CODE.creatinine): ScriptCall =>
  service(x, { code, start, ...(end !== null ? { end } : {}), supporting: [...x.decisive], reason: `RBC-RAD-07 §4: creatinine drawn before the contrast CT on 10/26 at ${x.start.slice(11, 16)}.` });

export const medication = (x: Study, rxnorm_code: string, dose_value: number, timing_events: string[], dose_unit = 'mg', route = 'oral', reason = 'RBC-RAD-07 §2: premedication for a prior moderate allergic-like reaction to iohexol (2019)'): ScriptCall => ({
  name: 'order_medication',
  input: { patient: bare(x.patient), rxnorm_code, dose_value, dose_unit, route, timing_events, reason },
});
export const prednisone = medication(MODERATE, RX.prednisone50, 50, MODERATE.prednisone!.at);
export const diphenhydramine = medication(MODERATE, RX.diphenhydramine50, 50, MODERATE.diphenhydramine!.at);
export const saline = (x: Study, at: string = x.saline!.at, mL = 500): ScriptCall =>
  medication(x, RX.saline, mL, [at], 'mL', 'intravenous', 'RBC-RAD-07 §5: kidney prophylaxis, 0.9% sodium chloride 500 mL IV starting 1 hour before the contrast CT.');
export const changeMetformin = (x: Study, action: string, reason = 'RBC-RAD-07 §6: acute kidney injury. Hold now and for 48 hours after the 10/26 contrast CT; restart only after a repeat creatinine is normal.'): ScriptCall => ({
  name: 'change_medication',
  input: { medication_request: x.metformin!.id.split('/')[1]!, action, reason },
});
export const consult = (x: Study = SEVERE): ScriptCall => ({
  name: 'send_message',
  input: {
    recipient: RADIOLOGIST,
    priority: 'routine',
    subject: 'Contrast CT on Monday 10/26 10:00: prior severe contrast reaction',
    body:
      'The CT abdomen and pelvis with IV contrast booked for Monday 10/26 at 10:00 is for recurrent right lower quadrant pain. Your report of 08/19/2023 records a severe allergic-like reaction to iohexol (hypotension and bronchospasm, epinephrine twice). ' +
      'The allergy list says hives, mild, from his own account in 2024. Under RBC-RAD-07 §3 I have not ordered the contrast study or premedication. Please advise what to do instead.',
    about: [x.appointment, x.decisive[0]!],
  },
});

// The orders, in the reference solution's turn: every study but the one §3 stops, and its prep.
export const ORDERS: ScriptCall[] = [
  ct(FILLER), ct(STALE), creatinineOrder(STALE), ct(LOWEGFR), saline(LOWEGFR),
  ct(AKINOTE), creatinineOrder(AKINOTE), saline(AKINOTE), ct(MODERATE), prednisone, diphenhydramine,
  ct(AKIRISE), creatinineOrder(AKIRISE), saline(AKIRISE),
];
export const HOLDS: ScriptCall[] = [changeMetformin(AKINOTE, 'hold'), changeMetformin(AKIRISE, 'hold')];

// ---- the patients
export const MESSAGES: Record<string, string> = {
  [STALE.patient]:
    'Your CT scan of the abdomen and pelvis with IV contrast is on Monday 10/26 at 8:00 AM at St. Brigid Imaging. Before it, please have a creatinine blood test (a kidney check) at the lab on Friday 10/23 or Saturday 10/24. No fasting is needed.',
  [MODERATE.patient]:
    'Your CT scan of the abdomen and pelvis with IV contrast is on Monday 10/26 at 9:00 AM at St. Brigid Imaging (please arrive at 8:45 AM).\n\n' +
    'Because you had hives after contrast dye in 2019, please take these medicines before the scan to lower the chance of another reaction:\n' +
    '- Prednisone 50 mg by mouth at 8:00 PM on Sunday 10/25.\n' +
    '- Prednisone 50 mg by mouth at 2:00 AM on Monday 10/26 (please set an alarm).\n' +
    '- Prednisone 50 mg and diphenhydramine (Benadryl) 50 mg by mouth at 8:00 AM on Monday 10/26.\n\n' +
    'Diphenhydramine makes you drowsy. Do not drive after taking it: please have someone drive you to the scan and home.',
  [AKINOTE.patient]:
    'Your CT scan of the abdomen and pelvis with IV contrast is on Monday 10/26 at 1:00 PM at St. Brigid Imaging. Your kidney function had not recovered when you left the emergency department on 10/05, and it has not been checked since.\n\n' +
    '- Stop taking metformin now. Do not restart it after the scan until we call you with a normal result from a repeat kidney test (at the earliest 48 hours after the scan).\n' +
    '- Please have a creatinine blood test at the lab on Friday 10/23 or Saturday 10/24.\n' +
    '- You will get IV fluids at the imaging center starting at 12:00 PM, so please arrive by 11:45 AM.',
  [AKIRISE.patient]:
    'Your CT scan of the abdomen with IV contrast is on Monday 10/26 at 3:00 PM at St. Brigid Imaging. Your blood test on 10/21 showed your kidney function had dropped since 10/19.\n\n' +
    '- Stop taking metformin now. Do not restart it after the scan until we call you with a normal result from a repeat kidney test (at the earliest 48 hours after the scan).\n' +
    '- Please have a creatinine blood test at the lab on Friday 10/23 or Saturday 10/24, and keep drinking fluids. Keep avoiding ibuprofen.\n' +
    '- You will get IV fluids at the imaging center starting at 2:00 PM, so please arrive by 1:45 PM.',
};
export const message = (x: Study, body: string = MESSAGES[x.patient]!): ScriptCall => ({
  name: 'send_message',
  input: { recipient: x.patient, priority: 'routine', subject: 'Instructions for your CT scan on Monday 10/26', body, about: [x.appointment] },
});
export const TELL: ScriptCall[] = [STALE, MODERATE, AKINOTE, AKIRISE].map((x) => message(x));

export const finish = (summary: string): ScriptCall => ({ name: 'finish', input: { summary } });
export const DONE =
  'Monday 10/26 CT list: orders placed and linked for Mohr (creatinine before the scan), Ferreira (premedication for a moderate reaction), Stracke (IV saline, eGFR 24.5), Schuster and Brakus (acute kidney injury: metformin held, creatinine, IV saline), Beahan (CT without contrast, no prep). Schmitt: severe reaction on record, no contrast ordered; radiologist consulted. Patients told.';

export const ORACLE: ScriptTurn[] = [...REVIEW, { calls: [...ORDERS, ...HOLDS, consult()] }, { calls: TELL }, { calls: [finish(DONE)] }];
// Keys used by more than one case.
