// pnpm cli judge-calibrate (plan phase P11c): asks every key of a task's tests/judge-cache.json
// live, once, through a client only batchStart can create (one batch per task), compares each
// answer with the scripted one and writes results/judge-calibration/<id>.json; it never writes
// the cache. --dry-run prints the projection and makes no call. Every live path here is mocked:
// the transport answers from the toy's own cache (a key at a time, found by hashing the prompt
// the way the Judge does), the ledger is a temp file and HOME a temp dir.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { okResponse } from '../../apps/web/src/harness/scenarios.ts';
import { MODEL, type Transport } from '../../packages/core/anthropic.ts';
import { PROJECTED_CAP_USD } from '../../packages/core/ledger.ts';
import { JUDGE_PROMPT_VERSION, type JudgeCacheEntry } from '../../packages/grader/judge.ts';
import type { MatrixTask } from '../../packages/grader/matrix/types.ts';
import { fakeKey, tempDir, write } from '../../scripts/test/helpers.ts';
import { main, type Calibration, type Deps } from '../judge-calibrate.ts';
import { TASKS_DIR } from '../adapters/tasks-node.ts';
import { loadMatrixTask } from '../matrix.ts';

const TOY = await loadMatrixTask('_toy');
const CACHE_FILE = join(TASKS_DIR, '_toy', 'tests', 'judge-cache.json');
const SLOW = 120_000;

const seed = (cost: number) =>
  ['reserve', 'settle'].map((kind) => JSON.stringify({ ts: 't', call_id: 'seed', kind, source: 'node', run_id: null, batch_id: null, trial: null, usage: null, cost_usd: cost })).join('\n') + '\n';

// A judge that answers each prompt with the cached answer of its key, or `flip(key, answer)`.
function cacheJudge(task: MatrixTask, flip: (key: string, answer: JudgeCacheEntry['answer']) => JudgeCacheEntry['answer'] = (_k, a) => a) {
  const byKey = new Map(task.cache.map((e) => [e.key, e]));
  const t = Object.assign(
    async (request: Request) => {
      t.calls++;
      const body = JSON.parse(await request.text()) as { messages: Array<{ content: string }> };
      const prompt = body.messages[0]!.content;
      const text = /<text>\n([\s\S]*)\n<\/text>/.exec(prompt)![1]!;
      const key = createHash('sha256').update(JSON.stringify([MODEL, task.judgeEffort, JUDGE_PROMPT_VERSION, prompt, text])).digest('hex');
      t.asked.set(key, (t.asked.get(key) ?? 0) + 1);
      const answer = flip(key, byKey.get(key)?.answer ?? { verdict: 'unknown', quote: '' });
      return okResponse({ text: JSON.stringify(answer) }, t.calls);
    },
    { calls: 0, asked: new Map<string, number>() },
  );
  return t;
}

function harness(opts: { task?: MatrixTask; fetch?: Transport; ledger?: number; key?: boolean } = {}) {
  const dir = tempDir('calibrate-ledger');
  const ledger = join(dir, 'spend.jsonl');
  write(dir, 'spend.jsonl', seed(opts.ledger ?? 1));
  const home = tempDir('calibrate-home');
  const lines: string[] = [];
  const written: Calibration[] = [];
  const fetch = opts.fetch ?? vi.fn<Transport>();
  const deps: Deps = {
    env: { HOME: home, SPEND_LEDGER: ledger, ...(opts.key === false ? {} : { ANTHROPIC_API_KEY: fakeKey('C') }) },
    out: (l) => lines.push(l),
    fetch,
    load: async () => opts.task ?? TOY,
    writeResult: (_t, c) => written.push(c),
  };
  const rows = () => readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { kind: string; call_id: string; batch_id: string | null });
  return { deps, lines, written, home, fetch, rows, text: () => lines.join('\n') };
}

const projectionOf = (text: string) => Number(/^LIVE_PROJECTION_USD=(\d+\.\d{6})$/m.exec(text)![1]);

describe('judge-calibrate', () => {
  it('--dry-run prints the projection for every cache key and makes 0 calls', { timeout: SLOW }, async () => {
    const h = harness();
    expect(await main(['--task', '_toy', '--dry-run'], h.deps)).toBe(0);
    expect(h.text()).toMatch(new RegExp(`^judge-calibrate dry run: _toy: ${TOY.cache.length} cache keys, ${TOY.cache.length} asked by the matrix cases x 2 calls, worst case \\$`, 'm'));
    expect(projectionOf(h.text())).toBeGreaterThan(0);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.rows()).toHaveLength(2);
    expect(h.written).toHaveLength(0);
  });

  it('asks every cache key once, agrees with the scripted cache, and leaves the cache file byte-equal', { timeout: SLOW }, async () => {
    const before = readFileSync(CACHE_FILE);
    const judge = cacheJudge(TOY);
    const h = harness({ fetch: judge });
    expect(await main(['--task', '_toy'], h.deps), h.text()).toBe(0);
    expect(judge.asked.size).toBe(TOY.cache.length);
    expect([...judge.asked.keys()].sort()).toEqual(TOY.cache.map((e) => e.key).sort());
    expect([...judge.asked.values()].every((n) => n === 1)).toBe(true);
    expect(h.written).toHaveLength(1);
    const c = h.written[0]!;
    expect(c).toMatchObject({
      task: '_toy', model: MODEL, effort: TOY.judgeEffort, prompt_version: JUDGE_PROMPT_VERSION,
      questions: TOY.cache.length, same_keys: TOY.cache.length, agree: TOY.cache.length,
      calls: TOY.cache.length, ledger_settles: TOY.cache.length,
      oracle: { outcome: 'PASS', score: 1, judge_unknown: 0 }, disagreements: [],
    });
    expect(c.cost_usd).toBeGreaterThan(0);
    expect(c.live_entries).toHaveLength(TOY.cache.length);
    for (const e of c.live_entries) expect(e.provenance).toMatchObject({ source: 'live', model: MODEL });
    expect(JSON.stringify(c)).not.toContain('pending');
    // One batch for the task: an open row, a close row, and a settle per call.
    const rows = h.rows();
    const open = rows.filter((r) => r.kind === 'open');
    expect(open).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'close' && r.batch_id === open[0]!.batch_id)).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'settle' && r.call_id !== 'seed')).toHaveLength(TOY.cache.length);
    expect(readFileSync(CACHE_FILE).equals(before)).toBe(true);
  });

  it('lists a disagreement with both answers, and a cache key no case asks, and exits 1', { timeout: SLOW }, async () => {
    const before = readFileSync(CACHE_FILE);
    const target = TOY.cache.find((e) => e.kind === 'judge' && e.answer?.verdict === 'met')!;
    const flipped = { verdict: 'not_met', quote: '' };
    const stale: JudgeCacheEntry = { ...target, key: 'f'.repeat(64) };
    const task = { ...TOY, cache: [...TOY.cache, stale] };
    const judge = cacheJudge(task, (key, a) => (key === target.key ? flipped : a));
    const h = harness({ task, fetch: judge });
    expect(await main(['--task', '_toy'], h.deps)).toBe(1);
    expect(judge.calls).toBe(TOY.cache.length);
    expect(judge.asked.has(stale.key)).toBe(false);
    const c = h.written[0]!;
    expect(c).toMatchObject({ questions: TOY.cache.length + 1, same_keys: TOY.cache.length, agree: TOY.cache.length - 1 });
    expect(c.disagreements).toEqual([
      { key: target.key, kind: 'judge', scripted: target.answer, live: flipped, live_error: null, reason: 'answers differ' },
      { key: stale.key, kind: 'judge', scripted: stale.answer, live: null, live_error: null, reason: 'no matrix case asks this key' },
    ].sort((a, b) => (a.key < b.key ? -1 : 1)));
    expect(h.text()).toMatch(/^judge-calibrate _toy: 15 of 17 agree, 16 calls/m);
    expect(readFileSync(CACHE_FILE).equals(before)).toBe(true);
  });

  it('with ledger + projection one cent over PROJECTED_CAP_USD it makes 0 calls and writes nothing', { timeout: SLOW }, async () => {
    const dry = harness();
    expect(await main(['--task', '_toy', '--dry-run'], dry.deps)).toBe(0);
    const projection = projectionOf(dry.text());
    const h = harness({ ledger: Number((PROJECTED_CAP_USD + 0.01 - projection).toFixed(6)) });
    expect(await main(['--task', '_toy'], h.deps)).toBe(1);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.text()).toContain(`= $${(PROJECTED_CAP_USD + 0.01).toFixed(2)} > $${PROJECTED_CAP_USD}`);
    expect(h.written).toHaveLength(0);
    expect(h.rows()).toHaveLength(2);
  });

  it('refuses usage errors with 2, and a live run without a key with 1 before opening a ledger', async () => {
    const h = harness({ key: false });
    expect(await main([], h.deps)).toBe(2);
    expect(await main(['--task'], h.deps)).toBe(2);
    expect(await main(['--task', '../x'], h.deps)).toBe(2);
    expect(await main(['--task', '_toy', '--live-judge'], h.deps)).toBe(2);
    expect(await main(['--task', '_toy'], h.deps)).toBe(1);
    expect(h.text()).toContain('ANTHROPIC_API_KEY is not set');
    expect(h.rows()).toHaveLength(2);
    expect(existsSync(join(h.home, '.clinenv'))).toBe(false);
  });
});
