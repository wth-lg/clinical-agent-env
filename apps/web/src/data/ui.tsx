// Parts the browse views share: the page frame, cards, the outcome chip and swatch, the Wilson
// interval row, and a fault label with its one-click link to the glossary. Outcomes are drawn in
// the stone neutrals and the one accent (tokens.css): PASS filled accent, FAIL filled ink,
// REFUSAL ink outline, LIMIT filled muted, an excluded outcome a dashed outline; every swatch
// and chip also carries its outcome as text.
import { CircleHelp } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { NOT_AUDITED_MARKER, type Explanation } from '../../../../packages/core/explain.ts';
import { isValid } from '../../../../packages/core/outcomes.ts';
import type { Interval } from '../../../../packages/core/summary.ts';
import { hrefWith, onNav } from './url.ts';

export function Page({ title, headingRef, lead, children }: { title: string; headingRef?: Ref<HTMLHeadingElement> | undefined; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 ref={headingRef} tabIndex={-1} className="text-base font-semibold text-ink focus-visible:outline-none">{title}</h1>
      {lead !== undefined && <div className="mt-1 text-ink-muted">{lead}</div>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Card({ title, children, actions, id }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div id={id} className="rounded-sm border border-line bg-surface">
      {(title !== undefined || actions !== undefined) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="font-medium text-ink">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Notice({ children, testId }: { children: ReactNode; testId?: string }) {
  return <p data-testid={testId} className="rounded-sm border border-line bg-surface p-4 text-ink-muted">{children}</p>;
}

export const NO_RESULTS = 'No results are published yet.';

export function swatchClass(outcome: string): string {
  if (outcome === 'PASS') return 'bg-accent';
  if (outcome === 'FAIL') return 'bg-ink';
  if (outcome === 'REFUSAL') return 'border-2 border-ink bg-surface';
  if (outcome === 'LIMIT') return 'bg-ink-muted';
  return 'border border-dashed border-line-strong bg-surface';
}

export function Swatch({ outcome, title }: { outcome: string; title: string }) {
  return <span role="img" aria-label={title} title={title} data-outcome={outcome} className={`inline-block h-3 w-3 shrink-0 rounded-[2px] ${swatchClass(outcome)}`} />;
}

export function OutcomeChip({ outcome }: { outcome: string }) {
  return (
    <span data-testid="outcome" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-line px-1.5 py-0.5 text-xs font-medium text-ink">
      <span aria-hidden className={`inline-block h-2 w-2 rounded-[2px] ${swatchClass(outcome)}`} />
      {outcome}
    </span>
  );
}

export const glossaryHref = () => hrefWith({ view: 'glossary', task: null, label: null, trial: null });

export function GlossaryLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <a href={glossaryHref()} onClick={onNav({ view: 'glossary', task: null, label: null, trial: null })} className={className ?? 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink'}>
      {children}
    </a>
  );
}

// The label explainTrial gives a trial, as the Runs list shows it: an excluded INFRA trial has no
// label and says it is rerun; a refusal shows model with its subtype; a trial with no audit row
// carries the not-audited marker. The help icon opens the glossary.
export function FaultLabel({ e }: { e: Explanation }) {
  if (e.fault === 'infra') return <span data-testid="label" data-label="infra" className="text-ink-muted">infra: rerun, not counted</span>;
  if (e.label === null) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span data-testid="label" data-label={e.label} className="font-medium text-ink">
        {e.label}
        {e.label_subtype ? ` (${e.label_subtype})` : ''}
      </span>
      <a href={glossaryHref()} onClick={onNav({ view: 'glossary', task: null, label: null, trial: null })} aria-label={`How the ${e.label} label is given`} title="How failures are attributed" className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-ink-muted hover:bg-canvas hover:text-ink">
        <CircleHelp aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
      </a>
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
      <rect data-testid="band" x={x(band[0])} y={1} width={x(band[1]) - x(band[0])} height={14} className="fill-line" />
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
