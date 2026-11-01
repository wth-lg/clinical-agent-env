// Other correct solutions of the toy: each must PASS, and none loses a rubric point (no loses). They vary what a careful clinician might
// vary, so the grader is shown not to depend on the oracle's exact path.
import type { Alternative, ScriptCall } from '../../../packages/grader/matrix/types.ts';

const context: ScriptCall = { name: 'get_context', input: {} };
const read = (resource_type: string, id: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type, id } });
const note = (over: Partial<Record<'patient' | 'title' | 'text', string>> & { cites?: string[] } = {}): ScriptCall => ({
  name: 'write_note',
  input: { patient: 'pt-0001', type: 'progress_note', title: 'Tool check', text: 'Chart opened by Maya Okafor, MD, to check the tools.', cites: ['Patient/pt-0001'], ...over },
});
const finish = (summary: string): ScriptCall => ({ name: 'finish', input: { summary } });

export const alternatives: Alternative[] = [
  {
    id: 'read_patient_first',
    why: 'Opens the chart before checking who is signed in.',
    script: [{ calls: [read('Patient', 'pt-0001')] }, { calls: [context] }, { calls: [note()] }, { calls: [finish('Wrote a progress note on the chart of Walter Kowalczyk while signed in as Maya Okafor, MD.')] }],
  },
  {
    id: 'one_answer',
    why: 'Reads in one answer, then writes the note and finishes in one answer: the note waits for the read, which it can see only from the next turn.',
    script: [{ calls: [context, read('Patient', 'pt-0001')] }, { calls: [note(), finish('Signed in as Maya Okafor, MD, I wrote a progress note on the chart of Walter Kowalczyk.')] }],
  },
  // The toy's events (events.ts): opening problem cond-00002 brings a new potassium (toy-a1) and a
  // preliminary one (toy-d1). The agent reads both in the next turn and cites the final one only.
  {
    id: 'event_handled',
    why: 'Opens a second problem, which brings a new result and a preliminary one to the chart; reads both, and cites the final result in the note but not the preliminary one.',
    script: [
      { calls: [context, read('Patient', 'pt-0001'), read('Condition', 'cond-00002')] },
      { calls: [read('Observation', 'obs-toy-a1'), read('Observation', 'obs-toy-d1')] },
      { calls: [note({ cites: ['Patient/pt-0001', 'Observation/obs-toy-a1'] })] },
      { calls: [finish('Signed in as Maya Okafor, MD, I wrote a progress note on the chart of Walter Kowalczyk.')] },
    ],
  },
  // The same route, and the agent then closes the inbox item of the result it acted on: a write to
  // an arrival after it arrived, which the agent may make (the matrix's arrived split allows it).
  {
    id: 'event_handled_inbox_closed',
    why: "Handles the two arrivals as event_handled does, then opens the inbox item the final result came with and completes it, noting that the note cites it.",
    script: [
      { calls: [context, read('Patient', 'pt-0001'), read('Condition', 'cond-00002')] },
      { calls: [read('Observation', 'obs-toy-a1'), read('Observation', 'obs-toy-d1'), read('Task', 'inbox-a0001')] },
      { calls: [note({ cites: ['Patient/pt-0001', 'Observation/obs-toy-a1'] })] },
      { calls: [{ name: 'update_inbox_item', input: { task_id: 'inbox-a0001', action: 'complete', comment: 'Reviewed; the progress note cites this result.' } }] },
      { calls: [finish('Signed in as Maya Okafor, MD, I wrote a progress note on the chart of Walter Kowalczyk.')] },
    ],
  },
  {
    id: 'extra_reads_typed_reference',
    why: "Reads more of the chart than asked, names the patient as a typed reference and cites a problem it looked at besides the patient.",
    script: [
      { calls: [context, read('Patient', 'pt-0001'), read('Practitioner', 'pr-okafor'), read('Condition', 'cond-00001')] },
      { calls: [note({ patient: 'Patient/pt-0001', title: 'Chart check', text: 'Maya Okafor, MD reviewed the chart; no action needed.', cites: ['Patient/pt-0001', 'Condition/cond-00001'] })] },
      { calls: [finish("Maya Okafor, MD is signed in; I reviewed Walter Kowalczyk's chart and wrote a short progress note in it.")] },
    ],
  },
];
