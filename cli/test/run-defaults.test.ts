// cli run's defaults and help (plan phase P17i C11, R14-41): --trials defaults to
// FINAL_TRIALS_PER_TASK, the final run's size, and --help says that --cost-from projects each
// task by the p90 of the latest run holding its env_version, as packages/core/cost.ts does.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../packages/core/anthropic.ts';
import { FINAL_TRIALS_PER_TASK } from '../../packages/core/cost.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main } from '../run.ts';

async function cli(args: string[]) {
  const out: string[] = [];
  const home = tempDir('run-defaults-home');
  const code = await main(args, { env: { HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl') }, out: (l) => out.push(l), fetch: () => Promise.reject(new Error('no live call')), mock: () => () => Promise.reject(new Error('no mock call')) });
  return { code, out: out.join('\n') };
}

describe('cli run defaults', () => {
  it('without --trials, a batch plans FINAL_TRIALS_PER_TASK trials per task', async () => {
    const r = await cli(['--task', '_toy', '--model', MODEL, '--out', join(tempDir('run-defaults'), 'run'), '--mock', 'toy', '--dry-run']);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(new RegExp(`run dry run: ${FINAL_TRIALS_PER_TASK} of ${FINAL_TRIALS_PER_TASK} trials to run`));
  });

  it('--help names the --trials default and says --cost-from reads each task\'s env_version', async () => {
    const r = await cli(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`[--trials ${FINAL_TRIALS_PER_TASK}]`);
    expect(r.out).toMatch(/--trials\s+trials per task; default FINAL_TRIALS_PER_TASK \(20\), the final run's size/);
    expect(r.out).toMatch(/--cost-from\s+.*the latest run holding its env_version/);
    expect(r.out).not.toMatch(/task_version/);
  });
});
