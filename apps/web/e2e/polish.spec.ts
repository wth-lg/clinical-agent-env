// Top bar and polish (pre-audit U10, P17j JU12, the part that needs neither JU8 nor JU10): one
// key-state chip with Add key; the pinned clock in words; the local-run card at the width of the
// cards above it; each tool row with the first sentence of its description; and a key that does
// not start with sk-ant- refused in the page, before any network request. Environment gets its own
// axe check, light and dark (verifier-phase-P17j-retro-JU12-1 D2).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { browseFrom, GATE } from './browse.ts';
import { readFileSync } from 'node:fs';
import { firstSentence, formatClock } from '../src/data/text.ts';
import { sampleBase } from './fixtures/sample-results/sample.ts';

const NOW = (JSON.parse(readFileSync(new URL('../../../fixtures/manifest.json', import.meta.url), 'utf8')) as { now: string }).now;

async function openApp(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  await expect(page.getByRole('button', { name: GATE }).or(page.getByRole('navigation', { name: 'Views' }))).toBeVisible();
}

const browse = browseFrom(sampleBase);

test('the top bar has one key-state chip, with Add key when there is no key', async ({ page }) => {
  await browse(page, './?view=overview');
  const bar = page.getByRole('banner');
  await expect(bar.getByTestId('key-chip')).toHaveCount(1);
  await expect(bar.getByTestId('key-chip')).toHaveText('No key');
  await expect(bar.getByText(/no key/i)).toHaveCount(1);
  await expect(bar.getByRole('button', { name: 'Add key' })).toBeVisible();
});

test('Overview shows the pinned clock in words, in the world\'s own offset', async ({ page }) => {
  // The clock is in the environment summary of an Overview with no official run, so serve none.
  await page.route('**/data/index.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) }));
  await browse(page, './?view=overview');
  const clock = page.getByTestId('pinned-clock');
  await expect(clock).toHaveText(formatClock(NOW));
  await expect(clock).toHaveAttribute('title', NOW);
  // The committed world's clock today (verifier JU12a-1 F2).
  if (NOW === '2026-10-23T08:00:00-04:00') await expect(clock).toHaveText('Fri 23 Oct 2026, 08:00 (UTC−4)');
});

test('Environment shows the pinned clock in words too', async ({ page }) => {
  await browse(page, './?view=environment');
  await expect(page.getByTestId('pinned-clock')).toHaveText(formatClock(NOW));
  await expect(page.getByTestId('pinned-clock')).toHaveAttribute('title', NOW);
});

test('Environment: axe finds nothing serious or critical, light and dark (verifier-phase-P17j-retro-JU12-1 D2)', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await browse(page, './?view=environment');
    await expect(page.getByTestId('tool').first()).toBeVisible();
    await expect(page.getByTestId('pinned-clock')).toBeVisible();
    const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
    expect(bad, scheme).toEqual([]);
  }
});

test('the local-run card lines up with the cards above it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await browse(page, './?view=overview');
  const card = await page.getByTestId('intro-card').boundingBox();
  const panel = await page.getByTestId('local-run-panel').boundingBox();
  expect(Math.abs(panel!.x - card!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(panel!.width - card!.width)).toBeLessThanOrEqual(1);
});

test('each tool row shows the first sentence of its description without opening it', async ({ page }) => {
  await browse(page, './?view=environment');
  const rows = page.getByTestId('tool');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const purpose = rows.nth(i).getByTestId('tool-purpose');
    await expect(purpose).toBeVisible();
    // The row's line is the first sentence of the tool's own description (verifier JU12a-1 F2).
    const description = (await rows.nth(i).getByTestId('tool-description').textContent()) ?? '';
    await expect(purpose).toHaveText(firstSentence(description));
  }
});

test('a key that does not start with sk-ant- is refused in the page with no network request', async ({ page }) => {
  await openApp(page, './');
  await page.getByLabel('API key', { exact: true }).fill('not-a-key');
  // Every request after Validate counts, same origin too (verifier JU12a-1 F2), except the page's own
  // static GETs of data/ and assets/: the results loader is still fetching trajectories in the
  // background when Validate is pressed, and those carry no key. Any other request (a POST, the API,
  // the relay, the runner) would be the key leaving the page.
  const requests: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    const own = r.method() === 'GET' && new URL(r.url()).origin === new URL(page.url()).origin && /\/(data|assets)\//.test(path);
    if (!own) requests.push(`${r.method()} ${r.url()}`);
  });
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText('An Anthropic key starts with sk-ant-.')).toBeVisible();
  await expect(page.getByText('Check the key and paste it again.')).toBeVisible();
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
});

// UI polish PR 1 (reports/ui-polish-spec.md 1.1, 1.5, 1.6): one primary action per task row, the
// no-key reason read out with each Run button, the phone nav strip under the top bar with a skip
// link, and touch-sized icon buttons on a coarse pointer.
test('a closed task row has exactly one primary button, and with no key it is Run reference solution', async ({ page }) => {
  await browse(page, './?view=tasks');
  const rows = page.getByTestId('task-card');
  await expect(rows).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    const primary = rows.nth(i).getByTestId('validation').locator('button.bg-primary');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText('Run reference solution');
  }
});

test('with no key, each Run button is described by its cost and the no-key reason, and Add key is the primary', async ({ page }) => {
  await browse(page, './?view=live&task=_toy');
  const reason = page.getByTestId('launcher-reason');
  await expect(reason).toBeVisible();
  const id = await reason.locator('[id]').first().getAttribute('id');
  expect(id).toBeTruthy();
  const run = page.getByTestId('run-x1');
  await expect(run).toHaveText('Run ×1');
  expect((await run.getAttribute('aria-describedby'))!.split(' ')).toContain(id);
  // One primary on the launcher: with no key it is Add key, since every Run button is disabled.
  await expect(page.getByTestId('launcher').locator('button.bg-primary')).toHaveCount(0);
  await expect(reason.locator('button.bg-primary')).toHaveText('Add key');
});

test.describe('phone shell at 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the first Tab focuses Skip to content, which moves focus to main', async ({ page }) => {
    await browse(page, './?view=overview');
    // Leaving the gate focuses the view's heading; a reload in the same tab skips the gate and
    // starts at the top of the document, as any later load does.
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
  });

  test('the views are a strip under the top bar: 44px links, main starts at x 0', async ({ page }) => {
    await browse(page, './?view=overview');
    const nav = page.getByRole('navigation', { name: 'Views' });
    const header = (await page.getByRole('banner').boundingBox())!;
    const strip = (await nav.boundingBox())!;
    expect(strip.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(strip.width).toBeGreaterThanOrEqual(389);
    for (const link of await nav.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await page.locator('main').boundingBox())!.x).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test('the Hosted chip shows its icon only, and keeps its name and title', async ({ page }) => {
    await browse(page, './?view=overview');
    const chip = page.getByRole('banner').getByTestId('surface-chip');
    await expect(chip).toHaveText('Hosted');
    const outer = chip.locator('..');
    await expect(outer).toHaveAttribute('title', /^Hosted\./);
    expect((await outer.boundingBox())!.width).toBeLessThanOrEqual(32);
  });
});

test('a rail navigation moves focus to the new view\'s heading', async ({ page }) => {
  await browse(page, './?view=overview');
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Environment' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Environment' })).toBeFocused();
});

test.describe('coarse pointer at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the hash copy button is at least 44px', async ({ page }) => {
    await browse(page, './?view=environment');
    const copy = page.getByTestId('manifest-hash').getByRole('button', { name: 'Copy the full hash' });
    const box = (await copy.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  });
});

// UI polish PR 2 (reports/ui-polish-spec.md 2.1, 2.2) on the sample build, and the PR 1 gate's F1,
// F2 and F5 (verifier-phase-P17i-UI-1-1).
test('Overview: the intro card has a numbered Start here list of three links (ui-polish 2.1)', async ({ page }) => {
  await browse(page, './?view=overview');
  const start = page.getByTestId('intro-card').getByTestId('start-here');
  await expect(start).toHaveJSProperty('tagName', 'OL');
  await expect(start.getByRole('link')).toHaveText(['Read a task', 'See a failed trial', 'Check the grader, no key needed']);
  await expect(start.getByRole('link', { name: 'Read a task' })).toHaveAttribute('href', /[?&]tab=prompt(&|$)/);
  await expect(start.getByRole('link', { name: 'Check the grader, no key needed' })).toHaveAttribute('href', /[?&]tab=grader-validation(&|$)/);
  await start.getByRole('link', { name: 'See a failed trial' }).click();
  await expect(page.getByTestId('trial-detail')).toBeVisible();
  await expect(page.getByTestId('trial-detail')).not.toHaveAttribute('data-trial', /^$/);
  await expect(page.getByTestId('trial-header').getByTestId('outcome')).not.toHaveText('PASS');
});

test('Runs: the header shows k/N as a stat with its Wilson interval and the outcome counts; the rules are in a closed details (ui-polish 2.2)', async ({ page }) => {
  await browse(page, './?view=runs');
  const head = page.getByTestId('runs-summary');
  await expect(head.getByTestId('runs-stat')).toHaveCSS('font-size', '24px');
  await expect(head.getByTestId('runs-wilson')).toHaveText(/^Wilson 95% \d/);
  await expect(head.getByTestId('outcome-count').first()).toBeVisible();
  // Each count reads as "FAIL: 4 trials", and the chip row has a name (verifier-phase-P17i-UI-2-1 M4).
  const counts = head.getByRole('group', { name: 'Trials by outcome' }).getByTestId('outcome-count');
  await expect(counts.first()).toBeVisible();
  for (const text of await counts.allTextContents()) expect(text).toMatch(/^[A-Z_]+: \d+ trials?$/);
  const rules = head.locator('details', { has: page.getByTestId('plain-rules') }).first();
  await expect(rules.locator('> summary')).toHaveText('How a trial is counted');
  await expect(rules).not.toHaveAttribute('open', '');
  // Only the rules are closed: the trials each task's k/N leaves out, and why, stay in view (UI-2-1 S1).
  await expect(head.getByTestId('runs-not-counted')).toBeVisible();
  await expect(head.getByTestId('runs-not-counted')).toContainText('ENV_LIMIT');
  await expect(rules.getByTestId('runs-not-counted')).toHaveCount(0);
});

test('the rate dot is about 9.5 px across and round at every width, inside the 16 px row (verifier-phase-P17i-UI-2-1 S2)', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await browse(page, './?view=findings');
    await expect(page.getByTestId('interval').first()).toBeVisible();
    const rows = await page.getByTestId('interval').evaluateAll((svgs) => svgs.filter((s) => s.getClientRects().length > 0).map((s) => {
      const dot = s.querySelector('circle')!.getBoundingClientRect();
      return { row: s.getBoundingClientRect().height, w: dot.width, h: dot.height };
    }));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.row, `${width}`).toBe(16);
      expect(r.w, `${width}`).toBeGreaterThanOrEqual(9);
      expect(r.w, `${width}`).toBeLessThanOrEqual(10);
      expect(Math.abs(r.w - r.h), `${width}`).toBeLessThan(0.5);
    }
  }
});

test('a double-click on a word in a row\'s reason selects the word and does not open the trial (verifier-phase-P17i-UI-2-1 M2)', async ({ page }) => {
  await browse(page, './?view=runs');
  const reason = page.locator('[data-testid="trial-row"][data-outcome="FAIL"]').first().getByTestId('reason');
  await reason.dblclick({ position: { x: 20, y: 8 } });
  // Longer than a single click waits before it opens the trial.
  await page.waitForTimeout(800);
  await expect(page.getByTestId('trial-detail')).toHaveCount(0);
  expect(await page.evaluate(() => getSelection()?.toString().trim() ?? '')).not.toBe('');
});

test('Runs: at 1440 no row\'s chip line wraps, and a click on a row\'s reason opens its trial (ui-polish 2.2)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await browse(page, './?view=runs');
  const lines = await page.locator('[data-testid="trial-row"] [data-testid="chip-line"]').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).map((e) => {
    const boxes = [...e.children].map((c) => c.getBoundingClientRect());
    return { trial: e.closest('[data-trial]')!.getAttribute('data-trial'), top: Math.max(...boxes.map((b) => b.top)), bottom: Math.min(...boxes.map((b) => b.bottom)) };
  }));
  expect(lines.length).toBeGreaterThan(10);
  for (const l of lines) expect(l.top, l.trial!).toBeLessThan(l.bottom);
  const row = page.locator('[data-testid="trial-row"][data-outcome="FAIL"]').first();
  const name = await row.getAttribute('data-trial');
  await row.getByTestId('reason').click();
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name!);
});

test('F1: on the phone strip a focused link\'s ring has room above and below it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await browse(page, './?view=overview');
  const link = page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Tasks' });
  await link.focus();
  const room = await link.evaluate((a) => {
    const box = a.getBoundingClientRect();
    const clip = a.parentElement!.getBoundingClientRect();
    const s = getComputedStyle(a);
    const ring = parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset);
    return { above: box.top - clip.top, below: clip.bottom - box.bottom, ring };
  });
  expect(room.ring).toBeGreaterThan(0);
  expect(room.above).toBeGreaterThanOrEqual(room.ring);
  expect(room.below).toBeGreaterThanOrEqual(room.ring);
});

test('F2: each rail label fits inside its item at every width from 640px', async ({ page }) => {
  for (const width of [640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await browse(page, './?view=environment');
    const fits = await page.getByRole('navigation', { name: 'Views' }).getByRole('link').evaluateAll((links) => links.map((a) => {
      const label = a.querySelector('span')!.getBoundingClientRect();
      const item = a.getBoundingClientRect();
      const nav = a.closest('nav')!.getBoundingClientRect();
      return { name: a.textContent, inItem: label.left >= item.left + 1 && label.right <= item.right - 1, inNav: item.left >= nav.left && item.right <= nav.right - 1 };
    }));
    for (const f of fits) expect(f, `${width} ${f.name}`).toEqual({ name: f.name, inItem: true, inNav: true });
  }
});

test('F5: the hover fade runs when the pointer leaves too, and an untouched control has none', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await browse(page, './?view=overview');
  const nav = page.getByRole('navigation', { name: 'Views' });
  const tasks = nav.getByRole('link', { name: 'Tasks' });
  await tasks.hover();
  await page.mouse.move(800, 600);
  expect(await tasks.evaluate((a) => getComputedStyle(a).transitionDuration)).toBe('0.12s');
  expect(await nav.getByRole('link', { name: 'Findings' }).evaluate((a) => getComputedStyle(a).transitionDuration)).toBe('0s');
});

// UI polish PR 5 (reports/ui-polish-spec.md 5.1, 5.2, 5.4): readable task names in the launcher, the
// Add key prompt before the controls, the friendlier empty state, and a key gate that welcomes first
// and keeps one filled primary with a hint while the key field is empty.
test('the launcher\'s Task select shows task titles, with the id as each option\'s value', async ({ page }) => {
  await browse(page, './?view=live&task=_toy');
  const select = page.getByRole('combobox', { name: 'Task' });
  await expect(select).toHaveValue('_toy');
  await expect(select.locator('option[value="_toy"]')).toHaveText('Practice task (write one note)');
  await expect(select.locator('option[value="renal-dose-review"]')).toHaveText('Renal and age dose review of Harold Vance');
});

test('with no key, the Add key prompt comes before the Run buttons, and the empty runs list says what to do', async ({ page }) => {
  await browse(page, './?view=live&task=_toy');
  const add = page.getByTestId('launcher-reason').getByRole('button', { name: 'Add key' });
  const run = page.getByTestId('run-x1');
  await expect(add).toBeVisible();
  // DOCUMENT_POSITION_FOLLOWING (4): run-x1 comes after Add key in the DOM.
  expect(await add.evaluate((a, r) => a.compareDocumentPosition(r!) & 4, await run.elementHandle())).toBe(4);
  await expect(page.getByTestId('no-live-runs')).toContainText('No runs yet. Press Run ×1 to start one trial. A trial takes about 1 to 4 minutes, and you see each step as it runs.');
  await expect(page.locator('main').getByText('Pick a task and run it. You see each step the model takes, then the grade.')).toBeVisible();
});

test('the key gate welcomes first, keeps Validate as its one filled primary and asks for a key while the field is empty', async ({ page }) => {
  await openApp(page, './');
  await expect(page.getByRole('heading', { level: 1, name: 'See an AI model do clinical tasks' })).toBeVisible();
  await expect(page.getByText('You can look at everything with no key. Add a key only to run new trials.')).toBeVisible();
  const validate = page.getByRole('button', { name: 'Validate' });
  await expect(validate).toHaveClass(/\bbg-primary\b/);
  await expect(validate).toBeEnabled();
  await expect(page.locator('main button.bg-primary')).toHaveCount(1);
  const hint = page.getByText('Paste a key to continue');
  await expect(hint).toBeVisible();
  expect((await validate.getAttribute('aria-describedby')) ?? '').toContain((await hint.getAttribute('id'))!);
  // Browse without a key is a full button beside Validate: a solid outline, not the quiet style.
  const gate = page.getByRole('button', { name: GATE });
  expect(await gate.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
  expect(await gate.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.getByLabel('API key', { exact: true }).fill('sk-ant-x');
  await expect(hint).toHaveCount(0);
});

// UI polish PR 4 (reports/ui-polish-spec.md 4.1 to 4.4): on a closed task row the grader validation
// buttons are quiet, with icons, beside the one primary; each button in the Grader validation tab
// says in one line what it does; the reference solution's result reads in plain words; the task
// tabs wrap on a phone; and the Environment Try panel fills in a working example for each tool.
test.describe('task rows at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the validation buttons on a closed row are quiet, with icons; Run trial says it needs a key; every row is the same height', async ({ page }) => {
    await browse(page, './?view=tasks');
    const rows = page.getByTestId('task-card');
    await expect(rows).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const v = rows.nth(i).getByTestId('validation');
      for (const name of ['Check the grader', 'Replay published trials']) {
        const b = v.getByRole('button', { name });
        await expect(b).not.toHaveClass(/\bbg-primary\b/);
        expect(await b.evaluate((el) => getComputedStyle(el).borderTopColor), name).toBe('rgba(0, 0, 0, 0)');
      }
      for (const name of ['Run reference solution', 'Check the grader', 'Replay published trials']) await expect(v.getByRole('button', { name }).locator('svg')).toHaveCount(1);
      await expect(v.getByRole('button', { name: 'Run trial' })).toHaveAccessibleDescription('Needs an API key');
    }
    const heights = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(heights).size, heights.join(' ')).toBe(1);
  });
});

test('the Grader validation tab says in one line what each button does', async ({ page }) => {
  await browse(page, './?view=tasks&task=renal-dose-review&tab=grader-validation');
  const panel = page.getByTestId('task-panel-grader-validation');
  const lines: Record<string, string> = {
    'Run reference solution': 'Runs a known-good answer; it must pass.',
    'Check the grader': 'Tries planted wrong answers; each must fail.',
    'Replay published trials': 'Grades saved trials again; grades must match.',
  };
  for (const [name, line] of Object.entries(lines)) {
    await expect(panel.getByText(line, { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name })).toHaveAccessibleDescription(line);
  }
});

test('the reference solution\'s result reads in plain words, beside the oracle label', async ({ page }) => {
  test.setTimeout(180_000);
  await browse(page, './?view=tasks');
  const v = page.locator('[data-testid="validation"][data-task="renal-dose-review"]');
  await v.getByRole('button', { name: 'Run reference solution' }).click();
  const oracle = v.getByTestId('oracle-result');
  await expect(oracle).toHaveAttribute('data-outcome', 'PASS', { timeout: 150_000 });
  await expect(oracle).toContainText('Reference solution: PASS, score 1.0');
  await expect(oracle).toContainText('oracle PASS 1.0');
  // A count that is zero is left out.
  await expect(oracle).not.toContainText('judge items unknown');
  await expect(oracle).not.toContainText('cache misses');
});

test('at 390 px the task tabs wrap, so Grader validation is in view on the prompt tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await browse(page, './?view=tasks&task=renal-dose-review&tab=prompt');
  const tabs = page.getByRole('tablist', { name: 'Task' });
  // The open card is far down the page; bring the strip into view, then no tab may sit past its edge.
  await tabs.scrollIntoViewIfNeeded();
  await expect(tabs.getByRole('tab', { name: 'Grader validation' })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('Environment: choosing a tool fills in an example input that runs', async ({ page }) => {
  await browse(page, './?view=environment');
  await expect(page.getByRole('button', { name: 'Check a fresh copy matches' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Tool' }).selectOption('search_patients');
  const input = page.getByRole('textbox', { name: 'Input (JSON)' });
  expect(JSON.parse(await input.inputValue())).toEqual({ name: 'Harold Vance' });
  await page.getByRole('button', { name: 'Run tool', exact: true }).click();
  const r = page.getByTestId('try-result');
  await expect(r).toHaveAttribute('data-error', 'false', { timeout: 60_000 });
  await expect(r.getByTestId('try-content')).toContainText('Harold Vance');
});
