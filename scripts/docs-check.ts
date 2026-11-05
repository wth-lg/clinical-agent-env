// node scripts/docs-check.ts [--root <dir>]
// The gate on the two documents the interviewer reads (plan phase P24; `pnpm docs:check`). Under
// the root (default the current directory) it checks docs/writeup.html and README.md:
//   - both equal a fresh regeneration by scripts/docs-gen.ts (every generated number, definition,
//     cap value and the HTML around the prose), so an edit by hand fails;
//   - scripts/ste-check.ts reports no finding on either file;
//   - every link resolves: a #anchor to an id in the page, a relative path to a file under the
//     root, an http(s) URL to a well-formed address (no network call is made);
//   - the writeup has the sections Instructions, Findings, Surprises, Changes, Next steps, How
//     failures are attributed, Pass rates, How the environment differs from a real EHR, Audit
//     against research and public environments and References; Instructions names the local start
//     command, the hosted URL and the CLI run command; Pass rates holds PASS_DEFINITION and
//     DENOMINATOR_RULE; every reference item carries a YYYY-MM-DD date;
//   - no percentage or k/N appears in the writeup's prose outside a generated block, a code
//     element, a table, a phrase of scripts/ste/numbers-allow.txt, or a region between
//     `<!-- docs-check:allow-numbers <why> -->` and `<!-- docs-check:end-allow-numbers -->`
//     (each region is printed as an info line, so a reviewer sees what was allowed);
//   - the writeup loads nothing from outside: no script, link, img, iframe, object or embed
//     element, no @import or url() in its style, and every theme token of apps/web with its value;
//   - README.md has the sections Quick start, Key handling, Run from the CLI and Links, and only
//     those; links docs/writeup.html and the hosted URL; holds no table and no number; its Quick
//     start holds LOCAL_START_COMMAND byte for byte, LOCAL_PREREQUISITES, both install URLs and a
//     Windows line that names PowerShell 7 and WSL; Key handling names both caps; Run from the CLI
//     names the model and --out;
//   - a TODO token: TODO-R16 is a warning; TODO-W5F is a warning until results/official.json
//     exists, then an error; any other TODO is an error. The sources (docs/writeup/*.md,
//     docs/findings.md) are scanned too.
// Each error prints <file>:<line>: <problem>; fix: <fix>; a warning starts with "warning:".
// Exit codes: 0 no error, 1 an error, 2 usage or read error (a root with no docs).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_PREREQUISITES, LOCAL_START_COMMAND, NODE_INSTALL_URL, PNPM_INSTALL_URL } from '../apps/web/src/surface/command.ts';
import { ACTUAL_CAP_USD, PROJECTED_CAP_USD } from '../packages/core/ledger.ts';
import { DENOMINATOR_RULE, PASS_DEFINITION } from '../packages/core/outcomes.ts';
import { decodeEntities, parseMarkdown, WRITEUP_SECTIONS } from './docs-lib.ts';
import { firstDifference, generate, HOSTED_URL, README, SOURCES, WRITEUP } from './docs-gen.ts';
import { checkFile, loadRules } from './ste-check.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const NUMBERS_ALLOW = join(HERE, 'ste/numbers-allow.txt');
const TOKENS = join(REPO, 'apps/web/src/styles/tokens.css');
export const README_SECTIONS = ['Quick start', 'Key handling', 'Run from the CLI', 'Links'];
const MODEL = 'claude-opus-5-5';
const DATE = /\b20\d\d-\d\d-\d\d\b/;
const PERCENT = /\d+(\.\d+)?\s?%/;
const K_OF_N = /\b\d+\s?\/\s?\d+\b/;
const K_OF_N_WORDS = /\b\d+ of \d+\b/;
// Unicode forms of a slash or a percent sign read as the ASCII ones (verifier P24A-227-2 F5).
const normalizeSigns = (s: string) => s.replace(/[\u2044\u2215\uFF0F]/g, '/').replace(/[\uFF05\u066A]/g, '%');
// Phrases the writeup and README may not make as claims (researcher-16, the do-not-claim list).
const CLAIM_PHRASES = ['MCP support', 'Harbor compatible', 'first clinical'];
// A dollar amount in any form: a dollar sign (or its entity) before a number, or a number before USD
// or dollars, or USD before a number (verifier P24A-227-2 F6).
const DOLLAR = /(?:\$|&#36;|&dollar;)\s?\.?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:USD|dollars?)\b|\bUSD\s?\.?\d[\d,]*(?:\.\d+)?/gi;

export interface Problem {
  file: string;
  line: number;
  problem: string;
  fix: string;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;
const stripTags = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// The text of each h2 section of the page: heading, id, body (to the next h2) and the line.
function sectionsOf(html: string): Array<{ title: string; id: string; body: string; line: number }> {
  const out: Array<{ title: string; id: string; body: string; line: number }> = [];
  const heads = [...html.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)];
  heads.forEach((m, i) => {
    const from = m.index + m[0].length;
    const to = i + 1 < heads.length ? heads[i + 1]!.index : html.length;
    out.push({ title: stripTags(m[2]!), id: m[1]!, body: html.slice(from, to), line: lineOf(html, m.index) });
  });
  return out;
}

// A list of sections of the writeup, with its headings as they are written in the sources.
function checkWriteup(root: string, html: string, problems: Problem[], infos: string[]): void {
  const file = WRITEUP;
  const add = (line: number, problem: string, fix: string) => problems.push({ file, line, problem, fix });
  const secs = sectionsOf(html);
  const section = (title: string) => secs.find((s) => s.title === title);
  const instr = section('Instructions');
  if (instr) {
    const text = decodeEntities(instr.body);
    if (!text.includes(LOCAL_START_COMMAND)) add(instr.line, 'Instructions does not hold LOCAL_START_COMMAND', `add the block <!-- docs-gen:block prerequisites --> or the command ${LOCAL_START_COMMAND}`);
    if (!text.includes(HOSTED_URL)) add(instr.line, 'Instructions does not name the hosted URL', `name ${HOSTED_URL}`);
    if (!/pnpm cli run\b/.test(text)) add(instr.line, 'Instructions does not give the CLI run command', 'add the block <!-- docs-gen:block cli-command -->');
  }
  const rates = section('Pass rates');
  if (rates) {
    const text = decodeEntities(rates.body);
    if (!text.includes(PASS_DEFINITION)) add(rates.line, 'Pass rates does not hold PASS_DEFINITION', 'add the block <!-- docs-gen:block pass-definition -->');
    if (!text.includes(DENOMINATOR_RULE)) add(rates.line, 'Pass rates does not hold DENOMINATOR_RULE', 'add the block <!-- docs-gen:block pass-definition -->');
  }
  const refs = section('References');
  if (refs) {
    const items = [...refs.body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)];
    if (items.length === 0) add(refs.line, 'References holds no list item', 'list each source as a bullet with its YYYY-MM-DD date');
    for (const it of items) {
      const src = /data-src="([^"]+):(\d+)"/.exec(it[0]);
      const where = src ? { file: decodeEntities(src[1]!), line: Number(src[2]) } : { file, line: lineOf(html, it.index) };
      if (!DATE.test(stripTags(it[1]!))) problems.push({ ...where, problem: 'reference without a YYYY-MM-DD date', fix: 'add the date of the version cited' });
    }
  }
  // Numbers outside generated blocks, code and allowed regions. A hand-written table is prose here
  // (verifier P24A-227 F3): its numbers come from a generated block or an allow-numbers region.
  const allow = readFileSync(NUMBERS_ALLOW, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  // Every replacement keeps the length and the newlines, so an index into prose is an index into html.
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  let prose = html.replace(/<!-- docs-gen:begin [a-z-]+ -->[\s\S]*?<!-- docs-gen:end [a-z-]+ -->/g, blank);
  for (const m of prose.matchAll(/<!-- docs-check:allow-numbers ([^>]*?) -->[\s\S]*?<!-- docs-check:end-allow-numbers -->/g)) infos.push(`info: ${file}:${lineOf(prose, m.index)}: numbers allowed: ${m[1]!.trim()}`);
  prose = prose.replace(/<!-- docs-check:allow-numbers [^>]*? -->[\s\S]*?<!-- docs-check:end-allow-numbers -->/g, blank);
  prose = normalizeSigns(prose.replace(/<(pre|code|style)\b[\s\S]*?<\/\1>/g, blank).replace(/<[^>]+>/g, blank).replace(/https?:\/\/\S+/g, blank));
  for (const a of allow) prose = prose.split(a).join(' '.repeat(a.length));
  for (const re of [PERCENT, K_OF_N, K_OF_N_WORDS]) {
    for (const m of prose.matchAll(new RegExp(re.source, 'g'))) {
      const line = lineOf(prose, m.index);
      const srcLine = sourceAt(html, m.index);
      const where = srcLine ?? { file, line };
      problems.push({ ...where, problem: `number in prose: "${m[0]}"`, fix: 'render it from a generated block, or allow it in scripts/ste/numbers-allow.txt or a docs-check:allow-numbers region' });
    }
  }
  // Claims the writeup may not make, in its prose (generated blocks, code and allowed regions included: a
  // claim is a claim wherever it stands).
  const text = decodeEntities(html.replace(/<(pre|code|style)\b[\s\S]*?<\/\1>/g, blank).replace(/<[^>]+>/g, blank));
  for (const phrase of CLAIM_PHRASES) {
    for (const m of text.matchAll(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))) {
      problems.push({ ...(sourceAt(html, m.index) ?? { file, line: lineOf(text, m.index) }), problem: `claim phrase: "${m[0]}"`, fix: 'the writeup makes no such claim (researcher-16); reword the sentence' });
    }
  }
  // Self-contained.
  for (const m of html.matchAll(/<(script|link|img|iframe|object|embed)\b/gi)) add(lineOf(html, m.index), `a ${m[1]!.toLowerCase()} element: the writeup loads nothing from outside`, 'remove it; the file is self-contained by design');
  for (const m of html.matchAll(/@import|url\(/g)) add(lineOf(html, m.index), `${m[0]} in the page: the writeup loads nothing from outside`, 'remove it');
  const tokens = readFileSync(TOKENS, 'utf8');
  for (const m of tokens.matchAll(/(--color-[a-z-]+): ([^;]+);/g)) if (!html.includes(`${m[1]}: ${m[2]}`)) add(1, `theme token ${m[1]} ${m[2]} is not in the page`, 'regenerate: docs-gen copies apps/web/src/styles/tokens.css');
  void root;
}

// The source file and line of the last element before index that carries a data-src.
function sourceAt(html: string, index: number): { file: string; line: number } | null {
  const m = [...html.slice(0, index).matchAll(/data-src="([^"]+):(\d+)"/g)].at(-1);
  return m === undefined ? null : { file: decodeEntities(m[1]!), line: Number(m[2]) };
}

function checkLinks(root: string, html: string, problems: Problem[]): void {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!));
  for (const m of html.matchAll(/href="([^"]*)"/g)) {
    const href = decodeEntities(m[1]!);
    const line = lineOf(html, m.index);
    const where = sourceAt(html, m.index) ?? { file: WRITEUP, line };
    if (href.startsWith('#')) {
      if (!ids.has(href.slice(1))) problems.push({ ...where, problem: `link to #${href.slice(1)}, which is not an id in the page`, fix: 'link to a heading that exists (its id is its slug)' });
    } else if (/^https?:\/\//.test(href)) {
      try {
        const u = new URL(href);
        if (u.hostname === '') throw new Error('no host');
      } catch {
        problems.push({ ...where, problem: `malformed URL ${href}`, fix: 'write a full https URL' });
      }
    } else if (/^[a-z]+:/.test(href)) {
      problems.push({ ...where, problem: `link scheme not allowed: ${href}`, fix: 'use https or a relative path' });
    } else {
      const path = resolve(root, dirname(WRITEUP), href.split('#')[0]!);
      if (!existsSync(path)) problems.push({ ...where, problem: `broken link ${href}`, fix: 'point it at a file in the repository' });
    }
  }
}

function checkReadme(root: string, text: string, problems: Problem[]): void {
  const file = README;
  const add = (line: number, problem: string, fix: string) => problems.push({ file, line, problem, fix });
  const blocks = parseMarkdown(text);
  const h2 = blocks.filter((b): b is Extract<typeof b, { kind: 'heading' }> => b.kind === 'heading' && b.level === 2);
  for (const want of README_SECTIONS) if (!h2.some((h) => h.text === want)) add(1, `no section "## ${want}"`, `add it; README.md holds only ${README_SECTIONS.join(', ')}`);
  for (const h of h2) if (!README_SECTIONS.includes(h.text)) add(h.line, `section "## ${h.text}" is not one of the README's`, `move it to the writeup; README.md holds only ${README_SECTIONS.join(', ')}`);
  const sectionText = (title: string) => {
    const i = blocks.findIndex((b) => b.kind === 'heading' && b.level === 2 && b.text === title);
    if (i < 0) return '';
    const rest = blocks.slice(i + 1);
    const next = rest.findIndex((b) => b.kind === 'heading' && b.level <= 2);
    return (next < 0 ? rest : rest.slice(0, next)).map((b) => (b.kind === 'code' ? b.text : b.kind === 'paragraph' || b.kind === 'heading' ? b.text : b.kind === 'list' ? b.items.map((it) => it.text).join('\n') : b.kind === 'html' ? b.text : '')).join('\n');
  };
  const quick = sectionText('Quick start');
  if (!quick.includes(LOCAL_START_COMMAND)) add(1, 'Quick start does not hold LOCAL_START_COMMAND byte for byte', `write \`${LOCAL_START_COMMAND}\` (apps/web/src/surface/command.ts)`);
  if (!quick.includes(LOCAL_PREREQUISITES)) add(1, 'Quick start does not hold LOCAL_PREREQUISITES', `write "${LOCAL_PREREQUISITES}"`);
  for (const url of [NODE_INSTALL_URL, PNPM_INSTALL_URL]) if (!quick.includes(url)) add(1, `Quick start does not link ${url}`, 'add the install link next to the command');
  if (!/PowerShell 7/.test(quick) || !/\bWSL\b/.test(quick)) add(1, 'Quick start has no Windows line that names PowerShell 7 and WSL', 'add one line: use PowerShell 7, Git Bash or WSL, because Windows PowerShell 5.1 does not run &&');
  const key = sectionText('Key handling');
  for (const cap of [PROJECTED_CAP_USD, ACTUAL_CAP_USD]) if (!key.includes(`$${cap.toLocaleString('en-US')}`)) add(1, `Key handling does not name the cap $${cap.toLocaleString('en-US')}`, 'keep the caps block <!-- docs-gen:begin caps --> and regenerate');
  const cli = sectionText('Run from the CLI');
  if (!cli.includes(`--model ${MODEL}`) || !cli.includes('--out')) add(1, `Run from the CLI does not give a command with --model ${MODEL} and --out`, 'write the one-line command cli/run.ts requires');
  if (!text.includes('docs/writeup.html')) add(1, 'README.md does not link docs/writeup.html', 'add the link under Links');
  if (!text.includes(HOSTED_URL)) add(1, 'README.md does not link the hosted URL', `add ${HOSTED_URL} under Links`);
  for (const b of blocks) if (b.kind === 'table') add(b.line, 'a table in README.md', 'move it to the writeup');
  const prose = blocks.flatMap((b) => (b.kind === 'paragraph' ? [{ text: b.text, line: b.line }] : b.kind === 'list' ? b.items : []));
  for (const { text: t, line } of prose) {
    const plain = normalizeSigns(t.replace(/`[^`]*`/g, ' ').replace(/https?:\/\/\S+/g, ' '));
    for (const re of [PERCENT, K_OF_N, K_OF_N_WORDS]) {
      const m = re.exec(plain);
      if (m) add(line, `number in README.md: "${m[0]}"`, 'README.md carries no findings or number tables; move it to the writeup');
    }
    for (const phrase of CLAIM_PHRASES) if (new RegExp(phrase, 'i').test(t)) add(line, `claim phrase: "${phrase}"`, 'README.md makes no such claim (researcher-16); reword the sentence');
  }
  const caps = /<!-- docs-gen:begin caps -->[\s\S]*?<!-- docs-gen:end caps -->/.exec(text);
  if (!caps) add(1, 'README.md has no caps block', 'add <!-- docs-gen:begin caps --> and <!-- docs-gen:end caps --> under Key handling');
  // A dollar figure outside the caps block could differ from the caps (verifier P24A-227 F4), in any
  // form and in code spans too (P24A-227-2 F6).
  const outside = text.replace(/<!-- docs-gen:begin caps -->[\s\S]*?<!-- docs-gen:end caps -->/g, (m) => m.replace(/[^\n]/g, ' '));
  for (const m of outside.matchAll(DOLLAR)) add(lineOf(outside, m.index), `dollar amount outside the caps block: "${m[0]}"`, 'the caps block renders both caps from packages/core/ledger.ts; state no other amount in README.md');
  void root;
}

function checkTodos(root: string, problems: Problem[], warnings: string[]): void {
  const official = existsSync(join(root, 'results/official.json'));
  const files = [WRITEUP, README, 'docs/findings.md', ...(existsSync(join(root, SOURCES)) ? readdirSync(join(root, SOURCES)).filter((f) => f.endsWith('.md')).map((f) => `${SOURCES}/${f}`) : [])];
  const WHY: Record<string, string> = {
    'TODO-R16': 'a researcher fills the comparison table',
    'TODO-W5F': 'waits for the W5 final results (an error once results/official.json exists)',
  };
  for (const rel of files) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    // One line per token per file: its count and its first line.
    const seen = new Map<string, { count: number; line: number }>();
    for (const m of text.matchAll(/\bTODO(?:-[A-Z0-9]+)?\b/g)) {
      const e = seen.get(m[0]);
      if (e) e.count++;
      else seen.set(m[0], { count: 1, line: lineOf(text, m.index) });
    }
    for (const [token, { count, line }] of seen) {
      const times = count === 1 ? '' : ` (${count} times, first at line ${line})`;
      if (token === 'TODO-R16' || (token === 'TODO-W5F' && !official)) warnings.push(`warning: ${rel}:${line}: ${token}${times}: ${WHY[token]}`);
      else if (token === 'TODO-W5F') problems.push({ file: rel, line, problem: `TODO-W5F with results/official.json present${times}`, fix: 'write the finding from the official run and remove the token' });
      else problems.push({ file: rel, line, problem: `${token} in the text${times}`, fix: 'finish the text; only TODO-W5F and TODO-R16 may stay, as warnings' });
    }
  }
}

export function run(root: string): { problems: Problem[]; warnings: string[]; infos: string[] } {
  const problems: Problem[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  let out: ReturnType<typeof generate>;
  try {
    out = generate(root);
  } catch (e) {
    // docs-gen names the source and line it refused ("<file>:<line>: <why>").
    const m = /^([^:\s]+):(\d+): (.*)$/s.exec((e as Error).message);
    problems.push(m ? { file: m[1]!, line: Number(m[2]), problem: m[3]!, fix: 'remove it from the source; docs-gen writes the markers' } : { file: SOURCES, line: 1, problem: (e as Error).message, fix: 'fix the sources under docs/writeup/' });
    return { problems, warnings, infos };
  }
  for (const m of out.missing) problems.push({ file: WRITEUP, line: 1, problem: `no section "${m}"`, fix: `add a level-1 heading "# ${m}" to a file under ${SOURCES}/; the sections are ${WRITEUP_SECTIONS.join(', ')} (WRITEUP_SECTIONS in scripts/docs-lib.ts)` });
  const current = (rel: string) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : '');
  const html = current(WRITEUP);
  const readme = current(README);
  const at = firstDifference(html, out.writeup);
  if (at !== null) problems.push({ file: WRITEUP, line: at, problem: 'differs from a fresh regeneration', fix: 'run node scripts/docs-gen.ts; edit the sources under docs/writeup/, never the HTML' });
  if (out.readme !== null) {
    const r = firstDifference(readme, out.readme);
    if (r !== null) problems.push({ file: README, line: r, problem: 'the caps block differs from a fresh regeneration', fix: 'run node scripts/docs-gen.ts; the caps come from packages/core/ledger.ts' });
  }
  const rules = loadRules();
  for (const rel of [README, WRITEUP]) {
    if (!existsSync(join(root, rel))) {
      problems.push({ file: rel, line: 1, problem: 'missing', fix: rel === WRITEUP ? 'run node scripts/docs-gen.ts' : 'write it' });
      continue;
    }
    for (const f of checkFile(join(root, rel), rules, rel)) problems.push({ file: f.file, line: f.line, problem: `${f.rule}: "${f.text}"`, fix: f.fix });
  }
  checkLinks(root, html, problems);
  checkWriteup(root, html, problems, infos);
  checkReadme(root, readme, problems);
  checkTodos(root, problems, warnings);
  return { problems, warnings, infos };
}

export function main(argv: string[]): number {
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--root') {
      const v = argv[++i];
      if (v === undefined) {
        process.stderr.write('docs-check: --root needs a directory\n');
        return 2;
      }
      root = resolve(v);
    } else {
      process.stderr.write(`docs-check: unknown argument ${a}\nusage: node scripts/docs-check.ts [--root <dir>]\n`);
      return 2;
    }
  }
  if (!existsSync(join(root, SOURCES))) {
    process.stderr.write(`docs-check: ${join(root, SOURCES)}: missing\n`);
    return 2;
  }
  let result: ReturnType<typeof run>;
  try {
    result = run(root);
  } catch (e) {
    process.stderr.write(`docs-check: ${(e as Error).message}\n`);
    return 2;
  }
  for (const i of result.infos) process.stdout.write(`${i}\n`);
  for (const w of result.warnings) process.stdout.write(`${w}\n`);
  for (const p of result.problems) process.stdout.write(`${p.file}:${p.line}: ${p.problem}; fix: ${p.fix}\n`);
  return result.problems.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
