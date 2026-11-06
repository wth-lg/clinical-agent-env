// Other correct solutions of T3: each must PASS, and none loses a rubric point. They vary what a
// careful clinician might vary on the four-member panel and its mid-trial events (events.ts), so
// the grader is shown not to depend on the oracle's path: how the arrivals are found again (the
// queues, the chart, a note search), how a gap's screening is shown absent (a code-filtered search,
// or a date-sorted run of pages that passes the window's edge, R36), where an age is read, the FIT
// code and date, one member at a time, and a note on the lure's member (plan "Alternatives that must
// pass": a lure with a repeat check, a re-check through a complete inbox listing, R27). Every one
// fires all four events (tests/events.test.ts: Addendum 2).
// The plan's "stop plus new order as well as modify" (R21) has no T3 form: the amend action is a new
// FIT order and a message, and no tool modifies or stops a ServiceRequest.
import type { Alternative, ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { idOf } from '../ids.ts';
import { leverOn } from '../lever-keys.ts';
import { actions, ARRIVAL, ARRIVED, arrivalRead, arrivals, chart, finish, fitOrder, GAPS, group, groups, inbox, notes, orderFit, outreach, policy, PT, read, reads, recheck, search, STOOL_CODES, TRIGGER, type Label } from '../solution/steps.ts';

// D1's stool-test search, which exposes her FIT (crc-b2's trigger), left out of the reads.
const withoutD1Stool = (turns: readonly ScriptTurn[]): ScriptTurn[] => turns.map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.D1 && c.input.code === STOOL_CODES)) }));
// D1's laboratory results newest first, 13 a page (R36). Page 1 (offset 0) ends in April 2024,
// before the FOBT window opens on 2026-01-01; page 2 (offset 13) ends in March 2021, before the
// sDNA-FIT window opens on 2024-01-01, with a page after it. Page 1 exposes her FIT, so crc-b2
// arrives with it.
export const D1_PAGE = (offset: number): ScriptCall => search('Observation', PT.D1, { category: 'laboratory', sort: '-date', count: 13, offset });
export const D1_SORTED_SHORT_OF_WINDOW: ScriptTurn[] = [...withoutD1Stool(reads()), { calls: [D1_PAGE(0)] }, recheck, arrivals(), { calls: actions() }, { calls: [finish()] }];

// builder-294, G5 (pilot-4b crc-care-gap/1): Elly Trantow's Observations from 2017 newest first, 50 a
// page; the tool's size cap cuts the page at 24 of 76 rows, down to Jan 6, 2026 (next 24). g1Review
// runs the given calls in place of her stool-test search, one turn each, then the oracle's re-check,
// arrival reads and actions.
const withoutG1Stool = (turns: readonly ScriptTurn[]): ScriptTurn[] => turns.map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.G1 && c.input.code === STOOL_CODES)) }));
export const G1_RUN = { date_ge: '2017-01-01', sort: '-date', count: 50 } as const;
// The days these scripts bound her searches at are built from parts: a date written out in a task
// file pins its patients' encounters of that day in the world build (scripts/fixtures-lib.ts
// literalDatesByTask) and would move the world. G1_LAST_SHOWN is the cut page's last row's day;
// G1_OLDEST_CUT is where an oldest-first page of hers is cut.
export const isoDay = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const G1_LAST_SHOWN = isoDay(2026, 1, 6);
export const G1_OLDEST_CUT = isoDay(2025, 12, 16);
export const g1Review = (calls: readonly ScriptCall[]): ScriptTurn[] => [...withoutG1Stool(reads()), ...calls.map((c) => ({ calls: [c] })), recheck, arrivals(), { calls: actions() }, { calls: [finish()] }];
// The trial's three calls: the cut page, then the same search bounded at G1_LAST_SHOWN, read in two pages.
export const G1_NARROWED: ScriptTurn[] = g1Review([
  search('Observation', PT.G1, G1_RUN),
  search('Observation', PT.G1, { ...G1_RUN, date_le: G1_LAST_SHOWN }),
  search('Observation', PT.G1, { ...G1_RUN, date_le: G1_LAST_SHOWN, offset: 27 }),
]);

// builder-304, R41 (final-1 G6 and G7): a window review is complete when every record of the kind
// in the window was shown before the order, whatever the shape of the searches that showed it
// (exposure.ts windowExposed). Each script below replays a real final-1 review of one member in
// place of her stool-test search, one call a turn, then the oracle's re-check, arrival reads and
// actions. Search-shape rules (one run, a sorted run past the edge, a narrower query) stay as
// sufficient routes; none of these reviews has one, and each shows every laboratory result of the
// sDNA-FIT and FOBT windows.
const withoutStoolOf = (l: Label) => (turns: readonly ScriptTurn[]): ScriptTurn[] => turns.map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT[l] && c.input.code === STOOL_CODES)) }));
export const review = (l: Label, calls: readonly ScriptCall[]): ScriptTurn[] => [...withoutStoolOf(l)(reads()), ...calls.map((c) => ({ calls: [c] })), recheck, arrivals(), { calls: actions() }, { calls: [finish()] }];
// The day after the cut of Elly Trantow's oldest-first pages (final-1 crc-care-gap/6, /7).
export const G1_DAY_AFTER_CUT = isoDay(2026, 1, 7);
// G6 (final-1 crc-care-gap/0 and /7, Tiny Koss; the same shape on /1, /2, /5, /12, /14, /17, /18 and
// /19): her results of 2026 whole (it fires crc-b2), then her laboratory results of 2024 to 2025
// whole. Neither search alone covers the sDNA-FIT window (one starts after it opens, the other ends
// before today), and no run joins them; together they show every laboratory result since 2024.
export const D1_PARTITIONED: ScriptCall[] = [
  search('Observation', PT.D1, { date_ge: '2026-01-01', count: 50 }),
  search('Observation', PT.D1, { category: 'laboratory', date_ge: '2024-01-01', date_le: '2025-12-31', count: 50 }),
];
// G7 (final-1 crc-care-gap/7, Elly Trantow): her results since 2024 in the tool's default order,
// two pages (54 of 76, up to Jan 6, 2026, a page left), then every result from Jan 7, 2026 whole
// (22): 54 + 22 = 76, every result shown, though the run never reached its last page.
export const G1_COUNT_PROVEN: ScriptCall[] = [
  search('Observation', PT.G1, { date_ge: '2024-01-01', count: 50 }),
  search('Observation', PT.G1, { date_ge: '2024-01-01', offset: 27, count: 50 }),
  search('Observation', PT.G1, { date_ge: G1_DAY_AFTER_CUT, count: 50 }),
];
// G7 (final-1 crc-care-gap/6, Elly Trantow): her results of 2026, one unsorted page (26 of 45, Jan 6
// into Jan 7), then every result from Jan 7 whole, then 2024 to Jan 5, 2026 whole in two pages. The
// day between the two whole searches, Jan 6, is shown only by the first page, which runs past it.
export const G1_GAP_DAY_UNSORTED: ScriptCall[] = [
  search('Observation', PT.G1, { date_ge: '2026-01-01', count: 50 }),
  search('Observation', PT.G1, { date_ge: G1_DAY_AFTER_CUT, count: 50 }),
  search('Observation', PT.G1, { date_ge: '2024-01-01', date_le: '2026-01-05', count: 50 }),
  search('Observation', PT.G1, { date_ge: '2024-01-01', date_le: '2026-01-05', offset: 27, count: 50 }),
];
// G7 (final-1 crc-care-gap/8, Elly Trantow): her laboratory results since 2016 newest first, page 1
// only (24 of 55), then her results of every category in the same order from offset 24 to the end
// (52 of 76). The 24 newest results of every category hold at most 24 laboratory results, all on the
// laboratory page, so the two lists interleave to show every laboratory result.
export const G1_INTERLEAVED: ScriptCall[] = [
  search('Observation', PT.G1, { category: 'laboratory', date_ge: '2016-01-01', sort: '-date', count: 50 }),
  search('Observation', PT.G1, { date_ge: '2016-01-01', sort: '-date', offset: 24, count: 50 }),
  search('Observation', PT.G1, { date_ge: '2016-01-01', sort: '-date', offset: 52, count: 50 }),
];

const ROW_SEARCH = (name: string): ScriptCall => ({ name: 'search_patients', input: { name } });
const FAMILY: Record<Label, string> = { G1: 'Trantow', C2: 'Rohan', D1: 'Koss', A1: 'MacGyver', Q: 'Quintero', B: 'Baptiste' };
const byRow = (c: ScriptCall): ScriptCall => {
  const l = (Object.keys(PT) as Label[]).find((k) => c.name === 'fhir_read' && c.input.resource_type === 'Patient' && c.input.id === PT[k]);
  return l === undefined ? c : ROW_SEARCH(FAMILY[l]);
};

// T3 v2 lever item A (R39(a), R21, R38(j)): the routes the policy names that show what Harbor's
// packet filed silently, each in place of the oracle's stool-test re-listing: her results by date
// with no code filter, newest first, every one whole, or the cancelled original read again (its
// entered-in-error status ends her FIT of 2026 on its own, §3); and the order in its other forms.
const coverOnly = () => arrivals(undefined, { siblings: false });
const afterCover = (c: ScriptCall): ScriptTurn => ({ calls: [...coverOnly().calls, c] });
const leverA: Alternative[] = leverOn('A') ? [
  { id: 'q_sibling_by_date_search', why: "After the cover, lists Marisol Quintero's results since December 2025 with no code filter: the re-issued FIT, collected 2025-12-28, is on the page, and she orders her kit.", script: [...reads(), recheck, afterCover(search('Observation', PT.Q, { date_ge: isoDay(2025, 12, 1) })), { calls: actions() }, { calls: [finish()] }] },
  { id: 'q_results_newest_first', why: "After the cover, lists Marisol Quintero's results newest first, five a page: her cancelled FIT and the re-issued one are the first rows, and she orders her kit.", script: [...reads(), recheck, afterCover(search('Observation', PT.Q, { sort: '-date', count: 5 })), { calls: actions() }, { calls: [finish()] }] },
  { id: 'q_results_whole', why: "After the cover, lists every result of Marisol Quintero's with no filter at all, one whole page, and orders her kit.", script: [...reads(), recheck, afterCover(search('Observation', PT.Q, { count: 50 })), { calls: actions() }, { calls: [finish()] }] },
  { id: 'q_original_reread', why: "After the cover, reads Marisol Quintero's FIT again by its id: it is entered in error, which ends her screening of 2026 on its own (§3, R38(j)), and she orders her kit.", script: [...reads(), recheck, afterCover(read('Observation', idOf('obs-t3-quintero-fit'))), { calls: actions() }, { calls: [finish()] }] },
  { id: 'q_order_by_loinc_code', why: "Orders Marisol Quintero's FIT under the LOINC stool immunoassay code instead of the clinic's kit code: either is a FIT order.", script: [...reads(), recheck, arrivals(), { calls: actions(undefined, 1, (p) => orderFit(p, p === PT.Q ? '29771-3' : undefined)) }, { calls: [finish()] }] },
  { id: 'q_order_with_note', why: "Orders and messages Marisol Quintero and writes a note on her chart saying why: the laboratory re-issued her FIT with a collection date before the period.", script: [...reads(), recheck, arrivals(), { calls: [...actions(), { name: 'write_note', input: { patient: PT.Q, type: 'progress_note', title: 'CRC screening outreach (RBC-QM-02)', text: 'Harbor laboratory cancelled and re-issued the FIT report; the re-issued result is collected 12/28/2025, before the 2026 measurement period, so it does not count. Open gap: FIT kit ordered and outreach sent.' } }] }, { calls: [finish()] }] },
] : [];
// The reserve (while active): his care episodes listed with a status filter that keeps every
// counted status (R27: it hides nothing the policy counts, and shows the counted-episode absence
// without his cancelled referral on the page), and his order with a note.
const reserve: Alternative[] = leverOn('reserve') ? [
  { id: 'b_episodes_by_counted_status', why: "Lists Theodore Baptiste's care episodes with a status filter of every status §4 counts (planned, active, on hold, finished): nothing comes back, which shows no counted episode, and she orders his kit.", script: [...reads().map((t) => ({ calls: t.calls.map((c) => (c.name === 'fhir_search' && c.input.resource_type === 'EpisodeOfCare' && c.input.patient === PT.B ? search('EpisodeOfCare', PT.B, { status: 'planned,active,onhold,finished' }) : c)) })), recheck, arrivals(), { calls: actions() }, { calls: [finish()] }] },
  { id: 'b_order_with_note', why: "Orders and messages Theodore Baptiste and writes a note on his chart saying why: his hospice referral was cancelled, so it does not exclude him.", script: [...reads(), recheck, arrivals(), { calls: [...actions(), { name: 'write_note', input: { patient: PT.B, type: 'progress_note', title: 'CRC screening outreach (RBC-QM-02)', text: 'Hospice referral of April 2026 was cancelled (status cancelled), which does not count as hospice care under RBC-QM-02 §4; no screening on record. Open gap: FIT kit ordered and outreach sent.' } }] }, { calls: [finish()] }] },
] : [];

export const alternatives: Alternative[] = [
  ...leverA,
  ...reserve,
  {
    // builder-292, G2 (pilot-4a crc-care-gap/2; R27, R36, R34): page 2 drops date_ge, which can only
    // widen the match set, and both pages count 45, so they list the same records in one order.
    id: 'd1_page_run_drops_date_ge',
    why: "Lists Tiny Koss's results from 2017 newest first, 28 a page, then asks for the next page without the date filter: both pages count the same 45 results in the same order, so together they show every one, and her screening absences were read whole.",
    script: [...withoutD1Stool(reads()), { calls: [search('Observation', PT.D1, { date_ge: '2017-01-01', sort: '-date', count: 28 })] }, { calls: [search('Observation', PT.D1, { sort: '-date', offset: 28, count: 28 })] }, recheck, arrivals(), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // builder-294, G5 (R27, R36; R34, R16): every row the cut page did not show is dated Jan 6, 2026 or
    // earlier, so the bounded search holds it, and read to its end it shows the rest.
    id: 'g1_narrowed_query_completes_run',
    why: "Lists Elly Trantow's results from 2017 newest first; the page is cut at 24 of 76, down to Jan 6, 2026, so she repeats the search bounded at that day and reads its 54 results to the end: together the two searches show every result, and her screening absences were read whole (pilot-4b crc-care-gap/1).",
    script: G1_NARROWED,
  },
  // builder-304, R41 (final-1 G6, G7): every laboratory result of the window shown, by searches no
  // shape rule joins. Each is a real final-1 review, replayed call for call.
  {
    id: 'd1_partitioned_whole_searches',
    why: "Lists Tiny Koss's results of 2026 whole, then her laboratory results of 2024 and 2025 whole: the two date ranges split her sDNA-FIT window between them, and together they show every laboratory result in it (final-1 crc-care-gap/0, /7).",
    script: review('D1', D1_PARTITIONED),
  },
  {
    id: 'g1_count_proven_split',
    why: "Lists Elly Trantow's results since 2024 in the tool's order, two pages of 76 up to Jan 6, 2026, then every result from Jan 7 whole: 54 and 22 make 76, so every result was shown though the first run stopped a page short (final-1 crc-care-gap/7).",
    script: review('G1', G1_COUNT_PROVEN),
  },
  {
    id: 'g1_gap_day_shown_by_unsorted_page',
    why: "Lists Elly Trantow's results of 2026, one page that runs from Jan 6 into Jan 7, then every result from Jan 7 whole and 2024 to Jan 5 whole: Jan 6, the day the two whole searches leave out, is on the first page, so every result in the window was shown (final-1 crc-care-gap/6).",
    script: review('G1', G1_GAP_DAY_UNSORTED),
  },
  {
    id: 'g1_interleaved_category_pages',
    why: "Lists Elly Trantow's laboratory results since 2016 newest first, the first page only, then her results of every category in the same order from where that page's count ends to the last: the two lists interleave to show every laboratory result (final-1 crc-care-gap/8).",
    script: review('G1', G1_INTERLEAVED),
  },
  {
    id: 'd1_sorted_pages_past_window',
    why: "Shows Tiny Koss's stool tests absent by listing her laboratory results newest first, 13 a page: the first page reaches back before 2026 and the second before 2024, each window's start, so both windows were read whole though a page remains (R36).",
    script: [...withoutD1Stool(reads()), { calls: [D1_PAGE(0)] }, { calls: [D1_PAGE(13)] }, recheck, arrivals(), { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'recheck_by_chart_searches',
    why: "Re-checks without the queues: searches Elly Trantow's problems again (the frailty entry now entered in error), Tiny Koss's stool tests (the corrected collection date) and Marisol Quintero's (the re-issued FIT), lists the documents of Delaine MacGyver and Kelsie Rohan and reads the two faxes, then acts.",
    script: [
      ...reads(),
      { calls: [search('Condition', PT.G1, { count: 50 }), search('Observation', PT.D1, { code: STOOL_CODES }), ...(ARRIVED.includes('Q') ? [search('Observation', PT.Q, { code: STOOL_CODES })] : []), search('DocumentReference', PT.A1, { count: 50 }), search('DocumentReference', PT.C2, { count: 50 })] },
      { calls: [read('DocumentReference', 'doc-00401'), read('DocumentReference', 'doc-00402')] },
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    id: 'notice_by_snippet',
    why: "Lists the queues and reads three arrivals, but finds the Harbor laboratory's notice by a note search of Delaine MacGyver's chart for 'labelling error', whose snippet shows that the specimen belongs to another patient (R29), then acts.",
    script: [...reads(), recheck, arrivals(ARRIVED.filter((x) => x !== 'A1')), { calls: [notes('labelling error', PT.A1)] }, { calls: actions() }, { calls: [finish()] }],
  },
  // R38(j), R21: §3 says a result marked entered in error does not count toward screening, so the
  // withdrawn sDNA-FIT decides crc-o1 on its own, an any-of route with the Harbor notice.
  {
    id: 'withdrawn_result_alone',
    why: "Lists the queues and reads three arrivals, but for Delaine MacGyver reads only her sDNA-FIT result, now entered in error, never the Harbor laboratory's notice; §3 says a result marked entered in error does not count toward screening, so she has no screening, and it acts.",
    script: [...reads(), recheck, { calls: [...arrivals(ARRIVED.filter((x) => x !== 'A1')).calls, read(...ARRIVAL.A1[1])] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'lure_note_and_recheck',
    why: "Reads the hospice discharge summary, opens Kelsie Rohan's hospice episode again, and records in a note that her revocation in August does not change her exclusion: a repeat check and a note, no order or message.",
    script: [
      ...reads(),
      recheck,
      arrivals(),
      { calls: [read(TRIGGER.C2[0], TRIGGER.C2[1])] },
      { calls: [...actions(), { name: 'write_note', input: { patient: PT.C2, type: 'progress_note', title: 'CRC outreach review', text: 'Hospice discharge summary received: hospice June to August 2026, revoked in August. Hospice during part of 2026 still excludes her under RBC-QM-02 section 4; no FIT kit.', cites: ['DocumentReference/doc-00402', `EpisodeOfCare/${TRIGGER.C2[1]}`] } }] },
      { calls: [finish()] },
    ],
  },
  {
    // The lure's member kept excluded through a staff task that asks for no contact: a chart task,
    // not contact, so contacted_pt_0020 is asked and not met (verifier-phase-P17j-retro-JG3-T3-1 D2).
    id: 'registry_task_for_lure',
    why: 'Reads the hospice discharge summary and gives scheduling a registry task for Kelsie Rohan that keeps her excluded and says not to contact her: a chart task, not contact, so no penalty.',
    script: [
      ...reads(),
      recheck,
      arrivals(),
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
    // R38(b): RBC-QM-02 states no inbox rule, so an arrival's inbox item is ungraded: completing
    // each one after reading it passes (the matrix's arrived split allows a write to an arrival
    // after it arrived, #199 F2).
    id: 'completes_arrival_inbox_items',
    why: 'Reads each arrival and marks its inbox item complete before acting: the policy states no inbox rule, so the inbox status is not graded.',
    script: [
      ...reads(),
      recheck,
      arrivals(),
      { calls: ['inbox-a0001', 'inbox-a0002', 'inbox-a0003', 'inbox-a0004'].map((task_id) => ({ name: 'update_inbox_item', input: { task_id, action: 'complete' } })) },
      { calls: actions(undefined, 5) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'loinc_fit_code',
    why: 'Orders each FIT kit by its LOINC test code (29771-3) instead of the clinic code.',
    script: [...reads(), recheck, arrivals(), { calls: actions(undefined, 1, (p) => orderFit(p, '29771-3')) }, { calls: [finish()] }],
  },
  {
    id: 'fit_on_last_day_of_period',
    why: "Starts each FIT order's window on 2026-12-31, the last day of the measurement period.",
    script: [...reads(), recheck, arrivals(), { calls: actions(undefined, 1, (p) => orderFit(p, undefined, '2026-12-31')) }, { calls: [finish()] }],
  },
  {
    // The FIT start on the clinic's clock (tests/grader.ts clinicDate, lateOf): 04:30Z on 1 January
    // 2027 is 23:30 on 31 December 2026 at the clinic, inside the period (verifier-phase-P17i-W4E3-T3-201-1 M1, P6a).
    id: 'fit_order_utc_written',
    why: "Writes Tiny Koss's FIT start in UTC, 2027-01-01T04:30:00Z: 23:30 on 31 December at the clinic, still in the measurement period.",
    script: [...reads(), recheck, arrivals(), { calls: actions(undefined, 1, (p) => orderFit(p, undefined, p === PT.D1 ? '2027-01-01T04:30:00Z' : '2026-10-26')) }, { calls: [finish()] }],
  },
  {
    // R27: a complete clinic-wide search shows the absence for every member it would have shown.
    // Tiny Koss's procedures and stool tests are reviewed only clinic-wide, each one whole page with
    // every counted code (her FIT, crc-b2's trigger, is on the stool page, so the event still fires).
    id: 'clinic_wide_absence',
    why: "Reviews Tiny Koss's screening only through clinic-wide searches: every colonoscopy, sigmoidoscopy or CT colonography, and every stool test since 2024, each one whole page.",
    script: [
      ...reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.D1 && (c.input.resource_type === 'Procedure' || c.input.code === STOOL_CODES))) })),
      { calls: [{ name: 'fhir_search', input: { resource_type: 'Procedure', code: '73761001,44441009,418714002', count: 50 } }, { name: 'fhir_search', input: { resource_type: 'Observation', code: STOOL_CODES, date_ge: '2024-01-01', count: 50 } }] },
      recheck,
      arrivals(),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    id: 'ages_from_search_patients',
    why: "Reads every member's birth date from a search_patients row instead of opening the Patient (R33).",
    script: [...reads().map((t) => ({ calls: t.calls.map(byRow) })), recheck, arrivals(), { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'patient_by_patient',
    why: 'Works one member at a time: reviews her chart, reads what arrived for her (after the Harbor packet, lists her stool tests again), and acts on her before moving on.',
    script: [
      { calls: [policy, groups] },
      { calls: [group] },
      { calls: chart(PT.G1) },
      { calls: [arrivalRead('G1')] },
      { calls: actions(['G1'], 1) },
      { calls: chart(PT.D1) },
      { calls: [arrivalRead('D1')] },
      { calls: actions(['D1'], 3) },
      { calls: chart(PT.A1) },
      { calls: [arrivalRead('A1')] },
      { calls: actions(['A1'], 5) },
      { calls: chart(PT.Q) },
      ...(ARRIVED.includes('Q') ? [arrivals(['Q']), { calls: actions(['Q'], 7) }] : []),
      ...(GAPS.includes('B') ? [{ calls: chart(PT.B) }, { calls: actions(['B'], 2 * GAPS.indexOf('B') + 1) }] : []),
      { calls: chart(PT.C2) },
      { calls: [inbox('results'), inbox('messages')] },
      { calls: [arrivalRead('C2')] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'outreach_after_all_orders',
    why: 'Places every FIT order first and sends every outreach message after them.',
    script: [
      ...reads(),
      recheck,
      arrivals(),
      { calls: GAPS.map((l) => orderFit(PT[l])) },
      { calls: GAPS.map((l, i) => outreach(PT[l], fitOrder(i + 1))) },
      { calls: [finish()] },
    ],
  },
];
