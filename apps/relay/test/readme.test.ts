// The README's deploy and teardown commands (plan phase P16h, R6), read the way the Vercel CLI
// 64.2.0 source behaves: `vercel link --yes` on a project that does not exist yet creates it and
// connects the repo's origin remote, so the project is created first by `vercel project create`
// (which sends only its name) and linked afterwards; `vercel project inspect` never prints the Git
// connection, so the check reads the project's `link` field instead.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const PROJECT = 'clinical-agent-env-relay';

// The text of one `## <title>` section.
function section(title: string): string {
  const start = README.indexOf(`\n## ${title}\n`);
  if (start < 0) throw new Error(`README has no section ${title}`);
  const end = README.indexOf('\n## ', start + 1);
  return README.slice(start, end < 0 ? undefined : end);
}

// The shell commands of a section, in order: the lines of its sh blocks, continuations joined.
function commands(text: string): string[] {
  const out: string[] = [];
  for (const [, block] of text.matchAll(/```sh\n([\s\S]*?)```/g)) {
    const joined = block!.replace(/\\\n\s*/g, ' ');
    for (const line of joined.split('\n')) if (line.trim() && !line.trim().startsWith('#')) out.push(line.trim());
  }
  return out;
}

const deploy = commands(section('Deploy'));
const at = (prefix: string) => deploy.findIndex((c) => c.startsWith(prefix));

describe('README deploy (B2: CLI deploy only, never a Git connection)', () => {
  it('creates the project before it links it, so the link never takes the create-and-connect path', () => {
    const create = at(`vercel project create ${PROJECT}`);
    const link = at(`vercel link --yes --project ${PROJECT} --cwd apps/relay`);
    expect(create).toBeGreaterThanOrEqual(0);
    expect(link).toBeGreaterThan(create);
    expect(deploy.filter((c) => c.startsWith('vercel link'))).toHaveLength(1);
  });

  it('checks the Git connection with commands that can see it, before the deploy', () => {
    const api = at(`vercel api /v9/projects/${PROJECT}`);
    // Verifier N2: without --project, a folder that is not linked makes disconnect create and
    // connect a project named after the folder; with it, an unknown name exits 1 (CLI 64.2.0
    // ensureLink with failIfNotFound).
    const disconnect = at(`vercel git disconnect --yes --project ${PROJECT} --cwd apps/relay`);
    const deployAt = at('vercel deploy --prod --cwd apps/relay');
    expect(api).toBeGreaterThan(at('vercel link'));
    expect(deploy[api]).toMatch(/\.link\b/);
    expect(disconnect).toBeGreaterThan(at('vercel link'));
    expect(deployAt).toBeGreaterThan(Math.max(api, disconnect));
    expect(section('Deploy')).toMatch(/No Git repository connected/);
    // `vercel project inspect` prints no Git field, so it is no Git check.
    expect(deploy.some((c) => c.startsWith('vercel project inspect'))).toBe(false);
  });

  // Verifier N1: the upload list is checked with the installed CLI's own walker before the deploy.
  it('checks what the deploy uploads with the CLI walker, after the link and before the deploy', () => {
    const check = at('node scripts/relay-upload-list.ts');
    expect(check).toBeGreaterThan(at('vercel link'));
    expect(at('vercel deploy --prod --cwd apps/relay')).toBeGreaterThan(check);
  });

  it('runs no command that connects Git', () => {
    for (const c of deploy) {
      expect(c, c).not.toMatch(/vercel (git|project) connect/);
      expect(c, c).not.toMatch(/vercel link(?!.*--project)/);
      expect(c, c).not.toMatch(/vercel git disconnect(?!.*--project)/);
    }
  });
});

// Security M1: Origin is set by browsers only, so the Origin lock does not bound who can call the
// relay; the README says so and why it is acceptable.
describe('README: who can use the relay', () => {
  it('says that any non-browser client can forge Origin, and what still bounds that use', () => {
    const text = section('Who can use the relay').replace(/\s+/g, ' ');
    expect(text).toMatch(/open Messages proxy/);
    expect(text).toMatch(/forge/);
    expect(text).toMatch(/holds no key/);
    expect(text).toMatch(/no capability/);
    for (const bound of ['rate limit', 'claude-opus-5-5', 'spend']) expect(text).toContain(bound);
  });
});

// Verifier M1: `vercel project rm` has no --yes and always asks "Are you sure?" (CLI 64.2.0), so
// the teardown needs a person at a terminal, and the README says so.
describe('README teardown', () => {
  it('removes the deployment, then the project, and says the project removal asks for confirmation', () => {
    const text = section('Teardown');
    expect(commands(text)).toEqual(['vercel remove <deployment URL> --yes', `vercel project rm ${PROJECT}`]);
    const prose = text.replace(/\s+/g, ' ');
    expect(prose).toMatch(/no `--yes`/);
    expect(prose).toMatch(/Are you sure\?/);
    expect(prose).toMatch(/interactive terminal/);
  });
});
