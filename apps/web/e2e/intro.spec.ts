// What this is and how to run it (pre-audit S6, P17j JU5): Overview opens with a short card in
// plain words (what the model does, what the world is, what one trial is, how a pass is decided),
// each sentence 25 words or fewer, with two actions: add a key and run in this tab (the key
// gate), and run on your computer (the local-run panel, on the hosted site). The key gate says in
// one sentence under the product name what the product is. On Tasks, Run trial is enabled and
// opens the Live trial view with the task selected.
import { expect, test, type Page } from '@playwright/test';
import { browseFrom, GATE } from './browse.ts';
import { MODEL } from '../../../packages/core/anthropic.ts';
import { FAILURE_KINDS } from '../../../packages/core/summary.ts';
import { kindWords } from '../src/data/failures.ts';
import { records, sampleBase, summary, TASK_IDS } from './fixtures/sample-results/sample.ts';

async function openApp(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: GATE });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
}

const browse = browseFrom(sampleBase);

const sentences = (text: string) => text.trim().split(/(?<=\.)\s+/).filter((s) => s !== '');
const words = (s: string) => s.split(/\s+/).filter((w) => w !== '').length;

test('Overview opens with a plain intro card: 3-4 sentences of 25 words or fewer; the run\'s model line names the model once (J19, J22)', async ({ page }) => {
  await browse(page, './?view=overview');
  const card = page.getByTestId('intro-card');
  await expect(card).toBeVisible();
  const text = await card.getByTestId('intro-text').innerText();
  const all = sentences(text);
  expect(all.length).toBeGreaterThanOrEqual(3);
  expect(all.length).toBeLessThanOrEqual(4);
  for (const s of all) expect(words(s), s).toBeLessThanOrEqual(25);
  // J22: the product name is explained where a reader first meets it.
  expect(text).toContain('Riverbend Family Medicine is a fictional clinic');
  // J19: the model and its effort appear once on Overview, in the run's own model line (the top
  // bar carries the effort; the intro no longer repeats the name).
  await expect(page.getByTestId('model-line')).toHaveText(`Model ${MODEL}, effort ${summary.effort}`);
  expect((await page.locator('main').innerText()).split(MODEL).length - 1).toBe(1);
});

// P25u S1 (Overview): the rubric score is named for what it is, a plain takeaway sits under the
// lead, each row shows the task's title and links, the swatches sit in rows of ten, and the
// verdict is a chip. (The fault card's audit count, J8a, is S5's FaultBox: findings.spec.)
test.describe('Overview after the UI/UX audit', () => {
  test('J1: the score column reads Rubric score, extra credit that does not decide pass; "Mean score" is gone', async ({ page }) => {
    await browse(page, './?view=overview');
    const table = page.getByTestId('overview-table');
    const head = table.locator('li').first();
    await expect(head).toContainText('Rubric score');
    await expect(head).toContainText('extra credit; does not decide pass');
    expect(await page.locator('main').innerText()).not.toContain('Mean score');
    const cell = page.locator('[data-testid="overview-row"][data-task="contrast-ct-prep"] [data-testid="rubric-score"]');
    const score = summary.tasks['contrast-ct-prep']!.mean_score!.toFixed(2);
    await expect(cell).toHaveText(score, { useInnerText: true });
    await expect(cell).toHaveAttribute('title', /does not decide pass/);
    // The sentence is on the screen itself, not only in a tooltip (copy rule C2).
    await expect(page.getByTestId('rubric-note')).toContainText('extra credit');
    await expect(page.getByTestId('rubric-note')).toContainText('does not decide pass');
    // On a phone the header is hidden, so each row carries the label.
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(cell).toHaveText(`Rubric score ${score}`, { useInnerText: true });
  });

  test('J5: a takeaway under the lead names the hardest task, whose fault the failures are, their kind and the checks that failed most', async ({ page }) => {
    await browse(page, './?view=overview');
    const t = page.getByTestId('takeaway');
    await expect(t).toBeVisible();
    const tasks = Object.entries(summary.tasks);
    const hardest = tasks.reduce((a, b) => (b[1].pass_rate! < a[1].pass_rate! ? b : a));
    const failures = tasks.reduce((n, [, s]) => n + s.fault_counts.failures, 0);
    const model = tasks.reduce((n, [, s]) => n + (s.fault_counts.label?.model ?? 0), 0);
    const byKind = FAILURE_KINDS.map((k) => ({ kind: k, count: tasks.reduce((n, [, s]) => n + s.fault_counts.taxonomy[k], 0) })).sort((a, b) => b.count - a.count);
    const checks = new Map<string, number>();
    for (const [, s] of tasks) for (const c of s.top_failed_checks) checks.set(c.check, (checks.get(c.check) ?? 0) + c.count);
    const [topCheck, topCount] = [...checks].sort((a, b) => b[1] - a[1])[0]!;
    // The hardest task by its title and id, with its count.
    const titleOfHardest = page.locator(`[data-testid="overview-row"][data-task="${hardest[0]}"]`).getByTestId('overview-title');
    await expect(titleOfHardest).not.toHaveText(hardest[0]);
    await expect(t).toContainText(`${await titleOfHardest.innerText()} (${hardest[0]})`);
    await expect(t).toContainText(`${hardest[1].passes} of ${hardest[1].trials} trials pass`);
    // Whose fault, in the fault words of copy rule C4, scoped to the run so the count never reads
    // as the hardest task's (eval-p25u-1 defect 4).
    const scope = `Across the ${tasks.filter(([, s]) => s.trials > 0).length} tasks, `;
    await expect(t).toContainText(model === failures ? `${scope}all ${failures} failures are the model's fault` : `${scope}${model} of ${failures} failures are the model's fault`);
    // The kind that fails most, in words, and the check that decided most failures, by id and count.
    await expect(t).toContainText(kindWords(byKind[0]!.kind));
    await expect(t.locator('code', { hasText: topCheck })).toBeVisible();
    await expect(t).toContainText(`${topCheck} (${topCount})`);
    // Every sentence stays short enough to read cold.
    for (const s of sentences(await t.innerText())) expect(words(s), s).toBeLessThanOrEqual(25);
    const link = t.getByRole('link', { name: 'See a failed trial' });
    const href = new URL((await link.getAttribute('href'))!, 'https://example.test');
    expect(href.searchParams.get('view')).toBe('runs');
    expect(href.searchParams.get('trial')).toBe('first-nonpass');
  });

  test('J6: each row shows the task title linked to the task, the id under it, and an "N trials" link to its trials in Runs', async ({ page }) => {
    await browse(page, './?view=overview');
    for (const id of TASK_IDS) {
      const row = page.locator(`[data-testid="overview-row"][data-task="${id}"]`);
      const title = row.getByTestId('overview-title');
      // The title shows once the task list has loaded; until then the row names the id.
      await expect(title).not.toHaveText(id);
      const to = new URL((await title.getAttribute('href'))!, 'https://example.test').searchParams;
      expect(to.get('view'), id).toBe('tasks');
      expect(to.get('task'), id).toBe(id);
      expect(to.get('tab'), id).toBe('prompt');
      expect((await title.innerText()).trim(), id).not.toBe(id);
      await expect(row.getByTestId('overview-slug')).toHaveText(id);
      const n = records.filter((r) => r.task_id === id).length;
      const trials = row.getByTestId('overview-trials');
      await expect(trials).toHaveText(`${n} trials`);
      const runs = new URL((await trials.getAttribute('href'))!, 'https://example.test').searchParams;
      expect(runs.get('view'), id).toBe('runs');
      expect(runs.get('task'), id).toBe(id);
    }
    await expect(page.locator('[data-testid="overview-row"][data-task="renal-dose-review"]').getByTestId('overview-title')).toHaveText('DOAC renal and interaction dose review of the pharmacy list');
  });

  test('V10, V11: the swatches sit in rows of ten, the verdict is a chip with an icon, and the interval row has ticks at 0, 50 and 100', async ({ page }) => {
    await browse(page, './?view=overview');
    const row = page.locator('[data-testid="overview-row"][data-task="contrast-ct-prep"]');
    const n = records.filter((r) => r.task_id === 'contrast-ct-prep').length;
    // The row renders once the records load; a one-shot read right after browse() can see fewer
    // swatches (gate P25U-S1-2 F5), so wait for the full count first.
    const swatches = row.getByTestId('swatches').getByRole('img');
    await expect(swatches).toHaveCount(n);
    const tops = await swatches.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops.length).toBe(n);
    expect(new Set(tops.slice(0, 10)).size, 'the first ten swatches share one row').toBe(1);
    expect(tops[10]!, 'the eleventh starts the next row').toBeGreaterThan(tops[0]!);
    const verdict = row.getByTestId('band-verdict');
    await expect(verdict).toHaveAttribute('data-verdict', summary.tasks['contrast-ct-prep']!.band_verdict!);
    await expect(verdict.locator('svg')).toHaveCount(1);
    expect(await verdict.evaluate((el) => getComputedStyle(el).borderTopWidth)).not.toBe('0px');
    await expect(row.getByTestId('interval').locator('[data-testid="tick"]')).toHaveCount(3);
  });

  test('V13: the page title is 20px and a card title 15px, from the type steps', async ({ page }) => {
    await browse(page, './?view=overview');
    // Polled: Overview's loading frame and the loaded page each render an h1, so a one-shot read
    // can hit a detached node (getComputedStyle gives "" then; one flake in a 265-test run).
    await expect.poll(() => page.getByRole('heading', { level: 1 }).evaluate((el) => getComputedStyle(el).fontSize)).toBe('20px');
    await expect.poll(() => page.getByTestId('intro-card').getByRole('heading', { level: 2 }).evaluate((el) => getComputedStyle(el).fontSize)).toBe('15px');
  });
});

test('the intro card action "Add a key and run in this tab" opens the key gate', async ({ page }) => {
  await browse(page, './?view=overview');
  await page.getByTestId('intro-card').getByRole('button', { name: 'Add a key and run in this tab' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'See an AI model do clinical tasks' })).toBeVisible();
  // P25u J11: "Add an API key" is the key field's label, under the heading "Run new trials (needs an API key)".
  await expect(page.getByLabel('Add an API key', { exact: true })).toBeVisible();
});

test('the intro card action "Run on your computer" moves focus to the local-run panel', async ({ page }) => {
  await browse(page, './?view=overview');
  await page.getByTestId('intro-card').getByRole('button', { name: 'Run on your computer' }).click();
  await expect(page.getByTestId('local-run-panel')).toBeFocused();
});

test('the key gate says under the product name, in one sentence of 25 words or fewer, what the product is', async ({ page }) => {
  await openApp(page, './');
  const line = page.getByTestId('gate-intro');
  await expect(line).toBeVisible();
  const text = await line.innerText();
  expect(sentences(text)).toHaveLength(1);
  expect(words(text)).toBeLessThanOrEqual(25);
});

test('Tasks: Run trial is enabled and opens Live trial with the task selected', async ({ page }) => {
  await browse(page, './?view=tasks&task=renal-dose-review');
  const run = page.locator('[data-testid="task-card"][data-task="renal-dose-review"]').getByTestId('task-panel-prompt').getByRole('button', { name: 'Run trial' });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page).toHaveURL(/[?&]view=live(&|$)/);
  await expect(page).toHaveURL(/[?&]task=renal-dose-review(&|$)/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Live trial');
  await expect(page.getByRole('combobox', { name: 'Task' })).toHaveValue('renal-dose-review');
});

test('Tasks: a closed card\'s Run trial also opens Live trial with its task', async ({ page }) => {
  await browse(page, './?view=tasks');
  await page.locator('[data-testid="validation"][data-task="crc-care-gap"]').getByRole('button', { name: 'Run trial' }).click();
  await expect(page).toHaveURL(/[?&]view=live(&|$)/);
  await expect(page.getByRole('combobox', { name: 'Task' })).toHaveValue('crc-care-gap');
});

test('V2a: the mark legend says what a red outline means', async ({ page }) => {
  await browse(page, './?view=overview');
  await expect(page.getByTestId('legend').locator('li')).toHaveCount(7);
  await expect(page.getByTestId('legend-note')).toHaveText('Red outline: the environment or the grader, not the model. A model failure is a filled ink square.');
});

test('the intro card links "gate check" to the pass rule in the glossary, and names FHIR R4 as the record format (verifier JU5-1 M1, M5)', async ({ page }) => {
  await browse(page, './?view=overview');
  const card = page.getByTestId('intro-card');
  await expect(card.getByRole('heading', { level: 2, name: 'What this is' })).toBeVisible();
  await expect(card.getByTestId('intro-text')).toContainText('in the FHIR R4 health-record format');
  await card.getByRole('link', { name: 'gate check' }).click();
  await expect(page).toHaveURL(/[?&]view=glossary(&|#|$)/);
  expect(new URL(page.url()).hash).toBe('#pass');
});

test('Run trial from Tasks leaves no trial, run, label, check or audit filter behind (verifier JU5-1 M4; verifier-phase-P17j-retro-JU5-103-1 D2)', async ({ page }) => {
  await browse(page, './?view=tasks&task=renal-dose-review&label=model&run=sample-1&trial=x&check=urgent_item_unnotified&audit=grader');
  await page.locator('[data-testid="task-card"][data-task="renal-dose-review"]').getByTestId('task-panel-prompt').getByRole('button', { name: 'Run trial' }).click();
  await expect(page).toHaveURL(/[?&]view=live(&|$)/);
  await expect(page).not.toHaveURL(/[?&](label|run|trial|check|audit)=/);
});
