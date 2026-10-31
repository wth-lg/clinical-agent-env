// Parts the browse views share: the page frame, cards, the outcome chip and swatch, the Wilson
// interval row, and a fault label with its one-click link to the glossary. A trial's mark says
// its outcome and whose fault it is, in the stone neutrals and the one accent (tokens.css allows
// no other colour), so the marks differ by fill and pattern: PASS filled accent, a model FAIL
// filled ink, a LIMIT filled muted, a REFUSAL an ink outline, an environment fault hatched, a
// grader fault dotted, infrastructure a dashed outline. Every mark carries its name as text, and
// the legend is drawn from the same marks, so it reads right in light and dark.
import { Check, CircleHelp, Copy, type LucideIcon } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { NOT_AUDITED_MARKER, type Explanation } from '../../../../packages/core/explain.ts';
import { blocksTheRun, shownLabel } from './failures.ts';
import { DENOMINATOR_RULE, isValid, PASS_DEFINITION, VALID_OUTCOMES, type Fault } from '../../../../packages/core/outcomes.ts';
import type { Interval } from '../../../../packages/core/summary.ts';
import { hrefWith, onNav } from './url.ts';
import type { HarmItem } from './harm.ts';
import { BLOCKING_MARKS, faultNote, MARKS, markOf, NOT_COUNTED_LINE, type Mark } from './marks.ts';

// The shared control classes (ui-polish 1.1). One BUTTON_PRIMARY per surface, for the action the
// surface is for; BUTTON for the others; BUTTON_QUIET for a small action that should not compete.
// Disabled is a dashed outline on the page colour, never opacity, so its text keeps its contrast.
const DISABLED = 'disabled:cursor-not-allowed disabled:border-dashed disabled:border-line disabled:bg-canvas disabled:text-ink-muted';
const CONTROL = `inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 font-medium ${DISABLED}`;
export const BUTTON = `${CONTROL} border-line-strong bg-surface text-ink hover:bg-canvas`;
export const BUTTON_PRIMARY = `${CONTROL} border-primary bg-primary text-on-primary hover:bg-primary/90`;
export const BUTTON_QUIET = `${CONTROL} border-transparent text-ink-muted hover:bg-canvas hover:text-ink`;
export const FIELD = `h-8 max-w-full rounded-md border border-line-strong bg-surface px-2 text-ink placeholder:text-ink-muted ${DISABLED}`;
export const SELECT = FIELD;
// A small label chip: the outcome, the harm and not-audited markers, a check code.
const CHIP_SHAPE = 'inline-flex items-center gap-1 border px-2 py-0.5 text-xs font-medium';
export const CHIP = `${CHIP_SHAPE} rounded-full`;
// A label inside a card above a group (Gate checks, Rubric, a chart section).
export const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wide text-ink-muted';
// An icon button that grows to a 44px target on a touch screen; the desktop look is unchanged.
const ICON_BUTTON = 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-ink pointer-coarse:h-11 pointer-coarse:w-11';

export function Page({ title, headingRef, lead, children }: { title: string; headingRef?: Ref<HTMLHeadingElement> | undefined; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight text-ink focus-visible:outline-none">{title}</h1>
      {lead !== undefined && <div className="mt-1.5 max-w-prose text-ink-muted">{lead}</div>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

// A card: rounded-lg with a faint shadow in light (in dark the border and the header band carry
// the depth); its header sits on a tint of the page colour.
export const CARD = 'rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-none';
export const CARD_HEADER = 'flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-line bg-canvas/60 px-4 py-3 dark:bg-canvas/40';

export function Card({ title, children, actions, id, testId }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; id?: string; testId?: string }) {
  return (
    <div id={id} data-testid={testId} className={CARD}>
      {(title !== undefined || actions !== undefined) && (
        <div className={CARD_HEADER}>
          <h2 className="min-w-0 break-words text-sm font-semibold text-ink">{title}</h2>
          {actions}
        </div>
      )}
      <div className="min-w-0 break-words p-4">{children}</div>
    </div>
  );
}

// A notice (ui-polish 5.5). tone danger (also any testId error-state) gets the danger border, as
// the key gate's errors do; tone info, for an empty state, a dashed outline. An optional icon sits
// in a 28px circle. An error reads lead first (children), then its action (Reload or Retry), then
// the raw message behind "Show details". nested: inside a card, so rounded-md.
const NOTICE_TONE = { plain: 'border-line', info: 'border-dashed border-line-strong/50', danger: 'border-danger' };
export function Notice({ children, testId, tone, icon: Icon, action, detail, role, nested = false }: {
  children: ReactNode;
  testId?: string;
  tone?: 'info' | 'danger';
  icon?: LucideIcon;
  action?: ReactNode;
  detail?: string | null;
  role?: 'alert' | 'status';
  nested?: boolean;
}) {
  const t = tone ?? (testId === 'error-state' ? 'danger' : 'plain');
  return (
    <div data-testid={testId} role={role} className={`flex items-start gap-3 break-words border ${NOTICE_TONE[t]} ${nested ? 'rounded-md' : 'rounded-lg'} bg-surface p-4 text-ink-muted`}>
      {Icon && (
        <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas dark:bg-line ${t === 'danger' ? 'text-danger' : 'text-ink-muted'}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
      )}
      <div className={`min-w-0 flex-1 ${Icon ? 'pt-0.5' : ''}`}>
        {children}
        {action !== undefined && <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div>}
        {detail != null && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer">Show details</summary>
            <p data-testid="error-detail" className="mt-1 break-words font-mono">{detail}</p>
          </details>
        )}
      </div>
    </div>
  );
}


export const NO_RESULTS = 'No results are published yet.';

// The marks and markOf live in marks.ts, which has no JSX, so a vitest test under apps/web/test can import them.
export { BLOCKING_MARKS, MARKS, markLabel, markOf, type Mark } from './marks.ts';

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
export function OutcomeChip({ outcome, fault }: { outcome: string; fault?: Fault | null }) {
  const mark = markOf(outcome, fault);
  return (
    <span data-testid="outcome" data-mark={mark} className={`${CHIP} whitespace-nowrap text-ink ${BLOCKING_MARKS.includes(mark) ? 'border-danger' : 'border-line'}`}>
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
  const chip = `${CHIP_SHAPE} rounded-md border-danger text-danger break-words`;
  return (
    <>
      {met.length > 0 && <span data-testid="harm-chip" data-harm="met" className={chip}>PASS with harm: {met.map((x) => `${named(x)} (${x.points})`).join(', ')}</span>}
      {unknown.length > 0 && <span data-testid="harm-chip" data-harm="unknown" className={chip}>PASS, harm unknown: {unknown.map(named).join(', ')}</span>}
    </>
  );
}

const TO_GLOSSARY = { view: 'glossary', task: null, label: null, trial: null };
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

export const LINK = 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';

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
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the full hash'} title={copied ? 'Copied' : 'Copy the full hash'} className={ICON_BUTTON}>
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
    <a href={glossaryHref(`fault-${anchor}`)} onClick={toGlossary(`fault-${anchor}`)} aria-label={`How the ${name} label is given`} title="How failures are attributed" className={ICON_BUTTON}>
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
      {!e.audited && <span data-testid="not-audited" className={`${CHIP} border-dashed border-line-strong font-normal text-ink-muted`}>{NOT_AUDITED_MARKER}</span>}
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

// The pass and denominator rules in plain words, the outcome lists read from outcomes.ts, then the
// exact rule (PASS_DEFINITION and DENOMINATOR_RULE, with their code names) behind "Exact rule".
export function PlainRules({ ids }: { ids: { pass: string; denominator: string } }) {
  return (
    <div className="space-y-1.5 text-ink-muted" data-testid="plain-rules">
      <p><span className="font-medium text-ink">Pass: </span>a trial passes only when it meets every gate check.</p>
      <p><span className="font-medium text-ink">Counted: </span>{VALID_OUTCOMES.join(', ')}. A refusal counts as a model failure.</p>
      <p data-testid="not-counted-rule"><span className="font-medium text-ink">Not counted: </span>{NOT_COUNTED_LINE}</p>
      <details className="text-xs">
        <summary className="cursor-pointer">Exact rule, with the names the code uses</summary>
        <p className="mt-1 break-words" data-testid={ids.pass}>{PASS_DEFINITION}</p>
        <p className="mt-1 break-words" data-testid={ids.denominator}>{DENOMINATOR_RULE}</p>
      </details>
    </div>
  );
}
