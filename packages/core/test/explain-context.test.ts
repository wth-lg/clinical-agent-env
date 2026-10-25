// The one ExplainContext builder (plan phase P14c) that cli/audit-check.ts and the web Runs view
// both call: the run manifest's world_hash for M3 (pending without a manifest), matrix.json by
// the current grade's grader_task_version, the recomputed exposure of a first failed check the
// recorded attribution does not name, and the world only when M1 reads it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { explainContext, matrixFor, needsWorld, runWorldHash, worldLookup, type TaskCheck } from '../explain-context.ts';
import { explainTrial, formatCriterion, type ExplainRecord } from '../explain.ts';
import { parseTrajectory } from '../trajectory.ts';
import { loadStore } from '../../env/fixture-source.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { checks as contrastChecks } from '../../../tasks/contrast-ct-prep/tests/grader.ts';
import { checks as renalChecks } from '../../../tasks/renal-dose-review/tests/grader.ts';

const SAMPLE = join(repoRoot, 'apps/web/e2e/fixtures/sample-results/results/runs/sample-1');
const sample = (trial: string) => {
  const record = JSON.parse(readFileSync(join(SAMPLE, 'trials', `${trial}.json`), 'utf8')) as ExplainRecord & { trajectory: string };
  return { record, events: parseTrajectory(readFileSync(join(SAMPLE, record.trajectory), 'utf8')) };
};
const world = async () => {
  const bytes = new Uint8Array(readFileSync(join(repoRoot, 'fixtures/world.ndjson.gz')));
  return worldLookup(new Set([...(await loadStore({ read: async () => bytes })).resources()].map((r) => `${r.resourceType}/${r.id}`)));
};
const m = (id: string, record: ExplainRecord, ctx: ReturnType<typeof explainContext>) => explainTrial(record, undefined, ctx).criteria.find((c) => c.id === id)!;

describe('explainContext', () => {
  it('M3 is pending when the run has no manifest, and compared with the run manifest\'s world_hash when it has one', () => {
    const { record, events } = sample('contrast-ct-prep/0');
    const none = m('M3', record, explainContext({ record, events, manifest: null }));
    expect(formatCriterion(none)).toBe('M3: pending');
    expect(none.evidence).toMatch(/^run has no manifest; /);
    expect(m('M3', record, explainContext({ record, events, manifest: { world_hash: record.state_hash.initial } })).met).toBe(true);
    expect(m('M3', record, explainContext({ record, events, manifest: { world_hash: 'f'.repeat(64) } })).met).toBe(false);
    expect(m('M3', record, explainContext({ record, events, manifest: { world_hash: 7 } })).met).toBe('pending');
  });

  for (const [trial, checks] of [['contrast-ct-prep/3', contrastChecks], ['renal-dose-review/4', renalChecks]] as const) {
    it(`${trial} (a REFUSAL with no attribution): M1 reads the recomputed exposure of its first failed check`, async () => {
      const { record, events } = sample(trial);
      const input = { record, events, manifest: null, checks: checks as readonly TaskCheck[] };
      const ctx = explainContext({ ...input, inWorld: needsWorld(input) ? await world() : null });
      expect(ctx.exposure?.check).toBe(record.checks!.find((c) => c.kind === 'gate' && c.met === false)!.id);
      expect(m('M1', record, ctx).met).toBe(true);
      // Without the task's checks there is nothing to recompute, so M1 cannot say.
      expect(m('M1', record, explainContext({ record, events, manifest: null })).met).toBe('pending');
    });
  }

  it('gives traces_to for gate checks only', () => {
    const { record, events } = sample('contrast-ct-prep/0');
    const ctx = explainContext({ record, events, checks: [{ id: 'a', kind: 'gate', traces_to: 'P1' }, { id: 'b', kind: 'rubric', traces_to: 'P2' }, { id: 'c', kind: 'gate' }] });
    expect(ctx.checks).toEqual([{ id: 'a', traces_to: 'P1' }]);
    expect(explainContext({ record, events }).checks).toBeUndefined();
  });
});

describe('matrixFor', () => {
  const matrix = { grader_task_versions: { g1: { oracle_pass: true, alternatives_pass: false, failed_checks: ['G1'] }, g2: { oracle_pass: true, alternatives_pass: true, failed_checks: 'G1' }, g3: { oracle_pass: 'yes', alternatives_pass: true } } };
  it('reads the entry for the grader_task_version, dropping failed_checks that are not strings', () => {
    expect(matrixFor(matrix, 'g1')).toEqual({ grader_task_version: 'g1', oracle_pass: true, alternatives_pass: false, failed_checks: ['G1'] });
    expect(matrixFor(matrix, 'g2')).toEqual({ grader_task_version: 'g2', oracle_pass: true, alternatives_pass: true });
  });
  it('is null for an entry that is not a verdict, a missing version, no version or no matrix', () => {
    expect(matrixFor(matrix, 'g3')).toBeNull();
    expect(matrixFor(matrix, 'g9')).toBeNull();
    expect(matrixFor(matrix, null)).toBeNull();
    expect(matrixFor(null, 'g1')).toBeNull();
  });
});

describe('runWorldHash, worldLookup and needsWorld', () => {
  it('reads world_hash only when it is a string', () => {
    expect(runWorldHash({ world_hash: 'abc' })).toBe('abc');
    expect(runWorldHash({})).toBeNull();
    expect(runWorldHash(null)).toBeNull();
    expect(runWorldHash([])).toBeNull();
  });
  it('matches a typed id exactly and a bare id under any type', () => {
    const inWorld = worldLookup(new Set(['Observation/obs-1', 'Patient/pt-1']));
    expect(inWorld('Observation/obs-1')).toBe(true);
    expect(inWorld('Patient/obs-1')).toBe(false);
    expect(inWorld('pt-1')).toBe(true);
    expect(inWorld('pt-2')).toBe(false);
  });
  it('asks for the world only when a decisive id M1 reads was never exposed', () => {
    const base = { task_version: 'v', outcome: 'FAIL', state_hash: { initial: 'h', final: 'f', replay_final: 'f' }, checks: [{ id: 'G1', kind: 'gate', met: false }] };
    const exposed: ExplainRecord = { ...base, attribution: { auto: 'reasoning', first_failed: 'G1', decisive_step: 2, exposure: [{ id: 'Observation/obs-1', first_exposed_step: 1 }] } };
    const never: ExplainRecord = { ...base, attribution: { auto: 'retrieval', first_failed: 'G1', decisive_step: 2, exposure: [{ id: 'Observation/obs-1', first_exposed_step: null }] } };
    expect(needsWorld({ record: exposed, events: [] })).toBe(false);
    expect(needsWorld({ record: never, events: [] })).toBe(true);
    // No attribution: the task's decisive ids, never exposed in an empty trajectory.
    expect(needsWorld({ record: { ...base, attribution: null }, events: [], checks: [{ id: 'G1', kind: 'gate', decisive_ids: ['obs-1'] }] })).toBe(true);
    expect(needsWorld({ record: { ...base, attribution: null }, events: [] })).toBe(false);
  });
});
