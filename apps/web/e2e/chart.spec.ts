// The read-only Chart tab (pre-audit S12, P17j JU10; trace A4): ?view=tasks&task=<id>&tab=chart shows
// the task patient's problems, medications, allergies, labs and notes from the in-browser FHIR R4
// store, captioned with the store as the source; its rows are exactly the store's resources for that
// patient; the panel task T3 has a patient picker over every member of its panel.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CHART_TYPES, taskPatients, type ChartResource } from '../src/tasks/chart.ts';
import { sampleBase } from './fixtures/sample-results/sample.ts';

const world = gunzipSync(readFileSync(new URL('../../../fixtures/world.ndjson.gz', import.meta.url))).toString('utf8')
  .split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as ChartResource);
const idsOf = (patient: string, type: string) => world.filter((r) => r.resourceType === type && ((r.subject ?? r.patient)?.reference === patient)).map((r) => r.id).sort();

async function openChart(page: Page, task: string) {
  await page.goto(new URL(`./?view=tasks&task=${task}&tab=chart`, await sampleBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(page.getByTestId('chart-heading')).toBeVisible({ timeout: 60_000 });
}

async function expectRowsEqualStore(page: Page, patient: string) {
  await expect(page.getByTestId('chart-heading')).toHaveAttribute('data-patient', patient);
  for (const type of CHART_TYPES) {
    const shown = (await page.locator(`[data-testid="chart-row"][data-type="${type}"]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')!))).sort();
    expect(shown, `${patient} ${type}`).toEqual(idsOf(patient, type));
  }
}

test('renal-dose-review: the Chart tab names the store as its source and lists exactly Harold Vance\'s resources', async ({ page }) => {
  await openChart(page, 'renal-dose-review');
  await expect(page.getByTestId('chart-source')).toContainText('Source: FHIR R4 store');
  await expect(page.getByTestId('chart-heading')).toContainText('Harold Vance');
  await expect(page.getByTestId('chart-patient')).toHaveCount(0);
  await expectRowsEqualStore(page, 'Patient/pt-0002');
});

test('crc-care-gap: a patient picker over the panel; each choice lists that patient\'s resources', async ({ page }) => {
  test.setTimeout(120_000);
  await openChart(page, 'crc-care-gap');
  const patients = taskPatients(world, 'crc-care-gap');
  const picker = page.getByRole('combobox', { name: 'Patient' });
  expect(await picker.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).toEqual(patients);
  await expectRowsEqualStore(page, patients[0]!);
  await picker.selectOption(patients.at(-1)!);
  await expectRowsEqualStore(page, patients.at(-1)!);
});

test('at 390 px the Chart tab does not scroll the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChart(page, 'contrast-ct-prep');
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
});

test('axe finds no serious or critical violation on the Chart tab, light and dark', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openChart(page, 'renal-dose-review');
    const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
    expect(bad, scheme).toEqual([]);
  }
});
