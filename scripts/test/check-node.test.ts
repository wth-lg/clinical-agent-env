// scripts/check-node.mjs, which `pnpm start` runs before it installs anything: it reads the
// minimum Node version from engines.node in the package.json one directory above it and exits 1
// with one plain sentence naming the version found. An optional argument stands in for this
// Node's version, so the tests can check versions other than the one running them.
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { LOCAL_PREREQUISITES, NODE_INSTALL_URL, PNPM_INSTALL_URL } from '../../apps/web/src/surface/command.ts';
import { repoRoot, tempDir, write } from './helpers.ts';

const SCRIPT = join(repoRoot, 'scripts/check-node.mjs');
// Without pnpm's npm_config_user_agent (pnpm test sets it), so a case names its own pnpm.
const { npm_config_user_agent: _ua, ...BARE_ENV } = process.env;
const runWith = (env: Record<string, string | undefined>, script: string, ...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: tempDir('check-node-cwd'), encoding: 'utf8', env: { ...BARE_ENV, ...env } });
const run = (script: string, ...args: string[]) => runWith({}, script, ...args);
const sentence = (version: string) =>
  `clinical-agent-env needs Node.js 22.18 or newer; this computer has ${version}. Install Node.js from ${NODE_INSTALL_URL}, then run the command again.\n`;
const pnpmSentence = (version: string) =>
  `clinical-agent-env needs pnpm 12 or newer; this computer has pnpm ${version}. Install pnpm from ${PNPM_INSTALL_URL}, then run the command again.\n`;

// A copy of the script under <dir>/scripts with the given engines in <dir>/package.json.
function withEngines(engines: unknown): string {
  const dir = tempDir('check-node');
  write(dir, 'package.json', JSON.stringify({ name: 'x', engines }));
  write(dir, 'scripts/.keep', '');
  copyFileSync(SCRIPT, join(dir, 'scripts/check-node.mjs'));
  return join(dir, 'scripts/check-node.mjs');
}

describe('check-node', () => {
  it('passes silently on this Node, from any directory', () => {
    const r = run(SCRIPT);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
  });

  for (const version of ['22.18.0', '24.11.0', '26.12.0']) {
    it(`exits 0 with no output for Node ${version}`, () => {
      const r = run(SCRIPT, version);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout + r.stderr).toBe('');
    });
  }

  for (const version of ['20.19.0', '22.17.1']) {
    it(`exits 1 with one sentence naming Node ${version}`, () => {
      const r = run(SCRIPT, version);
      expect(r.status).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toBe(sentence(version));
    });
  }

  it('compares numerically, not as text', () => {
    expect(run(SCRIPT, '22.100.0').status).toBe(0);
    expect(run(SCRIPT, '100.0.0').status).toBe(0);
    expect(run(SCRIPT, '9.99.99').status).toBe(1);
  });

  it('reads the minimum from engines.node', () => {
    expect(run(withEngines({ node: '>=24.1', pnpm: '>=12' }), '24.0.9').stderr).toContain('needs Node.js 24.1 or newer; this computer has 24.0.9.');
    expect(run(withEngines({ node: '>=24.1', pnpm: '>=12' }), '24.1.0').status).toBe(0);
  });

  it('exits 1 when engines.node is missing or not of the form >=X.Y', () => {
    expect(run(withEngines(undefined)).status).toBe(1);
    expect(run(withEngines({ node: '^22', pnpm: '>=12' })).status).toBe(1);
  });

  // pre-audit-2 S17: the pnpm minimum is engines.pnpm (">=X", the packageManager pin's major).
  // pnpm names its version in npm_config_user_agent when it runs a script, as `pnpm start` does;
  // a second argument stands in for it (tests only). Run by plain node outside pnpm, the script
  // has no pnpm version to compare and checks Node alone.
  describe('pnpm minimum', () => {
    it('exits 0 with no output for pnpm 12.0.0 and newer, by the argument or the user agent', () => {
      for (const version of ['12.0.0', '12.14.0', '13.1.0']) {
        const r = run(SCRIPT, '26.12.0', version);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout + r.stderr).toBe('');
        const u = runWith({ npm_config_user_agent: `pnpm/${version} npm/? node/v26.12.0 darwin arm64` }, SCRIPT);
        expect(u.status, u.stderr).toBe(0);
        expect(u.stdout + u.stderr).toBe('');
      }
    });

    it('exits 1 with one sentence naming the pnpm found, by the argument or the user agent', () => {
      for (const version of ['11.9.9', '10.20.0', '9.0.0']) {
        const r = run(SCRIPT, '26.12.0', version);
        expect(r.status).toBe(1);
        expect(r.stdout).toBe('');
        expect(r.stderr).toBe(pnpmSentence(version));
        const u = runWith({ npm_config_user_agent: `pnpm/${version} npm/? node/v26.12.0 darwin arm64` }, SCRIPT);
        expect(u.status).toBe(1);
        expect(u.stderr).toBe(pnpmSentence(version));
      }
    });

    it('compares numerically and reads the minimum from engines.pnpm', () => {
      expect(run(SCRIPT, '26.12.0', '100.0.0').status).toBe(0);
      expect(run(SCRIPT, '26.12.0', '9.99.99').status).toBe(1);
      expect(run(withEngines({ node: '>=22.18', pnpm: '>=13' }), '26.12.0', '12.14.0').stderr).toContain('needs pnpm 13 or newer; this computer has pnpm 12.14.0.');
      expect(run(withEngines({ node: '>=22.18', pnpm: '>=13' }), '26.12.0', '13.0.0').status).toBe(0);
    });

    it('names an old Node first, in one sentence, when both are old', () => {
      const r = run(SCRIPT, '22.17.1', '11.0.0');
      expect(r.status).toBe(1);
      expect(r.stderr).toBe(sentence('22.17.1'));
    });

    it('exits 1 when another package manager runs it', () => {
      const r = runWith({ npm_config_user_agent: 'npm/10.9.0 node/v26.12.0 darwin arm64' }, SCRIPT);
      expect(r.status).toBe(1);
      expect(r.stderr).toBe(`clinical-agent-env needs pnpm 12 or newer; this command was run with npm. Install pnpm from ${PNPM_INSTALL_URL}, then run the command again with pnpm.\n`);
    });

    it('exits 1 when engines.pnpm is missing or not of the form >=X', () => {
      expect(run(withEngines({ node: '>=22.18' }), '26.12.0', '12.14.0').status).toBe(1);
      expect(run(withEngines({ node: '>=22.18', pnpm: '^12' }), '26.12.0', '12.14.0').status).toBe(1);
    });
  });

  it('names the same version as LOCAL_PREREQUISITES and package.json', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { engines: { node: string; pnpm: string }; packageManager: string };
    expect(pkg.engines.node).toBe('>=22.18');
    expect(LOCAL_PREREQUISITES).toContain('Node.js 22.18 or newer');
    // The pnpm minimum is the packageManager pin's major, so a pin bump moves it.
    const major = /^pnpm@(\d+)\.\d+\.\d+$/.exec(pkg.packageManager)?.[1];
    expect(major).toBeDefined();
    expect(pkg.engines.pnpm).toBe(`>=${major}`);
    expect(pkg.engines.pnpm).toBe('>=12');
  });

  it('runs first in pnpm start, and on its own as pnpm check-node', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { scripts: { start: string; 'check-node': string } };
    expect(pkg.scripts.start).toBe('node scripts/check-node.mjs && pnpm install --frozen-lockfile && pnpm build && node apps/runner/main.ts');
    expect(pkg.scripts['check-node']).toBe('node scripts/check-node.mjs');
  });

  it('runs before any install: pnpm does not install before a script', () => {
    // pnpm 12 defaults verify-deps-before-run to install, which would put a full install ahead of
    // the check on an old Node; pnpm start installs itself, after the check.
    const ws = parse(readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')) as { verifyDepsBeforeRun?: unknown };
    expect(ws.verifyDepsBeforeRun).toBe(false);
  });

  it('has no type syntax and no import beyond node:fs, so an old Node parses it', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect([...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1])).toEqual(['node:fs']);
    // Strip-only parse check: the file must load as plain JavaScript with type stripping off.
    const r = spawnSync(process.execPath, ['--no-experimental-strip-types', '--check', SCRIPT], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
  });
});
