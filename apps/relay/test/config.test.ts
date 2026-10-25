// The relay's deploy config and source rules: vercel.json routes only /v1/messages to the
// function, with a maxDuration; the deploy uploads only the function and its sources and serves
// no file as a static route; the relay source has no console call and reads no environment
// variable; tsconfig.json type-checks it.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RELAY = join(ROOT, 'apps/relay');
const sources = ['src', 'api'].flatMap((d) => readdirSync(join(RELAY, d)).map((f) => join(RELAY, d, f)));

describe('relay config', () => {
  it('vercel.json rewrites /v1/messages to the function and has no other route', () => {
    const cfg = JSON.parse(readFileSync(join(RELAY, 'vercel.json'), 'utf8')) as Record<string, unknown>;
    expect(cfg.rewrites).toEqual([{ source: '/v1/messages', destination: '/api/messages' }]);
    for (const k of ['routes', 'redirects', 'headers', 'crons', 'cleanUrls', 'trailingSlash']) expect(cfg).not.toHaveProperty(k);
    const fns = cfg.functions as Record<string, { maxDuration?: number }>;
    expect(Object.keys(fns)).toEqual(['api/messages.ts']);
    expect(fns['api/messages.ts']!.maxDuration).toBeGreaterThan(0);
    expect(cfg.git).toEqual({ deploymentEnabled: false });
  });

  // Without a public/ directory, Vercel's zero-config build serves every uploaded file outside api/
  // as a static route, src/*.ts and test/*.ts included (CLI 64.2.0 detectBuilders). With one,
  // only public/ is static, and its one file, README.md, is a name the static builder never
  // publishes. .vercelignore keeps test/ and README.md out of the upload.
  it('.vercelignore uploads only the function, its sources, vercel.json and public/', () => {
    const rules = readFileSync(join(RELAY, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(rules).toEqual(['/*', '!/api/', '!/src/', '!/public/', '!/vercel.json']);
  });

  it('public/, the static output directory, holds only README.md', () => {
    expect(readdirSync(join(RELAY, 'public'))).toEqual(['README.md']);
  });

  // Verifier M2: `vercel link --cwd apps/relay` writes apps/relay/.vercel/ and adds a `.vercel` line
  // to apps/relay/.gitignore unless the file already has one (CLI 64.2.0 addToGitIgnore), so with
  // both files below the link leaves `git status` clean.
  it('git ignores the .vercel/ directory vercel link writes, and the link has no .gitignore to change', () => {
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n')).toContain('.vercel');
    expect(readFileSync(join(RELAY, '.gitignore'), 'utf8').split('\n')).toContain('.vercel');
    expect(execFileSync('git', ['check-ignore', '-v', 'apps/relay/.vercel/project.json'], { cwd: ROOT, encoding: 'utf8' })).toMatch(/\.vercel/);
  });

  it('the relay source has no console call and reads no environment variable', () => {
    expect(sources.length).toBeGreaterThanOrEqual(4);
    for (const f of sources) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/\bconsole\./);
      expect(text, f).not.toMatch(/process\.env|import\.meta\.env|Deno\.env/);
    }
  });

  it('pnpm typecheck covers apps/relay', () => {
    const files = execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json', '--listFilesOnly'], { cwd: ROOT, encoding: 'utf8' });
    for (const f of ['apps/relay/src/relay.ts', 'apps/relay/src/limiter.ts', 'apps/relay/src/upstream.ts', 'apps/relay/api/messages.ts', 'apps/relay/test/serve-local.ts']) expect(files).toContain(f);
  }, 60_000);
});
