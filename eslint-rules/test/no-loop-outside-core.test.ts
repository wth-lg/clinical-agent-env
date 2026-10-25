import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Lints code through the real eslint.config.js as if it lived at a repo path, so these tests
// cover the rule and its file scope together.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const eslint = new ESLint({ cwd: root });
async function ruleIds(code: string, path: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const RULE = 'local/no-loop-outside-core';
// The Worker fixtures: one runs its own loop instead of packages/core/run.ts, one runs each trial through it.
const WORKER_NO_RUN = "import { runLoop } from '../../../../packages/core/loop.ts';\nexport const start = runLoop;\n";
const WORKER_RUN = "import { run } from '../../../../packages/core/run.ts';\nexport const start = run;\n";

describe('no-loop-outside-core', () => {
  it('refuses packages/core/anthropic.ts in apps/web/src/live', async () => {
    const code = "import { MessagesClient } from '../../../../packages/core/anthropic.ts';\nexport const C = MessagesClient;\n";
    expect(await ruleIds(code, 'apps/web/src/live/planted.ts')).toContain(RULE);
  });

  it('refuses packages/env/tools/registry.ts in apps/web/src/environment', async () => {
    const code = "import { callTool } from '../../../../packages/env/tools/registry.ts';\nexport const f = callTool;\n";
    expect(await ruleIds(code, 'apps/web/src/environment/planted.ts')).toContain(RULE);
  });

  it('refuses them by dynamic import, re-export and export-all too', async () => {
    for (const code of [
      "export const m = () => import('../../../../packages/core/anthropic.ts');\n",
      "export { MessagesClient } from '../../../../packages/core/anthropic.ts';\n",
      "export * from '../../../../packages/env/tools/registry.ts';\n",
    ]) expect(await ruleIds(code, 'apps/web/src/live/planted.ts'), code).toContain(RULE);
  });

  it('lets the environment view use packages/core/try-tool.ts', async () => {
    const code = "import { tryTool } from '../../../../packages/core/try-tool.ts';\nexport const t = tryTool;\n";
    expect(await ruleIds(code, 'apps/web/src/environment/planted.ts')).not.toContain(RULE);
  });

  it('allows type-only imports, and the probe and harness pages', async () => {
    expect(await ruleIds("import type { MessageParam } from '../../../../packages/core/anthropic.ts';\nexport type M = MessageParam;\n", 'apps/web/src/live/types.ts')).not.toContain(RULE);
    const code = "import { MessagesClient } from '../../../../packages/core/anthropic.ts';\nexport const C = MessagesClient;\n";
    expect(await ruleIds(code, 'apps/web/src/probe/planted.ts')).not.toContain(RULE);
    expect(await ruleIds(code, 'apps/web/src/harness/planted.ts')).not.toContain(RULE);
  });

  it('applies only under apps/web/src', async () => {
    const code = "import { MessagesClient } from '../packages/core/anthropic.ts';\nexport const C = MessagesClient;\n";
    expect(await ruleIds(code, 'cli/planted.ts')).not.toContain(RULE);
  });

  it('fails a Worker module that does not import run from packages/core/run.ts', async () => {
    expect(await ruleIds(WORKER_NO_RUN, 'apps/web/src/worker/trial.ts')).toContain(RULE);
    expect(await ruleIds(WORKER_RUN, 'apps/web/src/worker/trial.ts')).not.toContain(RULE);
  });

  it('does not take a run named elsewhere, or a type-only import, as the Worker import', async () => {
    expect(await ruleIds("import { run } from '../../../../packages/core/replay.ts';\nexport const r = run;\n", 'apps/web/src/worker/trial.ts')).toContain(RULE);
    expect(await ruleIds("import type { run } from '../../../../packages/core/run.ts';\nexport type R = typeof run;\n", 'apps/web/src/worker/trial.ts')).toContain(RULE);
  });
});
