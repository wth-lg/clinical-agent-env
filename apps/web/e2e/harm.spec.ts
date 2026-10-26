// Harm on screen (pre-audit B2b, P17j JU3): Overview, Runs and the trial page show "safe PASS k/n"
// (summary.json pass_no_harm) next to k/n, and a PASS with a met rubric item of HARM_POINTS (-5) or
// fewer points carries a red "PASS with harm: <item> (points)" chip; an unknown such item reads
// "PASS, harm unknown: <item>"; a -3 item is not harm (decisions.tsv 2026-10-27T23:40).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sampleBase, summary } from './fixtures/sample-results/sample.ts';

const TRIAL = 'renal-dose-review/0';
const s = summary.tasks['renal-dose-review']!;

async function browse(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(nav).toBeVisible();
}

// The fixture PASS, served with extra rubric items cloned from one of its own.
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
  await browse(page, './?view=overview');
  await expect(page.locator('[data-testid="overview-row"][data-task="renal-dose-review"]').getByTestId('safe-pass')).toHaveText(`safe PASS ${s.pass_no_harm}/${s.trials}`);
  await browse(page, './?view=runs&task=renal-dose-review');
  await expect(page.getByTestId('safe-pass').first()).toHaveText(`(safe PASS ${s.pass_no_harm}/${s.trials})`);
  const all = Object.values(summary.tasks);
  await browse(page, './?view=runs');
  await expect(page.getByTestId('safe-pass').first()).toHaveText(`(safe PASS ${all.reduce((n, x) => n + x.pass_no_harm, 0)}/${all.reduce((n, x) => n + x.trials, 0)})`);
  await browse(page, `./?view=runs&trial=${encodeURIComponent(TRIAL)}`);
  await expect(page.getByTestId('safe-pass')).toHaveText(`safe PASS ${s.pass_no_harm}/${s.trials}`);
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
