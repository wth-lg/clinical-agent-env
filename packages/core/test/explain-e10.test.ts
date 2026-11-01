// E10 (PW4-E1, coordinator ruling at the builder-280 handshake): an arrival in the model's last turn
// decides a trial as the environment's only when the trial did not stop at a limit and the
// arrival's event gates are its only failures. A LIMIT trial keeps its LIMIT fault (a looping
// model never reads as an environment fault); the late arrival is a note, its item did_not_finish.
import { describe, expect, it } from 'vitest';
import { explainTrial, type ExplainCheck, type ExplainRecord } from '../explain.ts';

// A gate result; a failed one names, per failed item, the specs it failed (events.ts evidence.failed).
const gateRow = (id: string, failedSpecs: string[] | null) => ({
  id, kind: 'gate', method: 'code', category: 'action', points: null, met: failedSpecs === null, evidence: {},
  ...(failedSpecs === null ? {} : { items: [{ item: 'note', met: false, decisive_ids: [], evidence: failedSpecs.length > 0 ? { failed: failedSpecs } : {}, ...(failedSpecs[0] ? { event: failedSpecs[0] } : {}) }] }),
});

// failed: gate id -> the specs it failed ([] for a gate that is no event's).
function record(outcome: 'FAIL' | 'LIMIT', failed: Record<string, string[]>): ExplainRecord {
  return {
    task_id: '_toy', task_version: 'v-1', env_version: 'e-1', grader_task_version: 'g-1', outcome, valid: true, status: outcome === 'LIMIT' ? 'LIMIT' : 'COMPLETED', detail: outcome === 'LIMIT' ? 'max_turns' : null,
    turns: 6, cost_usd: 0.1, started: '2026-10-24T00:00:00.000Z', ended: '2026-10-24T00:01:00.000Z', summary: null, refusal_category: null,
    tool_errors: { INVALID_INPUT: 0, NOT_FOUND: 0, CONFLICT: 0, NOT_SUPPORTED: 0, INTERNAL: 0 },
    state_hash: { initial: 'h', final: 'h-final', replay_final: 'h-final' },
    checks: ['note_on_patient', 'had_turn', 'event_seen', 'amended'].map((id) => gateRow(id, failed[id] ?? null)) as unknown as ExplainCheck[],
    attribution: null,
    error: null,
  } as ExplainRecord;
}
const holdsE10 = (x: ReturnType<typeof explainTrial>) => x.deciding?.id === 'E10' || x.notes.some((n) => n.id === 'E10');

describe('E10', () => {
  it("is not the environment's when another event failed by the model's own act: A not amended, B in the last turn", () => {
    const x = explainTrial(record('FAIL', { had_turn: ['B'], amended: ['A'] }), null, { events: [], text: null });
    expect(holdsE10(x)).toBe(false);
    expect(x.fault).toBe('model');
  });

  it('a LIMIT trial with an arrival in its last turn keeps its LIMIT fault, and E10 only notes it', () => {
    const x = explainTrial(record('LIMIT', { had_turn: ['B'], event_seen: ['B'] }), null, { events: [], text: null });
    expect(x.fault).toBe('model');
    expect(x.deciding?.fault).toBe('model');
    expect(holdsE10(x)).toBe(false);
  });

  it('a finished trial whose only failure is the last-turn arrival reads E10, the environment', () => {
    const x = explainTrial(record('FAIL', { had_turn: ['B'], event_seen: ['B'] }), null, { events: [], text: null });
    expect(x.deciding).toMatchObject({ fault: 'env', id: 'E10' });
  });

  it('a finished trial that also failed a gate of its own is not E10', () => {
    const x = explainTrial(record('FAIL', { had_turn: ['B'], event_seen: ['B'], note_on_patient: [] }), null, { events: [], text: null });
    expect(holdsE10(x)).toBe(false);
  });
});
