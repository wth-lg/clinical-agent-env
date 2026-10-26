// The secondary reason's check sentence cuts its expected part at a clause boundary, never mid-clause
// (verifier-phase-P17i-SAFEPRECr2-1 F1, decisions.tsv 2026-10-28T05:00): sample crc-care-gap/9 read
// "... a screening gap, and none for the…, found ...".
import { describe, expect, it } from 'vitest';
import { checkSentence } from '../explain.ts';

const EXPECTED = 'one new FIT kit order for each of the 5 patients with a screening gap, and none for the others';
const FOUND = 'a FIT order for Patient/pt-0009 (Elly Shyla Trantow), who is excluded: frailty dementia medication';

describe('checkSentence', () => {
  it('cuts the expected part after its last whole clause that fits (crc-care-gap/9)', () => {
    // REASON_WORDS 40 less the three words of "first failed check:".
    const s = checkSentence('fit_orders', EXPECTED, FOUND, 37);
    expect(s).toBe(`fit_orders failed: expected one new FIT kit order for each of the 5 patients with a screening gap…, found ${FOUND}`);
    expect(s).not.toMatch(/\bthe…/);
  });

  it('keeps the whole sentence when it fits, and the found part is never cut', () => {
    expect(checkSentence('fit_orders', EXPECTED, FOUND, 60)).toBe(`fit_orders failed: expected ${EXPECTED}, found ${FOUND}`);
  });

  it('cuts by words when no clause boundary leaves at least three words', () => {
    const s = checkSentence('x', 'alpha beta gamma delta epsilon zeta eta theta iota kappa', 'y', 9);
    expect(s).toBe('x failed: expected alpha beta gamma delta…, found y');
  });
});
