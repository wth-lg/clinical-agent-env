// The check DSL (design section 5, "Architecture"). Each task's tests/grader.ts exports
// `checks: Check[]`; a check is a pure function of its context. Every gate runs before any
// rubric item, whatever the declared order, so no rubric item can hand a gate anything.
//
// Gate checks are code only and decide PASS. They get a GateCtx, which has no free-text field:
// no note text, no final text, no tool input, and its states are the gate view of each resource
// (gate-view.ts), an allowlist of structured fields with no string the agent wrote. So a gate
// cannot compare free text, and a gate check that tries to read final_text, a Task description
// or a message subject does not compile (packages/grader/test/fixtures). GateCheck.fn is a
// property, so its parameter is checked contravariantly: a function over RubricCtx is refused.
// Rubric checks get a RubricCtx: the full states, the notes the agent wrote, its final text, and
// the judge and extractor for judge and hybrid items. Rubric items never change a pass.
//
// A check that throws is a grader bug (GRADER_ERROR), never the environment's fault or the
// model's: read resources through get, has and status, which treat a resource the model never
// created as absent, so a missing write fails the gate instead of throwing.
//
// Grading reads the diff, the final state and the steps, never the hash. Steps are the tool
// calls that ran, numbered from 1; what a call exposed or referenced is read from its result's
// exposed_ids and referenced_ids, and what it changed only from written_ids, which only a
// committed write has (a rejected write changed nothing).
import type { Resource } from '../env/store.ts';
import type { Diff } from './diff.ts';
import type { GateOf, GateResource } from './gate-view.ts';
import type { ItemResult } from './items.ts';
import type { Extraction, ExtractQuestion, JudgeQuestion } from './judge.ts';
import { within } from './normalize.ts';

export const CATEGORIES = ['retrieval', 'reasoning', 'action', 'safety', 'documentation', 'process'] as const;
export type Category = (typeof CATEGORIES)[number];

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Met = boolean | 'unknown';

export interface Verdict<M extends Met = Met> {
  met: M;
  evidence: { [k: string]: Json };
  // The resources the verdict is about, as <Type>/<id>: the write that last changed one of
  // them is a failed gate's decisive step.
  ids?: readonly string[];
  // A failed gate sets it when the conjunct that failed is a missing required write, not a
  // forbidden one: a safety gate failure is then not over_action (attribution.ts, R14-12).
  omission?: true;
  // A failed gate sets it when the decision was right and only its channel or form is one the
  // protocol does not name (a phone Task for a portal message, an order not linked to its
  // appointment): attribution labels the trial action_form (P17j JG8b, pre-audit M3).
  action_form?: true;
  // A gate over a worklist (items.ts itemGate): each item's result, in list order.
  items?: readonly ItemResult[];
}

interface Common {
  id: string;
  category: Category;
  // The prompt line or policy section the check enforces, e.g. 'RBC-PHARM-07 §2'.
  traces_to: string;
  // The source resources the decision depends on (bare ids or <Type>/<id>): attribution asks
  // whether each was exposed.
  decisive_ids: readonly string[];
  // For a decisive note, report or policy, the phrase in its text the decision turns on, keyed
  // by the id as decisive_ids gives it. When one is declared, attribution counts the id as
  // retrieved only if some step showed that phrase (exposure.ts shows(): a search_notes snippet
  // or a fhir_read), not merely exposed it. Without one, exposure decides, as for other types.
  // Ignored for ids not in decisive_ids, and only text-bearing types have shown text.
  decisive_phrases?: Readonly<Record<string, string>>;
  // For a decisive id the check counts as seen by a rule of its own (T2's screening LDCT, seen
  // from a fhir_search row that shows its conclusion), the first step that saw it by that rule,
  // keyed as decisive_ids gives it: attribution counts the id as seen when that rule finds a step,
  // as well as by exposure or a shown phrase, so the label agrees with the check.
  seen_at?: Readonly<Record<string, (steps: readonly Step[]) => number | null>>;
}

export interface GateCheck extends Common {
  kind: 'gate';
  method: 'code';
  fn: (ctx: GateCtx) => Verdict<boolean>;
  // A rubric item that judges whether the note or final text states the action this gate
  // checks: when it is met and the gate failed, the failure is an action/output gap.
  stated_by?: string;
}

export interface RubricCheck extends Common {
  kind: 'rubric';
  // -10..+10; negative for a harm the item detects.
  points: number;
  method: 'code' | 'hybrid' | 'judge';
  fn: (ctx: RubricCtx) => Verdict | Promise<Verdict>;
}

export type Check = GateCheck | RubricCheck;

// One tool call that ran (executed), in order.
export interface Step {
  // 1-based position among the calls that ran.
  n: number;
  // The tool_result event's seq, for linking into the trajectory.
  seq: number;
  // The assistant turn whose answer made the call (TrialEvent.turn, the request it answered).
  // The calls of one answer share it, and their results reach the model only with the next
  // request, so a result is seen only by a step of a later turn (exposure.ts seenBefore).
  turn: number;
  tool: string;
  is_error: boolean;
  error_code: string | null;
  exposed_ids: readonly string[];
  referenced_ids: readonly string[];
  // Empty unless the call committed a write.
  written_ids: readonly string[];
  // The text this call's result showed, per reference ('DocumentReference/<id>'), with
  // whitespace collapsed: a search_notes snippet, a note's text read with fhir_read, a policy's
  // text. Empty for other results and errors. Shown text is not exposure unless it is the whole
  // text: a cut snippet leaves its note in referenced_ids, a snippet of a whole note exposes it. Derived from the recorded content (env registry shownText); query it
  // with exposure.ts shows().
  shown: Readonly<Record<string, string>>;
  // Present only on a successful fhir_search: the structured filters of its call (ruling R20),
  // so a gate can count a search that found nothing in the window as a review. Enumerated keys
  // from the call's input, never free text; patient is always 'Patient/<id>'. An empty page
  // exposes nothing, so no other field of the step says what was searched. whole is true when the
  // page held every match (offset 0 or none, no next_offset). offset (from the call) and
  // next_offset (from the result) let a gate join a run of pages that together held every match
  // (ruling R27); category lets it refuse a filter that would hide the absent kind; sort ('date'
  // or '-date', absent for the default order) lets it require one order across a run of pages.
  search?: StepSearch;
}

export interface StepSearch {
  type: string;
  patient?: string;
  code?: string;
  category?: string;
  date_ge?: string;
  date_le?: string;
  status?: string;
  sort?: string;
  offset?: number;
  next_offset?: number;
  whole: boolean;
}

// Null-safe reads: a resource that is not in the state is absent, never an exception.
interface Lookup {
  has(type: string, id: string): boolean;
  // The resource's status, or null when it is absent or has none.
  status(type: string, id: string): string | null;
}

// A state as a rubric item reads it: full resources.
export interface StateView extends Lookup {
  get(type: string, id: string): Readonly<Resource> | undefined;
  // Every resource, or every resource of one type, in store order.
  all(type?: string): readonly Readonly<Resource>[];
}

// A state as a gate reads it: the gate view of each resource (gate-view.ts), typed by its type.
export interface GateStateView extends Lookup {
  get<T extends string>(type: T, id: string): GateOf<T> | undefined;
  // Every resource, or every resource of one type, in store order.
  all(): readonly GateResource[];
  all<T extends string>(type: T): readonly GateOf<T>[];
}

// What gates and rubric items both read.
interface CtxBase {
  readonly diff: Diff;
  readonly steps: readonly Step[];
  // The first step whose result exposed the resource (a bare id or <Type>/<id>), or null. Ask
  // exposure.ts seenBefore whether that result was seen before a write: a step number is not.
  exposedAt(id: string): number | null;
  // Every resource the trial's committed writes put into the store, as <Type>/<id>, in order.
  writes(): readonly string[];
}

export interface GateCtx extends CtxBase {
  readonly initial: GateStateView;
  readonly final: GateStateView;
}

// A note the agent wrote: a DocumentReference the trial created, with its text decoded.
export interface Note {
  id: string;
  patient: string | null;
  title: string;
  text: string;
  // context.related references, as <Type>/<id>.
  cites: readonly string[];
  // The step that wrote it.
  step: number | null;
}

export interface RubricCtx extends CtxBase {
  readonly initial: StateView;
  readonly final: StateView;
  readonly notes: readonly Note[];
  // The summary the agent gave finish; null when it never called finish.
  readonly final_text: string | null;
  // The grader adds whether the running check is a penalty (its points < 0); a check cannot say.
  judge(q: Omit<JudgeQuestion, 'penalty'>): Promise<Verdict>;
  extract(q: ExtractQuestion): Promise<Extraction>;
}

type Spec<C extends Check> = Omit<C, 'kind' | 'method'>;

export const gate = (spec: Spec<GateCheck> & { method?: 'code' }): GateCheck => ({ ...spec, kind: 'gate', method: 'code' });

export const rubric = (spec: Spec<RubricCheck> & { method: RubricCheck['method'] }): RubricCheck => ({ ...spec, kind: 'rubric' });

type TextOf = (ctx: RubricCtx) => string;

// A judge item: one isolated judge call on the text, met when the judge says so and quotes it.
export function judged(spec: Omit<Spec<RubricCheck>, 'fn'> & { criterion: string; text: TextOf }): RubricCheck {
  const { criterion, text, ...rest } = spec;
  return { ...rest, kind: 'rubric', method: 'judge', fn: (ctx) => ctx.judge({ criterion, text: text(ctx) }) };
}

// A hybrid item: the value the text states for `field`, extracted by `pattern` (its first group)
// or else by the LLM extractor, compared in code with the truth computed from the fixture.
// Not stated is not met; an extraction the code cannot verify is unknown.
export function hybrid(spec: Omit<Spec<RubricCheck>, 'fn'> & { field: string; text: TextOf; pattern: RegExp; truth: number; tolerance: { rel?: number; abs?: number } }): RubricCheck {
  const { field, text, pattern, truth, tolerance, ...rest } = spec;
  return {
    ...rest,
    kind: 'rubric',
    method: 'hybrid',
    fn: async (ctx) => {
      const x = await ctx.extract({ field, text: text(ctx), pattern });
      const evidence = { truth, tolerance: tolerance as { [k: string]: Json }, ...x };
      if (x.value === 'unknown') return { met: 'unknown', evidence };
      return { met: x.value !== null && within(x.value, truth, tolerance), evidence };
    },
  };
}
