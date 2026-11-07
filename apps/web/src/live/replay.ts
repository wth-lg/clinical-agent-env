// A recorded trial on the live card (P25u A14): with no key, "Watch a recorded trial" plays a
// published trial's events through the Trial card at a fixed pace, so a visitor to the hosted site
// sees an agent work without an API call. replayCandidate picks the trial: the chosen task's
// first trial with a trajectory in the official run, else in the latest pilot that holds one.
// replayTransport is a TrialTransport over those events: it starts nothing, projects nothing,
// and Stop ends the replay. Pure apart from the timer; the view fetches the trajectory.
import type { TrialEvent } from '../../../../packages/core/events.ts';
import type { ExplainRecord } from '../../../../packages/core/explain.ts';
import type { RunData, Trial } from '../data/run-types.ts';
import { REPLAY_STOPPED } from './copy.ts';
import type { TrialEnd, TrialTransport } from './types.ts';

export const REPLAY_STEP_MS = 150;

export interface ReplayCandidate { run: RunData; trial: Trial; url: string }

const byIndex = (a: Trial, b: Trial) => (a.record.index ?? 0) - (b.record.index ?? 0);

export function replayCandidate(official: RunData | null, pilots: readonly RunData[], task: string): ReplayCandidate | null {
  for (const run of [...(official === null ? [] : [official]), ...[...pilots].reverse()]) {
    const trial = run.trials.filter((t) => t.task === task && t.trajectoryUrl !== null).sort(byIndex)[0];
    if (trial !== undefined) return { run, trial, url: trial.trajectoryUrl! };
  }
  return null;
}

// The banner over a replay: which trial, and that nothing is called.
export const replayBanner = (c: ReplayCandidate): string =>
  `Replay of ${c.run.runId} trial ${(c.trial.record.index ?? 0) + 1} (${c.trial.name}); no API calls. The steps play at a fixed pace, not the real one.`;

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
});

export function replayTransport(events: readonly TrialEvent[], record: ExplainRecord | null, stepMs = REPLAY_STEP_MS): TrialTransport {
  let stopped = false;
  const cancelled = (message: string): TrialEnd => ({ state: 'cancelled', record: null, message });
  return {
    kind: 'replay',
    async start() {
      return { ok: false, lead: 'A replay runs nothing.', detail: null };
    },
    async project() {
      return { usd: 0, committed: 0, bound: true };
    },
    async spent() {
      return 0;
    },
    async events(_id, onEvent, signal) {
      for (const e of events) {
        if (signal.aborted) return cancelled('stopped watching');
        if (stopped) return cancelled(REPLAY_STOPPED);
        onEvent(e);
        await sleep(stepMs, signal);
      }
      if (signal.aborted) return cancelled('stopped watching');
      if (stopped) return cancelled(REPLAY_STOPPED);
      return { state: record !== null && record.outcome === 'CANCELLED' ? 'cancelled' : 'graded', record, message: null };
    },
    async cancel() {
      stopped = true;
    },
    async runs() {
      return [];
    },
  };
}
