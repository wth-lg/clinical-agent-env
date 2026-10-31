// Near misses of T1's worklist probe (builder-211), one trap each (task.toml [matrix] traps): each
// is the oracle with one patient's decision gone wrong, so it fails exactly that patient's item,
// under the label attribution.ts gives it (Mutant.items), and no other item. A retrieval mutant
// never asks for the record that decides the dose; a reasoning one sees it and decides wrong; the
// over_action ones commit a forbidden medication write. Each why says which wrong reading
// produces it.
import { type Mutant, oneTurn } from '../../../packages/grader/matrix/types.ts';
import { OUTSIDE } from '../../../packages/grader/items.ts';
import { oracle } from '../solution/solve.ts';
import { activeMeds, allVitals, calc, CASES, clinicScr, labs, modify, note, order, patientRead, read, recentNotes, review, RX, stop, weights, weightsOldestFirst } from '../solution/steps.ts';
import { id, ref } from '../ids.ts';

const P = (pt: string) => `Patient/${pt}`;
const dose = ['doac_dose'];

export const mutants: Array<Mutant & { loses: readonly string[] }> = [
  {
    id: 'ashworth_clinic_creatinine_only',
    trap: 'outside_creatinine_missed',
    why: 'Looks for creatinine under the clinic\'s mg/dL code only, so never sees the newer St. Brigid result in umol/L, takes 1.28 mg/dL as current and keeps apixaban 5 mg (one criterion).',
    fails: dose,
    loses: [],
    items: { [P('pt-0040')]: 'retrieval' },
    attribution: 'retrieval',
    script: review({ ashworth: { reads: [patientRead('pt-0040'), activeMeds('pt-0040'), clinicScr('pt-0040'), weights('pt-0040'), recentNotes('pt-0040')], calcs: [], change: null } }),
  },
  {
    id: 'bauer_stated_weight',
    trap: 'stated_weight_used',
    why: 'Takes the newest weight of any kind, the 168 lb he gave by phone (76.2 kg), not the measured 59.0 kg: CrCl 57, so rivaroxaban stays at 20 mg.',
    fails: dose,
    loses: [],
    items: { [P('pt-0039')]: 'reasoning' },
    attribution: 'reasoning',
    script: review({ bauer: { reads: [patientRead('pt-0039'), activeMeds('pt-0039'), labs('pt-0039'), allVitals('pt-0039'), recentNotes('pt-0039')], calcs: [calc('(140 - 81) * 168 * 0.45359237 / (72 * 1.10)')], change: null } }),
  },
  {
    id: 'delgado_clinic_creatinine_only',
    trap: 'outside_creatinine_missed',
    why: 'Looks for creatinine under the clinic\'s mg/dL code only, takes the July 1.30 mg/dL as current (CrCl 62) and keeps rivaroxaban 20 mg; the newer St. Brigid 160 umol/L gives CrCl 44.',
    fails: dose,
    loses: [],
    items: { [P('pt-0003')]: 'retrieval' },
    attribution: 'retrieval',
    script: review({ delgado: { reads: [patientRead('pt-0003'), activeMeds('pt-0003'), clinicScr('pt-0003'), weights('pt-0003'), recentNotes('pt-0003')], calcs: [calc('(140 - 76) * 90.0 / (72 * 1.30)')], change: null } }),
  },
  {
    id: 'duquette_inhibitor_ignored',
    trap: 'inhibitor_ignored',
    why: 'Sees the itraconazole order on his active list but applies only the three dose criteria (none met) and keeps apixaban 5 mg.',
    fails: dose,
    loses: [],
    items: { [P('pt-0041')]: 'reasoning' },
    attribution: 'reasoning',
    script: review({ duquette: { change: null } }),
  },
  {
    id: 'duquette_itraconazole_stopped',
    trap: 'interacting_drug_changed',
    why: 'Reduces apixaban to 2.5 mg as the policy says, and also stops the dermatologist\'s itraconazole, which §4 forbids: a committed change to another medication.',
    fails: ['nothing_else'],
    loses: [],
    items: { [P('pt-0041')]: 'over_action' },
    attribution: 'over_action',
    script: review({ duquette: { change: [CASES.duquette!.change!, stop(id('mr-t1-1703'), 'Interaction with apixaban; stop itraconazole')] } }),
  },
  {
    id: 'kowalczyk_oldest_weight',
    trap: 'stale_weight',
    why: 'Lists his weights oldest first and takes the first, 64.8 kg from April 2025: one criterion (age), so apixaban stays at 5 mg; the most recent measured weight is 57.6 kg.',
    fails: dose,
    loses: [],
    items: { [P('pt-0001')]: 'reasoning' },
    attribution: 'reasoning',
    script: review({ kowalczyk: { reads: [patientRead('pt-0001'), activeMeds('pt-0001'), labs('pt-0001'), weightsOldestFirst('pt-0001'), recentNotes('pt-0001')], change: null } }),
  },
  {
    id: 'lindahl_letter_unread',
    trap: 'outside_letter_missed',
    why: 'Reviews only his clinic orders and results, never his notes, so misses the ritonavir-boosted regimen in the infectious disease letter and keeps apixaban 5 mg.',
    fails: dose,
    loses: [],
    items: { [P('pt-0045')]: 'retrieval' },
    attribution: 'retrieval',
    script: review({ lindahl: { reads: [patientRead('pt-0045'), activeMeds('pt-0045'), labs('pt-0045'), weights('pt-0045')], more: [], change: null } }),
  },
  {
    id: 'moravec_ideal_weight',
    trap: 'ideal_body_weight',
    why: 'Follows the May pharmacist note (CrCl 39 on ideal body weight) and redoes Cockcroft-Gault on ideal body weight (66 kg) with today\'s SCr 1.45: CrCl 38, so rivaroxaban stays at 15 mg; §3 takes actual weight, 96.0 kg, CrCl 56.',
    fails: dose,
    loses: [],
    items: { [P('pt-0038')]: 'reasoning' },
    attribution: 'reasoning',
    script: review({ moravec: { calcs: [calc('(140 - 79) * 66 / (72 * 1.45)')], change: null } }),
  },
  {
    id: 'pellegrino_reduced',
    trap: 'right_dose_changed',
    why: 'Treats any CrCl under 60 as reduced function and lowers her rivaroxaban to 15 mg; §3 reduces at 50 or lower, and her CrCl is 59.',
    fails: dose,
    loses: [],
    items: { [P('pt-0043')]: 'reasoning' },
    attribution: 'reasoning',
    script: review({
      pellegrino: {
        change: [modify(id('mr-t1-1801'), { value: 15, unit: 'mg', frequency: 'QD' }, 'RBC-PHARM-07 §3: CrCl 50 or lower', RX.rivaroxaban15)],
        note: [note('pt-0043', 'DOAC dose review (RBC-PHARM-07): rivaroxaban reduced from 20 mg to 15 mg once daily.', [ref('Observation/obs-t1-1801'), ref('Observation/obs-t1-1802')])],
      },
    }),
  },
  {
    id: 'vance_discharge_values',
    trap: 'stale_inputs',
    why: 'Takes the discharge summary\'s weight (57.0 kg) and creatinine (1.71) with his age: three criteria, so apixaban stays at 2.5 mg; his weight is back to 64.9 kg and SCr 1.21.',
    fails: dose,
    loses: [],
    items: { [P('pt-0002')]: 'reasoning' },
    attribution: 'reasoning',
    script: review({ vance: { calcs: [], change: null } }),
  },
  // Decisive-id integrity (verifier-W1-probe-T1-clinical-1 F1-F2, builder-228): each of these reads
  // only the record that decides its patient's dose, so a wrong dose is a reasoning error, never a
  // retrieval one, and the patient's other §1 inputs, which cannot change the dose, are never asked
  // for.
  {
    id: 'duquette_inhibitor_seen_no_labs',
    trap: 'inhibitor_ignored',
    why: 'Reads only his chart and active orders, so sees the itraconazole order, applies only the three dose criteria and keeps apixaban 5 mg without looking at his weight or creatinine; the inhibitor alone gives 2.5 mg.',
    fails: dose,
    loses: [],
    items: { [P('pt-0041')]: 'reasoning' },
    attribution: 'reasoning',
    script: review({ duquette: { reads: [patientRead('pt-0041'), activeMeds('pt-0041')], change: null } }),
  },
  {
    id: 'ashworth_outside_creatinine_discarded',
    trap: 'outside_creatinine_discarded',
    why: 'Sees the St. Brigid creatinine of 150 umol/L in her laboratory results but sets it aside as a different unit, takes the clinic\'s 1.28 mg/dL (one criterion, age) and keeps apixaban 5 mg; she never reads her weight, which cannot change the dose.',
    fails: dose,
    loses: [],
    items: { [P('pt-0040')]: 'reasoning' },
    attribution: 'reasoning',
    script: review({ ashworth: { reads: [patientRead('pt-0040'), activeMeds('pt-0040'), labs('pt-0040')], calcs: [], change: null } }),
  },
  {
    id: 'kowalczyk_weight_only_all_three',
    trap: 'criteria_misread',
    why: 'Reads only his chart, orders and newest weights, so sees the 57.6 kg that decides his dose, but takes the criteria as all three needed, not two: with age and weight met, keeps apixaban 5 mg.',
    fails: dose,
    loses: [],
    items: { [P('pt-0001')]: 'reasoning' },
    attribution: 'reasoning',
    script: review({ kowalczyk: { reads: [patientRead('pt-0001'), activeMeds('pt-0001'), weights('pt-0001')], change: null } }),
  },
  {
    id: 'lindahl_snippet_seen_ignored',
    trap: 'inhibitor_ignored',
    why: 'Searches his notes for ritonavir, so the snippet shows the boosted regimen line of the St. Brigid letter, but takes ritonavir at 100 mg as a booster dose too small to count and keeps apixaban 5 mg; §2 names ritonavir given as a booster (seen through a snippet, so reasoning: rulings R2).',
    fails: dose,
    loses: [],
    items: { [P('pt-0045')]: 'reasoning' },
    attribution: 'reasoning',
    script: review({ lindahl: { reads: [patientRead('pt-0045'), activeMeds('pt-0045'), { name: 'search_notes', input: { query: 'ritonavir', patient: 'pt-0045' } }], more: [], change: null } }),
  },
  // No item passes without its deciding record (rulings R14): each reaches its item's expected
  // action without ever asking for the record that decides it, and fails as retrieval.
  {
    id: 'lindahl_reduced_without_letter',
    trap: 'decision_without_fact',
    why: 'Never opens his notes, so never sees the ritonavir-boosted regimen, but lowers apixaban to 2.5 mg anyway out of general caution in a patient with HIV: the right dose, decided without the record that decides it.',
    fails: ['decisive_seen', 'seen_before_change'],
    loses: ['notes_cite_inputs'],
    items: { [P('pt-0045')]: 'retrieval' },
    attribution: 'retrieval',
    script: review({
      lindahl: {
        reads: [patientRead('pt-0045'), activeMeds('pt-0045'), labs('pt-0045'), weights('pt-0045')],
        more: [],
        note: [note('pt-0045', 'DOAC dose review (RBC-PHARM-07): apixaban reduced from 5 mg to 2.5 mg twice daily as a precaution.', [ref('Observation/obs-t1-1901'), ref('Observation/obs-t1-1902')])],
      },
    }),
  },
  {
    id: 'pellegrino_not_reviewed',
    trap: 'decision_without_fact',
    why: 'Skips her chart, the last rivaroxaban patient, and leaves her dose as it is: the right outcome, but she was never reviewed, as the list requires.',
    fails: ['decisive_seen'],
    loses: [],
    items: { [P('pt-0043')]: 'retrieval' },
    attribution: 'retrieval',
    script: review({ pellegrino: { reads: [], calcs: [] } }).filter((t) => t.calls.length > 0),
  },
  {
    id: 'kowalczyk_change_with_reads',
    trap: 'change_before_review',
    why: 'Sends his reads and his dose change in one answer: the change is right, but it goes in before the weight that decides it has come back.',
    fails: ['seen_before_change'],
    loses: [],
    items: { [P('pt-0001')]: 'process' },
    attribution: 'process',
    script: review({ kowalczyk: { reads: [patientRead('pt-0001'), activeMeds('pt-0001'), labs('pt-0001'), weights('pt-0001'), recentNotes('pt-0001'), CASES.kowalczyk!.change!], change: [] } }),
  },
  // Seen late versus never seen (rulings R18). A deciding record read only after the dose was
  // written passes decisive_seen and fails seen_before_change: process, the model acted before
  // checking. The same route with the record never read fails decisive_seen: retrieval. Never
  // reasoning (verifier-W1-probe-T1-clinical-2 F1, its variants l1 and l3).
  {
    id: 'l1_lindahl_letter_read_after_change',
    trap: 'change_before_review',
    why: 'Lowers apixaban to 2.5 mg from his Patient, orders, labs and weights alone, then opens the St. Brigid letter in the next turn and cites it in the note: the right dose, written before the ritonavir line that decides it was in view.',
    fails: ['seen_before_change'],
    loses: [],
    items: { [P('pt-0045')]: 'process' },
    attribution: 'process',
    script: review({ lindahl: { reads: [patientRead('pt-0045'), activeMeds('pt-0045'), labs('pt-0045'), weights('pt-0045')], more: [], change: [CASES.lindahl!.change!], note: [read('DocumentReference', id('doc-t1-1901')), note('pt-0045', CASES.lindahl!.note!.text, CASES.lindahl!.note!.cites)] } }),
  },
  {
    id: 'l3_vance_weight_after_change',
    trap: 'change_before_review',
    why: 'Raises apixaban to 5 mg from his age and the October creatinine, then reads his weights in the next turn and cites the 143 lb in the note: the right dose, written before the weight that rules out a second criterion was in view.',
    fails: ['seen_before_change'],
    loses: [],
    items: { [P('pt-0002')]: 'process' },
    attribution: 'process',
    script: review({ vance: { reads: [patientRead('pt-0002'), activeMeds('pt-0002'), labs('pt-0002')], calcs: [], change: [CASES.vance!.change!], note: [weights('pt-0002'), note('pt-0002', CASES.vance!.note!.text, CASES.vance!.note!.cites)] } }),
  },
  {
    id: 'vance_raised_without_weight',
    trap: 'decision_without_fact',
    why: 'Raises apixaban to 5 mg from his age and the October creatinine and never looks up a weight, though the February discharge weight of 57.0 kg would have made a second criterion: the right dose, decided without the record that decides it (the never-seen twin of l3_vance_weight_after_change).',
    fails: ['decisive_seen', 'seen_before_change'],
    loses: ['notes_cite_inputs'],
    items: { [P('pt-0002')]: 'retrieval' },
    attribution: 'retrieval',
    script: review({ vance: { reads: [patientRead('pt-0002'), activeMeds('pt-0002'), labs('pt-0002')], calcs: [], change: [CASES.vance!.change!], note: [note('pt-0002', 'DOAC dose review (RBC-PHARM-07): SCr 1.21 mg/dL (10/20/2026), age 82, one criterion: apixaban increased from 2.5 mg to 5 mg twice daily.', [ref('Observation/obs-t1-scr-1020')])] } }),
  },
  {
    id: 'off_list_order',
    trap: 'off_list_write',
    why: 'Does the whole review right, then also orders apixaban for a patient who is not on the list.',
    fails: ['nothing_else'],
    loses: [],
    items: { [OUTSIDE]: 'over_action' },
    attribution: 'over_action',
    script: review({ vance: { change: [CASES.vance!.change!, order('pt-0051', RX.apixaban2_5, 2.5, 'BID', 'RBC-PHARM-07 §2')] } }),
  },
  {
    id: 'one_turn_reads_and_changes',
    trap: 'change_before_review',
    why: 'Issues every read of the oracle and all its dose changes in one answer: each change goes in before the results that decide it have come back.',
    fails: ['seen_before_change'],
    loses: [],
    attribution: 'process',
    script: oneTurn(oracle),
  },
];
