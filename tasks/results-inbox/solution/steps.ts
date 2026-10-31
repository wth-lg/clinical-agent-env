// The tool calls T2's scripts are made of: the oracle (solve.ts) and the matrix's alternatives,
// mutants and agents (tests/). A write's id is its tool's prefix and the trial's write sequence
// number (packages/env/tools/write/commit.ts: sr-t0003 is the third committed write), so a
// script names what it created through a Writer, which numbers the writes in the order the
// script makes them. Calls run in order, so a script must take its writes from one Writer in
// that same order. A rejected write takes no number.
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { ref } from '../ids.ts';

export const PT = {
  marsh: 'pt-0013',
  whitfield: 'pt-0033',
  patel: 'pt-0006',
  parisian: 'pt-0007',
  brennan: 'pt-0008',
  holloway: 'pt-0010',
  ruiz: 'pt-0053',
  ondricka: 'pt-0016',
} as const;

export const ITEM = (n: number) => ref(`Task/task-t2-inbox-${n}` as `Task/task-t2-inbox-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13}`);
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
export const ITEM_READS: Record<string, ScriptCall[]> = {
  nodule_overdue: [read(SRC.ct), reportsOf(PT.marsh), read(SRC.ldct)],
  nodule_scheduled: [read(SRC.ctRp), reportsOf(PT.patel), read(SRC.ldctRp)],
  hemolyzed_report: [read(SRC.bmpRp), read(SRC.kRp)],
  hemolyzed_note: [read(SRC.bmpC), read(SRC.kC)],
  corrected_up: [read(SRC.bmpD), read(SRC.kD)],
  prelim_positive: [read(SRC.xrPrelim), reportsOf(PT.ruiz), read(SRC.xr)],
  normal_tsh: [read(SRC.tsh)],
  corrected_down: [read(SRC.kEo)],
  eie_result: [read(SRC.fit)],
  eie_baseline: [read(SRC.bmpCw), read(SRC.crCw), creatininesOf(PT.whitfield)],
  prelim_negative: [read(SRC.ctaPrelim), reportsOf(PT.parisian), read(SRC.cta)],
  aki_48h: [read(SRC.bmpLp), read(SRC.crLp), creatininesOf(PT.parisian)],
  aki_7day: [read(SRC.bmpLm), read(SRC.crLm), creatininesOf(PT.marsh)],
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
    // Any other committed write that creates nothing a script links (a medication change, a reassign).
    other: (call: ScriptCall): Write => {
      seq++;
      return { ref: '', call };
    },
    // A write the tool refuses: it commits nothing and takes no number.
    rejected: (call: ScriptCall): Write => ({ ref: '', call }),
    complete: (item: number, linked: string[], comment?: string): Write => {
      seq++;
      return { ref: '', call: { name: 'update_inbox_item', input: { task_id: ITEM(item), action: 'complete', ...(linked.length ? { linked } : {}), ...(comment ? { comment } : {}) } } };
    },
  };
}
export type Writer = ReturnType<typeof writer>;

export const DONE = 'Results inbox cleared: all 13 items completed with their follow-up orders, tasks, messages and notes linked.';
