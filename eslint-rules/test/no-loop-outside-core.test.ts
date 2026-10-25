import { readFileSync } from 'node:fs';
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
async function messages(code: string, path: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE).map((m) => m.message);
}
const AGAIN = /may not be exported again/;

const RULE = 'local/no-loop-outside-core';
// The Worker fixtures: one runs its own loop instead of packages/core/run.ts, one runs each trial through it.
const WORKER_NO_RUN = "import { runLoop } from '../../../../packages/core/loop.ts';\nexport const start = runLoop;\n";
const WORKER_RUN = "import { run } from '../../../../packages/core/run.ts';\nvoid run;\n";

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

  // The verifier's plants (verifier-phase-P15-1, D1): a second loop in a new adapters/ file, and
  // one built from the adapter's grantClient and memoryLedger outside the Worker.
  it('refuses the Messages client and tool dispatch in any other file under src/adapters', async () => {
    const code = "import { MessagesClient } from '../../../../packages/core/anthropic.ts';\nimport { callTool } from '../../../../packages/env/tools/registry.ts';\nexport const C = MessagesClient;\nexport const f = callTool;\n";
    expect(await ruleIds(code, 'apps/web/src/adapters/loop.ts')).toContain(RULE);
  });

  it('refuses grantClient and memoryLedger outside src/worker', async () => {
    const code = "import { grantClient, memoryLedger } from '../adapters/ledger-browser.ts';\nexport const g = [grantClient, memoryLedger];\n";
    expect(await ruleIds(code, 'apps/web/src/live/plant2.ts')).toContain(RULE);
    for (const c of [
      "import { memoryLedger } from '../adapters/ledger-browser.ts';\nexport const m = memoryLedger;\n",
      "import * as L from '../adapters/ledger-browser.ts';\nexport const l = L;\n",
      "export { grantClient } from '../adapters/ledger-browser.ts';\n",
      "export * from '../adapters/ledger-browser.ts';\n",
      "export const m = () => import('../adapters/ledger-browser.ts');\n",
    ]) expect(await ruleIds(c, 'apps/web/src/live/plant2.ts'), c).toContain(RULE);
  });

  it('lets src/worker take grantClient and memoryLedger, and any file take the rest of the adapter', async () => {
    const worker = "import { run } from '../../../../packages/core/run.ts';\nimport { grantClient, memoryLedger } from '../adapters/ledger-browser.ts';\nvoid [run, grantClient, memoryLedger];\n";
    expect(await ruleIds(worker, 'apps/web/src/worker/trial.ts')).not.toContain(RULE);
    const page = "import { tabLedger, sessionCeiling } from '../adapters/ledger-browser.ts';\nexport const t = [tabLedger, sessionCeiling];\n";
    expect(await ruleIds(page, 'apps/web/src/live/transport/page.ts')).not.toContain(RULE);
  });

  it('lets the ledger adapter and the key gate import the Messages client, and nothing else of the loop', async () => {
    const client = "import { MessagesClient } from '../../../../packages/core/anthropic.ts';\nexport const make = (o: never) => new MessagesClient(o);\n";
    const dispatch = "import { callTool } from '../../../../packages/env/tools/registry.ts';\nexport const f = callTool;\n";
    expect(await ruleIds(client, 'apps/web/src/adapters/ledger-browser.ts')).not.toContain(RULE);
    expect(await ruleIds(client, 'apps/web/src/keygate/direct.ts')).not.toContain(RULE);
    expect(await ruleIds(dispatch, 'apps/web/src/adapters/ledger-browser.ts')).toContain(RULE);
    expect(await ruleIds(dispatch, 'apps/web/src/keygate/direct.ts')).toContain(RULE);
  });

  // The verifier's new plants (verifier-phase-P15-2, D1-N2 and D1-N3): grantClient and
  // memoryLedger passed on by a Worker module, and the Messages client passed on by a file that
  // may import it. No file exports either again; the adapter's own MODEL re-export stays.
  const RELAY = "import { run } from '../../../../packages/core/run.ts';\nvoid run;\n";
  it('refuses grantClient and memoryLedger exported again from a Worker module (N2)', async () => {
    for (const c of [
      "export { grantClient, memoryLedger } from '../adapters/ledger-browser.ts';\n",
      "export { grantClient as g } from '../adapters/ledger-browser.ts';\n",
      "export * from '../adapters/ledger-browser.ts';\n",
      "export * as L from '../adapters/ledger-browser.ts';\n",
      "import { grantClient } from '../adapters/ledger-browser.ts';\nexport { grantClient };\n",
      "import { memoryLedger as m } from '../adapters/ledger-browser.ts';\nexport default m;\n",
      "import { grantClient } from '../adapters/ledger-browser.ts';\nexport const g = [grantClient];\n",
      "import * as L from '../adapters/ledger-browser.ts';\nexport const g = L.grantClient;\n",
      "import * as L from '../adapters/ledger-browser.ts';\nexport { L };\n",
    ]) expect(await messages(RELAY + c, 'apps/web/src/worker/relay.ts'), c).toContainEqual(expect.stringMatching(AGAIN));
  });

  it('refuses a Worker module that exports anything, since it is an entry point', async () => {
    const wrapper = "import { grantClient } from '../adapters/ledger-browser.ts';\nexport const g = (o: never) => grantClient(o);\n";
    expect(await ruleIds(RELAY + wrapper, 'apps/web/src/worker/relay.ts')).toContain(RULE);
    expect(await ruleIds(`${WORKER_RUN}export const n = 1;\n`, 'apps/web/src/worker/trial.ts')).toContain(RULE);
    expect(await ruleIds(`${WORKER_RUN}export type T = number;\n`, 'apps/web/src/worker/trial.ts')).not.toContain(RULE);
  });

  it('refuses the Messages client exported again from the two files that may import it (N3)', async () => {
    for (const file of ['apps/web/src/adapters/ledger-browser.ts', 'apps/web/src/keygate/direct.ts']) {
      for (const c of [
        "export { MessagesClient as MC } from '../../../../packages/core/anthropic.ts';\n",
        "export * from '../../../../packages/core/anthropic.ts';\n",
        "export * as A from '../../../../packages/core/anthropic.ts';\n",
        "import { MessagesClient } from '../../../../packages/core/anthropic.ts';\nexport { MessagesClient };\n",
        "import { MessagesClient as M } from '../../../../packages/core/anthropic.ts';\nexport const C = M;\n",
        "import { MessagesClient } from '../../../../packages/core/anthropic.ts';\nexport default MessagesClient;\n",
        "import { MessagesClient } from '../../../../packages/core/anthropic.ts';\nconst C = MessagesClient;\nexport { C };\n",
        "import * as A from '../../../../packages/core/anthropic.ts';\nexport const C = { client: A.MessagesClient };\n",
      ]) expect(await messages(c, file), `${file}: ${c}`).toContainEqual(expect.stringMatching(AGAIN));
    }
  });

  it('lets the ledger adapter re-export MODEL, and export types from the client', async () => {
    expect(await ruleIds("export { MODEL } from '../../../../packages/core/anthropic.ts';\n", 'apps/web/src/adapters/ledger-browser.ts')).not.toContain(RULE);
    expect(await ruleIds("export type { ClientOptions } from '../../../../packages/core/anthropic.ts';\n", 'apps/web/src/adapters/ledger-browser.ts')).not.toContain(RULE);
  });

  it('passes the real adapter, key gate and Worker as they are', async () => {
    for (const file of ['apps/web/src/adapters/ledger-browser.ts', 'apps/web/src/keygate/direct.ts', 'apps/web/src/worker/trial.ts']) {
      expect(await ruleIds(readFileSync(join(root, file), 'utf8'), file), file).not.toContain(RULE);
    }
  });
});
