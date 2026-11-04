// The tool calls T2's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). A write's id is its tool's prefix and the trial's write sequence
// number (packages/env/tools/write/commit.ts: sr-t0003 is the third committed write), so a
// script names what it created through a Writer, which numbers the writes in the order the
// script makes them. Calls run in order, so a script must take its writes from one Writer in
// that same order. A rejected write takes no number.
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { LEVER } from '../expected.ts';
import { idOf, ref, refOf } from '../ids.ts';

export const PT = {
  marsh: 'pt-0013',
  whitfield: 'pt-0033',
  patel: 'pt-0006',
  parisian: 'pt-0007',
  brennan: 'pt-0008',
  holloway: 'pt-0010',
  ruiz: 'pt-0053',
  ondricka: 'pt-0016',
  // W5-E's lever hosts (overlay.ts LEVER_HOSTS): in the world, and the registry, while their item
  // is in expected.ts LEVER; otherwise their key, which no script names.
  marchetti: idOf('pt-t2-marchetti'),
  nowicki: idOf('pt-t2-nowicki'),
  cipriani: idOf('pt-t2-cipriani'),
} as const;
const lever = (_l: string, key: `${string}/${string}`) => refOf(key);

export const ITEM = (n: number) => refOf(`Task/task-t2-inbox-${n}`);
export const SRC = {
  ct: ref('DiagnosticReport/dr-t2-ct-0604'),
  ldct: ref('DiagnosticReport/dr-t2-ldct-0915'),
  hp: ref('DocumentReference/doc-t2-hp-lm58'),
  ctRp: ref('DiagnosticReport/dr-t2-ct-rp-1019'),
  ldctRp: ref('DiagnosticReport/dr-t2-ldct-rp-0414'),
  hpRp: ref('DocumentReference/doc-t2-hp-rp57'),
  bmpRp: ref('DiagnosticReport/dr-t2-bmp-rp'),
  kRp: ref('Observation/obs-t2-rp-k'),
  bmpC: ref('DiagnosticReport/dr-t2-bmp-c-1022'),
  kC: ref('Observation/obs-t2-c-k'),
  bmpD: ref('DiagnosticReport/dr-t2-bmp-d-1022'),
  kD: ref('Observation/obs-t2-d-k'),
  xrPrelim: ref('DiagnosticReport/dr-t2-xr-prelim-1021'),
  xr: ref('DiagnosticReport/dr-t2-xr-1022'),
  tsh: ref('Observation/obs-t2-tsh-1020'),
  kEo: ref('Observation/obs-t2-eo-k-1020'),
  fit: ref('Observation/obs-t2-eo-fit-1019'),
  bmpCw: ref('DiagnosticReport/dr-t2-bmp-cw'),
  crCw: ref('Observation/obs-t2-cw-cr'),
  crCwVoid: ref('Observation/obs-t2-cw-cr-1021'),
  ctaPrelim: ref('DiagnosticReport/dr-t2-cta-prelim-1020'),
  cta: ref('DiagnosticReport/dr-t2-cta-1021'),
  bmpLp: ref('DiagnosticReport/dr-t2-bmp-lp'),
  crLp: ref('Observation/obs-t2-lp-cr'),
  crLpEd: ref('Observation/obs-t2-lped-cr'),
  bmpLm: ref('DiagnosticReport/dr-t2-bmp-lm'),
  crLm: ref('Observation/obs-t2-lm-cr'),
  crLmUc: ref('Observation/obs-t2-lmuc-cr'),
  // W5-E lever hosts.
  bmpHmEd: lever('A', 'DiagnosticReport/dr-t2-bmp-hmed'),
  crHmEd: lever('A', 'Observation/obs-t2-hmed-cr'),
  crHmRecheck: lever('A', 'Observation/obs-t2-hm-cr-recheck'),
  faxJk: lever('B', 'DocumentReference/doc-t2-jk-fax-1021'),
  ptJk: `Patient/${PT.nowicki}`,
  ldctJk: lever('B', 'DiagnosticReport/dr-t2-jk-ldct-0610'),
  kRc: lever('reserve', 'Observation/obs-t2-rc-k'),
  egfrRc: lever('reserve', 'Observation/obs-t2-rc-egfr'),
  spironolactoneRc: lever('reserve', 'MedicationRequest/mr-t2-rc-spironolactone'),
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
export const finish = (summary: string): ScriptCall => ({ name: 'finish', input: { summary } });

// A patient's reports, newest first: how the oracle finds a screening LDCT and a final report.
export const reportsOf = (patient: string): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'DiagnosticReport', patient, sort: '-date' } });
// A patient's creatinines, newest first: how the oracle finds the values RBC-LAB-03 §3 compares.
export const creatininesOf = (patient: string): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'Observation', patient, code: '2160-0,38483-4', sort: '-date' } });

// The reads behind each item, in inbox order. A lab panel's report shows only references to its
// members, so the member the item turns on is read too.
// A patient's active orders: how the oracle finds the potassium-raising drug of the reserve item.
export const activeOrdersOf = (patient: string): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'MedicationRequest', patient, status: 'active' } });
// A patient's eGFR results, newest first (RESERVE_SENTENCE's "most recent eGFR").
export const egfrOf = (patient: string): ScriptCall => ({ name: 'fhir_search', input: { resource_type: 'Observation', patient, code: '98979-8,33914-3,62238-1', sort: '-date' } });
export const ITEM_READS: Record<string, ScriptCall[]> = {
  nodule_scheduled: [read(SRC.ctRp), reportsOf(PT.patel), read(SRC.ldctRp)],
  hemolyzed_note: [read(SRC.bmpC), read(SRC.kC)],
  normal_tsh: [read(SRC.tsh)],
  corrected_down: [read(SRC.kEo)],
  eie_baseline: [read(SRC.bmpCw), read(SRC.crCw), creatininesOf(PT.whitfield)],
  prelim_negative: [read(SRC.ctaPrelim), reportsOf(PT.parisian), read(SRC.cta)],
  aki_48h: [read(SRC.bmpLp), read(SRC.crLp), creatininesOf(PT.parisian)],
  // W5-E (each only while its item is in LEVER; solve.ts reads the items that exist). The A host's
  // base work pulls her creatinines, so the held comparator is on the chart before the batch.
  ...(LEVER.includes('A') ? { marchetti_cr_ed: [read(SRC.bmpHmEd), read(SRC.crHmEd), creatininesOf(PT.marchetti)] } : {}),
  // RBC-INBOX-01 §1: the fax, then the patient's own identifiers (the Patient record).
  ...(LEVER.includes('B') ? { nowicki_fax: [read(SRC.faxJk), read(SRC.ptJk)] } : {}),
  ...(LEVER.includes('reserve') ? { cipriani_k_exception: [read(SRC.kRc), activeOrdersOf(PT.cipriani), egfrOf(PT.cipriani)] } : {}),
};

// The oracle's reads: the inbox, the policies, then each item's records in one answer per item.
export function readsWithout(drop: readonly ScriptCall[] = []): ScriptTurn[] {
  const gone = new Set(drop.map((c) => JSON.stringify(c)));
  const keep = (calls: ScriptCall[]) => calls.filter((c) => !gone.has(JSON.stringify(c)));
  return [{ calls: [inbox] }, { calls: policies }, ...Object.values(ITEM_READS).map((calls) => ({ calls: keep(calls) })).filter((t) => t.calls.length > 0)];
}
export const READ_ALL: ScriptTurn[] = readsWithout();

export type Priority = 'routine' | 'urgent' | 'asap' | 'stat';
export interface Write {
  call: ScriptCall;
  // The resource the write created, as <Type>/<id>; '' for an update or a rejected write.
  ref: string;
  // The patient the written resource is about, bare (pt-0006), if any; a rejected write commits
  // nothing and has none. A mid-trial event's after_write trigger reads it (solve.ts).
  patient?: string;
}

// The patient of a record a script names: an inbox item, an item's sources and results, or an
// arrival (registered by solve.ts).
const PATIENT_OF = new Map<string, string>();
export const notePatient = (ref: string, patient: string) => PATIENT_OF.set(ref, patient.replace(/^Patient\//, ''));
const patientOfRefs = (refs: readonly string[]) => refs.map((r) => PATIENT_OF.get(r)).find((p) => p !== undefined);

// Numbers a script's writes in the order it makes them.
export function writer() {
  let seq = 0;
  const next = (type: string, prefix: string) => `${type}/${prefix}-t${String(++seq).padStart(4, '0')}`;
  const bare = (p: string) => p.replace(/^Patient\//, '');
  return {
    order: (patient: string, code: string, priority: Priority, start: string, reason: string, more: { end?: string; supporting?: string[] } = {}): Write => ({
      ref: next('ServiceRequest', 'sr'),
      patient: bare(patient),
      call: {
        name: 'order_service',
        input: { patient, code, priority, occurrence_start: start, ...(more.end ? { occurrence_end: more.end } : {}), reason, ...(more.supporting ? { supporting: more.supporting } : {}) },
      },
    }),
    task: (patient: string, owner: string, due: string, priority: Priority, description: string, focus?: string): Write => ({
      ref: next('Task', 'task'),
      patient: bare(patient),
      call: { name: 'create_task', input: { patient, owner, due, priority, description, ...(focus ? { focus } : {}) } },
    }),
    message: (recipient: string, priority: Priority, subject: string, body: string, about: string[]): Write => ({
      ref: next('Communication', 'comm'),
      ...((): { patient?: string } => { const p = recipient.startsWith('Patient/') ? bare(recipient) : patientOfRefs(about); return p ? { patient: p } : {}; })(),
      call: { name: 'send_message', input: { recipient, priority, subject, body, about } },
    }),
    note: (patient: string, title: string, text: string, cites: string[], cites_policies: string[]): Write => ({
      ref: next('DocumentReference', 'doc'),
      patient: bare(patient),
      call: { name: 'write_note', input: { patient, type: 'progress_note', title, text, cites, cites_policies } },
    }),
    // Any other committed write that creates nothing a script links (a medication change, a reassign).
    other: (call: ScriptCall): Write => {
      seq++;
      const p = typeof call.input.task_id === 'string' ? PATIENT_OF.get(call.input.task_id) : typeof call.input.patient === 'string' ? bare(call.input.patient) : undefined;
      return { ref: '', call, ...(p ? { patient: p } : {}) };
    },
    // A write the tool refuses: it commits nothing and takes no number.
    rejected: (call: ScriptCall): Write => ({ ref: '', call }),
    complete: (item: number, linked: string[], comment?: string): Write => {
      seq++;
      const p = PATIENT_OF.get(ITEM(item));
      return { ref: '', call: { name: 'update_inbox_item', input: { task_id: ITEM(item), action: 'complete', ...(linked.length ? { linked } : {}), ...(comment ? { comment } : {}) } }, ...(p ? { patient: p } : {}) };
    },
    // Completes an inbox item that arrived during the trial (Task/inbox-a<k>).
    completeTask: (task: string, linked: string[], comment?: string): Write => {
      seq++;
      const p = PATIENT_OF.get(task);
      return { ref: '', call: { name: 'update_inbox_item', input: { task_id: task, action: 'complete', ...(linked.length ? { linked } : {}), ...(comment ? { comment } : {}) } }, ...(p ? { patient: p } : {}) };
    },
  };
}
export type Writer = ReturnType<typeof writer>;

export const DONE = 'Results inbox cleared: every item completed with its follow-up orders, tasks, messages and notes linked, and the results that arrived during the review checked and acted on.';
