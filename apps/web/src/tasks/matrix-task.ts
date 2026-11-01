// A task's grader validation inputs in the browser (packages/grader/matrix/types.ts MatrixTask),
// as cli/matrix.ts loadMatrixTask builds them in Node: the task modules come from Vite's
// import.meta.glob, the judge cache and task.toml as text. Used by the validation Worker and by
// the Tasks view, which lists each task's checks.
import { browserTaskSource } from '../adapters/tasks-browser.ts';
import type { Check, Json } from '../../../../packages/grader/check.ts';
import type { JudgeCacheEntry } from '../../../../packages/grader/judge.ts';
import type { Agents, Alternative, MatrixTask, Mutant, Script, WorldView } from '../../../../packages/grader/matrix/types.ts';
import { matrixDeclares } from './matrix-declares.ts';

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
    events: task.events,
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
