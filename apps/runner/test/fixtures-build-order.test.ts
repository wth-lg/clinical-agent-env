// review-phase-P11f-1 m2: the runner reloads its fixtures when manifest.json changes, so
// pnpm fixtures:build writes manifest.json last, after world.ndjson.gz and definitions-pruned.json;
// a trial posted mid-build then never pairs a new manifest with an old file.
import { basename } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { tempDir } from './helpers.ts';

const writes = vi.hoisted(() => [] as string[]);
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const writeFileSync: typeof fs.writeFileSync = (file, ...rest) => {
    writes.push(String(file));
    return fs.writeFileSync(file, ...rest);
  };
  return { ...fs, default: { ...fs, writeFileSync }, writeFileSync };
});

describe('pnpm fixtures:build', () => {
  it('writes manifest.json last', async () => {
    const { build } = await import('../../../scripts/fixtures-build.ts');
    const out = tempDir('fixtures-build-order');
    await build(out);
    expect(writes.filter((f) => f.startsWith(out)).map((f) => basename(f))).toEqual(['world.ndjson.gz', 'definitions-pruned.json', 'manifest.json']);
  });
});
