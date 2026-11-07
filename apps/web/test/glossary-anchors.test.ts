// Every glossary link written with a fixed anchor (anchor="pass") lands on a section of the
// Glossary page that has that id; a link to a missing id opens the page at the top. The
// "fault labels" link on Findings goes to the Fault labels table, not to one fault's criteria
// (verifier-phase-P17i-P17j-S9-1 N2). Anchors built from data (fault-${f}, criterion-${id})
// follow ids built the same way in Glossary.tsx, so a source grep reads only the fixed ones; a
// fixed anchor may still name one fault's card (fault-model). A plain term's anchor is its id in
// glossary/terms.ts (P25u J7, copy rule C6).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAULT_PRECEDENCE } from '../../../packages/core/outcomes.ts';
import { PLAIN_TERMS } from '../src/glossary/terms.ts';

const SRC = join(import.meta.dirname, '../src');
const GLOSSARY = readFileSync(join(SRC, 'glossary/Glossary.tsx'), 'utf8');
const IDS = new Set([...[...GLOSSARY.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!), ...FAULT_PRECEDENCE.map((f) => `fault-${f}`), ...PLAIN_TERMS.map((t) => t.id)]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('glossary anchors', () => {
  it('every fixed anchor names an id on the Glossary page', () => {
    const missing = files(SRC).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/\banchor="([^"]+)"/g)].filter((m) => !IDS.has(m[1]!)).map((m) => `${relative(SRC, f)}: ${m[1]}`),
    );
    expect(missing, `ids in Glossary.tsx: ${[...IDS].join(', ')}`).toEqual([]);
  });

  // The table sits inside the Exact rules disclosure (P25u J7b, copy rule C1), under its own id, and
  // the page calls itself the Glossary, never Attribution (copy rule C3).
  it('the Fault labels table has an id inside the Exact rules disclosure, and Findings links "the fault labels" to it', () => {
    expect(GLOSSARY).toMatch(/id="fault-labels"/);
    expect(GLOSSARY).toMatch(/data-testid="exact-rules"/);
    expect(GLOSSARY.indexOf('data-testid="exact-rules"')).toBeLessThan(GLOSSARY.indexOf('id="fault-labels"'));
    expect(readFileSync(join(SRC, 'findings/Findings.tsx'), 'utf8')).toMatch(/<GlossaryLink anchor="fault-labels">see the fault labels in the Glossary<\/GlossaryLink>/);
  });

  it('the page title is Glossary, and no S5 view calls the page Attribution', () => {
    expect(GLOSSARY).toMatch(/export const GLOSSARY_TITLE = 'Glossary'/);
    for (const dir of ['findings', 'glossary', 'environment']) {
      for (const f of files(join(SRC, dir))) {
        const hits = readFileSync(f, 'utf8').split('\n').filter((l) => /\b(on|in|the) Attribution\b/.test(l) && !/^\s*\/\//.test(l));
        expect(hits, relative(SRC, f)).toEqual([]);
      }
    }
  });
});
