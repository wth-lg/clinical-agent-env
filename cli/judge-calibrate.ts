// pnpm cli judge-calibrate --task <id|all> [--dry-run]
// Live judge calibration (plan phase P11c): asks every key of tasks/<id>/tests/judge-cache.json
// live, once, compares each live answer with the scripted one and writes
// results/judge-calibration/<id>.json. It never writes the cache; a disagreement is fixed in
// the cache or the judge prompt by hand, with a grader version bump, and asked again.
//   The cache keeps answers, not questions, so each key's question is found the way
//   `oracle --live-judge` finds its projection: every matrix case of the task is run once and
//   graded with a Judge whose client sends nothing and answers "unknown". A cache key no case
//   asks cannot be asked; it is listed as a disagreement.
//   live        one batch per task: batchStart(that task's projection) on the Node ledger, so
//               batchStart refuses with 0 calls when its exposure plus the projection would
//               cross PROJECTED_CAP_USD; a MessagesClient on the grant and one Judge ask each
//               key in key order. The oracle case is then graded from the live answers alone
//               (no further call). Two answers agree when the judge verdicts, or the extracted
//               values, are equal; quotes may differ.
//   --dry-run   prints each task's projection and LIVE_PROJECTION_USD, makes no call and opens
//               nothing. Projection: each key a case asks, priced at its worst case from its real
//               body and max_tokens, times JUDGE_CALLS_PER_ITEM (the schema retry).
// `all` is every task (with _-prefixed ones only in test mode). Exit 0 when every task's keys
// all agree and its oracle is PASS with score 1.0 and no judge item unknown; 1 otherwise (the
// calibration file is still written), or when a call fails (nothing is written for that task);
// 2 on a usage error.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MessagesClient, MODEL, reserveRequest, type CallResult, type Transport } from '../packages/core/anthropic.ts';
import { money, worstCaseUsd } from '../packages/core/cost.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import { redactText } from '../packages/core/redact.ts';
import type { Json } from '../packages/grader/check.ts';
import type { Grade } from '../packages/grader/grade.ts';
import { Judge, JUDGE_CALLS_PER_ITEM, JUDGE_PROMPT_VERSION, type ExtractQuestion, type Extraction, type JudgeCacheEntry, type JudgeClient, type JudgeQuestion } from '../packages/grader/judge.ts';
import { cases, gradeRunWith, trial, type CaseRun, type MatrixEnv } from '../packages/grader/matrix/matrix.ts';
import type { MatrixTask } from '../packages/grader/matrix/types.ts';
import { nodeNow } from './adapters/clock-node.ts';
import { openNodeLedger } from './adapters/ledger-node.ts';
import { isTestMode, nodeTaskSource } from './adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv, TASK_ID } from './matrix.ts';

const USAGE = 'usage: pnpm cli judge-calibrate --task <id|all> [--dry-run]';
const RESULTS_DIR = fileURLToPath(new URL('../results/judge-calibration/', import.meta.url));

export interface Deps {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  // The live transport.
  fetch: Transport;
  // A task's matrix inputs; default loadMatrixTask.
  load?: (task: string) => Promise<MatrixTask>;
  // Where the calibration goes; default results/judge-calibration/<id>.json.
  writeResult?: (task: string, c: Calibration) => void;
}

type Answer = JudgeCacheEntry['answer'];

export interface Disagreement {
  key: string;
  kind: JudgeCacheEntry['kind'];
  scripted: Answer;
  live: Answer;
  live_error: string | null;
  reason: 'answers differ' | 'no matrix case asks this key';
}

// The fields of the T1 calibration record (results/judge-calibration/renal-dose-review.json).
export interface Calibration {
  task: string;
  model: string;
  effort: string;
  prompt_version: string;
  at: string;
  // Keys in the task's cache.
  questions: number;
  // Cache keys that got a live answer.
  same_keys: number;
  agree: number;
  calls: number;
  // Settle rows of the task's batch in the ledger.
  ledger_settles: number;
  cost_usd: number;
  usd_per_call: number;
  oracle: { outcome: string | null; score: number | null; judge_unknown: number };
  disagreements: Disagreement[];
  note: string;
  live_entries: JudgeCacheEntry[];
}

const writeResultFile = (task: string, c: Calibration) => {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, `${task}.json`), `${JSON.stringify(c, null, 2)}\n`);
};

type Question = { kind: 'judge'; q: JudgeQuestion } | { kind: 'extract'; q: ExtractQuestion };

// A Judge that notes each question it sends and that request's worst case, by cache key.
class RecordingJudge extends Judge {
  readonly questions = new Map<string, Question & { worst: number }>();
  readonly #worst: number[];

  constructor(effort: MatrixTask['judgeEffort']) {
    const worst: number[] = [];
    super({ client: recordingClient(worst), effort });
    this.#worst = worst;
  }

  override async judge(q: JudgeQuestion) {
    const sent = this.#worst.length;
    const v = await super.judge(q);
    this.#note(v.evidence.cache_key, { kind: 'judge', q }, sent);
    return v;
  }

  override async extract(q: ExtractQuestion): Promise<Extraction> {
    const sent = this.#worst.length;
    const x = await super.extract(q);
    this.#note(x.cache_key, { kind: 'extract', q }, sent);
    return x;
  }

  // A key asked before was sent then; one over the per-call ceiling is never sent and costs 0.
  #note(key: Json | undefined, question: Question, sent: number) {
    if (typeof key !== 'string' || this.questions.has(key)) return;
    this.questions.set(key, { ...question, worst: this.#worst.length > sent ? this.#worst.at(-1)! : 0 });
  }
}

// A judge client that sends nothing: it records each request's worst case and answers
// "unknown", which is a valid judge and extractor answer, so no question is retried.
function recordingClient(worst: number[]): JudgeClient {
  return {
    async send(history, params): Promise<CallResult> {
      worst.push(worstCaseUsd(reserveRequest(history, params)));
      const content = [{ type: 'text', text: JSON.stringify({ verdict: 'unknown', value: null, quote: '' }) }];
      return { status: 200, message: { id: `msg_plan_${worst.length}`, model: MODEL, role: 'assistant', content, stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } }, refusal: null, attempts: 1 };
    },
  };
}

interface Plan {
  task: MatrixTask;
  oracle: CaseRun | null;
  // The cache keys a case asks, in key order, with their questions.
  asked: Array<{ key: string } & Question>;
  usd: number;
}

// Runs every case once and finds the question behind each cache key, sending nothing.
async function plan(env: MatrixEnv, task: MatrixTask): Promise<Plan> {
  const judge = new RecordingJudge(task.judgeEffort);
  let oracle: CaseRun | null = null;
  for (const c of cases(task)) {
    const run = await trial(env, task, c);
    if (c.kind === 'oracle') oracle = run;
    await gradeRunWith(env, task, run, judge);
  }
  const asked = task.cache.map((e) => e.key).sort().flatMap((key) => {
    const q = judge.questions.get(key);
    return q === undefined ? [] : [{ key, ...q }];
  });
  const usd = JUDGE_CALLS_PER_ITEM * asked.reduce((s, a) => s + judge.questions.get(a.key)!.worst, 0);
  return { task, oracle, asked, usd };
}

const unknownOf = (g: Grade) => g.checks.filter((r) => r.method !== 'code' && r.met === 'unknown').length;

// Judge answers agree on the verdict, extractions on the value; quotes may differ. A live call
// with no answer (refused, invalid twice) never agrees, whatever the cache holds.
function agrees(kind: JudgeCacheEntry['kind'], scripted: Answer, live: Answer): boolean {
  if (scripted === null || live === null) return false;
  return kind === 'judge' ? scripted.verdict === live.verdict : scripted.value === live.value;
}

const round6 = (x: number) => Number(x.toFixed(6));

export async function main(args: string[], deps: Deps): Promise<number> {
  let id: string | undefined;
  let dry = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--dry-run') dry = true;
    else if (a === '--task' && args[i + 1] !== undefined) id = args[++i];
    else return usage(deps, a === '--task' ? '--task needs a value' : `unknown argument ${a}`);
  }
  if (id === undefined) return usage(deps, '--task is required');
  if (id !== 'all' && !TASK_ID.test(id)) return usage(deps, `--task ${JSON.stringify(id)} is not a task id (letters, digits, _ and - only)`);
  const key = deps.env.ANTHROPIC_API_KEY ?? '';
  if (!dry && key === '') {
    deps.out('judge-calibrate: ANTHROPIC_API_KEY is not set');
    return 1;
  }
  let tasks: MatrixTask[];
  try {
    const ids = id === 'all' ? (await nodeTaskSource({ testMode: isTestMode(deps.env) }).all()).map((t) => t.id) : [id];
    tasks = await Promise.all(ids.map((t) => (deps.load ?? loadMatrixTask)(t)));
  } catch (e) {
    return usage(deps, `--task: ${(e as Error).message}`);
  }
  if (tasks.length === 0) {
    deps.out(`judge-calibrate: no tasks (--task ${id} names none${id === 'all' ? '; _-prefixed tasks count only in test mode' : ''})`);
    return 1;
  }

  const env = matrixEnv();
  const plans: Plan[] = [];
  for (const t of tasks) plans.push(await plan(env, t));
  if (dry) {
    for (const { task, asked, usd } of plans) {
      deps.out(`judge-calibrate dry run: ${task.id}: ${task.cache.length} cache keys, ${asked.length} asked by the matrix cases x ${JUDGE_CALLS_PER_ITEM} calls, worst case ${money(usd)}`);
    }
    const p = plans.reduce((s, x) => s + x.usd, 0);
    deps.out(`projection ${money(p)}`);
    deps.out(`LIVE_PROJECTION_USD=${p.toFixed(6)}`);
    return 0;
  }

  let ok = true;
  try {
    const { ledger, store, mode, path } = openNodeLedger({ transport: 'live', env: deps.env });
    deps.out(`ledger ${mode} ${path}`);
    for (const { task, oracle, asked, usd } of plans) {
      const grant = await ledger.batchStart(usd);
      let judge: Judge;
      try {
        const client = new MessagesClient({ grant, ledger, apiKey: key, fetch: deps.fetch, trial: `judge-calibrate:${task.id}`, log: (l) => deps.out(l) });
        judge = new Judge({ client, maxCalls: JUDGE_CALLS_PER_ITEM * asked.length, effort: task.judgeEffort });
        for (const a of asked) {
          if (a.kind === 'judge') await judge.judge(a.q);
          else await judge.extract(a.q);
        }
      } finally {
        await grant.close();
      }
      const at = new Date(nodeNow()).toISOString();
      const live = new Map(judge.entries().map((e) => [e.key, { ...e, provenance: { source: 'live' as const, model: e.model, at } }]));
      const cached = new Set(task.cache.map((e) => e.key));
      const disagreements: Disagreement[] = [];
      let agree = 0;
      for (const e of [...task.cache].sort((a, b) => (a.key < b.key ? -1 : 1))) {
        const l = live.get(e.key);
        if (l === undefined) disagreements.push({ key: e.key, kind: e.kind, scripted: e.answer, live: null, live_error: null, reason: 'no matrix case asks this key' });
        else if (agrees(e.kind, e.answer, l.answer)) agree++;
        else disagreements.push({ key: e.key, kind: e.kind, scripted: e.answer, live: l.answer, live_error: l.error, reason: 'answers differ' });
      }
      // The oracle graded from the live answers alone: a key it needs and no live answer has is a miss.
      const g = oracle === null ? null : await gradeRunWith(env, task, oracle, new Judge({ cache: [...live.values()], effort: task.judgeEffort }));
      const settles = (await store.read()).filter((r) => r.kind === 'settle' && r.batch_id === grant.batch_id).length;
      const c: Calibration = {
        task: task.id,
        model: MODEL,
        effort: task.judgeEffort,
        prompt_version: JUDGE_PROMPT_VERSION,
        at,
        questions: task.cache.length,
        same_keys: [...live.keys()].filter((k) => cached.has(k)).length,
        agree,
        calls: judge.calls,
        ledger_settles: settles,
        cost_usd: round6(judge.costUsd),
        usd_per_call: judge.calls === 0 ? 0 : round6(judge.costUsd / judge.calls),
        oracle: { outcome: g?.outcome ?? null, score: g?.score ?? null, judge_unknown: g === null ? 0 : unknownOf(g) },
        disagreements,
        note: `Live judge answers (pnpm cli judge-calibrate) vs the task's cache. tests/judge-cache.json is not written by this command; this file is the calibration record. Ledger batch ${grant.batch_id}.`,
        live_entries: [...live.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
      };
      (deps.writeResult ?? writeResultFile)(task.id, c);
      const passed = c.oracle.outcome === 'PASS' && c.oracle.score === 1 && c.oracle.judge_unknown === 0;
      deps.out(`judge-calibrate ${task.id}: ${agree} of ${c.questions} agree, ${c.calls} calls, ${money(c.cost_usd)}; oracle ${c.oracle.outcome ?? 'none'} score ${c.oracle.score ?? 'n/a'} judge.unknown ${c.oracle.judge_unknown}`);
      for (const d of disagreements) deps.out(`  - ${d.key} ${d.kind}: ${d.reason}: scripted ${JSON.stringify(d.scripted)}, live ${JSON.stringify(d.live)}${d.live_error ? ` (${d.live_error})` : ''}`);
      if (g?.error) deps.out(`  - oracle ${g.outcome} in ${g.error.check ?? 'trial'}: ${redactText(g.error.message, [key])}`);
      if (disagreements.length > 0 || !passed) ok = false;
    }
  } catch (e) {
    deps.out(`judge-calibrate: ${redactText((e as Error).message, [key])}`);
    return 1;
  }
  return ok ? 0 : 1;
}

function usage(deps: Deps, problem: string): number {
  deps.out(`judge-calibrate: ${problem}\n${USAGE}`);
  return 2;
}

const defaults: Deps = { env: process.env, out: (l) => process.stdout.write(`${l}\n`), fetch: (request) => fetch(request) };

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args, defaults);
};

// Run as a script, it installs the egress guard first (pnpm cli judge-calibrate gets it from
// cli/index.ts too); imported by tests, it leaves the importer's globals alone.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2), defaults);
}
