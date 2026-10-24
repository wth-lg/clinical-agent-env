// One TaskSource per batch request (reports/verifier-phase-replay-1.md item 3): a TaskSource reads
// the task directories once, so a runner holding one for its whole process would grade every
// later batch against the tasks as they were at start. A task file edited between two batches
// on one runner shows up in the second batch, at its new env_version. A grader edited between two
// batches grades the second batch, at its new grader_task_version (review-phase-P11f-1 m3).
import { appendFileSync, cpSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTrialView } from '../../../packages/core/runner-api.ts';
import { taskVersions } from '../../../packages/core/tasks.ts';
import { nodeTaskSource, TASKS_DIR } from '../../../cli/adapters/tasks-node.ts';
import { launch, readSse, REPO, tempDir, toyTrial, type Launched } from './helpers.ts';

type Rec = { env_version: string; grader_task_version: string; fixture_hash: string; checks: Array<{ id: string }> };

// A copy of tasks/_toy under <tmp>/tasks, with <tmp>/packages linked to the repo's, so its
// tests/grader.ts imports ../../../packages as it does in the repo.
function toyCopy(): string {
  const dir = tempDir('runner-tasks');
  symlinkSync(join(REPO, 'packages'), join(dir, 'packages'), 'dir');
  cpSync(join(TASKS_DIR, '_toy'), join(dir, 'tasks', '_toy'), { recursive: true });
  return join(dir, 'tasks');
}

async function batchRecord(l: Launched): Promise<Rec> {
  const a = (await l.http('POST', '/api/trials', { body: toyTrial() })).json() as { trial_ids: string[] };
  const s = await readSse(l.port, `/api/trials/${a.trial_ids[0]}/events`, { token: l.runner.token });
  expect(s.frames.at(-1)?.event).toBe('graded');
  return parseTrialView((await l.http('GET', `/api/trials/${a.trial_ids[0]}`)).json()).record as Rec;
}

describe('a task edited between two batches', () => {
  it('is graded as edited: the second batch runs at the new env_version', async () => {
    const root = toyCopy();
    const envVersion = async (worldHash: string) => (await taskVersions(await nodeTaskSource({ root }).get('_toy'), worldHash)).env_version;
    const l = await launch({ mock: true, transport: null, tasksDir: root });
    try {
      const first = await batchRecord(l);
      expect(first.env_version).toBe(await envVersion(first.fixture_hash));

      appendFileSync(join(root, '_toy', 'instruction.md'), '\nEdited between two batches.\n');
      const second = await batchRecord(l);
      expect(second.env_version).toBe(await envVersion(second.fixture_hash));
      expect(second.env_version).not.toBe(first.env_version);
    } finally {
      await l.runner.shutdown();
    }
  });

  it('a grader edit grades the second batch with the new checks, at the new grader_task_version', async () => {
    const root = toyCopy();
    const graderVersion = async (worldHash: string) => (await taskVersions(await nodeTaskSource({ root }).get('_toy'), worldHash)).grader_task_version;
    const l = await launch({ mock: true, transport: null, tasksDir: root });
    try {
      const first = await batchRecord(l);
      expect(first.grader_task_version).toBe(await graderVersion(first.fixture_hash));
      expect(first.checks.length).toBeGreaterThan(1);

      appendFileSync(join(root, '_toy', 'tests', 'grader.ts'), '\n// Edited between two batches: only the first check.\nchecks.splice(1);\n');
      const second = await batchRecord(l);
      expect(second.grader_task_version).toBe(await graderVersion(second.fixture_hash));
      expect(second.grader_task_version).not.toBe(first.grader_task_version);
      expect(second.env_version).toBe(first.env_version);
      expect(second.checks.map((c) => c.id)).toEqual([first.checks[0]!.id]);
    } finally {
      await l.runner.shutdown();
    }
  });
});
