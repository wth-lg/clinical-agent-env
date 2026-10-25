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
    const disconnect = at('vercel git disconnect --yes --cwd apps/relay');
    const deployAt = at('vercel deploy --prod --cwd apps/relay');
    expect(api).toBeGreaterThan(at('vercel link'));
    expect(deploy[api]).toMatch(/\.link\b/);
    expect(disconnect).toBeGreaterThan(at('vercel link'));
    expect(deployAt).toBeGreaterThan(Math.max(api, disconnect));
    expect(section('Deploy')).toMatch(/No Git repository connected/);
    // `vercel project inspect` prints no Git field, so it is no Git check.
    expect(deploy.some((c) => c.startsWith('vercel project inspect'))).toBe(false);
  });

  it('runs no command that connects Git', () => {
    for (const c of deploy) {
      expect(c, c).not.toMatch(/vercel (git|project) connect/);
      expect(c, c).not.toMatch(/vercel link(?!.*--project)/);
    }
  });
});
