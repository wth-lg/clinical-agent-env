// A task whose rubric item declares a judge_questions that is not a whole number >= 0 does not
// load (verifier-phase-P17i-GRADER16-193-1 F4): NaN read as a judge budget of NaN, so the
// grading made no judge call and every judged item read unknown; a negative count took from the
// other items' allowance; a fraction was accepted. Each case is the toy task with its first judge
// item's declaration replaced, in a task root whose modules re-export the real toy's.
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../adapters/tasks-node.ts';
import { loadMatrixTask } from '../matrix.ts';

const TASKS = fileURLToPath(new URL('../../tasks/', import.meta.url));
const TOY = join(TASKS, '_toy');
const roots: string[] = [];

// A task root holding a copy of the toy whose .ts modules re-export the real ones, and whose
// tests/grader.ts sets judge_questions on the first judge item to `declared`.
function toyRoot(declared: string): string {
  const root = mkdtempSync(join(tmpdir(), 'task-load-jq-'));
  roots.push(root);
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const src = join(dir, name);
      const dst = join(root, '_toy', relative(TOY, src));
      if (statSync(src).isDirectory()) {
        mkdirSync(dst, { recursive: true });
        walk(src);
      } else if (name.endsWith('.ts')) writeFileSync(dst, `export * from '${pathToFileURL(src).href}';\n`);
      else copyFileSync(src, dst);
    }
  };
  mkdirSync(join(root, '_toy'), { recursive: true });
  walk(TOY);
  writeFileSync(join(root, '_toy/tests/grader.ts'), [
    `import { checks as real } from '${pathToFileURL(join(TOY, 'tests/grader.ts')).href}';`,
    `const at = real.findIndex((c) => c.kind === 'rubric' && c.method === 'judge');`,
    `export const checks = real.map((c, i) => (i === at ? { ...c, judge_questions: ${declared} } : c));`,
  ].join('\n'));
  return root;
}

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe('task load: judge_questions', () => {
  it('loads the toy with a whole-number declaration, 0 included', async () => {
    for (const ok of ['0', '3']) {
      const root = toyRoot(ok);
      const t = await loadMatrixTask('_toy', root, nodeTaskSource({ root, testMode: true }));
      expect(t.checks.some((c) => c.kind === 'rubric' && c.judge_questions === Number(ok))).toBe(true);
    }
  });

  it.each(['Number.NaN', '-5', '2.5', 'Infinity'])('rejects judge_questions %s, naming the item', async (bad) => {
    const root = toyRoot(bad);
    await expect(loadMatrixTask('_toy', root, nodeTaskSource({ root, testMode: true }))).rejects.toThrow(/: judge_questions must be a whole number >= 0, got /);
  });
});
