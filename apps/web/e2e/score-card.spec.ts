// The rubric score card (pre-audit M2, P17j JU4): the score tile reads "Rubric score (does not decide
// pass)"; a penalty that did not fire reads "not triggered", not "not met"; the rubric table ends with
// a total of the points earned against the points possible; and with judge items unknown (in the
// current grade's checks) the tile says they are not counted, with the score each way for an
// unknown penalty, and the total leaves them out (verifier-phase-P17i-JU4JU11-1 S1-S3).
import { expect, test, type Page } from '@playwright/test';
import { browse } from './browse.ts';
import { rubricTotal, totalText } from '../src/trial/rubric.ts';
import { record, RUN_ID, trialBase, TRIALS } from './fixtures/trial/trial.ts';

async function openGrading(page: Page, name: string) {
  await browse(page, new URL(`./?view=runs&run=${RUN_ID}&trial=${encodeURIComponent(name)}&tab=grading`, await trialBase(test.info().project.use.baseURL!)).href);
  await expect(page.getByTestId('panel-grading')).toBeVisible();
}

test('the score tile title, "not triggered" penalties and the rubric total', async ({ page }) => {
  const r = record(TRIALS.pass);
  await openGrading(page, TRIALS.pass);
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
  const unknown = new Set(['note_states_crcl', 'note_uses_wrong_scr']);
  await page.route(`**/data/results/runs/${RUN_ID}/trials/${TRIALS.pass}.json`, async (route) => {
    const res = await route.fetch();
    const rec = JSON.parse(await res.text()) as { checks: { id: string; met: unknown }[] };
    rec.checks = rec.checks.map((c) => (unknown.has(c.id) ? { ...c, met: 'unknown' } : c));
    await route.fulfill({ response: res, body: JSON.stringify(rec) });
  });
  await openGrading(page, TRIALS.pass);
  const p = page.getByTestId('panel-grading');
  // The fixture's met positives are 10 points without note_states_crcl; the -5 penalty would halve it.
  await expect(p.getByTestId('score-card-note')).toHaveText('2 judge items unknown and not counted; 0.50 if the unknown penalty fired, 1.00 if not');
  await expect(p.getByText(/upper bound/)).toHaveCount(0);
  await expect(p.getByTestId('rubric-total')).toHaveText('Total10 of 10 points (2 unknown items not counted)');
});
