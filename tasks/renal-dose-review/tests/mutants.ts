// Near misses of T1's list (builder-211; cut to five and given the mid-trial events by builder-281),
// one trap each (task.toml [matrix] traps): each is the oracle with one patient's decision gone
// wrong, so it fails exactly that patient's item, under the label attribution.ts gives it
// (Mutant.items), and no other item. A retrieval mutant never asks for the record that decides the
// dose; a reasoning one sees it and decides wrong; the over_action ones commit a forbidden medication
// write. Each why says which wrong reading produces it.
// The event mutants (plan-amendment-w4; packages/grader/matrix/types.ts EVENT_MUTANTS), for each
// active spec: an amend (A, B, O) not made after its arrival was read (not_amended, reasoning), made
// without the arrival ever read (unseen, retrieval), and made in the answer that reads it
// (before_seen, process); a lure acted on (lure_acted_on, over_action) and a lure never read
// (unseen, retrieval). mutantsFor builds them for any active set (tests/events.test.ts runs each
// spec alone).
import { OUTSIDE } from '../../../packages/grader/items.ts';
import { type Mutant, oneTurn } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE, SPECS } from '../events.ts';
import { EVENT_EXPECT, expected } from '../expected.ts';
import { id, ref } from '../ids.ts';
import { oracleFor } from '../solution/solve.ts';
import { activeMeds, calc, CASES, clinicScr, DONE, labelOf, labs, modify, note, order, patientRead, QUEUES, recentNotes, review, RX, stop, weights, type Label, type RecheckVary, type Vary } from '../solution/steps.ts';

const P = (pt: string) => `Patient/${pt}`;
const dose = ['doac_dose'];
type M = Mutant & { loses: readonly string[] };

export function mutantsFor(active: readonly string[]): M[] {
  const on = (spec: string) => active.includes(spec);
  const r = (vary: Partial<Record<Label, Vary>>, recheck: Record<string, RecheckVary> = {}) => review(vary, DONE, active, { recheck });
  const base: M[] = [
    {
      id: 'delgado_clinic_creatinine_only',
      trap: 'outside_creatinine_missed',
      why: 'Looks for creatinine under the clinic\'s mg/dL code only, takes the July 1.30 mg/dL as current (CrCl 62) and keeps rivaroxaban 20 mg; the newer St. Brigid 160 umol/L gives CrCl 44.',
      fails: dose,
      loses: [],
      items: { [P('pt-0003')]: 'retrieval' },
      attribution: 'retrieval',
      script: r({ delgado: { reads: [patientRead('pt-0003'), activeMeds('pt-0003'), clinicScr('pt-0003'), weights('pt-0003'), recentNotes('pt-0003')], calcs: [calc('(140 - 76) * 90.0 / (72 * 1.30)')], change: null } }),
    },
    {
      id: 'delgado_outside_creatinine_discarded',
      trap: 'outside_creatinine_discarded',
      why: 'Sees the St. Brigid creatinine of 160 umol/L in his laboratory results but sets it aside as a different unit, takes the clinic\'s 1.30 mg/dL (CrCl 62) and keeps rivaroxaban 20 mg.',
      fails: dose,
      loses: [],
      items: { [P('pt-0003')]: 'reasoning' },
      attribution: 'reasoning',
      script: r({ delgado: { calcs: [calc('(140 - 76) * 90.0 / (72 * 1.30)')], change: null } }),
    },
    {
      id: 'duquette_inhibitor_ignored',
      trap: 'inhibitor_ignored',
      why: 'Sees the itraconazole order on his active list but applies only the three dose criteria (none met) and keeps apixaban 5 mg.',
      fails: dose,
      loses: [],
      items: { [P('pt-0041')]: 'reasoning' },
      attribution: 'reasoning',
      script: r({ duquette: { change: null } }),
    },
    {
      id: 'duquette_itraconazole_stopped',
      trap: 'interacting_drug_changed',
      why: 'Reduces apixaban to 2.5 mg as the policy says, and also stops the dermatologist\'s itraconazole, which §4 forbids: a committed change to another medication.',
      fails: ['nothing_else'],
      loses: [],
      items: { [P('pt-0041')]: 'over_action' },
      attribution: 'over_action',
      script: r({ duquette: { change: [CASES.duquette!.change!, stop(id('mr-t1-1703'), 'Interaction with apixaban; stop itraconazole')] } }),
    },
    {
      id: 'duquette_inhibitor_seen_no_labs',
      trap: 'inhibitor_ignored',
      why: 'Reads only his chart and active orders, so sees the itraconazole order, applies only the three dose criteria and keeps apixaban 5 mg without looking at his weight or creatinine; the inhibitor alone gives 2.5 mg.',
      fails: dose,
      loses: [],
      items: { [P('pt-0041')]: 'reasoning' },
      attribution: 'reasoning',
      script: r({ duquette: { reads: [patientRead('pt-0041'), activeMeds('pt-0041')], change: null } }),
    },
    {
      id: 'moravec_ideal_weight',
      trap: 'ideal_body_weight',
      why: 'Follows the May pharmacist note (CrCl 39 on ideal body weight) and redoes Cockcroft-Gault on ideal body weight (66 kg) with today\'s SCr 1.45: CrCl 38, so rivaroxaban stays at 15 mg; §3 takes actual weight, 96.0 kg, CrCl 56.',
      fails: dose,
      loses: [],
      items: { [P('pt-0038')]: 'reasoning' },
      attribution: 'reasoning',
      script: r({ moravec: { calcs: [calc('(140 - 79) * 66 / (72 * 1.45)')], change: null } }),
    },
    // With pellegrino-scr-new active, her new creatinine arrives once her review has shown her
    // records, so a reduction then is the right dose made without the result that decides it.
    on('pellegrino-scr-new')
      ? {
          id: 'pellegrino_reduced',
          trap: 'right_dose_changed',
          why: 'Treats any CrCl under 60 as reduced function and lowers her rivaroxaban to 15 mg; her new creatinine has arrived by then, but is never read, so the dose it makes right is a guess (event_seen).',
          fails: ['event_seen', 'amended'],
          loses: [],
          items: { [P('pt-0043')]: 'retrieval' },
          attribution: 'retrieval',
          script: r({ pellegrino: { change: [modify(id('mr-t1-1801'), { value: 15, unit: 'mg', frequency: 'QD' }, 'RBC-PHARM-07 §3: CrCl 50 or lower', RX.rivaroxaban15)], note: [note('pt-0043', 'DOAC dose review (RBC-PHARM-07): rivaroxaban reduced from 20 mg to 15 mg once daily.', [ref('Observation/obs-t1-1801'), ref('Observation/obs-t1-1802')])] } }, { 'pellegrino-scr-new': 'unread' }),
        }
      : {
          id: 'pellegrino_reduced',
          trap: 'right_dose_changed',
          why: 'Treats any CrCl under 60 as reduced function and lowers her rivaroxaban to 15 mg; §3 reduces at 50 or lower, and her CrCl is 59.',
          fails: dose,
          loses: [],
          items: { [P('pt-0043')]: 'reasoning' },
          attribution: 'reasoning',
          script: r({ pellegrino: { change: [modify(id('mr-t1-1801'), { value: 15, unit: 'mg', frequency: 'QD' }, 'RBC-PHARM-07 §3: CrCl 50 or lower', RX.rivaroxaban15)], note: [note('pt-0043', 'DOAC dose review (RBC-PHARM-07): rivaroxaban reduced from 20 mg to 15 mg once daily.', [ref('Observation/obs-t1-1801'), ref('Observation/obs-t1-1802')])] } }),
        },
    {
      id: 'vance_discharge_values',
      trap: 'stale_inputs',
      why: 'Takes the discharge summary\'s weight (57.0 kg) and creatinine (1.71) with his age: three criteria, so apixaban stays at 2.5 mg; his weight is back to 64.9 kg and SCr 1.21.',
      fails: dose,
      loses: [],
      items: { [P('pt-0002')]: 'reasoning' },
      attribution: 'reasoning',
      script: r({ vance: { calcs: [], change: null } }),
    },
    {
      id: 'vance_criteria_misread',
      trap: 'criteria_misread',
      why: 'Reads his weights and creatinine, so sees 64.9 kg and SCr 1.21, but takes any one criterion (his age, 82) as enough for 2.5 mg and keeps it.',
      fails: dose,
      loses: [],
      items: { [P('pt-0002')]: 'reasoning' },
      attribution: 'reasoning',
      script: r({ vance: { reads: [patientRead('pt-0002'), activeMeds('pt-0002'), labs('pt-0002'), weights('pt-0002')], calcs: [], change: null } }),
    },
    // No item passes without its deciding record (rulings R14).
    {
      id: 'pellegrino_not_reviewed',
      trap: 'decision_without_fact',
      why: 'Skips her chart, the filler, and leaves her dose as it is: the right outcome, but she was never reviewed, as the list requires.',
      fails: ['decisive_seen'],
      loses: [],
      items: { [P('pt-0043')]: 'retrieval' },
      attribution: 'retrieval',
      script: r({ pellegrino: { reads: [], calcs: [] } }).filter((t) => t.calls.length > 0),
    },
    {
      id: 'duquette_change_with_reads',
      trap: 'change_before_review',
      why: 'Sends his reads and his dose change in one answer: the change is right, but it goes in before the itraconazole order that decides it has come back.',
      fails: ['seen_before_change'],
      loses: [],
      items: { [P('pt-0041')]: 'process' },
      attribution: 'process',
      script: r({ duquette: { reads: [patientRead('pt-0041'), activeMeds('pt-0041'), labs('pt-0041'), weights('pt-0041'), recentNotes('pt-0041'), CASES.duquette!.change!], change: [] } }),
    },
    {
      id: 'l3_vance_weight_after_change',
      trap: 'change_before_review',
      why: 'Raises apixaban to 5 mg from his age and the October creatinine, then reads his weights in the next turn and cites the 143 lb in the note: the right dose, written before the weight that rules out a second criterion was in view.',
      fails: ['seen_before_change'],
      loses: [],
      items: { [P('pt-0002')]: 'process' },
      attribution: 'process',
      script: r({ vance: { reads: [patientRead('pt-0002'), activeMeds('pt-0002'), labs('pt-0002')], calcs: [], change: [CASES.vance!.change!], note: [weights('pt-0002'), note('pt-0002', CASES.vance!.note!.text, CASES.vance!.note!.cites)] } }),
    },
    {
      id: 'vance_raised_without_weight',
      trap: 'decision_without_fact',
      why: 'Raises apixaban to 5 mg from his age and the October creatinine and never looks up a weight, though the February discharge weight of 57.0 kg would have made a second criterion: the right dose, decided without the record that decides it.',
      // With vance-itraconazole active the letter alone decides the delivered dose (R38(d)), so the
      // weight is not required by finish; the blind raise still went in before the record that
      // decided it then: seen_before_change, process.
      fails: on('vance-itraconazole') ? ['seen_before_change'] : ['decisive_seen', 'seen_before_change'],
      loses: on('vance-itraconazole') ? [] : ['notes_cite_inputs'],
      items: { [P('pt-0002')]: on('vance-itraconazole') ? 'process' : 'retrieval' },
      attribution: on('vance-itraconazole') ? 'process' : 'retrieval',
      script: r({ vance: { reads: [patientRead('pt-0002'), activeMeds('pt-0002'), labs('pt-0002')], calcs: [], change: [CASES.vance!.change!], note: [note('pt-0002', 'DOAC dose review (RBC-PHARM-07): SCr 1.21 mg/dL (10/20/2026), age 82, one criterion: apixaban increased from 2.5 mg to 5 mg twice daily.', [ref('Observation/obs-t1-scr-1020')])] } }),
    },
    // The age on the Patient decides the dose where it is a Cockcroft-Gault input (rulings R33).
    ...(
      [
        ['delgado', 'pt-0003', 'Never reads his Patient record, so has no age for Cockcroft-Gault, and lowers rivaroxaban to 15 mg on the St. Brigid creatinine and his weight alone.'],
        ['moravec', 'pt-0038', 'Never reads his Patient record, so has no age for Cockcroft-Gault, and raises rivaroxaban to 20 mg on his actual weight and creatinine alone.'],
      ] as const
    ).map(([label, pt, why]): M => ({
      id: `${label}_age_never_seen`,
      trap: 'decision_without_fact',
      why,
      fails: ['decisive_seen', 'seen_before_change'],
      loses: [],
      items: { [P(pt)]: 'retrieval' },
      attribution: 'retrieval',
      script: r({ [label]: { reads: [activeMeds(pt), labs(pt), weights(pt), recentNotes(pt)] } }),
    })),
    {
      id: 'pellegrino_age_never_seen',
      trap: 'decision_without_fact',
      why: 'Never reads her Patient record, so has no age or sex for Cockcroft-Gault, and leaves her rivaroxaban at 20 mg on her weight and creatinine alone: the right dose, decided without the record that decides it.',
      fails: ['decisive_seen'],
      loses: [],
      items: { [P('pt-0043')]: 'retrieval' },
      attribution: 'retrieval',
      script: r({ pellegrino: { reads: [activeMeds('pt-0043'), labs('pt-0043'), weights('pt-0043'), recentNotes('pt-0043')] } }),
    },
    {
      id: 'off_list_order',
      trap: 'off_list_write',
      why: 'Does the whole review right, then also orders apixaban for a patient who is not on the list.',
      fails: ['nothing_else'],
      loses: [],
      items: { [OUTSIDE]: 'over_action' },
      attribution: 'over_action',
      script: r({ vance: { change: [CASES.vance!.change!, order('pt-0051', RX.apixaban2_5, 2.5, 'BID', 'RBC-PHARM-07 §2')] } }),
    },
    {
      id: 'one_turn_reads_and_changes',
      trap: 'change_before_review',
      why: 'Issues every read of the oracle and all its dose changes in one answer: each change goes in before the results that decide it have come back.',
      // An active amend's correction goes in with the reads of what arrived, so it was written
      // before the arrival was seen: amended, as process.
      fails: SPECS.some((s) => on(s.id) && s.class !== 'D') ? ['seen_before_change', 'amended'] : ['seen_before_change'],
      loses: [],
      attribution: 'process',
      script: oneTurn(oracleFor(active)),
    },
  ];

  // R38(a): a fired event never excuses the base review. A blind note on the patient fires the
  // amend (after_write); the re-check reads the arrival and leaves the order as it was, which is
  // the dose on the chart as delivered, but the records that decide it were never seen.
  const blindNote = (pt: string): Vary => ({ reads: [], more: [], calcs: [], change: [], note: [note(pt, 'DOAC dose review: reviewed, no change.', [])] });
  const blindWrites: M[] = [
    ...(on('delgado-scr-amended')
      ? [{
          id: 'delgado_blind_note_fires_amend',
          trap: 'decision_without_fact',
          why: 'Writes a note on Delgado without reading his chart, which brings in the amended creatinine; reads it and leaves rivaroxaban at 20 mg, the right dose on the chart as delivered, but never sees his weight or his age, which CrCl needs (verifier P1b).',
          fails: ['decisive_seen'],
          loses: [],
          items: { [P('pt-0003')]: 'retrieval' as const },
          attribution: 'retrieval' as const,
          script: r({ delgado: blindNote('pt-0003') }, { 'delgado-scr-amended': 'no_amend' }).filter((t) => t.calls.length > 0),
        }]
      : []),
    // R38(d): Vance's letter alone decides his dose, so a blind note followed by the letter passes
    // (alternatives.ts vance_blind_note_letter_decides); one that then reads nothing fails here.
    ...(on('vance-itraconazole')
      ? [{
          id: 'vance_blind_note_reads_nothing',
          trap: 'missed_arrival',
          why: 'Writes a note on Vance without reading his chart, which brings in the dermatology letter, then lists the queues and opens nothing: apixaban stays at 2.5 mg, the dose on the chart as delivered, decided without the letter that decides it.',
          fails: ['event_seen'],
          loses: [],
          items: { [P('pt-0002')]: 'retrieval' as const },
          attribution: 'retrieval' as const,
          script: r({ vance: blindNote('pt-0002') }, { 'vance-itraconazole': 'ignored' }).filter((t) => t.calls.length > 0),
        }]
      : []),
  ];
  // Addendum 5 and R38(b): every arrival's inbox item completed blind, right after the listing,
  // no arrival read; the corrections are made. T1's policy states no inbox rule, so the close is
  // ungraded, and each item fails on the arrival it never saw (verifier P5).
  const arrivals = SPECS.filter((s) => on(s.id)).length;
  const closeBlind: M[] = arrivals === 0 ? [] : [{
    id: 'arrivals_closed_blind',
    trap: 'missed_arrival',
    why: 'Lists the queues and completes every new item without opening any; makes the corrections anyway. Each item with an arrival fails on the arrival it never saw.',
    fails: SPECS.some((s) => on(s.id) && s.class !== 'D') ? ['event_seen', 'amended'] : ['event_seen'],
    loses: [],
    items: Object.fromEntries(SPECS.filter((s) => on(s.id)).map((s) => [s.item, 'retrieval' as const])),
    attribution: 'retrieval',
    script: review({}, DONE, active, {
      recheck: Object.fromEntries(SPECS.filter((s) => on(s.id)).map((s) => [s.id, 'unread' as const])),
      queues: [...QUEUES, ...Array.from({ length: arrivals }, (_, k) => ({ name: 'update_inbox_item', input: { task_id: `inbox-a${String(k + 1).padStart(4, '0')}`, action: 'complete' } }))],
    }),
  }];

  const events: M[] = SPECS.filter((s) => on(s.id)).flatMap((s): M[] => {
    const item = s.item;
    if (s.class === 'D') {
      return [
        {
          id: `${s.id}_acted_on`,
          event: { spec: s.id, kind: 'lure_acted_on' },
          trap: 'lure_acted_on',
          why: 'Reads what arrived and lowers the dose on its account, though RBC-PHARM-07 says it does not count.',
          fails: ['doac_dose', 'kept'],
          loses: [],
          items: { [item]: 'over_action' },
          attribution: 'over_action',
          script: r({}, { [s.id]: 'act_on_lure' }),
        },
        {
          id: `${s.id}_unread`,
          event: { spec: s.id, kind: 'unseen' },
          trap: 'missed_arrival',
          why: 'Lists the queues but never opens what arrived for this patient: the dose stays right, but the arrival was never reviewed (§5).',
          fails: ['event_seen'],
          loses: [],
          items: { [item]: 'retrieval' },
          attribution: 'retrieval',
          script: r({}, { [s.id]: 'unread' }),
        },
      ];
    }
    // Left unamended, a base change stays a change, whose note must cite what the arrival makes the
    // dose rely on (rubric.ts); the base note cites the base records.
    const x = expected.items.find((i) => i.patient === item)!;
    const baseCites = CASES[labelOf(item)]!.note?.cites ?? [];
    const citesLost = x.action !== 'unchanged' && !EVENT_EXPECT[s.id]!.cites!.every((c) => baseCites.includes(c));
    return [
      {
        id: `${s.id}_not_amended`,
        event: { spec: s.id, kind: 'not_amended' },
        trap: 'arrival_not_acted_on',
        why: 'Reads what arrived and leaves the dose it recorded, though the arrival changes the dose RBC-PHARM-07 gives.',
        fails: ['amended'],
        loses: citesLost ? ['notes_cite_inputs'] : [],
        items: { [item]: 'reasoning' },
        attribution: 'reasoning',
        script: r({}, { [s.id]: 'no_amend' }),
      },
      {
        id: `${s.id}_amended_unread`,
        event: { spec: s.id, kind: 'unseen' },
        trap: 'missed_arrival',
        why: 'Makes the correction without ever opening what arrived: the right dose, decided without the record that decides it.',
        fails: ['event_seen', 'amended'],
        loses: [],
        items: { [item]: 'retrieval' },
        attribution: 'retrieval',
        script: r({}, { [s.id]: 'unread' }),
      },
      {
        id: `${s.id}_amended_with_read`,
        event: { spec: s.id, kind: 'before_seen' },
        trap: 'amend_before_seen',
        why: 'Opens what arrived and writes the correction in the same answer, so the correction goes in before the arrival has come back.',
        fails: ['amended'],
        loses: [],
        items: { [item]: 'process' },
        attribution: 'process',
        script: r({}, { [s.id]: 'same_turn' }),
      },
    ];
  });
  return [...base, ...blindWrites, ...closeBlind, ...events];
}

export const mutants: M[] = mutantsFor(ACTIVE);
