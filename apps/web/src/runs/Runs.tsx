// Runs: the official run's trials, failure reasons first, then the committed pilot runs under
// their own heading (never counted in the results). Every non-pass row shows, with no click, its
// outcome, the attribution label (packages/core/outcomes.ts AUDIT_LABEL of the fault explainTrial
// decides), the decisive failing check, the one-line reason and, with no audit row, the
// not-audited marker; all of it is packages/core/explain.ts explainTrial, never re-derived here.
// A record the loader cannot read is a row that says why. The header shows k/N as a stat with its
// Wilson interval and the outcome counts, then the trials each task's k/N leaves out and why
// (ENV_LIMIT and the other excluded outcomes), always in view; the pass and denominator rules are in
// "How a trial is counted" (ui-polish 2.2, verifier-phase-P17i-UI-2-1 S1). In each run the rows to
// look at (not PASS, a fault or a harm) come first; the PASS rows are behind "<n> PASS trials"
// ("Other trials", with no number, while the run is blocked), open while a filter is set. Filters (task,
// label; and from Findings, check: the valid failures whose decisive check it is, and audit: the
// valid failures by audit label, P17j JU7) live in the URL; a run with a trial that blocks it says
// so above the list; under label=pass the shown-count line hides while a listed run is blocked; ?trial= opens the trial detail
// (apps/web/src/trial/TrialPage.tsx) in place of the list, and Back to Runs returns to it.
import { ChevronRight, CircleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { AUDIT_LABELS, OUTCOMES } from '../../../../packages/core/outcomes.ts';
import { wilson } from '../../../../packages/core/summary.ts';
import { gradingLine, useResults, type BadRecord, type RunData, type Trial } from '../data/results.ts';
import { harmItems, safePass } from '../data/harm.ts';
import { auditFilterOf, failedCheckOf, isFalsePass, noPassCount, runBlock, shownFault, shownLabel } from '../data/failures.ts';
import { notCounted, notCountedText } from '../data/marks.ts';
import { RunBlocked } from '../findings/why.tsx';
import { Card, FaultChip, FaultMeta, formatInterval, GlossaryLink, HarmChip, Notice, OutcomeChip, Page, PlainRules, SELECT, CARD, CHIP } from '../data/ui.tsx';
import { navigate, useParams } from '../data/url.ts';
import { takeReturn } from '../trial/back.ts';
import { TrialPage } from '../trial/TrialPage.tsx';

// The label filter's values: every AUDIT_LABEL name, then excluded (INFRA) and pass.
// A false PASS (GR5) has a fault, so it files under its label, not under pass.
// A valid failure the audit labels environment or grader files under that label, as its row shows it.
const labelOf = (t: Trial) => (t.explanation.outcome === 'PASS' && t.explanation.fault === null ? 'pass' : t.explanation.fault === 'infra' ? 'infra' : (shownLabel(t.explanation) ?? 'none'));

export function Runs({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const results = useResults();
  const params = useParams();
  const later = usePendingOpen();
  if (params.get('trial')) return <TrialPage headingRef={headingRef} />;
  if (results === null) return <Page title="Runs" headingRef={headingRef}><Notice>Loading the published results…</Notice></Page>;
  if (results.kind === 'error') return <Page title="Runs" headingRef={headingRef}><Notice testId="error-state">The published results cannot be read: {results.message}</Notice></Page>;
  const { official, pilots, officialError } = results;
  const runs = [...(official ? [official] : []), ...pilots];
  const task = params.get('task') ?? '';
  const label = params.get('label') ?? '';
  const check = params.get('check') ?? '';
  const audit = params.get('audit') ?? '';
  // A task in the URL that no run holds still shows as the chosen option, so the filter is never hidden.
  const tasks = [...new Set([...(official ? Object.keys(official.summary!.tasks) : []), ...runs.flatMap((r) => r.trials.map((t) => t.task)), ...(task === '' ? [] : [task])])].sort();
  // The check and audit filters come from the official run's numbers (Findings), so a pilot list
  // ignores them (verifier-phase-P17i-JU7-1 m2).
  const pilotMatches = (t: Trial) => (task === '' || t.task === task) && (label === '' || labelOf(t) === label);
  const matches = (t: Trial) => pilotMatches(t) && (check === '' || failedCheckOf(t.explanation) === check) && (audit === '' || auditFilterOf(t.explanation) === audit);
  const filtered = task !== '' || label !== '' || check !== '' || audit !== '';
  const block = official ? runBlock(official.trials) : null;
  // Under label=pass the count line counts PASS rows, so it is a pass count: while a run in the
  // list is blocked (the official run, or a pilot shown under it) it says why in its place; other
  // labels keep their counts (verifier-phase-P17i-UI-FU-1 B1).
  const listed = [...(official ? [official] : []), ...(check === '' && audit === '' ? pilots : [])];
  const holding = label === 'pass' ? listed.reduce((n, r) => n + (runBlock(r.trials)?.trials ?? 0), 0) : 0;
  const falsePasses = official ? official.trials.filter((t) => (task === '' || t.task === task) && isFalsePass(t.explanation)).length : 0;
  const total = runs.reduce((n, r) => n + r.trials.length + r.bad.length, 0);
  const shown = runs.reduce((n, r) => n + (r.official ? r.trials.filter(matches).length : check === '' && audit === '' ? r.trials.filter(pilotMatches).length : 0), 0);
  const scope = official ? (task === '' ? official.summary!.totals : official.summary!.tasks[task]) : undefined;
  // safe PASS: summary.json gives pass_no_harm per task; all tasks is their sum (JU3).
  const taskRows = official ? (task === '' ? Object.values(official.summary!.tasks) : official.summary!.tasks[task] ? [official.summary!.tasks[task]!] : []) : [];
  // The trials each task's k/n leaves out, and why (data/marks.ts notCounted), for the tasks in scope.
  const left = official ? Object.entries(official.summary!.tasks).filter(([id]) => task === '' || id === task).flatMap(([id, t]) => { const text = notCountedText(notCounted(t)); return text === null ? [] : [{ id, text }]; }) : [];
  const safe = { pass_no_harm: taskRows.reduce((n, x) => n + x.pass_no_harm, 0), trials: taskRows.reduce((n, x) => n + x.trials, 0) };
  // The outcome counts of the trials in scope, in OUTCOMES order; none while the run is blocked,
  // since a PASS count is a pass count (decisions.tsv 2026-10-29T16:00).
  const inScope = official && block === null ? official.trials.filter((t) => task === '' || t.task === task) : [];
  const byOutcome = OUTCOMES.map((o) => ({ o, n: inScope.filter((t) => t.explanation.outcome === o).length })).filter((x) => x.n > 0);
  return (
    <Page title="Runs" headingRef={headingRef} lead={official ? <>Official run <span className="font-medium text-ink">{official.runId}</span>, {official.summary!.totals.records} trial records.</> : 'No official run is published yet. The committed pilot runs are below; they are not counted in the results.'}>
      {officialError !== null && <Notice testId="error-state">{officialError}</Notice>}
      {block !== null && official && <RunBlocked block={block} runId={official.runId} />}
      <Card testId="runs-summary" title={!official ? undefined : block !== null
        ? <span data-testid="runs-k-of-n">{task === '' ? 'All tasks' : task}: blocked, no pass rate{falsePasses > 0 ? `, ${falsePasses} false PASS` : ''}</span>
        : (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span data-testid="runs-k-of-n">{task === '' ? 'All tasks' : task}: <span data-testid="runs-stat" className="text-2xl font-semibold tracking-tight">{scope?.passes ?? 0}/{scope?.trials ?? 0}</span> pass</span>
            <span className="font-normal text-ink-muted">· <span data-testid="runs-wilson">Wilson 95% {formatInterval(wilson(scope?.passes ?? 0, scope?.trials ?? 0))}</span> <span data-testid="safe-pass">({safePass(safe)})</span></span>
          </span>
        )}>
        {byOutcome.length > 0 && (
          <div role="group" aria-label="Trials by outcome" className="mb-3 flex flex-wrap gap-1.5" data-testid="outcome-counts">
            {byOutcome.map((x) => <OutcomeChip key={x.o} outcome={x.o} count={x.n} />)}
          </div>
        )}
        {left.length > 0 && (
          <ul className="mb-2 space-y-0.5 text-xs text-ink-muted" data-testid="runs-not-counted">
            {left.map((l) => <li key={l.id} data-testid="not-counted" data-task={l.id} className="break-words"><span className="font-medium text-ink">{l.id}</span>: {l.text}</li>)}
          </ul>
        )}
        <details>
          <summary className="cursor-pointer font-medium text-ink">How a trial is counted</summary>
          <div className="mt-2">
            <PlainRules ids={{ pass: 'pass-definition', denominator: 'denominator-rule' }} />
          </div>
        </details>
        <p className="mt-2"><GlossaryLink>How failures are attributed</GlossaryLink></p>
      </Card>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-muted">
          Task
          <select aria-label="Task" className={SELECT} value={task} onChange={(e) => navigate({ task: e.target.value, trial: null })}>
            <option value="">All tasks</option>
            {tasks.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-muted">
          Label
          <select aria-label="Label" className={SELECT} value={label} onChange={(e) => navigate({ label: e.target.value, trial: null })}>
            <option value="">All labels</option>
            {AUDIT_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
            <option value="infra">infra (rerun, not counted)</option>
            <option value="pass">pass</option>
          </select>
        </label>
        {holding > 0
          ? <span className="pb-1.5 text-xs text-ink-muted" data-testid="shown-count-held">Count hidden while {holding} {holding === 1 ? 'trial needs' : 'trials need'} a fix</span>
          : <span className="pb-1.5 text-xs text-ink-muted" data-testid="shown-count">{shown} of {total} trials</span>}
        {filtered && <button type="button" data-testid="clear-filters" onClick={() => navigate({ task: null, label: null, check: null, audit: null, trial: null })} className="pb-1.5 text-xs text-ink underline decoration-line-strong underline-offset-2">Clear filters</button>}
      </div>
      {(check !== '' || audit !== '') && (
        <p data-testid="extra-filter" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {check !== '' && <span>Failed trials decided by the gate check <code className="text-ink">{check}</code> <button type="button" aria-label="Remove the check filter" className="text-ink underline decoration-line-strong underline-offset-2 pointer-coarse:px-1 pointer-coarse:py-2" onClick={() => navigate({ check: null, trial: null })}>Remove</button></span>}
          {audit !== '' && <span>Failed trials the human audit labels <span className="text-ink">{audit === 'unlabelled' ? 'nothing yet (not audited)' : audit}</span> <button type="button" aria-label="Remove the audit label filter" className="text-ink underline decoration-line-strong underline-offset-2 pointer-coarse:px-1 pointer-coarse:py-2" onClick={() => navigate({ audit: null, trial: null })}>Remove</button></span>}
        </p>
      )}
      {official && <RunList run={official} matches={matches} filtered={filtered} later={later} />}
      {/* The check and audit filters come from the official run, so the pilots hide while one is set (JU7r2 n1). */}
      {pilots.length > 0 && check === '' && audit === '' && (
        <section className="space-y-3" data-testid="pilot-runs">
          <h2 className="pt-2 font-medium text-ink">Pilot runs (not counted in the results)</h2>
          {pilots.map((p) => <RunList key={p.runId} run={p} matches={pilotMatches} filtered={filtered} later={later} heading />)}
        </section>
      )}
      {runs.length === 0 && officialError === null && <Notice testId="empty-state">No runs are committed in this build. Tasks and Environment work with no key.</Notice>}
    </Page>
  );
}

// A PASS with no fault and no harm: it goes behind the run's "<n> PASS trials".
const plainPass = (t: Trial) => t.explanation.outcome === 'PASS' && t.explanation.fault === null && harmItems(t.record).length === 0;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "pilot-3: 47/48 pass · 1 failure": the run's valid trials, and how many it leaves out. A pilot
// a trial blocks gives no pass count, and no failure count, which with the total gives one
// (data/failures.ts noPassCount).
function runLine(run: RunData): string {
  const valid = run.trials.filter((t) => t.explanation.valid);
  const passes = valid.filter((t) => t.explanation.outcome === 'PASS').length;
  const out = run.trials.length - valid.length;
  const held = noPassCount(run.trials);
  return `${run.runId}: ${held ?? `${passes}/${valid.length} pass · ${plural(valid.length - passes, 'failure')}`}${out > 0 ? ` · ${out} not counted` : ''}${run.bad.length > 0 ? ` · ${run.bad.length} unreadable` : ''}`;
}

function RunList({ run, matches, filtered, later, heading = false }: { run: RunData; matches: (t: Trial) => boolean; filtered: boolean; later: Later; heading?: boolean }) {
  const shown = run.trials.filter(matches);
  const look = shown.filter((t) => !plainPass(t));
  const passes = shown.filter(plainPass);
  // A blocked run has no pass count, so its group is not named by one, nor by its size: every row
  // in it is a PASS (verifier-phase-P17i-UI-2-1 B1, UI-2-2 N1).
  const blocked = runBlock(run.trials) !== null;
  const graded = gradingLine(run.grading);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(filtered);
  useEffect(() => setOpen(filtered), [filtered]);
  // Back to Runs from a trial of this run: its row in view (its PASS group opened), its button focused.
  useEffect(() => {
    const trial = takeReturn(run.runId);
    if (trial === null) return;
    const button = box.current?.querySelector<HTMLButtonElement>(`[data-testid="trial-row"][data-trial="${CSS.escape(trial)}"] button`);
    const group = button?.closest('details');
    if (group && !group.open) group.open = true;
    button?.scrollIntoView({ block: 'center' });
    button?.focus({ preventScroll: true });
  }, [run.runId]);
  return (
    <div ref={box} className="space-y-2" data-testid="run" data-run={run.runId} data-official={String(run.official)}>
      {heading && <h3 data-testid="run-header" className="sticky top-0 z-10 -mx-1 bg-canvas px-1 py-1 font-medium text-ink">{runLine(run)}</h3>}
      {graded !== null && <p className="text-xs text-ink-muted" data-testid="grading-line">{graded}</p>}
      {run.warnings.length > 0 && <Notice testId="data-warning">{run.warnings.join(' ')}</Notice>}
      {/* With only plain PASS rows, the header's "0 failures" says it, so no empty list. */}
      {(look.length > 0 || passes.length === 0 || run.bad.length > 0) && (
        <ul className={`divide-y divide-line ${CARD}`} data-testid="trial-list">
          {run.bad.map((b) => <BadRow key={b.file} b={b} />)}
          {look.map((t) => <TrialRow key={t.name} t={t} run={run} later={later} />)}
          {shown.length === 0 && run.bad.length === 0 && <li className="p-4 text-ink-muted">No trial matches these filters.</li>}
        </ul>
      )}
      {passes.length > 0 && (
        <details data-testid="pass-group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer px-1 py-1 font-medium text-ink">{blocked ? 'Other trials' : plural(passes.length, 'PASS trial')}</summary>
          <ul className={`mt-1 divide-y divide-line ${CARD}`} data-testid="pass-list">
            {passes.map((t) => <TrialRow key={t.name} t={t} run={run} later={later} />)}
          </ul>
        </details>
      )}
    </div>
  );
}

function BadRow({ b }: { b: BadRecord }) {
  return (
    <li data-testid="record-error" data-trial={b.name} className="border-l-2 border-l-danger px-4 py-2.5">
      <p className="flex flex-wrap items-center gap-x-2 font-medium text-ink"><CircleAlert aria-hidden className="h-3.5 w-3.5 text-danger" strokeWidth={1.75} />{b.name}: this record cannot be read.</p>
      <p className="mt-1 break-words pl-5 text-ink-muted">{b.file}: {b.errors.join('; ')}</p>
    </li>
  );
}

// A row click opens its trial DOUBLE_CLICK_MS later: a second click in that time is a
// double-click that selects a word, so it cancels the open (verifier-phase-P17i-UI-2-1 M2). The
// page holds one pending open for every row of every run, so a click on another row in that time
// cancels it too, and never lets the first row open in place of the second (UI-2-2 N2). later(open)
// starts it, later(null) only cancels; leaving Runs cancels it.
const DOUBLE_CLICK_MS = 300;
type Later = (open: (() => void) | null) => void;
function usePendingOpen(): Later {
  const pending = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(pending.current), []);
  return useCallback((open) => {
    clearTimeout(pending.current);
    pending.current = open === null ? undefined : window.setTimeout(open, DOUBLE_CLICK_MS);
  }, []);
}

// Row: the name, outcome, fault chip and decisive check on one line with the cost on the right;
// under it the fault note, the not-audited marker and any harm, then the reason. A click anywhere
// on the row that is not on a link or button (or ends a text selection) opens the trial, as its
// button does, after the wait above.
function TrialRow({ t, run, later }: { t: Trial; run: RunData; later: Later }) {
  const e = t.explanation;
  // A non-pass, or a false PASS (GR5), shows its label and reason.
  const faulted = e.outcome !== 'PASS' || e.fault !== null;
  const cost = t.record.cost_usd + (t.record.judge_cost_usd ?? 0);
  const open = () => navigate({ trial: t.name, run: run.runId, tab: null });
  return (
    <li
      data-testid="trial-row"
      data-trial={t.name}
      data-outcome={e.outcome}
      className="cursor-pointer px-4 py-2.5 hover:bg-canvas/60"
      onClick={(ev) => {
        const skip = ev.detail > 1 || (ev.target as Element).closest('a, button') !== null || (getSelection()?.toString() ?? '') !== '';
        later(skip ? null : open);
      }}
    >
      <div className="grid grid-cols-[1fr_auto] items-start gap-x-3">
        <div data-testid="chip-line" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <button type="button" onClick={open} className="inline-flex min-h-6 min-w-0 items-center gap-1 break-all rounded-sm text-left font-medium text-ink hover:underline">
            <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
            {t.name}
          </button>
          <OutcomeChip outcome={e.outcome} fault={shownFault(e)} />
          {faulted && <FaultChip e={e} />}
          {e.decisive_check && <span className="inline-flex min-w-0 items-center gap-1 text-xs text-ink-muted">check <code data-testid="decisive" className={`${CHIP} break-all border-line bg-canvas font-mono font-normal text-ink dark:bg-line`}>{e.decisive_check.id}</code></span>}
        </div>
        <span className="whitespace-nowrap pt-1 text-xs text-ink-muted" title="Agent and judge cost">${cost.toFixed(2)}</span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 empty:hidden">
        {faulted && <FaultMeta e={e} official={run.official} />}
        <HarmChip items={harmItems(t.record)} />
      </p>
      {faulted && <p data-testid="reason" className="mt-1 break-words pl-5 text-ink-muted">{e.reason}</p>}
      {faulted && e.secondary_reason !== null && <p data-testid="secondary-reason" className="break-words pl-5 text-xs text-ink-muted">{e.secondary_reason}</p>}
    </li>
  );
}
