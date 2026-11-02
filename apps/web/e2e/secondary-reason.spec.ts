// The secondary reason on screen (verifier-phase-P17i-SAFEPRECr2-1 F3): when an unmarked safety gate
// outranks the first failed gate, explainTrial names the first failed check as a secondary reason,
// and the Runs row and the trial header show it (data-testid secondary-reason) as explainTrial gives
// it. F1: when the requirement has a clause boundary (a word ending in a comma or semicolon) among
// the words the reason keeps, the cut falls there, not mid-clause.
// The trials are found in the sample records, not named: the sample is regenerated whenever a task's
// list changes (verifier-phase-P17i-W4E3-T3-201-1 B1: the crc-care-gap cut removed the two pinned).
import { expect, test } from '@playwright/test';
import { browseFrom } from './browse.ts';
import { CHECK_TEXT, explain, records, sampleBase } from './fixtures/sample-results/sample.ts';

const browse = browseFrom(sampleBase);
const nameOf = (r: (typeof records)[number]) => `${r.task_id}/${r.index}`;
const words = (s: string) => s.trim().split(/\s+/);

// Every sample trial with a secondary reason, with its first failed check and, when the expected part
// was cut, the words it kept.
const withSecondary = records.flatMap((r) => {
  const secondary = explain(r).secondary_reason;
  if (!secondary) return [];
  const m = /^first failed check: (\S+) failed: expected (.*?)(…)?, found /.exec(secondary);
  return m ? [{ r, secondary, check: m[1]!, kept: m[3] ? m[2]! : null }] : [];
});
// F1's precondition: the reason was cut, and the requirement has a clause boundary among the words it
// kept (from the third word on, as explain.ts firstClauses looks).
const boundaryCut = withSecondary.filter(({ r, check, kept }) => {
  if (kept === null) return false;
  const req = words(CHECK_TEXT[r.task_id]![check]!.requires).slice(0, words(kept).length);
  return req.some((w, i) => i >= 2 && /[,;]$/.test(w));
});

test('the sample has trials with a secondary reason, one of them cut where a clause boundary falls', () => {
  expect(withSecondary.length).toBeGreaterThan(0);
  expect(boundaryCut.length).toBeGreaterThan(0);
});

test('a trial with a secondary reason shows it on the Runs row and in the trial header', async ({ page }) => {
  const { r, secondary } = withSecondary[0]!;
  const name = nameOf(r);
  expect(secondary).toMatch(/^first failed check: \S+ failed: expected /);
  await browse(page, './?view=runs');
  await expect(page.locator(`[data-testid="trial-row"][data-trial="${name}"]`).getByTestId('secondary-reason')).toHaveText(secondary);
  await browse(page, `./?view=runs&trial=${encodeURIComponent(name)}`);
  await expect(page.getByTestId('trial-header').getByTestId('secondary-reason')).toHaveText(secondary);
  // In the header it is the "Also failed" line, muted (ui-polish 3.3).
  await expect(page.getByTestId('trial-header').getByTestId('secondary-reason').locator('xpath=preceding-sibling::dt[1]')).toHaveText('Also failed');
});

test('a secondary reason whose requirement has a clause boundary is cut there, not mid-clause', async ({ page }) => {
  const { r, secondary, check, kept } = boundaryCut[0]!;
  const name = nameOf(r);
  const req = CHECK_TEXT[r.task_id]![check]!.requires;
  // The kept words end where the requirement has its comma or semicolon.
  expect(req.startsWith(`${kept!},`) || req.startsWith(`${kept!};`), `${name}: ${secondary}`).toBe(true);
  expect(secondary).not.toMatch(/\bthe…/);
  await browse(page, `./?view=runs&trial=${encodeURIComponent(name)}`);
  await expect(page.getByTestId('trial-header').getByTestId('secondary-reason')).toHaveText(secondary);
});
