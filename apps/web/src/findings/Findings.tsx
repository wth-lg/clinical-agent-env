// Findings: docs/findings.md, rendered, and the charts it rests on, all from the official run's
// summary.json: pass rate with its Wilson 95% interval per task and the trials its k/n leaves out
// (ENV_LIMIT and the other excluded outcomes, with why), why each task fails (P17j JU7:
// its valid failures by kind as a bar, its top failed checks and its fault box, findings/why.tsx),
// and mean cost per trial; a run that is blocked says so first; then links to
// an example trial of each non-pass outcome, the glossary and the full write-up (a link only when
// the build holds data/writeup.html, which the final run publishes). Read-only: new runs need a key.
import { Marked } from 'marked';
import { useMemo, type Ref } from 'react';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../../../../packages/core/cost.ts';
import { OUTCOMES } from '../../../../packages/core/outcomes.ts';
import { runBlock, shownFault } from '../data/failures.ts';
import { notCounted, notCountedText } from '../data/marks.ts';
import { checkTextOf, dataUrl, gradingLine, pilotRates, useResults, type RunData } from '../data/results.ts';
import { Card, CARD, formatInterval, GlossaryLink, IntervalRow, markLabel, MarkLegend, markOf, NO_RESULTS, Notice, Page, Swatch } from '../data/ui.tsx';
import { FaultBox, KindBar, RunBlocked, TopChecks } from './why.tsx';
import { ModelLine, PassK, PassKLink } from './passk.tsx';
import { hrefWith, onNav } from '../data/url.ts';

const READ_ONLY = 'These results are read-only. Running new trials needs an API key.';

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
  if (results.kind === 'error') return <Page title="Findings" headingRef={headingRef}><Notice testId="error-state">The published results cannot be read: {results.message}</Notice></Page>;
  if (results.official === null) {
    return (
      <Page title="Findings" headingRef={headingRef} lead={READ_ONLY}>
        <p data-testid="empty-state" className="text-ink-muted">{NO_RESULTS} The findings show here when the final run is committed.</p>
        {results.pilots.map((p) => <PilotFindings key={p.runId} run={p} />)}
        <WillShow />
        {links}
      </Page>
    );
  }
  const block = runBlock(results.official.trials);
  return (
    <Page title="Findings" headingRef={headingRef} lead={READ_ONLY}>
      {block !== null && <RunBlocked block={block} runId={results.official.runId} />}
      {links}
      {results.findings !== null && (block === null ? <Markdown text={results.findings} /> : <p data-testid="findings-held" className="text-ink-muted">The write-up gives the run's pass rates, so it shows again when the run is no longer blocked.</p>)}
      <Charts run={results.official} blocked={block !== null} />
    </Page>
  );
}

const link = 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';

// The trials of a task that its k/n leaves out, and why (data/marks.ts notCounted), under its row.
function NotCountedLine({ task, text }: { task: string; text: string | null }) {
  return text === null ? null : <span data-testid="not-counted" data-task={task} className="break-words text-xs text-ink-muted sm:col-span-3">{text}</span>;
}

function PilotFindings({ run }: { run: RunData }) {
  const graded = gradingLine(run.grading);
  return (
    <Card title={<>Pilot {run.runId}: <span className="font-normal">Pilot, not counted in the results</span></>}>
      <div data-testid="pilot-findings" data-run={run.runId} className="space-y-3">
        <ul className="space-y-2" data-testid="pilot-interval-chart">
          {pilotRates(run).map((r) => (
            <li key={r.task} data-testid="pilot-rate" data-task={r.task} className="grid grid-cols-1 items-center gap-x-3 sm:grid-cols-[12rem_1fr_9rem]">
              <span className="break-words font-medium">{r.task} <span className="font-normal text-ink-muted">{r.passes}/{r.valid}</span></span>
              <IntervalRow rate={r.rate} interval={r.interval} band={FINAL_PASS_BAND} label={`${r.task} (pilot)`} />
              <span className="text-xs text-ink-muted">Wilson 95% {formatInterval(r.interval)}</span>
              <NotCountedLine task={r.task} text={notCountedText(notCounted({ outcomes: r.outcomes }))} />
            </li>
          ))}
        </ul>
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
    <Card title="What this page will show">
      <ul className="list-disc space-y-1 pl-5" data-testid="will-show">
        <li>The pass rate of each task over {FINAL_TRIALS_PER_TASK} trials, with its Wilson 95% interval. A trial passes only when it meets every gate check: <GlossaryLink anchor="pass">see how a pass is counted on Attribution</GlossaryLink>.</li>
        <li>The outcome of every trial, and whose fault each failure is (the model, the environment or the grader): <GlossaryLink anchor="fault-labels">see the fault labels on Attribution</GlossaryLink>.</li>
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

function Markdown({ text }: { text: string }) {
  const html = useMemo(() => md.parse(text, { async: false }), [text]);
  return <article data-testid="findings-md" className={`min-w-0 space-y-3 break-words ${CARD} p-4 [&_code]:rounded-sm [&_code]:bg-canvas [&_code]:px-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:pt-2 [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_td]:border-t [&_td]:border-line [&_td]:py-1 [&_td]:pr-3 [&_th]:py-1 [&_th]:pr-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-ink-muted`} dangerouslySetInnerHTML={{ __html: html }} />;
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
        <ul className="mt-2 space-y-2" data-testid="interval-chart">
          {tasks.map(([id, t]) => (
            <li key={id} className="grid grid-cols-1 items-center gap-x-3 sm:grid-cols-[12rem_1fr_9rem]">
              <span className="break-words font-medium">{id} <span className="font-normal text-ink-muted">{t.passes}/{t.trials}</span></span>
              <IntervalRow rate={t.pass_rate} interval={t.wilson95} band={FINAL_PASS_BAND} label={id} />
              <span className="text-xs text-ink-muted">{formatInterval(t.wilson95)}<PassK task={id} k={t.pass_k} /></span>
              <NotCountedLine task={id} text={notCountedText(notCounted(t))} />
            </li>
          ))}
        </ul>
        <p aria-hidden className="mt-1 grid grid-cols-1 text-xs text-ink-muted sm:grid-cols-[12rem_1fr_9rem] sm:gap-x-3"><span className="hidden sm:block" /><span className="flex max-w-72 justify-between"><span>0%</span><span>50%</span><span>100%</span></span></p>
        <p className="mt-2 text-xs text-ink-muted">Dot: pass rate. Whisker: Wilson 95% interval. Shaded: the target band {FINAL_PASS_BAND[0] * 100}% to {FINAL_PASS_BAND[1] * 100}%. <PassKLink /></p>
      </Card>}
      <Card title="Why tasks fail">
        <p className="text-xs text-ink-muted">For each task: its failed trials by <GlossaryLink anchor="taxonomy">kind of failure</GlossaryLink>, the gate checks that decided them, and whose fault each is by the human audit. Each link opens those trials in Runs.</p>
        <ul className="mt-3 divide-y divide-line" data-testid="why-fail">
          {tasks.map(([id, t]) => (
            <li key={id} data-task={id} className="grid grid-cols-1 gap-x-4 gap-y-2 py-3 lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)]">
              <span className="break-words font-medium">{id} <span className="font-normal text-ink-muted">{t.fault_counts.failures} failed trial{t.fault_counts.failures === 1 ? '' : 's'}</span></span>
              <div className="min-w-0 space-y-2">
                <KindBar task={id} fc={t.fault_counts} />
                <FaultBox task={id} fcs={[t.fault_counts]} explanations={trials.filter((x) => x.task === id).map((x) => x.explanation)} />
              </div>
              <TopChecks task={id} top={t.top_failed_checks} textOf={(c) => { const r = checkTextOf(id)?.[c]?.requires; return r ? `requires ${r}` : null; }} />
            </li>
          ))}
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
