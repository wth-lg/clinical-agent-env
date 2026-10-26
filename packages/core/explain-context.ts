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
//   exposable         whether a decisive id the model was never shown is reachable (R14-30): a
//                     tool result exposed or referenced it to a passing oracle or alternative in
//                     matrix.json's entry, which ran on the run manifest's world and the trial's
//                     env_version (reachability); otherwise exposability_unchecked
//                     says why the matrix cannot answer, and M1 is pending. Membership in today's
//                     world is no longer read: an id in the store that no tool call returns was
//                     not reachable, and today's world need not be the run's
//   checks            the task's gate checks, for traces_to
//   text              the task's check text (tasks/<id>.check-text.ts)
import type { TrialEvent } from './events.ts';
import { attributionFits, firstFailedCheck, outrankedCheck, type CheckText, type ExplainContext, type ExplainRecord } from './explain.ts';
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

// Whether an unexposed decisive id was reachable (R14-30), from the run's manifest and matrix.json
// entry for the grader_task_version: the run's world_hash must be the world the matrix's cases
// started from, and the trial's env_version (env files, world, TOOLS_VERSION) the one the matrix
// ran at; then an id is exposable when a tool result exposed or referenced it to the oracle or an
// alternative, as the matrix expects them to run (cli/matrix.ts writeMatrixJson: env_version,
// world_hash, probes[].reachable_ids and as_expected). A mutant or a probe agent does not count:
// it is not a correct solution. A matrix whose oracle or an alternative failed (oracle_pass or
// alternatives_pass false) gives no evidence either way. unchecked says why the matrix cannot answer.
export function reachability(manifest: unknown, matrix: unknown, grader_task_version: string | null, env_version: string | null): { exposable: (id: string) => boolean } | { unchecked: string } {
  const run = runWorldHash(manifest);
  if (run === null) return { unchecked: 'the run has no manifest world_hash' };
  const entry = grader_task_version !== null && isRecord(matrix) && isRecord(matrix.grader_task_versions) ? matrix.grader_task_versions[grader_task_version] : undefined;
  if (!isRecord(entry)) return { unchecked: `the run has no matrix.json entry for ${grader_task_version ?? 'its grader_task_version'}` };
  const probes = Array.isArray(entry.probes) ? entry.probes : [];
  if (typeof entry.env_version !== 'string' || typeof entry.world_hash !== 'string' || probes.length === 0 || !probes.every((p) => isRecord(p) && strings(p.reachable_ids))) {
    return { unchecked: `matrix.json's entry for ${grader_task_version} records no env_version, world_hash and reachable ids; rerun pnpm cli matrix --out <run>` };
  }
  if (run !== entry.world_hash) return { unchecked: `the run's world ${run} is not the world ${entry.world_hash} the matrix ran on` };
  if (env_version === null) return { unchecked: 'the record has no env_version' };
  if (env_version !== entry.env_version) return { unchecked: `the trial ran at env_version ${env_version}, the matrix at ${entry.env_version}` };
  if (entry.oracle_pass === false) return { unchecked: `the reference solution failed in the matrix for ${grader_task_version}, so the matrix gives no evidence` };
  if (entry.alternatives_pass === false) return { unchecked: `an accepted alternative failed in the matrix for ${grader_task_version}, so the matrix gives no evidence` };
  // A solver the matrix flagged (a grade below 1.0, a judge miss, a replay that differs) gives no
  // evidence either way, as the matrix's own decisive reachability line says (not checked).
  const solvers = (probes as Array<{ kind?: unknown; as_expected?: unknown; reachable_ids: string[] }>).filter((p) => p.kind === 'oracle' || p.kind === 'alternative');
  // writeMatrixJson always writes the oracle probe when oracle_pass is true; an entry without one
  // (hand-edited or foreign) must not make every id unreachable (verifier-phase-P17i-C4r5-1 F1).
  if (!solvers.some((p) => p.kind === 'oracle')) return { unchecked: `matrix.json's entry for ${grader_task_version} has no reference solution probe, so the matrix gives no evidence` };
  if (solvers.some((p) => p.as_expected !== true)) return { unchecked: `the reference solution or an accepted alternative did not run as the matrix expects for ${grader_task_version}, so the matrix gives no evidence` };
  const reached = solvers.flatMap((p) => p.reachable_ids);
  return { exposable: (id) => reached.some((k) => sameId(k, id)) };
}

export function explainContext(input: ContextInput): ExplainContext {
  const checks = input.checks ?? null;
  const reach = reachability(input.manifest, input.matrix, currentGrade(input.record).grader_task_version, input.record.env_version ?? null);
  return {
    events: input.events,
    world_state_hash: runWorldHash(input.manifest),
    ...('exposable' in reach ? { exposable: reach.exposable } : { exposability_unchecked: reach.unchecked }),
    exposure: recomputedExposure(input.record, checks, input.events),
    matrix: matrixFor(input.matrix, currentGrade(input.record).grader_task_version),
    ...(checks === null ? {} : { checks: checks.flatMap((c) => (c.kind === 'gate' && c.traces_to !== undefined ? [{ id: c.id, traces_to: c.traces_to }] : [])) }),
    text: input.text ?? null,
  };
}
