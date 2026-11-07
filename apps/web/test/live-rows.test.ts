// The live card's trajectory (P25u S4 follow-up, A8): the same rows as the trial page (trial/steps.ts
// trajectoryOf, rendered with Trajectory's RowItem, so each tool call that ran has its "Step n"),
// a "Turn n" divider where the turn changes, the task prompt, and the elapsed time from the first
// event to the latest one.
import { describe, expect, it } from 'vitest';
import type { TrialEvent } from '../../../packages/core/events.ts';
import { elapsedText, liveRows } from '../src/live/rows.ts';

const at = (s: number) => new Date(Date.UTC(2026, 10, 8, 10, 0, s)).toISOString();
const base = (seq: number, turn: number, s: number) => ({ v: 1, seq, turn, ts: at(s) });
const events = [
  { ...base(0, 0, 0), type: 'request', messages_from: 0, messages: [{ role: 'user', content: 'Write one note for pt-0001.' }] },
  { ...base(1, 1, 1), type: 'response', id: 'r1', model: 'm', stop_reason: 'tool_use', stop_details: null, content: [{ type: 'thinking', thinking: 'Read first.' }, { type: 'tool_use', id: 'c1', name: 'get_context', input: {} }], usage: {}, attempts: 1 },
  { ...base(2, 1, 1), type: 'tool_call', tool_use_id: 'c1', name: 'get_context', input: {} },
  { ...base(3, 1, 2), type: 'tool_result', tool_use_id: 'c1', name: 'get_context', content: { ok: true }, is_error: false, executed: true },
  { ...base(4, 2, 3), type: 'response', id: 'r2', model: 'm', stop_reason: 'tool_use', stop_details: null, content: [{ type: 'tool_use', id: 'c2', name: 'write_note', input: { patient: 'pt-0001' } }], usage: {}, attempts: 1 },
  { ...base(5, 2, 3), type: 'tool_call', tool_use_id: 'c2', name: 'write_note', input: { patient: 'pt-0001' } },
  { ...base(6, 2, 65), type: 'tool_result', tool_use_id: 'c2', name: 'write_note', content: { id: 'DocumentReference/doc-1' }, is_error: false, executed: true, written_ids: ['DocumentReference/doc-1'] },
] as unknown as TrialEvent[];

describe('liveRows', () => {
  const r = liveRows(events);

  it('gives the trial page\'s rows: each executed call numbered as a step, in order', () => {
    const tools = r.rows.filter((x) => x.kind === 'tool');
    expect(tools.map((x) => [x.kind === 'tool' ? x.name : '', x.step])).toEqual([['get_context', 1], ['write_note', 2]]);
  });

  it('puts a Turn divider before the first row of each turn', () => {
    const kinds = r.rows.map((x) => (x.kind === 'turn' ? `turn ${x.turn}` : x.kind));
    expect(kinds).toEqual(['turn 1', 'thinking', 'tool', 'turn 2', 'tool']);
  });

  it('carries the task prompt', () => {
    expect(r.prompt).toBe('Write one note for pt-0001.');
  });

  it('is empty, with no divider, for no events', () => {
    expect(liveRows([])).toEqual({ rows: [], prompt: null, elapsedSeconds: null });
  });
});

describe('elapsedText', () => {
  it('reads m:ss from the first event to the latest', () => {
    expect(liveRows(events).elapsedSeconds).toBe(65);
    expect(elapsedText(65)).toBe('1:05');
    expect(elapsedText(5)).toBe('0:05');
    expect(elapsedText(600)).toBe('10:00');
    expect(elapsedText(null)).toBe('0:00');
  });
});
