import { ref } from './ids.ts';
// T3's expected end state as a W1 worklist probe (plan-amendment-worklist.md W1, T3 'Kept classes'):
// 13 members of the panel group, two instances of each of the six kept item classes and one filler,
// written by hand. policy.ts computes the same from the initial world, and the matrix
// fails when the two differ. The grader reads its targets here. Each member's decisive ids are
// only the records whose reading decides the member's action (ruling R1): the record that would
// change it were it otherwise, which a trial must have seen before it acts on the member.
//
//   class                          member   age  record                                         status
//   A colonoscopy never done       pt-0024   51  colonoscopy order 2025-03-12, window to 06-30  gap, order
//                                  pt-0014   55  colonoscopy order 2026-02-09, appointment
//                                                2026-04-14 no-show                             gap, order
//   B partial vs total colectomy   pt-0021   52  total proctocolectomy, outside operative note  excluded
//                                  pt-0036   53  sigmoid colectomy 2021 (diverticulitis)        gap, order
//   C hospice later revoked        pt-0011   62  hospice 2025-06-09 to 2025-10-20               gap, order
//                                  pt-0020   52  hospice 2026-06-16 to 2026-08-21               excluded
//   D collection vs report date    pt-0022   52  FIT collected 2025-12-29, resulted 2026-01-05  gap, order
//                                  pt-0018   53  sDNA-FIT collected 2023-12-27, resulted
//                                                2024-01-08                                     gap, order
//   G frailty and advanced         pt-0009   72  frailty, donepezil active                      excluded
//     illness at 66 or older       pt-0019   69  frailty, donepezil stopped 2023-03-20          gap, order
//   H long-term nursing home       pt-0034   72  housing status: lives in nursing home          excluded
//     against short rehab          pt-0035   68  3-week SNF rehab, then home                    gap, order
//   filler                         pt-0037   35  age 35                                         not in the population
//
// Two of the plan's eight classes are cut to fit the per-trial budget line (coordinator ruling at
// the builder-213 handshake): at 17 items the W0-B fit on pilot-3's T3 trials projects p90 $3.59, at
// 15 $3.07, at 14 $2.82 against $3.00. Cut: look-back windows at their edges (class E) and age at
// the end of the period (class F), the two with 0 failures in every pilot (the old E2, E3 and E4
// traps). Their four slots (pt-0017, pt-0023, pt-0025, pt-0032) stay T3's, off the panel.
//
// Gate round 1 (rulings R20, R21): the A, C1 and D gaps rest on an absence (no colonoscopy done, no
// hospice care in 2026, no stool test collected in its window), so a complete search covering the
// window, with no filter that could hide a qualifying record (R27), reviews them as well as the
// trap record does (absence); H2's residence may be read from
// any one of his housing status, discharge summary or rehab encounter (evidence 'any').
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
  // exposed it. B1's operative note: 'total proctocolectomy'. H2's discharge summary: 'discharged
  // home'. Both notes are longer than a snippet, so no snippet exposes either whole.
  atoms: Record<string, string[]>;
  // 'all': every decisive record must be seen. 'any': the policy lets the fact be established
  // from any one of them (ruling R21: housing from a status Observation, a discharge summary or
  // the stay's encounter), so seeing one is enough.
  evidence: 'all' | 'any';
  // For a gap whose deciding fact is that no screening of one kind falls in its window (rulings
  // R20, R27), what the policy counts as that screening, so a search can be checked for filters
  // that would hide it: a successful fhir_search of `type`, for the member or for no patient
  // (clinic-wide), whose date_ge (if any) is an instant at or before midnight on `from` in the
  // clinic's zone (TIME_ZONE; tests/grader.ts startCovers), whose date_le (if any) reaches today,
  // whose code filter (if any) lists every one of `codes`, whose category filter (if any) holds
  // one of `categories` (none: no category filter counts), and whose status filter (if any) lists
  // every one of `statuses`; and complete: one page that held every match, or a run of pages with
  // the same filters from offset 0, each at the previous next_offset, the last with none. Such a
  // search counts as reviewing the item, as seeing its decisive record does; the decisive record
  // outside the window is then a lure (R19). Null for every other member.
  absence: Absence | null;
}

// Codes and categories are 'system|code'; statuses are bare.
export interface Absence {
  type: string;
  from: string;
  codes: string[];
  categories: string[];
  statuses: string[];
}

const m = (patient: string, name: string, family: string, age: number, status: Status, reason: string, decisive: string[], more: { evidence?: 'any'; absence?: Absence; atoms?: Record<string, string[]> } = {}): Member => {
  const order = status === 'gap';
  return { patient: `Patient/${patient}`, name, family, age, status, reason, order, message: order, decisive, atoms: more.atoms ?? {}, evidence: more.evidence ?? 'all', absence: more.absence ?? null };
};

// The absences the open gaps of classes A, C and D rest on (RBC-QM-02 §3, §4): no colonoscopy done
// in 2017-2026 (A: the order or appointment is not one), no hospice episode overlapping 2026 (C1),
// no FOBT or FIT collected in 2026 (D1), no sDNA-FIT collected in 2024-2026 (D2). Each lists what
// policy.ts counts (R27): every code of the kind; the category stool tests carry (a laboratory
// result; colonoscopies carry none, and EpisodeOfCare has no code or category filter); a stool
// test final, amended or corrected, a colonoscopy completed, a care episode planned, active, on
// hold or finished (§4: a hospice episode in any of the four, a palliative care episode in all but
// planned; verifier-W1-probe-T3-clinical-3 F1, clinical-4 N1).
const loinc = (cs: string[]) => cs.map((c) => `http://loinc.org|${c}`);
const LAB = ['http://terminology.hl7.org/CodeSystem/observation-category|laboratory'];
const RESULTED = ['final', 'amended', 'corrected'];
const COLONOSCOPY_DONE: Absence = { type: 'Procedure', from: '2017-01-01', codes: ['http://snomed.info/sct|73761001'], categories: [], statuses: ['completed'] };
const HOSPICE_IN_PERIOD: Absence = { type: 'EpisodeOfCare', from: '2026-01-01', codes: [], categories: [], statuses: ['planned', 'active', 'onhold', 'finished'] };
const FOBT_IN_PERIOD: Absence = { type: 'Observation', from: '2026-01-01', codes: loinc(['2335-8', '29771-3', '57905-2', '58453-2', '80372-6', '27396-1', '12503-9']), categories: LAB, statuses: RESULTED };
const SDNA_IN_WINDOW: Absence = { type: 'Observation', from: '2024-01-01', codes: loinc(['77354-9', '77353-1']), categories: LAB, statuses: RESULTED };

export const expected = {
  group: ref('Group/grp-t3-okafor-crc'),
  period: { start: '2026-01-01', end: '2026-12-31' },
  items: [
    m('pt-0009', 'Elly Shyla Trantow', 'Trantow', 72, 'excluded', 'frailty_dementia_medication', [ref('Condition/cond-t3-6027'), ref('MedicationRequest/mr-t3-3318')]),
    m('pt-0011', 'Marilu Blanca Gaona', 'Gaona', 62, 'gap', 'hospice_before_period', [ref('EpisodeOfCare/eoc-t3-3051')], { absence: HOSPICE_IN_PERIOD }),
    m('pt-0014', 'Santo Rodrick Pagac', 'Pagac', 55, 'gap', 'colonoscopy_not_done', [ref('Appointment/appt-t3-5813')], { absence: COLONOSCOPY_DONE }),
    m('pt-0018', 'Lance Amado Muller', 'Muller', 53, 'gap', 'sdna_fit_expired', [ref('Observation/obs-t3-7342')], { absence: SDNA_IN_WINDOW }),
    m('pt-0019', "Harrison O'Keefe", "O'Keefe", 69, 'gap', 'frailty_without_advanced_illness', [ref('MedicationRequest/mr-t3-6604')]),
    m('pt-0020', 'Kelsie Wanetta Rohan', 'Rohan', 52, 'excluded', 'hospice', [ref('EpisodeOfCare/eoc-t3-8215')]),
    m('pt-0021', 'Ángela Andrea Vigil', 'Vigil', 52, 'excluded', 'total_colectomy', [ref('DocumentReference/doc-t3-1856')], { atoms: { [ref('DocumentReference/doc-t3-1856')]: ['total proctocolectomy'] } }),
    m('pt-0022', 'Tiny Darline Koss', 'Koss', 52, 'gap', 'fobt_expired', [ref('Observation/obs-t3-3906')], { absence: FOBT_IN_PERIOD }),
    m('pt-0024', 'Delaine Evelyn MacGyver', 'MacGyver', 51, 'gap', 'colonoscopy_not_done', [ref('ServiceRequest/sr-t3-4417')], { absence: COLONOSCOPY_DONE }),
    m('pt-0034', 'Rickey Morgan Sipes', 'Sipes', 72, 'excluded', 'nursing_home', [ref('Observation/obs-t3-2465')]),
    m('pt-0035', 'Elvin Laverne Wolff', 'Wolff', 68, 'gap', 'not_nursing_home', [ref('Observation/obs-t3-8852'), ref('DocumentReference/doc-t3-6193'), ref('Encounter/enc-t3-4609')], { evidence: 'any', atoms: { [ref('DocumentReference/doc-t3-6193')]: ['discharged home'] } }),
    m('pt-0036', 'Nick Jed Bartoletti', 'Bartoletti', 53, 'gap', 'partial_colectomy', [ref('Procedure/proc-t3-6271')]),
    m('pt-0037', 'Fumiko Kati Pouros', 'Pouros', 35, 'not_in_population', 'age_under_46', ['Patient/pt-0037']),
  ].sort((a, b) => a.patient.localeCompare(b.patient)),
};

export const ORDERED = expected.items.filter((x) => x.order === true).map((x) => x.patient);

// The probe's class table (plan-amendment-worklist.md W1, T3): each kept class with its two
// members, and the filler. A design label, so it sits beside expected.items, not in it: policy.ts
// derives the items from the world and knows no classes.
export const CLASSES = {
  colonoscopy_never_done: ['Patient/pt-0024', 'Patient/pt-0014'],
  partial_vs_total_colectomy: ['Patient/pt-0021', 'Patient/pt-0036'],
  hospice_revoked: ['Patient/pt-0011', 'Patient/pt-0020'],
  collection_vs_report_date: ['Patient/pt-0022', 'Patient/pt-0018'],
  frailty_advanced_illness: ['Patient/pt-0009', 'Patient/pt-0019'],
  nursing_home_vs_rehab: ['Patient/pt-0034', 'Patient/pt-0035'],
} as const satisfies Record<string, readonly [string, string]>;
export const FILLER = 'Patient/pt-0037';
export type ItemClass = keyof typeof CLASSES | 'filler';
export const classOf = (patient: string): ItemClass => (patient === FILLER ? 'filler' : (Object.entries(CLASSES).find(([, ps]) => (ps as readonly string[]).includes(patient))?.[0] as ItemClass));
