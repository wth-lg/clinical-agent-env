// The judge request (design section 5, "Judge and hybrid items"): one isolated call per
// criterion on claude-opus-5-5 at the task's judge effort (default medium) with max_tokens
// 16,000, through the same client and ledger as the trial, with no sampling parameter; the cache
// key is sha256 over model, effort, prompt version, prompt and the graded text; a request whose
// worst case is over $1 is not sent.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../core/anthropic.ts';
import { worstCaseUsd } from '../../core/cost.ts';
import { reserveRequest } from '../../core/anthropic.ts';
import { ALLOWANCE_REACHED, DEFAULT_JUDGE_EFFORT, JUDGE_CALL_PRICE_USD, JUDGE_MAX_CALL_USD, JUDGE_MAX_CALLS, JUDGE_MAX_TOKENS, JUDGE_PRICED_BODY_BYTES, JUDGE_PROMPT_VERSION, Judge, JudgeCacheMiss, JudgeClientError, OVER_BUDGET, judgeAllowanceUsd, judgeCallBudget } from '../judge.ts';
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
    expect(judgeAllowanceUsd([item('J', 3), item('Z', 0)])).toBe(2 * JUDGE_CALL_PRICE_USD);
  });

  // builder-267 (builder-265 issue 4): an item that asks one question per recipient or per worklist
  // item declares how many; the budget counts them, and a code item that asks the judge counts what
  // it declares. JUDGE_MAX_CALLS caps the total.
  it('the call budget counts the questions an item declares, under JUDGE_MAX_CALLS', () => {
    const t = () => 'x';
    const item = (id: string, judge_questions?: number) => ({ ...judged({ id, points: -8, category: 'safety', traces_to: 'p', decisive_ids: [], criterion: 'c', text: t }), ...(judge_questions === undefined ? {} : { judge_questions }) });
    expect(judgeCallBudget([item('per_patient', 6)])).toBe(12);
    expect(judgeCallBudget([item('per_patient', 8), item('per_item', 8), item('one')])).toBe(34);
    expect(judgeAllowanceUsd([item('per_patient', 6)])).toBe(12 * JUDGE_CALL_PRICE_USD);
    expect(judgeCallBudget([{ ...item('code_asks', 3), method: 'code' as const }])).toBe(6);
    expect(judgeCallBudget([{ ...item('code_silent'), method: 'code' as const }])).toBe(0);
    expect(judgeCallBudget([item('runaway', 1000)])).toBe(JUDGE_MAX_CALLS);
    expect(judgeAllowanceUsd([item('runaway', 1000)])).toBe(JUDGE_MAX_CALLS * JUDGE_CALL_PRICE_USD);
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

  // verifier-phase-P17i-GRADER16-193-1 F3: the calls this grading has spent are its live calls,
  // each already in the entry it answered, plus those its cached answers took; counting the live
  // ones twice left a cached allowance-reached question unasked with half the allowance unused.
  it('counts each live call once: a cached allowance-reached question is asked with 2 of 4 calls spent', async () => {
    const text = 'Your refill is ready.';
    const seed = new Judge({ client: scriptedJudge(['{"verdict":"not_met","quote":""}']).client, maxCalls: 0 });
    await seed.judge({ criterion: 'patient 2', text, penalty: true });
    expect(seed.entries().map((e) => [e.calls, e.error])).toEqual([[0, ALLOWANCE_REACHED]]);
    const live = scriptedJudge(['{"verdict":"not_met","quote":""}']);
    const j = new Judge({ client: live.client, cache: seed.entries(), maxCalls: 4 });
    const vs = [];
    for (let i = 0; i < 3; i++) vs.push(await j.judge({ criterion: `patient ${i}`, text, penalty: true }));
    expect(vs.map((v) => v.met)).toEqual([false, false, false]);
    expect(live.requests).toHaveLength(3);
    expect(j.calls).toBe(3);
    expect(j.overAllowance).toBe(0);
  });

  // verifier-phase-P17i-GRADER16-193-1 F4: a declared judge_questions is a whole number >= 0. NaN
  // read as a budget of NaN (no judge call at all), a negative one took from the other items, and a
  // fraction was accepted.
  it('rejects a judge_questions that is not a whole number >= 0, naming the item', () => {
    const t = () => 'x';
    const item = (judge_questions: number, points = -8) => ({ ...judged({ id: 'bad_item', points, category: 'safety', traces_to: 'p', decisive_ids: [], criterion: 'c', text: t }), judge_questions });
    for (const bad of [Number.NaN, -5, 2.5, Infinity, -0.5]) {
      expect(() => judgeCallBudget([item(bad)]), String(bad)).toThrow(/bad_item: judge_questions must be a whole number >= 0, got /);
      expect(() => judgeAllowanceUsd([item(bad)]), String(bad)).toThrow(TypeError);
      expect(() => judgeCallBudget([item(bad, 0)]), `${bad} on a 0-point item`).toThrow(TypeError);
    }
    expect(judgeCallBudget([item(0)])).toBe(0);
    expect(judgeCallBudget([item(6), item(0)])).toBe(12);
  });

  // GRADER16-193 F2 (coordinator ruling): a call is priced at its real worst case, max_tokens of
  // output plus a request body of JUDGE_PRICED_BODY_BYTES, not at the $1 per-call ceiling.
  it('prices each allowed call at its worst case for a priced request body, under the per-call ceiling', () => {
    expect(JUDGE_CALL_PRICE_USD).toBe(worstCaseUsd({ bodyBytes: JUDGE_PRICED_BODY_BYTES, maxTokens: JUDGE_MAX_TOKENS }));
    expect(JUDGE_CALL_PRICE_USD).toBeCloseTo(0.40192, 9);
    expect(JUDGE_CALL_PRICE_USD).toBeLessThan(JUDGE_MAX_CALL_USD);
    // The largest judge request measured on real trials (probe-1, 4,729 bytes) and in every matrix
    // case (3,502 bytes) is under the priced body.
    expect(JUDGE_PRICED_BODY_BYTES).toBeGreaterThan(4_729);
  });

  // The cost guard: the worst cases of the calls a grading sends never sum past its allowance in
  // dollars, so the ledger, which settles each call at most at its worst case, never charges a
  // trial's judge more than the projection priced. A question that would cross it is not sent: it
  // reads unknown, marked 'judge allowance reached', as at the call bound.
  it('never sends calls whose worst cases sum past maxUsd; long texts spend the allowance sooner', async () => {
    const answers = Array.from({ length: 8 }, () => '{"verdict":"not_met","quote":""}');
    const worstOf = (r: { history: Parameters<typeof reserveRequest>[0]; params: Parameters<typeof reserveRequest>[1] }) => worstCaseUsd(reserveRequest(r.history, r.params));
    const ask = async (text: string, maxUsd: number) => {
      const s = scriptedJudge([...answers]);
      const j = new Judge({ client: s.client, maxCalls: 8, maxUsd });
      const vs = [];
      for (let i = 0; i < 4; i++) vs.push(await j.judge({ criterion: `patient ${i}`, text, penalty: true }));
      return { met: vs.map((v) => v.met), sent: s.requests.length, worst: s.requests.reduce((n, r) => n + worstOf(r), 0), over: j.overAllowance };
    };
    const allowance = 8 * JUDGE_CALL_PRICE_USD;
    const short = await ask('Your refill is ready.', allowance);
    expect(short).toMatchObject({ met: [false, false, false, false], sent: 4, over: 0 });
    // Each request ~20 KB: worst case ~$0.52, so the $3.22 allowance covers six calls, not eight;
    // here four questions each send once.
    const long = await ask('Your refill is ready. '.repeat(900), allowance);
    expect(long).toMatchObject({ met: [false, false, false, false], sent: 4, over: 0 });
    expect(long.worst).toBeLessThanOrEqual(allowance);
    // Under an allowance of two such calls, the third and fourth questions are not sent.
    const tight = await ask('Your refill is ready. '.repeat(900), 2 * 0.53);
    expect(tight).toMatchObject({ met: [false, false, 'unknown', 'unknown'], sent: 2, over: 2 });
    expect(tight.worst).toBeLessThanOrEqual(2 * 0.53);
  });

  // verifier-phase-P17i-GRADER16-193-1 G1: a question the dollar bound blocked is cached 'judge
  // allowance reached' with calls to spare. A regrade from the record's cache under the same
  // allowance counts the worst case of each entry it uses, cached ones included, so it finds the
  // same dollars spent and reads the question as recorded; it threw JudgeCacheMiss.
  it('a question the dollar bound blocked regrades byte-identically from its cache under the same allowance', async () => {
    const pad = (n: number) => 'The patient was told the result. '.repeat(Math.ceil(n / 33)).slice(0, n);
    const texts = [pad(58_000), pad(58_000)];
    const opts = { maxCalls: 4, maxUsd: 4 * JUDGE_CALL_PRICE_USD };
    const ask = async (j: Judge) => {
      const vs = [];
      for (const [i, text] of texts.entries()) vs.push(await j.judge({ criterion: `criterion q${i}`, text, penalty: true }));
      return vs;
    };
    const s = scriptedJudge(['{"verdict":"not_met","quote":""}']);
    const live = new Judge({ client: s.client, ...opts });
    const vs = await ask(live);
    expect(vs.map((v) => v.met)).toEqual([false, 'unknown']);
    expect(s.requests).toHaveLength(1);
    expect(live.entries().map((e) => [e.calls, e.error])).toEqual([[1, null], [0, ALLOWANCE_REACHED]]);
    const re = new Judge({ cache: live.entries(), ...opts });
    expect(JSON.stringify(await ask(re))).toBe(JSON.stringify(vs));
    expect(JSON.stringify(re.entries())).toBe(JSON.stringify(live.entries()));
    expect(re.calls).toBe(live.calls);
    // Under a larger allowance in dollars the question has room: a regrade misses it (builder-267).
    await expect(ask(new Judge({ cache: live.entries(), maxCalls: 4, maxUsd: 8 * JUDGE_CALL_PRICE_USD }))).rejects.toThrow(JudgeCacheMiss);
  });

  // The dollars a grading has spent are the worst cases of the entries it used, each times its
  // calls, a cached answer's as well as a live one's, so a live grading that reads part of its
  // answers from a cache is bounded as its regrade is.
  it("counts a cached answer's worst case toward the dollar bound, as a regrade does", async () => {
    const pad = (n: number) => 'The patient was told the result. '.repeat(Math.ceil(n / 33)).slice(0, n);
    const text = pad(58_000);
    const opts = { maxCalls: 4, maxUsd: 4 * JUDGE_CALL_PRICE_USD };
    const seed = new Judge({ client: scriptedJudge(['{"verdict":"not_met","quote":""}']).client, ...opts });
    await seed.judge({ criterion: 'criterion q0', text, penalty: true });
    const s = scriptedJudge(['{"verdict":"not_met","quote":""}']);
    const j = new Judge({ client: s.client, cache: seed.entries(), ...opts });
    await j.judge({ criterion: 'criterion q0', text, penalty: true });
    expect((await j.judge({ criterion: 'criterion q1', text, penalty: true })).met).toBe('unknown');
    expect(s.requests).toHaveLength(0);
    expect(j.overAllowance).toBe(1);
  });

  // The verifier's 400-grading fuzz (probe-budget.ts P3) as a property: texts of 0 to 64 KB, 1 to 8
  // questions, 40% invalid first answers. Every live grading keeps both bounds, and its regrade
  // from its own cache under the same allowance is byte-identical, with no JudgeCacheMiss.
  it('property: every live grading under the dollar bound regrades byte-identically from its cache', async () => {
    const pad = (n: number) => 'The patient was told the result. '.repeat(Math.ceil(n / 33)).slice(0, n);
    let seed = 193;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const worstOf = (r: { history: Parameters<typeof reserveRequest>[0]; params: Parameters<typeof reserveRequest>[1] }) => worstCaseUsd(reserveRequest(r.history, r.params));
    let blocked = 0;
    for (let t = 0; t < 400; t++) {
      const texts = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => pad(Math.floor(rnd() * 64_000)));
      const checks = texts.map((x, i) => judged({ id: `f${i}`, points: -2, category: 'safety', traces_to: 'p', decisive_ids: [], criterion: `criterion f${i}`, text: () => x }));
      const opts = { maxCalls: judgeCallBudget(checks), maxUsd: judgeAllowanceUsd(checks) };
      const requests: Array<{ history: Parameters<typeof reserveRequest>[0]; params: Parameters<typeof reserveRequest>[1] }> = [];
      const client = {
        async send(history: Parameters<typeof reserveRequest>[0], params: Parameters<typeof reserveRequest>[1]) {
          requests.push({ history, params });
          const text = rnd() < 0.4 ? 'not json' : '{"verdict":"not_met","quote":""}';
          return { status: 200, message: { id: `m${requests.length}`, model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } }, refusal: null, attempts: 1 } as never;
        },
      };
      const ask = async (j: Judge) => {
        const vs = [];
        for (const [i, x] of texts.entries()) vs.push(await j.judge({ criterion: `criterion f${i}`, text: x, penalty: true }));
        return JSON.stringify(vs);
      };
      const live = new Judge({ client, ...opts });
      const vs = await ask(live);
      expect(requests.reduce((n, r) => n + worstOf(r), 0), `grading ${t}`).toBeLessThanOrEqual(opts.maxUsd + 1e-9);
      expect(requests.length, `grading ${t}`).toBeLessThanOrEqual(opts.maxCalls);
      if (live.entries().some((e) => e.error === ALLOWANCE_REACHED) && live.calls < opts.maxCalls) blocked++;
      const re = new Judge({ cache: live.entries(), ...opts });
      expect(await ask(re), `grading ${t}`).toBe(vs);
      expect(JSON.stringify(re.entries()), `grading ${t}`).toBe(JSON.stringify(live.entries()));
    }
    // The fuzz reaches the case: gradings with a question the dollar bound, not the call bound, blocked.
    expect(blocked).toBeGreaterThan(50);
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
