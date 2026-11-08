// The Runs and Findings line on how a run was graded (src/data/grading-line.ts). eval-p25u-2 S6:
// "(20 trials, results/tasks-final.json)" beside a 120-trial list read as the run's size; the
// line now says which of the run's trials started from a frozen world that is not today's build,
// out of how many, and of which tasks.
import { describe, expect, it } from 'vitest';
import { gradingLine } from '../src/data/grading-line.ts';

const base = { graders: ['21', '22'], current: ['21', '22'], olderWorld: 0, frozenWorld: 0, regrade: null, trials: 120, frozenTasks: [] as string[] };

describe('gradingLine', () => {
  it('is null for today\'s grader on today\'s world', () => {
    expect(gradingLine({ ...base, graders: ['22'], current: ['22'] })).toBeNull();
  });

  it('claim audit: names the recorded graders apart from the current grades when a regrade in the records moved them', () => {
    expect(gradingLine({ ...base, current: ['22'], frozenWorld: 20, frozenTasks: ['contrast-ct-prep'] })).toBe(
      "Recorded with grader 21 and 22; every current grade is grader 22. 20 of the 120 trials (contrast-ct-prep) started from their task's frozen world, not today's build (results/tasks-final.json); the other 100 started from today's build.",
    );
    expect(gradingLine({ ...base, graders: ['21'], current: ['21', '22'], frozenWorld: 2, trials: 2, frozenTasks: ['a'] })).toBe(
      "Recorded with grader 21; the current grades are grader 21 and 22. 2 of the 2 trials (a) started from their task's frozen world, not today's build (results/tasks-final.json).",
    );
  });

  it('S6: names the frozen-world trials out of the run\'s trials, and their task', () => {
    expect(gradingLine({ ...base, frozenWorld: 20, frozenTasks: ['contrast-ct-prep'] })).toBe(
      "Graded with grader 21 and 22. 20 of the 120 trials (contrast-ct-prep) started from their task's frozen world, not today's build (results/tasks-final.json); the other 100 started from today's build.",
    );
    expect(gradingLine({ ...base, frozenWorld: 1, trials: 1, frozenTasks: ['a'] })).toBe(
      "Graded with grader 21 and 22. 1 of the 1 trials (a) started from its task's frozen world, not today's build (results/tasks-final.json).",
    );
  });

  it('keeps the older-world wording, and the regrade after it', () => {
    expect(gradingLine({ ...base, graders: ['3'], current: ['3'], olderWorld: 4, trials: 4, regrade: { graders: ['4'], records: 4, changed: [] } })).toBe(
      "Graded with grader 3 on an older world than today's; a regrade with grader 4 gives the same outcomes.",
    );
    expect(gradingLine({ ...base, graders: ['3'], current: ['3'], olderWorld: 2, frozenWorld: 1, trials: 3, frozenTasks: ['a'] })).toBe(
      "Graded with grader 3 on an older world than today's. 1 of the 3 trials (a) started from its task's frozen world, not today's build (results/tasks-final.json).",
    );
  });
});
