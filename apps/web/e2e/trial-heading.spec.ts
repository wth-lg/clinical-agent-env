// Trial page wording (pre-audit M7, M8, P17j JU11): the heading is the task title, then "Trial i of n
// · <model> · effort high", with the trial path in small mono text, and no word of the heading breaks
// mid-word at 390 px. A pilot that ran on an earlier world says so in a neutral tone and offers no
// Replay; an official trial on another world keeps the alert.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { RUN_ID, trialBase, TRIALS, records } from './fixtures/trial/trial.ts';

const MANIFEST = (JSON.parse(readFileSync(new URL('../../../fixtures/manifest.json', import.meta.url), 'utf8')) as { world: { state_hash: string } }).world.state_hash;
const EARLIER = `f8387483${'0'.repeat(56)}`;

async function open(page: Page, query: string) {
  await page.goto(new URL(`./?view=runs&${query}`, await trialBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(page.getByTestId('trial-detail')).toBeVisible();
}

// The record served as if it ran on another world: its initial and final hashes are not today's.
async function otherWorld(page: Page, path: string) {
  await page.route(`**/data/results/${path}`, async (route) => {
    const res = await route.fetch();
    const r = (await res.json()) as { state_hash: Record<string, string | null> };
    await route.fulfill({ response: res, json: { ...r, state_hash: { ...r.state_hash, initial: EARLIER, final: 'b'.repeat(64), replay_final: 'b'.repeat(64) } } });
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
  await expect(h1.getByTestId('trial-title')).toHaveText('Renal and age dose review of Harold Vance under RBC-PHARM-07');
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

test('a pilot on an earlier world says so in a neutral tone and offers no Replay', async ({ page }) => {
  await otherWorld(page, 'pilot-pass/trials/renal-dose-review/0.json');
  await open(page, `run=pilot-pass&trial=${encodeURIComponent('renal-dose-review/0')}&tab=state-diff`);
  const p = page.getByTestId('panel-state-diff');
  const line = p.getByTestId('manifest-line');
  await expect(line).toHaveText(`This pilot ran on an earlier world version (${EARLIER.slice(0, 4)}…). Today's world is ${MANIFEST.slice(0, 4)}….`);
  await expect(line).toHaveAttribute('data-tone', 'neutral');
  await expect(line).not.toHaveAttribute('role', 'alert');
  await expect(p.getByTestId('replay-block')).toHaveCount(0);
  await expect(p.getByRole('button', { name: 'Replay' })).toHaveCount(0);
});

test('an official trial on another world keeps the alert and its Replay', async ({ page }) => {
  await otherWorld(page, `runs/${RUN_ID}/trials/${TRIALS.failAudited}.json`);
  await open(page, `run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.failAudited)}&tab=state-diff`);
  const p = page.getByTestId('panel-state-diff');
  await expect(p.getByTestId('manifest-line')).toHaveAttribute('role', 'alert');
  await expect(p.getByTestId('manifest-line')).toHaveText(/^Initial state hash does not match the manifest/);
  await expect(p.getByRole('button', { name: 'Replay' })).toBeVisible();
});
