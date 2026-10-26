// R14-34: write truthfulness holds by construction. Only write/commit.ts validates a write and
// puts it into the world, and the Committed it returns is the only way a tool result gets
// written_ids (registry.ts callTool). So no other file under packages/env/tools may put into
// the world or construct a Committed: such a file could change the store without the checks,
// or report written_ids for resources it never put. Test files (*.test.ts) are exempt; they seed
// worlds directly. Every other .ts, .mts, .cts and .tsx file is read, helpers under tools/test
// included.
//
// The check reads each file's syntax tree, not its text, so a comment naming world.put does not
// count. Forbidden outside commit.ts: any `put` member, whatever the receiver (x.put, x?.put,
// x['put']), and put taken by destructuring (const { put } = x, ({ put } = x), a computed
// ['put'] key), and `Committed` as a value (ns['Committed'] and extends included) other than its
// class declaration in registry.ts, implements, or the right side of instanceof. A value import or
// re-export of Committed counts too, so a renamed import (import { Committed as C }) cannot
// construct it either; a type-only import is allowed.
//
// Known limit: a key computed at run time (a variable, a concatenation, Reflect.get, eval,
// Object.values) is not syntax, so this check cannot see it. Making put reachable only through
// commit (a WriteContext.world without put) would hold R14-34 by construction; this test holds it
// by review of every literal form.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const TOOLS = join(import.meta.dirname, '..');
const COMMIT = 'write/commit.ts';
const FIX = `only ${COMMIT} may put into the world or construct Committed; go through commit()`;

// A property or binding name as written: an identifier, a string or number literal, or a computed
// literal (['put']); undefined when it is computed at run time.
function keyName(n: ts.Node | undefined): string | undefined {
  if (n === undefined) return undefined;
  if (ts.isIdentifier(n) || ts.isStringLiteralLike(n) || ts.isNumericLiteral(n)) return n.text;
  if (ts.isComputedPropertyName(n) && (ts.isStringLiteralLike(n.expression) || ts.isNumericLiteral(n.expression))) return n.expression.text;
  return undefined;
}

// Whether an object literal property is part of a destructuring assignment target:
// ({ put } = x), [{ put }] = xs, for ({ put } of xs).
function assignedTo(prop: ts.Node): boolean {
  let n = prop.parent;
  while (ts.isPropertyAssignment(n.parent) || ts.isObjectLiteralExpression(n.parent) || ts.isArrayLiteralExpression(n.parent) || ts.isParenthesizedExpression(n.parent) || ts.isSpreadElement(n.parent) || ts.isSpreadAssignment(n.parent)) n = n.parent;
  const p = n.parent;
  if (ts.isBinaryExpression(p)) return p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.left === n;
  return (ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.initializer === n;
}

function violations(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const report = (node: ts.Node, what: string) => out.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${what}; ${FIX}`);
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'put') report(node, `uses ${node.getText(sf)}`);
    else if (ts.isElementAccessExpression(node) && keyName(node.argumentExpression) === 'put') report(node, `uses ${node.getText(sf)}`);
    else if (ts.isElementAccessExpression(node) && keyName(node.argumentExpression) === 'Committed') report(node, `uses Committed as a value (${node.getText(sf).slice(0, 60)})`);
    else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && keyName(node.propertyName ?? node.name) === 'put') report(node, 'destructures put');
    else if ((ts.isShorthandPropertyAssignment(node) || ts.isPropertyAssignment(node)) && keyName(node.name) === 'put' && assignedTo(node)) report(node, 'destructures put');
    else if (ts.isIdentifier(node) && node.text === 'Committed' && !allowedCommitted(node)) report(node, `uses Committed as a value (${node.parent.getText(sf).slice(0, 60)})`);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function allowedCommitted(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isImportSpecifier(p)) return p.isTypeOnly || p.parent.parent.isTypeOnly;
  if (ts.isClassDeclaration(p) && p.name === id) return true;
  if (ts.isTypeReferenceNode(p) || ts.isTypeQueryNode(p)) return true;
  // implements, and an interface's extends, name a type; a class's extends runs the constructor.
  if (ts.isExpressionWithTypeArguments(p) && ts.isHeritageClause(p.parent)) return p.parent.token === ts.SyntaxKind.ImplementsKeyword || ts.isInterfaceDeclaration(p.parent.parent);
  return ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword && p.right === id;
}

// Every TypeScript file under packages/env/tools except commit.ts and the test files, as
// tools-relative paths.
function sources(): string[] {
  return readdirSync(TOOLS, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split('\\').join('/'))
    .filter((f) => /\.[mc]?tsx?$/.test(f) && !/\.test\.[mc]?tsx?$/.test(f) && f !== COMMIT)
    .sort();
}

describe('commit guard (R14-34)', () => {
  it('no file under packages/env/tools other than write/commit.ts puts into the world or constructs Committed', () => {
    const files = sources();
    expect(files).toContain('registry.ts');
    expect(files).toContain('write/note.ts');
    expect(files).toContain('test/exposure-rule.ts');
    expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false);
    expect(files.flatMap((f) => violations(relative(process.cwd(), join(TOOLS, f)), readFileSync(join(TOOLS, f), 'utf8')))).toEqual([]);
  });

  it('commit.ts itself puts and constructs, so the check sees the real forms', () => {
    const found = violations(COMMIT, readFileSync(join(TOOLS, COMMIT), 'utf8'));
    expect(found.some((v) => v.includes('uses ctx.world.put'))).toBe(true);
    expect(found.some((v) => v.includes('uses Committed as a value (new Committed('))).toBe(true);
  });

  it('flags every way to put or construct, and none of the allowed uses', () => {
    const bad = [
      'ctx.world.put(r);',
      'ctx.world?.put(r);',
      "ctx.world['put'](r);",
      'const { put } = ctx.world; put(r);',
      'const { put: p } = ctx.world;',
      'const w = ctx.world; w.put(r);',
      'return new Committed(content, []);',
      'return Reflect.construct(Committed, [content, []]);',
      'const C = Committed;',
      "import { Committed as C } from '../registry.ts'; new C(content, []);",
      "import { Committed } from '../registry.ts';",
      "import * as registry from '../registry.ts'; new registry.Committed(content, []);",
      "export { Committed } from '../registry.ts';",
      "const { Committed: C } = await import('../registry.ts');",
      'class Forged extends Committed {}',
      "import * as reg from '../registry.ts'; new reg['Committed'](content, []);",
      '({ put } = ctx.world);',
      '({ put: p } = ctx.world);',
      "const { ['put']: p } = ctx.world;",
      "({ ['put']: p } = ctx.world);",
      '[{ put }] = [ctx.world];',
      'for ({ put } of worlds);',
    ];
    for (const src of bad) expect(violations('x.ts', src), src).not.toEqual([]);
    const ok = [
      "import { callTool, type Committed } from '../registry.ts';",
      "import type { Committed } from '../registry.ts';",
      'export class Committed { constructor(readonly content: unknown) {} }',
      'if (payload instanceof Committed) payload = payload.content;',
      'function f(c: Committed): Committed[] { return [c]; }',
      'ctx.world.get(type, id);',
      '// ctx.world.put(r) happens in commit.ts',
      "const s = 'world.put';",
      'const put = 1;',
      'const o = { put: 1 }; x = { put };',
      'class Echo implements Committed { content = 1; written = []; }',
      'interface Shaped extends Committed {}',
      "const { get } = ctx.world; const k = { ['get']: 1 };",
    ];
    for (const src of ok) expect(violations('x.ts', src), src).toEqual([]);
  });
});
