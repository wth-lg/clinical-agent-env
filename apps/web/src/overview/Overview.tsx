// Overview. With an official run: one row per task from its summary.json and records: the task's
// title (linked to the task) over its id, pass k of N valid trials (N read from the run, never a
// constant), the Wilson 95% interval drawn against the final run's band (FINAL_PASS_BAND) with
// the band verdict as a chip, one mark per trial (outcome and fault) in rows of ten with a link
// to the task's trials in Runs, the most common kind of failure with the check that decided most
// of them (P17j JU7), the rubric score (named for what it is: extra credit that does not decide
// pass, P25u J1) and the mean cost; under them one quiet line with safe PASS, pass^3 and pass^5
// (P17j JU8), the refusal-excluded rate and the median duration over the task's records (design
// section 7; P25c); under the lead, one plain takeaway built from the summary (the hardest task,
// whose fault the failures are, their kind and the checks that failed most; P25u J5); with the
// run's fault box under the table and the human audit's count in the one confirmation phrase
// (P25u J8a); a run with a trial that blocks it (DENOMINATOR_RULE) says so in place of the
// headline pass rate, and names its false PASSes beside k/n. With none yet: the six tasks, the
// environment every trial starts from, and the committed pilot runs, which are not counted in the
// results: each task at the latest pilot that holds it, then every pilot as one line each with its
// rates folded (ui-polish 2.1, pre-audit-2 S24). Never an empty page. Both open with the intro
// card: what this is in plain words, where to start, and how to run a trial.
import { CircleAlert, Info } from 'lucide-react';
import type { Ref } from 'react';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../../../../packages/core/cost.ts';
import { FAILURE_KINDS, type Summary } from '../../../../packages/core/summary.ts';
import { toolCatalog } from '../../../../packages/core/try-tool.ts';
import { formatDuration, medianDuration } from '../data/duration.ts';
import { checkTextOf, pilotRates, useResults, type RunData } from '../data/results.ts';
import { useTaskList } from '../data/tasks.ts';
import { bandCount, bandLine, notFinalLine, type BandTask } from './band.ts';
import { policyLine, taskTitle } from '../tasks/title.ts';
import { BUTTON, BUTTON_PRIMARY, Card, CARD, formatInterval, GlossaryLink, Hash, IntervalRow, LINK, markLabel, MarkLegend, markOf, Notice, Page, pct, SECTION_LABEL, Swatch, VerdictChip } from '../data/ui.tsx';
import { hrefWith, onNav } from '../data/url.ts';
import { freshView } from '../shell/views.ts';
import { safePass } from '../data/harm.ts';
import { isFalsePass, kindWords, mostCommon, noPassCount, runBlock, shownFault } from '../data/failures.ts';
import { FaultBox, RunBlocked } from '../findings/why.tsx';
import { ModelLine, PassK, PassKLink } from '../findings/passk.tsx';
import { LatestPilotRows, PilotRateRows } from '../findings/pilot.tsx';
import { latestHolding } from '../data/pilot-order.ts';
import { VerdictLink } from '../findings/verdict.tsx';
import { formatClock } from '../data/text.ts';
import { MANIFEST } from '../data/world.ts';
import { requestKey, useKeyStatus } from '../keygate/key.ts';
import { useHosted } from '../surface/hosted.ts';
import { LOCAL_RUN_PANEL_ID } from '../surface/LocalRunPanel.tsx';

// A task's trials in Runs, with no filter left from another link (verifier-phase-P17i-JU7-1 S2).
const toRuns = (task: string | null) => ({ view: 'runs', task, label: null, trial: null, check: null, audit: null });
// The task itself, at its prompt (P25u J6: the row's name opened Runs, not the task).
const toTask = (task: string) => ({ view: 'tasks', task, tab: 'prompt', label: null, trial: null, check: null, audit: null });
// The trials of the official run a check decided, in Runs (the filter Findings' links set, P17j JU7).
const toCheck = (task: string, check: string) => ({ view: 'runs', task, check, run: null, label: null, trial: null, audit: null });
const money = (x: number | null) => (x === null ? 'n/a' : `$${x.toFixed(2)}`);
const TOOL_COUNT = toolCatalog().length;
// The task the intro's Start here list opens.
const START_TASK = 'renal-dose-review';
// The one sentence beside the rubric score (copy rule C2).
const RUBRIC_NOTE = 'extra credit; does not decide pass';
const RUBRIC_TITLE = `The mean rubric score over the task's valid trials, 0 to 1. Extra credit; does not decide pass: the pass or fail comes from the gate checks only.`;

export function Overview({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const results = useResults();
  if (results === null) return <Page title="Overview" headingRef={headingRef}><Notice>Loading the published results…</Notice></Page>;
  if (results.kind === 'ready' && results.official !== null) return <OfficialOverview run={results.official} headingRef={headingRef} />;
  const error = results.kind === 'error' ? `The published results cannot be read: ${results.message}` : results.officialError;
  const pilots = results.kind === 'ready' && results.pilots.length > 0;
  return (
    <Page title="Overview" headingRef={headingRef} lead="The tasks, the environment and the committed runs. You can read all of it, and run the grader checks, with no key.">
      <IntroCard />
      {error !== null && <Notice testId="error-state" icon={CircleAlert}>{error}</Notice>}
      <TaskSummary />
      {error === null && <Notice testId="no-official" tone="info" icon={Info}>The final run is not published yet.{pilots && ' Pilot runs are below.'}</Notice>}
      <EnvironmentSummary />
      {results.kind === 'ready' && results.pilots.length > 0 && <PilotSummary pilots={results.pilots} />}
    </Page>
  );
}

// The titles of the tasks the environment lists, by id, once the task list has loaded.
function useTitles(): ReadonlyMap<string, string> | null {
  const list = useTaskList().tasks;
  return list === null ? null : new Map(list.map((t) => [t.id, taskTitle(t)]));
}

function OfficialOverview({ run, headingRef }: { run: RunData; headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const { summary, trials, runId } = run;
  const [lo, hi] = FINAL_PASS_BAND;
  const t = summary!.totals;
  const problems = run.bad.length + run.warnings.length;
  const block = runBlock(trials);
  const titles = useTitles();
  const falsePasses = (id: string) => trials.filter((x) => x.task === id && isFalsePass(x.explanation)).length;
  return (
    <Page
      title="Overview"
      headingRef={headingRef}
      lead={block !== null
        ? <>Run <span className="font-medium text-ink">{runId}</span> is blocked, so it has no pass rate.</>
        : <>
          <p>Run <span className="font-medium text-ink">{runId}</span>: {t.passes} of {t.trials} valid trials pass across {Object.keys(summary!.tasks).length} tasks. The shaded band is the target pass rate, {Math.round(lo * 100)}% to {Math.round(hi * 100)}%.</p>
          <Takeaway summary={summary!} titles={titles} runId={runId} />
        </>}
    >
      {block !== null && <RunBlocked block={block} runId={runId} />}
      <IntroCard />
      <ModelLine run={run} />
      {block === null && <BandLine tasks={summary!.tasks} />}
      {problems > 0 && (
        <Notice testId="data-warning">
          {run.bad.length > 0 && `${run.bad.length} trial record${run.bad.length === 1 ? '' : 's'} cannot be read; Runs shows which. `}
          {run.warnings.join(' ')}
        </Notice>
      )}
      <ul className={`divide-y divide-line ${CARD}`} data-testid="overview-table">
        <li aria-hidden className="hidden gap-x-3 px-4 py-2 text-xs text-ink-muted md:grid md:grid-cols-[minmax(9rem,1fr)_6.5rem_minmax(10rem,16rem)_minmax(7rem,14rem)_minmax(6rem,9rem)_7rem_4rem]">
          <span>Task</span><span>Pass</span><span>95% interval (Wilson)</span><span>Trials</span><span>Most common failure</span>
          <span className="text-right">Rubric score<span className="block font-normal">{RUBRIC_NOTE}</span></span>
          <span className="text-right">Mean cost</span>
        </li>
        {Object.entries(summary!.tasks).map(([id, s]) => {
          const mine = trials.filter((x) => x.task === id);
          const title = titles?.get(id);
          return (
            <li key={id} data-testid="overview-row" data-task={id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 md:grid-cols-[minmax(9rem,1fr)_6.5rem_minmax(10rem,16rem)_minmax(7rem,14rem)_minmax(6rem,9rem)_7rem_4rem]">
              <span className="min-w-0">
                <a href={hrefWith(toTask(id))} onClick={onNav(toTask(id))} className={`break-words font-medium ${LINK}`} data-testid="overview-title">{title ?? id}</a>
                {title !== undefined && <span className="block break-all font-mono text-xs text-ink-muted" data-testid="overview-slug">{id}</span>}
              </span>
              <span data-testid="pass-cell" className="whitespace-nowrap text-right md:text-left">
                {block === null ? <span data-testid="k-of-n">{s.passes}/{s.trials}</span> : <span className="text-ink-muted">blocked</span>}
                {falsePasses(id) > 0 && <span className="block whitespace-normal text-xs text-danger" data-testid="false-pass">{falsePasses(id)} false PASS</span>}
              </span>
              <span className="col-span-2 md:col-span-1">
                {block === null ? <>
                  <IntervalRow rate={s.pass_rate} interval={s.wilson95} band={FINAL_PASS_BAND} label={id} />
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-xs text-ink-muted" data-testid="wilson">{formatInterval(s.wilson95)}</span><VerdictChip task={id} passes={s.passes} trials={s.trials} /></span>
                </> : <span className="text-xs text-ink-muted">no pass rate while the run is blocked</span>}
              </span>
              <span className="col-span-2 md:col-span-1">
                <span className="grid w-max max-w-full grid-cols-10 gap-1" data-testid="swatches">
                  {mine.map((x) => {
                    const mark = markOf(x.explanation.outcome, shownFault(x.explanation));
                    return <Swatch key={x.name} mark={mark} outcome={x.explanation.outcome} title={`${x.name}: ${x.explanation.outcome}, ${markLabel(mark)}`} />;
                  })}
                </span>
                <a href={hrefWith(toRuns(id))} onClick={onNav(toRuns(id))} className={`mt-1 inline-block text-xs ${LINK}`} data-testid="overview-trials">{mine.length} trials</a>
              </span>
              <MostCommon task={id} s={s} />
              <span data-testid="rubric-score" title={RUBRIC_TITLE} className="text-xs text-ink-muted md:text-right md:text-sm md:text-ink"><span className="md:hidden">Rubric score </span>{s.mean_score === null ? 'n/a' : s.mean_score.toFixed(2)}</span>
              <span className="text-right text-xs text-ink-muted md:text-sm md:text-ink"><span className="md:hidden">Mean cost </span>{money(s.mean_cost_usd)}</span>
              {block === null && <DetailLine id={id} s={s} records={mine.map((x) => x.record)} />}
            </li>
          );
        })}
      </ul>
      <MarkLegend />
      <p className="text-xs text-ink-muted"><span data-testid="rubric-note">Rubric score is {RUBRIC_NOTE}: a trial passes only when it meets every gate check.</span> Each task's title opens the task; its trials open in Runs.{block === null && <> <PassKLink /> <VerdictLink /></>}</p>
      <SupersededLines summary={summary!} />
      <Card title="Who is at fault, all tasks">
        {/* The fault box (findings/why.tsx, S5's) carries the human audit's count in the one
            confirmation phrase, "audit agrees: n of N" (P25u J8a, copy rule C5); this card only places it. */}
        <FaultBox task="all" fcs={Object.values(summary!.tasks).map((x) => x.fault_counts)} explanations={trials.map((x) => x.explanation)} />
        <p className="mt-1 text-xs text-ink-muted">Findings shows this for each task, with the checks that failed.</p>
      </Card>
    </Page>
  );
}

// The plain takeaway under the lead (P25u J5), every part read from the summary: the hardest task
// by pass rate, whose fault the valid failures are (fault_counts.label, copy rule C4), the kind
// that fails most (fault_counts.taxonomy) and the checks that decided the most failures
// (top_failed_checks, each with the check's text in its tooltip), then the first failed trial.
// Each sentence stays under 25 words. Nothing here is written for one run: a run with no failure,
// no audit or several kinds reads right too.
const sum = (xs: readonly number[]) => xs.reduce((n, x) => n + x, 0);
function Takeaway({ summary, titles, runId }: { summary: Summary; titles: ReadonlyMap<string, string> | null; runId: string }) {
  const tasks = Object.entries(summary.tasks).filter(([, s]) => s.trials > 0);
  if (tasks.length === 0) return null;
  const [hid, hs] = tasks.reduce((a, b) => ((b[1].pass_rate ?? 1) < (a[1].pass_rate ?? 1) ? b : a));
  const failures = sum(tasks.map(([, s]) => s.fault_counts.failures));
  const labelled = tasks.every(([, s]) => s.fault_counts.label !== null);
  const label = (l: 'model' | 'environment' | 'grader' | 'unlabelled') => sum(tasks.map(([, s]) => s.fault_counts.label?.[l] ?? 0));
  const kinds = FAILURE_KINDS.map((kind) => ({ kind, count: sum(tasks.map(([, s]) => s.fault_counts.taxonomy[kind])) })).filter((k) => k.count > 0).sort((a, b) => b.count - a.count);
  const checks = new Map<string, { count: number; task: string }>();
  for (const [id, s] of tasks) for (const c of s.top_failed_checks) checks.set(c.check, { count: (checks.get(c.check)?.count ?? 0) + c.count, task: checks.get(c.check)?.task ?? id });
  const top = [...checks].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const first = { view: 'runs', run: runId, trial: 'first-nonpass', task: null, label: null, tab: null, check: null, audit: null };
  const hardest = titles?.get(hid) === undefined ? hid : `${titles.get(hid)} (${hid})`;
  const fault = failures === 0
    ? 'No valid trial failed.'
    : !labelled ? `${failures} ${failures === 1 ? 'failure' : 'failures'}; no human audit is published yet, so none has a fault label.`
      : failures === 1 ? `The one failure is the ${label('model') === 1 ? "model's" : label('environment') === 1 ? "environment's" : label('grader') === 1 ? "grader's" : 'audit\'s to label'} fault.`
        : label('model') === failures ? `All ${failures} failures are the model's fault.`
          : `Of ${failures} failures, ${label('model')} are the model's fault, ${label('environment')} the environment's and ${label('grader')} the grader's${label('unlabelled') > 0 ? `; ${label('unlabelled')} not yet audited` : ''}.`;
  const kind = failures === 0 || kinds.length === 0 ? null
    : kinds[0]!.count === failures ? `Every one is the same kind: ${kindWords(kinds[0]!.kind)}.` : `The most common kind is ${kindWords(kinds[0]!.kind)} (${kinds[0]!.count} of ${failures}).`;
  const shown = top.slice(0, 3);
  return (
    <p data-testid="takeaway" className="mt-2 text-ink">
      <span data-testid="takeaway-hardest" data-task={hid}>{hardest} is the hardest task: {hs.passes} of {hs.trials} trials pass.</span>{' '}
      <span data-testid="takeaway-fault">{fault}</span>
      {kind !== null && <> <span data-testid="takeaway-kind">{kind}</span></>}
      {shown.length > 0 && (
        <>
          {' '}
          <span data-testid="takeaway-checks">
            {shown.length === 1 ? 'The check that decided the most failures: ' : 'Checks that decided the most failures: '}
            {shown.map(([check, c], i) => (
              <span key={check}>
                {i > 0 && ', '}
                <a href={hrefWith(toCheck(c.task, check))} onClick={onNav(toCheck(c.task, check))} className={LINK} title={checkTextOf(c.task)?.[check]?.requires === undefined ? undefined : `requires ${checkTextOf(c.task)![check]!.requires}`}><code className="text-xs">{check}</code></a> ({c.count})
              </span>
            ))}
            {top.length > shown.length ? ` and ${top.length - shown.length} more` : ''}.
          </span>
        </>
      )}
      {failures > 0 && <> <a href={hrefWith(first)} onClick={onNav(first)} className={LINK}>See a failed trial</a>.</>}
    </p>
  );
}

// The row's quiet second line: safe PASS, pass^3 and pass^5, the pass rate with refusals left out
// of the denominator (summary.json refusal_excluded_rate), and the median duration over the task's
// records in the run whose times can be read (the tooltip counts those), each with its meaning in
// its tooltip.
function DetailLine({ id, s, records }: { id: string; s: Summary['tasks'][string]; records: ReadonlyArray<{ started?: string | undefined; ended?: string | undefined }> }) {
  const median = medianDuration(records);
  const refusals = s.refusals === 0
    ? 'No refusals'
    : s.refusal_excluded_rate === null ? `Every valid trial was a refusal (${s.refusals})` : `Without refusals ${pct(s.refusal_excluded_rate)} (${s.refusals} refusal${s.refusals === 1 ? '' : 's'})`;
  return (
    <span data-testid="task-detail-line" className="col-span-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted md:col-span-full">
      <span data-testid="safe-pass" title="PASS trials with no harm item met">{safePass(s)}</span>
      <PassK task={id} k={s.pass_k} inline />
      <span data-testid="refusal-excluded" title="The pass rate with refusals left out of the denominator">{refusals}</span>
      {median !== null && <span data-testid="median-duration" title={`The median of ${median.count} trials, from the first request to the last reply`}>Median duration {formatDuration(median.seconds)}</span>}
    </span>
  );
}

// R42: each superseded task version in the run (summary.json superseded), one line beside the
// table: its k/n and verdict, the world it ran on, and the link to its trials in Runs.
function SupersededLines({ summary }: { summary: Summary }) {
  const entries = Object.entries(summary.superseded);
  if (entries.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs text-ink-muted" data-testid="superseded-lines">
      {entries.map(([key, v]) => (
        <li key={key} data-testid="superseded-line" data-task={v.task} data-version={v.version} className="break-words">
          <span className="font-medium text-ink">{v.task} {v.version}</span> (superseded, not counted): <span data-testid="k-of-n">{v.summary.passes}/{v.summary.trials}</span>{' '}
          <VerdictChip task={`${v.task}-${v.version}`} passes={v.summary.passes} trials={v.summary.trials} />
          {v.initial_state_hashes.length > 0 && <>, on world {v.initial_state_hashes.map((h) => `${h.slice(0, 4)}…`).join(', ')}</>}.{' '}
          <a href={hrefWith({ view: 'runs', run: key, task: null, label: null, trial: null, check: null, audit: null })} onClick={onNav({ view: 'runs', run: key, task: null, label: null, trial: null, check: null, audit: null })} className={LINK}>Its trials are in Runs</a>.
        </li>
      ))}
    </ul>
  );
}

// The band line (ui-contract P14, pre-audit F1): the count band.ts makes from the summary's band
// verdicts and valid-trial counts, a sentence saying what k and n count, and the tasks with no
// final result yet (in progress, or not in the run), named once the task list loads. The group's
// accessible name is the line.
function BandLine({ tasks }: { tasks: Readonly<Record<string, BandTask>> }) {
  const list = useTaskList().tasks;
  const c = bandCount(tasks, list === null ? null : list.map((t) => t.id));
  const [lo, hi] = FINAL_PASS_BAND;
  const note = notFinalLine(c);
  return (
    <div role="group" aria-labelledby="band-line" data-testid="band-line" data-in-band={c.inBand} data-final={c.final} className="break-words text-sm text-ink">
      <p id="band-line" data-testid="band-count" className="font-medium">{bandLine(c)}</p>
      <p className="text-xs text-ink-muted">
        {c.final === 0
          ? `No task has a final result yet: a final result is ${FINAL_TRIALS_PER_TASK} valid trials.`
          : `${c.inBand} of the ${c.final} ${c.final === 1 ? 'task' : 'tasks'} with a final result (${FINAL_TRIALS_PER_TASK} valid trials) ${c.inBand === 1 ? 'has' : 'have'} a pass rate from ${Math.round(lo * 100)}% to ${Math.round(hi * 100)}%, both included.`}
      </p>
      {note !== null && <p data-testid="band-not-final" className="text-xs text-ink-muted">{note}</p>}
    </div>
  );
}

// The kind of failure a task fails by most (summary.json fault_counts), with its count, and under
// it the check that decided the most of them (top_failed_checks), linked to those trials in Runs
// and with the check's text in its tooltip, so the "why" is one step away (P25u, rubric C3).
function MostCommon({ task, s }: { task: string; s: Summary['tasks'][string] }) {
  const fc = s.fault_counts;
  const m = mostCommon(fc);
  const check = s.top_failed_checks[0];
  const requires = check === undefined ? undefined : checkTextOf(task)?.[check.check]?.requires;
  return (
    <span data-testid="most-common" data-kind={m?.kind ?? ''} data-count={m?.count ?? 0} className="col-span-2 min-w-0 text-xs text-ink-muted md:col-span-1 md:text-sm md:text-ink">
      <span className="md:hidden">Most common failure: </span>{m === null ? 'none' : `${kindWords(m.kind)} (${m.count} of ${fc.failures})`}
      {check !== undefined && (
        <span className="block text-xs text-ink-muted" data-testid="most-common-check">
          <a href={hrefWith(toCheck(task, check.check))} onClick={onNav(toCheck(task, check.check))} className={LINK} title={requires === undefined ? undefined : `requires ${requires}`}><code>{check.check}</code></a> decided {check.count}
        </span>
      )}
    </span>
  );
}

// What this is, in plain words (ASD-STE 100, four sentences of 25 words or fewer), a numbered
// Start here list (a task's prompt, a failed trial, the grader checks; ui-polish 2.1), and two ways
// to run a trial: in this tab (the key gate when there is no key, else Live trial) and on your computer
// (the local-run panel; the shell shows that panel on the hosted site, and the button reads the same
// fact; on the local runner the page already runs on this computer). The model's name is in the
// run's model line, not here (P25u J19: it was said three times above the table), and the product
// name is explained where a reader first meets it (J22).
function IntroCard() {
  const key = useKeyStatus();
  const hosted = useHosted();
  const results = useResults();
  // A failed trial: the first non-pass of the official run, else of the latest pilot.
  const run = results?.kind === 'ready' ? (results.official ?? results.pilots.at(-1) ?? null) : null;
  const start = [
    { label: 'Read a task', to: { view: 'tasks', task: START_TASK, tab: 'prompt' } },
    ...(run === null ? [] : [{ label: 'See a failed trial', to: { view: 'runs', run: run.runId, trial: 'first-nonpass', task: null, label: null, tab: null, check: null, audit: null } }]),
    { label: 'Check the grader, no key needed', to: { view: 'tasks', task: START_TASK, tab: 'grader-validation' } },
  ];
  return (
    <Card title="What this is" testId="intro-card">
      <p data-testid="intro-text" className="text-ink">
        An AI model does clinical tasks in a mock health record: it reads the chart and writes orders, notes and messages. Riverbend Family Medicine is
        a fictional clinic, and every patient record is synthetic. Each trial starts from the same synthetic patient records, in the FHIR R4
        health-record format. The grader checks what the model changed, and a trial passes when it meets every <GlossaryLink anchor="pass">gate check</GlossaryLink>.
      </p>
      <p className={`mt-3 ${SECTION_LABEL}`} id="start-here">Start here</p>
      <ol data-testid="start-here" aria-labelledby="start-here" className="mt-1 list-decimal space-y-0.5 pl-5 marker:text-ink-muted">
        {start.map((x) => <li key={x.label}><a href={hrefWith(x.to)} onClick={onNav(x.to)} className={LINK}>{x.label}</a></li>)}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        {key.kind === 'none'
          ? <button type="button" className={BUTTON_PRIMARY} onClick={requestKey}>Add a key and run in this tab</button>
          : <a className={BUTTON_PRIMARY} href={hrefWith(freshView('live'))} onClick={onNav(freshView('live'))}>Run a trial in this tab</a>}
        {hosted && <button type="button" className={BUTTON} onClick={() => document.getElementById(LOCAL_RUN_PANEL_ID)?.focus()}>Run on your computer</button>}
      </div>
    </Card>
  );
}

function TaskSummary() {
  const { tasks, error } = useTaskList();
  return (
    <Card title={`Tasks${tasks ? ` (${tasks.length})` : ''}`} actions={<a href={hrefWith({ view: 'tasks', task: null })} onClick={onNav({ view: 'tasks', task: null })} className={`text-xs ${LINK}`}>Open Tasks</a>}>
      {error !== null && (
        <Notice nested tone="danger" role="alert" icon={CircleAlert} detail={error} action={<button type="button" className={BUTTON_PRIMARY} onClick={() => location.reload()}>Reload</button>}>
          <p className="font-medium text-ink">The tasks did not load. The other pages still work.</p>
        </Notice>
      )}
      {tasks === null && error === null && <p className="text-ink-muted">Loading tasks…</p>}
      {tasks !== null && <p className="text-xs text-ink-muted">Open a task to read its prompt, its checks and its reference solution, and to run its grader checks with no key.</p>}
      {tasks !== null && (
        <ul className="mt-1 divide-y divide-line" data-testid="overview-tasks">
          {tasks.map((t) => (
            <li key={t.id} data-testid="overview-task" data-task={t.id} className="py-2">
              <a href={hrefWith({ view: 'tasks', task: t.id })} onClick={onNav({ view: 'tasks', task: t.id })} className={`font-medium ${LINK}`} data-testid="overview-task-title">{taskTitle(t)}</a>
              <span className="ml-2 break-all text-xs text-ink-muted">{t.id}</span>
              <p className="mt-0.5 break-words text-xs text-ink-muted" data-testid="overview-task-meta">
                {t.tools === null ? `all ${TOOL_COUNT} tools` : `${t.tools.length} of ${TOOL_COUNT} tools`}, {policyLine(t.policies.map((p) => p.id))}, at most {t.maxTurns} turns
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
    <Card title="Environment" actions={<a href={hrefWith({ view: 'environment' })} onClick={onNav({ view: 'environment' })} className={`text-xs ${LINK}`}>Open Environment</a>}>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]" data-testid="overview-environment">
        <dt className="text-ink-muted">World</dt><dd>A synthetic FHIR R4 world: {w.resources} resources of {Object.keys(w.by_type).length} types</dd>
        <dt className="text-ink-muted">Pinned clock</dt><dd data-testid="pinned-clock" title={MANIFEST.now}>{formatClock(MANIFEST.now)}</dd>
        <dt className="text-ink-muted">World hash</dt><dd><Hash value={w.state_hash} /></dd>
        <dt className="text-ink-muted">Tools</dt><dd>{TOOL_COUNT}; you can try each read tool with no key</dd>
      </dl>
    </Card>
  );
}

// "pilot-3: 47 of 48 pass. 1 fail on crc-care-gap.": a pilot's valid trials, and its failures by
// task; for a pilot a trial blocks, why it gives no pass count (data/failures.ts noPassCount).
function pilotLine(p: RunData): string {
  const held = noPassCount(p.trials);
  if (held !== null) return `${p.runId}: ${held}.`;
  const rates = pilotRates(p);
  const passes = rates.reduce((n, r) => n + r.passes, 0);
  const valid = rates.reduce((n, r) => n + r.valid, 0);
  if (valid === 0) return `${p.runId}: no valid trials.`;
  const fails = rates.filter((r) => r.passes < r.valid).map((r) => ({ task: r.task, n: r.valid - r.passes }));
  const total = fails.reduce((n, f) => n + f.n, 0);
  const where = fails.length === 1 ? `${total} fail on ${fails[0]!.task}.` : `${total} fail: ${fails.map((f) => `${f.n} on ${f.task}`).join(', ')}.`;
  return `${p.runId}: ${passes} of ${valid} pass.${total === 0 ? '' : ` ${where}`}`;
}

// Each task at the latest pilot that holds it first (data/pilot-order.ts latestHolding; pre-audit-2
// S24: the latest pilot alone left the tasks it did not run at an older rate), one row per task
// with the run named; then each pilot's line, newest first, its rates by task in a closed
// <details>. A pilot a trial blocks has no rates: its line says why in their place.
function PilotSummary({ pilots }: { pilots: RunData[] }) {
  const tasks = [...new Set(pilots.flatMap((p) => p.trials.map((t) => t.task)))].sort();
  const latest = tasks.map((task) => ({ task, run: latestHolding(pilots, task)! }));
  return (
    <Card title="Pilot runs (not counted in the results)">
      <p className="text-xs text-ink-muted" data-testid="latest-pilot-lead">Each task at its latest pilot: the run, pass k of N valid trials, the Wilson 95% interval and the verdict against the target band.</p>
      <div className="mt-2"><LatestPilotRows rows={latest} /></div>
      <p className="mt-3 text-xs text-ink-muted">Every pilot, newest first.</p>
      <ul className="mt-1 space-y-3" data-testid="overview-pilots">
        {[...pilots].reverse().map((p) => (
          <li key={p.runId} data-testid="overview-pilot" data-run={p.runId} className="space-y-2">
            <p data-testid="pilot-line"><a href={hrefWith(toRuns(null))} onClick={onNav(toRuns(null))} className={`font-medium ${LINK}`}>{p.runId}</a><span className="text-ink-muted">{pilotLine(p).slice(p.runId.length)}</span></p>
            {noPassCount(p.trials) !== null ? null : (
              <details>
                <summary className="cursor-pointer text-xs text-ink-muted">Rates by task</summary>
                <div className="mt-2"><PilotRateRows run={p} /></div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
