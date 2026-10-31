// A pilot run's pass rates, one row per task: the task, k/N, the interval chart and the Wilson
// text (ui-polish 2.1), shared by Findings and the Overview pilot card. A task with a failed
// trial links its k/N to that task's trials in Runs. The rows are subgrids of one grid, so the
// charts line up and the Wilson column is as wide as its widest text, which never wraps. Below sm
// the chart hides and the text stays, with "Wilson" left to screen readers, so a row is one line
// on a phone.
import type { ReactNode } from 'react';
import { FINAL_PASS_BAND } from '../../../../packages/core/cost.ts';
import { pilotRates, type RunData } from '../data/results.ts';
import { formatInterval, IntervalRow } from '../data/ui.tsx';
import { hrefWith, onNav } from '../data/url.ts';

const link = 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';
const toTask = (run: string, task: string) => ({ view: 'runs', run, task, label: null, trial: null, check: null, audit: null });

// The chart's key in words, once per card under the axis (ui-polish 2.4).
export const CHART_KEY = `Dot: pass rate. Whisker: Wilson 95% interval. Shaded: the target band ${FINAL_PASS_BAND[0] * 100}% to ${FINAL_PASS_BAND[1] * 100}%.`;

// The 0/50/100% labels in the chart column of a subgrid row; col: that column's start class.
export function RateAxis({ col }: { col: string }) {
  return (
    <p aria-hidden data-testid="pilot-axis" className="col-span-full hidden text-xs text-ink-muted sm:grid sm:grid-cols-subgrid">
      <span className={`flex justify-between px-[1%] ${col}`}><span>0%</span><span>50%</span><span>100%</span></span>
    </p>
  );
}

// below: a line under a task's row (Findings: the trials its k/N leaves out); axis: the axis row.
export function PilotRateRows({ run, below, axis = false }: { run: RunData; below?: (r: ReturnType<typeof pilotRates>[number]) => ReactNode; axis?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,12rem)_auto_1fr_auto]">
      <ul className="col-span-full grid grid-cols-subgrid gap-y-2" data-testid="pilot-interval-chart">
        {pilotRates(run).map((r) => (
          <li key={r.task} data-testid="pilot-rate" data-task={r.task} className="col-span-full grid grid-cols-subgrid items-center gap-y-0.5">
            <span className="min-w-0 break-words font-medium">{r.task}</span>
            {r.passes < r.valid
              ? <a href={hrefWith(toTask(run.runId, r.task))} onClick={onNav(toTask(run.runId, r.task))} className={`whitespace-nowrap text-right ${link}`}>{r.passes}/{r.valid}</a>
              : <span className="whitespace-nowrap text-right text-ink-muted">{r.passes}/{r.valid}</span>}
            <span className="hidden sm:block"><IntervalRow rate={r.rate} interval={r.interval} band={FINAL_PASS_BAND} label={`${r.task} (pilot)`} /></span>
            <span data-testid="wilson" className="whitespace-nowrap text-xs text-ink-muted"><span className="max-sm:sr-only">Wilson </span>95% {formatInterval(r.interval)}</span>
            {below?.(r)}
          </li>
        ))}
      </ul>
      {axis && <RateAxis col="col-start-3" />}
    </div>
  );
}
