// The ExplainContext of one trial (plan phase P14c), built in one place from what the trial's run
// holds, so cli/audit-check.ts and the web Runs view (apps/web/src/data/results.ts) give
// explainTrial the same context and show the same M1-M5 criteria for every trial. Pure: the
// callers read the files (Node or fetch) and pass their parsed contents.
//   world_state_hash  the run's manifest.json world_hash, null when the run has no manifest
//                     (pilot-0, the sample run): M3 is then pending, never compared with today's
//                     fixtures/manifest.json, which answers another question (is it today's world)
//   matrix            the run's matrix.json entry for the grader_task_version of the current grade
//                     ({grader_task_versions: {<v>: {oracle_pass, alternatives_pass, failed_checks?}}},
//                     as `pnpm cli matrix --out <run>` writes it; failed_checks that is not a list
//                     of strings reads as not given)
//   exposure          on a trial whose decisive gate check is not the one its recorded
//                     attribution names (a regrade moved it): that check's decisive ids from the
//                     task's checks, then the first failed check's when it is another (as
//                     attribution.ts names them), with the step each was first exposed at in the
//                     trajectory (packages/grader/exposure.ts firstExposed)
//   exposable         whether an id is in the world (worldLookup), when the caller loaded it;
//                     needsWorld says whether M1 reads it, so a caller loads the world only then
//   checks            the task's gate checks, for traces_to
//   text              the task's check text (tasks/<id>.check-text.ts)
import type { TrialEvent } from './events.ts';
import { attributionFits, decisiveExposure, firstFailedCheck, outrankedCheck, type CheckText, type ExplainContext, type ExplainRecord } from './explain.ts';
import type { MatrixResult } from './outcomes.ts';
import { currentGrade } from './summary.ts';
import { firstExposed, sameId, stepsOf } from '../grader/exposure.ts';

// A check of the task as far as the context reads it (packages/grader/check.ts Check).
export interface TaskCheck {
  id: string;
  kind?: string;
  traces_to?: string;
  decisive_ids?: readonly string[];
}

export interface ContextInput {
  record: ExplainRecord;
  // The trial's trajectory, or [] when the caller did not read it.
  events: readonly TrialEvent[];
  // The run's parsed manifest.json, or null when it has none.
  manifest?: unknown;
  // The run's parsed matrix.json, or null when it has none.
  matrix?: unknown;
  // The task's checks, or null when the caller did not load them.
  checks?: readonly TaskCheck[] | null;
  text?: CheckText | null;
  // Whether an id is in the world, or null when the caller did not load it.
  inWorld?: ((id: string) => boolean) | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

// The run manifest's world_hash, or null.
export const runWorldHash = (manifest: unknown): string | null => (isRecord(manifest) && typeof manifest.world_hash === 'string' ? manifest.world_hash : null);

// matrix.json's verdict for one grader_task_version, or null.
export function matrixFor(matrix: unknown, grader_task_version: string | null): MatrixResult | null {
  if (grader_task_version === null || !isRecord(matrix) || !isRecord(matrix.grader_task_versions)) return null;
  const m = matrix.grader_task_versions[grader_task_version];
  if (!isRecord(m) || typeof m.oracle_pass !== 'boolean' || typeof m.alternatives_pass !== 'boolean') return null;
  return { grader_task_version, oracle_pass: m.oracle_pass, alternatives_pass: m.alternatives_pass, ...(strings(m.failed_checks) ? { failed_checks: m.failed_checks } : {}) };
}

// The recomputed exposure of the decisive check's decisive ids, then the first failed check's when
// it is another, each id once, when the recorded attribution names another check and the task's
// checks give those checks' decisive ids.
export function recomputedExposure(record: ExplainRecord, checks: readonly TaskCheck[] | null | undefined, events: readonly TrialEvent[]): NonNullable<ExplainContext['exposure']> | null {
  const failed = firstFailedCheck(record);
  if (failed === null || attributionFits(record)) return null;
  const idsOf = (id: string) => checks?.find((c) => c.id === id)?.decisive_ids;
  const ids = idsOf(failed.id);
  const outranked = outrankedCheck(record);
  const more = outranked === null ? [] : idsOf(outranked.id);
  if (ids === undefined || more === undefined) return null;
  const steps = stepsOf(events);
  return { check: failed.id, ids: [...new Set([...ids, ...more])].map((id) => ({ id, first_exposed_step: firstExposed(steps, id) })) };
}

// Whether M1 asks the world: a decisive id it reads was never exposed.
export const needsWorld = (input: Pick<ContextInput, 'record' | 'checks' | 'events'>): boolean =>
  (decisiveExposure(input.record, recomputedExposure(input.record, input.checks, input.events)) ?? []).some((e) => e.first_exposed_step === null);

// inWorld over the world's <Type>/<id> keys; an id given bare matches any type.
export function worldLookup(keys: ReadonlySet<string>): (id: string) => boolean {
  return (id) => (id.includes('/') ? keys.has(id) : [...keys].some((k) => sameId(k, id)));
}

export function explainContext(input: ContextInput): ExplainContext {
  const checks = input.checks ?? null;
  return {
    events: input.events,
    world_state_hash: runWorldHash(input.manifest),
    ...(input.inWorld ? { exposable: input.inWorld } : {}),
    exposure: recomputedExposure(input.record, checks, input.events),
    matrix: matrixFor(input.matrix, currentGrade(input.record).grader_task_version),
    ...(checks === null ? {} : { checks: checks.flatMap((c) => (c.kind === 'gate' && c.traces_to !== undefined ? [{ id: c.id, traces_to: c.traces_to }] : [])) }),
    text: input.text ?? null,
  };
}
