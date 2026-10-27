// Runs: the official run's trials, failure reasons first, then the committed pilot runs under
// their own heading (never counted in the results). Every non-pass row shows, with no click, its
// outcome, the attribution label (packages/core/outcomes.ts AUDIT_LABEL of the fault explainTrial
// decides), the decisive failing check, the one-line reason and, with no audit row, the
// not-audited marker; all of it is packages/core/explain.ts explainTrial, never re-derived here.
// A record the loader cannot read is a row that says why. The header shows k/N with the pass and
// denominator rules. Filters (task, label; and from Findings, check: the valid failures whose
// decisive check it is, and audit: the valid failures by audit label, P17j JU7) live in the URL; a
// run with a trial that blocks it says so above the list; ?trial= opens the trial detail
// (apps/web/src/trial/TrialPage.tsx) in place of the list, and Back to Runs returns to it.
import { ChevronRight, CircleAlert } from 'lucide-react';
import { useEffect, useRef, type Ref } from 'react';
import { AUDIT_LABELS } from '../../../../packages/core/outcomes.ts';
import { gradingLine, useResults, type BadRecord, type RunData, type Trial } from '../data/results.ts';
import { harmItems, safePass } from '../data/harm.ts';
import { auditFilterOf, failedCheckOf, isFalsePass, runBlock, shownLabel } from '../data/failures.ts';
import { RunBlocked } from '../findings/why.tsx';
import { Card, FaultLabel, GlossaryLink, HarmChip, Notice, OutcomeChip, Page, PlainRules } from '../data/ui.tsx';
import { navigate, useParams } from '../data/url.ts';
import { takeReturn } from '../trial/back.ts';
import { TrialPage } from '../trial/TrialPage.tsx';

// The label filter's values: every AUDIT_LABEL name, then excluded (INFRA) and pass.
// A false PASS (GR5) has a fault, so it files under its label, not under pass.
// A valid failure the audit labels environment or grader files under that label, as its row shows it.
const labelOf = (t: Trial) => (t.explanation.outcome === 'PASS' && t.explanation.fault === null ? 'pass' : t.explanation.fault === 'infra' ? 'infra' : (shownLabel(t.explanation) ?? 'none'));
const select = 'h-8 max-w-full rounded-sm border border-line-strong bg-surface px-2 text-ink';

export function Runs({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const results = useResults();
  const params = useParams();
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
  const falsePasses = official ? official.trials.filter((t) => (task === '' || t.task === task) && isFalsePass(t.explanation)).length : 0;
  const total = runs.reduce((n, r) => n + r.trials.length + r.bad.length, 0);
  const shown = runs.reduce((n, r) => n + (r.official ? r.trials.filter(matches).length : check === '' && audit === '' ? r.trials.filter(pilotMatches).length : 0), 0);
  const scope = official ? (task === '' ? official.summary!.totals : official.summary!.tasks[task]) : undefined;
  // safe PASS: summary.json gives pass_no_harm per task; all tasks is their sum (JU3).
  const taskRows = official ? (task === '' ? Object.values(official.summary!.tasks) : official.summary!.tasks[task] ? [official.summary!.tasks[task]!] : []) : [];
  const safe = { pass_no_harm: taskRows.reduce((n, x) => n + x.pass_no_harm, 0), trials: taskRows.reduce((n, x) => n + x.trials, 0) };
  return (
    <Page title="Runs" headingRef={headingRef} lead={official ? <>Official run <span className="font-medium text-ink">{official.runId}</span>, {official.summary!.totals.records} trial records.</> : 'No official run is published yet. The committed pilot runs are below; they are not counted in the results.'}>
      {officialError !== null && <Notice testId="error-state">{officialError}</Notice>}
      {block !== null && official && <RunBlocked block={block} runId={official.runId} />}
      <Card title={!official ? 'How a trial is counted' : block !== null
        ? <span data-testid="runs-k-of-n">{task === '' ? 'All tasks' : task}: blocked, no pass rate{falsePasses > 0 ? `, ${falsePasses} false PASS` : ''}</span>
        : <><span data-testid="runs-k-of-n">{task === '' ? 'All tasks' : task}: {scope?.passes ?? 0}/{scope?.trials ?? 0} pass</span> <span className="font-normal text-ink-muted" data-testid="safe-pass">({safePass(safe)})</span></>}>
        <PlainRules ids={{ pass: 'pass-definition', denominator: 'denominator-rule' }} />
        <p className="mt-2"><GlossaryLink>How failures are attributed</GlossaryLink></p>
      </Card>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-muted">
          Task
          <select aria-label="Task" className={select} value={task} onChange={(e) => navigate({ task: e.target.value, trial: null })}>
            <option value="">All tasks</option>
            {tasks.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-muted">
          Label
          <select aria-label="Label" className={select} value={label} onChange={(e) => navigate({ label: e.target.value, trial: null })}>
            <option value="">All labels</option>
            {AUDIT_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
            <option value="infra">infra (rerun, not counted)</option>
            <option value="pass">pass</option>
          </select>
        </label>
        <span className="pb-1.5 text-xs text-ink-muted" data-testid="shown-count">{shown} of {total} trials</span>
        {filtered && <button type="button" data-testid="clear-filters" onClick={() => navigate({ task: null, label: null, check: null, audit: null, trial: null })} className="pb-1.5 text-xs text-ink underline decoration-line-strong underline-offset-2">Clear filters</button>}
      </div>
      {(check !== '' || audit !== '') && (
        <p data-testid="extra-filter" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {check !== '' && <span>Failed trials decided by the gate check <code className="text-ink">{check}</code> <button type="button" aria-label="Remove the check filter" className="text-ink underline decoration-line-strong underline-offset-2" onClick={() => navigate({ check: null, trial: null })}>Remove</button></span>}
          {audit !== '' && <span>Failed trials the human audit labels <span className="text-ink">{audit === 'unlabelled' ? 'nothing yet (not audited)' : audit}</span> <button type="button" aria-label="Remove the audit label filter" className="text-ink underline decoration-line-strong underline-offset-2" onClick={() => navigate({ audit: null, trial: null })}>Remove</button></span>}
        </p>
      )}
      {official && <RunList run={official} matches={matches} />}
      {/* The check and audit filters come from the official run, so the pilots hide while one is set (JU7r2 n1). */}
      {pilots.length > 0 && check === '' && audit === '' && (
        <section className="space-y-3" data-testid="pilot-runs">
          <h2 className="pt-2 font-medium text-ink">Pilot runs (not counted in the results)</h2>
          {pilots.map((p) => <RunList key={p.runId} run={p} matches={pilotMatches} heading />)}
        </section>
      )}
      {runs.length === 0 && officialError === null && <Notice testId="empty-state">No runs are committed in this build. Tasks and Environment work with no key.</Notice>}
    </Page>
  );
}

function RunList({ run, matches, heading = false }: { run: RunData; matches: (t: Trial) => boolean; heading?: boolean }) {
  const shown = run.trials.filter(matches);
  const graded = gradingLine(run.grading);
  const list = useRef<HTMLUListElement>(null);
  // Back to Runs from a trial of this run: its row in view, its button focused.
  useEffect(() => {
    const trial = takeReturn(run.runId);
    if (trial === null) return;
    const button = list.current?.querySelector<HTMLButtonElement>(`[data-testid="trial-row"][data-trial="${CSS.escape(trial)}"] button`);
    button?.scrollIntoView({ block: 'center' });
    button?.focus({ preventScroll: true });
  }, [run.runId]);
  return (
    <div className="space-y-2" data-testid="run" data-run={run.runId} data-official={String(run.official)}>
      {heading && <h3 className="text-ink-muted"><span className="font-medium text-ink">{run.runId}</span>: {run.trials.length + run.bad.length} trial records</h3>}
      {graded !== null && <p className="text-xs text-ink-muted" data-testid="grading-line">{graded}</p>}
      {run.warnings.length > 0 && <Notice testId="data-warning">{run.warnings.join(' ')}</Notice>}
      <ul ref={list} className="divide-y divide-line rounded-sm border border-line bg-surface" data-testid="trial-list">
        {run.bad.map((b) => <BadRow key={b.file} b={b} />)}
        {shown.map((t) => <TrialRow key={t.name} t={t} run={run} />)}
        {shown.length === 0 && run.bad.length === 0 && <li className="p-4 text-ink-muted">No trial matches these filters.</li>}
      </ul>
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

function TrialRow({ t, run }: { t: Trial; run: RunData }) {
  const e = t.explanation;
  // A non-pass, or a false PASS (GR5), shows its label and reason.
  const faulted = e.outcome !== 'PASS' || e.fault !== null;
  const cost = t.record.cost_usd + (t.record.judge_cost_usd ?? 0);
  return (
    <li data-testid="trial-row" data-trial={t.name} data-outcome={e.outcome} className="px-4 py-2.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <button type="button" onClick={() => navigate({ trial: t.name, run: run.runId, tab: null })} className="inline-flex min-h-6 min-w-0 items-center gap-1 break-all rounded-sm text-left font-medium text-ink hover:underline">
          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
          {t.name}
        </button>
        <OutcomeChip outcome={e.outcome} fault={e.fault} />
        <HarmChip items={harmItems(t.record)} />
        {faulted && <FaultLabel e={e} official={run.official} />}
        {e.decisive_check && <code data-testid="decisive" className="break-all rounded-sm bg-canvas px-1 text-xs text-ink">{e.decisive_check.id}</code>}
        <span className="ml-auto text-xs text-ink-muted" title="Agent and judge cost">${cost.toFixed(2)}</span>
      </div>
      {faulted && <p data-testid="reason" className="mt-1 break-words pl-5 text-ink-muted">{e.reason}</p>}
      {faulted && e.secondary_reason !== null && <p data-testid="secondary-reason" className="break-words pl-5 text-xs text-ink-muted">{e.secondary_reason}</p>}
    </li>
  );
}
