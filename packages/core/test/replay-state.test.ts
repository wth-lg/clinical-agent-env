// replayState (plan phase P16): the tool log of a recorded trial, replayed as gradeTrajectory
// replays it, leaves the state whose hash is the record's final hash, and exporting it changes
// nothing in gradeTrajectory, whose grade on the same trial is still the recorded one.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { repoWorld, taskChecks } from '../../../cli/run.ts';
import { stateHash } from '../../env/hash.ts';
import { gradeTrajectory, replayState, type GradeTrajectoryOptions } from '../run.ts';
import { parseTrajectory } from '../trajectory.ts';

const RUN = new URL('../../../apps/web/e2e/fixtures/sample-results/results/runs/sample-1/', import.meta.url);
const { world, definitions } = repoWorld();

// A FAIL that wrote orders and a note, and a PASS, of the committed sample run.
describe.each(['renal-dose-review/5', 'renal-dose-review/0'])('replayState on %s', (name) => {
  const record = JSON.parse(readFileSync(new URL(`trials/${name}.json`, RUN), 'utf8')) as GradeTrajectoryOptions['record'] & { task_id: string; outcome: string; score: number; checks: Array<{ id: string; met: unknown }> };
  const events = parseTrajectory(readFileSync(new URL(`trajectories/${name}.jsonl`, RUN), 'utf8'));
  const opts = { tasks: nodeTaskSource({ testMode: false }), world, events, definitions: definitions as NonNullable<GradeTrajectoryOptions['definitions']> };

  it('hashes to the record\'s initial and final state', { timeout: 60_000 }, async () => {
    const s = await replayState(record.task_id, opts);
    expect(s.error).toBeNull();
    expect(await stateHash(s.initial)).toBe(record.state_hash.initial);
    expect(await stateHash(s.final!)).toBe(record.state_hash.final);
  });

  it('leaves gradeTrajectory\'s grade the recorded one', { timeout: 60_000 }, async () => {
    const g = await gradeTrajectory(record.task_id, { ...opts, checks: await taskChecks(record.task_id), record });
    expect([g.outcome, g.score, g.checks.map((c) => [c.id, c.met])]).toEqual([record.outcome, record.score, record.checks.map((c) => [c.id, c.met])]);
  });
});
