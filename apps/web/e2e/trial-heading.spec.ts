// Trial page wording (pre-audit M7, M8, P17j JU11): the heading is the task title, then "Trial i of n
// · <model> · effort high", with the trial path in small mono text, and no word of the heading breaks
// mid-word at 390 px. A pilot that ran on another world version says so in a neutral tone and offers no
// Replay, and that note passes axe in light and dark; an official trial on another world keeps the alert.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { browse } from './browse.ts';
import { RUN_ID, trialBase, TRIALS, records } from './fixtures/trial/trial.ts';

const MANIFEST = (JSON.parse(readFileSync(new URL('../../../fixtures/manifest.json', import.meta.url), 'utf8')) as { world: { state_hash: string } }).world.state_hash;
const EARLIER = `f8387483${'0'.repeat(56)}`;

async function open(page: Page, query: string) {
  await browse(page, new URL(`./?view=runs&${query}`, await trialBase(test.info().project.use.baseURL!)).href);
  await expect(page.getByTestId('trial-detail')).toBeVisible();
}

// The record served as if it ran on another world: its initial and final hashes are not today's.
async function otherWorld(page: Page, path: string, initial: string | null = EARLIER) {
  await page.route(`**/data/results/${path}`, async (route) => {
    const res = await route.fetch();
    const r = (await res.json()) as { state_hash: Record<string, string | null> };
    await route.fulfill({ response: res, json: { ...r, state_hash: { ...r.state_hash, initial, final: 'b'.repeat(64), replay_final: 'b'.repeat(64) } } });
  });
}

test('the heading is the task title, "Trial i of n · model · effort high", and the path in small mono text', async ({ page }) => {
  const name = TRIALS.failAudited;
  const [task, index] = name.split('/') as [string, string];
  // i is the trial's place among the run's records of the task in index order; the path keeps the index.
  const ofTask = records.filter((r) => r.task_id === task).map((r) => r.index).sort((a, b) => a - b);
  const n = ofTask.length;
  const i = ofTask.indexOf(Number(index)) + 1;
  await open(page, `run=${RUN_ID}&trial=${encodeURIComponent(name)}`);
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1.getByTestId('trial-title')).toHaveText('DOAC renal and interaction dose review of the pharmacy list');
  await expect(h1.getByTestId('trial-sub')).toHaveText(`Trial ${i} of ${n} · claude-opus-5-5 · effort high`);
  await expect(page.getByTestId('trial-path')).toHaveText(name);
  await expect(page.getByTestId('trial-path')).toHaveCSS('font-family', /mono/i);
});

test('at 390 px no word of the heading breaks mid-word', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.failAudited)}`);
  const split = await page.getByRole('heading', { level: 1 }).evaluate((h) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (const m of text.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        if (new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1) out.push(m[0]);
      }
    }
    return out;
  });
  expect(split).toEqual([]);
});

// The UI cannot tell an earlier world from a different one, so it says "another" (verifier-phase-P17i-JU4JU11-1 m2).
test('a pilot on another world says so in a neutral tone and offers no Replay', async ({ page }) => {
  await otherWorld(page, 'pilot-pass/trials/renal-dose-review/0.json');
  await open(page, `run=pilot-pass&trial=${encodeURIComponent('renal-dose-review/0')}&tab=state-diff`);
  const p = page.getByTestId('panel-state-diff');
  const line = p.getByTestId('manifest-line');
  await expect(line).toHaveText(`This pilot ran on another world version (${EARLIER.slice(0, 4)}…). Today's world is ${MANIFEST.slice(0, 4)}….`);
  await expect(line).toHaveAttribute('data-tone', 'neutral');
  await expect(line).not.toHaveAttribute('role', 'alert');
  await expect(p.getByTestId('replay-block')).toHaveCount(0);
  await expect(p.getByRole('button', { name: 'Replay' })).toHaveCount(0);
  // The note's state passes axe, light and dark (verifier-phase-P17j-retro-JU4JU11-1 m-a).
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(line).toBeVisible();
    const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
    expect(bad, scheme).toEqual([]);
  }
});

test('a pilot with no initial hash says the world it ran on is not recorded', async ({ page }) => {
  await otherWorld(page, 'pilot-pass/trials/renal-dose-review/0.json', null);
  await open(page, `run=pilot-pass&trial=${encodeURIComponent('renal-dose-review/0')}&tab=state-diff`);
  const line = page.getByTestId('panel-state-diff').getByTestId('manifest-line');
  await expect(line).toHaveText(`This pilot's record has no initial state hash, so the world it ran on is not known. Today's world is ${MANIFEST.slice(0, 4)}….`);
  await expect(line).toHaveAttribute('data-tone', 'neutral');
});

test('an official trial on another world keeps the alert and its Replay', async ({ page }) => {
  await otherWorld(page, `runs/${RUN_ID}/trials/${TRIALS.failAudited}.json`);
  await open(page, `run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.failAudited)}&tab=state-diff`);
  const p = page.getByTestId('panel-state-diff');
  await expect(p.getByTestId('manifest-line')).toHaveAttribute('role', 'alert');
  await expect(p.getByTestId('manifest-line')).toHaveText(/^Initial state hash does not match the manifest/);
  await expect(p.getByRole('button', { name: 'Replay' })).toBeVisible();
});
