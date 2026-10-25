// The row Back to Runs returns to (review-ui-P16-1 F6): the trial page names it when the user
// leaves by Back to Runs, and the run's list scrolls it into view and focuses it, once.
let pending: { run: string; trial: string } | null = null;

export function returnTo(run: string, trial: string): void {
  pending = { run, trial };
}

// The trial to return to in this run, or null; it is cleared once read.
export function takeReturn(run: string): string | null {
  if (pending === null || pending.run !== run) return null;
  const { trial } = pending;
  pending = null;
  return trial;
}
