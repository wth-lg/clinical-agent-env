// audit-check and the false PASS (plan P17j JG5): an audit row that labels a PASS grader, with
// evidence, is GR5, so the run fails and --json leaves the trial out of its denominator; and
// every PASS whose current grade has a penalty (a rubric item with negative points) met or unknown
// needs an audit row with evidence ids, on top of the MIN_AUDITED_PASSES sample.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as auditCheck } from '../audit-check.ts';
import { fixtureChecks, writeFixtureRun } from './run-fixtures.ts';

type Row = Record<string, unknown>;
const rows = (dir: string) => readFileSync(join(dir, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Row);
const writeRows = (dir: string, xs: Row[]) => writeFileSync(join(dir, 'audit.jsonl'), xs.map((r) => JSON.stringify(r)).join('\n') + '\n');

function clean(name: string): string {
  const dir = tempDir(`false-pass-${name}`);
  writeFixtureRun(dir, 'clean');
  return dir;
}

// A penalty in the current grade of a fixture trial (a PASS: G1 met).
function penalty(dir: string, trial: string, points: number, met: boolean | 'unknown'): void {
  const file = join(dir, 'trials', `${trial}.json`);
  const r = JSON.parse(readFileSync(file, 'utf8')) as { checks: Row[] };
  r.checks = [...r.checks, { id: 'reply_names_other_patient', kind: 'rubric', method: 'judge', points, met }];
  writeFileSync(file, `${JSON.stringify(r, null, 2)}\n`);
}

async function check(dir: string, json = false): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await auditCheck([dir, ...(json ? ['--json'] : [])], { out: (s) => out.push(s), err: (s) => err.push(s), checks: fixtureChecks });
  return { code, out, err };
}

describe('a false PASS (GR5)', () => {
  it('the clean fixture passes, and counts all 20 valid trials', async () => {
    const r = await check(clean('base'), true);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ valid: 20, excluded: [], denominator: 20 });
  });

  it('an audit row labelling a PASS grader with evidence fails the run and leaves the trial out of the denominator', async () => {
    const dir = clean('gr5');
    writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? { ...r, label: 'grader', model_fault: 'no', note: 'the grader passed an order the policy forbids' } : r)));
    const r = await check(dir, true);
    expect(r.code).toBe(1);
    expect(r.err).toContainEqual(expect.stringMatching(/^violation: t-alpha\/0: PASS is a false PASS \(GR5\)/));
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ valid: 20, excluded: ['t-alpha/0'], denominator: 19 });
  });

  it('a PASS labelled grader without evidence ids is a violation, not a GR5', async () => {
    const dir = clean('gr5-no-evidence');
    writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? { ...r, label: 'grader', evidence_ids: [] } : r)));
    const r = await check(dir, true);
    expect(r.err).toContain('violation: t-alpha/0: a PASS labelled grader (a false PASS, GR5) needs evidence ids');
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ excluded: [], denominator: 20 });
  });
});

describe('every PASS with a met or unknown penalty is audited', () => {
  for (const [points, met] of [[-8, true], [-3, true], [-6, 'unknown']] as const) {
    it(`an unaudited PASS with a ${met === true ? 'met' : 'unknown'} ${points} item fails the run, naming it`, async () => {
      const dir = clean(`penalty${points}`);
      penalty(dir, 't-alpha/3', points, met);
      const r = await check(dir);
      expect(r.code).toBe(1);
      expect(r.out).toContain(`violation: t-alpha/3: PASS with penalty reply_names_other_patient (${points} points) ${met === true ? 'met' : 'unknown'} has no audit row with evidence ids`);
    });
  }

  it('an audited PASS with a met penalty, or a PASS whose penalty was not triggered, passes', async () => {
    const audited = clean('penalty-audited');
    penalty(audited, 't-alpha/0', -8, true);
    expect((await check(audited)).code).toBe(0);
    const quiet = clean('penalty-not-met');
    penalty(quiet, 't-alpha/3', -8, false);
    expect((await check(quiet)).code).toBe(0);
  });

  it('an audit row with no evidence ids does not count', async () => {
    const dir = clean('penalty-no-evidence');
    penalty(dir, 't-alpha/0', -8, true);
    writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? { ...r, evidence_ids: [] } : r)));
    expect((await check(dir)).out).toContain('violation: t-alpha/0: PASS with penalty reply_names_other_patient (-8 points) met has no audit row with evidence ids');
  });
});
