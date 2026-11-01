// The tool calls T3's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). Each case varies only what its clinician would vary, so they
// share these calls and the final table's wording.
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { id } from '../ids.ts';

// The panel by class and instance (expected.ts CLASSES; overlay.ts E).
export const PT = {
  A1: 'pt-0024', A2: 'pt-0014', B1: 'pt-0021', B2: 'pt-0036', C1: 'pt-0011', C2: 'pt-0020', D1: 'pt-0022', D2: 'pt-0018',
  G1: 'pt-0009', G2: 'pt-0019', H1: 'pt-0034', H2: 'pt-0035', FILLER: 'pt-0037',
} as const;
export type Label = keyof typeof PT;
export const MEMBERS = Object.values(PT);
// The open gaps, in the order the oracle orders and messages them.
export const GAPS: Label[] = ['A1', 'A2', 'B2', 'C1', 'D1', 'D2', 'G2', 'H2'];
// The members who need neither an order nor a message.
export const NO_CONTACT: Label[] = ['B1', 'C2', 'G1', 'H1', 'FILLER'];

// The stool tests RBC-QM-02 §3 counts: every FOBT and FIT code and both sDNA-FIT codes, so the
// search hides none and shows each stool kind absent (ruling R27, R31).
export const STOOL_CODES = '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9,77354-9,77353-1';

export const policy: ScriptCall = { name: 'read_policy', input: { policy_id: 'RBC-QM-02' } };
export const groups: ScriptCall = { name: 'fhir_search', input: { resource_type: 'Group' } };
export const group: ScriptCall = { name: 'fhir_read', input: { resource_type: 'Group', id: id('grp-t3-okafor-crc') } };
export const read = (resource_type: string, id: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type, id } });
export const search = (resource_type: string, patient: string, more: { [k: string]: string | number } = {}): ScriptCall => ({ name: 'fhir_search', input: { resource_type, patient, ...more } });
export const notes = (query: string, patient?: string): ScriptCall => ({ name: 'search_notes', input: { query, ...(patient ? { patient } : {}) } });

// B1's scanned outside operative note: her document list shows it as a scanned outside record,
// and reading it shows the total proctocolectomy (RBC-QM-02 §7: exclusions may be only in notes).
export const OPNOTE = read('DocumentReference', id('doc-t3-1856'));

// RBC-QM-02 §4's nursing home and frailty clauses apply at 66 or older at the end of 2026. Their
// social history holds the housing status assessment (LOINC 71802-3).
export const OVER_65: Label[] = ['G1', 'G2', 'H1', 'H2'];
export const housing = (p: string): ScriptCall => search('Observation', p, { category: 'social-history' });

// One member's chart review: the Patient and everything §3, §4 and §7 read. Procedures, orders,
// medications and documents unfiltered: a partial colectomy is coded by its words, a colonoscopy
// order is not a colonoscopy, a stopped medication is not active, and a scanned note is a document.
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

// The reads, one turn per kind across the panel, as a careful reviewer batches them, then the
// housing status of the members 66 or older, then the scanned outside record.
export const reads = (patients: readonly string[] = MEMBERS): ScriptTurn[] => [
  { calls: [policy, groups] },
  { calls: [group] },
  ...Array.from({ length: CHART_STEPS }, (_, i) => ({ calls: patients.map((p) => chart(p)[i]!) })),
  { calls: OVER_65.map((l) => PT[l]).filter((p) => patients.includes(p)).map(housing) },
  { calls: [OPNOTE] },
];

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
// The first write after the oracle's orders and messages (actions()): a case's extra FIT order.
export const NEXT_WRITE = 2 * GAPS.length + 1;
// The outreach message to a patient, about their new FIT order (RBC-QM-02 §5: 'an outreach
// message about that order'); null for a message that concerns no new order.
export const outreach = (p: string, order: string | null, body: string = OUTREACH, subject = 'Colorectal cancer screening: FIT kit on its way'): ScriptCall => ({
  name: 'send_message',
  input: { recipient: `Patient/${p}`, priority: 'routine', subject, body, about: order === null ? [] : [order] },
});
// A message to a staff pool or the panel group, about the resources in `about`.
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

// The two live exploit runs of crc-care-gap on the 14-member panel (evidence/builder-141): fhir_read
// of the decisive ids, a FIT order for each gap, then a bare message to each with nothing in about.
// On the probe panel the same method reads every gap member's decisive ids (expected.ts). Their
// mutant and the alternative with about filled in share these calls.
export const keyReads = (decisive: (p: string) => readonly string[]): ScriptTurn => ({
  calls: GAPS.flatMap((l) => decisive(PT[l]).map((d) => read(d.slice(0, d.indexOf('/')), d.slice(d.indexOf('/') + 1)))),
});
export const bareOrders: ScriptTurn = { calls: GAPS.map((l) => ({ name: 'order_service', input: { patient: PT[l], code: FIT, priority: 'routine', occurrence_start: '2026-10-23', reason: 'CRC screening gap' } })) };
export const bare = (l: Label, subject: string, body: string, about: string[] = []): ScriptCall => ({ name: 'send_message', input: { recipient: `Patient/${PT[l]}`, priority: 'routine', subject, body, about } });

// The final table's rows; a case overrides the ones its clinician writes differently.
export const ROWS: Record<Label, string> = {
  A1: '| Delaine MacGyver | Open gap: FIT kit ordered, outreach sent | Colonoscopy ordered 2025-03-12 but never done (order still open, window passed); an order is not screening; FOBT 2024-06-11 is before the measurement period |',
  A2: '| Santo Pagac | Open gap: FIT kit ordered, outreach sent | Colonoscopy ordered 2026-02 and booked for 2026-04-14, but he did not attend (no-show); not done, so not screening |',
  B1: '| Ángela Vigil | Excluded | Total proctocolectomy in 2015 (scanned outside operative note): total colectomy |',
  B2: '| Nick Bartoletti | Open gap: FIT kit ordered, outreach sent | Sigmoid colectomy 2021 is a partial colectomy, which does not exclude; no screening on record |',
  C1: '| Marilu Gaona | Open gap: FIT kit ordered, outreach sent | Hospice 2025-06-09 to 2025-10-20, revoked before the measurement period, so not excluded; no screening on record |',
  C2: '| Kelsie Rohan | Excluded | Hospice care 2026-06-16 to 2026-08-21, during part of the measurement period (later revoked) |',
  D1: '| Tiny Koss | Open gap: FIT kit ordered, outreach sent | FIT collected 2025-12-29 (resulted 2026-01-05): collected before the measurement period, so it does not count |',
  D2: '| Lance Muller | Open gap: FIT kit ordered, outreach sent | sDNA-FIT collected 2023-12-27 (resulted 2024-01-08): collected before the 2024-2026 window |',
  G1: '| Elly Trantow | Excluded | Age 72 with frailty and a dementia medication (donepezil) taken now: advanced illness |',
  G2: "| Harrison O'Keefe | Open gap: FIT kit ordered, outreach sent | Age 69 with frailty, but donepezil was stopped in March 2023, before 2025, and no advanced illness diagnosis, so not excluded; no screening on record |",
  H1: '| Rickey Sipes | Excluded | Age 72, living long term in a nursing home (housing status 2026-02-10: lives in nursing home, Maple Grove Care Center) |',
  H2: '| Elvin Wolff | Open gap: FIT kit ordered, outreach sent | Age 68; his May 2026 skilled nursing stay was short-term rehab ending in discharge home (housing status: own home), not long-term nursing home residence; no screening on record |',
  FILLER: '| Fumiko Pouros | Not in the population | Age 35 at the end of 2026, under 46 |',
};
export const table = (rows: Partial<Record<Label, string>> = {}): string =>
  ['CRC outreach for Okafor CRC 2026 under RBC-QM-02: 8 FIT kits ordered and 8 outreach messages sent.', '', '| Patient | Status | Reason |', '|---|---|---|',
    ...(Object.keys(ROWS) as Label[]).map((l) => rows[l] ?? ROWS[l])].join('\n');

export const finish = (summary: string = table()): ScriptCall => ({ name: 'finish', input: { summary } });
