// The live card's trajectory (P25u S4 follow-up, A8): the same rows as the trial page (trial/steps.ts
// trajectoryOf, rendered with Trajectory's RowItem, so each tool call that ran has its "Step n"),
// a "Turn n" divider where the turn changes, the task prompt, and the elapsed time from the first
// event to the latest one.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrialEvent } from '../../../packages/core/events.ts';
import { cardCost, elapsedSince, elapsedText, finishedSeconds, firstTimestamp, liveRows, startTicker } from '../src/live/rows.ts';

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

// Gate P25U-S4F-1 M1: while the trial runs the meter counts from the first event with a clock,
// not only when an event arrives; once it ends it freezes at the record's duration, the trial
// page's Duration.
describe('elapsed while running and at the end', () => {
  afterEach(() => vi.useRealTimers());

  it('counts from the first event to now while the trial runs', () => {
    const first = firstTimestamp(events)!;
    expect(first).toBe(Date.parse(at(0)));
    expect(elapsedSince(first, Date.parse(at(0)) + 7500)).toBe(8);
    expect(elapsedSince(first, first - 1000)).toBe(0);
    expect(firstTimestamp([])).toBeNull();
  });

  it('freezes at the record\'s started-to-ended duration, the page\'s Duration, else at the events\' span', () => {
    expect(finishedSeconds({ started: at(0), ended: at(170) }, events)).toBe(170);
    expect(finishedSeconds({}, events)).toBe(65);
    expect(finishedSeconds(null, events)).toBe(65);
    expect(finishedSeconds(null, [])).toBeNull();
  });

  it('the ticker calls back once a second until stopped', () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const stop = startTicker(() => ticks.push(1));
    vi.advanceTimersByTime(3200);
    expect(ticks).toHaveLength(3);
    stop();
    vi.advanceTimersByTime(5000);
    expect(ticks).toHaveLength(3);
  });
});

// Gate P25U-S4F-1: a stopped trial's card read Cost $0.00 while its session page read $0.72; the
// card shows the record's cost, agent plus judge, as the page's Cost card does.
describe('cardCost', () => {
  it('is the record\'s agent plus judge cost once there is a record, else the events\' usage cost', () => {
    expect(cardCost({ cost_usd: 0.72, judge_cost_usd: 0.08 }, 0)).toBeCloseTo(0.8, 9);
    expect(cardCost({ cost_usd: 0.72 }, 0)).toBe(0.72);
    expect(cardCost(null, 0.31)).toBe(0.31);
    expect(cardCost({}, 0.31)).toBe(0.31);
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
