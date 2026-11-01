// Near misses of T3. First one per worklist item (expected.ts; task.toml [matrix] traps): each makes
// the wrong decision its class invites for that one member and fails exactly that item under its
// expected label (Mutant.items): a gap left unordered is reasoning (the trial read the record its
// decision rests on, so it saw and misjudged it), and a FIT order and message for a member who needs
// none is over_action (a committed forbidden write, which nothing_for_others reads from the final
// state). The final table stays the oracle's, so the rubric's table items are not what fails.
// Then the T3 cases kept from before the probe, moved onto the probe panel: duplicate and late FIT
// orders, outreach in another channel or without the order, contact for members who need none, a
// write outside the panel, and orders placed before the record was seen. They vary D1 (Tiny Koss),
// an open gap, where they need one member.
import { type Mutant, oneTurn, type ScriptCall } from '../../../packages/grader/matrix/types.ts';
import type { Taxonomy } from '../../../packages/grader/attribution.ts';
import { OUTSIDE } from '../../../packages/grader/items.ts';
import { oracle } from '../solution/solve.ts';
import {
  actions, bare, bareOrders, chart, CHART_STEPS, finish, fitOrder, GAPS, group, groups, housing, keyReads, message, NEXT_WRITE, NO_CONTACT, OPNOTE, orderFit, outreach, OUTREACH, policy, PT, read, reads, search, STOOL_CODES, type Label,
} from '../solution/steps.ts';
import { expected } from '../expected.ts';
import { ref } from '../ids.ts';

const without = (l: Label) => GAPS.filter((x) => x !== l);
const missed = ['fit_orders', 'outreach_messages'];
const extra = ['fit_orders', 'nothing_for_others'];
const P = (l: Label) => `Patient/${PT[l]}`;
const only = (l: Label, label: Taxonomy): Record<string, Taxonomy> => ({ [P(l)]: label });
const each = (labels: readonly Label[], label: Taxonomy): Record<string, Taxonomy> => Object.fromEntries(labels.map((l) => [P(l), label]));
const decisiveOf = (p: string) => expected.items.find((x) => x.patient === `Patient/${p}`)!.decisive;
const contacted = (l: Label) => `contacted_${PT[l].replace('-', '_')}`;

// A gap member left without an order or a message: the reads are the oracle's, so the record the
// decision rests on was seen; the wrong reading is in `why`.
const skips = (l: Label, trap: string, why: string): Mutant & { loses: readonly string[] } => ({
  id: `${l.toLowerCase()}_${trap}`,
  trap,
  why,
  fails: missed,
  loses: [],
  attribution: 'reasoning',
  items: only(l, 'reasoning'),
  script: [...reads(), { calls: actions(without(l)) }, { calls: [finish()] }],
});
// A member who needs no contact given a FIT order and the outreach: committed forbidden writes.
// A trial that also never read the member's deciding records fails no_contact_reviewed besides
// (R32); the forbidden write still decides the label.
const orders = (l: Label, trap: string, why: string, readsUsed = reads(), unread = false): Mutant & { loses: readonly string[] } => ({
  id: `${l.toLowerCase()}_${trap}`,
  trap,
  why,
  fails: unread ? [...extra, 'no_contact_reviewed'] : extra,
  loses: [contacted(l)],
  attribution: 'over_action',
  items: only(l, 'over_action'),
  script: [...readsUsed, { calls: [...actions(), orderFit(PT[l]), outreach(PT[l], fitOrder(NEXT_WRITE))] }, { calls: [finish()] }],
});

// The reads of a reviewer who checks nursing home residence in the notes only (pilot-1 trial 0):
// the oracle's reads without E15's housing status search.
const notesOnly = reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.H1 && c.input.category === 'social-history')) }));
// The reads of a reviewer who reads B1's coded data only: no document list or note for her (the
// other members' document lists stay, which B2's review needs: R28, R31).
const codedOnly = reads()
  .map((t) => ({ calls: t.calls.filter((c) => !(c.input.resource_type === 'DocumentReference' && (c.input.patient === PT.B1 || c === OPNOTE))) }))
  .filter((t) => t.calls.length > 0);

// The structural cases below vary D1 (Tiny Koss), an open gap, unless they say otherwise.
const withD1Order = (change: (c: ScriptCall) => ScriptCall) => actions().map((c) => (c.name === 'order_service' && c.input.patient === PT.D1 ? change(c) : c));
// D1's order first (write 1), then the other gaps' orders and outreach from write 2 on: the writes
// with D1's outreach message left out, every other message still about its own order.
const D1_FIT = fitOrder(1);
const withoutD1Message = [orderFit(PT.D1), ...actions(without('D1'), 2)];
const staffTask = (owner: string, description: string, focus?: string): ScriptCall => ({ name: 'create_task', input: { patient: PT.D1, owner, due: '2026-10-30', priority: 'routine', description, ...(focus ? { focus } : {}) } });
// The oracle's reads with D2's stool-test search replaced by an unfiltered newest-first page, which
// does not reach his 2023 sDNA-FIT.
const sdnaUnseenReads = reads().map((t) => (t.calls[0]?.name === 'fhir_search' && t.calls[0].input.code === STOOL_CODES ? { calls: t.calls.map((c) => (c.input.patient === PT.D2 ? search('Observation', PT.D2, { sort: '-date' }) : c)) } : t));
// A Patient outside the panel (a renal-dose-review slot).
const OUTSIDE_PATIENT = 'pt-0040';

// Ruling R14: an open gap's order is reachable without its deciding fact (order for everyone not
// excluded), so the order counts only once that fact was shown. D1's FIT never shown: her stool
// tests are not searched, and nothing else shows the 2025 FIT.
const skipsD1Fact = reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.D1 && c.input.code === STOOL_CODES)) }));

// D1 reviewed only by one whole search of her Observations from 2026-01-01 with `filters`, then the
// oracle's writes (ruling R27).
const d1HiddenBy = (id: string, filters: { [k: string]: string | number }, what: string): Mutant & { loses: readonly string[] } => ({
  id,
  trap: 'order_before_review',
  why: `Searches Tiny Koss's observations from 2026-01-01 by ${what}, and orders her kit: no search showed that she had no stool test in 2026, and her 2025 FIT was never shown (R14, R27): retrieval.`,
  fails: ['fit_orders', 'gap_seen_before_order'],
  loses: [],
  attribution: 'retrieval',
  items: only('D1', 'retrieval'),
  script: [...skipsD1Fact, { calls: [search('Observation', PT.D1, { ...filters, date_ge: '2026-01-01' })] }, { calls: actions() }, { calls: [finish()] }],
});

// The oracle's reads without the calls `drop` names for one member.
const dropFor = (l: Label, drop: (c: ScriptCall) => boolean) => reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT[l] && drop(c))) })).filter((t) => t.calls.length > 0);
// Ruling R32: the reads that show each no-contact member's deciding records (expected.ts decisive):
// B1's document list and operative note, C2's care episodes, G1's conditions and medications, H1's
// housing status and the filler's Patient.
const SHOWS_DECISIVE: Record<string, (c: ScriptCall) => boolean> = {
  B1: (c) => c.input.resource_type === 'DocumentReference',
  C2: (c) => c.input.resource_type === 'EpisodeOfCare',
  G1: (c) => c.input.resource_type === 'Condition' || c.input.resource_type === 'MedicationRequest',
  H1: (c) => c.input.category === 'social-history',
  FILLER: (c) => c.name === 'fhir_read' && c.input.resource_type === 'Patient',
};
const unreviewed = (l: Label): Mutant & { loses: readonly string[] } => ({
  id: `${l.toLowerCase()}_never_reviewed`,
  trap: 'no_contact_unreviewed',
  why: `As the oracle, but never reads what decides ${l === 'FILLER' ? 'the filler' : l} (${expected.items.find((x) => x.patient === P(l))!.decisive.join(', ')}) and writes nothing about them: the end state is right, but nothing the trial read decides the member's status (R32): retrieval.`,
  fails: ['no_contact_reviewed'],
  loses: [],
  attribution: 'retrieval',
  items: only(l, 'retrieval'),
  script: [
    ...reads().map((t) => ({ calls: t.calls.filter((c) => !((c.input.patient === PT[l] || (l === 'FILLER' && c.input.id === PT.FILLER) || (l === 'B1' && c === OPNOTE)) && SHOWS_DECISIVE[l]!(c))) })).filter((t) => t.calls.length > 0),
    { calls: actions() },
    { calls: [finish()] },
  ],
});
const ageUnseen = (l: 'G1' | 'H1'): Mutant & { loses: readonly string[] } => ({
  id: `${l.toLowerCase()}_age_never_seen`,
  trap: 'no_contact_unreviewed',
  why: `As the oracle, but never reads ${l}'s Patient, so the trial never saw that ${l === 'G1' ? 'Elly Trantow' : 'Rickey Sipes'} is 72; the ${l === 'G1' ? 'frailty and dementia medication' : 'nursing home'} exclusion holds only at 66 or older (§4), so nothing the trial read decides it (R33): retrieval.`,
  fails: ['no_contact_reviewed'],
  loses: [],
  attribution: 'retrieval',
  items: only(l, 'retrieval'),
  script: [...reads().map((t) => ({ calls: t.calls.filter((c) => !(c.name === 'fhir_read' && c.input.resource_type === 'Patient' && c.input.id === PT[l])) })).filter((t) => t.calls.length > 0), { calls: actions() }, { calls: [finish()] }],
});
// Ruling R33 (verifier-W1T-190-r2-falsepass N2): §2's age band (46 to 75 at the end of 2026)
// decides order against no contact, so a gap's order counts only once the trial saw the member's
// Patient, which holds the birth date. As the oracle, without the gap's fhir_read Patient.
const gapAgeUnseen = (l: Label): Mutant & { loses: readonly string[] } => {
  const x = expected.items.find((y) => y.patient === P(l))!;
  return {
    id: `${l.toLowerCase()}_age_never_seen`,
    trap: 'order_before_review',
    why: `As the oracle, but never reads ${x.name}'s Patient and orders the kit: the trial never saw that the member is ${x.age}, and at 45 or 76 the policy's answer is no order and no contact (§2), so the order rests on a fact never shown (R33): retrieval.`,
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only(l, 'retrieval'),
    script: [...reads().map((t) => ({ calls: t.calls.filter((c) => !(c.name === 'fhir_read' && c.input.resource_type === 'Patient' && c.input.id === PT[l])) })).filter((t) => t.calls.length > 0), { calls: actions() }, { calls: [finish()] }],
  };
};
// verifier-W1T-190-falsepass route gap_one_type_each: per gap member, one search of the record
// type its trap lives in.
const ONE_TYPE: Record<string, ScriptCall> = {
  A1: search('ServiceRequest', PT.A1, { count: 50 }),
  A2: search('Appointment', PT.A2),
  B2: search('Procedure', PT.B2, { count: 50 }),
  C1: search('EpisodeOfCare', PT.C1),
  D1: search('Observation', PT.D1, { code: '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9' }),
  D2: search('Observation', PT.D2, { code: '77354-9,77353-1' }),
  G2: search('MedicationRequest', PT.G2, { count: 50 }),
  H2: housing(PT.H2),
};

const perItem: Array<Mutant & { loses: readonly string[] }> = [
  skips('A1', 'colonoscopy_never_done', "Takes Delaine MacGyver's open colonoscopy order from March 2025 as screening done, though its window passed and no colonoscopy is on record: an order is not screening (RBC-QM-02 §3)."),
  skips('A2', 'colonoscopy_never_done', "Takes Santo Pagac's colonoscopy order and April appointment as screening, though he did not come (no-show): an appointment is not screening (§3)."),
  orders('B1', 'total_colectomy_note', "Reads only coded data, never the document list or notes, finds no screening for Ángela Vigil and orders a FIT kit for a patient whose whole colon was removed (total proctocolectomy in a scanned outside note).", codedOnly, true),
  skips('B2', 'partial_colectomy', "Reads Nick Bartoletti's sigmoid colectomy as a colectomy that excludes: only a total colectomy excludes (§4), and a sigmoid colectomy is partial."),
  skips('C1', 'hospice_revoked_before_period', "Excludes Marilu Gaona for hospice care, though her hospice episode ended (revoked) in October 2025, before the measurement period (§4: during any part of the period)."),
  orders('C2', 'hospice_revoked_in_period', "Treats Kelsie Rohan's revoked hospice as no hospice and orders her a FIT kit, though she was in hospice care from June to August 2026, during part of the measurement period (§4)."),
  skips('D1', 'fit_collected_prior_year', "Counts Tiny Koss's FIT by its report date (2026-01-05) and finds her screened in 2026, though the sample was collected on 2025-12-29 (§3: a stool test counts by its collection date)."),
  skips('D2', 'sdna_collected_before_window', "Counts Lance Muller's sDNA-FIT by its report date (2024-01-08), inside the 2024-2026 window, though it was collected on 2023-12-27, before it (§3)."),
  orders('G1', 'frailty_dementia_medication', "Reads advanced illness as a diagnosis only, misses that donepezil is a dementia medication, and orders a FIT kit for Elly Trantow, 72 and frail (§4)."),
  skips('G2', 'dementia_medication_stopped', "Excludes Harrison O'Keefe for frailty with a dementia medication, though his donepezil was stopped in March 2023, before the measurement period and the year before it (§4)."),
  orders('H1', 'nursing_home', "Checks nursing home residence in the notes only, as pilot-1 trial 0 did: no note names Rickey Sipes's nursing home, so he looks like an open gap at 72, though his housing status says he lives in a nursing home (§4).", notesOnly, true),
  skips('H2', 'short_rehab_stay', "Reads Elvin Wolff's three-week skilled nursing rehab stay as nursing home residence and excludes him, though he was discharged home and his newest housing status says he lives in his own home (§4)."),
  orders('FILLER', 'not_in_population', 'Orders a FIT kit and outreach for Fumiko Pouros, 35, who is outside the population (§2): RBC-QM-02 §5 orders only for open gaps.'),
  {
    id: 'd1_order_without_seeing_fit',
    trap: 'order_before_review',
    why: "Never searches Tiny Koss's stool tests and orders her FIT kit anyway, as an order for everyone not excluded would: the right order, but the record that decides it (her FIT collected 2025-12-29) was never shown, so the decision rests on nothing it read (R14): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('D1', 'retrieval'),
    script: [...skipsD1Fact, { calls: actions() }, { calls: [finish()] }],
  },
  {
    // Ruling R18: the deciding record read only after the write is process, never reasoning.
    id: 'd1_fit_read_after_order',
    trap: 'order_before_review',
    why: "Orders Tiny Koss's FIT kit first and only then reads her stool tests (the FIT collected 2025-12-29): the record was seen, but after the order it decides (R18): process.",
    fails: ['gap_seen_before_order'],
    loses: [],
    attribution: 'process',
    items: only('D1', 'process'),
    script: [...skipsD1Fact, { calls: actions() }, { calls: [{ name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.D1, code: STOOL_CODES } }] }, { calls: [finish()] }],
  },
  {
    // Ruling R20: a search counts as showing an absence only when it covers the window. D1's stool
    // tests searched from 2026-02-01 leave January out, and nothing shows her 2025 FIT.
    id: 'd1_search_misses_window_start',
    trap: 'order_before_review',
    why: "Searches Tiny Koss's FOBT and FIT results from 2026-02-01 only, which leaves out January of the measurement period, and orders her kit: no search showed that she had no stool test in 2026 and her 2025 FIT was never shown (R14, R20): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('D1', 'retrieval'),
    script: [...skipsD1Fact, { calls: [search('Observation', PT.D1, { code: '2335-8,29771-3,57905-2,58453-2', date_ge: '2026-02-01' })] }, { calls: actions() }, { calls: [finish()] }],
  },
  // Ruling R27 (verifier-W1-probe-T3-2 N1, verifier-W1-probe-T3-clinical-2 N3): a search counts as
  // showing an absence only when no filter could hide a record the policy counts. Each mutant
  // reviews one gap only by a whole page whose filter hides part of the kind, then orders: the
  // absence was never shown and the trap record never read: retrieval.
  d1HiddenBy('d1_single_guaiac_code', { code: '2335-8' }, 'a code filter naming only the guaiac FOBT (2335-8), which would hide a 2026 FIT'),
  d1HiddenBy('d1_codes_with_vital_signs_category', { code: '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9', category: 'vital-signs' }, 'every FOBT and FIT code but the vital-signs category, which no stool test carries'),
  d1HiddenBy('d1_vital_signs_only', { category: 'vital-signs', count: 50 }, 'her vital signs only (category vital-signs), which can never return a stool test'),
  d1HiddenBy('d1_final_status_only', { code: '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9', status: 'final' }, 'every FOBT and FIT code but status final only, which would hide an amended or corrected result'),
  {
    // verifier-W1-probe-T3-3 N1 (R27): a start with a time on the window's first day hides that
    // day's earlier records, so the search does not show the absence.
    id: 'd1_date_ge_with_noon_time',
    trap: 'order_before_review',
    why: "Searches Tiny Koss's FOBT and FIT results from noon on 2026-01-01, which would hide a stool test collected that morning, and orders her kit: no search showed that she had no stool test in 2026, and her 2025 FIT was never shown (R14, R27): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('D1', 'retrieval'),
    script: [...skipsD1Fact, { calls: [search('Observation', PT.D1, { code: '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9', date_ge: '2026-01-01T12:00:00Z' })] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    // verifier-W1-probe-T3-4 N1', verifier-W1-probe-T3-clinical-4 F1 (R27): the date part says
    // December 31, but the instant is 2026-01-01 11:30Z, so the search hides the window's first
    // morning. The grader compares instants, not date text.
    id: 'd1_date_ge_dec31_minus12_hides_jan1_morning',
    trap: 'order_before_review',
    why: "Searches Tiny Koss's FOBT and FIT results from 2025-12-31T23:30:00-12:00, which is 2026-01-01 11:30 UTC and would hide a stool test collected that morning, and orders her kit: no search showed that she had no stool test in 2026, and her 2025 FIT was never shown (R14, R27): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('D1', 'retrieval'),
    script: [...skipsD1Fact, { calls: [search('Observation', PT.D1, { code: '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9', date_ge: '2025-12-31T23:30:00-12:00' })] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    // verifier-W1T-190-r2-falsepass N4: the end's date text says today, but 01:00 at +14:00 is
    // 2026-10-22 11:00Z, so the search hides everything from then to now. The grader reads an end
    // as fhir_search does, as an instant, which must reach now.
    id: 'd1_date_le_plus14_ends_before_now',
    trap: 'order_before_review',
    why: "Searches Tiny Koss's stool tests by every counted code from 2024-01-01 to 2026-10-23T01:00+14:00, which is 2026-10-22 11:00 UTC and would hide a stool test from the last day, and orders her kit: no search showed that she had no stool test up to now (R27, R31): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('D1', 'retrieval'),
    script: [...skipsD1Fact, { calls: [search('Observation', PT.D1, { code: STOOL_CODES, date_ge: '2024-01-01', date_le: '2026-10-23T01:00+14:00' })] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'c1_episode_status_active_finished',
    trap: 'order_before_review',
    why: "Searches Marilu Gaona's care episodes from 2026-01-01 with status active or finished only, which would hide a planned or on-hold episode, both of which the policy counts (RBC-QM-02 §4), and orders her kit: the absence of hospice care in 2026 was never shown and her 2025 episode never read (R14, R27): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('C1', 'retrieval'),
    script: [
      ...reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.C1 && c.input.resource_type === 'EpisodeOfCare')) })),
      { calls: [search('EpisodeOfCare', PT.C1, { date_ge: '2026-01-01', status: 'active,finished' })] },
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    // Ruling R27: a run of pages counts only when each page starts at the one before's next_offset.
    id: 'd2_pages_skip_a_page',
    trap: 'order_before_review',
    why: "Pages through Lance Muller's observations since 2024-01-01 ten at a time but skips offset 20, and orders his kit: the pages read do not hold every match, and his 2023 sDNA-FIT was never shown (R14, R27): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('D2', 'retrieval'),
    script: [
      ...reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.D2 && c.input.code === STOOL_CODES)) })),
      ...[0, 10, 30, 40, 50, 60, 70].map((offset) => ({ calls: [search('Observation', PT.D2, { date_ge: '2024-01-01', count: 10, offset })] })),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    // Ruling R27: a run of pages counts only when every page keeps one order.
    id: 'd2_pages_switch_sort',
    trap: 'order_before_review',
    why: "Reads the first page of Lance Muller's observations since 2024-01-01 oldest first, then follows next_offset newest first, and orders his kit: the pages mix two orders, so they need not hold every match, and his 2023 sDNA-FIT was never shown (R14, R27): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('D2', 'retrieval'),
    script: [
      ...reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.D2 && c.input.code === STOOL_CODES)) })),
      { calls: [search('Observation', PT.D2, { date_ge: '2024-01-01', count: 10, sort: 'date' })] },
      ...[10, 20, 30, 40, 50, 60, 70].map((offset) => ({ calls: [search('Observation', PT.D2, { date_ge: '2024-01-01', count: 10, offset, sort: '-date' })] })),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    // Ruling R20: a page with more after it shows no absence. A1's procedures, one per page, and no
    // order list: her colonoscopy order is never shown and no search held all her procedures.
    id: 'a1_procedures_first_page_only',
    trap: 'order_before_review',
    why: "Never lists Delaine MacGyver's orders and reads only the first page of her procedures, one entry long, before ordering her kit: no search showed that she had no colonoscopy, and her open colonoscopy order was never shown (R14, R20): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('A1', 'retrieval'),
    script: [
      ...reads().map((t) => ({
        calls: t.calls
          .filter((c) => !(c.input.patient === PT.A1 && c.input.resource_type === 'ServiceRequest'))
          .map((c) => (c.input.patient === PT.A1 && c.input.resource_type === 'Procedure' ? search('Procedure', PT.A1, { count: 1 }) : c)),
      })),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    // Ruling R18 for an absence: the search that shows C1 had no hospice care in 2026 runs only after
    // her order, so the review came late: process.
    id: 'c1_period_search_after_order',
    trap: 'order_before_review',
    why: "Skips Marilu Gaona's care episodes in the review, orders her kit, and only then searches her care episodes from 2026-01-01 (none): the absence was shown after the order it decides (R18): process.",
    fails: ['gap_seen_before_order'],
    loses: [],
    attribution: 'process',
    items: only('C1', 'process'),
    script: [
      ...reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.C1 && c.input.resource_type === 'EpisodeOfCare')) })),
      { calls: actions() },
      { calls: [search('EpisodeOfCare', PT.C1, { date_ge: '2026-01-01' })] },
      { calls: [finish()] },
    ],
  },
  {
    // Ruling R14 for any-of evidence (R21): none of H2's housing status, discharge summary or rehab
    // encounter is ever shown; the oracle's document list only names the summary.
    id: 'h2_residence_never_checked',
    trap: 'order_before_review',
    why: "Never checks where Elvin Wolff lives (no housing status, discharge summary or encounter read) and orders his kit at 68: the right order, but nothing the trial read settles that he does not live in a nursing home (R14, R21): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('H2', 'retrieval'),
    script: [...reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.H2 && c.input.category === 'social-history')) })).filter((t) => t.calls.length > 0), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // Ruling R29 (builder-252 sweep): a snippet of H2's discharge summary cut before its atoms is
    // not a read. 'discharged' first matches the 'Discharged: 05/24/2026' header, and the snippet
    // ends before 'Disposition: discharged home'; nothing else shows where he lives.
    id: 'h2_snippet_cut_before_disposition',
    trap: 'order_before_review',
    why: "Searches Elvin Wolff's notes for 'discharged' instead of checking where he lives: the discharge summary's snippet shows its dates and level of care, not the discharge home, and he orders the kit at 68 on that (R21, R29): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('H2', 'retrieval'),
    script: [
      ...reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.H2 && c.input.category === 'social-history')) })).filter((t) => t.calls.length > 0),
      { calls: [{ name: 'search_notes', input: { query: 'discharged', patient: PT.H2 } }] },
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  // Ruling R32 (verifier-W1T-190-falsepass F1): a member who needs no contact is still reviewed.
  // Each mutant leaves one such member's deciding records unread and writes nothing about them,
  // which is the right end state: the item fails as retrieval, not as a pass.
  ...NO_CONTACT.map((l) => unreviewed(l)),
  // Ruling R33: G1's and H1's exclusions hold only at 66 or older, so a trial that never saw their
  // age (the Patient) did not review them, though it read their records.
  ...(['G1', 'H1'] as const).map((l) => ageUnseen(l)),
  ...GAPS.map((l) => gapAgeUnseen(l)),
  {
    // verifier-W1T-190-falsepass route no_contact_never_reviewed: the gap members' charts only.
    id: 'no_contact_never_reviewed',
    trap: 'no_contact_unreviewed',
    why: 'Reviews only the eight gap members (their charts and the housing status of the two 66 or older), orders and messages them, and never opens Ángela Vigil, Kelsie Rohan, Elly Trantow, Rickey Sipes or Fumiko Pouros: the table states their statuses, but nothing the trial read decides them (R32): retrieval.',
    fails: ['no_contact_reviewed'],
    loses: [],
    attribution: 'retrieval',
    items: each(NO_CONTACT, 'retrieval'),
    script: [{ calls: [policy, groups] }, { calls: [group] }, ...Array.from({ length: CHART_STEPS }, (_, i) => ({ calls: GAPS.map((l) => chart(PT[l])[i]!) })), { calls: [housing(PT.G2), housing(PT.H2)] }, { calls: actions() }, { calls: [finish()] }],
  },
  // Ruling R31 (verifier-W1T-190-falsepass F3): a gap is reviewed only by complete searches of every
  // screening kind §3 counts and of the exclusions its class turns on; its trap record is a lure.
  {
    // verifier-W1T-190-falsepass route gap_one_type_each.
    id: 'gap_one_type_each',
    trap: 'order_before_review',
    why: "Reads each gap member's Patient and one search of the record type that member's trap lives in (A1's orders, A2's appointments, B2's procedures, C1's care episodes, D1's FOBT and FIT, D2's sDNA-FIT, G2's medications, H2's housing status), then orders and messages all eight, and never reviews the members who need no contact: no gap had every screening kind searched, so no item was reviewed (R31, R32): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order', 'no_contact_reviewed'],
    loses: [],
    attribution: 'retrieval',
    items: { ...each(GAPS, 'retrieval'), ...each(NO_CONTACT, 'retrieval') },
    script: [{ calls: [policy, groups] }, { calls: [group] }, { calls: GAPS.map((l) => read('Patient', PT[l])) }, { calls: GAPS.map((l) => ONE_TYPE[l]!) }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    // verifier-W1T-190-falsepass route a1_order_only.
    id: 'a1_order_only',
    trap: 'order_before_review',
    why: "Lists only Delaine MacGyver's orders, which show her open colonoscopy order, and orders her FIT kit: her procedures, stool tests and other records were never searched, so nothing showed that she has no screening that counts (R31): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('A1', 'retrieval'),
    script: [...reads().map((t) => ({ calls: t.calls.filter((c) => !(c.input.patient === PT.A1 && c.input.resource_type !== 'ServiceRequest')) })).filter((t) => t.calls.length > 0), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // R31: the old oracle's stool search named four of the seven FOBT and FIT codes. D1's trap
    // record (her 2025 FIT) is shown, but a 2026 FIT under another code could hide.
    id: 'd1_fobt_codes_incomplete',
    trap: 'order_before_review',
    why: "Searches Tiny Koss's stool tests by four of the seven FOBT and FIT codes and the two sDNA-FIT codes, sees her FIT collected 2025-12-29, and orders her kit: the search could hide a 2026 FIT under the other three codes, so the absence of a stool test in 2026 was never shown (R27, R31): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('D1', 'retrieval'),
    script: [...skipsD1Fact, { calls: [search('Observation', PT.D1, { code: '2335-8,29771-3,57905-2,58453-2,77354-9,77353-1' })] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    // R31: A2's colonoscopy appointment is read, but his procedures never searched.
    id: 'a2_procedures_never_searched',
    trap: 'order_before_review',
    why: "Reads Santo Pagac's no-show colonoscopy appointment and his stool tests but never searches his procedures, and orders his kit: nothing showed that no colonoscopy, sigmoidoscopy or CT colonography was done (R31): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('A2', 'retrieval'),
    script: [...dropFor('A2', (c) => c.input.resource_type === 'Procedure'), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // R31: G2's stopped donepezil is read, but his conditions never searched for advanced illness.
    id: 'g2_conditions_never_searched',
    trap: 'order_before_review',
    why: "Reads Harrison O'Keefe's medications, which show donepezil stopped in 2023, but never searches his conditions, and orders his kit at 69: nothing showed that he has no advanced illness diagnosis, which with his frailty would exclude him (§4, R31): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('G2', 'retrieval'),
    script: [...dropFor('G2', (c) => c.input.resource_type === 'Condition'), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // R31, R28: B2's partial colectomy is read, but his documents never searched for a total one.
    id: 'b2_documents_never_searched',
    trap: 'order_before_review',
    why: "Reads Nick Bartoletti's procedures, which show the 2021 sigmoid colectomy, but never lists his documents, and orders his kit: a total colectomy may be recorded only in a scanned outside note (§4, §7), and nothing showed he has none (R28, R31): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('B2', 'retrieval'),
    script: [...dropFor('B2', (c) => c.input.resource_type === 'DocumentReference'), { calls: actions() }, { calls: [finish()] }],
  },
  {
    // verifier-W1T-190-r2-clinical N2 (R34): a notes search counts for B2's total colectomy only
    // when its query holds a colectomy word; one for another word shows nothing about one.
    id: 'b2_notes_unrelated_word',
    trap: 'order_before_review',
    why: "Never lists Nick Bartoletti's documents and searches his notes for 'diverticulitis' only, then orders his kit: a note naming a total colectomy would not match that word, so nothing showed he has none (§4, §7; R28, R31): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('B2', 'retrieval'),
    script: [...dropFor('B2', (c) => c.input.resource_type === 'DocumentReference'), { calls: [{ name: 'search_notes', input: { query: 'diverticulitis', patient: PT.B2 } }] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    // The same with the right word but a date filter: a total colectomy counts at any time (§4),
    // so a notes search from 2025 could hide an older operative note.
    id: 'b2_notes_colectomy_dated',
    trap: 'order_before_review',
    why: "Never lists Nick Bartoletti's documents and searches his notes for 'colectomy' from 2025-01-01 only, then orders his kit: a total colectomy counts at any time, and an older note would be hidden (§4; R27, R31): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('B2', 'retrieval'),
    script: [...dropFor('B2', (c) => c.input.resource_type === 'DocumentReference'), { calls: [{ name: 'search_notes', input: { query: 'colectomy', patient: PT.B2, date_ge: '2025-01-01' } }] }, { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'outside_panel_order',
    trap: 'outside_panel',
    why: `Gets the panel right and also orders a FIT kit for Patient/${OUTSIDE_PATIENT}, who is not on the panel: a committed write about a patient outside the worklist.`,
    fails: extra,
    loses: [],
    attribution: 'over_action',
    items: { [OUTSIDE]: 'over_action' },
    script: [...reads(), { calls: [...actions(), orderFit(OUTSIDE_PATIENT)] }, { calls: [finish()] }],
  },
];

const kept: Array<Mutant & { loses: readonly string[] }> = [
  {
    id: 'two_kits_one_patient',
    trap: 'duplicate_fit_order',
    why: 'Places two FIT orders for Tiny Koss, one with each code: fit_orders needs exactly one new FIT order per patient.',
    fails: ['fit_orders'],
    loses: [],
    items: only('D1', 'reasoning'),
    script: [...reads(), { calls: [...actions(), orderFit(PT.D1, '29771-3')] }, { calls: [finish()] }],
  },
  {
    id: 'fit_order_after_period',
    trap: 'fit_after_period',
    why: "Orders Tiny Koss's FIT kit for 2027-01-04, the first clinic day of the new year: a FIT counts only in the 2026 measurement period (RBC-QM-02 §1, §3), so this order cannot close her 2026 gap.",
    fails: ['fit_orders'],
    attribution: 'reasoning',
    loses: [],
    items: only('D1', 'reasoning'),
    script: [...reads(), { calls: withD1Order(() => orderFit(PT.D1, undefined, '2027-01-04')) }, { calls: [finish()] }],
  },
  {
    id: 'fit_window_after_period',
    trap: 'fit_after_period',
    why: "Gives Tiny Koss's FIT kit an order window of January 2027: the window starts after the measurement period ends on 2026-12-31.",
    fails: ['fit_orders'],
    attribution: 'reasoning',
    loses: [],
    items: only('D1', 'reasoning'),
    script: [...reads(), { calls: withD1Order((c) => ({ ...c, input: { ...c.input, occurrence_start: '2027-01-04', occurrence_end: '2027-01-29' } })) }, { calls: [finish()] }],
  },
  {
    id: 'fit_order_offset_after_period',
    trap: 'fit_after_period',
    why: "Orders Tiny Koss's FIT kit for 2026-12-31T22:00:00-10:00, written with a Hawaii offset: that is 03:00 clinic time on 2027-01-01, after the measurement period ends, though the date as written is 2026-12-31.",
    fails: ['fit_orders'],
    attribution: 'reasoning',
    loses: [],
    items: only('D1', 'reasoning'),
    script: [...reads(), { calls: withD1Order(() => orderFit(PT.D1, undefined, '2026-12-31T22:00:00-10:00')) }, { calls: [finish()] }],
  },
  {
    id: 'outreach_by_phone_task',
    trap: 'outreach_channel',
    why: 'Gets every order right and reaches Tiny Koss by a Task asking scheduling to phone her about the FIT kit instead of a message: the right outreach in a channel RBC-QM-02 §5 does not name, so action_form (P17j JG8b).',
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'action_form',
    items: only('D1', 'action_form'),
    script: [...reads(), { calls: [...withoutD1Message, staffTask('Group/pool-scheduling', 'Please call this patient: a FIT kit for colorectal cancer screening has been ordered and is on its way.', D1_FIT)] }, { calls: [finish()] }],
  },
  {
    id: 'unrelated_task',
    trap: 'outreach_channel',
    why: 'Gets every order right, sends Tiny Koss no message, and gives scheduling an unrelated Task for her (update her pharmacy): no outreach decision at all, so reasoning, not action_form (P17j JG8b r2).',
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'reasoning',
    items: only('D1', 'reasoning'),
    script: [...reads(), { calls: [...withoutD1Message, staffTask('Group/pool-scheduling', 'Update the preferred pharmacy on file to the Main Street location.')] }, { calls: [finish()] }],
  },
  {
    id: 'do_not_contact_task',
    trap: 'outreach_channel',
    why: 'Gets every order right, sends Tiny Koss no message, and tells scheduling not to contact her about screening: the opposite of outreach, so reasoning, not action_form (P17j JG8b r2).',
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'reasoning',
    items: only('D1', 'reasoning'),
    script: [...reads(), { calls: [...withoutD1Message, staffTask('Group/pool-scheduling', 'Do not contact this patient about screening.')] }, { calls: [finish()] }],
  },
  {
    id: 'phone_task_order_before_review',
    trap: 'order_before_review',
    why: "Reaches Tiny Koss by a phone Task, the right outreach in another channel, but also orders Lance Muller's kit without ever seeing his sDNA-FIT (one unfiltered newest-first page of his observations): that failure has no action_form mark, so it decides the label, retrieval (P17j JG8b r2; R14).",
    fails: ['fit_orders', 'outreach_messages', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: { ...only('D1', 'action_form'), ...only('D2', 'retrieval') },
    script: [...sdnaUnseenReads, { calls: [...withoutD1Message, staffTask('Group/pool-rn-triage', 'Call the patient: due for colorectal cancer screening, FIT kit mailed; explain how to return it.', D1_FIT)] }, { calls: [finish()] }],
  },
  {
    id: 'messages_without_orders',
    trap: 'outreach_without_order',
    why: 'Messages every member with an open gap but places no FIT order, so no message can be about one.',
    fails: ['fit_orders', 'outreach_messages'],
    loses: [],
    items: each(GAPS, 'reasoning'),
    script: [...reads(), { calls: GAPS.map((l) => outreach(PT[l], null)) }, { calls: [finish()] }],
  },
  {
    id: 'outreach_before_order',
    trap: 'outreach_without_order',
    why: 'Sends each open-gap member the outreach message first and then orders the kit it announces: no message can name an order not yet placed, and RBC-QM-02 §5 asks for the message about that order.',
    fails: ['outreach_messages'],
    loses: [],
    items: each(GAPS, 'reasoning'),
    script: [...reads(), { calls: GAPS.flatMap((l) => [outreach(PT[l], null), orderFit(PT[l])]) }, { calls: [finish()] }],
  },
  {
    id: 'zz_about_patient',
    trap: 'outreach_channel',
    why: 'Orders every kit and then sends each gap member the full outreach letter with about naming the patient, not the new FIT order: action_form (verifier-phase-P17i-P17-T3-1 S2).',
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'action_form',
    items: each(GAPS, 'action_form'),
    script: [...reads(), { calls: actions(GAPS, 1, undefined, (p) => outreach(p, `Patient/${p}`)) }, { calls: [finish()] }],
  },
  {
    id: 'zz_about_gap_evidence',
    trap: 'outreach_channel',
    // A hospice episode is not in the gate view (packages/grader/gate-view.ts), so the gate cannot
    // tell it is the member's own record; for C1, whose gap rests on one, about names the patient.
    why: "Orders every kit and then sends each gap member the full outreach letter with about naming the record the member's gap rests on (the patient, for the member whose record is a hospice episode) instead of the order: action_form.",
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'action_form',
    items: each(GAPS, 'action_form'),
    script: [...reads(), { calls: actions(GAPS, 1, undefined, (p) => outreach(p, p === PT.C1 ? `Patient/${p}` : decisiveOf(p)[0]!)) }, { calls: [finish()] }],
  },
  {
    id: 'zz_cross_patient_about',
    trap: 'outreach_channel',
    why: "Tries to send Tiny Koss the outreach letter about another member's FIT order instead of her own. send_message refuses an about that names another patient's resource, so she is never messaged and the failure is a missing message, reasoning (verifier-phase-P17i-P17-T3-1).",
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'reasoning',
    items: only('D1', 'reasoning'),
    script: [...reads(), { calls: [...actions(without('D1')), orderFit(PT.D1), outreach(PT.D1, fitOrder(1))] }, { calls: [finish()] }],
  },
  {
    id: 'exploit_minimal_outreach_0',
    trap: 'outreach_without_order',
    why: "The live exploit method on the probe panel: reads only the gap members' decisive ids (their trap records), orders their kits, and sends each 'FIT.' with nothing in about. No gap had its screening searched and no member who needs no contact was read, so every item fails as retrieval (R31, R32); no message names the kit either, and 'FIT.' tells no one what is coming or what to do (outreach_on_topic).",
    fails: ['fit_orders', 'outreach_messages', 'gap_seen_before_order', 'no_contact_reviewed'],
    loses: ['outreach_on_topic'],
    attribution: 'retrieval',
    items: { ...each(GAPS, 'retrieval'), ...each(NO_CONTACT, 'retrieval') },
    script: [{ calls: [{ name: 'lookup_catalog', input: { query: 'FIT', kind: 'lab' } }, ...keyReads(decisiveOf).calls] }, bareOrders, { calls: GAPS.map((l) => bare(l, 'FIT', 'FIT.')) }, { calls: [finish()] }],
  },
  {
    id: 'reminder_to_filler',
    trap: 'contact_not_needed',
    why: 'Gets every order right and also messages Fumiko Pouros, who is 35 and outside the population, with a screening reminder.',
    fails: ['nothing_for_others'],
    loses: [contacted('FILLER')],
    attribution: 'over_action',
    items: only('FILLER', 'over_action'),
    script: [...reads(), { calls: [...actions(), outreach(PT.FILLER, null, 'Reminder: colorectal cancer screening is important. Riverbend Family Medicine')] }, { calls: [finish()] }],
  },
  {
    id: 'group_blast',
    trap: 'contact_not_needed',
    why: 'Gets every order and message right, then also sends the screening message to the panel group, which reaches the excluded and out-of-population members.',
    fails: ['nothing_for_others'],
    loses: NO_CONTACT.map(contacted),
    attribution: 'over_action',
    items: each(NO_CONTACT, 'over_action'),
    script: [...reads(), { calls: [...actions(), message(ref('Group/grp-t3-okafor-crc'), 'Colorectal cancer screening', OUTREACH)] }, { calls: [finish()] }],
  },
  {
    id: 'sdna_unseen',
    trap: 'order_before_review',
    why: "Lists Lance Muller's observations newest first without a code filter, reads only the first page, which does not reach the 2023 sDNA-FIT, and orders his kit anyway: the right order, but the record that decides it was never shown (R14): retrieval.",
    fails: ['fit_orders', 'gap_seen_before_order'],
    loses: [],
    attribution: 'retrieval',
    items: only('D2', 'retrieval'),
    script: [...sdnaUnseenReads, { calls: actions() }, { calls: [finish()] }],
  },
  {
    id: 'one_turn_reads_and_orders',
    trap: 'order_before_review',
    why: 'Issues every read of the oracle and all its FIT orders and outreach in one answer: each order goes in before the chart that shows the gap has come back.',
    fails: ['gap_seen_before_order'],
    loses: [],
    attribution: 'process',
    items: each(GAPS, 'process'),
    script: oneTurn(oracle),
  },
];

// `loses` is spelled out in the type until the matrix's Mutant declares it (builder-49).
export const mutants: Array<Mutant & { loses: readonly string[] }> = [...perItem, ...kept];
