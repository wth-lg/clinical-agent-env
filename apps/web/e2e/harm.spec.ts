// Harm on screen (pre-audit B2b, P17j JU3): Overview, Runs and the trial page show "safe PASS k/n"
// (summary.json pass_no_harm) next to k/n, and a PASS with a met rubric item of HARM_POINTS (-5) or
// fewer points carries a red "PASS with harm: <item> (points)" chip; an unknown such item reads
// "PASS, harm unknown: <item>"; a -3 item is not harm (decisions.tsv 2026-10-27T23:40). The safe
// PASS counts are read on message-queue, where pass_no_harm differs from passes, and a committed
// harm PASS (message-queue/3) shows its real chip (verifier-phase-P17j-retro-JU3-1 D1, D2).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { checks } from '../../../tasks/message-queue/tests/grader.ts';
import { rubricQuestion } from '../src/tasks/check-text.ts';
import { sampleBase, summary } from './fixtures/sample-results/sample.ts';

// A fixture PASS with no harm item; the plants add theirs.
const TRIAL = 'renal-dose-review/0';
// A task whose safe PASS count differs from its PASS count, and one of its committed harm PASSes.
const SAFE_TASK = 'message-queue';
const s = summary.tasks[SAFE_TASK]!;
const HARM_TRIAL = 'message-queue/3';

async function browse(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(nav).toBeVisible();
}

// The fixture PASS, served with extra rubric items cloned from one of its own. summary.json is not
// rewritten, so the planted harm does not lower the run's safe PASS count (verifier JU3-1 F4).
async function plant(page: Page, extra: Array<{ id: string; points: number; met: boolean | 'unknown' }>) {
  await page.route(`**/data/results/runs/${summary.run_id}/trials/${TRIAL}.json`, async (route) => {
    const res = await route.fetch();
    const record = JSON.parse(await res.text()) as { checks: Array<Record<string, unknown>> };
    const like = record.checks.find((c) => c.kind === 'rubric')!;
    record.checks = [...record.checks, ...extra.map((x) => ({ ...like, ...x }))];
    await route.fulfill({ response: res, body: JSON.stringify(record) });
  });
}

const danger = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim());

test('a PASS with a met -8 item shows "PASS with harm" on its Runs row and trial header; a -3 item is not harm', async ({ page }) => {
  await plant(page, [{ id: 'planted_harm', points: -8, met: true }, { id: 'planted_slip', points: -3, met: true }]);
  await browse(page, './?view=runs');
  const row = page.locator(`[data-testid="trial-row"][data-trial="${TRIAL}"]`).getByTestId('harm-chip');
  await expect(row).toHaveText('PASS with harm: planted_harm (-8)');
  await browse(page, `./?view=runs&trial=${encodeURIComponent(TRIAL)}`);
  const chip = page.getByTestId('trial-header').getByTestId('harm-chip');
  await expect(chip).toHaveText('PASS with harm: planted_harm (-8)');
  await expect(chip).not.toContainText('planted_slip');
  // The danger colour, as the fault chips use it.
  const want = await danger(page);
  expect(await chip.evaluate((el, d) => {
    const probe = document.createElement('span');
    probe.style.color = d;
    document.body.append(probe);
    const same = getComputedStyle(probe).color === getComputedStyle(el).color;
    probe.remove();
    return same;
  }, want)).toBe(true);
});

test('a PASS with an unknown -6 item shows "PASS, harm unknown"', async ({ page }) => {
  await plant(page, [{ id: 'planted_maybe', points: -6, met: 'unknown' }]);
  await browse(page, `./?view=runs&trial=${encodeURIComponent(TRIAL)}`);
  await expect(page.getByTestId('trial-header').getByTestId('harm-chip')).toHaveText('PASS, harm unknown: planted_maybe');
});

test('a PASS with no harm item has no harm chip', async ({ page }) => {
  await browse(page, `./?view=runs&trial=${encodeURIComponent(TRIAL)}`);
  await expect(page.getByTestId('trial-header')).toBeVisible();
  await expect(page.getByTestId('harm-chip')).toHaveCount(0);
});

test('"safe PASS k/n" from summary.json sits next to k/n on Overview, Runs and the trial page', async ({ page }) => {
  // The fixture still tells the two counts apart, so a page that shows passes fails below.
  expect(s.pass_no_harm).not.toBe(s.passes);
  const safe = `safe PASS ${s.pass_no_harm}/${s.trials}`;
  const unsafe = `safe PASS ${s.passes}/${s.trials}`;
  await browse(page, './?view=overview');
  const overview = page.locator(`[data-testid="overview-row"][data-task="${SAFE_TASK}"]`).getByTestId('safe-pass');
  await expect(overview).toHaveText(safe);
  await expect(overview).not.toHaveText(unsafe);
  await browse(page, `./?view=runs&task=${SAFE_TASK}`);
  await expect(page.getByTestId('safe-pass').first()).toHaveText(`(${safe})`);
  await expect(page.getByTestId('safe-pass').first()).not.toHaveText(`(${unsafe})`);
  const all = Object.values(summary.tasks);
  await browse(page, './?view=runs');
  await expect(page.getByTestId('safe-pass').first()).toHaveText(`(safe PASS ${all.reduce((n, x) => n + x.pass_no_harm, 0)}/${all.reduce((n, x) => n + x.trials, 0)})`);
  await browse(page, `./?view=runs&trial=${encodeURIComponent(HARM_TRIAL)}`);
  await expect(page.getByTestId('safe-pass')).toHaveText(safe);
  await expect(page.getByTestId('safe-pass')).not.toHaveText(unsafe);
});

// reply_names_other_patient asks the judge once per recipient, so it has no fixed question and its
// chip is the id alone; m3_message_unsafe_advice has one, and the trial page adds it (verifier JU3-1 F5).
test('a committed harm PASS shows its real chip on Runs and the trial page, with the rubric question when the item has one', async ({ page }) => {
  expect(await rubricQuestion(checks.find((c) => c.id === 'reply_names_other_patient')!)).toBeNull();
  const question = await rubricQuestion(checks.find((c) => c.id === 'm3_message_unsafe_advice')!);
  expect(question).not.toBeNull();
  await browse(page, `./?view=runs&task=${SAFE_TASK}`);
  await expect(page.locator(`[data-testid="trial-row"][data-trial="${HARM_TRIAL}"]`).getByTestId('harm-chip')).toHaveText('PASS with harm: reply_names_other_patient (-8)');
  await browse(page, `./?view=runs&trial=${encodeURIComponent(HARM_TRIAL)}`);
  await expect(page.getByTestId('trial-header').getByTestId('harm-chip')).toHaveText('PASS with harm: reply_names_other_patient (-8)');
  await browse(page, `./?view=runs&trial=${encodeURIComponent('message-queue/1')}`);
  const chip = page.getByTestId('trial-header').getByTestId('harm-chip');
  await expect(chip).toContainText(`PASS with harm: m3_message_unsafe_advice, ${question!.slice(0, 40)}`);
  await expect(chip).toContainText('(-8)');
});

test('the planted harm chip: axe finds nothing serious or critical, light and dark, and nothing scrolls sideways at 390 px (verifier JU3-1 F3)', async ({ page }) => {
  test.setTimeout(120_000);
  await plant(page, [{ id: 'planted_harm', points: -8, met: true }]);
  for (const path of ['./?view=runs', `./?view=runs&trial=${encodeURIComponent(TRIAL)}`]) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await browse(page, path);
      await expect(page.getByTestId('harm-chip').first()).toBeVisible();
      const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
      expect(bad, `${path} ${scheme}`).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await browse(page, path);
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw, path).toBeLessThanOrEqual(cw);
  }
});
