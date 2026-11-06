// scripts/docs-gen.ts and scripts/docs-check.ts (plan phase P24). docs-gen builds docs/writeup.html
// from docs/writeup/*.md, docs/findings.md and the blocks it renders from the final run's
// summary.json, packages/core/outcomes.ts, packages/core/summary.ts and docs/requirements/trace.json,
// and fills the caps block of README.md from packages/core/ledger.ts. docs-check regenerates both
// and fails on any difference, runs ste-check, checks the links, the sections, the numbers outside
// generated blocks, that the HTML loads nothing from outside, and the README rules. Each mutation
// the plan names makes it exit 1. Every case runs on a copy of the repo's docs and README with the
// repo's results/ and tasks/ linked in, so the repo itself is never written.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTUAL_CAP_USD, PROJECTED_CAP_USD } from '../../packages/core/ledger.ts';
import { PASS_DEFINITION } from '../../packages/core/outcomes.ts';
import { passK, wilson } from '../../packages/core/summary.ts';
import { LOCAL_START_COMMAND } from '../../apps/web/src/surface/command.ts';
import { generate, WRITEUP } from '../docs-gen.ts';
import { nowrapNumbers, WRITEUP_SECTIONS } from '../docs-lib.ts';
import { repoRoot, runScript, tempDir } from './helpers.ts';

const check = (root: string, args: string[] = []) => runScript('scripts/docs-check.ts', ['--root', root, ...args], { cwd: repoRoot });
const gen = (root: string, args: string[] = []) => runScript('scripts/docs-gen.ts', ['--root', root, ...args], { cwd: repoRoot });

// A copy of the docs the writeup is built from, with results/ and tasks/ linked in and no
// results/official.json (the run directory is linked by name, so a later official.json in the
// repo does not change these cases).
function docsRoot(): string {
  const root = tempDir('docs-root');
  cpSync(join(repoRoot, 'docs'), join(root, 'docs'), { recursive: true });
  cpSync(join(repoRoot, 'README.md'), join(root, 'README.md'));
  mkdirSync(join(root, 'results/runs'), { recursive: true });
  symlinkSync(join(repoRoot, 'results/runs/final-1'), join(root, 'results/runs/final-1'));
  for (const pilot of PILOTS) if (existsSync(join(repoRoot, 'results', pilot))) symlinkSync(join(repoRoot, 'results', pilot), join(root, 'results', pilot));
  // The per-task freeze, for the pass-rate table's regrade tags.
  symlinkSync(join(repoRoot, 'results/tasks-final.json'), join(root, 'results/tasks-final.json'));
  symlinkSync(join(repoRoot, 'tasks'), join(root, 'tasks'));
  return root;
}

// The pilot runs the S5 block and the T2 item B block read (docs/writeup/s5.json names them).
const PILOTS = ['pilot-5a', 'pilot-5b', 'pilot-5c', 'pilot-5t'];

// A root whose final run is a real directory holding its own summary.json (edited by `patch`) and
// links to the committed run's trials and classes, so a block that reads summary.json can be shown
// both before and after another tool writes into it, and a run still in progress can be shown.
function docsRootWithSummary(patch: (s: Record<string, unknown>) => void): string {
  const root = docsRoot();
  const run = join(root, 'results/runs/final-1');
  rmSync(run);
  mkdirSync(run);
  for (const f of ['trials', 'classes.json', 'item-classes.json']) symlinkSync(join(repoRoot, 'results/runs/final-1', f), join(run, f));
  const s = JSON.parse(readFileSync(join(repoRoot, 'results/runs/final-1/summary.json'), 'utf8')) as Record<string, unknown>;
  patch(s);
  writeFileSync(join(run, 'summary.json'), JSON.stringify(s));
  return root;
}

// A table row as docs-gen's table() writes it: the first cell a row header, every digit token in a
// nowrap span.
const tr = (...cells: string[]) => cells.map((c, i) => (i === 0 ? `<th scope="row">${nowrapNumbers(c)}</th>` : `<td>${nowrapNumbers(c)}</td>`)).join('');
const blockOf = (html: string, name: string) => new RegExp(`<!-- docs-gen:begin ${name} -->([\\s\\S]*?)<!-- docs-gen:end ${name} -->`).exec(html)![1]!;

// The copy with the writeup and README regenerated from its sources.
function regenerated(root: string): string {
  const out = generate(root);
  writeFileSync(join(root, WRITEUP), out.writeup);
  if (out.readme !== null) writeFileSync(join(root, 'README.md'), out.readme);
  return root;
}

const edit = (root: string, rel: string, from: string | RegExp, to: string) => {
  const text = readFileSync(join(root, rel), 'utf8');
  expect(text, `${rel} holds ${String(from)}`).toMatch(from);
  writeFileSync(join(root, rel), text.replace(from, to));
};

const summary = JSON.parse(readFileSync(join(repoRoot, 'results/runs/final-1/summary.json'), 'utf8')) as { tasks: Record<string, { passes: number; trials: number; band_verdict: string | null; pass_k: Record<string, number | null> }> };
const errors = (r: { stdout: string }) => r.stdout.split('\n').filter((l) => l !== '' && !l.startsWith('warning:') && !l.startsWith('info:'));
const warnings = (r: { stdout: string }) => r.stdout.split('\n').filter((l) => l.startsWith('warning:'));

describe('docs-gen', () => {
  it('renders the pass-rate table, pass^k, the definitions and the caps from their sources', () => {
    const { writeup, readme } = generate(docsRoot());
    for (const [id, t] of Object.entries(summary.tasks)) {
      const w = wilson(t.passes, t.trials)!;
      expect(writeup).toContain(`<td><span class="nw">${t.passes}/${t.trials}</span>`);
      expect(writeup).toContain(`[${w.lo.toFixed(2)}, ${w.hi.toFixed(2)}]`);
      expect(writeup).toContain(`<th scope="row">${id}</th>`);
      const p3 = passK(t.passes, t.trials, 3)!;
      expect(writeup).toContain(p3 < 0.005 ? '&lt;0.01' : p3.toFixed(2));
    }
    expect(writeup).toContain('<!-- docs-gen:begin outcomes -->');
    expect(writeup).toContain('<!-- docs-gen:end outcomes -->');
    expect(writeup).toContain(PASS_DEFINITION);
    expect(writeup).toContain('<!-- docs-gen:begin pass-rates -->');
    expect(writeup).toContain('<!-- docs-gen:begin trace -->');
    expect(readme).not.toBeNull();
    expect(readme).toContain(`$${PROJECTED_CAP_USD.toLocaleString('en-US')}`);
    expect(readme).toContain(`$${ACTUAL_CAP_USD.toLocaleString('en-US')}`);
  });

  it('loads nothing from outside the file and uses the theme tokens of apps/web', () => {
    const { writeup } = generate(docsRoot());
    expect(writeup).not.toMatch(/<(script|link|img|iframe)\b/);
    expect(writeup).not.toMatch(/@import|url\(/);
    const tokens = readFileSync(join(repoRoot, 'apps/web/src/styles/tokens.css'), 'utf8');
    for (const m of tokens.matchAll(/(--color-[a-z-]+): ([^;]+);/g)) expect(writeup, m[1]).toContain(`${m[1]}: ${m[2]}`);
    expect(writeup).toContain("'Inter', ui-sans-serif, system-ui, sans-serif");
  });

  it('wraps every table in a scroll container, so a phone never scrolls the page sideways (P24A-227 F1)', () => {
    const { writeup } = generate(docsRoot());
    const tables = writeup.match(/<table\b/g) ?? [];
    expect(tables.length).toBeGreaterThan(5);
    expect(writeup.match(/<div class="table-wrap">\n?<table\b/g) ?? []).toHaveLength(tables.length);
    expect(writeup.match(/<\/table>\n?<\/div>/g) ?? []).toHaveLength(tables.length);
  });

  it('lets prose wrap anywhere but keeps table cells whole, so a table scrolls in its box (P24A-227-2 F1)', () => {
    const { writeup } = generate(docsRoot());
    expect(writeup).toMatch(/body \{[^}]*overflow-wrap: anywhere/);
    expect(writeup).toMatch(/\.table-wrap table \{[^}]*overflow-wrap: normal/);
    expect(writeup).toMatch(/\.table-wrap (th, )?td[^{]*\{[^}]*min-width/);
  });

  it('keeps a date, a version, a k/n and a trial id on one line inside a table cell (P24A-227-3 F1)', () => {
    const { writeup } = generate(docsRoot());
    expect(writeup).toMatch(/\.nw \{ white-space: nowrap; \}/);
    // A generated cell: k/n and the Wilson interval; a hand-written cell: a date and a version.
    expect(writeup).toMatch(/<td><span class="nw">\d+\/20<\/span><\/td>/);
    expect(writeup).toMatch(/<td><span class="nw">\[\d\.\d\d, \d\.\d\d\]<\/span><\/td>/);
    expect(writeup).toMatch(/<span class="nw">\(2026-10-25\)<\/span>/);
    expect(writeup).toMatch(/<span class="nw">v0\.25\.0<\/span>/);
    expect(writeup).toMatch(/<a href="[^"]+"><span class="nw">crc-care-gap\/\d+<\/span> \(PASS\)<\/a>/);
    // Never inside a tag: no href holds the span.
    expect(writeup).not.toMatch(/href="[^"]*<span/);
  });

  it('rejects a docs-gen:begin or docs-gen:end comment in a source (P24A-227 F2)', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\n<!-- docs-gen:begin pass-rates -->\nThe model passed 19/20 trials.\n<!-- docs-gen:end pass-rates -->\n\n');
    expect(() => generate(root)).toThrow(/docs\/findings\.md:\d+: .*docs-gen:begin/);
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/docs\/findings\.md:\d+: .*docs-gen:begin/);
    const root2 = docsRoot();
    edit(root2, 'docs/writeup/60-attribution.md', /\n\n/, '\n\n<!-- docs-gen:end outcomes -->\n\n');
    expect(() => generate(root2)).toThrow(/60-attribution\.md:\d+: .*docs-gen:end/);
  });

  it('refuses a docs-gen:block comment whose id is unknown or holds a digit, instead of passing it through', () => {
    const root = docsRoot();
    edit(root, 'docs/writeup/70-pass-rates.md', /<!-- docs-gen:block cost -->/, '<!-- docs-gen:block s5 -->');
    expect(() => generate(root)).toThrow(/70-pass-rates\.md:\d+: unknown block s5/);
    const root2 = docsRoot();
    edit(root2, 'docs/writeup/70-pass-rates.md', /<!-- docs-gen:block cost -->/, '<!-- docs-gen:block costs -->');
    expect(() => generate(root2)).toThrow(/unknown block costs; known: /);
    expect(check(root2).status).toBe(1);
  });

  it('names the required sections once, and reports the ones the sources lack', () => {
    expect(WRITEUP_SECTIONS).toContain('Instructions');
    expect(WRITEUP_SECTIONS).toContain('References');
    const root = docsRoot();
    writeFileSync(join(root, 'docs/writeup/10-instructions.md'), '# How to run\n\nSee the README.\n');
    expect(generate(root).missing).toEqual(['Instructions']);
    expect(generate(docsRoot()).missing).toEqual([]);
  });

  it('is the same on a second run and --check exits 0 after a write', () => {
    const root = docsRoot();
    expect(gen(root).status).toBe(0);
    const first = readFileSync(join(root, WRITEUP), 'utf8');
    expect(gen(root).status).toBe(0);
    expect(readFileSync(join(root, WRITEUP), 'utf8')).toBe(first);
    expect(gen(root, ['--check']).status).toBe(0);
  });

  it('--check exits 1 and names the file when the written copy differs', () => {
    const root = regenerated(docsRoot());
    edit(root, WRITEUP, /<td><span class="nw">(\d+)\/20<\/span><\/td>/, '<td><span class="nw">19/20</span></td>');
    const r = gen(root, ['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(WRITEUP);
  });

  // P24 part 2: the final numbers. The run's superseded version is shown beside the current one and
  // never counted (R42).
  // A task regraded after its run shows the count as recorded beside the current one, with the
  // regrade's tag from results/tasks-final.json (gate FINAL-238 F1).
  it('shows the recorded count beside the current one where a regrade moved it, with the regrade tag', () => {
    const block = blockOf(generate(docsRoot()).writeup, 'pass-rates');
    expect(block).toContain(tr('message-queue', '20/20 (19/20 as recorded; regrade-r48)'));
    expect(block).toContain(tr('crc-care-gap v1 (superseded, not counted)', '18/20 (6/20 as recorded; regrade-r41)'));
    expect(block).toContain(tr('contrast-ct-prep', '5/20', '25%'));
    expect(block).not.toContain('5/20 (5/20 as recorded');
    expect(block).toContain('as recorded');
  });

  it('renders the superseded crc-care-gap v1 beside v2 in the pass-rate table, marked not counted', () => {
    const block = blockOf(generate(docsRoot()).writeup, 'pass-rates');
    const sup = (summary as unknown as { superseded: Record<string, { summary: { passes: number; trials: number; recorded_outcomes: Record<string, number> } }> }).superseded['crc-care-gap-v1']!.summary;
    const w = wilson(sup.passes, sup.trials)!;
    expect(block).toContain(tr('crc-care-gap v1 (superseded, not counted)', `${sup.passes}/${sup.trials} (${sup.recorded_outcomes['PASS'] ?? 0}/${sup.trials} as recorded; regrade-r41)`, `${Math.round((sup.passes / sup.trials) * 100)}%`, `[${w.lo.toFixed(2)}, ${w.hi.toFixed(2)}]`));
    expect(block).toContain('is shown and never counted');
  });

  it('renders each lever item of the final run and of pilot-5a from classes.json (catch, Wilson 95%, label split)', () => {
    const block = blockOf(generate(docsRoot()).writeup, 'lever-items');
    const classes = JSON.parse(readFileSync(join(repoRoot, 'results/runs/final-1/classes.json'), 'utf8')) as { tasks: Record<string, { lever: { base_pass: number; items: Array<{ id: string; kind: string; spec: string | null; active: boolean; observed: number; passed: number; split: Record<string, number>; sibling_exposed: number }> } | null }> };
    let active = 0;
    for (const [id, t] of Object.entries(classes.tasks)) {
      if (!t.lever) continue;
      for (const it of t.lever.items.filter((i) => i.active)) {
        active++;
        const w = wilson(it.passed, it.observed)!;
        expect(block, `${id} ${it.id}`).toContain(tr(id, `${it.id} (${it.kind})`, it.spec ?? 'none', `${it.passed}/${it.observed}`, `[${w.lo.toFixed(2)}, ${w.hi.toFixed(2)}]`, String(it.split['retrieval']), String(it.split['reasoning']), String(it.split['process']), String(it.split['other']), String(it.sibling_exposed), `${t.lever.base_pass}/20`));
      }
    }
    expect(active).toBe(6);
    // pilot-5a, both items active: A caught less often than B in every task.
    expect(block).toContain('<caption>Lever items in pilot-5a, both items active');
    expect(block).toContain(tr('discharge-medrec', 'A (A)', 'whitcomb-a1', '0/8', '[0.00, 0.32]'));
    expect(block).toContain(tr('discharge-medrec', 'B (B)', 'none', '8/8', '[0.68, 1.00]'));
  });

  it('renders the pass rate without the lever item A and the outcome-only sensitivity from the records (S6, S13)', () => {
    const { writeup } = generate(docsRoot());
    const without = blockOf(writeup, 'without-lever');
    // Every renal-dose-review and results-inbox failure is on item A; crc-care-gap's five are on base members; discharge-medrec has no A active; contrast-ct-prep has no lever.
    expect(without).toContain(tr('renal-dose-review', 'A (fairweather-scr-batch)', '16/20', '20/20', '4'));
    expect(without).toContain(tr('results-inbox', 'A (marchetti-cr-batch)', '12/20', '20/20', '8'));
    expect(without).toContain(tr('crc-care-gap', 'A (crc-b3)', '15/20', '15/20', '0'));
    const mq = summary.tasks['message-queue']!;
    expect(without).toContain(tr('message-queue', 'A (webb-a1)', `${mq.passes}/${mq.trials}`, `${mq.passes}/${mq.trials}`, '0'));
    expect(without).toContain(tr('discharge-medrec', 'none active', '20/20', 'n/a', '0'));
    expect(without).toContain(tr('contrast-ct-prep', 'no lever item', '5/20', 'n/a', '0'));
    const only = blockOf(writeup, 'outcome-only');
    // crc-care-gap's failures are review-only (fit_orders names unreviewed members only, plus the process gate); every other failure left the wrong chart.
    expect(only).toContain(tr('crc-care-gap', '15/20', '20/20', '5'));
    expect(only).toContain(tr('renal-dose-review', '16/20', '16/20', '0'));
    expect(only).toContain(tr('results-inbox', '12/20', '12/20', '0'));
    expect(only).toContain(tr('contrast-ct-prep', '5/20', '5/20', '0'));
    expect(only).toContain(tr('message-queue', `${mq.passes}/${mq.trials}`, `${mq.passes}/${mq.trials}`, '0'));
    expect(only).toContain('<code>event_seen</code>');
    expect(only).toContain('<code>gap_seen_before_order</code>');
  });

  it('renders the lever rule table from docs/writeup/s5.json, the pilot summaries and the final run', () => {
    const block = blockOf(generate(docsRoot()).writeup, 'lever-rule');
    const s5 = JSON.parse(readFileSync(join(repoRoot, 'docs/writeup/s5.json'), 'utf8')) as { tasks: Array<{ id: string; selection: { pred: number | null } }> };
    expect(s5.tasks.find((t) => t.id === 'renal-dose-review')!.selection.pred).toBe(0.567);
    // Priors and the pre-registered prediction, the pilot-5a count, the S5-2 selection and its prediction, the final count and verdict.
    expect(block).toContain(tr('renal-dose-review', '2026-11-04', 'b 0.97, A 0.50, B 0.82', 'both 0.40; {A} 0.49; {B} 0.80', '{A}', 'pilot-5a, {A,B}: 6/8'));
    expect(block).toContain(tr('renal-dose-review', 'R44 (2026-11-05): {A,B}, predicted 0.567; the set it ran in pilot-5a, so no confirm run; frozen under S5-8', 'none', 'none', 'none', 'v2 {A,B}: 16/20 (Above band)'));
    expect(block).toContain(tr('message-queue', '2026-11-04', 'b 0.97, A 0.45, B 0.52', 'both 0.23; {A} 0.44; {B} 0.50', '{A}', 'pilot-5a, {A,B}: 2/8'));
    const mq = summary.tasks['message-queue']!;
    expect(block).toMatch(new RegExp(`<th scope="row">message-queue</th>[^\\n]*predicted [^\\n]*?0\\.27[^\\n]*pilot-5b,[^\\n]*1/8[^\\n]*Results \\(n\\)[^\\n]*pilot-5c,[^\\n]*8/8[^\\n]*v3</span> \\{A\\}: <span class="nw">${mq.passes}/${mq.trials}</span> \\(${mq.band_verdict}\\)`));
    expect(block).toContain(tr('crc-care-gap v2', '2026-11-05', 'b 0.90, A 0.50, B none', 'both n/a; {A} 0.45; {B} n/a', '{A} (one item; freeze when the pilot lands inside its range)', 'pilot-5t, {A}: 3/8'));
    const crc = summary.tasks['crc-care-gap']!;
    expect(block).toContain(tr('crc-care-gap v2', 'R45 (2026-11-06): {A}, predicted 0.36; the estimate on pilot-5t; the pilot landed inside the pre-registered range, so v2 froze', 'none', 'none', 'none', `v2 {A}: ${crc.passes}/${crc.trials} (${crc.band_verdict})`));
    // A pilot the root lacks is named, not invented.
    const root = docsRoot();
    rmSync(join(root, 'results/pilot-5b'));
    expect(blockOf(generate(root).writeup, 'lever-rule')).toContain('pilot-5b</span> not committed');
  });

  it('renders T2 item B against the safe passes of the pilots it was active in, with the harm penalties met', () => {
    const block = blockOf(generate(docsRoot()).writeup, 'inbox-item-b');
    // pilot-5b, {B}: 7 of 8 passed, 3 of 8 safe passes, B caught 8 of 8; the four lost safe passes carry reply_names_other_patient.
    expect(block).toContain(tr('pilot-5b', '{B}', '7/8', '3/8', '8/8', 'reply_names_other_patient: 4'));
    expect(block).toContain(tr('pilot-5a', '{A,B}', '2/8', '2/8', '8/8', 'none'));
    expect(block).not.toContain('<th scope="row">pilot-5c</th>');
    expect(block).not.toContain('nowicki_fax_told_without_citing');
  });

  it('the judge-agreement block waits for P23 and renders its rates, kappas and the harm penalties met on passes once summary.json has them', () => {
    // The committed run carries P23's fields; the waiting case drops them.
    const bare = docsRootWithSummary((s) => {
      delete s['judge_agreement'];
      delete s['kappa'];
    });
    const before = blockOf(generate(bare).writeup, 'judge-agreement');
    expect(before).toContain('not in summary.json yet');
    // Harm penalties met come from the records, so they render before P23 too.
    expect(before).toContain(tr('results-inbox', 'reply_names_other_patient', '2', '3'));
    const root = docsRootWithSummary((s) => {
      s['judge_agreement'] = { n_judge: 40, judge_agree: 37, judge_agreement: 0.925, n_extract: 20, extract_agree: 20, extract_agreement: 1, labels: '/Users/someone/checkout/results/judge-calibration/hand-labels.jsonl' };
      s['kappa'] = { double_label: { n: 20, agree: 19, agreement: 0.95, kappa: 0.83, categories: ['model', 'grader'] }, builder_vs_auditor: { n: 33, agree: 33, agreement: 1, kappa: 1, categories: ['model'], note: 'one category on both sides (model): chance agreement is 1, kappa taken as 1' } };
    });
    const after = blockOf(generate(root).writeup, 'judge-agreement');
    expect(after).not.toContain('not in summary.json yet');
    expect(after).toContain(tr('judged items', '37/40', '0.93'));
    // An absolute labels path renders as its repository path.
    expect(after).toContain('hand labels (results/judge-calibration/hand-labels.jsonl)');
    expect(after).not.toContain('/Users/');
    expect(after).toContain(tr('extractions', '20/20', '1.00'));
    expect(after).toContain(tr('double label', '19/20', '0.95', '0.83', 'model, grader', ''));
    expect(after).toContain('chance agreement is');
  });

  it('the committed writeup and README equal a fresh regeneration', () => {
    const r = gen(repoRoot, ['--check']);
    expect(r.stdout + r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('docs-check', () => {
  // The official run is complete (results/official.json names final-1 with every task final), so
  // no TODO token may stay: the repo check exits 0 with no warning (P24 part 2).
  it('exits 0 on the repo with no warning', () => {
    const r = check(repoRoot);
    expect(errors(r), r.stdout + r.stderr).toEqual([]);
    expect(warnings(r), r.stdout).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('fails on an edited generated number', () => {
    const root = regenerated(docsRoot());
    edit(root, WRITEUP, /<td><span class="nw">(\d+)\/20<\/span><\/td>/, '<td><span class="nw">19/20</span></td>');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/docs\/writeup\.html.*regenerat/);
  });

  it('fails on a pass rate written in prose', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nThe model passed 12/20 trials, a rate of 60%.\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/docs\/findings\.md:\d+: .*number/);
  });

  it('fails on a k/N in a hand-written source table (P24A-227 F3)', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\n| task | k/n |\n|---|---|\n| a | 12/20 |\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/docs\/findings\.md:\d+: .*number in prose: "12\/20"/);
  });

  it('fails on a dollar amount in README.md outside the caps block (P24A-227 F4)', () => {
    const root = regenerated(docsRoot());
    edit(root, 'README.md', /\n## Links/, '\nA trial costs below $900.\n\n## Links');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/README\.md:\d+: .*\$900/);
  });

  it('catches "k of N", a Unicode slash or percent sign, and a claim phrase (P24A-227-2 F5)', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nThe model passed 12 of 20 trials.\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/number in prose: "12 of 20"/);
    const root2 = docsRoot();
    edit(root2, 'docs/findings.md', /\n\n/, '\n\nIt passed 12\u204420 trials, a rate of 60\uFF05.\n\n');
    const r2 = check(regenerated(root2));
    expect(r2.status).toBe(1);
    expect(r2.stdout).toMatch(/number in prose: "12\/20"/);
    expect(r2.stdout).toMatch(/number in prose: "60%"/);
    for (const phrase of ['MCP support', 'Harbor compatible', 'first clinical']) {
      const root3 = docsRoot();
      edit(root3, 'docs/findings.md', /\n\n/, `\n\nThis is about ${phrase} here.\n\n`);
      const r3 = check(regenerated(root3));
      expect(r3.status, phrase).toBe(1);
      expect(r3.stdout).toMatch(new RegExp(`claim phrase: "${phrase}"`, 'i'));
    }
  });

  it('catches every form of a dollar amount in README.md outside the caps block (P24A-227-2 F6)', () => {
    for (const amount of ['900 USD', '&#36;900', '$.50', '`$900`', 'USD 900', '900 dollars']) {
      const root = regenerated(docsRoot());
      edit(root, 'README.md', /\n## Links/, `\nA trial costs about ${amount} here.\n\n## Links`);
      const r = check(root);
      expect(r.status, amount).toBe(1);
      expect(r.stdout, amount).toMatch(/dollar amount outside the caps block/);
    }
  });

  // verifier P24A-227-3 R3-F4: the gaps its probes found in the number, claim and dollar rules.
  it('catches a no-break space, "of the", "out of" and U+FE6A in a k of N or a percent (R3-F4a)', () => {
    for (const [text, shown] of [['19 of 20', '19 of 20'], ['19 of the 20', '19 of the 20'], ['19 out of 20', '19 out of 20'], ['19 out of the 20', '19 out of the 20']]) {
      const root = docsRoot();
      edit(root, 'docs/findings.md', /\n\n/, `\n\nThe model passed ${text} trials.\n\n`);
      const r = check(regenerated(root));
      expect(r.status, text).toBe(1);
      expect(r.stdout, text).toMatch(new RegExp(`number in prose: "${shown}"`));
    }
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nA rate of 90﹪.\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/number in prose: "90%"/);
  });

  it('catches the claim variants: supports MCP, Harbor-compatible, first FHIR agent benchmark, fully deterministic, MCP **support** (R3-F4b)', () => {
    for (const phrase of ['supports MCP', 'Harbor-compatible', 'the first FHIR agent benchmark', 'fully deterministic', 'MCP **support**', 'Harbor‑compatible']) {
      const root = docsRoot();
      edit(root, 'docs/findings.md', /\n\n/, `\n\nThis is about ${phrase} here.\n\n`);
      const r = check(regenerated(root));
      expect(r.status, phrase).toBe(1);
      expect(r.stdout, phrase).toMatch(/claim phrase: "/);
      const root2 = regenerated(docsRoot());
      edit(root2, 'README.md', /\n## Links/, `\nThis is about ${phrase} here.\n\n## Links`);
      const r2 = check(root2);
      expect(r2.status, phrase).toBe(1);
      expect(r2.stdout, phrase).toMatch(/README\.md:\d+: claim phrase: "/);
    }
  });

  it('catches the hex entity, U+FF04 and &nbsp; forms of a dollar amount in README.md (R3-F4c)', () => {
    for (const amount of ['&#x24;900', '&#X24;900', '＄900', '900&nbsp;USD', 'US $900', '900 USD']) {
      const root = regenerated(docsRoot());
      edit(root, 'README.md', /\n## Links/, `\nA trial costs about ${amount} here.\n\n## Links`);
      const r = check(root);
      expect(r.status, amount).toBe(1);
      expect(r.stdout, amount).toMatch(/dollar amount outside the caps block/);
    }
  });

  it('an ordinal "step 2 of 3" in prose is not a number, in the writeup or in README.md (R3-F4d)', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nRead step 2 of 3 first, then part 1 of 2, then page 3 of 4.\n\n');
    const r = check(regenerated(root));
    expect(errors(r), r.stdout).toEqual([]);
    expect(r.status).toBe(0);
    const root2 = regenerated(docsRoot());
    edit(root2, 'README.md', /\n3\. Open the URL/, '\n3. Do step 3 of 3: open the URL');
    const r2 = check(root2);
    expect(errors(r2), r2.stdout).toEqual([]);
    expect(r2.status).toBe(0);
    // A rate after an ordinal is still a number.
    const root3 = docsRoot();
    edit(root3, 'docs/findings.md', /\n\n/, '\n\nStep 2 of 3 passed 12 of 20 trials.\n\n');
    const r3 = check(regenerated(root3));
    expect(r3.status).toBe(1);
    expect(r3.stdout).toMatch(/number in prose: "12 of 20"/);
    // A rate after a count-like noun, or one followed by a count noun or verb, is a number
    // (verifier HARD3-237-1 S1).
    for (const [text, shown] of [['For this task 14 of 20 trials passed.', '14 of 20'], ['In the pilot 12 of 20 trials passed.', '12 of 20'], ['On the last day 9 of 20 runs passed.', '9 of 20'], ['In step 3 of 20 passed.', '3 of 20'], ['Of page 2 of 20 were kept.', '2 of 20']]) {
      const root4 = docsRoot();
      edit(root4, 'docs/findings.md', /\n\n/, `\n\n${text}\n\n`);
      const r4 = check(regenerated(root4));
      expect(r4.status, text).toBe(1);
      expect(r4.stdout, text).toMatch(new RegExp(`number in prose: "${shown}"`));
    }
  });

  // verifier HARD3-237-1 m1: only whitespace, a hyphen (ASCII, U+2010, U+2011) or markdown
  // emphasis may stand between a claim's words, so "At first, clinical staff" is no claim.
  it('a claim\'s words separated by punctuation are not a claim phrase (HARD3-237-1 m1)', () => {
    for (const text of ['At first, clinical staff reviewed each trial.', 'The harbor. Compatible tools are listed.', 'It supports (MCP-shaped) tool definitions.']) {
      const root = docsRoot();
      edit(root, 'docs/findings.md', /\n\n/, `\n\n${text}\n\n`);
      const r = check(regenerated(root));
      expect(errors(r), text).toEqual([]);
      expect(r.status, text).toBe(0);
      const root2 = regenerated(docsRoot());
      edit(root2, 'README.md', /\n## Links/, `\n${text}\n\n## Links`);
      const r2 = check(root2);
      expect(errors(r2).filter((l) => /claim phrase/.test(l)), text).toEqual([]);
    }
  });

  it('reports a claim phrase at its own source line after entities in the text before it (R3-F4e)', () => {
    const root = docsRoot();
    const amps = Array.from({ length: 30 }, (_, i) => `A${i} & B${i}`).join(', ');
    edit(root, 'docs/findings.md', /\n\n/, `\n\n${amps}.\n\nMCP support is claimed here.\n\n`);
    const line = readFileSync(join(root, 'docs/findings.md'), 'utf8').split('\n').findIndex((l) => l === 'MCP support is claimed here.') + 1;
    expect(line).toBeGreaterThan(0);
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`docs/findings.md:${line}: claim phrase: "MCP support"`);
  });

  it('every h2 the trace greps for is a required section (P24A-227-2 F3)', () => {
    const trace = JSON.parse(readFileSync(join(repoRoot, 'docs/requirements/trace.json'), 'utf8')) as { rows: Array<{ expect: unknown }> };
    const greps = trace.rows.flatMap((row) => (Array.isArray(row.expect) ? row.expect : [row.expect]) as Array<{ command?: { cmd: string } }>)
      .flatMap((e) => [...(e.command?.cmd ?? '').matchAll(/grep -qF '>([^<]+)<\/h2>' docs\/writeup\.html/g)].map((m) => m[1]!));
    expect(greps.length).toBeGreaterThan(1);
    for (const h of greps) expect(WRITEUP_SECTIONS as readonly string[], h).toContain(h);
  });

  it('fails on a 30-word step in README.md', () => {
    const root = regenerated(docsRoot());
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    edit(root, 'README.md', /\n1\. /, `\n1. Open ${words}.\n2. `);
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/README\.md:\d+: .*at most 20/);
  });

  it('fails on a denylisted word', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nWe utilize the ledger.\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/"utilize"/);
  });

  it('fails on an external script in writeup.html', () => {
    const root = regenerated(docsRoot());
    edit(root, WRITEUP, '</body>', '<script src="https://example.org/x.js"></script></body>');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/docs\/writeup\.html:\d+: .*script/);
  });

  it('fails on an edited cap value in README.md', () => {
    const root = regenerated(docsRoot());
    edit(root, 'README.md', `$${ACTUAL_CAP_USD.toLocaleString('en-US')}`, '$2,000');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/README\.md.*(regenerat|cap)/);
  });

  it('fails when the Instructions section is removed', () => {
    const root = docsRoot();
    writeFileSync(join(root, 'docs/writeup/10-instructions.md'), '# Instructions\n\nSee the README.\n'.replace('# Instructions', '# How to run'));
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Instructions/);
  });

  it('fails on a broken relative link and on a missing anchor', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nSee [the plan](../missing.md) and [the gap](#no-such-anchor).\n\n');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/missing\.md/);
    expect(r.stdout).toMatch(/no-such-anchor/);
  });

  it('fails when README.md gains a findings section, a table or a number', () => {
    const root = regenerated(docsRoot());
    edit(root, 'README.md', /\n## Links/, '\n## Findings\n\n| task | k/n |\n|---|---|\n| a | 12/20 |\n\n## Links');
    const r = check(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/README\.md.*(Findings|table|number)/);
  });

  it('fails when README.md drops the start command or the writeup link', () => {
    const root = regenerated(docsRoot());
    edit(root, 'README.md', LOCAL_START_COMMAND, 'pnpm start');
    expect(check(root).stdout).toMatch(/LOCAL_START_COMMAND/);
    const root2 = regenerated(docsRoot());
    edit(root2, 'README.md', /docs\/writeup\.html/g, 'docs/writeup.htm');
    expect(check(root2).status).toBe(1);
  });

  // TODO-W5F waits for the W5 final results, so it is an error only once the official run is
  // complete: results/official.json names a run whose summary has every task of tasks/ final
  // (apps/web/src/overview/band.ts isFinalTask, the predicate the Overview shares). An official.json
  // on a run still in progress (final-1 today: two of six tasks) keeps it a warning.
  it('TODO-W5F is a warning without results/official.json, and with one that names a run still in progress; any other TODO is an error', () => {
    const root = docsRoot();
    edit(root, 'docs/findings.md', /\n\n/, '\n\nTODO-W5F the W5 tasks.\n\n');
    regenerated(root);
    const r = check(root);
    expect(r.status).toBe(0);
    expect(warnings(r).some((w) => w.includes('TODO-W5F'))).toBe(true);
    // An official run still in progress: a summary that holds two of the six tasks (final-1 as it
    // was between its two batches).
    const root2 = docsRootWithSummary((s) => {
      const tasks = s['tasks'] as Record<string, unknown>;
      for (const id of Object.keys(tasks)) if (id !== 'crc-care-gap' && id !== 'contrast-ct-prep') delete tasks[id];
    });
    edit(root2, 'docs/findings.md', /\n\n/, '\n\nTODO-W5F the W5 tasks.\n\n');
    writeFileSync(join(root2, 'results/official.json'), JSON.stringify({ run: 'runs/final-1' }));
    regenerated(root2);
    const r2 = check(root2);
    expect(r2.status, r2.stdout).toBe(0);
    expect(warnings(r2).some((w) => w.includes('TODO-W5F') && w.includes('official run not complete: 4 of 6 tasks have no final result'))).toBe(true);
    const root3 = docsRoot();
    edit(root3, 'docs/findings.md', /\n\n/, '\n\nTODO-XYZ later.\n\n');
    expect(check(regenerated(root3)).status).toBe(1);
  });

  it('TODO-W5F is an error once the official run is complete: every task of tasks/ final in its summary', () => {
    const root = docsRoot();
    // An environment of the two tasks final-1 holds, so its official run covers every task.
    rmSync(join(root, 'tasks'));
    mkdirSync(join(root, 'tasks'));
    for (const id of ['crc-care-gap', 'contrast-ct-prep']) symlinkSync(join(repoRoot, 'tasks', id), join(root, 'tasks', id));
    symlinkSync(join(repoRoot, 'tasks/_toy'), join(root, 'tasks/_toy'));
    edit(root, 'docs/findings.md', /\n\n/, '\n\nTODO-W5F the W5 tasks.\n\n');
    writeFileSync(join(root, 'results/official.json'), JSON.stringify({ run: 'runs/final-1' }));
    regenerated(root);
    const r = check(root);
    expect(r.status).toBe(1);
    expect(errors(r).some((l) => l.includes('TODO-W5F with the official run complete (every task final in runs/final-1)'))).toBe(true);
  });

  it('fails when a reference line has no date', () => {
    const root = docsRoot();
    edit(root, 'docs/writeup/90-references.md', /\n- /, '\n- A source with no date, https://example.org/undated.\n- ');
    const r = check(regenerated(root));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/date/);
  });

  it('exits 2 on a root that has no docs', () => {
    const r = check(tempDir('docs-empty'));
    expect(r.status).toBe(2);
  });

  it('the writeup is at the path the web build copies', () => {
    expect(WRITEUP).toBe('docs/writeup.html');
    expect(existsSync(join(repoRoot, WRITEUP))).toBe(true);
  });
});
