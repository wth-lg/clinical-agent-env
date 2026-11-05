// verifier-phase-P17i-TWOW-229-1 S2: summary --require replay=all and audit-check count a
// replay.json entry only when it is a verdict of the record as it is now: its recorded and
// current outcomes are the record's and, when the entry is stamped (replayed_at) and is a match or
// mismatch, it was made at the record's env_version. A record rewritten under the same trial
// name (a task's new version in the run, R42) with a replay nobody ran is then listed as not
// replayed, never a false replay=all.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../packages/core/anthropic.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as auditCheck } from '../audit-check.ts';
import { main as summary } from '../summary.ts';
import { fixtureChecks, writeFixtureRun } from './run-fixtures.ts';

const REQUIRE = `valid=10,band=2-7,env_error_raw=0,grader_error=0,model=${MODEL},replay=all`;
type Entry = Record<string, unknown>;

function run(edit: (e: Entry) => Entry): string {
  const dir = tempDir('replay-stale');
  writeFixtureRun(dir, 'clean');
  const file = join(dir, 'replay.json');
  const j = JSON.parse(readFileSync(file, 'utf8')) as { trials: Record<string, Entry> };
  j.trials['t-alpha/3'] = edit(j.trials['t-alpha/3']!);
  writeFileSync(file, `${JSON.stringify(j, null, 2)}\n`);
  return dir;
}

async function cli(main: typeof summary | typeof auditCheck, args: string[]) {
  const out: string[] = [];
  const code = await main(args, { out: (l) => out.push(l), err: (l) => out.push(l), checks: fixtureChecks });
  return { code, text: out.join('\n') };
}

const stamped = (env: string) => (e: Entry): Entry => ({ ...e, replayed_at: { commit: 'a'.repeat(40), dirty: false, world_hash: 'w'.repeat(64), env_version: env } });
const RECORD_ENV = 'e-t-alpha';

describe('a stale replay.json entry (S2)', () => {
  it('the clean fixture: every entry is the record\'s verdict, stamped with its env_version or not', async () => {
    expect((await cli(summary, [run((e) => e), '--require', REQUIRE])).code).toBe(0);
    const r = await cli(summary, [run(stamped(RECORD_ENV)), '--require', REQUIRE]);
    expect(r.code, r.text).toBe(0);
  });

  it.each([
    ['its recorded outcome is not the record\'s', (e: Entry) => ({ ...e, recorded_outcome: 'FAIL' })],
    ['its current outcome is not the record\'s', (e: Entry) => ({ ...e, current_outcome: 'FAIL' })],
    ['it was made at another env_version', stamped('e-older')],
  ])('summary replay=all lists the trial as not replayed when %s', async (_, edit) => {
    const r = await cli(summary, [run(edit), '--require', REQUIRE]);
    expect(r.code).toBe(1);
    expect(r.text).toContain('replay: not replayed t-alpha/3');
    expect(r.text).toContain('replay: 1 entry of replay.json is not a verdict of its record as it is now (stale; replay the task again): t-alpha/3');
    expect(r.text).not.toContain('did not reproduce');
  });

  it('audit-check reports the stale entry as a violation', async () => {
    const r = await cli(auditCheck, [run((e) => ({ ...e, recorded_outcome: 'FAIL' }))]);
    expect(r.code).toBe(1);
    expect(r.text).toContain('violation: t-alpha/3: replay.json holds no verdict of this record as it is now (its entry is stale: recorded FAIL, the record PASS); replay the task again');
  });

  it('a world_mismatch entry is stamped with the replaying checkout\'s env_version, never the record\'s, and still counts as other_world', async () => {
    const r = await cli(summary, [run((e) => ({ ...e, match: undefined, verdict: 'world_mismatch', outcome: null, error: 'environment changed', replayed_at: { commit: null, dirty: null, world_hash: 'x'.repeat(64), env_version: 'e-head' } })), '--require', REQUIRE]);
    expect(r.code).toBe(1);
    expect(r.text).toContain('replay: t-alpha/3 ran on another world');
    expect(r.text).not.toContain('not replayed t-alpha/3');
  });
});
