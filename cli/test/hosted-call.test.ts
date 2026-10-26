// pnpm cli hosted-call (plan phase P16h), gate case 9: with a temp own-run ledger, reserve then
// settle leaves one reserve, one settle, an open and a close row and no unsettled reservation; a
// repeated call_id adds no row; a reserve whose worst case crosses PROJECTED_CAP_USD is refused.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { totals, PROJECTED_CAP_USD, type LedgerRow } from '../../packages/core/ledger.ts';
import { repoRoot } from '../../scripts/test/helpers.ts';

function ownRunLedger(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'hosted-call-')), 'spend.jsonl');
  writeFileSync(path, '');
  return path;
}

const rows = (path: string): LedgerRow[] => readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as LedgerRow);

function hostedCall(ledger: string, args: string[]) {
  return spawnSync(process.execPath, [join(repoRoot, 'cli/index.ts'), 'hosted-call', ...args], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH ?? '', HOME: mkdtempSync(join(tmpdir(), 'hosted-call-home-')), CLINENV_CANONICAL_LEDGER: ledger },
    encoding: 'utf8',
    timeout: 60_000,
  });
}

const kinds = (rs: LedgerRow[]) => rs.map((r) => r.kind).sort();

describe('hosted-call (gate case 9)', () => {
  it('reserve then settle at a given cost: open, reserve, settle and close rows, nothing unsettled', () => {
    const L = ownRunLedger();
    const r = hostedCall(L, ['reserve', '--call-id', 'p16h-hosted-trial-1', '--usd', '2.5']);
    expect(r.status, r.stderr).toBe(0);
    expect(kinds(rows(L))).toEqual(['open', 'reserve']);
    const reserve = rows(L).find((x) => x.kind === 'reserve')!;
    expect(reserve.cost_usd).toBeGreaterThanOrEqual(2.5);
    expect(reserve.cost_usd).toBeLessThan(2.5 + 1e-5);
    expect(totals(rows(L)).reserved).toBeGreaterThan(0);

    const s = hostedCall(L, ['settle', '--call-id', 'p16h-hosted-trial-1', '--usd', '1.234567']);
    expect(s.status, s.stderr).toBe(0);
    const after = rows(L);
    expect(kinds(after)).toEqual(['close', 'open', 'reserve', 'settle']);
    expect(after.find((x) => x.kind === 'settle')!.cost_usd).toBe(1.234567);
    const t = totals(after);
    expect(t.reserved).toBe(0);
    expect(t.open).toEqual([]);
    expect(t.settled).toBe(1.234567);
  });

  it('settle without --usd settles at the worst case', () => {
    const L = ownRunLedger();
    expect(hostedCall(L, ['reserve', '--call-id', 'p16h-hosted-validate-1', '--usd', '0.04']).status).toBe(0);
    expect(hostedCall(L, ['settle', '--call-id', 'p16h-hosted-validate-1']).status).toBe(0);
    const rs = rows(L);
    expect(rs.find((x) => x.kind === 'settle')!.cost_usd).toBe(rs.find((x) => x.kind === 'reserve')!.cost_usd);
    expect(totals(rs).reserved).toBe(0);
  });

  it('a repeated call_id adds no row, for reserve and for settle', () => {
    const L = ownRunLedger();
    expect(hostedCall(L, ['reserve', '--call-id', 'c1', '--usd', '1']).status).toBe(0);
    const once = rows(L).length;
    const again = hostedCall(L, ['reserve', '--call-id', 'c1', '--usd', '1']);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toMatch(/already reserved/);
    expect(rows(L)).toHaveLength(once);
    expect(hostedCall(L, ['settle', '--call-id', 'c1', '--usd', '0.5']).status).toBe(0);
    const settled = rows(L).length;
    const s2 = hostedCall(L, ['settle', '--call-id', 'c1', '--usd', '0.5']);
    expect(s2.status, s2.stderr).toBe(0);
    expect(s2.stdout).toMatch(/already settled/);
    expect(rows(L)).toHaveLength(settled);
    expect(hostedCall(L, ['reserve', '--call-id', 'c1', '--usd', '1']).status).toBe(0);
    expect(rows(L)).toHaveLength(settled);
  });

  it('refuses a reserve whose worst case crosses PROJECTED_CAP_USD, writing nothing', () => {
    const L = ownRunLedger();
    const r = hostedCall(L, ['reserve', '--call-id', 'big', '--usd', String(PROJECTED_CAP_USD + 1)]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/projected cap/);
    expect(rows(L)).toEqual([]);
  });

  it('refuses a settle with no reservation and bad arguments', () => {
    const L = ownRunLedger();
    expect(hostedCall(L, ['settle', '--call-id', 'none']).status).toBe(1);
    expect(hostedCall(L, ['reserve', '--call-id', 'x']).status).toBe(2);
    expect(hostedCall(L, ['reserve', '--call-id', 'x', '--usd', '-1']).status).toBe(2);
    expect(hostedCall(L, ['reserve', '--call-id', 'a b', '--usd', '1']).status).toBe(2);
    expect(hostedCall(L, ['nope']).status).toBe(2);
    expect(rows(L)).toEqual([]);
  });

  it('refuses without an own-run ledger marker pointing at an existing file', () => {
    const r = spawnSync(process.execPath, [join(repoRoot, 'cli/index.ts'), 'hosted-call', 'reserve', '--call-id', 'x', '--usd', '1'], {
      cwd: repoRoot, env: { PATH: process.env.PATH ?? '', HOME: mkdtempSync(join(tmpdir(), 'hc-')), CLINENV_CANONICAL_LEDGER: join(tmpdir(), 'no-such-dir-hc', 'spend.jsonl') }, encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/own-run spend ledger refused/);
  });
});
