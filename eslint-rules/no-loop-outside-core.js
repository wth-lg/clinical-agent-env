// The web app reaches the Messages loop and tool dispatch only through packages/core's run,
// replay, oracle and try-tool exports (plan phase P15). Under apps/web/src these are errors:
//   - importing packages/core/anthropic.ts or packages/env/tools/registry.ts, by import, export
//     from, export * or import(), except as types (import type carries no code)
//   - a module under apps/web/src/worker/** that does not import `run` from packages/core/run.ts
//   - outside apps/web/src/worker/**, importing grantClient or memoryLedger from
//     src/adapters/ledger-browser.ts (or the whole module, by namespace, export * or import()):
//     with them any file could build a MessagesClient and loop on it
//   - in any file, exporting grantClient or memoryLedger again (export from, export *, or the
//     imported binding itself in an export), and a module under apps/web/src/worker/** that
//     exports any value: a Worker module is an entry point, so nothing passes through it
// Exempt: src/probe/** and src/harness/** (the test pages). Two files may import
// packages/core/anthropic.ts and nothing else the first rule bans: src/adapters/ledger-browser.ts
// (it builds the Worker's MessagesClient from a BatchGrant, the only way to build one) and
// src/keygate/direct.ts (the key gate's one Validate call, P13). Neither exports a value from it
// again, except the adapter's MODEL (a model id string).

import { dirname, relative, resolve, sep } from 'node:path';

export const files = ['apps/web/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];

const BANNED = ['packages/core/anthropic', 'packages/env/tools/registry'];
const RUN = 'packages/core/run';
const EXEMPT = /^apps\/web\/src\/(probe|harness)\//;
const CLIENT_ONLY = new Set(['apps/web/src/adapters/ledger-browser.ts', 'apps/web/src/keygate/direct.ts']);
const WORKER = /^apps\/web\/src\/worker\//;
const ADAPTER = 'apps/web/src/adapters/ledger-browser';
const WORKER_ONLY = new Set(['grantClient', 'memoryLedger']);
const CLIENT = 'packages/core/anthropic';
// What a client-only file may export again from packages/core/anthropic.ts.
const CLIENT_REEXPORT = new Set(['MODEL']);
// Whether node n passes its child's value on unchanged, between a binding and the export that
// would expose it (an array, an object's value, a member of it, a cast); a call or a function is a use.
const PASSES = new Set(['ArrayExpression', 'ObjectExpression', 'SpreadElement', 'ChainExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'LogicalExpression']);
const passes = (n, child) =>
  PASSES.has(n.type) ||
  (n.type === 'MemberExpression' && n.object === child) ||
  (n.type === 'Property' && n.value === child) ||
  (n.type === 'ConditionalExpression' && n.test !== child) ||
  (n.type === 'SequenceExpression' && n.expressions.at(-1) === child) ||
  (n.type === 'VariableDeclarator' && n.init === child) ||
  n.type === 'VariableDeclaration';
const EXPORTS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration', 'ExportSpecifier']);

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
      reexport: '{{name}} from {{from}} may not be exported again: it stays in the files the rule names.',
      workerExport: 'A module under apps/web/src/worker/** is a Worker entry point: it exports no values, so nothing it imports passes through it.',
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
    // What may not be exported again from a source: a name test, and the source as messages name it.
    const guarded = (source) => {
      const t = target(source);
      if (t === ADAPTER) return { from: 'src/adapters/ledger-browser.ts', name: (n) => WORKER_ONLY.has(n) };
      if (t === CLIENT && CLIENT_ONLY.has(file)) return { from: 'packages/core/anthropic.ts', name: (n) => !CLIENT_REEXPORT.has(n) };
      return undefined;
    };
    const reexport = (node, name, from) => context.report({ node, messageId: 'reexport', data: { name, from } });
    // Imported bindings that may not be exported again, checked at the end against their references.
    const kept = [];
    let importsRun = false;
    return {
      ImportDeclaration(node) {
        check(node, node.source, allTypes(node));
        const g = node.importKind === 'type' ? undefined : guarded(node.source);
        for (const sp of g ? node.specifiers : []) {
          if (sp.importKind === 'type') continue;
          const name = sp.type === 'ImportSpecifier' ? specName(sp.imported) : sp.type === 'ImportNamespaceSpecifier' ? `* as ${sp.local.name}` : 'default';
          if (sp.type !== 'ImportSpecifier' || g.name(name)) kept.push({ variables: context.sourceCode.getDeclaredVariables(sp), name, from: g.from });
        }
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
        if (inWorker && node.exportKind !== 'type' && !(node.declaration && /^TS(TypeAlias|Interface)Declaration$/.test(node.declaration.type)) && !(node.specifiers.length > 0 && node.specifiers.every((sp) => sp.exportKind === 'type'))) {
          context.report({ node, messageId: 'workerExport' });
        }
        if (!node.source) return;
        check(node, node.source, node.exportKind === 'type');
        if (node.exportKind === 'type') return;
        const values = node.specifiers.filter((sp) => sp.exportKind !== 'type').map((sp) => specName(sp.local));
        checkAdapter(node, node.source, values);
        const g = guarded(node.source);
        for (const name of g ? values : []) if (g.name(name)) reexport(node, name, g.from);
      },
      ExportDefaultDeclaration(node) {
        if (inWorker) context.report({ node, messageId: 'workerExport' });
      },
      ExportAllDeclaration(node) {
        check(node, node.source, node.exportKind === 'type');
        if (node.exportKind === 'type') return;
        checkAdapter(node, node.source, undefined);
        const g = guarded(node.source);
        if (g) reexport(node, node.exported ? `* as ${specName(node.exported)}` : '*', g.from);
        if (inWorker) context.report({ node, messageId: 'workerExport' });
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
        // A kept binding is exported again when a reference reaches an export through nodes that
        // only pass it on. A const it is passed on to is kept in turn (const C = M; export { C }).
        const seen = new Set();
        for (let k = kept.shift(); k !== undefined; k = kept.shift()) {
          for (const v of k.variables) {
            if (seen.has(v)) continue;
            seen.add(v);
            for (const ref of v.references) {
              let child = ref.identifier;
              let n = child.parent;
              let declarator;
              while (n && passes(n, child)) {
                if (n.type === 'VariableDeclarator') declarator = n;
                child = n;
                n = n.parent;
              }
              if (n && EXPORTS.has(n.type)) reexport(n, k.name, k.from);
              else if (declarator && ref.isRead()) kept.push({ ...k, variables: context.sourceCode.getDeclaredVariables(declarator) });
            }
          }
        }
      },
    };
  },
};
