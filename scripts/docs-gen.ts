// node scripts/docs-gen.ts [--check] [--root <dir>]
// Builds docs/writeup.html (plan phase P24): one self-contained HTML file, styled with the theme
// tokens of apps/web (apps/web/src/styles/tokens.css) and its font stack, with no script, stylesheet,
// font or image from outside. Its prose is docs/writeup/*.md in file-name order; a line
// `<!-- docs-gen:include <path> -->` splices another markdown file (docs/findings.md, the Findings
// route's source), and a line `<!-- docs-gen:block <id> -->` renders a generated block from the
// data, wrapped in `<!-- docs-gen:begin <name> -->` and `<!-- docs-gen:end <name> -->`. A block
// rendered from packages/core/outcomes.ts or summary.ts is wrapped as `outcomes`, the name
// scripts/test/one-definition.test.ts allows a definition copy under. README.md keeps its prose
// and gets its caps block (between the same markers, name `caps`) filled from packages/core/ledger.ts.
// The data: the final run named by results/official.json, else results/runs/final-1, through its
// summary.json, classes.json and trial records; the pilot runs docs/writeup/s5.json names (the
// record-integrity lever's procedure as run, P24 part 2); docs/requirements/trace.json; the
// constants of packages/core. With no run committed, a run block says so instead of a table; a
// pilot the checkout lacks is named as not committed.
// --check writes nothing: it regenerates both files, prints each file that differs with the first
// differing line, and exits 1. Exit codes: 0 ok, 1 a difference under --check, 2 usage or read error.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_PREREQUISITES, LOCAL_START_COMMAND, NODE_INSTALL_URL, PNPM_INSTALL_URL } from '../apps/web/src/surface/command.ts';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../packages/core/cost.ts';
import { ACTUAL_CAP_USD, PROJECTED_CAP_USD } from '../packages/core/ledger.ts';
import {
  AUDIT_LABEL, CONFIRMATION_CRITERIA, CONFIRMATION_DEFINITIONS, DENOMINATOR_OPERATOR_NOTE, DENOMINATOR_RULE, FAULT_DEFINITIONS, FAULT_PRECEDENCE, FAULT_PRECEDENCE_RULE, isValid, PASS_DEFINITION, RUN_BLOCKS,
} from '../packages/core/outcomes.ts';
import { disclosedVerdictText, parseDisclosures, type Disclosure } from '../packages/core/disclosure.ts';
import { BAND_VERDICT_RULE, currentGrade, isHarmItem, PASS_K, trialName, wilson, type Summary, type SummaryCheck, type TaskSummary } from '../packages/core/summary.ts';
import { escapeHtml, nowrapNumbers, parseMarkdown, renderBlocks, WRITEUP_SECTIONS, type Block } from './docs-lib.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const WRITEUP = 'docs/writeup.html';
export const SOURCES = 'docs/writeup';
export const README = 'README.md';
export const HOSTED_URL = 'https://wth-lg.github.io/clinical-agent-env/';
export const TITLE = 'Riverbend clinical agent environment';
const TOKENS = join(REPO, 'apps/web/src/styles/tokens.css');
const DEFAULT_RUN = 'results/runs/final-1';
const MODEL = 'claude-opus-5-5';

const begin = (name: string) => `<!-- docs-gen:begin ${name} -->`;
const end = (name: string) => `<!-- docs-gen:end ${name} -->`;
const wrap = (name: string, body: string) => `${begin(name)}\n${body}\n${end(name)}`;
const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const two = (x: number | null) => (x === null ? 'n/a' : x > 0 && x < 0.005 ? '&lt;0.01' : x.toFixed(2));
const interval = (k: number, n: number) => {
  const w = wilson(k, n);
  return w === null ? 'n/a' : `[${w.lo.toFixed(2)}, ${w.hi.toFixed(2)}]`;
};
// Every table sits in a scroll container, so a wide one scrolls inside its box and the page never
// scrolls sideways on a phone (verifier P24A-227 F1).
const table = (head: string[], rows: string[][], caption?: string) =>
  `<div class="table-wrap">\n<table>${caption ? `<caption>${caption}</caption>` : ''}\n<thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>\n<tbody>\n${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${nowrapNumbers(c)}</th>` : `<td>${nowrapNumbers(c)}</td>`)).join('')}</tr>`).join('\n')}\n</tbody>\n</table>\n</div>`;
const trialUrl = (run: string, trial: string) => `${HOSTED_URL}?view=runs&run=${encodeURIComponent(run)}&trial=${encodeURIComponent(trial)}`;

// A trial at its current grade (packages/core/summary.ts currentGrade: the last regrade's outcome
// and checks, else the recorded ones).
type RunTrial = { task_id: string; index: number; outcome: string; checks: ReadonlyArray<SummaryCheck> | null };

// A lever item's row of `pnpm cli classes --json` (cli/classes.ts, lever per F7): the item, whether
// it was active in the run, how often it was caught, its label split and the base-item passes.
interface LeverItemRow { id: string; kind: string; item: string; spec: string | null; active: boolean; observed: number; passed: number; split: Record<string, number>; sibling_exposed: number }
interface Classes { tasks: Record<string, { lever?: { base_pass: number; items: LeverItemRow[] } | null }> }

// A committed run: its summary, its classes.json when it has one, and every trial record.
interface Run { id: string; dir: string; summary: Summary; trials: RunTrial[]; classes: Classes | null }

// docs/writeup/s5.json: the record-integrity lever's procedure (plan-amendment-w5 stop rule S5)
// as pre-registered and as run, one entry per task it covered. The priors, predictions, rulings
// and dates are typed from the decision log; the observed counts are read from the pilot runs it
// names and from the final run, never from this file.
interface S5Pilot { run: string; set: string }
interface S5Task {
  id: string;
  label: string;
  preregistered: { at: string; b: number; c_a: number; c_b: number | null; pred_both: number | null; pred_a: number; pred_b: number | null; rule_set: string };
  first_pilot: S5Pilot;
  selection: { ruling: string; at: string; set: string; pred: number | null; note: string };
  confirm: S5Pilot | null;
  retune: { ruling: string; at: string; change: string; pred: number | null; note: string } | null;
  retune_pilot: S5Pilot | null;
  frozen: string;
}
interface S5 { pilots: string[]; t2_item_b: { task: string; item: string }; tasks: S5Task[] }
export const S5_FILE = 'docs/writeup/s5.json';

// What the blocks render from.
export interface Data {
  root: string;
  run: Run | null;
  // The pilot runs s5.json names, by directory name under results/; null when not committed.
  pilots: Record<string, Run | null>;
  s5: S5 | null;
  // results/tasks-final.json: the regrade tags per task (and per superseded version), for the
  // pass-rate table's recorded count (gate FINAL-238 F1), and each task's disclosure (the
  // accept-and-disclose decision, packages/core/disclosure.ts), which marks its verdict cell.
  freeze: Record<string, { regrades?: Array<{ at: string }>; superseded?: { regrades?: Array<{ at: string }> } }>;
  disclosures: Record<string, Disclosure>;
  tasks: string[];
  trace: { pdf_block_sha256: string; done_when_clauses: number; done_phases: string[]; rows: TraceRow[] } | null;
}

interface TraceRow {
  id: string;
  kind: string;
  phase: string;
  ui_required: boolean;
  evidence: string[];
  done_when?: number[];
  pending?: string[];
  status?: string;
}

// A run directory: null when it has no summary.json.
function readRunDir(dir: string): Run | null {
  const file = join(dir, 'summary.json');
  if (!existsSync(file)) return null;
  const summary = JSON.parse(readFileSync(file, 'utf8')) as Summary;
  const trials: RunTrial[] = [];
  const trialsDir = join(dir, 'trials');
  if (existsSync(trialsDir)) {
    for (const task of readdirSync(trialsDir).filter((d) => statSync(join(trialsDir, d)).isDirectory()).sort()) {
      for (const f of readdirSync(join(trialsDir, task)).filter((f) => f.endsWith('.json')).sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)))) {
        const r = JSON.parse(readFileSync(join(trialsDir, task, f), 'utf8')) as { task_id: string; index?: number; outcome: string; checks?: SummaryCheck[] | null; regrades?: Array<{ outcome: string; checks?: SummaryCheck[] | null }> };
        const g = currentGrade(r as Parameters<typeof currentGrade>[0]);
        trials.push({ task_id: r.task_id, index: r.index ?? Number(f.slice(0, -5)), outcome: g.outcome, checks: g.checks });
      }
    }
  }
  const classesFile = join(dir, 'classes.json');
  const classes = existsSync(classesFile) ? (JSON.parse(readFileSync(classesFile, 'utf8')) as Classes) : null;
  return { id: summary.run_id, dir, summary, trials, classes };
}

function readRun(root: string): Run | null {
  const official = join(root, 'results/official.json');
  let dir = join(root, DEFAULT_RUN);
  if (existsSync(official)) {
    const { run } = JSON.parse(readFileSync(official, 'utf8')) as { run?: unknown };
    if (typeof run !== 'string') throw new Error('results/official.json: expected {"run": "runs/<id>"}');
    dir = join(root, 'results', run);
  }
  return readRunDir(dir);
}

export function readData(root: string): Data {
  const tasksDir = join(root, 'tasks');
  const tasks = existsSync(tasksDir) ? readdirSync(tasksDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')).map((e) => e.name).sort() : [];
  const traceFile = join(root, 'docs/requirements/trace.json');
  const trace = existsSync(traceFile) ? (JSON.parse(readFileSync(traceFile, 'utf8')) as Data['trace']) : null;
  const s5File = join(root, S5_FILE);
  const s5 = existsSync(s5File) ? (JSON.parse(readFileSync(s5File, 'utf8')) as S5) : null;
  const pilots: Record<string, Run | null> = {};
  for (const id of s5?.pilots ?? []) pilots[id] = readRunDir(join(root, 'results', id));
  const freezeFile = join(root, 'results/tasks-final.json');
  const freezeDoc = existsSync(freezeFile) ? (JSON.parse(readFileSync(freezeFile, 'utf8')) as { tasks?: Data['freeze'] }) : { tasks: {} };
  const freeze = freezeDoc.tasks ?? {};
  const disclosures = parseDisclosures(freezeDoc);
  return { root, run: readRun(root), pilots, s5, freeze, disclosures, tasks, trace };
}

// --- the generated blocks ------------------------------------------------------------------

const NO_RUN = '<p>No final run is committed yet, so this block is empty.</p>';
const runNote = (d: Data) => {
  const run = d.run!;
  const s = run.summary;
  return `<p>Run <code>${escapeHtml(run.id)}</code>: model ${escapeHtml(s.model ?? 'not recorded')}, effort ${escapeHtml(s.effort ?? 'not recorded')}, ${s.totals.trials} valid trials in ${Object.keys(s.tasks).length} tasks, ${usd(s.totals.cost_usd)} settled. Rendered from <code>${escapeHtml(run.dir.slice(d.root.length + 1))}/summary.json</code>.</p>`;
};

const passRates = (d: Data) => {
  if (d.run === null) return NO_RUN;
  const s = d.run.summary;
  // k/n at the current grade; where a regrade moved it, the count as recorded beside it with the
  // regrade's tag (results/tasks-final.json), so the page states both (gate FINAL-238 F1).
  const counted = (t: TaskSummary, regrades: Array<{ at: string }> | undefined) => {
    // recorded_outcomes present and without PASS: no pass was recorded (delta gate FINAL-238-2 n1).
    const recorded = t.recorded_outcomes === undefined || t.recorded_outcomes === null ? t.passes : (t.recorded_outcomes['PASS'] ?? 0);
    if (recorded === t.passes) return `${t.passes}/${t.trials}`;
    return `${t.passes}/${t.trials} (${recorded}/${t.trials} as recorded; ${escapeHtml(regrades?.at(-1)?.at ?? 'regraded')})`;
  };
  // The verdict, with the disclosure that accepted an out-of-band one: "Above band (disclosed:
  // user decision 2026-11-06)", the mark `summary --require band-or-disclosed` requires.
  const verdict = (id: string, t: TaskSummary) => {
    const x = d.disclosures[id];
    return t.band_verdict === null ? 'no verdict' : x === undefined ? t.band_verdict : disclosedVerdictText(t.band_verdict, x);
  };
  const rows = Object.entries(s.tasks).map(([id, t]) => [
    escapeHtml(id), counted(t, d.freeze[id]?.regrades), t.pass_rate === null ? 'n/a' : pct(t.pass_rate), interval(t.passes, t.trials), escapeHtml(verdict(id, t)),
    `${t.pass_no_harm}/${t.trials}`, String(t.refusals), t.refusal_excluded_rate === null ? 'n/a' : pct(t.refusal_excluded_rate), String(t.env_error_raw), String(t.env_limit), `${t.grader_error} (${t.grader_error_history})`,
  ]);
  // A task's superseded version (R42: an earlier version's trials, moved out of the count when the
  // task's current version entered the run) is shown beside it and never counted.
  const superseded = Object.values(s.superseded ?? {});
  for (const v of superseded) {
    const t = v.summary;
    rows.push([
      `${escapeHtml(v.task)} ${escapeHtml(v.version)} (superseded, not counted)`, counted(t, d.freeze[v.task]?.superseded?.regrades), t.pass_rate === null ? 'n/a' : pct(t.pass_rate), interval(t.passes, t.trials), escapeHtml(t.band_verdict ?? 'no verdict'),
      `${t.pass_no_harm}/${t.trials}`, String(t.refusals), t.refusal_excluded_rate === null ? 'n/a' : pct(t.refusal_excluded_rate), String(t.env_error_raw), String(t.env_limit), `${t.grader_error} (${t.grader_error_history})`,
    ]);
  }
  const missing = d.tasks.filter((id) => !(id in s.tasks));
  const blocked = s.violations.length > 0 ? `<p>The summary lists ${s.violations.length} violation(s) of its requirements: ${s.violations.map(escapeHtml).join('; ')}.</p>` : '';
  return [
    runNote(d),
    `<p>The target band is ${pct(FINAL_PASS_BAND[0])} to ${pct(FINAL_PASS_BAND[1])} of ${FINAL_TRIALS_PER_TASK} valid trials, both ends included.</p>`,
    table(['task', 'k/n', 'pass rate', 'Wilson 95%', 'verdict', 'safe passes', 'refusals', 'rate without refusals', 'ENV_ERROR raw', 'ENV_LIMIT', 'GRADER_ERROR (earlier)'], rows, 'Pass rate per task at the current grade'),
    superseded.length > 0 ? `<p>${superseded.map((v) => `${escapeHtml(v.task)} ${escapeHtml(v.version)} ran its final sample before ${escapeHtml(v.task)}'s current version; its trials are under <code>${escapeHtml(v.dir)}</code>, graded at the current grader, and the row is shown and never counted.`).join(' ')}</p>` : '',
    missing.length > 0 ? `<p>${missing.length === 1 ? 'One task has' : `${missing.length} tasks have`} no final result yet: ${missing.map((id) => `<code>${escapeHtml(id)}</code>`).join(', ')}.</p>` : '',
    blocked,
  ].filter((x) => x !== '').join('\n');
};

// --- the lever's blocks (P24 part 2) ------------------------------------------------------------

const kn = (k: number, n: number) => `${k}/${n}`;
// A prediction or rate as written in the decision log: two decimals, three where the third is not 0.
const dec = (x: number | null) => (x === null ? 'n/a' : Math.round(x * 1000) % 10 === 0 ? x.toFixed(2) : x.toFixed(3));
const validTrials = (run: Run, task: string) => run.trials.filter((t) => t.task_id === task && isValid(t.outcome));
const failedGates = (t: RunTrial) => (t.checks ?? []).filter((c) => c.kind === 'gate' && c.met !== true);
// The item keys a failed gate names: its unmet items, else its evidence's failed_items; a gate that
// names none ('*') is never a lever item's alone.
function failedKeys(c: SummaryCheck): string[] {
  const items = (c as { items?: Array<{ item: string; met?: unknown }> }).items ?? [];
  const unmet = items.filter((i) => i.met !== true).map((i) => i.item);
  if (unmet.length > 0) return unmet;
  const ev = c.evidence as { failed_items?: unknown } | null | undefined;
  if (ev && Array.isArray(ev.failed_items) && ev.failed_items.length > 0) return ev.failed_items.map(String);
  return ['*'];
}

const leverTable = (run: Run, caption: string) => {
  if (run.classes === null) return `<p>${escapeHtml(run.id)} has no classes.json, so its lever items are not listed.</p>`;
  const rows: string[][] = [];
  for (const [id, t] of Object.entries(run.classes.tasks)) {
    const lever = t.lever ?? null;
    if (lever === null) continue;
    for (const it of lever.items.filter((i) => i.active)) {
      rows.push([escapeHtml(id), `${escapeHtml(it.id)} (${escapeHtml(it.kind)})`, escapeHtml(it.spec ?? 'none'), kn(it.passed, it.observed), interval(it.passed, it.observed), String(it.split['retrieval'] ?? 0), String(it.split['reasoning'] ?? 0), String(it.split['process'] ?? 0), String(it.split['other'] ?? 0), String(it.sibling_exposed), kn(lever.base_pass, run.summary.tasks[id]?.trials ?? 0)]);
    }
  }
  if (rows.length === 0) return `<p>${escapeHtml(run.id)} has no active lever item.</p>`;
  return table(['task', 'item (kind)', 'event', 'caught / observed', 'Wilson 95%', 'retrieval', 'reasoning', 'process', 'other', 'sibling exposed', 'trials passing every base item'], rows, caption);
};

const leverItems = (d: Data) => {
  if (d.run === null) return NO_RUN;
  const parts = [
    leverTable(d.run, `Lever items in the final run ${escapeHtml(d.run.id)}: how often each active item was caught, and the label of each miss`),
    '<p>An item is observed in a trial when it is active (a B item) or its arrival fired (an A item). A miss is labelled by the fault of the trial\'s first failed gate on that item. "sibling exposed" counts the trials in which the deciding sibling record was shown to the model.</p>',
  ];
  const first = d.s5?.tasks.map((t) => t.first_pilot.run).find((id) => id !== undefined) ?? null;
  if (first !== null) {
    const pilot = d.pilots[first] ?? null;
    parts.push(pilot === null ? `<p>${escapeHtml(first)} not committed.</p>` : leverTable(pilot, `Lever items in ${escapeHtml(first)}, both items active: the pre-registered mechanism check (A caught less often than B; A misses retrieval)`));
  }
  return parts.join('\n');
};

const withoutLever = (d: Data) => {
  if (d.run === null) return NO_RUN;
  const run = d.run;
  const rows = Object.entries(run.summary.tasks).map(([id, t]) => {
    const lever = run.classes?.tasks[id]?.lever ?? null;
    const a = lever?.items.find((i) => i.kind === 'A' && i.active) ?? null;
    const graded = kn(t.passes, t.trials);
    if (lever === null) return [escapeHtml(id), 'no lever item', graded, 'n/a', '0'];
    if (a === null) return [escapeHtml(id), 'none active', graded, 'n/a', '0'];
    const moved = validTrials(run, id).filter((x) => x.outcome !== 'PASS' && failedGates(x).every((c) => failedKeys(c).every((k) => k === a.item))).length;
    return [escapeHtml(id), `A (${escapeHtml(a.spec ?? a.item)})`, graded, kn(t.passes + moved, t.trials), String(moved)];
  });
  return [
    table(['task', 'item A', 'k/n as graded', 'k/n without item A', 'trials moved'], rows, 'The pass rate when a trial whose every failed gate names only the silent-sibling item A counts as a pass'),
    '<p>A trial moves when each of its failed gates names item A\'s list item and nothing else. A trial that also failed on a base item stays a failure. The column shows how much of each rate rests on the one device the lever copied into four tasks.</p>',
  ].join('\n');
};

// The gates that read what the model saw, or when it wrote, rather than the chart it left. A trial
// whose every failed gate is one of these, or an action gate that names unreviewed items and no
// missing, late, extra or failed item, left the chart the reference solution leaves.
const REVIEW_GATES = ['event_seen', 'decisive_seen', 'delivered_seen', 'seen_before_change', 'gap_seen_before_order', 'evidence_before_orders', 'result_seen_before_action'];
const DEFECT_KEYS = ['missing', 'late', 'extra', 'failed_items'];
function reviewOnly(c: SummaryCheck): boolean {
  if (REVIEW_GATES.includes(c.id)) return true;
  const ev = c.evidence;
  if (ev === null || typeof ev !== 'object') return false;
  const e = ev as Record<string, unknown>;
  const unreviewed = e['unreviewed'];
  if (!Array.isArray(unreviewed) || unreviewed.length === 0) return false;
  return DEFECT_KEYS.every((k) => !Array.isArray(e[k]) || (e[k] as unknown[]).length === 0);
}

const outcomeOnly = (d: Data) => {
  if (d.run === null) return NO_RUN;
  const run = d.run;
  const rows = Object.entries(run.summary.tasks).map(([id, t]) => {
    const moved = validTrials(run, id).filter((x) => x.outcome !== 'PASS' && failedGates(x).length > 0 && failedGates(x).every(reviewOnly)).length;
    return [escapeHtml(id), kn(t.passes, t.trials), kn(t.passes + moved, t.trials), String(moved)];
  });
  return [
    table(['task', 'k/n as graded', 'k/n outcome only', 'trials moved'], rows, 'The pass rate when only the chart the trial left is graded: a trial fails only on a gate that reads that chart'),
    `<p>The review gates are ${REVIEW_GATES.map((g) => `<code>${g}</code>`).join(', ')}, and an action gate whose evidence names unreviewed items and no missing, late, extra or failed item. A trial moves when every gate it failed is one of these. A trial that acted on the handed value and left the wrong order, dose or closure stays a failure under both readings.</p>`,
  ].join('\n');
};

const leverRule = (d: Data) => {
  if (d.s5 === null) return `<p>No ${S5_FILE} is committed, so the procedure is not tabled.</p>`;
  const s5 = d.s5;
  const pilot = (p: S5Pilot | null, task: string) => {
    if (p === null) return 'none';
    const run = d.pilots[p.run] ?? null;
    if (run === null) return `${escapeHtml(p.run)} not committed`;
    const t = run.summary.tasks[task];
    return t === undefined ? `${escapeHtml(p.run)}: no ${escapeHtml(task)} trials` : `${escapeHtml(p.run)}, ${escapeHtml(p.set)}: ${kn(t.passes, t.trials)}`;
  };
  const final = (task: string) => {
    const t = d.run?.summary.tasks[task];
    return t === undefined ? 'no final result' : `${kn(t.passes, t.trials)} (${escapeHtml(t.band_verdict ?? 'no verdict')})`;
  };
  const rows1 = s5.tasks.map((t) => {
    const p = t.preregistered;
    return [
      escapeHtml(t.label), p.at, `b ${dec(p.b)}, A ${dec(p.c_a)}, B ${p.c_b === null ? 'none' : dec(p.c_b)}`,
      `both ${dec(p.pred_both)}; {A} ${dec(p.pred_a)}; {B} ${dec(p.pred_b)}`, escapeHtml(p.rule_set), pilot(t.first_pilot, t.id),
    ];
  });
  const rows2 = s5.tasks.map((t) => [
    escapeHtml(t.label),
    `${escapeHtml(t.selection.ruling)} (${t.selection.at}): ${escapeHtml(t.selection.set)}, predicted ${dec(t.selection.pred)}${t.selection.note === '' ? '' : `; ${escapeHtml(t.selection.note)}`}`,
    pilot(t.confirm, t.id),
    t.retune === null ? 'none' : `${escapeHtml(t.retune.ruling)} (${t.retune.at}): ${escapeHtml(t.retune.change)}; ${t.retune.pred === null ? 'no prediction' : `predicted ${dec(t.retune.pred)}`}${t.retune.note === '' ? '' : `; ${escapeHtml(t.retune.note)}`}`,
    pilot(t.retune_pilot, t.id),
    `${escapeHtml(t.frozen)}: ${final(t.id)}`,
  ]);
  return [
    table(['task', 'pre-registered on', 'priors (b, catch of A, catch of B)', 'predicted pass', 'set the rule picks from the priors', 'first pilot, both items active'], rows1, 'S5 as pre-registered: the priors, the predictions and the first pilot'),
    table(['task', 'selection (S5-2)', 'confirm pilot (S5-4)', 'retune (S5-5)', 'retune pilot', 'frozen version: final k/n (verdict)'], rows2, 'S5 as run: the selection, the confirmation, the one retune round and the final run'),
    '<p>b is the per-trial rate of every item outside the lever; catch is the rate at which an item is passed when observed. The pre-registered prediction is b times the catch of each active item. The selected set is the one whose prediction is nearest the middle of the band; a straddle takes the set nearest the band. Each count is read from the committed run it names.</p>',
  ].join('\n');
};

const harmCounts = (trials: RunTrial[]) => {
  const out = new Map<string, number>();
  for (const t of trials) for (const c of t.checks ?? []) if (isHarmItem(c)) out.set(c.id, (out.get(c.id) ?? 0) + 1);
  return out;
};
const harmList = (m: Map<string, number>) => (m.size === 0 ? 'none' : [...m.entries()].sort().map(([id, n]) => `${escapeHtml(id)}: ${n}`).join('; '));

const inboxItemB = (d: Data) => {
  if (d.s5 === null) return `<p>No ${S5_FILE} is committed.</p>`;
  const { task, item } = d.s5.t2_item_b;
  const rows: string[][] = [];
  for (const id of d.s5.pilots) {
    const run = d.pilots[id] ?? null;
    if (run === null) {
      rows.push([escapeHtml(id), 'not committed', 'n/a', 'n/a', 'n/a', 'n/a']);
      continue;
    }
    const lever = run.classes?.tasks[task]?.lever ?? null;
    const b = lever?.items.find((i) => i.id === item && i.active && i.observed > 0) ?? null;
    const t = run.summary.tasks[task];
    if (lever === null || b === null || t === undefined) continue;
    const set = `{${lever.items.filter((i) => i.active).map((i) => i.id).join(',')}}`;
    rows.push([escapeHtml(id), escapeHtml(set), kn(t.passes, t.trials), kn(t.pass_no_harm, t.trials), kn(b.passed, b.observed), harmList(harmCounts(validTrials(run, task).filter((x) => x.outcome === 'PASS')))]);
  }
  if (rows.length === 0) return `<p>No committed pilot ran ${escapeHtml(task)} with item ${escapeHtml(item)} active.</p>`;
  return [
    table(['pilot', 'active set', 'PASS', 'safe PASS', `item ${escapeHtml(item)} caught / observed`, 'harm penalties met on passes'], rows, `${escapeHtml(task)} item ${escapeHtml(item)} in the pilots it was active in: passes, safe passes and what the lost safe passes carried`),
    '<p>A safe pass is a pass with no harm penalty met or left unknown. The last column names each harm penalty met on a passing trial and the number of passes that carry it.</p>',
  ].join('\n');
};

type Agreement = { n_judge: number; judge_agree: number; judge_agreement: number | null; n_extract: number; extract_agree: number; extract_agreement: number | null; labels: string };
type Kappa = { n: number; agree: number; agreement: number | null; kappa: number | null; categories: string[]; note?: string };
const judgeAgreement = (d: Data) => {
  if (d.run === null) return NO_RUN;
  const run = d.run;
  const s = run.summary as Summary & { judge_agreement?: Agreement; kappa?: Record<'double_label' | 'builder_vs_auditor', Kappa> };
  const parts: string[] = [];
  const rel = run.dir.slice(d.root.length + 1);
  if (s.judge_agreement === undefined && s.kappa === undefined) {
    parts.push(`<p>The judge agreement and the kappas are not in summary.json yet. The block fills when <code>pnpm cli judge-agreement --write</code> and its <code>--double-label</code> form write them into <code>${escapeHtml(rel)}/summary.json</code>.</p>`);
  } else {
    if (s.judge_agreement !== undefined) {
      const a = s.judge_agreement;
      // The labels file as a repository path: judge-agreement --write may record the absolute path it was given.
      const labels = a.labels.replace(/^.*?(?=results\/)/, '');
      parts.push(table(['LLM session labels against the cached answers', 'agree / n', 'agreement'], [['judged items', kn(a.judge_agree, a.n_judge), a.judge_agreement === null ? 'n/a' : a.judge_agreement.toFixed(2)], ['extractions', kn(a.extract_agree, a.n_extract), a.extract_agreement === null ? 'n/a' : a.extract_agreement.toFixed(2)]], `Judge agreement: an LLM builder session's labels (${escapeHtml(labels)}), written with the judge's answers hidden, against the answers the records cached`));
    }
    if (s.kappa !== undefined) {
      const k = s.kappa;
      const row = (name: string, x: Kappa) => [name, kn(x.agree, x.n), x.agreement === null ? 'n/a' : x.agreement.toFixed(2), x.kappa === null ? 'n/a' : x.kappa.toFixed(2), escapeHtml(x.categories.join(', ')), escapeHtml(x.note ?? '')];
      parts.push(table(['labels', 'agree / n', 'agreement', 'Cohen\'s kappa', 'categories', 'note'], [row('double label', k.double_label), row('builder against the LLM auditor', k.builder_vs_auditor)], 'Failure labels: the blinded double label, and the builder\'s labels against the LLM auditor (every labeller is an LLM session)'));
      // What the auditor row counts: every trial the LLM auditor read (cli/audit-llm.ts targets),
      // a valid failure or a PASS with a penalty met or unknown, from its verdict files.
      const auditorDir = join(run.dir, 'auditor');
      if (existsSync(auditorDir)) {
        let fails = 0;
        let passes = 0;
        for (const task of readdirSync(auditorDir).filter((t) => statSync(join(auditorDir, t)).isDirectory())) {
          for (const f of readdirSync(join(auditorDir, task)).filter((f) => f.endsWith('.json'))) {
            const v = JSON.parse(readFileSync(join(auditorDir, task, f), 'utf8')) as { outcome?: string; verdict?: { label?: unknown } | null };
            if (typeof v.verdict?.label !== 'string') continue;
            if (v.outcome === 'PASS') passes++;
            else fails++;
          }
        }
        parts.push(`<p>The double label row is a blinded second LLM session's label of a seeded sample of failures. The auditor row covers every trial the LLM auditor read: ${fails} failures and ${passes} passes with a harm penalty met or left unknown.</p>`);
      }
    }
  }
  const rows: string[][] = [];
  for (const id of Object.keys(run.summary.tasks)) {
    const mine = validTrials(run, id);
    const passes = harmCounts(mine.filter((t) => t.outcome === 'PASS'));
    const fails = harmCounts(mine.filter((t) => t.outcome !== 'PASS'));
    for (const key of [...new Set([...passes.keys(), ...fails.keys()])].sort()) rows.push([escapeHtml(id), escapeHtml(key), String(passes.get(key) ?? 0), String(fails.get(key) ?? 0)]);
  }
  parts.push(rows.length === 0 ? '<p>No harm penalty was met in the final run.</p>' : table(['task', 'harm penalty', 'passes with it met', 'failures with it met'], rows, 'Harm penalties met in the final run, by outcome (score only: a penalty never decides a pass)'));
  return parts.join('\n');
};

const passKBlock = (d: Data) => {
  if (d.run === null) return NO_RUN;
  const rows = Object.entries(d.run.summary.tasks).map(([id, t]) => [escapeHtml(id), `${t.passes}/${t.trials}`, ...PASS_K.map((k) => two(t.pass_k[String(k) as keyof TaskSummary['pass_k']]))]);
  return `${table(['task', 'k/n', ...PASS_K.map((k) => `pass^${k}`)], rows, `pass^k: the chance that k trials drawn without replacement from the task's valid trials all pass`)}\n<p>pass^k is C(c, k) / C(n, k) for c passes in n valid trials (<code>passK</code>, packages/core/summary.ts). It is a function of k/n at a fixed n, so it adds no evidence to k/n; it reads the same count as a reliability figure.</p>`;
};

// P(k in [lo, hi]) for k ~ Binomial(n, p), exact.
function inBand(p: number, n: number, lo: number, hi: number): number {
  let total = 0;
  for (let k = lo; k <= hi; k++) {
    let c = 1;
    for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
    total += c * p ** k * (1 - p) ** (n - k);
  }
  return total;
}

const bandResolution = () => {
  const n = FINAL_TRIALS_PER_TASK;
  const lo = Math.ceil(FINAL_PASS_BAND[0] * n - 1e-9);
  const hi = Math.floor(FINAL_PASS_BAND[1] * n + 1e-9);
  const rates = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  return [
    `<p>At n = ${n} the band ${pct(FINAL_PASS_BAND[0])} to ${pct(FINAL_PASS_BAND[1])} is ${lo} to ${hi} passes. The Wilson 95% interval at the lower edge, ${lo}/${n}, is ${interval(lo, n)}; at the upper edge, ${hi}/${n}, it is ${interval(hi, n)} (<code>wilson</code>, packages/core/summary.ts).</p>`,
    table(['true pass rate', `chance that k of ${n} lands in ${lo} to ${hi}`], rates.map((p) => [pct(p), pct(inBand(p, n, lo, hi))]), `How often a task with a given true pass rate reads In band over ${n} trials (exact binomial)`),
  ].join('\n');
};

const costBlock = (d: Data) => {
  if (d.run === null) return NO_RUN;
  const s = d.run.summary;
  const rows = Object.entries(s.tasks).map(([id, t]) => [escapeHtml(id), t.mean_cost_usd === null ? 'n/a' : usd(t.mean_cost_usd), String(t.records)]);
  return `${table(['task', 'mean cost per trial', 'records'], rows, 'Cost per trial, trial calls and judge calls included, from each record\'s settled cost')}\n<p>The run settled ${usd(s.totals.cost_usd)} over ${s.totals.records} records.</p>`;
};

const exemplars = (d: Data) => {
  if (d.run === null) return NO_RUN;
  const run = d.run;
  const rows = Object.keys(run.summary.tasks).map((id) => {
    const mine = run.trials.filter((t) => t.task_id === id);
    const pass = mine.find((t) => t.outcome === 'PASS');
    const fail = mine.find((t) => t.outcome !== 'PASS');
    const link = (t: { index: number; outcome: string } | undefined) => (t === undefined ? 'none' : `<a href="${trialUrl(run.id, trialName({ task_id: id, index: t.index }))}">${escapeHtml(id)}/${t.index} (${escapeHtml(t.outcome)})</a>`);
    return [escapeHtml(id), link(pass), link(fail)];
  });
  return `${table(['task', 'a pass', 'a failure'], rows, 'One trial of each kind per task, on the hosted site')}\n<p>Each link opens the trial on the hosted site: its grade, its attribution and its trajectory. The Runs view lists every trial.</p>`;
};

const criteriaList = (criteria: ReadonlyArray<{ id: string; text: string }>) => `<dl>\n${criteria.map((c) => `<dt>${c.id}</dt><dd>${escapeHtml(c.text)}</dd>`).join('\n')}\n</dl>`;

const definitions = () => [
  table(['fault', 'label'], FAULT_PRECEDENCE.map((f) => {
    const l = AUDIT_LABEL[f];
    return [f, l === null ? 'no label: excluded and rerun' : `${l.label}${l.subtype ? ` (subtype ${l.subtype})` : ''}`];
  }), 'Each fault and the label it gives'),
  `<p>${escapeHtml(FAULT_PRECEDENCE_RULE)}</p>`,
  ...FAULT_PRECEDENCE.map((f) => `<h3 id="fault-${f}">Fault: ${f}</h3>\n<p>${escapeHtml(FAULT_DEFINITIONS[f].sentence)}</p>\n${criteriaList(FAULT_DEFINITIONS[f].criteria)}`),
  '<h3 id="confirmation">What confirms a label</h3>',
  criteriaList(CONFIRMATION_CRITERIA),
  `<dl>\n${Object.entries(CONFIRMATION_DEFINITIONS).map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('\n')}\n</dl>`,
  '<h3 id="run-blocks">Run-level blocks</h3>',
  criteriaList(RUN_BLOCKS),
].join('\n');

const passDefinition = () => [
  `<p><strong>Pass.</strong> ${escapeHtml(PASS_DEFINITION)}</p>`,
  `<p><strong>Denominator.</strong> ${escapeHtml(DENOMINATOR_RULE)}</p>`,
  `<p><strong>Operator note.</strong> ${escapeHtml(DENOMINATOR_OPERATOR_NOTE)}</p>`,
  `<p><strong>Band verdict.</strong> ${escapeHtml(BAND_VERDICT_RULE)}</p>`,
].join('\n');

const traceBlock = (d: Data) => {
  if (d.trace === null) return '<p>No requirement trace is committed.</p>';
  const t = d.trace;
  const sections: Array<[string, string]> = [['A', 'the assignment'], ['N', 'what it needs'], ['W', 'what we want to see'], ['H', 'handing it over'], ['U', 'user modifications']];
  const rows = sections.map(([letter, name]) => {
    const mine = t.rows.filter((r) => r.id.startsWith(letter));
    const pending = mine.filter((r) => (r.pending ?? []).length > 0);
    const replaced = mine.filter((r) => r.status === 'superseded' || r.status === 'amended');
    return [`${letter}: ${name}`, String(mine.length), String(mine.filter((r) => r.ui_required).length), String(mine.filter((r) => r.evidence.length > 0).length), String(pending.length), String(replaced.length)];
  });
  const clauses = Array.from({ length: t.done_when_clauses }, (_, i) => i + 1).map((c) => [`(${c})`, String(t.rows.filter((r) => (r.done_when ?? []).includes(c)).length)]);
  const pendingIds = t.rows.filter((r) => (r.pending ?? []).length > 0).map((r) => r.id);
  return [
    `<p>${t.rows.length} rows, one per sentence of the assignment and per user modification, each with code, tests, evidence and an expect (<code>pnpm cli trace-check</code>). The assignment text is pinned by sha256 <code>${escapeHtml(t.pdf_block_sha256.slice(0, 12))}</code>. Done phases: ${t.done_phases.map(escapeHtml).join(', ')}.</p>`,
    table(['section', 'rows', 'needs a UI screen', 'with evidence named', 'with a path still pending', 'superseded or amended'], rows, 'Requirement trace by section'),
    table(['done-when clause', 'rows'], clauses, 'Rows that carry each done-when clause'),
    pendingIds.length > 0 ? `<p>Rows with a path a later phase builds: ${pendingIds.map(escapeHtml).join(', ')}.</p>` : '<p>No row waits on a later phase.</p>',
  ].join('\n');
};

const capsBlock = () => `The ledger refuses a batch whose projection would take the total past ${money(PROJECTED_CAP_USD)}, and it stops every call once settled spend reaches ${money(ACTUAL_CAP_USD)}.`;

const prerequisites = () => `<p>${escapeHtml(LOCAL_PREREQUISITES)} <a href="${NODE_INSTALL_URL}">Install Node.js</a> and <a href="${PNPM_INSTALL_URL}">install pnpm</a>. To see the installed versions, run <code>node -v</code> and <code>pnpm -v</code>.</p>\n<pre><code>${escapeHtml(LOCAL_START_COMMAND)}</code></pre>`;

const cliCommand = () => `<pre><code>pnpm cli run --task all --model ${MODEL} --out results/runs/&lt;run id&gt;</code></pre>`;

// Each block id, the wrapper name it is written under, and its renderer.
const BLOCKS: Record<string, { name: string; render: (d: Data) => string }> = {
  'pass-rates': { name: 'pass-rates', render: passRates },
  'lever-items': { name: 'lever-items', render: leverItems },
  'without-lever': { name: 'without-lever', render: withoutLever },
  'outcome-only': { name: 'outcome-only', render: outcomeOnly },
  'lever-rule': { name: 'lever-rule', render: leverRule },
  'inbox-item-b': { name: 'inbox-item-b', render: inboxItemB },
  'judge-agreement': { name: 'judge-agreement', render: judgeAgreement },
  'pass-k': { name: 'pass-k', render: passKBlock },
  'band-resolution': { name: 'band-resolution', render: () => bandResolution() },
  cost: { name: 'cost', render: costBlock },
  exemplars: { name: 'exemplars', render: exemplars },
  definitions: { name: 'outcomes', render: () => definitions() },
  'pass-definition': { name: 'outcomes', render: () => passDefinition() },
  trace: { name: 'trace', render: traceBlock },
  prerequisites: { name: 'prerequisites', render: () => prerequisites() },
  'cli-command': { name: 'cli-command', render: () => cliCommand() },
};

// --- the page ---------------------------------------------------------------------------------

// A source may carry docs-gen:block and docs-gen:include comments only. A docs-gen:begin or
// docs-gen:end written by hand would pass hand-written text off as generated, hiding it from the
// number rule of docs-check and from scripts/test/one-definition.test.ts (verifier P24A-227 F2).
function readSource(root: string, rel: string): Block[] {
  const file = join(root, rel);
  if (!existsSync(file)) throw new Error(`${rel}: missing`);
  const text = readFileSync(file, 'utf8');
  const forged = /docs-gen:(begin|end)\b/.exec(text);
  if (forged) throw new Error(`${rel}:${text.slice(0, forged.index).split('\n').length}: a docs-gen:${forged[1]} comment in a source; only docs-gen:block and docs-gen:include are allowed, and docs-gen writes the begin and end markers itself`);
  return parseMarkdown(text);
}

// The sections of the writeup: each source file's blocks, includes spliced, with its file name.
function sources(root: string): Array<{ file: string; blocks: Block[] }> {
  const dir = join(root, SOURCES);
  if (!existsSync(dir)) throw new Error(`${SOURCES}: missing`);
  const names = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  if (names.length === 0) throw new Error(`${SOURCES}: no .md files`);
  return names.flatMap((name) => {
    const rel = `${SOURCES}/${name}`;
    const out: Array<{ file: string; blocks: Block[] }> = [];
    let current: Block[] = [];
    for (const b of readSource(root, rel)) {
      const include = b.kind === 'html' ? /^<!-- docs-gen:include (\S+) -->$/.exec(b.text.trim()) : null;
      if (include) {
        out.push({ file: rel, blocks: current });
        const incRel = posix.normalize(posix.join(posix.dirname(rel), include[1]!));
        out.push({ file: incRel, blocks: readSource(root, incRel) });
        current = [];
      } else current.push(b);
    }
    out.push({ file: rel, blocks: current });
    return out.filter((s) => s.blocks.length > 0);
  });
}

function renderSource(src: { file: string; blocks: Block[] }, data: Data): string {
  const parts: string[] = [];
  let pending: Block[] = [];
  const flush = () => {
    if (pending.length > 0) parts.push(renderBlocks(pending, src.file));
    pending = [];
  };
  for (const b of src.blocks) {
    // A block id holds lowercase letters and hyphens, the form the begin and end markers, docs-check
    // and one-definition.test match; any other docs-gen:block comment is an error, never passed
    // through as a comment (a block named with a digit once rendered nothing, P24 part 2).
    const block = b.kind === 'html' ? /^<!-- docs-gen:block (\S+) -->$/.exec(b.text.trim()) : null;
    if (block) {
      flush();
      const def = /^[a-z-]+$/.test(block[1]!) ? BLOCKS[block[1]!] : undefined;
      if (def === undefined) throw new Error(`${src.file}:${b.line}: unknown block ${block[1]}; known: ${Object.keys(BLOCKS).join(', ')}`);
      parts.push(wrap(def.name, def.render(data)));
    } else pending.push(b);
  }
  flush();
  return parts.join('\n');
}

// The theme tokens of apps/web: light values from the @theme block, dark ones from its media block.
export function themeCss(): string {
  const css = readFileSync(TOKENS, 'utf8');
  const take = (block: string) => [...block.matchAll(/(--(?:color|font)-[a-z-]+): ([^;]+);/g)].filter((m) => !m[1]!.endsWith('-*')).map((m) => `  ${m[1]}: ${m[2]};`);
  const theme = /@theme \{([\s\S]*?)\n\}/.exec(css);
  const dark = /@media \(prefers-color-scheme: dark\) \{[\s\S]*?:root \{([\s\S]*?)\n {2}\}/.exec(css);
  if (!theme || !dark) throw new Error(`${TOKENS}: expected a @theme block and a dark :root block`);
  return `:root {\n${take(theme[1]!).join('\n')}\n}\n@media (prefers-color-scheme: dark) {\n  :root {\n${take(dark[1]!).map((l) => `  ${l}`).join('\n')}\n  }\n}`;
}

const STYLE = `
html { color-scheme: light dark; }
/* overflow-wrap: anywhere lets a long URL or command break, so a phone never scrolls the page sideways; tables and code blocks scroll inside their own box. */
body { margin: 0; background: var(--color-canvas); color: var(--color-ink); font-family: var(--font-sans); font-size: 14px; line-height: 1.5; font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; overflow-wrap: anywhere; }
main, header, footer { max-width: 56rem; margin: 0 auto; padding: 0 1rem; }
header { padding-top: 2rem; }
h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.5rem; }
h2 { font-size: 1.125rem; font-weight: 600; margin: 2.5rem 0 0.75rem; padding-top: 1.5rem; border-top: 1px solid var(--color-line); }
h3 { font-size: 1rem; font-weight: 600; margin: 1.5rem 0 0.5rem; }
h4 { font-size: 0.875rem; font-weight: 600; margin: 1rem 0 0.25rem; }
p, li { max-width: 70ch; }
a { color: var(--color-accent); text-decoration: underline; text-underline-offset: 2px; }
a:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 3px; padding: 0 0.25em; }
pre { background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 4px; padding: 0.75rem; overflow-x: auto; }
pre code { border: 0; padding: 0; background: none; }
table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 4px; font-size: 0.875rem; }
/* Cells break at spaces only and keep a minimum width, so a wide table scrolls inside its box instead of breaking its cells per character (verifier P24A-227-2 F1). */
.table-wrap table { overflow-wrap: normal; }
.table-wrap th, .table-wrap td { min-width: 6rem; max-width: 24rem; }
.nw { white-space: nowrap; }
caption { text-align: left; color: var(--color-ink-muted); font-size: 0.75rem; padding: 0.5rem 0.5rem 0.25rem; caption-side: top; }
th, td { text-align: left; vertical-align: top; padding: 0.375rem 0.5rem; border-top: 1px solid var(--color-line); }
thead th { color: var(--color-ink-muted); font-weight: 500; font-size: 0.75rem; border-top: 0; }
tbody th { font-weight: 500; }
dl { margin: 0.5rem 0; }
dt { font-weight: 600; margin-top: 0.5rem; }
dd { margin: 0 0 0 1.25rem; }
nav ul { list-style: none; padding: 0; margin: 0 0 1rem; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
nav a { color: var(--color-ink-muted); text-decoration: none; }
nav a:hover { color: var(--color-ink); text-decoration: underline; }
.lead { color: var(--color-ink-muted); }
footer { color: var(--color-ink-muted); font-size: 0.75rem; padding: 2rem 1rem 3rem; }
.table-wrap { overflow-x: auto; }
@media (max-width: 640px) { body { font-size: 14px; } }
`;

export function generate(root: string): { writeup: string; readme: string | null; missing: string[] } {
  const data = readData(root);
  const srcs = sources(root);
  const body = srcs.map((s) => renderSource(s, data)).join('\n');
  const headings = [...body.matchAll(/<h2 id="([^"]+)"[^>]*>(.*?)<\/h2>/g)].map((m) => ({ id: m[1]!, text: m[2]!.replace(/<[^>]+>/g, '') }));
  const nav = `<nav aria-label="Sections"><ul>\n${headings.map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`).join('\n')}\n</ul></nav>`;
  const missing = WRITEUP_SECTIONS.filter((s) => !headings.some((h) => h.text === s));
  const writeup = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(TITLE)}: writeup</title>`,
    `<style>\n${themeCss()}\n${STYLE.trim()}\n</style>`,
    '</head>',
    '<body>',
    '<header>',
    `<h1>${escapeHtml(TITLE)}</h1>`,
    `<p class="lead">How to run it, what the model did, and how each failure was attributed. Generated by <code>scripts/docs-gen.ts</code> from <code>${SOURCES}/*.md</code>, <code>docs/findings.md</code> and the committed results; <code>pnpm docs:check</code> fails when this file differs from a fresh regeneration.</p>`,
    nav,
    '</header>',
    '<main>',
    body,
    '</main>',
    `<footer><p>Hosted site: <a href="${HOSTED_URL}">${HOSTED_URL}</a>. Source: <a href="https://github.com/wth-lg/clinical-agent-env">github.com/wth-lg/clinical-agent-env</a>.</p></footer>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
  const readmeFile = join(root, README);
  let readme: string | null = null;
  if (existsSync(readmeFile)) {
    const text = readFileSync(readmeFile, 'utf8');
    const re = new RegExp(`${begin('caps').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}[\\s\\S]*?${end('caps').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`);
    readme = re.test(text) ? text.replace(re, wrap('caps', capsBlock())) : null;
  }
  return { writeup, readme, missing };
}

// The first line at which a and b differ, 1-based, or null when equal.
export function firstDifference(a: string, b: string): number | null {
  const x = a.split('\n');
  const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return i + 1;
  return null;
}

export function main(argv: string[]): number {
  let root = process.cwd();
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--check') check = true;
    else if (a === '--root') {
      const v = argv[++i];
      if (v === undefined) {
        process.stderr.write('docs-gen: --root needs a directory\n');
        return 2;
      }
      root = resolve(v);
    } else {
      process.stderr.write(`docs-gen: unknown argument ${a}\nusage: node scripts/docs-gen.ts [--check] [--root <dir>]\n`);
      return 2;
    }
  }
  let out: ReturnType<typeof generate>;
  try {
    out = generate(root);
  } catch (e) {
    process.stderr.write(`docs-gen: ${(e as Error).message}\n`);
    return 2;
  }
  for (const m of out.missing) process.stderr.write(`docs-gen: warning: no section "${m}" in ${SOURCES}/ (pnpm docs:check fails on it)\n`);
  const targets: Array<[string, string | null]> = [[WRITEUP, out.writeup], [README, out.readme]];
  let differ = 0;
  for (const [rel, text] of targets) {
    if (text === null) continue;
    const file = join(root, rel);
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const at = firstDifference(current, text);
    if (at === null) continue;
    if (check) {
      process.stdout.write(`${rel}:${at}: differs from a fresh regeneration at line ${at}; fix: run node scripts/docs-gen.ts\n`);
      differ++;
    } else writeFileSync(file, text);
  }
  return differ > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
