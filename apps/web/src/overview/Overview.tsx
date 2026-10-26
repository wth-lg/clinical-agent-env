// Overview. With an official run: one row per task from its summary.json and records: pass k of
// N valid trials (N read from the run, never a constant), the Wilson 95% interval drawn against
// the final run's band (FINAL_PASS_BAND), one mark per trial (outcome and fault), mean score and
// mean cost. With none yet: the six tasks, the environment every trial starts from, and the
// committed pilot runs, which are not counted in the results. Never an empty page. Both open with
// the intro card: what this is in plain words, and how to run a trial.
import type { Ref } from 'react';
import { MODEL } from '../adapters/ledger-browser.ts';
import { FINAL_PASS_BAND } from '../../../../packages/core/cost.ts';
import { toolCatalog } from '../../../../packages/core/try-tool.ts';
import { pilotRates, useResults, type RunData } from '../data/results.ts';
import { useTaskList } from '../data/tasks.ts';
import { Card, formatInterval, GlossaryLink, Hash, IntervalRow, markLabel, MarkLegend, markOf, Notice, Page, Swatch } from '../data/ui.tsx';
import { hrefWith, onNav } from '../data/url.ts';
import { safePass } from '../data/harm.ts';
import { formatClock } from '../data/text.ts';
import { MANIFEST } from '../data/world.ts';
import { requestKey, useKeyStatus } from '../keygate/key.ts';
import { LOCAL_RUN_PANEL_ID } from '../surface/LocalRunPanel.tsx';

const money = (x: number | null) => (x === null ? 'n/a' : `$${x.toFixed(2)}`);
const link = 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';
const TOOL_COUNT = toolCatalog().length;

export function Overview({ headingRef, localRun = false }: { headingRef?: Ref<HTMLHeadingElement> | undefined; localRun?: boolean }) {
  const results = useResults();
  if (results === null) return <Page title="Overview" headingRef={headingRef}><Notice>Loading the published results…</Notice></Page>;
  if (results.kind === 'ready' && results.official !== null) return <OfficialOverview run={results.official} headingRef={headingRef} localRun={localRun} />;
  const why = results.kind === 'error' ? `The published results cannot be read: ${results.message}` : results.officialError ?? 'No official run is published yet. Its pass rates show here when the final run is committed.';
  return (
    <Page title="Overview" headingRef={headingRef} lead="The tasks, the environment and the committed runs. You can read all of it, and run the grader checks, with no key.">
      <IntroCard localRun={localRun} />
      <Notice testId={results.kind === 'error' || results.officialError ? 'error-state' : 'no-official'}>{why}</Notice>
      <TaskSummary />
      <EnvironmentSummary />
      {results.kind === 'ready' && results.pilots.length > 0 && <PilotSummary pilots={results.pilots} />}
    </Page>
  );
}

function OfficialOverview({ run, headingRef, localRun }: { run: RunData; headingRef?: Ref<HTMLHeadingElement> | undefined; localRun: boolean }) {
  const { summary, trials, runId } = run;
  const [lo, hi] = FINAL_PASS_BAND;
  const t = summary!.totals;
  const problems = run.bad.length + run.warnings.length;
  return (
    <Page
      title="Overview"
      headingRef={headingRef}
      lead={<>Run <span className="font-medium text-ink">{runId}</span>: {t.passes} of {t.trials} valid trials pass across {Object.keys(summary!.tasks).length} tasks. The shaded band is the target pass rate, {Math.round(lo * 100)}% to {Math.round(hi * 100)}%.</>}
    >
      <IntroCard localRun={localRun} />
      {problems > 0 && (
        <Notice testId="data-warning">
          {run.bad.length > 0 && `${run.bad.length} trial record${run.bad.length === 1 ? '' : 's'} cannot be read; Runs shows which. `}
          {run.warnings.join(' ')}
        </Notice>
      )}
      <ul className="divide-y divide-line rounded-sm border border-line bg-surface" data-testid="overview-table">
        <li aria-hidden className="hidden gap-x-3 px-4 py-2 text-xs text-ink-muted md:grid md:grid-cols-[minmax(9rem,1fr)_3.5rem_minmax(10rem,16rem)_minmax(7rem,14rem)_4rem_4rem]">
          <span>Task</span><span>Pass</span><span>95% interval (Wilson)</span><span>Trials</span><span className="text-right">Mean score</span><span className="text-right">Mean cost</span>
        </li>
        {Object.entries(summary!.tasks).map(([id, s]) => (
          <li key={id} data-testid="overview-row" data-task={id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 md:grid-cols-[minmax(9rem,1fr)_3.5rem_minmax(10rem,16rem)_minmax(7rem,14rem)_4rem_4rem]">
            <a href={hrefWith({ view: 'runs', task: id, label: null, trial: null })} onClick={onNav({ view: 'runs', task: id, label: null, trial: null })} className={`min-w-0 break-words font-medium ${link}`}>{id}</a>
            <span className="whitespace-nowrap text-right md:text-left"><span data-testid="k-of-n">{s.passes}/{s.trials}</span><span className="block text-xs text-ink-muted" data-testid="safe-pass">{safePass(s)}</span></span>
            <span className="col-span-2 md:col-span-1">
              <IntervalRow rate={s.pass_rate} interval={s.wilson95} band={FINAL_PASS_BAND} label={id} />
              <span className="text-xs text-ink-muted" data-testid="wilson">{formatInterval(s.wilson95)}</span>
            </span>
            <span className="col-span-2 flex flex-wrap gap-1 md:col-span-1" data-testid="swatches">
              {trials.filter((x) => x.task === id).map((x) => {
                const mark = markOf(x.explanation.outcome, x.explanation.fault);
                return <Swatch key={x.name} mark={mark} outcome={x.explanation.outcome} title={`${x.name}: ${x.explanation.outcome}, ${markLabel(mark)}`} />;
              })}
            </span>
            <span className="text-xs text-ink-muted md:text-right md:text-sm md:text-ink"><span className="md:hidden">Mean score </span>{s.mean_score === null ? 'n/a' : s.mean_score.toFixed(2)}</span>
            <span className="text-right text-xs text-ink-muted md:text-sm md:text-ink"><span className="md:hidden">Mean cost </span>{money(s.mean_cost_usd)}</span>
          </li>
        ))}
      </ul>
      <MarkLegend />
      <p className="text-xs text-ink-muted">Each task links to its trials in Runs.</p>
    </Page>
  );
}

const action = 'inline-flex h-8 items-center rounded-sm border border-line-strong bg-surface px-3 text-ink hover:bg-canvas';

// What this is, in plain words (ASD-STE 100, each sentence 25 words or fewer), and two ways to run
// a trial: in this tab (the key gate when there is no key, else Live trial) and on your computer
// (the local-run panel; localRun is the shell's own test for showing that panel, so the button
// and the panel come from one fact; on the local runner the page already runs on this computer).
function IntroCard({ localRun }: { localRun: boolean }) {
  const key = useKeyStatus();
  return (
    <Card title="What this is" testId="intro-card">
      <p data-testid="intro-text" className="text-ink">
        The model {MODEL} does clinical work in a mock health record: it reads the chart and writes orders, notes and messages through tools. Each
        trial starts from the same synthetic patient records, in the FHIR R4 health-record format, and gives the model one task. The grader then checks
        what the model changed. A trial passes when every <GlossaryLink anchor="pass">gate check</GlossaryLink> of the task is met.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {key.kind === 'none'
          ? <button type="button" className={action} onClick={requestKey}>Add a key and run in this tab</button>
          : <a className={action} href={hrefWith({ view: 'live', task: null, label: null, trial: null, run: null, tab: null })} onClick={onNav({ view: 'live', task: null, label: null, trial: null, run: null, tab: null })}>Run a trial in this tab</a>}
        {localRun && <button type="button" className={action} onClick={() => document.getElementById(LOCAL_RUN_PANEL_ID)?.focus()}>Run on your computer</button>}
      </div>
    </Card>
  );
}

function TaskSummary() {
  const { tasks, error } = useTaskList();
  return (
    <Card title={`Tasks${tasks ? ` (${tasks.length})` : ''}`} actions={<a href={hrefWith({ view: 'tasks', task: null })} onClick={onNav({ view: 'tasks', task: null })} className={`text-xs ${link}`}>Open Tasks</a>}>
      {error !== null && <p role="alert">The tasks cannot be read: {error}</p>}
      {tasks === null && error === null && <p className="text-ink-muted">Loading tasks…</p>}
      {tasks !== null && <p className="text-xs text-ink-muted">Open a task to read its prompt, its checks and its reference solution, and to run its grader checks with no key.</p>}
      {tasks !== null && (
        <ul className="mt-1 divide-y divide-line" data-testid="overview-tasks">
          {tasks.map((t) => (
            <li key={t.id} data-testid="overview-task" data-task={t.id} className="py-2">
              <a href={hrefWith({ view: 'tasks', task: t.id })} onClick={onNav({ view: 'tasks', task: t.id })} className={`font-medium ${link}`}>{t.title}</a>
              <span className="ml-2 break-all text-xs text-ink-muted">{t.id}</span>
              <p className="mt-0.5 text-xs text-ink-muted">
                {t.tools === null ? `all ${TOOL_COUNT} tools` : `${t.tools.length} of ${TOOL_COUNT} tools`}, {t.policies.length} {t.policies.length === 1 ? 'policy' : 'policies'}, at most {t.maxTurns} turns
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EnvironmentSummary() {
  const w = MANIFEST.world;
  return (
    <Card title="Environment" actions={<a href={hrefWith({ view: 'environment' })} onClick={onNav({ view: 'environment' })} className={`text-xs ${link}`}>Open Environment</a>}>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]" data-testid="overview-environment">
        <dt className="text-ink-muted">World</dt><dd>A synthetic FHIR R4 world: {w.resources} resources of {Object.keys(w.by_type).length} types</dd>
        <dt className="text-ink-muted">Pinned clock</dt><dd data-testid="pinned-clock" title={MANIFEST.now}>{formatClock(MANIFEST.now)}</dd>
        <dt className="text-ink-muted">State hash</dt><dd><Hash value={w.state_hash} /></dd>
        <dt className="text-ink-muted">Tools</dt><dd>{TOOL_COUNT}; you can try each read tool with no key</dd>
      </dl>
    </Card>
  );
}

function PilotSummary({ pilots }: { pilots: RunData[] }) {
  return (
    <Card title="Pilot runs (not counted in the results)">
      <ul className="space-y-1" data-testid="overview-pilots">
        {pilots.map((p) => {
          const rates = pilotRates(p).map((r) => `${r.passes} of ${r.valid} PASS on ${r.task}, Wilson 95% ${formatInterval(r.interval)}`);
          return (
            <li key={p.runId} data-testid="overview-pilot" data-run={p.runId}>
              <a href={hrefWith({ view: 'runs', task: null, label: null, trial: null })} onClick={onNav({ view: 'runs', task: null, label: null, trial: null })} className={`font-medium ${link}`}>{p.runId}</a>
              <span className="ml-2 text-ink-muted">{p.trials.length + p.bad.length} trial records: {rates.join('; ') || 'no valid trials'}; not counted</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
