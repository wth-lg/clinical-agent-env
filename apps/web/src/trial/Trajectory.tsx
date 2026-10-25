// The trial detail's left pane: the task prompt, then the model's text, its summarised thinking
// and one row per tool call, each call that ran numbered as the grader numbers steps
// (steps.ts). A link elsewhere on the page (an evidence id, the decisive step, an exposure row)
// sets `current`; that row is scrolled into view, focused and marked aria-current="step".
import { ChevronDown, ChevronRight, CircleAlert, Dot } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Notice } from '../data/ui.tsx';
import { stepAnchor, type Row, type Trajectory as Folded } from './steps.ts';

export type Loaded<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; value: T };

// current: the step a link last pointed at, with a counter so a second click on the same link
// scrolls again.
export function Trajectory({ data, current }: { data: Loaded<Folded> | null; current: { step: number; seq: number } | null }) {
  return (
    <section aria-label="Trajectory" data-testid="trajectory" className="min-w-0 rounded-sm border border-line bg-surface">
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
      {t.prompt !== null && (
        <details className="rounded-sm bg-canvas px-3 py-2 text-ink-muted">
          <summary className="cursor-pointer text-ink">Task prompt</summary>
          <p className="mt-1 whitespace-pre-wrap break-words">{t.prompt}</p>
        </details>
      )}
      <ol className="space-y-1.5">
        {t.rows.map((row) => <RowItem key={row.key} row={row} current={current !== null && row.step === current.step ? current.seq : null} />)}
      </ol>
    </div>
  );
}

function RowItem({ row, current }: { row: Row; current: number | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (current === null) return;
    ref.current?.scrollIntoView({ block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }, [current]);
  if (row.kind !== 'tool') {
    return <li data-testid={row.kind} className={`whitespace-pre-wrap break-words ${row.kind === 'thinking' ? 'italic text-ink-muted' : 'text-ink'}`}>{row.text}</li>;
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
      tabIndex={-1}
      aria-current={here ? 'step' : undefined}
      className={`scroll-m-4 rounded-sm outline-none ${here ? 'bg-canvas ring-2 ring-accent' : ''}`}
    >
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-canvas">
        <Chevron aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
        <span className="w-14 shrink-0 text-xs tabular-nums text-ink-muted">{row.step === null ? 'not run' : `Step ${row.step}`}</span>
        <code className="shrink-0 font-mono text-xs text-ink">{row.name}</code>
        <span className="min-w-0 truncate text-xs text-ink-muted">{row.target}</span>
        {row.error !== null && <CircleAlert role="img" aria-label={`error ${row.error}`} className="h-3.5 w-3.5 shrink-0 text-danger" strokeWidth={1.75} />}
        {row.written.length > 0 && (
          <span className="inline-flex min-w-0 items-center text-xs text-ink">
            <Dot aria-hidden className="h-4 w-4 shrink-0 text-accent" />
            <span className="truncate">wrote {row.written.join(', ')}</span>
          </span>
        )}
      </button>
      {open && (
        <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-canvas p-2 font-mono text-xs text-ink">
          {JSON.stringify({ input: row.input, result: row.result }, null, 2)}
        </pre>
      )}
    </li>
  );
}
