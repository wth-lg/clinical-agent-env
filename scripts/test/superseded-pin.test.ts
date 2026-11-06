// Gate W5F-238 F4: the records of a superseded version (R42, results/runs/final-1/superseded/) are
// history nobody counts, so summary, replay=all and audit-check do not read them; this pin does.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check, PIN, SUPERSEDED, write } from '../superseded-pin.ts';

const repoRoot = join(import.meta.dirname, '../..');

describe('superseded versions pinned by sha256', () => {
  it('the committed superseded records equal their pin', () => {
    expect(check(repoRoot)).toEqual([]);
  });
  it('a changed current outcome, a missing file and an unpinned file are each named; --write re-pins', () => {
    const root = mkdtempSync(join(tmpdir(), 'superseded-pin-'));
    cpSync(join(repoRoot, SUPERSEDED), join(root, SUPERSEDED), { recursive: true });
    const rec = join(root, SUPERSEDED, 'crc-care-gap-v1/trials/crc-care-gap/0.json');
    const r = JSON.parse(readFileSync(rec, 'utf8')) as { regrades: Array<{ outcome: string }> };
    r.regrades[r.regrades.length - 1]!.outcome = 'FAIL';
    writeFileSync(rec, JSON.stringify(r, null, 2));
    writeFileSync(join(root, SUPERSEDED, 'crc-care-gap-v1/trials/crc-care-gap/99.json'), '{}');
    // A pinned file that is gone (gate R48-238 F3: the case removes a file, not only adds one).
    rmSync(join(root, SUPERSEDED, 'crc-care-gap-v1/trials/crc-care-gap/1.json'));
    const lines = check(root);
    expect(lines).toContain(`${SUPERSEDED}/crc-care-gap-v1/trials/crc-care-gap/1.json: pinned but missing`);
    expect(lines).toContain(`${SUPERSEDED}/crc-care-gap-v1/trials/crc-care-gap/0.json: differs from its pin (sha256 ${lines.find((l) => l.includes('/0.json'))?.split('sha256 ')[1]?.slice(0, 12)}, pinned ${(JSON.parse(readFileSync(join(root, PIN), 'utf8')) as { files: Record<string, string> }).files['crc-care-gap-v1/trials/crc-care-gap/0.json']!.slice(0, 12)})`);
    expect(lines).toContain(`${SUPERSEDED}/crc-care-gap-v1/trials/crc-care-gap/99.json: not pinned`);
    expect(write(root)).toBeGreaterThan(40);
    expect(check(root)).toEqual([]);
  });
});
