// The Live trial view (plan phase P15; design section 8, "Live trial"): the run launcher (a task,
// then Run ×1, ×3, ×10 or ×20 as one batch under the session cap, each size with the typical cost
// of one trial from the committed pilot when a pilot holds the task and what the batch holds as an
// upper bound, a size whose cost with the session's committed spend is over the cap disabled with
// the cap it needs and a button that raises the cap to it, and the cap itself), the live trial
// (streaming trajectory with summarised thinking and one-line tool rows, turn, token and cost
// meters, what the model changed, Stop) and the runs this surface started. It reads trials only
// through the surface's TrialTransport and shows them only from TrialEvents, so the local runner
// and the browser look the same. Without a key the launcher is disabled and says why, and
// "Watch a recorded trial" plays a published trial's events through the same card (P25u A14). The
// task is the URL's (?task=), so a link to this view with a task always shows that task, in place
// too (P25c: a remembered selection won over the URL), and choosing one sets the URL. The committed
// spend the launcher checks a size against is the session store's, the same figure the top bar
// meter shows.
//
// P25u slice S4: a runner whose process dies mid-trial ends the card (the transport probes
// api/health, A2); this view then probes until the runner is back and reloads. A trial the user
// stopped says so (A1b). The card's and each row's explanation is the session trial page's (A4),
// the grade is one button named by the outcome (A5), a finished card offers Run again (A16), and
// Your runs shows the latest five runs, one line per trial (A15).
import { CircleAlert, CircleHelp, Loader2, Play, Square } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { explainTrial, type ExplainRecord, type Explanation, NOT_AUDITED_MARKER } from '../../../../packages/core/explain.ts';
import { REFUSAL_TEXT } from '../../../../packages/core/runner-api.ts';
import { shownFault, shownLabel } from '../data/failures.ts';
import { isValid } from '../../../../packages/core/outcomes.ts';
import { markLabel, markOf } from '../data/marks.ts';
import { RowItem } from '../trial/Trajectory.tsx';
import { fetchEvents, useResults, type RunData } from '../data/results.ts';
import { medianDuration } from '../data/duration.ts';
import { MODEL } from '../adapters/ledger-browser.ts';
import { useTaskList } from '../data/tasks.ts';
import { BUTTON, BUTTON_PRIMARY, Card, CARD, CARD_TITLE, CHIP, ErrorNote, FaultLabel, GlossaryLink, LINK, Notice, OutcomeChip, Page, SELECT } from '../data/ui.tsx';
import { hrefWith, navigate, onNav, useParams } from '../data/url.ts';
import { freshView } from '../shell/views.ts';
import { liveTaskTitle } from '../tasks/title.ts';
import { relayLine, RELAY_TRIAL_TEXT, trialRelayReason } from '../keygate/failure.ts';
import { requestKey, useKeyStatus } from '../keygate/key.ts';
import { costLine, typicalCost } from './typical.ts';
import { admitTrial, MAX_SESSION_CAP_USD, neededCap, parseCap, raiseTo } from '../spend/cap.ts';
import { refreshSpent, sessionCap, setSessionCap, setSpent, useSessionSpend } from '../spend/session.ts';
import { runnerGone, type Surface } from '../surface/detect.ts';
import { useHosted } from '../surface/hosted.ts';
import { LocalRunPanel } from '../surface/LocalRunPanel.tsx';
import { useRunnerRetry } from '../surface/RunnerDown.tsx';
import {
  durationWords, gradeButtonLabel, infraWords, overCapText, REPLAY_STOPPED, RUNNER_STOPPED, RUNNER_STOPPED_LEAD, RUNNER_STOPPED_NEXT, RUNNER_STOPPED_SHORT, runsErrorLead, runsShown, scoreLine, STATE_UNKNOWN, STOPPED_LABEL, STOPPED_REASON, writeWords,
} from './copy.ts';
import { liveExplanation } from './explain.ts';
import { fold } from './fold.ts';
import { liveScore, sessionTrialPatch } from './grade.ts';
import { replayBanner, replayCandidate, replayTransport, type ReplayCandidate } from './replay.ts';
import { cardCost, elapsedSince, elapsedText, finishedSeconds, firstTimestamp, liveRows, startTicker } from './rows.ts';
import { readEvents } from './store.ts';
import { theTransport } from './transport/select.ts';
import { currentTrial, RUN_SIZES, setCurrentTrial, type LiveRun, type Refusal, type TrialEnd, type TrialTransport } from './types.ts';

const POLL_MS = 1500;
const usd = (n: number) => `$${n.toFixed(2)}`;
// Why a launcher control is disabled, in its tooltip.
const NO_KEY_FIRST = 'Add a key first';
const CAP_RANGE = `Enter a cap from $0.01 to $${MAX_SESSION_CAP_USD}.`;
const BROWSER_DIRECT: Surface = { kind: 'browser-direct' };
const HOLD_NOTE = 'A batch holds its full amount until its trials end.';

// The refusals a higher session cap would lift.
const CAP_REFUSALS: readonly string[] = [REFUSAL_TEXT.trials.spend_refused_ceiling, REFUSAL_TEXT.trials.session_cap];

// A browser-direct trial a reload cut off and the tab resumed from its kept events (record.resumed).
const wasResumed = (record: ExplainRecord | null) => (record as { resumed?: boolean } | null)?.resumed === true;
const Resumed = () => <span data-testid="resumed" className="text-xs text-ink-muted">resumed after reload</span>;

const runnerUp = async (): Promise<boolean> => !(await runnerGone());

// J14: the official run's median duration per task, in seconds.
const taskMedians = (run: RunData): number[] => {
  const byTask = new Map<string, RunData['trials']>();
  for (const t of run.trials) byTask.set(t.task, [...(byTask.get(t.task) ?? []), t]);
  return [...byTask.values()].flatMap((ts) => {
    const m = medianDuration(ts.map((t) => t.record));
    return m === null ? [] : [m.seconds];
  });
};

// A replay on the card (A14): its transport over the fetched events, and where its grade is.
interface Replay { t: TrialTransport; id: string; name: string; banner: string; task: string; grade: Record<string, string | null> }

export function LiveTrial({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const hosted = useHosted();
  const t = theTransport(hosted);
  const key = useKeyStatus();
  const { tasks } = useTaskList();
  const task = useParams().get('task') ?? '';
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [current, setCurrent] = useState(currentTrial);
  const [runs, setRuns] = useState<LiveRun[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  // A2: the local runner's process is gone; the page probes for it and reloads when it is back.
  const [down, setDown] = useState(false);
  useRunnerRetry(down);
  const [showAll, setShowAll] = useState(false);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [replayBusy, setReplayBusy] = useState(false);
  const ids = useMemo(() => {
    const listed = (tasks ?? []).map((x) => x.id);
    return task !== '' && !listed.includes(task) ? [task, ...listed] : listed;
  }, [tasks, task]);
  const chosen = task || ids[0] || '';
  const noKey = key.kind === 'none';
  const { cap, spent: committed } = useSessionSpend();
  const [costs, setCosts] = useState<Partial<Record<number, number>>>({});
  const [bound, setBound] = useState(true);
  const refresh = useCallback(() => {
    t.runs().then((r) => (setRuns(r), setRunsError(null)), (e: unknown) => {
      setRunsError((e as Error).message);
      if (t.kind === 'local-runner') void runnerUp().then((up) => up || setDown(true));
    });
    void refreshSpent();
  }, [t]);
  // Each trial's state: the runner's committed spend changes when one starts or ends.
  const trialStates = (runs ?? []).map((r) => r.rows.map((x) => x.state).join()).join('|');
  useEffect(() => setCosts({}), [chosen]);
  // Projected again when the session's spend or a trial's state changes. The projection's
  // committed figure goes to the session store, the meter's source, so both read the same number.
  useEffect(() => {
    if (chosen === '') return;
    let current = true;
    for (const n of RUN_SIZES) {
      t.project({ task: chosen, trials: n, sessionCap: sessionCap() }).then((p) => {
        if (!current) return;
        setCosts((c) => ({ ...c, [n]: p.usd }));
        setBound(p.bound);
        setSpent(p.committed);
      }, () => undefined);
    }
    return () => {
      current = false;
    };
  }, [t, chosen, committed, trialStates]);
  // A size is over when its cost with the committed spend crosses the cap, as start checks it.
  const over = RUN_SIZES.filter((n) => costs[n] !== undefined && !admitTrial({ cap, spent: committed, estimate: costs[n] }).ok);
  const raise = over.length > 0 ? raiseTo(neededCap(costs[over[0]!]!, committed)) : null;
  const costId = useId();
  const results = useResults();
  const ready = results?.kind === 'ready' ? results : null;
  const typical = ready !== null && chosen !== '' ? typicalCost(ready.pilots, chosen) : null;
  const official = ready?.official ?? null;
  const duration = official === null ? null : durationWords(taskMedians(official));
  const candidate = ready !== null && chosen !== '' ? replayCandidate(official, ready.pilots, chosen) : null;

  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (down || runs === null || runs.every((r) => r.done)) return;
    const timer = setTimeout(refresh, POLL_MS);
    return () => clearTimeout(timer);
  }, [runs, refresh, down]);

  const names = useMemo(() => runNames(runs ?? [], tasks), [runs, tasks]);

  const open = (id: string) => {
    setReplay(null);
    setCurrentTrial(id);
    setCurrent(id);
  };

  async function launch(n: number, taskId = chosen) {
    if (busy || taskId === '') return;
    setBusy(true);
    setRefusal(null);
    try {
      const r = await t.start({ task: taskId, trials: n, sessionCap: sessionCap() });
      if (!r.ok) return setRefusal({ lead: r.lead, detail: r.detail });
      open(r.trialIds[0]!);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  // A16: the same task, once more.
  const runAgain = (taskId: string) => {
    if (taskId !== chosen) navigate({ task: taskId });
    void launch(1, taskId);
  };

  // A14: the published trial's events, then the card plays them.
  async function watch(c: ReplayCandidate) {
    if (replayBusy) return;
    setReplayBusy(true);
    try {
      const events = await fetchEvents(c.url);
      setReplay({
        t: replayTransport(events, c.trial.record),
        id: `replay.${c.run.runId}.${c.trial.name}`,
        name: `${liveTaskTitle(c.trial.task, tasks)} · recorded trial ${(c.trial.record.index ?? 0) + 1} of ${c.run.runId}`,
        banner: replayBanner(c),
        task: c.trial.task,
        grade: freshView('runs', { run: c.run.runId, trial: c.trial.name }),
      });
    } catch {
      setRefusal({ lead: 'The recorded trial could not be read.', detail: null });
    } finally {
      setReplayBusy(false);
    }
  }

  const onLost = useCallback(() => setDown(true), []);
  const { shown, hidden } = runsShown(runs ?? [], showAll);

  return (
    <Page title="Live trial" headingRef={headingRef} lead={`Pick a task and run it. You see each step the model takes, then the grade.${t.kind === 'local-runner' ? ' Trials run in the local runner on this computer.' : ''}`}>
      <Card title="Run a task">
        {/* With no key, the one thing to do comes first (ui-polish 5.2): Add key, the launcher's
            primary; beside it a recorded trial to watch (A14), which needs no key. */}
        {noKey && (
          <p data-testid="launcher-reason" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-ink">
            <span id={`${costId}-nokey`}>Add an API key to run trials.</span>
            <button type="button" className={BUTTON_PRIMARY} onClick={requestKey}>Add key</button>
            {candidate !== null && (
              <button type="button" className={BUTTON} disabled={replayBusy} onClick={() => void watch(candidate)} title="Plays a published trial of this task; no API call">
                <Play aria-hidden className="h-3 w-3" strokeWidth={2} />
                {replayBusy ? 'Loading the recorded trial…' : 'Watch a recorded trial'}
              </button>
            )}
          </p>
        )}
        <div className="space-y-3" data-testid="launcher">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs text-ink-muted">
              Task
              <select aria-label="Task" className={SELECT} value={chosen} onChange={(e) => navigate({ task: e.target.value })} disabled={noKey} title={noKey ? NO_KEY_FIRST : undefined}>
                {ids.map((id) => <option key={id} value={id}>{liveTaskTitle(id, tasks)}</option>)}
              </select>
            </label>
            <span className="flex flex-col gap-1 text-xs text-ink-muted" data-testid="launcher-model">
              Model
              <span className="flex h-8 items-center text-sm text-ink">{MODEL} at effort high</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* The amount sits beside its button, not in it, so the button's name is its visible
                text (axe label-content-name-mismatch); aria-describedby still reads it out, and the
                reason a size is disabled after it, which its tooltip says in short. Run ×1 is the
                primary action once there is a key; before that, Add key is. */}
            {RUN_SIZES.map((n) => (
              <span key={n} className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid={`run-x${n}`}
                  aria-describedby={[`${costId}-${n}`, ...(noKey ? [`${costId}-nokey`] : over.includes(n) ? [`${costId}-over`] : [])].join(' ')}
                  title={noKey ? NO_KEY_FIRST : over.includes(n) ? 'Over the session cap. Raise the cap below.' : busy ? 'A batch is starting' : chosen === '' ? 'Pick a task first' : undefined}
                  className={n === RUN_SIZES[0] && !noKey ? BUTTON_PRIMARY : BUTTON} disabled={noKey || busy || chosen === '' || over.includes(n)} onClick={() => void launch(n)}>
                  Run ×{n}
                </button>
                <span id={`${costId}-${n}`} data-testid={`run-cost-${n}`} className="text-xs tabular-nums text-ink-muted">{costs[n] === undefined ? '…' : costLine(typical?.usd ?? null, costs[n], bound)}</span>
              </span>
            ))}
          </div>
        </div>
        {typical !== null ? (
          <p data-testid="typical-cost" className="mt-2 text-ink-muted">
            “About {usd(typical.usd)} a trial” is the median of {typical.n} trial{typical.n === 1 ? '' : 's'} of this task in {typical.run}. {HOLD_NOTE}
          </p>
        ) : (
          <p data-testid="no-typical" className="mt-2 text-ink-muted">No pilot has run this task, so there is no typical cost yet. {HOLD_NOTE}</p>
        )}
        {!noKey && over.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p id={`${costId}-over`} data-testid="size-reason" className="text-ink-muted">{overCapText(over, costs, committed)}</p>
            {/* No button when the need is above the session maximum (gate F3): it could not lift the refusal. */}
            {raise !== null && raise > cap && <button type="button" className={BUTTON} onClick={() => setSessionCap(raise)}>Raise cap to ${raise}</button>}
          </div>
        )}
        <CapControl local={t.kind === 'local-runner'} />
        {refusal && (
          <ErrorNote testId="run-refusal" lead={refusal.lead} detail={refusal.detail}>
            {CAP_REFUSALS.includes(refusal.lead) && <p data-testid="cap-hint" className="mt-1 text-ink">Change the session cap under “Run a task” on this page.</p>}
          </ErrorNote>
        )}
      </Card>
      {replay !== null ? (
        <Trial key={replay.id} t={replay.t} id={replay.id} name={replay.name} task={replay.task} onEnd={noop} replay={{ banner: replay.banner, grade: replay.grade }} />
      ) : current !== null ? (
        <Trial key={current} t={t} id={current} name={trialName(current, runs, tasks)} task={trialTask(current, runs)} onEnd={refresh} onLost={onLost} onRunAgain={noKey ? undefined : runAgain} />
      ) : null}
      <Card title="Your runs">
        {runsError !== null && down && (
          <Notice nested tone="danger" role="alert" testId="runs-error" icon={CircleAlert}>
            <p className="font-medium text-ink">{RUNNER_STOPPED}</p>
          </Notice>
        )}
        {runsError !== null && !down && (
          <Notice nested tone="danger" role="alert" testId="runs-error" icon={CircleAlert} detail={runsError} action={<button type="button" className={BUTTON_PRIMARY} onClick={refresh}>Retry</button>}>
            <p className="font-medium text-ink">{runsErrorLead(hosted)}</p>
          </Notice>
        )}
        {runs !== null && runs.length === 0 && (
          <Notice nested tone="info" testId="no-live-runs" icon={Play}>
            <p>No runs yet. Press Run ×{RUN_SIZES[0]} to start one trial. A trial takes {duration ?? 'a few minutes'}, and you see each step as it runs.</p>
            {official !== null ? (
              <a href={hrefWith(freshView('runs', { run: official.runId }))} onClick={onNav(freshView('runs', { run: official.runId }))} className={`mt-2 inline-block text-xs ${LINK}`}>
                See the official run's {official.summary?.totals.trials ?? official.trials.length} trials in Runs
              </a>
            ) : (
              <a href={hrefWith(freshView('runs'))} onClick={onNav(freshView('runs'))} className={`mt-2 inline-block text-xs ${LINK}`}>See the published trials in Runs</a>
            )}
          </Notice>
        )}
        <div className="space-y-3">
          {shown.map((r) => <RunRows key={r.runId} run={r} name={names.get(r.runId)!} current={replay === null ? current : null} onOpen={open} down={down} />)}
        </div>
        {hidden > 0 && (
          <button type="button" className={`${BUTTON} mt-3`} onClick={() => setShowAll(true)}>Show older runs ({hidden})</button>
        )}
      </Card>
    </Page>
  );
}

const noop = () => undefined;

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
          <input id={id} inputMode="decimal" autoComplete="off" className={`${SELECT} w-28`} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={parsed === null} />
        </label>
        <button type="submit" className={BUTTON} disabled={parsed === null || parsed === cap} title={parsed === null ? CAP_RANGE : parsed === cap ? 'This is the current cap' : undefined}>Set cap</button>
      </div>
      {parsed === null && <p data-testid="cap-invalid" className="mt-1 text-xs text-danger">{CAP_RANGE}</p>}
      <div data-testid="cap-where" className="mt-2 text-xs text-ink-muted">
        <p>Each batch is checked against this cap before any call, so spend never goes over it. The amount beside each Run button is what that batch holds.</p>
        <details className="mt-1">
          <summary className="cursor-pointer pointer-coarse:py-2.5">More about the cap</summary>
          <p className="mt-1">
            You can also set it in the key gate. The cap is kept for this tab only, so another tab has its own
            {local ? '; the runner counts the spend of every tab.' : ', with its own spend.'}
          </p>
        </details>
      </div>
    </form>
  );
}

// The card's explanation (A4): the full one, as the session trial page builds it, once the trial
// has ended and the task's checks have loaded; the record alone until then.
function useExplanation(record: ExplainRecord | null, events: readonly TrialEvent[], task: string, settled: boolean, trialId: string): Explanation | null {
  const [full, setFull] = useState<Explanation | null>(null);
  useEffect(() => {
    if (!settled || record === null) return;
    let live = true;
    liveExplanation(record, events, task, trialId).then((x) => live && setFull(x), () => undefined);
    return () => {
      live = false;
    };
  }, [settled, record, events, task, trialId]);
  return full ?? (record ? explainTrial(record, null, { events }) : null);
}

interface ReplayView { banner: string; grade: Record<string, string | null> }

function Trial({ t, id, name, task, onEnd, onLost, onRunAgain, replay }: {
  t: TrialTransport;
  id: string;
  name: string;
  task: string;
  onEnd: () => void;
  onLost?: () => void;
  onRunAgain?: ((task: string) => void) | undefined;
  replay?: ReplayView;
}) {
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
      if (x.message === RUNNER_STOPPED) onLost?.();
      onEnd();
    });
    return () => {
      ac.abort();
      cancelAnimationFrame(frame);
    };
  }, [t, id, onEnd, onLost]);
  const f = useMemo(() => fold(events), [events]);
  // A8: the trial page's rows, with Turn dividers, the prompt and the elapsed time.
  const live = useMemo(() => liveRows(events), [events]);
  const running = end === null;
  // The Elapsed meter ticks once a second while the trial runs (gate P25U-S4F-1 M1) and freezes
  // at the record's duration once it ends.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    return startTicker(() => setNow(Date.now()));
  }, [running]);
  // A2: the runner's process is gone; the card stays as it was, Stop disabled, and says so.
  const lost = end?.message === RUNNER_STOPPED;
  const record = (end?.record ?? f.record) as ExplainRecord | null;
  const first = firstTimestamp(events);
  const elapsed = running ? (first === null ? null : elapsedSince(first, now)) : finishedSeconds(record as { started?: string; ended?: string } | null, events);
  const explanation = useExplanation(record, events, task, !running, id);
  // A1: a trial that is not counted, in words that agree with its outcome (gate F1); CANCELLED is
  // the user's Stop (A1b).
  const infra = explanation === null ? null : infraWords(explanation.outcome, record?.detail);
  const cancelled = explanation?.outcome === 'CANCELLED';
  // On browser-direct every call goes through the relay, so a relay failure that stopped the trial
  // gets the key gate's fallback (ruling 2026-10-28T02:00).
  const hosted = useHosted();
  const failed = f.end?.type === 'error' ? f.end : null;
  const relay = failed !== null && hosted ? trialRelayReason(failed) : null;
  // A line that carries the relay's words says whose words they are.
  const errorLine = failed === null ? null : hosted ? relayLine(failed.message) : failed.message;
  const panelId = useId();
  // One status line for screen readers, in place of a live trajectory (ui-polish 5.3): it changes
  // only when the turn or the final state does. "Starting" until the first model turn, and the
  // final state in the outcome chip's words, never a raw code (#185 m2). At phone width the Turn
  // meter sits right under it, so the turn number is for screen readers only there (m3).
  const status = running
    ? f.turn === 0 ? 'Starting' : <><span data-testid="status-turn" className="max-sm:sr-only">Turn {f.turn}, </span><span className="max-sm:capitalize">running</span></>
    : lost ? RUNNER_STOPPED_SHORT
      : end.state === 'graded' && explanation ? `Finished: ${infra?.status ?? finalWords(explanation)}` : end.state === 'cancelled' ? (replay ? REPLAY_STOPPED : 'Stopped') : 'Stopped with an error';

  async function stop() {
    setStopping(true);
    await t.cancel(id);
  }

  const score = end?.state === 'graded' && record !== null ? liveScore(record) : null;
  const gradeHref = replay ? replay.grade : sessionTrialPatch(id);

  return (
    <section data-testid="live-trial" data-trial={id} data-state={running ? 'running' : lost ? 'runner-down' : end.state} data-replay={replay ? 'true' : undefined} className={CARD}>
      {replay && (
        <p data-testid="replay-banner" className="flex items-center gap-2 rounded-t-lg border-b border-line bg-canvas px-4 py-2 text-xs text-ink">
          <Play aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
          <span>{replay.banner}</span>
        </p>
      )}
      <header className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-canvas/60 px-4 py-3 dark:bg-canvas/40 ${replay ? '' : 'rounded-t-lg'}`}>
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <h2 title={id} className={`break-words ${CARD_TITLE}`}>{name}</h2>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-ink-muted">
            <code data-testid="trial-id" className="min-w-0 break-words font-mono">{breakable(id)}</code>
            <span role="status" className="font-medium text-ink">{status}</span>
          </p>
        </div>
        <Meter label="Turn" value={String(f.turn)} testId="meter-turn" />
        <Meter label="Elapsed" value={elapsedText(elapsed)} testId="meter-elapsed" />
        <Meter label="Tokens" value={`${f.tokens.input + f.tokens.cache_read + f.tokens.cache_write} in, ${f.tokens.output} out`} testId="meter-tokens" />
        <Meter label="Cost" value={usd(cardCost(record as { cost_usd?: number | null; judge_cost_usd?: number | null } | null, f.cost))} testId="meter-cost" />
        {wasResumed(record) && <Resumed />}
        {/* Stop while the trial runs; disabled once the runner is gone (A2); a finished card offers
            Run again and the grade in its footer instead (A16). */}
        {(running || lost) && (
          <button type="button" onClick={() => void stop()} disabled={!running || stopping} className={`${BUTTON} ml-auto`}>
            <Square aria-hidden className="h-3 w-3" strokeWidth={2} />
            {stopping && running ? 'Stopping…' : replay ? 'Stop replay' : 'Stop'}
          </button>
        )}
      </header>
      <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <ol className="min-w-0 space-y-1.5" data-testid="trajectory">
          {/* A8: the trial page's rows (RowItem: "Step n", the target, writes in words, the
              arguments and result behind the row) and a divider where the turn changes. */}
          {live.prompt !== null && (
            <li>
              <details className="rounded-sm bg-canvas px-3 py-2 text-xs text-ink-muted">
                <summary className="cursor-pointer text-ink pointer-coarse:py-2.5">Task prompt</summary>
                <p className="mt-1 whitespace-pre-wrap break-words">{live.prompt}</p>
              </details>
            </li>
          )}
          {live.rows.map((row) => (row.kind === 'turn'
            ? <li key={row.key} data-testid="turn-divider" className="flex items-center gap-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"><span>Turn {row.turn}</span><span aria-hidden className="h-px flex-1 bg-line" /></li>
            : <RowItem key={row.key} row={row} />))}
          {running && (
            <li data-testid="running-line" className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.75} />
              {events.length === 0 ? 'Starting…' : 'Running…'}
            </li>
          )}
          {!running && !lost && live.rows.length === 0 && <li className="text-xs text-ink-muted">No reply came from the model.</li>}
        </ol>
        {/* A9: what the model changed, in words; the hashes behind a disclosure. */}
        <aside className="min-w-0 space-y-2 text-xs" data-testid="state-diff">
          <h3 className="font-medium text-ink">What the model changed</h3>
          {f.written.length === 0
            ? <p className="text-ink-muted">{running ? 'Nothing yet.' : 'Nothing.'}</p>
            : (
              <ul className="space-y-0.5">
                {f.written.map((w) => <li key={w} data-testid="write-row" className="break-all text-ink">{writeWords(w)} <code className="font-mono text-ink-muted">{w}</code></li>)}
              </ul>
            )}
          <details className="text-ink-muted">
            <summary className="cursor-pointer pointer-coarse:py-2.5">Integrity check (state hashes)</summary>
            <p className="mt-1">The same final hash on a replay proves the grade is reproducible.</p>
            <p className="mt-1 break-all">Initial hash <span className="font-mono">{f.hashes.initial?.slice(0, 12) ?? '…'}</span></p>
            <p className="break-all">Current hash <span className="font-mono">{f.hashes.latest?.slice(0, 12) ?? '…'}</span></p>
            {f.hashes.final && <p className="break-all">Final hash <span data-testid="final-hash" className="font-mono text-ink">{f.hashes.final}</span></p>}
          </details>
        </aside>
      </div>
      {!running && (
        <footer className="space-y-2 border-t border-line px-4 py-3" data-testid="trial-end">
          {lost && (
            <ErrorNote testId="runner-stopped" lead={RUNNER_STOPPED_LEAD} detail={null}>
              <p className="mt-1 text-ink">{RUNNER_STOPPED_NEXT}</p>
            </ErrorNote>
          )}
          {explanation && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <OutcomeChip outcome={explanation.outcome} fault={shownFault(explanation)} />
              {infra !== null ? <InfraChip words={infra.chip} outcome={explanation.outcome} /> : explanation.outcome !== 'PASS' && <FaultLabel e={explanation} />}
              {score !== null && <GradeButton outcome={explanation.outcome} patch={gradeHref} />}
              {!replay && onRunAgain !== undefined && (
                <button type="button" className={BUTTON} onClick={() => onRunAgain(task)}>
                  <Play aria-hidden className="h-3 w-3" strokeWidth={2} />
                  Run again
                </button>
              )}
              {explanation.outcome !== 'PASS' && <span data-testid="reason" className="basis-full text-ink-muted">{cancelled ? STOPPED_REASON : explanation.reason}</span>}
              {!cancelled && explanation.outcome !== 'PASS' && explanation.secondary_reason !== null && <span data-testid="secondary-reason" className="basis-full text-xs text-ink-muted">{explanation.secondary_reason}</span>}
            </div>
          )}
          {score !== null && <p data-testid="live-score" className="text-ink-muted">{scoreLine(score)}</p>}
          {relay !== null && f.end?.type === 'error' ? (
            <>
              <ErrorNote testId="trial-error" lead={RELAY_TRIAL_TEXT[relay].lead} detail={errorLine}>
                <p className="mt-1 text-ink">{RELAY_TRIAL_TEXT[relay].next}</p>
                <button type="button" className={`${BUTTON} mt-2 h-7`} onClick={() => document.getElementById(panelId)?.focus()}>Show the steps</button>
              </ErrorNote>
              {/* The shell shows the panel only on Overview and Tasks; here it follows the error, outside the alert. */}
              <LocalRunPanel id={panelId} surface={BROWSER_DIRECT} className="mt-3" />
            </>
          ) : f.end?.type === 'error' ? (
            <ErrorNote testId="trial-error" lead={f.end.status === 'INFRA_API' ? 'The API stopped this trial.' : 'This trial stopped with an error.'} detail={errorLine} />
          ) : !lost && end.message !== null && end.message !== 'stopped watching' && end.message !== REPLAY_STOPPED && events.length === 0 ? (
            <ErrorNote testId="trial-error" lead="This trial did not run." detail={end.message} />
          ) : null}
        </footer>
      )}
    </section>
  );
}

// A1: the chip for a trial that is not counted, in words that agree with its outcome (infraWords;
// copy rule C4), in place of FaultLabel's one infra chip; the help icon opens the glossary at the
// infra label, as FaultLabel's does.
function InfraChip({ words, outcome }: { words: string; outcome: string }) {
  return (
    <span className="inline-flex items-center gap-x-1">
      <span className={`${CHIP} whitespace-nowrap border-dashed border-line-strong font-normal text-ink-muted`}>
        <span data-testid="label" data-label={outcome === 'CANCELLED' ? 'stopped' : 'infra'} data-outcome={outcome}>{words}</span>
      </span>
      <GlossaryLink anchor="fault-infra" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md no-underline text-ink-muted hover:bg-canvas hover:text-ink pointer-coarse:h-11 pointer-coarse:w-11">
        <CircleHelp aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="sr-only">How the infra label is given</span>
      </GlossaryLink>
    </span>
  );
}

// A5: the full grade (every gate check, the rubric rows, the attribution, the trajectory) one
// click away, as a button named by what the reader will find there (trace row N10).
function GradeButton({ outcome, patch }: { outcome: string; patch: Record<string, string | null> }) {
  return <a data-testid="open-grade" href={hrefWith(patch)} onClick={onNav(patch)} className={BUTTON}>{gradeButtonLabel(outcome)}</a>;
}

// A finished trial's state in the words its chips use: the outcome of a counted trial with the
// label shown beside it ("FAIL, fault: model"), else the trial's mark in words ("API problem, not
// counted"), so the status line never reads a raw code such as INFRA_API (#185 m2).
function finalWords(e: Explanation): string {
  const label = shownLabel(e);
  if (isValid(e.outcome)) return e.outcome === 'PASS' && label === null ? 'PASS' : `${e.outcome}${label === null ? '' : `, fault: ${label}`}`;
  if (e.outcome === 'CANCELLED') return STOPPED_LABEL;
  if (shownFault(e) === 'infra') return 'API problem, not counted';
  return `${markLabel(markOf(e.outcome, shownFault(e)))}, not counted`;
}

// The viewer's clock time of an ISO instant ("22:56"), or null for a value it cannot read.
function clockTime(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type Titled = Parameters<typeof liveTaskTitle>[1];

// The task a trial id (run.task.index) names, from the runs list when it holds the trial.
function trialTask(id: string, runs: readonly LiveRun[] | null): string {
  const row = runs?.flatMap((r) => r.rows).find((x) => x.trialId === id);
  return row?.taskId ?? id.split('.').slice(1, -1).join('.');
}

// A run or a trial in words (ui-polish 5.1): "<task title> · trial 1 of 3 · started 22:56". The raw
// id stays in the heading's title and in a small code. Before the runs list holds the trial, the
// task comes from its id (run.task.index).
function trialName(id: string, runs: readonly LiveRun[] | null, tasks: Titled): string {
  const run = runs?.find((r) => r.rows.some((x) => x.trialId === id));
  const row = run?.rows.find((x) => x.trialId === id);
  const at = run ? clockTime(run.started) : null;
  return [
    liveTaskTitle(row?.taskId ?? id.split('.').slice(1, -1).join('.'), tasks),
    ...(run && row ? [`trial ${row.index + 1} of ${run.rows.length}`] : []),
    ...(at ? [`started ${at}`] : []),
  ].join(' · ');
}

function runName(run: LiveRun, tasks: Titled): string {
  const at = clockTime(run.started);
  return [run.tasks.map((x) => liveTaskTitle(x, tasks)).join(', '), `${run.rows.length} trial${run.rows.length === 1 ? '' : 's'}`, ...(at ? [`started ${at}`] : [])].join(' · ');
}

// Each run's heading, unique on the page: two runs of the same task started in the same minute
// read alike, so the later ones get " (2)", " (3)" in the order the runs list holds them, and each
// row button's name ("<run heading>, trial n") is unique too (#185 m1).
function runNames(runs: readonly LiveRun[], tasks: Titled): Map<string, string> {
  const seen = new Map<string, number>();
  return new Map(runs.map((r) => {
    const name = runName(r, tasks);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return [r.runId, n === 1 ? name : `${name} (${n})`];
  }));
}

// A trial id (run.task.index) with a line-break opportunity after each dot, so a narrow screen
// breaks it between its parts rather than inside one.
const breakable = (id: string) => id.split('.').flatMap((part, i, parts) => (i === parts.length - 1 ? [part] : [`${part}.`, <wbr key={i} />]));

function Meter({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <span className="text-xs text-ink-muted">
      {label} <span data-testid={testId} className="font-medium text-ink">{value}</span>
    </span>
  );
}

// A15: the run's heading, with its raw id in the title only, then one line per trial. down (gate
// F5): the runner is gone, so a run or a row that was running is of unknown state, not running.
function RunRows({ run, name, current, onOpen, down }: { run: LiveRun; name: string; current: string | null; onOpen: (id: string) => void; down: boolean }) {
  return (
    <div data-testid="live-run" data-run={run.runId} data-trials={run.rows.length}>
      <p className="text-ink-muted">
        <span data-testid="run-name" title={run.runId} className="font-medium text-ink">{name}</span>
        {run.done ? '' : down ? `, ${STATE_UNKNOWN}` : ', running'}{run.stopped ? `, stopped: ${run.stopped}` : ''}
      </p>
      <ul className="mt-1 divide-y divide-line rounded-sm border border-line">
        {run.rows.map((row) => <LiveRow key={row.trialId} row={row} runName={name} current={current === row.trialId} onOpen={onOpen} down={down} />)}
      </ul>
    </div>
  );
}

// FaultLabel shows its own "not human-audited" chip beside a failure label, so the row adds the
// marker only where it has none.
const labelled = (e: Explanation) => e.outcome !== 'PASS' && e.fault !== 'infra' && e.label !== null;

// runName: the run's heading; each row button's name carries it, so two runs' "Trial 1" rows are
// told apart by a screen reader (#185 m1). One line (A15): the outcome, the label, the decisive
// check, the score and the grade button; the reason is on the card and the trial page.
function LiveRow({ row, runName, current, onOpen, down }: { row: LiveRun['rows'][number]; runName: string; current: boolean; onOpen: (id: string) => void; down: boolean }) {
  const [events, setEvents] = useState<TrialEvent[]>([]);
  useEffect(() => {
    if (row.record !== null) void readEvents(row.trialId).then(setEvents, () => undefined);
  }, [row.trialId, row.record]);
  const e = useExplanation(row.record, events, row.taskId, row.record !== null, row.trialId);
  const infra = e === null ? null : infraWords(e.outcome, row.record?.detail);
  const cancelled = e?.outcome === 'CANCELLED';
  const score = row.state === 'graded' && row.record !== null ? liveScore(row.record) : null;
  // Gate F5: a row that was queued or running when the runner died is of unknown state.
  const stale = down && (row.state === 'queued' || row.state === 'running');
  return (
    <li data-testid="live-row" data-trial={row.trialId} data-state={stale ? 'unknown' : row.state} data-outcome={e?.outcome ?? ''} className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => onOpen(row.trialId)} aria-current={current} aria-label={`${runName}, trial ${row.index + 1}`} title={row.trialId} className="min-w-0 break-all text-left font-medium text-ink hover:underline pointer-coarse:min-h-11">
          Trial {row.index + 1}
        </button>
        {e ? <OutcomeChip outcome={e.outcome} fault={shownFault(e)} /> : <span className="text-xs text-ink-muted">{stale ? STATE_UNKNOWN : row.state}</span>}
        {e && (infra !== null ? <InfraChip words={infra.chip} outcome={e.outcome} /> : e.outcome !== 'PASS' && <FaultLabel e={e} />)}
        {e && !cancelled && e.decisive_check && <code data-testid="decisive" className="break-all rounded-sm bg-canvas px-1 text-xs text-ink">{e.decisive_check.id}</code>}
        {e && !cancelled && !e.audited && !labelled(e) && <span data-testid="audit-marker" className="text-xs text-ink-muted">{NOT_AUDITED_MARKER}</span>}
        {wasResumed(row.record) && <Resumed />}
        {score !== null && e && (
          <>
            <span data-testid="live-score" className="text-xs text-ink-muted">{scoreLine(score, false)}</span>
            <GradeButton outcome={e.outcome} patch={sessionTrialPatch(row.trialId)} />
          </>
        )}
      </div>
      {!e && row.error !== null && <p className="mt-1 break-words text-ink-muted">{row.error}</p>}
    </li>
  );
}
