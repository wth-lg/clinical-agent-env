import { ref } from './ids.ts';
// T3's expected end state after the PW4-E3 list cut (plan-amendment-w4 "Sizing and per-task
// targets": n = 4): four members of the panel group, each the item of one mid-trial event
// (events.ts), written by hand. policy.ts computes the same from the initial world, and the matrix
// fails when the two differ. The grader reads its targets here. Each member's decisive ids are only
// the records whose reading decides the member's action (ruling R1), which a trial must have seen
// before it acts on the member.
//
//   member   age  probe class                  base record                          base status   event
//   pt-0009   72  frailty and advanced illness frailty, donepezil active            excluded      crc-b1 (B): frailty entered in error -> gap
//   pt-0020   52  hospice later revoked        hospice June-August 2026             excluded      crc-d1 (D): hospice discharge summary, a lure
//   pt-0022   52  collection vs report date    FIT collected in the period's first  met           crc-b2 (B): corrected collection date, the
//                                              week                                                day before the period -> gap
//   pt-0024   51  colonoscopy never done       sDNA-FIT of 2024 (outside lab); a    met           crc-o1 (O): the outside lab withdraws the
//                                              2025 colonoscopy order never done                  sDNA-FIT (another patient's) -> gap
//
// The other two probe classes (partial against total colectomy, nursing home against rehab) and
// the filler are off the panel; their charts stay as overlay.ts builds them (coordinator, builder-283
// design check: n = 4 cannot hold one member of each of the six classes and the filler).
//
// At base no member needs an order or a message: each is reviewed by seeing its decisive records
// (R32; ruling R33: the frailty clause holds only at 66 or older, so pt-0009's Patient decides it
// too). An amend event that fires turns its member into an open gap (DELIVERED): the base gates then
// leave that member to the event gates (tests/grader.ts), which grade the chart as delivered (C1).
// A gap's review is, as before the cut, complete searches that show every screening kind §3 counts
// absent in its window (rulings R20, R27, R31; absences) and its Patient (R33), and now also the
// arrival itself.
//
// Every status other than an open gap gets neither an order nor a message (RBC-QM-02 §5: order and
// message only for open gaps).
export type Status = 'met' | 'gap' | 'excluded' | 'not_in_population';

export interface Member {
  patient: string;
  name: string;
  family: string;
  age: number;
  status: Status;
  reason: string;
  // Whether a new FIT order and an outreach message are required (true), forbidden (false) or
  // allowed (null).
  order: boolean | null;
  message: boolean | null;
  // The resources the member's decision rests on, exposed before any write about the member.
  decisive: string[];
  // The atoms of a decisive note (ruling R29): the minimal words of its deciding line, in order.
  // The note counts as seen when one read or one search snippet of it shows every atom on one
  // line (tests/grader.ts firstSeenBy); a decisive record without atoms counts when a result
  // exposed it. No base member has one.
  atoms: Record<string, string[]>;
  // 'all': every decisive record must be seen. 'any': the policy lets the fact be established from
  // any one of them (ruling R21), so seeing one is enough. Every member here is 'all'.
  evidence: 'all' | 'any';
  // Whether the Patient's home address names the care facility the member lives in (R21); false
  // for every member here.
  address: boolean;
  // For an open gap, what shows that nothing closes it (rulings R20, R27, R31): one entry per
  // record kind the policy counts against the gap, each to be shown absent by a complete search: a
  // successful fhir_search of `type`, for the member or for no patient (clinic-wide), whose date_ge
  // (if any) is an instant at or before midnight on `from` in the clinic's zone (TIME_ZONE;
  // tests/grader.ts startCovers) and whose date_le (if any) reaches today; whose code filter (if
  // any) lists every one of `codes`; whose category filter (if any) holds one of `categories`; and
  // whose status filter (if any) lists every one of `statuses`; and complete: one page that held
  // every match, or a run of pages with the same filters from offset 0, each at the previous
  // next_offset, the last with none, or a date-sorted run that passes the window's edge (R36).
  // Empty for a member with no gap.
  absences: Absence[];
}

// Codes and categories are 'system|code'; statuses are bare.
export interface Absence {
  type: string;
  from: string | null;
  codes: string[];
  categories: string[];
  statuses: string[];
  // For a note kind, the words a notes search may name to show it absent, lowercase.
  words?: string[];
}

const m = (patient: string, name: string, family: string, age: number, status: Status, reason: string, decisive: string[], more: { absences?: Absence[] } = {}): Member => {
  const order = status === 'gap';
  return { patient: `Patient/${patient}`, name, family, age, status, reason, order, message: order, decisive, atoms: {}, evidence: 'all', address: false, absences: more.absences ?? [] };
};

// What an open gap rests on being absent (RBC-QM-02 §3; rulings R27, R31): no colonoscopy done in
// 2017-2026, no flexible sigmoidoscopy or CT colonography done in 2022-2026, no FOBT or FIT
// collected in 2026, no sDNA-FIT collected in 2024-2026. Each lists what policy.ts counts (R27):
// every code of the kind; the category stool tests carry (a laboratory result; procedures none); a
// stool test final, amended or corrected, a procedure completed.
const loinc = (cs: string[]) => cs.map((c) => `http://loinc.org|${c}`);
const sct = (cs: string[]) => cs.map((c) => `http://snomed.info/sct|${c}`);
const LAB = ['http://terminology.hl7.org/CodeSystem/observation-category|laboratory'];
const RESULTED = ['final', 'amended', 'corrected'];
const COLONOSCOPY_DONE: Absence = { type: 'Procedure', from: '2017-01-01', codes: sct(['73761001']), categories: [], statuses: ['completed'] };
const SIGMOIDOSCOPY_OR_CTC_DONE: Absence = { type: 'Procedure', from: '2022-01-01', codes: sct(['44441009', '418714002']), categories: [], statuses: ['completed'] };
const FOBT_IN_PERIOD: Absence = { type: 'Observation', from: '2026-01-01', codes: loinc(['2335-8', '29771-3', '57905-2', '58453-2', '80372-6', '27396-1', '12503-9']), categories: LAB, statuses: RESULTED };
const SDNA_IN_WINDOW: Absence = { type: 'Observation', from: '2024-01-01', codes: loinc(['77354-9', '77353-1']), categories: LAB, statuses: RESULTED };
export const SCREENING: readonly Absence[] = [COLONOSCOPY_DONE, SIGMOIDOSCOPY_OR_CTC_DONE, FOBT_IN_PERIOD, SDNA_IN_WINDOW];

export const expected = {
  group: ref('Group/grp-t3-okafor-crc'),
  period: { start: '2026-01-01', end: '2026-12-31' },
  items: [
    m('pt-0009', 'Elly Shyla Trantow', 'Trantow', 72, 'excluded', 'frailty_dementia_medication', [ref('Condition/cond-t3-6027'), ref('MedicationRequest/mr-t3-3318'), 'Patient/pt-0009']),
    m('pt-0020', 'Kelsie Wanetta Rohan', 'Rohan', 52, 'excluded', 'hospice', [ref('EpisodeOfCare/eoc-t3-8215')]),
    m('pt-0022', 'Tiny Darline Koss', 'Koss', 52, 'met', 'fobt', [ref('Observation/obs-t3-3906')]),
    m('pt-0024', 'Delaine Evelyn MacGyver', 'MacGyver', 51, 'met', 'sdna_fit', [ref('Observation/obs-t3-1279')]),
  ].sort((a, b) => a.patient.localeCompare(b.patient)),
};

// Each amend event's member on the chart as delivered (C1; events.ts): an open gap, which needs
// one FIT order and an outreach message about it (§5). Its decisive records are the arrival, the
// record it corrects or withdraws, and the Patient (R33); its absences are the screening kinds
// (§3). policy.ts applied to the world with the arrival gives the same status, age, order, message
// and absences (tests/events.test.ts). The arrival's own atoms, where it is a note, are in
// ARRIVAL_ATOMS.
export const DELIVERED: Readonly<Record<string, Member>> = {
  'crc-b1': m('pt-0009', 'Elly Shyla Trantow', 'Trantow', 72, 'gap', 'frailty_entered_in_error', ['Communication/comm-e3-5521', ref('Condition/cond-t3-6027'), 'Patient/pt-0009'], { absences: [...SCREENING] }),
  'crc-b2': m('pt-0022', 'Tiny Darline Koss', 'Koss', 52, 'gap', 'fit_collected_before_period', [ref('Observation/obs-t3-3906'), 'Patient/pt-0022'], { absences: [...SCREENING] }),
  'crc-o1': m('pt-0024', 'Delaine Evelyn MacGyver', 'MacGyver', 51, 'gap', 'sdna_withdrawn', ['DocumentReference/doc-e3-6804', ref('Observation/obs-t3-1279'), 'Patient/pt-0024'], { absences: [...SCREENING] }),
};

// The members who need an order at base: none (every member's order comes from its event).
export const ORDERED = expected.items.filter((x) => x.order === true).map((x) => x.patient);

// The probe class each member keeps (results/probe-1/classes.md): a design label, so it sits beside
// expected.items, not in it: policy.ts derives the items from the world and knows no classes.
export const CLASSES = {
  frailty_advanced_illness: ['Patient/pt-0009'],
  hospice_revoked: ['Patient/pt-0020'],
  collection_vs_report_date: ['Patient/pt-0022'],
  colonoscopy_never_done: ['Patient/pt-0024'],
} as const satisfies Record<string, readonly [string]>;
export type ItemClass = keyof typeof CLASSES;
export const classOf = (patient: string): ItemClass => Object.entries(CLASSES).find(([, ps]) => (ps as readonly string[]).includes(patient))?.[0] as ItemClass;
