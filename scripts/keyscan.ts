// Scans for Anthropic API keys and prints file:line for each hit, never the match itself.
//
//   pnpm keyscan [paths...]              tracked and untracked (not ignored) files, build output, paths
//   pnpm keyscan --history [paths...]    every commit on every ref (`git log -p --all`), plus paths
//   pnpm keyscan --range A..B [paths...] the commits in A..B (a bare revision means all its history)
//
// A hit is an sk-ant-shaped string or, when ANTHROPIC_API_KEY is set, its exact value.
// Every file is scanned byte for byte, binary or not; a .gz file is also scanned decompressed
// (labelled file.gz(gunzip):line), and a base64 "data" field, the way FHIR attachments carry a
// note, is also scanned decoded (labelled file:line(base64)). A symlink in a build directory that
// resolves outside it is a finding too: the Pages upload dereferences symlinks.
// History is read from `git log -p` as a stream, line by line, so its size is not bounded by the
// longest string V8 can hold.
// Exit codes: 0 clean, 1 hit, 2 usage, git or scan error ("keyscan error: ..."). Any failure exits
// nonzero, so a caller that refuses on nonzero fails closed.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { gunzipSync } from 'node:zlib';

const KEY_SHAPE = /sk-ant-[A-Za-z0-9_-]{20,}/;
// Build and test output that .gitignore hides from `git ls-files` but that can still ship or be uploaded.
const BUILD_DIRS = ['apps/web/dist', 'apps/web/test-results', 'apps/web/playwright-report'];
const SKIP_DIRS = new Set(['node_modules', '.git']);
const MIN_ENV_KEY_LENGTH = 8;
// A JSON "data" string of base64, e.g. Attachment.data in an NDJSON resource.
const BASE64_DATA = /"data"\s*:\s*"([A-Za-z0-9+/]+={0,2})"/g;

function fail(message: string): never {
  process.stderr.write(`keyscan error: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const opts = { history: false, range: undefined as string | undefined, paths: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--history') opts.history = true;
    else if (arg === '--range') {
      const value = argv[++i];
      if (!value) fail('--range needs a revision range, e.g. origin/main..HEAD');
      opts.range = value;
    } else if (arg.startsWith('--range=')) opts.range = arg.slice('--range='.length);
    else if (arg === '--') {
      opts.paths.push(...argv.slice(i + 1));
      break;
    } else if (arg.startsWith('-')) fail(`unknown option ${arg}`);
    else opts.paths.push(arg);
  }
  if (opts.history && opts.range) fail('use --history or --range, not both');
  return opts;
}

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.error) fail(`git ${args[0]} failed: ${r.error.message}`);
  if (r.status !== 0) fail(`git ${args[0]} failed: ${firstLine(r.stderr)}`);
  return r.stdout;
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}

// Calls onLine for each '\n'-separated line of a byte stream, decoded as UTF-8. The result matches
// splitting the whole decoded output on '\n' (a newline byte is never inside a UTF-8 sequence), but
// only one line is ever held. A line split across chunks is gathered in parts and joined once.
async function forEachLine(stream: Readable, onLine: (line: string) => void): Promise<void> {
  const decoder = new StringDecoder('utf8');
  let parts: string[] = [];
  const feed = (text: string) => {
    let start = 0;
    for (let nl = text.indexOf('\n'); nl !== -1; nl = text.indexOf('\n', start)) {
      const piece = text.slice(start, nl);
      if (parts.length) {
        parts.push(piece);
        onLine(parts.join(''));
        parts = [];
      } else onLine(piece);
      start = nl + 1;
    }
    if (start < text.length) parts.push(text.slice(start));
  };
  for await (const chunk of stream) feed(decoder.write(chunk as Buffer));
  feed(decoder.end());
  if (parts.length) onLine(parts.join(''));
}

// Runs git and streams its stdout to onLine. Fails (exit 2) if git cannot start, exits nonzero or
// dies on a signal, even after some output was read.
async function gitLines(args: string[], cwd: string, onLine: (line: string) => void): Promise<void> {
  const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (s: string) => {
    if (stderr.length < 4096) stderr += s;
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => done({ code, signal }));
  });
  // Awaited below; this handler only keeps a spawn error from becoming an unhandled rejection
  // (exit 1) when the stream fails first.
  exited.catch(() => undefined);
  try {
    await forEachLine(child.stdout, onLine);
  } catch (err) {
    child.kill();
    throw err;
  }
  const { code, signal } = await exited;
  if (code !== 0) fail(`git ${args[0]} ${signal ? `killed by ${signal}` : 'failed'}: ${firstLine(stderr)}`);
}

function makeMatcher(): (line: string) => boolean {
  const envKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (envKey && envKey.length < MIN_ENV_KEY_LENGTH) {
    process.stderr.write(`keyscan: ANTHROPIC_API_KEY is shorter than ${MIN_ENV_KEY_LENGTH} characters; not matching its value\n`);
  }
  const exact = envKey && envKey.length >= MIN_ENV_KEY_LENGTH ? envKey : undefined;
  const test = (text: string) => KEY_SHAPE.test(text) || (exact !== undefined && text.includes(exact));
  // Dropping NUL bytes turns UTF-16 text back into the ASCII a key is made of.
  return (line) => test(line) || (line.includes('\0') && test(line.replaceAll('\0', '')));
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile() || entry.isSymbolicLink()) out.push(path);
  }
}

function scanText(text: string, label: string, matches: (line: string) => boolean, hits: string[]): void {
  text.split('\n').forEach((line, i) => {
    if (matches(line)) hits.push(`${label}:${i + 1}`);
    for (const m of line.matchAll(BASE64_DATA)) {
      if (matches(Buffer.from(m[1]!, 'base64').toString('latin1'))) hits.push(`${label}:${i + 1}(base64)`);
    }
  });
}

// A key is ASCII, so latin1 (one char per byte) finds it in any file, text or binary.
function scanFile(root: string, path: string, label: string, matches: (line: string) => boolean, hits: string[]): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) {
    const buildDir = BUILD_DIRS.map((d) => join(root, d)).find((d) => path === d || path.startsWith(d + sep));
    if (buildDir && !resolvesInside(path, buildDir)) {
      hits.push(`${label}: symlink that resolves outside ${relative(root, buildDir)}`);
    }
    // Git stores a symlink as its target path, so that text is what a commit would publish.
    scanText(readlinkSync(path, 'latin1'), label, matches, hits);
    return;
  }
  if (!stat?.isFile()) return;
  const bytes = readFileSync(path);
  scanText(bytes.toString('latin1'), label, matches, hits);
  if (path.endsWith('.gz')) {
    let text: string;
    try {
      text = gunzipSync(bytes).toString('latin1');
    } catch {
      hits.push(`${label}: .gz file that does not decompress, so its content cannot be scanned`);
      return;
    }
    scanText(text, `${label}(gunzip)`, matches, hits);
  }
}

function resolvesInside(link: string, dir: string): boolean {
  try {
    return realpathSync(link).startsWith(realpathSync(dir) + sep);
  } catch {
    return false; // dangling link
  }
}

function scanPaths(root: string, paths: string[], matches: (line: string) => boolean, hits: string[]): number {
  const files = new Map<string, string>(); // absolute path -> label
  for (const p of paths) {
    const abs = resolve(p);
    if (!existsSync(abs)) fail(`no such path: ${p}`);
    const found: string[] = [];
    if (lstatSync(abs).isDirectory()) walk(abs, found);
    else found.push(abs);
    for (const f of found) {
      const rel = relative(root, f);
      files.set(f, rel.startsWith('..') || isAbsolute(rel) ? f : rel);
    }
  }
  for (const [abs, label] of files) scanFile(root, abs, label, matches, hits);
  return files.size;
}

function workingTreePaths(root: string): string[] {
  const listed = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], root)
    .split('\0')
    .filter(Boolean)
    .map((rel) => join(root, rel))
    .filter((abs) => existsSync(abs));
  const build = BUILD_DIRS.map((d) => join(root, d)).filter((d) => existsSync(d));
  return [...listed, ...build];
}

// Reads `git log -p` and checks every commit message line and every added line.
// Removed lines need no check: each was an added line in some earlier commit.
// --text and --no-textconv print the real bytes of binary and `-diff` paths; first-parent
// merge diffs show what a merge resolution added. The markers carry a per-run nonce so no
// commit message or file content can forge or end them.
async function scanHistory(root: string, revs: string[], matches: (line: string) => boolean, hits: string[]): Promise<number> {
  const nonce = randomBytes(16).toString('hex');
  const COMMIT_START = `keyscan-commit-${nonce} `;
  const MESSAGE_END = `keyscan-message-end-${nonce}`;
  let commit = '';
  let commits = 0;
  let inMessage = false;
  let messageLine = 0;
  let file = '';
  let inHunk = false;
  let newLine = 0;
  const onLine = (line: string): void => {
    if (!inMessage && line.startsWith(COMMIT_START)) {
      commit = line.slice(COMMIT_START.length, COMMIT_START.length + 12);
      commits++;
      inMessage = true;
      messageLine = 0;
      inHunk = false;
      return;
    }
    if (inMessage) {
      const end = line.indexOf(MESSAGE_END);
      const text = end === -1 ? line : line.slice(0, end);
      messageLine++;
      if (matches(text)) hits.push(`${commit}:(commit message):${messageLine}`);
      if (end !== -1) inMessage = false;
      return;
    }
    if (line.startsWith('diff --git ')) {
      inHunk = false;
      file = '';
    } else if (!inHunk && line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? '' : line.slice(4).replace(/^b\//, '');
    } else if (line.startsWith('@@ ')) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
      newLine = m ? Number(m[1]) : 0;
      inHunk = true;
    } else if (inHunk && line.startsWith('+')) {
      if (matches(line.slice(1))) hits.push(`${commit}:${file}:${newLine}`);
      newLine++;
    } else if (inHunk && line.startsWith(' ')) {
      newLine++;
    }
  };
  await gitLines(
    [
      'log',
      '-p',
      '--text',
      '--no-textconv',
      '--no-ext-diff',
      '--diff-merges=first-parent',
      '--no-color',
      '--no-renames',
      `--format=${COMMIT_START}%H%n%B${MESSAGE_END}`,
      ...revs,
      '--',
    ],
    root,
    onLine,
  );
  return commits;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
  const matches = makeMatcher();
  const hits: string[] = [];
  let scanned: string;
  if (opts.history || opts.range) {
    const commits = await scanHistory(root, opts.history ? ['--all'] : [opts.range!], matches, hits);
    const files = opts.paths.length ? scanPaths(root, opts.paths, matches, hits) : 0;
    scanned = `${commits} commit(s)${files ? ` and ${files} file(s)` : ''}`;
  } else {
    const files = scanPaths(root, [...workingTreePaths(root), ...opts.paths], matches, hits);
    scanned = `${files} file(s)`;
  }
  for (const hit of hits) process.stdout.write(`${hit}\n`);
  if (hits.length) {
    process.stderr.write(`keyscan: ${hits.length} finding(s) in ${scanned}; locations above, values not printed\n`);
    process.exit(1);
  }
  process.stderr.write(`keyscan: clean, ${scanned} scanned\n`);
}

// An unexpected exception would otherwise exit 1, the code for a found key.
main().catch((err: unknown) => {
  fail(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
});
