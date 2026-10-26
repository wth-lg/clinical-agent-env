// The one ExplainContext builder (plan phase P14c) that cli/audit-check.ts and the web Runs view
// both call: the run manifest's world_hash for M3 (pending without a manifest), matrix.json by
// the current grade's grader_task_version, the recomputed exposure of a first failed check the
// recorded attribution does not name, and M1's reachability from the run's manifest and matrix.json
// (R14-30), never from the world.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { explainContext, matrixFor, needsWorld, runWorldHash, worldLookup, type TaskCheck } from '../explain-context.ts';
import { decisiveGate } from '../../grader/attribution.ts';
import { explainTrial, formatCriterion, type ExplainRecord } from '../explain.ts';
import { parseTrajectory } from '../trajectory.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { checks as contrastChecks } from '../../../tasks/contrast-ct-prep/tests/grader.ts';
import { checks as renalChecks } from '../../../tasks/renal-dose-review/tests/grader.ts';

const SAMPLE = join(repoRoot, 'apps/web/e2e/fixtures/sample-results/results/runs/sample-1');
const sample = (trial: string) => {
  const record = JSON.parse(readFileSync(join(SAMPLE, 'trials', `${trial}.json`), 'utf8')) as ExplainRecord & { trajectory: string };
  return { record, events: parseTrajectory(readFileSync(join(SAMPLE, record.trajectory), 'utf8')) };
};
// The sample run's matrix.json, as generate.ts --matrix writes it with `pnpm cli matrix --out`.
const SAMPLE_MATRIX = JSON.parse(readFileSync(join(SAMPLE, 'matrix.json'), 'utf8')) as unknown;
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

  // Each trial with M1 when the run has no manifest: contrast-ct-prep/3's decisive ids were shown, and
  // renal-dose-review/4's Observation/obs-t1-wt-1020 never was, so without the run's world it cannot be checked.
  // The decisive gate: contrast-ct-prep/3 fails ct_order first and no_substitution later, and the
  // unmarked safety failure is decisive (decisions.tsv 2026-10-28T06:50).
  for (const [trial, checks, noManifest] of [['contrast-ct-prep/3', contrastChecks, true], ['renal-dose-review/4', renalChecks, 'pending']] as const) {
    it(`${trial} (a REFUSAL with no attribution): M1 reads the recomputed exposure of its decisive check, and reachability from the run's matrix.json`, () => {
      const { record, events } = sample(trial);
      const input = { record, events, matrix: SAMPLE_MATRIX, checks: checks as readonly TaskCheck[] };
      const ctx = explainContext({ ...input, manifest: { world_hash: record.state_hash.initial } });
      expect(ctx.exposure?.check).toBe(decisiveGate(record.checks!)!.id);
      expect(m('M1', record, ctx).met).toBe(true);
      const none = m('M1', record, explainContext({ ...input, manifest: null }));
      expect(none.met).toBe(noManifest);
      if (noManifest === 'pending') expect(none.evidence).toMatch(/obs-t1-wt-1020 never exposed; exposability not checked \(the run has no manifest world_hash\)/);
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

describe('reachability (R14-30)', () => {
  // A retrieval FAIL whose decisive id the model was never shown, on world w1 under env e1.
  const record: ExplainRecord = {
    task_version: 'v', env_version: 'e1', grader_task_version: 'g-1', outcome: 'FAIL', state_hash: { initial: 'w1', final: 'f', replay_final: 'f' }, checks: [{ id: 'G1', kind: 'gate', met: false }],
    attribution: { auto: 'retrieval', first_failed: 'G1', decisive_step: 2, exposure: [{ id: 'Observation/obs-9', first_exposed_step: null }] },
  };
  const probe = (kind: string, reachable_ids: string[], as_expected = true) => ({ kind, id: kind, outcome: kind === 'mutant' ? 'FAIL' : 'PASS', as_expected, failed_checks: [], reachable_ids });
  const matrix = (probes: object[], world_hash = 'w1', env_version = 'e1') => ({ grader_task_versions: { 'g-1': { env_version, oracle_pass: true, alternatives_pass: true, world_hash, probes } } });
  const ctx = (mx: unknown, manifest: unknown = { world_hash: 'w1' }, inWorld?: (id: string) => boolean, r: ExplainRecord = record) => explainContext({ record: r, events: [], manifest, matrix: mx, ...(inWorld ? { inWorld } : {}) });

  it('an unexposed decisive id is exposable when a tool result gave it to a passing oracle or alternative in the matrix', () => {
    expect(m('M1', record, ctx(matrix([probe('oracle', ['Observation/obs-9'])])))).toMatchObject({ met: true, evidence: 'Observation/obs-9 never exposed but exposable (the reference solution or an accepted alternative reached it in the matrix)' });
    expect(m('M1', record, ctx(matrix([probe('oracle', []), probe('alternative', ['Observation/obs-9'])]))).met).toBe(true);
  });

  it('it is not exposable when only a mutant or another agent was shown it, even though it is in the world, so E5 holds', () => {
    const c = ctx(matrix([probe('oracle', ['Patient/pt-1']), probe('mutant', ['Observation/obs-9']), probe('spray', ['Observation/obs-9'])]), undefined, () => true);
    expect(m('M1', record, c)).toMatchObject({ met: false, evidence: 'Observation/obs-9 was never exposed and is not exposable (neither the reference solution nor an accepted alternative reached it in the matrix)' });
    expect(explainTrial(record, undefined, c).fault_criteria.env.find((x) => x.id === 'E5')!.met).toBe(true);
  });

  it('an oracle or alternative that was not as the matrix expects is no evidence (review F5)', () => {
    const c = ctx(matrix([probe('oracle', ['Observation/obs-9'], false), probe('alternative', ['Observation/obs-9'], false)]));
    expect(m('M1', record, c)).toMatchObject({ met: false, evidence: 'Observation/obs-9 was never exposed and is not exposable (neither the reference solution nor an accepted alternative reached it in the matrix)' });
  });

  it('exposability is not checked, and M1 says why, when the matrix ran on another world or env_version, the run has no manifest, or the matrix entry has no reachable ids', () => {
    const shown = [probe('oracle', ['Observation/obs-9'])];
    expect(m('M1', record, ctx(matrix(shown, 'w2')))).toMatchObject({ met: 'pending', evidence: "Observation/obs-9 never exposed; exposability not checked (the run's world w1 is not the world w2 the matrix ran on)" });
    expect(m('M1', record, ctx(matrix(shown), null))).toMatchObject({ met: 'pending', evidence: expect.stringMatching(/not checked \(the run has no manifest world_hash\)$/) });
    expect(m('M1', record, ctx({ grader_task_versions: { 'g-1': { oracle_pass: true, alternatives_pass: true } } }))).toMatchObject({ met: 'pending', evidence: expect.stringMatching(/not checked \(matrix\.json's entry for g-1 records no env_version, world_hash and reachable ids; rerun pnpm cli matrix --out <run>\)$/) });
    expect(m('M1', record, ctx(null))).toMatchObject({ met: 'pending', evidence: expect.stringMatching(/not checked \(the run has no matrix\.json entry for g-1\)$/) });
  });

  it("it compares the record's env_version with the matrix entry's (env files, world, TOOLS_VERSION): on a mismatch M1 is pending and says so (review F4)", () => {
    const shown = [probe('oracle', ['Observation/obs-9'])];
    expect(m('M1', record, ctx(matrix(shown, 'w1', 'e2')))).toMatchObject({ met: 'pending', evidence: "Observation/obs-9 never exposed; exposability not checked (the trial ran at env_version e1, the matrix at e2)" });
    const { env_version: _, ...without } = record;
    expect(m('M1', without, ctx(matrix(shown), undefined, undefined, without))).toMatchObject({ met: 'pending', evidence: expect.stringMatching(/not checked \(the record has no env_version\)$/) });
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
  it('never asks for the world, and an inWorld a caller passes decides nothing (R14-30)', () => {
    const base = { task_version: 'v', outcome: 'FAIL', state_hash: { initial: 'h', final: 'f', replay_final: 'f' }, checks: [{ id: 'G1', kind: 'gate', met: false }] };
    const never: ExplainRecord = { ...base, attribution: { auto: 'retrieval', first_failed: 'G1', decisive_step: 2, exposure: [{ id: 'Observation/obs-1', first_exposed_step: null }] } };
    expect(needsWorld({ record: never, events: [] })).toBe(false);
    expect(m('M1', never, explainContext({ record: never, events: [], inWorld: () => true })).met).toBe('pending');
  });
});
