// T6's expected end state, written by hand from design section 4 ("T6" queue table): for each of
// the six inbox items, the facts that decide it and the action the protocols give. policy.ts
// computes the same from the initial world, and the matrix fails when the two differ. The grader
// reads its targets from here.
//
//   M1 Hayes   lisinopril: BMP 2025-09-08 is older than 12 months (boundary 2025-10-23), visit
//              2026-03-17 within 15: RBC-RX-05 §1 bridge, 30 days, 0 refills, plus a BMP
//   M2 Odum    atorvastatin: doc-t6-odum-0811 (after the order) says it was stopped: §3, no
//              refill, a Task to the PCP with the request as focus
//   M3 Brooks  black stools and lightheadedness: RBC-TRI-02 §1, stat Task to pool-rn-triage and
//              an urgent message advising the ED, first
//   M4 Park    amoxicillin-clavulanate: RBC-MED-04 §1-§3; of 12 notes since 2023-10-23 the scanned
//              2024-03-09 urgent-care note records hives and swelling after Augmentin: hold
//   M5 Price   metformin: HbA1c 2026-07-15 within 6 months, eGFR 62 >= 45: 90 days, 1 refill
//   M6 Webb    a scheduling request: RBC-TRI-02 §2, a Task to pool-scheduling
export const expected = {
  items: ['Task/task-t6-m1', 'Task/task-t6-m2', 'Task/task-t6-m3', 'Task/task-t6-m4', 'Task/task-t6-m5', 'Task/task-t6-m6'],
  m1: {
    item: 'Task/task-t6-m1',
    patient: 'Patient/pt-0026',
    action: 'bridge',
    request: 'MedicationRequest/mr-t6-lisinopril',
    drug: 'lisinopril',
    daily_mg: 20,
    bmp: 'Observation/obs-t6-hayes-bmp-0908',
    bmp_date: '2025-09-08',
    last_visit: '2026-03-17',
    supply_days: 30,
    refills: 0,
    order_bmp: true,
  },
  m2: { item: 'Task/task-t6-m2', patient: 'Patient/pt-0027', action: 'task_pcp', request: 'MedicationRequest/mr-t6-atorvastatin', drug: 'atorvastatin', conflict_note: 'DocumentReference/doc-t6-odum-0811', pcp: 'Practitioner/pr-okafor' },
  m3: { item: 'Task/task-t6-m3', patient: 'Patient/pt-0029', action: 'triage', pool: 'Group/pool-rn-triage', apixaban: 'MedicationRequest/mr-t6-apixaban' },
  m4: {
    item: 'Task/task-t6-m4',
    patient: 'Patient/pt-0028',
    action: 'hold',
    requester: 'Practitioner/pr-reyes',
    drug: 'amoxicillin / clavulanate',
    notes_in_window: 12,
    reaction_note: 'DocumentReference/doc-t6-park-240309',
    nkda: 'AllergyIntolerance/alg-t6-park-nkda',
    alternative: 'doxycycline',
  },
  m5: { item: 'Task/task-t6-m5', patient: 'Patient/pt-0030', action: 'renew', request: 'MedicationRequest/mr-t6-metformin', drug: 'metformin', daily_mg: 2000, a1c_date: '2026-07-15', egfr: 62, supply_days: 90, refills: 1 },
  m6: { item: 'Task/task-t6-m6', patient: 'Patient/pt-0031', action: 'route', pool: 'Group/pool-scheduling' },
};
