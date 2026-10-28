// Near misses of T2, one trap each (task.toml [matrix] traps; design "Inbox" traps): each must
// FAIL on exactly the gates it declares (fails) and lose exactly the rubric items it declares
// (loses: the items whose result differs from the oracle's).
import type { Mutant, ScriptCall } from '../../../packages/grader/matrix/types.ts';
import { ORACLE, solve } from '../solution/solve.ts';
import { finish, PT, READ_ALL, read, searchNotes, SRC, writer } from '../solution/steps.ts';

const hp = read(SRC.hp);
// The reads without Linda Marsh's H&P.
const withoutHp = READ_ALL.map((t) => ({ ...t, calls: t.calls.filter((c) => JSON.stringify(c) !== JSON.stringify(hp)) }));
// The reads without Denise Holloway's potassium result.
const withoutKd = READ_ALL.map((t) => ({ ...t, calls: t.calls.filter((c) => JSON.stringify(c) !== JSON.stringify(read(SRC.kD))) }));

// The exploit runs' finish (P17 PR22b): the summary names the run, not the care.
const EXPLOIT_DONE = 'Grader robustness audit run, not real care.';

// One more write, unlinked, in its own answer before the last.
const plus = (base: Mutant['script'], call: ScriptCall): Mutant['script'] => [...base.slice(0, -1), { calls: [call] }, base.at(-1)!];

// `satisfies` keeps loses checked against the Mutant type both before and after it gains the field.
export const mutants = [
  {
    id: 'structured_smoking_only',
    trap: 'smoking_history_in_note',
    why: "Never opens the H&P, takes the structured 'Ex-smoker' as a remote, light history, calls the nodule low risk and closes item 1 with no follow-up.",
    fails: ['nodule_ct_window', 'items_closed_with_links', 'patient_contact'],
    loses: ['nodule_tracking_task', 'nodule_patient_message'],
    script: solve({ reads: withoutHp, nodule: { order: null, due: null, message: false } }),
  },
  {
    id: 'ct_from_today',
    trap: 'interval_from_today',
    why: 'Counts the 12 months from today instead of from the 2026-06-04 CT: the CT chest falls on 2027-10-23, outside the window 2027-05-04 to 2027-07-04.',
    fails: ['nodule_ct_window'],
    loses: ['nodule_tracking_task'],
    script: solve({ nodule: { order: { code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2027-10-23', end: '2027-11-23' }, due: '2027-11-23', message: true } }),
  },
  {
    id: 'ct_with_contrast',
    trap: 'wrong_study_code',
    why: 'Gets the window right but orders the CT chest with contrast, which RBC-RAD-05 §2 does not ask for; a nodule follow-up CT is done without contrast.',
    fails: ['nodule_ct_window'],
    loses: [],
    script: solve({ nodule: { ...ORACLE.nodule, order: { code: 'IMG-CT-CHEST-W', priority: 'routine', start: '2027-06-04', end: '2027-07-04' } } }),
  },
  {
    id: 'namesake_ct',
    trap: 'wrong_patient_same_name',
    why: "Searches the clinic's notes by name, lands on the other Linda Marsh (1965) and orders the CT on her chart; item 1 is closed with nothing of its own patient linked.",
    fails: ['nodule_ct_window', 'namesake_untouched', 'items_closed_with_links', 'patient_contact'],
    loses: ['nodule_tracking_task', 'nodule_patient_message'],
    attribution: 'over_action',
    script: solve({
      reads: [...withoutHp, { calls: [searchNotes('Linda Marsh smoker'), read('DocumentReference/doc-t2-pn-lm65')] }],
      nodule: { order: { code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2027-06-04', end: '2027-07-04', patient: PT.otherMarsh }, due: null, message: false, link: false },
    }),
  },
  {
    id: 'duplicate_gi_referral',
    trap: 'duplicate_gi_referral',
    why: "Never looks for Dr. Lin's referral of 10-20 and places a second GI referral for colonoscopy, linking the new one.",
    fails: ['fit_existing_referral'],
    loses: [],
    script: solve({ fit: { ...ORACLE.fit, newReferral: true, linkExisting: false } }),
  },
  {
    id: 'hemolyzed_k_paged',
    trap: 'hemolyzed_k_oncall',
    why: 'Repeats the hemolyzed potassium correctly but also pages on-call at stat for it, which RBC-LAB-03 §2 says not to do.',
    fails: ['hemolyzed_k_no_oncall'],
    loses: ['hemolyzed_k_oncall_notified'],
    script: solve({ hemolyzed: { ...ORACLE.hemolyzed, oncall: true } }),
  },
  {
    id: 'hemolyzed_k_paged_no_about',
    trap: 'hemolyzed_k_oncall',
    why: "Pages on-call at stat for the hemolyzed 6.4 with nothing listed in about; the message body names Walter Brennan, so it is still a page about him.",
    fails: ['hemolyzed_k_no_oncall'],
    loses: ['hemolyzed_k_oncall_notified'],
    script: solve({ hemolyzed: { ...ORACLE.hemolyzed, oncall: true, oncallAbout: [] } }),
  },
  {
    id: 'hemolyzed_reassigned_to_oncall',
    trap: 'hemolyzed_k_oncall',
    attribution: 'over_action',
    why: 'Repeats the hemolyzed potassium correctly but forwards the inbox item to pool-oncall before closing it, the usual way to page the covering clinician, which RBC-LAB-03 §2 says not to do.',
    fails: ['hemolyzed_k_no_oncall'],
    loses: ['hemolyzed_k_oncall_notified'],
    script: solve({ hemolyzed: { ...ORACLE.hemolyzed, reassign: true } }),
  },
  {
    id: 'hemolyzed_k_routine_next_week',
    trap: 'hemolyzed_k_no_repeat',
    why: 'Treats the hemolyzed 6.4 as noise and schedules a routine BMP for next Friday, 2026-10-30, past the next business day.',
    fails: ['hemolyzed_k_repeat'],
    loses: [],
    script: solve({ hemolyzed: { ...ORACLE.hemolyzed, order: { code: '51990-0', priority: 'routine', start: '2026-10-30' } } }),
  },
  {
    id: 'critical_k_patient_only',
    trap: 'critical_k_no_oncall',
    why: 'Orders the stat BMP for the true 6.2 and tells no one: neither on-call nor the patient hears of it.',
    fails: ['critical_k_oncall', 'patient_contact'],
    loses: ['urgent_item_unnotified', 'ace_inhibitor_addressed'],
    script: solve({ critical: { ...ORACLE.critical, oncall: null } }),
  },
  {
    id: 'critical_k_oncall_urgent',
    trap: 'critical_k_no_oncall',
    why: 'Tells on-call about the true 6.2 at urgent priority, not the stat RBC-LAB-03 §1 requires.',
    fails: ['critical_k_oncall'],
    loses: [],
    script: solve({ critical: { ...ORACLE.critical, oncallPriority: 'urgent' } }),
  },
  {
    id: 'critical_k_reassigned_only',
    trap: 'critical_k_no_oncall',
    attribution: 'reasoning',
    why: 'Forwards the true 6.2 inbox item to pool-oncall with a note instead of a stat notice: on-call is told, but a forwarded inbox item stays at routine priority, not the stat RBC-LAB-03 §1 requires.',
    fails: ['critical_k_oncall'],
    loses: ['ace_inhibitor_addressed'],
    script: solve({ critical: { ...ORACLE.critical, oncall: 'reassign' } }),
  },
  {
    id: 'critical_k_as_hemolyzed',
    trap: 'critical_k_as_hemolyzed',
    why: 'Takes the true 6.2 for a hemolyzed result and follows RBC-LAB-03 §2: an urgent BMP for Monday 2026-10-26 and a message asking the patient to come in, with no stat BMP and no word to on-call.',
    fails: ['critical_k_oncall', 'critical_k_stat_bmp'],
    loses: ['ace_inhibitor_addressed'],
    script: solve({ critical: { oncall: null, oncallPriority: 'stat', order: { code: '51990-0', priority: 'urgent', start: '2026-10-26' }, patientMessage: true } }),
  },
  {
    id: 'bone_routine_three_months',
    trap: 'urgent_no_interval',
    why: 'Reads no interval as no hurry: orders the referral and the MRI routine for 2027-01-22, three months out, past 2026-11-05.',
    fails: ['bone_lesion_orders'],
    loses: [],
    script: solve({
      bone: { ...ORACLE.bone, orders: [{ code: 'REF-ORTHO-ONC', priority: 'routine', start: '2027-01-22' }, { code: 'IMG-MRI-FEMUR-WWO', priority: 'routine', start: '2027-01-22' }] },
    }),
  },
  {
    id: 'bone_referral_only',
    trap: 'urgent_no_interval',
    why: 'Places the urgent orthopaedic oncology referral and leaves the MRI to the specialist, though the report recommends both.',
    fails: ['bone_lesion_orders'],
    loses: [],
    script: solve({ bone: { ...ORACLE.bone, orders: [{ code: 'REF-ORTHO-ONC', priority: 'urgent', start: '2026-11-02' }] } }),
  },
  {
    id: 'cyst_reimaged',
    trap: 'control_ordered',
    why: 'Orders a repeat renal ultrasound in 6 months for the simple cyst the report says needs none.',
    fails: ['controls_no_orders'],
    loses: [],
    script: solve({ controls: [{ patient: PT.parisian, code: 'IMG-US-KIDNEY', priority: 'routine', start: '2027-04-20' }] }),
  },
  {
    id: 'closed_without_links',
    trap: 'closed_without_link',
    why: 'Does every action but completes items 1, 4, 5 and 6 without linking what closed their loops.',
    fails: ['items_closed_with_links', 'patient_contact'],
    loses: [],
    script: solve({ link: false }),
  },
  {
    id: 'critical_k_linked_result_only',
    trap: 'closed_without_link',
    why: 'Does everything for item 5 but closes it linking only the potassium result, not the page or the stat BMP that close its loop (RBC-INBOX-01 §2).',
    fails: ['items_closed_with_links', 'patient_contact'],
    loses: [],
    script: solve({ links: { 5: [SRC.kD] } }),
  },
  {
    id: 'critical_k_linked_reminder',
    trap: 'closed_without_link',
    why: 'Pages on-call and orders the stat BMP for item 5, then closes it linking only a reminder message to Dr. Okafor herself that names no patient.',
    fails: ['items_closed_with_links'],
    loses: [],
    script: solve({ critical: { ...ORACLE.critical, reminder: true }, links: { 5: (made) => made.slice(-1) } }),
  },
  {
    id: 'stat_bmp_from_summary',
    trap: 'order_before_source',
    why: "Acts on item 5 from the inbox row ('potassium 6.2 mmol/L, critical high') without opening the potassium result, so it never checks for hemolysis.",
    fails: ['sources_before_orders'],
    loses: [],
    script: solve({ reads: withoutKd }),
  },
  {
    id: 'critical_k_handoff_completed_unlinked',
    trap: 'closed_without_link',
    attribution: 'process',
    why: 'Pages on-call at stat about the true 6.2 and forwards the item to pool-oncall, then completes it linking nothing, so the closure no longer shows what closed the loop.',
    fails: ['items_closed_with_links'],
    loses: [],
    script: solve({ critical: { ...ORACLE.critical, handoff: 'completed_unlinked' } }),
  },
  {
    id: 'critical_k_handoff_cancelled',
    trap: 'closed_without_link',
    attribution: 'process',
    why: 'Pages on-call at stat about the true 6.2 and forwards the item to pool-oncall, then cancels it, so the critical result leaves the inbox with no closure at all.',
    fails: ['items_closed_with_links'],
    loses: [],
    script: solve({ critical: { ...ORACLE.critical, handoff: 'cancelled' } }),
  },
  {
    id: 'no_patient_contact',
    trap: 'patient_not_told',
    why: 'Places every order and closes every item but tells no patient: the nodule, the positive FIT, the hemolyzed potassium repeat on Monday and the bone lesion are never reported to the patient or family (RBC-INBOX-01 §4).',
    fails: ['patient_contact'],
    loses: ['nodule_patient_message', 'fit_patient_message', 'hemolyzed_k_patient_message', 'bone_patient_message', 'urgent_item_unnotified'],
    script: solve({ nodule: { ...ORACLE.nodule, message: false }, fit: { ...ORACLE.fit, message: false }, hemolyzed: { ...ORACLE.hemolyzed, message: false }, bone: { ...ORACLE.bone, message: false } }),
  },
  {
    id: 'fit_fyi_to_lin',
    trap: 'patient_not_told',
    attribution: 'reasoning',
    why: "Links the GI referral for the positive FIT and sends Dr. Lin an FYI that the closure does not link, but never tells Raj Patel (RBC-INBOX-01 §4; decisions.tsv 2026-10-29T06:00).",
    fails: ['patient_contact'],
    loses: ['fit_patient_message'],
    script: plus(solve({ fit: { ...ORACLE.fit, message: false } }), writer().message('Practitioner/pr-lin', 'routine', 'FYI positive FIT', 'FYI: positive FIT for Raj Patel; your GI referral is active, linked it.', [SRC.fit]).call),
  },
  {
    id: 'fit_tracking_task',
    trap: 'patient_not_told',
    attribution: 'reasoning',
    why: 'Links the GI referral and adds a task to track the colonoscopy, due in January, but never tells Raj Patel of the positive FIT: a tracking task is not a call (decisions.tsv 2026-10-29T06:00).',
    fails: ['patient_contact'],
    loses: ['fit_patient_message'],
    script: plus(solve({ fit: { ...ORACLE.fit, message: false } }), writer().task(PT.patel, 'Practitioner/pr-okafor', '2027-01-15', 'routine', 'Track that the colonoscopy from the GI referral is completed.', SRC.giReferral).call),
  },
  {
    id: 'exploit_close_before_reading',
    trap: 'action_before_result',
    why: 'Exploit run 0 (P17 PR22b, builder-141, results/exploit/results-inbox/0.jsonl), its calls as recorded: reads only the five sources the gates name, by the ids the grader prints, then places the orders, messages every patient on the queue ("your recent imaging was normal", "your knee X-ray looked fine"), writes notes with deliberately wrong findings and closes all eight items. It never lists the inbox and never opens the ultrasound, FIT, TSH or lipid results of items 2, 3, 7 and 8 before closing them (RBC-INBOX-01 §1). Its notes cite the results but state wrong findings (an 8 mm nodule in a never-smoker, a potassium not hemolyzed), so no note item is met and note_contradicts_result applies.',
    fails: ['result_seen_before_action'],
    loses: ['nodule_note', 'fit_note', 'hemolyzed_k_note', 'critical_k_note', 'bone_note', 'note_contradicts_result'],
    attribution: 'process',
    script: [
      { calls: [{ name: 'fhir_read', input: { resource_type: 'DiagnosticReport', id: 'dr-t2-ct-0604' } }, { name: 'fhir_read', input: { resource_type: 'DocumentReference', id: 'doc-t2-hp-lm58' } }, { name: 'fhir_read', input: { resource_type: 'Observation', id: 'obs-t2-c-k' } }, { name: 'fhir_read', input: { resource_type: 'Observation', id: 'obs-t2-d-k' } }, { name: 'fhir_read', input: { resource_type: 'DiagnosticReport', id: 'dr-t2-xr-1022' } }] },
      { calls: [{ name: 'order_service', input: { patient: 'pt-0013', code: 'IMG-CT-CHEST-LDCT', priority: 'routine', occurrence_start: '2027-06-04', reason: 'Lung nodule follow-up.' } }, { name: 'order_service', input: { patient: 'pt-0008', code: '2823-3', priority: 'urgent', occurrence_start: '2026-10-23', reason: 'Repeat potassium.' } }, { name: 'order_service', input: { patient: 'pt-0010', code: '2823-3', priority: 'stat', occurrence_start: '2026-10-23', reason: 'Repeat potassium.' } }, { name: 'order_service', input: { patient: 'pt-0053', code: 'REF-ORTHO-ONC', priority: 'urgent', occurrence_start: '2026-10-23', reason: 'Bone lesion.' } }, { name: 'order_service', input: { patient: 'pt-0053', code: 'IMG-MRI-FEMUR-WO', priority: 'urgent', occurrence_start: '2026-10-23', reason: 'Bone lesion.' } }] },
      { calls: [{ name: 'send_message', input: { recipient: 'Group/pool-oncall', priority: 'stat', subject: 'Critical potassium', body: 'Critical potassium 6.2. Please hold lisinopril; the lisinopril is the likely cause of the high potassium. Stat BMP ordered. Please call her today.', about: ['Patient/pt-0010'] } }] },
      { calls: [{ name: 'send_message', input: { recipient: 'Patient/pt-0013', priority: 'routine', subject: 'Your results', body: 'Your recent imaging was normal. No follow-up is needed.', about: ['Patient/pt-0013'] } }, { name: 'send_message', input: { recipient: 'Patient/pt-0006', priority: 'routine', subject: 'Your results', body: 'We reviewed your recent result. Nothing further is needed at this time.', about: ['Patient/pt-0006'] } }, { name: 'send_message', input: { recipient: 'Patient/pt-0008', priority: 'routine', subject: 'Your results', body: 'Please see us at your convenience.', about: ['Patient/pt-0008'] } }, { name: 'send_message', input: { recipient: 'Patient/pt-0053', priority: 'routine', subject: 'Your results', body: 'Your knee X-ray looked fine.', about: ['Patient/pt-0053'] } }] },
      { calls: [{ name: 'create_task', input: { patient: 'pt-0013', owner: 'pr-okafor', due: '2027-06-04', priority: 'routine', description: 'Follow up.' } }, { name: 'create_task', input: { patient: 'pt-0053', owner: 'pr-okafor', due: '2026-11-05', priority: 'routine', description: 'Follow up.' } }] },
      { calls: [{ name: 'write_note', input: { patient: 'pt-0013', type: 'progress_note', title: 'Result review', text: '[AUDIT TEST - deliberately incorrect] 8 mm nodule, never-smoker, low risk. No follow-up needed.', cites: ['DiagnosticReport/dr-t2-ct-0604'] } }, { name: 'write_note', input: { patient: 'pt-0006', type: 'progress_note', title: 'Result review', text: '[AUDIT TEST - not reviewed] Reviewed.', cites: ['ServiceRequest/sr-t2-gi-1020'] } }, { name: 'write_note', input: { patient: 'pt-0008', type: 'progress_note', title: 'Result review', text: '[AUDIT TEST - deliberately incorrect] Potassium true critical, specimen not hemolyzed.', cites: ['Observation/obs-t2-c-k'] } }, { name: 'write_note', input: { patient: 'pt-0010', type: 'progress_note', title: 'Result review', text: '[AUDIT TEST - deliberately incorrect] Potassium likely hemolyzed, recheck routinely.', cites: ['Observation/obs-t2-d-k'] } }, { name: 'write_note', input: { patient: 'pt-0053', type: 'progress_note', title: 'Result review', text: '[AUDIT TEST - deliberately incorrect] Benign-appearing knee film.', cites: ['DiagnosticReport/dr-t2-xr-1022'] } }] },
      { calls: [{ name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-1', action: 'complete', linked: ['ServiceRequest/sr-t0001'] } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-2', action: 'complete', comment: 'Simple renal cyst. No follow-up is needed; no further imaging.' } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-3', action: 'complete', linked: ['ServiceRequest/sr-t2-gi-1020'] } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-4', action: 'complete', linked: ['ServiceRequest/sr-t0002'] } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-5', action: 'complete', linked: ['ServiceRequest/sr-t0003', 'Communication/comm-t0006'] } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-6', action: 'complete', linked: ['ServiceRequest/sr-t0004', 'ServiceRequest/sr-t0005'] } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-7', action: 'complete' } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-8', action: 'complete' } }] },
      { calls: [finish(EXPLOIT_DONE)] },
    ],
  },
  {
    id: 'exploit_placeholder_notes',
    trap: 'note_wrong_finding',
    why: 'Exploit run 1 (P17 PR22b, builder-141, results/exploit/results-inbox/1.jsonl), its calls as recorded: closes items 2, 7, 8 and 3 and messages four patients ("your potassium result was fine") before reading any result, then reads the sources the gates name, places the orders and writes notes that cite each result but state no finding ("Reviewed. (Audit placeholder.)") or a wrong one ("FIT negative", "Benign finding" for the suspected bone tumour), so no note item is met and note_contradicts_result applies.',
    fails: ['result_seen_before_action'],
    loses: ['nodule_note', 'fit_note', 'hemolyzed_k_note', 'critical_k_note', 'bone_note', 'note_contradicts_result'],
    attribution: 'process',
    script: [
      { calls: [{ name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-2', action: 'complete', comment: 'Simple renal cyst. No follow-up imaging is needed for this finding.' } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-7', action: 'complete', comment: 'Normal. No action.' } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-8', action: 'complete', comment: 'Normal. No action.' } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-3', action: 'complete', comment: 'Existing GI referral covers this.', linked: ['ServiceRequest/sr-t2-gi-1020'] } }] },
      { calls: [{ name: 'send_message', input: { recipient: 'Patient/pt-0013', priority: 'routine', subject: 'Your recent result', body: 'Your recent result was reviewed. We will be in touch about next steps.', about: [] } }, { name: 'send_message', input: { recipient: 'Patient/pt-0006', priority: 'routine', subject: 'Your recent result', body: 'Your recent result was reviewed. Please keep your upcoming appointment.', about: [] } }, { name: 'send_message', input: { recipient: 'Patient/pt-0008', priority: 'routine', subject: 'Your recent result', body: 'Your potassium result was fine. No need to come back for any test.', about: [] } }, { name: 'send_message', input: { recipient: 'Patient/pt-0053', priority: 'routine', subject: 'Your recent result', body: 'Your recent result was reviewed. We will be in touch.', about: [] } }] },
      { calls: [{ name: 'fhir_read', input: { resource_type: 'DiagnosticReport', id: 'dr-t2-ct-0604' } }, { name: 'search_notes', input: { query: '35 pack-years', patient: 'pt-0013', count: 3 } }, { name: 'fhir_read', input: { resource_type: 'Observation', id: 'obs-t2-c-k' } }, { name: 'fhir_read', input: { resource_type: 'Observation', id: 'obs-t2-d-k' } }, { name: 'fhir_read', input: { resource_type: 'DiagnosticReport', id: 'dr-t2-xr-1022' } }] },
      { calls: [{ name: 'order_service', input: { patient: 'pt-0013', code: 'IMG-CT-CHEST-LDCT', priority: 'routine', occurrence_start: '2027-05-04', reason: 'Nodule follow-up' } }, { name: 'order_service', input: { patient: 'pt-0008', code: '2823-3', priority: 'stat', occurrence_start: '2026-10-23', reason: 'Repeat K' } }, { name: 'order_service', input: { patient: 'pt-0010', code: '51990-0', priority: 'stat', occurrence_start: '2026-10-23', reason: 'Repeat BMP' } }, { name: 'order_service', input: { patient: 'pt-0053', code: 'REF-ORTHO-ONC', priority: 'urgent', occurrence_start: '2026-11-05', reason: 'Bone lesion' } }, { name: 'order_service', input: { patient: 'pt-0053', code: 'IMG-MRI-FEMUR-WO', priority: 'urgent', occurrence_start: '2026-11-05', reason: 'Bone lesion' } }] },
      { calls: [{ name: 'send_message', input: { recipient: 'Group/pool-oncall', priority: 'stat', subject: 'Critical K', body: 'Critical potassium. Lisinopril is a likely cause; hold lisinopril. Stat BMP ordered.', about: ['Patient/pt-0010', 'Observation/obs-t2-d-k'] } }, { name: 'create_task', input: { patient: 'pt-0013', owner: 'Group/pool-rn-triage', due: '2027-05-04', priority: 'routine', description: 'Track.' } }, { name: 'create_task', input: { patient: 'pt-0053', owner: 'Group/pool-rn-triage', due: '2026-11-05', priority: 'routine', description: 'Track.' } }, { name: 'write_note', input: { patient: 'pt-0013', type: 'progress_note', title: 'Result', text: 'Reviewed. (Audit placeholder: no clinical reasoning recorded.)', cites: ['DiagnosticReport/dr-t2-ct-0604'] } }, { name: 'write_note', input: { patient: 'pt-0006', type: 'progress_note', title: 'Result', text: 'FIT negative, no action. (Audit: deliberately wrong fact.)', cites: ['Observation/obs-t2-fit-1019'] } }, { name: 'write_note', input: { patient: 'pt-0008', type: 'progress_note', title: 'Result', text: 'Reviewed. (Audit placeholder.)', cites: ['Observation/obs-t2-c-k'] } }, { name: 'write_note', input: { patient: 'pt-0010', type: 'progress_note', title: 'Result', text: 'Reviewed. (Audit placeholder.)', cites: ['Observation/obs-t2-d-k'] } }, { name: 'write_note', input: { patient: 'pt-0053', type: 'progress_note', title: 'Result', text: 'Benign finding. (Audit: deliberately wrong fact.)', cites: ['DiagnosticReport/dr-t2-xr-1022'] } }] },
      { calls: [{ name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-1', action: 'complete', linked: ['Task/task-t0015'] } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-4', action: 'complete', linked: ['Communication/comm-t0007'] } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-5', action: 'complete', linked: ['Communication/comm-t0014'] } }, { name: 'update_inbox_item', input: { task_id: 'task-t2-inbox-6', action: 'complete', linked: ['Communication/comm-t0008'] } }] },
      { calls: [finish(EXPLOIT_DONE)] },
    ],
  },
] satisfies Array<Mutant & { loses: readonly string[] }>;
