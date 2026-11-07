// The trial detail's left pane: the task prompt, then the model's text, its summarised thinking
// and one row per tool call, each call that ran numbered as the grader numbers steps
// (steps.ts). A link elsewhere on the page (an evidence id, the decisive step, an exposure row)
// sets `current`; that row is scrolled into view, focused and marked aria-current="step".
// Thinking reads as a captioned aside in plain type, and each tool name sits in a pill (ui-polish
// 3.5); THINKING and TOOL_NAME are shared with the live trial. A mid-trial arrival (PW4-E1) is a row
// of its own after the call that fired it, naming what came into the queues.
// P25u S3: an open call shows its arguments and result as captioned key/value lists (A10), a call
// the environment refused says so under the closed row (A10), the written ids put the provenance
// last (A11), a "Skip the trajectory" link before the list takes the keyboard past its hundred
// rows (V16), and RowItem is exported for the live trial's rows (S4, A8).
import { ChevronDown, ChevronRight, CircleAlert, Dot, Inbox } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CARD, Notice } from '../data/ui.tsx';
import { stepAnchor, writtenWords, type Row, type Trajectory as Folded } from './steps.ts';

// A thinking row: muted plain type behind a rule, under a small "Thinking" caption.
export const THINKING = 'border-l-2 border-line pl-3 text-ink-muted';
// The caption runs in before the text, so it adds no line to a long trajectory.
export const THINKING_CAPTION = 'mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted';
export const TOOL_NAME = 'shrink-0 rounded bg-canvas px-1.5 font-mono text-xs text-ink dark:bg-line';
// The anchor the skip link jumps to, after the last row.
export const TRAJECTORY_END = 'trajectory-end';

export function TextRow({ kind, text, testId = kind }: { kind: 'text' | 'thinking'; text: string; testId?: string }) {
  if (kind === 'text') return <li data-testid={testId} className="whitespace-pre-wrap break-words text-ink">{text}</li>;
  return (
    <li data-testid={testId} className={`whitespace-pre-wrap break-words ${THINKING}`}>
      <span className={THINKING_CAPTION}>Thinking</span>
      {text}
    </li>
  );
}

export type Loaded<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; value: T };

// current: the step a link last pointed at, with a counter so a second click on the same link
// scrolls again.
export function Trajectory({ data, current }: { data: Loaded<Folded> | null; current: { step: number; seq: number } | null }) {
  return (
    <section aria-label="Trajectory" data-testid="trajectory" className={`min-w-0 ${CARD}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
        <h2 className="font-medium text-ink">Trajectory</h2>
        {data?.state === 'ready' && <span className="text-xs text-ink-muted">{data.value.steps.length} tool calls ran</span>}
      </div>
      <div className="min-w-0 p-4">
        {data === null && <p data-testid="trajectory-empty" className="text-ink-muted">This record names no trajectory.</p>}
        {data?.state === 'loading' && <p className="text-ink-muted">Loading the trajectory…</p>}
        {data?.state === 'error' && (
          <div data-testid="trajectory-error" role="alert" className="rounded-sm border border-danger p-3">
            <p className="font-medium text-danger">The trajectory cannot be read.</p>
            <p className="mt-1 break-words font-mono text-xs text-ink-muted">{data.message}</p>
          </div>
        )}
        {data?.state === 'ready' && <Steps t={data.value} current={current} />}
      </div>
    </section>
  );
}

function Steps({ t, current }: { t: Folded; current: { step: number; seq: number } | null }) {
  if (t.rows.length === 0 && t.prompt === null) return <Notice testId="trajectory-empty">The trajectory holds no messages and no tool calls.</Notice>;
  return (
    <div className="space-y-3">
      {/* One Tab stop takes the keyboard past every row (V16), as the shell's skip link does. */}
      <a href={`#${TRAJECTORY_END}`} data-testid="skip-trajectory" className="sr-only rounded-md bg-primary px-3 py-2 font-medium text-on-primary focus:not-sr-only focus:inline-block">Skip the trajectory</a>
      {t.prompt !== null && (
        <details className="rounded-sm bg-canvas px-3 py-2 text-ink-muted">
          <summary className="cursor-pointer text-ink">Task prompt</summary>
          <p className="mt-1 whitespace-pre-wrap break-words">{t.prompt}</p>
        </details>
      )}
      <ol className="space-y-1.5">
        {t.rows.map((row) => <RowItem key={row.key} row={row} current={current !== null && row.step === current.step ? current.seq : null} />)}
      </ol>
      <p id={TRAJECTORY_END} tabIndex={-1} className="sr-only">End of the trajectory</p>
    </div>
  );
}

// The words under a closed row for a call the environment did not run as asked: its code and
// message. INTERNAL is the environment's own failure; any other code is the environment refusing
// the call the model made.
function errorLine(row: Row & { kind: 'tool' }): string {
  const err = (row.result as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = typeof err?.code === 'string' ? err.code : row.error;
  const message = typeof err?.message === 'string' ? err.message : null;
  return `${row.error === 'INTERNAL' ? 'Failed inside the environment' : 'Rejected'}: ${code}${message === null ? '' : `: ${message}`}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const scalar = (v: unknown): string | null => (v === null ? 'null' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null);

// A captioned block for a call's arguments or result (A10): a key/value list for an object, with
// JSON only for a nested value; the JSON itself for a list or a scalar; "none" when empty.
function KeyValues({ caption, value, testId }: { caption: string; value: unknown; testId: string }) {
  const entries = isRecord(value) ? Object.entries(value) : null;
  return (
    <div data-testid={testId} className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{caption}</p>
      {value === null || value === undefined || (entries !== null && entries.length === 0) ? <p className="text-ink-muted">none</p> : entries !== null ? (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="break-all font-mono text-ink-muted">{k}</dt>
              <dd className="min-w-0 break-words">{scalar(v) ?? <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono">{JSON.stringify(v, null, 2)}</pre>}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono">{scalar(value) ?? JSON.stringify(value, null, 2)}</pre>
      )}
    </div>
  );
}

// One row of the trajectory. Exported for the live trial's rows (S4, A8): a Row from steps.ts
// trajectoryOf, and the step a link last pointed at (null when none).
export function RowItem({ row, current = null }: { row: Row; current?: number | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (current === null) return;
    ref.current?.scrollIntoView({ block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }, [current]);
  if (row.kind === 'arrival') return <ArrivalRow row={row} />;
  if (row.kind !== 'tool') {
    return <TextRow kind={row.kind} text={row.text} />;
  }
  const Chevron = open ? ChevronDown : ChevronRight;
  const here = current !== null;
  return (
    <li
      ref={ref}
      id={row.step === null ? undefined : stepAnchor(row.step)}
      data-testid="step"
      data-step={row.step ?? ''}
      data-tool={row.name}
      data-error={row.error ?? ''}
      tabIndex={-1}
      aria-current={here ? 'step' : undefined}
      className={`scroll-m-4 rounded-sm outline-none ${here ? 'bg-canvas ring-2 ring-accent' : ''}`}
    >
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left pointer-coarse:py-2.5 hover:bg-canvas">
        <Chevron aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
        <span className="w-14 shrink-0 text-xs tabular-nums text-ink-muted">{row.step === null ? 'not run' : `Step ${row.step}`}</span>
        <code data-testid="tool-name" className={TOOL_NAME}>{row.name}</code>
        {/* The target keeps up to 16 characters whole ("Patient/pt-0061"), so a patient id is never
            the part cut (A11). */}
        <span data-testid="step-target" className="max-w-[16ch] shrink-0 truncate text-xs text-ink-muted">{row.target}</span>
        {row.error !== null && <CircleAlert role="img" aria-label={`error ${row.error}`} className="h-3.5 w-3.5 shrink-0 text-danger" strokeWidth={1.75} />}
        {row.written.length > 0 && (
          <span className="inline-flex min-w-0 items-center text-xs text-ink">
            <Dot aria-hidden className="h-4 w-4 shrink-0 text-accent" />
            <span data-testid="step-written" className="truncate">wrote {writtenWords(row.written)}</span>
          </span>
        )}
      </button>
      {row.error !== null && <p data-testid="step-error" className="break-words pl-6 text-xs text-danger">{errorLine(row)}</p>}
      {open && (
        <div data-testid="step-detail" className="mt-1 space-y-2 rounded-sm bg-canvas p-2 text-xs text-ink">
          <KeyValues caption="Arguments" value={row.input} testId="step-arguments" />
          <KeyValues caption="Result" value={row.result} testId="step-result" />
        </div>
      )}
    </li>
  );
}

// What a mid-trial event put in the queues, after the step whose call fired it.
function ArrivalRow({ row }: { row: Extract<Row, { kind: 'arrival' }> }) {
  return (
    <li data-testid="arrival" data-spec={row.spec} className="flex min-w-0 items-start gap-1.5 rounded-sm border-l-2 border-accent px-2 py-1 text-xs text-ink">
      <Inbox aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.75} />
      <span className="min-w-0 break-words">
        <span className="font-medium">Arrived in the queues</span>
        {row.step === null ? '' : ` after step ${row.step}`} (event {row.spec}): {row.keys.join(', ')}
      </span>
    </li>
  );
}
