// `pnpm cli spend --export <path>` writes the committed copy of the ledger (results/spend.jsonl)
// as a keyed union, so two branches that exported overlapping rows of the one canonical ledger
// merge to one copy (verifier-phase-P17i-A8-1 N2): the destination's rows stay, in order, each
// line once; then each ledger line the destination lacks, in ledger order. A row's key is its
// whole line, since a raised settle shares kind and call_id with the settle it raises
// (verifier-phase-P17i-SPEND-1 F1). And the committed file repeats no line.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot, runScript, tempDir } from '../../../scripts/test/helpers.ts';
import { totals, type LedgerRow } from '../../../packages/core/ledger.ts';
import { readRows, repeatedLines } from '../ledger-node.ts';

const row = (kind: 'reserve' | 'settle', call_id: string, usd = 0.5): LedgerRow => ({ ts: '2026-10-27T00:00:00.000Z', call_id, kind, source: 'node', run_id: 'r', batch_id: null, trial: null, usage: null, cost_usd: usd });
// A reserved and settled call: two rows that share a call_id.
const call = (id: string) => [row('reserve', id), row('settle', id)];
const lines = (rows: LedgerRow[]) => rows.map((r) => `${JSON.stringify(r)}\n`).join('');

function setup(ledger: LedgerRow[], committed?: string) {
  const root = tempDir('spend-export');
  const path = join(root, 'ledger', 'spend.jsonl');
  mkdirSync(join(root, 'ledger'), { recursive: true });
  writeFileSync(path, lines(ledger));
  const out = join(root, 'results', 'spend.jsonl');
  if (committed !== undefined) {
    mkdirSync(join(root, 'results'), { recursive: true });
    writeFileSync(out, committed);
  }
  const run = () => runScript('cli/index.ts', ['spend', '--export', out], { cwd: root, env: { HOME: join(root, 'home'), SPEND_LEDGER: path, CLINENV_CANONICAL_LEDGER: undefined } });
  return { out, run, read: () => readFileSync(out, 'utf8') };
}

describe('spend --export', () => {
  it('keeps the committed rows the ledger lacks and adds only the ledger rows the file lacks, once; a second export changes nothing', () => {
    const main = [...call('m1'), ...call('m2')];
    // The file holds main's rows and another branch's call x; this ledger holds main's and b.
    const e = setup([...main, ...call('b')], lines([...main, ...call('x')]));
    const r = e.run();
    expect(r.status, r.stderr).toBe(0);
    expect(e.read()).toBe(lines([...main, ...call('x'), ...call('b')]));
    expect(r.stdout).toContain('6 rows kept, 2 added, 0 repeated dropped');
    const first = e.read();
    expect(e.run().status).toBe(0);
    expect(e.read()).toBe(first);
  });

  it('two branches whose exports overlap give one copy: re-exported after the rebase, or after a merge that kept both sides', () => {
    const main = call('m1');
    const a7 = [...main, ...call('a7')];
    const a8 = [...main, ...call('a7'), ...call('a8')];
    // A8 rebased on A7's merge takes main's file and exports again from the canonical ledger.
    const rebased = setup(a8, lines(a7));
    expect(rebased.run().status).toBe(0);
    expect(rebased.read()).toBe(lines(a8));
    // A merge that kept both sides' appended rows repeats A7's call; the export drops the repeat.
    const both = setup(a8, lines([...a7, ...call('a7'), ...call('a8')]));
    const r = both.run();
    expect(r.status, r.stderr).toBe(0);
    expect(both.read()).toBe(lines(a8));
    expect(r.stdout).toContain('2 repeated dropped');
  });

  it('refuses a file with a line that is not a ledger row, such as a conflict marker, and leaves it as it was', () => {
    const conflicted = `${lines(call('m1'))}<<<<<<< HEAD\n${lines(call('a7'))}=======\n${lines(call('a8'))}>>>>>>> a8\n`;
    const e = setup([...call('m1'), ...call('a8')], conflicted);
    const r = e.run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/spend\.jsonl:3: not a ledger row .*take one side's copy and export again/);
    expect(e.read()).toBe(conflicted);
  });

  it('keeps a raised settle: a fresh export of a ledger with two settle rows for one call has the ledger\'s totals', () => {
    // ledger.ts: settled is, per call_id, the highest of its settle rows; settle() and ingest()
    // append a second, higher settle (verifier-phase-P17i-SPEND-1 F1).
    const ledger = [row('reserve', 'b1', 0.5), row('settle', 'b1', 0.1), row('settle', 'b1', 0.3)];
    const e = setup(ledger);
    const r = e.run();
    expect(r.status, r.stderr).toBe(0);
    expect(e.read()).toBe(lines(ledger));
    expect(totals(readRows(e.out))).toEqual(totals(ledger));
    expect(totals(ledger).settled).toBeCloseTo(0.3);
  });

  it('strips a trailing carriage return from each kept line, so a CRLF copy gives one LF copy', () => {
    const main = call('m1');
    const e = setup([...main, ...call('b')], lines(main).replaceAll('\n', '\r\n'));
    const r = e.run();
    expect(r.status, r.stderr).toBe(0);
    expect(e.read()).toBe(lines([...main, ...call('b')]));
    expect(r.stdout).toContain('2 rows kept, 2 added, 0 repeated dropped');
  });
});

describe('the committed results/spend.jsonl', () => {
  it('repeats no row line', () => {
    expect(repeatedLines(readFileSync(join(repoRoot, 'results/spend.jsonl'), 'utf8'))).toEqual([]);
  });

  it('the check finds a call that two merged exports both carried', () => {
    expect(repeatedLines(lines([...call('m1'), ...call('a7'), ...call('a7')]))).toEqual(lines(call('a7')).trimEnd().split('\n'));
  });

  it('the check passes a raised settle, two settle rows that differ in cost', () => {
    expect(repeatedLines(lines([...call('m1'), row('settle', 'm1', 0.9)]))).toEqual([]);
  });
});
