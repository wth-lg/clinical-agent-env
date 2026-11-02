// The tool calls T3's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). Each case varies only what its clinician would vary, so they
// share these calls and the final table's wording.
//
// The panel holds four members since the PW4-E3 list cut, each the item of one mid-trial event
// (events.ts). The chart reads expose each event's trigger record, so all four events arrive during
// the reads; the oracle then re-checks its queues, reads each arrival, and acts on the three that
// open a screening gap (§8, §5).
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { id } from '../ids.ts';

// The panel by probe class (expected.ts CLASSES; overlay.ts E).
export const PT = { G1: 'pt-0009', C2: 'pt-0020', D1: 'pt-0022', A1: 'pt-0024' } as const;
export type Label = keyof typeof PT;
export const MEMBERS = Object.values(PT);
// The members whose amend event opens a gap, in the order the oracle orders and messages them.
export const GAPS: Label[] = ['G1', 'D1', 'A1'];

// The stool tests RBC-QM-02 §3 counts: every FOBT and FIT code and both sDNA-FIT codes, so the
// search hides none and shows each stool kind absent (ruling R27, R31).
export const STOOL_CODES = '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9,77354-9,77353-1';

export const policy: ScriptCall = { name: 'read_policy', input: { policy_id: 'RBC-QM-02' } };
export const groups: ScriptCall = { name: 'fhir_search', input: { resource_type: 'Group' } };
export const group: ScriptCall = { name: 'fhir_read', input: { resource_type: 'Group', id: id('grp-t3-okafor-crc') } };
export const read = (resource_type: string, id: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type, id } });
export const search = (resource_type: string, patient: string, more: { [k: string]: string | number } = {}): ScriptCall => ({ name: 'fhir_search', input: { resource_type, patient, ...more } });
export const notes = (query: string, patient?: string): ScriptCall => ({ name: 'search_notes', input: { query, ...(patient ? { patient } : {}) } });
export const inbox = (queue: 'results' | 'messages', more: { [k: string]: string | number } = {}): ScriptCall => ({ name: 'list_inbox', input: { queue, ...more } });

// The records each event's trigger is (events.ts): the frailty entry, the FIT, the sDNA-FIT, the
// hospice episode.
export const TRIGGER = {
  G1: ['Condition', id('cond-t3-6027')],
  D1: ['Observation', id('obs-t3-3906')],
  A1: ['Observation', id('obs-t3-1279')],
  C2: ['EpisodeOfCare', id('eoc-t3-8215')],
} as const satisfies Record<Label, readonly [string, string]>;
// What each event brings, the focus of its inbox Task first (events.ts).
export const ARRIVAL = {
  G1: [['Communication', 'comm-e3-5521'], ['Condition', id('cond-t3-6027')]],
  D1: [['Observation', id('obs-t3-3906')]],
  A1: [['DocumentReference', 'doc-e3-6804'], ['Observation', id('obs-t3-1279')]],
  C2: [['DocumentReference', 'doc-e3-7390']],
} as const satisfies Record<Label, ReadonlyArray<readonly [string, string]>>;
// A read of each event's focus: the message, the corrected result, the two faxed documents.
export const arrivalRead = (l: Label): ScriptCall => {
  const [type, key] = ARRIVAL[l][0];
  return read(type, key);
};

// One member's chart review: the Patient and everything §3, §4 and §7 read. Procedures, orders,
// medications and documents unfiltered: a colonoscopy order is not a colonoscopy, a stopped
// medication is not active, and a scanned note is a document.
export const chart = (p: string): ScriptCall[] => [
  read('Patient', p),
  search('Procedure', p, { count: 50 }),
  search('Observation', p, { code: STOOL_CODES }),
  search('Condition', p, { count: 50 }),
  search('MedicationRequest', p, { count: 50 }),
  search('EpisodeOfCare', p),
  search('ServiceRequest', p, { count: 50 }),
  search('Appointment', p),
  search('DocumentReference', p, { count: 50 }),
];
export const CHART_STEPS = chart('pt-0000').length;

// The reads, one turn per kind across the panel, as a careful reviewer batches them. The stool,
// problem-list and care-episode turns expose the four trigger records, so the events arrive then.
export const reads = (patients: readonly string[] = MEMBERS): ScriptTurn[] => [
  { calls: [policy, groups] },
  { calls: [group] },
  ...Array.from({ length: CHART_STEPS }, (_, i) => ({ calls: patients.map((p) => chart(p)[i]!) })),
];

// §8: before acting, a complete listing of both queues, then a read of each arrival.
export const recheck: ScriptTurn = { calls: [inbox('results'), inbox('messages')] };
export const arrivals = (labels: readonly Label[] = ['G1', 'D1', 'A1', 'C2']): ScriptTurn => ({ calls: labels.map(arrivalRead) });

export const FIT = 'LAB-FIT-KIT';
export const orderFit = (p: string, code: string = FIT, occurrence_start = '2026-10-26'): ScriptCall => ({
  name: 'order_service',
  input: { patient: p, code, priority: 'routine', occurrence_start, reason: 'RBC-QM-02 §5: open colorectal cancer screening gap; FIT kit by mail' },
});
export const OUTREACH =
  'Our records show you are due for colorectal cancer screening. We are mailing you a FIT kit, a simple stool test you do at home. ' +
  'Please complete it and mail it back in the prepaid envelope. Call the clinic with any questions. Riverbend Family Medicine';
// A write's id is its tool's prefix and the trial's write sequence number
// (packages/env/tools/write/commit.ts: sr-t0003 is the third committed write), so a script names
// the FIT order it placed as the n-th write.
export const fitOrder = (n: number) => `ServiceRequest/sr-t${String(n).padStart(4, '0')}`;
// The first write after the oracle's orders and messages (actions()): a case's extra write.
export const NEXT_WRITE = 2 * GAPS.length + 1;
// The outreach message to a patient, about their new FIT order (RBC-QM-02 §5: 'an outreach
// message about that order'); null for a message that concerns no new order.
export const outreach = (p: string, order: string | null, body: string = OUTREACH, subject = 'Colorectal cancer screening: FIT kit on its way'): ScriptCall => ({
  name: 'send_message',
  input: { recipient: `Patient/${p}`, priority: 'routine', subject, body, about: order === null ? [] : [order] },
});
// A message to a staff pool, a clinician or the panel group, about the resources in `about`.
export const message = (recipient: string, subject: string, body: string, about: string[] = []): ScriptCall => ({
  name: 'send_message',
  input: { recipient, priority: 'routine', subject, body, about },
});
// Each patient's FIT order, then the outreach about it: the writes from `start` on (the first
// writes of a trial by default), so the i-th order is write start + 2i.
export const actions = (
  labels: readonly Label[] = GAPS,
  start = 1,
  order: (p: string) => ScriptCall = (p) => orderFit(p),
  send: (p: string, order: string) => ScriptCall = (p, ref) => outreach(p, ref),
): ScriptCall[] => labels.flatMap((l, i) => [order(PT[l]), send(PT[l], fitOrder(start + 2 * i))]);

// The final table's rows; a case overrides the ones its clinician writes differently.
export const ROWS: Record<Label, string> = {
  G1: '| Elly Trantow | Open gap: FIT kit ordered, outreach sent | Her frailty entry was entered in error (Dr. Lin: it belonged to another patient), so the frailty and advanced illness exclusion does not apply; no screening on record |',
  C2: '| Kelsie Rohan | Excluded | Hospice care June to August 2026, during part of the measurement period; the hospice discharge summary shows she revoked it in August, which does not change that |',
  D1: '| Tiny Koss | Open gap: FIT kit ordered, outreach sent | The lab corrected her FIT collection date to December 31, 2025 (the lab received it in January): collected before the measurement period, so it does not count; no other screening |',
  A1: '| Delaine MacGyver | Open gap: FIT kit ordered, outreach sent | Harbor laboratory withdrew her 2024 sDNA-FIT result (the specimen belonged to another patient); the colonoscopy ordered in 2025 was never done; no screening on record |',
};
export const table = (rows: Partial<Record<Label, string>> = {}, lead = 'CRC outreach for Okafor CRC 2026 under RBC-QM-02: 3 FIT kits ordered and 3 outreach messages sent.'): string =>
  [lead, '', '| Patient | Status | Reason |', '|---|---|---|', ...(Object.keys(ROWS) as Label[]).map((l) => rows[l] ?? ROWS[l])].join('\n');

export const finish = (summary: string = table()): ScriptCall => ({ name: 'finish', input: { summary } });
