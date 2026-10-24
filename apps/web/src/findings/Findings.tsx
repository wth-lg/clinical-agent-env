// Findings: docs/findings.md, rendered, and the charts it rests on, all from the official run's
// summary.json: pass rate with its Wilson 95% interval per task, the outcomes of every record per
// task as a stacked bar (its totals are summary.json's), and mean cost per trial; then links to
// an example trial of each non-pass outcome, the glossary and the full write-up. Read-only: new
// runs need a key.
import { marked } from 'marked';
import { useMemo, type Ref } from 'react';
import { FINAL_PASS_BAND } from '../../../../packages/core/cost.ts';
import { OUTCOMES } from '../../../../packages/core/outcomes.ts';
import { dataUrl, useResults, type RunData } from '../data/results.ts';
import { Card, formatInterval, GlossaryLink, IntervalRow, NO_RESULTS, Notice, Page, swatchClass } from '../data/ui.tsx';
import { hrefWith, onNav } from '../data/url.ts';

const READ_ONLY = 'These results are read-only. Running new trials needs an API key.';

export function Findings({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const results = useResults();
  const links = (
    <p className="flex flex-wrap gap-x-4 gap-y-1">
      <GlossaryLink>How failures are attributed</GlossaryLink>
      <a href={dataUrl('writeup.html')} className="text-ink underline decoration-line-strong underline-offset-2">Full writeup</a>
    </p>
  );
  if (results === null) return <Page title="Findings" headingRef={headingRef}><Notice>Loading the published results…</Notice></Page>;
  if (results.kind === 'error') return <Page title="Findings" headingRef={headingRef}><Notice testId="error-state">The published results cannot be read: {results.message}</Notice></Page>;
  if (results.kind === 'empty') {
    return (
      <Page title="Findings" headingRef={headingRef} lead={READ_ONLY}>
        <Notice testId="empty-state">{NO_RESULTS} The findings, their charts and example trials show here when the final run is committed.</Notice>
        {links}
      </Page>
    );
  }
  return (
    <Page title="Findings" headingRef={headingRef} lead={READ_ONLY}>
      {links}
      {results.run.findings !== null && <Markdown text={results.run.findings} />}
      <Charts run={results.run} />
    </Page>
  );
}

function Markdown({ text }: { text: string }) {
  // docs/findings.md is a committed file of this repository, not user input; the page's CSP
  // blocks any inline script it could carry.
  const html = useMemo(() => marked.parse(text, { async: false }), [text]);
  return <article data-testid="findings-md" className="space-y-3 rounded-sm border border-line bg-surface p-4 [&_code]:rounded-sm [&_code]:bg-canvas [&_code]:px-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:pt-2 [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_td]:border-t [&_td]:border-line [&_td]:py-1 [&_td]:pr-3 [&_th]:py-1 [&_th]:pr-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-ink-muted" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Charts({ run }: { run: RunData }) {
  const { summary, trials } = run;
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
              <span className="font-medium">{id} <span className="font-normal text-ink-muted">{t.passes}/{t.trials}</span></span>
              <IntervalRow rate={t.pass_rate} interval={t.wilson95} band={FINAL_PASS_BAND} label={id} />
              <span className="text-xs text-ink-muted">{formatInterval(t.wilson95)}</span>
            </li>
          ))}
        </ul>
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
                    <span key={o} data-outcome={o} data-count={t.outcomes[o]} title={`${o}: ${t.outcomes[o]}`} className={`h-full ${swatchClass(o)}`} style={{ width: `${(100 * t.outcomes[o]!) / total}%` }} />
                  ))}
                </span>
                <span className="text-right text-xs text-ink-muted">{total}</span>
              </li>
            );
          })}
        </ul>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Legend">
          {outcomes.map((o) => <li key={o} className="inline-flex items-center gap-1.5"><span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-[2px] ${swatchClass(o)}`} />{o}</li>)}
        </ul>
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
              <span className="ml-2 text-ink-muted">{t!.explanation.reason}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
