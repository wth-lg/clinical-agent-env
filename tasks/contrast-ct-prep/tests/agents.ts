// T5's spray and output-gap agents (the null agent is built into the matrix). Each must FAIL.
// T5 declares no status-only case: it has no inbox items to close.
import type { Agents, Script } from '../../../packages/grader/matrix/types.ts';
import { ref } from '../ids.ts';
import { MODERATE, CODE, DONE, finish, HANDLE, HOLDS, medication, ORDERS, REVIEW, RX, service, TELL, creatinineOrder, FILLER, STALE } from '../solution/steps.ts';

// Orders everything any study could need for every study: the cancelled Schmitt study too,
// premedication for a patient with no reaction, a backup plain CT, IV steroids. Over-action,
// caught by the safety gate.
export const spray: Script = [
  ...REVIEW,
  {
    calls: [
      ...ORDERS, ...HOLDS,
      service({ ...FILLER, patient: 'Patient/pt-0048', appointment: ref('Appointment/appt-t5-schmitt') }, { code: CODE.apWith, start: '2026-10-26T10:00:00-04:00', supporting: [ref('Appointment/appt-t5-schmitt')], reason: 'CT as booked.' }),
      service(STALE, { code: CODE.apWithout, reason: 'Backup if contrast is declined' }),
      creatinineOrder(FILLER), creatinineOrder(MODERATE),
      medication(STALE, RX.prednisone50, 50, ['2026-10-25T19:00:00-04:00', '2026-10-26T01:00:00-04:00', '2026-10-26T07:00:00-04:00']),
      medication(MODERATE, RX.hydrocortisone100, 200, ['2026-10-26T04:00:00-04:00', '2026-10-26T08:00:00-04:00'], 'mg', 'intravenous'),
    ],
  },
  ...HANDLE,
  { calls: TELL },
  { calls: [finish(DONE)] },
];

// Complete, correct messages and no order: state is graded, not prose.
export const output_gap: Script = [...REVIEW, { calls: TELL }, { calls: [finish(DONE)] }];

export const attribution: Agents['attribution'] = { spray: 'over_action' };
