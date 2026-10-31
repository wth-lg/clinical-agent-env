// What each check of a task requires, as the Tasks view shows it, read from the task itself:
// the text its traces_to names (a policy section 'RBC-PHARM-07 §2', a policy's preamble
// 'RBC-RAD-07', or a prompt line 'instruction.md:3'), and, for a judged or hybrid rubric item,
// the criterion or field it puts to the judge. Those live in the item's closure (packages/grader/check.ts judged, hybrid), so the
// item runs once on an empty context whose judge and extract record the question and answer
// nothing; no model is asked. And the reference solution: the oracle's tool calls, in order.
import type { Task } from '../../../../packages/core/tasks.ts';
import type { Check, RubricCtx } from '../../../../packages/grader/check.ts';
import type { Script } from '../../../../packages/grader/matrix/types.ts';

// The text traces_to points at, or null when it names nothing in the task.
export function sourceText(task: Task, tracesTo: string): string | null {
  const line = /^instruction\.md:(\d+)$/.exec(tracesTo);
  if (line) return task.instruction.split('\n')[Number(line[1]) - 1]?.trim() || null;
  // A bare policy id names the policy's preamble, before §1 (T5's review rule, W1 probe).
  const whole = /^(\S+)$/.exec(tracesTo) && task.policies.find((p) => p.id === tracesTo);
  if (whole) {
    const lines = whole.text.split('\n');
    const first = lines.findIndex((l) => /^§\d+/.test(l));
    return lines.slice(0, first < 0 ? undefined : first).join('\n').trim() || null;
  }
  const sec = /^(\S+)\s+§(\d+)$/.exec(tracesTo);
  const policy = sec && task.policies.find((p) => p.id === sec[1]);
  if (!sec || !policy) return null;
  const lines = policy.text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`§${sec[2]} `) || l.trim() === `§${sec[2]}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^§\d+/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join('\n').trim();
}

// An empty value for any context field the item's text function reads: lists are empty, lookups
// find nothing, text is null.
const EMPTY: unknown = new Proxy(() => EMPTY, {
  get: (_t, k) => (k === Symbol.iterator ? [][Symbol.iterator] : k === 'length' ? 0 : k === 'filter' || k === 'map' || k === 'flatMap' ? () => [] : k === 'find' ? () => undefined : k === 'join' ? () => '' : k === 'then' ? undefined : EMPTY),
  apply: () => [],
});

// The question a judged or hybrid item asks; null for a code item or when its text cannot be read.
export async function rubricQuestion(check: Check): Promise<string | null> {
  if (check.kind !== 'rubric' || check.method === 'code') return null;
  let asked: string | null = null;
  const ctx = new Proxy({} as RubricCtx, {
    get: (_t, k) => {
      if (k === 'notes' || k === 'steps') return [];
      if (k === 'final_text') return null;
      if (k === 'judge') return async (q: { criterion: string }) => ((asked = q.criterion), { met: 'unknown', evidence: {} });
      if (k === 'extract') return async (q: { field: string }) => ((asked = `the note states ${q.field}`), { value: 'unknown' });
      return EMPTY;
    },
  });
  try {
    const v = await check.fn(ctx as never);
    const truth = (v.evidence as { truth?: unknown } | undefined)?.truth;
    return asked !== null && typeof truth === 'number' ? `${asked}, within tolerance of ${truth}` : asked;
  } catch {
    return asked;
  }
}

// One input value of a tool call in words.
function say(v: unknown): string {
  if (v === null || v === undefined) return 'none';
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 77)}…` : v;
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.length === 0 ? 'none' : v.map(say).join(', ');
  return Object.entries(v).map(([k, x]) => `${k.replace(/_/g, ' ')} ${typeof x === 'object' && x !== null && !Array.isArray(x) ? `(${say(x)})` : say(x)}`).join(', ');
}

export interface SolutionStep {
  n: number;
  tool: string;
  input: string;
  text: string | null;
}

// The oracle's calls, numbered in the order the loop runs them.
export function solutionSteps(oracle: Script): SolutionStep[] {
  let n = 0;
  return oracle.flatMap((turn) => turn.calls.map((c, i) => ({ n: ++n, tool: c.name, input: say(c.input), text: i === 0 ? turn.text?.trim() || null : null })));
}
