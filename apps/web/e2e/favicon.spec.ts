// The page icon (P25c fix, builder-326): the hosted site answered /favicon.ico with 404, which
// logged a console error on every page. index.html names an icon under the Vite base, so the
// browser never asks for /favicon.ico; the icon is same-origin, so APP_CSP (default-src 'self')
// allows it. On load: no console error, no response of 400 or more, and the icon resolves.
import { expect, test } from '@playwright/test';
import { passGate } from './browse.ts';

test('the page names an icon under its base that resolves, and loads with no console error and no failed response', async ({ page }) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : undefined));
  page.on('response', (r) => (r.status() >= 400 ? failed.push(`${r.status()} ${r.url()}`) : undefined));
  page.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText ?? 'failed'} ${r.url()}`));
  await page.goto('./');
  await passGate(page);
  const base = test.info().project.use.baseURL!;
  const icon = page.locator('link[rel~="icon"]');
  await expect(icon).toHaveCount(1);
  const href = await icon.getAttribute('href');
  expect(href, 'the icon href is under the app base').toMatch(/^\/clinical-agent-env\/[^/]/);
  const res = await page.request.get(new URL(href!, base).href);
  expect(res.status(), href!).toBe(200);
  expect(res.headers()['content-type'] ?? '').toMatch(/^image\//);
  // A request for the site-root /favicon.ico, which the hosted site cannot serve, is never made.
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});
