// judge-calibrate's calibration provenance and its other modes (plan phase P17i C12, R14-29):
// every calibration file says what it compared (reference scripted or live, and the protocol);
// --annotate adds that to an existing file with no call; --probes asks paraphrases of one judge
// item live and keeps them under `probes`; --from-trials <run dirs> asks the judge again on the
// live agent messages of recorded trials and compares with the answers those trials recorded
// (reference: live). Every live path is mocked: the transport answers from a map, the ledger is a
// temp file and HOME a temp dir. The run dirs are real run-one output (a mocked _toy trial) with
// the mock marker taken off, so their messages read as live.
import { createHash } from 'node:crypto';
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { okResponse, scenarioTransport } from '../../apps/web/src/harness/scenarios.ts';
import { MODEL, type Transport } from '../../packages/core/anthropic.ts';
import { JUDGE_PROMPT_VERSION, type JudgeCacheEntry } from '../../packages/grader/judge.ts';
import type { MatrixTask } from '../../packages/grader/matrix/types.ts';
import { fakeKey, tempDir, write } from '../../scripts/test/helpers.ts';
import { main, type Calibration, type Deps } from '../judge-calibrate.ts';
import { loadMatrixTask } from '../matrix.ts';
import { main as runOne } from '../run-one.ts';

const TOY = await loadMatrixTask('_toy');
const INBOX = await loadMatrixTask('results-inbox');
const SLOW = 120_000;
const RECORDED = join(import.meta.dirname, '..', '..', 'results', 'judge-calibration', 'results-inbox.json');

const seed = () => ['reserve', 'settle'].map((kind) => JSON.stringify({ ts: 't', call_id: 'seed', kind, source: 'node', run_id: null, batch_id: null, trial: null, usage: null, cost_usd: 1 })).join('\n') + '\n';

type Answer = JudgeCacheEntry['answer'];
// A judge transport: answer(key, text) decides each reply; it counts the calls and each key asked.
function judgeBy(effort: string, answer: (key: string, text: string) => Answer) {
  const t = Object.assign(
    async (request: Request) => {
      t.calls++;
      const prompt = (JSON.parse(await request.text()) as { messages: Array<{ content: string }> }).messages[0]!.content;
      const text = /<text>\n([\s\S]*)\n<\/text>/.exec(prompt)![1]!;
      const key = createHash('sha256').update(JSON.stringify([MODEL, effort, JUDGE_PROMPT_VERSION, prompt, text])).digest('hex');
      t.asked.set(key, (t.asked.get(key) ?? 0) + 1);
      return okResponse({ text: JSON.stringify(answer(key, text) ?? { verdict: 'unknown', quote: '' }) }, t.calls);
    },
    { calls: 0, asked: new Map<string, number>() },
  );
  return t;
}

function harness(opts: { task?: MatrixTask; fetch?: Transport; key?: boolean; existing?: Calibration | null } = {}) {
  const dir = tempDir('calibrate-ledger');
  const ledger = join(dir, 'spend.jsonl');
  write(dir, 'spend.jsonl', seed());
  const home = tempDir('calibrate-home');
  const lines: string[] = [];
  const written: Calibration[] = [];
  const fetch = opts.fetch ?? vi.fn<Transport>();
  const deps: Deps = {
    env: { HOME: home, SPEND_LEDGER: ledger, NODE_ENV: 'test', ...(opts.key === false ? {} : { ANTHROPIC_API_KEY: fakeKey('C') }) },
    out: (l) => lines.push(l),
    fetch,
    load: async (id) => opts.task ?? (id === 'results-inbox' ? INBOX : TOY),
    writeResult: (_t, c) => written.push(c),
    readResult: () => (opts.existing === undefined ? null : structuredClone(opts.existing)),
  };
  return { deps, lines, written, fetch, text: () => lines.join('\n') };
}

// A calibration file as P11c wrote it: the committed one without the fields C12 adds.
function p11cFile(): Calibration {
  const { reference: _r, reference_counts: _n, protocol: _p, probes: _x, ...c } = JSON.parse(readFileSync(RECORDED, 'utf8')) as Calibration;
  return c as Calibration;
}

const projectionOf = (text: string) => Number(/^LIVE_PROJECTION_USD=(\d+\.\d{6})$/m.exec(text)![1]);

// A run dir holding one mocked _toy trial, its record made live: no mock marker.
let RUN: string;
let RECORD_FILE: string;
let TRIAL_CACHE: JudgeCacheEntry[];

beforeAll(async () => {
  RUN = join(tempDir('calibrate-run'), 'pilot-x');
  const home = tempDir('calibrate-run-home');
  const out: string[] = [];
  const code = await runOne(['--task', '_toy', '--model', MODEL, '--index', '0', '--mock', 'toy', '--out', RUN], {
    env: { HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl') },
    out: (l) => out.push(l),
    fetch: () => Promise.reject(new Error('no live call')),
    mock: (name) => scenarioTransport(name).transport,
  });
  if (code !== 0) throw new Error(out.join('\n'));
  const trials = join(RUN, 'trials');
  const file = readdirSync(trials, { recursive: true, withFileTypes: true }).find((e) => e.isFile() && e.name.endsWith('.json'))!;
  RECORD_FILE = join(file.parentPath, file.name);
  const record = JSON.parse(readFileSync(RECORD_FILE, 'utf8')) as { mock?: unknown; judge: { cache: JudgeCacheEntry[] } };
  delete record.mock;
  writeFileSync(RECORD_FILE, `${JSON.stringify(record, null, 2)}\n`);
  TRIAL_CACHE = record.judge.cache;
  if (TRIAL_CACHE.length === 0) throw new Error('the toy trial judged no message');
}, SLOW);

const copyRun = (label: string, edit?: (record: Record<string, unknown>) => void) => {
  const copy = join(tempDir(label), label);
  cpSync(RUN, copy, { recursive: true });
  if (edit) {
    const file = join(copy, RECORD_FILE.slice(RUN.length));
    const r = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    edit(r);
    writeFileSync(file, JSON.stringify(r));
  }
  return copy;
};

describe('judge-calibrate --from-trials', () => {
  it('parses the comma-list form, asks each judged agent message once and compares with the recorded answers (reference: live)', { timeout: SLOW }, async () => {
    const recorded = new Map(TRIAL_CACHE.map((e) => [e.key, e.answer]));
    const judge = judgeBy(TOY.judgeEffort, (key) => recorded.get(key) ?? null);
    const second = copyRun('pilot-y');
    const h = harness({ fetch: judge });
    expect(await main(['--task', '_toy', '--from-trials', `${RUN},${second}`], h.deps), h.text()).toBe(0);
    // The two dirs hold the same trial: each message is asked once.
    expect(judge.asked.size).toBe(TRIAL_CACHE.length);
    expect([...judge.asked.values()].every((n) => n === 1)).toBe(true);
    expect([...judge.asked.keys()].sort()).toEqual(TRIAL_CACHE.map((e) => e.key).sort());
    expect(h.written).toHaveLength(1);
    const c = h.written[0]!;
    expect(c).toMatchObject({
      task: '_toy', reference: 'live', reference_counts: { scripted: 0, live: TRIAL_CACHE.length },
      questions: TRIAL_CACHE.length, same_keys: TRIAL_CACHE.length, agree: TRIAL_CACHE.length, calls: TRIAL_CACHE.length,
      oracle: null, disagreements: [],
      trials: { dirs: [RUN, second], used: 2, not_live: 0, invalid: 0, excluded: [] },
    });
    expect(c.protocol.design).toBe('test-retest');
    expect(c.protocol.texts).toContain('live agent messages');
    expect(c.probes).toBeUndefined();
  });

  it('lists an answer that differs from the recorded one with both answers, and exits 1', { timeout: SLOW }, async () => {
    const [target] = TRIAL_CACHE;
    const recorded = new Map(TRIAL_CACHE.map((e) => [e.key, e.answer]));
    const flipped = { verdict: 'not_met', quote: '' };
    const h = harness({ fetch: judgeBy(TOY.judgeEffort, (key) => (key === target!.key ? flipped : recorded.get(key)!)) });
    expect(await main(['--task', '_toy', '--from-trials', RUN], h.deps)).toBe(1);
    const c = h.written[0]!;
    expect(c.agree).toBe(TRIAL_CACHE.length - 1);
    expect(c.disagreements).toEqual([{ key: target!.key, kind: target!.kind, reference: target!.answer, live: flipped, live_error: null, reason: 'answers differ' }]);
  });

  it('--dry-run projects the judged messages of the run and makes 0 calls', { timeout: SLOW }, async () => {
    const h = harness();
    expect(await main(['--task', '_toy', '--from-trials', RUN, '--dry-run'], h.deps)).toBe(0);
    expect(h.text()).toMatch(new RegExp(`^judge-calibrate dry run: _toy: ${TRIAL_CACHE.length} judged messages in 1 trials of ${RUN.replaceAll('/', '\\/')} x 2 calls, worst case \\$`, 'm'));
    expect(projectionOf(h.text())).toBeGreaterThan(0);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.written).toHaveLength(0);
  });

  it('reads no mock trial and no trial without a grade, and writes nothing when no live valid trial is left', { timeout: SLOW }, async () => {
    const mock = copyRun('pilot-mock', (r) => { r.mock = 'toy'; });
    // The run recorded a replay mismatch: the trial is ENV_ERROR, whatever its valid field says.
    const env = copyRun('pilot-env', (r) => { (r.state_hash as { replay_final: string }).replay_final = '0'.repeat(64); });
    const h = harness();
    expect(await main(['--task', '_toy', '--from-trials', `${mock},${env}`], h.deps)).toBe(1);
    expect(h.text()).toContain(`judge-calibrate _toy: no live valid trial in ${mock},${env} (1 not live, 1 not valid)`);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.written).toHaveLength(0);
  });

  it('compares every distinct answer the trials recorded for a key: two trials that differ are listed as a disagreement, and exit 1', { timeout: SLOW }, async () => {
    // verifier-phase-P17i-C12-1 V5: with the first trial's answer alone, a live answer equal to it agreed.
    const [target] = TRIAL_CACHE;
    const flipped = { verdict: (target!.answer as { verdict?: string }).verdict === 'met' ? 'not_met' : 'met', quote: '' };
    const other = copyRun('pilot-flip', (r) => {
      const j = r.judge as { cache: JudgeCacheEntry[] };
      j.cache = j.cache.map((e) => (e.key === target!.key ? { ...e, answer: flipped } : e));
    });
    const recorded = new Map(TRIAL_CACHE.map((e) => [e.key, e.answer]));
    const h = harness({ fetch: judgeBy(TOY.judgeEffort, (key) => recorded.get(key) ?? null) });
    expect(await main(['--task', '_toy', '--from-trials', `${RUN},${other}`], h.deps), h.text()).toBe(1);
    const c = h.written[0]!;
    expect(c.agree).toBe(TRIAL_CACHE.length - 1);
    expect(c.disagreements).toEqual([{ key: target!.key, kind: target!.kind, reference: target!.answer, recorded: [target!.answer, flipped], live: target!.answer, live_error: null, reason: 'trials recorded different answers' }]);
    expect(h.text()).toContain(`${target!.key} ${target!.kind}: trials recorded different answers`);
  });

  it('two trials whose answers for a key differ only in the quote agree with a live answer of the same verdict', { timeout: SLOW }, async () => {
    const [target] = TRIAL_CACHE;
    const requoted = { ...(target!.answer as object), quote: 'another quote' };
    const other = copyRun('pilot-requote', (r) => {
      const j = r.judge as { cache: JudgeCacheEntry[] };
      j.cache = j.cache.map((e) => (e.key === target!.key ? { ...e, answer: requoted } : e));
    });
    const recorded = new Map(TRIAL_CACHE.map((e) => [e.key, e.answer]));
    const h = harness({ fetch: judgeBy(TOY.judgeEffort, (key) => recorded.get(key) ?? null) });
    expect(await main(['--task', '_toy', '--from-trials', `${RUN},${other}`], h.deps), h.text()).toBe(0);
    expect(h.written[0]!).toMatchObject({ agree: TRIAL_CACHE.length, disagreements: [] });
  });

  it('carries over the probes of the existing calibration file', { timeout: SLOW }, async () => {
    // verifier-phase-P17i-C12-1 V1: a later --from-trials run wrote the file without its probes.
    const existing = JSON.parse(readFileSync(RECORDED, 'utf8')) as Calibration;
    const recorded = new Map(TRIAL_CACHE.map((e) => [e.key, e.answer]));
    const h = harness({ fetch: judgeBy(TOY.judgeEffort, (key) => recorded.get(key) ?? null), existing });
    expect(await main(['--task', '_toy', '--from-trials', RUN], h.deps), h.text()).toBe(0);
    expect(h.written[0]!.probes).toEqual(existing.probes);
    expect(h.written[0]!.trials!.used).toBe(1);
  });

  it('lists a trial this checkout cannot regrade under trials.excluded, and exits 1', { timeout: SLOW }, async () => {
    // A final state this checkout's replay does not reach; the record itself stays valid.
    const bad = copyRun('pilot-bad', (r) => { Object.assign(r.state_hash as object, { final: '0'.repeat(64), replay_final: '0'.repeat(64) }); });
    const recorded = new Map(TRIAL_CACHE.map((e) => [e.key, e.answer]));
    const h = harness({ fetch: judgeBy(TOY.judgeEffort, (key) => recorded.get(key)!) });
    expect(await main(['--task', '_toy', '--from-trials', `${RUN},${bad}`], h.deps)).toBe(1);
    const c = h.written[0]!;
    expect(c.trials!.used).toBe(1);
    expect(c.trials!.excluded).toHaveLength(1);
    expect(c.trials!.excluded[0]!.reason).toMatch(/replayed state hash .* is not the record's final 0{64}/);
    expect(c.agree).toBe(TRIAL_CACHE.length);
  });
});

// builder-273: a grader change that rewords one judge question leaves recorded trials missing only
// that question's keys; --misses-only asks just those (a question no trial recorded an answer for,
// or recorded only as a call never sent) and writes the live answers to --out, never to the
// committed calibration file.
describe('judge-calibrate --from-trials --misses-only', () => {
  // The trial's first judged message, set in beforeAll.
  const target = () => TRIAL_CACHE[0]!;
  const missing = (label: string, how: 'removed' | 'never sent') =>
    copyRun(label, (r) => {
      const j = r.judge as { cache: JudgeCacheEntry[] };
      j.cache = how === 'removed' ? j.cache.filter((e) => e.key !== target().key) : j.cache.map((e) => (e.key === target().key ? { ...e, answer: null, error: 'judge allowance reached' } : e));
    });

  it('asks only the keys no trial recorded an answer for, writes them to --out and leaves the calibration file alone', { timeout: SLOW }, async () => {
    for (const how of ['removed', 'never sent'] as const) {
      const run = missing(`pilot-miss-${how.replace(' ', '-')}`, how);
      const out = join(tempDir('calibrate-out'), 'fill.json');
      const judge = judgeBy(TOY.judgeEffort, () => ({ verdict: 'not_met', quote: '' }));
      const h = harness({ fetch: judge });
      expect(await main(['--task', '_toy', '--from-trials', run, '--misses-only', '--out', out], h.deps), h.text()).toBe(0);
      expect([...judge.asked.keys()]).toEqual([target().key]);
      expect(judge.calls).toBe(1);
      expect(h.written).toHaveLength(0);
      const c = JSON.parse(readFileSync(out, 'utf8')) as Calibration;
      expect(c).toMatchObject({ task: '_toy', questions: 1, calls: 1, disagreements: [] });
      expect(c.live_entries.map((e) => e.key)).toEqual([target().key]);
      expect(c.live_entries[0]!.answer).toEqual({ verdict: 'not_met', quote: '' });
      expect(h.text()).toContain(`judge-calibrate _toy: 1 missing of ${TRIAL_CACHE.length} judged messages asked, 1 calls`);
    }
  });

  it('--dry-run projects only the missing keys; a run with none asks nothing', { timeout: SLOW }, async () => {
    const run = missing('pilot-miss-dry', 'removed');
    const h = harness();
    expect(await main(['--task', '_toy', '--from-trials', run, '--misses-only', '--out', join(tempDir('calibrate-out'), 'f.json'), '--dry-run'], h.deps)).toBe(0);
    expect(h.text()).toMatch(/^judge-calibrate dry run: _toy: 1 missing of \d+ judged messages in 1 trials of .* x 2 calls, worst case \$/m);
    const none = harness();
    expect(await main(['--task', '_toy', '--from-trials', RUN, '--misses-only', '--out', join(tempDir('calibrate-out'), 'g.json'), '--dry-run'], none.deps)).toBe(0);
    expect(none.text()).toMatch(/^judge-calibrate dry run: _toy: 0 missing of \d+ judged messages/m);
    expect(projectionOf(none.text())).toBe(0);
  });

  it('needs --from-trials and --out', async () => {
    const h = harness({ key: false });
    expect(await main(['--task', '_toy', '--misses-only', '--out', '/tmp/x.json'], h.deps)).toBe(2);
    expect(await main(['--task', '_toy', '--from-trials', RUN, '--misses-only'], h.deps)).toBe(2);
    expect(await main(['--task', '_toy', '--from-trials', RUN, '--out', '/tmp/x.json'], h.deps)).toBe(2);
    expect(await main(['--task', 'all', '--from-trials', RUN, '--misses-only', '--out', '/tmp/x.json'], h.deps)).toBe(2);
    expect(h.written).toHaveLength(0);
  });
});

describe('judge-calibrate reference and protocol', () => {
  it('a live calibration against the scripted cache writes reference scripted and its protocol', { timeout: SLOW }, async () => {
    const byKey = new Map(TOY.cache.map((e) => [e.key, e.answer]));
    const h = harness({ fetch: judgeBy(TOY.judgeEffort, (key) => byKey.get(key)!) });
    expect(await main(['--task', '_toy'], h.deps), h.text()).toBe(0);
    const c = h.written[0]!;
    expect(c).toMatchObject({ reference: 'scripted', reference_counts: { scripted: TOY.cache.length, live: 0 } });
    expect(c.protocol).toMatchObject({ design: 'scripted reference' });
    expect(Object.keys(c.protocol).sort()).toEqual(['agreement', 'design', 'excluded', 'invalid', 'pooling', 'texts', 'unknown']);
    expect(c.trials).toBeUndefined();
  });

  it('a live calibration carries over the probes of the existing calibration file', { timeout: SLOW }, async () => {
    // verifier-phase-P17i-C12-1 F2: the plain live mode wrote the file without its probes.
    const existing = JSON.parse(readFileSync(RECORDED, 'utf8')) as Calibration;
    const byKey = new Map(TOY.cache.map((e) => [e.key, e.answer]));
    const h = harness({ fetch: judgeBy(TOY.judgeEffort, (key) => byKey.get(key)!), existing });
    expect(await main(['--task', '_toy'], h.deps), h.text()).toBe(0);
    expect(h.written[0]!.probes).toEqual(existing.probes);
    expect(h.written[0]!.questions).toBe(TOY.cache.length);
  });

  it('--annotate adds reference and protocol to the existing file, keeps every other field, makes no call and needs no key', async () => {
    const existing = p11cFile();
    const live = { ...TOY, cache: TOY.cache.map((e) => ({ ...e, provenance: { source: 'live' as const, model: MODEL, at: 't' } })) };
    for (const [task, reference, design] of [[TOY, 'scripted', 'scripted reference'], [live, 'live', 'test-retest']] as const) {
      const h = harness({ task, existing, key: false });
      expect(await main(['--task', '_toy', '--annotate'], h.deps), h.text()).toBe(0);
      expect(h.fetch).not.toHaveBeenCalled();
      const c = h.written[0]!;
      expect(c.reference).toBe(reference);
      expect(c.protocol.design).toBe(design);
      const { reference: _r, reference_counts: _n, protocol: _p, ...rest } = c;
      expect(rest).toEqual(existing);
    }
  });

  it('--annotate without a calibration file writes nothing and exits 1', async () => {
    const h = harness({ key: false });
    expect(await main(['--task', '_toy', '--annotate'], h.deps)).toBe(1);
    expect(h.text()).toContain('judge-calibrate _toy: no calibration file to annotate');
    expect(h.written).toHaveLength(0);
  });
});

describe('judge-calibrate --probes', () => {
  const existing = p11cFile();
  // Since the W1 train (builder-249) results-inbox keeps one probe set: note_contradicts_result about
  // Walter Brennan (pt-0008), the only judged question the worklist still asks word for word.

  it('asks each paraphrase of every probe set once, live, and keeps the results under probes, one entry per set', { timeout: SLOW }, async () => {
    // Met when the text says no follow-up or no further imaging is needed; otherwise not met.
    const judge = judgeBy(INBOX.judgeEffort, (_k, text) => {
      const m = /no (?:further imaging|follow-up)[^.]*/i.exec(text);
      return m ? { verdict: 'met', quote: m[0] } : { verdict: 'not_met', quote: '' };
    });
    const h = harness({ fetch: judge, existing });
    const code = await main(['--task', 'results-inbox', '--probes'], h.deps);
    expect(h.written).toHaveLength(1);
    const c = h.written[0]!;
    const { probes, ...rest } = c;
    expect(rest).toEqual(existing);
    expect(Array.isArray(probes)).toBe(true);
    const set = probes!.find((p) => p.check === 'note_contradicts_result')!;
    expect(set).toMatchObject({ about: 'Patient/pt-0008', model: MODEL, effort: INBOX.judgeEffort, prompt_version: JUDGE_PROMPT_VERSION });
    expect(set.criterion).toContain('contradicts');
    expect(judge.calls).toBe(probes!.reduce((s, p) => s + p.items.length, 0));
    expect(judge.calls).toBe(probes!.reduce((s, p) => s + p.calls, 0));
    for (const p of probes!) {
      for (const it of p.items) expect(it).toMatchObject({ expected: expect.stringMatching(/^(met|not_met)$/), graded: expect.anything(), agree: expect.any(Boolean) });
      expect(p.agree).toBe(p.items.filter((it) => it.agree).length);
    }
    const all = probes!.flatMap((p) => p.items);
    expect(code).toBe(all.every((it) => it.agree) ? 0 : 1);
    expect(h.text()).toMatch(new RegExp(`^judge-calibrate results-inbox probes: ${all.filter((it) => it.agree).length} of ${all.length} agree with the expected verdict, ${judge.calls} calls`, 'm'));
  });

  it('probes note_contradicts_result with correct notes expected not met and wrong notes met', { timeout: SLOW }, async () => {
    // verifier-phase-P17i-P17-T2-1 S1: a correct note escapes the penalty; a wrong one meets it.
    const judge = judgeBy(INBOX.judgeEffort, () => ({ verdict: 'not_met', quote: '' }));
    const h = harness({ fetch: judge, existing });
    await main(['--task', 'results-inbox', '--probes'], h.deps);
    const probes = h.written[0]!.probes!;
    expect(probes.map((p) => [p.check, p.about])).toEqual([['note_contradicts_result', 'Patient/pt-0008']]);
    const items = probes[0]!.items;
    expect(items.filter((it) => it.expected === 'not_met').length).toBeGreaterThanOrEqual(3);
    expect(items.filter((it) => it.expected === 'met').length).toBeGreaterThanOrEqual(1);
  });

  it('--probes --dry-run prints the projection of every set and makes 0 calls; a task with no probes is a usage error', { timeout: SLOW }, async () => {
    const h = harness({ existing });
    expect(await main(['--task', 'results-inbox', '--probes', '--dry-run'], h.deps)).toBe(0);
    expect(h.text()).toMatch(/^judge-calibrate dry run: results-inbox: \d+ probes of note_contradicts_result \(Patient\/pt-0008\) x 2 calls, worst case \$/m);
    expect(projectionOf(h.text())).toBeGreaterThan(0);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.written).toHaveLength(0);
    expect(await main(['--task', '_toy', '--probes'], harness().deps)).toBe(2);
  });
});

describe('judge-calibrate usage', () => {
  it('refuses a mode without its value or two modes at once with 2', async () => {
    const h = harness({ key: false });
    expect(await main(['--task', '_toy', '--from-trials'], h.deps)).toBe(2);
    expect(await main(['--task', '_toy', '--from-trials', ','], h.deps)).toBe(2);
    expect(await main(['--task', '_toy', '--from-trials', join(tempDir('empty'), 'none')], h.deps)).toBe(2);
    expect(await main(['--task', '_toy', '--probes', '--annotate'], h.deps)).toBe(2);
    expect(await main(['--task', '_toy', '--from-trials', RUN, '--probes'], h.deps)).toBe(2);
    expect(await main(['--task', '_toy', '--annotate', '--dry-run'], h.deps)).toBe(2);
    expect(h.written).toHaveLength(0);
  });
});
