// The rail page is "Attribution" (pre-audit S9, P17j JU1; verifier-phase-P17j-close-1 S9): no card
// title, link or sentence in the UI or the docs still calls it "Labels". The word stays where it
// means a fault label ("fault labels", the Label column), which is lower case or follows another
// word. A grep over the source, so it reads every view, card and link at once; e2e/labels.spec.ts
// checks the rendered pages.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '../../..');
const ROOTS = ['apps/web/src', 'docs'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|md|html|json)$/.test(name) ? [p] : [];
  });
}

// "Labels" as a word on its own: a title, link text, "on Labels". Inside an identifier
// (expectNoOldLabels) it is not a word, and "Fault labels" is lower case.
const PAGE_NAME = /\bLabels\b/;

describe('the Attribution page is never called Labels', () => {
  it('no UI source or doc names it Labels', () => {
    const hits = ROOTS.flatMap((root) => files(join(REPO, root))).flatMap((f) =>
      readFileSync(f, 'utf8').split('\n').flatMap((line, i) => (PAGE_NAME.test(line) ? [`${relative(REPO, f)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(hits, 'Call the page "Attribution", as the rail does (apps/web/src/shell/views.ts); for the label table use "Fault labels"').toEqual([]);
  });
});
