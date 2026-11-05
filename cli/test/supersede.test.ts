// `pnpm cli supersede <run> --task <id> --version v<n>` (R42; verifier-phase-P17i-TWOW-229-2-1):
// a task's records leave the run for superseded/<task>-v<n>/ when a new version of the task
// replaces them under the same trial names. The move takes the task's trial records and
// trajectories byte-identical, its replay.json entries (into superseded/<key>/replay.json, so
// they never stand for the new version's records) and its audit.jsonl rows (into
// superseded/<key>/audit.jsonl, which summary reads for the superseded version's labels). The
// README of the superseded version is the builder's. No live call: the toy run is mocked.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { scenarioTransport } from '../../apps/web/src/harness/scenarios.ts';
import { MODEL } from '../../packages/core/anthropic.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as replay } from '../replay.ts';
import { main as run } from '../run.ts';
import { main as summary } from '../summary.ts';
import { main as supersede } from '../supersede.ts';

let dir: string;
const ROWS = [
  { trial: '_toy/0', outcome: 'PASS', taxonomy: null, model_fault: null, decisive_step: null, evidence_ids: ['Patient/pt-0001'], llm_auditor_agrees: true, note: 'passed for the right reasons' },
  { task: '_toy', kind: 'task-validity', reviewer: 'fixture-auditor', verdict: 'fair-trap', note: 'the toy' },
  { trial: 'other/0', outcome: 'FAIL', taxonomy: 'reasoning', model_fault: 'yes', decisive_step: 2, evidence_ids: ['Patient/pt-0001'], llm_auditor_agrees: true, note: 'another task' },
];

beforeAll(async () => {
  dir = join(tempDir('supersede'), 'run');
  const home = tempDir('supersede-home');
  const out: string[] = [];
  const code = await run(['--task', '_toy', '--model', MODEL, '--trials', '2', '--mock', 'toy', '--out', dir], {
    env: { HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl') },
    out: (l) => out.push(l),
    fetch: () => Promise.reject(new Error('no live call')),
    mock: (name) => scenarioTransport(name).transport,
  });
  if (code !== 0) throw new Error(out.join('\n'));
  const r = await replay([dir], { out: () => {}, err: () => {} });
  if (r !== 0) throw new Error('replay of the toy run failed');
  writeFileSync(join(dir, 'audit.jsonl'), ROWS.map((x) => JSON.stringify(x)).join('\n') + '\n');
});

async function cli(args: string[]) {
  const lines: string[] = [];
  const code = await supersede(args, { out: (l) => lines.push(l), err: (l) => lines.push(l) });
  return { code, text: lines.join('\n') };
}

const read = (f: string) => readFileSync(f, 'utf8');
const json = (f: string) => JSON.parse(read(f)) as { trials: Record<string, unknown> };

describe('supersede', () => {
  it('moves the task\'s records, trajectories, replay entries and audit rows into superseded/<task>-v<n>/, byte-identical', async () => {
    const copy = join(tempDir('supersede-move'), 'run');
    cpSync(dir, copy, { recursive: true });
    const before = { r0: read(join(copy, 'trials/_toy/0.json')), r1: read(join(copy, 'trials/_toy/1.json')), t0: read(join(copy, 'trajectories/_toy/0.jsonl')), t1: read(join(copy, 'trajectories/_toy/1.jsonl')), replay: json(join(copy, 'replay.json')) };
    const r = await cli([copy, '--task', '_toy', '--version', 'v1']);
    expect(r.code, r.text).toBe(0);
    const sup = join(copy, 'superseded/_toy-v1');
    expect(existsSync(join(copy, 'trials/_toy'))).toBe(false);
    expect(existsSync(join(copy, 'trajectories/_toy'))).toBe(false);
    expect(read(join(sup, 'trials/_toy/0.json'))).toBe(before.r0);
    expect(read(join(sup, 'trials/_toy/1.json'))).toBe(before.r1);
    expect(read(join(sup, 'trajectories/_toy/0.jsonl'))).toBe(before.t0);
    expect(read(join(sup, 'trajectories/_toy/1.jsonl'))).toBe(before.t1);
    expect(json(join(sup, 'replay.json'))).toEqual({ trials: { '_toy/0': before.replay.trials['_toy/0'], '_toy/1': before.replay.trials['_toy/1'] } });
    expect(json(join(copy, 'replay.json'))).toEqual({ trials: {} });
    expect(read(join(sup, 'audit.jsonl'))).toBe([ROWS[0], ROWS[1]].map((x) => JSON.stringify(x)).join('\n') + '\n');
    expect(read(join(copy, 'audit.jsonl'))).toBe(`${JSON.stringify(ROWS[2])}\n`);
    expect(r.text).toContain(`supersede: moved 2 records, 2 trajectories, 2 replay.json entries and 2 audit.jsonl rows of _toy to ${sup}; write its README.md (R42)`);
    // summary reads the superseded version with its own labels, and the run holds no _toy record now.
    const lines: string[] = [];
    expect(await summary([copy, '--json'], { out: (l) => lines.push(l), err: () => {} })).toBe(0);
    const s = JSON.parse(lines.join('\n')) as { tasks: Record<string, { trials: number }>; superseded: Record<string, { task: string; version: string; summary: { trials: number; passes: number; fault_counts: { label: unknown } } }> };
    expect(s.superseded['_toy-v1']).toMatchObject({ task: '_toy', version: 'v1', summary: { trials: 2, passes: 2 } });
    expect(s.superseded['_toy-v1']!.summary.fault_counts.label).not.toBeNull();
    expect(s.tasks._toy?.trials ?? 0).toBe(0);
    // replay --tasks of the moved task refuses: its records are gone from the run.
    const out: string[] = [];
    expect(await replay([copy, '--tasks', '_toy'], { out: (l) => out.push(l), err: (l) => out.push(l) })).toBe(1);
    expect(out.join('\n')).toContain(`replay: no settled records of _toy in ${copy}`);
    // A second move of the same version refuses.
    expect((await cli([copy, '--task', '_toy', '--version', 'v1'])).text).toContain(`supersede: no settled records of _toy in ${copy}`);
  });

  it('refuses an existing version directory, a task with no records and a bad version, and moves nothing', async () => {
    const copy = join(tempDir('supersede-refuse'), 'run');
    cpSync(dir, copy, { recursive: true });
    cpSync(join(copy, 'trials'), join(copy, 'superseded/_toy-v1/trials'), { recursive: true });
    const r = await cli([copy, '--task', '_toy', '--version', 'v1']);
    expect(r.code).toBe(1);
    expect(r.text).toContain(`supersede: ${join(copy, 'superseded/_toy-v1')} exists; a version moves once`);
    expect(existsSync(join(copy, 'trials/_toy/0.json'))).toBe(true);
    expect((await cli([copy, '--task', 'nope', '--version', 'v1'])).text).toContain(`supersede: no settled records of nope in ${copy}`);
    expect((await cli([copy, '--task', '_toy', '--version', '1'])).code).toBe(2);
    expect((await cli([copy, '--task', '_toy'])).code).toBe(2);
    expect((await cli([])).code).toBe(2);
  });

  it('a run without replay.json or audit.jsonl moves records and trajectories alone', async () => {
    const copy = join(tempDir('supersede-bare'), 'run');
    cpSync(dir, copy, { recursive: true });
    for (const f of ['replay.json', 'audit.jsonl']) writeFileSync(join(copy, f), '');
    const { rmSync } = await import('node:fs');
    for (const f of ['replay.json', 'audit.jsonl']) rmSync(join(copy, f));
    const r = await cli([copy, '--task', '_toy', '--version', 'v2']);
    expect(r.code, r.text).toBe(0);
    expect(existsSync(join(copy, 'superseded/_toy-v2/replay.json'))).toBe(false);
    expect(existsSync(join(copy, 'superseded/_toy-v2/audit.jsonl'))).toBe(false);
    expect(r.text).toContain('supersede: moved 2 records, 2 trajectories, 0 replay.json entries and 0 audit.jsonl rows of _toy');
  });
});
