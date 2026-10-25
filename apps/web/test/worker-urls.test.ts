import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A Worker started from a blob: URL (live/transport/worker.ts blobWorkerUrl) has the blob: as its
// base URL: a relative URL, or one built against import.meta.url, does not name the site there.
// Every URL such a Worker fetches or imports at run time comes absolute in its start message or
// is resolved against location.origin (P15 verifier follow-up). This holds for every module the
// Worker loads, not only its entry: each `?worker&url` entry under src/ and the modules it
// imports, followed through relative imports (verifier-phase-P16-1 m1). Static `import ... from`
// statements are bundled and are not URLs at run time.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const RULES: Array<{ what: string; re: RegExp }> = [
  { what: 'new URL(x, import.meta.url)', re: /new\s+URL\s*\([^)]*import\.meta\.url/g },
  { what: 'import.meta.url', re: /import\.meta\.url/g },
  { what: 'a relative URL passed to fetch, import(), new URL, new Worker or importScripts', re: /\b(?:fetch|import|URL|Worker|importScripts|EventSource|WebSocket)\s*\(\s*(['"`])(?:\.{1,2}\/|\/(?!\/))/g },
  { what: 'a relative URL passed to XMLHttpRequest.open', re: /\.open\s*\(\s*(['"`])[A-Z]+\1\s*,\s*(['"`])(?:\.{1,2}\/|\/(?!\/))/g },
];

// The source with comments and `import ... from` / `export ... from` statements blanked, newlines
// kept, so a match's line is its line in the file.
const blank = (m: string) => m.replace(/[^\n]/g, ' ');
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, pre: string) => pre + blank(m.slice(pre.length)))
    .replace(/^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])[^'"]+\1;?/gm, blank);
}

// Each call in `source` that builds a run-time URL against the Worker's own location, by the line
// the call starts on; the URL may be on a later line.
export function relativeUrls(source: string): string[] {
  const text = code(source);
  const lineOf = (i: number) => text.slice(0, i).split('\n').length;
  return RULES.flatMap((r) => [...text.matchAll(r.re)].map((m) => ({ line: lineOf(m.index), what: r.what })))
    .sort((a, b) => a.line - b.line)
    .map((x) => `line ${x.line}: ${x.what}`);
}

// A relative import's file: the path as written, else with .ts, .tsx or /index.ts; null for an
// asset (?url, ?worker, .json) or a package.
function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.') || spec.includes('?') || spec.endsWith('.json')) return null;
  const base = resolve(dirname(from), spec);
  return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((f) => /\.tsx?$/.test(f) && existsSync(f)) ?? null;
}
const IMPORTS = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

const files = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && /\.tsx?$/.test(e.name)).map((e) => join(e.parentPath, e.name));

// The `?worker&url` entries under src/ (each one is booted through blobWorkerUrl), then every
// module they reach through relative imports.
export function blobModules(): string[] {
  const entries = files(SRC).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/from\s*['"]([^'"]+)\?worker&url['"]/g)].map((m) => resolveImport(f, m[1]!)).filter((x): x is string => x !== null));
  const seen = new Set<string>();
  const todo = [...entries];
  while (todo.length > 0) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(IMPORTS)) {
      const next = resolveImport(f, m[1]!);
      if (next !== null) todo.push(next);
    }
  }
  return [...seen].sort();
}

describe('no module a blob: Worker loads builds a URL against its own location', () => {
  it('finds each planted form', () => {
    expect(relativeUrls("const u = new URL('../../fixtures/x.json', import.meta.url);")).toContain('line 1: new URL(x, import.meta.url)');
    expect(relativeUrls("await fetch('/clinical-agent-env/data/index.json');")).toHaveLength(1);
    expect(relativeUrls("const m = await import('./mod.js');")).toHaveLength(1);
    expect(relativeUrls('fetch(`../data/${x}`)')).toHaveLength(1);
    expect(relativeUrls("x.open('GET', '/data/a.json')")).toHaveLength(1);
    // The past mistake in harness/trial-worker.ts, had it been a blob: Worker.
    expect(relativeUrls('definitions: await json(new URL(definitionsUrl, import.meta.url).href),')).not.toEqual([]);
  });

  it('finds a call whose URL is on the next line, at the line of the call (verifier-phase-P16-1 m1)', () => {
    expect(relativeUrls("const a = 1;\nawait fetch(\n  '/clinical-agent-env/data/index.json',\n);")).toEqual(['line 2: a relative URL passed to fetch, import(), new URL, new Worker or importScripts']);
    expect(relativeUrls('const u = new URL(\n  x,\n  import.meta.url,\n);')).toContain('line 1: new URL(x, import.meta.url)');
    // A multi-line import list and a block comment are not run-time URLs.
    expect(relativeUrls("import {\n  a,\n  b,\n} from '../x.ts';\n/* fetch('/not/code') */")).toEqual([]);
  });

  it('passes absolute URLs, start-message URLs and bundled imports', () => {
    expect(relativeUrls("import { run } from '../../../../packages/core/run.ts';")).toEqual([]);
    expect(relativeUrls('const res = await fetch(url);')).toEqual([]);
    expect(relativeUrls("await fetch('https://example.org/data.json');")).toEqual([]);
    expect(relativeUrls("// fetch('/not/code')")).toEqual([]);
  });

  it('scans every module a blob: Worker loads, not only src/worker/** (verifier-phase-P16-1 m1)', () => {
    const scanned = blobModules().map((f) => relative(SRC, f));
    expect(scanned).toEqual(expect.arrayContaining(['worker/trial.ts', 'tasks/validation-thread.ts', 'data/world.ts']));
  });

  it('holds for every file', () => {
    const found = blobModules().flatMap((f) => relativeUrls(readFileSync(f, 'utf8')).map((m) => `${relative(SRC, f)} ${m}`));
    expect(found).toEqual([]);
  });
});
