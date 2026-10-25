// Runs: the official run's trials, failure reasons first, then the committed pilot runs under
// their own heading (never counted in the results). Every non-pass row shows, with no click, its
// outcome, the attribution label (packages/core/outcomes.ts AUDIT_LABEL of the fault explainTrial
// decides), the decisive failing check, the one-line reason and, with no audit row, the
// not-audited marker; all of it is packages/core/explain.ts explainTrial, never re-derived here.
// A record the loader cannot read is a row that says why. The header shows k/N with the pass and
// denominator rules. Filters (task, label) and the open trial live in the URL.
import { ChevronDown, ChevronRight, CircleAlert } from 'lucide-react';
import { useState, type Ref } from 'react';
import { formatCriterion } from '../../../../packages/core/explain.ts';
import { AUDIT_LABELS } from '../../../../packages/core/outcomes.ts';
import { useResults, type BadRecord, type RunData, type Trial } from '../data/results.ts';
import { Card, FaultLabel, GlossaryLink, Notice, OutcomeChip, Page, PlainRules } from '../data/ui.tsx';
import { navigate, useParams } from '../data/url.ts';

// The label filter's values: every AUDIT_LABEL name, then excluded (INFRA) and pass.
const labelOf = (t: Trial) => (t.explanation.outcome === 'PASS' ? 'pass' : t.explanation.fault === 'infra' ? 'infra' : (t.explanation.label ?? 'none'));
const select = 'h-8 max-w-full rounded-sm border border-line-strong bg-surface px-2 text-ink';

export function Runs({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const results = useResults();
  const params = useParams();
  if (results === null) return <Page title="Runs" headingRef={headingRef}><Notice>Loading the published results…</Notice></Page>;
  if (results.kind === 'error') return <Page title="Runs" headingRef={headingRef}><Notice testId="error-state">The published results cannot be read: {results.message}</Notice></Page>;
  const { official, pilots, officialError } = results;
  const runs = [...(official ? [official] : []), ...pilots];
  const task = params.get('task') ?? '';
  const label = params.get('label') ?? '';
  const open = params.get('trial');
  const tasks = [...new Set([...(official ? Object.keys(official.summary!.tasks) : []), ...runs.flatMap((r) => r.trials.map((t) => t.task))])].sort();
  const matches = (t: Trial) => (task === '' || t.task === task) && (label === '' || labelOf(t) === label);
  const total = runs.reduce((n, r) => n + r.trials.length + r.bad.length, 0);
  const shown = runs.reduce((n, r) => n + r.trials.filter(matches).length, 0);
  const scope = official ? (task === '' ? official.summary!.totals : official.summary!.tasks[task]) : undefined;
  return (
    <Page title="Runs" headingRef={headingRef} lead={official ? <>Official run <span className="font-medium text-ink">{official.runId}</span>, {official.summary!.totals.records} trial records.</> : 'No official run is published yet. The committed pilot runs are below; they are not counted in the results.'}>
      {officialError !== null && <Notice testId="error-state">{officialError}</Notice>}
      <Card title={official ? <span data-testid="runs-k-of-n">{task === '' ? 'All tasks' : task}: {scope?.passes ?? 0}/{scope?.trials ?? 0} pass</span> : 'How a trial is counted'}>
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
      </div>
      {official && <RunList run={official} matches={matches} open={open} />}
      {pilots.length > 0 && (
        <section className="space-y-3" data-testid="pilot-runs">
          <h2 className="pt-2 font-medium text-ink">Pilot runs (not counted in the results)</h2>
          {pilots.map((p) => <RunList key={p.runId} run={p} matches={matches} open={open} heading />)}
        </section>
      )}
      {runs.length === 0 && officialError === null && <Notice testId="empty-state">No runs are committed in this build. Tasks and Environment work with no key.</Notice>}
    </Page>
  );
}

function RunList({ run, matches, open, heading = false }: { run: RunData; matches: (t: Trial) => boolean; open: string | null; heading?: boolean }) {
  const shown = run.trials.filter(matches);
  return (
    <div className="space-y-2" data-testid="run" data-run={run.runId} data-official={String(run.official)}>
      {heading && <h3 className="text-ink-muted"><span className="font-medium text-ink">{run.runId}</span>: {run.trials.length + run.bad.length} trial records</h3>}
      {run.warnings.length > 0 && <Notice testId="data-warning">{run.warnings.join(' ')}</Notice>}
      <ul className="divide-y divide-line rounded-sm border border-line bg-surface" data-testid="trial-list">
        {run.bad.map((b) => <BadRow key={b.file} b={b} />)}
        {shown.map((t) => <TrialRow key={t.name} t={t} open={open === t.name} />)}
        {shown.length === 0 && run.bad.length === 0 && <li className="p-4 text-ink-muted">No trial matches these filters.</li>}
      </ul>
    </div>
  );
}

function BadRow({ b }: { b: BadRecord }) {
  return (
    <li data-testid="record-error" data-trial={b.name} className="border-l-2 border-l-danger px-4 py-2.5">
      <p className="flex flex-wrap items-center gap-x-2 font-medium text-ink"><CircleAlert aria-hidden className="h-3.5 w-3.5 text-danger" strokeWidth={1.75} />{b.name}: this record cannot be read</p>
      <p className="mt-1 break-words pl-5 text-ink-muted">{b.file}: {b.errors.join('; ')}</p>
    </li>
  );
}

function TrialRow({ t, open }: { t: Trial; open: boolean }) {
  const e = t.explanation;
  const Chevron = open ? ChevronDown : ChevronRight;
  const cost = t.record.cost_usd + (t.record.judge_cost_usd ?? 0);
  return (
    <li data-testid="trial-row" data-trial={t.name} data-outcome={e.outcome} className="px-4 py-2.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <button type="button" aria-expanded={open} onClick={() => navigate({ trial: open ? null : t.name })} className="inline-flex min-h-6 min-w-0 items-center gap-1 break-all rounded-sm text-left font-medium text-ink hover:underline">
          <Chevron aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
          {t.name}
        </button>
        <OutcomeChip outcome={e.outcome} fault={e.fault} />
        {e.outcome !== 'PASS' && <FaultLabel e={e} />}
        {e.decisive_check && <code data-testid="decisive" className="break-all rounded-sm bg-canvas px-1 text-xs text-ink">{e.decisive_check.id}</code>}
        <span className="ml-auto text-xs text-ink-muted" title="Agent and judge cost">${cost.toFixed(2)}</span>
      </div>
      {e.outcome !== 'PASS' && <p data-testid="reason" className="mt-1 break-words pl-5 text-ink-muted">{e.reason}</p>}
      {open && <TrialDetail t={t} />}
    </li>
  );
}

function TrialDetail({ t }: { t: Trial }) {
  const e = t.explanation;
  const [showAll, setShowAll] = useState(false);
  return (
    <div data-testid="trial-detail" className="mt-2 min-w-0 space-y-2 border-l-2 border-line pl-4">
      <dl className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)] [&_dd]:min-w-0 [&_dd]:break-words">
        <dt className="text-ink-muted">Fault</dt><dd>{e.fault ?? 'none'}{e.deciding ? ` (${e.deciding.id}: ${e.deciding.evidence})` : ''}</dd>
        <dt className="text-ink-muted">Confirmation</dt><dd>{e.confirmation ?? 'n/a'}</dd>
        <dt className="text-ink-muted">Audit</dt><dd>{e.audited ? `audited, label ${e.audit_label ?? 'none'}` : 'not human-audited'}</dd>
        {e.decisive_check && <><dt className="text-ink-muted">Decisive check</dt><dd>{e.decisive_check.id}: expected {e.decisive_check.expected}, found {e.decisive_check.found}</dd></>}
        {e.taxonomy && <><dt className="text-ink-muted">Kind</dt><dd>{e.taxonomy.replace(/_/g, ' ')}</dd></>}
        <dt className="text-ink-muted">Criteria</dt><dd>{e.criteria.map(formatCriterion).join(', ')}</dd>
        {e.notes.length > 0 && <><dt className="text-ink-muted">Notes</dt><dd>{e.notes.map((n) => `${n.id}: ${n.evidence}`).join('; ')}</dd></>}
        <dt className="text-ink-muted">Cost</dt><dd>agent ${t.record.cost_usd.toFixed(2)}, judge ${(t.record.judge_cost_usd ?? 0).toFixed(2)}</dd>
        <dt className="text-ink-muted">State hash</dt><dd className="break-all font-mono text-xs">{t.record.state_hash.initial ?? 'none'} → {t.record.state_hash.final ?? 'none'}</dd>
      </dl>
      <div className="flex flex-wrap gap-3">
        {t.trajectoryUrl && <a className="text-ink underline decoration-line-strong underline-offset-2" href={t.trajectoryUrl}>Trajectory (JSONL)</a>}
        <button type="button" className="text-ink underline decoration-line-strong underline-offset-2" onClick={() => setShowAll(!showAll)}>{showAll ? 'Hide' : 'Show'} every check</button>
      </div>
      {showAll && (
        <ul className="space-y-0.5 text-xs">
          {(t.record.checks ?? []).map((c) => <li key={c.id} className="break-words"><code>{c.id}</code>: {c.met === true ? 'met' : c.met === false ? 'not met' : String(c.met)}</li>)}
        </ul>
      )}
    </div>
  );
}
