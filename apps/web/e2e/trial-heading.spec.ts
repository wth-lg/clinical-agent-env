// Trial page wording (pre-audit M7, M8, P17j JU11): the heading is the task title, then "Trial i of n
// · <model> · effort high", with the trial path in small mono text, and no word of the heading breaks
// mid-word at 390 px. A pilot that ran on another world version says so in a neutral tone and offers no
// Replay, and that note passes axe in light and dark; an official trial on another world keeps the alert.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { browse, browse as browseDefault } from './browse.ts';
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

// The header states the trial's world on every trial (P25c fix, builder-326, trace row N13).
test('the header names the world the trial started from: today\'s manifest, or not recorded', async ({ page }) => {
  await open(page, `run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.failAudited)}`);
  const world = page.getByTestId('trial-world');
  await expect(world).toHaveText(`World ${MANIFEST.slice(0, 12)}…: matches the manifest.`);
  await expect(world).toHaveAttribute('data-hash', MANIFEST);
  await expect(world).toHaveAttribute('data-world', 'manifest');
  await otherWorld(page, 'pilot-pass/trials/renal-dose-review/0.json', null);
  await open(page, `run=pilot-pass&trial=${encodeURIComponent('renal-dose-review/0')}`);
  await expect(page.getByTestId('trial-world')).toHaveText('World not recorded.');
  await expect(page.getByTestId('trial-world')).toHaveAttribute('data-world', 'none');
});

// Gate P25CFIX-242 F2: the committed results in the default build. pilot-4a contrast-ct-prep/0 and
// the superseded crc-care-gap v1 trials start from ba0b0206…, contrast-ct-prep's frozen world and
// crc-care-gap's superseded one; the line names the match, never "nor a frozen world".
test('a pilot trial and a superseded version\'s trial on a frozen world of their task say which one they match', async ({ page }) => {
  const frozen = (JSON.parse(readFileSync(new URL('../../../results/tasks-final.json', import.meta.url), 'utf8')) as { tasks: Record<string, { world_hash: string; superseded?: { world_hash: string; version: string } }> }).tasks;
  const pilot = JSON.parse(readFileSync(new URL('../../../results/pilot-4a/trials/contrast-ct-prep/0.json', import.meta.url), 'utf8')) as { state_hash: { initial: string } };
  expect(pilot.state_hash.initial).toBe(frozen['contrast-ct-prep']!.world_hash);
  await browseDefault(page, './?view=runs&run=pilot-4a&trial=contrast-ct-prep%2F0');
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', 'contrast-ct-prep/0');
  await expect(page.getByTestId('trial-world')).toHaveText(`World ${pilot.state_hash.initial.slice(0, 12)}…: matches the frozen world of contrast-ct-prep.`);
  await expect(page.getByTestId('trial-world')).toHaveAttribute('data-world', 'frozen');
  const sup = JSON.parse(readFileSync(new URL('../../../results/runs/final-1/superseded/crc-care-gap-v1/trials/crc-care-gap/0.json', import.meta.url), 'utf8')) as { state_hash: { initial: string } };
  expect(sup.state_hash.initial).toBe(frozen['crc-care-gap']!.superseded!.world_hash);
  await browseDefault(page, './?view=runs&run=crc-care-gap-v1&trial=crc-care-gap%2F0');
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', 'crc-care-gap/0');
  await expect(page.getByTestId('trial-world')).toHaveText(`World ${sup.state_hash.initial.slice(0, 12)}…: matches the frozen world of crc-care-gap v1 (superseded).`);
  await expect(page.getByTestId('trial-world')).toHaveAttribute('data-world', 'frozen');
});

// Gate P25CFIX-242 F3: an official trial on today's manifest whose task is frozen on another world.
test('an official trial on the manifest whose task is frozen on another world says it misses the frozen world', async ({ page }) => {
  const task = TRIALS.failAudited.split('/')[0]!;
  const env = (records.find((r) => `${r.task_id}/${r.index}` === TRIALS.failAudited) as { env_version?: string } | undefined)?.env_version ?? null;
  await page.route('**/data/index.json', async (route) => {
    const res = await route.fetch();
    const { files, ...rest } = (await res.json()) as { files: string[] };
    await route.fulfill({ response: res, json: { ...rest, files: [...files.filter((f) => f !== 'results/tasks-final.json'), 'results/tasks-final.json'] } });
  });
  await page.route('**/data/results/tasks-final.json', (route) => route.fulfill({ json: { schema_version: 1, tasks: { [task]: { ...(env === null ? {} : { env_version: env }), world_hash: EARLIER, frozen_at: { tag: 'freeze-test' } } } } }));
  await open(page, `run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.failAudited)}`);
  await expect(page.getByTestId('trial-world')).toHaveText(`World ${MANIFEST.slice(0, 12)}…: matches the manifest, not the frozen world of ${task} (${EARLIER.slice(0, 12)}…).`);
  await expect(page.getByTestId('trial-world')).toHaveAttribute('data-world', 'manifest');
});

test('a pilot with no initial hash says the world it ran on is not recorded', async ({ page }) => {
  await otherWorld(page, 'pilot-pass/trials/renal-dose-review/0.json', null);
  await open(page, `run=pilot-pass&trial=${encodeURIComponent('renal-dose-review/0')}&tab=state-diff`);
  const line = page.getByTestId('panel-state-diff').getByTestId('manifest-line');
  await expect(line).toHaveText(`This pilot's record has no initial state hash, so the world it ran on is not known. Today's world is ${MANIFEST.slice(0, 4)}….`);
  await expect(line).toHaveAttribute('data-tone', 'neutral');
});

// Pre-audit-2 S15, R37: an official trial of a frozen task that started from that task's frozen
// world (results/tasks-final.json) is historical data, said in a neutral tone with the tag and
// commit that reproduce it, with no Replay here.
test('an official trial on its task\'s frozen world says so, names the replay tag and commit, and offers no Replay', async ({ page }) => {
  const task = TRIALS.failAudited.split('/')[0]!;
  const commit = 'e8ef8c4d9bedce9e93d1a6d2031785c295e5caae';
  await page.route('**/data/index.json', async (route) => {
    const res = await route.fetch();
    const { files, ...rest } = (await res.json()) as { files: string[] };
    await route.fulfill({ response: res, json: { ...rest, files: [...files.filter((f) => f !== 'results/tasks-final.json'), 'results/tasks-final.json'] } });
  });
  await page.route('**/data/results/tasks-final.json', (route) => route.fulfill({ json: { schema_version: 1, tasks: { [task]: { world_hash: EARLIER, frozen_at: { tag: 'freeze-test' }, replay_at: { tag: 'final-1-test', commit } } } } }));
  await otherWorld(page, `runs/${RUN_ID}/trials/${TRIALS.failAudited}.json`);
  await open(page, `run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.failAudited)}&tab=state-diff`);
  const p = page.getByTestId('panel-state-diff');
  const line = p.getByTestId('manifest-line');
  // P25c fix (builder-326, trace row N13): the line states the trial's world hash and that it
  // matches the task's frozen world, as the trial header does.
  await expect(line).toHaveText(`Initial state hash ${EARLIER.slice(0, 12)}… matches the frozen world of ${task} (results/tasks-final.json), not today's manifest (${MANIFEST.slice(0, 12)}…). Its records are historical and are reproduced at tag final-1-test (${commit.slice(0, 12)}), not here.`);
  await expect(line).toHaveAttribute('data-tone', 'frozen');
  const world = page.getByTestId('trial-world');
  await expect(world).toHaveText(`World ${EARLIER.slice(0, 12)}…: matches the frozen world of ${task}.`);
  await expect(world).toHaveAttribute('data-hash', EARLIER);
  await expect(world).toHaveAttribute('data-world', 'frozen');
  await expect(line).not.toHaveAttribute('role', 'alert');
  await expect(p.getByTestId('replay-block')).toHaveCount(0);
  await expect(p.getByRole('button', { name: 'Replay' })).toHaveCount(0);
  // The Runs list says the run was graded on the frozen world, not an older one.
  await page.getByRole('link', { name: 'Back to Runs' }).click();
  await expect(page.locator(`[data-testid="run"][data-run="${RUN_ID}"] [data-testid="grading-line"]`)).toContainText('on the frozen world of its task (1 trial, results/tasks-final.json)');
});

test('an official trial on another world keeps the alert and its Replay', async ({ page }) => {
  await otherWorld(page, `runs/${RUN_ID}/trials/${TRIALS.failAudited}.json`);
  await open(page, `run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.failAudited)}&tab=state-diff`);
  const p = page.getByTestId('panel-state-diff');
  await expect(page.getByTestId('trial-world')).toHaveText(`World ${EARLIER.slice(0, 12)}…: matches neither today's manifest nor a frozen world of ${TRIALS.failAudited.split('/')[0]}.`);
  await expect(page.getByTestId('trial-world')).toHaveAttribute('data-world', 'other');
  await expect(p.getByTestId('manifest-line')).toHaveAttribute('role', 'alert');
  await expect(p.getByTestId('manifest-line')).toHaveText(/^Initial state hash does not match the manifest/);
  await expect(p.getByRole('button', { name: 'Replay' })).toBeVisible();
});
