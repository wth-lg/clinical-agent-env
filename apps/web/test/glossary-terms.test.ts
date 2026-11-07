// The Plain terms card on the Glossary (P25u J7): one sentence per term a reader meets on the other
// pages, each with an anchor id the other pages link to (copy rule C6), the numbers in them read
// from packages/core, never typed.
import { describe, expect, it } from 'vitest';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../../../packages/core/cost.ts';
import { PLAIN_TERMS } from '../src/glossary/terms.ts';

// The terms the synthesis names (J7b), by anchor id.
const REQUIRED = ['term-gate-check', 'term-rubric-item', 'term-pass-k', 'term-wilson', 'term-band', 'term-fhir-r4', 'term-world-hash', 'term-frozen-world', 'term-superseded', 'term-pilot', 'term-safe-pass', 'term-harm-item', 'term-m1-m5'];

describe('plain terms', () => {
  it('cover every term the synthesis names, each under a term- anchor', () => {
    const ids = PLAIN_TERMS.map((t) => t.id);
    for (const id of REQUIRED) expect(ids, id).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^term-[a-z0-9-]+$/);
  });

  it('each is one plain sentence: ends with a full stop, no exclamation, at most 40 words, no internal id', () => {
    for (const t of PLAIN_TERMS) {
      expect(t.term.length, t.id).toBeGreaterThan(0);
      expect(t.text, t.id).toMatch(/\.$/);
      expect(t.text, t.id).not.toMatch(/!/);
      expect(t.text.split(/\s+/).length, t.id).toBeLessThanOrEqual(40);
      // One sentence: a full stop inside it may only end an abbreviation-free number such as 20%.
      expect(t.text.slice(0, -1), t.id).not.toMatch(/\.\s/);
      expect(t.text, t.id).not.toMatch(/\b(R\d{2}|S-\d|P17[a-z])\b/);
    }
  });

  it('the band and the trial count come from packages/core', () => {
    const band = PLAIN_TERMS.find((t) => t.id === 'term-band')!;
    expect(band.text).toContain(`${FINAL_PASS_BAND[0] * 100}% to ${FINAL_PASS_BAND[1] * 100}%`);
    const trial = PLAIN_TERMS.find((t) => t.id === 'term-trial')!;
    expect(trial.text).toContain(String(FINAL_TRIALS_PER_TASK));
  });
});
