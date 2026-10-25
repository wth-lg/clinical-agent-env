// run-one and Ctrl-C, and --json (plan phase P17i C10, R14-40): SIGINT aborts the trial through
// run()'s signal, so the trial ends CANCELLED with its record written, the call in flight settles
// and run-one closes its ledger grant before it exits 1; --json prints only the record on stdout.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scenarioTransport } from '../../apps/web/src/harness/scenarios.ts';
import { MODEL } from '../../packages/core/anthropic.ts';
import { repoRoot, tempDir } from '../../scripts/test/helpers.ts';
import { readRows } from '../adapters/ledger-node.ts';
import { main } from '../run-one.ts';

const args = (out: string, ...more: string[]) => ['--task', '_toy', '--model', MODEL, '--out', out, '--mock', 'toy', ...more];
const recordOf = (out: string) => JSON.parse(readFileSync(join(out, 'trials', `_toy/${MODEL}/high/mock-toy/0.json`), 'utf8')) as { status: string; outcome: string; trajectory: string };

describe('run-one', { timeout: 120_000 }, () => {
  it('SIGINT ends the trial CANCELLED through run()\'s signal, writes its record and closes the ledger grant', async () => {
    const home = tempDir('sigint-home');
    const ledger = join(home, 'spend.jsonl');
    const out = join(tempDir('sigint-run'), 'run');
    const marker = join(tempDir('sigint-marker'), 'marker');
    const env: Record<string, string> = { ...(process.env as Record<string, string>), HOME: home, SPEND_LEDGER: ledger };
    delete env.CLINENV_CANONICAL_LEDGER;
    delete env.ANTHROPIC_API_KEY;
    const child = spawn(process.execPath, [join(repoRoot, 'cli/test/sigint-child.ts'), marker, ...args(out)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += String(d)));
    const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
    for (let i = 0; i < 600 && !existsSync(marker); i++) await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(marker)).toBe(true);
    child.kill('SIGINT');
    expect(await exited, stdout).toBe(1);

    const record = recordOf(out);
    expect(record).toMatchObject({ status: 'CANCELLED', outcome: 'CANCELLED' });
    expect(stdout).toMatch(/status CANCELLED/);
    const rows = readRows(ledger);
    const batch = rows.find((r) => r.kind === 'open')!.batch_id;
    expect(rows.filter((r) => r.kind === 'close' && r.batch_id === batch)).toHaveLength(1);
    // Every call reserved settled, the one in flight at its worst case included.
    const reserved = new Set(rows.filter((r) => r.kind === 'reserve').map((r) => r.call_id));
    const settled = new Set(rows.filter((r) => r.kind === 'settle').map((r) => r.call_id));
    expect(reserved.size).toBe(2);
    expect([...reserved].filter((c) => !settled.has(c))).toEqual([]);
  });

  it('--json prints only the record on stdout, the report lines on stderr', async () => {
    const home = tempDir('json-home');
    const outDir = join(tempDir('json-run'), 'run');
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await main(args(outDir, '--json'), {
      env: { HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl') }, out: (l) => stdout.push(l), err: (l) => stderr.push(l),
      fetch: () => Promise.reject(new Error('no live call')), mock: (name) => scenarioTransport(name).transport,
    });
    expect(code, stderr.join('\n')).toBe(0);
    expect(stdout).toHaveLength(1);
    const printed = JSON.parse(stdout[0]!) as { outcome: string; status: string };
    expect(printed).toEqual(recordOf(outDir));
    expect(printed).toMatchObject({ status: 'COMPLETED', outcome: 'PASS' });
    expect(stderr.join('\n')).toMatch(/status COMPLETED.*\n.*outcome PASS/s);
    // A trial already recorded is not run again; --json prints its record.
    const again: string[] = [];
    expect(await main(args(outDir, '--json'), { env: { HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl') }, out: (l) => again.push(l), err: () => {}, fetch: () => Promise.reject(new Error('no')), mock: (name) => scenarioTransport(name).transport })).toBe(0);
    expect(again.map((l) => JSON.parse(l))).toEqual([printed]);
  });
});
