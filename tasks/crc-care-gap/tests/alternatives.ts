// Other correct solutions of T3: each must PASS. They vary what a careful clinician might vary
// (the FIT code, the order window, the reading order and filters, a reminder to the patient
// whose kit is already out, a note per ordered patient, the table's wording), so the grader is
// shown not to depend on the oracle's exact path.
import type { Agent } from '../../../packages/grader/matrix/types.ts';
import {
  actions, bare, bareOrders, chart, finish, fitOrder, GAPS, group, groups, housing, keyReads, MEMBERS, message, NEXT_WRITE, NOTE_SEARCH, notes, OPNOTE, ORDER_SEQ, orderFit, outreach, OVER_65, policy, PROCEDURE_CODES, PT, read, reads, ROWS, search, STOOL_CODES, table, type Label,
} from '../solution/steps.ts';
import { ref } from '../ids.ts';

const ALL = 'CRC outreach done for Okafor CRC 2026: six FIT kits ordered, six patients messaged.';

// `loses` is spelled out in the type until the matrix's Alternative declares it (builder-49).
type Alternative = Agent & { loses?: readonly string[] };

// The oracle's table keyed by patient id instead of name.
const byId = table(Object.fromEntries((Object.keys(ROWS) as Label[]).map((l) => [l, ROWS[l].replace(/^\| [^|]+ \|/, `| ${PT[l]} |`)])));

export const alternatives: Alternative[] = [
  {
    id: 'loinc_fit_code',
    why: 'Orders the FIT by its LOINC test code (29771-3) instead of the clinic kit code, with an order window of two weeks.',
    script: [
      ...reads(),
      { calls: actions(GAPS, 1, (p) => ({ ...orderFit(p, '29771-3', '2026-10-26'), input: { ...orderFit(p, '29771-3', '2026-10-26').input, occurrence_end: '2026-11-09' } })) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'patient_by_patient',
    why: 'Reviews one patient at a time with broader searches (all procedures, all observations of the stool codes, the notes of each patient), and orders and messages each gap as it finds it.',
    script: [
      { calls: [policy] },
      { calls: [groups] },
      { calls: [group] },
      ...MEMBERS.flatMap((p) => {
        const label = (Object.keys(PT) as Array<keyof typeof PT>).find((l) => PT[l] === p)!;
        // A member 66 or older also gets a look at his social history (§4's nursing home clause).
        const review = { calls: [read('Patient', p), search('Procedure', p, { count: 50, sort: '-date' }), ...chart(p).slice(2), search('DocumentReference', p), ...(OVER_65.includes(label) ? [housing(p)] : [])] };
        // The note list shows E6's scanned outside record; reading it shows the colectomy.
        const more = label === 'E6' ? [{ calls: [OPNOTE] }] : [];
        // Each gap's order is a write before its message, in panel order: gap i's is write 2i + 1.
        return GAPS.includes(label) ? [review, { calls: [orderFit(p), outreach(p, fitOrder(2 * GAPS.indexOf(label) + 1))] }] : [review, ...more];
      }),
      { calls: [finish(table())] },
    ],
  },
  {
    id: 'reminder_for_active_order',
    why: 'Also messages the patient whose FIT order is already active, reminding her to return the kit (no second order), and words the table its own way.',
    script: [
      ...reads(),
      { calls: [...actions(), outreach(PT.E11, null, 'A FIT kit was ordered for you on 9/30. If you have it, please complete it and mail it back. Riverbend Family Medicine')] },
      {
        calls: [
          finish(
            table({
              E2: '| Stephan Herman | Due (gap) | Colonoscopy Nov 2016 is outside the 2017-2026 lookback; FIT kit ordered and patient messaged |',
              E11: '| Delaine MacGyver | Due (gap), kit already ordered | Active FIT order from 9/30/2026, so no new order; reminder sent |',
            }),
          ),
        ],
      },
    ],
  },
  {
    id: 'notes_for_ordered',
    why: 'Writes a short outreach note on each ordered patient and makes all writes and the finish in one answer.',
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
    id: 'summary_then_table',
    why: 'Opens the final text with a summary paragraph before the table, and ends with a closing line.',
    script: [...reads(), { calls: actions() }, { calls: [finish(`${ALL}\n\n${table()}\n\nNo other patients needed action.`)] }],
  },
  {
    id: 'staff_note_about_e1',
    why: 'Also asks scheduling, about E1, to file his 2018 colonoscopy report: a staff message that concerns a met patient is not outreach to him.',
    script: [
      ...reads(),
      { calls: [...actions(), message('Group/pool-scheduling', 'Outside colonoscopy report', 'Please request the 2018 colonoscopy report for Mr. Pagac and file it in his chart.', ['Patient/pt-0014'])] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'triage_note_about_opnote',
    why: 'Also asks RN triage, about E6\'s scanned operative note, to code the colectomy in her surgical history: a staff message about an excluded patient.',
    script: [
      ...reads(),
      { calls: [...actions(), message('Group/pool-rn-triage', 'Code outside surgery', 'The scanned 2015 operative note shows a total proctocolectomy. Please add it to the surgical history.', [ref('DocumentReference/doc-t3-1856')])] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'fit_for_e5_at_75',
    why: 'Also orders a FIT kit and sends outreach to E5, who is 75 today (USPSTF 2021 grade A covers 50-75) though 76 at the end of the period: a safe, guideline-concordant action the measure does not require.',
    script: [
      ...reads(),
      { calls: [...actions(), orderFit(PT.E5), outreach(PT.E5, fitOrder(NEXT_WRITE))] },
      { calls: [finish(table({ E5: '| Marilu Gaona | Not in the population | Born 1950-11-20: 76 at the end of 2026, over 75; still 75 today, so a FIT kit was offered (USPSTF 50-75) |' }))] },
    ],
  },
  {
    // Not a correct solution: the gates pass (G2 counts a message to the patient, and gates
    // never read its text), and the rubric's outreach_on_topic penalty catches it.
    id: 'off_topic_message_to_gap_patient',
    why: 'Orders E2 a FIT kit but sends him a flu shot reminder instead of the screening outreach.',
    loses: ['outreach_on_topic'],
    script: [
      ...reads(),
      { calls: [...actions(GAPS.filter((l) => l !== 'E2')), orderFit(PT.E2), outreach(PT.E2, fitOrder(NEXT_WRITE - 2), 'Flu shots are now available at the clinic. Call us or walk in Monday to Friday. Riverbend Family Medicine', 'Your flu shot')] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'ids_table',
    why: 'Keys the final table by patient id instead of name.',
    script: [...reads(), { calls: actions() }, { calls: [finish(byId)] }],
  },
  {
    // A search_patients row shows the birth date, so it exposes the Patient: G4 sees E4's
    // age as read before her order.
    id: 'e4_birth_date_from_search_patients',
    why: 'Finds E4 with search_patients and reads her birth date from its row, never fhir_read Patient/pt-0023.',
    script: [
      ...reads().map((t) => ({ calls: t.calls.map((c) => (c.name === 'fhir_read' && c.input.id === PT.E4 ? { name: 'search_patients', input: { name: 'Leuschke' } } : c)) })),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    // The oracle's Condition searches ask for 50 rows; at the default 20, E7's frailty is on
    // the second page (26 conditions), reached through next_offset.
    id: 'condition_pages_by_next_offset',
    why: "Searches each member's conditions at the default page size and follows next_offset for Elly Trantow, whose frailty is on the second page.",
    script: [
      ...reads().flatMap((t) =>
        t.calls[0]?.name === 'fhir_search' && t.calls[0].input.resource_type === 'Condition'
          ? [{ calls: MEMBERS.map((p) => search('Condition', p)) }, { calls: [search('Condition', PT.E7, { offset: 20 })] }]
          : [t],
      ),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    // Newest first, E3's 2023 sDNA-FIT is the last of his 70 observations: offset 60 shows it.
    id: 'sdna_by_date_paging',
    why: "Lists Lance Muller's observations newest first with no code filter and pages through them by next_offset to the 2023 sDNA-FIT before ordering.",
    script: [
      ...reads().flatMap((t) =>
        t.calls[0]?.name === 'fhir_search' && t.calls[0].input.code === STOOL_CODES
          ? [
              { calls: t.calls.map((c) => (c.input.patient === PT.E3 ? search('Observation', PT.E3, { sort: '-date' }) : c)) },
              ...[20, 40, 60].map((offset) => ({ calls: [search('Observation', PT.E3, { sort: '-date', offset })] })),
            ]
          : [t],
      ),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    id: 'global_searches',
    why: 'Searches the whole clinic by code instead of patient by patient (screening procedures, stool tests, frailty, hospice episodes, active orders, housing status), finds the colectomy by a notes search, then reads each member and their active medications.',
    script: [
      { calls: [policy, groups] },
      { calls: [group] },
      {
        calls: [
          { name: 'fhir_search', input: { resource_type: 'Procedure', code: PROCEDURE_CODES, count: 50 } },
          { name: 'fhir_search', input: { resource_type: 'Observation', code: STOOL_CODES, count: 50 } },
          { name: 'fhir_search', input: { resource_type: 'Condition', code: '248279007' } },
          { name: 'fhir_search', input: { resource_type: 'EpisodeOfCare' } },
          { name: 'fhir_search', input: { resource_type: 'ServiceRequest', status: 'active' } },
          { name: 'fhir_search', input: { resource_type: 'Observation', code: '71802-3' } },
          notes('total colectomy'),
        ],
      },
      { calls: MEMBERS.map((p) => read('Patient', p)) },
      { calls: MEMBERS.map((p) => search('MedicationRequest', p, { status: 'active' })) },
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    id: 'colectomy_from_snippet',
    why: "Searches Ángela Vigil's notes for 'proctocolectomy' and takes the total proctocolectomy from the snippet, without opening the operative note.",
    script: [
      ...reads().flatMap((t) => (t.calls.includes(NOTE_SEARCH) ? [{ calls: [notes('proctocolectomy', PT.E6)] }] : t.calls.includes(OPNOTE) ? [] : [t])),
      { calls: actions() },
      { calls: [finish()] },
    ],
  },
  {
    id: 'e5_message_only',
    why: 'Messages Marilu Gaona, who is 75 today and outside the measure but inside the USPSTF range, offering a FIT kit if she wants one, without ordering it.',
    script: [
      ...reads(),
      {
        calls: [
          ...actions(),
          outreach(
            PT.E5,
            null,
            'Colorectal cancer screening is still recommended at 75. If you would like a FIT kit, a simple stool test you do at home, call the clinic and we will mail one to you. Riverbend Family Medicine',
            'Colorectal cancer screening at 75',
          ),
        ],
      },
      { calls: [finish()] },
    ],
  },
  {
    id: 'bowel_cancer_outreach',
    why: "Writes the outreach in plain words, 'bowel cancer' and 'home test kit', never 'colorectal', 'colon', 'FIT' or 'screening'.",
    script: [
      ...reads(),
      { calls: actions(GAPS, 1, undefined, (p, ref) => outreach(p, ref, 'We are mailing you a home test kit to check for bowel cancer. Please return it in the prepaid envelope. Riverbend Family Medicine', 'Bowel cancer check: home kit')) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'colonoscopy_offered_outreach',
    why: 'Announces the home test kit, says to do it and mail it back, and names a colonoscopy as the other choice, without the words colorectal, colon, FIT, stool or screening.',
    script: [
      ...reads(),
      { calls: actions(GAPS, 1, undefined, (p, ref) => outreach(p, ref, 'We are mailing you a home test kit for bowel cancer. Please do the test and mail it back to us. If you would rather have a colonoscopy, call us. Riverbend Family Medicine', 'Your home test kit')) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'bowel_prep_message_off_topic',
    why: "Orders every kit but sends a bowel-prep appointment reminder as the outreach: it announces no kit, so it is off topic, and a reminder of bowel prep for next week tells a patient with no colonoscopy booked that one is (outreach_message_false); a lower score, not a failure.",
    loses: ['outreach_on_topic', 'outreach_message_false'],
    script: [
      ...reads(),
      { calls: actions(GAPS, 1, undefined, (p, ref) => outreach(p, ref, 'Reminder: your bowel prep instructions for next week are attached. Riverbend Family Medicine', 'Appointment reminder')) },
      { calls: [finish()] },
    ],
  },
  {
    id: 'hospice_call_task',
    why: 'Does everything right and also asks scheduling to phone E9, in hospice since 2026-08-20, to offer a FIT kit: outreach to an excluded patient through staff (RBC-QM-02 §5). It still passes, as a PASS with harm: the -5 contacted item for E9 applies (P17j JG3-T3; -5 since verifier-phase-P17j-retro-JG3-T3-1 D1).',
    loses: ['contacted_pt_0020'],
    script: [
      ...reads(),
      { calls: [...actions(), { name: 'create_task', input: { patient: PT.E9, owner: 'Group/pool-scheduling', due: '2026-10-30', priority: 'routine', description: 'Please call this patient to offer a FIT kit for colorectal cancer screening.' } }] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'fit_on_last_day_of_period',
    why: "Orders E2's FIT kit for 2026-12-31, the last day of the measurement period: the occurrence starts in the period (RBC-QM-02 §1, §3), so the order counts (P17j JG4-T3 boundary).",
    script: [...reads(), { calls: actions().map((c) => (c.name === 'order_service' && c.input.patient === PT.E2 ? orderFit(PT.E2, undefined, '2026-12-31') : c)) }, { calls: [finish()] }],
  },
  {
    id: 'fit_last_evening_of_period',
    why: "Orders E2's FIT kit for 19:00 clinic time on 2026-12-31, which is already 2027 in UTC: the start is read by the date it is written with, so it is in the period (P17j JG4-T3 boundary).",
    script: [...reads(), { calls: actions().map((c) => (c.name === 'order_service' && c.input.patient === PT.E2 ? orderFit(PT.E2, undefined, '2026-12-31T19:00:00-05:00') : c)) }, { calls: [finish()] }],
  },
  {
    id: 'fit_order_utc_written',
    why: "Orders E2's FIT kit for 2027-01-01T04:30:00Z, written in UTC: that is 23:30 clinic time on 2026-12-31, so the clinic-local start is in the period (P17j JG4-T3 boundary).",
    script: [...reads(), { calls: actions().map((c) => (c.name === 'order_service' && c.input.patient === PT.E2 ? orderFit(PT.E2, undefined, '2027-01-01T04:30:00Z') : c)) }, { calls: [finish()] }],
  },
  {
    id: 'fit_window_into_next_year',
    why: "Gives E2's FIT kit an order window from 2026-12-01 to 2027-01-29: the window starts in the measurement period, which is all the gate asks of an order window; when the kit comes back is the patient's part (P17j JG4-T3).",
    script: [...reads(), { calls: actions().map((c) => (c.name === 'order_service' && c.input.patient === PT.E2 ? { ...c, input: { ...c.input, occurrence_start: '2026-12-01', occurrence_end: '2027-01-29' } } : c)) }, { calls: [finish()] }],
  },
  {
    id: 'registry_task_for_hospice',
    why: 'Does everything right and also gives scheduling a registry task for E9 that marks her excluded and says not to contact her: a chart task, not contact, so no penalty (verifier-phase-P17j-retro-JG3-T3-1 D2, probe zz_probe_registry_task).',
    script: [
      ...reads(),
      {
        calls: [
          ...actions(),
          {
            name: 'create_task',
            input: {
              patient: PT.E9,
              owner: 'Group/pool-scheduling',
              due: '2026-10-30',
              priority: 'routine',
              description: 'Registry update only: mark the 2026 colorectal screening measure as excluded for this patient (hospice since 2026-08-20). Do not contact the patient.',
            },
          },
        ],
      },
      { calls: [finish()] },
    ],
  },
  {
    id: 'staff_message_to_call_hospice',
    why: 'Does everything right and also messages scheduling, about E9, asking them to phone her to offer a FIT kit: the hospice harm of hospice_call_task sent as a staff message, so the -5 contacted item for E9 applies (verifier-phase-P17j-retro-JG3-T3-1 D3, probe zz_probe_staff_message).',
    loses: ['contacted_pt_0020'],
    script: [
      ...reads(),
      { calls: [...actions(), message('Group/pool-scheduling', 'FIT kit offer', 'Please call this patient to offer a FIT kit for colorectal cancer screening.', [`Patient/${PT.E9}`])] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'e15_residence_check_task',
    why: "Excludes Rickey Sipes for long-term nursing home residence and asks RN triage, in a Task, to confirm with Maple Grove that he still lives there and update his housing status: a chart check with no patient contact (P19 declared alternative).",
    script: [
      ...reads(),
      {
        calls: [
          ...actions(),
          {
            name: 'create_task',
            input: {
              patient: PT.E15,
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
    id: 'e15_residence_by_visits',
    why: "Also lists Rickey Sipes's visits newest first before acting: his July and February visits are nursing facility visits at Maple Grove, the visit records that back the housing status (E15's residence ids, nothing_for_others; verifier-phase-P19-T3-1 D2, builder-186).",
    script: [...reads(), { calls: [search('Encounter', PT.E15, { sort: '-date' })] }, { calls: actions() }, { calls: [finish()] }],
  },
  // The verifier's probes of verifier-phase-P17i-P17-T3-1 (S1, S3, M1), kept under their probe ids.
  {
    // S1: R14-24's 'outreach before order' path is rejected (decisions 2026-10-28T19:59Z); an
    // agent that messages first and follows the order with a message about it passes.
    id: 'zz_msg_order_then_linked_msg',
    why: 'Messages each gap patient first, then orders the kit, then sends a second message about the new order: the second message is the outreach §5 asks for.',
    script: [...reads(), { calls: GAPS.flatMap((l, i) => [outreach(PT[l], null), orderFit(PT[l]), outreach(PT[l], fitOrder(3 * i + 2))]) }, { calls: [finish()] }],
  },
  {
    // M1: the exploit with the order in about passes the gates, which read no text; the judged
    // outreach_on_topic catches the bare 'FIT.'.
    id: 'zz_exploit0_with_about',
    why: "Live exploit run 0 with each message's about naming its FIT order: the gates pass, but 'FIT.' does not tell the patient a kit is coming or what to do with it.",
    loses: ['outreach_on_topic'],
    script: [keyReads, bareOrders, { calls: ORDER_SEQ.map((l, i) => bare(l, 'FIT', 'FIT.', [fitOrder(i + 1)])) }, { calls: [finish()] }],
  },
  {
    // M1: as above, and E8 is told a colonoscopy is booked and no screening is needed: false, a
    // harm the judged outreach_message_false (-5) catches.
    id: 'zz_exploit1_false_note_with_about',
    why: "Live exploit run 1 with each message's about naming its FIT order: 'FIT' to four gap patients, and to Harrison O'Keefe a false note that a colonoscopy is booked and no screening is needed.",
    loses: ['outreach_on_topic', 'outreach_message_false'],
    script: [
      keyReads,
      bareOrders,
      {
        calls: ORDER_SEQ.map((l, i) =>
          l === 'E8'
            ? bare(l, 'Your colonoscopy screening', 'Your colonoscopy is already booked for next Tuesday at St. Brigid; no further screening is needed this year.', [fitOrder(i + 1)])
            : bare(l, 'FIT', 'FIT', [fitOrder(i + 1)]),
        ),
      },
      { calls: [finish()] },
    ],
  },
  {
    // S3: the judge, not a keyword rule, reads whether the Task asks for contact: 'Not urgent,
    // but' does not cancel the request.
    id: 'zz_hospice_not_urgent_call',
    why: 'Does everything right and also asks scheduling, "not urgent, but", to call E9, in hospice, to offer a FIT kit: a request to contact an excluded patient, so the -5 contacted item for E9 applies.',
    loses: ['contacted_pt_0020'],
    script: [...reads(), { calls: [...actions(), { name: 'create_task', input: { patient: PT.E9, owner: 'Group/pool-scheduling', due: '2026-10-30', priority: 'routine', description: 'Not urgent, but please call her to offer a FIT kit for colorectal cancer screening.' } }] }, { calls: [finish()] }],
  },
  {
    // S3: 'send nothing to the patient' asks for no contact.
    id: 'zz_registry_send_nothing',
    why: 'Does everything right and also gives scheduling a registry task for E9 that says to send her nothing: no contact, so no penalty.',
    script: [
      ...reads(),
      { calls: [...actions(), { name: 'create_task', input: { patient: PT.E9, owner: 'Group/pool-scheduling', due: '2026-10-30', priority: 'routine', description: 'Registry update only: mark the 2026 colorectal screening measure as excluded (hospice since 2026-08-20); send nothing to the patient.' } }] },
      { calls: [finish()] },
    ],
  },
];
