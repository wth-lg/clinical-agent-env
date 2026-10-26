import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { repoRoot } from './helpers.ts';

// The e2e job runs in the official Playwright image so CI never installs browsers or apt
// packages. The image ships browsers for one Playwright version, so its tag must follow the
// pinned @playwright/test; a version bump without an image bump fails here.

type Step = { id?: string; run?: string; uses?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Job = {
  name?: string;
  'runs-on'?: string;
  'timeout-minutes'?: number;
  needs?: string | string[];
  if?: string;
  outputs?: Record<string, string>;
  strategy?: { 'fail-fast'?: boolean; matrix?: Record<string, unknown> };
  container?: string | { image?: string };
  steps: Step[];
};

const workflow = parse(readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8')) as { jobs: Record<string, Job> };
const pkg = JSON.parse(readFileSync(join(repoRoot, 'apps/web/package.json'), 'utf8')) as { devDependencies: Record<string, string> };
const { check, e2e, tasks, matrix } = workflow.jobs;
const matrixOk = workflow.jobs['matrix-ok'];
const e2eOk = workflow.jobs['e2e-ok'];
const runs = (job: Job | undefined) => (job?.steps ?? []).map((s) => s.run ?? '');

describe('ci workflow', () => {
  // pnpm test alone took 10-17 of check's 20 minutes on green runs and was cancelled at the
  // limit with every test passing (run 40319335481).
  it('gives check and each e2e shard, which runs after it, a 35 minute timeout', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual(['check', 'e2e', 'e2e-ok', 'matrix', 'matrix-ok', 'tasks']);
    expect(check?.['runs-on']).toBe('ubuntu-latest');
    expect(check?.['timeout-minutes']).toBe(35);
    expect(e2e?.['timeout-minutes']).toBe(35);
    expect([e2e?.needs].flat()).toEqual(['check']);
  });

  it('runs e2e in the Playwright image that matches the pinned @playwright/test', () => {
    const version = pkg.devDependencies['@playwright/test'];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const image = typeof e2e?.container === 'string' ? e2e.container : e2e?.container?.image;
    expect(image).toBe(`mcr.microsoft.com/playwright:v${version}-noble`);
  });

  it('never installs browsers or system packages', () => {
    for (const run of Object.values(workflow.jobs).flatMap(runs)) {
      expect(run).not.toMatch(/playwright\s+install/);
      expect(run).not.toMatch(/\bapt(-get)?\b/);
    }
  });

  it('runs Playwright only in e2e and uploads each shard\'s report on failure', () => {
    expect(runs(check).filter((r) => /playwright/.test(r))).toEqual([]);
    const upload = e2e?.steps.find((s) => s.uses?.startsWith('actions/upload-artifact@'));
    expect(upload?.if).toBe('failure()');
    expect(upload?.with?.name).toBe('playwright-report-${{ matrix.shard }}');
    expect(upload?.with?.path).toBe('apps/web/playwright-report');
  });

  // Playwright shards by test count over files in order, so --shard=i/n alone puts all seven
  // 'grader validation in the tab' tests in shard 1; six of them run a task's matrix (2-6 min
  // each). They get three shards of their own and every other test runs in one: --grep and
  // --grep-invert of the same title split the suite with no test left out or run twice.
  // ci-guard wants literal Playwright arguments, so each shard has its own step, run only on its
  // matrix entry.
  it('splits e2e into three grader shards and one shard for the rest, each with exactly one step', () => {
    const grader = '--grep "grader validation in the tab"';
    const commands: Record<string, string> = {
      'grader-1': `pnpm --filter web exec playwright test --project=mocked ${grader} --shard=1/3`,
      'grader-2': `pnpm --filter web exec playwright test --project=mocked ${grader} --shard=2/3`,
      'grader-3': `pnpm --filter web exec playwright test --project=mocked ${grader} --shard=3/3`,
      rest: 'pnpm --filter web exec playwright test --project=mocked --project=xbrowser --grep-invert "grader validation in the tab"',
    };
    expect(e2e?.name).toBe('e2e (${{ matrix.shard }})');
    expect(e2e?.strategy?.['fail-fast']).toBe(false);
    expect(e2e?.strategy?.matrix).toEqual({ shard: Object.keys(commands) });
    const playwright = (e2e?.steps ?? []).filter((s) => s.run?.includes('playwright'));
    expect(Object.fromEntries(playwright.map((s) => [s.if, s.run]))).toEqual(
      Object.fromEntries(Object.entries(commands).map(([shard, run]) => [`matrix.shard == '${shard}'`, run])),
    );
    expect(playwright).toHaveLength(Object.keys(commands).length);
  });

  // Under --shard Playwright exits 0 when no test matches, so a renamed describe would leave the
  // grader shards green and empty and the rest shard running everything.
  it('greps a title that names the grader validation describe in browse.spec.ts', () => {
    const dir = join(repoRoot, 'apps/web/e2e');
    const specs = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.spec.ts'));
    const naming = specs.filter((f) => readFileSync(join(dir, f), 'utf8').includes('grader validation in the tab'));
    expect(naming).toEqual(['browse.spec.ts']);
    expect(readFileSync(join(dir, 'browse.spec.ts'), 'utf8')).toContain("test.describe('grader validation in the tab, no key', () => {");
  });

  // The grader validation matrix runs one job per task, in parallel with check, over the ids
  // `pnpm cli matrix --list-tasks` prints, so a new task needs no edit here.
  it('runs the grader matrix as one job per listed task, not in check', () => {
    expect(runs(check).filter((r) => /\bmatrix\b/.test(r))).toEqual([]);
    const list = tasks?.steps.find((s) => s.id === 'list');
    // Assigned first: under the runner's bash -e a failing listing then fails the step, where
    // echo "ids=$(...)" would hide its exit code.
    expect(list?.run).toBe('ids=$(pnpm --silent cli matrix --list-tasks)\necho "ids=$ids" >> "$GITHUB_OUTPUT"\n');
    expect(tasks?.outputs?.ids).toBe('${{ steps.list.outputs.ids }}');
    expect([matrix?.needs].flat()).toEqual(['tasks']);
    expect(matrix?.strategy?.['fail-fast']).toBe(false);
    expect(matrix?.strategy?.matrix).toEqual({ task: '${{ fromJSON(needs.tasks.outputs.ids) }}' });
    const step = matrix?.steps.find((s) => s.run?.includes('cli matrix'));
    expect(step?.env).toEqual({ TASK: '${{ matrix.task }}' });
    expect(step?.run).toBe('pnpm cli matrix --task "$TASK"');
  });

  it('sizes the matrix timeouts and gives branch protection one stable check', () => {
    expect(tasks?.['timeout-minutes']).toBe(5);
    expect(matrix?.['timeout-minutes']).toBe(20);
    expect([matrixOk?.needs].flat()).toEqual(['matrix']);
    expect(matrixOk?.if).toBe('always()');
    expect(matrixOk?.steps.at(-1)?.env).toEqual({ RESULT: '${{ needs.matrix.result }}' });
    expect(matrixOk?.steps.at(-1)?.run).toBe('test "$RESULT" = success');
  });

  // e2e-ok is to the e2e shards what matrix-ok is to the matrix.
  it('gives the e2e shards one stable check', () => {
    expect(e2eOk?.['timeout-minutes']).toBe(5);
    expect([e2eOk?.needs].flat()).toEqual(['e2e']);
    expect(e2eOk?.if).toBe('always()');
    expect(e2eOk?.steps.at(-1)?.env).toEqual({ RESULT: '${{ needs.e2e.result }}' });
    expect(e2eOk?.steps.at(-1)?.run).toBe('test "$RESULT" = success');
  });
});
