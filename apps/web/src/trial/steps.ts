// The trajectory as the trial detail shows it: live/fold.ts's items, each tool call that ran
// numbered as the grader numbers steps (packages/grader/exposure.ts stepsOf: executed tool
// results, from 1), so a decisive step, an exposure step and an evidence id all point at the
// same row. An evidence id's step is the last step that wrote it, else the first that exposed
// it. Pure.
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { firstExposed, lastWrite, stepsOf } from '../../../../packages/grader/exposure.ts';
import type { Step } from '../../../../packages/grader/check.ts';
import { fold, type Item } from '../live/fold.ts';

export type Row = Item & { step: number | null };

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
  const rows = folded.items.map((i): Row => ({ ...i, step: i.kind === 'tool' ? (byCall.get(i.key) ?? null) : null }));
  return { prompt: promptOf(events), rows, steps, written: folded.written };
}

// The step an evidence id points at, or null when no step wrote or exposed it.
export const stepOfId = (steps: readonly Step[], id: string): number | null => lastWrite(steps, [id]) ?? firstExposed(steps, id);

export const stepAnchor = (n: number): string => `step-${n}`;
