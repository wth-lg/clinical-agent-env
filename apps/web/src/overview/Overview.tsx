// Overview: one row per task of the official run, from its summary.json and records: pass k of
// N valid trials (N read from the run, never a constant), the Wilson 95% interval drawn against
// the final run's band (FINAL_PASS_BAND), one swatch per trial, mean score and mean cost.
import type { Ref } from 'react';
import { FINAL_PASS_BAND } from '../../../../packages/core/cost.ts';
import { useResults } from '../data/results.ts';
import { formatInterval, IntervalRow, NO_RESULTS, Notice, Page, Swatch } from '../data/ui.tsx';
import { hrefWith, onNav } from '../data/url.ts';

const money = (x: number | null) => (x === null ? 'n/a' : `$${x.toFixed(2)}`);

export function Overview({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const results = useResults();
  const [lo, hi] = FINAL_PASS_BAND;
  if (results === null) return <Page title="Overview" headingRef={headingRef}><Notice>Loading the published results…</Notice></Page>;
  if (results.kind === 'empty') return <Page title="Overview" headingRef={headingRef}><Notice testId="empty-state">{NO_RESULTS} The final run is published here when it is committed. Tasks and Environment work now, with no key.</Notice></Page>;
  if (results.kind === 'error') return <Page title="Overview" headingRef={headingRef}><Notice testId="error-state">The published results cannot be read: {results.message}</Notice></Page>;
  const { summary, trials, runId } = results.run;
  const t = summary.totals;
  return (
    <Page
      title="Overview"
      headingRef={headingRef}
      lead={<>Run <span className="font-medium text-ink">{runId}</span>: {t.passes} of {t.trials} valid trials pass across {Object.keys(summary.tasks).length} tasks. The shaded band is the target pass rate, {Math.round(lo * 100)}% to {Math.round(hi * 100)}%.</>}
    >
      <div className="overflow-x-auto rounded-sm border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left">
          <thead className="border-b border-line text-xs text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Task</th>
              <th scope="col" className="px-2 py-2 font-medium">Pass</th>
              <th scope="col" className="w-64 px-2 py-2 font-medium">95% interval (Wilson)</th>
              <th scope="col" className="px-2 py-2 font-medium">Trials</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Mean score</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Mean cost</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(summary.tasks).map(([id, s]) => (
              <tr key={id} data-testid="overview-row" data-task={id} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-2.5 font-medium">
                  <a href={hrefWith({ view: 'runs', task: id, label: null, trial: null })} onClick={onNav({ view: 'runs', task: id, label: null, trial: null })} className="text-ink hover:underline">{id}</a>
                </th>
                <td className="whitespace-nowrap px-2 py-2.5" data-testid="k-of-n">{s.passes}/{s.trials}</td>
                <td className="px-2 py-2.5">
                  <IntervalRow rate={s.pass_rate} interval={s.wilson95} band={FINAL_PASS_BAND} label={id} />
                  <span className="text-xs text-ink-muted" data-testid="wilson">{formatInterval(s.wilson95)}</span>
                </td>
                <td className="px-2 py-2.5">
                  <span className="flex max-w-56 flex-wrap gap-1" data-testid="swatches">
                    {trials.filter((x) => x.task === id).map((x) => <Swatch key={x.name} outcome={x.explanation.outcome} title={`${x.name}: ${x.explanation.outcome}`} />)}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right">{s.mean_score === null ? 'n/a' : s.mean_score.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right">{money(s.mean_cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">
        Swatches: blue PASS, dark FAIL, outlined REFUSAL, grey LIMIT, dashed an excluded trial (rerun or blocked). Each task links to its trials in Runs.
      </p>
    </Page>
  );
}
