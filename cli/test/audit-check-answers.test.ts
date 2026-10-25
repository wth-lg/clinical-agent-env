// audit-check on the audit row's two answers (plan phase P17i C5, R14-31): clinically_acceptable
// and tool_rejections_correct are yes or no when given, and a "no" needs GR3 (an audit outcome
// GRADER_BUG with evidence), an environment label, or an adjudicated_label with a note.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as auditCheck } from '../audit-check.ts';
import { fixtureChecks, writeFixtureRun, type Fixture } from './run-fixtures.ts';

type Row = Record<string, unknown>;
const rows = (dir: string) => readFileSync(join(dir, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Row);
const writeRows = (dir: string, xs: Row[]) => writeFileSync(join(dir, 'audit.jsonl'), xs.map((r) => JSON.stringify(r)).join('\n') + '\n');

// The fixture run with one trial's row changed.
function run(fixture: Fixture, trial: string, over: Row): string {
  const dir = tempDir(`answers-${fixture}`);
  writeFixtureRun(dir, fixture);
  writeRows(dir, rows(dir).map((r) => (r.trial === trial ? { ...r, ...over } : r)));
  return dir;
}

async function violations(dir: string): Promise<string[]> {
  const out: string[] = [];
  await auditCheck([dir, '--json'], { out: (l) => out.push(l), err: () => {}, checks: fixtureChecks });
  return (JSON.parse(out.join('\n')) as { violations: string[] }).violations;
}
const about = (vs: string[]) => vs.filter((v) => /clinically_acceptable|tool_rejections_correct/.test(v));

describe('audit-check: clinically_acceptable and tool_rejections_correct', () => {
  it('yes on both keeps the clean run clean', async () => {
    expect(await violations(run('clean', 't-alpha/5', { clinically_acceptable: 'yes', tool_rejections_correct: 'yes' }))).toEqual([]);
  });

  it.each(['clinically_acceptable', 'tool_rejections_correct'])('%s no on a model label without an adjudicated reason is a violation', async (field) => {
    const vs = await violations(run('clean', 't-alpha/5', { [field]: 'no' }));
    expect(vs).toEqual([`t-alpha/5: ${field} no needs GR3 (an audit outcome GRADER_BUG with evidence), an environment label or an adjudicated_label with a note`]);
  });

  it('a no with an adjudicated_label and a note is met', async () => {
    const dir = run('clean', 't-alpha/5', { clinically_acceptable: 'no', adjudicated_label: 'model', note: 'the dose was wrong; the grade stands' });
    expect(about(await violations(dir))).toEqual([]);
    const blank = run('clean', 't-alpha/5', { clinically_acceptable: 'no', adjudicated_label: 'model', note: ' ' });
    expect(about(await violations(blank))).toHaveLength(1);
  });

  it('a no with an environment label or a GRADER_BUG audit is met by the answer rule', async () => {
    expect(about(await violations(run('environment-label', 't-beta/8', { tool_rejections_correct: 'no' })))).toEqual([]);
    expect(about(await violations(run('clean', 't-alpha/5', { outcome: 'GRADER_BUG', taxonomy: null, clinically_acceptable: 'no' })))).toEqual([]);
  });

  it('a value other than yes or no is a violation', async () => {
    expect(about(await violations(run('clean', 't-alpha/5', { clinically_acceptable: 'maybe' })))).toEqual(['t-alpha/5: clinically_acceptable must be yes or no, not "maybe"']);
  });
});
