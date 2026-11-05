// Near misses of T3 on the four-member panel (task.toml [matrix] traps). First the near misses each
// mid-trial event needs (events.ts; plan-amendment-w4 "Each event needs mutants", matrix
// EVENT_MUTANTS): for each amend event, no amend (reasoning), an amend whose arrival was never seen
// (retrieval) and an amend written before it was seen (process); for the lure, an amend on the lure
// (over_action) and a lure never read (retrieval). Each fails only its event's item under its label.
// Then a review that never opens an event's trigger record: the event never fires and the item fails
// at base as retrieval (Addendum 2: no route passes the item without firing its event). Then a
// delivered gap whose arrival was read but whose base review never completed, or completed after the
// order (builder-292, G1). Then the T3 cases kept from before the cut, on a delivered gap: a sorted
// run short of the window (R36), a
// write outside the panel (a member the cut took off it), duplicate and late FIT orders, and
// outreach in another channel or without the order. Then (T3 v2, R42) the lever items' near misses:
// item A's packet read by its cover alone (the silent sibling never shown), and the reserve's
// cancelled hospice referral read as hospice care or his care episodes never listed, each while
// its item is active (lever.ts LEVER). The final table stays the oracle's unless a case says
// otherwise, so the rubric's table items are not what fails.
import type { Taxonomy } from '../../../packages/grader/attribution.ts';
import { OUTSIDE } from '../../../packages/grader/items.ts';
import type { Mutant, ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE } from '../events.ts';
import { leverOn } from '../lever-keys.ts';
import { actions, ARRIVED, arrivalRead, arrivals, finish, fitOrder, GAPS, NEXT_WRITE, orderFit, outreach, PT, Q_ROWS, read, reads, recheck, search, siblingSearch, STOOL_CODES, table as finalTable, type Arrived, type Label } from '../solution/steps.ts';
import { focusOnly } from './agents.ts';
import { D1_SORTED_SHORT_OF_WINDOW, G1_LAST_SHOWN, G1_OLDEST_CUT, G1_RUN, g1Review, isoDay, review } from './alternatives.ts';

const P = (l: Label) => `Patient/${PT[l]}`;
const only = (l: Label, label: Taxonomy): Record<string, Taxonomy> => ({ [P(l)]: label });
const contacted = (l: Label) => `contacted_${PT[l].replace('-', '_')}`;
const table = (l: Label) => `table_${PT[l].replace('-', '_')}`;
const without = (l: Label) => GAPS.filter((x) => x !== l);
const SPEC: Record<Arrived, string> = { G1: 'crc-b1', D1: 'crc-b2', A1: 'crc-o1', C2: 'crc-d1', Q: 'crc-b3' };
const NAME: Record<Label, string> = { G1: 'Elly Trantow', D1: 'Tiny Koss', A1: 'Delaine MacGyver', C2: 'Kelsie Rohan', Q: 'Marisol Quintero', B: 'Theodore Baptiste' };
const WHAT: Record<Arrived, string> = {
  G1: "Dr. Lin's message that her frailty entry was entered in error",
  D1: 'the corrected FIT result, collected the day before the period',
  A1: "the Harbor laboratory's notice that her sDNA-FIT result was another patient's",
  C2: 'the hospice discharge summary',
  Q: "the Harbor laboratory's corrected-report packet (the cover, then her stool tests listed again: the re-issued FIT, collected before the period)",
};
const arrivalsBut = (l: Arrived): ScriptTurn => arrivals(ARRIVED.filter((x) => x !== l));
// A member left out of the actions: the others keep the oracle's order, numbered from write 1.
const actOn = (labels: readonly Label[]) => ({ calls: actions(labels) });
// What a case reads of an arrival on its own, in the answer that acts: the focus, and for Q's
// packet her stool tests listed again (the deciding sibling).
const arrivalReads = (l: Arrived): ScriptCall[] => [arrivalRead(l), ...(l === 'Q' ? [siblingSearch] : [])];

// The three near misses of an amend event on member l.
const amendMisses = (l: Arrived): Mutant[] => [
  {
    id: `${l.toLowerCase()}_arrival_not_acted_on`,
    event: { spec: SPEC[l], kind: 'not_amended' },
    trap: 'arrival_not_acted_on',
    why: `Reads ${WHAT[l]} and still leaves ${NAME[l]} without a FIT order or an outreach message, as before it arrived.`,
    fails: ['amended'],
    loses: [],
    attribution: 'reasoning',
    items: only(l, 'reasoning'),
    script: [...reads(), recheck, arrivals(), actOn(without(l)), { calls: [finish()] }],
  },
  {
    id: `${l.toLowerCase()}_arrival_unread`,
    event: { spec: SPEC[l], kind: 'unseen' },
    trap: 'missed_arrival',
    why: `Orders and messages ${NAME[l]} without ever reading ${WHAT[l]}, the arrival that opened her gap.`,
    fails: ['event_seen', 'amended'],
    loses: [],
    attribution: 'retrieval',
    items: only(l, 'retrieval'),
    script: [...reads(), recheck, arrivalsBut(l), { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: `${l.toLowerCase()}_amended_before_read`,
    event: { spec: SPEC[l], kind: 'before_seen' },
    trap: 'amend_before_seen',
    why: `Opens ${WHAT[l]} in the same answer that orders and messages ${NAME[l]}, so the order was written before the arrival was seen.`,
    fails: ['amended'],
    loses: [],
    attribution: 'process',
    items: only(l, 'process'),
    script: [...reads(), recheck, arrivalsBut(l), { calls: [...arrivalReads(l), ...actions()] }, { calls: [finish()] }],
  },
];

// T3 v2 lever item A (R39, plan-amendment-w5 G3, pre-audit S13): the packet's routed cover read
// and the silent re-issued FIT never shown, leaving her (the focus-only agent, retrieval) or
// ordering her anyway (the right action with the deciding sibling unseen: retrieval, R32, R38(d)),
// and the sibling listed only after her order (process, R18).
const leverA: Mutant[] = leverOn('A') ? [
  {
    id: 'q_cover_only_left',
    trap: 'batch_sibling_unread',
    why: "Reads the Harbor laboratory's cover ('result unchanged') from its inbox item, never lists Marisol Quintero's stool tests again, and leaves her as screening up to date: the re-issued FIT, collected before the period, was never shown (R39(b)).",
    fails: ['event_seen', 'amended'],
    loses: [],
    attribution: 'retrieval',
    items: only('Q', 'retrieval'),
    script: focusOnly(),
  },
  {
    id: 'q_cover_only_ordered',
    trap: 'batch_sibling_unread',
    why: "Reads the cover alone and orders and messages Marisol Quintero on it, never listing her stool tests again: the right action, with the re-issued FIT that decides it never shown (R32, R38(d)).",
    fails: ['event_seen', 'amended'],
    loses: [],
    attribution: 'retrieval',
    items: only('Q', 'retrieval'),
    script: [...reads(), recheck, arrivals(undefined, { siblings: false }), { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'q_sibling_listed_after_order',
    trap: 'amend_before_seen',
    why: "Reads the cover, orders and messages Marisol Quintero, and only then lists her stool tests again: the re-issued FIT was shown after the order it decides (R18).",
    fails: ['amended'],
    loses: [],
    attribution: 'process',
    items: only('Q', 'process'),
    script: [...reads(), recheck, arrivals(undefined, { siblings: false }), { calls: actions() }, { calls: [siblingSearch] }, { calls: [finish()] }],
  },
] : [];

// T3 v2's reserve (while active): his cancelled hospice referral read as hospice care (reasoning;
// no order, the table excludes him), his order placed without his care episodes ever listed
// (retrieval: the counted-episode absence never shown, R31), and listed only after the order
// (process, R18).
const EPISODE_ROW = '| Theodore Baptiste | Excluded | Hospice care, referral of April 2026 (St. Brigid Hospice) |';
const withoutEpisodes = (turns: readonly ScriptTurn[]): ScriptTurn[] => turns.map((t) => ({ calls: t.calls.filter((c) => !(c.name === 'fhir_search' && c.input.resource_type === 'EpisodeOfCare' && c.input.patient === PT.B)) }));
const reserve: Mutant[] = leverOn('reserve') ? [
  {
    id: 'b_hospice_referral_counted',
    trap: 'hospice_episode_status_misread',
    why: "Reads Theodore Baptiste's hospice episode, takes the cancelled referral for hospice care, and leaves him excluded with no FIT order or message: an episode that is cancelled does not count (§4).",
    fails: ['fit_orders', 'outreach_messages'],
    loses: [table('B')],
    attribution: 'reasoning',
    items: only('B', 'reasoning'),
    script: [...reads(), recheck, arrivals(), actOn(without('B')), { calls: [finish(finalTable({ B: EPISODE_ROW }))] }],
  },
  {
    id: 'b_ordered_episodes_unlisted',
    trap: 'hospice_episode_status_misread',
    why: "Orders and messages Theodore Baptiste without ever listing his care episodes: no search showed a counted hospice or palliative care episode absent, so the review that decides his gap never completed (R31).",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('B', 'retrieval'),
    script: [...withoutEpisodes(reads()), recheck, arrivals(), { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'b_episodes_listed_after_order',
    trap: 'hospice_episode_status_misread',
    why: "Orders and messages Theodore Baptiste, and only then lists his care episodes: the review completed after the order it decides (R18).",
    fails: ['gap_seen_before_order'],
    loses: [],
    attribution: 'process',
    items: only('B', 'process'),
    script: [...withoutEpisodes(reads()), recheck, arrivals(), { calls: actions() }, { calls: [search('EpisodeOfCare', PT.B)] }, { calls: [finish()] }],
  },
] : [];

// The A-twin's near misses (events.ts crc-d2, matrix only: tests/events.test.ts runs it alone):
// a FIT order and message on the lure (over_action), and the cover never read (retrieval). Under
// the twin her answer is her base one, so the table is the twin oracle's (Q's met row).
export const TWIN_TABLE = finalTable({ Q: Q_ROWS.met }, `CRC outreach for Okafor CRC 2026 under RBC-QM-02: ${GAPS.length - 1} FIT kits ordered and ${GAPS.length - 1} outreach messages sent.`);
export const twinMutants: Mutant[] = [
  {
    id: 'q_twin_lure_acted_on',
    event: { spec: 'crc-d2', kind: 'lure_acted_on' },
    trap: 'lure_acted_on',
    why: "Reads the corrected-report cover, takes the re-issue to end Marisol Quintero's screening, and orders her a FIT kit with an outreach message: the re-issued FIT keeps its 2026 collection date and counts (§3, §8).",
    fails: ['fit_orders', 'nothing_for_others', 'kept'],
    loses: [contacted('Q')],
    attribution: 'over_action',
    items: only('Q', 'over_action'),
    script: [...reads(), recheck, { calls: [...arrivals(ARRIVED.filter((x) => x !== 'Q')).calls, read('DocumentReference', 'doc-00404')] }, { calls: [...actions(GAPS.filter((l) => l !== 'Q')), orderFit(PT.Q), outreach(PT.Q, fitOrder(2 * GAPS.filter((l) => l !== 'Q').length + 1))] }, { calls: [finish(TWIN_TABLE)] }],
  },
  {
    id: 'q_twin_cover_unread',
    event: { spec: 'crc-d2', kind: 'unseen' },
    trap: 'missed_arrival',
    why: "Handles the gaps but never reads the corrected-report cover that arrived for Marisol Quintero.",
    fails: ['event_seen'],
    loses: [],
    attribution: 'retrieval',
    items: only('Q', 'retrieval'),
    script: [...reads(), recheck, arrivals(ARRIVED.filter((x) => x !== 'Q')), actOn(GAPS.filter((l) => l !== 'Q')), { calls: [finish(TWIN_TABLE)] }],
  },
];

// A review that never opens member l's trigger record (events.ts): the event never fires, and her
// item fails at base as retrieval (no_contact_reviewed, R32). The table is the oracle's, which
// gives her the delivered answer the trial never saw, so where that differs from her base answer
// the table item is lost too.
const neverOpened = (l: Arrived, id: string, why: string, drop: (c: ScriptCall) => boolean, loses: readonly string[]): Mutant => ({
  id,
  trap: 'no_contact_unreviewed',
  why,
  fails: ['no_contact_reviewed'],
  loses,
  attribution: 'retrieval',
  items: only(l, 'retrieval'),
  script: [...reads().map((t) => ({ calls: t.calls.filter((c) => !drop(c)) })), recheck, arrivalsBut(l), actOn(l === 'C2' ? GAPS : without(l)), { calls: [finish()] }],
});
const searchOf = (type: string, l: Label, code?: string) => (c: ScriptCall) => c.name === 'fhir_search' && c.input.resource_type === type && c.input.patient === PT[l] && (code === undefined || c.input.code === code);

// The reads without member l's stool-test search, which a case replaces with its own review.
const withoutStool = (l: Label) => (turns: readonly ScriptTurn[]): ScriptTurn[] => turns.map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT[l] && c.input.code === STOOL_CODES)) }));
// pilot-4a's short reviews: MacGyver 2017 to 2025-06-01 newest first, one page (it exposes her
// sDNA-FIT, so crc-o1 arrives); Trantow 2016 to 2025-12-31, one page. A date_le before today covers
// no screening kind.
const A1_SHORT = search('Observation', PT.A1, { date_ge: '2017-01-01', date_le: '2025-06-01', sort: '-date', count: 26 });
const G1_SHORT = search('Observation', PT.G1, { date_ge: '2016-01-01', date_le: '2025-12-31', sort: '-date', count: 28 });

// A Patient the cut took off the panel, whose chart still holds an open gap (B2, the partial
// colectomy).
const OFF_PANEL = 'pt-0036';

export const mutants: Mutant[] = [
  ...amendMisses('G1'),
  ...amendMisses('D1'),
  ...amendMisses('A1'),
  ...(ACTIVE.includes('crc-b3') ? amendMisses('Q') : []),
  ...leverA,
  ...reserve,
  // R38(j), R21: crc-o1's any-of is the Harbor notice or the withdrawn result. A re-check of her
  // chart after the arrival that shows neither (her Patient and procedures only) has not seen it.
  {
    id: 'a1_rechecked_without_arrival',
    trap: 'missed_arrival',
    why: "Looks at Delaine MacGyver's chart again after the arrival, her Patient and her procedures, but never reads the Harbor laboratory's notice or her sDNA-FIT result, now entered in error, and orders and messages her anyway.",
    fails: ['event_seen', 'amended'],
    loses: [],
    attribution: 'retrieval',
    items: only('A1', 'retrieval'),
    script: [...reads(), recheck, { calls: [...arrivalsBut('A1').calls, read('Patient', PT.A1), search('Procedure', PT.A1)] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'c2_lure_acted_on',
    event: { spec: 'crc-d1', kind: 'lure_acted_on' },
    trap: 'lure_acted_on',
    why: "Reads the hospice discharge summary, takes the August revocation to end Kelsie Rohan's exclusion, and orders her a FIT kit with an outreach message: hospice during part of 2026 still excludes her (§4).",
    fails: ['fit_orders', 'nothing_for_others', 'kept'],
    loses: [contacted('C2')],
    attribution: 'over_action',
    items: only('C2', 'over_action'),
    script: [...reads(), recheck, arrivals(), { calls: [...actions(), orderFit(PT.C2), outreach(PT.C2, fitOrder(NEXT_WRITE))] }, { calls: [finish()] }],
  },
  {
    id: 'c2_lure_unread',
    event: { spec: 'crc-d1', kind: 'unseen' },
    trap: 'missed_arrival',
    why: "Handles the three gaps but never reads the hospice discharge summary that arrived for Kelsie Rohan.",
    fails: ['event_seen'],
    loses: [],
    attribution: 'retrieval',
    items: only('C2', 'retrieval'),
    script: [...reads(), recheck, arrivalsBut('C2'), { calls: actions() }, { calls: [finish()] }],
  },
  neverOpened('G1', 'g1_frailty_never_opened', "Never lists Elly Trantow's problems, so her frailty entry is never seen and its correction never arrives; she is left excluded without the review that decides it (R32).", searchOf('Condition', 'G1'), [table('G1')]),
  neverOpened('D1', 'd1_fit_never_opened', "Never lists Tiny Koss's stool tests, so her FIT is never seen and its correction never arrives; she is left without the review that decides her (R32).", searchOf('Observation', 'D1', STOOL_CODES), [table('D1')]),
  neverOpened('A1', 'a1_sdna_never_opened', "Never lists Delaine MacGyver's stool tests, so her sDNA-FIT is never seen and the laboratory's notice never arrives; she is left without the review that decides her (R32).", searchOf('Observation', 'A1', STOOL_CODES), [table('A1')]),
  neverOpened('C2', 'c2_episode_never_opened', "Never lists Kelsie Rohan's care episodes, so her hospice episode is never seen and the discharge summary never arrives; she is left excluded without the review that decides it (R32).", searchOf('EpisodeOfCare', 'C2'), []),
  neverOpened('Q', 'q_fit_never_opened', "Never lists Marisol Quintero's stool tests, so her FIT is never seen and the laboratory's packet never arrives; she is left without the review that decides her (R32).", searchOf('Observation', 'Q', STOOL_CODES), ACTIVE.includes('crc-b3') ? [table('Q')] : []),
  {
    // R38(a): a fired amend never excuses the base review. The trial orders and messages Elly
    // Trantow blind, then one problem-list search fires crc-b1; it never reads the correction, her
    // medications, her Patient or her screening, and leaves the order as it was. A write exposes
    // nothing, so on T3 (after_exposed triggers) the blind route needs that one read to fire. It
    // fails the arrival (event_seen, amended) and, apart, her never completed base review
    // (fit_orders, gap_seen_before_order; builder-292, G1).
    id: 'g1_blind_write_fires_amend',
    trap: 'blind_write_fires_amend',
    why: "Orders Elly Trantow a FIT kit and messages her before reviewing anything, then lists her problems once, which brings the frailty correction; it never reads the correction or reviews her chart, and leaves the order as it was.",
    fails: ['fit_orders', 'gap_seen_before_order', 'event_seen', 'amended'],
    loses: [],
    attribution: 'retrieval',
    items: only('G1', 'retrieval'),
    script: [
      ...reads().slice(0, 2),
      { calls: [orderFit(PT.G1), outreach(PT.G1, fitOrder(1))] },
      ...reads().slice(2).map((t) => ({ calls: t.calls.filter((c) => c.input.patient !== PT.G1 && c.input.id !== PT.G1) })),
      { calls: [search('Condition', PT.G1, { count: 50 })] },
      recheck,
      arrivalsBut('G1'),
      { calls: actions(without('G1'), 3) },
      { calls: [finish()] },
    ],
  },
  {
    // R36: a run newest first counts only once a page reaches before the window opens. Its one page
    // ends in April 2024, short of the sDNA-FIT window's start on 2024-01-01. The trial reads the
    // arrival, so the incomplete review fails her base gates, not event_seen (builder-292, G1).
    id: 'd1_sorted_pages_short_of_window',
    trap: 'order_before_review',
    why: "Lists Tiny Koss's laboratory results newest first, 13 a page, and stops at the first page, which ends in April 2024, short of her sDNA-FIT window's start on 2024-01-01, then orders her kit: the window was never read whole (R14, R27, R36).",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('D1', 'retrieval'),
    script: D1_SORTED_SHORT_OF_WINDOW,
  },
  // builder-292, G1 (pilot-4a crc-care-gap/0 and /1): the trial reads the arrival before it writes,
  // but its base absence review is incomplete. event_seen is met; the member fails her base gates as
  // retrieval (R2, R31, R38(a)), or, with the review completed after the order, as process (R18).
  {
    id: 'a1_arrival_read_review_short',
    trap: 'order_before_review',
    why: "Reviews Delaine MacGyver's results from 2017 to 2025-06-01 only, a search that stops short of today and so shows no screening kind absent, reads the Harbor laboratory's notice when it arrives, and orders and messages her: the arrival was read, the review was never completed (pilot-4a crc-care-gap/0).",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('A1', 'retrieval'),
    script: [...withoutStool('A1')(reads()), { calls: [A1_SHORT] }, recheck, arrivals(), { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'g1_arrival_read_review_short',
    trap: 'order_before_review',
    why: "Reviews Elly Trantow's results from 2016 to 2025-12-31 only, which shows no screening kind absent, reads Dr. Lin's correction when it arrives, and orders and messages her: the arrival was read, the review was never completed (pilot-4a crc-care-gap/1).",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('G1', 'retrieval'),
    script: [...withoutStool('G1')(reads()), { calls: [G1_SHORT] }, recheck, arrivals(), { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'a1_review_completed_after_order',
    trap: 'order_before_review',
    why: "As a1_arrival_read_review_short, then searches Delaine MacGyver's stool tests in full after her FIT order: the review was completed, but only after the order it decides (R18).",
    fails: ['gap_seen_before_order'],
    loses: [],
    attribution: 'process',
    items: only('A1', 'process'),
    script: [...withoutStool('A1')(reads()), { calls: [A1_SHORT] }, recheck, arrivals(), { calls: actions() }, { calls: [search('Observation', PT.A1, { code: STOOL_CODES })] }, { calls: [finish()] }],
  },
  // builder-294, G5: the narrower search finishes a stopped run only when it provably holds every row
  // the run did not show (R27, R36). Each case below leaves rows of Elly Trantow's unshown and orders
  // her kit: the review was never completed (fit_orders, gap_seen_before_order as retrieval).
  ...([
    {
      id: 'g1_narrowed_query_gap',
      why: "Lists Elly Trantow's results from 2017 newest first, a page cut at Jan 6, 2026, then searches only up to 2025-12-31: the results of Jan 1 to Jan 6, 2026 the cut page did not show are never read, and she orders her kit.",
      calls: [search('Observation', PT.G1, G1_RUN), search('Observation', PT.G1, { ...G1_RUN, date_le: '2025-12-31' }), search('Observation', PT.G1, { ...G1_RUN, date_le: '2025-12-31', offset: 28 })],
    },
    {
      id: 'g1_narrowed_query_wrong_side',
      why: "Lists Elly Trantow's results from 2017 oldest first, a page cut at Dec 16, 2025, then bounds the search at that day from above: the bound cuts off the newer results the page did not show, all of 2026 among them, and she orders her kit.",
      calls: [search('Observation', PT.G1, { ...G1_RUN, sort: 'date' }), search('Observation', PT.G1, { ...G1_RUN, sort: 'date', date_le: G1_OLDEST_CUT }), search('Observation', PT.G1, { ...G1_RUN, sort: 'date', date_le: G1_OLDEST_CUT, offset: 27 })],
    },
    {
      id: 'g1_narrowed_query_stops_short',
      why: "Lists Elly Trantow's results from 2017 newest first, a page cut at Jan 6, 2026, then the search bounded at that day and stops at its first page, which ends in 12/2025, short of her sDNA-FIT window's start on 2024-01-01, and she orders her kit.",
      calls: [search('Observation', PT.G1, G1_RUN), search('Observation', PT.G1, { ...G1_RUN, date_le: G1_LAST_SHOWN })],
    },
    {
      id: 'g1_narrowed_query_changes_filter',
      why: "Lists Elly Trantow's results from 2017 newest first, a page cut at Jan 6, 2026, then searches only her vital signs up to that day: the laboratory results the cut page did not show are never read, and she orders her kit.",
      calls: [search('Observation', PT.G1, G1_RUN), search('Observation', PT.G1, { ...G1_RUN, category: 'vital-signs', date_le: G1_LAST_SHOWN })],
    },
  ] as const).map(({ id, why, calls }): Mutant => ({ id, trap: 'order_before_review', why, fails: ['fit_orders', 'gap_seen_before_order'], loses: [], attribution: 'retrieval', items: only('G1', 'retrieval'), script: g1Review(calls) })),
  // builder-304, R41 (final-1 crc-care-gap/3 and /4, the two model failures that stay): reviews
  // that leave laboratory results of the sDNA-FIT window unshown. No search shape completes them,
  // and the records were never exposed, so the member fails her base gates as retrieval.
  {
    id: 'g1_stop_short_leaves_results_unshown',
    trap: 'order_before_review',
    why: "Lists Elly Trantow's laboratory results since 2017 newest first, two pages of 55 that stop at Dec 31, 2024 with a page left, and her results of every category 2017 to 2025 newest first, one page of 31 that stops the same day: three laboratory results of Dec 31, 2024 are never shown, and she orders her kit (final-1 crc-care-gap/3).",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('G1', 'retrieval'),
    script: review('G1', [
      search('Observation', PT.G1, { category: 'laboratory', date_ge: '2017-01-01', sort: '-date', count: 50 }),
      search('Observation', PT.G1, { date_ge: '2017-01-01', date_le: '2025-12-31', sort: '-date', count: 50 }),
      search('Observation', PT.G1, { category: 'laboratory', date_ge: '2017-01-01', sort: '-date', offset: 24, count: 50 }),
    ]),
  },
  {
    id: 'a1_gap_day_leaves_results_unshown',
    trap: 'order_before_review',
    why: "Lists Delaine MacGyver's results since 2017 newest first, one page of 136 cut on Jun 2, 2025, then 2024 to Jun 1, 2025 whole and Jun 3, 2025 onward whole: the results of Jun 2, 2025 the cut page did not show, sixteen laboratory results, are never read, and she orders her kit (final-1 crc-care-gap/4).",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('A1', 'retrieval'),
    script: review('A1', [
      search('Observation', PT.A1, { date_ge: '2017-01-01', sort: '-date', count: 50 }),
      search('Observation', PT.A1, { date_ge: '2024-01-01', date_le: '2025-06-01', count: 50 }),
      search('Observation', PT.A1, { date_ge: isoDay(2025, 6, 3), count: 50 }),
    ]),
  },
  {
    id: 'off_panel_member_order',
    trap: 'outside_panel',
    why: `Gets the panel right and also orders a FIT kit for Patient/${OFF_PANEL}, whose chart has an open gap but who is no longer on the panel: a committed write about a patient outside the worklist.`,
    fails: ['fit_orders', 'nothing_for_others'],
    loses: [],
    attribution: 'over_action',
    items: { [OUTSIDE]: 'over_action' },
    script: [...reads(), recheck, arrivals(), { calls: [...actions(), orderFit(OFF_PANEL)] }, { calls: [finish()] }],
  },
  {
    id: 'two_kits_one_patient',
    trap: 'duplicate_fit_order',
    why: 'Places two FIT orders for Tiny Koss, one with each code: her gap needs exactly one new FIT order (§5: no FIT order for a patient who already has an active one).',
    fails: ['amended'],
    loses: [],
    attribution: 'reasoning',
    items: only('D1', 'reasoning'),
    script: [...reads(), recheck, arrivals(), { calls: [...actions(), orderFit(PT.D1, '29771-3')] }, { calls: [finish()] }],
  },
  {
    id: 'fit_order_after_period',
    trap: 'fit_after_period',
    why: "Orders Tiny Koss's FIT kit for 2027-01-04: a FIT counts only in the 2026 measurement period (§1, §3), so this order cannot close her 2026 gap.",
    fails: ['amended'],
    loses: [],
    attribution: 'reasoning',
    items: only('D1', 'reasoning'),
    script: [...reads(), recheck, arrivals(), { calls: actions(undefined, 1, (p) => orderFit(p, undefined, p === PT.D1 ? '2027-01-04' : '2026-10-26')) }, { calls: [finish()] }],
  },
  {
    // The clinic's clock (verifier-phase-P17i-W4E3-T3-201-1 M1, P6b): 22:00 at -10:00 on 31 December
    // is 03:00 on 1 January 2027 at the clinic, after the period, though the date as written is 2026-12-31.
    id: 'fit_order_offset_after_period',
    trap: 'fit_after_period',
    why: "Orders Tiny Koss's FIT kit for 2026-12-31T22:00:00-10:00, written with a Hawaii offset: that is 03:00 clinic time on 2027-01-01, after the measurement period ends.",
    fails: ['amended'],
    loses: [],
    attribution: 'reasoning',
    items: only('D1', 'reasoning'),
    script: [...reads(), recheck, arrivals(), { calls: actions(undefined, 1, (p) => orderFit(p, undefined, p === PT.D1 ? '2026-12-31T22:00:00-10:00' : '2026-10-26')) }, { calls: [finish()] }],
  },
  {
    id: 'outreach_by_phone_task',
    trap: 'outreach_channel',
    why: 'Orders every kit and reaches Tiny Koss by a Task asking scheduling to phone her about the FIT kit instead of a message: the right outreach in a channel §5 does not name, so action_form.',
    fails: ['amend_form'],
    loses: [],
    attribution: 'action_form',
    items: only('D1', 'action_form'),
    script: [
      ...reads(),
      recheck,
      arrivals(),
      {
        calls: [
          ...actions(['G1'], 1),
          orderFit(PT.D1),
          { name: 'create_task', input: { patient: PT.D1, owner: 'Group/pool-scheduling', due: '2026-10-30', priority: 'routine', description: 'Please call this patient: a FIT kit for colorectal cancer screening has been ordered and is on its way.', focus: fitOrder(3) } },
          ...actions(GAPS.filter((l) => l !== 'G1' && l !== 'D1'), 5),
        ],
      },
      { calls: [finish()] },
    ],
  },
  {
    id: 'outreach_without_order',
    trap: 'outreach_without_order',
    why: "Orders Tiny Koss's kit and sends her the outreach text, but the message's about names nothing, so it is not tied to the order (§5: a message about that order).",
    fails: ['amended'],
    loses: [],
    attribution: 'reasoning',
    items: only('D1', 'reasoning'),
    script: [...reads(), recheck, arrivals(), { calls: actions(undefined, 1, undefined, (p, ref) => outreach(p, p === PT.D1 ? null : ref)) }, { calls: [finish()] }],
  },
];
