// The relay's deploy config and source rules: vercel.json routes only /v1/messages to the
// function, with a maxDuration; the deploy uploads only the function and its sources and serves
// no file as a static route; the relay source has no console call and reads no environment
// variable; tsconfig.json type-checks it.
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ignoreModule from 'ignore';
import { describe, expect, it } from 'vitest';
import { UPLOAD_LIST } from '../../../scripts/relay-upload-list.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RELAY = join(ROOT, 'apps/relay');
const sources = ['src', 'api'].flatMap((d) => readdirSync(join(RELAY, d)).map((f) => join(RELAY, d, f)));

// The files `vercel deploy` uploads from dir, the way CLI 64.2.0's bundled @vercel/client 18.8.5
// collects them: getVercelIgnore builds one ignore@4.0.6 matcher from its default list and
// .vercelignore, and buildFileTree's readdir tests every entry's path relative to dir with that
// matcher, a directory by its bare name with no trailing slash, before it descends into it. An
// ignored directory is never read, so a rule like `!/api/` cannot bring back `api` once `/*`
// ignores it. An empty directory that is kept is uploaded as an entry of its own. Not copied:
// buildFileTree also adds .vercel/routes.json when it exists, a file `vercel link` does not write
// and git ignores, so a checkout never has it. Before a deploy, README step 4 runs the CLI's own
// walker (scripts/relay-upload-list.ts) against the same list.
// ignore@4.0.6's types declare `export default`, but its CommonJS module.exports is the function.
const ignore = ignoreModule as unknown as typeof ignoreModule.default;
const DEFAULT_IGNORES = ['.hg', '.git', '.gitmodules', '.svn', 'CVS', '.cache', '.next', '.now', '.vercel', '.npmignore', '.dockerignore', '.gitignore', '.*.swp', '.DS_Store', '.wafpicke-*', '.lock-wscript', '.env.local', '.env.*.local', '.venv', '.yarn/cache', '.pnp*', 'npm-debug.log', 'config.gypi', 'node_modules', '__pycache__', 'venv'];
function uploadList(dir: string): string[] {
  const ig = ignore().add(`${DEFAULT_IGNORES.join('\n')}\n${readFileSync(join(dir, '.vercelignore'), 'utf8').replace(/(\n|^)\.\//g, '$1')}`);
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((name) => {
      const path = join(d, name);
      if (ig.ignores(relative(dir, path))) return [];
      if (!lstatSync(path).isDirectory()) return [path];
      const inner = walk(path);
      return inner.length ? inner : [path];
    });
  return walk(dir).map((p) => relative(dir, p)).sort();
}

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
  it('vercel deploy uploads only the function, its sources, vercel.json and public/', () => {
    expect(UPLOAD_LIST).toEqual(['api/messages.ts', 'public/README.md', 'src/limiter.ts', 'src/relay.ts', 'src/upstream.ts', 'vercel.json']);
    expect(uploadList(RELAY)).toEqual(UPLOAD_LIST);
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
