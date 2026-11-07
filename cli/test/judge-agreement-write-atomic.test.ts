// judge-agreement --write writes summary.json atomically (builder-328 follow-up): the merged file
// goes through cli/adapters/result-sink-node.ts writeJson (a temp file beside it, then a rename),
// so a failure mid-write leaves the old summary.json intact, never half of the new one. The
// failure is simulated: node:fs writeFileSync, armed, writes a prefix of the bytes it is given
// to any summary.json path and throws, as a full disk or a kill mid-write would.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main, sampleTrials } from '../judge-agreement.ts';
import { TASKS, writeFixtureRun } from './run-fixtures.ts';

const state = vi.hoisted(() => ({ armed: false, hits: [] as string[] }));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const writeFileSync: typeof fs.writeFileSync = (path, data, ...rest) => {
    const p = String(path);
    if (state.armed && /summary\.json/.test(p)) {
      state.hits.push(p);
      fs.writeFileSync(path, String(data).slice(0, 12), ...rest);
      throw new Error('disk full: simulated failure mid-write');
    }
    return fs.writeFileSync(path, data, ...rest);
  };
  return { ...fs, writeFileSync };
});

type Row = Record<string, unknown>;
const put = (file: string, lines: Row[]) => writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
const failures = (): string[] => TASKS.flatMap((task) => Array.from({ length: 10 }, (_, k) => `${task}/${10 + k}`));

// The clean fixture of 20 trials per task with the auditor's outputs and a seeded double label,
// as cli/test/judge-agreement.test.ts builds them for --double-label, and a summary.json to write into.
function run(): { dir: string; file: string; before: string } {
  const dir = tempDir('judge-agreement-atomic');
  writeFixtureRun(dir, 'clean', { trials: 20 });
  for (const name of failures()) {
    const [task, i] = name.split('/') as [string, string];
    mkdirSync(join(dir, 'auditor', task), { recursive: true });
    put(join(dir, 'auditor', task, `${i}.json`), [{ trial: name, outcome: 'FAIL', verdict: { label: 'model', clinically_acceptable: 'yes', tool_rejections_correct: 'yes', decisive_step: 2, evidence_ids: ['Patient/pt-0001'], reason: 'wrong value' }, problem: null }]);
  }
  put(join(dir, 'double-labels.jsonl'), [{ kind: 'sample', seed: 7, n: 20, labeller: 'fixture-verifier' }, ...sampleTrials(failures(), 20, 7).map((trial) => ({ trial, label: 'model', note: 'blind' }))]);
  const file = join(dir, 'summary.json');
  const before = `${JSON.stringify({ schema_version: 10, run_id: 'final-1', tasks: {} }, null, 2)}\n`;
  writeFileSync(file, before);
  return { dir, file, before };
}

const quiet = { out: () => {}, err: () => {} };

describe('judge-agreement --write is atomic', () => {
  it('a failure mid-write leaves the old summary.json intact: the bytes go to a temp file beside it, never to the file', async () => {
    const { dir, file, before } = run();
    state.armed = true;
    state.hits = [];
    try {
      await expect(main([dir, '--double-label', '--write'], quiet)).rejects.toThrow('disk full');
    } finally {
      state.armed = false;
    }
    expect(state.hits).toHaveLength(1);
    expect(state.hits[0]).not.toBe(file);
    expect(state.hits[0]).toMatch(/summary\.json\.tmp-\d+$/);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('a write that completes leaves the merged file and no temp file beside it', async () => {
    const { dir, file } = run();
    expect(await main([dir, '--double-label', '--write'], quiet)).toBe(0);
    const s = JSON.parse(readFileSync(file, 'utf8')) as Row;
    expect(s).toMatchObject({ schema_version: 10, run_id: 'final-1', kappa: { double_label: { n: 20, kappa: 1, seed: 7 } } });
    expect(readFileSync(file, 'utf8').endsWith('}\n')).toBe(true);
    expect(readdirSync(dir).filter((n) => n.startsWith('summary.json'))).toEqual(['summary.json']);
    expect(existsSync(`${file}.tmp-${process.pid}`)).toBe(false);
  });
});
