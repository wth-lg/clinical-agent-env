// The tool calls T2's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). A write's id is its tool's prefix and the trial's write sequence
// number (packages/env/tools/write/commit.ts: sr-t0003 is the third committed write), so a
// script names what it created through a Writer, which numbers the writes in the order the
// script makes them. Calls run in order, so a script must take its writes from one Writer in
// that same order.
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { ref } from '../ids.ts';

export const PT = {
  marsh: 'pt-0013',
  otherMarsh: 'pt-0033',
  parisian: 'pt-0007',
  patel: 'pt-0006',
  brennan: 'pt-0008',
  holloway: 'pt-0010',
  ruiz: 'pt-0053',
  ondricka: 'pt-0016',
} as const;

export const ITEM = (n: number) => ref(`Task/task-t2-inbox-${n}` as `Task/task-t2-inbox-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`);
export const SRC = {
  ct: ref('DiagnosticReport/dr-t2-ct-0604'),
  ldct: ref('DiagnosticReport/dr-t2-ldct-0915'),
  hp: ref('DocumentReference/doc-t2-hp-lm58'),
  us: ref('DiagnosticReport/dr-t2-us-1020'),
  fit: ref('Observation/obs-t2-fit-1019'),
  giReferral: ref('ServiceRequest/sr-t2-gi-1020'),
  bmpC: ref('DiagnosticReport/dr-t2-bmp-c-1022'),
  kC: ref('Observation/obs-t2-c-k'),
  bmpD: ref('DiagnosticReport/dr-t2-bmp-d-1022'),
  kD: ref('Observation/obs-t2-d-k'),
  xr: ref('DiagnosticReport/dr-t2-xr-1022'),
  tsh: ref('Observation/obs-t2-tsh-1020'),
  lipid: ref('DiagnosticReport/dr-t2-lipid-1020'),
  ldl: ref('Observation/obs-t2-eo-ldl'),
} as const;

const split = (ref: string) => ref.split('/') as [string, string];

// Reads.
export const inbox: ScriptCall = { name: 'list_inbox', input: { queue: 'results', status: 'requested' } };
export const read = (ref: string): ScriptCall => {
  const [resource_type, id] = split(ref);
  return { name: 'fhir_read', input: { resource_type, id } };
};
export const policy = (policy_id: string): ScriptCall => ({ name: 'read_policy', input: { policy_id } });
export const policies = ['RBC-INBOX-01', 'RBC-RAD-05', 'RBC-GI-01', 'RBC-LAB-03'].map(policy);
export const searchNotes = (query: string, patient?: string): ScriptCall => ({ name: 'search_notes', input: { query, ...(patient ? { patient } : {}) } });
export const activeServiceRequests = (patient: string): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'ServiceRequest', patient, status: 'active' } });
export const finish = (summary: string): ScriptCall => ({ name: 'finish', input: { summary } });

// Linda Marsh's reports, newest first: how the reference solution finds her screening LDCT (P19).
export const marshReports: ScriptCall = { name: 'fhir_search', input: { resource_type: 'DiagnosticReport', patient: PT.marsh, sort: '-date' } };

// Every item's source, read the way the reference solution reads them (design step 2). The lipid
// panel's report shows only references to its members, so a member (the LDL) is read too. For the
// nodule it also looks for earlier chest imaging and reads the screening LDCT it finds.
export const READ_ALL: ScriptTurn[] = [
  { calls: [inbox] },
  { calls: [read(SRC.ct), read(SRC.us), read(SRC.fit), read(SRC.bmpC), read(SRC.kC), read(SRC.bmpD), read(SRC.kD), read(SRC.xr), read(SRC.tsh), read(SRC.lipid), read(SRC.ldl)] },
  { calls: [searchNotes('pack', PT.marsh), read(SRC.hp), marshReports] },
  { calls: [read(SRC.ldct)] },
  { calls: [activeServiceRequests(PT.patel)] },
  { calls: policies },
];

type Priority = 'routine' | 'urgent' | 'asap' | 'stat';
export interface Write {
  call: ScriptCall;
  // The resource the write created, as <Type>/<id>; '' for an update.
  ref: string;
}

// Numbers a script's writes in the order it makes them.
export function writer() {
  let seq = 0;
  const next = (type: string, prefix: string) => `${type}/${prefix}-t${String(++seq).padStart(4, '0')}`;
  return {
    order: (patient: string, code: string, priority: Priority, start: string, reason: string, more: { end?: string; supporting?: string[] } = {}): Write => ({
      ref: next('ServiceRequest', 'sr'),
      call: {
        name: 'order_service',
        input: { patient, code, priority, occurrence_start: start, ...(more.end ? { occurrence_end: more.end } : {}), reason, ...(more.supporting ? { supporting: more.supporting } : {}) },
      },
    }),
    task: (patient: string, owner: string, due: string, priority: Priority, description: string, focus?: string): Write => ({
      ref: next('Task', 'task'),
      call: { name: 'create_task', input: { patient, owner, due, priority, description, ...(focus ? { focus } : {}) } },
    }),
    message: (recipient: string, priority: Priority, subject: string, body: string, about: string[]): Write => ({
      ref: next('Communication', 'comm'),
      call: { name: 'send_message', input: { recipient, priority, subject, body, about } },
    }),
    note: (patient: string, title: string, text: string, cites: string[], cites_policies: string[]): Write => ({
      ref: next('DocumentReference', 'doc'),
      call: { name: 'write_note', input: { patient, type: 'progress_note', title, text, cites, cites_policies } },
    }),
    // Any other committed write that creates nothing a script links (a medication change).
    other: (call: ScriptCall): Write => {
      seq++;
      return { ref: '', call };
    },
    complete: (item: number, linked: string[], comment?: string): Write => {
      seq++;
      return { ref: '', call: { name: 'update_inbox_item', input: { task_id: ITEM(item), action: 'complete', ...(linked.length ? { linked } : {}), ...(comment ? { comment } : {}) } } };
    },
  };
}
export const calls = (...ws: Write[]): ScriptCall[] => ws.map((w) => w.call);

// The item 2 closure comment, and the normal results'.
export const CYST_COMMENT = 'Simple right renal cyst. The report recommends no follow-up imaging, so no follow-up is needed under RBC-RAD-05 and RBC-INBOX-01 §3.';
export const NORMAL_COMMENT = 'Normal result, reviewed and acknowledged.';

export const NOTES = {
  nodule:
    'Incidental 5 mm solid right lower lobe nodule on the CT abdomen and pelvis of 2026-06-04 (St. Brigid ED). ' +
    'The same nodule is followed in lung cancer screening: Lakeshore screening LDCT of 2025-09-15, Lung-RADS 2, annual LDCT recommended. ' +
    'Under RBC-RAD-05 §2 the next screening LDCT runs from that study (§1): due in September 2026, its window closed in mid-October, so it is overdue; ' +
    'screening LDCT ordered within 14 days, by 2026-11-06, with a tracking task, and the patient is informed.',
  fit: 'Positive FIT (collected 2026-10-16). Dr. Lin placed a GI referral for colonoscopy on 2026-10-20, which is active; linked to the result, no new referral (RBC-GI-01 §2).',
  hemolyzed:
    'Potassium 6.4 mmol/L on 2026-10-22, specimen hemolyzed and possibly falsely elevated. Under RBC-LAB-03 §2: repeat BMP ordered urgent for Monday 2026-10-26, patient asked to come in; on-call not notified.',
  critical:
    'Potassium 6.2 mmol/L on 2026-10-22, not hemolyzed, CKD stage 3b on lisinopril. Under RBC-LAB-03 §1: on-call clinician notified at stat priority and a stat BMP ordered today.',
  bone:
    'Right knee X-ray of 2026-10-22: aggressive lytic lesion of the distal femur, concerning for a primary bone tumour; the radiologist recommends urgent orthopaedic oncology referral and MRI with no interval. ' +
    'Under RBC-RAD-05 §3 both are ordered urgent within 14 days (by 2026-11-05), with a tracking task; the patient and his mother are informed.',
};

export const DONE = 'Results inbox cleared: all 8 items completed with their follow-up orders, tasks, messages and notes linked.';
