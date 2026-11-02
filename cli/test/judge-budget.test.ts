// The judge allowance a live trial grades under (packages/grader/grade.ts judgeFor:
// judgeCallBudget of the task's checks) covers every question a correct trial makes the grader
// ask. The matrix grades from the canned cache with no client, so the allowance never binds there;
// a live trial's grading sends each question, and past the allowance a question is not sent and
// its item reads unknown (builder-265 issue 4: probe-1's T6 reply_names_other_patient over by 4,
// T2 note_contradicts_result over by 7, so pass_no_harm read 0 on both tasks). Here each task's
// oracle and every alternative is graded with a client that sends nothing and answers "unknown"
// (cli/oracle.ts recordingClient, a valid answer, so no question is retried), under the trial's
// own allowance: none may reach it. Mutants, the null agent and the agents are wrong solutions;
// their questions are bounded by the hard cap, not required to fit.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SESSION_CAP_USD } from '../../apps/web/src/spend/cap.ts';
import { judgeFor } from '../../packages/grader/grade.ts';
import { JUDGE_MAX_CALLS, judgeAllowanceUsd, judgeCallBudget } from '../../packages/grader/judge.ts';
import { cases, gradeRunWith, trial } from '../../packages/grader/matrix/matrix.ts';
import { loadMatrixTask, matrixEnv } from '../matrix.ts';
import { recordingClient } from '../oracle.ts';
import { projection } from '../run-one.ts';

const TASKS = ['renal-dose-review', 'results-inbox', 'crc-care-gap', 'discharge-medrec', 'contrast-ct-prep', 'message-queue'];
const env = matrixEnv();

describe('judge allowance', () => {
  it.each(TASKS)('%s: the oracle and every alternative grade live within the trial allowance, under the hard cap', async (id) => {
    const task = await loadMatrixTask(id);
    const budget = judgeCallBudget(task.checks);
    expect(budget).toBeLessThanOrEqual(JUDGE_MAX_CALLS);
    const over: string[] = [];
    let most = 0;
    let mostUsd = 0;
    for (const c of cases(task).filter((x) => x.kind === 'oracle' || x.kind === 'alternative')) {
      const worst: number[] = [];
      const judge = judgeFor(task.checks, { judge: recordingClient(worst), effort: task.judgeEffort });
      await gradeRunWith(env, task, await trial(env, task, c), judge);
      most = Math.max(most, worst.length);
      mostUsd = Math.max(mostUsd, worst.reduce((n, w) => n + w, 0));
      if (judge.overAllowance > 0) over.push(`${c.id}: ${worst.length} calls sent, ${judge.overAllowance} questions over the allowance of ${budget}`);
    }
    expect(over).toEqual([]);
    expect(most).toBeLessThanOrEqual(budget);
    // The worst cases of the calls sent fit in the allowance in dollars too (GRADER16-193 F2: each
    // call priced at max_tokens plus JUDGE_PRICED_BODY_BYTES), so the guard never binds a correct trial.
    expect(mostUsd).toBeLessThanOrEqual(judgeAllowanceUsd(task.checks));
  }, 600_000);

  // GRADER16-193 F2 (coordinator ruling): one trial of every task projects within the default session
  // cap, so the live tab admits it. crc-care-gap was over it at grader 15 and 16 with 13 table rows;
  // since the PW4-E3 list cut (four members, builder-283) it is within too.
  it('one trial of each task projects within the default session cap', async () => {
    const rows: Record<string, { projection: number; admitted: boolean }> = {};
    for (const id of TASKS) {
      const p = projection((await loadMatrixTask(id)).checks);
      rows[id] = { projection: Math.round(p * 100) / 100, admitted: p <= DEFAULT_SESSION_CAP_USD };
    }
    expect(Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, r.admitted]))).toEqual({
      'renal-dose-review': true, 'results-inbox': true, 'crc-care-gap': true, 'discharge-medrec': true, 'contrast-ct-prep': true, 'message-queue': true,
    });
  });
});
