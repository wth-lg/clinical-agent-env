// Near misses of the toy, one trap each (task.toml [matrix] traps): each must FAIL on exactly
// the gates it declares and lose exactly the rubric items it declares. The failure modes are
// ones a clinician would recognise on a real task.
import type { Mutant, ScriptCall } from '../../../packages/grader/matrix/types.ts';

const context: ScriptCall = { name: 'get_context', input: {} };
const read = (id: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type: 'Patient', id } });
const note = (over: Record<string, string | string[]> = {}): ScriptCall => ({
  name: 'write_note',
  input: { patient: 'pt-0001', type: 'progress_note', title: 'Tool check', text: 'Chart opened by Maya Okafor, MD, to check the tools.', cites: ['Patient/pt-0001'], ...over },
});
const finish = (summary: string): ScriptCall => ({ name: 'finish', input: { summary } });
const DONE = 'Signed in as Maya Okafor, MD, I wrote a progress note on the chart of Walter Kowalczyk.';

// The toy's event cases (events.ts): opening problem cond-00002 brings toy-a1's final potassium and
// toy-d1's preliminary one. Each mutant fails only the toy's event item, `note`, under its label.
const problem: ScriptCall = { name: 'fhir_read', input: { resource_type: 'Condition', id: 'cond-00002' } };
const result = (id: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type: 'Observation', id } });
const opened = { calls: [context, read('pt-0001'), problem] };
const citing = (...ids: string[]) => note({ cites: ['Patient/pt-0001', ...ids.map((id) => `Observation/${id}`)] });

export const mutants: Mutant[] = [
  {
    id: 'event_not_amended',
    event: { spec: 'toy-a1', kind: 'not_amended' },
    trap: 'arrival_not_acted_on',
    why: 'Reads the new potassium after it arrives and still writes the note as if it had not.',
    fails: ['amended'],
    loses: [],
    attribution: 'reasoning',
    items: { note: 'reasoning' },
    script: [opened, { calls: [result('obs-toy-a1'), result('obs-toy-d1')] }, { calls: [note()] }, { calls: [finish(DONE)] }],
  },
  {
    id: 'event_cited_unread',
    event: { spec: 'toy-a1', kind: 'unseen' },
    trap: 'missed_arrival',
    why: 'Cites the new potassium in the note without ever opening it.',
    fails: ['event_seen', 'amended'],
    loses: [],
    attribution: 'retrieval',
    items: { note: 'retrieval' },
    script: [opened, { calls: [result('obs-toy-d1')] }, { calls: [citing('obs-toy-a1')] }, { calls: [finish(DONE)] }],
  },
  {
    id: 'event_cited_before_read',
    event: { spec: 'toy-a1', kind: 'before_seen' },
    trap: 'amend_before_seen',
    why: 'Opens the new potassium in the same answer that writes the note citing it, so the note was written before the result was seen.',
    fails: ['amended'],
    loses: [],
    attribution: 'process',
    items: { note: 'process' },
    script: [opened, { calls: [result('obs-toy-d1'), result('obs-toy-a1'), citing('obs-toy-a1')] }, { calls: [finish(DONE)] }],
  },
  {
    id: 'event_lure_cited',
    event: { spec: 'toy-d1', kind: 'lure_acted_on' },
    trap: 'lure_acted_on',
    why: 'Cites the preliminary potassium, which does not count, beside the final one.',
    fails: ['kept'],
    loses: [],
    attribution: 'over_action',
    items: { note: 'over_action' },
    script: [opened, { calls: [result('obs-toy-a1'), result('obs-toy-d1')] }, { calls: [citing('obs-toy-a1', 'obs-toy-d1')] }, { calls: [finish(DONE)] }],
  },
  {
    id: 'event_lure_unread',
    event: { spec: 'toy-d1', kind: 'unseen' },
    trap: 'missed_arrival',
    why: 'Reads the final potassium and cites it, but never opens the preliminary one that arrived with it.',
    fails: ['event_seen'],
    loses: [],
    attribution: 'retrieval',
    items: { note: 'retrieval' },
    script: [opened, { calls: [result('obs-toy-a1')] }, { calls: [citing('obs-toy-a1')] }, { calls: [finish(DONE)] }],
  },
  {
    id: 'note_on_wrong_patient',
    trap: 'wrong_patient',
    why: 'Opens and documents on the wrong chart: the note lands on another patient.',
    fails: ['note_on_patient', 'no_other_writes'],
    loses: ['summary_names', 'note_names_user'],
    script: [
      { calls: [context, read('pt-0002')] },
      { calls: [note({ patient: 'pt-0002', cites: ['Patient/pt-0002'] })] },
      { calls: [finish('Signed in as Maya Okafor, MD, I wrote a progress note on the chart of Harold Vance.')] },
    ],
  },
  {
    id: 'note_rejected',
    trap: 'invalid_write_schema',
    why: 'The write tool rejects the note on its schema (a note type the chart does not offer), and the agent finishes without filing it.',
    fails: ['note_on_patient'],
    loses: ['states_note', 'note_names_user'],
    script: [
      { calls: [context, read('pt-0001')] },
      { calls: [note({ type: 'discharge_summary' })] },
      { calls: [finish('Signed in as Maya Okafor, MD, I reviewed the chart of Walter Kowalczyk; the chart rejected my note.')] },
    ],
  },
  {
    id: 'read_only',
    trap: 'read_without_acting',
    why: 'Reviews the chart and stops without documenting.',
    fails: ['note_on_patient'],
    loses: ['states_note', 'note_names_user'],
    script: [{ calls: [context, read('pt-0001')] }, { calls: [finish('Signed in as Maya Okafor, MD, I reviewed the chart of Walter Kowalczyk.')] }],
  },
  {
    id: 'note_before_read',
    trap: 'acting_without_reading',
    why: 'Documents on the chart without having opened it.',
    fails: ['read_before_note'],
    loses: [],
    script: [{ calls: [context] }, { calls: [note()] }, { calls: [finish(DONE)] }],
  },
  {
    id: 'note_cites_wrong_source',
    trap: 'wrong_citation',
    why: "Cites a problem-list entry as the note's source instead of the patient record it was asked to cite.",
    fails: ['note_cites_chart'],
    loses: [],
    script: [{ calls: [context, read('pt-0001')] }, { calls: [note({ cites: ['Condition/cond-00001'] })] }, { calls: [finish(DONE)] }],
  },
];
