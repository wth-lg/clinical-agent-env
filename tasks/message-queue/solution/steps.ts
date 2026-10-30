// The tool calls T6's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). Each case varies only what its clinician would vary, so they
// share these calls and the wording of the messages.
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';

export const PT = { hayes: 'pt-0026', odum: 'pt-0027', park: 'pt-0028', brooks: 'pt-0029', price: 'pt-0030', webb: 'pt-0031' } as const;
export const RX = { lisinopril20: '314077', lisinopril10: '314076', atorvastatin40: '617311', rosuvastatin10: '859747', metformin1000: '861004', metformin500: '861007', amoxClav: '562508', amoxicillin: '723', penicillin: '764146007', doxycycline: '1650143' } as const;
export const REACTION_NOTE = 'DocumentReference/doc-t6-park-240309';
// Lena Park's notes since 2023-10-23, oldest first.
export const PARK_RECENT = ['231120', '240309', '240520', '240930', '250127', '250519', '250804', '251117', '260209', '260518', '260727', '261022'].map((d) => `doc-t6-park-${d}`);

export const call = (name: string, input: ScriptCall['input']): ScriptCall => ({ name, input });
export const inbox = call('list_inbox', { queue: 'messages', status: 'requested' });
export const read = (resource_type: string, id: string) => call('fhir_read', { resource_type, id });
export const readMessage = (n: number) => read('Communication', `comm-t6-m${n}`);
export const policy = (id: string) => call('read_policy', { policy_id: id });
export const search = (resource_type: string, patient: string, more: ScriptCall['input'] = {}) => call('fhir_search', { resource_type, patient, ...more });
export const notes = (query: string, patient: string) => call('search_notes', { query, patient });
export const finish = (summary: string) => call('finish', { summary });

export const task = (patient: string, owner: string, priority: string, description: string, focus?: string, due = '2026-10-30') =>
  call('create_task', { patient, owner, due, priority, description, ...(focus ? { focus } : {}) });
export const message = (recipient: string, priority: string, subject: string, body: string, about: string[] = []) => call('send_message', { recipient, priority, subject, body, about });
export const close = (n: number, linked: string[] = [], comment?: string) => call('update_inbox_item', { task_id: `task-t6-m${n}`, action: 'complete', ...(linked.length ? { linked } : {}), ...(comment ? { comment } : {}) });
export const refill = (patient: string, rxnorm_code: string, dose_value: number, frequency: string, supply_days: number, refills: number, reason: string, dose_unit = 'mg') =>
  call('order_medication', { patient, rxnorm_code, dose_value, dose_unit, route: 'oral', frequency, supply_days, refills, reason });
export const bmpOrder = (patient: string, code = '24321-2') => call('order_service', { patient, code, priority: 'routine', occurrence_start: '2026-10-23', occurrence_end: '2026-11-06', reason: 'RBC-RX-05 §1: BMP for lisinopril monitoring, last 09/08/2025' });

// ---- M3: red flag, first ----
export const M3_BODY =
  'Black stools and lightheadedness while you take Eliquis (apixaban) can mean bleeding in the stomach or bowel. Please go to the emergency department now, or call 911 if you feel faint. ' +
  'Stop taking the naproxen. Do not take another Eliquis dose until the emergency team has seen you. Our triage nurse will call you shortly.';
export const m3Task = task(PT.brooks, 'Group/pool-rn-triage', 'stat', 'Red flag (RBC-TRI-02): black stools and orthostatic lightheadedness on apixaban and naproxen. Advised ED now; please call her.', 'Communication/comm-t6-m3', '2026-10-23T09:00:00-04:00');
export const m3Message = (body = M3_BODY, priority = 'urgent') => message(`Patient/${PT.brooks}`, priority, 'Please go to the emergency department now', body, ['Communication/comm-t6-m3']);
export const M3: ScriptTurn[] = [{ calls: [readMessage(3), policy('RBC-TRI-02')] }, { calls: [m3Task, m3Message()] }];

// ---- M1 before P19: the stale BMP and the visit, a 30-day bridge and a BMP (the wrong path now) ----
export const M1_OLD_READS: ScriptTurn = { calls: [readMessage(1), policy('RBC-RX-05'), search('Observation', PT.hayes, { code: '24321-2', sort: '-date' }), search('Encounter', PT.hayes, { status: 'finished', sort: '-date' })] };
export const m1Bridge = refill(PT.hayes, RX.lisinopril20, 20, 'QD', 30, 0, 'RBC-RX-05 §1: last BMP 09/08/2025, over 12 months; visit 03/17/2026. 30-day bridge.');
export const m1BridgeReply = message(`Patient/${PT.hayes}`, 'routine', 'Your lisinopril refill', 'I sent a 30-day supply of lisinopril 20 mg to your pharmacy. Your yearly blood test (BMP) is due: I ordered it, please have it drawn at our lab in the next two weeks so we can renew for longer.');

// ---- M1: an outside BMP with a high potassium ----
export const HAYES_LAB = 'DocumentReference/doc-t6-hayes-0708';
export const M1_LOOK: ScriptTurn = { calls: [readMessage(1), policy('RBC-RX-05'), search('Observation', PT.hayes, { code: '24321-2', sort: '-date' }), search('DocumentReference', PT.hayes, { sort: '-date' })] };
export const M1_REPORT: ScriptTurn = { calls: [read('DocumentReference', 'doc-t6-hayes-0708')] };
export const m1Task = (owner = 'Practitioner/pr-okafor', focus = 'MedicationRequest/mr-t6-lisinopril') =>
  task(PT.hayes, owner, 'urgent', 'Refill request for lisinopril 20 mg, not refilled (RBC-RX-05 §1): the St. Brigid pre-admission BMP of 07/08/2026 shows potassium 5.8 mmol/L (H, specimen not hemolyzed) and creatinine 1.12 mg/dL (0.82 on 09/08/2025). Out of lisinopril since about 10/15. Please review.', focus, '2026-10-26');
export const M1_REPLY_BODY = 'I have not refilled your lisinopril for now. A blood test from St. Brigid in July showed a high potassium level, and Dr. Okafor will contact you about it and about your blood pressure medicine. Please keep taking your amlodipine.';
export const m1HoldReply = (priority = 'routine') => message(`Patient/${PT.hayes}`, priority, 'Your lisinopril refill', M1_REPLY_BODY);
export const m1PcpTask = m1Task();
export const m1Reply = m1HoldReply();
export const M1: ScriptTurn[] = [M1_LOOK, M1_REPORT, { calls: [m1PcpTask, m1Reply] }];

// ---- M2: conflict in a note ----
export const M2_READS: ScriptTurn = { calls: [readMessage(2), notes('atorvastatin', PT.odum), read('DocumentReference', 'doc-t6-odum-0811')] };
export const m2Task = task(PT.odum, 'Practitioner/pr-okafor', 'routine', 'Refill request for atorvastatin, but St. Brigid cardiology (08/11/2026) stopped it for myalgias and started rosuvastatin 10 mg. Not refilled (RBC-RX-05 §3). Please reconcile the medication list.', 'MedicationRequest/mr-t6-atorvastatin');
export const m2Reply = message(`Patient/${PT.odum}`, 'routine', 'Your cholesterol medicine', 'Your cardiologist stopped atorvastatin in August and started rosuvastatin 10 mg instead, so I did not refill atorvastatin. Please keep taking rosuvastatin. Dr. Okafor will review your medication list.');

// ---- M4: the reaction in a scanned note ----
export const M4_READS: ScriptTurn[] = [
  { calls: [readMessage(4), policy('RBC-CP-11'), policy('RBC-MED-04')] },
  { calls: [search('AllergyIntolerance', PT.park), search('DocumentReference', PT.park, { date_ge: '2023-10-23', count: 50 })] },
  { calls: PARK_RECENT.map((id) => read('DocumentReference', id)) },
];
export const parkAllergy = (substance_code: string = RX.amoxClav, criticality = 'high', reactions: ScriptCall['input'][] = [{ manifestation_code: '126485001', severity: 'severe' }, { manifestation_code: '41291007', severity: 'severe' }]) =>
  call('record_allergy', { patient: PT.park, substance_code, category: 'medication', type: 'allergy', criticality, verification: 'unconfirmed', reactions, source: REACTION_NOTE });
export const nkdaInactive = (field: 'clinical_status' | 'verification' = 'clinical_status', value = 'inactive') => call('record_allergy', { patient: PT.park, update_id: 'alg-t6-park-nkda', [field]: value });
export const REYES_BODY =
  'I did not send amoxicillin-clavulanate for Lena Park. A scanned St. Brigid urgent-care record from 03/09/2024 documents diffuse hives and lip and throat swelling about 20 minutes after a first dose of Augmentin, treated with IM epinephrine. ' +
  'I recorded it as an allergy (unconfirmed, high criticality) and marked the NKDA entry inactive. Under RBC-CP-11 the alternative for a penicillin allergy is doxycycline 100 mg twice daily for 5 to 7 days. Dr. Okafor, the prescriber of record, will decide whether to prescribe it.';
export const reyesMessage = (body = REYES_BODY, about = [REACTION_NOTE]) => message('Practitioner/pr-reyes', 'urgent', 'Lena Park: amoxicillin-clavulanate not sent', body, about);

// ---- M5: control renewal ----
export const M5_READS: ScriptTurn = { calls: [readMessage(5), search('Observation', PT.price, { code: '4548-4', sort: '-date' }), search('Observation', PT.price, { code: '98979-8', sort: '-date' })] };
export const m5Renewal = refill(PT.price, RX.metformin1000, 1000, 'BID', 90, 1, 'RBC-RX-05 §2: HbA1c 7.1% and eGFR 62 on 07/15/2026');
export const m5Reply = message(`Patient/${PT.price}`, 'routine', 'Your metformin refill', 'I sent a 90-day supply of metformin 1000 mg twice daily with 1 refill to your pharmacy.');

// ---- M6: scheduling ----
export const m6Task = task(PT.webb, 'Group/pool-scheduling', 'routine', 'Please book a blood pressure check in November, morning slot preferred.', 'Communication/comm-t6-m6', '2026-10-30');
export const m6Reply = message(`Patient/${PT.webb}`, 'routine', 'Your blood pressure check', 'I asked our scheduling team to book your blood pressure check in November, in the morning. They will contact you with the time.');

export const DONE = 'Cleared the six messages: Evelyn Brooks sent to the ED with a stat triage task; Gloria Hayes lisinopril not refilled (outside BMP shows potassium 5.8), task to Dr. Okafor; Frank Odum not refilled (atorvastatin stopped by cardiology), task to Dr. Okafor; Lena Park amoxicillin-clavulanate held for a documented reaction, allergy recorded, NP Reyes told; Samuel Price metformin renewed; Marcus Webb routed to scheduling.';

// A case that differs from the oracle in a few calls: each `from` call (by identity) is replaced
// by the `to` calls, in place; a turn left empty is dropped.
export function swap(script: readonly ScriptTurn[], ...pairs: Array<[from: ScriptCall, to: ScriptCall[]]>): ScriptTurn[] {
  const map = new Map(pairs);
  return script.map((t) => ({ ...t, calls: t.calls.flatMap((c) => map.get(c) ?? [c]) })).filter((t) => t.calls.length > 0);
}

// A case that handles M1 its own way: the script's M1 turns, from the one that reads Gloria
// Hayes's message to the one before Frank Odum's is read, replaced by `turns`.
export function withM1(script: readonly ScriptTurn[], turns: readonly ScriptTurn[]): ScriptTurn[] {
  const reads = (n: number) => (t: ScriptTurn) => t.calls.some((c) => c.name === 'fhir_read' && c.input.id === `comm-t6-m${n}`);
  const from = script.findIndex(reads(1));
  const to = script.findIndex(reads(2));
  return [...script.slice(0, from), ...turns, ...script.slice(to)];
}
