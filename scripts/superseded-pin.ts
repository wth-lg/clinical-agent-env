// node scripts/superseded-pin.ts [--write]
// Pins the records of every superseded version of the official run (R42: results/runs/final-1/
// superseded/<task>-v<n>/, moved byte-identical by cli supersede and never counted) by sha256:
// results/runs/final-1/superseded/sha256.json maps each data file (trials, trajectories, replay.json,
// audit.jsonl; the hand-written README.md is not data) to its digest. Without --write it prints
// each file that differs from the pin, or is missing, or is unpinned, and exits 1 on any; with
// --write it rewrites the pin from the files as they are (only after a deliberate change, such as
// a regrade recorded in the version's README). scripts/test/superseded-pin.test.ts runs the check,
// so a changed current outcome under superseded/ fails the suite (gate W5F-238 F4: summary,
// replay=all and audit-check do not read those records).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPERSEDED = 'results/runs/final-1/superseded';
export const PIN = `${SUPERSEDED}/sha256.json`;
const DATA = /^[^/]+\/(trials|trajectories|requeued)\/.*\.(json|jsonl)$|^[^/]+\/(replay\.json|audit\.jsonl)$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (statSync(p).isFile()) out.push(p);
  }
  return out;
}
// The digests of every data file under the superseded directory, keyed by its path relative to it.
export function digests(root: string): Record<string, string> {
  const base = join(root, SUPERSEDED);
  const out: Record<string, string> = {};
  for (const p of walk(base).sort()) {
    const rel = relative(base, p);
    if (DATA.test(rel)) out[rel] = createHash('sha256').update(readFileSync(p)).digest('hex');
  }
  return out;
}
export function readPin(root: string): Record<string, string> | null {
  const p = join(root, PIN);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as { files: Record<string, string> }).files : null;
}
// The differences between the pin and the files: each line names one file and what is wrong.
export function check(root: string): string[] {
  const pin = readPin(root);
  if (pin === null) return [`${PIN}: missing; write it with node scripts/superseded-pin.ts --write`];
  const now = digests(root);
  const lines: string[] = [];
  for (const [f, h] of Object.entries(pin)) {
    if (!(f in now)) lines.push(`${SUPERSEDED}/${f}: pinned but missing`);
    else if (now[f] !== h) lines.push(`${SUPERSEDED}/${f}: differs from its pin (sha256 ${now[f]!.slice(0, 12)}, pinned ${h.slice(0, 12)})`);
  }
  for (const f of Object.keys(now)) if (!(f in pin)) lines.push(`${SUPERSEDED}/${f}: not pinned`);
  return lines;
}
export function write(root: string): number {
  const files = digests(root);
  writeFileSync(join(root, PIN), `${JSON.stringify({ schema_version: 1, note: 'sha256 of every data file of each superseded version (R42), checked by scripts/test/superseded-pin.test.ts; rewrite with node scripts/superseded-pin.ts --write after a deliberate change', files }, null, 2)}\n`);
  return Object.keys(files).length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.cwd();
  if (process.argv.includes('--write')) {
    process.stdout.write(`pinned ${write(root)} files in ${PIN}\n`);
  } else {
    const lines = check(root);
    for (const l of lines) process.stdout.write(`${l}\n`);
    process.stdout.write(lines.length === 0 ? `superseded-pin: every pinned file holds (${Object.keys(readPin(root) ?? {}).length})\n` : `superseded-pin: ${lines.length} problem(s)\n`);
    process.exitCode = lines.length === 0 ? 0 : 1;
  }
}
