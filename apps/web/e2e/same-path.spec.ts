// One mocked scenario on the three paths a trial can take (plan phase P15 hypothesis): the toy
// task's trial through `pnpm cli run-one --mock toy`, through the local runner's SSE stream (`node
// apps/runner/main.ts --mock`, which answers from the same toy script) and through the Chromium
// Worker of the browser-direct build (the Messages API route-mocked with that script). Each gives
// the same event JSONL once timestamps are stripped (packages/core/trajectory.ts stripTimestamps:
// ts, and the graded record's started, ended and trial_id) and the same final hash. The CLI and
// the runner run with CLINENV_CANONICAL_LEDGER and ANTHROPIC_API_KEY removed and HOME,
// SPEND_LEDGER and CLINENV_RUNS_DIR under a fresh temp dir.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { parseEvent, type TrialEvent } from '../../../packages/core/events.ts';
import { parseSse, SSE_END, TOKEN_HEADER, TOKEN_META } from '../../../packages/core/runner-api.ts';
import { parseTrajectory, stripTimestamps, toJsonl } from '../../../packages/core/trajectory.ts';
import { okResponse, SCENARIOS } from '../src/harness/scenarios.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const MODEL = 'claude-opus-5-5';
// The API origin the page may connect to, read from the CSP, as shell.spec.ts does (lint: no-direct-anthropic).
const CSP = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const API_ORIGIN = /connect-src 'self' (\S+);/.exec(CSP)?.[1] ?? '';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' };

function cleanEnv(tmp: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(CLINENV_|CHARTR_|ANTHROPIC_API_KEY$|SPEND_LEDGER$)/.test(k)) env[k] = v;
  return { ...env, HOME: tmp, SPEND_LEDGER: join(tmp, 'spend.jsonl'), CLINENV_RUNS_DIR: join(tmp, 'runs') };
}

const finalHash = (events: readonly TrialEvent[]) => {
  const e = events.find((x) => x.type === 'state_hash' && x.at === 'final');
  return e?.type === 'state_hash' ? e.hash : null;
};

function cliTrial(): TrialEvent[] {
  const tmp = mkdtempSync(join(tmpdir(), 'clinenv-same-path-cli-'));
  const out = join(tmp, 'out');
  const r = spawnSync('pnpm', ['cli', 'run-one', '--task', '_toy', '--model', MODEL, '--mock', 'toy', '--out', out], { cwd: REPO, env: cleanEnv(tmp), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`run-one exited ${r.status}: ${r.stdout}${r.stderr}`);
  return parseTrajectory(readFileSync(join(out, 'trajectories/_toy', MODEL, 'high/mock-toy/0.jsonl'), 'utf8'));
}

async function runnerTrial(): Promise<TrialEvent[]> {
  const tmp = mkdtempSync(join(tmpdir(), 'clinenv-same-path-runner-'));
  const proc = spawn('node', ['apps/runner/main.ts', '--mock', '--port', '0'], { cwd: REPO, env: cleanEnv(tmp), stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let out = '';
      proc.stdout!.on('data', (c: Buffer) => {
        out += c.toString();
        const m = /clinenv local runner: (http\S+)/.exec(out);
        if (m) resolve(m[1]!);
      });
      proc.on('exit', (code) => reject(new Error(`runner exited ${code}: ${out}`)));
    });
    const html = await (await fetch(url)).text();
    const token = new RegExp(`<meta name="${TOKEN_META}" content="([^"]+)"`).exec(html)?.[1];
    if (!token) throw new Error('the runner page has no token meta: build the UI first (pnpm build)');
    const headers = { [TOKEN_HEADER]: token, 'content-type': 'application/json' };
    const res = await fetch(new URL('api/trials', url), { method: 'POST', headers, body: JSON.stringify({ tasks: ['_toy'], trials: 1, concurrency: 1, effort: 'high', session_cap_usd: 20 }) });
    expect(res.status).toBe(202);
    const { trial_ids } = (await res.json()) as { trial_ids: string[] };
    const stream = await fetch(new URL(`api/trials/${encodeURIComponent(trial_ids[0]!)}/events`, url), { headers });
    const { frames } = parseSse(await stream.text());
    return frames.filter((f) => f.event !== SSE_END).map((f) => parseEvent(JSON.parse(f.data)));
  } finally {
    proc.kill('SIGTERM');
  }
}

async function workerTrial(page: Page): Promise<TrialEvent[]> {
  let judge = 0;
  await page.route((url) => url.origin === API_ORIGIN, async (route) => {
    const r = route.request();
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = r.postDataJSON() as { max_tokens: number; tools?: unknown[]; messages: Array<{ role: string }> };
    const turn = body.messages.filter((m) => m.role === 'assistant').length + 1;
    const res = body.max_tokens === 16 ? okResponse({ text: 'ok' }, 1) : body.tools === undefined ? okResponse(SCENARIOS.toy[3 + judge]!, 4 + judge++) : okResponse(SCENARIOS.toy[turn - 1]!, turn);
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: await res.text(), headers: CORS });
  });
  await page.goto('./?view=live&task=_toy');
  await page.getByLabel('API key', { exact: true }).fill(['sk', 'ant', 'api03', 'samepath', 'e2e'].join('-'));
  await page.getByRole('button', { name: 'Validate' }).click();
  await page.getByRole('button', { name: 'Run ×1', exact: true }).click();
  const trial = page.getByTestId('live-trial');
  await expect(trial).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  const id = (await trial.getAttribute('data-trial'))!;
  return page.evaluate(async (trialId) => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('clinenv-live');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const rows = await new Promise<Array<{ event: unknown }>>((res, rej) => {
      const r = db.transaction('events').objectStore('events').getAll(IDBKeyRange.bound([trialId, 0], [trialId, Number.MAX_SAFE_INTEGER]));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return rows.map((x) => x.event) as TrialEvent[];
  }, id);
}

test('the toy trial gives the same event JSONL and final hash from run-one --mock, the runner SSE stream and the Chromium Worker', async ({ page }) => {
  test.setTimeout(180_000);
  const cli = cliTrial();
  const runner = await runnerTrial();
  const worker = await workerTrial(page);
  for (const e of worker) parseEvent(e);
  const [a, b, c] = [cli, runner, worker].map((events) => stripTimestamps(toJsonl(events)));
  console.log(`cli ${cli.length} events, runner ${runner.length}, worker ${worker.length}; final ${finalHash(cli)}`);
  expect(cli.at(-1)?.type).toBe('graded');
  expect(b).toBe(a);
  expect(c).toBe(a);
  expect(finalHash(runner)).toBe(finalHash(cli));
  expect(finalHash(worker)).toBe(finalHash(cli));
});
