// scripts/ste-check.ts (plan phase P24): the ASD-STE 100 rules the writeup and README hold to.
// A step (an item of a numbered list) starts with a verb in the imperative, holds one instruction
// and at most 20 words; any other sentence holds at most 25 words; no word of
// scripts/ste/denylist.txt appears in prose. Code spans, fenced code, tables and the blocks
// docs-gen writes are not prose. Each finding is file:line, the rule, the text and the fix.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot, runScript, tempDir, write } from './helpers.ts';

const ste = (cwd: string, args: string[]) => runScript('scripts/ste-check.ts', args, { cwd });

function md(name: string, text: string): { cwd: string; file: string } {
  const cwd = tempDir('ste');
  write(cwd, name, text);
  return { cwd, file: name };
}

const CLEAN = `# Quick start

Install the tools first.

1. Open a terminal.
2. Run \`git clone https://example.org/x && cd x && pnpm start\`.
3. If the command stops, install Node.js from the link it prints.

The runner prints the URL of the UI. It listens on 127.0.0.1 only.
`;

describe('ste-check', () => {
  it('exits 0 and prints nothing on clean prose', () => {
    const { cwd, file } = md('clean.md', CLEAN);
    const r = ste(cwd, [file]);
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('fails a step over 20 words and names file:line with the fix', () => {
    const long = 'Open the terminal and then type the long command that clones the repository, installs every dependency, builds the UI and starts the runner on your computer.';
    const { cwd, file } = md('long-step.md', `# Steps\n\n1. Open a terminal.\n2. ${long}\n`);
    const r = ste(cwd, [file]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^long-step\.md:4: /m);
    expect(r.stdout).toContain('at most 20');
  });

  it('fails a step that is not in the imperative', () => {
    const { cwd, file } = md('mood.md', '# Steps\n\n1. The runner starts and prints the URL.\n');
    const r = ste(cwd, [file]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^mood\.md:3: .*imperative/m);
  });

  it('accepts a condition before the instruction', () => {
    const { cwd, file } = md('cond.md', '# Steps\n\n1. If the key is rejected, paste it again.\n2. To stop the runner, press Ctrl-C.\n3. On Windows, use PowerShell 7.\n');
    const r = ste(cwd, [file]);
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('fails a step with two instructions', () => {
    const { cwd, file } = md('two.md', '# Steps\n\n1. Open the URL. Paste the key.\n');
    const r = ste(cwd, [file]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^two\.md:3: .*one instruction/m);
  });

  it('fails a descriptive sentence over 25 words', () => {
    const words = Array.from({ length: 26 }, (_, i) => `word${i}`).join(' ');
    const { cwd, file } = md('long.md', `# Notes\n\nShort one. ${words}.\n`);
    const r = ste(cwd, [file]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^long\.md:3: .*at most 25/m);
  });

  it('fails a denylisted word and names its replacement', () => {
    const { cwd, file } = md('deny.md', '# Notes\n\nWe utilize the ledger.\n');
    const r = ste(cwd, [file]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^deny\.md:3: .*"utilize".*"use"/m);
  });

  it('a custom denylist replaces the default one', () => {
    const { cwd, file } = md('deny2.md', '# Notes\n\nWe utilize the ledger. The ledger is frobnicated.\n');
    write(cwd, 'deny.txt', '# word: replacement\nfrobnicated: changed\n');
    const r = ste(cwd, ['--denylist', 'deny.txt', file]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('"frobnicated"');
    expect(r.stdout).not.toContain('"utilize"');
  });

  it('counts a code span as one word and skips fenced code, tables and comments', () => {
    const cmd = '`git clone https://example.org/clinical-agent-env && cd clinical-agent-env && pnpm install --frozen-lockfile && pnpm build && node apps/runner/main.ts`';
    const fence = Array.from({ length: 40 }, (_, i) => `token${i}`).join(' ');
    const { cwd, file } = md('code.md', `# Steps\n\n1. Run ${cmd}.\n\n\`\`\`sh\n${fence}\n\`\`\`\n\n| a | b |\n|---|---|\n| ${fence} | x |\n\n<!-- ${fence} -->\n`);
    const r = ste(cwd, [file]);
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('reads the prose of an HTML file: steps in ol, paragraphs, no pre, table or generated block', () => {
    const words = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const html = [
      '<!doctype html><html><body>',
      `<pre>${words}</pre>`,
      `<table><tr><td>${words}</td></tr></table>`,
      `<!-- docs-gen:begin outcomes --><p>${words}</p><!-- docs-gen:end outcomes -->`,
      '<ol><li data-src="docs/writeup/a.md:7">Paste the key into the <code>key field that has many words in it</code>.</li>',
      `<li data-src="docs/writeup/a.md:9">Open ${words}.</li></ol>`,
      '<ul><li>A bullet is prose, so it need not be a command.</li></ul>',
      '<p>We utilize nothing.</p>',
      '</body></html>',
    ].join('\n');
    const { cwd, file } = md('page.html', html);
    const r = ste(cwd, [file]);
    expect(r.status).toBe(1);
    const lines = r.stdout.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^docs\/writeup\/a\.md:9: .*at most 20/);
    expect(lines[1]).toMatch(/^page\.html:8: .*"utilize"/);
  });

  it('exits 2 on a file it cannot read', () => {
    const r = ste(tempDir('ste-missing'), ['missing.md']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('missing.md');
  });

  it('the default files are README.md and docs/writeup.html, and both pass', () => {
    const r = ste(repoRoot, []);
    expect(r.stdout + r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('the denylist pairs each word with its replacement', () => {
    const lines = readFileSync(join(repoRoot, 'scripts/ste/denylist.txt'), 'utf8').split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));
    expect(lines.length).toBeGreaterThan(20);
    for (const l of lines) expect(l, l).toMatch(/^[a-z][a-z./' -]*: \S/);
  });
});
