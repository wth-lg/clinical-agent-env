// pnpm cli oracle (plan phase P9): offline it grades each task's oracle from the canned judge
// cache; --live-judge asks the judge live through a client only batchStart can create, one Judge
// and one cache across the task's cases, and writes the cache only when the oracle passes;
// --dry-run prints a projection sized from the real judge requests and opens nothing. Every live
// path here is mocked: the transport is a spy, and HOME a temp dir. The dry run grades a reduced
// toy (the oracle, one alternative that shares its summary, and the null agent) so the file
// stays fast; the CI matrix step covers the whole toy. The live judge's own tests, the refusal
// one cent over the projected cap included, are in
// packages/grader/matrix/test/oracle-live-*.test.ts, one per file for the same reason.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Transport } from '../../packages/core/anthropic.ts';
import { JUDGE_MAX_CALL_USD, type JudgeCacheEntry } from '../../packages/grader/judge.ts';
import type { MatrixTask } from '../../packages/grader/matrix/types.ts';
import { okResponse } from '../../apps/web/src/harness/scenarios.ts';
import { fakeKey, tempDir } from '../../scripts/test/helpers.ts';
import { loadMatrixTask } from '../matrix.ts';
import { main, type Deps } from '../oracle.ts';

const TOY = await loadMatrixTask('_toy');
// The oracle, an alternative that shares its summary, and the null agent.
const SMALL: MatrixTask = { ...TOY, alternatives: TOY.alternatives.filter((a) => a.id === 'one_answer'), mutants: [], agents: {} };

function harness(env: Record<string, string | undefined> = {}, fetch: Transport = vi.fn<Transport>(), task: MatrixTask = SMALL) {
  const home = tempDir('oracle-home');
  const lines: string[] = [];
  const written: Array<{ task: string; entries: JudgeCacheEntry[] }> = [];
  const deps: Deps = {
    env: { HOME: home, ...env },
    out: (l) => lines.push(l),
    fetch,
    load: async () => task,
    writeCache: (t, entries) => written.push({ task: t, entries }),
  };
  return { deps, lines, written, home, text: () => lines.join('\n') };
}

describe('oracle', () => {
  it('--task _toy --json grades the oracle from the canned cache: PASS, score 1, no unknown', async () => {
    const h = harness({}, undefined, TOY);
    expect(await main(['--task', '_toy', '--json'], h.deps)).toBe(0);
    expect(JSON.parse(h.text())).toEqual({ tasks: [{ id: '_toy', outcome: 'PASS', score: 1, judge_unknown: 0, misses: [] }] });
  });

  // Item 6's other half, `all` grading no task, is unreachable once tasks/ holds a real task.
  it('--task all grades every real task from its canned cache (item 6)', async () => {
    const lines: string[] = [];
    expect(await main(['--task', 'all'], { env: {}, out: (l) => lines.push(l), fetch: vi.fn<Transport>() })).toBe(0);
    expect(lines.join('\n')).toContain('oracle renal-dose-review: PASS score 1.000 judge.unknown 0');
  });

  it("the toy's canned cache says it is scripted and took no calls (item 4)", () => {
    expect(TOY.cache.length).toBeGreaterThan(0);
    for (const e of TOY.cache) {
      expect(e.calls).toBe(0);
      expect(e.provenance?.source).toBe('scripted');
    }
  });

  it('--live-judge --dry-run projects each distinct judge question at its real size, and opens no ledger (item 5)', async () => {
    const h = harness();
    expect(await main(['--task', '_toy', '--live-judge', '--dry-run'], h.deps)).toBe(0);
    // oracle and one_answer share a summary: 2 distinct summaries x 2 judge items.
    expect(h.text()).toMatch(/^oracle dry run: --live-judge on _toy: 3 cases, 4 distinct judge questions x 2 calls/m);
    const p = Number(/^LIVE_PROJECTION_USD=(\d+\.\d{6})$/m.exec(h.text())![1]);
    expect(p).toBeGreaterThan(0);
    // Each call at its real size is well under the $1 ceiling the dry run of run-one prices it at.
    expect(p).toBeLessThan(4 * 2 * JUDGE_MAX_CALL_USD);
    expect(existsSync(join(h.home, '.clinenv'))).toBe(false);
    expect(h.written).toHaveLength(0);
  });

  it('--live-judge without a key exits 1 before opening a ledger', async () => {
    const h = harness();
    expect(await main(['--task', '_toy', '--live-judge'], h.deps)).toBe(1);
    expect(h.text()).toContain('ANTHROPIC_API_KEY is not set');
    expect(existsSync(join(h.home, '.clinenv'))).toBe(false);
  });


  // --misses-only: refill only the keys the cache lacks (P17j: a PR that adds judge items asks
  // only its new questions live); every cached answer is reused and keeps its provenance.
  const DROP = '163307576d7a901b836b0c3d2ee1af5b6318de0361f4009ff8125594d859c93c';
  const missingOne: MatrixTask = { ...SMALL, cache: SMALL.cache.filter((e) => e.key !== DROP) };

  it('--live-judge --misses-only --dry-run counts only the questions the cache lacks', async () => {
    const full = harness({}, undefined, SMALL);
    expect(await main(['--task', '_toy', '--live-judge', '--misses-only', '--dry-run'], full.deps)).toBe(0);
    expect(full.text()).toMatch(/^oracle dry run: --live-judge on _toy: \d+ cases, 0 distinct judge questions x 2 calls, worst case \$0\.0+$/m);
    const one = harness({}, undefined, missingOne);
    expect(await main(['--task', '_toy', '--live-judge', '--misses-only', '--dry-run'], one.deps)).toBe(0);
    expect(one.text()).toMatch(/^oracle dry run: --live-judge on _toy: \d+ cases, 1 distinct judge questions x 2 calls/m);
  });

  it('--live-judge --misses-only asks only the missing question and keeps every cached entry as it was', async () => {
    const fetch = vi.fn<Transport>(async () => okResponse({ text: '{"verdict":"met","quote":"wrote a progress note"}' }, 1));
    const h = harness({ ANTHROPIC_API_KEY: fakeKey('M') }, fetch, missingOne);
    expect(await main(['--task', '_toy', '--live-judge', '--misses-only'], h.deps), h.text()).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [w] = h.written;
    const got = new Map(w!.entries.map((e) => [e.key, e]));
    expect(got.get(DROP)?.provenance?.source).toBe('live');
    for (const e of missingOne.cache) if (got.has(e.key)) expect(got.get(e.key)!.provenance).toEqual(e.provenance);
    expect(h.text()).toMatch(/judge cache _toy: \d+ answers written, 1 calls/);
  });

  it('--misses-only needs --live-judge', async () => {
    const h = harness();
    expect(await main(['--task', '_toy', '--misses-only'], h.deps)).toBe(2);
  });
});
