// Near misses of T3 on the four-member panel (task.toml [matrix] traps). First the near misses each
// mid-trial event needs (events.ts; plan-amendment-w4 "Each event needs mutants", matrix
// EVENT_MUTANTS): for each amend event, no amend (reasoning), an amend whose arrival was never seen
// (retrieval) and an amend written before it was seen (process); for the lure, an amend on the lure
// (over_action) and a lure never read (retrieval). Each fails only its event's item under its label.
// Then a review that never opens an event's trigger record: the event never fires and the item fails
// at base as retrieval (Addendum 2: no route passes the item without firing its event). Then the T3
// cases kept from before the cut, on a delivered gap: a sorted run short of the window (R36), a
// write outside the panel (a member the cut took off it), duplicate and late FIT orders, and
// outreach in another channel or without the order. The final table stays the oracle's unless a case
// says otherwise, so the rubric's table items are not what fails.
import type { Taxonomy } from '../../../packages/grader/attribution.ts';
import { OUTSIDE } from '../../../packages/grader/items.ts';
import type { Mutant, ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { actions, arrivalRead, arrivals, finish, fitOrder, GAPS, NEXT_WRITE, orderFit, outreach, PT, reads, recheck, search, STOOL_CODES, type Label } from '../solution/steps.ts';
import { D1_SORTED_SHORT_OF_WINDOW } from './alternatives.ts';

const P = (l: Label) => `Patient/${PT[l]}`;
const only = (l: Label, label: Taxonomy): Record<string, Taxonomy> => ({ [P(l)]: label });
const contacted = (l: Label) => `contacted_${PT[l].replace('-', '_')}`;
const table = (l: Label) => `table_${PT[l].replace('-', '_')}`;
const without = (l: Label) => GAPS.filter((x) => x !== l);
const SPEC: Record<Label, string> = { G1: 'crc-b1', D1: 'crc-b2', A1: 'crc-o1', C2: 'crc-d1' };
const NAME: Record<Label, string> = { G1: 'Elly Trantow', D1: 'Tiny Koss', A1: 'Delaine MacGyver', C2: 'Kelsie Rohan' };
const WHAT: Record<Label, string> = {
  G1: "Dr. Lin's message that her frailty entry was entered in error",
  D1: 'the corrected FIT result, collected the day before the period',
  A1: "the Harbor laboratory's notice that her sDNA-FIT result was another patient's",
  C2: 'the hospice discharge summary',
};
const arrivalsBut = (l: Label): ScriptTurn => arrivals((['G1', 'D1', 'A1', 'C2'] as Label[]).filter((x) => x !== l));
// A member left out of the actions: the others keep the oracle's order, numbered from write 1.
const actOn = (labels: readonly Label[]) => ({ calls: actions(labels) });

// The three near misses of an amend event on member l.
const amendMisses = (l: Label): Mutant[] => [
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
    script: [...reads(), recheck, arrivalsBut(l), { calls: [arrivalRead(l), ...actions()] }, { calls: [finish()] }],
  },
];

// A review that never opens member l's trigger record (events.ts): the event never fires, and her
// item fails at base as retrieval (no_contact_reviewed, R32). The table is the oracle's, which
// gives her the delivered answer the trial never saw, so where that differs from her base answer
// the table item is lost too.
const neverOpened = (l: Label, id: string, why: string, drop: (c: ScriptCall) => boolean, loses: readonly string[]): Mutant => ({
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

// A Patient the cut took off the panel, whose chart still holds an open gap (B2, the partial
// colectomy).
const OFF_PANEL = 'pt-0036';

export const mutants: Mutant[] = [
  ...amendMisses('G1'),
  ...amendMisses('D1'),
  ...amendMisses('A1'),
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
  {
    // R38(a): a fired amend never excuses the base review. The trial orders and messages Elly
    // Trantow blind, then one problem-list search fires crc-b1; it never reads the correction, her
    // medications, her Patient or her screening, and leaves the order as it was. A write exposes
    // nothing, so on T3 (after_exposed triggers) the blind route needs that one read to fire.
    id: 'g1_blind_write_fires_amend',
    trap: 'blind_write_fires_amend',
    why: "Orders Elly Trantow a FIT kit and messages her before reviewing anything, then lists her problems once, which brings the frailty correction; it never reads the correction or reviews her chart, and leaves the order as it was.",
    fails: ['event_seen', 'amended'],
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
      { calls: actions(['D1', 'A1'], 3) },
      { calls: [finish()] },
    ],
  },
  {
    // R36: a run newest first counts only once a page reaches before the window opens. Its one page
    // ends in April 2024, short of the sDNA-FIT window's start on 2024-01-01.
    id: 'd1_sorted_pages_short_of_window',
    trap: 'order_before_review',
    why: "Lists Tiny Koss's laboratory results newest first, 13 a page, and stops at the first page, which ends in April 2024, short of her sDNA-FIT window's start on 2024-01-01, then orders her kit: the window was never read whole (R14, R27, R36).",
    fails: ['event_seen', 'amended'],
    loses: [],
    attribution: 'retrieval',
    items: only('D1', 'retrieval'),
    script: D1_SORTED_SHORT_OF_WINDOW,
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
          ...actions(['A1'], 5),
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
