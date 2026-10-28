// One guarded way past the key gate (verifier-phase-P17i-JU8r3-1 N1): App.tsx remembers "Browse
// without a key" for the tab, so a second visit on one page shows no gate and an unguarded click
// waits out the test timeout (JU8r2-1 B1). Every spec goes through e2e/browse.ts, which clicks the
// gate only when it shows. No other e2e file writes the button's name, so no locator form
// (getByText, exact: true, a variable) can click it (verifier-phase-P17i-UIRETRO-1 M2); a spec that
// waits for the gate uses browse.ts's GATE.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const E2E = join(import.meta.dirname, '../e2e');
const NAME = 'Browse without a key';
// The name as a string literal; comments may still say it.
const LITERAL = new RegExp(`(['"\`])${NAME}\\1`);
const code = (file: string) => readFileSync(join(E2E, file), 'utf8').replace(/^\s*\/\/.*$/gm, '');

describe('the key gate in the e2e specs', () => {
  it('only e2e/browse.ts names "Browse without a key"; it exports GATE, the name the key gate shows', () => {
    const files = readdirSync(E2E, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts') && f !== 'browse.ts');
    expect(files.filter((f) => LITERAL.test(code(f)))).toEqual([]);
    expect(code('browse.ts')).toContain(`export const GATE = '${NAME}';`);
    expect(readFileSync(join(import.meta.dirname, '../src/keygate/KeyGate.tsx'), 'utf8')).toMatch(new RegExp(`>\\s*${NAME}\\s*<`));
  });
});
