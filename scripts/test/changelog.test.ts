import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot, runScript, tempDir, write } from './helpers.ts';

const changelog = (...args: string[]) => runScript('scripts/changelog.ts', args, { cwd: repoRoot });

// A results dir holding the given fragments and no CHANGELOG.md yet.
function results(fragments: Record<string, string>): string {
  const dir = tempDir('changelog');
  write(dir, 'changelog.d/.gitkeep', '');
  for (const [name, text] of Object.entries(fragments)) write(dir, `changelog.d/${name}`, text);
  return dir;
}

const read = (dir: string) => readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');

// The header the script writes, taken from a rewrite with no fragments.
const HEADER = (() => {
  const dir = results({});
  if (changelog(dir).status !== 0) throw new Error('rewrite of an empty results dir failed');
  return read(dir);
})();

const line = (name: string, entry: string) => `${entry} <!-- changelog.d/${name} -->\n`;

describe('pnpm changelog', () => {
  // A PR adds a fragment and does not fold it, so the repo may hold fragments not folded yet.
  it('passes --check on the repo', () => {
    const r = changelog('--check');
    expect(r.stderr).toMatch(/^changelog: ok, \d+ fragment\(s\), /m);
    expect(r.status).toBe(0);
  });

  it('folds fragments in file-name order, the name without .md deciding, and is idempotent', () => {
    const dir = results({ '20261028-b.md': '- second b\n', '20261027-z.md': '- first\n', '20261028-b-more.md': '- second b more\n', '20261028-a.md': '- second a' });
    expect(changelog(dir).status).toBe(0);
    const out = read(dir);
    expect(out).toBe(HEADER + line('20261027-z.md', '- first') + line('20261028-a.md', '- second a') + line('20261028-b.md', '- second b') + line('20261028-b-more.md', '- second b more'));
    expect(changelog(dir).status).toBe(0);
    expect(read(dir)).toBe(out);
    expect(changelog('--check', dir).stderr).toContain('4 fragment(s), all folded');
  });

  it('passes a fragment not folded yet or changed since its fold, and the rewrite brings each up to date, naming each line it restores', () => {
    const dir = results({ '20261027-a.md': '- first\n', '20261027-c.md': '- third\n' });
    expect(changelog(dir).status).toBe(0);
    write(dir, 'changelog.d/20261027-a.md', '- first, fixed\n');
    write(dir, 'changelog.d/20261028-d.md', '- fourth\n');
    const r = changelog('--check', dir);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('3 fragment(s), 2 not folded yet or changed since; a PR leaves them, the fold runs on main');
    const w = changelog(dir);
    expect(w.status).toBe(0);
    expect(w.stderr).toMatch(/restored .*CHANGELOG\.md:\d+ from changelog\.d\/20261027-a\.md/);
    expect(read(dir)).toBe(HEADER + line('20261027-a.md', '- first, fixed') + line('20261027-c.md', '- third') + line('20261028-d.md', '- fourth'));
  });

  it('names a hand edit of a folded line when the rewrite undoes it', () => {
    const dir = results({ '20261027-a.md': '- first\n' });
    write(dir, 'CHANGELOG.md', HEADER + line('20261027-a.md', '- first, edited by hand'));
    expect(changelog('--check', dir).status).toBe(0);
    const w = changelog(dir);
    expect(w.status).toBe(0);
    expect(w.stderr).toMatch(/restored .*CHANGELOG\.md:\d+ from changelog\.d\/20261027-a\.md/);
    expect(read(dir)).toBe(HEADER + line('20261027-a.md', '- first'));
  });

  it('fails a line whose fragment does not exist, a removed fragment included; only the rewrite with --drop-removed drops it', () => {
    const dir = results({ '20261027-a.md': '- first\n', '20261027-b.md': '- second\n' });
    expect(changelog(dir).status).toBe(0);
    rmSync(join(dir, 'changelog.d/20261027-b.md'));
    const before = read(dir);
    const r = changelog('--check', dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/CHANGELOG\.md:\d+: '- second[^']*' names changelog\.d\/20261027-b\.md, which does not exist; add that fragment, or if it was removed on purpose run pnpm changelog --drop-removed on main/);
    expect(changelog(dir).status).toBe(1);
    expect(read(dir)).toBe(before);
    const w = changelog('--drop-removed', dir);
    expect(w.status).toBe(0);
    expect(w.stderr).toMatch(/dropped .*CHANGELOG\.md:\d+ changelog\.d\/20261027-b\.md, which no fragment holds now/);
    expect(read(dir)).toBe(HEADER + line('20261027-a.md', '- first'));
  });

  it('fails a line added by hand, at the end or among folded lines, and the rewrite keeps the file as it is', () => {
    const frags = { '20261027-a.md': '- first\n' };
    for (const text of [
      `${HEADER}${line('20261027-a.md', '- first')}- added by hand\n`,
      `${HEADER}- added by hand\n${line('20261027-a.md', '- first')}`,
      `${HEADER}${line('20261027-a.md', '- first')}${line('hand.md', '- added by hand')}`,
      // The tag of the line above copied and its date moved on: it names no fragment that exists.
      `${HEADER}${line('20261027-a.md', '- first')}${line('20261028-hand.md', '- added by hand')}`,
    ]) {
      const dir = results(frags);
      write(dir, 'CHANGELOG.md', text);
      const r = changelog('--check', dir);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/CHANGELOG\.md:\d+: '- added by hand[^']*' names (no fragment; add it as changelog\.d\/<YYYYMMDD>-<id>\.md instead|changelog\.d\/20261028-hand\.md, which does not exist; add that fragment)/);
      const w = changelog(dir);
      expect(w.status).toBe(1);
      expect(w.stderr).toContain('not written');
      expect(read(dir)).toBe(text);
    }
  });

  it('fails an edited header, a line added above the entries included', () => {
    for (const text of [HEADER.replace('\n\n', '\n\n- added by hand\n'), HEADER.replace('do not edit', 'edit'), '# Results changelog\n\n- legacy\n']) {
      const dir = results({});
      write(dir, 'CHANGELOG.md', text);
      const r = changelog('--check', dir);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('the header must be the one scripts/changelog.ts writes');
      expect(changelog(dir).status).toBe(1);
      expect(read(dir)).toBe(text);
    }
  });

  it('fails a missing CHANGELOG.md, which the rewrite creates', () => {
    const dir = results({ '20261027-a.md': '- first\n' });
    expect(changelog('--check', dir).status).toBe(1);
    expect(changelog(dir).status).toBe(0);
    expect(read(dir)).toBe(HEADER + line('20261027-a.md', '- first'));
  });

  it('fails folded lines out of file-name order or folded twice, which the rewrite puts right', () => {
    const frags = { '20261027-a.md': '- first\n', '20261028-b.md': '- second\n' };
    for (const body of [line('20261028-b.md', '- second') + line('20261027-a.md', '- first'), line('20261027-a.md', '- first') + line('20261027-a.md', '- first')]) {
      const dir = results(frags);
      write(dir, 'CHANGELOG.md', HEADER + body);
      const r = changelog('--check', dir);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/CHANGELOG\.md:\d+: changelog\.d\/20261027-a\.md is out of file-name order or folded twice; run pnpm changelog/);
      expect(changelog(dir).status).toBe(0);
      expect(read(dir)).toBe(HEADER + line('20261027-a.md', '- first') + line('20261028-b.md', '- second'));
    }
  });

  it('fails a malformed fragment', () => {
    const cases: Array<[string, string]> = [
      ['20261027-a.md', '- one\n- two\n'],
      ['20261027-a.md', 'no dash\n'],
      ['20261027-a.md', '-  \n'],
      ['20261027-a.md', '- carriage return\r\n'],
      ['20261027-a.md', '- has <!-- a comment -->\n'],
      ['20261327-a.md', '- bad month\n'],
      ['20261131-a.md', '- no 31 November\n'],
      ['2026-10-27-a.md', '- bad name\n'],
      ['20261027-A b.md', '- bad id\n'],
      ['20261027-a.txt', '- not markdown\n'],
    ];
    for (const [name, text] of cases) {
      const r = changelog('--check', results({ [name]: text }));
      expect(r.status, `${name}: ${JSON.stringify(text)}`).toBe(1);
      expect(r.stdout).toContain(`changelog.d/${name}`);
    }
  });

  it('fails two fragments with one entry, and a directory with a fragment name', () => {
    const twins = changelog('--check', results({ '20261027-a.md': '- same\n', '20261028-b.md': '- same\n' }));
    expect(twins.status).toBe(1);
    expect(twins.stdout).toMatch(/20261028-b\.md: repeats the entry of .*20261027-a\.md/);
    const dir = results({});
    mkdirSync(join(dir, 'changelog.d/20261027-a.md'));
    const r = changelog(dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('20261027-a.md: is not a file');
  });

  it('skips names starting with a dot, such as .DS_Store', () => {
    const dir = results({ '.DS_Store': 'binary', '.20261027-a.md.swp': 'x' });
    expect(changelog(dir).status).toBe(0);
    expect(changelog('--check', dir).status).toBe(0);
    expect(read(dir)).toBe(HEADER);
  });

  it('exits 2 on a usage error', () => {
    expect(changelog('--bogus').status).toBe(2);
    expect(changelog('--check', 'a', 'b').status).toBe(2);
    expect(changelog('--check', join(tempDir('changelog'), 'none')).status).toBe(2);
    expect(changelog('--check', '--drop-removed').status).toBe(2);
  });
});
