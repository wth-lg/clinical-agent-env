// The inputs of a task's grader validation matrix (design section 5, "Grader validation
// matrix"), as a task ships them:
//   solution/solve.ts      `oracle`: the reference solution, a script of tool calls
//   tests/alternatives.ts  `alternatives`: other correct solutions, each expected to PASS and
//                          to lose exactly the rubric items it declares (none by default)
//   tests/mutants.ts       `mutants`: near misses, one trap each, each expected to FAIL on
//                          exactly the gate checks it declares and to lose exactly the rubric
//                          items it declares
//   tests/agents.ts        `spray`, `output_gap` and, where the task declares it, `status_only`
//   tests/grader.ts        `checks` (its path is `checksModule`, which the matrix's isolation
//                          check imports again in a fresh process)
//   expected.ts            `expected`: the expected end state, written by hand
//   policy.ts              `derive(world)`: the same, computed from the initial world
//   tests/judge-cache.json the canned judge and extractor answers the matrix grades with
//   task.toml [matrix]     traps = [...] (each needs a mutant); status_only = true|false
// A script is data: the calls a scripted model makes, turn by turn, through the same tools and
// the same run() loop as a live trial. The null agent (finish, nothing else) is built in.
import type { Resource } from '../../env/store.ts';
import type { Taxonomy } from '../attribution.ts';
import type { Check, Json } from '../check.ts';
import type { JudgeCacheEntry, JudgeEffort } from '../judge.ts';

export interface ScriptCall {
  name: string;
  input: { [k: string]: Json };
}

// One answer: optional text, then its tool calls in order. An answer with no calls ends the
// episode (end_turn), as does running past the last answer.
export interface ScriptTurn {
  text?: string;
  calls: readonly ScriptCall[];
}

export type Script = readonly ScriptTurn[];

// The script with every turn but the last in one answer: the agent issues its reads and the
// writes that depend on them together, so it has seen no result when it writes. Each task's
// one-turn mutant is its oracle this way, and fails the task's 'seen before' gate
// (verifier-phase-P17i-P17-T5-1 F2).
export const oneTurn = (s: Script): Script => [{ calls: s.slice(0, -1).flatMap((t) => t.calls) }, ...s.slice(-1)];

export interface Agent {
  id: string;
  // What the agent does differently, in a clinician's words.
  why: string;
  script: Script;
}

export interface Alternative extends Agent {
  // The rubric items it must lose, and no other; absent or [] when it loses none (a score of 1.0).
  loses?: readonly string[];
}

export interface Mutant extends Agent {
  // The task.toml trap it exercises.
  trap: string;
  // The gate checks it must fail, and no other.
  fails: readonly string[];
  // The rubric items it must lose (a positive item not met, a penalty met), and no other; [] when
  // it loses none. Required: the matrix fails a mutant without it, before any case runs.
  loses: readonly string[];
  // The attribution label its FAIL must get (attribution.ts); not checked when absent.
  attribution?: Taxonomy;
  // On a task whose gates check items (packages/grader/items.ts): the items it must fail, by key
  // (items.ts OUTSIDE for the part no item owns), each with the label attribution.ts gives it, and
  // no other; not checked when absent.
  items?: Readonly<Record<string, Taxonomy>>;
}

export interface Agents {
  spray?: Script;
  output_gap?: Script;
  status_only?: Script;
  // The attribution label each agent's FAIL must get, as a mutant declares it; not checked for an
  // agent it leaves out.
  attribution?: Partial<Record<'spray' | 'output_gap' | 'status_only', Taxonomy>>;
}

// What task.toml's [matrix] table declares.
export interface Declares {
  traps: readonly string[];
  status_only: boolean;
}

// The initial world as policy.ts reads it.
export interface WorldView {
  get(type: string, id: string): Readonly<Resource> | undefined;
  all(type?: string): readonly Readonly<Resource>[];
}

export interface MatrixTask {
  id: string;
  instruction: string;
  policies: ReadonlyArray<{ id: string; text: string }>;
  declares: Declares;
  checks: readonly Check[];
  // The file `checks` was imported from; absent when the checks were built in memory, which
  // turns the isolation check off.
  checksModule?: string;
  oracle: Script | null;
  alternatives: readonly Alternative[];
  mutants: readonly Mutant[];
  agents: Agents;
  expected: Json | undefined;
  derive: ((world: WorldView) => Json) | undefined;
  cache: readonly JudgeCacheEntry[];
  // task.toml [judge] effort, which the judge answers at and its cache keys include.
  judgeEffort: JudgeEffort;
}
