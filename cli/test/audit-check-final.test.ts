// audit-check --final (plan phase P17i C6, R14-33 pre-freeze part): with it, a valid failure whose
// audit label has a null or missing llm_auditor_agrees is a violation, because the final audit
// needs the LLM auditor's verdict on every failure; without it (pilot audits) the run is checked as
// before. --final parses before or after <run>.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as auditCheck } from '../audit-check.ts';
import { fixtureChecks, writeFixtureRun } from './run-fixtures.ts';

type Row = Record<string, unknown>;
const rows = (dir: string) => readFileSync(join(dir, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Row);
const writeRows = (dir: string, xs: Row[]) => writeFileSync(join(dir, 'audit.jsonl'), xs.map((r) => JSON.stringify(r)).join('\n') + '\n');

// The clean fixture with t-alpha/6's verdict null and t-beta/7's missing; t-alpha/0, a PASS, null too.
function run(): string {
  const dir = tempDir('audit-final');
  writeFixtureRun(dir, 'clean');
  writeRows(dir, rows(dir).map((r) => {
    if (r.trial === 't-alpha/6' || r.trial === 't-alpha/0') return { ...r, llm_auditor_agrees: null };
    if (r.trial === 't-beta/7') {
      const { llm_auditor_agrees: _drop, ...rest } = r;
      return rest;
    }
    return r;
  }));
  return dir;
}

async function check(args: string[]) {
  const out: string[] = [];
  const code = await auditCheck([...args, '--json'], { out: (l) => out.push(l), err: () => {}, checks: fixtureChecks });
  return { code, violations: (JSON.parse(out.join('\n')) as { violations: string[] }).violations };
}

describe('audit-check --final', () => {
  it('without --final, a null or missing llm_auditor_agrees is not a violation', async () => {
    expect(await check([run()])).toEqual({ code: 0, violations: [] });
  });

  it.each([['after'], ['before']])('with --final %s <run>, each valid failure without an LLM auditor verdict is a violation; a PASS is not', async (where) => {
    const dir = run();
    const r = await check(where === 'after' ? [dir, '--final'] : ['--final', dir]);
    expect(r.code).toBe(1);
    expect(r.violations).toEqual([
      't-alpha/6: FAIL has no LLM auditor verdict (llm_auditor_agrees null); --final requires one on every valid failure',
      't-beta/7: FAIL has no LLM auditor verdict (llm_auditor_agrees missing); --final requires one on every valid failure',
    ]);
  });

  it('with --final, the clean run passes', async () => {
    const dir = tempDir('audit-final-clean');
    writeFixtureRun(dir, 'clean');
    expect(await check([dir, '--final'])).toEqual({ code: 0, violations: [] });
  });
});
