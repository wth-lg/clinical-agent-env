// node scripts/ste-check.ts [--denylist <file>] [--verbs <file>] [files...]
// The ASD-STE 100 rules the writeup and README hold to (plan phase P24), on the prose of each
// file: a .md file's headings, paragraphs and list items, or an .html file's headings, p and li
// elements (docs-lib.ts htmlUnits). Code spans and code elements count as one word; fenced code,
// pre, tables and the blocks docs-gen writes are not prose. The default files are README.md and
// docs/writeup.html under the current directory.
//   - a step (an item of a numbered list) starts with a verb in the imperative (scripts/ste/verbs.txt),
//     after an optional condition that ends in a comma ("If the key is rejected, paste it again"),
//     and its instruction holds at most 20 words;
//   - a step holds one instruction: a second sentence in the imperative is a finding;
//   - every other sentence holds at most 25 words;
//   - no entry of scripts/ste/denylist.txt (word: replacement) appears, as whole words, in any case.
// Each finding prints <file>:<line>: <rule>: "<text>": <fix>, where file and line are the
// data-src of an HTML element when it has one. Exit codes: 0 clean, 1 findings, 2 usage or read error.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlUnits, markdownUnits, sentences, wordCount, type Unit } from './docs-lib.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FILES = ['README.md', 'docs/writeup.html'];
export const DENYLIST = join(HERE, 'ste/denylist.txt');
export const VERBS = join(HERE, 'ste/verbs.txt');
export const STEP_WORDS = 20;
export const SENTENCE_WORDS = 25;
// A condition before an instruction, up to its comma.
const CONDITION = /^(if|to|when|before|after|on|for|then|otherwise|else|in|under|with|without|unless|while|once)\b[^,]*,\s*/i;

export interface Finding {
  file: string;
  line: number;
  rule: string;
  text: string;
  fix: string;
}

export interface Rules {
  denylist: ReadonlyArray<{ word: string; replacement: string }>;
  verbs: ReadonlySet<string>;
}

export function readDenylist(path: string): Rules['denylist'] {
  return readFileSync(path, 'utf8').split('\n').flatMap((l) => {
    const line = l.trim();
    if (line === '' || line.startsWith('#')) return [];
    const at = line.indexOf(':');
    if (at < 1) throw new Error(`${path}: expected "word: replacement", got ${JSON.stringify(line)}`);
    return [{ word: line.slice(0, at).trim(), replacement: line.slice(at + 1).trim() }];
  });
}

export const readVerbs = (path: string): Set<string> => new Set(readFileSync(path, 'utf8').split('\n').map((l) => l.trim().toLowerCase()).filter((l) => l !== '' && !l.startsWith('#')));

const head = (s: string) => (s.length <= 60 ? s : `${s.slice(0, 57)}...`);
const firstWord = (s: string) => (s.replace(CONDITION, '').match(/^[A-Za-z][A-Za-z'-]*/)?.[0] ?? '').toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function checkUnits(units: readonly Unit[], rules: Rules): Finding[] {
  const out: Finding[] = [];
  const add = (u: Unit, rule: string, text: string, fix: string) => out.push({ file: u.file, line: u.line, rule, text: head(text), fix });
  for (const u of units) {
    const parts = sentences(u.text);
    parts.forEach((s, i) => {
      const n = wordCount(s);
      const imperative = rules.verbs.has(firstWord(s));
      if (u.kind === 'step' && i === 0) {
        if (!imperative) add(u, 'step in the imperative', s, 'start the step with a verb from scripts/ste/verbs.txt, after any condition that ends in a comma');
        if (n > STEP_WORDS) add(u, 'step length', s, `${n} words, at most ${STEP_WORDS}: split the step`);
      } else {
        if (u.kind === 'step' && imperative) add(u, 'one instruction per step', s, 'move the second instruction to its own step');
        if (n > SENTENCE_WORDS) add(u, 'sentence length', s, `${n} words, at most ${SENTENCE_WORDS}: split the sentence`);
      }
    });
    for (const { word, replacement } of rules.denylist) {
      if (new RegExp(`(^|[^A-Za-z-])${escapeRe(word)}(?![A-Za-z-])`, 'i').test(u.text)) add(u, 'denylisted word', u.text, `"${word}": use "${replacement}"`);
    }
  }
  return out;
}

export function checkFile(path: string, rules: Rules, shownAs = path): Finding[] {
  const text = readFileSync(path, 'utf8');
  const units = path.endsWith('.html') || path.endsWith('.htm') ? htmlUnits(text, shownAs) : markdownUnits(text, shownAs);
  return checkUnits(units, rules);
}

export const formatFinding = (f: Finding) => `${f.file}:${f.line}: ${f.rule}: "${f.text}": ${f.fix}`;

export function loadRules(denylist = DENYLIST, verbs = VERBS): Rules {
  return { denylist: readDenylist(denylist), verbs: readVerbs(verbs) };
}

export function main(argv: string[], cwd = process.cwd()): number {
  let denylist = DENYLIST;
  let verbs = VERBS;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--denylist' || a === '--verbs') {
      const v = argv[++i];
      if (v === undefined) {
        process.stderr.write(`ste-check: ${a} needs a file\n`);
        return 2;
      }
      if (a === '--denylist') denylist = resolve(cwd, v);
      else verbs = resolve(cwd, v);
    } else if (a.startsWith('--')) {
      process.stderr.write(`ste-check: unknown option ${a}\nusage: node scripts/ste-check.ts [--denylist <file>] [--verbs <file>] [files...]\n`);
      return 2;
    } else files.push(a);
  }
  const targets = files.length > 0 ? files : DEFAULT_FILES;
  let rules: Rules;
  try {
    rules = loadRules(denylist, verbs);
  } catch (e) {
    process.stderr.write(`ste-check: ${(e as Error).message}\n`);
    return 2;
  }
  const findings: Finding[] = [];
  for (const f of targets) {
    const path = resolve(cwd, f);
    if (!existsSync(path)) {
      process.stderr.write(`ste-check: cannot read ${f}\n`);
      return 2;
    }
    findings.push(...checkFile(path, rules, f));
  }
  for (const f of findings) process.stdout.write(`${formatFinding(f)}\n`);
  return findings.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
