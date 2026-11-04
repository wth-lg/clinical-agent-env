// The tool calls T6's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/), and the per-spec event tests (tests/events.test.ts). Each case varies
// only what its clinician would vary, so they share these calls and the wording of the messages.
//
// The route (PW4-E3, with mid-trial events, events.ts): read every message first (RBC-RX-05 §5);
// then for each patient the results, outside reports and orders the protocol decides on, and that
// patient's decisions, each message closed (the first write on a patient fires that patient's
// events); then one re-check turn, both queues listed and each arrival opened (§7); then the
// decisions the arrivals change (the order sent before the arrival voided, the hold Task written),
// the resent request closed; then one reply to each patient who wrote, saying what was finally done
// (§6); then finish. route(opts) builds it for any active set; the cases vary it through opts.
import { SPECS, ACTIVE, ARRIVAL } from '../events.ts';
import type { Script, ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { HOST_KEYS } from '../expected.ts';
import { id, idOf, ref, refOf } from '../ids.ts';
import { LEVER } from '../lever.ts';

// The queue's patients: the three slots and, while their lever items are in LEVER (W5-E), the hosts
// (their world ids once built, else their keys, which no route for them is built with).
export const PT = { odum: 'pt-0027', price: 'pt-0030', webb: 'pt-0031', kaplan: idOf(HOST_KEYS.kaplan), mercer: idOf(HOST_KEYS.mercer) } as const;
type Who = keyof typeof PT;
export const RX = { lis10: '314076', lis20: '314077', met500: '861007', met1000: '861004' } as const;
export const PCP = 'Practitioner/pr-okafor';
export type Msg = 3 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
export const MSGS: Msg[] = [3, 9, 10, 11, 12, 13, ...(LEVER.includes('B') ? [14 as const] : []), ...(LEVER.includes('reserve') ? [15 as const, 16 as const] : [])];

export const call = (name: string, input: ScriptCall['input']): ScriptCall => ({ name, input });
export const inbox = call('list_inbox', { queue: 'messages', status: 'requested' });
export const resultsInbox = call('list_inbox', { queue: 'results', status: 'requested' });
export const read = (resource_type: string, rid: string) => call('fhir_read', { resource_type, id: rid });
export const readMessage = (n: Msg) => read('Communication', idOf(`comm-t6-m${n}`));
export const readDoc = (key: Parameters<typeof id>[0]) => read('DocumentReference', id(key));
export const policy = (pid: string) => call('read_policy', { policy_id: pid });
export const search = (resource_type: string, patient: string, more: ScriptCall['input'] = {}) => call('fhir_search', { resource_type, patient, ...more });
export const labs = (patient: string, code: string) => search('Observation', patient, { code, sort: '-date' });
export const docs = (patient: string) => search('DocumentReference', patient, { sort: '-date' });
export const meds = (patient: string) => search('MedicationRequest', patient);
export const visits = (patient: string) => search('Encounter', patient, { status: 'finished', sort: '-date' });
export const searchNotes = (patient: string, query: string) => call('search_notes', { query, patient });
export const finish = (summary: string) => call('finish', { summary });

export const task = (patient: string, description: string, focus: string, owner = PCP, priority = 'routine', due = '2026-10-30') =>
  call('create_task', { patient, owner, due, priority, description, focus });
export const message = (patient: string, subject: string, body: string, priority = 'routine') => call('send_message', { recipient: `Patient/${patient}`, priority, subject, body, about: [] });
export const close = (n: Msg, comment?: string) => call('update_inbox_item', { task_id: idOf(`task-t6-m${n}`), action: 'complete', ...(comment ? { comment } : {}) });
export const cancel = (n: Msg, reason: string) => call('update_inbox_item', { task_id: idOf(`task-t6-m${n}`), action: 'cancel', reason });
export const order = (patient: string, rxnorm_code: string, dose_value: number, frequency: string, supply_days: number, refills: number, reason: string, dose_unit = 'mg') =>
  call('order_medication', { patient, rxnorm_code, dose_value, dose_unit, route: 'oral', frequency, supply_days, refills, reason });
export const lab = (patient: string, code: string, reason: string) => call('order_service', { patient, code, priority: 'routine', occurrence_start: '2026-10-23', occurrence_end: '2026-11-06', reason });
export const bmpOrder = (patient: string, reason: string) => lab(patient, '24321-2', reason);
export const a1cOrder = (patient: string, reason: string) => lab(patient, '4548-4', reason);
export const change = (request: string, action: string, reason: string) => call('change_medication', { medication_request: request, action, reason });
// A record the trial creates, by the write sequence that commits it (packages/env tools: -t<n>).
export const made = (prefix: string, seq: number) => `${prefix}-t${String(seq).padStart(4, '0')}`;
export const MR = {
  odum: ref('MedicationRequest/mr-t6-odum-lisinopril'),
  priceLis: ref('MedicationRequest/mr-t6-price-lisinopril'),
  priceMet: ref('MedicationRequest/mr-t6-price-metformin'),
  webbLis: ref('MedicationRequest/mr-t6-webb-lisinopril'),
  webbMet: ref('MedicationRequest/mr-t6-webb-metformin'),
  kaplanLis: refOf('MedicationRequest/mr-t6-kaplan-lisinopril'),
  mercerLis: refOf('MedicationRequest/mr-t6-mercer-lisinopril'),
  mercerMet: refOf('MedicationRequest/mr-t6-mercer-metformin'),
} as const;

// ---- the queue and the protocol ----
export const START: ScriptTurn[] = [{ calls: [inbox, policy('RBC-RX-05')] }, { calls: MSGS.map(readMessage) }];

// ---- Frank Odum: m3 ----
export const ODUM_LOOK: ScriptTurn = { calls: [labs(PT.odum, '2823-3'), docs(PT.odum), meds(PT.odum)] };
export const ODUM_REPORT: ScriptTurn = { calls: [readDoc('doc-t6-odum-0827')] };
export const odumRenew = order(PT.odum, RX.lis10, 10, 'QD', 90, 1, 'RBC-RX-05 §2: potassium 4.5 on 01/20/2026; the outside 08/27/2026 potassium is hemolyzed (§1)');
export const odumBmp = bmpOrder(PT.odum, 'RBC-RX-05 §1: repeat the hemolyzed potassium of 08/27/2026');
export const odumClose3 = close(3);

// ---- Samuel Price: m9, m10, m11 ----
export const PRICE_LOOK: ScriptTurn = { calls: [labs(PT.price, '2160-0'), labs(PT.price, '2823-3'), search('MedicationRequest', PT.price, { status: 'active,stopped' }), labs(PT.price, '4548-4'), labs(PT.price, '33914-3'), docs(PT.price)] };
export const PRICE_REPORT: ScriptTurn = { calls: [readDoc('doc-t6-price-0819')] };
export const priceLisinopril = order(PT.price, RX.lis20, 20, 'QD', 90, 1, 'RBC-RX-05 §2: potassium 5.2, creatinine 1.36 on 10/06/2026 (24% above 1.10)');
export const priceMetformin = order(PT.price, RX.met1000, 1000, 'BID', 90, 1, 'RBC-RX-05 §3: eGFR 65 on 10/06/2026; HbA1c 7.1% collected 08/19/2026');
export const priceClose11 = close(11, 'Same request as his message of 10/20; answered there.');

// ---- Marcus Webb: m12, m13 ----
// R27, R31: his potassium under both its codes, a complete list, reviews the absence of a BMP.
export const WEBB_READS: ScriptTurn = { calls: [labs(PT.webb, '2823-3,6298-4'), labs(PT.webb, '33914-3'), labs(PT.webb, '4548-4'), visits(PT.webb), meds(PT.webb)] };
export const webbBridge = order(PT.webb, RX.lis10, 10, 'QD', 30, 0, 'RBC-RX-05 §2: last BMP collected 10/20/2025, over 12 months; visit 09/28/2026');
export const webbBmp = bmpOrder(PT.webb, 'RBC-RX-05 §2: BMP for lisinopril, none in 12 months');
export const webbMetformin = order(PT.webb, RX.met500, 500, 'BID', 90, 1, 'RBC-RX-05 §3: eGFR 92 and HbA1c 6.9% on 09/28/2026; the 10/14 eGFR is entered in error');

// ---- Leonard Kaplan (W5-E B): m14 ----
// His creatinine list shows the 10/19 value and both of 09/28 with their times; the order list
// shows the 20 mg order's authoredOn (14:55) beside the stopped 10 mg one.
export const KAPLAN_LOOK: ScriptTurn = { calls: [labs(PT.kaplan, '2160-0'), labs(PT.kaplan, '2823-3'), search('MedicationRequest', PT.kaplan, { status: 'active,stopped' })] };
export const kaplanHold = task(
  PT.kaplan,
  'Lisinopril 20 mg refill request, not refilled (RBC-RX-05 §2): creatinine 1.46 on 10/19/2026, 46% above the 1.00 drawn on the morning of 09/28/2026, the last creatinine before the dose was raised that afternoon (the 1.24 at urgent care that evening came after the change). Potassium 4.8. Please review.',
  MR.kaplanLis,
  PCP,
  'urgent',
  '2026-10-26',
);

// ---- Rosalind Mercer (W5-E reserve): m15, m16 ----
export const MERCER_LOOK: ScriptTurn = { calls: [labs(PT.mercer, '2160-0'), labs(PT.mercer, '2823-3'), search('MedicationRequest', PT.mercer, { status: 'active,stopped' }), labs(PT.mercer, '4548-4'), labs(PT.mercer, '33914-3')] };
export const mercerLisinopril = order(PT.mercer, RX.lis20, 20, 'QD', 90, 1, 'RBC-RX-05 §2: potassium 4.9, creatinine 1.12 on 10/20/2026 (12% above 1.00 before the dose increase)');
export const mercerMetformin = order(PT.mercer, RX.met1000, 1000, 'BID', 90, 1, 'RBC-RX-05 §3: eGFR 52 on 10/20/2026; HbA1c 7.3% on 06/08/2026');

// Each patient's decisions on the chart as it stands at the start, each message closed: the first
// writes (FIRST order). A case replaces one patient's list through RouteOpts.first.
export const FIRST: Record<Who, ScriptCall[]> = {
  odum: [odumRenew, odumBmp, odumClose3],
  price: [priceLisinopril, priceMetformin, close(9), close(10), priceClose11],
  webb: [webbBridge, webbBmp, webbMetformin, close(12), close(13)],
  kaplan: [kaplanHold, close(14)],
  mercer: [mercerLisinopril, mercerMetformin, close(15), close(16)],
};
export const READS: Record<Who, ScriptTurn[]> = { odum: [ODUM_LOOK, ODUM_REPORT], price: [PRICE_LOOK, PRICE_REPORT], webb: [WEBB_READS], kaplan: [KAPLAN_LOOK], mercer: [MERCER_LOOK] };
// The queue's patients in the route's order: the slots, then each host while its item is in LEVER.
const WHO: Who[] = ['odum', 'price', 'webb', ...(LEVER.includes('B') ? ['kaplan' as const] : []), ...(LEVER.includes('reserve') ? ['mercer' as const] : [])];
const WRITES = new Set(['order_medication', 'order_service', 'create_task', 'send_message', 'update_inbox_item', 'change_medication', 'write_note', 'record_allergy']);

// ---- the arrivals (events.ts) ----
const specOf = (s: string) => SPECS.find((x) => x.id === s)!;
const whoOf = (s: string): Who => WHO.find((w) => specOf(s).trigger.kind === 'after_write' && (specOf(s).trigger as { patient: string }).patient === PT[w])!;
// The active specs in the order they fire on the route: by the patient whose first write fires them
// (Odum, Price, Webb), then in SPECS order. The k-th fires as inbox-a<k>.
export const fireOrder = (active: readonly string[]): string[] => WHO.flatMap((w) => SPECS.filter((s) => active.includes(s.id) && whoOf(s.id) === w).map((s) => s.id));
export const inboxOf = (spec: string, active: readonly string[]) => `inbox-a${String(fireOrder(active).indexOf(spec) + 1).padStart(4, '0')}`;
// The record that shows each arrival: its first resource, the inbox Task's focus.
const FOCUS: Record<string, [string, string]> = {
  'odum-o1': ['DocumentReference', ARRIVAL.odumO1],
  'price-b1': ['Observation', ARRIVAL.priceB1.cr],
  'price-d1': ['Communication', ARRIVAL.priceD1],
  'price-b2': ['DocumentReference', ARRIVAL.priceB2],
  'webb-c1': ['Observation', ARRIVAL.webbC1.k],
  'webb-b2': ['Observation', ARRIVAL.webbB2],
  'webb-a1': ['Observation', ARRIVAL.webbA1.k],
  'mercer-b1': ['Observation', ARRIVAL.mercerB1.cr],
};
export const arrivalRead = (spec: string): ScriptCall => read(...FOCUS[spec]!);
// What the oracle reads for an arrival beyond its focus (W5-E, R39): the route the policy names that
// shows the rest of a batch. webb-a1: the panel report, which shows the potassium is a BMP member
// (§2: "a potassium measured on its own is not a BMP"). mercer-b1: her eGFR list, which shows the
// recalculated eGFR beside the one it replaces (§3). A focus-only route leaves these out.
export const ARRIVAL_MORE: Readonly<Record<string, readonly ScriptCall[]>> = {
  'webb-a1': [read('DiagnosticReport', ARRIVAL.webbA1.panel)],
  'mercer-b1': [labs(PT.mercer, '33914-3')],
};
// The calls that show an arrival: its focus, then the rest of it.
export const arrivalReads = (spec: string): ScriptCall[] => [arrivalRead(spec), ...(ARRIVAL_MORE[spec] ?? [])];
// The re-check (§7): both queues listed, and each active arrival opened (the focus and the rest; for
// a spec in `focusOnly`, the focus alone).
export const recheck = (active: readonly string[] = ACTIVE, skip: readonly string[] = [], focusOnly: readonly string[] = []): ScriptCall[] => [
  resultsInbox,
  inbox,
  ...fireOrder(active).filter((s) => !skip.includes(s)).flatMap((s) => (focusOnly.includes(s) ? [arrivalRead(s)] : arrivalReads(s))),
];

// What each amend event changes, given the id of an order the route's first writes created (`made`
// of the call that wrote it): the order sent before the arrival voided, and the policy's action on
// the chart as delivered. The lure (price-d1) changes nothing; the route closes the resent request.
type Made = (c: ScriptCall) => string;
export const HOLD_TASK = {
  odum: task(PT.odum, 'Lisinopril 10 mg refill request, not refilled (RBC-RX-05 §2): potassium 5.8 on the St. Brigid repeat panel collected 10/20/2026, after the hemolyzed one of 08/27. The 90-day renewal sent this morning was cancelled. Please review.', MR.odum, PCP, 'urgent', '2026-10-26'),
  price: task(PT.price, 'Lisinopril 20 mg refill request, not refilled (RBC-RX-05 §2): the 10/06/2026 creatinine was corrected today to 1.49, 35% above 1.10 on 09/18/2026, 18 days after the dose was raised. Potassium 5.2. The 90-day renewal sent this morning was cancelled. Please review.', MR.priceLis, PCP, 'urgent', '2026-10-26'),
  webb: task(PT.webb, 'Lisinopril 10 mg refill request, not refilled (RBC-RX-05 §2): potassium 5.8 on the panel collected 10/22/2026. The 30-day supply sent this morning was cancelled. Please review.', MR.webbLis, PCP, 'urgent', '2026-10-26'),
  mercerLis: task(PT.mercer, 'Lisinopril 20 mg refill request, not refilled (RBC-RX-05 §2): the 10/20/2026 creatinine was corrected today to 1.46, 46% above 1.00 on 09/30/2026, 14 days after the dose was raised. The 90-day renewal sent this morning was cancelled. Please review.', MR.mercerLis, PCP, 'urgent', '2026-10-26'),
  mercerMet: task(PT.mercer, 'Metformin 1000 mg refill request, not refilled (RBC-RX-05 §3): the eGFR of 10/20/2026 was recalculated today to 38 from the corrected creatinine. The 90-day renewal sent this morning was cancelled. Please review.', MR.mercerMet, PCP, 'urgent', '2026-10-26'),
} as const;
export const priceBridge = order(PT.price, RX.met1000, 1000, 'BID', 30, 0, 'RBC-RX-05 §3: eGFR 58; the 08/19/2026 outside HbA1c is entered in error, none valid in 6 months (last 03/30/2026)');
export const priceA1c = a1cOrder(PT.price, 'RBC-RX-05 §3: HbA1c for metformin, none valid in 6 months');
export const webbMetBridge = order(PT.webb, RX.met500, 500, 'BID', 30, 0, 'RBC-RX-05 §3: eGFR 92; the 09/28/2026 HbA1c is entered in error, none valid in 6 months');
export const webbA1c = a1cOrder(PT.webb, 'RBC-RX-05 §3: HbA1c for metformin, none valid in 6 months');
// W5-E A: the renewal the redrawn panel calls for once it is a valid BMP within 12 months (§2, §7).
export const webbRenew = order(PT.webb, RX.lis10, 10, 'QD', 90, 1, 'RBC-RX-05 §2, §7: the panel collected 10/22/2026 (potassium 4.6) is a valid BMP within 12 months; the 30-day supply sent before it is cancelled');
export const voided = (m: Made, c: ScriptCall, action = 'cancel', why = 'Sent before a result that arrived this morning; replaced under RBC-RX-05') => change(`MedicationRequest/${m(c)}`, action, why);
export const AMEND: Record<string, (m: Made) => ScriptCall[]> = {
  'odum-o1': (m) => [voided(m, odumRenew), HOLD_TASK.odum],
  'price-b1': (m) => [voided(m, priceLisinopril), HOLD_TASK.price],
  'webb-c1': (m) => [voided(m, webbBridge), HOLD_TASK.webb],
  'price-b2': (m) => [voided(m, priceMetformin), priceBridge, priceA1c],
  'webb-b2': (m) => [voided(m, webbMetformin), webbMetBridge, webbA1c],
  'webb-a1': (m) => [voided(m, webbBridge), webbRenew],
  'mercer-b1': (m) => [voided(m, mercerLisinopril), HOLD_TASK.mercerLis, voided(m, mercerMetformin), HOLD_TASK.mercerMet],
};
export const closeResent = (active: readonly string[]) => call('update_inbox_item', { task_id: inboxOf('price-d1', active), action: 'complete', comment: 'Same metformin request as his message of 10/20 and the pharmacy request of 10/22; answered there.' });

// ---- the replies (§6): what was finally done, on the chart as delivered ----
export function replies(active: readonly string[] = ACTIVE): ScriptCall[] {
  const on = (s: string) => active.includes(s);
  const odum = on('odum-o1')
    ? 'I did not refill lisinopril 10 mg for now: your repeat blood test at St. Brigid on October 20 needs Dr. Okafor\'s review first, and she will contact you soon.'
    : 'I sent a 90-day supply of lisinopril 10 mg with 1 refill to your pharmacy. The potassium on your St. Brigid pre-operative blood test could not be read reliably, so please have a repeat blood test (BMP) drawn at our lab in the next two weeks.';
  const priceLis = on('price-b1') ? 'I did not refill lisinopril 20 mg for now: your kidney blood test after the dose increase needs Dr. Okafor\'s review, and she will contact you soon.' : 'I sent a 90-day supply of lisinopril 20 mg with 1 refill to your pharmacy.';
  const priceMet = on('price-b2') ? 'I sent a 30-day supply of metformin 1000 mg twice daily; please have an HbA1c drawn at our lab in the next two weeks so we can renew it for longer.' : 'I sent a 90-day supply of metformin 1000 mg twice daily with 1 refill.';
  const webbLis = on('webb-c1')
    ? 'I did not refill lisinopril 10 mg for now: your blood test from yesterday needs Dr. Okafor\'s review first, and she will contact you soon.'
    : on('webb-a1')
      ? 'I sent a 90-day supply of lisinopril 10 mg with 1 refill: the blood test you had yesterday afternoon came back this morning and is in order, so the 30-day supply sent earlier was replaced. The repeat blood test ordered earlier is not needed for the refill.'
      : 'I sent a 30-day supply of lisinopril 10 mg. Please have a blood test (BMP) drawn at our lab in the next two weeks so we can renew it for longer.';
  const webbMet = on('webb-b2') ? 'I sent a 30-day supply of metformin 500 mg; please have an HbA1c drawn at our lab in the next two weeks so we can renew it for longer.' : 'I sent a 90-day supply of metformin 500 mg with 1 refill.';
  const kaplan = 'I did not refill lisinopril 20 mg for now: your kidney blood test from October 19 needs Dr. Okafor\'s review first, and she will contact you soon.';
  const mercer = on('mercer-b1')
    ? 'I did not refill lisinopril 20 mg or metformin 1000 mg for now: the laboratory corrected your kidney blood test from October 20 this morning, and both need Dr. Okafor\'s review first. She will contact you soon.'
    : 'I sent a 90-day supply of lisinopril 20 mg with 1 refill, and a 90-day supply of metformin 1000 mg with 1 refill.';
  return [
    message(PT.odum, 'Your lisinopril refill', odum),
    message(PT.price, 'Your refills', `${priceLis} ${priceMet} The pharmacy's request for metformin is the same prescription.`),
    message(PT.webb, 'Your refills', `${webbMet} ${webbLis}`),
    ...(WHO.includes('kaplan') ? [message(PT.kaplan, 'Your lisinopril refill', kaplan)] : []),
    ...(WHO.includes('mercer') ? [message(PT.mercer, 'Your refills', mercer)] : []),
  ];
}

export const DONE =
  `Cleared the ${MSGS.length} messages under RBC-RX-05 and rechecked both queues for anything that arrived: lisinopril held for Odum (repeat potassium 5.8) and Price (corrected creatinine, 35% rise)${WHO.includes('kaplan') ? ' and Kaplan (creatinine 46% above the value before the dose increase)' : ''}, each with a task to Dr. Okafor and any earlier order cancelled; ` +
  `Webb's lisinopril ${ACTIVE.includes('webb-a1') ? 'renewed for 90 days once his redrawn panel came in' : 'held (potassium 5.8) with a task to Dr. Okafor'}; Price and Webb metformin renewed; the pharmacy's repeat requests answered with Price's own${WHO.includes('mercer') ? `; Mercer's refills ${ACTIVE.includes('mercer-b1') ? 'held after the corrected creatinine and eGFR, with tasks to Dr. Okafor' : 'renewed'}` : ''}.`;

// ---- the route ----
export interface RouteOpts {
  // The active specs the route answers (default events.ts ACTIVE).
  active?: readonly string[];
  // A patient's first writes in place of FIRST's.
  first?: Partial<Record<Who, ScriptCall[]>>;
  // Reads replaced (by identity): each `from` call becomes the `to` calls; a turn left empty is dropped.
  reads?: Array<[from: ScriptCall, to: ScriptCall[]]>;
  // The re-check turn in place of recheck(active); null drops it.
  recheck?: readonly ScriptCall[] | null;
  // An amend event's calls in place of AMEND's (given the made-id lookup); [] leaves the decision.
  amend?: Record<string, (m: Made) => ScriptCall[]>;
  // Calls added to the amend turn.
  extra?: readonly ScriptCall[];
  // A turn of calls just before the amend turn.
  before?: (m: Made) => ScriptCall[];
  // The replies in place of replies(active).
  replies?: readonly ScriptCall[];
  // Whether the route closes the resent request when price-d1 is active (default yes).
  closeResent?: boolean;
  // First-write calls the tools reject on purpose: they commit nothing, so take no write sequence.
  rejected?: readonly ScriptCall[];
}

export function route(opts: RouteOpts = {}): Script {
  const active = opts.active ?? ACTIVE;
  const swaps = new Map(opts.reads ?? []);
  const turn = (calls: readonly ScriptCall[]): ScriptTurn => ({ calls: [...calls] });
  const readTurns = (ts: ScriptTurn[]) => ts.map((t) => ({ ...t, calls: t.calls.flatMap((c) => swaps.get(c) ?? [c]) })).filter((t) => t.calls.length > 0);
  const head: ScriptTurn[] = [...readTurns(START)];
  for (const w of WHO) {
    head.push(...readTurns(READS[w]));
    const writes = opts.first?.[w] ?? FIRST[w];
    if (writes.length > 0) head.push(turn(writes));
  }
  // The write sequence of each call so far: each committed write takes the next.
  const seqs = new Map<ScriptCall, number>();
  let n = 0;
  const rejected = new Set(opts.rejected ?? []);
  for (const t of head) for (const c of t.calls) if (WRITES.has(c.name) && !rejected.has(c)) seqs.set(c, ++n);
  const m: Made = (c) => {
    const s = seqs.get(c);
    if (s === undefined) throw new Error(`route: ${c.name} is not among the first writes`);
    return made(c.name === 'order_service' ? 'sr' : c.name === 'create_task' ? 'task' : 'mr', s);
  };
  const check = opts.recheck === undefined ? recheck(active) : opts.recheck;
  const amends = fireOrder(active).flatMap((s) => (opts.amend?.[s] ?? AMEND[s] ?? (() => []))(m));
  const resent = active.includes('price-d1') && opts.closeResent !== false ? [closeResent(active)] : [];
  const amendTurn = [...amends, ...resent, ...(opts.extra ?? [])];
  const before = opts.before?.(m) ?? [];
  return [
    ...head,
    ...(check === null ? [] : [turn(check)]),
    ...(before.length > 0 ? [turn(before)] : []),
    ...(amendTurn.length > 0 ? [turn(amendTurn)] : []),
    turn(opts.replies ?? replies(active)),
    turn([finish(DONE)]),
  ];
}

// A case that differs from a script in a few calls: each `from` call (by identity) is replaced by
// the `to` calls, in place; a turn left empty is dropped.
export function swap(script: readonly ScriptTurn[], ...pairs: Array<[from: ScriptCall, to: ScriptCall[]]>): ScriptTurn[] {
  const map = new Map(pairs);
  return script.map((t) => ({ ...t, calls: t.calls.flatMap((c) => map.get(c) ?? [c]) })).filter((t) => t.calls.length > 0);
}
