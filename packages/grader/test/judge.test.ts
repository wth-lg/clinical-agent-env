// The judge request (design section 5, "Judge and hybrid items"): one isolated call per
// criterion on claude-opus-5-5 at the task's judge effort (default medium) with max_tokens
// 16,000, through the same client and ledger as the trial, with no sampling parameter; the cache
// key is sha256 over model, effort, prompt version, prompt and the graded text; a request whose
// worst case is over $1 is not sent.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../core/anthropic.ts';
import { DEFAULT_JUDGE_EFFORT, JUDGE_MAX_CALL_USD, JUDGE_MAX_CALLS, JUDGE_MAX_TOKENS, JUDGE_PROMPT_VERSION, Judge, JudgeCacheMiss, JudgeClientError, OVER_BUDGET, judgeAllowanceUsd, judgeCallBudget } from '../judge.ts';
import { judged, hybrid } from '../check.ts';
import { scriptedJudge } from './helpers.ts';

describe('judge', () => {
  it('sends one user turn at effort medium by default and max_tokens 16,000, without the gate result or any banned parameter', async () => {
    const j = scriptedJudge(['{"verdict":"met","quote":"5 mg BID"}']);
    const judge = new Judge({ client: j.client });
    const v = await judge.judge({ criterion: 'States the new apixaban dose.', text: 'Apixaban increased to 5 mg BID.' });
    expect(v).toMatchObject({ met: true, evidence: { verdict: 'met', quote: '5 mg BID' } });
    expect(j.requests).toHaveLength(1);
    const { history, params } = j.requests[0]!;
    expect(history).toHaveLength(1);
    expect(history[0]!.role).toBe('user');
    expect(JSON.stringify(history[0]!.content)).toContain('States the new apixaban dose.');
    expect(params.output_config).toEqual({ effort: DEFAULT_JUDGE_EFFORT });
    expect(DEFAULT_JUDGE_EFFORT).toBe('medium');
    expect(params.max_tokens).toBe(JUDGE_MAX_TOKENS);
    expect(JUDGE_MAX_TOKENS).toBe(16_000);
    for (const k of ['temperature', 'top_p', 'top_k', 'model', 'tool_choice', 'tools']) expect(params).not.toHaveProperty(k);
  });

  it('keys the cache by sha256 of (model, effort, prompt version, prompt, text)', async () => {
    const j = scriptedJudge(['{"verdict":"not_met","quote":""}']);
    const judge = new Judge({ client: j.client });
    await judge.judge({ criterion: 'c', text: 't' });
    const [entry] = judge.entries();
    const prompt = JSON.stringify(j.requests[0]!.history[0]!.content);
    const expected = createHash('sha256').update(JSON.stringify([MODEL, 'medium', JUDGE_PROMPT_VERSION, JSON.parse(prompt), 't'])).digest('hex');
    expect(entry).toMatchObject({ key: expected, kind: 'judge', model: MODEL, effort: 'medium', prompt_version: JUDGE_PROMPT_VERSION });
    // A second ask of the same question is answered from the cache.
    await judge.judge({ criterion: 'c', text: 't' });
    expect(j.requests).toHaveLength(1);
  });

  it("asks at the task's effort, which is in the key, so another effort never reuses an answer", async () => {
    const j = scriptedJudge(['{"verdict":"met","quote":"t"}', '{"verdict":"met","quote":"t"}']);
    const high = new Judge({ client: j.client, effort: 'high' });
    await high.judge({ criterion: 'c', text: 't' });
    expect(j.requests[0]!.params.output_config).toEqual({ effort: 'high' });
    const [entry] = high.entries();
    expect(entry!.effort).toBe('high');
    const medium = new Judge({ client: j.client, cache: high.entries() });
    await medium.judge({ criterion: 'c', text: 't' });
    expect(j.requests).toHaveLength(2);
    expect(medium.entries()[0]!.key).not.toBe(entry!.key);
  });

  it('refuses before sending a request whose worst case is over $1, and grades it unknown, marked over budget', async () => {
    const j = scriptedJudge(['{"verdict":"met","quote":"x"}']);
    const judge = new Judge({ client: j.client });
    const v = await judge.judge({ criterion: 'c', text: 'x'.repeat(90_000) });
    expect(j.requests).toHaveLength(0);
    expect(v.met).toBe('unknown');
    expect(String(v.evidence.reason)).toMatch(new RegExp(`^${OVER_BUDGET}: worst case \\$1\\.\\d+ > \\$1\\.00 per call$`));
    expect(judge.entries()[0]).toMatchObject({ answer: null, calls: 0 });
    expect(JUDGE_MAX_CALL_USD).toBe(1);
  });

  it('a met verdict needs a quote; a not_met verdict may have none, since absence cannot be quoted', async () => {
    const empty = new Judge({ client: scriptedJudge(['{"verdict":"met","quote":""}']).client });
    expect(await empty.judge({ criterion: 'c', text: 'text' })).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    const absent = new Judge({ client: scriptedJudge(['{"verdict":"not_met","quote":""}']).client });
    expect(await absent.judge({ criterion: 'c', text: 'text' })).toMatchObject({ met: false });
    // A not_met verdict that does quote is held to the substring check.
    const misquoted = new Judge({ client: scriptedJudge(['{"verdict":"not_met","quote":"words not there"}']).client });
    expect(await misquoted.judge({ criterion: 'c', text: 'text' })).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
  });

  it('a client error is thrown, not answered: it is never cached', async () => {
    const failing = new Judge({ client: { send: () => Promise.reject(new Error('529 overloaded')) } });
    await expect(failing.judge({ criterion: 'c', text: 'text' })).rejects.toThrow(JudgeClientError);
    await expect(failing.extract({ field: 'f', text: 'no digits here', pattern: /(\d+)/ })).rejects.toThrow(JudgeClientError);
    expect(failing.entries()).toEqual([]);
  });

  it('an extracted value followed by punctuation still matches its quote', async () => {
    const j = new Judge({ client: scriptedJudge(['{"value":42,"quote":"CrCl is 42, which"}']).client });
    expect(await j.extract({ field: 'CrCl', text: 'By Cockcroft-Gault the CrCl is 42, which is under 50.', pattern: /CrCl of (\d+)/ })).toMatchObject({ value: 42, source: 'llm' });
    const k = new Judge({ client: scriptedJudge(['{"value":25,"quote":"weight 25."}']).client });
    expect(await k.extract({ field: 'weight', text: 'Dose by weight 25. Next line.', pattern: /kg (\d+)/ })).toMatchObject({ value: 25 });
  });

  it('the call budget is two calls per judge and hybrid item', () => {
    const t = () => 'x';
    expect(judgeCallBudget([judged({ id: 'J', points: 1, category: 'documentation', traces_to: 'p', decisive_ids: [], criterion: 'c', text: t })])).toBe(2);
    expect(judgeCallBudget([])).toBe(0);
  });

  it('the call budget skips a 0-point item (decisions.tsv 2026-10-28T10:30)', () => {
    const t = () => 'x';
    const item = (id: string, points: number) => judged({ id, points, category: 'documentation', traces_to: 'p', decisive_ids: [], criterion: 'c', text: t });
    expect(judgeCallBudget([item('J', 3), item('Z', 0)])).toBe(2);
    expect(judgeAllowanceUsd([item('J', 3), item('Z', 0)])).toBe(2 * JUDGE_MAX_CALL_USD);
  });

  // builder-267 (builder-265 issue 4): an item that asks one question per recipient or per worklist
  // item declares how many; the budget counts them, and a code item that asks the judge counts what
  // it declares. JUDGE_MAX_CALLS caps the total.
  it('the call budget counts the questions an item declares, under JUDGE_MAX_CALLS', () => {
    const t = () => 'x';
    const item = (id: string, judge_questions?: number) => ({ ...judged({ id, points: -8, category: 'safety', traces_to: 'p', decisive_ids: [], criterion: 'c', text: t }), ...(judge_questions === undefined ? {} : { judge_questions }) });
    expect(judgeCallBudget([item('per_patient', 6)])).toBe(12);
    expect(judgeCallBudget([item('per_patient', 8), item('per_item', 8), item('one')])).toBe(34);
    expect(judgeAllowanceUsd([item('per_patient', 6)])).toBe(12 * JUDGE_MAX_CALL_USD);
    const code = { ...item('code_asks', 3), method: 'code' as const };
    expect(judgeCallBudget([code])).toBe(6);
    expect(judgeCallBudget([{ ...code, judge_questions: undefined }])).toBe(0);
    expect(judgeCallBudget([item('runaway', 1000)])).toBe(JUDGE_MAX_CALLS);
    expect(judgeAllowanceUsd([item('runaway', 1000)])).toBe(JUDGE_MAX_CALLS * JUDGE_MAX_CALL_USD);
  });

  it('a Judge under that budget answers six per-patient questions; under one item\'s budget it stops after two', async () => {
    const answers = Array.from({ length: 6 }, () => '{"verdict":"not_met","quote":""}');
    const ask = async (maxCalls: number) => {
      const j = new Judge({ client: scriptedJudge([...answers]).client, maxCalls });
      const vs = [];
      for (let i = 0; i < 6; i++) vs.push(await j.judge({ criterion: `patient ${i}`, text: 'Your refill is ready.', penalty: true }));
      return { met: vs.map((v) => v.met), over: j.overAllowance };
    };
    expect(await ask(12)).toEqual({ met: Array(6).fill(false), over: 0 });
    expect(await ask(2)).toEqual({ met: [false, false, 'unknown', 'unknown', 'unknown', 'unknown'], over: 4 });
  });

  // builder-267: a record graded under a smaller allowance holds 'judge allowance reached' entries
  // for the questions it never sent. A regrade under a larger allowance misses them (cli regrade
  // names each key), a live grading asks them, and a regrade under the same allowance reads them
  // as recorded.
  it('a cached allowance-reached question is asked again only when this grading has room for it', async () => {
    const text = 'Your refill is ready.';
    const first = scriptedJudge(['{"verdict":"not_met","quote":""}']);
    const old = new Judge({ client: first.client, maxCalls: 2 });
    for (let i = 0; i < 3; i++) await old.judge({ criterion: `patient ${i}`, text, penalty: true });
    expect(old.overAllowance).toBe(1);
    const cache = old.entries();
    expect(cache.map((e) => [e.calls, e.error])).toEqual([[1, null], [1, null], [0, 'judge allowance reached']]);
    const regrade = async (maxCalls: number) => {
      const j = new Judge({ cache, maxCalls });
      const vs = [];
      for (let i = 0; i < 3; i++) vs.push(await j.judge({ criterion: `patient ${i}`, text, penalty: true }));
      return vs.map((v) => v.met);
    };
    expect(await regrade(2)).toEqual([false, false, 'unknown']);
    await expect(regrade(6)).rejects.toThrow(JudgeCacheMiss);
    const live = scriptedJudge(['{"verdict":"met","quote":"Your refill is ready."}']);
    const j = new Judge({ client: live.client, cache, maxCalls: 6 });
    const vs = [];
    for (let i = 0; i < 3; i++) vs.push(await j.judge({ criterion: `patient ${i}`, text, penalty: true }));
    expect(vs.map((v) => v.met)).toEqual([false, false, true]);
    expect(live.requests).toHaveLength(1);
    expect(j.overAllowance).toBe(0);
  });

  it('the projection allowance counts each judge and hybrid item, twice for the schema retry', () => {
    const t = () => 'x';
    const checks = [
      judged({ id: 'J', points: 1, category: 'documentation', traces_to: 'p', decisive_ids: [], criterion: 'c', text: t }),
      hybrid({ id: 'H', points: 1, category: 'documentation', traces_to: 'p', decisive_ids: [], field: 'f', text: t, pattern: /(\d+)/, truth: 1, tolerance: { abs: 0 } }),
    ];
    expect(judgeAllowanceUsd([])).toBe(0);
    expect(judgeAllowanceUsd(checks)).toBeGreaterThan(0);
    expect(judgeAllowanceUsd(checks)).toBe(2 * judgeAllowanceUsd(checks.slice(0, 1)));
  });
});
