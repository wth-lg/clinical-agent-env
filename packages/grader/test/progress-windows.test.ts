// Rule P-L calibration (packages/grader/progress.ts; verifier-phase-P17i-W0-A-r2-1 F3): a cap
// can fall after any call, so every window position must read as it should, not a few sample
// points. Every 20-call window of every committed pilot-1 and pilot-2 trajectory, and every cut of
// the worklist shapes W1-W10 (the real tools' shapes: fhir_read names its id, inbox rows are
// references, every write adds a Provenance id) at 12, 16 and 20 items, reads as not looping.
// The thresholds change here (in W0-A), never later.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventBody, TrialEvent } from '../../core/events.ts';
import { progress, PROGRESS_TAIL } from '../progress.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';

// Every prefix of the trajectory that ends at its k-th executed call, k >= PROGRESS_TAIL.
function cuts(events: readonly EventBody[]): Array<{ call: number; events: readonly EventBody[] }> {
  const ends = events.flatMap((e, i) => (e.type === 'tool_result' && e.executed ? [i] : []));
  return ends.slice(PROGRESS_TAIL - 1).map((end, k) => ({ call: k + PROGRESS_TAIL, events: events.slice(0, end + 1) }));
}

describe('rule P-L on every window of pilot-1 and pilot-2', () => {
  const files = ['results/pilot-1', 'results/pilot-2'].flatMap((run) => {
    const dir = join(repoRoot, run, 'trajectories');
    return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => join(e.parentPath, e.name));
  });
  const trajectory = (file: string) => readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as TrialEvent);

  it('reads 66 committed trajectories (18 pilot-1, 48 pilot-2) and 2030 windows', () => {
    expect(files).toHaveLength(66);
    expect(files.reduce((k, f) => k + cuts(trajectory(f)).length, 0)).toBe(2030);
  });

  it('no window reads as looping', () => {
    const looping = files.flatMap((f) => cuts(trajectory(f)).filter((c) => progress(c.events).looping).map((c) => `${f.slice(repoRoot.length + 1)} after call ${c.call}: ${JSON.stringify(progress(c.events))}`));
    expect(looping).toEqual([]);
  });
});

type Call = { name: string; input: object; exposed?: string[]; written?: string[] };
const eventsOf = (calls: readonly Call[]): EventBody[] => calls.flatMap((c, i) => [
  { type: 'tool_call', turn: i + 1, tool_use_id: `u${i}`, name: c.name, input: c.input },
  { type: 'tool_result', turn: i + 1, tool_use_id: `u${i}`, name: c.name, executed: true, is_error: false, error_code: null, content: {}, exposed_ids: c.exposed ?? [], referenced_ids: [], ...(c.written ? { written_ids: c.written } : {}) },
]);

// The worklist probes of verifier-phase-P17i-W0-A-r2-1 (evidence probes/zz-verifier-worklist.test.ts).
let prov = 0;
const P = () => `Provenance/prov-t${String(++prov).padStart(4, '0')}`;
const opening: Call[] = [
  { name: 'get_context', input: {} },
  { name: 'read_policy', input: { policy_id: 'RBC-INBOX-01' }, exposed: ['Policy/RBC-INBOX-01'] },
  { name: 'list_inbox', input: { queue: 'results' } },
];
const read = (type: string, id: string): Call => ({ name: 'fhir_read', input: { resource_type: type, id }, exposed: [`${type}/${id}`] });
const complete = (i: number): Call => ({ name: 'update_inbox_item', input: { task_id: `task-in-${i}`, action: 'complete', linked: [`DiagnosticReport/dr-${i}`], comment: `reviewed ${i}` }, written: [P(), `Task/task-in-${i}`] });
const note = (i: number): Call => ({ name: 'write_note', input: { patient: `pt-${i}`, type: 'progress_note', title: `Result review ${i}`, text: `t${i}`, cites: [`DiagnosticReport/dr-${i}`] }, written: [`DocumentReference/doc-n${i}`, P()] });
const policyAgain: Call = { name: 'read_policy', input: { policy_id: 'RBC-INBOX-01' }, exposed: ['Policy/RBC-INBOX-01'] };
const history = (i: number): Call => ({ name: 'fhir_search', input: { resource_type: 'Observation', patient: `pt-${i}`, code: '2823-3' }, exposed: [`Observation/h-${i}-a`, `Observation/h-${i}-b`] });
const emptySearch = (i: number, rt: string): Call => ({ name: 'fhir_search', input: { resource_type: rt, patient: `pt-${i}` } });
const catalog = (q: string): Call => ({ name: 'lookup_catalog', input: { query: q, kind: 'lab' } });
const worklist = (items: number, perItem: (i: number) => Call[]): Call[] => {
  prov = 0;
  return [...opening, ...Array.from({ length: items }, (_, i) => perItem(i + 1)).flat()];
};
const WORKLISTS: Record<string, (n: number) => Call[]> = {
  'W1 read result, complete': (n) => worklist(n, (i) => [read('DiagnosticReport', `dr-${i}`), complete(i)]),
  'W2 read result, read patient, complete': (n) => worklist(n, (i) => [read('DiagnosticReport', `dr-${i}`), read('Patient', `pt-${i}`), complete(i)]),
  'W3 read result, read patient, note, complete': (n) => worklist(n, (i) => [read('DiagnosticReport', `dr-${i}`), read('Patient', `pt-${i}`), note(i), complete(i)]),
  'W4 result, patient, policy again, complete': (n) => worklist(n, (i) => [read('DiagnosticReport', `dr-${i}`), read('Patient', `pt-${i}`), policyAgain, complete(i)]),
  'W5 result, patient, prior result, policy again, complete': (n) => worklist(n, (i) => [read('DiagnosticReport', `dr-${i}`), read('Patient', `pt-${i}`), read('DiagnosticReport', `dr-prev-${i}`), policyAgain, complete(i)]),
  'W6 result, patient, history search, policy again, complete': (n) => worklist(n, (i) => [read('DiagnosticReport', `dr-${i}`), read('Patient', `pt-${i}`), history(i), policyAgain, complete(i)]),
  'W7 result, patient, two empty searches, catalog, complete': (n) => worklist(n, (i) => [read('DiagnosticReport', `dr-${i}`), read('Patient', `pt-${i}`), emptySearch(i, 'ServiceRequest'), emptySearch(i, 'Communication'), catalog(`bmp ${i}`), complete(i)]),
  'W8 med rec on one patient: read MR, catalog, continue': (n) => {
    prov = 0;
    return [...opening, read('Patient', 'pt-1'), ...Array.from({ length: n }, (_, k) => [read('MedicationRequest', `mr-${k + 1}`), catalog(`rx ${k + 1}`), { name: 'change_medication', input: { medication_request: `mr-${k + 1}`, action: 'continue', reason: `ok ${k + 1}` }, written: [`MedicationRequest/mr-${k + 1}`, P()] }]).flat()];
  },
  'W9 read every item first, then write all': (n) => {
    prov = 0;
    return [...opening, ...Array.from({ length: n }, (_, k) => [read('DiagnosticReport', `dr-${k + 1}`), read('Patient', `pt-${k + 1}`)]).flat(), ...Array.from({ length: n }, (_, k) => complete(k + 1))];
  },
  'W10 one member search paged 5 times, then a search and an order per item': (n) => {
    prov = 0;
    const pages = Array.from({ length: 5 }, (_, pg): Call => ({ name: 'fhir_search', input: { resource_type: 'Patient', general_practitioner: 'pr-okafor', count: 10, offset: pg * 10 }, exposed: Array.from({ length: 10 }, (_, j) => `Patient/m-${pg * 10 + j}`) }));
    return [...opening, ...pages, ...Array.from({ length: n }, (_, k): Call[] => [{ name: 'fhir_search', input: { resource_type: 'Observation', patient: `m-${k}`, code: '29771-3' } }, { name: 'order_service', input: { patient: `m-${k}`, code: 'LAB-FIT', priority: 'routine', occurrence_start: '2026-11-01', reason: 'gap' }, written: [`ServiceRequest/sr-${k}`, P()] }]).flat()];
  },
};

describe('rule P-L on progressing worklists, at every cut', () => {
  for (const [name, build] of Object.entries(WORKLISTS)) {
    it.each([12, 16, 20])(`${name}, %i items: no cut reads as looping`, (items) => {
      const all = cuts(eventsOf(build(items)));
      expect(all.length).toBeGreaterThan(0);
      expect(all.filter((c) => progress(c.events).looping).map((c) => `after call ${c.call}: ${JSON.stringify(progress(c.events))}`)).toEqual([]);
    });
  }
});
