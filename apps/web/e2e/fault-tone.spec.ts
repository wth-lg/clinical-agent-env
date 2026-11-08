// Fault tone (pre-audit S5 and M15, P17j JU2): an environment or grader fault is a trial the run
// cannot count, so its outcome chip and its label take the danger colour (the mark keeps its
// pattern, so the meaning does not rest on colour); the pilot's grader error says it is a grader bug
// fixed before the final run, and an environment error "Not counted; it is run again." (decisions.tsv
// 2026-10-29T17:30 and 19:10); a model fault stays neutral; the FAIL mark stays readable in dark
// mode (at least 3:1 against its card). An ENV_LIMIT (plan-amendment-worklist W0-A) is the
// environment's too, but it is not run again: its note gives NOT_RERUN_REASON's reason, on the
// trial page and in Runs, never "it is run again", and the plain rules list it under "not run
// again" with that reason.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { NOT_RERUN_REASON } from '../../../packages/core/outcomes.ts';
import { browse } from './browse.ts';
import { explain, RUN_ID, runOf, trialBase, TRIALS } from './fixtures/trial/trial.ts';
import { exactReason } from '../src/trial/lead.ts';

async function openTrial(page: Page, name: string) {
  await browse(page, new URL(`./?view=runs&run=${runOf(name)}&trial=${encodeURIComponent(name)}`, await trialBase(test.info().project.use.baseURL!)).href);
  await expect(page.getByTestId('trial-header')).toBeVisible();
}

// A CSS colour as [r, g, b], read back from a canvas pixel (computed styles may be oklch).
async function rgb(page: Page, css: string): Promise<[number, number, number]> {
  return page.evaluate((c) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r!, g!, b!] as [number, number, number];
  }, css);
}
const danger = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim());
const style = (l: Locator, prop: 'borderTopColor' | 'color' | 'backgroundColor') => l.evaluate((el, p) => getComputedStyle(el)[p as 'color'], prop);
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const lum = ([r, g, b]: [number, number, number]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [what, name] of [['environment', TRIALS.envError], ['environment limit', TRIALS.envLimit], ['grader', TRIALS.graderError]] as const) {
    test(`${scheme}: an ${what} fault's chip and label take the danger colour, with the note`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openTrial(page, name);
      const header = page.getByTestId('trial-header');
      const want = await rgb(page, await danger(page));
      expect(await rgb(page, await style(header.getByTestId('outcome'), 'borderTopColor'))).toEqual(want);
      const label = header.getByTestId('label');
      await expect(label).toHaveCount(1);
      expect(await rgb(page, await style(label, 'color'))).toEqual(want);
      // One "Not counted" sentence on the header: the note says only the rest when the reason says it (F3).
      // The GRADER_ERROR exemplar is in a pilot run, which nothing blocks: its note says it is a grader
      // bug fixed before the final run; an ENV_ERROR is run again (decisions.tsv 2026-10-29T17:30, 19:10).
      const note = header.getByTestId('fault-note');
      if (what === 'grader') await expect(note).toHaveText(/^(Not counted\. )?A grader bug; it is fixed and regraded before the final run\.$/);
      else if (what === 'environment') await expect(note).toHaveText(/^(Not counted; i|I)t is run again\.$/);
      else {
        // The header's plain reason says "Not counted", so the note gives only the rest (F3).
        await expect(note).toHaveText(`It is not run again: ${NOT_RERUN_REASON.ENV_LIMIT}.`);
        await expect(header).not.toContainText('it is run again');
        await expect(header).not.toContainText('It is run again');
      }
      await expect(header.getByTestId('fault-note')).not.toContainText('run is blocked');
      expect((await header.innerText()).match(/Not counted/g)?.length ?? 0).toBeLessThanOrEqual(1);
      // The header's left accent is the danger colour only for a trial that blocks the official run.
      expect(await rgb(page, await header.evaluate((el) => getComputedStyle(el).borderLeftColor))).not.toEqual(want);
    });
  }

  test(`${scheme}: an ENV_LIMIT says why it counts against the environment: E8 and the P-L facts on the trial page, the reason in Runs`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const e = await explain(TRIALS.envLimit);
    expect(e).toMatchObject({ outcome: 'ENV_LIMIT', fault: 'env', deciding: { id: 'E8' } });
    await openTrial(page, TRIALS.envLimit);
    const header = page.getByTestId('trial-header');
    await expect(header.getByTestId('plain-reason')).toHaveText('Not counted: the trial stopped at a turn, cost or working-time limit and rule P-L found no loop (fewer than 20 calls ran, fewer than 10 of the last 20 repeat an earlier call on the same target, or one of them writes to a target not written before), so a human reviews the stop before the run goes on. The environment is at fault, not the model.');
    await expect(header.getByTestId('detail-fault')).toContainText(e.deciding!.evidence);
    await expect(header.getByTestId('detail-fault')).toContainText(/last \d+ calls?: \d+ repeats?, \d+ writes? to a new target; no loop/);
    // In Runs, the row gives the same label, note and reason.
    await browse(page, new URL(`./?view=runs&run=${RUN_ID}`, await trialBase(test.info().project.use.baseURL!)).href);
    const row = page.locator(`[data-testid="trial-row"][data-trial="${TRIALS.envLimit}"]`);
    await expect(row.getByTestId('label')).toHaveText('environment');
    await expect(row.getByTestId('fault-note')).toHaveText(`Not counted; it is not run again: ${NOT_RERUN_REASON.ENV_LIMIT}.`);
    await expect(row.getByTestId('reason')).toHaveText(exactReason(e.reason));
    await expect(row).not.toContainText('it is run again');
  });

  test(`${scheme}: a model fault stays neutral and has no note`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openTrial(page, TRIALS.failAudited);
    const header = page.getByTestId('trial-header');
    const want = await rgb(page, await danger(page));
    expect(await rgb(page, await style(header.getByTestId('label'), 'color'))).not.toEqual(want);
    expect(await rgb(page, await style(header.getByTestId('outcome'), 'borderTopColor'))).not.toEqual(want);
    await expect(header.getByTestId('fault-note')).toHaveCount(0);
    // A model fault's header accent is neutral, not the danger colour (F3).
    expect(await rgb(page, await header.evaluate((el) => getComputedStyle(el).borderLeftColor))).not.toEqual(want);
  });
}

test('the plain rules list ENV_LIMIT and GRADER_ERROR under "not run again", each with its reason', async ({ page }) => {
  await browse(page, new URL('./?view=glossary', await trialBase(test.info().project.use.baseURL!)).href);
  const line = page.getByTestId('not-counted-rule').first();
  await expect(line).toContainText(`ENV_LIMIT (not run again: ${NOT_RERUN_REASON.ENV_LIMIT})`);
  await expect(line).toContainText(`GRADER_ERROR (not run again: ${NOT_RERUN_REASON.GRADER_ERROR})`);
  await expect(line).toContainText('ENV_ERROR (run again)');
});

// P25u S1: the FAIL mark is its own token, so it is not near-white in dark mode and reads at
// 3:1 against the LIMIT mark in both themes (V1); the fault label's help icon keeps the title
// trace row U30 pins (gate P25U-S1 F1); a trial the user stopped says so instead of "API
// problem" (A1a).
for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: the FAIL mark is at least 3:1 against the LIMIT mark and against its card (V1)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await browse(page, new URL('./?view=overview', await trialBase(test.info().project.use.baseURL!)).href);
    const legend = page.getByTestId('legend').first();
    const swatch = (mark: string) => legend.locator(`li[data-mark="${mark}"] > span`).first();
    const fail = await rgb(page, await style(swatch('model'), 'backgroundColor'));
    const limit = await rgb(page, await style(swatch('limit'), 'backgroundColor'));
    const card = await rgb(page, await style(page.getByTestId('overview-table'), 'backgroundColor'));
    expect(contrast(fail, limit), `FAIL ${fail} against LIMIT ${limit}`).toBeGreaterThanOrEqual(3);
    expect(contrast(fail, card), `FAIL ${fail} against the card ${card}`).toBeGreaterThanOrEqual(3);
    expect(contrast(limit, card), `LIMIT ${limit} against the card ${card}`).toBeGreaterThanOrEqual(3);
    // The FAIL mark is never the ink colour in dark (a near-white square that reads as empty).
    if (scheme === 'dark') expect(fail).not.toEqual(await rgb(page, await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim())));
  });
}

test('the fault label\'s help icon keeps the title "How failures are attributed" (trace U30) and opens the Glossary at the label', async ({ page }) => {
  await openTrial(page, TRIALS.failAudited);
  const help = page.getByTestId('trial-header').getByRole('link', { name: 'How the model label is given' });
  await expect(help).toHaveAttribute('title', 'How failures are attributed');
  await expect(help).toHaveAccessibleDescription('How failures are attributed');
  await expect(help).toHaveAttribute('href', /view=glossary.*#fault-model$/);
});

test('A1a: a trial the user stopped (CANCELLED) is labelled "Stopped: not counted", not an API problem', async ({ page }) => {
  // The fixture's INFRA_API record becomes the record a Stop leaves: outcome and status CANCELLED.
  await page.route(`**/data/results/runs/${RUN_ID}/trials/${TRIALS.infra}.json`, async (route) => {
    const res = await route.fetch();
    const record = JSON.parse(await res.text()) as { outcome: string; status: string; detail: string | null };
    record.outcome = 'CANCELLED';
    record.status = 'CANCELLED';
    record.detail = null;
    await route.fulfill({ response: res, body: JSON.stringify(record) });
  });
  await openTrial(page, TRIALS.infra);
  const header = page.getByTestId('trial-header');
  await expect(header.getByTestId('outcome')).toContainText('CANCELLED');
  await expect(header.getByTestId('label')).toHaveText('Stopped: not counted');
  await expect(header).not.toContainText('API problem');
  // The same chip on its Runs row.
  await browse(page, new URL(`./?view=runs&run=${RUN_ID}`, await trialBase(test.info().project.use.baseURL!)).href);
  const row = page.locator(`[data-testid="trial-row"][data-trial="${TRIALS.infra}"]`);
  await expect(row.getByTestId('label')).toHaveText('Stopped: not counted');
});

// P25u follow-up (after S4): the trial page and Runs give a trial that is not counted the same chip
// as the live card (live/copy.ts infraWords), by outcome and detail, so "API problem" is said only
// when the API failed. The fixture's INFRA_API record stands in for each case through a route.
const INFRA_CASES = [
  { outcome: 'INFRA_HARNESS', detail: 'unpriced_usage', chip: 'Infrastructure problem: not counted, run again' },
  { outcome: 'INFRA_HARNESS', detail: 'spend_refused_ceiling', chip: 'Spend refused: not counted' },
  { outcome: 'INVALID', detail: 'model_mismatch', chip: 'Wrong model answered: not counted, the batch stopped' },
  { outcome: 'INFRA_API', detail: 'overloaded_error after 4 retries', chip: 'API problem: not counted, run again' },
] as const;
for (const c of INFRA_CASES) {
  test(`a ${c.outcome} (${c.detail}) trial reads "${c.chip}" on its page and in Runs, with the help icon's description kept`, async ({ page }) => {
    await page.route(`**/data/results/runs/${RUN_ID}/trials/${TRIALS.infra}.json`, async (route) => {
      const res = await route.fetch();
      const record = JSON.parse(await res.text()) as { outcome: string; status: string; detail: string | null };
      record.outcome = c.outcome;
      record.status = c.outcome;
      record.detail = c.detail;
      await route.fulfill({ response: res, body: JSON.stringify(record) });
    });
    await openTrial(page, TRIALS.infra);
    const header = page.getByTestId('trial-header');
    await expect(header.getByTestId('outcome')).toContainText(c.outcome);
    await expect(header.getByTestId('label')).toHaveText(c.chip);
    await expect(header.getByTestId('label')).toHaveAttribute('data-outcome', c.outcome);
    if (c.outcome !== 'INFRA_API') await expect(header).not.toContainText('API problem');
    // Trace U30: the help icon's description is unchanged.
    await expect(header.getByRole('link', { name: 'How the infra label is given' })).toHaveAttribute('title', 'How failures are attributed');
    await browse(page, new URL(`./?view=runs&run=${RUN_ID}`, await trialBase(test.info().project.use.baseURL!)).href);
    await expect(page.locator(`[data-testid="trial-row"][data-trial="${TRIALS.infra}"]`).getByTestId('label')).toHaveText(c.chip);
  });
}

test('dark: the FAIL mark is at least 3:1 against its card', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openTrial(page, TRIALS.failAudited);
  const header = page.getByTestId('trial-header');
  const mark = await rgb(page, await style(header.getByTestId('outcome').locator('span').first(), 'backgroundColor'));
  const card = await rgb(page, await style(header, 'backgroundColor'));
  expect(contrast(mark, card)).toBeGreaterThanOrEqual(3);
});
