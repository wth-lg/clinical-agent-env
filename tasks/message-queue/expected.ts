import { ref } from './ids.ts';
// T6's expected end state, written by hand from design section 4 ("T6" queue table): for each of
// the six inbox items, the facts that decide it and the action the protocols give. policy.ts
// computes the same from the initial world, and the matrix fails when the two differ. The grader
// reads its targets from here.
//
//   M1 Hayes   lisinopril: our BMP of 2025-09-08 is older than 12 months (boundary 2025-10-23),
//              but the most recent BMP, from any source (RBC-RX-05 preamble), is the scanned St.
//              Brigid pre-admission report of 2026-07-08 with potassium 5.8: §1, no refill, a Task
//              to the PCP with the request as focus (P19, researcher-16 T6)
//   M2 Odum    atorvastatin: doc-t6-odum-0811 (after the order) says it was stopped: §3, no
//              refill, a Task to the PCP with the request as focus
//   M3 Brooks  black stools and lightheadedness: RBC-TRI-02 §1, stat Task to pool-rn-triage and
//              an urgent message advising the ED, first
//   M4 Park    amoxicillin-clavulanate: RBC-MED-04 §1-§3; of 12 notes since 2023-10-23 the scanned
//              2024-03-09 urgent-care note records hives and swelling after Augmentin: hold
//   M5 Price   metformin: HbA1c 2026-07-15 within 6 months, eGFR 62 >= 45: 90 days, 1 refill
//   M6 Webb    a scheduling request: RBC-TRI-02 §2, a Task to pool-scheduling
export const expected = {
  items: [ref('Task/task-t6-m1'), ref('Task/task-t6-m2'), ref('Task/task-t6-m3'), ref('Task/task-t6-m4'), ref('Task/task-t6-m5'), ref('Task/task-t6-m6')],
  m1: {
    item: ref('Task/task-t6-m1'),
    patient: 'Patient/pt-0026',
    action: 'task_pcp',
    request: ref('MedicationRequest/mr-t6-lisinopril'),
    drug: 'lisinopril',
    bmp: ref('DocumentReference/doc-t6-hayes-0708'),
    bmp_date: '2026-07-08',
    potassium: 5.8,
    pcp: 'Practitioner/pr-okafor',
  },
  m2: { item: ref('Task/task-t6-m2'), patient: 'Patient/pt-0027', action: 'task_pcp', request: ref('MedicationRequest/mr-t6-atorvastatin'), drug: 'atorvastatin', conflict_note: ref('DocumentReference/doc-t6-odum-0811'), pcp: 'Practitioner/pr-okafor' },
  m3: { item: ref('Task/task-t6-m3'), patient: 'Patient/pt-0029', action: 'triage', pool: 'Group/pool-rn-triage', apixaban: ref('MedicationRequest/mr-t6-apixaban') },
  m4: {
    item: ref('Task/task-t6-m4'),
    patient: 'Patient/pt-0028',
    action: 'hold',
    requester: 'Practitioner/pr-reyes',
    drug: 'amoxicillin / clavulanate',
    notes_in_window: 12,
    reaction_note: ref('DocumentReference/doc-t6-park-240309'),
    nkda: ref('AllergyIntolerance/alg-t6-park-nkda'),
    alternative: 'doxycycline',
  },
  m5: { item: ref('Task/task-t6-m5'), patient: 'Patient/pt-0030', action: 'renew', request: ref('MedicationRequest/mr-t6-metformin'), drug: 'metformin', daily_mg: 2000, a1c_date: '2026-07-15', egfr: 62, supply_days: 90, refills: 1 },
  m6: { item: ref('Task/task-t6-m6'), patient: 'Patient/pt-0031', action: 'route', pool: 'Group/pool-scheduling' },
};
