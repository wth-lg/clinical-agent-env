// summary.json (plan phase P12): summarize() output validates against the exported schema, a
// record missing a field fails it, and Wilson 95% intervals match hand-checked values.
import { describe, expect, it } from 'vitest';
import { MODEL } from '../anthropic.ts';
import { assertSummary, checkRequirements, parseRequire, summarize, validateSummary, wilson, type ReplayState, type Requirements, type SummaryTrial } from '../summary.ts';

const trial = (task_id: string, index: number, outcome: string, over: Partial<SummaryTrial> = {}): SummaryTrial => ({
  task_id, task_version: 'v1', index, outcome, model_requested: MODEL, models_returned: [MODEL],
  state_hash: { initial: 'h0', final: 'h1', replay_final: 'h1' }, tool_errors: { INTERNAL: 0 },
  cost_usd: 0.5, judge_cost_usd: 0.01, score: outcome === 'PASS' ? 1 : 0, ...over,
});

const tenOf = (task: string, passes: number) => Array.from({ length: 10 }, (_, i) => trial(task, i, i < passes ? 'PASS' : 'FAIL'));
const replayAll = (ts: SummaryTrial[]): Record<string, ReplayState> => Object.fromEntries(ts.map((t) => [`${t.task_id}/${t.index}`, 'match' as const]));

describe('wilson 95%', () => {
  it('5/10 is 23.7% to 76.3% (the design: 24-76%)', () => {
    const w = wilson(5, 10)!;
    expect(w.lo).toBeCloseTo(0.2366, 4);
    expect(w.hi).toBeCloseTo(0.7634, 4);
  });
  it('0/10 is 0% to 27.8%, 10/10 is 72.2% to 100%', () => {
    expect(wilson(0, 10)!.lo).toBeCloseTo(0, 10);
    expect(wilson(0, 10)!.hi).toBeCloseTo(0.2775, 4);
    expect(wilson(10, 10)!.lo).toBeCloseTo(0.7225, 4);
    expect(wilson(10, 10)!.hi).toBeCloseTo(1, 10);
  });
  it('no trials: no interval', () => expect(wilson(0, 0)).toBeNull());
});

describe('summary.json schema', () => {
  const trials = [...tenOf('t-a', 5), ...tenOf('t-b', 3)];
  const summary = () => summarize({ run_id: 'r1', trials, requeued: [], replay: replayAll(trials) });

  it("summarize's output validates, before and after a JSON round trip", () => {
    const s = summary();
    expect(validateSummary(s)).toEqual([]);
    expect(validateSummary(JSON.parse(JSON.stringify(s)))).toEqual([]);
    expect(() => assertSummary(s)).not.toThrow();
    expect(s.tasks['t-a']).toMatchObject({ trials: 10, passes: 5, records: 10 });
    expect(s.initial_state_hashes).toEqual(['h0']);
  });

  it('a task record missing a field fails, naming it', () => {
    const s = summary() as unknown as { tasks: Record<string, Record<string, unknown>> };
    delete s.tasks['t-a']!.passes;
    expect(validateSummary(s)).toContainEqual(expect.stringContaining('tasks.t-a.passes'));
    expect(() => assertSummary(s)).toThrow(/tasks\.t-a\.passes/);
  });

  it('a missing top-level field and a wrong type fail', () => {
    const s = summary() as unknown as Record<string, unknown>;
    delete s.initial_state_hashes;
    expect(validateSummary(s)).toContainEqual(expect.stringContaining('initial_state_hashes'));
    const t = summary() as unknown as { totals: Record<string, unknown> };
    t.totals.env_error_raw = '0';
    expect(validateSummary(t)).toContainEqual(expect.stringContaining('totals.env_error_raw'));
  });

  it('ENV_ERROR is counted raw, re-queued attempts included', () => {
    const s = summarize({ run_id: 'r1', trials, requeued: [trial('t-a', 3, 'ENV_ERROR')], replay: replayAll(trials) });
    expect(s.totals.env_error_raw).toBe(1);
    expect(s.tasks['t-a']!.env_error_raw).toBe(1);
  });
});

describe('--require', () => {
  it('parses the plan form and the donewhen aliases', () => {
    expect(parseRequire('valid=10,band=2-7,env_error_raw=0,model=claude-opus-5-5,replay=all')).toEqual({ valid: 10, band: [2, 7], env_error_raw: 0, model: MODEL, replay: 'all' });
    expect(parseRequire(`trials=10,pass-min=2,pass-max=7,model=${MODEL}`)).toEqual({ valid: 10, band: [2, 7], model: MODEL });
    expect(() => parseRequire('valid=ten')).toThrow(/valid/);
    expect(() => parseRequire('colour=blue')).toThrow(/colour/);
  });

  // P21: the final run's band is a proportion of each task's valid trials, inclusive (cost.ts
  // FINAL_PASS_BAND), beside P12's count form. A decimal point names the proportion form.
  it('parses the proportion band 0.2-0.7 beside the count band, and refuses a mixed or reversed one', () => {
    expect(parseRequire('valid=20,band=0.2-0.7')).toEqual({ valid: 20, band_rate: [0.2, 0.7] });
    expect(parseRequire('band=0.20-0.70')).toEqual({ band_rate: [0.2, 0.7] });
    expect(parseRequire('band=2-7')).toEqual({ band: [2, 7] });
    expect(() => parseRequire('band=0.2-7')).toThrow(/band=0\.2-7/);
    expect(() => parseRequire('band=0.7-0.2')).toThrow(/band=0\.7-0\.2/);
    expect(() => parseRequire('band=1.2-1.5')).toThrow(/band=1\.2-1\.5/);
    expect(() => parseRequire('band=0.2-0.7,pass-min=2')).toThrow(/not both/);
  });

  it('the proportion band is k/N inclusive: 3/20 and 15/20 violate, 4/20 and 14/20 hold, and 3/15 holds at 0.2', () => {
    const nOf = (task: string, n: number, passes: number) => Array.from({ length: n }, (_, i) => trial(task, i, i < passes ? 'PASS' : 'FAIL'));
    const req = parseRequire('valid=20,band=0.2-0.7');
    const check = (ts: SummaryTrial[], r = req) => checkRequirements(summarize({ run_id: 'r', trials: ts, requeued: [], replay: replayAll(ts), mode: 'live' }), r);
    expect(check([...nOf('t-a', 20, 4), ...nOf('t-b', 20, 14)])).toEqual([]);
    expect(check([...nOf('t-a', 20, 3), ...nOf('t-b', 20, 15)])).toEqual(['t-a: 3/20 passes, outside the band 0.2-0.7 of its valid trials', 't-b: 15/20 passes, outside the band 0.2-0.7 of its valid trials']);
    expect(check(nOf('t-a', 15, 3), parseRequire('band=0.2-0.7'))).toEqual([]);
    expect(check(nOf('t-a', 10, 7), parseRequire('band=0.2-0.7'))).toEqual([]);
    expect(check([], parseRequire('band=0.2-0.7'))).toEqual(['no trials in the run']);
  });

  // P21: --tasks names the tasks the per-task requirements (valid, band) hold for; every one of
  // them must have records, and a task outside the list is summarized but not held to them. The
  // run-wide requirements stay run-wide.
  it('tasks restricts valid and band to the named tasks, which must have records', () => {
    const ts = [...tenOf('t-a', 5), ...tenOf('t-b', 9), ...tenOf('t-c', 3).slice(0, 9)];
    const s = (req: Requirements) => checkRequirements(summarize({ run_id: 'r', trials: ts, requeued: [], replay: replayAll(ts), mode: 'live' }), req);
    expect(s({ ...parseRequire('valid=10,band=2-7'), tasks: ['t-a'] })).toEqual([]);
    expect(s({ ...parseRequire('valid=10,band=2-7'), tasks: ['t-a', 't-b'] })).toEqual(['t-b: 9/10 passes, outside the band 2-7']);
    expect(s({ ...parseRequire('valid=10,band=2-7'), tasks: ['t-a', 't-d'] })).toEqual(['t-d: expected by --tasks, no records', 't-d: 0 valid trials, required 10']);
    expect(s(parseRequire('valid=10,band=2-7'))).toEqual(['t-b: 9/10 passes, outside the band 2-7', 't-c: 9 valid trials, required 10']);
    expect(s({ ...parseRequire('valid=10,grader_error=0'), tasks: ['t-a'] })).toEqual([]);
  });

  it('a clean run meets every requirement; 8/10 breaks the band', () => {
    const req = parseRequire(`valid=10,band=2-7,env_error_raw=0,model=${MODEL},replay=all`);
    const clean = [...tenOf('t-a', 5), ...tenOf('t-b', 3)];
    expect(checkRequirements(summarize({ run_id: 'r', trials: clean, requeued: [], replay: replayAll(clean), mode: 'live' }), req)).toEqual([]);
    const high = [...tenOf('t-a', 8), ...tenOf('t-b', 3)];
    expect(checkRequirements(summarize({ run_id: 'r', trials: high, requeued: [], replay: replayAll(high), mode: 'live' }), req)).toEqual([expect.stringMatching(/t-a.*8\/10.*2-7/)]);
  });

  it('with any requirement, an expected task without records, a mock run and a GRADER_ERROR record are violations', () => {
    const clean = [...tenOf('t-a', 5), ...tenOf('t-b', 3)];
    const base = { run_id: 'r', trials: clean, requeued: [], replay: replayAll(clean) };
    const missing = summarize({ ...base, mode: 'live', expected: { tasks: ['t-a', 't-b', 't-c'], from: 'the run manifest' } });
    expect(checkRequirements(missing, parseRequire('valid=10'))).toEqual(['t-c: expected by the run manifest, no records', 't-c: 0 valid trials, required 10']);
    expect(checkRequirements(missing, {})).toEqual([]);
    const mock = summarize({ ...base, mode: 'mock-toy' });
    expect(checkRequirements(mock, parseRequire('valid=10'))).toEqual([expect.stringMatching(/mode mock-toy: not a live run; pass --allow-mock/)]);
    expect(checkRequirements(mock, { ...parseRequire('valid=10'), allow_mock: true })).toEqual([]);
    expect(checkRequirements(mock, { ...parseRequire('valid=10,mode=live'), allow_mock: true })).toEqual(['mode mock-toy, required live']);
    const graderError = summarize({ ...base, mode: 'live', trials: [...clean, trial('t-a', 10, 'GRADER_ERROR')] });
    expect(graderError.totals).toMatchObject({ grader_error: 1, grader_error_history: 0 });
    expect(checkRequirements(graderError, parseRequire('valid=10,grader_error=0'))).toEqual([expect.stringMatching(/GRADER_ERROR in 1 record at its current grade/)]);
    const regrades = [{ outcome: 'GRADER_ERROR' }, { outcome: 'FAIL' }];
    // t-a/9, one of the 10 keys, was a GRADER_ERROR and a regrade graded it FAIL.
    const regraded = summarize({ ...base, mode: 'live', trials: clean.map((t) => (t.task_id === 't-a' && t.index === 9 ? { ...t, outcome: 'GRADER_ERROR', regrades } : t)) });
    expect(regraded.totals).toMatchObject({ grader_error: 0, grader_error_history: 1 });
    expect(checkRequirements(regraded, parseRequire('valid=10,grader_error=0'))).toEqual([]);
    expect(() => assertSummary(JSON.parse(JSON.stringify(graderError)))).not.toThrow();
  });
});

describe('every figure reads the current grade: the last regrade, else the recorded outcome', () => {
  const pass = (over: Partial<SummaryTrial> = {}) => ({ outcome: 'PASS', score: 1, valid: true, ...over });
  const live = (ts: SummaryTrial[]) => summarize({ run_id: 'r', trials: ts, requeued: [], replay: replayAll(ts), mode: 'live' });

  it('5 FAIL regraded to PASS moves 5/10 to 10/10, out of band 2-7; the recorded counts stay as disclosure', () => {
    const ts = tenOf('t-a', 5).map((t) => (t.outcome === 'FAIL' ? { ...t, regrades: [pass()] } : t));
    const s = live(ts);
    expect(s.tasks['t-a']).toMatchObject({ trials: 10, passes: 10, pass_rate: 1, refusals: 0, outcomes: { PASS: 10 }, mean_score: 1, recorded_outcomes: { PASS: 5, FAIL: 5 }, regraded: 5 });
    expect(s.tasks['t-a']!.wilson95!.lo).toBeCloseTo(0.7225, 4);
    expect(s.totals).toMatchObject({ trials: 10, passes: 10, regraded: 5 });
    expect(checkRequirements(s, parseRequire('valid=10,band=2-7'))).toEqual(['t-a: 10/10 passes, outside the band 2-7']);
    expect(validateSummary(JSON.parse(JSON.stringify(s)))).toEqual([]);
  });

  it('a GRADER_ERROR among the 10 keys regraded to FAIL gives valid=10', () => {
    const ts = tenOf('t-a', 5).map((t) => (t.index === 9 ? { ...t, outcome: 'GRADER_ERROR', score: null, regrades: [{ outcome: 'FAIL', score: 0, valid: true }] } : t));
    const s = live(ts);
    expect(s.tasks['t-a']).toMatchObject({ trials: 10, passes: 5, grader_error: 0, grader_error_history: 1, outcomes: { PASS: 5, FAIL: 5 }, recorded_outcomes: { PASS: 5, FAIL: 4, GRADER_ERROR: 1 }, regraded: 1 });
    expect(checkRequirements(s, parseRequire('valid=10,band=2-7,grader_error=0'))).toEqual([]);
  });

  it("refusals and mean_score read the regrade's outcome and score; a regrade that is not valid leaves the denominator", () => {
    const ts = tenOf('t-a', 5).map((t) => {
      if (t.index === 0) return { ...t, regrades: [{ outcome: 'REFUSAL', score: 0, valid: true }] };
      if (t.index === 1) return { ...t, regrades: [{ outcome: 'GRADER_ERROR', score: null, valid: false }] };
      if (t.index === 5) return { ...t, regrades: [{ outcome: 'FAIL', score: 0.5, valid: true }] };
      return t;
    });
    const t = live(ts).tasks['t-a']!;
    expect(t).toMatchObject({ trials: 9, passes: 3, refusals: 1, refusal_excluded_rate: 3 / 8, grader_error: 1, regraded: 3 });
    expect(t.mean_score).toBeCloseTo((3 * 1 + 0 + 0.5 + 0 * 4) / 9, 10);
  });

  it('currentGrade is the one reader: the last entry wins, a missing score or valid falls back to the outcome', async () => {
    const { currentGrade } = await import('../summary.ts');
    expect(currentGrade({ outcome: 'FAIL', score: 0 })).toEqual({ outcome: 'FAIL', score: 0, valid: true, checks: null, regraded: false, grader_task_version: null, attribution: null, attribution_stored: true });
    expect(currentGrade({ outcome: 'FAIL', score: 0, checks: [{ id: 'G1', met: false }], regrades: [{ outcome: 'GRADER_ERROR' }, { outcome: 'PASS', score: 1, valid: true }] }))
      .toEqual({ outcome: 'PASS', score: 1, valid: true, checks: null, regraded: true, grader_task_version: null, attribution: null, attribution_stored: false });
    // builder-292: a regrade entry's own attribution is the current grade's; an older entry falls
    // back to the recorded one, marked not stored.
    const recorded = { auto: 'retrieval', first_failed: 'event_seen' };
    const regraded = { auto: 'retrieval', first_failed: 'fit_orders' };
    expect(currentGrade({ outcome: 'FAIL', attribution: recorded, regrades: [{ outcome: 'FAIL', attribution: regraded }] })).toMatchObject({ attribution: regraded, attribution_stored: true });
    expect(currentGrade({ outcome: 'FAIL', attribution: recorded, regrades: [{ outcome: 'PASS', attribution: null }] })).toMatchObject({ attribution: null, attribution_stored: true });
    expect(currentGrade({ outcome: 'FAIL', attribution: recorded, regrades: [{ outcome: 'FAIL' }] })).toMatchObject({ attribution: recorded, attribution_stored: false });
    expect(currentGrade({ outcome: 'PASS', score: 1, regrades: [{ outcome: 'CANCELLED' }] })).toMatchObject({ outcome: 'CANCELLED', score: null, valid: false });
  });
});

describe('summary.json schema version', () => {
  it('is 11; a version 10 file is rejected with a message naming the version', () => {
    const ts = tenOf('t-a', 5);
    const s = summarize({ run_id: 'r', trials: ts, requeued: [], replay: replayAll(ts) });
    expect(s.schema_version).toBe(11);
    const v10 = { ...JSON.parse(JSON.stringify(s)), schema_version: 10 };
    expect(validateSummary(v10)).toContainEqual(expect.stringMatching(/schema_version 10.*version 11/));
    expect(() => assertSummary(v10)).toThrow(/schema_version 10/);
  });
});

// Pre-audit-2 B4, R37: replay.json's per-trial verdicts. A trial replayed at another checkout than
// its own world (verdict world_mismatch, cli/replay.ts) is not a failed reproduction: summary lists
// it apart from the mismatches, and replay=all names it with the way to replay it.
describe('replay verdicts', () => {
  const ts = [...tenOf('t-a', 5), ...tenOf('t-b', 3)];
  const states = (over: Record<string, ReplayState>) => ({ ...replayAll(ts), ...over });

  it('counts match, lists mismatch and world_mismatch apart, and missing entries', () => {
    const s = summarize({ run_id: 'r', trials: ts, requeued: [], replay: states({ 't-a/0': 'mismatch', 't-b/0': 'world_mismatch', 't-b/1': 'world_mismatch' }), mode: 'live' });
    expect(s.replay).toEqual({ ran: true, matched: 17, mismatched: ['t-a/0'], other_world: ['t-b/0', 't-b/1'], missing: [] });
    expect(validateSummary(JSON.parse(JSON.stringify(s)))).toEqual([]);
    const { 't-a/9': _, ...fewer } = replayAll(ts);
    expect(summarize({ run_id: 'r', trials: ts, requeued: [], replay: fewer }).replay).toMatchObject({ matched: 19, missing: ['t-a/9'], other_world: [] });
    expect(summarize({ run_id: 'r', trials: ts, requeued: [], replay: null }).replay).toEqual({ ran: false, matched: 0, mismatched: [], other_world: [], missing: [] });
  });

  it('replay=all fails on a world_mismatch trial, naming its task and the two-step replay', () => {
    const s = summarize({ run_id: 'r', trials: ts, requeued: [], replay: states({ 't-b/0': 'world_mismatch' }), mode: 'live' });
    expect(checkRequirements(s, parseRequire('replay=all'))).toEqual([
      'replay: t-b/0 ran on another world than the replaying checkout\'s (R37): replay t-b at its own commit (results/tasks-final.json replay_at, else the run\'s README.md) with pnpm cli replay <run> --tasks t-b, then the other tasks at this checkout; the two steps merge into one replay.json',
    ]);
    expect(checkRequirements(summarize({ run_id: 'r', trials: ts, requeued: [], replay: states({ 't-a/0': 'mismatch' }), mode: 'live' }), parseRequire('replay=all'))).toEqual(['replay: did not reproduce t-a/0']);
  });
});

// R42: a task's superseded version (results/<run>/superseded/<task>-v<n>/) is summarized beside
// the current one and never counted in tasks or totals.
describe('superseded versions', () => {
  const current = [...tenOf('t-a', 5), ...tenOf('t-b', 3)];
  const v1 = Array.from({ length: 10 }, (_, i) => trial('t-a', i, i < 9 ? 'PASS' : 'FAIL', { state_hash: { initial: 'h-old', final: 'h2', replay_final: 'h2' }, env_version: 'e-old' }));

  it('summarizes each superseded version as a task summary with its own world, apart from the run\'s tasks and totals', () => {
    const s = summarize({ run_id: 'r', trials: current, requeued: [], replay: replayAll(current), superseded: [{ key: 't-a-v1', task: 't-a', version: 'v1', trials: v1 }] });
    expect(Object.keys(s.superseded)).toEqual(['t-a-v1']);
    expect(s.superseded['t-a-v1']).toMatchObject({ task: 't-a', version: 'v1', dir: 'superseded/t-a-v1', initial_state_hashes: ['h-old'], summary: { records: 10, trials: 10, passes: 9, env_versions: ['e-old'], band_verdict: 'Above band' } });
    expect(s.tasks['t-a']).toMatchObject({ trials: 10, passes: 5 });
    expect(s.totals).toMatchObject({ records: 20, trials: 20, passes: 8 });
    expect(s.initial_state_hashes).toEqual(['h0']);
    expect(validateSummary(JSON.parse(JSON.stringify(s)))).toEqual([]);
    expect(summarize({ run_id: 'r', trials: current, requeued: [], replay: null }).superseded).toEqual({});
  });

  it('the schema checks each superseded entry', () => {
    const s = summarize({ run_id: 'r', trials: current, requeued: [], replay: null, superseded: [{ key: 't-a-v1', task: 't-a', version: 'v1', trials: v1 }] }) as unknown as { superseded: Record<string, Record<string, unknown>> };
    delete s.superseded['t-a-v1']!.task;
    expect(validateSummary(s)).toContainEqual(expect.stringContaining('superseded.t-a-v1.task'));
    const t = summarize({ run_id: 'r', trials: current, requeued: [], replay: null, superseded: [{ key: 't-a-v1', task: 't-a', version: 'v1', trials: v1 }] }) as unknown as { superseded: Record<string, { summary: Record<string, unknown> }> };
    delete t.superseded['t-a-v1']!.summary.passes;
    expect(validateSummary(t)).toContainEqual(expect.stringContaining('superseded.t-a-v1.summary.passes'));
  });
});
