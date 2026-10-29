// "Hosted" has one source (plan JU5; verifier-phase-P17j-retro-JU5-103-1 D1): the surface main.tsx
// detects, read through surface/hosted.ts (isHosted, or useHosted under the shell). A component
// that tests runnerToken() or the surface kind again can disagree with it (a runner page whose
// health failed is runner-down, never browser-direct). main.tsx reads the token once to tell
// detect() whether this is the runner's page, and branches on all three detected kinds; detect.ts
// makes the surface.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

function hits(re: RegExp, allowed: string[]): string[] {
  return files(SRC)
    .filter((f) => !allowed.includes(relative(SRC, f)))
    .flatMap((f) => readFileSync(f, 'utf8').split('\n').flatMap((line, i) => (re.test(line) ? [`${relative(SRC, f)}:${i + 1}: ${line.trim()}`] : [])));
}

const FIX = 'Read useHosted() or isHosted(surface) from apps/web/src/surface/hosted.ts';

describe('the hosted fact has one source', () => {
  it('no component tests runnerToken() itself', () => {
    expect(hits(/runnerToken\(\)\s*[!=]==/, ['main.tsx']), FIX).toEqual([]);
  });

  it("no component tests the surface kind for 'browser-direct' itself", () => {
    expect(hits(/\.kind\s*[!=]==\s*'browser-direct'/, ['surface/hosted.ts', 'surface/detect.ts', 'main.tsx']), FIX).toEqual([]);
  });
});
