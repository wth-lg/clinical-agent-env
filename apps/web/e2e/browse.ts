// The one way past the key gate for every spec (verifier-phase-P17i-JU8r3-1 N1): App.tsx remembers
// "Browse without a key" for the tab (sessionStorage clinenv-browsing), so a second visit on one page
// shows no gate, and a click that does not check for it waits out the test timeout (JU8r2-1 B1).
// test/e2e-browse.test.ts keeps every other gate click out of the specs.
import { expect, test, type Page } from '@playwright/test';

// Clicks "Browse without a key" when the gate shows, then waits for the rail; true when it clicked.
export async function passGate(page: Page): Promise<boolean> {
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  const shown = await gate.isVisible();
  if (shown) await gate.click();
  await expect(nav).toBeVisible();
  return shown;
}

export async function browse(page: Page, url: string): Promise<boolean> {
  await page.goto(url);
  return passGate(page);
}

// browse() at a path of a build's base (sampleBase, trialBase): `const open = browseFrom(sampleBase)`.
export const browseFrom = (base: (baseURL: string) => Promise<string>) => async (page: Page, path = './'): Promise<boolean> =>
  browse(page, new URL(path, await base(test.info().project.use.baseURL!)).href);
