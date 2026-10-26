// Reachability on the real tasks (plan phase P17i C4, R14-30; verifier-phase-P17i-C4-1 F1). A
// decisive id the model was never shown counts as reachable when a tool result exposed or
// referenced it to a passing oracle or alternative in the matrix (matrix.json probes[].reachable_ids).
// list_inbox gives the inbox Task ids only as referenced ids, so a wrong update_inbox_item link on
// one is a fair model fault (R14-17), not E5. runMatrix fails a task when one of its gate decisive
// ids no passing oracle or alternative reached, so a decisive id the solutions cannot reach is
// caught at the matrix, not relabelled at audit time.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installEgressGuard } from '../../packages/core/egress.ts';
import { explainContext } from '../../packages/core/explain-context.ts';
import { explainTrial, type ExplainRecord } from '../../packages/core/explain.ts';
import { stepsOf } from '../../packages/grader/exposure.ts';
import { cases, gradeRun, runMatrix, trial, unreachedDecisive, type MatrixOptions } from '../../packages/grader/matrix/matrix.ts';
import { repoRoot } from '../../scripts/test/helpers.ts';
import { loadMatrixTask, matrixEnv } from '../matrix.ts';

installEgressGuard(globalThis);

// The sample run's matrix.json, as generate.ts --matrix writes it with `pnpm cli matrix --out`.
const SAMPLE_MATRIX = JSON.parse(readFileSync(join(repoRoot, 'apps/web/e2e/fixtures/sample-results/results/runs/sample-1/matrix.json'), 'utf8')) as {
  grader_task_versions: Record<string, { task_id: string; probes: Array<{ kind: string; as_expected: boolean; reachable_ids: string[] }> }>;
};

// A real matrix case, graded, and explained on the run's world with the committed matrix.json.
async function explained(task: string, id: string, check: string) {
  const env = matrixEnv();
  const t = await loadMatrixTask(task);
  const run = await trial(env, t, cases(t).find((c) => c.id === id)!);
  const grade = await gradeRun(env, t, t.checks, run);
  expect(grade.attribution?.first_failed).toBe(check);
  const record = { ...run.record, checks: grade.checks, outcome: grade.outcome, attribution: grade.attribution } as ExplainRecord;
  expect(Object.keys(SAMPLE_MATRIX.grader_task_versions)).toContain(record.grader_task_version);
  const x = explainTrial(record, undefined, explainContext({ record, events: run.events, manifest: { world_hash: env.worldHash }, matrix: SAMPLE_MATRIX, checks: t.checks }));
  return { record, run, x };
}

describe('a decisive id a tool result only referenced is reachable (review F1)', () => {
  // The real matrix case, graded, then explained on the run's world with the committed matrix.json.
  it("results-inbox closed_without_links: items_closed_with_links's decisive ids were referenced by list_inbox, so M1 is met, E5 is not, and the fault is the model's", async () => {
    const { record, run, x } = await explained('results-inbox', 'closed_without_links', 'items_closed_with_links');
    // The scenario: a decisive id never exposed, but referenced by a list_inbox step.
    const never = record.attribution!.exposure.filter((e) => e.first_exposed_step === null).map((e) => e.id);
    expect(never.length).toBeGreaterThan(0);
    expect(stepsOf(run.events).some((s) => s.tool === 'list_inbox' && never.every((n) => s.referenced_ids.some((k) => k.endsWith(`/${n.split('/').pop()}`))))).toBe(true);
    expect(x.criteria.find((c) => c.id === 'M1')).toMatchObject({ met: true, evidence: expect.stringContaining('never exposed but exposable (the reference solution or an accepted alternative reached it in the matrix)') });
    expect(x.fault_criteria.env.find((c) => c.id === 'E5')!.met).toBe(false);
    expect(x.fault).toBe('model');
  });

  // Since A2 r4 (#111) m3_red_flag's decisive id is the red-flag message, Communication/comm-t6-m3,
  // which the model read, so this case no longer turns on a referenced id; it stays the model's.
  it("message-queue m3_handled_as_routine: m3_red_flag's decisive id was shown to the model, so M1 is met, E5 is not, and the fault is the model's", async () => {
    const { record, x } = await explained('message-queue', 'm3_handled_as_routine', 'm3_red_flag');
    expect(record.attribution!.exposure.length).toBeGreaterThan(0);
    expect(record.attribution!.exposure.every((e) => e.first_exposed_step !== null)).toBe(true);
    expect(x.criteria.find((c) => c.id === 'M1')!.met).toBe(true);
    expect(x.fault_criteria.env.find((c) => c.id === 'E5')!.met).toBe(false);
    expect(x.fault).toBe('model');
  });

  it('in the committed sample matrix.json, a passing oracle or alternative reached every gate decisive id of every task', async () => {
    for (const e of Object.values(SAMPLE_MATRIX.grader_task_versions)) {
      const t = await loadMatrixTask(e.task_id);
      const reached = e.probes.filter((p) => (p.kind === 'oracle' || p.kind === 'alternative') && p.as_expected).flatMap((p) => p.reachable_ids);
      expect(unreachedDecisive(t.checks, reached), e.task_id).toEqual([]);
    }
  });
});

describe('runMatrix: every gate decisive id is reachable by a passing oracle or alternative', async () => {
  const TOY = await loadMatrixTask('_toy');
  const SOLVERS: MatrixOptions = { trials: 1, regrades: 1, isolation: false, cases: ['oracle', ...TOY.alternatives.map((a) => a.id)] };

  it('the toy passes and says so', async () => {
    const r = await runMatrix(matrixEnv(), TOY, SOLVERS);
    expect(r.lines).toContain('decisive reachability: 3/3 gate decisive ids reached by a passing oracle or alternative');
    expect(r.pass).toBe(true);
  });

  it('a gate decisive id no passing oracle or alternative reached fails the task, naming it', async () => {
    const task = { ...TOY, checks: TOY.checks.map((c) => (c.id === 'note_cites_chart' && c.kind === 'gate' ? { ...c, decisive_ids: [...c.decisive_ids, 'Observation/never-reached'] } : c)) };
    const r = await runMatrix(matrixEnv(), task, SOLVERS);
    expect(r.lines).toContain('decisive reachability: 3/4 gate decisive ids reached by a passing oracle or alternative');
    expect(r.lines).toContain('  - decisive id Observation/never-reached of note_cites_chart: no passing oracle or alternative reached it');
    expect(r.pass).toBe(false);
  });

  it('is not checked unless the oracle and every alternative ran and passed', async () => {
    const r = await runMatrix(matrixEnv(), TOY, { ...SOLVERS, cases: ['oracle'] });
    expect(r.lines).toContain('decisive reachability: not checked (the oracle and every alternative must run and pass)');
  });
});
