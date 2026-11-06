// results/tasks-final.json, the per-task freeze (plan P21; user decision 2026-11-03 "Run T3+T5
// now, redesign 4"): a task is frozen when its final run is about to start, and the final run
// directory results/runs/final-1 collects each task's 20 trials as it is frozen. For each frozen
// task the file pins task_version, grader_task_version, env_version, world_hash and
// oracle_final_hash (cli/matrix.ts checks the last one on every matrix run at the frozen world),
// frozen_at {tag} (the tag the coordinator puts on the freeze's squash-merge commit on main, the
// reproduce commit of the task's final-1 records, R37; a branch SHA would not survive the squash,
// so until the merge the tag may not exist, which scripts/donewhen.ts reports as a warning),
// frozen_from_branch (the branch commit the hashes were read from, for traceability) and
// regrades: the only way the grader side moves after the freeze is a grader bug fix with a full
// offline regrade, recorded there as {grader_version, grader_task_version, task_version, at (a
// tag or commit), reason}; the task's own files never move. trials_per_task and band are written from packages/core/cost.ts FINAL_TRIALS_PER_TASK and
// FINAL_PASS_BAND, so scripts/donewhen.ts and this file cannot drift apart.
// The freeze does not pin the shared world on main (R40): a later world rebuild moves every
// task's current env_version, frozen ones included, while their final-1 records stay valid at
// the frozen versions (donewhen clause 5 checks them against this file). So this test recomputes
// each frozen task's versions at its frozen world_hash: it fails when the task's own files
// (tasks/<id>/**, env side and grader side) or the tools changed since the freeze (env_version),
// or the grader changed without a regrade entry (grader_task_version, task_version), and not
// when the world changed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import type { TaskSource } from '../../packages/core/tasks.ts';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../../packages/core/cost.ts';
import { taskVersions } from '../../packages/core/tasks.ts';
import { repoRoot } from './helpers.ts';

export const TASKS_FINAL = 'results/tasks-final.json';
export const FINAL_TRIALS = 'results/runs/final-1/trials';
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
// A git tag name as this repo writes them.
const TAG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface FrozenRegrade {
  grader_version: string;
  grader_task_version: string;
  task_version: string;
  at: string;
  reason: string;
}
export interface FrozenTask {
  task_version: string;
  grader_task_version: string;
  env_version: string;
  world_hash: string;
  oracle_final_hash: string;
  frozen_at: { tag: string };
  frozen_from_branch: string;
  // The tag and commit that reproduce the task's final-1 records (R37): the commit holds the run,
  // the frozen world and the grader of the current grade.
  replay_at?: { tag: string; commit: string };
  regrades: FrozenRegrade[];
  // The earlier version's freeze, kept whole as history once the new version is frozen (R42:
  // crc-care-gap v2 over v1), with its `version`; pinned by its files at its tags like a pending
  // task's.
  superseded?: FrozenTask & { version: string };
}
// A task whose freeze a new version superseded (R42, T3 v2): `status: "v2-pending"`, the reason,
// and the earlier freeze kept whole under `superseded` with its `version`. It is not frozen (its
// new freeze is written by W5-S), and this test pins its superseded files at their tags instead.
export interface PendingTask {
  status: 'v2-pending';
  reason: string;
  superseded: FrozenTask & { version: string };
}
export const isPending = (t: FrozenTask | PendingTask): t is PendingTask => (t as PendingTask).status === 'v2-pending';
export interface TasksFinal {
  schema_version: 1;
  trials_per_task: number;
  band: [number, number];
  tasks: Record<string, FrozenTask | PendingTask>;
}

// The grader-side versions a frozen task is held to now: its last regrade's, else the freeze's.
export const currentVersions = (t: FrozenTask): { grader_task_version: string; task_version: string } => t.regrades.at(-1) ?? t;

const file = join(repoRoot, TASKS_FINAL);
const doc = (): TasksFinal => JSON.parse(readFileSync(file, 'utf8')) as TasksFinal;
// The task's files as a tag held them, extracted to a temporary tasks root inside the repo (as
// scripts/test/lever-invariant.test.ts plants its fixture), with the repo's fixtures/ and
// packages/ linked beside it so the task's events.ts imports resolve; a tag the checkout lacks
// skips the check with a warning, as scripts/donewhen.ts does for a freeze tag. The root is
// removed after the run.
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});
function taskSourceAt(tag: string, id: string): TaskSource | null {
  if (spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`], { cwd: repoRoot, encoding: 'utf8' }).status !== 0) return null;
  const root = mkdtempSync(join(repoRoot, 'scripts', 'test', '.tasks-final-at-'));
  roots.push(root);
  const archive = spawnSync('git', ['archive', '--format=tar', tag, `tasks/${id}`], { cwd: repoRoot, maxBuffer: 1 << 28 });
  if (archive.status !== 0) throw new Error(`git archive ${tag} tasks/${id}: ${archive.stderr.toString()}`);
  const untar = spawnSync('tar', ['-x', '-C', root], { input: archive.stdout });
  if (untar.status !== 0) throw new Error(`tar: ${untar.stderr.toString()}`);
  for (const d of ['fixtures', 'packages']) symlinkSync(join(repoRoot, d), join(root, d), 'dir');
  return nodeTaskSource({ root: join(root, 'tasks'), testMode: false });
}

describe('results/tasks-final.json', () => {
  it('exists and holds the final run size and band from the constants', () => {
    expect(existsSync(file), `${TASKS_FINAL} is missing: P21 writes it`).toBe(true);
    const d = doc();
    expect(d.schema_version).toBe(1);
    expect(d.trials_per_task).toBe(FINAL_TRIALS_PER_TASK);
    expect(d.band).toEqual([...FINAL_PASS_BAND]);
  });

  it('freezes only tasks of this checkout, each with well-formed hashes, commits and regrade entries', async () => {
    const d = doc();
    const ids = (await nodeTaskSource({ testMode: false }).all()).map((t) => t.id);
    const frozen = Object.keys(d.tasks);
    expect(frozen.length).toBeGreaterThan(0);
    for (const id of frozen) expect(ids, `${id} is frozen but not a task`).toContain(id);
    for (const [id, entry] of Object.entries(d.tasks)) {
      if (isPending(entry)) {
        expect(entry.reason.length, `${id}.reason`).toBeGreaterThan(0);
        expect(entry.superseded.version, `${id}.superseded.version`).toMatch(/^v\d+$/);
      }
      const t = isPending(entry) ? entry.superseded : entry;
      for (const k of ['task_version', 'grader_task_version', 'env_version', 'world_hash', 'oracle_final_hash'] as const) expect(t[k], `${id}.${k}`).toMatch(SHA256);
      expect(t.frozen_at?.tag, `${id}.frozen_at.tag`).toMatch(TAG);
      expect(t.frozen_from_branch, `${id}.frozen_from_branch`).toMatch(COMMIT);
      expect(Array.isArray(t.regrades), `${id}.regrades`).toBe(true);
      for (const r of t.regrades) {
        expect(r.grader_version).toMatch(/^\d+$/);
        expect(r.grader_task_version).toMatch(SHA256);
        expect(r.task_version).toMatch(SHA256);
        expect(r.at, `${id}: a regrade's at is a tag or a commit`).toMatch(TAG);
        expect(r.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("a frozen task's own files and tools have not moved (its env_version at the frozen world), and its grader side only through a recorded regrade", async () => {
    const d = doc();
    const source = nodeTaskSource({ testMode: false });
    for (const [id, entry] of Object.entries(d.tasks)) {
      if (isPending(entry)) continue;
      const t = entry;
      const now = await taskVersions(await source.get(id), t.world_hash);
      expect(now.env_version, `${id}: env_version at the frozen world moved since the freeze (the task's env files or TOOLS_VERSION)`).toBe(t.env_version);
      const held = currentVersions(t);
      expect(now.grader_task_version, `${id}: grader_task_version moved without a regrade entry in ${TASKS_FINAL}`).toBe(held.grader_task_version);
      expect(now.task_version, `${id}: task_version moved without a regrade entry in ${TASKS_FINAL}`).toBe(held.task_version);
    }
  });

  // R42, R37, R40: a superseded freeze is history. Its recorded files, as the tag of its last
  // regrade (else its freeze tag) holds them, still give the versions it records at its world,
  // and the checkout's files have moved on from them (the task is pending its new version, or
  // frozen on it with the earlier freeze kept under `superseded`).
  it("a superseded freeze (under a v2-pending or a frozen entry) is pinned by its files at their tag, and the checkout's task has moved on from it", async () => {
    const d = doc();
    const source = nodeTaskSource({ testMode: false });
    for (const [id, entry] of Object.entries(d.tasks)) {
      if (entry.superseded === undefined) continue;
      const t = entry.superseded;
      const held = currentVersions(t);
      const tag = t.regrades.at(-1)?.at ?? t.frozen_at.tag;
      const at = taskSourceAt(tag, id);
      if (at === null) {
        console.warn(`${TASKS_FINAL}: ${id}'s tag ${tag} is not on this checkout; its superseded freeze is not pinned here`);
      } else {
        const then = await taskVersions(await at.get(id), t.world_hash);
        expect(then.env_version, `${id}: env_version of the superseded freeze at its tag ${tag} and world`).toBe(t.env_version);
        expect(then.grader_task_version, `${id}: grader_task_version of the superseded freeze at its tag ${tag}`).toBe(held.grader_task_version);
        expect(then.task_version, `${id}: task_version of the superseded freeze at its tag ${tag}`).toBe(held.task_version);
      }
      const now = await taskVersions(await source.get(id), t.world_hash);
      expect(now.task_version, `${id} is pending a new version, so its checkout files must differ from the superseded freeze`).not.toBe(held.task_version);
    }
  });

  // Pre-audit-2 S14, R37: replay_at names the commit that reproduces a frozen task's final-1
  // records, which is not the freeze commit once a grader fix regraded them (the freeze's grader
  // contradicts the current grade): a tag the coordinator creates, and the commit it names, so the
  // test holds before the tag exists. That commit's tree must hold the run and the frozen world.
  // A task frozen before its final run (W5-S freezes renal-dose-review on pilot-5a's evidence, its
  // final-1 records still to come) names no replay_at yet: scripts/donewhen.ts then points at the
  // freeze tag, and the pointer is written with the run. Once the task has records under
  // results/runs/final-1/trials/<id>/ the pointer is required, so a frozen task cannot lose it
  // (W5S-232 F1; the same rule in scripts/donewhen.ts clause 5).
  const finalRecords = (id: string): number => {
    const dir = join(repoRoot, FINAL_TRIALS, id);
    return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).length : 0;
  };
  it('replay_at is required for a frozen task with final-1 records, and where named is a tag and a commit of this repository whose tree holds results/runs/final-1 and the frozen world', () => {
    const d = doc();
    // A v2-pending task's replay_at is its superseded freeze's (R42): the commit that holds its
    // earlier version's final-1 records; so is a frozen new version's until its own records land
    // (crc-care-gap v2 over v1: final-1 holds v1's 20 until W5-F moves them to superseded/).
    for (const [id, entry] of Object.entries(d.tasks)) {
      const fallback = !isPending(entry) && entry.replay_at === undefined && entry.superseded?.replay_at !== undefined;
      const t = isPending(entry) ? entry.superseded : fallback ? entry.superseded! : entry;
      // W5H5-235 S1: the superseded pointer stands in only while final-1's records are the ones
      // its commit holds (byte for byte), never for records of the new version.
      if (fallback) {
        const same = spawnSync('git', ['-C', repoRoot, 'diff', '--quiet', t.replay_at!.commit, 'HEAD', '--', `${FINAL_TRIALS}/${id}`]);
        expect(same.status, `${id}: results/runs/final-1/trials/${id} differs from the superseded freeze's replay_at commit ${t.replay_at!.commit.slice(0, 12)}, so that pointer cannot stand in for the entry's own replay_at`).toBe(0);
      }
      if (t.replay_at === undefined) {
        expect(finalRecords(id), `${id}: has final-1 records under ${FINAL_TRIALS} and names no replay_at (R37: the tag and commit that reproduce them)`).toBe(0);
        continue;
      }
      expect(t.replay_at?.tag, `${id}.replay_at.tag`).toMatch(TAG);
      expect(t.replay_at?.commit, `${id}.replay_at.commit`).toMatch(COMMIT);
      const { commit, tag } = t.replay_at!;
      const show = (path: string) => spawnSync('git', ['-C', repoRoot, 'cat-file', '-p', `${commit}:${path}`], { encoding: 'utf8' });
      const manifest = show('fixtures/manifest.json');
      expect(manifest.status, `${id}: commit ${commit} is not on this checkout or has no fixtures/manifest.json`).toBe(0);
      expect((JSON.parse(manifest.stdout) as { world: { state_hash: string } }).world.state_hash, `${id}: the world at ${commit.slice(0, 12)} is not the frozen world`).toBe(t.world_hash);
      const trials = spawnSync('git', ['-C', repoRoot, 'ls-tree', '--name-only', commit, `results/runs/final-1/trials/${id}/`], { encoding: 'utf8' });
      expect(trials.stdout.trim().split('\n').filter((l) => l !== '').length, `${id}: ${commit.slice(0, 12)} holds no final-1 records of it`).toBe(FINAL_TRIALS_PER_TASK);
      const resolved = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`], { encoding: 'utf8' });
      if (resolved.status === 0) expect(resolved.stdout.trim(), `${id}: tag ${tag} does not name replay_at.commit`).toBe(commit);
    }
  });

  // After a squash merge the PR-branch commit a pointer named is gone from main; the pointer must
  // name a commit on the line of this checkout (the squash commit that holds the run), or a
  // clone cannot reproduce the run (gate FINAL-238 follow-up).
  it('every replay_at.commit, entry or superseded, is an ancestor of HEAD', () => {
    const d = doc();
    for (const [id, entry] of Object.entries(d.tasks)) {
      const own = (entry as { replay_at?: { tag: string; commit: string } }).replay_at;
      for (const [where, t] of [['replay_at', own], ['superseded.replay_at', entry.superseded?.replay_at]] as const) {
        if (t === undefined) continue;
        const r = spawnSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', t.commit, 'HEAD'], { encoding: 'utf8' });
        expect(r.status, `${id}.${where}.commit ${t.commit.slice(0, 12)} is not an ancestor of HEAD (${r.stderr.trim()})`).toBe(0);
      }
    }
    // The run's replay.json names where each verdict was made; those commits must be on the line
    // of this checkout too, or the verdicts cannot be re-made where they were.
    const replay = JSON.parse(readFileSync(join(repoRoot, 'results/runs/final-1/replay.json'), 'utf8')) as { trials: Record<string, { replayed_at: { commit: string } }> };
    const commits = [...new Set(Object.values(replay.trials).map((v) => v.replayed_at.commit))];
    expect(commits.length).toBeGreaterThan(0);
    for (const commit of commits) {
      const r = spawnSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', commit, 'HEAD'], { encoding: 'utf8' });
      expect(r.status, `replay.json replayed_at.commit ${commit.slice(0, 12)} is not an ancestor of HEAD (${r.stderr.trim()})`).toBe(0);
    }
  });
});
