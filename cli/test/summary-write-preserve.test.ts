// `summary --write` and the fields other commands own (builder-328, verifier-phase-P23-close-1
// "summary --write drops the P23 fields"): judge_agreement and kappa come from
// `pnpm cli judge-agreement --write` and its --double-label form, after `summary --write`, so a
// rewrite carries them through as they are (CARRIED_FIELDS names each with its owner), and a run
// whose --require does not hold is not written at all: the file stays as it was, exit 1, and no
// temp file is left beside it. So the documented P23 and P26 gate commands can run again on a
// clean tree without deleting the P23 audit numbers the writeup quotes.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSummary } from '../../packages/core/summary.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { CARRIED_FIELDS, main as summary } from '../summary.ts';
import { fixtureChecks, writeFixtureRun } from './run-fixtures.ts';

const REQUIRE = 'valid=10,band=2-7,env_error_raw=0,grader_error=0';

async function cli(args: string[]) {
  const out: string[] = [];
  const code = await summary(args, { out: (l) => out.push(l), err: (l) => out.push(l), checks: fixtureChecks } as Parameters<typeof summary>[1]);
  return { code, out: out.join('\n') };
}

// As cli/judge-agreement.ts writeSummary puts them: spread after the summary's own fields.
const JUDGE_AGREEMENT = { n_judge: 53, judge_agree: 48, judge_agreement: 0.9056603773584906, n_extract: 0, extract_agree: 0, extract_agreement: null, labels: 'results/runs/final-1/judge-labels.jsonl' };
const KAPPA = {
  double_label: { n: 20, agree: 20, agreement: 1, kappa: 1, categories: ['model'], note: 'one category: chance agreement is 1, kappa taken as 1', seed: 323, sample_n: 20 },
  builder_vs_auditor: { n: 35, agree: 35, agreement: 1, kappa: 1, categories: ['model'], note: 'one category: chance agreement is 1, kappa taken as 1' },
};

function writtenRun(): { dir: string; file: string } {
  const dir = tempDir('summary-write-preserve');
  writeFixtureRun(dir, 'clean');
  return { dir, file: join(dir, 'summary.json') };
}

describe('summary --write carries the fields other commands own', () => {
  it('CARRIED_FIELDS names judge_agreement and kappa, each with the command that writes it', () => {
    expect(Object.keys(CARRIED_FIELDS).sort()).toEqual(['judge_agreement', 'kappa']);
    expect(CARRIED_FIELDS.judge_agreement).toMatch(/^pnpm cli judge-agreement .*--write/);
    expect(CARRIED_FIELDS.kappa).toMatch(/^pnpm cli judge-agreement .*--double-label.*--write/);
  });

  it('a rewrite keeps judge_agreement and kappa byte-equal, the rest written afresh', async () => {
    const { dir, file } = writtenRun();
    expect((await cli([dir, '--require', REQUIRE, '--write'])).code).toBe(0);
    const first = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(first).not.toHaveProperty('judge_agreement');
    expect(first).not.toHaveProperty('kappa');
    const withP23 = `${JSON.stringify({ ...first, judge_agreement: JUDGE_AGREEMENT, kappa: KAPPA }, null, 2)}\n`;
    writeFileSync(file, withP23);
    const r = await cli([dir, '--require', REQUIRE, '--write']);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/wrote .*summary\.json/);
    expect(readFileSync(file, 'utf8')).toBe(withP23);
    const again = JSON.parse(readFileSync(file, 'utf8'));
    expect(() => assertSummary(again)).not.toThrow();
    expect(again.judge_agreement).toEqual(JUDGE_AGREEMENT);
    expect(again.kappa).toEqual(KAPPA);
  });

  it('keeps the carried fields in the order the file holds them, and carries nothing from a file that is not a JSON object', async () => {
    const { dir, file } = writtenRun();
    expect((await cli([dir, '--write'])).code).toBe(0);
    const first = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const kappaFirst = `${JSON.stringify({ ...first, kappa: KAPPA, judge_agreement: JUDGE_AGREEMENT }, null, 2)}\n`;
    writeFileSync(file, kappaFirst);
    expect((await cli([dir, '--write'])).code).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(kappaFirst);
    writeFileSync(file, 'not json\n');
    expect((await cli([dir, '--write'])).code).toBe(0);
    const fresh = JSON.parse(readFileSync(file, 'utf8'));
    expect(() => assertSummary(fresh)).not.toThrow();
    expect(fresh).not.toHaveProperty('judge_agreement');
    expect(fresh).not.toHaveProperty('kappa');
  });

  it('with --json, the printed summary is the written one, carried fields included', async () => {
    const { dir, file } = writtenRun();
    expect((await cli([dir, '--write'])).code).toBe(0);
    const first = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    writeFileSync(file, `${JSON.stringify({ ...first, judge_agreement: JUDGE_AGREEMENT, kappa: KAPPA }, null, 2)}\n`);
    const out: string[] = [];
    expect(await summary([dir, '--write', '--json'], { out: (l) => out.push(l), err: () => {} })).toBe(0);
    expect(JSON.parse(out.join('\n'))).toMatchObject({ judge_agreement: JUDGE_AGREEMENT, kappa: KAPPA });
  });
});

describe('summary --write on a failed --require', () => {
  it('writes nothing: the file is unchanged, no temp file is left, exit 1', async () => {
    const { dir, file } = writtenRun();
    writeFileSync(file, 'committed bytes\n');
    // The clean fixture passes 5/10 per task: band=6-7 does not hold.
    const r = await cli([dir, '--require', 'valid=10,band=6-7', '--write']);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toMatch(/violation: /);
    expect(r.out).toMatch(/summary\.json not written: a requirement does not hold/);
    expect(r.out).not.toMatch(/wrote /);
    expect(readFileSync(file, 'utf8')).toBe('committed bytes\n');
    expect(readdirSync(dir).filter((n) => n.startsWith('summary.json'))).toEqual(['summary.json']);
  });

  it('creates no file when the run has none', async () => {
    const { dir, file } = writtenRun();
    expect((await cli([dir, '--require', 'valid=10,band=6-7', '--write'])).code).toBe(1);
    expect(existsSync(file)).toBe(false);
  });
});
