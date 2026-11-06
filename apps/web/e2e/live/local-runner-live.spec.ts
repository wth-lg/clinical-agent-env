// The local runner from a clean clone, live (plan phase P25): the spec runs LOCAL_START_COMMAND
// exactly as apps/web/src/surface/command.ts exports it, in a fresh temp directory with HOME at
// another fresh temp directory, so the command clones origin/main from GitHub, installs, builds and
// starts `pnpm start` there. The runner's environment has ANTHROPIC_API_KEY and SPEND_LEDGER
// removed and keeps the own-run marker (CLINENV_CANONICAL_LEDGER), so the runner meters its own
// calls in the canonical ledger; CLINENV_RUNS_DIR points under the temp directory. The runner's
// stdout and stderr go to a capture file for `pnpm keyscan`. The spec reads the key from its own
// environment and types it into the key gate, the way a user does; the runner validates it
// through POST api/key, runs one renal-dose-review trial from the UI in Node, and reserves and
// settles every call itself through batchStart, so this spec makes no Messages call.
//   LIVE_DRY_RUN=1  starts the runner the same way, asks it for the trial's projection
//                   (POST api/trials?dry_run=1) and prints it with the Validate worst case as
//                   LIVE_PROJECTION_USD (X1 for `pnpm cli spend --check`), then stops: no key is
//                   sent and no call is made.
// Run only in the live-run form (the plan's header): the own-run marker set, the key loaded
// from the secrets file, never echoed. Trace, video and screenshots are off in the live project.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, type WriteStream } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { isApiHost, MODEL } from '../../../../packages/core/anthropic.ts';
import type { LedgerRow } from '../../../../packages/core/ledger.ts';
import { PROJECTED_CAP_USD } from '../../../../packages/core/ledger.ts';
import { REDACTED, redactText } from '../../../../packages/core/redact.ts';
import type { TrialRecord } from '../../../../packages/core/run.ts';
import { parseDryRun, parseHealth, parseTrialView, TOKEN_HEADER, TOKEN_META, validateWorstCaseUsd } from '../../../../packages/core/runner-api.ts';
import { LOCAL_START_COMMAND } from '../../src/surface/command.ts';
import { SURFACE_LABEL } from '../../src/surface/detect.ts';
import { RELAY_ORIGIN } from '../../src/surface/relay.ts';

const KEY = process.env.ANTHROPIC_API_KEY ?? '';
const DRY_RUN = process.env.LIVE_DRY_RUN === '1';
const TASK = 'renal-dose-review';
// The clone, install and build of a fresh checkout, then the runner's URL line.
const START_MS = 20 * 60_000;
// One live trial, as cli/runner-check.ts --live waits for it.
const TRIAL_MS = 35 * 60_000;
const STOP_MS = 30_000;

// Every live spec starts with this skip: without a key the live project lists the spec and
// reports it skipped instead of failing. A dry run needs no key.
test.skip(!KEY && !DRY_RUN, 'ANTHROPIC_API_KEY is not set');

const secrets = KEY === '' ? [] : [KEY];
const say = (line: string) => console.log(redactText(line, secrets));

// leaks: what the raw stdout or stderr held before redaction, by stream (the key, or the
// redaction marker, which the runner never prints on its own); never the text itself.
interface Runner { url: string; proc: ChildProcess; capture: string; exited: Promise<number | null>; log: WriteStream; leaks: string[] }

// The command's environment: the key and any SPEND_LEDGER removed, HOME at a fresh directory, the
// records under CLINENV_RUNS_DIR in the temp directory, the own-run marker kept as it is.
function commandEnv(home: string, runsDir: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ANTHROPIC_API_KEY' && k !== 'SPEND_LEDGER') env[k] = v;
  return { ...env, HOME: home, CLINENV_RUNS_DIR: runsDir };
}

// Runs LOCAL_START_COMMAND in `work` through sh, as a user would paste it, in its own process
// group so the runner (a grandchild of pnpm) gets the stop signal too. Resolves with the URL the
// runner prints; the capture file gets every line of stdout and stderr, the key redacted. The raw
// stream is checked first (verifier-phase-P25-1 N1): a key in the runner's output, or the
// redaction marker itself, is a leak the test fails on, since the written capture could not show it.
function startFromCommand(work: string, env: Record<string, string>, capture: string): Promise<Runner> {
  const log = createWriteStream(capture, { flags: 'a' });
  const proc = spawn('sh', ['-c', LOCAL_START_COMMAND], { cwd: work, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise<number | null>((resolve) => proc.on('exit', (code) => resolve(code)));
  let out = '';
  const leaks: string[] = [];
  // The tail of each raw stream, so a key split across two chunks is still seen.
  const carry: Record<string, string> = { stdout: '', stderr: '' };
  const write = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
    const raw = chunk.toString();
    const joined = carry[stream] + raw;
    if (KEY !== '' && joined.includes(KEY)) leaks.push(`${stream}: the key`);
    if (joined.includes(REDACTED)) leaks.push(`${stream}: the marker ${REDACTED}`);
    carry[stream] = joined.slice(-Math.max(KEY.length, REDACTED.length));
    const text = redactText(raw, secrets);
    out += text;
    log.write(text.split('\n').filter((l) => l !== '').map((l) => `${stream}| ${l}\n`).join(''));
  };
  proc.stdout!.on('data', (c: Buffer) => write('stdout', c));
  proc.stderr!.on('data', (c: Buffer) => write('stderr', c));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the runner printed no URL within ${START_MS / 60_000} min; capture ${capture}`)), START_MS);
    const look = () => {
      const m = /^clinenv local runner: (http:\/\/127\.0\.0\.1:\d+\/clinical-agent-env\/)$/m.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve({ url: m[1]!, proc, capture, exited, log, leaks });
      }
    };
    proc.stdout!.on('data', look);
    void exited.then((code) => {
      clearTimeout(timer);
      reject(new Error(`the command exited with ${code} before the runner printed its URL; capture ${capture}`));
    });
  });
}

// The parent pid of a process, or null once it is gone.
function parentOf(pid: number): number | null {
  const out = spawnSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
  return /^\d+$/.test(out) ? Number(out) : null;
}

// The pid listening on the runner's port, only when it descends from the command's shell (pnpm
// starts the runner in a process group of its own; a sibling runner on the port is never signalled).
function runnerPid(r: Runner): number | null {
  const port = new URL(r.url).port;
  const found = spawnSync('lsof', ['-t', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  const pids = found.stdout.split('\n').map((l) => Number(l.trim())).filter((n) => Number.isInteger(n) && n > 0);
  for (const pid of pids) {
    for (let at = parentOf(pid), hops = 0; at !== null && at > 1 && hops < 16; at = parentOf(at), hops++) if (at === r.proc.pid) return pid;
  }
  return null;
}

// SIGTERM to the runner process itself: it cancels its trials, closes its batches and exits 0;
// pnpm and the shell then exit with its code. A runner still up after STOP_MS gets SIGKILL with
// its whole group.
async function stopRunner(r: Runner | undefined): Promise<number | null | 'late'> {
  if (r === undefined) return null;
  const pid = runnerPid(r);
  try {
    if (pid !== null) process.kill(pid, 'SIGTERM');
    else process.kill(-r.proc.pid!, 'SIGTERM');
  } catch {
    // already gone
  }
  const late = new Promise<'late'>((resolve) => setTimeout(() => resolve('late'), STOP_MS).unref());
  const code = await Promise.race([r.exited, late]);
  if (code === 'late') {
    try {
      process.kill(-r.proc.pid!, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  await new Promise<void>((resolve) => r.log.end(resolve));
  return code;
}

interface Reply { status: number; text: string }

// The spec's own requests to the runner (node:http, so a POST carries the runner's own Origin,
// as the page's do): the page for its token meta, health, the dry run, the trial view.
function http(url: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<Reply> {
  const target = new URL(path, url);
  const headers: Record<string, string> = { host: target.host };
  if (opts.token !== undefined) headers[TOKEN_HEADER] = opts.token;
  const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  if (payload !== undefined) {
    headers.origin = target.origin;
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(Buffer.byteLength(payload));
  }
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: target.hostname, port: Number(target.port), method: payload === undefined ? 'GET' : 'POST', path: `${target.pathname}${target.search}`, headers, setHost: false }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

// The runner's token from its page, for the spec's own API reads (the browser uses the same meta).
async function runnerToken(url: string): Promise<string> {
  const page = await http(url, './');
  const m = new RegExp(`<meta name="${TOKEN_META}" content="([0-9a-f]{64})"`).exec(page.text);
  if (!m) throw new Error(`the runner page (${page.status}) has no token meta`);
  return m[1]!;
}

const api = async (url: string, token: string, path: string, body?: unknown): Promise<Reply> => http(url, path, { token, body });

const DRY = { tasks: [TASK], trials: 1, concurrency: 1, effort: 'high', session_cap_usd: PROJECTED_CAP_USD };

async function storageDump(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const dump = (s: Storage) => JSON.stringify(Object.fromEntries(Object.keys(s).map((k) => [k, s.getItem(k)])));
    const records: unknown[] = [];
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(info.name!);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      for (const store of db.objectStoreNames) {
        records.push(await new Promise<unknown[]>((res, rej) => {
          const r = db.transaction(store).objectStore(store).getAll();
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        }));
      }
      db.close();
    }
    return `${dump(localStorage)}\n${dump(sessionStorage)}\n${JSON.stringify(records)}`;
  });
}

// The ledger's rows by line; a last line an append has not finished is left out, as reads leave it.
function ledgerRows(path: string): LedgerRow[] {
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '');
  return lines.flatMap((l, i) => {
    try {
      return [JSON.parse(l) as LedgerRow];
    } catch (e) {
      if (i === lines.length - 1) return [];
      throw e;
    }
  });
}
const micro = (usd: number) => Math.round(usd * 1e6);

test.describe.configure({ mode: 'serial' });

test('from a clean clone, LOCAL_START_COMMAND starts the runner, the key validates through api/key and one renal-dose-review trial runs in Node, metered in the canonical ledger', async ({ page }) => {
  test.setTimeout(START_MS + TRIAL_MS + 5 * 60_000);
  const ledgerPath = process.env.CLINENV_CANONICAL_LEDGER;
  if (!DRY_RUN) expect(ledgerPath, 'the live-run form sets CLINENV_CANONICAL_LEDGER').toBeTruthy();

  const tmp = mkdtempSync(join(tmpdir(), 'clinenv-p25-local-'));
  const home = join(tmp, 'home');
  const work = join(tmp, 'work');
  const runsDir = join(tmp, 'runs');
  for (const d of [home, work]) mkdirSync(d);
  const capture = join(tmp, 'runner.log');
  say(`local-runner-live: temp ${tmp}; runner capture ${capture}; CLINENV_RUNS_DIR ${runsDir}`);
  say(`local-runner-live: running in ${work}: ${LOCAL_START_COMMAND}`);

  const before = DRY_RUN || ledgerPath === undefined ? 0 : ledgerRows(ledgerPath).length;
  let runner: Runner | undefined;
  try {
    runner = await startFromCommand(work, commandEnv(home, runsDir), capture);
    say(`local-runner-live: runner at ${runner.url}`);
    expect(existsSync(join(work, 'clinical-agent-env', 'apps', 'web', 'dist', 'index.html')), 'the clone built the UI').toBe(true);
    const token = await runnerToken(runner.url);

    // The health the UI reads: no key loaded, not mock, the own-run ledger.
    const health = parseHealth(JSON.parse((await api(runner.url, token, 'api/health')).text));
    expect(health).toMatchObject({ key_loaded: false, mock: false });
    say(`local-runner-live: health ledger ${health.ledger.mode} ${health.ledger.path}`);

    // The projection for Validate plus one trial, from the runner: X1.
    const dry = await api(runner.url, token, 'api/trials?dry_run=1', DRY);
    expect(dry.status, `POST api/trials?dry_run=1: ${dry.text.slice(0, 300)}`).toBe(200);
    const projection = parseDryRun(JSON.parse(dry.text)).projection.total_usd;
    const validate = validateWorstCaseUsd();
    say(`local-runner-live dry run: trial projection $${projection.toFixed(6)} + Validate worst case $${validate.toFixed(6)}, 0 calls`);
    say(`LIVE_PROJECTION_USD=${(projection + validate).toFixed(6)}`);
    expect(runner.leaks, 'the raw runner output before redaction').toEqual([]);
    if (DRY_RUN) return;
    expect(health.ledger.mode, 'the runner meters in the own-run ledger').toBe('own-run');

    // The browser: every request, each CSP violation, the api/key answer.
    const requests: string[] = [];
    const csp: string[] = [];
    const keyPosts: number[] = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('response', (r) => (r.request().method() === 'POST' && /\/api\/key$/.test(new URL(r.url()).pathname) ? keyPosts.push(r.status()) : undefined));
    page.on('console', (m) => (/Content Security Policy/i.test(m.text()) ? csp.push(m.text()) : undefined));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`Content Security Policy violation: ${e.violatedDirective}`)));

    await page.goto(new URL(`?view=live&task=${TASK}`, runner.url).href);
    await expect(page.getByTestId('surface-chip')).toHaveText(SURFACE_LABEL['local-runner'], { timeout: 30_000 });
    await page.getByLabel('Add an API key', { exact: true }).fill(KEY);
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByTestId('key-chip')).toBeVisible({ timeout: 60_000 });
    expect(keyPosts, 'Validate answered 200 through POST api/key').toEqual([200]);

    await page.getByRole('button', { name: 'Run ×1', exact: true }).click();
    const trial = page.getByTestId('live-trial');
    await expect(trial).toHaveAttribute('data-state', 'running', { timeout: 60_000 });
    const id = (await trial.getAttribute('data-trial'))!;
    say(`local-runner-live: trial ${id} running`);
    // The trajectory streams: the first turn and a tool row appear before the end.
    await expect(trial.getByTestId('meter-turn')).not.toHaveText('0', { timeout: 5 * 60_000 });
    await expect(trial.getByTestId('tool-row').first()).toBeVisible({ timeout: 5 * 60_000 });
    await expect(trial).not.toHaveAttribute('data-state', 'running', { timeout: TRIAL_MS });
    await expect(trial).toHaveAttribute('data-state', 'graded');

    // The grade, as the record the runner holds and the card show it.
    const view = parseTrialView(JSON.parse((await api(runner.url, token, `api/trials/${encodeURIComponent(id)}`)).text));
    expect(view.record).not.toBeNull();
    const r = view.record as unknown as TrialRecord;
    say(`local-runner-live: ${id} outcome ${r.outcome} status ${r.status} fault ${r.fault} score ${r.score} turns ${r.turns} cost $${r.cost_usd.toFixed(4)} judge $${r.judge_cost_usd.toFixed(4)} models ${JSON.stringify(r.models_returned)}`);
    expect(r.models_returned).toEqual([MODEL]);
    expect(r.state_hash.final).not.toBeNull();
    expect(r.state_hash.replay_final).toBe(r.state_hash.final);
    await expect(trial.getByTestId('final-hash')).toHaveText(r.state_hash.final!);
    await expect(trial.getByTestId('outcome')).toHaveText(r.outcome);
    await expect(page.locator(`[data-testid="live-row"][data-trial="${id}"]`)).toHaveAttribute('data-outcome', r.outcome);
    // The rubric breakdown: every check of the task graded, with its met flag, in the record the UI reads.
    expect(r.checks.length).toBeGreaterThan(0);
    for (const c of r.checks) expect(['true', 'false', 'null'], `check ${c.id} met`).toContain(String(c.met));
    say(`local-runner-live: checks ${r.checks.map((c) => `${c.id}=${String(c.met)}`).join(' ')}`);

    // The record on disk under the clone's CLINENV_RUNS_DIR: <run id>/trials/<task>/<index>.json.
    const [runId, taskId, index] = [id.slice(0, id.indexOf(`.${TASK}.`)), TASK, id.slice(id.lastIndexOf('.') + 1)];
    const file = join(runsDir, runId, 'trials', taskId, `${index}.json`);
    expect(existsSync(file), `record ${file}`).toBe(true);
    const stored = JSON.parse(readFileSync(file, 'utf8')) as TrialRecord & { trial_id: string; settled: boolean; run_id: string };
    expect(stored).toMatchObject({ trial_id: `run:${runId}:${TASK}/${index}`, run_id: runId, settled: true, models_returned: [MODEL] });
    expect(stored.state_hash.final).toBe(r.state_hash.final);
    say(`local-runner-live: record ${file} (${stored.trial_id})`);

    // The browser reached only the runner: no request to the API host or the relay, no CSP violation.
    expect(requests.filter((u) => isApiHost(new URL(u).hostname) || new URL(u).origin === RELAY_ORIGIN)).toEqual([]);
    expect(requests.some((u) => u.includes(`/api/trials/${encodeURIComponent(id)}/events`))).toBe(true);
    expect(csp).toEqual([]);
    expect(await storageDump(page)).not.toContain(KEY);
    expect(readFileSync(capture, 'utf8')).not.toContain(KEY);

    // Stop the runner first: its batches close on the way out. Then the raw output of its whole
    // life, the shutdown lines included, held neither the key nor the redaction marker.
    const stopped = runner;
    const code = await stopRunner(runner);
    runner = undefined;
    say(`local-runner-live: runner exit ${code} after SIGTERM`);
    expect(code).toBe(0);
    expect(stopped.leaks, 'the raw runner output before redaction').toEqual([]);
    expect(readFileSync(capture, 'utf8')).not.toContain(REDACTED);

    // The canonical ledger's new node rows from this runner session: the Validate batch
    // (<session>-key) and the trial batch (<run id>), each opened and closed, every reservation
    // settled, the trial's settles matching its Messages and judge calls one for one.
    const session = runId.replace(/-\d+$/, '');
    const rows = ledgerRows(ledgerPath!).slice(before);
    const mine = rows.filter((x) => x.source === 'node' && x.run_id !== null && x.run_id.startsWith(session));
    const batches = new Set(mine.filter((x) => x.kind === 'open').map((x) => x.batch_id!));
    const ofBatches = rows.filter((x) => x.batch_id !== null && batches.has(x.batch_id));
    const keyRows = ofBatches.filter((x) => mine.some((m) => m.kind === 'open' && m.batch_id === x.batch_id && m.run_id === `${session}-key`));
    const trialRows = ofBatches.filter((x) => mine.some((m) => m.kind === 'open' && m.batch_id === x.batch_id && m.run_id === runId));
    const kinds = (xs: LedgerRow[]) => xs.reduce<Record<string, number>>((n, x) => ({ ...n, [x.kind]: (n[x.kind] ?? 0) + 1 }), {});
    say(`local-runner-live: ledger ${ledgerPath}: ${rows.length} new rows, session ${session}: Validate ${JSON.stringify(kinds(keyRows))}, trial ${JSON.stringify(kinds(trialRows))}`);
    expect(batches.size, 'two batches: Validate and the trial').toBe(2);
    expect(kinds(keyRows)).toEqual({ open: 1, reserve: 1, settle: 1, close: 1 });
    expect(keyRows.find((x) => x.kind === 'settle')!.trial).toBe('runner:validate');
    const calls = r.turns + r.api_retries + r.judge.calls;
    const settles = trialRows.filter((x) => x.kind === 'settle');
    expect(kinds(trialRows)).toEqual({ open: 1, reserve: calls, settle: calls, close: 1 });
    expect(new Set(settles.map((x) => x.trial))).toEqual(new Set([stored.trial_id]));
    const unsettled = ofBatches.filter((x) => x.kind === 'reserve' && !ofBatches.some((s) => s.kind === 'settle' && s.call_id === x.call_id));
    expect(unsettled, 'unsettled reservations').toEqual([]);
    const settled = settles.reduce((sum, x) => sum + micro(x.cost_usd), 0);
    expect(settled).toBe(micro(r.cost_usd) + micro(r.judge_cost_usd));
    say(`local-runner-live: ${calls} calls (${r.turns} turns + ${r.api_retries} retries + ${r.judge.calls} judge) settled $${(settled / 1e6).toFixed(6)} = record cost + judge cost; 0 unsettled`);
    say(`local-runner-live: keyscan paths: ${capture} ${runsDir}`);
  } finally {
    if (runner !== undefined) say(`local-runner-live: runner exit ${String(await stopRunner(runner))} after SIGTERM (cleanup)`);
  }
});
