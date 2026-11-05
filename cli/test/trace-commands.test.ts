// verifier-phase-P17i-TWOW-229-1 S1: a run directory under results/ is historical data (R37).
// replay, regrade and summary --write always write into the run directory, so no command
// docs/requirements/trace.json runs (trace-check --final runs them in the repo root) may name a
// committed run as the directory such a command writes into; it copies the run first.
// (audit-check writes audit.jsonl back only when a label's criteria changed, so W6 reads the
// committed run as the pilot READMEs do.)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../../scripts/test/helpers.ts';

// A row's expect is one element or a list; an element is an object ({command}, {ax_text},
// {ax_match}) or, on a row not yet filled, a kind name.
type Expect = string | { command?: { cmd: string } };
type Row = { id: string; expect?: Expect | Expect[] };
const rows = (JSON.parse(readFileSync(join(repoRoot, 'docs/requirements/trace.json'), 'utf8')) as { rows: Row[] }).rows;
const elements = (r: Row): Expect[] => (r.expect === undefined ? [] : Array.isArray(r.expect) ? r.expect : [r.expect]);
const commands = rows.flatMap((r) => elements(r).flatMap((e) => (typeof e === 'object' && e.command ? [{ id: r.id, cmd: e.command.cmd }] : [])));

// A writing command whose run argument is a committed results/ directory.
const WRITES = /pnpm cli (replay|regrade) results\/|pnpm cli summary results\/[^&|;]*--write/;

describe('trace.json commands on committed runs', () => {
  it('the trace has replay commands, and each runs on a copy of the run, never on results/ itself', () => {
    const replays = commands.filter((c) => /pnpm cli replay/.test(c.cmd));
    expect(replays.map((c) => c.id)).toEqual(expect.arrayContaining(['N13', 'W4', 'H1']));
    for (const c of commands) expect(c.cmd, `${c.id}: ${c.cmd}`).not.toMatch(WRITES);
    for (const c of replays) expect(c.cmd, `${c.id} copies the run before replaying it`).toMatch(/cp -R results\/runs\/final-1 /);
  });
});
