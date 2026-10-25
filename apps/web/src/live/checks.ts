// A task's checks in the browser (its tests/grader.ts, bundled by Vite, loaded on demand) and the
// projection one browser-direct trial of it opens its grant with: the per-trial cap plus the
// judge allowance for its judge items, as `run-one --dry-run` prints it.
import { PER_TRIAL_CAP_USD } from '../../../../packages/core/cost.ts';
import type { Check } from '../../../../packages/grader/check.ts';
import { judgeAllowanceUsd } from '../../../../packages/grader/judge.ts';

const GRADERS = import.meta.glob<{ checks?: readonly Check[] }>('../../../../tasks/*/tests/grader.ts');

export async function taskChecks(task: string): Promise<readonly Check[]> {
  const load = GRADERS[`../../../../tasks/${task}/tests/grader.ts`];
  return load === undefined ? [] : ((await load()).checks ?? []);
}

export const trialProjection = async (task: string): Promise<number> => PER_TRIAL_CAP_USD + judgeAllowanceUsd(await taskChecks(task));
