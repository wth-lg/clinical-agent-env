// Why tasks fail, on screen (plan P17j JU7): the kind bar, the top failed checks, the fault box and
// the run-blocked notice that Findings and Overview show, and the Runs links they open. Counts read
// summary.json (fault_counts, top_failed_checks); the M1-M4 count and the block read the
// explanations (data/failures.ts).
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { FAILURE_KINDS, FAILURE_LABELS, type FailedCheckCount, type FaultCounts } from '../../../../packages/core/summary.ts';
import type { Explanation } from '../../../../packages/core/explain.ts';
import { kindWords, m1m4, type FailureLabel } from '../data/failures.ts';
import { hrefWith, onNav } from '../data/url.ts';

const link = 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';
// A Runs link: the official run's list, filtered; the other filters cleared.
const runsWith = (patch: Record<string, string | null>) => ({ view: 'runs', run: null, trial: null, tab: null, label: null, check: null, audit: null, ...patch });
export const RunsLink = ({ patch, children, label }: { patch: Record<string, string | null>; children: ReactNode; label?: string }) => (
  <a href={hrefWith(runsWith(patch))} onClick={onNav(runsWith(patch))} aria-label={label} className={link}>{children}</a>
);

// One task's failures by kind: segments in FAILURE_KINDS order, one ink tone with a surface gap
// between them, and the kinds named in the same order below, so no kind rests on colour.
export function KindBar({ task, fc }: { task: string; fc: FaultCounts }) {
  const kinds = FAILURE_KINDS.filter((k) => fc.taxonomy[k] > 0);
  const named = kinds.map((k) => `${kindWords(k)} ${fc.taxonomy[k]}`).join(', ');
  return (
    <div className="min-w-0">
      <span data-testid="kind-bar" data-task={task} data-total={fc.failures} role="img" aria-label={`${task}: ${fc.failures === 0 ? 'no failures' : named}`} className="flex h-3 max-w-72 gap-[2px] overflow-hidden rounded-[2px] bg-canvas">
        {kinds.map((k) => <span key={k} data-kind={k} data-count={fc.taxonomy[k]} title={`${kindWords(k)}: ${fc.taxonomy[k]}`} className="h-full bg-ink-muted first:rounded-l-[2px] last:rounded-r-[2px]" style={{ width: `${(100 * fc.taxonomy[k]) / fc.failures}%` }} />)}
      </span>
      <p className="mt-0.5 text-xs text-ink-muted" data-testid="kind-names">{fc.failures === 0 ? 'no failures' : named}</p>
    </div>
  );
}

// A task's top failed checks: id, the check's text, count, and a Runs link to exactly those trials.
export function TopChecks({ task, top, textOf }: { task: string; top: readonly FailedCheckCount[]; textOf: (check: string) => string | null }) {
  if (top.length === 0) return <p className="text-xs text-ink-muted" data-testid="top-checks" data-task={task}>No failed check.</p>;
  return (
    <ol className="space-y-1" data-testid="top-checks" data-task={task}>
      {top.map((c) => (
        <li key={c.check} data-testid="top-check" data-check={c.check} className="min-w-0 break-words">
          <RunsLink patch={{ task, check: c.check }} label={`${c.count} trials whose decisive check is ${c.check}`}><code className="text-xs">{c.check}</code></RunsLink>
          <span className="ml-1.5 text-ink-muted">failed in <span data-testid="top-check-count">{c.count}</span></span>
          <span className="block text-xs text-ink-muted" data-testid="top-check-text">{textOf(c.check) ?? 'no check text'}</span>
        </li>
      ))}
    </ol>
  );
}

const LABEL_WORDS: Record<FailureLabel, string> = { model: 'model', environment: 'environment', grader: 'grader', unlabelled: 'not audited' };

// The fault box: the valid failures by audit label (each a Runs link to those trials), how many have
// M1-M4 all met, and the infra re-runs. task 'all' sums the tasks; its links are not filtered by task.
export function FaultBox({ task, fcs, explanations }: { task: string; fcs: readonly FaultCounts[]; explanations: readonly Explanation[] }) {
  const failures = fcs.reduce((n, f) => n + f.failures, 0);
  const labels = fcs.every((f) => f.label !== null);
  const sum = (l: FailureLabel) => fcs.reduce((n, f) => n + (f.label?.[l] ?? 0), 0);
  const reruns = fcs.reduce((n, f) => n + f.infra_reruns, 0);
  const m = m1m4(explanations);
  const scope = task === 'all' ? null : task;
  return (
    <div data-testid="fault-box" data-task={task} className="space-y-1 text-sm">
      {labels ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {FAILURE_LABELS.map((l) => (
            <li key={l} data-testid="fault-label-count" data-label={l} data-count={sum(l)}>
              {sum(l) > 0 ? <RunsLink patch={{ task: scope, audit: l }}>{LABEL_WORDS[l]} {sum(l)}</RunsLink> : <span className="text-ink-muted">{LABEL_WORDS[l]} 0</span>}
            </li>
          ))}
        </ul>
      ) : <p className="text-ink-muted">No audit is published, so the failures have no labels yet.</p>}
      <p className="text-xs text-ink-muted"><span data-testid="m1-m4">M1-M4 met on {m.met} of {m.failures} failures</span>; <span data-testid="infra-reruns" data-count={reruns}>{reruns} infra re-run{reruns === 1 ? '' : 's'}</span>{failures !== m.failures ? `; summary.json counts ${failures} failures` : ''}</p>
    </div>
  );
}

// The run is blocked (DENOMINATOR_RULE): it has no headline pass rate until each blocking trial is
// resolved. block: data/failures.ts runBlock.
export function RunBlocked({ block }: { block: { trials: number; falsePasses: number } }) {
  const fp = block.falsePasses > 0 ? `, ${block.falsePasses} false PASS` : '';
  return (
    <p role="status" data-testid="run-blocked" className="flex flex-wrap items-start gap-x-2 rounded-sm border border-danger bg-surface p-3 text-ink">
      <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        This run is blocked: {block.trials} {block.trials === 1 ? 'trial blocks' : 'trials block'} it{fp}. It has no headline pass rate until a fix and a regrade or rerun, disclosed in the changelog, resolve each one.{' '}
        <RunsLink patch={{}}>See the trials in Runs</RunsLink>.
      </span>
    </p>
  );
}
