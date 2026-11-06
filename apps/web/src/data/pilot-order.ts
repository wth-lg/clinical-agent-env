// The one order of the committed pilot runs: by name with numbers compared as numbers, so
// pilot-9 comes before pilot-10 and pilot-4a before pilot-4b (verifier-phase-P17i-UI-2-1,
// JU6-1 F4; pre-audit-2 S24). data/results.ts sorts the pilots by it, and the latest pilot that
// holds a task (Overview's rates per task, the Live trial's typical cost) is the last of them by
// it. Typed on the parts a run needs, so a module the root tsconfig checks (live/typical.ts) can
// read it without results.ts and its Vite-only import.meta.
export interface RunLike {
  runId: string;
  trials: readonly { task: string }[];
}

export const compareRuns = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true });

// The latest of the runs holding a task, by compareRuns on runId, whatever order they come in;
// null when none holds it.
export function latestHolding<R extends RunLike>(runs: readonly R[], task: string): R | null {
  let best: R | null = null;
  for (const r of runs) if (r.trials.some((t) => t.task === task) && (best === null || compareRuns(r.runId, best.runId) >= 0)) best = r;
  return best;
}
