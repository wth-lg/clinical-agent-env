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
// W5-E (whitcomb-a1, the A lever item's batch): its delivered action is the base one, so its
// near misses are the hold a reviewer makes on the notified value: with the silent sibling shown
// (not_amended, reasoning), never reading the batch at all (unseen, retrieval), and a hold
// corrected in the same answer that lists the potassiums (before_seen, process). Its twin takes
// the generic three.
import type { Alternative, Mutant, Script, ScriptCall } from '../../../packages/grader/matrix/types.ts';
import { SPECS } from '../events.ts';
import { AMEND, arrivalReads, bmp, change, type DecideKey, DOC, type DocKey, inbox, made, message, modify, MR, order, potassiums, PT, route, type RouteOpts, RX, searchNotes, specReads, task, W } from '../solution/steps.ts';

const itemOf = (spec: string) => SPECS.find((s) => s.id === spec)!.item;
// The re-check of `active` without reading `spec`'s arrival (or the search that follows it).
const recheckWithout = (active: readonly string[], spec: string): ScriptCall[] => [inbox, ...arrivalReads(active, [spec])];

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
  // whitcomb-a1: the delivered action is the base one (leave the resume); `stale` is the hold a
  // reviewer makes on the notified 5.4, which the silent 4.6 says is not the most recent.
  'whitcomb-a1': { decide: 'whitcombLisinoprilFix', stale: AMEND.whitcombHold, amend: [] },
  'whitcomb-a1-twin': { decide: 'whitcombLisinoprilFix', stale: [], amend: AMEND.whitcombHold },
};

// R38(e): the class B events, with the read a blind decision skips, the first write that fires the
// correction, and the corrected decision (on the order that write created).
const BLIND_B: Record<string, { skip: DocKey[]; first: RouteOpts['over']; fix: readonly ScriptCall[] }> = {
  'kim-k2': { skip: ['kimAddendum'], first: { kimKcl: [W.kimFurosemide, W.kimKcl] }, fix: [AMEND.kimK2(made('mr', 1))] },
  'stark-s1': { skip: ['starkSummary'], first: { starkAtorvastatin: [W.starkCarvedilol, W.starkAtorvastatin] }, fix: [AMEND.starkS1(made('mr', 2))] },
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

// The amend events whose delivered action is no write, so a reviewer who never reads the arrival
// and leaves the item wrote nothing before seeing it: `unseen` fails event_seen alone.
const NO_WRITE = new Set(['stark-s1', 'whitcomb-a1']);

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
  // before_seen: the arrival's reads and the amend in one answer, after a re-check that skipped it.
  // whitcomb-a1: the hold on the notified value in the decisions turn, then the potassiums listed
  // and lisinopril ordered anew (the held order stopped) in one answer, so the new order came before
  // the silent sibling was shown (the core dates an order by its first write; a hold reversed on
  // the original order is read by its end state, tests/grader.ts).
  const beforeSeen: Script = (() => {
    if (spec === 'whitcomb-a1') {
      const r = route({ active, over: { whitcombLisinoprilFix: AMEND.whitcombHold }, recheck: [inbox, ...arrivalReads(active, [spec]), ...specReads(spec).slice(0, 1)] });
      const at = r.length - 2;
      return [...r.slice(0, at), { calls: [potassiums('whitcomb'), change(MR.whitcombLisinopril, 'stop', 'Reordering lisinopril after the repeat potassium'), order('whitcomb', RX.lisinopril20, 20, 'QD', 'Repeat potassium 4.6 at 16:30 is the most recent (RBC-TOC-02 §7); lisinopril 20 mg daily resumed')] }, ...r.slice(at)];
    }
    const opts: RouteOpts = { active, over: { ...first, [a.decide]: [] }, recheck: recheckWithout(active, spec) };
    const r = route(opts);
    const at = r.length - 2;
    return [...r.slice(0, at), { calls: [...specReads(spec), ...a.amend] }, ...r.slice(at)];
  })();
  // R38(e)(ii): a class B correction of the item's own record, fired by a blind first decision (the
  // original never read), read only afterwards and the decision corrected: process.
  const blind = BLIND_B[spec];
  const blindCase: Mutant[] = blind === undefined ? [] : [{
    id: `${spec}_blind_then_corrected`, trap: 'amend_before_seen',
    why: "Never reads the record the item rests on; its first decision write fires the correction, which it reads afterwards and follows, so the final action is right but the first decision rested on nothing it had seen (R18, R38(e)).",
    fails: ['seen_before_change'], loses: [], attribution: 'process', items: { [item]: 'process' },
    script: route({ active, skip: blind.skip, over: { ...blind.first, [a.decide]: blind.fix } }),
  }];
  // R38(i), R29: kim-k1's resume turns on two values in the repeat panel, its potassium and its
  // creatinine. A 'potassium' snippet cut before the creatinine line, with the 10/21 report never
  // opened, resumes lisinopril without any post-discharge creatinine shown: retrieval.
  const snippetOnly: Mutant[] = spec !== 'kim-k1' ? [] : [{
    id: 'kim-k1_potassium_snippet_only', trap: 'missed_arrival',
    why: "Never opens the repeat panel or the 10/21 report; a 'potassium' search of Walter Kim's notes shows the panel's 'Potassium 4.7' line, cut before its creatinine, and it resumes lisinopril with no post-discharge creatinine ever shown (R29, R38(i)).",
    fails: ['event_seen', 'amended'], loses: [], attribution: 'retrieval', items: { [item]: 'retrieval' },
    script: route({ active, skip: ['kimLab'], recheck: [...recheckWithout(active, spec), searchNotes('kim', 'potassium')] }),
  }];
  const whyNotAmended = spec === 'whitcomb-a1'
    ? "Reads the notified potassium of 5.4 and lists his potassiums again, which shows the 4.6 repeat of 16:30, and still holds lisinopril with a recheck Task on the 5.4: the most recent potassium after discharge is the 4.6 (§7), so the resume stands (§8)."
    : 'Reads the arrival and still decides the item as the chart stood before it.';
  return [
    ...blindCase,
    ...snippetOnly,
    {
      id: `${spec}_not_amended`, event: { spec, kind: 'not_amended' }, trap: 'arrival_not_acted_on',
      why: whyNotAmended,
      fails: ['amended'], loses: [], attribution: 'reasoning', items: { [item]: 'reasoning' },
      script: route({ active, over: { [a.decide]: a.stale } }),
    },
    {
      id: `${spec}_unseen`, event: { spec, kind: 'unseen' }, trap: 'missed_arrival',
      why: NO_WRITE.has(spec) ? 'Lists the queue but never opens the arrival, and leaves the item as it was.' : "Lists the queue but never opens the arrival, and makes the arrival's decision anyway.",
      // An event whose delivered action is no write wrote nothing before it was seen.
      fails: NO_WRITE.has(spec) ? ['event_seen'] : ['event_seen', 'amended'], loses: [], attribution: 'retrieval', items: { [item]: 'retrieval' },
      script: route({ active, recheck: recheckWithout(active, spec) }),
    },
    {
      id: `${spec}_before_seen`, event: { spec, kind: 'before_seen' }, trap: 'amend_before_seen',
      why: spec === 'whitcomb-a1'
        ? 'Holds lisinopril on the notified 5.4 after reading only that result, then lists his potassiums and, in the same answer, stops the held order and orders lisinopril 20 mg daily anew: the new order came before the 4.6 repeat was shown.'
        : "Opens the arrival in the same answer that writes the amend, so the amend was written before the arrival was seen.",
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
        { id: 'kim-k1_panel_by_snippet', why: "Never opens the repeat panel: a 'potassium' and a 'creatinine' search of Walter Kim's notes after the re-check show its 'Potassium 4.7' and 'Creatinine 1.21' lines, both values the resume turns on (R2, R29, R38(i)).", script: own({}, { recheck: [inbox, ...arrivalReads(active, ['kim-k1']), searchNotes('kim', 'potassium'), searchNotes('kim', 'creatinine')] }) },
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
    // W5-E, whitcomb-a1: the routes the policy names to the silent sibling (§2 'a result in the
    // patient's results', §7), the R3 extras a cautious clinician adds, the C1 self-correction and
    // the R38(f) re-sign.
    case 'whitcomb-a1':
      return [
        { id: 'whitcomb-a1_newest_by_date_search', why: "After the notified 5.4, lists Gerald Whitcomb's results from 10/22 on (date_ge, newest first) instead of by code: both potassiums of the batch show, and the resume stands.", script: own({}, { recheck: [inbox, ...arrivalReads(active, ['whitcomb-a1']), ...specReads('whitcomb-a1').slice(0, 1), { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.whitcomb, date_ge: '2026-10-22', sort: '-date' } }] }) },
        // W5E-T4-222 M2 (ruling): the seen rule asks for the silent sibling, not the notified focus.
        { id: 'whitcomb-a1_newest_only_no_focus', why: "After the inbox row, never opens the notified 5.4; lists Gerald Whitcomb's potassiums newest first, one row (the 4.6 repeat), and leaves the resume on it.", script: own({}, { recheck: [inbox, ...arrivalReads(active, ['whitcomb-a1']), { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.whitcomb, code: '2823-3', sort: '-date', count: 1 } }] }) },
        { id: 'whitcomb-a1_leave_plus_recheck_task', why: 'Leaves the resume on the 4.6 repeat and also asks the PCP to recheck his potassium next week (R3: a recheck the policy does not forbid).', script: own({ whitcombLisinoprilFix: [task('whitcomb', '2026-10-29', 'Potassium 5.4 on the morning of 10/22 with a repeat of 4.6 that afternoon; lisinopril stays resumed (RBC-TOC-02 §7, §8). Please recheck his potassium next week.', `MedicationRequest/${MR.whitcombLisinopril}`)] }) },
        { id: 'whitcomb-a1_leave_plus_bmp', why: 'Leaves the resume and orders a repeat BMP for next week (R3).', script: own({ whitcombLisinoprilFix: [bmp('whitcomb', '2026-10-28', '2026-10-30', 'Repeat BMP: potassium 5.4 then 4.6 on 10/22 after the lisinopril resume')] }) },
        { id: 'whitcomb-a1_held_then_restored', why: 'Holds lisinopril on the notified 5.4 with a recheck Task after reading it, then, in a later answer after listing his potassiums, resumes it again on the 4.6 repeat (C1: a self-correction after the sibling was seen).', script: (() => {
          const r = route({ active, over: { whitcombLisinoprilFix: AMEND.whitcombHold }, recheck: [inbox, ...arrivalReads(active, ['whitcomb-a1']), ...specReads('whitcomb-a1').slice(0, 1)] });
          const at = r.length - 2;
          return [...r.slice(0, at), { calls: [potassiums('whitcomb')] }, { calls: [change(MR.whitcombLisinopril, 'resume', 'Repeat potassium 4.6 at 16:30 is the most recent after discharge (RBC-TOC-02 §7); the hold is reversed')] }, ...r.slice(at)];
        })() },
        { id: 'whitcomb-a1_held_then_reordered', why: 'Holds lisinopril on the notified 5.4 after reading it, then, in a later answer after listing his potassiums, stops the held order and orders lisinopril 20 mg daily anew (C1 and R21: a self-correction in the new-order form, after the sibling was seen).', script: (() => {
          const r = route({ active, over: { whitcombLisinoprilFix: AMEND.whitcombHold }, recheck: [inbox, ...arrivalReads(active, ['whitcomb-a1']), ...specReads('whitcomb-a1').slice(0, 1)] });
          const at = r.length - 2;
          return [...r.slice(0, at), { calls: [potassiums('whitcomb')] }, { calls: [change(MR.whitcombLisinopril, 'stop', 'Reordering lisinopril after the repeat potassium'), order('whitcomb', RX.lisinopril20, 20, 'QD', 'Repeat potassium 4.6 at 16:30 is the most recent after discharge (RBC-TOC-02 §7); lisinopril 20 mg daily resumed')] }, ...r.slice(at)];
        })() },
        { id: 'whitcomb-a1_resigned', why: 'After the batch, re-signs lisinopril at 20 mg daily (modify at the same dose) once both potassiums were shown (R38(f)).', script: own({ whitcombLisinoprilFix: [modify(MR.whitcombLisinopril, { value: 20, unit: 'mg', frequency: 'QD' }, 'Lisinopril 20 mg daily confirmed: the most recent potassium after discharge is 4.6 (RBC-TOC-02 §7)', RX.lisinopril20)] }) },
      ];
    case 'whitcomb-a1-twin':
      return [
        { id: 'whitcomb-a1-twin_held_by_stop', why: 'Stops the resumed lisinopril instead of holding it, with the recheck Task (no active order is left).', script: own({ whitcombLisinoprilFix: [change(MR.whitcombLisinopril, 'stop', 'Potassium 5.4 on 10/22 16:30 is above 5.0 (RBC-TOC-02 §7)'), AMEND.whitcombHold[1]!] }) },
        { id: 'whitcomb-a1-twin_recheck_by_bmp', why: "Holds lisinopril and orders the potassium recheck as a BMP for 10/26-10/28 instead of a Task (§7's recheck as an order).", script: own({ whitcombLisinoprilFix: [AMEND.whitcombHold[0]!, bmp('whitcomb', '2026-10-26', '2026-10-28', 'BMP: potassium 5.4 on 10/22, lisinopril held (RBC-TOC-02 §7)')] }) },
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
