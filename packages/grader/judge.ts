// Judge and hybrid extraction (design section 5, "Judge and hybrid items"), rubric only.
//
// Judge: one isolated call per criterion, claude-opus-5-5 at the task's judge effort (task.toml
// [judge] effort: low, medium or high, default medium), through the trial's
// MessagesClient, so every call is metered by the ledger under the trial's grant. No sampling
// parameter is sent (the client refuses one), and tool_choice is not forced (a 400 on this
// model): the answer is JSON text, {verdict: met | not_met | unknown, quote}, retried once when
// it does not parse. Code then checks the quote: a met verdict needs a quote, and any non-empty
// quote must be a substring of the graded text, both folded (quotes, dashes, case, whitespace)
// and with "..." read as a gap; otherwise the item is unknown. A not_met
// verdict may carry an empty quote, because absence cannot be quoted (coordinator decision,
// 2026-10-23): it stays met: false and counts in the denominator. An unknown item leaves both
// the numerator and the denominator of the score and is counted. The judge sees the criterion
// and the text only, never the gate result or the reference.
//
// Hybrid: a regex extracts the value first; when it finds none, the LLM extractor answers
// {value, quote} under the same quote check, and the quote must state the value as the first
// number after the field's label.
//
// Failures: a client error (401, 403, a billing 400, retries exhausted, a substituted model, a
// spend refusal, any error that stops the batch) is not an answer. It is thrown as
// JudgeClientError, never cached, and the grader ends the trial with the outcome
// classifyFailure gives it, the same as for a model call in the trial loop (INFRA_API for a
// 401, 403, 404, billing error or retries exhausted). Only a response that
// parsed (or failed to parse twice) is cached as an answer or an unknown.
//
// Allowance: a trial's judge calls are bounded by its projection, two calls (the schema retry)
// per judge and hybrid item, counted per call, whichever item makes them (a code item that asks
// ctx.judge included). Past the bound a question is not sent: it is unknown, marked 'judge
// allowance reached' in the record. Each call's worst case (its real body plus JUDGE_MAX_TOKENS
// of output) must stay within JUDGE_MAX_CALL_USD, $1, or it is not sent: unknown, marked
// OVER_BUDGET. judgeAllowanceUsd prices each call at that ceiling, the upper bound for when the
// graded text is not known yet (a dry run); perCallGrantClient opens each call's grant at its
// real request's worst case.
//
// Cache: every answer is kept under sha256 of (model, effort, prompt version, prompt, graded
// text), with the calls it took, and the entries go into the trial record, so a regrade from
// them is byte-identical and free. A task's canned cache (tests/judge-cache.json) also says where
// each answer came from: provenance {source: live | scripted, model, at}. With a cache and no client (regrade, replay), a miss is an
// error: JudgeCacheMiss. With neither, judge and hybrid-fallback items are unknown.
import { classifyFailure, MODEL, reserveRequest, type CallResult, type ClientFailure, type MessageParam, type MessageParams, type SendOptions } from '../core/anthropic.ts';
import { worstCaseUsd } from '../core/cost.ts';
import type { BatchGrant, Ledger } from '../core/ledger.ts';
import { DEFAULT_JUDGE_EFFORT, type JudgeEffort } from '../core/tasks.ts';
import type { Check, Json, Verdict } from './check.ts';
import { canonicalNumber } from './normalize.ts';

export { DEFAULT_JUDGE_EFFORT, type JudgeEffort };
export const JUDGE_PROMPT_VERSION = 'judge-v1';
export const JUDGE_MAX_TOKENS = 16_000;
// The most one judge call may cost at worst (its real request body plus JUDGE_MAX_TOKENS of
// output). A request over it is not sent: the item is unknown, marked OVER_BUDGET. It bounds
// the projection allowance below.
export const JUDGE_MAX_CALL_USD = 1;
export const OVER_BUDGET = 'judge call over budget';
// Calls each judge or hybrid item may make: the first and the schema retry.
export const JUDGE_CALLS_PER_ITEM = 2;
export const ALLOWANCE_REACHED = 'judge allowance reached';

// The part of MessagesClient the judge uses (the loop's TrialClient).
export interface JudgeClient {
  send(history: MessageParam[], params: MessageParams, opts?: SendOptions): Promise<CallResult>;
}

export interface JudgeQuestion {
  criterion: string;
  text: string;
}

export interface ExtractQuestion {
  // What to extract, e.g. 'CrCl in mL/min'.
  field: string;
  text: string;
  // Its first capture group is the value.
  pattern: RegExp;
}

export interface Extraction {
  [k: string]: Json;
  // null: the text does not state it; 'unknown': an answer the code could not verify.
  value: number | null | 'unknown';
  quote: string;
  source: 'regex' | 'llm' | 'none';
}

export interface JudgeCacheEntry {
  key: string;
  kind: 'judge' | 'extract';
  model: string;
  effort: string;
  prompt_version: string;
  // The parsed answer; null when there is none (invalid twice, over the size cap or the
  // allowance).
  answer: { [k: string]: Json } | null;
  error: string | null;
  // The API calls the answer took: 0, 1 or 2 (0 for a scripted answer).
  calls: number;
  // Where a canned answer came from; set when a task's cache file is written.
  provenance?: JudgeProvenance;
}

export interface JudgeProvenance {
  [k: string]: Json;
  // live: the judge model answered it (oracle --live-judge); scripted: a script wrote it.
  source: 'live' | 'scripted';
  // The model that answered, or what wrote a scripted answer.
  model: string;
  // When, as an ISO 8601 time.
  at: string;
}

// A judge or extractor call the client failed: infrastructure, not an answer.
export class JudgeClientError extends Error {
  override readonly name = 'JudgeClientError';
  // How the failure ends the trial, and whether the batch stops.
  readonly failure: ClientFailure;
  constructor(cause: unknown) {
    super(cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
    this.failure = classifyFailure(cause);
  }
}

export class JudgeCacheMiss extends Error {
  constructor(key: string) {
    super(`judge cache miss ${key}: a regrade or replay never calls the judge`);
    this.name = 'JudgeCacheMiss';
  }
}

const paramsFor = (effort: JudgeEffort): MessageParams => ({ max_tokens: JUDGE_MAX_TOKENS, output_config: { effort } });

function judgePrompt(q: JudgeQuestion): string {
  return [
    'You grade one criterion against a text written by a clinical operations agent. Decide only whether the text meets the criterion.',
    '',
    `Criterion: ${q.criterion}`,
    '',
    'Text:',
    '<text>',
    q.text,
    '</text>',
    '',
    'Answer with one JSON object and nothing else:',
    '{"verdict": "met" | "not_met" | "unknown", "quote": "<the words of the text that decide the verdict, copied exactly; empty if there are none>"}',
    'Answer "unknown" when the text does not let you decide.',
  ].join('\n');
}

function extractPrompt(q: ExtractQuestion): string {
  return [
    'Read a text written by a clinical operations agent and find the value it states for one quantity.',
    '',
    `Quantity: ${q.field}`,
    '',
    'Text:',
    '<text>',
    q.text,
    '</text>',
    '',
    'Answer with one JSON object and nothing else:',
    '{"value": <the number as stated, or null if the text does not state it>, "quote": "<the words of the text that state it, copied exactly; empty if none>"}',
  ].join('\n');
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const isObj = (v: unknown): v is { [k: string]: Json } => typeof v === 'object' && v !== null && !Array.isArray(v);

// The JSON object in the answer's text (a ```json fence allowed), or null.
function parseAnswer(result: CallResult): { [k: string]: Json } | null {
  const text = result.message.content.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const v: unknown = JSON.parse(text.slice(start, end + 1));
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

const validJudge = (a: { [k: string]: Json }) => ['met', 'not_met', 'unknown'].includes(a.verdict as string) && typeof a.quote === 'string';
const validExtract = (a: { [k: string]: Json }) => (a.value === null || (typeof a.value === 'number' && Number.isFinite(a.value))) && typeof a.quote === 'string';

// Both sides are compared folded: typographic single and double quotes (and the modifier and
// fullwidth apostrophes) as ' and ", hyphens, en and em dashes and the minus sign as -, case
// folded, whitespace runs as one space, so a quote that re-types an apostrophe or re-wraps a
// line still matches (R14-04).
const foldWith = (s: string, run: (ws: string) => string) => s.replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC\uFF07]/g, "'").replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"').replace(/[\u2010\u2011\u2013\u2014\u2212]/g, '-').toLowerCase().replace(/\s+/g, run).trim();
const fold = (s: string) => foldWith(s, () => ' ');
// The same, a whitespace run with a line break kept as one '\n': same length, so the same offsets.
const foldLines = (s: string) => foldWith(s, (ws) => (/[\n\r]/.test(ws) ? '\n' : ' '));
// A quote with "..." or "\u2026" is segments that must all appear in the text, in that order. Each
// segment of such a quote has at least 2 words and 8 characters (verifier M2). A gap, the text
// the ellipsis skips, is at most GAP_MAX characters within one sentence (no . ! ? or line break)
// and holds no negation, so a gap cannot turn "not sent" into "sent" or join two sentences into
// one the text does not say (verifier B1-2 F2, F3). Every segment, and
// a quote found as written, starts and ends at a word edge of the text, so "I have n... sent"
// cannot cut "not" in two (verifier B1-2 F1). Any placement of the segments that keeps these
// rules counts, not only the first. The matched segments, or null when the quote is not in the
// text.
const GAP_MAX = 80;
const SENTENCE_END = /[.!?\n]/;
const NEGATION = /\b(?:not|no|never|cannot|without|denies|denied|declined|refused|unable|failed|neither|nor|negative|none|stop|stopped|hold|held|(?:do|does|did|is|was|are|were|has|have|had|ca|can|could|would|should|wo|must|need)n'?t)\b|n't\b/;
const WORD = /[\p{L}\p{N}]/u;
// t[j] is inside a word: a letter or digit, or an apostrophe between two (I've, didn't).
const inWord = (t: string, j: number) => WORD.test(t[j] ?? '') || (t[j] === "'" && WORD.test(t[j - 1] ?? '') && WORD.test(t[j + 1] ?? ''));
const atEdges = (t: string, i: number, s: string) => !(WORD.test(s[0]!) && inWord(t, i - 1)) && !(WORD.test(s[s.length - 1]!) && inWord(t, i + s.length));
// Whether segments[k..] can be placed in t from `at` on, each gap accepted by gapOk.
function place(t: string, segments: readonly string[], k: number, at: number, gapOk: (from: number, to: number) => boolean): boolean {
  if (k === segments.length) return true;
  const s = segments[k]!;
  for (let i = t.indexOf(s, at); i >= 0; i = t.indexOf(s, i + 1)) {
    if (k > 0 && i - at > GAP_MAX) break;
    if (k > 0 && !gapOk(at, i)) continue;
    if (atEdges(t, i, s) && place(t, segments, k + 1, i + s.length, gapOk)) return true;
  }
  return false;
}
function segmentsIn(quote: string, text: string): string[] | null {
  const whole = fold(quote);
  const folded = fold(text);
  // Found as written (an ellipsis in the text included): one segment, as before the gap reading.
  if (whole !== '' && place(folded, [whole], 0, 0, () => true)) return [whole];
  const segments = whole.split(/\.\.\.|\u2026/).map((s) => s.trim()).filter((s) => s !== '');
  if (segments.length === 0) return null;
  if (segments.length > 1 && segments.some((s) => s.length < 8 || s.split(' ').length < 2)) return null;
  const lines = foldLines(text);
  const gapOk = (from: number, to: number) => !SENTENCE_END.test(lines.slice(from, to)) && !NEGATION.test(folded.slice(from, to));
  return place(folded, segments, 0, 0, gapOk) ? segments : null;
}
const quoted = (quote: string, text: string) => segmentsIn(quote, text) !== null;

// An extractor quote states the value as the first number after the field's label, in the same
// segment, so a gap or a nearby word cannot join the label to an unrelated number (verifier M1,
// B1-2 F4). The label is the field's head noun, the last word before its first comma, parenthesis
// or preposition (the units and the method follow those), and its abbreviation, a one-word
// parenthetical without digits: 'Cockcroft-Gault creatinine clearance (CrCl), mL/min' gives
// clearance and crcl; 'eGFR (CKD-EPI 2021), mL/min/1.73 m2' gives egfr.
const WORDS = /[\p{L}\p{N}]+/gu;
function labelOf(field: string): string[] {
  const head = fold(field).split(/[,(]|\s(?:in|of|per|for|as|at|by)\s/)[0]!.match(WORDS) ?? [];
  const paren = /\(([^)]*)\)/.exec(fold(field))?.[1]?.match(WORDS) ?? [];
  return [...head.slice(-1), ...(paren.length === 1 && !/\p{N}/u.test(paren[0]!) ? paren : [])];
}
function firstAfterLabel(segment: string, labels: readonly string[], v: number): boolean {
  for (const m of segment.matchAll(WORDS)) {
    if (labels.includes(m[0]) && numbersIn(segment.slice(m.index + m[0].length))[0] === v) return true;
  }
  return false;
}

// Every number written in the quote.
const numbersIn = (quote: string): number[] => (quote.match(/\d[\d,]*(?:\.\d+)?|\.\d+/g) ?? []).flatMap((s) => {
  const n = canonicalNumber(s);
  return n === null ? [] : [n];
});

export interface JudgeOptions {
  client?: JudgeClient | null;
  cache?: readonly JudgeCacheEntry[];
  // The most live calls this grading may make (judgeCallBudget); unbounded when absent.
  maxCalls?: number;
  // The task's judge effort; default DEFAULT_JUDGE_EFFORT.
  effort?: JudgeEffort;
}

export class Judge {
  readonly #client: JudgeClient | null;
  readonly #cache: Map<string, JudgeCacheEntry>;
  readonly #regrade: boolean;
  // The entries this grading used, in order of first use.
  readonly #used = new Map<string, JudgeCacheEntry>();
  readonly #maxCalls: number;
  readonly #effort: JudgeEffort;
  #cost = 0;
  #live = 0;

  constructor(opts: JudgeOptions = {}) {
    this.#client = opts.client ?? null;
    this.#cache = new Map((opts.cache ?? []).map((e) => [e.key, e]));
    this.#regrade = this.#client === null && opts.cache !== undefined;
    this.#maxCalls = opts.maxCalls ?? Infinity;
    this.#effort = opts.effort ?? DEFAULT_JUDGE_EFFORT;
  }

  // What the live calls cost, as the ledger settled them.
  get costUsd(): number {
    return this.#cost;
  }

  // The API calls behind the answers this grading used, live or from the cache.
  get calls(): number {
    let n = 0;
    for (const e of this.#used.values()) n += e.calls;
    return n;
  }

  // Questions not sent because the allowance was reached.
  get overAllowance(): number {
    return [...this.#used.values()].filter((e) => e.error === ALLOWANCE_REACHED).length;
  }

  entries(): JudgeCacheEntry[] {
    return [...this.#used.values()];
  }

  async judge(q: JudgeQuestion): Promise<Verdict> {
    if (q.text.trim() === '') return { met: false, evidence: { reason: 'no text' } };
    const got = await this.#ask('judge', judgePrompt(q), q.text, validJudge);
    if (got === null) return { met: 'unknown', evidence: { reason: 'no judge' } };
    const { entry } = got;
    if (entry.answer === null) return { met: 'unknown', evidence: { reason: entry.error ?? 'invalid judge output', cache_key: entry.key } };
    const verdict = entry.answer.verdict as 'met' | 'not_met' | 'unknown';
    const quote = entry.answer.quote as string;
    const evidence = { verdict, quote, cache_key: entry.key };
    if (verdict === 'unknown') return { met: 'unknown', evidence: { ...evidence, reason: 'judge unknown' } };
    if ((verdict === 'met' || quote.trim() !== '') && !quoted(quote, q.text)) return { met: 'unknown', evidence: { ...evidence, reason: 'quote not in text' } };
    return { met: verdict === 'met', evidence };
  }

  async extract(q: ExtractQuestion): Promise<Extraction> {
    const re = new RegExp(q.pattern.source, q.pattern.flags.replace(/[gy]/g, ''));
    const m = re.exec(q.text);
    const value = m?.[1] === undefined ? null : canonicalNumber(m[1]);
    if (m && value !== null) return { value, quote: m[0], source: 'regex' };
    if (q.text.trim() === '') return { value: null, quote: '', source: 'none' };
    const got = await this.#ask('extract', extractPrompt(q), q.text, validExtract);
    if (got === null) return { value: 'unknown', quote: '', source: 'none', reason: 'no judge' };
    const { entry } = got;
    if (entry.answer === null) return { value: 'unknown', quote: '', source: 'llm', reason: entry.error ?? 'invalid judge output', cache_key: entry.key };
    const v = entry.answer.value as number | null;
    const quote = entry.answer.quote as string;
    const base = { quote, source: 'llm' as const, cache_key: entry.key };
    if (v === null) return { value: null, ...base };
    const segments = segmentsIn(quote, q.text);
    if (segments === null) return { value: 'unknown', ...base, reason: 'quote not in text' };
    if (!numbersIn(quote).some((n) => n === v)) return { value: 'unknown', ...base, reason: 'value not in quote' };
    const labels = labelOf(q.field);
    if (!segments.some((s) => firstAfterLabel(s, labels, v))) return { value: 'unknown', ...base, reason: 'value not first after its label' };
    return { value: v, ...base };
  }

  // The cached entry for this prompt and text, or a live answer cached now; null when there is
  // neither a client nor a cache. A live answer that fails `valid` is asked once more, within
  // the allowance. A client error is thrown as JudgeClientError and nothing is cached.
  async #ask(kind: JudgeCacheEntry['kind'], prompt: string, text: string, valid: (a: { [k: string]: Json }) => boolean): Promise<{ entry: JudgeCacheEntry } | null> {
    const key = await sha256Hex(JSON.stringify([MODEL, this.#effort, JUDGE_PROMPT_VERSION, prompt, text]));
    const cached = this.#used.get(key) ?? this.#cache.get(key);
    if (cached === undefined && this.#regrade) throw new JudgeCacheMiss(key);
    if (cached === undefined && this.#client === null) return null;
    const entry = cached ?? (await this.#send(key, kind, prompt, valid));
    this.#used.set(key, entry);
    return { entry };
  }

  async #send(key: string, kind: JudgeCacheEntry['kind'], prompt: string, valid: (a: { [k: string]: Json }) => boolean): Promise<JudgeCacheEntry> {
    const base = { key, kind, model: MODEL, effort: this.#effort, prompt_version: JUDGE_PROMPT_VERSION };
    const history: MessageParam[] = [{ role: 'user', content: prompt }];
    const params = paramsFor(this.#effort);
    const worst = worstCaseUsd(reserveRequest(history, params));
    if (worst > JUDGE_MAX_CALL_USD) return { ...base, answer: null, error: `${OVER_BUDGET}: worst case $${worst.toFixed(6)} > $${JUDGE_MAX_CALL_USD.toFixed(2)} per call`, calls: 0 };
    let calls = 0;
    while (calls < JUDGE_CALLS_PER_ITEM && this.#live < this.#maxCalls) {
      this.#live++;
      calls++;
      let result: CallResult;
      try {
        result = await this.#client!.send([...history], params, { onSettle: (usd) => (this.#cost += usd) });
      } catch (e) {
        throw new JudgeClientError(e);
      }
      const answer = result.refusal === null ? parseAnswer(result) : null;
      if (answer !== null && valid(answer)) return { ...base, answer, error: null, calls };
    }
    return { ...base, answer: null, error: calls === 0 ? ALLOWANCE_REACHED : 'invalid judge output', calls };
  }
}

// The judge calls a trial may make: two (the schema retry) per judge and hybrid item. The
// Judge enforces it at run time, whichever item makes the calls.
export const judgeCallBudget = (checks: readonly Check[]): number => JUDGE_CALLS_PER_ITEM * checks.filter((c) => c.kind === 'rubric' && c.method !== 'code').length;

// The projection allowance for a trial's judge calls when their requests are not known yet (a
// dry run): each at the per-call ceiling, JUDGE_MAX_CALL_USD.
export function judgeAllowanceUsd(checks: readonly Check[]): number {
  return judgeCallBudget(checks) * JUDGE_MAX_CALL_USD;
}

// A judge client whose every call runs under its own batch grant, opened at that call's worst
// case from its real request (body bytes and max_tokens, what the client reserves) and closed
// after it. batchStart checks PROJECTED_CAP_USD right then, and an open grant never holds
// more than the one call it covers. `client` builds the call's MessagesClient on the grant.
export function perCallGrantClient(opts: { ledger: Pick<Ledger, 'batchStart'>; client: (grant: BatchGrant) => JudgeClient; onGrant?: (projection: number) => void }): JudgeClient {
  return {
    async send(history, params, sendOpts) {
      const projection = worstCaseUsd(reserveRequest(history, params));
      const grant = await opts.ledger.batchStart(projection);
      opts.onGrant?.(projection);
      try {
        return await opts.client(grant).send(history, params, sendOpts);
      } finally {
        await grant.close();
      }
    },
  };
}
