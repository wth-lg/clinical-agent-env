// The run loader fetches the trajectory of every trial whose explanation reads it (results.ts
// readsEvents), so the run-level views (Overview's swatches, Findings' marks: Trial.explanation) and
// the trial page (fullExplanation) give one fault. A FAIL whose audit answers tool_rejections_correct
// no is one: E6 reads the cited step (verifier-phase-P17i-C5-3 F10).
import { appendFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFixtureRun } from '../../../../cli/test/run-fixtures.ts';
import { tempDir } from '../../../../scripts/test/helpers.ts';
import { fullExplanation, loadResults, readsEvents } from './results.ts';

const RUN = 'results/pilot-e6';
const filesUnder = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? filesUnder(join(dir, f)) : [join(dir, f)]));

// The audit-check fixture run as a pilot run under data/, with t-beta/8's row answering
// tool_rejections_correct no and citing step 3, an order_medication call of schema-valid input the
// tool refused.
function serveRun(): void {
  const root = tempDir('web-e6');
  const dir = join(root, RUN);
  writeFixtureRun(dir, 'environment-label');
  const audit = join(dir, 'audit.jsonl');
  const rows = readFileSync(audit, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
  writeFileSync(audit, rows.map((r) => JSON.stringify(r.trial === 't-beta/8' ? { ...r, tool_rejections_correct: 'no', decisive_step: 3, model_fault: 'no' } : r)).join('\n') + '\n');
  const at = { v: 2, ts: '2026-10-24T00:00:00.000Z', turn: 1, tool_use_id: 'toolu_3', name: 'order_medication' };
  const input = { patient: 'Patient/pt-0001', rxnorm_code: '860975', dose_value: 500, dose_unit: 'mg', route: 'oral', frequency: 'BID', reason: 'type 2 diabetes' };
  const error = { code: 'NOT_FOUND', message: 'rxnorm_code 860975 is not in the catalog', field: 'rxnorm_code' };
  appendFileSync(join(dir, 'trajectories/t-beta/8.jsonl'), [
    { ...at, seq: 3, type: 'tool_call', input },
    { ...at, seq: 4, type: 'tool_result', executed: true, is_error: true, error_code: error.code, content: { error }, exposed_ids: [], referenced_ids: [] },
  ].map((e) => `${JSON.stringify(e)}\n`).join(''));
  const files = filesUnder(dir).map((f) => relative(root, f));
  vi.stubGlobal('fetch', async (url: string) => {
    const rel = String(url).replace(/^\/data\//, '');
    if (rel === 'index.json') return new Response(JSON.stringify({ files }));
    return files.includes(rel) ? new Response(readFileSync(join(root, rel), 'utf8')) : new Response('', { status: 404 });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('results: the run views and the trial page agree on E6', () => {
  it('readsEvents is true for a REFUSAL, a LIMIT and a trial whose audit answers tool_rejections_correct no, after adjudication', () => {
    expect(readsEvents({ outcome: 'REFUSAL' }, null)).toBe(true);
    expect(readsEvents({ outcome: 'LIMIT' }, null)).toBe(true);
    expect(readsEvents({ outcome: 'FAIL' }, null)).toBe(false);
    expect(readsEvents({ outcome: 'FAIL' }, { tool_rejections_correct: 'no' })).toBe(true);
    expect(readsEvents({ outcome: 'FAIL' }, { tool_rejections_correct: 'no', adjudicated_tool_rejections_correct: 'yes' })).toBe(false);
    expect(readsEvents({ outcome: 'FAIL' }, { tool_rejections_correct: 'yes', adjudicated_tool_rejections_correct: 'no' })).toBe(true);
  });

  it('a FAIL with a confirmed tool_rejections_correct no citing a refused call is env in the run list and on the trial page', async () => {
    serveRun();
    const results = await loadResults();
    if (results.kind !== 'ready') throw new Error('results did not load');
    const run = results.pilots.find((p) => p.dir === RUN)!;
    const t = run.trials.find((x) => x.name === 't-beta/8')!;
    const full = await fullExplanation(t, run, results.files);
    expect(full).toMatchObject({ fault: 'env', deciding: { id: 'E6' } });
    expect({ fault: t.explanation.fault, label: t.explanation.label, deciding: t.explanation.deciding }).toEqual({ fault: full.fault, label: full.label, deciding: full.deciding });
  });
});
