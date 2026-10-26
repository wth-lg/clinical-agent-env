// The rubric score card (pre-audit M2, P17j JU4): the score tile reads "Rubric score (does not decide
// pass)"; a penalty that did not fire reads "not triggered", not "not met"; the rubric table ends with
// a total of the points earned against the points possible; and with judge items unknown the tile
// says the score is an upper bound.
import { expect, test, type Page } from '@playwright/test';
import { rubricTotal } from '../src/trial/Grading.tsx';
import { record, RUN_ID, trialBase, TRIALS } from './fixtures/trial/trial.ts';

async function openGrading(page: Page, name: string) {
  await page.goto(new URL(`./?view=runs&run=${RUN_ID}&trial=${encodeURIComponent(name)}&tab=grading`, await trialBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
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
  await expect(total).toHaveText(`Total${earned} of ${possible} points`);
  await expect(total).toHaveAttribute('data-earned', String(earned));
  await expect(total).toHaveAttribute('data-possible', String(possible));
  // No unknown judge item: no upper-bound line.
  await expect(p.getByText(/upper bound/)).toHaveCount(0);
});

test('with one judge item unknown, the score tile says it is an upper bound', async ({ page }) => {
  await page.route(`**/data/results/runs/${RUN_ID}/trials/${TRIALS.pass}.json`, async (route) => {
    const res = await route.fetch();
    const rec = JSON.parse(await res.text()) as { judge: Record<string, unknown> };
    rec.judge = { ...rec.judge, unknown: 1 };
    await route.fulfill({ response: res, body: JSON.stringify(rec) });
  });
  await openGrading(page, TRIALS.pass);
  await expect(page.getByTestId('panel-grading').getByText('upper bound: 1 judge item unknown')).toBeVisible();
});
