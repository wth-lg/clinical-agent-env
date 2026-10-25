// The relay's deploy config and source rules: vercel.json routes only /v1/messages to the
// function, with a maxDuration; the relay source has no console call and reads no environment
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
