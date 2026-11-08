// Why tasks fail, on screen (plan P17j JU7): the kind bar, the top failed checks, the fault box and
// the run-blocked notice that Findings and Overview show, and the Runs links they open. Counts read
// summary.json (fault_counts, top_failed_checks); the M1-M4 count and the block read the
// explanations (data/failures.ts).
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { FAILURE_LABELS, type FailedCheckCount, type FaultCounts } from '../../../../packages/core/summary.ts';
import type { Explanation } from '../../../../packages/core/explain.ts';
import { isFalsePass, kindWords, type FailureLabel, type RunBlock } from '../data/failures.ts';
import { GlossaryLink, markProps } from '../data/ui.tsx';
import { FAULT_BY } from '../trial/headline.ts';
import { hrefWith, onNav } from '../data/url.ts';
import { confirmation, kindSegments } from './counts.ts';

const link = 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';
// A Runs link: the official run's list, filtered; the other filters cleared.
const runsWith = (patch: Record<string, string | null>) => ({ view: 'runs', run: null, trial: null, tab: null, label: null, check: null, audit: null, ...patch });
export const RunsLink = ({ patch, children, label }: { patch: Record<string, string | null>; children: ReactNode; label?: string }) => (
  <a href={hrefWith(runsWith(patch))} onClick={onNav(runsWith(patch))} aria-label={label} className={link}>{children}</a>
);

// One task's failures by kind, drawn to scale (P25u V3): the bar's length is the failures over
// the task's valid trials (counts.ts kindSegments), the rest of the track the page colour, so a
// task with 15 failures of 20 draws three quarters and one with none draws nothing. The segments
// are in FAILURE_KINDS order in the model mark (ink; copy rule C8: never the LIMIT tone), with a
// surface gap between them, and the kinds are named in the same order below, so no kind rests on
// colour. trials: the task's valid trials (summary.json trials).
export function KindBar({ task, fc, trials }: { task: string; fc: FaultCounts; trials: number }) {
  const { track, segments } = kindSegments(fc, trials);
  const named = segments.map((s) => `${kindWords(s.kind)} ${s.count}`).join(', ');
  const words = fc.failures === 0 ? 'No failures' : `${fc.failures} of ${trials} trials failed: ${named}`;
  return (
    <div className="min-w-0">
      <span data-testid="kind-bar" data-task={task} data-total={fc.failures} data-track={track} role="img" aria-label={`${task}: ${words}`} className="block h-3 max-w-72 overflow-hidden rounded-[2px] bg-canvas">
        <span className="flex h-full gap-[2px]" style={{ width: `${track}%` }}>
          {segments.map((s) => <span key={s.kind} data-kind={s.kind} data-count={s.count} data-mark="model" title={`${kindWords(s.kind)}: ${s.count}`} {...markProps('model', 'h-full first:rounded-l-[2px] last:rounded-r-[2px]')} style={{ ...markProps('model').style, width: `${s.width}%` }} />)}
        </span>
      </span>
      <p className="mt-0.5 text-xs text-ink-muted" data-testid="kind-names">{words}</p>
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
          <span className="ml-1.5 text-ink-muted">decided <span data-testid="top-check-count">{c.count}</span> failed trial{c.count === 1 ? '' : 's'}</span>
          <span className="block text-xs text-ink-muted" data-testid="top-check-text">{textOf(c.check) ?? 'no check text'}</span>
        </li>
      ))}
    </ol>
  );
}

const LABEL_WORDS: Record<FailureLabel, string> = { model: 'model', environment: 'environment', grader: 'grader', unlabelled: 'not yet audited' };

// The fault box: the valid failures by label (each a Runs link to those trials) under "Whose
// fault, as the record decides and the audit (LLM sessions in this run) confirms" (copy rule C4:
// never a bare label as a verdict; headline.ts FAULT_BY says who decides and who audited,
// eval-p25u-1 defect 1 and eval-p25u-2 S11), then the one
// confirmation phrase of every screen (copy rule C5, P25u J8c): "Confirmed by the record (M1–M4)
// and the audit (M5)", with the record's count and "audit agrees: n of N" (counts.ts
// confirmation), and the infra re-runs. task 'all' sums the tasks; its links are not filtered
// by task.
export function FaultBox({ task, fcs, explanations }: { task: string; fcs: readonly FaultCounts[]; explanations: readonly Explanation[] }) {
  const labels = fcs.every((f) => f.label !== null);
  const sum = (l: FailureLabel) => fcs.reduce((n, f) => n + (f.label?.[l] ?? 0), 0);
  const reruns = fcs.reduce((n, f) => n + f.infra_reruns, 0);
  const c = confirmation(explanations);
  // The false PASSes (GR5) are the grader's fault too: named beside the grader count, as
  // audit-check's line gives "grader N (k false PASS)" (decisions.tsv 2026-10-29T21:00).
  const falsePasses = explanations.filter(isFalsePass).length;
  const scope = task === 'all' ? null : task;
  const n = `${c.failures} failure${c.failures === 1 ? '' : 's'}`;
  return (
    <div data-testid="fault-box" data-task={task} className="space-y-1 text-sm">
      {labels ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-ink-muted">Whose fault, {FAULT_BY}:</span>
          {FAILURE_LABELS.map((l) => (
            <span key={l} data-testid="fault-label-count" data-label={l} data-count={sum(l)}>
              {sum(l) > 0 ? <RunsLink patch={{ task: scope, audit: l }}>{LABEL_WORDS[l]} {sum(l)}</RunsLink> : <span className="text-ink-muted">{LABEL_WORDS[l]} 0</span>}
              {l === 'grader' && falsePasses > 0 && <> <span data-testid="fault-false-pass" data-count={falsePasses} className="text-danger">({falsePasses} false PASS)</span></>}
            </span>
          ))}
        </p>
      ) : <p className="text-ink-muted">No audit is published, so the failures have no fault labels yet.</p>}
      <p className="text-xs text-ink-muted">
        <GlossaryLink anchor="confirmation">Confirmed by the record (M1–M4) and the audit (M5)</GlossaryLink>:{' '}
        <span data-testid="m1-m4" data-met={c.record} data-failures={c.failures}>the record confirms {c.record} of {n}</span>,{' '}
        <span data-testid="m5" data-agrees={c.audit} data-failures={c.failures}>audit agrees: {c.audit} of {c.failures}</span>.{' '}
        <Reruns count={reruns} />
      </p>
    </div>
  );
}

// Beside "0 grader" on Overview and Runs (eval-p25u-2 S10): the grader faults found after the run
// were fixed before the final grade, so the count is 0 after the fix, not because none was found.
// The official run's regraded trials are counted apart from a superseded version's, which are not
// counted (verifier-phase-P25u-decisive-1 claim 2). The trial counts, names and graders come from
// the records (counts.ts regradeFigures). The fault counts are not in the records: they are the
// writeup's ("Three grader faults came out of clinical reads of the final run", docs/findings.md),
// R41's two in crc-care-gap v1 and R48's one in message-queue (results/tasks-final.json regrades),
// so GRADER_FAULTS_FIXED and SUPERSEDED_FAULTS hold them. Shown only when a regrade fixed a trial;
// the callers show it only beside a grader count of 0. href: the writeup's "How failures are
// attributed", null when the build has no writeup.
export const GRADER_FAULTS_FIXED = 'three';
export const SUPERSEDED_FAULTS = 'two';
export const WRITEUP_ATTRIBUTION = 'writeup.html#how-failures-are-attributed';
// Up to this many counted trials are named in the note; more are only counted.
const NAMED_MAX = 3;
type Fixes = { trials: number; graders: readonly string[]; names: readonly string[] };
export function GraderFixNote({ counted, superseded, href }: { counted: Fixes; superseded: ReadonlyArray<Fixes & { label: string }>; href: string | null }) {
  const old = superseded.filter((s) => s.trials > 0);
  const oldTrials = old.reduce((n, s) => n + s.trials, 0);
  if (counted.trials === 0 && oldTrials === 0) return null;
  // The regrade's grader version, not "fixed in grader N": R48 changed message-queue's grader with
  // no version bump, so its regrade is grader 22 like R41's (claim audit). A superseded version was
  // replaced by a changed version of its task, not by a rerun of the same one (R42).
  const oldGraders = [...new Set(old.flatMap((s) => s.graders))].sort();
  const plural = (n: number) => `${n} ${n === 1 ? 'trial' : 'trials'}`;
  const named = counted.names.length === counted.trials && counted.trials <= NAMED_MAX ? ` (${counted.names.join(', ')})` : '';
  return (
    // A span, so it can sit inside the Runs fault line's paragraph.
    <span data-testid="grader-fix-note" data-trials={counted.trials} data-superseded-trials={oldTrials} className="mt-1 block text-xs text-ink-muted">
      Why 0 grader: {GRADER_FAULTS_FIXED} grader faults were found in clinical reads and fixed in the grader, then the affected trials were regraded offline with no model call.{' '}
      {counted.trials > 0 ? <>In this run a regrade with grader {counted.graders.join(' and ')} moved {counted.trials} counted {counted.trials === 1 ? 'trial' : 'trials'}{named} from FAIL to PASS.</> : <>In this run the regrade moved no counted trial.</>}
      {old.length > 0 && <>{' '}The other {SUPERSEDED_FAULTS} faults were in {old.map((s) => s.label).join(' and ')}, where a regrade with grader {oldGraders.join(' and ')} moved {plural(oldTrials)} to PASS. {old.length === 1 ? 'That version was replaced by a changed version of the task, and only the changed version is counted.' : 'Those versions were replaced by changed versions of their tasks, and only the changed versions are counted.'}</>}
      {href !== null && <>{' '}<a href={href} className={link}>How failures are attributed</a></>}
    </span>
  );
}

// "2 trials ended by the infrastructure and run again." In the fault box, and on its own under a
// task with no failures but reruns (F3), so the count is never hidden.
export function Reruns({ count }: { count: number }) {
  return <><span data-testid="infra-reruns" data-count={count}>{count} trial{count === 1 ? '' : 's'} ended by the infrastructure and run again</span>.</>;
}

// The run is blocked (DENOMINATOR_RULE): it has no headline pass rate, so the views show no pass
// count, dot or Wilson interval for it (decisions.tsv 2026-10-29T16:00), only this: the blocking
// trials, each a link to it, and the false PASS count. block: data/failures.ts runBlock.
export function RunBlocked({ block, runId }: { block: RunBlock; runId: string }) {
  const fp = block.falsePasses > 0 ? `, ${block.falsePasses} false PASS` : '';
  const open = (name: string) => ({ view: 'runs', run: runId, trial: name, tab: null, task: null, label: null, check: null, audit: null });
  return (
    <div role="status" data-testid="run-blocked" className="flex flex-wrap items-start gap-x-2 rounded-sm border border-danger bg-surface p-3 text-ink">
      <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={1.75} />
      <div className="min-w-0 flex-1 space-y-1">
        <p>This run is blocked: {block.trials} {block.trials === 1 ? 'trial blocks' : 'trials block'} it{fp}. It has no pass rate until a fix, and a regrade or rerun disclosed in the changelog, resolves each one.</p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {block.names.map((n) => <a key={n} data-testid="blocking-trial" href={hrefWith(open(n))} onClick={onNav(open(n))} className={link}>{n}</a>)}
        </p>
      </div>
    </div>
  );
}
