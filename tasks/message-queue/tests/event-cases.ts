// T6's mid-trial event cases (events.ts; plan-amendment-w4 "Each event needs mutants"), built for a
// set of active specs: the matrix's mutants and alternatives take them for events.ts ACTIVE
// (tests/mutants.ts, tests/alternatives.ts), and tests/events.test.ts for each spec alone. Every
// case follows the oracle's route (solution/steps.ts route) for that set and varies one event.
//   amend event (B, C, O)   not_amended    reads the arrival and leaves the decision as the chart
//                                          was before it (reasoning)
//                           unseen         makes the delivered decision without ever reading the
//                                          arrival (retrieval)
//                           before_seen    reads the arrival in the same answer that writes the
//                                          amend, so the amend came before it was seen (process)
//   lure (D)                lure_acted_on  reads the resent request and places a second metformin
//                                          order on it (over_action on its item)
// The alternatives: the order sent before the arrival voided by stop or entered in error as well as
// cancel, the current order held as well (R21; RBC-RX-05 §2 allows holding it); for a 30-day supply,
// a stop and a new order (R21); the arrival seen through a search that shows it instead of a read of
// it (R2, R29); and for the lure, the resent request left open or cancelled as a repeat (closing it
// is not graded: the gate is no wider than the policy's forbid, R3).
import type { Alternative, Mutant, Script } from '../../../packages/grader/matrix/types.ts';
import { SPECS } from '../events.ts';
import {
  AMEND, arrivalRead, call, change, HOLD_TASK, inboxOf, labs, MR, odumRenew, order, priceA1c, priceBridge, priceLisinopril, priceMetformin, PT, recheck, route, type RouteOpts, RX, searchNotes, voided, webbA1c, webbBridge, webbMetBridge, webbMetformin,
} from '../solution/steps.ts';

const itemOf = (spec: string) => SPECS.find((s) => s.id === spec)!.item;

export function eventMutants(spec: string, active: readonly string[]): Mutant[] {
  const item = itemOf(spec);
  if (spec === 'price-d1') {
    return [{
      id: `${spec}_lure_acted_on`, event: { spec, kind: 'lure_acted_on' }, trap: 'lure_acted_on',
      why: "Reads the pharmacy's resent request for Samuel Price's metformin and sends a second 90-day order on it; it is the same request (§5), already answered.",
      fails: ['no_forbidden_order', 'kept'], loses: [], attribution: 'over_action', items: { [item]: 'over_action' },
      script: route({ active, extra: [order(PT.price, RX.met1000, 1000, 'BID', 90, 1, 'Pharmacy refill request resent 10/23')] }),
    }];
  }
  const amend = AMEND[spec]!;
  return [
    {
      id: `${spec}_not_amended`, event: { spec, kind: 'not_amended' }, trap: 'arrival_not_acted_on',
      why: 'Reads the arrival and still leaves the decision made on the chart as it stood before it.',
      fails: ['amended'], loses: [], attribution: 'reasoning', items: { [item]: 'reasoning' },
      script: route({ active, amend: { [spec]: () => [] } }),
    },
    {
      id: `${spec}_unseen`, event: { spec, kind: 'unseen' }, trap: 'missed_arrival',
      why: "Lists both queues but never opens the arrival, and writes the arrival's decision anyway.",
      fails: ['event_seen', 'amended'], loses: [], attribution: 'retrieval', items: { [item]: 'retrieval' },
      script: route({ active, recheck: recheck(active, [spec]) }),
    },
    {
      id: `${spec}_before_seen`, event: { spec, kind: 'before_seen' }, trap: 'amend_before_seen',
      why: 'Opens the arrival in the same answer that writes the amend, so the amend was written before the arrival was seen.',
      fails: ['amended'], loses: [], attribution: 'process', items: { [item]: 'process' },
      script: route({ active, recheck: recheck(active, [spec]), amend: { [spec]: () => [] }, before: (m) => [arrivalRead(spec), ...amend(m)] }),
    },
  ];
}

export function eventAlternatives(spec: string, active: readonly string[]): Alternative[] {
  const own = (o: Omit<RouteOpts, 'active'>): Script => route({ ...o, active });
  // The re-check without opening `spec`'s arrival, plus the calls that show it another way.
  const shownBy = (...calls: RouteOpts['extra'] & object[]) => [...recheck(active, [spec]), ...calls];
  switch (spec) {
    case 'odum-o1':
      return [
        { id: 'odum-o1_stopped', why: 'Voids the renewal sent before the repeat panel arrived by stopping it, not cancelling it (R21), and sends the hold Task.', script: own({ amend: { [spec]: (m) => [voided(m, odumRenew, 'stop'), HOLD_TASK.odum] } }) },
        {
          id: 'odum-o1_current_held',
          why: 'Marks the earlier renewal entered in error and also holds the current lisinopril order, which RBC-RX-05 §2 allows, with the hold Task.',
          script: own({ amend: { [spec]: (m) => [voided(m, odumRenew, 'entered-in-error'), change(MR.odum, 'hold', 'Potassium 5.8 on 10/20/2026, pending prescriber review (RBC-RX-05 §2)'), HOLD_TASK.odum] } }),
        },
        { id: 'odum-o1_panel_by_snippet', why: "Never opens the repeat panel: a 'potassium' search of Frank Odum's notes after the re-check shows its potassium line (R2, R29).", script: own({ recheck: shownBy(searchNotes(PT.odum, 'potassium')) }) },
      ];
    case 'price-b1':
      return [
        { id: 'price-b1_by_creatinine_list', why: "Sees the corrected creatinine in a list of Samuel Price's creatinine results instead of opening the result (R2).", script: own({ recheck: shownBy(labs(PT.price, '2160-0')) }) },
        { id: 'price-b1_entered_in_error', why: 'Marks the renewal sent before the correction arrived entered in error, not cancelled (R21), and sends the hold Task.', script: own({ amend: { [spec]: (m) => [voided(m, priceLisinopril, 'entered-in-error'), HOLD_TASK.price] } }) },
      ];
    case 'webb-c1':
      return [
        { id: 'webb-c1_by_potassium_list', why: "Sees the new potassium in a list of Marcus Webb's potassium results instead of opening the result (R2).", script: own({ recheck: shownBy(labs(PT.webb, '2823-3')) }) },
        { id: 'webb-c1_stopped', why: 'Voids the 30-day supply sent before the panel resulted by stopping it (R21), and sends the hold Task.', script: own({ amend: { [spec]: (m) => [voided(m, webbBridge, 'stop'), HOLD_TASK.webb] } }) },
      ];
    case 'price-b2':
      return [
        { id: 'price-b2_stop_and_new', why: 'Stops the 90-day renewal and places the 30-day supply and the HbA1c as new orders (R21).', script: own({ amend: { [spec]: (m) => [voided(m, priceMetformin, 'stop'), priceA1c, priceBridge] } }) },
      ];
    case 'webb-b2':
      return [
        { id: 'webb-b2_stop_and_new', why: 'Stops the 90-day renewal and places the 30-day supply and the HbA1c as new orders (R21).', script: own({ amend: { [spec]: (m) => [voided(m, webbMetformin, 'stop'), webbA1c, webbMetBridge] } }) },
      ];
    case 'price-d1':
      return [
        { id: 'price-d1_left_open', why: 'Reads the resent request, places no second order, and leaves it in the queue: closing it is not what the forbid grades (R3).', script: own({ closeResent: false }) },
        {
          id: 'price-d1_cancelled_as_repeat',
          why: 'Cancels the resent request as a repeat of the request already answered, with no second order.',
          script: own({ closeResent: false, extra: [call('update_inbox_item', { task_id: inboxOf('price-d1', active), action: 'cancel', reason: 'Repeat of the metformin request of 10/20, answered there' })] }),
        },
      ];
  }
  return [];
}
