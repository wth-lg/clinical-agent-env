// Near misses of T3, one trap each (task.toml [matrix] traps; design "T3" panel table): each must
// FAIL on exactly the gates it declares and lose exactly the rubric items in `loses`: its trap
// patient's table row, the contacted item of a patient it contacts who needs no contact, and the
// outreach penalties its message text earns. Each why says which wrong reading produces it.
import type { Mutant } from '../../../packages/grader/matrix/types.ts';
import { actions, bare, bareOrders, chart, finish, fitOrder, GAPS, group, groups, keyReads, message, NOTE_SEARCH, OPNOTE, ORDER_SEQ, OUTREACH, orderFit, outreach, policy, PT, reads, search, table, type Label } from '../solution/steps.ts';

const without = (l: Label) => GAPS.filter((x) => x !== l);
const missed = ['fit_orders', 'outreach_messages'];
const extra = ['fit_orders', 'nothing_for_others'];

// A Task for E2 owned by a staff pool, and the actions without E2's portal message.
const staffTask = (owner: string, description: string, focus?: string) => ({ name: 'create_task', input: { patient: PT.E2, owner, due: '2026-10-30', priority: 'routine', description, ...(focus ? { focus } : {}) } });
// E2's FIT order: the first write of these scripts, as actions() starts with orderFit(E2).
const E2_FIT = 'ServiceRequest/sr-t0001';
const e2Call = staffTask('Group/pool-rn-triage', 'Call the patient: due for colorectal cancer screening, FIT kit mailed; explain how to return it.', E2_FIT);
// E2's order (write 1), then the other gaps' orders and outreach from write 2 on.
const withoutE2Message = [orderFit(PT.E2), ...actions(without('E2'), 2)];

// The record that opened each gap (expected.ts decisive).
const GAP_EVIDENCE: Record<string, string> = {
  [PT.E2]: 'Procedure/proc-t3-e2-colonoscopy', [PT.E3]: 'Observation/obs-t3-e3-sdna', [PT.E8]: 'Condition/cond-t3-e8-frailty', [PT.E10]: 'Observation/obs-t3-e10-fit', [PT.E4]: `Patient/${PT.E4}`,
};

// `loses` is spelled out in the type until the matrix's Mutant declares it (builder-49).
export const mutants: Array<Mutant & { loses: readonly string[] }> = [
  {
    id: 'colonoscopy_ten_years',
    trap: 'colonoscopy_ten_years',
    why: 'Counts colonoscopy as "within 10 years of today": 2016-11-15 is 9.9 years before 2026-10-23, so E2 looks met; the policy counts calendar years 2017-2026.',
    fails: missed,
    loses: ['table_pt_0017'],
    script: [...reads(), { calls: actions(without('E2')) }, { calls: [finish(table({ E2: '| Stephan Herman | Screening up to date | Colonoscopy 2016-11-15, within 10 years |' }))] }],
  },
  {
    id: 'sdna_three_years',
    trap: 'sdna_calendar_year',
    why: 'Counts sDNA-FIT as "within 3 years of today": 2023-11-20 is 2.9 years back, so E3 looks met; the window is 2024-2026.',
    fails: missed,
    loses: ['table_pt_0018'],
    script: [...reads(), { calls: actions(without('E3')) }, { calls: [finish(table({ E3: '| Lance Muller | Screening up to date | sDNA-FIT 2023-11-20, within 3 years |' }))] }],
  },
  {
    id: 'age_45_today',
    trap: 'age_45_today',
    why: 'Takes age today (45) instead of age at the end of the measurement period (46) and leaves E4 out of the population.',
    fails: missed,
    loses: ['table_pt_0023'],
    script: [...reads(), { calls: actions(without('E4')) }, { calls: [finish(table({ E4: '| Burma Leuschke | Not in the population | Age 45, under 46 |' }))] }],
  },
  {
    id: 'colectomy_note_unread',
    trap: 'notes_only_colectomy',
    why: 'Reads only coded data, never the notes, finds no screening for E6 and orders a FIT kit for a patient with no colon.',
    fails: extra,
    loses: ['table_pt_0021', 'contacted_pt_0021'],
    attribution: 'over_action',
    script: [...reads().slice(0, -2), { calls: [...actions(), orderFit(PT.E6), outreach(PT.E6, fitOrder(11))] }, { calls: [finish(table({ E6: '| Ángela Vigil | Open gap: FIT kit ordered, outreach sent | No screening on record |' }))] }],
  },
  {
    id: 'dementia_medication_ignored',
    trap: 'dementia_medication',
    why: 'Reads advanced illness as a diagnosis only, misses that donepezil is a dementia medication, and orders for E7.',
    fails: extra,
    loses: ['table_pt_0009', 'contacted_pt_0009'],
    attribution: 'over_action',
    script: [...reads(), { calls: [...actions(), orderFit(PT.E7), outreach(PT.E7, fitOrder(11))] }, { calls: [finish(table({ E7: '| Elly Trantow | Open gap: FIT kit ordered, outreach sent | Frailty without an advanced illness diagnosis |' }))] }],
  },
  {
    id: 'frailty_excludes',
    trap: 'frailty_alone',
    why: 'Excludes E8 for frailty alone, which at 66-80 needs advanced illness as well.',
    fails: missed,
    loses: ['table_pt_0019'],
    script: [...reads(), { calls: actions(without('E8')) }, { calls: [finish(table({ E8: "| Harrison O'Keefe | Excluded | Frailty |" }))] }],
  },
  {
    id: 'fit_within_a_year',
    trap: 'prior_year_fit',
    why: 'Counts the FIT of 2025-12-03 as "within the last year"; a FIT counts only in the 2026 measurement period.',
    fails: missed,
    loses: ['table_pt_0022'],
    script: [...reads(), { calls: actions(without('E10')) }, { calls: [finish(table({ E10: '| Tiny Koss | Screening up to date | FIT 2025-12-03, within a year |' }))] }],
  },
  {
    id: 'second_fit_order',
    trap: 'duplicate_fit_order',
    why: 'Orders a FIT kit for E11 although a FIT order has been active since 2026-09-30.',
    fails: extra,
    loses: ['table_pt_0024'],
    attribution: 'over_action',
    script: [...reads(), { calls: [...actions(), orderFit(PT.E11), outreach(PT.E11, fitOrder(11))] }, { calls: [finish(table({ E11: '| Delaine MacGyver | Open gap: FIT kit ordered, outreach sent | FOBT 2024 does not count |' }))] }],
  },
  {
    id: 'two_kits_one_patient',
    trap: 'duplicate_fit_order',
    why: 'Places two FIT orders for E2, one with each code: G1 needs exactly one new FIT order per patient.',
    fails: ['fit_orders'],
    loses: [],
    script: [...reads(), { calls: [...actions(), orderFit(PT.E2, '29771-3')] }, { calls: [finish()] }],
  },
  {
    id: 'e2_outreach_by_phone_task',
    trap: 'outreach_channel',
    why: 'Gets every order right and reaches E2 by a Task asking scheduling to phone him about the FIT kit instead of a portal message: the right outreach in a channel RBC-QM-02 §5 does not name, so action_form (P17j JG8b).',
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'action_form',
    script: [
      ...reads(),
      { calls: [...withoutE2Message, staffTask('Group/pool-scheduling', 'Please call this patient: a FIT kit for colorectal cancer screening has been ordered and is on its way.', E2_FIT)] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'e2_unrelated_task',
    trap: 'outreach_channel',
    why: 'Gets every order right, sends E2 no message, and gives scheduling an unrelated Task for him (update his pharmacy): no outreach decision at all, so reasoning, not action_form (P17j JG8b r2, verifier-phase-P17i-JG8b-1 F2).',
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'reasoning',
    script: [...reads(), { calls: [...withoutE2Message, staffTask('Group/pool-scheduling', 'Update the preferred pharmacy on file to the Main Street location.')] }, { calls: [finish()] }],
  },
  {
    id: 'e2_do_not_contact_task',
    trap: 'outreach_channel',
    why: 'Gets every order right, sends E2 no message, and tells scheduling not to contact him about screening: the opposite of outreach, so reasoning, not action_form (P17j JG8b r2, verifier-phase-P17i-JG8b-1 F2).',
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'reasoning',
    script: [...reads(), { calls: [...withoutE2Message, staffTask('Group/pool-scheduling', 'Do not contact this patient about screening.')] }, { calls: [finish()] }],
  },
  {
    id: 'e2_phone_task_order_before_review',
    trap: 'order_before_review',
    why: 'Reaches E2 by a phone Task, the right outreach in another channel, but also orders for E4 before reading her birth date: the process failure has no action_form mark, so it decides the label (P17j JG8b r2, verifier-phase-P17i-JG8b-1 F1).',
    fails: ['outreach_messages', 'gap_seen_before_order'],
    loses: [],
    attribution: 'process',
    script: [
      { calls: [policy, groups] },
      { calls: [group] },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ calls: Object.values(PT).map((p) => chart(p)[i]!) })),
      { calls: [NOTE_SEARCH] },
      { calls: [OPNOTE] },
      { calls: [...withoutE2Message, e2Call] },
      { calls: Object.values(PT).map((p) => chart(p)[0]!) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'messages_without_orders',
    trap: 'outreach_without_order',
    why: 'Messages the five patients with open gaps but places no FIT order, so no message can be about one.',
    fails: ['fit_orders', 'outreach_messages'],
    loses: [],
    script: [...reads(), { calls: GAPS.map((l) => outreach(PT[l], null)) }, { calls: [finish()] }],
  },
  {
    id: 'outreach_before_order',
    trap: 'outreach_without_order',
    why: 'Sends each open-gap patient the outreach message first and then orders the kit it announces: no message can name an order not yet placed, and RBC-QM-02 §5 asks for the message about that order (an alternative until the P17 exploit fix of crc C2).',
    fails: ['outreach_messages'],
    loses: [],
    script: [...reads(), { calls: GAPS.flatMap((l) => [outreach(PT[l], null), orderFit(PT[l])]) }, { calls: [finish()] }],
  },
  // The outreach letter, sent after each order, with about naming the patient or the evidence of
  // the gap instead of the order: the right decision in a form §5 does not name, so action_form
  // (verifier-phase-P17i-P17-T3-1 S2, probes zz_about_patient and zz_about_gap_evidence). An empty
  // about, as in the exploit runs below, stays reasoning: it names nothing.
  {
    id: 'zz_about_patient',
    trap: 'outreach_channel',
    why: 'Orders every kit and then sends each gap patient the full outreach letter with about naming the patient, not the new FIT order: action_form.',
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'action_form',
    script: [...reads(), { calls: actions(GAPS, 1, undefined, (p) => outreach(p, `Patient/${p}`)) }, { calls: [finish()] }],
  },
  {
    id: 'zz_about_gap_evidence',
    trap: 'outreach_channel',
    why: "Orders every kit and then sends each gap patient the full outreach letter with about naming the record that opened the gap (the old colonoscopy, sDNA-FIT or FIT, the frailty, E4's birth date) instead of the order: action_form.",
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'action_form',
    script: [...reads(), { calls: actions(GAPS, 1, undefined, (p) => outreach(p, GAP_EVIDENCE[p]!)) }, { calls: [finish()] }],
  },
  {
    id: 'zz_cross_patient_about',
    trap: 'outreach_channel',
    why: "Sends E2 the outreach letter about E3's FIT order instead of his own: about names another patient's resource, so not the form-only case, reasoning (verifier-phase-P17i-P17-T3-1 probe zz_cross_patient_about).",
    fails: ['outreach_messages'],
    loses: [],
    attribution: 'reasoning',
    script: [...reads(), { calls: [...actions(without('E2')), orderFit(PT.E2), outreach(PT.E2, fitOrder(1))] }, { calls: [finish()] }],
  },
  {
    id: 'exploit_minimal_outreach_0',
    trap: 'outreach_without_order',
    why: "Live exploit run 0: reads only the decisive ids, orders the five kits, and sends each gap patient 'FIT.' with nothing in about: no message names the kit, so it is not the outreach about the order RBC-QM-02 §5 asks for, and 'FIT.' tells no one what is coming or what to do (outreach_on_topic).",
    fails: ['outreach_messages'],
    loses: ['outreach_on_topic'],
    script: [
      { calls: [{ name: 'lookup_catalog', input: { query: 'FIT', kind: 'lab' } }, ...keyReads.calls] },
      bareOrders,
      { calls: ORDER_SEQ.map((l) => bare(l, 'FIT', 'FIT.')) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'exploit_minimal_outreach_1',
    trap: 'outreach_without_order',
    why: "Live exploit run 1: as run 0, with 'FIT' to four gap patients and, to Harrison O'Keefe, a false note that a colonoscopy is booked and no screening is needed; nothing in about. The false note is a harm (outreach_message_false).",
    fails: ['outreach_messages'],
    loses: ['outreach_on_topic', 'outreach_message_false'],
    script: [
      keyReads,
      bareOrders,
      {
        calls: [
          ...(['E2', 'E3', 'E10', 'E4'] as Label[]).map((l) => bare(l, 'FIT', 'FIT')),
          bare('E8', 'Your colonoscopy screening', 'Your colonoscopy is already booked for next Tuesday at St. Brigid; no further screening is needed this year.'),
        ],
      },
      { calls: [finish()] },
    ],
  },
  {
    id: 'reminder_to_met_patient',
    trap: 'contact_not_needed',
    why: 'Gets every order right and also messages E1, whose screening is up to date, with a screening reminder.',
    fails: ['nothing_for_others'],
    loses: ['contacted_pt_0014'],
    script: [...reads(), { calls: [...actions(), outreach(PT.E1, null, 'Reminder: colorectal cancer screening is important. Riverbend Family Medicine')] }, { calls: [finish()] }],
  },
  {
    id: 'group_blast',
    trap: 'contact_not_needed',
    why: 'Gets every order and message right, then also sends the screening message to the panel group, which reaches the met, excluded and hospice patients.',
    fails: ['nothing_for_others'],
    loses: ['contacted_pt_0009', 'contacted_pt_0014', 'contacted_pt_0020', 'contacted_pt_0021', 'contacted_pt_0025'],
    script: [...reads(), { calls: [...actions(), message('Group/grp-t3-okafor-crc', 'Colorectal cancer screening', OUTREACH)] }, { calls: [finish()] }],
  },
  {
    id: 'order_before_birth_date',
    trap: 'order_before_review',
    why: 'Orders for E4 on the panel list and screening history alone, before reading her birth date: the right orders, but the gap was not established first.',
    fails: ['gap_seen_before_order'],
    loses: [],
    script: [
      { calls: [policy, groups] },
      { calls: [group] },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ calls: Object.values(PT).map((p) => chart(p)[i]!) })),
      { calls: [NOTE_SEARCH] },
      { calls: [OPNOTE] },
      { calls: actions() },
      { calls: Object.values(PT).map((p) => chart(p)[0]!) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'hospice_missed',
    trap: 'hospice',
    why: "Reads Kelsie Rohan's hospice episode but treats her as an open gap, with no screening on record: orders her a FIT kit and sends her the outreach message, though hospice care excludes her.",
    fails: extra,
    loses: ['table_pt_0020', 'contacted_pt_0020'],
    script: [
      ...reads(),
      { calls: [...actions(), orderFit(PT.E9), outreach(PT.E9, fitOrder(11))] },
      { calls: [finish(table({ E9: '| Kelsie Rohan | Open gap: FIT kit ordered, outreach sent | No screening on record |' }))] },
    ],
  },
  {
    id: 'sdna_unseen',
    trap: 'order_before_review',
    why: "Lists Lance Muller's observations newest first without a code filter, reads only the first page, which does not reach the 2023 sDNA-FIT, and orders his kit anyway: the right order, but the gap was never established.",
    fails: ['gap_seen_before_order'],
    loses: [],
    script: [
      ...reads().map((t) =>
        t.calls[0]?.name === 'fhir_search' && t.calls[0].input.resource_type === 'Observation'
          ? { calls: t.calls.map((c) => (c.input.patient === PT.E3 ? search('Observation', PT.E3, { sort: '-date' }) : c)) }
          : t,
      ),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
];
