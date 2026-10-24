// Every grader check id of every task matches `[A-Za-z][A-Za-z0-9_]*` (plan standing rule "Check
// ids", P11f (10)): the format the U31 reason pattern in docs/requirements/ui-contract.md matches,
// so the reason the UI shows for a failed check always matches it. A check id outside the format
// fails here, naming its task and id.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { repoRoot } from './helpers.ts';

const ID_CLASS = '[A-Za-z][A-Za-z0-9_]*';
const CHECK_ID = new RegExp(`^${ID_CLASS}$`);
const TASKS = join(repoRoot, 'tasks');
const graders = readdirSync(TASKS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(TASKS, d.name, 'tests', 'grader.ts')))
  .map((d) => d.name)
  .sort();

describe('check id format', () => {
  it('is the class the contract\'s U31 reason pattern names', () => {
    const contract = readFileSync(join(repoRoot, 'docs/requirements/ui-contract.md'), 'utf8');
    expect(contract).toContain(`\`\\b(?:${ID_CLASS} failed: expected`);
    expect(contract).toContain(`matches \`${ID_CLASS}\``);
    for (const id of ['G1', 'note_on_patient', 'apixaban_dose']) expect(id).toMatch(CHECK_ID);
    for (const id of ['9bad-id', 'bad-id', '_lead', 'has space', '']) expect(id).not.toMatch(CHECK_ID);
  });

  it('finds every task with a grader', () => expect(graders).toContain('renal-dose-review'));

  it.each(graders)('every check id of %s matches it', async (task) => {
    const { checks } = (await import(pathToFileURL(join(TASKS, task, 'tests', 'grader.ts')).href)) as { checks: Array<{ id: string }> };
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.map((c) => c.id).filter((id) => !CHECK_ID.test(id)), `tasks/${task}/tests/grader.ts`).toEqual([]);
  });
});
