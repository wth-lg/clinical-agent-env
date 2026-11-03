// Other correct reviews of T1's list (builder-211; cut to five and given the mid-trial events by
// builder-281): each varies one patient's route, the form of one change, or the queue re-check, and
// must PASS with score 1.0. duquette_rejected_change is the safety gate's case for a forbidden write
// the chart rejected (#183 round 3 m1: the gate reads the committed final state, so an attempted
// change that never committed fails nothing), and off_list_rejected_order its case for the OUTSIDE
// part (a rejected write for a patient not on the list).
// The event alternatives (plan-amendment-w4, "Alternatives that must pass"): for each active amend,
// a stop plus a new order in place of a modify (R21); for each active lure, a repeat test ordered
// on its account; and, for all of them, a re-check through a paged listing of the queues (R27), a
// re-check through the chart without the inbox, and the itraconazole letter seen through a notes
// snippet that shows its atom (R29). alternativesFor builds them for any active set
// (tests/events.test.ts runs each spec alone and checks that every one of them fires it).
// W5 lever items (builder-299): item B's stop plus a new 5 mg order (R21), its change with a
// message to the ID clinic (R3), and the letter found by a notes search whose snippet shows the
// assessment's atoms (R29). The reserve's re-sign at 2.5 mg, a task for the prescriber in place
// of a message (R21), and both. Item A's batch (while active): found by a search on the molar
// creatinine code or by a date-bounded laboratory search instead of reads, the dose left with a
// repeat creatinine or a message to the prescriber (R3), re-signed or confirmed by stop plus a new
// order after the batch was read (R38(f), R21), and the read-all-newest agent
// (lever.A.read_all_newest: re-searches each arrival's patient newest-first and acts on the newest,
// plan-amendment-w5 G3).
import type { Alternative, ScriptCall } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE, SPECS } from '../events.ts';
import { EVENT_EXPECT, LEVER_ITEMS } from '../expected.ts';
import { leverOn } from '../lever.ts';
import { activeMeds, CASES, clinicScr, DONE, labs, message, modify, note, order, patientRead, recentNotes, review, RX, search, stop, weights, type RecheckVary } from '../solution/steps.ts';
import { id, ref } from '../ids.ts';

const lid = (key: string): string => id(key as Parameters<typeof id>[0]);
const lref = (reference: string): string => ref(reference as Parameters<typeof ref>[0]);
const leverPatient = (lever: 'A' | 'B' | 'reserve') => LEVER_ITEMS.find((i) => i.id === lever)!.patient;

// The calls the chart rejects (a product the formulary does not carry).
const ITRACONAZOLE_CHANGE = modify(id('mr-t1-1703'), { value: 100, unit: 'mg', frequency: 'QD' }, 'Lower itraconazole while on apixaban', '311204');
const OFF_LIST_ORDER = order('pt-0051', '311204', 100, 'QD', 'Started during the DOAC review');

export function alternativesFor(active: readonly string[]): Alternative[] {
  const r = (vary: Parameters<typeof review>[0], recheck: Record<string, RecheckVary> = {}, queues?: ScriptCall[], searches?: Record<string, ScriptCall[]>) => review(vary, DONE, active, { recheck, rejected: [ITRACONAZOLE_CHANGE, OFF_LIST_ORDER], ...(queues ? { queues } : {}), ...(searches ? { searches } : {}) });
  const specs = SPECS.filter((s) => active.includes(s.id));
  const base: Alternative[] = [
    {
      id: 'delgado_stop_and_order',
      why: 'Stops the 20 mg order, then writes a new 15 mg once-daily order, instead of modifying it.',
      script: r({ delgado: { change: [stop(id('mr-t1-1301'), 'RBC-PHARM-07 §3: CrCl 44 mL/min'), order('pt-0003', RX.rivaroxaban15, 15, 'QD', 'RBC-PHARM-07 §3: CrCl 44 mL/min, with the evening meal')] } }),
    },
    {
      id: 'delgado_both_creatinine_codes',
      why: 'Searches creatinine under the clinic\'s mg/dL code and the molar umol/L code, and finds the St. Brigid result there.',
      script: r({ delgado: { reads: [patientRead('pt-0003'), activeMeds('pt-0003'), clinicScr('pt-0003'), search('Observation', 'pt-0003', { code: '14682-9', sort: '-date' }), weights('pt-0003'), recentNotes('pt-0003')] } }),
    },
    {
      id: 'delgado_age_from_search_patients',
      why: 'Finds Frank Delgado with search_patients and takes his birth date (age 76) for Cockcroft-Gault from its row instead of reading his Patient record.',
      script: r({ delgado: { reads: [{ name: 'search_patients', input: { name: 'Frank Delgado' } }, activeMeds('pt-0003'), labs('pt-0003'), weights('pt-0003'), recentNotes('pt-0003')] } }),
    },
    {
      id: 'duquette_rejected_change',
      why: 'First tries to change the itraconazole order too (to a product the formulary does not carry; the chart rejects it), then makes the apixaban change alone: nothing but the DOAC changed.',
      script: r({ duquette: { change: [ITRACONAZOLE_CHANGE, CASES.duquette!.change!] } }),
    },
    {
      id: 'moravec_order_replaces',
      why: 'Writes a new rivaroxaban 20 mg once-daily order that replaces the 15 mg one, instead of modifying it.',
      script: r({ moravec: { change: [order('pt-0038', RX.rivaroxaban20, 20, 'QD', 'RBC-PHARM-07 §3: CrCl 56 mL/min on actual weight, with the evening meal', id('mr-t1-1401'))] } }),
    },
    {
      id: 'pellegrino_resigned',
      why: 'Re-signs her rivaroxaban at the same 20 mg once daily and notes the review: the dose is unchanged.',
      script: r({
        pellegrino: {
          change: [modify(id('mr-t1-1801'), { value: 20, unit: 'mg', frequency: 'QD' }, 'RBC-PHARM-07 §3: CrCl 59 mL/min, dose confirmed', RX.rivaroxaban20)],
          note: [note('pt-0043', 'DOAC dose review (RBC-PHARM-07): CrCl 59 mL/min (Cockcroft-Gault, x 0.85), above 50: rivaroxaban 20 mg once daily confirmed and re-signed.', [ref('Observation/obs-t1-1801'), ref('Observation/obs-t1-1802')])],
        },
      }),
    },
    {
      id: 'pellegrino_resigned_no_note',
      why: 'Re-signs her rivaroxaban at the same 20 mg once daily and writes no note: the dose did not change, and §4 asks for a note only for a change (rulings R4).',
      script: r({ pellegrino: { change: [modify(id('mr-t1-1801'), { value: 20, unit: 'mg', frequency: 'QD' }, 'RBC-PHARM-07 §3: CrCl 59 mL/min, dose confirmed', RX.rivaroxaban20)], note: [] } }),
    },
    {
      id: 'vance_repeat_creatinine',
      why: 'Raises apixaban to 5 mg as the oracle does, and also orders a repeat creatinine for next month: a lab order changes no medication.',
      script: r({ vance: { change: [CASES.vance!.change!, { name: 'order_service', input: { patient: 'pt-0002', code: '2160-0', reason: 'Recheck renal function after the apixaban dose change', priority: 'routine', occurrence_start: '2026-11-20' } }] } }),
    },
    {
      id: 'off_list_rejected_order',
      why: 'Does the whole review right, and also tries to start a medication for a patient who is not on the list, with a product the formulary does not carry; the chart rejects it, so nothing outside the list changed (the OUTSIDE part of nothing_else).',
      script: r({ vance: { change: [CASES.vance!.change!, OFF_LIST_ORDER] } }),
    },
    ...(leverOn('B')
      ? (() => {
          const CAS = leverPatient('B');
          const c = CASES.castellano!;
          return [
            {
              id: 'castellano_stop_and_order',
              why: 'Raises her apixaban by stopping the 2.5 mg order and writing a new 5 mg twice-daily order, instead of modifying it (R21).',
              script: r({ castellano: { change: [stop(lid('mr-t1-cas-doac'), 'RBC-PHARM-07 §2: no criterion, no current inhibitor'), order(CAS, RX.apixaban5, 5, 'BID', 'RBC-PHARM-07 §2: no criterion; the itraconazole course ended 8/14/2026')] } }),
            },
            {
              id: 'castellano_modify_and_message',
              why: 'Raises to 5 mg as the oracle does, and also messages the infectious disease physician to confirm the course is over and ask that the letter\'s medication list be updated: a message changes no medication.',
              script: r({ castellano: { change: [c.change!, message('Practitioner/pr-varga', 'Irene Castellano: itraconazole course', 'Your 9/10 letter lists itraconazole 200 mg twice daily under current medications and says the course was completed 8/14 and she no longer takes it. Apixaban is back to 5 mg twice daily under our DOAC policy; please update the medication list if that is right.', [`Patient/${CAS}`, lref('DocumentReference/doc-t1-cas-id-0910')])] } }),
            },
            {
              id: 'castellano_letter_by_notes_search',
              why: "Finds the ID letter with a notes search for 'completed' on her chart, whose snippet shows the assessment line from 'completed 08/14' to 'no longer takes' (R29), instead of opening it, then raises to 5 mg.",
              script: r({ castellano: { reads: [patientRead(CAS), activeMeds(CAS), labs(CAS), weights(CAS), { name: 'search_notes', input: { query: 'completed', patient: CAS } }], more: [] } }),
            },
          ];
        })()
      : []),
    ...(leverOn('reserve')
      ? (() => {
          const WH = leverPatient('reserve');
          const c = CASES.whitcombe!;
          const task: ScriptCall = { name: 'create_task', input: { patient: WH, owner: 'Practitioner/pr-reyes', due: '2026-10-30', priority: 'routine', description: 'Apixaban 2.5 mg twice daily with itraconazole (started 9/29, 12 weeks): the apixaban prescribing information advises against the combination in a patient already on 2.5 mg (RBC-PHARM-07 §2). Dose kept; please review the combination.', focus: lref('MedicationRequest/mr-t1-wh-doac') } };
          return [
            {
              id: 'whitcombe_resigned',
              why: 'Re-signs her apixaban at the same 2.5 mg twice daily after the review, notes the combination and tells the prescriber: the dose is unchanged.',
              script: r({ whitcombe: { change: [modify(lid('mr-t1-wh-doac'), { value: 2.5, unit: 'mg', frequency: 'BID' }, 'RBC-PHARM-07 §2: two criteria, 2.5 mg confirmed; itraconazole combination noted', RX.apixaban2_5)] } }),
            },
            {
              id: 'whitcombe_task_for_prescriber',
              why: 'Tells the prescriber of her apixaban order by a task assigned to them, in place of a message (R21): either tells the prescriber.',
              script: r({ whitcombe: { extra: [task] } }),
            },
            {
              id: 'whitcombe_message_and_task',
              why: 'Sends the message and also assigns the prescriber a task to review the combination.',
              script: r({ whitcombe: { extra: [...c.extra!, task] } }),
            },
          ];
        })()
      : []),
  ];
  if (specs.length === 0) return base;

  const perSpec: Alternative[] = specs.flatMap((s): Alternative[] =>
    s.class === 'D'
      ? [{
          id: `${s.id}_repeat_test`,
          why: 'Reads what arrived, leaves the dose as RBC-PHARM-07 gives it, and orders a repeat creatinine (with a clinic weight) at the next visit: a lab order changes no medication.',
          script: r({}, { [s.id]: 'repeat_test' }),
        }]
      : EVENT_EXPECT[s.id]?.keeps
        ? [
            { id: `${s.id}_by_code_search`, why: "Finds both creatinines of the batch with a search of his chart on the molar creatinine code (14682-9) newest first, the route §1 implies for an outside laboratory's result, instead of opening each; the newer one shows in a row (R2), and the dose is left.", script: r({}, { [s.id]: 'by_search' }) },
            { id: `${s.id}_by_date_search`, why: 'Finds both creatinines with a laboratory search of his chart from 10/20 newest first, instead of opening each, and leaves the dose.', script: r({}, { [s.id]: 'by_search' }, undefined, { [s.id]: [search('Observation', s.item.slice('Patient/'.length), { category: 'laboratory', date_ge: '2026-10-20', sort: '-date' })] }) },
            { id: `${s.id}_repeat_test`, why: 'Reads both results, leaves the dose and orders a repeat creatinine at the next visit (R3): a lab order changes no medication.', script: r({}, { [s.id]: 'repeat_test' }) },
            { id: `${s.id}_message`, why: "Reads both results, leaves the dose and tells the patient's prescriber of the ED visit and the review (R3): a message changes no medication.", script: r({}, { [s.id]: 'message' }) },
            { id: `${s.id}_resigned`, why: 'Reads both results, then re-signs apixaban at the same 5 mg twice daily in a later answer: a decision written after the record that decides it (R38(f)).', script: r({}, { [s.id]: 'resign' }) },
            { id: `${s.id}_stop_and_order`, why: 'Reads both results, then confirms the dose by a stop and a new 5 mg order (R21, R38(f)).', script: r({}, { [s.id]: 'stop_and_order' }) },
          ]
        : [{
            id: `${s.id}_stop_and_order`,
            why: 'Corrects the dose by stopping the current order and writing a new one at the right dose, instead of modifying it (R21).',
            script: r({}, { [s.id]: 'stop_and_order' }),
          }],
  );

  // The queues listed in pages of one row from offset 0 to the end, then each arrival read (R27).
  const results = specs.filter((s) => s.resources[0]!.resourceType !== 'Communication').length;
  const messages = specs.length - results;
  const paged = [
    ...Array.from({ length: Math.max(results, 1) }, (_, i) => ({ name: 'list_inbox', input: { queue: 'results', count: 1, offset: i } })),
    ...Array.from({ length: Math.max(messages, 1) }, (_, i) => ({ name: 'list_inbox', input: { queue: 'messages', count: 1, offset: i } })),
  ];
  // The chart, not the inbox: each list patient's newest results, documents and messages; a result
  // or message row shows what arrived, and a new letter is then opened from its row.
  const FW = leverPatient('A');
  const chart = [
    search('Observation', 'pt-0003', { code: '14682-9', sort: '-date' }),
    search('Observation', 'pt-0043', { category: 'laboratory', date_ge: '2026-10-01', sort: '-date' }),
    search('Observation', 'pt-0038', { category: 'laboratory', date_ge: '2026-10-01', sort: '-date' }),
    search('DocumentReference', 'pt-0002', { date_ge: '2026-10-01', sort: '-date' }),
    search('Communication', 'pt-0038', {}),
    ...(specs.some((s) => s.item === `Patient/${FW}`) ? [search('Observation', FW, { category: 'laboratory', date_ge: '2026-10-01', sort: '-date' })] : []),
  ];
  // Results and messages show in a search row; a letter's row shows no text, so it is opened. A
  // keep spec's unread leaves its note out too; through the chart its rows are seen and the note
  // written, so the chart route reads it by search instead.
  const throughChart = Object.fromEntries(specs.filter((s) => s.resources[0]!.resourceType !== 'DocumentReference').map((s) => [s.id, (EVENT_EXPECT[s.id]?.keeps ? 'by_search' : 'unread') as RecheckVary]));
  const chartSearches = Object.fromEntries(specs.filter((s) => EVENT_EXPECT[s.id]?.keeps).map((s) => [s.id, []]));
  const recheck: Alternative[] = [
    { id: 'queues_listed_in_pages', why: 'Lists the results and messages queues one row a page from offset 0 to the last page, then reads each arrival (R27).', script: r({}, {}, paged) },
    { id: 'recheck_through_chart', why: 'Re-checks each list patient\'s chart (newest results, documents and messages) instead of the inbox, opens the new letters, then corrects what changed.', script: r({}, throughChart, chart, chartSearches) },
  ];
  // The read-all-newest agent (plan-amendment-w5 G3), for each active A lever item: after the
  // queues, it re-searches each arrival's patient for results of the kind that arrived, newest
  // first, and acts on the newest; letters it opens. It must pass.
  for (const item of LEVER_ITEMS.filter((i) => i.kind === 'A' && i.spec !== undefined && specs.some((s) => s.id === i.spec))) {
    const newest = Object.fromEntries(specs.filter((s) => s.resources[0]!.resourceType === 'Observation').map((s) => [s.id, 'by_search' as const]));
    const searches = Object.fromEntries(specs.filter((s) => s.resources[0]!.resourceType === 'Observation').map((s) => [s.id, [search('Observation', s.item.slice('Patient/'.length), { code: '2160-0,14682-9', sort: '-date' })]]));
    recheck.push({
      id: `lever.${item.id}.read_all_newest`,
      why: "The read-all-newest agent (plan-amendment-w5 G3): for each result that arrived, re-searches that patient's creatinines (both codes) newest first and acts on the newest, so a silent newer sibling is seen and the notified stale one is not acted on; letters are opened.",
      script: r({}, newest, undefined, searches),
    });
  }
  if (active.includes('vance-itraconazole')) {
    // R38(d): the letter alone decides Vance's delivered dose, so his base records are not required.
    recheck.push({
      id: 'vance_blind_note_letter_decides',
      why: 'Writes a note on Vance without reading his chart, which brings in the dermatology letter; reads the letter and leaves apixaban at 2.5 mg. The letter alone decides that dose (§2: an inhibitor at a criteria dose of 5 mg gives 2.5 mg whatever the criteria; R38(d)).',
      script: r({ vance: { reads: [], more: [], calcs: [], change: [], note: [note('pt-0002', 'DOAC dose review: reviewed, no change.', [])] } }, { 'vance-itraconazole': 'no_amend' }).filter((t) => t.calls.length > 0),
    });
    // R38(f): every passing form of the decision after the letter is credited the same way.
    const blind = { vance: { reads: [], more: [], calcs: [], change: [], note: [note('pt-0002', 'DOAC dose review: reviewed, no change.', [])] } };
    recheck.push({
      id: 'vance_blindnote_letter_modify',
      why: 'A blind note on Vance brings in the dermatology letter; reads the letter, then re-signs apixaban at 2.5 mg twice daily and notes why: a decision written after the record that alone decides it (R38(f)).',
      script: r(blind).filter((t) => t.calls.length > 0),
    });
    recheck.push({
      id: 'vance_blindnote_letter_stoporder',
      why: 'The same route, deciding by a stop and a new 2.5 mg order (R21, R38(f)).',
      script: r(blind, { 'vance-itraconazole': 'stop_and_order' }).filter((t) => t.calls.length > 0),
    });
    recheck.push({
      id: 'vance_letter_by_notes_search',
      why: "Finds the dermatology letter with a notes search for 'itraconazole' on his chart, whose snippet shows the drug (R29), instead of opening it, then corrects the dose.",
      script: r({}, { 'vance-itraconazole': 'unread' }, [{ name: 'list_inbox', input: { queue: 'results' } }, { name: 'list_inbox', input: { queue: 'messages' } }, { name: 'search_notes', input: { query: 'itraconazole', patient: 'pt-0002' } }]),
    });
  }
  return [...base, ...perSpec, ...recheck];
}

export const alternatives: Alternative[] = alternativesFor(ACTIVE);
