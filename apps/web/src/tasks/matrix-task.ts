// A task's grader validation inputs in the browser (packages/grader/matrix/types.ts MatrixTask),
// as cli/matrix.ts loadMatrixTask builds them in Node: the task modules come from Vite's
// import.meta.glob, the judge cache and task.toml as text. Used by the validation Worker and by
// the Tasks view, which lists each task's checks.
import { browserTaskSource } from '../adapters/tasks-browser.ts';
import type { Check, Json } from '../../../../packages/grader/check.ts';
import type { JudgeCacheEntry } from '../../../../packages/grader/judge.ts';
import type { Agents, Alternative, Declares, MatrixTask, Mutant, Script, WorldView } from '../../../../packages/grader/matrix/types.ts';

const MODULES = import.meta.glob<Record<string, unknown>>([
  '../../../../tasks/*/tests/{grader,alternatives,mutants,agents}.ts',
  '../../../../tasks/*/solution/solve.ts',
  '../../../../tasks/*/{expected,policy}.ts',
]);
const TEXT = import.meta.glob<string>(['../../../../tasks/*/task.toml', '../../../../tasks/*/tests/judge-cache.json'], { query: '?raw', import: 'default', eager: true });

const path = (id: string, rel: string) => `../../../../tasks/${id}/${rel}`;

async function exported<T>(id: string, rel: string, name: string, fallback: T): Promise<T> {
  const load = MODULES[path(id, rel)];
  if (load === undefined) return fallback;
  const mod = await load();
  if (!(name in mod)) throw new Error(`tasks/${id}/${rel} does not export ${name}`);
  return mod[name] as T;
}

// A TOML array of strings at the start of src: one line or several, with comments, basic ("…")
// or literal ('…') strings and an optional trailing comma. Returns the strings and the length of
// src it read; throws on anything else, such as a number or a list that never closes.
function readStringList(src: string): { list: string[]; end: number } {
  const bad = () => new Error('task.toml [matrix] traps must be a list of strings');
  let i = 0;
  const skip = () => {
    for (;;) {
      const gap = /^(?:\s+|#[^\n]*)/.exec(src.slice(i));
      if (gap === null) return;
      i += gap[0].length;
    }
  };
  if (src[i] !== '[') throw bad();
  i++;
  const list: string[] = [];
  for (;;) {
    skip();
    if (src[i] === ']') return { list, end: i + 1 };
    const s = /^(?:"((?:[^"\\\n]|\\.)*)"|'([^'\n]*)')/.exec(src.slice(i));
    if (s === null) throw bad();
    list.push(s[2] ?? (JSON.parse(`"${s[1]!}"`) as string));
    i += s[0].length;
    skip();
    if (src[i] === ',') i++;
    else if (src[i] !== ']') throw bad();
  }
}

// task.toml's [matrix] table, read the way declaresOf (packages/grader/matrix/matrix.ts) reads it:
// traps, a list of strings on one line or several, and status_only. The TOML parser is not a web
// dependency, so this reads only those forms and throws on anything else in the table, so a task
// written another way fails here instead of being read wrong. apps/web/test/matrix-declares.test.ts
// holds every committed task.toml to the CLI's reading.
export function matrixDeclares(toml: string): Declares {
  let traps: string[] = [];
  let status_only = false;
  let inMatrix = false;
  const lines = toml.split('\n');
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!.replace(/\s+#.*$/, '').trim();
    if (line.startsWith('[')) {
      inMatrix = line === '[matrix]';
      continue;
    }
    if (!inMatrix || line === '' || line.startsWith('#')) continue;
    const m = /^(traps|status_only)\s*=\s*(.+)$/.exec(line);
    if (m?.[1] === 'traps') {
      // The list may run over the lines after this one; read from the raw text after '='.
      const rest = [lines[n]!.slice(lines[n]!.indexOf('=') + 1).trimStart(), ...lines.slice(n + 1)].join('\n');
      const { list, end } = readStringList(rest);
      const nl = rest.indexOf('\n', end);
      if (!/^\s*(?:#.*)?$/.test(rest.slice(end, nl === -1 ? undefined : nl))) throw new Error('task.toml [matrix] traps must be a list of strings');
      traps = list;
      n += rest.slice(0, end).split('\n').length - 1;
    } else if (m?.[1] === 'status_only' && (m[2] === 'true' || m[2] === 'false')) status_only = m[2] === 'true';
    else throw new Error(`task.toml [matrix]: cannot read ${JSON.stringify(line)} in the browser`);
  }
  return { traps, status_only };
}

// The reference solution: solution/solve.ts's oracle script, or null when the task has none.
export async function taskOracle(id: string): Promise<Script | null> {
  return exported<Script | null>(id, 'solution/solve.ts', 'oracle', null);
}

export async function taskChecks(id: string): Promise<Check[]> {
  return exported<Check[]>(id, 'tests/grader.ts', 'checks', []);
}

export async function loadMatrixTask(id: string): Promise<MatrixTask> {
  const task = await browserTaskSource({ testMode: true }).get(id);
  const toml = TEXT[path(id, 'task.toml')] ?? '';
  const cache = TEXT[path(id, 'tests/judge-cache.json')];
  const agentsLoad = MODULES[path(id, 'tests/agents.ts')];
  return {
    id,
    instruction: task.instruction,
    policies: task.policies.map((p) => ({ id: p.id, text: p.text })),
    declares: matrixDeclares(toml),
    checks: await taskChecks(id),
    oracle: await exported<Script | null>(id, 'solution/solve.ts', 'oracle', null),
    alternatives: await exported<Alternative[]>(id, 'tests/alternatives.ts', 'alternatives', []),
    mutants: await exported<Mutant[]>(id, 'tests/mutants.ts', 'mutants', []),
    agents: agentsLoad ? ((await agentsLoad()) as Agents) : {},
    expected: await exported<Json | undefined>(id, 'expected.ts', 'expected', undefined),
    derive: await exported<((w: WorldView) => Json) | undefined>(id, 'policy.ts', 'derive', undefined),
    cache: cache === undefined ? [] : (JSON.parse(cache) as JudgeCacheEntry[]),
    judgeEffort: task.judgeEffort,
  };
}
