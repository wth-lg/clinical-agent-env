// The browser's reader of task.toml's [matrix] table (apps/web/src/tasks/matrix-declares.ts
// matrixDeclares) against the Node one (cli/matrix.ts: smol-toml, then declaresOf). The web bundle
// has no TOML parser, so the browser reads only the forms the tasks use; on every committed task
// the two must agree, or the Tasks view's in-tab oracle and matrix read a task wrong (or throw).
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { declaresOf } from '../../../packages/grader/matrix/matrix.ts';
import { matrixDeclares } from '../src/tasks/matrix-declares.ts';

const REPO = join(import.meta.dirname, '../../..');
const toml = (await import(pathToFileURL(createRequire(join(REPO, 'packages/core/package.json')).resolve('smol-toml')).href)) as { parse(text: string): Record<string, unknown> };
const nodeDeclares = (text: string) => declaresOf(toml.parse(text));

describe('matrixDeclares', () => {
  it('reads a one-line traps list and status_only', () => {
    const t = '[task]\nid = "x"\n\n[matrix]\ntraps = ["a", "b"] # two\nstatus_only = true\n';
    expect(matrixDeclares(t)).toEqual({ traps: ['a', 'b'], status_only: true });
    expect(matrixDeclares(t)).toEqual(nodeDeclares(t));
  });

  it('reads a traps list written over several lines, with comments and a trailing comma', () => {
    const t = [
      '[matrix]',
      'traps = [',
      '  "a", "b", # first row',
      '  # a whole-line comment',
      "  'c',",
      '  "d#e",',
      ']',
      'status_only = false',
      '',
      '[judge]',
      'effort = "medium"',
    ].join('\n');
    expect(matrixDeclares(t)).toEqual({ traps: ['a', 'b', 'c', 'd#e'], status_only: false });
    expect(matrixDeclares(t)).toEqual(nodeDeclares(t));
  });

  it('reads an empty list over two lines', () => {
    const t = '[matrix]\ntraps = [\n]\n';
    expect(matrixDeclares(t)).toEqual({ traps: [], status_only: false });
    expect(matrixDeclares(t)).toEqual(nodeDeclares(t));
  });

  it('throws on a list it cannot read, instead of reading it wrong', () => {
    expect(() => matrixDeclares('[matrix]\ntraps = [\n  "a",\n')).toThrow(/traps/);
    expect(() => matrixDeclares('[matrix]\ntraps = ["a", 1]\n')).toThrow(/traps/);
    expect(() => matrixDeclares('[matrix]\ntraps = ["a"] "b"\n')).toThrow(/traps/);
    expect(() => matrixDeclares('[matrix]\nother = 1\n')).toThrow(/cannot read/);
  });

  const TASKS = join(REPO, 'tasks');
  const ids = readdirSync(TASKS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && readdirSync(join(TASKS, d.name)).includes('task.toml'))
    .map((d) => d.name);

  it('finds the committed tasks', () => {
    expect(ids).toContain('crc-care-gap');
  });

  it.each(ids)('%s: the browser reads task.toml [matrix] as the CLI does', (id) => {
    const text = readFileSync(join(TASKS, id, 'task.toml'), 'utf8');
    expect(matrixDeclares(text)).toEqual(nodeDeclares(text));
  });
});
