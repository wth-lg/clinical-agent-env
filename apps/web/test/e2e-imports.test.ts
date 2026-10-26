// Playwright loads the e2e specs with Node, not Vite: a spec that imports (at any depth) a module
// with a JSON import lacking `with { type: 'json' }`, or a Vite-only `import.meta.glob`/`.env`,
// stops the whole suite before any test runs (verifier-phase-P17i-JU4JU11-1 B1: score-card.spec
// imported Grading.tsx, which reached data/world.ts's manifest.json import).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const E2E = join(WEB, 'e2e');
// Type-only imports are erased before Node runs the file, so they are not followed.
const IMPORT = /\bimport\s(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]([^;\n]*)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

// The Node-unloadable imports reachable from `file`, each as "chain: reason".
function problems(file: string, seen = new Set<string>(), chain: string[] = []): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const here = [...chain, relative(WEB, file)];
  const out: string[] = [];
  if (/import\.meta\.(glob|env)\b/.test(text)) out.push(`${here.join(' -> ')}: Vite-only import.meta`);
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1] ?? m[3]!;
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(file), spec);
    if (spec.endsWith('.json')) {
      if (!/type:\s*['"]json['"]/.test(m[2] ?? '')) out.push(`${here.join(' -> ')}: ${spec} without { type: 'json' }`);
    } else if (/\.tsx?$/.test(spec)) out.push(...problems(target, seen, here));
  }
  return out;
}

describe('e2e specs', () => {
  it('import only modules Node can load', () => {
    const specs = readdirSync(E2E).filter((f) => f.endsWith('.spec.ts'));
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.flatMap((f) => problems(join(E2E, f)))).toEqual([]);
  });
});
