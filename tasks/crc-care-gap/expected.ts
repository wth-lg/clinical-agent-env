import { syntheaRef } from '../../packages/env/synthea-ids.ts';
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
// Gate round 1 (rulings R20, R21) and the W1-T gate (R31, verifier-W1T-190-falsepass F3): every gap
// rests on absences (no screening of any kind §3 counts in its window, and none of the exclusions
// its class turns on), so it is reviewed by complete searches covering each window, with no filter
// that could hide a qualifying record (R27), and not by its trap record alone (absences); H2's
// residence may be read from any one of his housing status, discharge summary or rehab encounter
// (evidence 'any'), and H1's from any one of his housing status, his nursing facility visits or
// his Patient's address at the facility (evidence 'any', address; R21, R16, builder-265 audit of
// probe-1). A member who needs no contact is reviewed by seeing their decisive records (R32). Ruling R33: G1's and H1's exclusions hold only at 66 or older (§4), so the Patient, which
// holds the birth date, decides them with their records; the filler's Patient decides her age. A
// gap's age places it in the population (46 to 75, §2), and at 45 or 76 its action would be no order
// and no contact, so every gap's Patient decides its order too (R33, verifier-W1T-190-r2-falsepass
// N2): a fhir_read or a search_patients row, either of which shows the birth date. It is all-of,
// beside the absences; H2's any-of is among his residence records only, and H1's Patient is
// all-of for his age and, by a read that shows his address, one of his residence records.
//
// Ruling R34 sets what a gap's review does not cover: the §4 exclusions its class does not turn on
// (cancer, hospice outside C1, a total colectomy outside B2, the nursing home and frailty clauses
// outside their class) are not required (verifier-W1T-190-r2-falsepass N1). docs/tasks.md records
// it as a limit of what the class measures.
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
  // Whether the Patient's home address names the care facility the member lives in (H1's room at
  // Maple Grove Care Center): a read that shows the address counts among the any-of records
  // (R21, builder-265 audit). A search_patients row shows no address (R22), so it does not.
  address: boolean;
  // For an open gap, what shows that nothing closes it (rulings R20, R27, R31): one entry per
  // record kind the policy counts against the gap, each to be shown absent by a complete search.
  // Every gap lists the screening kinds §3 counts (a colonoscopy; a flexible sigmoidoscopy or CT
  // colonography; an FOBT or FIT; an sDNA-FIT), and the §4 exclusions its class turns on: C1 a
  // hospice or palliative care episode in 2026; B2 a total colectomy, coded or in a note (R28: a
  // scanned outside note can hold one, so his documents too); G2 an advanced illness diagnosis and
  // a dementia medication. Each entry says what a search must keep to count: a successful
  // fhir_search of `type`, for the member or for no patient (clinic-wide), whose date_ge (if any)
  // is an instant at or before midnight on `from` in the clinic's zone (TIME_ZONE; tests/grader.ts
  // startCovers) and whose date_le (if any) reaches today, or with no date filter at all where
  // `from` is null (the kind counts at any time, or its type dates records by a field a filter
  // would hide them by); whose code filter (if any) lists every one of `codes` (none: no code
  // filter counts); whose category filter (if any) holds one of `categories` (none: no category
  // filter counts); and whose status filter (if any) lists every one of `statuses`; and complete:
  // one page that held every match, or a run of pages with the same filters from offset 0, each at
  // the previous next_offset, the last with none. The gap counts as reviewed once every entry is
  // shown (R31); its trap record outside the window is a lure (R19) and reading it alone reviews
  // nothing. H2's residence is also needed, from any one of his records (evidence 'any', R21).
  // A kind with `words` (B2's notes) may instead be shown by a whole search_notes of the member or
  // of every patient whose query holds one of them, with no type filter and no date filter that
  // could hide one (tests/grader.ts notesCover; verifier-W1T-190-r2-clinical N2, R34).
  // Empty for every other member.
  absences: Absence[];
}

// Codes and categories are 'system|code'; statuses are bare.
export interface Absence {
  type: string;
  from: string | null;
  codes: string[];
  categories: string[];
  statuses: string[];
  // For a note kind, the words a notes search may name to show it absent (§7: search for the
  // words a note would use), lowercase, as search_notes tokenizes them.
  words?: string[];
}

const m = (patient: string, name: string, family: string, age: number, status: Status, reason: string, decisive: string[], more: { evidence?: 'any'; address?: true; absences?: Absence[]; atoms?: Record<string, string[]> } = {}): Member => {
  const order = status === 'gap';
  return { patient: `Patient/${patient}`, name, family, age, status, reason, order, message: order, decisive, atoms: more.atoms ?? {}, evidence: more.evidence ?? 'all', address: more.address ?? false, absences: more.absences ?? [] };
};

// What each open gap rests on being absent (RBC-QM-02 §3, §4; rulings R27, R31). Every gap: no
// colonoscopy done in 2017-2026, no flexible sigmoidoscopy or CT colonography done in 2022-2026, no
// FOBT or FIT collected in 2026, no sDNA-FIT collected in 2024-2026. C1 also no hospice or
// palliative care episode overlapping 2026; B2 no total colectomy, coded or in a note, at any time;
// G2 no advanced illness diagnosis and no dementia medication (fhir_search has no date on a
// Condition, and dates a MedicationRequest by its dosage timing, which a stopped order may lack, so
// neither may be date-filtered). Each lists what policy.ts counts (R27): every code of the kind
// where a code filter can name it (a dementia medication is matched by ingredient, so none); the
// category stool tests carry (a laboratory result; procedures, conditions, documents and episodes
// none); a stool test final, amended or corrected, a procedure completed, a care episode planned,
// active, on hold or finished (§4: a hospice episode in any of the four, a palliative care episode
// in all but planned; verifier-W1-probe-T3-clinical-3 F1, clinical-4 N1), a document current or
// superseded, a medication order in any status (§4: taken in the period or the year before, so a
// stopped or completed order counts too); a Condition search takes no status.
const loinc = (cs: string[]) => cs.map((c) => `http://loinc.org|${c}`);
const sct = (cs: string[]) => cs.map((c) => `http://snomed.info/sct|${c}`);
const LAB = ['http://terminology.hl7.org/CodeSystem/observation-category|laboratory'];
const RESULTED = ['final', 'amended', 'corrected'];
const COLONOSCOPY_DONE: Absence = { type: 'Procedure', from: '2017-01-01', codes: sct(['73761001']), categories: [], statuses: ['completed'] };
const SIGMOIDOSCOPY_OR_CTC_DONE: Absence = { type: 'Procedure', from: '2022-01-01', codes: sct(['44441009', '418714002']), categories: [], statuses: ['completed'] };
const FOBT_IN_PERIOD: Absence = { type: 'Observation', from: '2026-01-01', codes: loinc(['2335-8', '29771-3', '57905-2', '58453-2', '80372-6', '27396-1', '12503-9']), categories: LAB, statuses: RESULTED };
const SDNA_IN_WINDOW: Absence = { type: 'Observation', from: '2024-01-01', codes: loinc(['77354-9', '77353-1']), categories: LAB, statuses: RESULTED };
const SCREENING = [COLONOSCOPY_DONE, SIGMOIDOSCOPY_OR_CTC_DONE, FOBT_IN_PERIOD, SDNA_IN_WINDOW];
const HOSPICE_IN_PERIOD: Absence = { type: 'EpisodeOfCare', from: '2026-01-01', codes: [], categories: [], statuses: ['planned', 'active', 'onhold', 'finished'] };
const TOTAL_COLECTOMY_CODED: Absence = { type: 'Procedure', from: null, codes: sct(['26390003']), categories: [], statuses: ['completed'] };
const TOTAL_COLECTOMY_NOTE: Absence = { type: 'DocumentReference', from: null, codes: [], categories: [], statuses: ['current', 'superseded'], words: ['colectomy', 'proctocolectomy'] };
const ADVANCED_ILLNESS_DX: Absence = { type: 'Condition', from: null, codes: sct(['84114007', '13645005', '185086009', '52448006', '26929004', '433146000', '19943007', '128462008', '363418001']), categories: [], statuses: [] };
const DEMENTIA_MEDICATION: Absence = { type: 'MedicationRequest', from: null, codes: [], categories: [], statuses: ['active', 'on-hold', 'cancelled', 'completed', 'entered-in-error', 'stopped', 'draft', 'unknown'] };

export const expected = {
  group: ref('Group/grp-t3-okafor-crc'),
  period: { start: '2026-01-01', end: '2026-12-31' },
  items: [
    m('pt-0009', 'Elly Shyla Trantow', 'Trantow', 72, 'excluded', 'frailty_dementia_medication', [ref('Condition/cond-t3-6027'), ref('MedicationRequest/mr-t3-3318'), 'Patient/pt-0009']),
    m('pt-0011', 'Marilu Blanca Gaona', 'Gaona', 62, 'gap', 'hospice_before_period', [ref('EpisodeOfCare/eoc-t3-3051'), 'Patient/pt-0011'], { absences: [...SCREENING, HOSPICE_IN_PERIOD] }),
    m('pt-0014', 'Santo Rodrick Pagac', 'Pagac', 55, 'gap', 'colonoscopy_not_done', [ref('Appointment/appt-t3-5813'), 'Patient/pt-0014'], { absences: SCREENING }),
    m('pt-0018', 'Lance Amado Muller', 'Muller', 53, 'gap', 'sdna_fit_expired', [ref('Observation/obs-t3-7342'), 'Patient/pt-0018'], { absences: SCREENING }),
    m('pt-0019', "Harrison O'Keefe", "O'Keefe", 69, 'gap', 'frailty_without_advanced_illness', [ref('MedicationRequest/mr-t3-6604'), 'Patient/pt-0019'], { absences: [...SCREENING, ADVANCED_ILLNESS_DX, DEMENTIA_MEDICATION] }),
    m('pt-0020', 'Kelsie Wanetta Rohan', 'Rohan', 52, 'excluded', 'hospice', [ref('EpisodeOfCare/eoc-t3-8215')]),
    m('pt-0021', 'Ángela Andrea Vigil', 'Vigil', 52, 'excluded', 'total_colectomy', [ref('DocumentReference/doc-t3-1856')], { atoms: { [ref('DocumentReference/doc-t3-1856')]: ['total proctocolectomy'] } }),
    m('pt-0022', 'Tiny Darline Koss', 'Koss', 52, 'gap', 'fobt_expired', [ref('Observation/obs-t3-3906'), 'Patient/pt-0022'], { absences: SCREENING }),
    m('pt-0024', 'Delaine Evelyn MacGyver', 'MacGyver', 51, 'gap', 'colonoscopy_not_done', [ref('ServiceRequest/sr-t3-4417'), 'Patient/pt-0024'], { absences: SCREENING }),
    // H1's residence (R21, R16; builder-265 audit): any one of his housing status, his two nursing
    // facility visits at Maple Grove (February, the base visit overlay.ts moves there, and July) or
    // his Patient's address there. His Patient also holds his age, which stays all-of (R33).
    m('pt-0034', 'Rickey Morgan Sipes', 'Sipes', 72, 'excluded', 'nursing_home', [ref('Observation/obs-t3-2465'), syntheaRef('Encounter/enc-00204'), ref('Encounter/enc-t3-7781'), 'Patient/pt-0034'], { evidence: 'any', address: true }),
    m('pt-0035', 'Elvin Laverne Wolff', 'Wolff', 68, 'gap', 'not_nursing_home', [ref('Observation/obs-t3-8852'), ref('DocumentReference/doc-t3-6193'), ref('Encounter/enc-t3-4609'), 'Patient/pt-0035'], { evidence: 'any', absences: SCREENING, atoms: { [ref('DocumentReference/doc-t3-6193')]: ['discharged home'] } }),
    m('pt-0036', 'Nick Jed Bartoletti', 'Bartoletti', 53, 'gap', 'partial_colectomy', [ref('Procedure/proc-t3-6271'), 'Patient/pt-0036'], { absences: [...SCREENING, TOTAL_COLECTOMY_CODED, TOTAL_COLECTOMY_NOTE] }),
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
