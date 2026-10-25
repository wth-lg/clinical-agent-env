// The web app reaches the Messages loop and tool dispatch only through packages/core's run,
// replay, oracle and try-tool exports (plan phase P15). Under apps/web/src these are errors:
//   - importing packages/core/anthropic.ts or packages/env/tools/registry.ts, by import, export
//     from, export * or import(), except as types (import type carries no code)
//   - a module under apps/web/src/worker/** that does not import `run` from packages/core/run.ts
// Exempt: src/probe/** and src/harness/** (the test pages), src/adapters/** (the ledger adapter
// builds the Worker's MessagesClient from a BatchGrant, the only way to build one) and
// src/keygate/direct.ts (the key gate's one Validate call, P13).

import { dirname, relative, resolve, sep } from 'node:path';

export const files = ['apps/web/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];

const BANNED = ['packages/core/anthropic', 'packages/env/tools/registry'];
const RUN = 'packages/core/run';
const EXEMPT = [/^apps\/web\/src\/(probe|harness|adapters)\//, /^apps\/web\/src\/keygate\/direct\.ts$/];
const WORKER = /^apps\/web\/src\/worker\//;

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
      dynamic: 'import() with a computed source can reach the Messages loop or tool dispatch; name the module literally.',
      workerRun: 'A trial Worker runs each trial through packages/core/run.ts: import { run } from it.',
    },
  },
  create(context) {
    const file = posix(relative(context.cwd, context.physicalFilename));
    if (EXEMPT.some((r) => r.test(file))) return {};
    const target = (source) => {
      const text = sourceText(source);
      if (text === undefined || !text.startsWith('.')) return text;
      return posix(relative(context.cwd, resolve(dirname(context.physicalFilename), text))).replace(/\.(ts|tsx|js|mjs)$/, '');
    };
    const check = (node, source, typeOnly) => {
      if (typeOnly) return;
      const t = target(source);
      if (t !== undefined && BANNED.includes(t)) context.report({ node, messageId: 'banned', data: { source: sourceText(source) } });
    };
    const allTypes = (node) => node.importKind === 'type' || (node.specifiers.length > 0 && node.specifiers.every((s) => s.importKind === 'type'));
    let importsRun = false;
    return {
      ImportDeclaration(node) {
        check(node, node.source, allTypes(node));
        if (node.importKind !== 'type' && target(node.source) === RUN) {
          importsRun ||= node.specifiers.some((s) => s.type === 'ImportSpecifier' && s.importKind !== 'type' && (s.imported.name ?? s.imported.value) === 'run');
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source, node.exportKind === 'type');
      },
      ExportAllDeclaration(node) {
        check(node, node.source, node.exportKind === 'type');
      },
      ImportExpression(node) {
        if (sourceText(node.source) === undefined) context.report({ node, messageId: 'dynamic' });
        else check(node, node.source, false);
      },
      'Program:exit'(node) {
        if (WORKER.test(file) && !importsRun) context.report({ node, messageId: 'workerRun' });
      },
    };
  },
};
