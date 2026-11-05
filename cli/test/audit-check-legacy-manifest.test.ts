// verifier-phase-P17i-TWOW-229-1 B2: results/runs/final-1's manifest was written before the
// per-task world_hashes. When the first batch of a later world is appended (the W5 tasks, R40),
// the frozen tasks must stay on their world ba0b0206, or explainContext's M3 compares their
// records' initial hash with the new world and audit-check reports every failure as the
// environment's fault. The manifest is built as lockedBatch builds it (nextManifest); audit-check
// runs on a copy of the committed run with that manifest, offline.
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../packages/core/anthropic.ts';
import { nextManifest, type RunManifest } from '../../packages/core/batch.ts';
import { runWorldHash } from '../../packages/core/explain-context.ts';
import { repoRoot, tempDir } from '../../scripts/test/helpers.ts';
import { main as auditCheck } from '../audit-check.ts';

const FINAL = join(repoRoot, 'results/runs/final-1');
const LATER_WORLD = 'f'.repeat(64);

async function check(dir: string) {
  const out: string[] = [];
  const code = await auditCheck([dir, '--json'], { out: (l) => out.push(l), err: () => {} });
  return { code, violations: (JSON.parse(out.join('\n')) as { violations: string[] }).violations };
}

describe('audit-check on final-1 after a later-world batch (B2)', { timeout: 300_000 }, () => {
  it('the committed manifest has no world_hashes, and a renal-dose-review batch on another world leaves crc-care-gap and contrast-ct-prep on theirs', async () => {
    const prior = JSON.parse(readFileSync(join(FINAL, 'manifest.json'), 'utf8')) as RunManifest;
    expect(prior.world_hashes).toBeUndefined();
    const entry = { batch_id: 'b-later', started: '2026-11-10T00:00:00.000Z', ended: null, projection: 1, remaining: 20, settled: 0, requeued: 0, stopped: null, cancelled: false, env_git_sha: 'c-later', world_hash: LATER_WORLD, tasks: ['renal-dose-review'] };
    const m = nextManifest(prior, {
      spec: { runId: 'final-1', model: MODEL, effort: 'high', mode: 'live', trials: 20 },
      versions: { 'renal-dose-review': { task_version: 't-r', env_version: 'e-r', grader_task_version: 'g-r' } }, worldHash: LATER_WORLD, entry,
    });
    expect(m.world_hash).toBe(LATER_WORLD);
    expect(m.world_hashes).toEqual({ 'crc-care-gap': prior.world_hash, 'contrast-ct-prep': prior.world_hash, 'renal-dose-review': LATER_WORLD });
    expect(runWorldHash(m, 'crc-care-gap')).toBe(prior.world_hash);
    expect(m.task_versions['crc-care-gap']).toBe(prior.task_versions['crc-care-gap']);
    expect(m.batches).toHaveLength(2);

    const copy = join(tempDir('audit-legacy'), 'final-1');
    cpSync(FINAL, copy, { recursive: true });
    const before = await check(copy);
    expect(before, before.violations.join('\n')).toEqual({ code: 0, violations: [] });
    writeFileSync(join(copy, 'manifest.json'), `${JSON.stringify(m, null, 2)}\n`);
    const after = await check(copy);
    expect(after, after.violations.join('\n')).toEqual({ code: 0, violations: [] });
  });
});
