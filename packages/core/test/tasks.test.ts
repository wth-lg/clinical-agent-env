// Task discovery through the injected TaskSource (plan phase P7): tasks are found by globbing
// tasks/*/task.toml, `all` skips _-prefixed directories outside test mode, an explicit id
// such as _toy always resolves, and there is no registry file.
import { describe, expect, it } from 'vitest';
import { tempDir, write } from '../../../scripts/test/helpers.ts';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { parseTask, taskSource, taskVersions, type TaskFiles } from '../tasks.ts';

const toml = (id: string) => `[task]\nid = "${id}"\ntitle = "Task ${id}"\nmax_turns = 12\n`;

function fixtureRoot(): string {
  const root = tempDir('tasks');
  for (const id of ['_toy', 'a', 'b']) {
    write(root, `${id}/task.toml`, toml(id));
    write(root, `${id}/instruction.md`, `Do ${id}.\n`);
  }
  write(root, 'notask/instruction.md', 'no task.toml here\n');
  return root;
}

describe('TaskSource over tasks/*/task.toml', () => {
  it('all() returns [a, b] outside test mode and [_toy, a, b] in test mode', async () => {
    const root = fixtureRoot();
    expect((await nodeTaskSource({ root, testMode: false }).all()).map((t) => t.id)).toEqual(['a', 'b']);
    expect((await nodeTaskSource({ root, testMode: true }).all()).map((t) => t.id)).toEqual(['_toy', 'a', 'b']);
  });

  it('an explicit _toy resolves outside test mode; an unknown id names the tasks', async () => {
    const source = nodeTaskSource({ root: fixtureRoot(), testMode: false });
    const toy = await source.get('_toy');
    expect(toy).toMatchObject({ id: '_toy', title: 'Task _toy', maxTurns: 12, instruction: 'Do _toy.\n' });
    await expect(source.get('nope')).rejects.toThrow(/no task 'nope'.*_toy, a, b/);
    await expect(source.get('notask')).rejects.toThrow(/no task 'notask'/);
  });

  it('the committed tasks/_toy resolves from the repo by default', async () => {
    const toy = await nodeTaskSource({ testMode: false }).get('_toy');
    expect(toy.id).toBe('_toy');
    expect(toy.tools).not.toBeNull();
    expect(toy.instruction.length).toBeGreaterThan(20);
  });

  it('parseTask reads [judge] effort: low, medium or high, default medium', async () => {
    const files = { 'instruction.md': 'Do it.\n' };
    expect((await parseTask({ id: 'a', files: { ...files, 'task.toml': toml('a') } })).judgeEffort).toBe('medium');
    expect((await parseTask({ id: 'a', files: { ...files, 'task.toml': `${toml('a')}[judge]\neffort = "high"\n` } })).judgeEffort).toBe('high');
    await expect(parseTask({ id: 'a', files: { ...files, 'task.toml': `${toml('a')}[judge]\neffort = "max"\n` } })).rejects.toThrow(/effort must be one of low, medium, high/);
  });

  it('parseTask checks the id and the fields; task_version covers the files and the world hash', async () => {
    const taskVersion = async (t: Awaited<ReturnType<typeof parseTask>>, world: string) => (await taskVersions(t, world)).task_version;
    const files = { 'task.toml': toml('a'), 'instruction.md': 'Do a.\n' };
    const a = await parseTask({ id: 'a', files });
    await expect(parseTask({ id: 'b', files })).rejects.toThrow(/id "a" .* directory b/);
    await expect(parseTask({ id: 'a', files: { 'task.toml': toml('a') } })).rejects.toThrow(/instruction\.md/);
    await expect(parseTask({ id: 'a', files: { ...files, 'task.toml': `${toml('a')}max_turns = 0\n` } })).rejects.toThrow();
    const edited = await parseTask({ id: 'a', files: { ...files, 'instruction.md': 'Do a!\n' } });
    expect(await taskVersion(a, 'h1')).not.toBe(await taskVersion(edited, 'h1'));
    expect(await taskVersion(a, 'h1')).not.toBe(await taskVersion(a, 'h2'));
    expect(await taskVersion(a, 'h1')).toBe(await taskVersion(await parseTask({ id: 'a', files: { 'instruction.md': 'Do a.\n', 'task.toml': toml('a') } }), 'h1'));
  });

  it('env_version covers what the agent sees and the world; grader_task_version covers every other file', async () => {
    const files = { 'task.toml': toml('a'), 'instruction.md': 'Do a.\n', 'policy/p.md': 'P\n', 'overlay.ts': 'o', 'tests/grader.ts': 'g', 'expected.ts': 'e', 'policy.ts': 'd', 'solution/solve.ts': 's', 'x.test.ts': 't' };
    const base = await taskVersions(await parseTask({ id: 'a', files }), 'h1');
    // task.toml changes by a table the agent works in (comments and layout change no version).
    const changed = async (path: keyof typeof files, world = 'h1') => taskVersions(await parseTask({ id: 'a', files: { ...files, [path]: path === 'task.toml' ? files[path].replace('max_turns = 12', 'max_turns = 13') : `${files[path]}\n` } }), world);
    for (const p of ['task.toml', 'instruction.md', 'policy/p.md', 'overlay.ts'] as const) {
      const v = await changed(p);
      expect([p, v.env_version !== base.env_version, v.grader_task_version === base.grader_task_version, v.task_version !== base.task_version]).toEqual([p, true, true, true]);
    }
    for (const p of ['tests/grader.ts', 'expected.ts', 'policy.ts', 'solution/solve.ts', 'x.test.ts'] as const) {
      const v = await changed(p);
      expect([p, v.env_version === base.env_version, v.grader_task_version !== base.grader_task_version, v.task_version !== base.task_version]).toEqual([p, true, true, true]);
    }
    const world = await taskVersions(await parseTask({ id: 'a', files }), 'h2');
    expect([world.env_version !== base.env_version, world.grader_task_version === base.grader_task_version]).toEqual([true, true]);
  });

  // P11f (6), verifier-phase-regrade-2 N2: [judge] and [matrix] only shape grading, so they belong
  // to grader_task_version; every other table of task.toml is what the agent works in.
  it('task.toml\'s [judge] and [matrix] count toward grader_task_version only; its other tables toward env_version only', async () => {
    const graded = `${toml('a')}tools = ["get_context", "finish"]\n[[catalog]]\nkind = "lab"\ncode = "2160-0"\nsystem = "http://loinc.org"\ndisplay = "Creatinine"\n[matrix]\ntraps = ["wrong_patient"]\n[judge]\neffort = "medium"\n`;
    const files = { 'task.toml': graded, 'instruction.md': 'Do a.\n' };
    const at = async (text: string) => taskVersions(await parseTask({ id: 'a', files: { ...files, 'task.toml': text } }), 'h1');
    const base = await at(graded);
    for (const [what, text] of [
      ['[judge] effort', graded.replace('effort = "medium"', 'effort = "high"')],
      ['[matrix] traps', graded.replace('traps = ["wrong_patient"]', 'traps = ["wrong_patient", "wrong_dose"]')],
      ['[matrix] status_only', graded.replace('[judge]', 'status_only = true\n[judge]')],
    ] as const) {
      const v = await at(text);
      expect([what, v.env_version === base.env_version, v.grader_task_version !== base.grader_task_version]).toEqual([what, true, true]);
    }
    for (const [what, text] of [
      ['[task] max_turns', graded.replace('max_turns = 12', 'max_turns = 13')],
      ['[task] tools', graded.replace('"get_context", "finish"', '"finish"')],
      ['[[catalog]] display', graded.replace('Creatinine', 'Creatinine, serum')],
    ] as const) {
      const v = await at(text);
      expect([what, v.env_version !== base.env_version, v.grader_task_version === base.grader_task_version]).toEqual([what, true, true]);
    }
    // Comments and layout are neither: the parsed tables decide.
    const comment = await at(`# a comment\n${graded.replace('[judge]', '\n[judge]')}`);
    expect([comment.env_version, comment.grader_task_version]).toEqual([base.env_version, base.grader_task_version]);
  });
});

describe('a TaskSource reads its task directories once', () => {
  // A run of many trials (the matrix, a batch) resolves the task for each one; a file that
  // changes under tasks/<id>/ mid-run must not give two trials of one run two task versions.
  it('get() and all() return the files as first read, whatever list() returns later', async () => {
    let reads = 0;
    const list = async (): Promise<TaskFiles[]> => {
      reads++;
      return [{ id: 'a', files: { 'task.toml': toml('a'), 'instruction.md': `Do a, read ${reads}.\n` } }];
    };
    const source = taskSource(list, { testMode: false });
    const first = await source.get('a');
    const again = await source.get('a');
    const [listed] = await source.all();
    expect(again.instruction).toBe(first.instruction);
    expect(again.filesHash).toBe(first.filesHash);
    expect(listed!.filesHash).toBe(first.filesHash);
    expect(reads).toBe(1);
  });

  it('reads again after a failed read', async () => {
    let reads = 0;
    const source = taskSource(async () => {
      if (++reads === 1) throw new Error('EMFILE');
      return [{ id: 'a', files: { 'task.toml': toml('a'), 'instruction.md': 'Do a.\n' } }];
    }, { testMode: false });
    await expect(source.get('a')).rejects.toThrow('EMFILE');
    expect((await source.get('a')).id).toBe('a');
  });
});

// plan-amendment-w5 G1 (W5-H): a task's lever items are toggled by tasks/<id>/expected.ts
// `export const LEVER = [...]`, the ids of the active items. The loader reads the literal list from
// the file's text, so every runtime (Node, the browser) hashes the same value, and env_version
// covers it: a toggle is a new env_version with no world rebuild. A task without LEVER is unchanged.
describe('expected.ts LEVER is loaded and env_version covers it (W5-H)', () => {
  const files = { 'task.toml': toml('a'), 'instruction.md': 'Do a.\n', 'overlay.ts': 'o' };
  const withExpected = (text: string) => parseTask({ id: 'a', files: { ...files, 'expected.ts': text } });
  const versions = async (text: string | null) => taskVersions(text === null ? await parseTask({ id: 'a', files }) : await withExpected(text), 'h1');

  it('reads the literal list, with a type annotation, comments, double quotes, a trailing comma or as const', async () => {
    expect((await parseTask({ id: 'a', files })).lever).toBeNull();
    expect((await withExpected('export const expected = { items: [] };\n')).lever).toBeNull();
    expect((await withExpected("export const LEVER = ['A', 'B'];\n")).lever).toEqual(['A', 'B']);
    expect((await withExpected('export const LEVER: readonly string[] = [\n  \'A\', // the routing defect\n  "B", /* the dial */\n];\n')).lever).toEqual(['A', 'B']);
    expect((await withExpected('export const LEVER = [] as const;\n')).lever).toEqual([]);
    expect((await withExpected("export const LEVER = ['A'] as const satisfies readonly string[];\n")).lever).toEqual(['A']);
  });

  it('follows a re-export from lever.ts, a file with no imports that overlay.ts and events.ts can read too', async () => {
    const both = (expected: string, lever: string | undefined) => parseTask({ id: 'a', files: { ...files, 'expected.ts': expected, ...(lever === undefined ? {} : { 'lever.ts': lever }) } });
    expect((await both("export { LEVER } from './lever.ts';\n", "export const LEVER: readonly string[] = ['A', 'B'];\n")).lever).toEqual(['A', 'B']);
    expect((await both('export { LEVER } from "./lever.ts"\n', "export const LEVER = [];\n")).lever).toEqual([]);
    await expect(both("export { LEVER } from './lever.ts';\n", undefined)).rejects.toThrow(/re-exports LEVER from \.\/lever\.ts, which does not exist/);
    await expect(both("export { LEVER } from './lever.ts';\n", 'export const LEVER = ACTIVE;\n')).rejects.toThrow(/tasks\/a\/lever\.ts: LEVER must be a literal list/);
    await expect(both("export { LEVER } from './lever.ts';\nexport const LEVER = ['A'];\n", "export const LEVER = ['A'];\n")).rejects.toThrow(/LEVER is declared twice/);
    await expect(both('export const expected = {};\n', "export const LEVER = ['A'];\n")).rejects.toThrow(/lever\.ts declares LEVER, and expected\.ts does not re-export it/);
    // The re-export and the literal hash the same env_version.
    const direct = await taskVersions(await withExpected("export const LEVER = ['A', 'B'];\n"), 'h1');
    const via = await taskVersions(await both("export { LEVER } from './lever.ts';\n", "export const LEVER = ['A', 'B'];\n"), 'h1');
    expect(via.env_version).toBe(direct.env_version);
  });

  it('env_version moves with the LEVER list and with nothing else in expected.ts; grader_task_version covers the file as before', async () => {
    const none = await versions(null);
    const noLever = await versions('export const expected = {};\n');
    const ab = await versions("export const expected = {};\nexport const LEVER = ['A', 'B'];\n");
    const a = await versions("export const expected = {};\nexport const LEVER = ['A'];\n");
    const abEdited = await versions("export const expected = { items: [] };\nexport const LEVER = ['A', 'B'];\n");
    // Without LEVER the env_version is what it was before LEVER existed (the file is grader-side).
    expect(noLever.env_version).toBe(none.env_version);
    expect(ab.env_version).not.toBe(noLever.env_version);
    expect(a.env_version).not.toBe(ab.env_version);
    expect(abEdited.env_version).toBe(ab.env_version);
    expect(abEdited.grader_task_version).not.toBe(ab.grader_task_version);
    expect(a.grader_task_version).not.toBe(ab.grader_task_version);
  });

  it('refuses a LEVER that is not one literal list of distinct string ids, naming the file', async () => {
    await expect(withExpected('export const LEVER = ACTIVE;\n')).rejects.toThrow(/tasks\/a\/expected\.ts: LEVER must be a literal list of string ids/);
    await expect(withExpected("export const LEVER = [A.id, 'B'];\n")).rejects.toThrow(/LEVER must be a literal list/);
    await expect(withExpected("export const LEVER = ['A', 'A'];\n")).rejects.toThrow(/LEVER names A twice/);
    await expect(withExpected("export const LEVER = ['A'];\nexport const LEVER = ['B'];\n")).rejects.toThrow(/LEVER is declared twice/);
    await expect(withExpected("export const LEVER = [''];\n")).rejects.toThrow(/LEVER must be a literal list/);
  });
});
