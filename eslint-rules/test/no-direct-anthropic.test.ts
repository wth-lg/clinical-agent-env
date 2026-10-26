import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { APP_CSP } from '../../apps/web/csp.ts';
import { RELAY_ORIGIN, RELAY_URL } from '../../apps/web/src/surface/relay.ts';

// Lints code through the real eslint.config.js as if it lived at a repo path, so these tests
// cover the rule and its file scope together.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const eslint = new ESLint({ cwd: root });
async function ruleIds(code: string, path: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const RULE = 'local/no-direct-anthropic';
const HOST = ['api', 'anthropic', 'com'].join('.');
const RELAY_HOST = new URL(RELAY_ORIGIN).hostname;

describe('no-direct-anthropic', () => {
  it.each([
    `export const r = fetch('https://${HOST}/v1/messages');`,
    `export const r = fetch(\`https://${HOST}/v1/\${'messages'}\`);`,
    `export const u = new URL('/v1/messages', 'https://${HOST}');`,
    `export const h = '${HOST}';`,
  ])('flags %s in cli/', async (code) => {
    expect(await ruleIds(code, 'cli/planted.ts')).toContain(RULE);
  });

  it.each(['apps/web/src/a.ts', 'apps/web/e2e/live/a.spec.ts', 'scripts/a.ts', 'packages/core/loop.ts', 'packages/core/test/a.test.ts'])(
    'applies in %s',
    async (path) => {
      expect(await ruleIds(`export const r = fetch('https://${HOST}/v1/messages');`, path)).toContain(RULE);
    },
  );

  it('allows the host in packages/core/anthropic.ts', async () => {
    expect(await ruleIds(`export const API_ORIGIN = 'https://${HOST}';`, 'packages/core/anthropic.ts')).not.toContain(RULE);
  });

  // P16h (planner-13, F7): the relay names its upstream in exactly one module and its test.
  it.each(['apps/relay/src/upstream.ts', 'apps/relay/test/upstream.test.ts'])('allows the host in %s', async (path) => {
    expect(await ruleIds(`export const UPSTREAM_URL = 'https://${HOST}/v1/messages';`, path)).not.toContain(RULE);
  });

  it.each([
    'apps/relay/src/relay.ts',
    'apps/relay/src/limiter.ts',
    'apps/relay/api/messages.ts',
    'apps/relay/test/relay.test.ts',
    'apps/relay/test/serve-local.ts',
    'apps/relay/src/upstream.js',
    'apps/relay/src/sub/upstream.ts',
    'apps/relay/test/upstream.test.tsx',
    'cli/relay-check.ts',
  ])('flags the host in %s: every other relay file imports UPSTREAM_URL', async (path) => {
    expect(await ruleIds(`export const u = 'https://${HOST}/v1/messages';`, path)).toContain(RULE);
  });

  it('flags a Content-Security-Policy string naming the API host in a .ts file: only the test pages\' CSP metas name it', async () => {
    const csp = `export const CSP = "default-src 'self'; connect-src ${"'self'"} https://${HOST}; script-src 'self'";`;
    expect(await ruleIds(csp, 'apps/web/e2e/smoke.spec.ts')).toContain(RULE);
    expect(await ruleIds(csp, 'apps/web/csp.ts')).toContain(RULE);
    expect(await ruleIds(`export const r = fetch('https://${HOST}/v1/messages?connect-src');`, 'cli/planted.ts')).toContain(RULE);
  });

  it.each([
    `export const r = fetch('https://api.' + 'anthropic.com/v1/messages');`,
    `export const r = fetch('https://' + 'api' + '.anthropic' + \`.com/v1/messages\`);`,
    `export const r = (p: string) => fetch('https://${HOST}/' + p + '/x');`,
  ])('flags the host split across a string concatenation: %s', async (code) => {
    expect(await ruleIds(code, 'cli/planted.ts')).toContain(RULE);
  });

  it.each(['cli/planted.mts', 'cli/planted.cts', 'cli/planted.cjs', 'cli/planted.tsx', 'cli/planted.js', 'cli/planted.mjs'])('applies to %s', async (path) => {
    expect(await ruleIds(`export const r = fetch('https://${HOST}/v1/messages');`, path)).toContain(RULE);
  });

  it('pnpm typecheck covers the eslint-rules tests', () => {
    const files = execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json', '--listFilesOnly'], { cwd: root, encoding: 'utf8' });
    for (const f of ['no-direct-anthropic', 'no-direct-dispatcher', 'no-forged-grant', 'no-ledger-factory']) expect(files).toContain(`eslint-rules/test/${f}.test.ts`);
  }, 60_000);

  it('allows the client and constants anywhere', async () => {
    const code = "import { MessagesClient, MODEL } from '../packages/core/anthropic.ts'; export { MessagesClient, MODEL };";
    expect(await ruleIds(code, 'cli/a.ts')).not.toContain(RULE);
  });

  // P2 second fix round (pr-review-P2-7 defect 1, plants j to m; verifier-phase-P2-7 issue 1):
  // each test below fails at 6e517a9.
  it.each([
    ['a next-line disable', `// eslint-disable-next-line ${RULE}\nexport const r = fetch('https://${HOST}/v1/messages');`],
    ['a same-line disable', `export const r = fetch('https://${HOST}/v1/messages'); // eslint-disable-line ${RULE}`],
    ['a file-wide disable', `/* eslint-disable */\nexport const r = fetch('https://${HOST}/v1/messages');`],
    ['an inline rule config', `/* eslint ${RULE}: "off" */\nexport const r = fetch('https://${HOST}/v1/messages');`],
  ])('ignores %s: inline config cannot turn the P2 rules off', async (_name, code) => {
    expect(await ruleIds(code, 'cli/planted.ts')).toContain(RULE);
    expect(await ruleIds(code, 'eslint-rules/fixtures/planted.ts')).toContain(RULE);
  });

  it.each(['apps/web/src/planted.jsx', 'cli/planted.jsx'])('lints %s', async (path) => {
    expect(await ruleIds(`export const r = () => fetch('https://${HOST}/v1/messages');\nexport const C = () => <p>x</p>;`, path)).toContain(RULE);
  });

  it('lints eslint-rules/fixtures, so a sender there cannot be re-exported into cli/ unlinted', async () => {
    expect(await ruleIds(`export const go = () => fetch('https://${HOST}/v1/messages');`, 'eslint-rules/fixtures/zz-sender.ts')).toContain(RULE);
  });

  // P16h PR-web-2: APP_CSP names the relay, not the API host, so apps/web/csp.ts has no exemption.
  it('apps/web/csp.ts gets no exemption: a CSP literal naming the API host is flagged there too', async () => {
    expect(APP_CSP).not.toContain(HOST);
    const csp = `export const APP_CSP = "default-src 'self'; connect-src ${"'self'"} https://${HOST}; script-src 'self'; worker-src 'self' blob:";`;
    expect(await ruleIds(csp, 'apps/web/csp.ts')).toContain(RULE);
  });

  it.each(['apps/web/csp.ts', 'apps/web/src/surface/relay.ts'])('%s as committed lints clean', async (path) => {
    const [result] = await eslint.lintFiles([join(root, path)]);
    expect(result?.messages.map((m) => m.ruleId)).toEqual([]);
  });

  // P16h PR-web-2 (R2): the relay host is written once, in apps/web/src/surface/relay.ts.
  it.each([
    `export const r = fetch('${RELAY_URL}');`,
    `export const o = '${RELAY_HOST}';`,
    `export const r = fetch('https://' + '${RELAY_HOST.slice(0, 9)}' + '${RELAY_HOST.slice(9)}/v1/messages');`,
    `export const r = fetch(\`${RELAY_ORIGIN.toUpperCase()}/v1/messages\`);`,
  ])('flags the relay host outside relay.ts: %s', async (code) => {
    for (const path of ['apps/web/src/live/planted.ts', 'apps/web/src/keygate/planted.ts', 'apps/web/src/worker/planted.ts', 'apps/web/src/probe/planted.ts', 'apps/web/e2e/planted.spec.ts', 'cli/planted.ts']) {
      expect(await ruleIds(code, path), path).toContain(RULE);
    }
  });

  it.each(['apps/web/src/surface/relay.ts', 'apps/web/test/relay.test.ts'])('allows the relay host in %s', async (path) => {
    expect(await ruleIds(`export const RELAY_ORIGIN = '${RELAY_ORIGIN}';`, path)).not.toContain(RULE);
  });

  it('relay.ts may name the relay, never the API host', async () => {
    expect(await ruleIds(`export const u = 'https://${HOST}/v1/messages';`, 'apps/web/src/surface/relay.ts')).toContain(RULE);
  });
});
