// The read-only Chart tab (pre-audit S12, P17j JU10; trace A4): ?view=tasks&task=<id>&tab=chart shows
// the task patient's problems, medications, allergies, labs and notes from the in-browser FHIR R4
// store, captioned with the store as the source; its rows are exactly the store's resources for that
// patient, by a deep `reference` walk that does not use patientOf (verifier-phase-P17j-retro-JU10-1
// D2); the panel task T3 has a patient picker over every member of its panel; a T6 message shows its
// text (D1).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CHART_TYPES, taskPatients } from '../src/tasks/chart.ts';
import { chartIds, world } from './fixtures/chart-oracle.ts';
import { sampleBase } from './fixtures/sample-results/sample.ts';

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
    expect(shown, `${patient} ${type}`).toEqual(chartIds(patient, type));
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

test('discharge-medrec: a note shows its text, and the discharge summary names metoprolol (verifier JU10-1 F2)', async ({ page }) => {
  await openChart(page, 'discharge-medrec');
  const notes = page.locator('[data-testid="chart-row"][data-type="DocumentReference"]').getByTestId('chart-note');
  expect(await notes.count()).toBeGreaterThan(0);
  expect((await notes.allTextContents()).join(' ').toLowerCase()).toContain('metoprolol');
});

test('message-queue: a patient message shows its text (verifier-phase-P17j-retro-JU10-1 D1)', async ({ page }) => {
  await openChart(page, 'message-queue');
  await page.getByRole('combobox', { name: 'Patient' }).selectOption('Patient/pt-0026');
  await expectRowsEqualStore(page, 'Patient/pt-0026');
  const msg = page.locator('[data-testid="chart-row"][data-type="Communication"][data-id="comm-t6-m1"]');
  await expect(msg).toContainText('Refill request');
  await expect(msg.getByTestId('chart-note')).toContainText('refill my lisinopril 20 mg');
});
