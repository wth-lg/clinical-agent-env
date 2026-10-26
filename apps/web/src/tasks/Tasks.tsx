// Tasks: the six tasks, each with its prompt, tools, policies, its checks with what each requires
// (check-text.ts), the reference solution's tool calls, and its grader validation, run in this tab
// with no key: the oracle (reference solution) graded once, the whole grader validation matrix,
// and a replay of the official run's trials of the task. Run trial needs a key and is shown
// disabled with the reason. ?task= opens one task on the tab ?tab= names (TASK_TABS, prompt by
// default; WAI-ARIA tabs, so arrow keys, Home and End move between them).
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import type { Task } from '../../../../packages/core/tasks.ts';
import type { Check } from '../../../../packages/grader/check.ts';
import { MODEL } from '../adapters/ledger-browser.ts';
import { MANIFEST } from '../data/world.ts';
import { chartOf, CHART_TYPES, SECTION_TITLE, taskPatients, type FhirResource } from './chart.ts';
import { useKeyStatus } from '../keygate/key.ts';
import type { Script } from '../../../../packages/grader/matrix/types.ts';
import { checkTextOf, loadResults } from '../data/results.ts';
import { loadTaskList } from '../data/tasks.ts';
import { Notice, Page } from '../data/ui.tsx';
import { tabTarget } from '../data/tabs.ts';
import { navigate, useParams } from '../data/url.ts';
import { validate, type MatrixRun, type OracleResult, type ReplayRow } from './validate-protocol.ts';

type Loaded = { task: Task; checks: Check[] };

export function Tasks({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const [tasks, setTasks] = useState<Loaded[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = useParams();
  const open = params.get('task');
  const tab = tabOf(params.get('tab'));
  useEffect(() => {
    // The task files are a large chunk, loaded when Tasks first opens.
    Promise.all([loadTaskList(), import('./matrix-task.ts')])
      .then(([all, { taskChecks }]) => Promise.all(all.map(async (task) => ({ task, checks: await taskChecks(task.id) }))))
      .then(setTasks, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <Page title="Tasks" headingRef={headingRef} lead="Each task is a prompt, the tools the model may use, the policies it must follow and the checks that grade it. Grader validation runs here with no key.">
      {error !== null && <Notice testId="error-state">The tasks cannot be read: {error}</Notice>}
      {tasks === null && error === null && <Notice>Loading tasks…</Notice>}
      {tasks !== null && (
        <ul className="space-y-3" data-testid="task-list">
          {tasks.map((t) => <TaskCard key={t.task.id} t={t} tab={open === t.task.id ? tab : null} />)}
        </ul>
      )}
    </Page>
  );
}

function CheckRow({ task, check: c }: { task: Task; check: Check }) {
  const [question, setQuestion] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import('./check-text.ts').then(({ rubricQuestion }) => rubricQuestion(c)).then((q) => live && setQuestion(q));
    return () => {
      live = false;
    };
  }, [c]);
  // A gate check's requirement in words (tasks/<id>.check-text.ts), the expected value of its failure reason.
  const requires = checkTextOf(task.id)?.[c.id]?.requires;
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    void import('./check-text.ts').then(({ sourceText }) => setSource(sourceText(task, c.traces_to)));
  }, [task, c]);
  return (
    <li data-testid="task-check" data-check={c.id} className="space-y-1 px-3 py-2">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <code className="break-all font-medium">{c.id}</code>
        <span className="text-xs text-ink-muted">{c.kind === 'gate' ? 'gate check: must be met to pass' : `rubric item, ${c.points > 0 ? '+' : ''}${c.points} points, ${c.method === 'judge' ? 'graded by the judge' : c.method === 'hybrid' ? 'graded by code, the judge when code cannot read it' : 'graded by code'}`}</span>
      </p>
      {c.kind === 'gate' && requires !== undefined && <p className="break-words" data-testid="check-requires">Requires {requires}.</p>}
      {question !== null && <p className="break-words" data-testid="check-question">{question}</p>}
      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer">Enforces {c.traces_to}: show the text</summary>
        {source !== null ? <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-canvas p-2 font-sans text-ink" data-testid="check-source">{source}</pre> : <p className="mt-1">This reference names no text in the task.</p>}
      </details>
    </li>
  );
}

// The reference solution's steps, and its oracle badge: the first time the tab shows, the oracle
// runs in this tab with no key (the card's run state, so Grader validation shows the same result)
// and the badge reads "oracle PASS 1.0" (trace N8).
// The read-only Chart tab (pre-audit S12, P17j JU10): the task patient's problems, medications,
// allergies, labs and notes, read from the FHIR R4 store the tools act on, loaded in this tab the
// first time the tab shows. A task with several patients (the panel task T3, the inbox and queue
// tasks) has a patient picker.
// A failed load is not kept, so Retry (or the next view) loads again.
let chartWorld: Promise<FhirResource[]> | undefined;
const loadChartWorld = () => (chartWorld ??= Promise.all([import('../../../../packages/env/fixture-source.ts'), import('../data/world.ts')]).then(async ([{ loadStore }, { worldSource }]) =>
  [...(await loadStore(worldSource())).resources()] as unknown as FhirResource[]).catch((e: unknown) => {
  chartWorld = undefined;
  throw e;
}));

function ChartTab({ task, active }: { task: string; active: boolean }) {
  const [world, setWorld] = useState<FhirResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || world !== null) return;
    setError(null);
    loadChartWorld().then(setWorld, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [active, world, attempt]);
  const patients = world === null ? [] : taskPatients(world, task);
  const patient = chosen !== null && patients.includes(chosen) ? chosen : (patients[0] ?? null);
  const chart = world === null || patient === null ? null : chartOf(world, patient);
  const nameOf = (p: string) => (world === null ? p : (chartOf(world.filter((r) => r.resourceType === 'Patient'), p).patient?.name || p));
  return (
    <section className="space-y-3" data-testid="chart">
      <p className="text-xs text-ink-muted" data-testid="chart-source">
        Source: FHIR R4 store, the world every trial starts from (state hash {MANIFEST.world.state_hash.slice(0, 8)}…). Read-only: the tools read and write these resources; this tab only shows them.
      </p>
      {error !== null && (
        <p role="alert" className="flex flex-wrap items-center gap-2">
          The FHIR store did not load: {error}
          <button type="button" className={button} onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </p>
      )}
      {world === null && error === null && <p className="text-ink-muted" role="status">Loading the FHIR store in this tab…</p>}
      {world !== null && patients.length === 0 && <p className="text-ink-muted">This task names no patient in the store.</p>}
      {world !== null && patients.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          Patient
          <select aria-label="Patient" data-testid="chart-patient" className="h-8 max-w-full rounded-sm border border-line-strong bg-surface px-2 text-sm text-ink" value={patient ?? ''} onChange={(e) => setChosen(e.target.value)}>
            {patients.map((p) => <option key={p} value={p}>{nameOf(p)} ({p.slice('Patient/'.length)})</option>)}
          </select>
          <span>{patients.length} patients in this task</span>
        </label>
      )}
      {chart !== null && (
        <>
          <h3 className="font-medium" data-testid="chart-heading" data-patient={patient}>
            {chart.patient?.name || patient} <span className="font-normal text-ink-muted">{patient?.slice('Patient/'.length)}{chart.patient?.birthDate ? `, born ${chart.patient.birthDate}` : ''}{chart.patient?.gender ? `, ${chart.patient.gender}` : ''}</span>
          </h3>
          {CHART_TYPES.map((type) => {
            const rows = chart.rows.filter((r) => r.type === type);
            return (
              <div key={type} data-testid="chart-section" data-type={type}>
                <h4 className="text-xs font-medium text-ink-muted">{SECTION_TITLE[type]} ({rows.length})</h4>
                {rows.length === 0 ? <p className="text-xs text-ink-muted">None recorded.</p> : (
                  // A scroll box a keyboard can reach and a screen reader names (axe scrollable-region-focusable).
                  <div role="region" aria-label={`${SECTION_TITLE[type]} of ${chart.patient?.name || patient}`} tabIndex={0} className="mt-1 max-h-72 overflow-auto rounded-sm border border-line focus-visible:outline-2 focus-visible:outline-accent">
                    <ul className="divide-y divide-line text-xs">
                      {rows.map((r) => (
                        <li key={r.id} data-testid="chart-row" data-type={r.type} data-id={r.id} className="px-2 py-1">
                          <span className="block break-words text-ink">{r.text || r.id}</span>
                          {r.body !== '' && (
                            <details className="text-ink-muted" data-testid="chart-note">
                              <summary className="cursor-pointer break-words">{r.body.length > 140 ? `${r.body.slice(0, 137).trimEnd()}…` : r.body.split('\n')[0]}</summary>
                              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-ink">{r.body}</pre>
                            </details>
                          )}
                          <span className="block break-words text-ink-muted">
                            {[r.detail, r.status].filter((x) => x !== '').join(' · ')}
                            {r.date !== '' && <>{r.detail !== '' || r.status !== '' ? ' · ' : ''}<span className="whitespace-nowrap tabular-nums">{r.date.slice(0, 10)}</span></>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

function ReferenceSolution({ id, runs, active }: { id: string; runs: ReturnType<typeof useValidationRuns>; active: boolean }) {
  const { oracle: run, runOracle } = runs;
  useEffect(() => {
    if (active && run.state === 'idle') runOracle(() => validate({ op: 'oracle', task: id }));
  }, [active, run.state, runOracle, id]);
  const [oracle, setOracle] = useState<Script | null | undefined>(undefined);
  const [steps, setSteps] = useState<import('./check-text.ts').SolutionStep[]>([]);
  useEffect(() => {
    void Promise.all([import('./matrix-task.ts'), import('./check-text.ts')]).then(async ([{ taskOracle }, { solutionSteps }]) => {
      const o = await taskOracle(id);
      setOracle(o);
      setSteps(o === null ? [] : solutionSteps(o));
    });
  }, [id]);
  return (
    <section>
      <h3 className="font-medium">Reference solution</h3>
      <p className="mt-1 text-xs text-ink-muted">The tool calls of the oracle, tasks/{id}/solution/solve.ts, in order. This tab grades it with no key; it must PASS with score 1.0.</p>
      <p className="mt-1" data-testid="oracle-badge" data-state={run.state}>
        {run.state === 'done' ? <span className="font-medium">oracle {run.value.outcome ?? 'none'} {run.value.score === null ? 'n/a' : run.value.score.toFixed(1)}</span>
          : run.state === 'error' ? <span role="alert">The reference solution was not graded: {run.message}</span>
            : <span className="text-ink-muted" role="status">Grading the reference solution in this tab…</span>}
      </p>
      {oracle === undefined && <p className="mt-1 text-ink-muted">Loading…</p>}
      {oracle === null && <p className="mt-1 text-ink-muted">This task has no reference solution.</p>}
      {steps.length > 0 && (
        <ol className="mt-2 space-y-1 text-xs" data-testid="solution-steps">
          {steps.map((s) => (
            <li key={s.n} data-testid="solution-step" className="break-words">
              <span className="mr-1 text-ink-muted">{s.n}.</span><code className="font-medium">{s.tool}</code> <span className="text-ink-muted">{s.input}</span>
              {s.text && <span className="block pl-4 text-ink-muted">“{s.text.length > 200 ? `${s.text.slice(0, 197)}…` : s.text}”</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// The task tabs, in the order of docs/requirements/ui-contract.md's `tab` row.
export const TASK_TABS = [
  { id: 'prompt', label: 'Prompt' },
  { id: 'policy', label: 'Policy' },
  { id: 'chart', label: 'Chart' },
  { id: 'rubric', label: 'Rubric' },
  { id: 'reference-solution', label: 'Reference solution' },
  { id: 'grader-validation', label: 'Grader validation' },
] as const;
type TaskTab = (typeof TASK_TABS)[number]['id'];
const tabOf = (v: string | null): TaskTab => TASK_TABS.find((t) => t.id === v)?.id ?? 'prompt';

// A task card: closed, its header and grader validation; open (tab not null), its header and tabs.
function TaskCard({ t, tab }: { t: Loaded; tab: TaskTab | null }) {
  const { task, checks } = t;
  const open = tab !== null;
  const Chevron = open ? ChevronDown : ChevronRight;
  const gates = checks.filter((c) => c.kind === 'gate');
  const rubric = checks.filter((c) => c.kind === 'rubric');
  // The card holds the validation runs, so a result started on the closed card, or one still
  // running, shows in the Grader validation panel once the card opens (verifier JU9-1 F5).
  const runs = useValidationRuns();
  return (
    <li data-testid="task-card" data-task={task.id} className="rounded-sm border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <button type="button" aria-expanded={open} onClick={() => navigate({ task: open ? null : task.id, tab: null })} className="inline-flex items-center gap-1.5 text-left font-medium text-ink hover:underline">
          <Chevron aria-hidden className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
          {task.title}
        </button>
        <code className="break-all text-xs text-ink-muted">{task.id}</code>
        <span className="ml-auto text-xs text-ink-muted">{gates.length} gate checks, {rubric.length} rubric items, {(task.tools ?? []).length || 'all'} tools</span>
      </div>
      {!open && <Validation id={task.id} runs={runs} closed />}
      {open && (
        <TaskTabs task={task.id} tab={tab}>
          {{
            prompt: (
              <div className="space-y-4">
                <section>
                  <h3 className="font-medium">Prompt</h3>
                  <pre data-testid="task-prompt" className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-canvas p-3 font-sans text-ink">{task.instruction}</pre>
                </section>
                <section>
                  <h3 className="font-medium">Tools</h3>
                  {task.tools == null ? <p className="mt-1 text-ink-muted" data-testid="task-tools">Every tool of the environment (see Environment).</p> : <p className="mt-1 flex flex-wrap gap-1.5" data-testid="task-tools">{task.tools.map((n) => <code key={n} className="rounded-sm border border-line px-1 text-xs">{n}</code>)}</p>}
                </section>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-ink-muted" data-testid="task-model">Runs {MODEL} at effort high</span>
                  <RunTrial id={task.id} />
                </div>
              </div>
            ),
            policy: task.policies.length === 0 ? <p className="text-ink-muted" data-testid="task-policy">This task names no policy.</p> : (
              <section>
                <h3 className="font-medium">Policies</h3>
                <ul className="mt-1 space-y-1">
                  {task.policies.map((p) => (
                    <li key={p.id} data-testid="task-policy">
                      <details>
                        <summary className="cursor-pointer"><span className="font-medium">{p.id}</span> {p.title} <span className="text-ink-muted">v{p.version}, effective {p.effective}</span></summary>
                        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-sm bg-canvas p-3 font-sans text-xs">{p.text}</pre>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ),
            chart: <ChartTab task={task.id} active={tab === 'chart'} />,
            rubric: (
              <section>
                <h3 className="font-medium">Checks: what each one requires</h3>
                <p className="mt-1 text-xs text-ink-muted">A trial passes when every gate check is met. Rubric items add or take away points for the score. Each check names the policy section or prompt line it enforces.</p>
                <ul className="mt-2 divide-y divide-line rounded-sm border border-line" data-testid="task-checks">
                  {checks.map((c) => <CheckRow key={c.id} task={task} check={c} />)}
                </ul>
              </section>
            ),
            'reference-solution': <ReferenceSolution id={task.id} runs={runs} active={tab === 'reference-solution'} />,
            'grader-validation': <Validation id={task.id} runs={runs} />,
          }}
        </TaskTabs>
      )}
    </li>
  );
}

// The tab strip and its panels (WAI-ARIA tabs: arrow keys, Home and End move between tabs). Every
// panel stays mounted, so a matrix result or an opened policy survives a switch of tab.
function TaskTabs({ task, tab, children }: { task: string; tab: TaskTab; children: Record<TaskTab, ReactNode> }) {
  const refs = useRef<Partial<Record<TaskTab, HTMLButtonElement | null>>>({});
  // Only a real change navigates, so a click on the selected tab adds no history entry.
  const go = (id: TaskTab, focus = false) => {
    if (id === tab) return;
    navigate({ tab: id });
    if (focus) refs.current[id]?.focus();
  };
  // The strip scrolls inside itself on a narrow screen: keep the selected tab in its view. Only
  // the strip's scrollLeft moves, so a ?tab= link does not also scroll the page.
  useEffect(() => {
    const el = refs.current[tab];
    const strip = el?.parentElement;
    if (!el || !strip) return;
    const [t, s] = [el.getBoundingClientRect(), strip.getBoundingClientRect()];
    if (t.left < s.left) strip.scrollLeft -= s.left - t.left;
    else if (t.right > s.right) strip.scrollLeft += t.right - s.right;
  }, [tab]);
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const to = tabTarget(ev.key, TASK_TABS.findIndex((x) => x.id === tab), TASK_TABS.length);
    if (to === null) return;
    ev.preventDefault();
    go(TASK_TABS[to]!.id, true);
  };
  return (
    <div className="border-t border-line">
      {/* One row that scrolls inside itself on a narrow screen; the line under it is on the wrapper,
          because the scroll box would clip a tab's -mb-px overlap, and a tab's focus ring sits
          inside the tab for the same reason. */}
      <div className="border-b border-line">
        <div role="tablist" aria-label="Task" onKeyDown={onKey} className="flex gap-x-1 overflow-x-auto px-2">
          {TASK_TABS.map((x) => (
            <button
              key={x.id}
              ref={(el) => {
                refs.current[x.id] = el;
              }}
              type="button"
              role="tab"
              id={`task-tab-${task}-${x.id}`}
              data-tab={x.id}
              aria-selected={x.id === tab}
              aria-controls={`task-panel-${task}-${x.id}`}
              tabIndex={x.id === tab ? 0 : -1}
              onClick={() => go(x.id)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-2 py-2 text-sm focus-visible:-outline-offset-2 ${x.id === tab ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {TASK_TABS.map((x) => (
        <div key={x.id} role="tabpanel" id={`task-panel-${task}-${x.id}`} data-testid={`task-panel-${x.id}`} aria-labelledby={`task-tab-${task}-${x.id}`} hidden={x.id !== tab} tabIndex={0} className="min-w-0 px-4 py-4 focus-visible:outline-2 focus-visible:outline-accent">
          {children[x.id]}
        </div>
      ))}
    </div>
  );
}

type Run<T> = { state: 'idle' } | { state: 'running' } | { state: 'done'; value: T } | { state: 'error'; message: string };

function useRun<T>(): [Run<T>, (f: () => Promise<T>) => void] {
  const [r, setR] = useState<Run<T>>({ state: 'idle' });
  return [r, (f) => {
    setR({ state: 'running' });
    f().then((value) => setR({ state: 'done', value }), (e: unknown) => setR({ state: 'error', message: e instanceof Error ? e.message : String(e) }));
  }];
}

const button = 'inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:border-dashed disabled:border-line disabled:bg-canvas disabled:text-ink-muted';

function useValidationRuns() {
  const [oracle, runOracle] = useRun<OracleResult>();
  const [matrix, runMatrix] = useRun<MatrixRun>();
  const [replay, runReplay] = useRun<ReplayRow[]>();
  return { oracle, runOracle, matrix, runMatrix, replay, runReplay };
}

// The oracle, matrix and replay buttons and their results. On a closed card the row is labelled
// and carries Run trial; in the Grader validation panel the tab names it.
function Validation({ id, runs, closed = false }: { id: string; runs: ReturnType<typeof useValidationRuns>; closed?: boolean }) {
  const { oracle, runOracle, matrix, runMatrix, replay, runReplay } = runs;
  const busy = [oracle, matrix, replay].some((r) => r.state === 'running');
  const replayTrials = async () => {
    const r = await loadResults();
    if (r.kind !== 'ready' || r.official === null) return [];
    return validate({ op: 'replay', task: id, trials: r.official.trials.filter((t) => t.task === id).map((t) => ({ name: t.name, record: t.record, trajectoryUrl: t.trajectoryUrl })) });
  };
  return (
    <div className={closed ? 'border-t border-line px-4 py-3' : ''} data-testid="validation" data-task={id}>
      <div className="flex flex-wrap items-center gap-2">
        {closed && <span className="mr-1 text-xs font-medium text-ink-muted">Grader validation</span>}
        <button type="button" className={button} disabled={busy} onClick={() => runOracle(() => validate({ op: 'oracle', task: id }))}>Run reference solution</button>
        <button type="button" className={button} disabled={busy} onClick={() => runMatrix(() => validate({ op: 'matrix', task: id }))}>Check the grader</button>
        <button type="button" className={button} disabled={busy} onClick={() => runReplay(replayTrials)}>Replay published trials</button>
        {closed && <RunTrial id={id} />}
      </div>
      <Result r={oracle} what="reference solution" render={(o) => (
        <p data-testid="oracle-result" data-outcome={o.outcome ?? 'none'} data-score={o.score ?? ''}>
          Reference solution: <span className="font-medium">oracle {o.outcome ?? 'none'} {o.score === null ? 'n/a' : o.score.toFixed(1)}</span>, {o.unknown} judge items unknown{o.misses.length ? `, judge cache misses ${o.misses.join(', ')}` : ''}
          {o.problems.length > 0 && <span className="block text-ink-muted">{o.problems.join('; ')}</span>}
        </p>
      )} />
      <Result r={matrix} what="grader check" render={(m) => (
        <div data-testid="matrix-result" data-pass={String(m.pass)}>
          <p>Grader validation <span className="font-medium">{m.pass ? 'PASS' : 'FAIL'}</span>, matrix: {m.probes.filter((p) => p.as_expected).length}/{m.probes.length} probe verdicts as expected. Fresh-process isolation and policy imports need Node and run in CI.</p>
          <div className="mt-1 overflow-x-auto"><table className="w-full text-left text-xs">
            <thead className="text-ink-muted"><tr><th scope="col" className="py-1 pr-3 font-medium">Probe</th><th scope="col" className="py-1 pr-3 font-medium">Outcome</th><th scope="col" className="py-1 pr-3 font-medium">Verdict</th><th scope="col" className="py-1 font-medium">Failed checks</th></tr></thead>
            <tbody>
              {m.probes.map((p) => (
                <tr key={`${p.kind}:${p.id}`} data-testid="probe" data-kind={p.kind} data-id={p.id} data-outcome={p.outcome} data-as-expected={String(p.as_expected)} data-failed={p.failed_checks.join(',')} className="border-t border-line">
                  <td className="py-1 pr-3">{p.kind === p.id ? p.kind : `${p.kind} ${p.id}`}</td>
                  <td className="py-1 pr-3">{p.outcome}</td>
                  <td className="whitespace-nowrap py-1 pr-3">{p.as_expected ? 'as expected' : 'NOT as expected'}</td>
                  <td className="py-1">{p.failed_checks.join(', ') || 'none'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <details className="mt-1"><summary className="cursor-pointer text-xs text-ink-muted">Matrix report</summary><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{m.lines.join('\n')}</pre></details>
        </div>
      )} />
      <Result r={replay} what="replay" render={(rows) => (
        <div data-testid="replay-result">
          {rows.length === 0 ? <p className="text-ink-muted">No official run is published with trials of this task, so there is nothing to replay yet.</p> : (
            <>
              <p>Replay: {rows.filter((x) => x.match).length} of {rows.length} trials reproduced, by the rule <code className="text-xs">pnpm cli replay</code> uses: same environment, and the regrade gives the same outcome, score and check results as the published grade.</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {rows.map((x) => (
                  <li key={x.name} data-testid="replay-row" data-trial={x.name} data-match={String(x.match)} data-outcome={x.outcome ?? ''} data-final={x.final ?? ''} className="break-words">
                    <span className="font-medium">{x.name}</span> {x.match ? `reproduced (${x.outcome})` : `does not match: ${x.error ?? ''}`}{x.note ? ` (${x.note})` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )} />
    </div>
  );
}

// Run trial opens the Live trial view with this task selected, on a closed card's grader
// validation row and on the prompt tab; with no key it says that Live trial asks for one.
function RunTrial({ id }: { id: string }) {
  const key = useKeyStatus();
  return (
    <span className="ml-auto inline-flex items-center gap-2">
      <button type="button" className={button} aria-describedby={key.kind === 'none' ? `run-why-${id}` : undefined} onClick={() => navigate({ view: 'live', task: id, tab: null, label: null, trial: null, run: null })}>Run trial</button>
      {key.kind === 'none' && <span id={`run-why-${id}`} className="text-xs text-ink-muted">Live trial asks for an API key.</span>}
    </span>
  );
}

function Result<T>({ r, what, render }: { r: Run<T>; what: string; render: (v: T) => ReactNode }) {
  if (r.state === 'idle') return null;
  if (r.state === 'running') return <p className="mt-2 inline-flex items-center gap-1.5 text-ink-muted" role="status"><Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />Running the {what} in this tab…</p>;
  if (r.state === 'error') return <p className="mt-2 inline-flex items-center gap-1.5" role="alert"><CircleAlert aria-hidden className="h-3.5 w-3.5" />The {what} did not finish: {r.message}</p>;
  return <div className="mt-2 flex gap-1.5"><CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />{render(r.value)}</div>;
}

