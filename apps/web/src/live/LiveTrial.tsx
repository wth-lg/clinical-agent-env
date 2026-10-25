// The Live trial view (plan phase P15; design section 8, "Live trial"): the run launcher (a task,
// then Run ×1, ×3, ×10 or ×20 as one batch under the session cap, each size with its projected
// cost, a size over the cap disabled with the reason, and the cap itself), the live trial (streaming
// trajectory with summarised thinking and one-line tool rows, turn, token and cost meters, the
// state diff, Stop) and the runs this surface started. It reads trials only through the
// surface's TrialTransport and shows them only from TrialEvents, so the local runner and the
// browser look the same. Without a key the launcher is disabled and says why.
import { ChevronDown, ChevronRight, CircleAlert, Dot, Square } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { explainTrial, type ExplainRecord, NOT_AUDITED_MARKER } from '../../../../packages/core/explain.ts';
import { REFUSAL_TEXT } from '../../../../packages/core/runner-api.ts';
import { useTaskList } from '../data/tasks.ts';
import { Card, FaultLabel, OutcomeChip, Page } from '../data/ui.tsx';
import { useKeyStatus } from '../keygate/key.ts';
import { runnerToken } from '../keygate/runner.ts';
import { MAX_SESSION_CAP_USD, parseCap } from '../spend/cap.ts';
import { sessionCap, setSessionCap, useSessionSpend } from '../spend/session.ts';
import { fold, type Item } from './fold.ts';
import { readEvents } from './store.ts';
import { runnerTransport } from './transport/runner.ts';
import { workerTransport } from './transport/worker.ts';
import { currentTrial, RUN_SIZES, setCurrentTrial, type LiveRun, type Refusal, type TrialEnd, type TrialTransport } from './types.ts';

// The runner injects its token into the page it serves, so its presence is the surface; the
// shell shows the runner-down screen instead of any view when the runner does not answer.
let transport: TrialTransport | undefined;
const theTransport = (): TrialTransport => (transport ??= runnerToken() !== null ? runnerTransport() : workerTransport(sessionCap));

const POLL_MS = 1500;
const select = 'h-8 max-w-full rounded-sm border border-line-strong bg-surface px-2 text-ink';
const button = 'h-8 rounded-sm border border-line-strong px-3 text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50';
const usd = (n: number) => `$${n.toFixed(2)}`;

// The refusals a higher session cap would lift.
const CAP_REFUSALS: readonly string[] = [REFUSAL_TEXT.trials.spend_refused_ceiling, REFUSAL_TEXT.trials.session_cap];

// Why the sizes in `over` are disabled: "Run ×3, ×10 and ×20 need more than ...".
function overCap(over: readonly number[], costs: Partial<Record<number, number>>, cap: number): string {
  const names = over.map((n, i) => (i === 0 ? `Run ×${n}` : `×${n}`));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const first = over[0]!;
  return over.length === 1
    ? `${list} needs ${usd(costs[first]!)}, more than your session cap of ${usd(cap)}. Raise the cap below to run it.`
    : `${list} need more than your session cap of ${usd(cap)} (Run ×${first} needs ${usd(costs[first]!)}). Raise the cap below to run them.`;
}

// A browser-direct trial a reload cut off and the tab resumed from its kept events (record.resumed).
const wasResumed = (record: ExplainRecord | null) => (record as { resumed?: boolean } | null)?.resumed === true;
const Resumed = () => <span data-testid="resumed" className="text-xs text-ink-muted">resumed after reload</span>;

export function LiveTrial({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const t = theTransport();
  const key = useKeyStatus();
  const { tasks } = useTaskList();
  const params = new URL(location.href).searchParams;
  const [task, setTask] = useState(params.get('task') ?? '');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [current, setCurrent] = useState(currentTrial);
  const [runs, setRuns] = useState<LiveRun[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const ids = useMemo(() => {
    const listed = (tasks ?? []).map((x) => x.id);
    return task !== '' && !listed.includes(task) ? [task, ...listed] : listed;
  }, [tasks, task]);
  const chosen = task || ids[0] || '';
  const noKey = key.kind === 'none';
  const { cap } = useSessionSpend();
  const [costs, setCosts] = useState<Partial<Record<number, number>>>({});
  useEffect(() => {
    if (chosen === '') return;
    let current = true;
    setCosts({});
    for (const n of RUN_SIZES) {
      t.project({ task: chosen, trials: n, sessionCap: sessionCap() }).then((v) => current && setCosts((c) => ({ ...c, [n]: v })), () => undefined);
    }
    return () => {
      current = false;
    };
  }, [t, chosen]);
  const over = RUN_SIZES.filter((n) => costs[n] !== undefined && costs[n] > cap);
  const costId = useId();

  const refresh = useCallback(() => {
    t.runs().then((r) => (setRuns(r), setRunsError(null)), (e: unknown) => setRunsError((e as Error).message));
  }, [t]);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (runs === null || runs.every((r) => r.done)) return;
    const timer = setTimeout(refresh, POLL_MS);
    return () => clearTimeout(timer);
  }, [runs, refresh]);

  const open = (id: string) => {
    setCurrentTrial(id);
    setCurrent(id);
  };

  async function launch(n: number) {
    if (busy || chosen === '') return;
    setBusy(true);
    setRefusal(null);
    try {
      const r = await t.start({ task: chosen, trials: n, sessionCap: sessionCap() });
      if (!r.ok) return setRefusal({ lead: r.lead, detail: r.detail });
      open(r.trialIds[0]!);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Live trial" headingRef={headingRef} lead={t.kind === 'local-runner' ? 'Trials run in the local runner on this computer and stream here.' : 'Trials run in this tab, in a Worker, and are graded here.'}>
      <Card title="Run a task">
        <div className="flex flex-wrap items-end gap-3" data-testid="launcher">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-muted">
            Task
            <select aria-label="Task" className={select} value={chosen} onChange={(e) => setTask(e.target.value)} disabled={noKey}>
              {ids.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          {RUN_SIZES.map((n) => (
            <button key={n} type="button" aria-label={`Run ×${n}`} aria-describedby={`${costId}-${n}`} className={button} disabled={noKey || busy || chosen === '' || over.includes(n)} onClick={() => void launch(n)}>
              Run ×{n}
              <span id={`${costId}-${n}`} data-testid={`run-cost-${n}`} className="ml-1.5 text-xs tabular-nums text-ink-muted">{costs[n] === undefined ? '…' : usd(costs[n])}</span>
            </button>
          ))}
        </div>
        {noKey && <p data-testid="launcher-reason" className="mt-2 text-ink-muted">Add an API key to run trials. Use “Add key” in the top bar.</p>}
        {!noKey && over.length > 0 && <p data-testid="size-reason" className="mt-2 text-ink-muted">{overCap(over, costs, cap)}</p>}
        <CapControl local={t.kind === 'local-runner'} />
        {refusal && (
          <ErrorNote testId="run-refusal" lead={refusal.lead} detail={refusal.detail}>
            {CAP_REFUSALS.includes(refusal.lead) && <p data-testid="cap-hint" className="mt-1 text-ink">Change the session cap under “Run a task” on this page.</p>}
          </ErrorNote>
        )}
      </Card>
      {current !== null && <Trial key={current} t={t} id={current} onEnd={refresh} />}
      <Card title="Your runs">
        {runsError !== null && <ErrorNote testId="runs-error" lead="The runs cannot be listed." detail={runsError} />}
        {runs !== null && runs.length === 0 && <p className="text-ink-muted" data-testid="no-live-runs">No runs yet. Start one above.</p>}
        <div className="space-y-3">
          {[...(runs ?? [])].reverse().map((r) => <RunRows key={r.runId} run={r} current={current} onOpen={open} />)}
        </div>
      </Card>
    </Page>
  );
}

// The session cap, set here as well as in the key gate. It is kept in this tab's sessionStorage.
function CapControl({ local }: { local: boolean }) {
  const { cap } = useSessionSpend();
  const [text, setText] = useState(String(cap));
  useEffect(() => setText(String(cap)), [cap]);
  const parsed = parseCap(text);
  const id = useId();
  return (
    <form
      noValidate
      className="mt-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed !== null) setSessionCap(parsed);
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={id} className="flex flex-col gap-1 text-xs text-ink-muted">
          Session cap (USD)
          <input id={id} inputMode="decimal" autoComplete="off" className={`${select} w-28`} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={parsed === null} />
        </label>
        <button type="submit" className={button} disabled={parsed === null || parsed === cap}>Set cap</button>
      </div>
      {parsed === null && <p data-testid="cap-invalid" className="mt-1 text-xs text-danger">Enter a cap from $0.01 to ${MAX_SESSION_CAP_USD}.</p>}
      <p data-testid="cap-where" className="mt-2 text-xs text-ink-muted">
        Each batch is checked against this cap before any call. You can also set it in the key gate. The cap is kept for this tab only, so another tab has its own
        {local ? '; the runner counts the spend of every tab.' : ', with its own spend.'}
      </p>
    </form>
  );
}

function ErrorNote({ lead, detail, testId, children }: { lead: string; detail: string | null; testId: string; children?: React.ReactNode }) {
  return (
    <div role="alert" data-testid={testId} className="mt-3 rounded-sm border border-danger bg-canvas p-3">
      <p className="font-medium text-danger">{lead}</p>
      {children}
      {detail !== null && <p className="mt-2 break-words font-mono text-xs text-ink-muted" data-testid="error-detail">{detail}</p>}
    </div>
  );
}

function Trial({ t, id, onEnd }: { t: TrialTransport; id: string; onEnd: () => void }) {
  const [events, setEvents] = useState<TrialEvent[]>([]);
  const [end, setEnd] = useState<TrialEnd | null>(null);
  const [stopping, setStopping] = useState(false);
  const buffer = useRef<TrialEvent[]>([]);
  useEffect(() => {
    const ac = new AbortController();
    buffer.current = [];
    let frame = 0;
    const flush = () => {
      frame = 0;
      setEvents([...buffer.current]);
    };
    t.events(id, (e) => {
      if (buffer.current.length > 0 && e.seq <= buffer.current.at(-1)!.seq) return;
      buffer.current.push(e);
      frame ||= requestAnimationFrame(flush);
    }, ac.signal).then((x) => {
      if (ac.signal.aborted) return;
      flush();
      setEnd(x);
      onEnd();
    });
    return () => {
      ac.abort();
      cancelAnimationFrame(frame);
    };
  }, [t, id, onEnd]);
  const f = useMemo(() => fold(events), [events]);
  const running = end === null;
  const record = (end?.record ?? f.record) as ExplainRecord | null;
  const explanation = record ? explainTrial(record, null, { events }) : null;

  async function stop() {
    setStopping(true);
    await t.cancel(id);
  }

  return (
    <section data-testid="live-trial" data-trial={id} data-state={running ? 'running' : end.state} className="rounded-sm border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <h2 className="min-w-0 break-all font-medium text-ink">{id}</h2>
        <Meter label="Turn" value={String(f.turn)} testId="meter-turn" />
        <Meter label="Tokens" value={`${f.tokens.input + f.tokens.cache_read + f.tokens.cache_write} in, ${f.tokens.output} out`} testId="meter-tokens" />
        <Meter label="Cost" value={usd(f.cost)} testId="meter-cost" />
        {wasResumed(record) && <Resumed />}
        <button type="button" onClick={() => void stop()} disabled={!running || stopping} className={`${button} ml-auto inline-flex items-center gap-1.5`}>
          <Square aria-hidden className="h-3 w-3" strokeWidth={2} />
          {stopping && running ? 'Stopping…' : 'Stop'}
        </button>
      </header>
      <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <ol className="min-w-0 space-y-1.5" data-testid="trajectory" aria-live="polite">
          {f.items.map((item) => <ItemRow key={item.key} item={item} />)}
          {running && <li className="text-xs text-ink-muted">{events.length === 0 ? 'Starting…' : 'Running…'}</li>}
          {!running && f.items.length === 0 && <li className="text-xs text-ink-muted">No reply came from the model.</li>}
        </ol>
        <aside className="min-w-0 space-y-2 text-xs" data-testid="state-diff">
          <h3 className="font-medium text-ink">State</h3>
          <p className="text-ink-muted">Writes: {f.written.length === 0 ? 'none yet' : ''}</p>
          <ul className="space-y-0.5">{f.written.map((w) => <li key={w} className="break-all font-mono text-ink">+ {w}</li>)}</ul>
          <p className="break-all text-ink-muted">Initial hash <span className="font-mono">{f.hashes.initial?.slice(0, 12) ?? '…'}</span></p>
          <p className="break-all text-ink-muted">Current hash <span className="font-mono">{f.hashes.latest?.slice(0, 12) ?? '…'}</span></p>
          {f.hashes.final && <p className="break-all text-ink-muted">Final hash <span data-testid="final-hash" className="font-mono text-ink">{f.hashes.final}</span></p>}
        </aside>
      </div>
      {!running && (
        <footer className="space-y-2 border-t border-line px-4 py-3" data-testid="trial-end">
          {explanation && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <OutcomeChip outcome={explanation.outcome} fault={explanation.fault} />
              {/* On an org-CORS refusal the alert below says what happened and what to do; a rerun here would fail the same way. */}
              {explanation.outcome !== 'PASS' && f.orgCors === null && <FaultLabel e={explanation} />}
              {explanation.outcome !== 'PASS' && f.orgCors === null && <span className="text-ink-muted">{explanation.reason}</span>}
            </div>
          )}
          {f.orgCors !== null ? (
            <ErrorNote testId="trial-error" lead="This key's organization does not allow browser access, so the trial stopped." detail={f.orgCors}>
              <p className="mt-1 text-ink">Run the environment on your computer instead. The steps and the command are in “Run it on your computer” below.</p>
              <button type="button" className={`${button} mt-2 h-7`} onClick={() => document.querySelector<HTMLElement>('[data-testid="local-run-panel"]')?.focus()}>Show the steps</button>
            </ErrorNote>
          ) : f.end?.type === 'error' ? (
            <ErrorNote testId="trial-error" lead={f.end.status === 'INFRA_API' ? 'The API stopped this trial.' : 'This trial stopped with an error.'} detail={f.end.message} />
          ) : end.message !== null && end.message !== 'stopped watching' && events.length === 0 ? (
            <ErrorNote testId="trial-error" lead="This trial did not run." detail={end.message} />
          ) : null}
        </footer>
      )}
    </section>
  );
}

function Meter({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <span className="text-xs text-ink-muted">
      {label} <span data-testid={testId} className="font-medium text-ink">{value}</span>
    </span>
  );
}

function ItemRow({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  if (item.kind !== 'tool') {
    return <li data-testid={item.kind} className={`whitespace-pre-wrap break-words ${item.kind === 'thinking' ? 'text-ink-muted italic' : 'text-ink'}`}>{item.text}</li>;
  }
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li data-testid="tool-row" data-tool={item.name} data-error={String(item.error !== null)}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full min-w-0 items-center gap-1.5 rounded-sm text-left hover:bg-canvas">
        <Chevron aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
        <code className="shrink-0 font-mono text-xs text-ink">{item.name}</code>
        <span className="min-w-0 truncate text-xs text-ink-muted">{item.target}</span>
        {item.error !== null && <CircleAlert aria-label={`error ${item.error}`} className="h-3.5 w-3.5 shrink-0 text-danger" strokeWidth={1.75} />}
        {item.written.length > 0 && <span className="inline-flex shrink-0 items-center text-xs text-accent"><Dot aria-hidden className="h-4 w-4" />{item.written.join(', ')}</span>}
        {!item.executed && <span className="text-xs text-ink-muted">(not run)</span>}
      </button>
      {open && (
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-canvas p-2 font-mono text-xs text-ink">
          {JSON.stringify({ input: item.input, result: item.result }, null, 2)}
        </pre>
      )}
    </li>
  );
}

function RunRows({ run, current, onOpen }: { run: LiveRun; current: string | null; onOpen: (id: string) => void }) {
  return (
    <div data-testid="live-run" data-run={run.runId} data-trials={run.rows.length}>
      <p className="text-ink-muted">
        <span className="font-medium text-ink">{run.runId}</span>: {run.tasks.join(', ')}, {run.rows.length} trial{run.rows.length === 1 ? '' : 's'}
        {run.done ? '' : ', running'}{run.stopped ? `, stopped: ${run.stopped}` : ''}
      </p>
      <ul className="mt-1 divide-y divide-line rounded-sm border border-line">
        {run.rows.map((row) => <LiveRow key={row.trialId} row={row} current={current === row.trialId} onOpen={onOpen} />)}
      </ul>
    </div>
  );
}

// FaultLabel shows its own "not human-audited" chip beside a failure label, so the row adds the
// marker only where it has none.
const labelled = (e: ReturnType<typeof explainTrial>) => e.outcome !== 'PASS' && e.fault !== 'infra' && e.label !== null;

function LiveRow({ row, current, onOpen }: { row: LiveRun['rows'][number]; current: boolean; onOpen: (id: string) => void }) {
  const [events, setEvents] = useState<TrialEvent[]>([]);
  useEffect(() => {
    if (row.record !== null) void readEvents(row.trialId).then(setEvents, () => undefined);
  }, [row.trialId, row.record]);
  const e = row.record ? explainTrial(row.record, null, { events }) : null;
  return (
    <li data-testid="live-row" data-trial={row.trialId} data-state={row.state} data-outcome={e?.outcome ?? ''} className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => onOpen(row.trialId)} aria-current={current} className="min-w-0 break-all text-left font-medium text-ink hover:underline">
          {row.trialId}
        </button>
        {e ? <OutcomeChip outcome={e.outcome} fault={e.fault} /> : <span className="text-xs text-ink-muted">{row.state}</span>}
        {e && e.outcome !== 'PASS' && <FaultLabel e={e} />}
        {e?.decisive_check && <code data-testid="decisive" className="break-all rounded-sm bg-canvas px-1 text-xs text-ink">{e.decisive_check.id}</code>}
        {e && !e.audited && !labelled(e) && <span data-testid="audit-marker" className="text-xs text-ink-muted">{NOT_AUDITED_MARKER}</span>}
        {wasResumed(row.record) && <Resumed />}
      </div>
      {e && e.outcome !== 'PASS' && <p data-testid="reason" className="mt-1 break-words text-ink-muted">{e.reason}</p>}
      {!e && row.error !== null && <p className="mt-1 break-words text-ink-muted">{row.error}</p>}
    </li>
  );
}
