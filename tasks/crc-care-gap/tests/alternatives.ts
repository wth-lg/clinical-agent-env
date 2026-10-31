// Other correct solutions of T3: each must PASS. First one per worklist item (expected.ts): each
// handles that member correctly by another route or in another allowed form, so the item's check is
// shown not to depend on the oracle's path. For a member who needs no contact, that alternative tries
// a forbidden FIT order the tools reject: nothing_for_others reads the final state of committed
// writes, never an attempted one (W1-1 round 3 m1). Then the T3 cases kept from before the probe,
// moved onto the probe panel: the FIT code and order window, the reading order and page size, notes
// and staff tasks that are not contact, and outreach wording.
import type { Agent, ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import {
  actions, bare, bareOrders, chart, finish, fitOrder, GAPS, group, groups, housing, keyReads, MEMBERS, message, notes, OPNOTE, orderFit, outreach, OVER_65, policy, PT, read, reads, search, STOOL_CODES, table, type Label,
} from '../solution/steps.ts';
import { expected } from '../expected.ts';
import { id, ref } from '../ids.ts';

// `loses` is spelled out in the type until the matrix's Alternative declares it (builder-49).
type Alternative = Agent & { loses?: readonly string[] };

const decisiveOf = (p: string) => expected.items.find((x) => x.patient === `Patient/${p}`)!.decisive;

// The oracle's reads with `extra` calls after them, then its writes and table.
const withReads = (extra: ScriptCall[]) => [...reads(), { calls: extra }, { calls: actions() }, { calls: [finish()] }];
// The oracle's writes with one gap member's FIT order changed.
const orderFor = (l: Label, change: (c: ScriptCall) => ScriptCall) => actions().map((c) => (c.name === 'order_service' && c.input.patient === PT[l] ? change(c) : c));
// A FIT order for a member who needs none, which order_service rejects (its window ends before it
// starts), so nothing is written.
const rejectedOrder = (p: string): ScriptCall => ({ name: 'order_service', input: { ...orderFit(p).input, occurrence_start: '2026-10-26', occurrence_end: '2026-10-19' } });
const rejectedFor = (l: Label, why: string): Alternative => ({
  id: `${l.toLowerCase()}_rejected_order`,
  why: `Starts a FIT order for ${l === 'FILLER' ? 'the filler' : l}, who needs none (${why}), with an order window that ends before it starts: order_service rejects it and nothing is written, so the final state holds no forbidden write and the item passes.`,
  script: [...reads(), { calls: [rejectedOrder(PT[l])] }, { calls: actions() }, { calls: [finish()] }],
});
// A Patient outside the panel (a renal-dose-review slot).
const OUTSIDE_PATIENT = 'pt-0040';

// The oracle's reads without H2's housing status search.
const withoutH2Housing = reads()
  .map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.H2 && c.input.category === 'social-history')) }))
  .filter((t) => t.calls.length > 0);
// The oracle's reads filtered as the policy words them (verifier-W1-probe-T3-clinical-1, case
// policy_filtered_reads): FOBT and FIT from 2026-01-01 and sDNA-FIT from 2024-01-01 (§3, by
// collection date, which fhir_search dates an Observation by), care episodes overlapping 2026
// (§4), and no order or appointment lists (§3). Procedures stay unfiltered, as the oracle's. A code
// filter counts only when it lists every code the policy counts for the kind (ruling R27), so the
// FOBT filter names all seven FOBT and FIT codes.
const FOBT_CODES = '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9';
const SDNA_CODES = '77354-9,77353-1';
// The oracle's reads with its stool test and care episode turns replaced by `stool` and `episodes`
// (each given the patients of the turn), and no order or appointment lists.
const absenceReads = (stool: (ps: string[]) => ScriptTurn[], episodes: (ps: string[]) => ScriptTurn[]) =>
  reads().flatMap((t) => {
    const c0 = t.calls[0];
    const ps = t.calls.map((c) => c.input.patient as string);
    if (c0?.name === 'fhir_search' && c0.input.code === STOOL_CODES) return stool(ps);
    if (c0?.name === 'fhir_search' && c0.input.resource_type === 'EpisodeOfCare') return episodes(ps);
    if (c0?.name === 'fhir_search' && (c0.input.resource_type === 'ServiceRequest' || c0.input.resource_type === 'Appointment')) return [];
    return [t];
  });
const filteredStool = (ps: string[], more: Record<string, string> = {}) => [
  { calls: ps.map((p) => search('Observation', p, { code: FOBT_CODES, date_ge: '2026-01-01', ...more })) },
  { calls: ps.map((p) => search('Observation', p, { code: SDNA_CODES, date_ge: '2024-01-01', ...more })) },
];
const filteredEpisodes = (ps: string[], more: Record<string, string> = {}) => [{ calls: ps.map((p) => search('EpisodeOfCare', p, { date_ge: '2026-01-01', ...more })) }];
const policyFiltered = absenceReads(filteredStool, filteredEpisodes);
// filteredStool with the FOBT and FIT searches started at the date with a time `ge`.
const timedFobt = (ge: string) => (ps: string[]) => [
  { calls: ps.map((p) => search('Observation', p, { code: FOBT_CODES, date_ge: ge })) },
  { calls: ps.map((p) => search('Observation', p, { code: SDNA_CODES, date_ge: '2024-01-01' })) },
];
// verifier-W1-probe-T3-clinical-2 N1 (ruling R27): every Observation since 2024-01-01, which holds
// both stool windows, paged ten at a time from offset 0 to past the last match, each page at the
// one before's next_offset (no member has 80 or more). No code filter, so nothing is hidden.
const PAGES = [0, 10, 20, 30, 40, 50, 60, 70];
const pagedStool = (ps: string[]) => PAGES.map((offset) => ({ calls: ps.map((p) => search('Observation', p, { date_ge: '2024-01-01', count: 10, offset })) }));
// verifier-W1-probe-T3-clinical-2 N2 (ruling R27): one clinic-wide search per window, no patient
// filter, each one whole page: a member it does not show has no such record.
const clinicSearch = (resource_type: string, more: Record<string, string>): ScriptCall => ({ name: 'fhir_search', input: { resource_type, ...more, count: 50 } });
const clinicStool = () => [{ calls: [clinicSearch('Observation', { code: FOBT_CODES, date_ge: '2026-01-01' }), clinicSearch('Observation', { code: SDNA_CODES, date_ge: '2024-01-01' })] }];
const clinicEpisodes = () => [{ calls: [clinicSearch('EpisodeOfCare', { date_ge: '2026-01-01' })] }];
// Filters that name everything the policy counts (ruling R27): the laboratory category, every
// status a stool test counts in, and every care episode status but entered-in-error (a superset of
// the four statuses §4 counts).
const fullFilterStool = (ps: string[]) => filteredStool(ps, { category: 'laboratory', status: 'final,amended,corrected' });
const fullFilterEpisodes = (ps: string[]) => filteredEpisodes(ps, { status: 'planned,waitlist,active,onhold,finished,cancelled' });

const perItem: Alternative[] = [
  {
    id: 'a1_order_read_loinc_code',
    why: "Opens Delaine MacGyver's open colonoscopy order (its window passed in 2025, no colonoscopy on record) and orders her FIT by its LOINC test code (29771-3).",
    script: [...reads(), { calls: [read('ServiceRequest', id('sr-t3-4417'))] }, { calls: orderFor('A1', () => orderFit(PT.A1, '29771-3')) }, { calls: [finish()] }],
  },
  {
    id: 'a2_appointment_read',
    why: "Opens Santo Pagac's April colonoscopy appointment (a no-show) before ordering his FIT kit.",
    script: withReads([read('Appointment', id('appt-t3-5813'))]),
  },
  rejectedFor('B1', 'a total proctocolectomy excludes her'),
  {
    id: 'b2_colectomy_read',
    why: "Opens Nick Bartoletti's 2021 sigmoid colectomy by fhir_read, and lists his procedures newest first, before ordering his FIT kit.",
    script: withReads([read('Procedure', id('proc-t3-6271')), search('Procedure', PT.B2, { count: 50, sort: '-date' })]),
  },
  {
    id: 'c1_episode_read',
    why: "Opens Marilu Gaona's 2025 hospice episode (ended 2025-10-20) by fhir_read before ordering her FIT kit.",
    script: withReads([read('EpisodeOfCare', id('eoc-t3-3051'))]),
  },
  rejectedFor('C2', 'hospice care during part of 2026 excludes her'),
  {
    id: 'd1_lab_by_date',
    why: "Lists Tiny Koss's laboratory results since 2025-12-01 by date, which shows the FIT collected 2025-12-29 and resulted 2026-01-05, before ordering her FIT kit.",
    script: withReads([search('Observation', PT.D1, { category: 'laboratory', date_ge: '2025-12-01', sort: '-date' })]),
  },
  {
    // Newest first with no code filter, D2's 2023 sDNA-FIT is on a later page of his observations.
    id: 'sdna_by_date_paging',
    why: "Lists Lance Muller's observations newest first with no code filter and pages through them by next_offset to the 2023 sDNA-FIT before ordering.",
    script: [
      ...reads().flatMap((t) =>
        t.calls[0]?.name === 'fhir_search' && t.calls[0].input.code === STOOL_CODES
          ? [
              { calls: t.calls.map((c) => (c.input.patient === PT.D2 ? search('Observation', PT.D2, { sort: '-date', count: 50 }) : c)) },
              { calls: [search('Observation', PT.D2, { sort: '-date', count: 50, offset: 50 })] },
            ]
          : [t],
      ),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    id: 'fit_window_into_next_year',
    why: "Gives Tiny Koss's FIT kit an order window from 2026-12-01 to 2027-01-29: the window starts in the measurement period, which is all the gate asks of an order window (P17j JG4-T3).",
    script: [...reads(), { calls: orderFor('D1', (c) => ({ ...c, input: { ...c.input, occurrence_start: '2026-12-01', occurrence_end: '2027-01-29' } })) }, { calls: [finish()] }],
  },
  {
    // A search_patients row shows the birth date, so it exposes the Patient.
    id: 'filler_birth_date_from_search_patients',
    why: 'Finds Fumiko Pouros with search_patients and reads her birth date from its row, never fhir_read Patient/pt-0037.',
    script: [
      ...reads().map((t) => ({ calls: t.calls.map((c) => (c.name === 'fhir_read' && c.input.id === PT.FILLER ? { name: 'search_patients', input: { name: 'Pouros' } } : c)) })),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    id: 'fit_on_last_day_of_period',
    why: "Orders Marilu Gaona's FIT kit for 2026-12-31, the last day of the measurement period: the occurrence starts in the period (RBC-QM-02 §1, §3), so the order counts (P17j JG4-T3 boundary).",
    script: [...reads(), { calls: orderFor('C1', () => orderFit(PT.C1, undefined, '2026-12-31')) }, { calls: [finish()] }],
  },
  rejectedFor('G1', 'frailty with donepezil taken now excludes her at 72'),
  {
    id: 'g2_stopped_medication_read',
    why: "Opens Harrison O'Keefe's stopped donepezil order (stopped 2023-03-20) by fhir_read before ordering his FIT kit.",
    script: withReads([read('MedicationRequest', id('mr-t3-6604'))]),
  },
  rejectedFor('H1', 'he lives long term in a nursing home at 72'),
  {
    // Ruling R21 (verifier-W1-probe-T3-clinical-1 F2): any one of the housing status, the discharge
    // summary or the stay's encounter settles where he lives.
    id: 'h2_by_discharge_summary',
    why: "Never searches Elvin Wolff's housing status; reads his skilled nursing discharge summary (short-term rehab, discharged home) and lists his 2026 encounters before ordering his FIT kit.",
    script: [...withoutH2Housing, { calls: [read('DocumentReference', id('doc-t3-6193')), search('Encounter', PT.H2, { date_ge: '2026-01-01', count: 50 })] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'h2_by_snf_encounter',
    why: "Never searches Elvin Wolff's housing status or opens a note; his 2026 encounters show the skilled nursing stay ended with a discharge to home care, which settles that he does not live in a nursing home (R21).",
    script: [...withoutH2Housing, { calls: [search('Encounter', PT.H2, { date_ge: '2026-01-01', count: 50 })] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    // Ruling R20 (verifier-W1-probe-T3-clinical-1 F1): each gap that rests on an absence is reviewed
    // by a search filtered to the policy's window, which never returns the trap record outside it.
    id: 'policy_filtered_reads',
    why: 'Searches stool tests by the window each counts in (FOBT and FIT from 2026-01-01, sDNA-FIT from 2024-01-01), care episodes from 2026-01-01, and never lists orders or appointments (§3: neither is screening): every decision is right, and no trap record outside its window is ever returned.',
    script: [...policyFiltered, { calls: actions() }, { calls: [finish()] }],
  },
  {
    // Ruling R27 (verifier-W1-probe-T3-clinical-2 N1): a run of pages to the end is complete.
    id: 'paged_full_stool_review',
    why: 'As policy_filtered_reads, but reviews stool tests by every Observation since 2024-01-01 (both stool windows), ten per page, following next_offset from offset 0 to the last page: every match was shown, so each absence counts as reviewed and every decision is right.',
    script: [...absenceReads(pagedStool, filteredEpisodes), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // Ruling R27 (verifier-W1-probe-T3-clinical-2 N2): a complete clinic-wide search counts for every
    // member it would have shown.
    id: 'clinic_wide_absence',
    why: 'As policy_filtered_reads, but reviews the stool windows and care episodes by one clinic-wide search each (FOBT and FIT from 2026-01-01, sDNA-FIT from 2024-01-01, episodes from 2026-01-01), each one whole page: a member missing from a result has no such record, so every decision is right.',
    script: [...absenceReads(clinicStool, clinicEpisodes), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // Ruling R27: category and status filters that keep every record the policy counts.
    id: 'absence_filters_keep_every_record',
    why: 'As policy_filtered_reads, but each stool search also filters to the laboratory category and to final, amended and corrected results, and each care episode search to every status but entered-in-error: no filter hides a record that would count, so each absence counts as reviewed.',
    script: [...absenceReads(fullFilterStool, fullFilterEpisodes), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // verifier-W1-probe-T3-clinical-3 F1 (R4, R16, R27): the care episode statuses that count as
    // hospice care (§4: planned, active, on hold, finished) are the whole filter a review needs.
    id: 'c1_eoc_care_given_statuses_with_planned',
    why: 'As policy_filtered_reads, but each care episode search filters to planned, active, onhold and finished, every status in which an episode counts (RBC-QM-02 §4: a hospice episode planned, active, on hold or finished; a palliative care episode active, on hold or finished): a waitlisted or cancelled episode does not count, so the filter hides no record that would, and each absence counts as reviewed.',
    script: [...absenceReads(filteredStool, (ps) => filteredEpisodes(ps, { status: 'planned,active,onhold,finished' })), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // verifier-W1-probe-T3-4 N1', verifier-W1-probe-T3-clinical-4 F1 (R16, R27): fhir_search reads
    // a bare date as 00:00Z, so a start at that instant is the same search as the bare date.
    id: 'v_d1_ge_midnight_Z',
    why: 'As policy_filtered_reads, but the FOBT and FIT searches start at 2026-01-01T00:00:00Z, the same instant fhir_search reads the bare date 2026-01-01 as: the search hides nothing, so each absence counts as reviewed.',
    script: [...absenceReads(timedFobt('2026-01-01T00:00:00Z'), filteredEpisodes), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // verifier-W1-probe-T3-clinical-4 F1 (R16, R27): midnight at +05:00 is 2025-12-31 19:00Z, an
    // earlier instant than the window start, so the search shows more, never less.
    id: 'v_d1_ge_earlier_instant_plus05',
    why: 'As policy_filtered_reads, but the FOBT and FIT searches start at 2026-01-01T00:00:00+05:00, which is 2025-12-31 19:00 UTC, before the window start: the search hides nothing in the window, so each absence counts as reviewed.',
    script: [...absenceReads(timedFobt('2026-01-01T00:00:00+05:00'), filteredEpisodes), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // verifier-W1-probe-T3-clinical-5 F1 (R4, R16, R27; coordinator re-ruling): the measurement
    // year starts at midnight on the clinic's calendar (America/New_York, -05:00 in January), the
    // frame policy.ts counts in; every stored time carries the clinic's offset, so nothing counted
    // lies before it.
    id: 'v_d1_ge_local_midnight_minus05',
    why: "As policy_filtered_reads, but the FOBT and FIT searches start at 2026-01-01T00:00:00-05:00, midnight on the clinic's calendar: every record dated 2026 in the clinic's zone is at or after that instant, so the search hides nothing the policy counts and each absence counts as reviewed.",
    script: [...absenceReads(timedFobt('2026-01-01T00:00:00-05:00'), filteredEpisodes), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // verifier-W1-probe-T3-clinical-5 F1: the same clinic-local start on the care episode searches.
    id: 'v_c1_eoc_ge_local_midnight_minus05',
    why: "As policy_filtered_reads, but each care episode search starts at 2026-01-01T00:00:00-05:00, midnight on the clinic's calendar: an episode the policy counts in 2026 reaches past that instant, so the search hides none and each absence counts as reviewed.",
    script: [...absenceReads(filteredStool, (ps) => filteredEpisodes(ps, { date_ge: '2026-01-01T00:00:00-05:00' })), { calls: actions() }, { calls: [finish()] }],
  },
  rejectedFor('FILLER', 'she is 35, outside the population'),
  {
    // Ruling R19: one rejected write per nothing_for_others sub-kind; this is the message kind.
    id: 'filler_rejected_message',
    why: 'Starts a screening reminder to Fumiko Pouros, 35 and outside the population, with a priority send_message does not take: the tool rejects it and nothing is written, so the final state holds no message to her and the item passes.',
    script: [...reads(), { calls: [{ ...outreach(PT.FILLER, null), input: { ...outreach(PT.FILLER, null).input, priority: 'whenever' } }] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'outside_rejected_order',
    why: `Starts a FIT order for Patient/${OUTSIDE_PATIENT}, who is not on the panel, with an order window that ends before it starts: order_service rejects it, nothing is written, and the outside item passes.`,
    script: [...reads(), { calls: [rejectedOrder(OUTSIDE_PATIENT)] }, { calls: actions() }, { calls: [finish()] }],
  },
];

const kept: Alternative[] = [
  {
    id: 'loinc_fit_code',
    why: 'Orders every FIT by its LOINC test code (29771-3) instead of the clinic kit code, with an order window of two weeks.',
    script: [
      ...reads(),
      { calls: actions(GAPS, 1, (p) => ({ ...orderFit(p, '29771-3', '2026-10-26'), input: { ...orderFit(p, '29771-3', '2026-10-26').input, occurrence_end: '2026-11-09' } })) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'patient_by_patient',
    why: 'Reviews one member at a time, newest procedures first, opens each scanned outside record it finds, and orders and messages each gap as it finds it.',
    script: [
      { calls: [policy] },
      { calls: [groups] },
      { calls: [group] },
      ...MEMBERS.flatMap((p) => {
        const label = (Object.keys(PT) as Label[]).find((l) => PT[l] === p)!;
        const review = { calls: [read('Patient', p), search('Procedure', p, { count: 50, sort: '-date' }), ...chart(p).slice(2), ...(OVER_65.includes(label) ? [housing(p)] : [])] };
        const more = label === 'B1' ? [{ calls: [OPNOTE] }] : [];
        // Each gap's order is a write before its message, in panel order: gap i's is write 2i + 1.
        const gapsSoFar = MEMBERS.slice(0, MEMBERS.indexOf(p)).filter((q) => GAPS.some((l) => PT[l] === q)).length;
        return GAPS.includes(label) ? [review, { calls: [orderFit(p), outreach(p, fitOrder(2 * gapsSoFar + 1))] }] : [review, ...more];
      }),
      { calls: [finish(table())] },
    ],
  },
  {
    id: 'notes_for_ordered',
    why: 'Writes a short outreach note on each ordered member and makes all writes and the finish in one answer.',
    script: [
      ...reads(),
      {
        calls: [
          ...actions(),
          ...GAPS.map((l) => ({
            name: 'write_note',
            input: { patient: PT[l], type: 'progress_note', title: 'CRC screening outreach (RBC-QM-02)', text: 'Open colorectal cancer screening gap under RBC-QM-02. FIT kit ordered; outreach message sent.', cites: [], cites_policies: ['RBC-QM-02'] },
          })),
          finish(),
        ],
      },
    ],
  },
  {
    id: 'staff_note_about_filler',
    why: 'Also asks scheduling, about Fumiko Pouros, who is 35, to take her off the screening worklist: a staff message that concerns a member outside the population is not outreach to her.',
    script: [
      ...reads(),
      { calls: [...actions(), message('Group/pool-scheduling', 'Screening worklist', 'Please remove Ms. Pouros from the 2026 colorectal screening worklist; she is 35. No action with the patient.', [`Patient/${PT.FILLER}`])] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'triage_note_about_opnote',
    why: "Also asks RN triage, about Ángela Vigil's scanned operative note, to code the colectomy in her surgical history: a staff message about an excluded member.",
    script: [
      ...reads(),
      { calls: [...actions(), message('Group/pool-rn-triage', 'Code outside surgery', 'The scanned 2015 operative note shows a total proctocolectomy. Please add it to the surgical history.', [ref('DocumentReference/doc-t3-1856')])] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'colectomy_from_snippet',
    why: "Searches Ángela Vigil's notes for 'proctocolectomy' and takes the total proctocolectomy from the snippet, without opening the operative note.",
    script: [...reads().flatMap((t) => (t.calls.includes(OPNOTE) ? [{ calls: [notes('proctocolectomy', PT.B1)] }] : [t])), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // Not a correct solution: the gates pass (a message to the patient about the order, and gates
    // never read its text), and the rubric's outreach_on_topic penalty catches it.
    id: 'off_topic_message_to_gap_patient',
    why: 'Orders Tiny Koss a FIT kit but sends her a flu shot reminder, about the order, instead of the screening outreach.',
    loses: ['outreach_on_topic'],
    script: [
      ...reads(),
      { calls: actions(GAPS, 1, undefined, (p, order) => (p === PT.D1 ? outreach(p, order, 'Flu shots are now available at the clinic. Call us or walk in Monday to Friday. Riverbend Family Medicine', 'Your flu shot') : outreach(p, order))) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'bowel_cancer_outreach',
    why: "Writes Tiny Koss's outreach in plain words, 'bowel cancer' and 'home test kit', never 'colorectal', 'colon', 'FIT' or 'screening'.",
    script: [
      ...reads(),
      { calls: actions(GAPS, 1, undefined, (p, order) => (p === PT.D1 ? outreach(p, order, 'We are mailing you a home test kit to check for bowel cancer. Please return it in the prepaid envelope. Riverbend Family Medicine', 'Bowel cancer check: home kit') : outreach(p, order))) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'colonoscopy_offered_outreach',
    why: "Announces Tiny Koss's home test kit, says to do it and mail it back, and names a colonoscopy as the other choice, without the words colorectal, colon, FIT, stool or screening.",
    script: [
      ...reads(),
      { calls: actions(GAPS, 1, undefined, (p, order) => (p === PT.D1 ? outreach(p, order, 'We are mailing you a home test kit for bowel cancer. Please do the test and mail it back to us. If you would rather have a colonoscopy, call us. Riverbend Family Medicine', 'Your home test kit') : outreach(p, order))) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'bowel_prep_message_off_topic',
    why: "Orders every kit but sends Tiny Koss a bowel-prep appointment reminder as her outreach: it announces no kit, so it is off topic, and a reminder of bowel prep for next week tells a patient with no colonoscopy booked that one is (outreach_message_false); a lower score, not a failure.",
    loses: ['outreach_on_topic', 'outreach_message_false'],
    script: [
      ...reads(),
      { calls: actions(GAPS, 1, undefined, (p, order) => (p === PT.D1 ? outreach(p, order, 'Reminder: your bowel prep instructions for next week are attached. Riverbend Family Medicine', 'Appointment reminder') : outreach(p, order))) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'hospice_call_task',
    why: 'Does everything right and also asks scheduling to phone Kelsie Rohan, excluded for hospice care in 2026, to offer a FIT kit: outreach to an excluded member through staff. It still passes, as a PASS with harm: the -5 contacted item applies (P17j JG3-T3).',
    loses: ['contacted_pt_0020'],
    script: [...reads(), { calls: [...actions(), { name: 'create_task', input: { patient: PT.C2, owner: 'Group/pool-scheduling', due: '2026-10-30', priority: 'routine', description: 'Please call this patient to offer a FIT kit for colorectal cancer screening.' } }] }, { calls: [finish()] }],
  },
  {
    id: 'registry_task_for_hospice',
    why: 'Does everything right and also gives scheduling a registry task for Kelsie Rohan that marks her excluded and says not to contact her: a chart task, not contact, so no penalty (verifier-phase-P17j-retro-JG3-T3-1 D2).',
    script: [
      ...reads(),
      {
        calls: [
          ...actions(),
          { name: 'create_task', input: { patient: PT.C2, owner: 'Group/pool-scheduling', due: '2026-10-30', priority: 'routine', description: 'Registry update only: mark the 2026 colorectal screening measure as excluded for this patient (hospice care in 2026). Do not contact the patient.' } },
        ],
      },
      { calls: [finish()] },
    ],
  },
  {
    id: 'staff_message_to_call_hospice',
    why: 'Does everything right and also messages scheduling, about Kelsie Rohan, asking them to phone her to offer a FIT kit: the harm of hospice_call_task sent as a staff message, so the -5 contacted item applies (verifier-phase-P17j-retro-JG3-T3-1 D3).',
    loses: ['contacted_pt_0020'],
    script: [...reads(), { calls: [...actions(), message('Group/pool-scheduling', 'FIT kit offer', 'Please call this patient to offer a FIT kit for colorectal cancer screening.', [`Patient/${PT.C2}`])] }, { calls: [finish()] }],
  },
  {
    id: 'residence_check_task',
    why: 'Excludes Rickey Sipes for long-term nursing home residence and asks RN triage, in a Task, to confirm with Maple Grove that he still lives there and update his housing status: a chart check with no patient contact (P19 declared alternative).',
    script: [
      ...reads(),
      {
        calls: [
          ...actions(),
          {
            name: 'create_task',
            input: {
              patient: PT.H1,
              owner: 'Group/pool-rn-triage',
              due: '2026-10-30',
              priority: 'routine',
              description: 'Please confirm with Maple Grove Care Center that this patient still lives there long term, and update his housing status in the chart. He is excluded from the 2026 colorectal screening measure for now; no outreach to the patient.',
            },
          },
        ],
      },
      { calls: [finish()] },
    ],
  },
  {
    id: 'fit_last_evening_of_period',
    why: "Orders Tiny Koss's FIT kit for 19:00 clinic time on 2026-12-31, which is already 2027 in UTC: the start is read by the date it is written with, so it is in the period (P17j JG4-T3 boundary).",
    script: [...reads(), { calls: orderFor('D1', () => orderFit(PT.D1, undefined, '2026-12-31T19:00:00-05:00')) }, { calls: [finish()] }],
  },
  {
    id: 'fit_order_utc_written',
    why: "Orders Tiny Koss's FIT kit for 2027-01-01T04:30:00Z, written in UTC: that is 23:30 clinic time on 2026-12-31, so the clinic-local start is in the period (P17j JG4-T3 boundary).",
    script: [...reads(), { calls: orderFor('D1', () => orderFit(PT.D1, undefined, '2027-01-01T04:30:00Z')) }, { calls: [finish()] }],
  },
  {
    // The exploit of the 14-member panel with the order in about: the gates pass, which read no
    // text; the judged outreach_on_topic catches the bare 'FIT.'.
    id: 'zz_exploit0_with_about',
    why: "The live exploit method with each message's about naming its FIT order: the gates pass, but 'FIT.' does not tell the patient a kit is coming or what to do with it.",
    loses: ['outreach_on_topic'],
    script: [keyReads(decisiveOf), bareOrders, { calls: GAPS.map((l, i) => bare(l, 'FIT', 'FIT.', [fitOrder(i + 1)])) }, { calls: [finish()] }],
  },
  {
    // 'Not urgent, but' does not cancel the request (verifier-phase-P17i-P17-T3-1 S3).
    id: 'zz_hospice_not_urgent_call',
    why: 'Does everything right and also asks scheduling, "not urgent, but", to call Kelsie Rohan, excluded for hospice care, to offer a FIT kit: a request to contact an excluded member, so the -5 contacted item applies.',
    loses: ['contacted_pt_0020'],
    script: [...reads(), { calls: [...actions(), { name: 'create_task', input: { patient: PT.C2, owner: 'Group/pool-scheduling', due: '2026-10-30', priority: 'routine', description: 'Not urgent, but please call her to offer a FIT kit for colorectal cancer screening.' } }] }, { calls: [finish()] }],
  },
];

export const alternatives: Alternative[] = [...perItem, ...kept];
