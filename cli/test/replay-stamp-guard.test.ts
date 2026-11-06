// verifier-phase-P17i-TWOW-229-3-1 m1 on the committed data: results/runs/final-1/replay.json,
// unstamped as tag final-1-t3t5 writes it, stamps with e8ef8c4d because each record is at the
// env_version results/tasks-final.json freezes its task at with replay_at at that commit; a
// record rewritten at another env_version under the same name (crc-care-gap v2 under v1's name,
// P5c; since W5-F the v2 records are the ones under that name) is refused, so step 2 of the
// two-step replay can never stamp a v1 entry as v2's verdict.
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot, tempDir } from '../../scripts/test/helpers.ts';
import { main as replay } from '../replay.ts';

const FINAL = join(repoRoot, 'results/runs/final-1');
const COMMIT = 'e8ef8c4d9bedce9e93d1a6d2031785c295e5caae';
type File = { trials: Record<string, Record<string, unknown>> };

async function cli(args: string[]) {
  const lines: string[] = [];
  const code = await replay(args, { out: (l) => lines.push(l), err: (l) => lines.push(l) });
  return { code, text: lines.join('\n') };
}

// The committed file holds the verdicts of two replays: tag final-1-t3t5's (stamped with COMMIT:
// the frozen tasks whose replay_at is COMMIT, contrast-ct-prep) and this checkout's (the W5-F
// tasks, made and stamped at their own commit, builder-321). Only the first are unstamped here,
// as that tag's replay wrote them, plus any trial named in `also`.
function unstampedCopy(name: string, tasksAt: readonly string[], also: readonly string[] = []): string {
  const copy = join(tempDir(name), 'final-1');
  cpSync(FINAL, copy, { recursive: true });
  const file = join(copy, 'replay.json');
  const j = JSON.parse(readFileSync(file, 'utf8')) as File;
  for (const [k, e] of Object.entries(j.trials)) {
    if (!tasksAt.includes(k.split('/')[0]!) && !also.includes(k)) continue;
    const { replayed_at: _at, verdict: _v, ...rest } = e;
    j.trials[k] = rest;
  }
  writeFileSync(file, `${JSON.stringify(j, null, 2)}\n`);
  return copy;
}

describe('replay --stamp on the committed final-1 (m1)', () => {
  it('stamps the unstamped file with e8ef8c4d to the committed bytes, and refuses a record at another env_version', async () => {
    const frozen = JSON.parse(readFileSync(join(repoRoot, 'results/tasks-final.json'), 'utf8')) as { tasks: Record<string, { env_version?: string; replay_at?: { commit: string }; superseded?: { env_version?: string; replay_at?: { commit: string } } }> };
    const crc = frozen.tasks['crc-care-gap']!;
    const at = crc.replay_at?.commit === COMMIT ? crc : crc.superseded;
    expect(at?.replay_at?.commit).toBe(COMMIT);
    const tasksAt = Object.entries(frozen.tasks).filter(([, t]) => t.replay_at?.commit === COMMIT).map(([id]) => id);
    expect(tasksAt).toContain('contrast-ct-prep');
    const copy = unstampedCopy('stamp-guard-ok', tasksAt);
    const ok = await cli([copy, '--stamp', COMMIT]);
    expect(ok.code, ok.text).toBe(0);
    expect(readFileSync(join(copy, 'replay.json'), 'utf8')).toBe(readFileSync(join(FINAL, 'replay.json'), 'utf8'));

    const stale = unstampedCopy('stamp-guard-p5c', tasksAt, ['crc-care-gap/3']);
    const rec = join(stale, 'trials/crc-care-gap/3.json');
    writeFileSync(rec, JSON.stringify({ ...(JSON.parse(readFileSync(rec, 'utf8')) as object), env_version: 'e'.repeat(64) }, null, 2));
    const before = readFileSync(join(stale, 'replay.json'), 'utf8');
    const r = await cli([stale, '--stamp', COMMIT]);
    expect(r.code).toBe(1);
    expect(r.text).toContain(`replay: crc-care-gap/3: not stamped: its record is at env_version ${'e'.repeat(64)}, and results/tasks-final.json records crc-care-gap at commit ${COMMIT.slice(0, 12)} at ${at!.env_version}: no verdict of this record was made there`);
    expect(r.text).toContain('replay: 1 entry not stamped; nothing written');
    expect(readFileSync(join(stale, 'replay.json'), 'utf8')).toBe(before);
  });
});
