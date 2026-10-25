// The web app reaches the Messages loop and tool dispatch only through packages/core's run,
// replay, oracle and try-tool exports (plan phase P15). Under apps/web/src these are errors:
//   - importing packages/core/anthropic.ts or packages/env/tools/registry.ts, by import, export
//     from, export * or import(), except as types (import type carries no code)
//   - a module under apps/web/src/worker/** that does not import `run` from packages/core/run.ts
//   - outside apps/web/src/worker/**, importing grantClient or memoryLedger from
//     src/adapters/ledger-browser.ts (or the whole module, by namespace, export * or import()):
//     with them any file could build a MessagesClient and loop on it
// Exempt: src/probe/** and src/harness/** (the test pages). Two files may import
// packages/core/anthropic.ts and nothing else the first rule bans: src/adapters/ledger-browser.ts
// (it builds the Worker's MessagesClient from a BatchGrant, the only way to build one) and
// src/keygate/direct.ts (the key gate's one Validate call, P13).

import { dirname, relative, resolve, sep } from 'node:path';

export const files = ['apps/web/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];

const BANNED = ['packages/core/anthropic', 'packages/env/tools/registry'];
const RUN = 'packages/core/run';
const EXEMPT = /^apps\/web\/src\/(probe|harness)\//;
const CLIENT_ONLY = new Set(['apps/web/src/adapters/ledger-browser.ts', 'apps/web/src/keygate/direct.ts']);
const WORKER = /^apps\/web\/src\/worker\//;
const ADAPTER = 'apps/web/src/adapters/ledger-browser';
const WORKER_ONLY = new Set(['grantClient', 'memoryLedger']);

const posix = (p) => p.split(sep).join('/');

// The string an import source names: a literal or an expression-free template.
const sourceText = (source) =>
  source?.type === 'Literal' ? source.value : source?.type === 'TemplateLiteral' && source.expressions.length === 0 ? source.quasis[0].value.cooked : undefined;

export default {
  meta: {
    type: 'problem',
    docs: { description: 'apps/web/src reaches the Messages loop and tool dispatch only through packages/core run, replay, oracle and try-tool' },
    schema: [],
    messages: {
      banned: "'{{source}}' is the Messages loop or tool dispatch; under apps/web/src use packages/core/run.ts, replay.ts, oracle or try-tool.ts instead.",
      workerOnly: "{{name}} from src/adapters/ledger-browser.ts builds a MessagesClient; only the trial Worker (apps/web/src/worker/**) may import it.",
      dynamic: 'import() with a computed source can reach the Messages loop or tool dispatch; name the module literally.',
      workerRun: 'A trial Worker runs each trial through packages/core/run.ts: import { run } from it.',
    },
  },
  create(context) {
    const file = posix(relative(context.cwd, context.physicalFilename));
    if (EXEMPT.test(file)) return {};
    const banned = CLIENT_ONLY.has(file) ? BANNED.filter((b) => b !== 'packages/core/anthropic') : BANNED;
    const inWorker = WORKER.test(file);
    const target = (source) => {
      const text = sourceText(source);
      if (text === undefined || !text.startsWith('.')) return text;
      return posix(relative(context.cwd, resolve(dirname(context.physicalFilename), text))).replace(/\.(ts|tsx|js|mjs)$/, '');
    };
    const check = (node, source, typeOnly) => {
      if (typeOnly) return;
      const t = target(source);
      if (t !== undefined && banned.includes(t)) context.report({ node, messageId: 'banned', data: { source: sourceText(source) } });
    };
    // names: the value names taken from the adapter, or undefined for the whole module.
    const checkAdapter = (node, source, names) => {
      if (inWorker || target(source) !== ADAPTER) return;
      for (const name of names ?? [...WORKER_ONLY]) {
        if (WORKER_ONLY.has(name)) context.report({ node, messageId: 'workerOnly', data: { name } });
      }
    };
    const specName = (n) => n.name ?? n.value;
    const allTypes = (node) => node.importKind === 'type' || (node.specifiers.length > 0 && node.specifiers.every((s) => s.importKind === 'type'));
    let importsRun = false;
    return {
      ImportDeclaration(node) {
        check(node, node.source, allTypes(node));
        if (node.importKind !== 'type') {
          const values = node.specifiers.filter((sp) => sp.importKind !== 'type');
          if (values.some((sp) => sp.type === 'ImportNamespaceSpecifier')) checkAdapter(node, node.source, undefined);
          else checkAdapter(node, node.source, values.filter((sp) => sp.type === 'ImportSpecifier').map((sp) => specName(sp.imported)));
        }
        if (node.importKind !== 'type' && target(node.source) === RUN) {
          importsRun ||= node.specifiers.some((s) => s.type === 'ImportSpecifier' && s.importKind !== 'type' && (s.imported.name ?? s.imported.value) === 'run');
        }
      },
      ExportNamedDeclaration(node) {
        if (!node.source) return;
        check(node, node.source, node.exportKind === 'type');
        if (node.exportKind !== 'type') checkAdapter(node, node.source, node.specifiers.filter((sp) => sp.exportKind !== 'type').map((sp) => specName(sp.local)));
      },
      ExportAllDeclaration(node) {
        check(node, node.source, node.exportKind === 'type');
        if (node.exportKind !== 'type') checkAdapter(node, node.source, undefined);
      },
      ImportExpression(node) {
        if (sourceText(node.source) === undefined) context.report({ node, messageId: 'dynamic' });
        else {
          check(node, node.source, false);
          checkAdapter(node, node.source, undefined);
        }
      },
      'Program:exit'(node) {
        if (inWorker && !importsRun) context.report({ node, messageId: 'workerRun' });
      },
    };
  },
};
