// The trajectory as the trial detail shows it: live/fold.ts's items, each tool call that ran
// numbered as the grader numbers steps (packages/grader/exposure.ts stepsOf: executed tool
// results, from 1), so a decisive step, an exposure step and an evidence id all point at the
// same row. An evidence id's step is the last step that wrote it, else the first that exposed
// it. A mid-trial event (an env_event, PW4-E1) is a row of its own right after the call that fired
// it: what arrived in the queues, with the step it followed. Pure.
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { firstExposed, lastWrite, stepsOf } from '../../../../packages/grader/exposure.ts';
import type { Step } from '../../../../packages/grader/check.ts';
import { fold, type Item } from '../live/fold.ts';

// A mid-trial arrival: the event spec, the resources it put in the store, and the step whose call
// fired it.
export interface Arrival { kind: 'arrival'; key: string; spec: string; keys: string[]; stamp: string }
export type Row = (Item | Arrival) & { step: number | null };

export interface Trajectory {
  // The task prompt, the first user message.
  prompt: string | null;
  rows: Row[];
  steps: Step[];
  written: string[];
}

function promptOf(events: readonly TrialEvent[]): string | null {
  const first = events.find((e) => e.type === 'request');
  const msg = first?.type === 'request' ? first.messages.find((m) => m.role === 'user') : undefined;
  if (msg === undefined) return null;
  if (typeof msg.content === 'string') return msg.content;
  return msg.content.flatMap((b) => ('text' in b && typeof b.text === 'string' ? [b.text] : [])).join('\n') || null;
}

export function trajectoryOf(events: readonly TrialEvent[]): Trajectory {
  const steps = stepsOf(events);
  const byCall = new Map<string, number>();
  for (const e of events) if (e.type === 'tool_result' && e.executed) byCall.set(e.tool_use_id, byCall.size + 1);
  const folded = fold(events);
  const arrivals = new Map<string, Row[]>();
  for (const e of events) {
    if (e.type !== 'env_event') continue;
    const row: Row = { kind: 'arrival', key: `arrival-${e.spec}`, spec: e.spec, keys: [...e.keys], stamp: e.stamp, step: byCall.get(e.tool_use_id) ?? null };
    arrivals.set(e.tool_use_id, [...(arrivals.get(e.tool_use_id) ?? []), row]);
  }
  const rows = folded.items.flatMap((i): Row[] => [{ ...i, step: i.kind === 'tool' ? (byCall.get(i.key) ?? null) : null }, ...(i.kind === 'tool' ? (arrivals.get(i.key) ?? []) : [])]);
  return { prompt: promptOf(events), rows, steps, written: folded.written };
}

// The step an evidence id points at, or null when no step wrote or exposed it.
export const stepOfId = (steps: readonly Step[], id: string): number | null => lastWrite(steps, [id]) ?? firstExposed(steps, id);

export const stepAnchor = (n: number): string => `step-${n}`;

// The first tool call that failed with an internal error, the call an ENV_ERROR (INTERNAL) points
// at; null when the trajectory has none. The loop records it as executed, so it has a step.
export const internalErrorRow = (rows: readonly Row[]): (Row & { kind: 'tool'; step: number }) | null =>
  (rows.find((r) => r.kind === 'tool' && r.error === 'INTERNAL' && r.step !== null) as (Row & { kind: 'tool'; step: number }) | undefined) ?? null;
