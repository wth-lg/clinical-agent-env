// The rubric score card (pre-audit M2, P17j JU4): the score tile reads "Rubric score (does not decide
// pass)"; a penalty that did not fire reads "not triggered", not "not met"; the rubric table ends with
// a total of the points earned against the points possible; and with judge items unknown (in the
// current grade's checks) the tile says they are not counted, with the score each way for an
// unknown penalty, and the total leaves them out (verifier-phase-P17i-JU4JU11-1 S1-S3). That state
// passes axe in light and dark.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { browse } from './browse.ts';
import { rubricTotal, totalText } from '../src/trial/rubric.ts';
import { records, sampleBase, summary } from './fixtures/sample-results/sample.ts';
import type { TrialFixture } from './fixtures/trial/trial.ts';

// A committed PASS whose rubric has a penalty that did not fire and a judged item: contrast-ct-prep's
// (W1: renal-dose-review's rubric, the trial fixture's PASS, is code items only).
const PASS = 'contrast-ct-prep/0';
// The committed record, read with the trial fixture's check shape (points, method, evidence).
const record = (name: string) => records.find((r) => `${r.task_id}/${r.index}` === name) as unknown as TrialFixture;

async function openGrading(page: Page, name: string) {
  await browse(page, new URL(`./?view=runs&trial=${encodeURIComponent(name)}&tab=grading`, await sampleBase(test.info().project.use.baseURL!)).href);
  await expect(page.getByTestId('panel-grading')).toBeVisible();
}

test('the score tile title, "not triggered" penalties and the rubric total', async ({ page }) => {
  const r = record(PASS);
  expect(r.outcome).toBe('PASS');
  await openGrading(page, PASS);
  const p = page.getByTestId('panel-grading');
  await expect(p.getByTestId('score-card')).toContainText('Rubric score (does not decide pass)');
  const rubric = (r.checks ?? []).filter((c) => c.kind === 'rubric');
  const penalties = rubric.filter((c) => (c.points ?? 0) < 0 && c.met === false);
  expect(penalties.length).toBeGreaterThan(0);
  for (const c of penalties) await expect(p.locator(`[data-testid="rubric-row"][data-id="${c.id}"]`).getByTestId('rubric-met')).toHaveText('not triggered');
  const { earned, possible } = rubricTotal(rubric);
  const total = p.getByTestId('rubric-total');
  await expect(total).toHaveText(`Total${totalText(rubricTotal(rubric))}`);
  await expect(total).toHaveAttribute('data-earned', String(earned));
  await expect(total).toHaveAttribute('data-possible', String(possible));
  // No unknown judge item: no note.
  await expect(p.getByTestId('score-card-note')).toHaveCount(0);
});

test('with judge items unknown, the tile says they are not counted and the total leaves them out', async ({ page }) => {
  const unknown = new Set(['message_driver', 'iv_steroid_regimen']);
  await page.route(`**/data/results/runs/${summary.run_id}/trials/${PASS}.json`, async (route) => {
    const res = await route.fetch();
    const rec = JSON.parse(await res.text()) as { checks: { id: string; met: unknown }[] };
    rec.checks = rec.checks.map((c) => (unknown.has(c.id) ? { ...c, met: 'unknown' } : c));
    await route.fulfill({ response: res, body: JSON.stringify(rec) });
  });
  await openGrading(page, PASS);
  const p = page.getByTestId('panel-grading');
  // The fixture's met positives are 5 points without message_driver; the -3 penalty would leave 2.
  await expect(p.getByTestId('score-card-note')).toHaveText('2 judge items unknown and not counted; 0.40 if the unknown penalty fired, 1.00 if not');
  await expect(p.getByText(/upper bound/)).toHaveCount(0);
  await expect(p.getByTestId('rubric-total')).toHaveText('Total5 of 5 points (2 unknown items not counted)');
  // The note's state passes axe, light and dark (verifier-phase-P17j-retro-JU4JU11-1 m-a).
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(p.getByTestId('score-card-note')).toBeVisible();
    const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
    expect(bad, scheme).toEqual([]);
  }
});
