// Every ax_text string in docs/requirements/trace.json is rendered on its route (pre-audit S9,
// P17j JU1). An ax_text names the text P25c's accessibility snapshot of the row's ui.route must
// hold. This test reads it from the source that draws the route: the row's own `code` paths (UI
// code, and the task, tool or policy files whose text the route shows) and the shell, which every
// route shows; the row's code outside apps/web and docs (the loop, the CLI) draws nothing and is
// not read. The text is found as written, or with each `${...}` or JSX `{...}` of the source
// and each number of the text taken as a value, so "6 of 6 tasks in band" is found in
// `{k} of {n} tasks in band`. A row whose trace `pending` list names paths a later phase builds
// (a committed result or document, such as results/runs/final-1 or docs/findings.md; trace-check
// keeps that list true) is listed as a todo, not failed. Snapshots that are not
// accessibility trees (.txt counts, not .ax.txt) are not UI text and are skipped.
// Limit: this is a grep by view, not by tab, and it reads the view's data files whole, so it shows
// that the route's code or data holds the text, not that this exact screen draws it (a data file such
// as packages/core/anthropic.ts passes a model-name row on its own). e2e/labels.spec.ts asserts the
// elements on their screens: the oracle badge on the Reference solution tab and the model line on the
// prompt tab and the Live launcher.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '../../..');
const SHELL = ['apps/web/src/shell', 'apps/web/src/surface', 'apps/web/src/keygate', 'apps/web/src/data/ui.tsx', 'apps/web/src/data/marks.ts', 'apps/web/src/spend'];
// The files whose text a view shows as data (tool names and descriptions, task titles and
// policies), by the route's view.
const VIEW_DATA: Record<string, string[]> = {
  environment: ['apps/web/src/environment', 'packages/env/tools', 'packages/core/try-tool.ts'],
  // The model constant the Tasks prompt tab and the Live launcher show (via adapters/ledger-browser.ts).
  tasks: ['apps/web/src/tasks', 'tasks', 'packages/core/anthropic.ts'],
  live: ['apps/web/src/live', 'packages/core/anthropic.ts'],
  runs: ['apps/web/src/runs', 'apps/web/src/trial', 'packages/core/explain.ts', 'packages/core/outcomes.ts'],
  overview: ['apps/web/src/overview'],
  findings: ['apps/web/src/findings'],
  glossary: ['apps/web/src/glossary', 'packages/core/outcomes.ts'],
};
// The task ids a view draws from the task list or the committed run data at runtime (Overview's
// rows, the Tasks list, Runs, Findings, the Live launcher), not from a source file: the task
// directories, as data, for the views that list tasks (verifier JU1r2-1 B1, trace U37).
const TASK_IDS = readdirSync(join(REPO, 'tasks'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => e.name);
const LISTS_TASKS = new Set(['overview', 'tasks', 'runs', 'findings', 'live']);
const viewOf = (route: string | undefined) => (route === undefined ? null : new URL(route, 'http://x/').searchParams.get('view'));
// Rows whose UI a named later P17j UI PR builds; each line says which. Remove the row when it lands.
const BUILT_BY: Record<string, string> = {};

type AxText = { file: string; text: string };
type Row = { id: string; code?: string[]; pending?: string[]; ui?: { route: string }; expect?: unknown };

const rows = (JSON.parse(readFileSync(join(REPO, 'docs/requirements/trace.json'), 'utf8')) as { rows?: Row[] } | Row[]);
const all: Row[] = Array.isArray(rows) ? rows : rows.rows ?? [];

const axTexts = (r: Row): AxText[] => {
  const list = Array.isArray(r.expect) ? r.expect : r.expect === undefined ? [] : [r.expect];
  return list.flatMap((e) => ((e as { ax_text?: AxText }).ax_text ? [(e as { ax_text: AxText }).ax_text] : []));
};

function files(path: string): string[] {
  const abs = join(REPO, path);
  if (!existsSync(abs)) return [];
  const text = (n: string) => /\.(tsx?|md|toml)$/.test(n) && !/\.test\.tsx?$/.test(n);
  if (statSync(abs).isFile()) return text(abs) ? [abs] : [];
  return readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && text(e.name))
    .map((e) => join(e.parentPath, e.name));
}

// A value placeholder, whitespace collapsed, and the typographic quotes of JSX text kept as is.
const V = '\u0000';
// JSX tags go (their text stays); outcome words are values, as numbers are.
const OUTCOME_WORD = /\b(?:PASS|FAIL|LIMIT|REFUSAL|ENV_ERROR|GRADER_ERROR|INFRA_API|INFRA_HARNESS|CANCELLED)\b/g;
const normSource = (s: string) => s.replace(/<\/?[A-Za-z][^<>]*>/g, '').replace(/\$\{[^}]*\}/g, V).replace(/\{[^{}]*\}/g, V).replace(/\s+/g, ' ');
const normText = (s: string) => s.replace(OUTCOME_WORD, V).replace(/\d+(?:\.\d+)?/g, V).replace(/\s+/g, ' ');
const found = (text: string, raw: string) => {
  if (raw.replace(/\s+/g, ' ').includes(text)) return true;
  const t = normText(text);
  // With JSX {...} as values, and with only template ${...} as values (text inside a template
  // string, e.g. title={`${n} tools`}, stays); a literal number in the source may be a value too.
  const forms = [normSource(raw), raw.replace(/\$\{[^}]*\}/g, V).replace(/\s+/g, ' ')];
  return forms.some((f) => f.includes(t) || f.replace(/\d+(?:\.\d+)?/g, V).includes(t));
};

const checked = all.flatMap((r) => axTexts(r).filter((a) => a.file.endsWith('.ax.txt')).map((a) => ({ row: r, a })));

describe('ax_text strings are rendered on their routes', () => {
  it('the trace holds ax_text checks to test', () => {
    expect(checked.length).toBeGreaterThan(10);
  });

  for (const { row, a } of checked) {
    const code = row.code ?? [];
    // The row's own pending list (trace-check fails a stale or done-phase one), listed as todo so
    // the test output shows what a later phase still owes.
    const pending = row.pending ?? [];
    if (pending.length > 0 || BUILT_BY[row.id]) {
      it.todo(`${row.id}: "${a.text}" pending ${pending.length > 0 ? pending.join(', ') : BUILT_BY[row.id]}`);
      continue;
    }
    it(`${row.id}: "${a.text}" on ${row.ui?.route ?? '(no route)'}`, () => {
      // Only the row's UI and document paths draw text; its other code (the loop, the CLI) does not.
      const ui = code.filter((p) => p.startsWith('apps/web/') || p.startsWith('docs/'));
      const paths = [...ui, ...(VIEW_DATA[viewOf(row.ui?.route) ?? ''] ?? []), ...SHELL];
      const data = LISTS_TASKS.has(viewOf(row.ui?.route) ?? 'overview') ? TASK_IDS : [];
      const source = [...paths.flatMap(files).map((f) => readFileSync(f, 'utf8')), ...data].join('\n');
      expect(found(a.text, source), `"${a.text}" is not drawn by ${paths.join(', ')}`).toBe(true);
    });
  }
});
