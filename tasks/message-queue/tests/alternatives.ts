// Other correct solutions of T6: each must PASS. They vary what a careful clinician might vary
// (the tablets that make up a dose, a comprehensive panel for the BMP, the allergy's substance
// and coding, how the NKDA entry is retired, routing the scheduling item by reassigning it,
// declining the antibiotic request, the order the routine items are taken in, extra reads), so
// the grader is shown not to depend on the oracle's exact path.
import type { Agent } from '../../../packages/grader/matrix/types.ts';
import { oracle } from '../solution/solve.ts';
import {
  bmpOrder, close, DONE, finish, inbox, m1Bridge, m3Message, m5Renewal, m6Task, nkdaInactive, parkAllergy, PT, readMessage, refill, RX, swap, call,
} from '../solution/steps.ts';

const original = oracle.flatMap((t) => t.calls);
const closeAll = original.filter((c) => c.name === 'update_inbox_item');
const allergyCall = original.find((c) => c.name === 'record_allergy' && !('update_id' in c.input))!;
const nkdaCall = original.find((c) => c.name === 'record_allergy' && 'update_id' in c.input)!;

export const alternatives: Agent[] = [
  {
    id: 'reassign_and_decline',
    why: 'Hands the scheduling item itself to pool-scheduling instead of creating a Task, declines (rejects) the antibiotic request instead of completing it, records the allergy to amoxicillin as anaphylaxis with angioedema, and marks the NKDA entry entered in error.',
    script: swap(
      oracle,
      [m6Task, []],
      [allergyCall, [parkAllergy(RX.amoxicillin, 'high', [{ manifestation_code: '39579001', severity: 'severe' }, { manifestation_code: '41291007', severity: 'severe' }])]],
      [nkdaCall, [nkdaInactive('verification', 'entered-in-error')]],
      [closeAll[5]!, [call('update_inbox_item', { task_id: 'task-t6-m6', action: 'reassign', new_owner: 'Group/pool-scheduling', comment: 'Please book a November morning physical.' })]],
      [closeAll[3]!, [call('update_inbox_item', { task_id: 'task-t6-m4', action: 'reject', reason: 'Documented immediate reaction to Augmentin (03/09/2024); NP Reyes messaged with the RBC-CP-11 alternative.' })]],
    ),
  },
  {
    id: 'tablet_counts_and_class_allergy',
    why: 'Gives the lisinopril bridge as two 10 mg tablets daily and the metformin renewal as two 500 mg tablets twice daily, orders a comprehensive metabolic panel, records the allergy to the penicillin class, and marks the M3 message stat.',
    script: swap(
      oracle,
      [m1Bridge, [refill(PT.hayes, RX.lisinopril10, 20, 'QD', 30, 0, 'RBC-RX-05 §1: BMP over 12 months; 30-day bridge')]],
      [original.find((c) => c.name === 'order_service')!, [bmpOrder(PT.hayes, '24323-8')]],
      [m5Renewal, [refill(PT.price, RX.metformin500, 2, 'BID', 90, 1, 'RBC-RX-05 §2: renewal', '{tablet}')]],
      [allergyCall, [parkAllergy(RX.penicillin)]],
      [original.find((c) => c.name === 'send_message' && c.input.priority === 'urgent' && String(c.input.recipient).startsWith('Patient/'))!, [m3Message(undefined, 'stat')]],
    ),
  },
  {
    id: 'reads_everything_first',
    why: 'Reads all six messages before acting, takes the red flag first, then the rest in queue order, with links on every closure.',
    script: [
      { calls: [inbox] },
      { calls: [1, 2, 3, 4, 5, 6].map(readMessage) },
      ...oracle.slice(1).map((t) => ({ ...t, calls: t.calls.filter((c) => !(c.name === 'fhir_read' && c.input.resource_type === 'Communication')) })).filter((t) => t.calls.length > 0 && t.calls[0]!.name !== 'update_inbox_item' && t.calls[0]!.name !== 'finish'),
      {
        calls: [
          close(3, ['Communication/comm-t6-m3']),
          close(1, ['Communication/comm-t6-m1']),
          close(2, ['Communication/comm-t6-m2']),
          close(4, ['Communication/comm-t6-m4']),
          close(5, ['Communication/comm-t6-m5']),
          close(6, ['Communication/comm-t6-m6']),
        ],
      },
      { calls: [finish(DONE)] },
    ],
  },
];

