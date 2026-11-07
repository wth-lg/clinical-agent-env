// The run's place in words, after "Run <id>" in the trial header: the official run, a superseded
// version of one of its tasks (R42), a run of this session (trial/session.ts), or a pilot. A
// session run says only that it is one: the banner above the page already says it is not in the
// published results (P25u A19). Pure, so a unit test reads it.
export interface RunPlace {
  official: boolean;
  kind?: string;
  superseded: { version: string; task: string; of: string } | null;
}

export const runWords = (run: RunPlace): string =>
  run.official ? ', the official run'
    : run.superseded !== null ? `, the superseded ${run.superseded.version} of ${run.superseded.task} in ${run.superseded.of}, not counted in the results`
      : run.kind === 'session' ? ', a run from this session'
        : ', a pilot run, not counted in the results';
