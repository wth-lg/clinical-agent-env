// The trial detail (plan phase P16; design section 7, "Trial detail (two-pane)"), the Runs view's
// screen for ?trial=: a header that says at once why the trial ended as it did, then two panes,
// the trajectory on the left and five tabs on the right (Grading, Attribution, State diff,
// Environment, Raw; ?tab=, grading by default). Below the lg breakpoint the panes stack, the tabs
// first (also first in the DOM, so focus order matches), so a long trajectory does not push them
// off the screen.
//
// The header, visible on open with no click: the outcome, the attribution label with its
// glossary link (and the not-audited marker when the trial has no audit row), the one-line
// reason, the fault and the criterion that decided it, the decisive failing check (id, the policy
// line it enforces, what it requires and what the trial left) with a link to the decisive step
// (on an ENV_ERROR, to the tool call that failed), and M1-M5. All of it is
// packages/core/explain.ts explainTrial over the record and audit row: the Runs row's explanation
// first, then fullExplanation (results.ts) when it arrives, the one context cli/audit-check.ts
// uses. Every tab panel stays mounted (the inactive ones hidden), so a replay or an open row
// survives a tab change.
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { MET_TEXT, type Explanation } from '../../../../packages/core/explain.ts';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { fetchEvents, fullExplanation, useResults, type RunData, type Trial } from '../data/results.ts';
import { FaultLabel, GlossaryLink, HashText, Notice, OutcomeChip } from '../data/ui.tsx';
import { hrefWith, navigate, onNav, useParams } from '../data/url.ts';
import { runnerToken } from '../keygate/runner.ts';
import { Attribution, criterionPhrase, criterionText, FAULT_WORD, LINK, StepLink } from './Attribution.tsx';
import { EnvironmentTab, Raw } from './Details.tsx';
import { Grading } from './Grading.tsx';
import { returnTo } from './back.ts';
import { resolveTrial } from './resolve.ts';
import { StateDiff } from './StateDiff.tsx';
import { internalErrorRow, trajectoryOf, type Row } from './steps.ts';
import { Trajectory, type Loaded } from './Trajectory.tsx';

export const TABS = [
  { id: 'grading', label: 'Grading' },
  { id: 'attribution', label: 'Attribution' },
  { id: 'state-diff', label: 'State diff' },
  { id: 'environment', label: 'Environment' },
  { id: 'raw', label: 'Raw' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const tabOf = (v: string | null): TabId => TABS.find((t) => t.id === v)?.id ?? 'grading';

// Back to the list: the run's filters stay, the trial and its tab go.
const BACK = { trial: null, tab: null };

// from: the trial on screen. On open, the page starts at its header with focus on the heading,
// however far down the list the trial was opened from (review-ui-P16-1 F1); Back to Runs returns
// to its row (F6).
function Frame({ title, headingRef, from, children }: { title: string; headingRef?: Ref<HTMLHeadingElement> | undefined; from?: { run: string; trial: string }; children: React.ReactNode }) {
  const h1 = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (from === undefined) return;
    const main = h1.current?.closest('main');
    if (main) main.scrollTop = 0;
    h1.current?.focus({ preventScroll: true });
  }, [from?.run, from?.trial]);
  const back = onNav(BACK);
  return (
    <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      <a
        href={hrefWith(BACK)}
        onClick={(ev) => {
          if (from !== undefined) returnTo(from.run, from.trial);
          back(ev);
        }}
        className={`inline-flex items-center gap-1 text-xs ${LINK}`}
      >
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />Back to Runs
      </a>
      <h1
        ref={(el) => {
          h1.current = el;
          if (typeof headingRef === 'function') headingRef(el);
          else if (headingRef) (headingRef as React.MutableRefObject<HTMLHeadingElement | null>).current = el;
        }}
        tabIndex={-1}
        className="mt-2 break-all text-base font-semibold text-ink focus-visible:outline-none"
      >
        {title}
      </h1>
      <div className="mt-2 space-y-4 sm:mt-3">{children}</div>
    </section>
  );
}

export function TrialPage({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const results = useResults();
  const params = useParams();
  const trial = params.get('trial') ?? '';
  const runId = params.get('run');
  if (results === null) return <Frame title={trial} headingRef={headingRef}><Notice>Loading the published results…</Notice></Frame>;
  if (results.kind === 'error') return <Frame title={trial} headingRef={headingRef}><Notice testId="error-state">The published results cannot be read: {results.message}</Notice></Frame>;
  if (runId === 'session') return <Frame title={trial} headingRef={headingRef}><SessionNotice /></Frame>;
  const runs = [...(results.official ? [results.official] : []), ...results.pilots];
  const r = resolveTrial(runs, runId, trial);
  if (r.kind === 'none-nonpass') return <Frame title="First non-pass trial" headingRef={headingRef}><Notice testId="empty-state">{r.message}</Notice></Frame>;
  if (r.kind !== 'trial') return <Frame title={trial} headingRef={headingRef}><Notice testId="error-state">{r.message}</Notice></Frame>;
  return <Detail key={`${r.run.runId}/${r.trial.name}`} t={r.trial} run={r.run} files={results.files} tab={tabOf(params.get('tab'))} headingRef={headingRef} />;
}

function Detail({ t, run, files, tab, headingRef }: { t: Trial; run: RunData; files: ReadonlySet<string>; tab: TabId; headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const [full, setFull] = useState<Explanation | null>(null);
  const [events, setEvents] = useState<Loaded<TrialEvent[]> | null>(() => (t.trajectoryUrl === null && !t.record.trajectory ? null : { state: 'loading' }));
  const [current, setCurrent] = useState<{ step: number; seq: number } | null>(null);
  useEffect(() => {
    let live = true;
    fullExplanation(t, run, files).then((x) => live && setFull(x), () => undefined);
    if (t.trajectoryUrl === null) {
      if (t.record.trajectory) setEvents({ state: 'error', message: `${run.dir}/${t.record.trajectory} is not published in this build.` });
    } else {
      fetchEvents(t.trajectoryUrl).then((v) => live && setEvents({ state: 'ready', value: v }), (e: unknown) => live && setEvents({ state: 'error', message: e instanceof Error ? e.message : String(e) }));
    }
    return () => {
      live = false;
    };
  }, [t, run, files]);
  const folded = useMemo<Loaded<ReturnType<typeof trajectoryOf>> | null>(() => (events === null || events.state !== 'ready' ? events : { state: 'ready', value: trajectoryOf(events.value) }), [events]);
  const traj = folded?.state === 'ready' ? folded.value : null;
  const onStep = (n: number) => setCurrent((c) => ({ step: n, seq: (c?.seq ?? 0) + 1 }));
  const e = full ?? t.explanation;
  // The resources the decisive check names (its evidence ids), marked in State diff.
  const decisiveIds = ((t.record.checks ?? []) as ReadonlyArray<{ id: string; ids?: readonly string[] }>).find((c) => c.id === e.decisive_check?.id)?.ids ?? [];
  return (
    <Frame title={t.name} headingRef={headingRef} from={{ run: run.runId, trial: t.name }}>
      <div
        data-testid="trial-detail"
        data-trial={t.name}
        data-run={run.runId}
        data-tab={tab}
        data-full={String(full !== null)}
        data-criteria={e.criteria.map((c) => `${c.id}: ${MET_TEXT[String(c.met)]}`).join(', ')}
        className="space-y-3 sm:space-y-4"
      >
        <p className="text-ink-muted">
          Run <span className="font-medium text-ink">{run.runId}</span>{run.official ? ', the official run' : ', a pilot run, not counted in the results'}. Task <span className="font-medium text-ink">{t.task}</span>.
        </p>
        <Header t={t} e={e} rows={traj?.rows ?? null} onStep={onStep} />
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <Tabs tab={tab}>
            {{
              grading: <Grading t={t} steps={traj?.steps ?? null} onStep={onStep} decisive={e.decisive_check?.id ?? null} />,
              attribution: <Attribution t={t} e={e} steps={traj?.steps ?? null} onStep={onStep} />,
              'state-diff': <StateDiff t={t} events={events} steps={traj?.steps ?? null} written={traj?.written ?? []} onStep={onStep} decisiveIds={decisiveIds} />,
              environment: <EnvironmentTab t={t} />,
              raw: <Raw t={t} />,
            }}
          </Tabs>
          {/* After the tabs in the DOM, so focus order follows the stacked screen; on the left at lg. */}
          <div className="min-w-0 lg:sticky lg:top-4 lg:order-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
            <Trajectory data={folded} current={current} />
          </div>
        </div>
      </div>
    </Frame>
  );
}

// run=session: the runs the local runner started in this process (docs/requirements/ui-contract.md).
// The Runs view reads only published runs, so the notice says where those trials are and links
// there; on the hosted site, with no runner, there are no session runs.
function SessionNotice() {
  const go = onNav({ view: 'live', run: null, trial: null, tab: null });
  const link = <a href={hrefWith({ view: 'live', run: null, trial: null, tab: null })} onClick={go} className={LINK}>Open Live trial</a>;
  return (
    <Notice testId="session-notice">
      {runnerToken() === null
        ? <>No runs in this session. The trials that you run in this tab are under Your runs in the Live trial view. {link}</>
        : <>The trials that this local runner started are under Your runs in the Live trial view. {link}</>}
    </Notice>
  );
}

// Why the trial ended as it did, before any click (see the header comment). rows: the trajectory,
// once it loads; an ENV_ERROR's Where is the tool call that failed with an internal error.
function Header({ t, e, rows, onStep }: { t: Trial; e: Explanation; rows: readonly Row[] | null; onStep: (n: number) => void }) {
  const nonPass = e.outcome !== 'PASS';
  const failedCall = e.fault === 'env' && e.decisive_step === null && rows !== null ? internalErrorRow(rows) : null;
  return (
    <section aria-label="Why this trial ended as it did" data-testid="trial-header" className={`min-w-0 rounded-sm border border-line bg-surface p-4 ${nonPass ? 'border-l-2 border-l-danger' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <OutcomeChip outcome={e.outcome} fault={e.fault} />
        {nonPass && <FaultLabel e={e} />}
        <span className="ml-auto text-xs text-ink-muted" title="Agent and judge cost">${(t.record.cost_usd + (t.record.judge_cost_usd ?? 0)).toFixed(2)}</span>
      </div>
      {!e.valid && e.deciding && (
        <p data-testid="plain-reason" className="mt-2 break-words font-medium text-ink">
          Not counted: {criterionPhrase(e.deciding.id)}. The {e.fault === 'infra' ? 'infrastructure' : FAULT_WORD[e.deciding.fault]} is at fault, not the model.
        </p>
      )}
      <Reason reason={e.reason} muted={!e.valid} />
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_minmax(0,1fr)] [&_dd]:min-w-0 [&_dd]:break-words [&_dt]:text-ink-muted">
        <dt>Fault</dt>
        <dd data-testid="detail-fault">
          {e.fault === null ? 'none: the trial passed' : <GlossaryLink anchor={`fault-${e.fault}`} className={LINK}>{FAULT_WORD[e.fault]}</GlossaryLink>}
          {e.deciding && <>, decided by {criterionPhrase(e.deciding.id)} (<GlossaryLink anchor={`criterion-${e.deciding.id}`} className={LINK}>{e.deciding.id}</GlossaryLink>)<span className="block text-xs text-ink-muted"><HashText text={e.deciding.evidence} /></span></>}
        </dd>
        {e.decisive_check && (
          <>
            <dt>Decisive check</dt>
            <dd data-testid="decisive-check" data-id={e.decisive_check.id}>
              <code data-testid="decisive" className="break-all rounded-sm bg-canvas px-1 text-xs text-ink">{e.decisive_check.id}</code>
              {e.decisive_check.traces_to && <span className="text-ink-muted"> (enforces {e.decisive_check.traces_to})</span>}
              <span className="block">requires {e.decisive_check.expected}</span>
              <span className="block">found {e.decisive_check.found}</span>
            </dd>
          </>
        )}
        {e.decisive_step !== null && (
          <>
            <dt>Where</dt>
            <dd><StepLink n={e.decisive_step} onStep={onStep} testId="decisive-step-link">Decisive step {e.decisive_step}</StepLink></dd>
          </>
        )}
        {failedCall !== null && (
          <>
            <dt>Where</dt>
            <dd><StepLink n={failedCall.step} onStep={onStep} testId="failed-call-link">Step {failedCall.step}</StepLink>: the {failedCall.name} call that failed with an internal error</dd>
          </>
        )}
        <dt>Criteria</dt>
        <dd>
          <ul data-testid="header-criteria" className="flex flex-wrap gap-x-3 gap-y-0.5">
            {e.criteria.map((c) => (
              <li key={c.id} data-id={c.id} data-met={String(c.met)} title={criterionText(c.id)}>
                <GlossaryLink anchor={`criterion-${c.id}`} className={LINK}>{c.id}</GlossaryLink>
                <span className={c.met === true ? 'text-ink-muted' : 'text-ink'}>: {MET_TEXT[String(c.met)]}</span>
              </li>
            ))}
          </ul>
        </dd>
      </dl>
    </section>
  );
}

// The reason as explainTrial gives it; a model failure's '; Kind: ...' on a line of its own
// (review-ui-P16-1 F5). The text is unchanged: the separator stays for screen readers.
function Reason({ reason, muted }: { reason: string; muted: boolean }) {
  const at = reason.indexOf('; Kind: ');
  return (
    <p data-testid="reason" className={`mt-2 break-words ${muted ? 'font-mono text-xs text-ink-muted' : 'font-medium text-ink'}`}>
      {at < 0 ? reason : <>{reason.slice(0, at)}<span className="sr-only">; </span><span data-testid="reason-kind" className="block font-normal">{reason.slice(at + 2)}</span></>}
    </p>
  );
}

// The tab strip and its panels (WAI-ARIA tabs: arrow keys, Home and End move between tabs).
function Tabs({ tab, children }: { tab: TabId; children: Record<TabId, React.ReactNode> }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const go = (id: TabId, focus = false) => {
    navigate({ tab: id });
    if (focus) refs.current[id]?.focus();
  };
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((x) => x.id === tab);
    const to = ev.key === 'ArrowRight' ? (i + 1) % TABS.length : ev.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : ev.key === 'Home' ? 0 : ev.key === 'End' ? TABS.length - 1 : null;
    if (to === null) return;
    ev.preventDefault();
    go(TABS[to]!.id, true);
  };
  return (
    <div className="min-w-0 rounded-sm border border-line bg-surface lg:order-2">
      <div role="tablist" aria-label="Trial" onKeyDown={onKey} className="flex flex-wrap gap-x-1 border-b border-line px-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            ref={(el) => {
              refs.current[x.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${x.id}`}
            aria-selected={x.id === tab}
            aria-controls={`panel-${x.id}`}
            tabIndex={x.id === tab ? 0 : -1}
            onClick={() => go(x.id)}
            className={`-mb-px border-b-2 px-2 py-2 text-sm ${x.id === tab ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {TABS.map((x) => (
        <div key={x.id} role="tabpanel" id={`panel-${x.id}`} data-testid={`panel-${x.id}`} aria-labelledby={`tab-${x.id}`} hidden={x.id !== tab} tabIndex={0} className="min-w-0 p-4 focus-visible:outline-2 focus-visible:outline-accent">
          {children[x.id]}
        </div>
      ))}
    </div>
  );
}
