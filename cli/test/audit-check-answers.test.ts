// audit-check on the audit row's two answers (plan phase P17i C5, R14-31; decisions.tsv
// 2026-10-27T02:10): clinically_acceptable, tool_rejections_correct and their adjudicated_ answers
// are yes or no when given, and the answer after adjudication decides. A clinically_acceptable no
// needs GR3 (an audit outcome GRADER_BUG with evidence) or an environment label; a
// tool_rejections_correct no needs an environment label and the rejected call's step (it makes the
// fault environment, E6) that cites a refused call's step and is confirmed (decisions.tsv
// 2026-10-27T06:00); an auditor no overruled by an adjudicated yes needs an adjudicated_label
// and a note.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
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

// Step 3 of t-beta/8's trajectory: a call the tool refused (the fixture's steps 1 and 2 succeed).
function refusedStep(dir: string): void {
  const e = { v: 2, seq: 3, ts: '2026-10-24T00:00:00.000Z', turn: 1, type: 'tool_result', tool_use_id: 'toolu_3', name: 'order_medication', executed: true, is_error: true, error_code: 'INVALID_INPUT', content: { error: { code: 'INVALID_INPUT', message: "'dose' is required" } }, exposed_ids: [], referenced_ids: [] };
  appendFileSync(join(dir, 'trajectories/t-beta/8.jsonl'), `${JSON.stringify(e)}\n`);
}

async function violations(dir: string): Promise<string[]> {
  const out: string[] = [];
  await auditCheck([dir, '--json'], { out: (l) => out.push(l), err: () => {}, checks: fixtureChecks });
  return (JSON.parse(out.join('\n')) as { violations: string[] }).violations;
}
const about = (vs: string[]) => vs.filter((v) => /clinically_acceptable|tool_rejections_correct/.test(v));
const CLINICAL = "t-alpha/5: clinically_acceptable no (the recorded outcome is not clinically right) needs GR3 (an audit outcome GRADER_BUG with evidence) or an environment label; adjudicated_clinically_acceptable yes overrules it";
const TOOL = (trial: string, label: string, cited: string, confirmed = 'confirmed') =>
  `${trial}: tool_rejections_correct no (a tool rejected a valid call) needs an environment label (it is ${label}), the refused call's step as decisive_step (${cited}) and confirmation, llm_auditor_agrees true or an adjudicated_label (${confirmed}); adjudicated_tool_rejections_correct yes overrules it`;

describe('audit-check: clinically_acceptable and tool_rejections_correct', () => {
  it('yes on both keeps the clean run clean', async () => {
    expect(await violations(run('clean', 't-alpha/5', { clinically_acceptable: 'yes', tool_rejections_correct: 'yes' }))).toEqual([]);
  });

  it('clinically_acceptable no on a model label is a violation, with or without an adjudicated model label (F2)', async () => {
    expect(await violations(run('clean', 't-alpha/5', { clinically_acceptable: 'no' }))).toEqual([CLINICAL]);
    expect(about(await violations(run('clean', 't-alpha/5', { clinically_acceptable: 'no', adjudicated_label: 'model', note: 'the grade stands' })))).toEqual([CLINICAL]);
  });

  it('an auditor no overruled by an adjudicated yes is met with an adjudicated_label and a note, and not without them', async () => {
    const overruled = { clinically_acceptable: 'no', adjudicated_clinically_acceptable: 'yes', adjudicated_label: 'model', note: 'the dose was wrong; the grade stands' };
    expect(await violations(run('clean', 't-alpha/5', overruled))).toEqual([]);
    expect(about(await violations(run('clean', 't-alpha/5', { ...overruled, note: ' ' })))).toEqual(['t-alpha/5: clinically_acceptable no, overruled by adjudicated_clinically_acceptable yes, needs an adjudicated_label and a note']);
  });

  it('GR3 meets a clinically_acceptable no but not a tool_rejections_correct no (F1)', async () => {
    const gr3 = { outcome: 'GRADER_BUG', taxonomy: null };
    expect(about(await violations(run('clean', 't-alpha/5', { ...gr3, clinically_acceptable: 'no' })))).toEqual([]);
    expect(about(await violations(run('clean', 't-alpha/5', { ...gr3, tool_rejections_correct: 'no' })))).toEqual([TOOL('t-alpha/5', 'grader', 'step 2 is write_note, which succeeded')]);
  });

  it('a confirmed tool_rejections_correct no citing a refused call makes the fault environment (E6), and an environment label agrees', async () => {
    const dir = run('environment-label', 't-beta/8', { tool_rejections_correct: 'no', decisive_step: 3, model_fault: 'no' });
    refusedStep(dir);
    const env = await violations(dir);
    expect(about(env)).toEqual([]);
    expect(env.filter((v) => v.startsWith('t-beta/8: labelled'))).toEqual([]);
    expect(env).toContainEqual(expect.stringMatching(/^t-beta\/8: .*environment/));
  });

  it('citing a step that succeeded, or an unconfirmed audit, does not make it environment (F5, F6)', async () => {
    const ok = run('environment-label', 't-beta/8', { tool_rejections_correct: 'no', decisive_step: 2, model_fault: 'no' });
    refusedStep(ok);
    const succeeded = await violations(ok);
    expect(about(succeeded)).toEqual([TOOL('t-beta/8', 'environment', 'step 2 is write_note, which succeeded')]);
    expect(succeeded).toContain('t-beta/8: labelled environment, and its fault model has the label model');
    const unconfirmed = run('environment-label', 't-beta/8', { tool_rejections_correct: 'no', decisive_step: 3, model_fault: 'no', llm_auditor_agrees: null });
    refusedStep(unconfirmed);
    expect(about(await violations(unconfirmed))).toEqual([TOOL('t-beta/8', 'environment', 'step 3 is order_medication, which was refused (INVALID_INPUT)', 'not confirmed')]);
    const model = await violations(run('clean', 't-alpha/5', { tool_rejections_correct: 'no' }));
    expect(about(model)).toEqual([TOOL('t-alpha/5', 'model', 'step 2 is write_note, which succeeded')]);
  });

  it('a value other than yes or no is a violation, adjudicated answers included', async () => {
    expect(about(await violations(run('clean', 't-alpha/5', { clinically_acceptable: 'maybe', adjudicated_tool_rejections_correct: 'perhaps' })))).toEqual([
      't-alpha/5: clinically_acceptable must be yes or no, not "maybe"',
      't-alpha/5: adjudicated_tool_rejections_correct must be yes or no, not "perhaps"',
    ]);
  });
});
