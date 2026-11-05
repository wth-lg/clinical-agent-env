// scripts/docs-gen.ts and scripts/docs-check.ts (plan phase P24). docs-gen builds docs/writeup.html
// from docs/writeup/*.md, docs/findings.md and the blocks it renders from the final run's
// summary.json, packages/core/outcomes.ts, packages/core/summary.ts and docs/requirements/trace.json,
// and fills the caps block of README.md from packages/core/ledger.ts. docs-check regenerates both
// and fails on any difference, runs ste-check, checks the links, the sections, the numbers outside
// generated blocks, that the HTML loads nothing from outside, and the README rules. Each mutation
// the plan names makes it exit 1. Every case runs on a copy of the repo's docs and README with the
// repo's results/ and tasks/ linked in, so the repo itself is never written.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTUAL_CAP_USD, PROJECTED_CAP_USD } from '../../packages/core/ledger.ts';
import { PASS_DEFINITION } from '../../packages/core/outcomes.ts';
import { passK, wilson } from '../../packages/core/summary.ts';
import { LOCAL_START_COMMAND } from '../../apps/web/src/surface/command.ts';
import { generate, WRITEUP } from '../docs-gen.ts';
import { WRITEUP_SECTIONS } from '../docs-lib.ts';
import { repoRoot, runScript, tempDir } from './helpers.ts';

const check = (root: string, args: string[] = []) => runScript('scripts/docs-check.ts', ['--root', root, ...args], { cwd: repoRoot });
const gen = (root: string, args: string[] = []) => runScript('scripts/docs-gen.ts', ['--root', root, ...args], { cwd: repoRoot });

// A copy of the docs the writeup is built from, with results/ and tasks/ linked in and no
// results/official.json (the run directory is linked by name, so a later official.json in the
// repo does not change these cases).
function docsRoot(): string {
  const root = tempDir('docs-root');
  cpSync(join(repoRoot, 'docs'), join(root, 'docs'), { recursive: true });
  cpSync(join(repoRoot, 'README.md'), join(root, 'README.md'));
  mkdirSync(join(root, 'results/runs'), { recursive: true });
  symlinkSync(join(repoRoot, 'results/runs/final-1'), join(root, 'results/runs/final-1'));
  symlinkSync(join(repoRoot, 'tasks'), join(root, 'tasks'));
  return root;
}

// The copy with the writeup and README regenerated from its sources.
function regenerated(root: string): string {
  const out = generate(root);
  writeFileSync(join(root, WRITEUP), out.writeup);
  if (out.readme !== null) writeFileSync(join(root, 'README.md'), out.readme);
  return root;
}

const edit = (root: string, rel: string, from: string | RegExp, to: string) => {
  const text = readFileSync(join(root, rel), 'utf8');
  expect(text, `${rel} holds ${String(from)}`).toMatch(from);
  writeFileSync(join(root, rel), text.replace(from, to));
};

const summary = JSON.parse(readFileSync(join(repoRoot, 'results/runs/final-1/summary.json'), 'utf8')) as { tasks: Record<string, { passes: number; trials: number; pass_k: Record<string, number | null> }> };
const errors = (r: { stdout: string }) => r.stdout.split('\n').filter((l) => l !== '' && !l.startsWith('warning:') && !l.startsWith('info:'));
const warnings = (r: { stdout: string }) => r.stdout.split('\n').filter((l) => l.startsWith('warning:'));

describe('docs-gen', () => {
  it('renders the pass-rate table, pass^k, the definitions and the caps from their sources', () => {
    const { writeup, readme } = generate(docsRoot());
    for (const [id, t] of Object.entries(summary.tasks)) {
      const w = wilson(t.passes, t.trials)!;
      expect(writeup).toContain(`<td><span class="nw">${t.passes}/${t.trials}</span></td>`);
      expect(writeup).toContain(`[${w.lo.toFixed(2)}, ${w.hi.toFixed(2)}]`);
      expect(writeup).toContain(`<th scope="row">${id}</th>`);
      const p3 = passK(t.passes, t.trials, 3)!;
      expect(writeup).toContain(p3 < 0.005 ? '&lt;0.01' : p3.toFixed(2));
    }
    expect(writeup).toContain('<!-- docs-gen:begin outcomes -->');
    expect(writeup).toContain('<!-- docs-gen:end outcomes -->');
    expect(writeup).toContain(PASS_DEFINITION);
    expect(writeup).toContain('<!-- docs-gen:begin pass-rates -->');
    expect(writeup).toContain('<!-- docs-gen:begin trace -->');
    expect(readme).not.toBeNull();
    expect(readme).toContain(`$${PROJECTED_CAP_USD.toLocaleString('en-US')}`);
    expect(readme).toContain(`$${ACTUAL_CAP_USD.toLocaleString('en-US')}`);
  });

  it('loads nothing from outside the file and uses the theme tokens of apps/web', () => {
    const { writeup } = generate(docsRoot());
    expect(writeup).not.toMatch(/<(script|link|img|iframe)\b/);
    expect(writeup).not.toMatch(/@import|url\(/);
    const tokens = readFileSync(join(repoRoot, 'apps/web/src/styles/tokens.css'), 'utf8');
    for (const m of tokens.matchAll(/(--color-[a-z-]+): ([^;]+);/g)) expect(writeup, m[1]).toContain(`${m[1]}: ${m[2]}`);
    expect(writeup).toContain("'Inter', ui-sans-serif, system-ui, sans-serif");
  });

  it('wraps every table in a scroll container, so a phone never scrolls the page sideways (P24A-227 F1)', () => {
    const { writeup } = generate(docsRoot());
    const tables = writeup.match(/<table\b/g) ?? [];
    expect(tables.length).toBeGreaterThan(5);
    expect(writeup.match(/<div class="table-wrap">\n?<table\b/g) ?? []).toHaveLength(tables.length);
    expect(writeup.match(/<\/table>\n?<\/div>/g) ?? []).toHaveLength(tables.length);
  });

  it('lets prose wrap anywhere but keeps table cells whole, so a table scrolls in its box (P24A-227-2 F1)', () => {
    const { writeup } = generate(docsRoot());
    expect(writeup).toMatch(/body \{[^}]*overflow-wrap: anywhere/);
    expect(writeup).toMatch(/\.table-wrap table \{[^}]*overflow-wrap: normal/);
    expect(writeup).toMatch(/\.table-wrap (th, )?td[^{]*\{[^}]*min-width/);
  });

  it('keeps a date, a version, a k/n and a trial id on one line inside a table cell (P24A-227-3 F1)', () => {
    const { writeup } = generate(docsRoot());
    expect(writeup).toMatch(/\.nw \{ white-space: nowrap; \}/);
    // A generated cell: k/n and the Wilson interval; a hand-written cell: a date and a version.
    expect(writeup).toMatch(/<td><span class="nw">\d+\/20<\/span><\/td>/);
    expect(writeup).toMatch(/<td><span class="nw">\[\d\.\d\d, \d\.\d\d\]<\/span><\/td>/);
    expect(writeup).toMatch(/<span class="nw">\(2026-10-25\)<\/span>/);
    expect(writeup).toMatch(/<span class="nw">v0\.25\.0<\/span>/);
    expect(writeup).toMatch(/<a href="[^"]+"><span class="nw">crc-care-gap\/\d+<\/span> \(PASS\)<\/a>/);
    // Never inside a tag: no href holds the span.
    expect(writeup).not.toMatch(/href="[^"]*<span/);
  });

  it('rejects a docs-gen:begin or docs-gen:end comment in a source (P24A-227 F2)', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\n<!-- docs-gen:begin pass-rates -->\nThe model passed 19/20 trials.\n<!-- docs-gen:end pass-rates -->\n\n');
    expect(() => generate(root)).toThrow(/docs\/findings\.md:\d+: .*docs-gen:begin/);
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/docs\/findings\.md:\d+: .*docs-gen:begin/);
    const root2 = docsRoot();
    edit(root2, 'docs/writeup/60-attribution.md', /\n\n/, '\n\n<!-- docs-gen:end outcomes -->\n\n');
    expect(() => generate(root2)).toThrow(/60-attribution\.md:\d+: .*docs-gen:end/);
  });

  it('names the required sections once, and reports the ones the sources lack', () => {
    expect(WRITEUP_SECTIONS).toContain('Instructions');
    expect(WRITEUP_SECTIONS).toContain('References');
    const root = docsRoot();
    writeFileSync(join(root, 'docs/writeup/10-instructions.md'), '# How to run\n\nSee the README.\n');
    expect(generate(root).missing).toEqual(['Instructions']);
    expect(generate(docsRoot()).missing).toEqual([]);
  });

  it('is the same on a second run and --check exits 0 after a write', () => {
    const root = docsRoot();
    expect(gen(root).status).toBe(0);
    const first = readFileSync(join(root, WRITEUP), 'utf8');
    expect(gen(root).status).toBe(0);
    expect(readFileSync(join(root, WRITEUP), 'utf8')).toBe(first);
    expect(gen(root, ['--check']).status).toBe(0);
  });

  it('--check exits 1 and names the file when the written copy differs', () => {
    const root = regenerated(docsRoot());
    edit(root, WRITEUP, /<td><span class="nw">(\d+)\/20<\/span><\/td>/, '<td><span class="nw">19/20</span></td>');
    const r = gen(root, ['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(WRITEUP);
  });

  it('the committed writeup and README equal a fresh regeneration', () => {
    const r = gen(repoRoot, ['--check']);
    expect(r.stdout + r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('docs-check', () => {
  it('exits 0 on the repo, with warnings only for TODO-W5F and TODO-R16', () => {
    const r = check(repoRoot);
    expect(errors(r), r.stdout + r.stderr).toEqual([]);
    for (const w of warnings(r)) expect(w).toMatch(/TODO-(W5F|R16)/);
    expect(r.status).toBe(0);
  });

  it('fails on an edited generated number', () => {
    const root = regenerated(docsRoot());
    edit(root, WRITEUP, /<td><span class="nw">(\d+)\/20<\/span><\/td>/, '<td><span class="nw">19/20</span></td>');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/docs\/writeup\.html.*regenerat/);
  });

  it('fails on a pass rate written in prose', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nThe model passed 12/20 trials, a rate of 60%.\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/docs\/findings\.md:\d+: .*number/);
  });

  it('fails on a k/N in a hand-written source table (P24A-227 F3)', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\n| task | k/n |\n|---|---|\n| a | 12/20 |\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/docs\/findings\.md:\d+: .*number in prose: "12\/20"/);
  });

  it('fails on a dollar amount in README.md outside the caps block (P24A-227 F4)', () => {
    const root = regenerated(docsRoot());
    edit(root, 'README.md', /\n## Links/, '\nA trial costs below $900.\n\n## Links');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/README\.md:\d+: .*\$900/);
  });

  it('catches "k of N", a Unicode slash or percent sign, and a claim phrase (P24A-227-2 F5)', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nThe model passed 12 of 20 trials.\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/number in prose: "12 of 20"/);
    const root2 = docsRoot();
    edit(root2, 'docs/findings.md', /\n\n/, '\n\nIt passed 12\u204420 trials, a rate of 60\uFF05.\n\n');
    const r2 = check(regenerated(root2));
    expect(r2.status).toBe(1);
    expect(r2.stdout).toMatch(/number in prose: "12\/20"/);
    expect(r2.stdout).toMatch(/number in prose: "60%"/);
    for (const phrase of ['MCP support', 'Harbor compatible', 'first clinical']) {
      const root3 = docsRoot();
      edit(root3, 'docs/findings.md', /\n\n/, `\n\nThis is about ${phrase} here.\n\n`);
      const r3 = check(regenerated(root3));
      expect(r3.status, phrase).toBe(1);
      expect(r3.stdout).toMatch(new RegExp(`claim phrase: "${phrase}"`, 'i'));
    }
  });

  it('catches every form of a dollar amount in README.md outside the caps block (P24A-227-2 F6)', () => {
    for (const amount of ['900 USD', '&#36;900', '$.50', '`$900`', 'USD 900', '900 dollars']) {
      const root = regenerated(docsRoot());
      edit(root, 'README.md', /\n## Links/, `\nA trial costs about ${amount} here.\n\n## Links`);
      const r = check(root);
      expect(r.status, amount).toBe(1);
      expect(r.stdout, amount).toMatch(/dollar amount outside the caps block/);
    }
  });

  it('every h2 the trace greps for is a required section (P24A-227-2 F3)', () => {
    const trace = JSON.parse(readFileSync(join(repoRoot, 'docs/requirements/trace.json'), 'utf8')) as { rows: Array<{ expect: unknown }> };
    const greps = trace.rows.flatMap((row) => (Array.isArray(row.expect) ? row.expect : [row.expect]) as Array<{ command?: { cmd: string } }>)
      .flatMap((e) => [...(e.command?.cmd ?? '').matchAll(/grep -qF '>([^<]+)<\/h2>' docs\/writeup\.html/g)].map((m) => m[1]!));
    expect(greps.length).toBeGreaterThan(1);
    for (const h of greps) expect(WRITEUP_SECTIONS as readonly string[], h).toContain(h);
  });

  it('fails on a 30-word step in README.md', () => {
    const root = regenerated(docsRoot());
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    edit(root, 'README.md', /\n1\. /, `\n1. Open ${words}.\n2. `);
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/README\.md:\d+: .*at most 20/);
  });

  it('fails on a denylisted word', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nWe utilize the ledger.\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/"utilize"/);
  });

  it('fails on an external script in writeup.html', () => {
    const root = regenerated(docsRoot());
    edit(root, WRITEUP, '</body>', '<script src="https://example.org/x.js"></script></body>');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/docs\/writeup\.html:\d+: .*script/);
  });

  it('fails on an edited cap value in README.md', () => {
    const root = regenerated(docsRoot());
    edit(root, 'README.md', `$${ACTUAL_CAP_USD.toLocaleString('en-US')}`, '$2,000');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/README\.md.*(regenerat|cap)/);
  });

  it('fails when the Instructions section is removed', () => {
    const root = docsRoot();
    writeFileSync(join(root, 'docs/writeup/10-instructions.md'), '# Instructions\n\nSee the README.\n'.replace('# Instructions', '# How to run'));
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Instructions/);
  });

  it('fails on a broken relative link and on a missing anchor', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nSee [the plan](../missing.md) and [the gap](#no-such-anchor).\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/missing\.md/);
    expect(r.stdout).toMatch(/no-such-anchor/);
  });

  it('fails when README.md gains a findings section, a table or a number', () => {
    const root = regenerated(docsRoot());
    edit(root, 'README.md', /\n## Links/, '\n## Findings\n\n| task | k/n |\n|---|---|\n| a | 12/20 |\n\n## Links');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/README\.md.*(Findings|table|number)/);
  });

  it('fails when README.md drops the start command or the writeup link', () => {
    const root = regenerated(docsRoot());
    edit(root, 'README.md', LOCAL_START_COMMAND, 'pnpm start');
    expect(check(root).stdout).toMatch(/LOCAL_START_COMMAND/);
    const root2 = regenerated(docsRoot());
    edit(root2, 'README.md', /docs\/writeup\.html/g, 'docs/writeup.htm');
    expect(check(root2).status).toBe(1);
  });

  // TODO-W5F waits for the W5 final results, so it is an error only once the official run is
  // complete: results/official.json names a run whose summary has every task of tasks/ final
  // (apps/web/src/overview/band.ts isFinalTask, the predicate the Overview shares). An official.json
  // on a run still in progress (final-1 today: two of six tasks) keeps it a warning.
  it('TODO-W5F is a warning without results/official.json, and with one that names a run still in progress; any other TODO is an error', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nTODO-W5F the W5 tasks.\n\n');
    regenerated(root);
    const r = check(root);
    expect(r.status).toBe(0);
    expect(warnings(r).some((w) => w.includes('TODO-W5F'))).toBe(true);
    writeFileSync(join(root, 'results/official.json'), JSON.stringify({ run: 'runs/final-1' }));
    regenerated(root);
    const r2 = check(root);
    expect(r2.status, r2.stdout).toBe(0);
    expect(warnings(r2).some((w) => w.includes('TODO-W5F') && w.includes('official run not complete: 4 of 6 tasks have no final result'))).toBe(true);
    const root3 = docsRoot();
    edit(root3, 'docs/findings.md', /\n\n/, '\n\nTODO-XYZ later.\n\n');
    expect(check(regenerated(root3)).status).toBe(1);
  });

  it('TODO-W5F is an error once the official run is complete: every task of tasks/ final in its summary', () => {
    const root = docsRoot();
    // An environment of the two tasks final-1 holds, so its official run covers every task.
    rmSync(join(root, 'tasks'));
    mkdirSync(join(root, 'tasks'));
    for (const id of ['crc-care-gap', 'contrast-ct-prep']) symlinkSync(join(repoRoot, 'tasks', id), join(root, 'tasks', id));
    symlinkSync(join(repoRoot, 'tasks/_toy'), join(root, 'tasks/_toy'));
    edit(root, 'docs/findings.md', /\n\n/, '\n\nTODO-W5F the W5 tasks.\n\n');
    writeFileSync(join(root, 'results/official.json'), JSON.stringify({ run: 'runs/final-1' }));
    regenerated(root);
    const r = check(root);
    expect(r.status).toBe(1);
    expect(errors(r).some((l) => l.includes('TODO-W5F with the official run complete (every task final in runs/final-1)'))).toBe(true);
  });

  it('fails when a reference line has no date', () => {
    const root = docsRoot();
    edit(root, 'docs/writeup/90-references.md', /\n- /, '\n- A source with no date, https://example.org/undated.\n- ');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/date/);
  });

  it('exits 2 on a root that has no docs', () => {
    const r = check(tempDir('docs-empty'));
    expect(r.status).toBe(2);
  });

  it('the writeup is at the path the web build copies', () => {
    expect(WRITEUP).toBe('docs/writeup.html');
    expect(existsSync(join(repoRoot, WRITEUP))).toBe(true);
  });
});
