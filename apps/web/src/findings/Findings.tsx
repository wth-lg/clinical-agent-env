// Findings: the charts first, then the difficulty history, then docs/findings.md rendered in a
// closed disclosure, "Read the analysis" (P25c: the numbers come before the prose; P25u J18: the
// prose stays folded until asked for, so the history is not 4,000 px down), all from the
// official run's summary.json: pass rate with its Wilson 95% interval per task and the trials its k/n leaves out
// (ENV_LIMIT and the other excluded outcomes, with why), why each task fails (P17j JU7:
// its valid failures by kind as a bar, its top failed checks and its fault box, findings/why.tsx),
// and mean cost per trial; a run that is blocked says so first; then links to
// an example trial of each non-pass outcome, the glossary and the full write-up (a link only when
// the build holds data/writeup.html, which the final run publishes). With no official run, it says
// first what it will show, then each pilot's rates (ui-polish 2.3).
import { Info } from 'lucide-react';
import { Marked } from 'marked';
import { useMemo, type Ref } from 'react';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../../../../packages/core/cost.ts';
import { OUTCOMES } from '../../../../packages/core/outcomes.ts';
import { noPassCount, runBlock, shownFault } from '../data/failures.ts';
import { notCounted, notCountedText } from '../data/marks.ts';
import { checkTextOf, dataUrl, gradingLine, pilotRates, useResults, type RunData } from '../data/results.ts';
import { ResultsError } from '../data/results-error.tsx';
import { FAULT_BY } from '../trial/headline.ts';
import { Card, CARD, formatInterval, GlossaryLink, IntervalRow, LINK, markLabel, MarkLegend, markOf, NO_RESULTS, Notice, Page, Swatch, VerdictChip } from '../data/ui.tsx';
import { ChartKey, PilotRateRows, RateAxis } from './pilot.tsx';
import { whyFailParts } from './counts.ts';
import { FaultBox, KindBar, Reruns, RunBlocked, TopChecks } from './why.tsx';
import { ModelLine, PassK, PassKLink } from './passk.tsx';
import { DifficultyHistory, NoFailures, VerdictLink } from './verdict.tsx';
import { hrefWith, onNav } from '../data/url.ts';
import { freshView } from '../shell/views.ts';

const LEAD = 'How well the model did on each task, and why it failed.';

export function Findings({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const results = useResults();
  const writeup = results?.kind === 'ready' && results.files.has('writeup.html');
  const links = (
    <p className="flex flex-wrap gap-x-4 gap-y-1">
      <GlossaryLink>How failures are attributed</GlossaryLink>
      {writeup ? <a href={dataUrl('writeup.html')} className="text-ink underline decoration-line-strong underline-offset-2">Full writeup</a> : <span className="text-ink-muted" data-testid="writeup-later">The full writeup is published with the final run.</span>}
    </p>
  );
  if (results === null) return <Page title="Findings" headingRef={headingRef}><Notice>Loading the published results…</Notice></Page>;
  if (results.kind === 'error') return <Page title="Findings" headingRef={headingRef}><ResultsError message={results.message} cannot="there are no findings to show" /></Page>;
  if (results.official === null) {
    return (
      <Page title="Findings" headingRef={headingRef} lead={LEAD}>
        <WillShow />
        <Notice testId="empty-state" tone="info" icon={Info}>
          {NO_RESULTS} The findings show here when the final run is committed.
          {results.pilots.length > 0 && <a href={hrefWith(freshView('runs'))} onClick={onNav(freshView('runs'))} className={`mt-2 block w-fit text-xs ${LINK}`}>See the pilot runs</a>}
        </Notice>
        {results.pilots.map((p) => <PilotFindings key={p.runId} run={p} />)}
        <DifficultyHistory runs={[...results.pilots, ...results.probes]} />
        {links}
      </Page>
    );
  }
  const block = runBlock(results.official.trials);
  return (
    <Page title="Findings" headingRef={headingRef} lead={LEAD}>
      {block !== null && <RunBlocked block={block} runId={results.official.runId} />}
      {links}
      <Charts run={results.official} blocked={block !== null} />
      {block === null && <NoFailures run={results.official} />}
      <DifficultyHistory runs={[...results.pilots, ...results.probes, ...results.superseded, results.official]} />
      {results.findings !== null && (block === null ? <Analysis text={results.findings} /> : <p data-testid="findings-held" className="text-ink-muted">The write-up gives the run's pass rates, so it shows again when the run is no longer blocked.</p>)}
    </Page>
  );
}

const link = 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';

// The trials of a task that its k/n leaves out, and why (data/marks.ts notCounted), under its row.
function NotCountedLine({ task, text }: { task: string; text: string | null }) {
  return text === null ? null : <span data-testid="not-counted" data-task={task} className="col-span-full break-words text-xs text-ink-muted">{text}</span>;
}

// A pilot a trial blocks shows, in place of its rate rows and the chart key, why it has none, and
// under that each task's not-counted line.
function PilotFindings({ run }: { run: RunData }) {
  const graded = gradingLine(run.grading);
  const held = noPassCount(run.trials);
  return (
    <Card title={`${run.runId} (not counted)`}>
      <div data-testid="pilot-findings" data-run={run.runId} className="space-y-3">
        {held !== null
          ? (
            <>
              <p data-testid="pilot-blocked" className="text-ink">{held.charAt(0).toUpperCase()}{held.slice(1)}.</p>
              {/* Which trials are not counted, and why, stay in view, with no k/N (verifier-phase-P17i-UI-FU-1 S1). */}
              {pilotRates(run).map((r) => ({ task: r.task, text: notCountedText(notCounted({ outcomes: r.outcomes })) })).filter((l) => l.text !== null).map((l) => (
                <p key={l.task} className="break-words text-xs text-ink-muted"><span className="font-medium text-ink">{l.task}</span>: <NotCountedLine task={l.task} text={l.text} /></p>
              ))}
            </>
          )
          : (
            <>
              <PilotRateRows run={run} axis below={(r) => <NotCountedLine task={r.task} text={notCountedText(notCounted({ outcomes: r.outcomes }))} />} />
              <p className="text-xs text-ink-muted"><ChartKey /></p>
            </>
          )}
        {graded !== null && <p className="text-xs text-ink-muted">{graded}</p>}
        <MarkLegend marks={[...new Set(run.trials.map((t) => markOf(t.explanation.outcome, shownFault(t.explanation))))]} />
        <p className="text-xs text-ink-muted">A pilot sizes the final run and tests the pipeline; its numbers never enter the results. <a href={hrefWith({ view: 'runs', task: null, label: null, trial: null })} onClick={onNav({ view: 'runs', task: null, label: null, trial: null })} className={link}>Open its trials in Runs</a>.</p>
      </div>
    </Card>
  );
}

function WillShow() {
  const go = (view: string) => ({ href: hrefWith({ view, task: null, label: null, trial: null }), onClick: onNav({ view, task: null, label: null, trial: null }), className: link });
  return (
    <Card title="What you will find here">
      <ul className="list-disc space-y-1 pl-5" data-testid="will-show">
        <li>The pass rate of each task over {FINAL_TRIALS_PER_TASK} trials, with its Wilson 95% interval. A trial passes only when it meets every gate check: <GlossaryLink anchor="pass">see how a pass is counted in the Glossary</GlossaryLink>.</li>
        <li>The outcome of every trial, and whose fault each failure is (the model, the environment or the grader): <GlossaryLink anchor="fault-labels">see the fault labels in the Glossary</GlossaryLink>.</li>
        <li>Example trials for each kind of failure, with the reason in words.</li>
        <li>Proof that the graders work: each task's reference solution passes and every validation probe gives the verdict expected. <a {...go('tasks')}>Run them now on Tasks</a>, with no key.</li>
      </ul>
    </Card>
  );
}

// docs/findings.md is a committed file of this repository, and the page's CSP blocks inline
// script; still, raw HTML in it is shown as text and a link may only go to a web or relative
// address, so the page never depends on the CSP alone.
const md = new Marked({
  renderer: { html: ({ text }) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') },
  walkTokens: (t) => {
    if ((t.type === 'link' || t.type === 'image') && /^\s*[a-z][a-z0-9+.-]*:/i.test(t.href) && !/^\s*(?:https?|mailto):/i.test(t.href)) t.href = '#';
  },
});

// The write-up, after the charts and the history, in a disclosure that starts closed (P25u J18;
// before, it opened shown, gate UIP25C-244 S1) and opens on "Read the analysis".
function Analysis({ text }: { text: string }) {
  const html = useMemo(() => md.parse(text, { async: false }), [text]);
  return (
    <details data-testid="findings-analysis" className="space-y-2">
      <summary className="cursor-pointer pt-2 font-medium text-ink">Read the analysis</summary>
      <p className="text-xs text-ink-muted">The write-up of the run, in full: what the numbers above show, what surprised us, what changed and what comes next.</p>
      <article data-testid="findings-md" className={`min-w-0 space-y-3 break-words ${CARD} p-4 [&_code]:rounded-sm [&_code]:bg-canvas [&_code]:px-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:pt-2 [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_td]:border-t [&_td]:border-line [&_td]:py-1 [&_td]:pr-3 [&_th]:py-1 [&_th]:pr-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-ink-muted`} dangerouslySetInnerHTML={{ __html: html }} />
    </details>
  );
}

// An example trial opens in its own run on the default tab, whatever run or tab the address
// still names (verifier-phase-P16-1 N1).
const exemplar = (run: RunData, t: RunData['trials'][number]) => ({ view: 'runs', run: run.runId, task: t.task, label: null, trial: t.name, tab: null });

// blocked: the run has no pass rate (decisions.tsv 2026-10-29T16:00), so the interval chart is held.
function Charts({ run, blocked }: { run: RunData; blocked: boolean }) {
  const { trials } = run;
  const summary = run.summary!;
  const tasks = Object.entries(summary.tasks);
  const outcomes = OUTCOMES.filter((o) => tasks.some(([, t]) => (t.outcomes[o] ?? 0) > 0));
  const maxCost = Math.max(...tasks.map(([, t]) => t.mean_cost_usd ?? 0), 0.01);
  const exemplars = outcomes.filter((o) => o !== 'PASS').map((o) => ({ o, t: trials.find((x) => x.explanation.outcome === o) })).filter((x) => x.t !== undefined);
  return (
    <>
      {blocked ? (
        <Card title="Pass rate and 95% interval (Wilson)">
          <ModelLine run={run} />
          <p data-testid="interval-held" className="mt-2 text-ink-muted">This run is blocked, so it has no pass rate to show. The notice above names the trials that block it.</p>
        </Card>
      ) : <Card title="Pass rate and 95% interval (Wilson)">
        <ModelLine run={run} />
        {/* Rows are subgrids of one grid, so the charts and the axis line up (ui-polish 2.4). */}
        <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[12rem_1fr_auto]">
          <ul className="col-span-full grid grid-cols-subgrid gap-y-2" data-testid="interval-chart">
            {tasks.map(([id, t]) => (
              <li key={id} className="col-span-full grid grid-cols-subgrid items-center">
                <span className="break-words font-medium">{id} <span className="font-normal text-ink-muted">{t.passes}/{t.trials}</span></span>
                <IntervalRow rate={t.pass_rate} interval={t.wilson95} band={FINAL_PASS_BAND} label={id} />
                <span className="text-xs text-ink-muted"><span data-testid="wilson" className="whitespace-nowrap">{formatInterval(t.wilson95)}</span><span className="my-0.5 block"><VerdictChip task={id} passes={t.passes} trials={t.trials} /></span><PassK task={id} k={t.pass_k} /></span>
                <NotCountedLine task={id} text={notCountedText(notCounted(t))} />
              </li>
            ))}
          </ul>
          <RateAxis col="col-start-2" />
        </div>
        <p className="mt-2 text-xs text-ink-muted"><ChartKey /> <PassKLink /> <VerdictLink /></p>
      </Card>}
      <Card title="Why tasks fail">
        <p className="text-xs text-ink-muted">For each task: its failed trials by <GlossaryLink anchor="taxonomy">kind of failure</GlossaryLink>, the gate checks that decided them, and <GlossaryLink anchor="fault-labels">whose fault each failure is</GlossaryLink>, {FAULT_BY}. Each link opens those trials in Runs.</p>
        <ul className="mt-3 divide-y divide-line" data-testid="why-fail">
          {/* A task with no failures shows its empty bar and "No failures" alone (P25u V3): no fault
              box of zero counts and no "No failed check" line; its reruns line stays when it had
              any (counts.ts whyFailParts, F3). */}
          {tasks.map(([id, t]) => {
            const parts = whyFailParts(t.fault_counts);
            return (
              <li key={id} data-task={id} className="grid grid-cols-1 gap-x-4 gap-y-2 py-3 lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)]">
                <span className="break-words font-medium">{id} <span className="font-normal text-ink-muted">{t.fault_counts.failures === 0 ? `no failures in ${t.trials} trials` : `${t.fault_counts.failures} of ${t.trials} trials failed`}</span></span>
                <div className="min-w-0 space-y-2">
                  <KindBar task={id} fc={t.fault_counts} trials={t.trials} />
                  {parts.faultBox && <FaultBox task={id} fcs={[t.fault_counts]} explanations={trials.filter((x) => x.task === id).map((x) => x.explanation)} />}
                  {parts.reruns && <p className="text-xs text-ink-muted"><Reruns count={t.fault_counts.infra_reruns} /></p>}
                </div>
                {parts.faultBox && <TopChecks task={id} top={t.top_failed_checks} textOf={(c) => { const r = checkTextOf(id)?.[c]?.requires; return r ? `requires ${r}` : null; }} />}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-ink-muted"><GlossaryLink anchor="taxonomy">The kinds of model failure</GlossaryLink></p>
      </Card>
      <Card title="Cost per trial">
        <ul className="space-y-2" data-testid="cost-chart">
          {tasks.map(([id, t]) => (
            <li key={id} className="grid grid-cols-1 items-center gap-x-3 sm:grid-cols-[12rem_1fr_4rem]">
              <span className="font-medium">{id}</span>
              <span className="h-2 rounded-[2px] bg-canvas"><span className="block h-2 rounded-[2px] bg-ink-muted" style={{ width: `${(100 * (t.mean_cost_usd ?? 0)) / maxCost}%` }} /></span>
              <span className="text-right text-xs">${(t.mean_cost_usd ?? 0).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">Mean over each task's records, judge included. Run total ${summary.totals.cost_usd.toFixed(2)} for {summary.totals.records} records.</p>
      </Card>
      <Card title="Example trials">
        <ul className="space-y-1" data-testid="exemplars">
          {exemplars.map(({ o, t }) => (
            <li key={o}>
              <Swatch mark={markOf(o, shownFault(t!.explanation))} outcome={o} title={`${o}: ${markLabel(markOf(o, shownFault(t!.explanation)))}`} />
              <span className="ml-1.5 mr-2 text-ink-muted">{o}</span>
              <a href={hrefWith(exemplar(run, t!))} onClick={onNav(exemplar(run, t!))} className="text-ink underline decoration-line-strong underline-offset-2">{t!.name}</a>
              <span className="ml-2 break-words text-ink-muted">{t!.explanation.reason}</span>
              {t!.explanation.secondary_reason !== null && <span data-testid="secondary-reason" className="ml-2 block break-words text-xs text-ink-muted">{t!.explanation.secondary_reason}</span>}
            </li>
          ))}
        </ul>
        <div className="mt-3"><MarkLegend marks={[...new Set(exemplars.map(({ o, t }) => markOf(o, shownFault(t!.explanation))))]} /></div>
      </Card>
    </>
  );
}
