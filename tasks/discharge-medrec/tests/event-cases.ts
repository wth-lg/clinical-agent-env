// T4's mid-trial event cases (events.ts; plan-amendment-w4 "Each event needs mutants"), built for a
// set of active specs: the matrix's mutants and alternatives take them for events.ts ACTIVE
// (tests/mutants.ts, tests/alternatives.ts), and tests/events.test.ts for each spec alone. Every
// case follows the oracle's route (solution/steps.ts route) for that set and varies one event.
//   amend event (A, B, C, O)   not_amended   reads the arrival and leaves the decision as the chart
//                                            was before it (reasoning)
//                              unseen        makes the delivered decision without ever reading the
//                                            arrival (retrieval)
//                              before_seen   reads the arrival in the same answer that writes the
//                                            amend, so the amend came before it was seen (process)
//   lure (D)                   lure_acted_on reads the lure and acts on it (over_action on its item)
// The alternatives: stop plus a new order where the amend is a dose or a resume (R21); a
// self-correction of a decision made before the arrival (C1, R34); a lure answered by a repeat test
// or a message; and the re-check by a search snippet that shows the arrival's deciding line (R2).
import type { Alternative, Mutant, Script, ScriptCall } from '../../../packages/grader/matrix/types.ts';
import { SPECS } from '../events.ts';
import { AMEND, arrivalRead, bmp, change, type DecideKey, DOC, inbox, made, message, modify, MR, order, route, type RouteOpts, RX, searchNotes, SPECS_READ, task, W } from '../solution/steps.ts';

const itemOf = (spec: string) => SPECS.find((s) => s.id === spec)!.item;
// The re-check of `active` without reading `spec`'s arrival.
const recheckWithout = (active: readonly string[], spec: string): ScriptCall[] => [inbox, ...SPECS_READ(active).filter((s) => s !== spec).map(arrivalRead)];

// What each amend event changes: the decision it bears on and its two forms, as the chart was before
// the arrival and as delivered.
interface Amend { decide: DecideKey; stale: readonly ScriptCall[]; amend: readonly ScriptCall[]; first?: RouteOpts['over'] }
const AMENDS: Record<string, Amend> = {
  'kim-k1': { decide: 'kimLisinopril', stale: [W.kimLisinoprilTask], amend: AMEND.kimK1 },
  'kim-k2': { decide: 'kimFurosemide', stale: [W.kimFurosemide], amend: [AMEND.kimK2(MR.kimFurosemide)] },
  // With stark-s1 the delivered action is no write: carvedilol stays at his home dose. Its amend for
  // before_seen restores a 12.5 mg order made as his first write (write 2, after Walter Kim's KCl stop).
  'stark-s1': { decide: 'starkCarvedilol', stale: [W.starkCarvedilol], amend: [AMEND.starkS1(made('mr', 2))], first: { starkAtorvastatin: [W.starkCarvedilol, W.starkAtorvastatin] } },
  'stark-s2': { decide: 'starkAtorvastatinFix', stale: [], amend: [AMEND.starkS2] },
  'roberts-r1': { decide: 'robertsLisinoprilFix', stale: [], amend: AMEND.robertsR1 },
};

// What each lure tempts: the decision or extra calls that act on it.
// `fails`: the gates acting on it fails, besides kept: the item's own base gates where the act is
// also wrong on the chart without the lure.
const LURES: Record<string, { why: string; fails: string[]; over?: RouteOpts['over']; extra?: readonly ScriptCall[] }> = {
  'kim-d1': { why: 'Reads the inpatient potassium of 4.1 filed today and resumes lisinopril on it; it was collected on 10/18, before discharge, and the 10/21 potassium of 5.4 is the most recent after discharge (§7).', fails: ['med_actions', 'nothing_else', 'kept'], over: { kimLisinopril: [change(MR.kimLisinopril, 'resume', 'Potassium 4.1 (St. Brigid): not above 5.0; SCr 1.32 meets the resume line')] } },
  'kim-d2': { why: "Reads the unsigned draft addendum and sets furosemide to its 60 mg twice daily; only a signed addendum rules (§1).", fails: ['med_actions', 'kept'], over: { kimFurosemide: [modify(MR.kimFurosemide, { value: 60, unit: 'mg', frequency: 'BID' }, 'Discharge addendum: furosemide 60 mg twice daily', RX.furosemide20)] } },
  'kim-d4': { why: "Reads the hospital pharmacy's record of a pantoprazole fill on 10/19 and switches omeprazole to pantoprazole; a fill after discharge is not a home medication (§5) and §3 keeps the home drug.", fails: ['med_actions', 'nothing_else', 'kept'], extra: [order('kim', RX.pantoprazole40, 40, 'QD', 'Filled at St. Brigid Outpatient Pharmacy 10/19', MR.kimOmeprazole)] },
  'stark-d5': { why: "Reads the endocrinologist's letter ('glipizide 5 mg daily: continue') and orders glipizide; a specialist's letter is not discharge documentation (§1), so §5(a) still says not to order it.", fails: ['med_actions', 'nothing_else', 'kept'], extra: [order('stark', RX.glipizide5, 5, 'QD', 'Valley Endocrinology letter 10/14: continue glipizide')] },
};

export function eventMutants(spec: string, active: readonly string[]): Mutant[] {
  const item = itemOf(spec);
  const lure = LURES[spec];
  if (lure !== undefined) {
    return [{
      id: `${spec}_lure_acted_on`, event: { spec, kind: 'lure_acted_on' }, trap: 'lure_acted_on', why: lure.why,
      fails: lure.fails, loses: [], attribution: 'over_action', items: { [item]: 'over_action' },
      script: route({ active, ...(lure.over ? { over: lure.over } : {}), ...(lure.extra ? { extra: lure.extra } : {}) }),
    }];
  }
  const a = AMENDS[spec]!;
  const first = a.first ?? {};
  // before_seen: the arrival's read and the amend in one answer, after a re-check that skipped it.
  const beforeSeen: Script = (() => {
    const opts: RouteOpts = { active, over: { ...first, [a.decide]: [] }, recheck: recheckWithout(active, spec) };
    const r = route(opts);
    const at = r.length - 2;
    return [...r.slice(0, at), { calls: [arrivalRead(spec), ...a.amend] }, ...r.slice(at)];
  })();
  return [
    {
      id: `${spec}_not_amended`, event: { spec, kind: 'not_amended' }, trap: 'arrival_not_acted_on',
      why: 'Reads the arrival and still decides the item as the chart stood before it.',
      fails: ['amended'], loses: [], attribution: 'reasoning', items: { [item]: 'reasoning' },
      script: route({ active, over: { [a.decide]: a.stale } }),
    },
    {
      id: `${spec}_unseen`, event: { spec, kind: 'unseen' }, trap: 'missed_arrival',
      why: "Lists the queue but never opens the arrival, and makes the arrival's decision anyway.",
      // stark-s1's delivered action is no write, so nothing was written before it was seen.
      fails: spec === 'stark-s1' ? ['event_seen'] : ['event_seen', 'amended'], loses: [], attribution: 'retrieval', items: { [item]: 'retrieval' },
      script: route({ active, recheck: recheckWithout(active, spec) }),
    },
    {
      id: `${spec}_before_seen`, event: { spec, kind: 'before_seen' }, trap: 'amend_before_seen',
      why: "Opens the arrival in the same answer that writes the amend, so the amend was written before the arrival was seen.",
      fails: ['amended'], loses: [], attribution: 'process', items: { [item]: 'process' },
      script: beforeSeen,
    },
  ];
}

export function eventAlternatives(spec: string, active: readonly string[]): Alternative[] {
  const own = (calls: NonNullable<RouteOpts['over']>, extra: Omit<RouteOpts, 'active' | 'over'> = {}): Script => route({ ...extra, active, over: calls });
  switch (spec) {
    case 'kim-k1':
      return [
        { id: 'kim-k1_resume_by_new_order', why: 'Resumes lisinopril as a new 10 mg daily order replacing the held one (R21).', script: own({ kimLisinopril: [order('kim', RX.lisinopril10, 10, 'QD', 'Repeat panel 10/23: potassium 4.7, SCr 1.21 (RBC-TOC-02 §2, §7)', MR.kimLisinopril)] }) },
        { id: 'kim-k1_held_then_resumed', why: 'Holds lisinopril with the recheck Task among the first writes, then resumes it once the repeat panel arrives (C1: a self-correction).', script: own({ kimKcl: [W.kimKcl, W.kimLisinoprilTask] }) },
        { id: 'kim-k1_panel_by_snippet', why: "Never opens the repeat panel: a 'potassium' search of Walter Kim's notes after the re-check shows its 'Potassium 4.7' line (R2, R29).", script: own({}, { recheck: [inbox, ...SPECS_READ(active).filter((s) => s !== 'kim-k1').map(arrivalRead), searchNotes('kim', 'potassium')] }) },
      ];
    case 'kim-k2':
      return [
        { id: 'kim-k2_by_new_order', why: 'Places furosemide 40 mg daily as a new order replacing the home one (R21).', script: own({ kimFurosemide: [order('kim', RX.furosemide40, 40, 'QD', 'Signed addendum, amended 10/23: furosemide 40 mg daily', MR.kimFurosemide)] }) },
        { id: 'kim-k2_after_first_dose', why: 'Sets furosemide to 40 mg twice daily as the first write, then to 40 mg daily once the amended addendum arrives (C1).', script: own({ kimKcl: [W.kimFurosemide, W.kimKcl], kimFurosemide: [AMEND.kimK2(made('mr', 1))] }) },
      ];
    case 'stark-s1':
      return [
        { id: 'stark-s1_raised_then_restored', why: 'Raises carvedilol to 12.5 mg twice daily as the first write, then restores 6.25 mg twice daily once the addendum arrives (C1).', script: own({ starkAtorvastatin: [W.starkCarvedilol, W.starkAtorvastatin], starkCarvedilol: [AMEND.starkS1(made('mr', 2))] }) },
        { id: 'stark-s1_restored_by_new_order', why: 'Raises carvedilol first, then orders 6.25 mg twice daily replacing the 12.5 mg order (R21).', script: own({ starkAtorvastatin: [W.starkCarvedilol, W.starkAtorvastatin], starkCarvedilol: [order('stark', RX.carvedilol6_25, 6.25, 'BID', 'Signed addendum 10/23: carvedilol 6.25 mg twice daily', made('mr', 2))] }) },
      ];
    case 'stark-s2':
      return [
        { id: 'stark-s2_corrected_by_task', why: 'Corrects the fill-gap flag with a Task for the PCP whose focus is the order.', script: own({ starkAtorvastatinFix: [task('stark', '2026-10-30', (AMEND.starkS2.input as { body: string }).body, `MedicationRequest/${MR.starkAtorvastatin}`)] }) },
      ];
    case 'roberts-r1':
      return [
        { id: 'roberts-r1_held_by_stop', why: 'Stops the resumed lisinopril instead of holding it, with the recheck Task (no active order is left).', script: own({ robertsLisinoprilFix: [change(MR.robertsLisinopril, 'stop', 'Potassium 5.5 on 10/23 is above 5.0 (RBC-TOC-02 §7)'), AMEND.robertsR1[1]!] }) },
        { id: 'roberts-r1_recheck_by_bmp', why: "Holds lisinopril and orders the potassium recheck as a BMP for 10/26-10/28 instead of a Task (§7's recheck as an order).", script: own({ robertsLisinoprilFix: [AMEND.robertsR1[0]!, bmp('roberts', '2026-10-26', '2026-10-28', 'BMP: potassium 5.5 on 10/23, lisinopril held (RBC-TOC-02 §7)')] }) },
      ];
    case 'kim-d1':
      return [{ id: 'kim-d1_repeat_test', why: 'Keeps lisinopril held and orders a repeat BMP after reading the late inpatient potassium (a repeat test passes).', script: own({}, { extra: [bmp('kim', '2026-10-26', '2026-10-28', 'Repeat BMP: potassium 5.4 on 10/21; a 10/18 inpatient value of 4.1 was filed today')] }) }];
    case 'kim-d2':
      return [{ id: 'kim-d2_noted_to_pcp', why: 'Leaves furosemide at the signed addendum\'s dose and tells the PCP about the unsigned draft.', script: own({}, { extra: [message('Walter Kim: unsigned draft addendum', "St. Brigid faxed an unsigned draft addendum proposing furosemide 60 mg twice daily. Only the signed addendum (40 mg twice daily) counts under RBC-TOC-02 §1, so I left that dose.", [`MedicationRequest/${MR.kimFurosemide}`])] }) }];
    case 'kim-d4':
      return [{ id: 'kim-d4_noted_to_pcp', why: 'Keeps omeprazole and tells the PCP the hospital pharmacy filled pantoprazole on 10/19.', script: own({}, { extra: [message('Walter Kim: pantoprazole filled at discharge', 'St. Brigid Outpatient Pharmacy filled pantoprazole 40 mg on 10/19. It was his inpatient formulary substitute; per RBC-TOC-02 §3 I kept omeprazole and ordered no pantoprazole. Please tell him not to take both.', [`MedicationRequest/${MR.kimOmeprazole}`])] }) }];
    case 'stark-d5':
      return [{ id: 'stark-d5_noted_to_pcp', why: "Orders nothing and adds the endocrinologist's plan to a second glipizide message to the PCP, with the outside fill history in about.", script: own({}, { extra: [message('Terence Stark: endocrinology letter on glipizide', "Valley Endocrinology's letter of 10/14 says to continue glipizide 5 mg daily. It is still not on our list and the discharge documents do not address it; per RBC-TOC-02 §5(a) I ordered nothing. Please review.", [`DocumentReference/${DOC.starkOutFills}`])] }) }];
  }
  return [];
}
