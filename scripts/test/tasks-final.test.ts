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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../../packages/core/cost.ts';
import { taskVersions } from '../../packages/core/tasks.ts';
import { repoRoot } from './helpers.ts';

export const TASKS_FINAL = 'results/tasks-final.json';
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
  regrades: FrozenRegrade[];
}
export interface TasksFinal {
  schema_version: 1;
  trials_per_task: number;
  band: [number, number];
  tasks: Record<string, FrozenTask>;
}

// The grader-side versions a frozen task is held to now: its last regrade's, else the freeze's.
export const currentVersions = (t: FrozenTask): { grader_task_version: string; task_version: string } => t.regrades.at(-1) ?? t;

const file = join(repoRoot, TASKS_FINAL);
const doc = (): TasksFinal => JSON.parse(readFileSync(file, 'utf8')) as TasksFinal;

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
    for (const [id, t] of Object.entries(d.tasks)) {
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
    for (const [id, t] of Object.entries(d.tasks)) {
      const now = await taskVersions(await source.get(id), t.world_hash);
      expect(now.env_version, `${id}: env_version at the frozen world moved since the freeze (the task's env files or TOOLS_VERSION)`).toBe(t.env_version);
      const held = currentVersions(t);
      expect(now.grader_task_version, `${id}: grader_task_version moved without a regrade entry in ${TASKS_FINAL}`).toBe(held.grader_task_version);
      expect(now.task_version, `${id}: task_version moved without a regrade entry in ${TASKS_FINAL}`).toBe(held.task_version);
    }
  });
});
