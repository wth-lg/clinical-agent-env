// The loader's record and audit checks (apps/web/src/data/records.ts) accept every committed
// record, the sample run's and the pilot runs', and name the field of a bad one.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { readAudit, validateAuditRow, validateRecord } from '../src/data/records.ts';

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

  it('reads rule P-L facts an ENV_LIMIT records, and names malformed ones', () => {
    const rec = read(join(SAMPLE, 'trials/results-inbox/12.json'));
    expect(rec).toMatchObject({ outcome: 'ENV_LIMIT', progress: { tail: 20, looping: false } });
    expect(validateRecord({ ...rec, progress: { tail: 20, repeats: 0, repeat_share: 0, looping: false } })).toEqual(['progress is not rule P-L facts (tail, repeats, new_writes, looping)']);
  });
});

describe('validateAuditRow', () => {
  it('accepts every line of the sample audit and names a bad one', () => {
    const lines = readFileSync(join(SAMPLE, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '');
    for (const l of lines) expect(validateAuditRow(JSON.parse(l))).toEqual([]);
    expect(validateAuditRow({ outcome: 'FAIL' })).toEqual(['trial is missing']);
  });

  it('a note that is not text makes the row unreadable, as audit-check reads it (verifier-phase-P17i-P17j-S3retror2-1 B1n)', () => {
    const row = { trial: 't/0', outcome: 'PASS', evidence_ids: [] };
    expect(validateAuditRow({ ...row, note: 7 })).toEqual(['note is not text']);
    expect(validateAuditRow({ ...row, note: null })).toEqual([]);
    expect(validateAuditRow({ ...row, note: '' })).toEqual([]);
  });
});

// A task-validity review line (P17i C3, cli/audit-check.ts) names a task, not a trial
// (decisions.tsv 2026-10-27T04:40, verifier-phase-P17i-C3-2 F2).
const REVIEW = { task: 'renal-dose-review', kind: 'task-validity', reviewer: 'auditor-1', verdict: 'fair-trap', note: 'the trap is fair' };

describe('a task-validity review line', () => {
  it('is a readable audit line, and a bad one names its field', () => {
    expect(validateAuditRow(REVIEW)).toEqual([]);
    expect(validateAuditRow({ ...REVIEW, verdict: 'maybe' })).toEqual(['verdict is not fair-trap or check-defect']);
    expect(validateAuditRow({ kind: 'task-validity', verdict: 'check-defect', note: '' })).toEqual(['task is missing', 'reviewer is missing']);
  });

  it('readAudit keeps the per-trial rows, sets the review lines apart and warns only on lines it cannot read', () => {
    const row = { trial: 'renal-dose-review/5', outcome: 'FAIL', taxonomy: 'reasoning', model_fault: 'yes', decisive_step: 11, evidence_ids: [], llm_auditor_agrees: true };
    const a = readAudit([JSON.stringify(row), JSON.stringify(REVIEW), '{not json', JSON.stringify({ outcome: 'FAIL' }), ''].join('\n'));
    expect(a.rows.map((r) => r.trial)).toEqual(['renal-dose-review/5']);
    expect(a.reviews).toEqual([REVIEW]);
    expect(a.warnings).toEqual([expect.stringMatching(/^audit\.jsonl line 3 cannot be read: /), 'audit.jsonl line 4 cannot be read: trial is missing']);
  });
});
