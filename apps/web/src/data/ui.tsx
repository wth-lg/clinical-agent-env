// Parts the browse views share: the page frame, cards, the outcome chip and swatch, the Wilson
// interval row, and a fault label with its one-click link to the glossary. A trial's mark says
// its outcome and whose fault it is, in the stone neutrals and the one accent (tokens.css allows
// no other colour), so the marks differ by fill and pattern: PASS filled accent, a model FAIL
// filled ink, a LIMIT filled muted, a REFUSAL an ink outline, an environment fault hatched, a
// grader fault dotted, infrastructure a dashed outline. Every mark carries its name as text, and
// the legend is drawn from the same marks, so it reads right in light and dark.
import { Check, CircleHelp, Copy } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { NOT_AUDITED_MARKER, type Explanation } from '../../../../packages/core/explain.ts';
import { blocksTheRun, isFalsePass, shownLabel } from './failures.ts';
import { DENOMINATOR_RULE, FAULT, isValid, OUTCOMES, PASS_DEFINITION, RERUN_OUTCOMES, VALID_OUTCOMES, type Fault, type Outcome } from '../../../../packages/core/outcomes.ts';
import type { Interval } from '../../../../packages/core/summary.ts';
import { hrefWith, onNav } from './url.ts';
import type { HarmItem } from './harm.ts';

export function Page({ title, headingRef, lead, children }: { title: string; headingRef?: Ref<HTMLHeadingElement> | undefined; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 ref={headingRef} tabIndex={-1} className="text-base font-semibold text-ink focus-visible:outline-none">{title}</h1>
      {lead !== undefined && <div className="mt-1 text-ink-muted">{lead}</div>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Card({ title, children, actions, id, testId }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; id?: string; testId?: string }) {
  return (
    <div id={id} data-testid={testId} className="rounded-sm border border-line bg-surface">
      {(title !== undefined || actions !== undefined) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="min-w-0 break-words font-medium text-ink">{title}</h2>
          {actions}
        </div>
      )}
      <div className="min-w-0 break-words p-4">{children}</div>
    </div>
  );
}

// An error (testId error-state) gets the danger border, as the key gate's errors do.
export function Notice({ children, testId }: { children: ReactNode; testId?: string }) {
  const tone = testId === 'error-state' ? 'border-danger' : 'border-line';
  return <p data-testid={testId} className={`break-words rounded-sm border ${tone} bg-surface p-4 text-ink-muted`}>{children}</p>;
}

export const NO_RESULTS = 'No results are published yet.';

export type Mark = 'pass' | 'model' | 'limit' | 'refusal' | 'environment' | 'grader' | 'infra';

export const MARKS: ReadonlyArray<{ mark: Mark; label: string }> = [
  { mark: 'pass', label: 'PASS' },
  { mark: 'model', label: 'model failure (FAIL)' },
  { mark: 'limit', label: 'model: stopped at a limit (LIMIT)' },
  { mark: 'refusal', label: 'model: refused (REFUSAL)' },
  { mark: 'environment', label: 'environment fault' },
  { mark: 'grader', label: 'grader fault' },
  { mark: 'infra', label: 'infrastructure fault, rerun, not counted' },
];
export const markLabel = (m: Mark) => MARKS.find((x) => x.mark === m)!.label;

// The mark of a trial from its outcome and the fault explainTrial gives it; with no explanation
// (a count by outcome), the fault packages/core/outcomes.ts FAULT gives the outcome.
export function markOf(outcome: string, fault: Fault | null = FAULT[outcome as Outcome] ?? null): Mark {
  // A false PASS (GR5) is the grader's fault: it takes the grader mark, not the pass accent.
  if (outcome === 'PASS') return fault === 'grader' ? 'grader' : 'pass';
  if (fault === 'env') return 'environment';
  if (fault === 'grader') return 'grader';
  if (fault === 'infra' || (fault === null && !isValid(outcome))) return 'infra';
  if (fault === 'refusal' || outcome === 'REFUSAL') return 'refusal';
  return outcome === 'LIMIT' ? 'limit' : 'model';
}

const MARK_CLASS: Record<Mark, string> = {
  pass: 'bg-accent',
  model: 'bg-ink',
  limit: 'bg-ink-muted',
  refusal: 'border-2 border-ink bg-surface',
  // Environment and grader faults take the danger tone (pre-audit S5, P17j JU2): a trial the run
  // cannot count; the pattern stays, so the mark does not rest on colour alone.
  environment: 'border border-danger bg-surface',
  grader: 'border border-danger bg-surface',
  infra: 'border border-dashed border-line-strong bg-surface',
};
const MARK_STYLE: Partial<Record<Mark, CSSProperties>> = {
  environment: { backgroundImage: 'repeating-linear-gradient(135deg, var(--color-danger) 0 1.5px, transparent 1.5px 4px)' },
  grader: { backgroundImage: 'radial-gradient(var(--color-danger) 0.9px, transparent 1.2px)', backgroundSize: '4px 4px' },
};
export const markProps = (m: Mark, className = ''): { className: string; style?: CSSProperties } => ({ className: `${MARK_CLASS[m]} ${className}`, ...(MARK_STYLE[m] ? { style: MARK_STYLE[m] } : {}) });

export function Swatch({ mark, title, outcome }: { mark: Mark; title: string; outcome: string }) {
  return <span role="img" aria-label={title} title={title} data-outcome={outcome} data-mark={mark} {...markProps(mark, 'inline-block h-3 w-3 shrink-0 rounded-[2px]')} />;
}

export function MarkLegend({ marks = MARKS.map((x) => x.mark) }: { marks?: readonly Mark[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Legend" data-testid="legend">
      {MARKS.filter((x) => marks.includes(x.mark)).map((x) => (
        <li key={x.mark} className="inline-flex items-center gap-1.5" data-mark={x.mark}>
          <span aria-hidden {...markProps(x.mark, 'inline-block h-3 w-3 rounded-[2px]')} />
          {x.label}
        </li>
      ))}
    </ul>
  );
}

// The outcome chip; an environment or grader fault takes the danger border (JU2).
export const BLOCKING_MARKS: readonly Mark[] = ['environment', 'grader'];
export function OutcomeChip({ outcome, fault }: { outcome: string; fault?: Fault | null }) {
  const mark = markOf(outcome, fault);
  return (
    <span data-testid="outcome" data-mark={mark} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs font-medium text-ink ${BLOCKING_MARKS.includes(mark) ? 'border-danger' : 'border-line'}`}>
      <span aria-hidden {...markProps(mark, 'inline-block h-2.5 w-2.5 rounded-[2px]')} />
      {outcome}
    </span>
  );
}

// A PASS with harm, in the danger colour, beside its outcome chip (pre-audit B2b, P17j JU3):
// "PASS with harm: <item> (<points>)" for a met harm item, "PASS, harm unknown: <item>" for one the
// judge could not answer; nothing on a PASS without harm.
// An item by its id, with its question when the page knows it (verifier JU3-1 F5).
const named = (x: HarmItem) => (x.text ? `${x.id}, ${x.text.length > 90 ? `${x.text.slice(0, 87).trimEnd()}…` : x.text}` : x.id);
export function HarmChip({ items }: { items: readonly HarmItem[] }) {
  const met = items.filter((x) => !x.unknown);
  const unknown = items.filter((x) => x.unknown);
  const chip = 'inline-flex items-center rounded-sm border border-danger px-1.5 py-0.5 text-xs font-medium text-danger break-words';
  return (
    <>
      {met.length > 0 && <span data-testid="harm-chip" data-harm="met" className={chip}>PASS with harm: {met.map((x) => `${named(x)} (${x.points})`).join(', ')}</span>}
      {unknown.length > 0 && <span data-testid="harm-chip" data-harm="unknown" className={chip}>PASS, harm unknown: {unknown.map(named).join(', ')}</span>}
    </>
  );
}

const TO_GLOSSARY = { view: 'glossary', task: null, label: null, trial: null };
// The note beside the label (data/failures.ts blocksTheRun decides whether the trial blocks the
// run). notCountedShown: the surrounding view already says "Not counted" (the trial header's plain
// reason for an excluded trial), so the note gives only the rest and the header has one "Not
// counted" sentence (F3). Only an official run is blocked; a counted trial that blocks it (a valid
// failure labelled environment or grader, a run block such as B1) is not "not counted"; a pilot's
// GRADER_ERROR is a grader bug fixed before the final run; an excluded environment error is run
// again and blocks nothing (decisions.tsv 2026-10-29T17:30 and 19:10).
const GRADER_BUG_NOTE = 'A grader bug; it is fixed and regraded before the final run.';
function faultNote(e: Explanation, official: boolean, notCountedShown: boolean): string | null {
  const notCounted = (rest: string) => (notCountedShown ? rest : `Not counted. ${rest}`);
  if (blocksTheRun(e) && official) return !e.valid || isFalsePass(e) ? notCounted('The run is blocked until this is fixed.') : 'The run is blocked until this is fixed.';
  if (!e.valid && e.outcome === 'GRADER_ERROR') return notCounted(GRADER_BUG_NOTE);
  // A pilot trial the official run would be blocked by: a pilot is not counted (decisions.tsv 21:00).
  if (blocksTheRun(e) && !official) return 'A pilot is not counted in the final pass rate.';
  if (!e.valid && e.fault === 'env') return notCountedShown ? 'It is run again.' : 'Not counted; it is run again.';
  return null;
}
// The glossary, at a section (fault-<fault>, fault-labels, criterion-<id>, taxonomy, confirmation) when given.
export const glossaryHref = (anchor?: string) => `${hrefWith(TO_GLOSSARY).replace(/#.*$/, '')}${anchor ? `#${anchor}` : ''}`;

// One click to the glossary; with an anchor, the view scrolls to that section once it renders.
function toGlossary(anchor: string | undefined) {
  const go = onNav(TO_GLOSSARY);
  return (e: Parameters<typeof go>[0]) => {
    go(e);
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || anchor === undefined) return;
    history.replaceState(null, '', glossaryHref(anchor));
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' })));
  };
}

const LINK = 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';

export function GlossaryLink({ children, className, anchor }: { children: ReactNode; className?: string; anchor?: string }) {
  return (
    <a href={glossaryHref(anchor)} onClick={toGlossary(anchor)} className={className ?? LINK}>
      {children}
    </a>
  );
}

// A 64-hex state hash, shortened to its first 8 and last 4 characters, with the full value in the
// title and data-hash and a button that copies it.
export function Hash({ value, testId }: { value: string | null; testId?: string }) {
  const [copied, setCopied] = useState(false);
  if (value === null) return <span data-testid={testId}>none</span>;
  const copy = () => void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => setCopied(false));
  return (
    <span data-testid={testId} data-hash={value} className="inline-flex items-center gap-1 align-middle">
      <code className="font-mono text-xs" title={value}>{value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value}</code>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the full hash'} title={copied ? 'Copied' : 'Copy the full hash'} className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-ink-muted hover:bg-canvas hover:text-ink">
        {copied ? <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Copy aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />}
      </button>
    </span>
  );
}

// Text with each 64-hex hash in it shortened, with its copy control (Hash).
export function HashText({ text }: { text: string }) {
  return <>{text.split(/\b([0-9a-f]{64})\b/).map((part, i) => (i % 2 === 1 ? <Hash key={i} value={part} /> : part))}</>;
}

// The label explainTrial gives a trial, as the Runs list and the trial header show it: an excluded
// INFRA trial has no label and says it is rerun; a refusal shows model with its subtype; a trial
// with no audit row carries the not-audited marker. Each one, infra too, has a help icon that
// opens the glossary at its fault.
// The label and its help icon never wrap apart (verifier-phase-P16-2: at 390 px the infra icon
// sat on a line of its own).
// official: the trial is of the official run, the only run a trial can block (decisions.tsv 19:10).
export function FaultLabel({ e, notCountedShown = false, official = false }: { e: Explanation; notCountedShown?: boolean; official?: boolean }) {
  const label = shownLabel(e);
  if (e.fault === null || (e.fault !== 'infra' && label === null)) return null;
  const name = e.fault === 'infra' ? 'infra' : label!;
  // The audit's environment or grader label on a model fault links to that label's definition.
  const anchor = label === 'environment' ? 'env' : label === 'grader' ? 'grader' : e.fault;
  const help = (
    <a href={glossaryHref(`fault-${anchor}`)} onClick={toGlossary(`fault-${anchor}`)} aria-label={`How the ${name} label is given`} title="How failures are attributed" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-canvas hover:text-ink">
      <CircleHelp aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
    </a>
  );
  if (e.fault === 'infra') {
    return <span className="inline-flex items-center gap-x-1"><span data-testid="label" data-label="infra" className="text-ink-muted">infra: rerun, not counted</span>{help}</span>;
  }
  // An environment or grader label takes the danger tone and says what it means for the run (JU2);
  // a model label stays neutral.
  const danger = label === 'environment' || label === 'grader';
  const note = faultNote(e, official, notCountedShown);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className="inline-flex items-center gap-x-1">
        <span data-testid="label" data-label={label} className={`font-medium ${danger ? 'text-danger' : 'text-ink'}`}>
          {label}
          {label === e.label && e.label_subtype ? ` (${e.label_subtype})` : ''}
        </span>
        {help}
      </span>
      {note !== null && <span data-testid="fault-note" className={`text-xs ${(blocksTheRun(e) && official) || e.outcome === 'GRADER_ERROR' ? 'text-danger' : 'text-ink-muted'}`}>{note}</span>}
      {!e.audited && <span data-testid="not-audited" className="rounded-sm border border-dashed border-line-strong px-1 text-xs text-ink-muted">{NOT_AUDITED_MARKER}</span>}
    </span>
  );
}

export const counts = (outcome: string) => isValid(outcome);

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
export const formatInterval = (w: Interval | null) => (w === null ? 'no valid trials' : `${pct(w.lo)} to ${pct(w.hi)}`);

// One task's pass rate on a 0-100% axis: the band (shaded), the Wilson 95% interval (whisker)
// and the rate (dot).
export function IntervalRow({ rate, interval, band, label }: { rate: number | null; interval: Interval | null; band: readonly [number, number]; label: string }) {
  const x = (v: number) => 4 + v * 192;
  return (
    <svg data-testid="interval" viewBox="0 0 200 16" className="block h-auto w-full min-w-24 max-w-72" role="img" aria-label={`${label}: ${rate === null ? 'no rate' : pct(rate)}, 95% interval ${formatInterval(interval)}`}>
      <rect data-testid="band" x={x(band[0])} y={1} width={x(band[1]) - x(band[0])} height={14} className="fill-line-strong" fillOpacity={0.22} />
      <line x1={x(0)} x2={x(1)} y1={8} y2={8} className="stroke-line-strong" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      {interval !== null && (
        <>
          <line data-testid="whisker" data-lo={interval.lo} data-hi={interval.hi} x1={x(interval.lo)} x2={x(interval.hi)} y1={8} y2={8} className="stroke-ink" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <line x1={x(interval.lo)} x2={x(interval.lo)} y1={4} y2={12} className="stroke-ink" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <line x1={x(interval.hi)} x2={x(interval.hi)} y1={4} y2={12} className="stroke-ink" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </>
      )}
      {rate !== null && <circle cx={x(rate)} cy={8} r={3.5} className="fill-accent stroke-surface" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

const NOT_RERUN = OUTCOMES.filter((o) => !isValid(o) && !RERUN_OUTCOMES.includes(o));

// The pass and denominator rules in plain words, the outcome lists read from outcomes.ts, then the
// exact rule (PASS_DEFINITION and DENOMINATOR_RULE, with their code names) behind "Exact rule".
export function PlainRules({ ids }: { ids: { pass: string; denominator: string } }) {
  return (
    <div className="space-y-1.5 text-ink-muted" data-testid="plain-rules">
      <p><span className="font-medium text-ink">Pass: </span>a trial passes only when it meets every gate check.</p>
      <p><span className="font-medium text-ink">Counted: </span>{VALID_OUTCOMES.join(', ')}. A refusal counts as a model failure.</p>
      <p><span className="font-medium text-ink">Not counted: </span>{RERUN_OUTCOMES.join(', ')} (run again){NOT_RERUN.length > 0 ? `, and ${NOT_RERUN.join(', ')} (not run again: the grader must be fixed first)` : ''}.</p>
      <details className="text-xs">
        <summary className="cursor-pointer">Exact rule, with the names the code uses</summary>
        <p className="mt-1 break-words" data-testid={ids.pass}>{PASS_DEFINITION}</p>
        <p className="mt-1 break-words" data-testid={ids.denominator}>{DENOMINATOR_RULE}</p>
      </details>
    </div>
  );
}
