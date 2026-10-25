import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A Worker under apps/web/src/worker/ starts from a blob: URL (live/transport/worker.ts), so its
// base URL is the blob: a relative URL, or one built against import.meta.url, does not name the
// site there. Every URL it fetches or imports at run time comes absolute in its start message
// (P15 verifier follow-up). Static `import ... from` lines are bundled and are not URLs at run time.
const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'worker');

const RULES: Array<{ what: string; re: RegExp }> = [
  { what: 'new URL(x, import.meta.url)', re: /new\s+URL\s*\([^)]*import\.meta\.url/ },
  { what: 'import.meta.url', re: /import\.meta\.url/ },
  { what: 'a relative URL passed to fetch, import(), new URL, new Worker or importScripts', re: /\b(?:fetch|import|URL|Worker|importScripts|EventSource|WebSocket)\s*\(\s*(['"`])(?:\.{1,2}\/|\/(?!\/))/ },
  { what: 'a relative URL passed to XMLHttpRequest.open', re: /\.open\s*\(\s*(['"`])[A-Z]+\1\s*,\s*(['"`])(?:\.{1,2}\/|\/(?!\/))/ },
];

// Each line of `source` that builds a run-time URL against the Worker's own location.
export function relativeUrls(source: string): string[] {
  return source.split('\n').flatMap((line, i) => (/^\s*(?:import|export)\s.*\sfrom\s/.test(line) || /^\s*\/\//.test(line) ? [] : RULES.filter((r) => r.re.test(line)).map((r) => `line ${i + 1}: ${r.what}`)));
}

const files = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && /\.tsx?$/.test(e.name)).map((e) => join(e.parentPath, e.name));

describe('apps/web/src/worker/** builds no URL against its own location', () => {
  it('finds each planted form', () => {
    expect(relativeUrls("const u = new URL('../../fixtures/x.json', import.meta.url);")).toContain('line 1: new URL(x, import.meta.url)');
    expect(relativeUrls("await fetch('/clinical-agent-env/data/index.json');")).toHaveLength(1);
    expect(relativeUrls("const m = await import('./mod.js');")).toHaveLength(1);
    expect(relativeUrls('fetch(`../data/${x}`)')).toHaveLength(1);
    expect(relativeUrls("x.open('GET', '/data/a.json')")).toHaveLength(1);
    // The past mistake in harness/trial-worker.ts, had it been a blob: Worker.
    expect(relativeUrls('definitions: await json(new URL(definitionsUrl, import.meta.url).href),')).not.toEqual([]);
  });

  it('passes absolute URLs, start-message URLs and bundled imports', () => {
    expect(relativeUrls("import { run } from '../../../../packages/core/run.ts';")).toEqual([]);
    expect(relativeUrls('const res = await fetch(url);')).toEqual([]);
    expect(relativeUrls("await fetch('https://example.org/data.json');")).toEqual([]);
    expect(relativeUrls("// fetch('/not/code')")).toEqual([]);
  });

  it('holds for every file', () => {
    const found = files(WORKER_DIR).flatMap((f) => relativeUrls(readFileSync(f, 'utf8')).map((m) => `${relative(WORKER_DIR, f)} ${m}`));
    expect(found).toEqual([]);
  });
});
