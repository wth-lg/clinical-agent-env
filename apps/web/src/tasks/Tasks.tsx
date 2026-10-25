// Tasks: the six tasks, each with its prompt, tools, policies and checks, and its grader
// validation, run in this tab with no key: the oracle (reference solution) graded once, the whole
// grader validation matrix, and a replay of the official run's trials of the task. Run trial
// needs a key and is shown disabled with the reason. ?task= opens one task.
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode, type Ref } from 'react';
import type { Task } from '../../../../packages/core/tasks.ts';
import type { Check } from '../../../../packages/grader/check.ts';
import { useKeyStatus } from '../keygate/key.ts';
import { loadResults } from '../data/results.ts';
import { Notice, Page } from '../data/ui.tsx';
import { navigate, useParams } from '../data/url.ts';
import { validate, type MatrixRun, type OracleResult, type ReplayRow } from './validate-protocol.ts';

type Loaded = { task: Task; checks: Check[] };

export function Tasks({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const [tasks, setTasks] = useState<Loaded[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = useParams().get('task');
  useEffect(() => {
    // The task files are a large chunk, loaded when Tasks first opens.
    Promise.all([import('../adapters/tasks-browser.ts'), import('./matrix-task.ts')])
      .then(([{ browserTaskSource }, { taskChecks }]) => browserTaskSource({ testMode: false }).all().then((all) => Promise.all(all.map(async (task) => ({ task, checks: await taskChecks(task.id) })))))
      .then(setTasks, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <Page title="Tasks" headingRef={headingRef} lead="Each task is a prompt, the tools the model may use, the policies it must follow and the checks that grade it. Grader validation runs here with no key.">
      {error !== null && <Notice testId="error-state">The tasks cannot be read: {error}</Notice>}
      {tasks === null && error === null && <Notice>Loading tasks…</Notice>}
      {tasks !== null && (
        <ul className="space-y-3" data-testid="task-list">
          {tasks.map((t) => <TaskCard key={t.task.id} t={t} open={open === t.task.id} />)}
        </ul>
      )}
    </Page>
  );
}

function TaskCard({ t, open }: { t: Loaded; open: boolean }) {
  const { task, checks } = t;
  const Chevron = open ? ChevronDown : ChevronRight;
  const gates = checks.filter((c) => c.kind === 'gate');
  const rubric = checks.filter((c) => c.kind === 'rubric');
  return (
    <li data-testid="task-card" data-task={task.id} className="rounded-sm border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <button type="button" aria-expanded={open} onClick={() => navigate({ task: open ? null : task.id })} className="inline-flex items-center gap-1.5 text-left font-medium text-ink hover:underline">
          <Chevron aria-hidden className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
          {task.title}
        </button>
        <code className="text-xs text-ink-muted">{task.id}</code>
        <span className="ml-auto text-xs text-ink-muted">{gates.length} gate checks, {rubric.length} rubric items, {(task.tools ?? []).length || 'all'} tools</span>
      </div>
      <Validation id={task.id} />
      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          <section>
            <h3 className="font-medium">Prompt</h3>
            <pre data-testid="task-prompt" className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-sm bg-canvas p-3 font-sans text-ink">{task.instruction}</pre>
          </section>
          <section>
            <h3 className="font-medium">Tools</h3>
            <p className="mt-1 flex flex-wrap gap-1.5">{(task.tools ?? ['all tools']).map((n) => <code key={n} className="rounded-sm border border-line px-1 text-xs">{n}</code>)}</p>
          </section>
          {task.policies.length > 0 && (
            <section>
              <h3 className="font-medium">Policies</h3>
              <ul className="mt-1 space-y-1">
                {task.policies.map((p) => (
                  <li key={p.id}>
                    <details>
                      <summary className="cursor-pointer"><span className="font-medium">{p.id}</span> {p.title} <span className="text-ink-muted">v{p.version}, effective {p.effective}</span></summary>
                      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-sm bg-canvas p-3 font-sans text-xs">{p.text}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="font-medium">Checks</h3>
            <table className="mt-1 w-full text-left text-xs" data-testid="task-checks">
              <thead className="text-ink-muted"><tr><th scope="col" className="py-1 pr-3 font-medium">Check</th><th scope="col" className="py-1 pr-3 font-medium">Kind</th><th scope="col" className="py-1 font-medium">Traces to</th></tr></thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-1 pr-3"><code>{c.id}</code></td>
                    <td className="py-1 pr-3">{c.kind === 'gate' ? 'gate' : `rubric ${c.points > 0 ? '+' : ''}${c.points} (${c.method})`}</td>
                    <td className="py-1">{c.traces_to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </li>
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

const button = 'inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:text-ink-muted';

function Validation({ id }: { id: string }) {
  const key = useKeyStatus();
  const [oracle, runOracle] = useRun<OracleResult>();
  const [matrix, runMatrix] = useRun<MatrixRun>();
  const [replay, runReplay] = useRun<ReplayRow[]>();
  const busy = [oracle, matrix, replay].some((r) => r.state === 'running');
  const replayTrials = async () => {
    const r = await loadResults();
    if (r.kind !== 'ready') return [];
    return validate({ op: 'replay', task: id, trials: r.run.trials.filter((t) => t.task === id).map((t) => ({ name: t.name, record: t.record, trajectoryUrl: t.trajectoryUrl })) });
  };
  return (
    <div className="border-t border-line px-4 py-3" data-testid="validation" data-task={id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-ink-muted">Grader validation</span>
        <button type="button" className={button} disabled={busy} onClick={() => runOracle(() => validate({ op: 'oracle', task: id }))}>Run oracle</button>
        <button type="button" className={button} disabled={busy} onClick={() => runMatrix(() => validate({ op: 'matrix', task: id }))}>Run matrix</button>
        <button type="button" className={button} disabled={busy} onClick={() => runReplay(replayTrials)}>Replay published trials</button>
        <span className="ml-auto inline-flex items-center gap-2">
          <button type="button" className={button} disabled aria-describedby={`run-why-${id}`}>Run trial</button>
          <span id={`run-why-${id}`} className="text-xs text-ink-muted">{key.kind === 'none' ? 'Needs an API key.' : 'Live trials from this screen come in a later build.'}</span>
        </span>
      </div>
      <Result r={oracle} what="oracle" render={(o) => (
        <p data-testid="oracle-result" data-outcome={o.outcome ?? 'none'} data-score={o.score ?? ''}>
          Oracle: <span className="font-medium">{o.outcome ?? 'none'}</span> score {o.score === null ? 'n/a' : o.score.toFixed(1)}, {o.unknown} judge items unknown{o.misses.length ? `, judge cache misses ${o.misses.join(', ')}` : ''}
          {o.problems.length > 0 && <span className="block text-ink-muted">{o.problems.join('; ')}</span>}
        </p>
      )} />
      <Result r={matrix} what="matrix" render={(m) => (
        <div data-testid="matrix-result" data-pass={String(m.pass)}>
          <p>Matrix: <span className="font-medium">{m.pass ? 'PASS' : 'FAIL'}</span>, {m.probes.length} probes, {m.probes.filter((p) => p.as_expected).length} as expected. Fresh-process isolation and policy imports need Node and run in CI.</p>
          <table className="mt-1 w-full text-left text-xs">
            <thead className="text-ink-muted"><tr><th scope="col" className="py-1 pr-3 font-medium">Probe</th><th scope="col" className="py-1 pr-3 font-medium">Outcome</th><th scope="col" className="py-1 pr-3 font-medium">Verdict</th><th scope="col" className="py-1 font-medium">Failed checks</th></tr></thead>
            <tbody>
              {m.probes.map((p) => (
                <tr key={`${p.kind}:${p.id}`} data-testid="probe" data-kind={p.kind} data-id={p.id} data-outcome={p.outcome} data-as-expected={String(p.as_expected)} data-failed={p.failed_checks.join(',')} className="border-t border-line">
                  <td className="py-1 pr-3">{p.kind === p.id ? p.kind : `${p.kind} ${p.id}`}</td>
                  <td className="py-1 pr-3">{p.outcome}</td>
                  <td className="py-1 pr-3">{p.as_expected ? 'as expected' : 'NOT as expected'}</td>
                  <td className="py-1">{p.failed_checks.join(', ') || 'none'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details className="mt-1"><summary className="cursor-pointer text-xs text-ink-muted">Matrix report</summary><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{m.lines.join('\n')}</pre></details>
        </div>
      )} />
      <Result r={replay} what="replay" render={(rows) => (
        <div data-testid="replay-result">
          {rows.length === 0 ? <p className="text-ink-muted">No published trials of this task to replay.</p> : (
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

function Result<T>({ r, what, render }: { r: Run<T>; what: string; render: (v: T) => ReactNode }) {
  if (r.state === 'idle') return null;
  if (r.state === 'running') return <p className="mt-2 inline-flex items-center gap-1.5 text-ink-muted" role="status"><Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />Running the {what} in this tab…</p>;
  if (r.state === 'error') return <p className="mt-2 inline-flex items-center gap-1.5" role="alert"><CircleAlert aria-hidden className="h-3.5 w-3.5" />The {what} did not finish: {r.message}</p>;
  return <div className="mt-2 flex gap-1.5"><CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />{render(r.value)}</div>;
}

