// Every committed web fixture (apps/web/e2e/fixtures/*/results) read with the validators the
// built UI reads it with: each summary.json with packages/core/summary.ts validateSummary and
// equal to summarize() over its records, each trial record and audit line with
// src/data/records.ts, each trajectory with packages/core/trajectory.ts, and every trial record
// starts from the world in fixtures/manifest.json. A schema bump or a world rebuild that leaves a
// fixture behind fails here, before the e2e specs that build against it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { summarize, validateSummary, type Summary, type SummaryTrial } from '../../../packages/core/summary.ts';
import { parseTrajectory } from '../../../packages/core/trajectory.ts';
import { validateAuditRow, validateRecord } from '../src/data/records.ts';

const FIXTURES = join(import.meta.dirname, '../e2e/fixtures');
const WORLD_HASH = (JSON.parse(readFileSync(join(import.meta.dirname, '../../../fixtures/manifest.json'), 'utf8')) as { world: { state_hash: string } }).world.state_hash;
const roots = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(FIXTURES, e.name, 'results')))
  .map((e) => e.name)
  .sort();

// Each directory under results/ that holds trials/: the official run and every pilot.
function runDirs(dir: string): string[] {
  const subs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (subs.some((e) => e.name === 'trials')) return [dir];
  return subs.flatMap((e) => runDirs(join(dir, e.name)));
}

const files = (dir: string, ext: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(ext)).map((e) => join(e.parentPath, e.name)).sort() : [];
const json = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const lines = (file: string): unknown[] => readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as unknown);

it('finds the sample-results and trial fixtures', () => {
  expect(roots).toEqual(expect.arrayContaining(['sample-results', 'trial']));
});

describe.each(roots)('fixture %s', (root) => {
  const results = join(FIXTURES, root, 'results');
  const runs = runDirs(results);
  const at = (f: string) => relative(results, f);

  it('has at least one run, and official.json names one of them', () => {
    expect(runs.length).toBeGreaterThan(0);
    const official = join(results, 'official.json');
    if (existsSync(official)) expect(runs).toContain(join(results, (json(official) as { run: string }).run));
  });

  it.each(runs.map((r) => [at(r), r]))('%s: every record, audit line and trajectory validates', (_, run) => {
    const records = files(join(run, 'trials'), '.json');
    expect(records.length).toBeGreaterThan(0);
    for (const f of records) expect(validateRecord(json(f)), at(f)).toEqual([]);
    for (const f of files(run, 'audit.jsonl')) for (const [i, row] of lines(f).entries()) expect(validateAuditRow(row), `${at(f)}:${i + 1}`).toEqual([]);
    for (const f of files(join(run, 'trajectories'), '.jsonl')) expect(() => parseTrajectory(readFileSync(f, 'utf8')), at(f)).not.toThrow();
  });

  it.each(runs.map((r) => [at(r), r]))('%s: every trial record starts from the manifest world', (_, run) => {
    for (const f of files(join(run, 'trials'), '.json')) expect((json(f) as { state_hash: { initial: string } }).state_hash.initial, at(f)).toBe(WORLD_HASH);
  });

  const summaries = runs.filter((r) => existsSync(join(r, 'summary.json')));
  it.skipIf(summaries.length === 0).each(summaries.map((r) => [at(r), r]))('%s: summary.json validates and equals summarize() over its records', (_, run) => {
    const summary = json(join(run, 'summary.json')) as Summary;
    expect(validateSummary(summary)).toEqual([]);
    const records = files(join(run, 'trials'), '.json')
      .map((f) => json(f) as SummaryTrial & { index: number })
      // The generators' order, so the floating-point means add up in the same order.
      .sort((a, b) => (a.task_id === b.task_id ? a.index - b.index : a.task_id < b.task_id ? -1 : 1));
    const again = summarize({ run_id: summary.run_id, trials: records, requeued: [], replay: null, mode: summary.mode, ...(summary.expected_tasks ? { expected: summary.expected_tasks } : {}) });
    expect(again).toEqual(summary);
  });
});
