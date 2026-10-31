// The tool calls T6's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). Each case varies only what its clinician would vary, so they share
// these calls and the wording of the messages. The oracle works patient by patient: it reads every
// message first (RBC-RX-05 §5), then for each patient the results, outside reports and orders the
// protocol decides on, then writes that patient's decisions and replies and closes the messages.
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { id, ref } from '../ids.ts';

export const PT = { hayes: 'pt-0026', odum: 'pt-0027', park: 'pt-0028', brooks: 'pt-0029', price: 'pt-0030', webb: 'pt-0031' } as const;
export const RX = { lis10: '314076', lis20: '314077', met500: '861007', met1000: '861004', aml5: '197361' } as const;
export const PCP = 'Practitioner/pr-okafor';
export type Msg = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
const MSGS: Msg[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const call = (name: string, input: ScriptCall['input']): ScriptCall => ({ name, input });
export const inbox = call('list_inbox', { queue: 'messages', status: 'requested' });
export const read = (resource_type: string, rid: string) => call('fhir_read', { resource_type, id: rid });
export const readMessage = (n: Msg) => read('Communication', id(`comm-t6-m${n}`));
export const readDoc = (key: Parameters<typeof id>[0]) => read('DocumentReference', id(key));
export const policy = (pid: string) => call('read_policy', { policy_id: pid });
export const search = (resource_type: string, patient: string, more: ScriptCall['input'] = {}) => call('fhir_search', { resource_type, patient, ...more });
export const labs = (patient: string, code: string) => search('Observation', patient, { code, sort: '-date' });
export const docs = (patient: string) => search('DocumentReference', patient, { sort: '-date' });
export const meds = (patient: string) => search('MedicationRequest', patient);
export const visits = (patient: string) => search('Encounter', patient, { status: 'finished', sort: '-date' });
export const finish = (summary: string) => call('finish', { summary });

export const task = (patient: string, description: string, focus: string, owner = PCP, priority = 'routine', due = '2026-10-30') =>
  call('create_task', { patient, owner, due, priority, description, focus });
export const message = (patient: string, subject: string, body: string, priority = 'routine') => call('send_message', { recipient: `Patient/${patient}`, priority, subject, body, about: [] });
export const close = (n: Msg, comment?: string) => call('update_inbox_item', { task_id: id(`task-t6-m${n}`), action: 'complete', ...(comment ? { comment } : {}) });
export const cancel = (n: Msg, reason: string) => call('update_inbox_item', { task_id: id(`task-t6-m${n}`), action: 'cancel', reason });
export const order = (patient: string, rxnorm_code: string, dose_value: number, frequency: string, supply_days: number, refills: number, reason: string, dose_unit = 'mg') =>
  call('order_medication', { patient, rxnorm_code, dose_value, dose_unit, route: 'oral', frequency, supply_days, refills, reason });
export const lab = (patient: string, code: string, reason: string) => call('order_service', { patient, code, priority: 'routine', occurrence_start: '2026-10-23', occurrence_end: '2026-11-06', reason });
export const bmpOrder = (patient: string, reason: string) => lab(patient, '24321-2', reason);
export const a1cOrder = (patient: string, reason: string) => lab(patient, '4548-4', reason);

// ---- the queue and the protocol ----
export const START: ScriptTurn[] = [{ calls: [inbox, policy('RBC-RX-05')] }, { calls: MSGS.map(readMessage) }];

// ---- Gloria Hayes: m1, m2 ----
export const HAYES_READS: ScriptTurn = { calls: [labs(PT.hayes, '2823-3'), meds(PT.hayes)] };
export const hayesRenew = order(PT.hayes, RX.lis20, 20, 'QD', 90, 1, 'RBC-RX-05 §2: potassium 4.6 on 04/14/2026; the 10/05/2026 potassium is hemolyzed (§1)');
export const hayesBmp = bmpOrder(PT.hayes, 'RBC-RX-05 §1: repeat the hemolyzed potassium of 10/05/2026');
export const hayesReply = message(PT.hayes, 'Your lisinopril refill', 'I sent a 90-day supply of lisinopril 20 mg with 1 refill to your pharmacy. Your last blood test sample was damaged in handling, so please have a repeat blood test (BMP) drawn at our lab in the next two weeks.');
export const hayesClose2 = close(2, 'Same request as her message of 10/19; answered there.');
export const HAYES: ScriptTurn[] = [HAYES_READS, { calls: [hayesRenew, hayesBmp, hayesReply, close(1), hayesClose2] }];

// ---- Frank Odum: m3, m4 ----
export const ODUM_LOOK: ScriptTurn = { calls: [labs(PT.odum, '2823-3'), docs(PT.odum), visits(PT.odum), meds(PT.odum)] };
export const ODUM_REPORT: ScriptTurn = { calls: [readDoc('doc-t6-odum-0827')] };
export const odumRenew = order(PT.odum, RX.lis10, 10, 'QD', 90, 1, 'RBC-RX-05 §2: potassium 4.5 on 01/20/2026; the outside 08/27/2026 potassium is hemolyzed (§1)');
export const odumBmp = bmpOrder(PT.odum, 'RBC-RX-05 §1: repeat the hemolyzed potassium of 08/27/2026');
export const odumAmlodipine = order(PT.odum, RX.aml5, 5, 'QD', 90, 1, 'RBC-RX-05 §4: visit 01/20/2026');
export const odumReply = message(PT.odum, 'Your refills', 'I sent 90-day supplies of lisinopril 10 mg and amlodipine 5 mg, each with 1 refill, to your pharmacy. The potassium on your St. Brigid pre-operative blood test could not be read reliably, so please have a repeat blood test (BMP) drawn at our lab in the next two weeks.');
export const odumClose4 = close(4);
export const ODUM: ScriptTurn[] = [ODUM_LOOK, ODUM_REPORT, { calls: [odumRenew, odumBmp, odumAmlodipine, odumReply, close(3), odumClose4] }];

// ---- Lena Park: m5, m6 ----
export const PARK_LOOK: ScriptTurn = { calls: [search('DiagnosticReport', PT.park, { code: '51990-0', sort: '-date' }), docs(PT.park), labs(PT.park, '33914-3'), visits(PT.park), meds(PT.park)] };
export const PARK_REPORT: ScriptTurn = { calls: [readDoc('doc-t6-park-1002')] };
export const parkBridge = order(PT.park, RX.lis10, 10, 'QD', 30, 0, 'RBC-RX-05 §2: no BMP collected in the last 12 months (outside BMP collected 10/02/2025); visit 07/20/2026');
export const parkBmp = bmpOrder(PT.park, 'RBC-RX-05 §2: BMP for lisinopril, none in 12 months');
export const parkTask = (focus = ref('MedicationRequest/mr-t6-park-metformin')) =>
  task(PT.park, 'Metformin refill request (pharmacy), not refilled (RBC-RX-05 §3): eGFR 39 on 07/20/2026 (amended 07/24 from 51; creatinine corrected to 1.62). Please review metformin.', focus);
export const parkReply = message(PT.park, 'Your refills', 'I sent a 30-day supply of lisinopril 10 mg. Please have a blood test (BMP) drawn at our lab in the next two weeks so we can renew it for longer. I did not refill metformin for now: your kidney test from July needs Dr. Okafor\'s review first, and she will contact you.');
export const parkHold = parkTask();
export const PARK: ScriptTurn[] = [PARK_LOOK, PARK_REPORT, { calls: [parkBridge, parkBmp, parkHold, parkReply, close(5), close(6)] }];

// ---- Evelyn Brooks: m7, m8 ----
export const BROOKS_LOOK: ScriptTurn = { calls: [labs(PT.brooks, '2160-0'), labs(PT.brooks, '2823-3'), search('MedicationRequest', PT.brooks, { status: 'active,stopped' }), labs(PT.brooks, '4548-4'), docs(PT.brooks), labs(PT.brooks, '33914-3')] };
export const BROOKS_REPORT: ScriptTurn = { calls: [readDoc('doc-t6-brooks-0412')] };
export const brooksTask = (focus = ref('MedicationRequest/mr-t6-brooks-lisinopril')) =>
  task(PT.brooks, 'Lisinopril 20 mg refill request, not refilled (RBC-RX-05 §2): creatinine 1.24 on 10/08/2026, 38% above 0.90 on 09/21/2026, 17 days after the dose was raised. Potassium 5.2. Out of lisinopril since 10/20. Please review.', focus, PCP, 'urgent', '2026-10-26');
export const brooksBridge = order(PT.brooks, RX.met1000, 1000, 'BID', 30, 0, 'RBC-RX-05 §3: eGFR 54; no HbA1c collected in 6 months (last 04/14/2026)');
export const brooksA1c = a1cOrder(PT.brooks, 'RBC-RX-05 §3: HbA1c for metformin, none in 6 months');
export const brooksReply = message(PT.brooks, 'Your refills', 'I did not refill lisinopril 20 mg for now: your kidney blood test after the dose increase needs Dr. Okafor\'s review, and she will contact you soon. I sent a 30-day supply of metformin; please have an HbA1c drawn at our lab in the next two weeks so we can renew it for longer.');
export const brooksHold = brooksTask();
export const BROOKS: ScriptTurn[] = [BROOKS_LOOK, BROOKS_REPORT, { calls: [brooksHold, brooksBridge, brooksA1c, brooksReply, close(7), close(8)] }];

// ---- Samuel Price: m9, m10, m11 ----
export const PRICE_LOOK: ScriptTurn = { calls: [labs(PT.price, '2160-0'), labs(PT.price, '2823-3'), search('MedicationRequest', PT.price, { status: 'active,stopped' }), labs(PT.price, '4548-4'), labs(PT.price, '33914-3'), docs(PT.price)] };
export const PRICE_REPORT: ScriptTurn = { calls: [readDoc('doc-t6-price-0819')] };
export const priceLisinopril = order(PT.price, RX.lis20, 20, 'QD', 90, 1, 'RBC-RX-05 §2: potassium 5.2, creatinine 1.36 on 10/06/2026 (24% above 1.10)');
export const priceMetformin = order(PT.price, RX.met1000, 1000, 'BID', 90, 1, 'RBC-RX-05 §3: eGFR 65 on 10/06/2026; HbA1c 7.1% collected 08/19/2026');
export const priceReply = message(PT.price, 'Your refills', 'I sent 90-day supplies of lisinopril 20 mg and metformin 1000 mg twice daily, each with 1 refill, to your pharmacy. The pharmacy\'s request for metformin is the same prescription.');
export const priceClose11 = close(11, 'Same request as his message of 10/20; answered there.');
export const PRICE: ScriptTurn[] = [PRICE_LOOK, PRICE_REPORT, { calls: [priceLisinopril, priceMetformin, priceReply, close(9), close(10), priceClose11] }];

// ---- Marcus Webb: m12, m13 ----
export const WEBB_READS: ScriptTurn = { calls: [labs(PT.webb, '2823-3'), labs(PT.webb, '33914-3'), labs(PT.webb, '4548-4'), visits(PT.webb), meds(PT.webb)] };
export const webbBridge = order(PT.webb, RX.lis10, 10, 'QD', 30, 0, 'RBC-RX-05 §2: last BMP collected 10/20/2025, over 12 months; visit 09/28/2026');
export const webbBmp = bmpOrder(PT.webb, 'RBC-RX-05 §2: BMP for lisinopril, none in 12 months');
export const webbMetformin = order(PT.webb, RX.met500, 500, 'BID', 90, 1, 'RBC-RX-05 §3: eGFR 92 and HbA1c 6.9% on 09/28/2026; the 10/14 eGFR is entered in error');
export const webbReply = message(PT.webb, 'Your refills', 'I sent a 90-day supply of metformin 500 mg with 1 refill and a 30-day supply of lisinopril 10 mg. Please have a blood test (BMP) drawn at our lab in the next two weeks so we can renew lisinopril for longer.');
export const WEBB: ScriptTurn[] = [WEBB_READS, { calls: [webbBridge, webbBmp, webbMetformin, webbReply, close(12), close(13)] }];

export const DONE =
  'Cleared the 13 messages: Hayes and Odum lisinopril renewed with a repeat BMP (hemolyzed potassium), Odum amlodipine renewed; Park and Webb lisinopril 30 days with a BMP; ' +
  'Park metformin held (amended eGFR 39) and Brooks lisinopril held (creatinine up 38% after the dose increase), each with a task to Dr. Okafor; Brooks metformin 30 days with an HbA1c; ' +
  'Price lisinopril and metformin renewed; Webb metformin renewed; the two repeat requests answered with their first.';

// A case that differs from the oracle in a few calls: each `from` call (by identity) is replaced by
// the `to` calls, in place; a turn left empty is dropped.
export function swap(script: readonly ScriptTurn[], ...pairs: Array<[from: ScriptCall, to: ScriptCall[]]>): ScriptTurn[] {
  const map = new Map(pairs);
  return script.map((t) => ({ ...t, calls: t.calls.flatMap((c) => map.get(c) ?? [c]) })).filter((t) => t.calls.length > 0);
}
// A case without one turn (by identity).
export const without = (script: readonly ScriptTurn[], turn: ScriptTurn): ScriptTurn[] => script.filter((t) => t !== turn);
