// node scripts/relay-body-max.ts [--dir results/pilot-0]
// The relay's size and duration bounds against real trials (plan phase P16h): over every
// trajectory under <dir>/trajectories, rebuilds each Messages request (the history before it plus
// the trial's params) and prints B, the largest request body in bytes as reserveRequest in
// packages/core/anthropic.ts counts it, and the longest single Messages call (a request event to
// its response event, retries included). Exits 1 when B x 1.1 is not below the relay's body limit
// (MAX_BODY_BYTES in apps/relay/src/relay.ts) or the longest call is not below the maxDuration of
// apps/relay/vercel.json; 0 otherwise.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { MAX_BODY_BYTES } from '../apps/relay/src/relay.ts';
import { reserveRequest, type MessageParam, type MessageParams } from '../packages/core/anthropic.ts';
import type { RequestEvent, ResponseEvent } from '../packages/core/events.ts';

const REPO = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_DIR = join(REPO, 'results/pilot-0');
const VERCEL_JSON = join(REPO, 'apps/relay/vercel.json');

export interface Extreme {
  value: number;
  file: string;
  turn: number;
}

function trajectories(dir: string): string[] {
  return readdirSync(join(dir, 'trajectories'), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

type Event = (RequestEvent | ResponseEvent | { type: string; turn: number; ts: string }) & { ts: string };

// Each request of one trajectory with its body size and how long its call took.
function calls(file: string): Array<{ turn: number; bytes: number; ms: number | null }> {
  const events = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Event);
  const history: MessageParam[] = [];
  let params: MessageParams | undefined;
  const out: Array<{ turn: number; bytes: number; ms: number | null }> = [];
  let open: { turn: number; at: number } | null = null;
  for (const e of events) {
    if (e.type === 'request') {
      const r = e as RequestEvent;
      params ??= r.params;
      if (params === undefined) throw new Error(`${file}: the first request carries no params`);
      if (history.length !== r.messages_from) throw new Error(`${file} turn ${r.turn}: messages_from ${r.messages_from}, but the history has ${history.length}`);
      history.push(...r.messages);
      out.push({ turn: r.turn, bytes: reserveRequest(history, params).bodyBytes, ms: null });
      open = { turn: r.turn, at: Date.parse(r.ts) };
    } else if (e.type === 'response') {
      const r = e as ResponseEvent;
      if (open !== null && open.turn === r.turn) out[out.length - 1]!.ms = Date.parse(r.ts) - open.at;
      open = null;
      if (r.stop_reason !== 'refusal') history.push({ role: 'assistant', content: r.content });
    }
  }
  return out;
}

function extremes(dir: string): { body: Extreme; call: Extreme; requests: number; files: number } {
  const files = trajectories(dir);
  if (files.length === 0) throw new Error(`no trajectories under ${join(dir, 'trajectories')}`);
  let body: Extreme = { value: -1, file: '', turn: 0 };
  let call: Extreme = { value: -1, file: '', turn: 0 };
  let requests = 0;
  for (const f of files) {
    for (const c of calls(f)) {
      requests++;
      if (c.bytes > body.value) body = { value: c.bytes, file: relative(REPO, f), turn: c.turn };
      if (c.ms !== null && c.ms > call.value) call = { value: c.ms, file: relative(REPO, f), turn: c.turn };
    }
  }
  return { body, call, requests, files: files.length };
}

export function maxRequestBody(dir = DEFAULT_DIR): { bytes: number; file: string; turn: number } {
  const { body } = extremes(dir);
  return { bytes: body.value, file: body.file, turn: body.turn };
}

export function longestCallMs(dir = DEFAULT_DIR): { ms: number; file: string; turn: number } {
  const { call } = extremes(dir);
  return { ms: call.value, file: call.file, turn: call.turn };
}

export function maxDurationS(): number {
  const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as { functions: Record<string, { maxDuration: number }> };
  return cfg.functions['api/messages.ts']!.maxDuration;
}

function main(): number {
  const { values } = parseArgs({ options: { dir: { type: 'string', default: DEFAULT_DIR } } });
  const dir = values.dir as string;
  const { body, call, requests, files } = extremes(dir);
  const withMargin = Math.ceil(body.value * 1.1);
  const limitS = maxDurationS();
  const bodyOk = withMargin < MAX_BODY_BYTES;
  const callOk = call.value < limitS * 1000;
  console.log(`relay-body-max: ${requests} requests in ${files} trajectories under ${relative(REPO, dir) || dir}`);
  console.log(`B=${body.value} bytes (${body.file} turn ${body.turn}); B x 1.1 = ${withMargin} bytes; relay body limit ${MAX_BODY_BYTES} bytes: ${bodyOk ? 'below' : 'NOT below'}`);
  console.log(`longest Messages call ${call.value} ms (${call.file} turn ${call.turn}); vercel.json maxDuration ${limitS} s: ${callOk ? 'below' : 'NOT below'}`);
  return bodyOk && callOk ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
