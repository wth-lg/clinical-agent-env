// The one command and what it needs, held once in apps/web/src/surface/command.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCAL_PREREQUISITES, LOCAL_START_COMMAND, NODE_CHECK_COMMAND, NODE_INSTALL_URL, PNPM_CHECK_COMMAND, PNPM_INSTALL_URL, PREREQUISITE_ROWS } from '../src/surface/command.ts';

const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { engines: { node: string } };

describe('command.ts', () => {
  it('clones the current repo into its own directory and runs pnpm start', () => {
    expect(LOCAL_START_COMMAND).toBe('git clone https://github.com/wth-lg/clinical-agent-env && cd clinical-agent-env && pnpm start');
  });

  it('states the prerequisites in one sentence, with the Node version engines.node asks for', () => {
    // Built from engines.node, so the literal stays in command.ts alone (one source in the app).
    expect(LOCAL_PREREQUISITES).toBe(`Requires Node.js ${pkg.engines.node.replace(/^>=\s*/, '')} or newer and pnpm.`);
    expect(pkg.engines.node).toBe('>=22.18');
  });

  it('links the official install pages', () => {
    expect(NODE_INSTALL_URL).toBe('https://nodejs.org/en/download');
    expect(PNPM_INSTALL_URL).toBe('https://pnpm.io/installation');
  });

  it('shows the prerequisites as one row per tool, the same requirements the sentence names', () => {
    expect(LOCAL_PREREQUISITES).toBe(`Requires ${PREREQUISITE_ROWS.map((r) => r.requirement).join(' and ')}.`);
    expect(PREREQUISITE_ROWS.map((r) => [r.check, r.install, r.link])).toEqual([
      [NODE_CHECK_COMMAND, NODE_INSTALL_URL, 'Install Node.js'],
      [PNPM_CHECK_COMMAND, PNPM_INSTALL_URL, 'Install pnpm'],
    ]);
  });
});
