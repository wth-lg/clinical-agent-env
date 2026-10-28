// pnpm cli probe --task <id|all> [--out <dir>] [--dry-run]
// One ambiguity probe per task (plan phase P17, PR22a): an agent with the task's read tools
// only (no write tool, no finish) reads the task's instruction, its policies and the world
// through those tools, and reports every ambiguity it finds as structured findings: a sentence
// of the instruction or a policy that reads two ways, a fact the work needs that is missing, or
// two sources that conflict. The prompt is prompts/probe.md, with the task's instruction in it.
// The probe runs through packages/core/run.ts like any trial, on a task whose tool list is cut
// to the read tools and whose instruction is that prompt, so the caps, the trajectory and the
// replay check are the trial's; it runs no check and no judge.
//   --out       results/probe by default: <task>.jsonl (the trajectory, the graded event last)
//               and <task>.json ({task_id, task_version, status, findings, problem, cost_usd,
//               trajectory}). A task whose <task>.json holds findings is not probed again and is
//               not projected; one whose findings are null is run again.
//   --dry-run   prints the projection (LIVE_PROJECTION_USD) and makes no call and opens nothing
// Projection: PER_TRIAL_CAP_USD per probe, the loop's cost cap (no judge item is graded). Every
// probe's client comes from one batchStart(projection) on the Node ledger, so the run is
// refused before any call when the ledger's exposure plus the projection would cross
// PROJECTED_CAP_USD.
// Findings: the probe's last answer must end with the JSON object prompts/probe.md asks for, as
// its last fenced block or its last JSON object (prose before it is fine); any other answer is
// kept as problem with the text, findings null, and the probe counts as failed.
// Exit 0 when every probe completed with valid findings (an empty list included); 1 otherwise;
// 2 on a usage error.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MessagesClient, MODEL, type Transport } from '../packages/core/anthropic.ts';
import { money, PER_TRIAL_CAP_USD } from '../packages/core/cost.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import type { TrialEvent } from '../packages/core/events.ts';
import { PROJECTED_CAP_USD, SpendRefused } from '../packages/core/ledger.ts';
import { redactText } from '../packages/core/redact.ts';
import { run } from '../packages/core/run.ts';
import type { Task, TaskSource } from '../packages/core/tasks.ts';
import { toJsonLine } from '../packages/core/trajectory.ts';
import { READ_TOOLS } from '../packages/env/tools/read/index.ts';
import { TOOLS } from '../packages/env/tools/write/index.ts';
import { nodeNow } from './adapters/clock-node.ts';
import { openNodeLedger } from './adapters/ledger-node.ts';
import { isTestMode, nodeTaskSource } from './adapters/tasks-node.ts';
import { TASK_ID } from './matrix.ts';
import { repoWorld } from './run.ts';

export const REPO = fileURLToPath(new URL('../', import.meta.url));
const USAGE = 'usage: pnpm cli probe --task <id|all> [--out <dir>] [--dry-run]';
const READ_NAMES = new Set(READ_TOOLS.map((t) => t.name));
export const FINDING_KINDS = ['two_readings', 'missing_fact', 'conflict'] as const;

export interface Deps {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  // The live transport.
  fetch: Transport;
  // Default every tasks/*/task.toml (with _-prefixed ones only in test mode).
  tasks?: TaskSource;
}

export interface Finding {
  kind: (typeof FINDING_KINDS)[number];
  source: string;
  quote: string;
  readings: string[];
  explanation: string;
}

// prompts/<name>.md with each {{key}} replaced by its value, in one pass, so a value that holds
// {{...}} itself is left as it is.
export function prompt(name: string, values: Record<string, string>): string {
  return readFileSync(join(REPO, 'prompts', `${name}.md`), 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k: string) => (Object.hasOwn(values, k) ? values[k]! : m));
}

// The names of the task's tools that only read: the probe's whole tool list.
export const readToolNames = (task: Task): string[] => TOOLS.map((t) => t.name).filter((n) => READ_NAMES.has(n) && (task.tools === null || task.tools.includes(n)));

// A TaskSource whose tasks are the given source's with `change` applied. taskVersions reads the
// file hashes, not these fields, so the record keeps the task's real versions.
export const changedSource = (tasks: TaskSource, change: (t: Task) => Task): TaskSource => ({
  all: async () => (await tasks.all()).map(change),
  get: async (id) => change(await tasks.get(id)),
});

// The tasks --task names: one by explicit id, or every task.
export async function selectTasks(tasks: TaskSource, id: string): Promise<Task[]> {
  return id === 'all' ? tasks.all() : [await tasks.get(id)];
}

// What a refused batchStart prints: the refusal names the projected cap and its sum.
export function refusal(command: string, e: unknown): string | null {
  return e instanceof SpendRefused ? `${command}: refused before any call (ledger + projection would pass PROJECTED_CAP_USD $${PROJECTED_CAP_USD}): ${e.message}` : null;
}

// The JSON value an answer ends with: its last fenced block, else its last JSON object (the
// text from the rightmost '{' that parses through the last '}'), so prose before it is fine.
function lastJson(text: string): { value: unknown } | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/g)].at(-1);
  if (fenced !== undefined) {
    try {
      return { value: JSON.parse(fenced[1]!) };
    } catch {
      // Not JSON: look for a bare object instead.
    }
  }
  const end = text.lastIndexOf('}');
  for (let i = text.lastIndexOf('{', end); i >= 0; i = text.lastIndexOf('{', i - 1)) {
    try {
      return { value: JSON.parse(text.slice(i, end + 1)) };
    } catch {
      // A '{' inside the object, or in prose: try the one before it.
    }
    if (i === 0) break;
  }
  return null;
}

// The probe's findings from its last answer, or the reason they are not valid.
export function findingsOf(events: readonly TrialEvent[]): { findings: Finding[] } | { problem: string } {
  const last = events.findLast((e) => e.type === 'response');
  if (last === undefined) return { problem: 'no answer' };
  const text = last.content.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('').trim();
  const found = lastJson(text);
  if (found === null) return { problem: `the last answer is not the findings JSON: ${JSON.stringify(text.slice(0, 200))}` };
  const parsed = found.value;
  const findings = (parsed as { findings?: unknown } | null)?.findings;
  if (!Array.isArray(findings)) return { problem: 'the last answer has no findings list' };
  const str = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  for (const [i, f] of findings.entries()) {
    const x = f as Partial<Finding> | null;
    const ok = x !== null && typeof x === 'object' && (FINDING_KINDS as readonly unknown[]).includes(x.kind) && str(x.source) && str(x.quote) && str(x.explanation) && Array.isArray(x.readings) && x.readings.every(str) && (x.kind === 'missing_fact' || x.readings.length >= 2);
    if (!ok) return { problem: `finding ${i + 1} does not have the shape prompts/probe.md asks for: ${JSON.stringify(f).slice(0, 200)}` };
  }
  return { findings: findings as Finding[] };
}

// A probe is recorded when its <task>.json holds valid findings; one without is run again.
function recorded(file: string): boolean {
  if (!existsSync(file)) return false;
  try {
    return (JSON.parse(readFileSync(file, 'utf8')) as { findings?: unknown }).findings != null;
  } catch {
    return false;
  }
}

export async function main(args: string[], deps: Deps): Promise<number> {
  let id: string | undefined;
  let outArg: string | undefined;
  let dry = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--dry-run') dry = true;
    else if (a === '--task' && args[i + 1] !== undefined) id = args[++i];
    else if (a === '--out' && args[i + 1] !== undefined) outArg = args[++i];
    else return usage(deps, a === '--task' || a === '--out' ? `${a} needs a value` : `unknown argument ${a}`);
  }
  if (id === undefined) return usage(deps, '--task is required');
  if (id !== 'all' && !TASK_ID.test(id)) return usage(deps, `--task ${JSON.stringify(id)} is not a task id (letters, digits, _ and - only)`);
  const source = deps.tasks ?? nodeTaskSource({ testMode: isTestMode(deps.env) });
  let tasks: Task[];
  try {
    tasks = await selectTasks(source, id);
  } catch (e) {
    return usage(deps, `--task: ${(e as Error).message}`);
  }
  if (tasks.length === 0) {
    deps.out(`probe: no tasks (--task ${id} names none)`);
    return 1;
  }
  const outDir = resolve(outArg ?? join(REPO, 'results/probe'));
  const todo = tasks.filter((t) => {
    const done = recorded(join(outDir, `${t.id}.json`));
    if (done) deps.out(`probe ${t.id}: already recorded in ${join(outDir, `${t.id}.json`)}; not run again`);
    return !done;
  });
  const p = todo.length * PER_TRIAL_CAP_USD;
  if (dry) {
    for (const t of todo) deps.out(`probe dry run: ${t.id}: 1 probe with ${readToolNames(t).length} read tools, per-trial cap ${money(PER_TRIAL_CAP_USD)}`);
    deps.out(`projection ${money(p)}`);
    deps.out(`LIVE_PROJECTION_USD=${p.toFixed(6)}`);
    return 0;
  }
  if (todo.length === 0) return 0;
  const key = deps.env.ANTHROPIC_API_KEY ?? '';
  if (key === '') {
    deps.out('probe: ANTHROPIC_API_KEY is not set');
    return 1;
  }
  const probeSource = changedSource(source, (t) => ({ ...t, tools: readToolNames(t), instruction: prompt('probe', { task_id: t.id, instruction: t.instruction }) }));
  let failed = 0;
  try {
    const { ledger, mode, path } = openNodeLedger({ transport: 'live', env: deps.env });
    deps.out(`ledger ${mode} ${path}`);
    const grant = await ledger.batchStart(p);
    try {
      mkdirSync(outDir, { recursive: true });
      for (const t of todo) {
        const label = `probe:${t.id}`;
        const trajectory = join(outDir, `${t.id}.jsonl`);
        writeFileSync(trajectory, '');
        const client = new MessagesClient({ grant, ledger, apiKey: key, fetch: deps.fetch, trial: label, log: (l) => deps.out(l) });
        const { record, events } = await run(t.id, MODEL, { tasks: probeSource, client, judge: null, now: nodeNow, trialId: label, ...repoWorld(), onEvent: (e) => appendFileSync(trajectory, toJsonLine(e)) });
        const got = record.status === 'COMPLETED' ? findingsOf(events) : { problem: `the probe ended ${record.status}${record.detail ? ` (${record.detail})` : ''}` };
        const findings = 'findings' in got ? got.findings : null;
        const problem = 'problem' in got ? redactText(got.problem, [key]) : null;
        writeFileSync(join(outDir, `${t.id}.json`), `${JSON.stringify({ task_id: t.id, task_version: record.task_version, status: record.status, findings, problem, cost_usd: record.cost_usd, trajectory: `${t.id}.jsonl` }, null, 2)}\n`);
        if (findings === null) failed++;
        deps.out(`probe ${t.id}: ${findings === null ? `no findings: ${problem}` : `${findings.length} finding${findings.length === 1 ? '' : 's'}`}, ${record.turns} turns, ${record.tool_calls} tool calls, cost ${money(record.cost_usd)}`);
      }
    } finally {
      await grant.close();
    }
  } catch (e) {
    deps.out(refusal('probe', e) ?? `probe: ${redactText((e as Error).message, [key])}`);
    return 1;
  }
  return failed === 0 ? 0 : 1;
}

function usage(deps: Deps, problem: string): number {
  deps.out(`probe: ${problem}\n${USAGE}`);
  return 2;
}

const defaults: Deps = { env: process.env, out: (l) => process.stdout.write(`${l}\n`), fetch: (request) => fetch(request) };

export default (args: string[]) => main(args, defaults);

// Run as a script, it installs the egress guard first (pnpm cli probe gets it from cli/index.ts);
// imported by tests, it leaves the importer's globals alone.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2), defaults);
}
