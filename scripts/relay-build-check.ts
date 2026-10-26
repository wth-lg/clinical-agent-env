// node scripts/relay-build-check.ts [--tsc] [--vercel-bin <path>] [--keep]
// Builds what `vercel deploy --cwd apps/relay` uploads and runs the built function (README Deploy
// step 4). It copies the upload list (UPLOAD_LIST, scripts/relay-upload-list.ts) into a temp
// directory outside the repo, so no node_modules, package.json or tsconfig.json of the repo is in
// reach and the builder sees what the remote build sees, then:
//   (default)  runs `vercel build --prod` there with a stub .vercel/project.json (no link, no
//              token, no network for settings), the CLI's own Node builder and its built-in
//              TypeScript, as on Vercel, and loads the handler its .vc-config.json names;
//   --tsc      emits with the repo's TypeScript and the uploaded tsconfig.json instead, the check
//              apps/relay/test/build.test.ts runs in CI, where no Vercel CLI is installed.
// It imports the built handler with Node's own loader and calls its fetch with globalThis.fetch
// stubbed, so nothing leaves the process: OPTIONS from the Pages origin 204, a foreign Origin
// 403, another model 400, and a valid POST 200 that reaches the stub at UPSTREAM_URL once. It
// also fails on any emitted relative import that still names a .ts file (builder-131: Vercel's
// builder kept '../src/limiter.ts' and every request got 500 FUNCTION_INVOCATION_FAILED).
// Exit 0 when the function loads and answers each probe; 1 when the build fails or a probe does;
// 2 when the build cannot run (no Vercel CLI on PATH or at --vercel-bin, or the upload list
// cannot be copied).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { clientHeaderNames, PAGES_ORIGIN } from '../cli/relay-check.ts';
import { ANTHROPIC_VERSION } from '../packages/core/anthropic.ts';
import { MODEL } from '../apps/relay/src/relay.ts';
import { UPSTREAM_URL } from '../apps/relay/src/upstream.ts';
import { UPLOAD_LIST } from './relay-upload-list.ts';

const RELAY = fileURLToPath(new URL('../apps/relay/', import.meta.url));
const ENTRY = 'api/messages.ts';
const RELAY_URL = 'https://relay.test/v1/messages';

// The build tool or its input is missing: the check did not run, which says nothing of the relay.
class CannotRun extends Error {}

export interface Built {
  funcDir: string;
  handler: string;
}

// The upload list, copied to a fresh directory under the OS temp root.
export function stage(dir: string): void {
  for (const f of UPLOAD_LIST) {
    if (!existsSync(join(RELAY, f))) throw new CannotRun(`apps/relay/${f} is in the upload list but does not exist`);
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(RELAY, f), join(dir, f));
  }
}

// `vercel build --prod` in dir. The stub project.json carries settings, so the CLI neither asks
// for a link nor pulls them; framework null is the relay's "Other" preset.
export function vercelBuild(dir: string, bin: string): Built {
  mkdirSync(join(dir, '.vercel'));
  writeFileSync(join(dir, '.vercel/project.json'), JSON.stringify({ projectId: 'prj_relay_build_check', orgId: 'team_relay_build_check', settings: { framework: null } }));
  try {
    execFileSync(bin, ['build', '--prod', '--yes'], { cwd: dir, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' } });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new CannotRun(`no Vercel CLI at ${bin}; install it or pass --vercel-bin`, { cause: e });
    throw new Error(`vercel build exited ${(e as { status: number | null }).status}`, { cause: e });
  }
  const funcDir = join(dir, '.vercel/output/functions/api/messages.func');
  const { handler } = JSON.parse(readFileSync(join(funcDir, '.vc-config.json'), 'utf8')) as { handler: string };
  return { funcDir, handler };
}

// The repo's TypeScript over the uploaded files with the uploaded tsconfig.json (its defaults when
// none is uploaded), emitted beside a copy of the uploaded package.json, as the builder lays out
// the function directory.
export function tscBuild(dir: string): Built {
  const out = join(dir, 'out');
  const config = join(dir, 'tsconfig.json');
  let options: ts.CompilerOptions = {};
  if (existsSync(config)) {
    const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } });
    if (!parsed) throw new Error(`cannot read ${config}`);
    options = parsed.options;
  }
  const program = ts.createProgram([join(dir, ENTRY)], { ...options, noEmit: false, outDir: out, rootDir: dir });
  const emitted = program.emit();
  if (emitted.emitSkipped) throw new Error('TypeScript emitted nothing');
  if (existsSync(join(dir, 'package.json'))) copyFileSync(join(dir, 'package.json'), join(out, 'package.json'));
  return { funcDir: out, handler: ENTRY.replace(/\.ts$/, '.js') };
}

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

// Relative import specifiers in the emitted JavaScript that still end in .ts.
export function tsSpecifiers(funcDir: string): string[] {
  const out: string[] = [];
  for (const f of walk(funcDir).filter((p) => /\.[cm]?js$/.test(p))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(?:from|import|require)\s*\(?\s*['"](\.{1,2}\/[^'"]+\.[cm]?ts)['"]/g)) out.push(`${relative(funcDir, f)}: ${m[1]}`);
  }
  return out;
}

export interface Probe {
  name: string;
  ok: boolean;
  detail: string;
}

// Loads the built handler and answers four requests with fetch stubbed.
export async function probe(built: Built): Promise<Probe[]> {
  const out: Probe[] = [];
  const bad = tsSpecifiers(built.funcDir);
  out.push({ name: 'no .ts import specifier in the build', ok: bad.length === 0, detail: bad.join('; ') });

  let fn: { fetch: (r: Request) => Promise<Response> };
  try {
    const mod = (await import(pathToFileURL(join(built.funcDir, built.handler)).href)) as { default?: { fetch?: unknown } };
    if (typeof mod.default?.fetch !== 'function') throw new Error('the default export has no fetch');
    fn = mod.default as typeof fn;
    out.push({ name: `loads ${built.handler}`, ok: true, detail: '' });
  } catch (e) {
    out.push({ name: `loads ${built.handler}`, ok: false, detail: `${(e as Error).name}: ${(e as Error).message}` });
    return out;
  }

  const clientHeaders = await clientHeaderNames();
  const upstream: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    upstream.push(input instanceof Request ? input.url : String(input));
    return new Response('event: message_stop\ndata: {"type":"message_stop"}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  try {
    const pre = await fn.fetch(new Request(RELAY_URL, { method: 'OPTIONS', headers: { origin: PAGES_ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': clientHeaders.join(',') } }));
    out.push({ name: 'OPTIONS from the Pages origin 204', ok: pre.status === 204 && pre.headers.get('access-control-allow-origin') === PAGES_ORIGIN, detail: `${pre.status} allow-origin ${pre.headers.get('access-control-allow-origin')}` });
    const post = (origin: string, model: string) =>
      fn.fetch(new Request(RELAY_URL, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', 'x-api-key': 'relay-build-check', 'anthropic-version': ANTHROPIC_VERSION },
        body: JSON.stringify({ model, max_tokens: 1, stream: true, messages: [{ role: 'user', content: 'ping' }] }),
      }));
    const foreign = await post('https://evil.example', MODEL);
    out.push({ name: 'foreign Origin 403', ok: foreign.status === 403, detail: String(foreign.status) });
    const other = await post(PAGES_ORIGIN, 'claude-sonnet-5-5');
    out.push({ name: 'other model 400', ok: other.status === 400, detail: String(other.status) });
    const ok = await post(PAGES_ORIGIN, MODEL);
    await ok.text();
    out.push({ name: 'valid POST 200 through the stub upstream', ok: ok.status === 200 && upstream.length === 1 && upstream[0] === UPSTREAM_URL, detail: `${ok.status}; upstream calls ${upstream.length}` });
  } finally {
    globalThis.fetch = realFetch;
  }
  return out;
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { tsc: { type: 'boolean' }, 'vercel-bin': { type: 'string' }, keep: { type: 'boolean' } } });
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'relay-build-')));
  try {
    let built: Built;
    try {
      stage(dir);
      built = values.tsc ? tscBuild(dir) : vercelBuild(dir, values['vercel-bin'] ?? 'vercel');
    } catch (e) {
      if (e instanceof CannotRun) {
        console.error(`relay-build-check: the build did not run: ${e.message}`);
        return 2;
      }
      console.error(`relay-build-check: the build failed: ${(e as Error).message}; do not deploy`);
      return 1;
    }
    const probes = await probe(built);
    console.log(`relay-build-check: ${values.tsc ? `TypeScript ${ts.version} emit` : 'vercel build --prod'} of the upload list (${UPLOAD_LIST.join(' ')})`);
    for (const p of probes) console.log(`  ${p.ok ? 'PASS' : 'FAIL'} ${p.name}${p.detail ? `: ${p.detail}` : ''}`);
    const ok = probes.length === 6 && probes.every((p) => p.ok);
    console.log(ok ? 'the built function loads and answers' : 'the built function does NOT work: do not deploy');
    return ok ? 0 : 1;
  } finally {
    if (values.keep) console.log(`kept ${dir}`);
    else rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
