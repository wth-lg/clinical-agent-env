// The trial page's arrival row (PW4-E1), on its own fixture (fixtures/event: one toy trial whose
// trajectory holds two env_event lines): the trajectory pane shows one arrival row per env_event,
// after the step that fired it, naming its event and what arrived. At 390 px (with the folded steps
// opened) and on the desktop, light and dark, each row is visible inside the viewport, the page
// does not scroll sideways, and axe finds nothing serious or critical.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { browseFrom } from './browse.ts';
import { arrivals, eventBase, record, RUN_ID, TRIAL } from './fixtures/event/event.ts';

const browse = browseFrom(eventBase);
const SIZES = [{ name: '390 px', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 900 }] as const;

test('the fixture: a PASS whose trajectory has the toy\'s two arrivals', () => {
  expect(record.outcome).toBe('PASS');
  expect(arrivals.map((a) => a.spec)).toEqual(['toy-a1', 'toy-d1']);
});

for (const size of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${size.name}, ${scheme}: each arrival is a row after the step that fired it, inside the viewport, and axe is clean`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ colorScheme: scheme });
      await browse(page, `./?view=runs&run=${RUN_ID}&trial=${encodeURIComponent(TRIAL)}`);
      await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', TRIAL);
      // Below the sm breakpoint the steps are folded behind a button (TrialPage.tsx); open them.
      const fold = page.getByTestId('trajectory-fold');
      if (size.width < 640) {
        await expect(fold).not.toHaveAttribute('open');
        await fold.locator('> summary').click();
      }
      await expect(fold).toHaveAttribute('open', '');
      const rows = page.getByTestId('arrival');
      await expect(rows).toHaveCount(arrivals.length);
      for (const [i, a] of arrivals.entries()) {
        const row = rows.nth(i);
        await expect(row).toHaveAttribute('data-spec', a.spec);
        await row.scrollIntoViewIfNeeded();
        await expect(row).toBeVisible();
        await expect(row).toContainText('Arrived in the queues after step 3');
        await expect(row).toContainText(`(event ${a.spec})`);
        for (const k of a.keys) await expect(row).toContainText(k);
        const box = (await row.boundingBox())!;
        expect(box.x, `${a.spec} row starts inside the viewport`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${a.spec} row ends inside the viewport`).toBeLessThanOrEqual(size.width);
      }
      const sizes = await page.evaluate(() => [document.querySelector('main')!, document.documentElement].map((e) => ({ sw: e.scrollWidth, cw: e.clientWidth })));
      for (const { sw, cw } of sizes) expect(sw).toBeLessThanOrEqual(cw);
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
      expect(bad).toEqual([]);
    });
  }
}
