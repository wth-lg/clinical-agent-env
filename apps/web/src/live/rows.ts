// The live card's trajectory (P25u S4 follow-up, A8): the trial page's rows (trial/steps.ts
// trajectoryOf, each call that ran numbered as the grader numbers steps, each mid-trial arrival
// its own row), with a "Turn n" divider before the first row of each turn, the task prompt, and
// the seconds from the first event to the latest. Pure; LiveTrial renders the rows with
// Trajectory's RowItem, so the live card and the trial page read the same.
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { durationSeconds } from '../data/duration.ts';
import { trajectoryOf, type Row } from '../trial/steps.ts';

export interface TurnDivider { kind: 'turn'; key: string; turn: number }
export type LiveRow = Row | TurnDivider;

export interface LiveRows {
  rows: LiveRow[];
  prompt: string | null;
  elapsedSeconds: number | null;
}

// The turn each row's event came in: a text or thinking row is keyed `${seq}.${i}` by its
// response, a tool row by its tool_use_id (live/fold.ts), an arrival by its spec.
function turnOf(events: readonly TrialEvent[]): Map<string, number> {
  const turns = new Map<string, number>();
  for (const e of events) {
    if (e.type === 'response') e.content.forEach((_, i) => turns.set(`${e.seq}.${i}`, e.turn));
    else if (e.type === 'tool_call') turns.set(e.tool_use_id, e.turn);
    else if (e.type === 'env_event') turns.set(`arrival-${e.spec}`, e.turn);
  }
  return turns;
}

const seconds = (iso: string): number | null => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t / 1000;
};

export function liveRows(events: readonly TrialEvent[]): LiveRows {
  if (events.length === 0) return { rows: [], prompt: null, elapsedSeconds: null };
  const t = trajectoryOf(events);
  const turns = turnOf(events);
  const rows: LiveRow[] = [];
  let turn = 0;
  for (const row of t.rows) {
    const n = turns.get(row.key) ?? turn;
    if (n > turn) {
      turn = n;
      rows.push({ kind: 'turn', key: `turn-${n}`, turn: n });
    }
    rows.push(row);
  }
  const first = seconds(events[0]!.ts);
  const last = seconds(events.at(-1)!.ts);
  return { rows, prompt: t.prompt, elapsedSeconds: first === null || last === null ? null : Math.max(0, Math.round(last - first)) };
}

// "m:ss", for the Elapsed meter.
export function elapsedText(s: number | null): string {
  const n = Math.max(0, Math.round(s ?? 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

// The Elapsed meter (gate P25U-S4F-1 M1): while the trial runs it counts from the first event
// with a clock (startTicker, once a second), so it moves between events; once the trial ends it
// freezes at the record's started-to-ended duration, the trial page's Duration (data/duration.ts),
// else at the span of the events.
export const firstTimestamp = (events: readonly TrialEvent[]): number | null => {
  const t = events.length === 0 ? Number.NaN : Date.parse(events[0]!.ts);
  return Number.isNaN(t) ? null : t;
};

export const elapsedSince = (firstMs: number, nowMs: number): number => Math.max(0, Math.round((nowMs - firstMs) / 1000));

export const finishedSeconds = (record: { started?: string | undefined; ended?: string | undefined } | null, events: readonly TrialEvent[]): number | null =>
  (record === null ? null : durationSeconds(record)) ?? liveRows(events).elapsedSeconds;

export function startTicker(onTick: () => void, intervalMs = 1000): () => void {
  const timer = setInterval(onTick, intervalMs);
  return () => clearInterval(timer);
}

// The Cost meter: the record's agent plus judge cost once the trial has one, as the trial page's
// Cost card shows it; before that, the usage events' cost (a stopped trial's events may hold no
// usage event, so its card read $0.00 while its page read the record's cost).
export const cardCost = (record: { cost_usd?: number | null; judge_cost_usd?: number | null } | null, usageUsd: number): number =>
  (typeof record?.cost_usd === 'number' ? record.cost_usd + (record.judge_cost_usd ?? 0) : usageUsd);
