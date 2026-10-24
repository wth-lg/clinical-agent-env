// Runs: the official run's trials, failure reasons first. Every non-pass row shows, with no
// click, its outcome, the attribution label (packages/core/outcomes.ts AUDIT_LABEL of the fault
// explainTrial decides), the decisive failing check, the one-line reason and, with no audit row,
// the not-audited marker; all of it is packages/core/explain.ts explainTrial, never re-derived
// here. The header shows k/N with PASS_DEFINITION and DENOMINATOR_RULE. Filters (task, label)
// and the open trial live in the URL.
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type Ref } from 'react';
import { formatCriterion } from '../../../../packages/core/explain.ts';
import { AUDIT_LABELS, DENOMINATOR_RULE, PASS_DEFINITION } from '../../../../packages/core/outcomes.ts';
import { useResults, type Trial } from '../data/results.ts';
import { Card, FaultLabel, GlossaryLink, NO_RESULTS, Notice, OutcomeChip, Page } from '../data/ui.tsx';
import { navigate, useParams } from '../data/url.ts';

// The label filter's values: every AUDIT_LABEL name, then excluded (INFRA) and pass.
const labelOf = (t: Trial) => (t.explanation.outcome === 'PASS' ? 'pass' : t.explanation.fault === 'infra' ? 'infra' : (t.explanation.label ?? 'none'));

export function Runs({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const results = useResults();
  const params = useParams();
  if (results === null) return <Page title="Runs" headingRef={headingRef}><Notice>Loading the published results…</Notice></Page>;
  if (results.kind === 'empty') return <Page title="Runs" headingRef={headingRef}><Notice testId="empty-state">{NO_RESULTS} Runs you start with a key show here once live runs are available in the app.</Notice></Page>;
  if (results.kind === 'error') return <Page title="Runs" headingRef={headingRef}><Notice testId="error-state">The published results cannot be read: {results.message}</Notice></Page>;
  const { trials, summary, runId } = results.run;
  const task = params.get('task') ?? '';
  const label = params.get('label') ?? '';
  const open = params.get('trial');
  const shown = trials.filter((t) => (task === '' || t.task === task) && (label === '' || labelOf(t) === label));
  const scope = task === '' ? summary.totals : summary.tasks[task];
  const select = 'h-8 rounded-sm border border-line-strong bg-surface px-2 text-ink';
  return (
    <Page title="Runs" headingRef={headingRef} lead={<>Official run <span className="font-medium text-ink">{runId}</span>, {summary.totals.records} trial records.</>}>
      <Card title={<span data-testid="runs-k-of-n">{task === '' ? 'All tasks' : task}: {scope?.passes ?? 0}/{scope?.trials ?? 0} pass</span>}>
        <dl className="space-y-2 text-ink-muted">
          <div><dt className="inline font-medium text-ink">Pass: </dt><dd className="inline" data-testid="pass-definition">{PASS_DEFINITION}</dd></div>
          <div><dt className="inline font-medium text-ink">Denominator: </dt><dd className="inline" data-testid="denominator-rule">{DENOMINATOR_RULE}</dd></div>
        </dl>
        <p className="mt-2"><GlossaryLink>How failures are attributed</GlossaryLink></p>
      </Card>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Task
          <select aria-label="Task" className={select} value={task} onChange={(e) => navigate({ task: e.target.value, trial: null })}>
            <option value="">All tasks</option>
            {Object.keys(summary.tasks).map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Label
          <select aria-label="Label" className={select} value={label} onChange={(e) => navigate({ label: e.target.value, trial: null })}>
            <option value="">All labels</option>
            {AUDIT_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
            <option value="infra">infra (rerun, not counted)</option>
            <option value="pass">pass</option>
          </select>
        </label>
        <span className="pb-1.5 text-xs text-ink-muted" data-testid="shown-count">{shown.length} of {trials.length} trials</span>
      </div>
      <ul className="divide-y divide-line rounded-sm border border-line bg-surface" data-testid="trial-list">
        {shown.map((t) => <TrialRow key={t.name} t={t} open={open === t.name} />)}
        {shown.length === 0 && <li className="p-4 text-ink-muted">No trial matches these filters.</li>}
      </ul>
    </Page>
  );
}

function TrialRow({ t, open }: { t: Trial; open: boolean }) {
  const e = t.explanation;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li data-testid="trial-row" data-trial={t.name} data-outcome={e.outcome} className="px-4 py-2.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <button type="button" aria-expanded={open} onClick={() => navigate({ trial: open ? null : t.name })} className="inline-flex min-h-6 items-center gap-1 rounded-sm font-medium text-ink hover:underline">
          <Chevron aria-hidden className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} />
          {t.name}
        </button>
        <OutcomeChip outcome={e.outcome} />
        {e.outcome !== 'PASS' && <FaultLabel e={e} />}
        {e.decisive_check && <code data-testid="decisive" className="rounded-sm bg-canvas px-1 text-xs text-ink">{e.decisive_check.id}</code>}
        <span className="ml-auto text-xs text-ink-muted">${t.record.cost_usd.toFixed(2)}</span>
      </div>
      {e.outcome !== 'PASS' && <p data-testid="reason" className="mt-1 pl-5 text-ink-muted">{e.reason}</p>}
      {open && <TrialDetail t={t} />}
    </li>
  );
}

function TrialDetail({ t }: { t: Trial }) {
  const e = t.explanation;
  const [showAll, setShowAll] = useState(false);
  return (
    <div data-testid="trial-detail" className="mt-2 space-y-2 border-l-2 border-line pl-4">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
        <dt className="text-ink-muted">Fault</dt><dd>{e.fault ?? 'none'}{e.deciding ? ` (${e.deciding.id}: ${e.deciding.evidence})` : ''}</dd>
        <dt className="text-ink-muted">Confirmation</dt><dd>{e.confirmation ?? 'n/a'}</dd>
        <dt className="text-ink-muted">Audit</dt><dd>{e.audited ? `audited, label ${e.audit_label ?? 'none'}` : 'not human-audited'}</dd>
        {e.decisive_check && <><dt className="text-ink-muted">Decisive check</dt><dd>{e.decisive_check.id}: expected {e.decisive_check.expected}, found {e.decisive_check.found}</dd></>}
        {e.taxonomy && <><dt className="text-ink-muted">Taxonomy</dt><dd>{e.taxonomy.replace(/_/g, ' ')}</dd></>}
        <dt className="text-ink-muted">Criteria</dt><dd>{e.criteria.map(formatCriterion).join(', ')}</dd>
        {e.notes.length > 0 && <><dt className="text-ink-muted">Notes</dt><dd>{e.notes.map((n) => `${n.id}: ${n.evidence}`).join('; ')}</dd></>}
        <dt className="text-ink-muted">State hash</dt><dd className="break-all font-mono text-xs">{t.record.state_hash.initial ?? 'none'} → {t.record.state_hash.final ?? 'none'}</dd>
      </dl>
      <div className="flex flex-wrap gap-3">
        {t.trajectoryUrl && <a className="text-ink underline decoration-line-strong underline-offset-2" href={t.trajectoryUrl}>Trajectory (JSONL)</a>}
        <button type="button" className="text-ink underline decoration-line-strong underline-offset-2" onClick={() => setShowAll(!showAll)}>{showAll ? 'Hide' : 'Show'} every check</button>
      </div>
      {showAll && (
        <ul className="space-y-0.5 text-xs">
          {(t.record.checks ?? []).map((c) => <li key={c.id}><code>{c.id}</code>: {String(c.met)}</li>)}
        </ul>
      )}
    </div>
  );
}
