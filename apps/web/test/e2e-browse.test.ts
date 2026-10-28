// One guarded way past the key gate (verifier-phase-P17i-JU8r3-1 N1): App.tsx remembers "Browse
// without a key" for the tab, so a second visit on one page shows no gate and an unguarded click
// waits out the test timeout (JU8r2-1 B1). Every spec goes through e2e/browse.ts, which clicks the
// gate only when it shows; no spec clicks it itself.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const E2E = join(import.meta.dirname, '../e2e');
const CLICK = /name: 'Browse without a key' \}\)\s*\.click\(|\bgate\.click\(/;

describe('the key gate in the e2e specs', () => {
  it('only e2e/browse.ts clicks "Browse without a key"', () => {
    const specs = readdirSync(E2E).filter((f) => f.endsWith('.spec.ts'));
    expect(specs.filter((f) => CLICK.test(readFileSync(join(E2E, f), 'utf8')))).toEqual([]);
    expect(readFileSync(join(E2E, 'browse.ts'), 'utf8')).toMatch(CLICK);
  });
});
