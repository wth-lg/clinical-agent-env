// The app's CSP lives in one constant, APP_CSP in apps/web/csp.ts (P16h PR-web-1, UD-4): the
// Vite build writes it into index.html, and every file that pins the CSP imports it. The test
// pages (probe.html, harness.html, relay-probe.html) keep their own CSP meta.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_CSP, CONNECT_ORIGIN } from '../csp.ts';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(webRoot, '..', '..');
const HOST = ['api', 'anthropic', 'com'].join('.');
const metaCsp = (html: string) => /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];

// One default build (the one the e2e runs serve) to a temp outDir, so apps/web/dist is left as it is.
let out: string | undefined;
function built(page: string): string {
  if (out === undefined) {
    out = mkdtempSync(join(tmpdir(), 'csp-build-'));
    const r = spawnSync(join(webRoot, 'node_modules/.bin/vite'), ['build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: webRoot, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`vite build exited ${r.status}: ${r.stderr}`);
  }
  return readFileSync(join(out, page), 'utf8');
}

describe('APP_CSP', () => {
  it('is the design string, unchanged by the extraction', () => {
    // Spelled with SELF so this file is not a hit of the connect-src grep below.
    const SELF = "'self'";
    expect(APP_CSP).toBe(`default-src ${SELF}; connect-src ${SELF} https://${HOST}; script-src ${SELF}; worker-src ${SELF} blob:`);
    expect(CONNECT_ORIGIN).toBe(`https://${HOST}`);
  });

  it('the source index.html carries no CSP meta: the build writes it', () => {
    expect(metaCsp(readFileSync(join(webRoot, 'index.html'), 'utf8'))).toBeUndefined();
  });

  it.each(['index.html', 'harness.html', 'probe.html'])('the built %s carries APP_CSP', (page) => {
    const html = built(page);
    expect(metaCsp(html)).toBe(APP_CSP);
    // Exactly one CSP meta, ahead of every script.
    expect(html.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1);
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
  });

  it('no other source spells out a connect-src: the CSP is written once', () => {
    const pattern = ['connect-src', "'self'"].join(' ');
    const hits = execFileSync('git', ['grep', '-lF', pattern, '--', 'apps', 'cli', 'scripts', 'eslint-rules'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n').sort();
    expect(hits).toEqual(['apps/web/csp.ts', 'apps/web/harness.html', 'apps/web/probe.html', 'apps/web/relay-probe.html']);
  });
});
