// Findings: docs/findings.md, rendered, and the charts it rests on, all from the official run's
// summary.json: pass rate with its Wilson 95% interval per task, the outcomes of every record per
// task as a stacked bar (its totals are summary.json's), and mean cost per trial; then links to
// an example trial of each non-pass outcome, the glossary and the full write-up (a link only when
// the build holds data/writeup.html, which the final run publishes). Read-only: new runs need a key.
import { Marked } from 'marked';
import { useMemo, type Ref } from 'react';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../../../../packages/core/cost.ts';
import { OUTCOMES } from '../../../../packages/core/outcomes.ts';
import { dataUrl, gradingLine, pilotRates, useResults, type RunData } from '../data/results.ts';
import { Card, formatInterval, GlossaryLink, IntervalRow, MarkLegend, markOf, markProps, NO_RESULTS, Notice, Page } from '../data/ui.tsx';
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
  return (
    <Page title="Findings" headingRef={headingRef} lead={READ_ONLY}>
      {links}
      {results.findings !== null && <Markdown text={results.findings} />}
      <Charts run={results.official} />
    </Page>
  );
}

const link = 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';

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
            </li>
          ))}
        </ul>
        {graded !== null && <p className="text-xs text-ink-muted">{graded}</p>}
        <MarkLegend marks={[...new Set(run.trials.map((t) => markOf(t.explanation.outcome, t.explanation.fault)))]} />
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
        <li>The pass rate of each task over {FINAL_TRIALS_PER_TASK} trials, with its Wilson 95% interval. A trial passes only when it meets every gate check: <GlossaryLink anchor="pass">see how a pass is counted on Labels</GlossaryLink>.</li>
        <li>The outcome of every trial, and whose fault each failure is (the model, the environment or the grader): <GlossaryLink>see how failures are attributed</GlossaryLink>.</li>
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
  return <article data-testid="findings-md" className="min-w-0 space-y-3 break-words rounded-sm border border-line bg-surface p-4 [&_code]:rounded-sm [&_code]:bg-canvas [&_code]:px-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:pt-2 [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_td]:border-t [&_td]:border-line [&_td]:py-1 [&_td]:pr-3 [&_th]:py-1 [&_th]:pr-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-ink-muted" dangerouslySetInnerHTML={{ __html: html }} />;
}

const withWidth = (p: ReturnType<typeof markProps>, pct: number) => ({ ...p, style: { ...p.style, width: `${pct}%` } });

function Charts({ run }: { run: RunData }) {
  const { trials } = run;
  const summary = run.summary!;
  const tasks = Object.entries(summary.tasks);
  const outcomes = OUTCOMES.filter((o) => tasks.some(([, t]) => (t.outcomes[o] ?? 0) > 0));
  const maxCost = Math.max(...tasks.map(([, t]) => t.mean_cost_usd ?? 0), 0.01);
  const exemplars = outcomes.filter((o) => o !== 'PASS').map((o) => ({ o, t: trials.find((x) => x.explanation.outcome === o) })).filter((x) => x.t !== undefined);
  return (
    <>
      <Card title="Pass rate and 95% interval (Wilson)">
        <ul className="space-y-2" data-testid="interval-chart">
          {tasks.map(([id, t]) => (
            <li key={id} className="grid grid-cols-1 items-center gap-x-3 sm:grid-cols-[12rem_1fr_9rem]">
              <span className="break-words font-medium">{id} <span className="font-normal text-ink-muted">{t.passes}/{t.trials}</span></span>
              <IntervalRow rate={t.pass_rate} interval={t.wilson95} band={FINAL_PASS_BAND} label={id} />
              <span className="text-xs text-ink-muted">{formatInterval(t.wilson95)}</span>
            </li>
          ))}
        </ul>
        <p aria-hidden className="mt-1 grid grid-cols-1 text-xs text-ink-muted sm:grid-cols-[12rem_1fr_9rem] sm:gap-x-3"><span className="hidden sm:block" /><span className="flex max-w-72 justify-between"><span>0%</span><span>50%</span><span>100%</span></span></p>
        <p className="mt-2 text-xs text-ink-muted">Dot: pass rate. Whisker: Wilson 95% interval. Shaded: the target band {FINAL_PASS_BAND[0] * 100}% to {FINAL_PASS_BAND[1] * 100}%.</p>
      </Card>
      <Card title="Outcomes per task">
        <ul className="space-y-2" data-testid="taxonomy-chart">
          {tasks.map(([id, t]) => {
            const total = Object.values(t.outcomes).reduce((a, b) => a + b, 0);
            return (
              <li key={id} className="grid grid-cols-1 items-center gap-x-3 sm:grid-cols-[12rem_1fr_3rem]">
                <span className="font-medium">{id}</span>
                <span data-testid="taxonomy-bar" data-task={id} data-total={total} className="flex h-4 overflow-hidden rounded-[2px] border border-line" role="img" aria-label={`${id}: ${outcomes.filter((o) => t.outcomes[o]).map((o) => `${t.outcomes[o]} ${o}`).join(', ')}`}>
                  {outcomes.filter((o) => (t.outcomes[o] ?? 0) > 0).map((o) => (
                    <span key={o} data-outcome={o} data-count={t.outcomes[o]} title={`${o}: ${t.outcomes[o]}`} {...withWidth(markProps(markOf(o), 'h-full'), (100 * t.outcomes[o]!) / total)} />
                  ))}
                </span>
                <span className="text-right text-xs text-ink-muted">{total}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3"><MarkLegend marks={outcomes.map((o) => markOf(o))} /></div>
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
              <span className="mr-2 text-ink-muted">{o}</span>
              <a href={hrefWith({ view: 'runs', task: t!.task, label: null, trial: t!.name })} onClick={onNav({ view: 'runs', task: t!.task, label: null, trial: t!.name })} className="text-ink underline decoration-line-strong underline-offset-2">{t!.name}</a>
              <span className="ml-2 break-words text-ink-muted">{t!.explanation.reason}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
