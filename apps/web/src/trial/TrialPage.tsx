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
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { MET_TEXT, type Explanation } from '../../../../packages/core/explain.ts';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { fetchEvents, fullExplanation, useResults, type RunData, type Trial } from '../data/results.ts';
import { harmItems, safePass, type HarmItem } from '../data/harm.ts';
import type { Fault } from '../../../../packages/core/outcomes.ts';
import { BUTTON, CARD, CHIP, FaultLabel, GlossaryLink, HarmChip, HashText, markOf, markProps, Notice, OutcomeChip } from '../data/ui.tsx';
import { blocksTheRun, relabelledFrom, runBlock, shownFault, shownKind } from '../data/failures.ts';
import { tabTarget } from '../data/tabs.ts';
import { useTaskList } from '../data/tasks.ts';
import { MODEL } from '../adapters/ledger-browser.ts';
import { hrefWith, navigate, onNav, useParams } from '../data/url.ts';
import { freshView } from '../shell/views.ts';
import { useHosted } from '../surface/hosted.ts';
import { Attribution, criterionPhrase, criterionText, FAULT_NOUN, FAULT_WORD, LINK, StepLink } from './Attribution.tsx';
import { EnvironmentTab, Raw } from './Details.tsx';
import { Grading } from './Grading.tsx';
import { useRubricQuestions } from './questions.ts';
import { returnTo } from './back.ts';
import { FIRST_NONPASS, resolveTrial } from './resolve.ts';
import { taskTitle } from '../tasks/title.ts';
import { trialPlace } from './place.ts';
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

// Whether the screen is sm (40rem) or wider: there the trajectory pane is always open.
const WIDE = '(min-width: 40rem)';
function useWide(): boolean {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const m = matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

// Back to the list: the run's filters stay, the trial and its tab go.
const BACK = { trial: null, tab: null };

// from: the trial on screen. On open, the page starts at its header with focus on the heading,
// however far down the list the trial was opened from (review-ui-P16-1 F1); Back to Runs returns
// to its row (F6).
function Frame({ title, path, headingRef, from, children }: { title: React.ReactNode; path?: string; headingRef?: Ref<HTMLHeadingElement> | undefined; from?: { run: string; trial: string }; children: React.ReactNode }) {
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
        className="mt-2 break-words text-base font-semibold text-ink focus-visible:outline-none"
      >
        {title}
      </h1>
      {path !== undefined && <p data-testid="trial-path" className="mt-0.5 break-all font-mono text-xs text-ink-muted">{path}</p>}
      <div className="mt-2 space-y-4 sm:mt-3">{children}</div>
    </section>
  );
}

export function TrialPage({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const results = useResults();
  const params = useParams();
  const trial = params.get('trial') ?? '';
  const runId = params.get('run');
  // The first-nonpass token is a URL word, not a name to show (verifier-ui-copy-1 m5).
  const title = trial === FIRST_NONPASS ? 'First non-pass trial' : trial;
  // The session notice reads no published results, so it shows while they load or fail to load.
  if (runId === 'session') return <Frame title="Trials from this session" headingRef={headingRef}><SessionNotice /></Frame>;
  if (results === null) return <Frame title={title} headingRef={headingRef}><Notice>Loading the published results…</Notice></Frame>;
  if (results.kind === 'error') return <Frame title={title} headingRef={headingRef}><Notice testId="error-state">The published results cannot be read: {results.message}</Notice></Frame>;
  const runs = [...(results.official ? [results.official] : []), ...results.pilots];
  const r = resolveTrial(runs, runId, trial);
  if (r.kind === 'none-nonpass') return <Frame title="First non-pass trial" headingRef={headingRef}><Notice testId="empty-state">{r.message}</Notice></Frame>;
  if (r.kind !== 'trial') return <Frame title={title} headingRef={headingRef}><Notice testId="error-state">{r.message}</Notice></Frame>;
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
  // A step link opens the folded trajectory first (phone), in the same render, so the row is
  // on screen when it scrolls to it.
  const [stepsOpen, setStepsOpen] = useState(false);
  const wide = useWide();
  const onStep = (n: number) => {
    setStepsOpen(true);
    setCurrent((c) => ({ step: n, seq: (c?.seq ?? 0) + 1 }));
  };
  const e = full ?? t.explanation;
  // The resources the decisive check names (its evidence ids), marked in State diff.
  const decisiveIds = ((t.record.checks ?? []) as ReadonlyArray<{ id: string; ids?: readonly string[] }>).find((c) => c.id === e.decisive_check?.id)?.ids ?? [];
  return (
    <Frame title={<TrialHeading t={t} run={run} />} path={t.name} headingRef={headingRef} from={{ run: run.runId, trial: t.name }}>
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
          Run <span className="font-medium text-ink">{run.runId}</span>{run.official ? ', the official run' : ', a pilot run, not counted in the results'}. Task <span className="font-medium text-ink">{t.task}</span>
          {/* A blocked run has no pass rate, here too (verifier-phase-P17i-JU7r2-1 F1). */}
          {run.official && runBlock(run.trials) !== null ? <>: <span data-testid="run-blocked-line">the run is blocked, so it has no pass rate</span></>
            : run.official && run.summary?.tasks[t.task] ? <>: {run.summary.tasks[t.task]!.passes}/{run.summary.tasks[t.task]!.trials} pass, <span data-testid="safe-pass">{safePass(run.summary.tasks[t.task]!)}</span></> : null}.
        </p>
        <Header t={t} e={e} rows={traj?.rows ?? null} onStep={onStep} official={run.official} />
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <Tabs tab={tab}>
            {{
              grading: <Grading t={t} steps={traj?.steps ?? null} onStep={onStep} decisive={e.decisive_check?.id ?? null} />,
              attribution: <Attribution t={t} e={e} steps={traj?.steps ?? null} onStep={onStep} />,
              'state-diff': <StateDiff official={run.official} t={t} events={events} steps={traj?.steps ?? null} written={traj?.written ?? []} onStep={onStep} decisiveIds={decisiveIds} />,
              environment: <EnvironmentTab t={t} />,
              raw: <Raw t={t} />,
            }}
          </Tabs>
          {/* After the tabs in the DOM, so focus order follows the stacked screen; on the left at lg. */}
          {/* The scroll pane fades at its foot, so a cut-off row reads as more to scroll (ui-polish 3.5); the
              padding under the card keeps the last row clear of the fade at the end. Below sm the
              trajectory is folded under "Show all n steps", so the verdict, the reasons and the
              rubric come first on a phone; from sm up it is always open, with no summary. */}
          <div data-testid="trajectory-pane" className="min-w-0 lg:sticky lg:top-4 lg:order-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto lg:pb-8 lg:[mask-image:linear-gradient(to_bottom,#000_calc(100%-2rem),transparent)]">
            <details data-testid="trajectory-fold" open={wide || stepsOpen} onToggle={(ev) => !wide && setStepsOpen(ev.currentTarget.open)}>
              <summary className={`${BUTTON} w-full cursor-pointer list-none sm:hidden [&::-webkit-details-marker]:hidden`}>
                {stepsOpen ? 'Hide the steps' : traj === null ? 'Show the trajectory' : `Show all ${traj.steps.length} steps`}
              </summary>
              <div className="max-sm:mt-3">
                <Trajectory data={folded} current={current} />
              </div>
            </details>
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
  const hosted = useHosted();
  const link = <a href={hrefWith(freshView('live'))} onClick={onNav(freshView('live'))} className={LINK}>Open Live trial</a>;
  return (
    <Notice testId="session-notice">
      {hosted
        ? <>No runs in this session. The trials that you run in this tab are under Your runs in the Live trial view. {link}</>
        : <>The trials that this local runner started are under Your runs in the Live trial view. {link}</>}
    </Notice>
  );
}

// One sentence under "Whose fault" for each fault (ui-polish 3.3); the glossary has the definition.
const FAULT_GLOSS: Readonly<Record<Fault, string>> = {
  model: 'The model made the mistake, so the trial counts against it.',
  refusal: 'The model declined the task, which counts as a model failure.',
  env: 'The environment, not the model, caused this result.',
  grader: 'The grader, not the model, caused this result.',
  infra: 'The API or the harness ended the trial, so it says nothing about the model.',
};

// The plain headline above the verdict (ui-polish 3.3), from the decisive check and the kind of
// failure. An excluded trial has none: its plain "Not counted" line leads instead.
function headline(e: Explanation): ReactNode {
  if (!e.valid) return null;
  if (e.outcome === 'PASS') return e.fault === 'grader' ? 'Passed, but the grader was wrong: an audit found a false PASS.' : 'Passed every gate check.';
  const kind = shownKind(e);
  if (e.decisive_check) return <>Failed the check <code className="break-all font-mono text-[0.95em]">{e.decisive_check.id}</code>{kind !== null && <span className="font-normal text-ink-muted"> ({kind})</span>}</>;
  if (e.outcome === 'REFUSAL') return 'The model refused the task.';
  if (e.outcome === 'LIMIT') return 'The model did not finish: the trial stopped at a limit.';
  return `The trial ended ${e.outcome}.`;
}

// Why the trial ended as it did, before any click (see the header comment). rows: the trajectory,
// once it loads; an ENV_ERROR's Where is the tool call that failed with an internal error.
// official: the trial is of the official run; only it can be blocked, so only it takes the danger rule.
function Header({ t, e, rows, onStep, official }: { t: Trial; e: Explanation; rows: readonly Row[] | null; onStep: (n: number) => void; official: boolean }) {
  // A fault to show: every non-pass, and a false PASS (GR5, P17j JG5), which the grader decided.
  const nonPass = e.outcome !== 'PASS' || e.fault !== null;
  const failedCall = e.fault === 'env' && e.decisive_step === null && rows !== null ? internalErrorRow(rows) : null;
  // The Fault row shows the fault the chip shows; when the audit relabelled the trial, the note under
  // it names the fault the criteria found and the criterion that decided it (UIRETRO-1 M1).
  const fault = shownFault(e);
  const from = relabelledFrom(e);
  const decided = e.deciding && <>, decided by {criterionPhrase(e.deciding.id)} (<GlossaryLink anchor={`criterion-${e.deciding.id}`} className={LINK}>{e.deciding.id}</GlossaryLink>)<span className="block text-xs text-ink-muted"><HashText text={e.deciding.evidence} /></span></>;
  // The rule that decided the fault, small and after the gloss, its code a link to its definition.
  const rule = e.deciding && (
    <span className="mt-1 block text-xs text-ink-muted">
      Rule: decided by {criterionPhrase(e.deciding.id)} (<GlossaryLink anchor={`criterion-${e.deciding.id}`} className={LINK}>{e.deciding.id}</GlossaryLink>)
      <span className="block"><HashText text={e.deciding.evidence} /></span>
    </span>
  );
  const kind = shownKind(e);
  const blocking = fault === 'env' || fault === 'grader';
  const lead = headline(e);
  const confirmed = e.criteria.filter((c) => c.met === true || c.met === 'n/a');
  const open = e.criteria.filter((c) => !confirmed.includes(c));
  return (
    <section aria-label="Why this trial ended as it did" data-testid="trial-header" className={`min-w-0 ${CARD} p-4 ${nonPass ? `border-l-2 ${official && blocksTheRun(e) ? 'border-l-danger' : 'border-l-line-strong'}` : ''}`}>
      {lead !== null && <p data-testid="trial-headline" className="mb-2 break-words text-base font-semibold text-ink">{lead}</p>}
      {!e.valid && e.deciding && (
        <p data-testid="plain-reason" className="mb-2 break-words text-base font-semibold text-ink">
          Not counted: {criterionPhrase(e.deciding.id)}. The {e.fault === 'infra' ? 'infrastructure' : FAULT_WORD[e.deciding.fault]} is at fault, not the model.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <OutcomeChip outcome={e.outcome} fault={shownFault(e)} />
        <HarmChip items={useHarmTexts(t.task, harmItems(t.record))} />
        {nonPass && <FaultLabel e={e} notCountedShown={!e.valid && e.deciding !== null} official={official} />}
        <span className="ml-auto text-xs text-ink-muted" title="Agent and judge cost">${(t.record.cost_usd + (t.record.judge_cost_usd ?? 0)).toFixed(2)}</span>
      </div>
      <Reason reason={e.reason} muted={!e.valid} />
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 border-t border-line pt-3 sm:grid-cols-[max-content_minmax(0,1fr)] [&_dd]:min-w-0 [&_dd]:break-words [&_dt]:text-ink-muted max-sm:[&_dd+dt]:mt-1.5">
        {e.decisive_check && (
          <>
            <dt>Why it failed</dt>
            <dd data-testid="decisive-check" data-id={e.decisive_check.id}>
              <code data-testid="decisive" className={`${CHIP} break-all border-line bg-canvas font-mono font-normal text-ink dark:bg-line`}>{e.decisive_check.id}</code>
              {e.decisive_check.traces_to && <span className="text-ink-muted"> (enforces {e.decisive_check.traces_to})</span>}
              <span className="mt-1 block"><span className="text-ink-muted">requires</span> {e.decisive_check.expected}</span>
              <span className="block"><span className="text-ink-muted">found</span> <span className="text-danger">{e.decisive_check.found}</span></span>
            </dd>
          </>
        )}
        <dt>Whose fault</dt>
        <dd data-testid="detail-fault">
          {fault === null ? 'none: the trial passed' : (
            <>
              <span className="flex flex-wrap items-center gap-1.5">
                <GlossaryLink anchor={`fault-${fault}`} className={`${CHIP} ${blocking ? 'border-danger text-danger' : 'border-line-strong text-ink'} hover:bg-canvas`}><span aria-hidden {...markProps(markOf(e.outcome, fault), 'inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]')} />{FAULT_WORD[fault]}</GlossaryLink>
                {kind !== null && <span data-testid="kind-pill" className={`${CHIP} border-line bg-canvas font-normal text-ink dark:bg-line`}>Kind: {kind}</span>}
              </span>
              <span className="mt-1 block text-ink">{FAULT_GLOSS[fault]}</span>
              {from === null ? rule : <span data-testid="fault-relabelled" className="mt-1 block text-sm text-ink-muted">The audit relabelled it; the trial's criteria found {FAULT_NOUN[from]} at fault{e.deciding ? decided : '.'}</span>}
            </>
          )}
        </dd>
        {e.secondary_reason !== null && (
          <>
            <dt>Also failed</dt>
            <dd data-testid="secondary-reason" className="text-ink-muted">{e.secondary_reason}</dd>
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
        <dt>{nonPass ? 'Criteria' : 'Checks'}</dt>
        <dd>
          {!nonPass ? <Confirmation e={e} /> : (
            <details>
              <summary data-testid="header-criteria-summary" className="cursor-pointer">
                {confirmed.length} of {e.criteria.length} confirmed
                {open.length > 0 && <span className="text-ink-muted"> ({open.map((c) => `${c.id} ${MET_TEXT[String(c.met)]}`).join(', ')})</span>}
              </summary>
              <ul data-testid="header-criteria" className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {e.criteria.map((c) => (
                  <li key={c.id} data-id={c.id} data-met={String(c.met)} title={criterionText(c.id)}>
                    <GlossaryLink anchor={`criterion-${c.id}`} className={LINK}>{c.id}</GlossaryLink>
                    <span className={c.met === true ? 'text-ink-muted' : 'text-ink'}>: {MET_TEXT[String(c.met)]}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </dd>
      </dl>
    </section>
  );
}

// The harm items with their rubric questions, once the task's checks load (verifier JU3-1 F5);
// the ids alone until then, and for a code item, which has no question.
function useHarmTexts(task: string, items: HarmItem[]): HarmItem[] {
  const texts = useRubricQuestions(task, items.length > 0);
  return items.map((x) => (texts[x.id] ? { ...x, text: texts[x.id]! } : x));
}

// The trial page heading (pre-audit M8, P17j JU11): the task's title, then "Trial i of n · <model> ·
// effort <effort>" (place.ts: i the trial's place among the run's trials of the task, model and
// effort, n how many there are; the record's own index is in the path); the path sits below in
// small mono text. Words wrap whole, so no token breaks mid-word at 390 px.
function TrialHeading({ t, run }: { t: Trial; run: RunData }) {
  const { tasks } = useTaskList();
  const task = tasks?.find((x) => x.id === t.task);
  const title = task ? taskTitle(task) : t.task;
  const r = t.record as Trial['record'] & { index?: number; models_returned?: readonly string[]; effort?: string };
  const place = trialPlace(t, run.trials);
  return (
    <>
      <span data-testid="trial-title">{title}</span>
      <span data-testid="trial-sub" className="block text-sm font-normal text-ink-muted">
        {[place !== null ? `Trial ${place.i} of ${place.n}` : null, r.models_returned?.[0] ?? MODEL, r.effort ? `effort ${r.effort}` : null].filter(Boolean).join(' · ')}
      </span>
    </>
  );
}

// On a PASS the M1-M5 row is in plain words, in three states (outcomes.ts: one pending is
// provisional, one not met is contradicted): "Confirmed" when every check holds; "This PASS is
// contradicted: ..." in the danger colour when a check found the opposite (a human audit that says the trial did not
// pass, an internal tool error, a state hash that does not match); else "Checks pending: this trial
// still needs ...". The codes and their evidence are in the Attribution tab (pre-audit S9, P17j
// JU1). A check with no phrase here says its evidence. M2 is never pending, so it has no phrase there.
const STILL_NEEDS: Readonly<Record<string, string>> = {
  M1: 'a record of what the model was shown',
  M3: 'a start and end state check against the run manifest',
  M4: 'a grader check of this task version',
  M5: 'a human audit',
};
// On a PASS, M1 is not applicable (no gate check failed) and M4 holds (none failed for the
// reference solution to fail too), so their phrases below cannot show; they stay for a PASS a
// later definition makes them decide on, and an unknown id falls back to its evidence.
const FOUND_OTHERWISE: Readonly<Record<string, string>> = {
  M1: 'a record the failed check needs was never shown to the model',
  M2: 'a tool call returned an internal error',
  M3: 'the saved start or end state of the record does not match or is missing',
  M4: 'the reference solution or an accepted alternative fails this check',
  M5: 'the human audit says this trial did not pass',
};
const andList = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
function Confirmation({ e }: { e: Explanation }) {
  const contradicted = e.criteria.filter((c) => c.met === false);
  const pending = e.criteria.filter((c) => c.met === 'pending');
  const toAttribution = <a href={hrefWith({ tab: 'attribution' })} onClick={onNav({ tab: 'attribution' })} className={LINK}>See Attribution</a>;
  const state = contradicted.length > 0 ? 'contradicted' : pending.length > 0 ? 'pending' : 'confirmed';
  return (
    <p data-testid="header-confirmation" data-state={state} data-pending={pending.length}>
      {contradicted.length > 0 && <span className="font-medium text-danger">This PASS is contradicted: {andList(contradicted.map((c) => FOUND_OTHERWISE[c.id] ?? c.evidence))}. </span>}
      {pending.length > 0 && <>Checks pending: this trial still needs {andList(pending.map((c) => STILL_NEEDS[c.id] ?? c.evidence))}. </>}
      {state === 'confirmed' && <>Confirmed. </>}
      {toAttribution}
    </p>
  );
}

// The reason as explainTrial gives it; a model failure's '; Kind: ...' on a line of its own
// (review-ui-P16-1 F5). The text is unchanged: the separator stays for screen readers.
function Reason({ reason, muted }: { reason: string; muted: boolean }) {
  const at = reason.indexOf('; Kind: ');
  return (
    <p data-testid="reason" className={`mt-2 break-words ${muted ? 'font-mono text-xs text-ink-muted' : 'font-medium text-ink'}`}>
      {at < 0 ? reason : <>{reason.slice(0, at)}<span className="sr-only">; </span><span data-testid="reason-kind" className="block font-normal text-ink-muted">{reason.slice(at + 2)}</span></>}
    </p>
  );
}

// The tab strip and its panels (WAI-ARIA tabs: arrow keys, Home and End move between tabs).
function Tabs({ tab, children }: { tab: TabId; children: Record<TabId, React.ReactNode> }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Only a real change navigates, so a click on the selected tab adds no history entry.
  const go = (id: TabId, focus = false) => {
    if (id === tab) return;
    navigate({ tab: id });
    if (focus) refs.current[id]?.focus();
  };
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((x) => x.id === tab);
    const to = tabTarget(ev.key, i, TABS.length);
    if (to === null) return;
    ev.preventDefault();
    go(TABS[to]!.id, true);
  };
  return (
    <div className={`min-w-0 ${CARD} lg:order-2`}>
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
