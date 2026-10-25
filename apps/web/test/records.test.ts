// The loader's record and audit checks (apps/web/src/data/records.ts) accept every committed
// record, the sample run's and the pilot runs', and name the field of a bad one.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { validateAuditRow, validateRecord } from '../src/data/records.ts';

const jsonFiles = (dir: string) => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => join(e.parentPath, e.name));
const SAMPLE = join(repoRoot, 'apps/web/e2e/fixtures/sample-results/results/runs/sample-1');
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;

describe('validateRecord', () => {
  it('accepts every record of the sample run and of results/pilot-0', () => {
    const files = [...jsonFiles(join(SAMPLE, 'trials')), ...jsonFiles(join(repoRoot, 'results/pilot-0/trials'))];
    expect(files.length).toBeGreaterThan(75);
    for (const f of files) expect(validateRecord(read(f)), f).toEqual([]);
  });

  it('names a missing or mistyped field', () => {
    const { cost_usd: _, ...noCost } = read(join(SAMPLE, 'trials/renal-dose-review/3.json'));
    expect(validateRecord(noCost)).toEqual(['cost_usd is missing']);
    expect(validateRecord({ ...noCost, cost_usd: '0.1', outcome: 'MAYBE' })).toEqual([expect.stringMatching(/^outcome is not one of /), 'cost_usd is not a number']);
    expect(validateRecord([])).toEqual(['the file is not a JSON object']);
  });
});

describe('validateAuditRow', () => {
  it('accepts every line of the sample audit and names a bad one', () => {
    const lines = readFileSync(join(SAMPLE, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '');
    for (const l of lines) expect(validateAuditRow(JSON.parse(l))).toEqual([]);
    expect(validateAuditRow({ outcome: 'FAIL' })).toEqual(['trial is missing']);
  });
});
