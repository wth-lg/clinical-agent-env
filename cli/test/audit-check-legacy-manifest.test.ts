// verifier-phase-P17i-TWOW-229-1 B2: results/runs/final-1's manifest was written before the
// per-task world_hashes (its first batch, P22). When the first batch of a later world is appended (the W5-F
// batch, R40; committed since builder-321),
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
  // The committed manifest now holds world_hashes (the W5-F batch 5a45f225 was appended by lockedBatch
  // on the world 32515f6a): the legacy prior is its first batch as it was written, without them.
  const committed = JSON.parse(readFileSync(join(FINAL, 'manifest.json'), 'utf8')) as RunManifest;
  const frozen = JSON.parse(readFileSync(join(repoRoot, 'results/tasks-final.json'), 'utf8')) as { tasks: Record<string, { task_version: string; env_version: string; grader_task_version: string; superseded?: { task_version: string; env_version: string; grader_task_version: string } }> };
  const v1 = frozen.tasks['crc-care-gap']!.superseded!;
  const t5 = frozen.tasks['contrast-ct-prep']!;
  const first = committed.batches[0]!;
  // The first batch's world is the frozen tasks' (its entry predates per-batch world hashes).
  const firstWorld = committed.world_hashes!['contrast-ct-prep']!;
  const { world_hashes: _w, ...rest } = committed;
  const prior: RunManifest = {
    ...rest, env_git_sha: first.env_git_sha, world_hash: firstWorld, batches: [first],
    task_versions: { 'crc-care-gap': v1.task_version, 'contrast-ct-prep': t5.task_version },
    env_versions: { 'crc-care-gap': v1.env_version, 'contrast-ct-prep': t5.env_version },
    grader_task_versions: { 'crc-care-gap': v1.grader_task_version, 'contrast-ct-prep': t5.grader_task_version },
  };
  const spec = { runId: 'final-1', model: MODEL, effort: 'high', mode: 'live', trials: 20 } as const;

  it('the legacy manifest (the first batch, no world_hashes) and a renal-dose-review batch on another world leave crc-care-gap and contrast-ct-prep on theirs', () => {
    expect(prior.world_hashes).toBeUndefined();
    expect(committed.world_hashes).toBeDefined();
    const entry = { batch_id: 'b-later', started: '2026-11-10T00:00:00.000Z', ended: null, projection: 1, remaining: 20, settled: 0, requeued: 0, stopped: null, cancelled: false, env_git_sha: 'c-later', world_hash: LATER_WORLD, tasks: ['renal-dose-review'] };
    const m = nextManifest(prior, { spec, versions: { 'renal-dose-review': { task_version: 't-r', env_version: 'e-r', grader_task_version: 'g-r' } }, worldHash: LATER_WORLD, entry });
    expect(m.world_hash).toBe(LATER_WORLD);
    expect(m.world_hashes).toEqual({ 'crc-care-gap': prior.world_hash, 'contrast-ct-prep': prior.world_hash, 'renal-dose-review': LATER_WORLD });
    expect(runWorldHash(m, 'crc-care-gap')).toBe(prior.world_hash);
    expect(m.task_versions['crc-care-gap']).toBe(prior.task_versions['crc-care-gap']);
    expect(m.batches).toHaveLength(2);
  });

  it('the committed W5-F batch appended to the legacy prior gives the committed per-task worlds, and audit-check holds on the run with either manifest', async () => {
    const later = committed.batches[1]!;
    const versions: Record<string, { task_version: string; env_version: string; grader_task_version: string }> = {};
    for (const id of later.tasks ?? []) versions[id] = { task_version: committed.task_versions[id] ?? '', env_version: committed.env_versions?.[id] ?? '', grader_task_version: committed.grader_task_versions?.[id] ?? '' };
    const m = nextManifest(prior, { spec, versions, worldHash: later.world_hash ?? committed.world_hash, entry: later });
    expect(m.world_hash).toBe(committed.world_hash);
    expect(m.world_hashes).toEqual(committed.world_hashes);
    expect(m.task_versions).toEqual(committed.task_versions);
    expect(m.env_versions).toEqual(committed.env_versions);
    expect(runWorldHash(m, 'contrast-ct-prep')).toBe(firstWorld);
    expect(runWorldHash(m, 'crc-care-gap')).toBe(later.world_hash);

    const copy = join(tempDir('audit-legacy'), 'final-1');
    cpSync(FINAL, copy, { recursive: true });
    const before = await check(copy);
    expect(before, before.violations.join('\n')).toEqual({ code: 0, violations: [] });
    writeFileSync(join(copy, 'manifest.json'), `${JSON.stringify(m, null, 2)}\n`);
    const after = await check(copy);
    expect(after, after.violations.join('\n')).toEqual({ code: 0, violations: [] });
  });
});
