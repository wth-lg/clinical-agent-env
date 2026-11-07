// The Live trial view's words and small pure helpers (P25u slice S4), kept apart from the view so
// apps/web/test/live-copy.test.ts can load them in Node: what a stopped trial and a dead runner
// say, the grade button's name, the score line, the over-cap sentence, writes in words, the
// duration of a trial from the official run, and how many runs Your runs shows.
import { neededCap } from '../spend/cap.ts';
import { SCORE_TITLE } from '../trial/rubric.ts';

// A1b: a trial the user stopped. The chip is copy rule C4's; the sentence replaces the grader's
// "stopped from outside … excluded and rerun", which was true of neither Stop nor what follows.
export const STOPPED_LABEL = 'Stopped: not counted';
export const STOPPED_REASON = 'You stopped this trial. It is not counted and says nothing about the model.';

// A2: the local runner's process is gone. The sentence names what happened, the next step with
// its command, and that the page probes for the runner and reloads when it is back.
export const RUNNER_STOPPED_LEAD = 'The local runner stopped.';
export const RUNNER_STOPPED_NEXT = 'Start it again in your terminal (pnpm start); this page reconnects by itself.';
export const RUNNER_STOPPED = `${RUNNER_STOPPED_LEAD} ${RUNNER_STOPPED_NEXT}`;
export const RUNNER_STOPPED_SHORT = 'The local runner stopped';

// A2: Your runs did not load. Only the hosted site can promise that the other pages still work;
// on the local runner every page comes from the runner.
export const runsErrorLead = (hosted: boolean): string => (hosted ? 'Your runs did not load. The other pages still work.' : 'Your runs did not load.');

// A14: a replay the viewer stopped.
export const REPLAY_STOPPED = 'Replay stopped';

// A5: the grade is one click away, named by what the reader will find.
export const gradeButtonLabel = (outcome: string): string => (outcome === 'PASS' ? 'See the grade' : 'See why it failed');

// A5: the score line keeps the Score card's title (trace row N10) and says the score is out of 1;
// the first time on a screen (the card) it says what decides pass, since a FAIL beside a 1.00
// read as a contradiction.
export const RUBRIC_GLOSS = 'Extra credit only; the pass or fail comes from the gate checks.';
export const scoreLine = (score: string, gloss = true): string => `${SCORE_TITLE} ${score} of 1${gloss ? `. ${RUBRIC_GLOSS}` : ''}`;

// A7: why the sizes in `over` (ascending) are disabled: the smallest names the whole-dollar cap
// it needs; the larger ones need more still.
export function overCapText(over: readonly number[], costs: Partial<Record<number, number>>, committed: number): string {
  const first = over[0]!;
  const rest = over.slice(1).map((n) => `×${n}`);
  const need = `Run ×${first} needs a cap of $${neededCap(costs[first]!, committed)} or more`;
  if (rest.length === 0) return `${need}.`;
  const list = rest.length === 1 ? rest[0]! : `${rest.slice(0, -1).join(', ')} and ${rest.at(-1)}`;
  return `${need}; ${list} need${rest.length === 1 ? 's' : ''} more still.`;
}

// A9: what a written record is, in words, before its id.
const RESOURCE_WORDS: Readonly<Record<string, string>> = {
  DocumentReference: 'Note',
  ServiceRequest: 'Order',
  MedicationRequest: 'Medication order',
  Communication: 'Message',
  Provenance: 'Provenance record',
  Task: 'Task',
  Observation: 'Result',
  Appointment: 'Appointment',
  Encounter: 'Encounter',
  Condition: 'Condition',
  Patient: 'Patient',
};
export function writeWords(id: string): string {
  const slash = id.indexOf('/');
  if (slash <= 0) return 'Record';
  const type = id.slice(0, slash);
  return RESOURCE_WORDS[type] ?? type.replace(/(?<=[a-z])(?=[A-Z])/g, ' ').replace(/^(.)(.*)$/, (_, a: string, b: string) => a + b.toLowerCase());
}

// J14: how long a trial takes, from the official run's median duration per task (seconds): the
// range in whole minutes.
export function durationWords(medianSeconds: readonly number[]): string | null {
  if (medianSeconds.length === 0) return null;
  const minutes = medianSeconds.map((s) => Math.round(s / 60));
  const lo = Math.min(...minutes);
  const hi = Math.max(...minutes);
  if (hi < 1) return 'under a minute';
  if (lo === hi) return `about ${hi} minute${hi === 1 ? '' : 's'}`;
  return `about ${Math.max(lo, 1)} to ${hi} minutes`;
}

// A15: Your runs shows the latest LATEST_RUNS runs, newest first, and counts the rest as hidden
// until "Show older runs".
export const LATEST_RUNS = 5;
export function runsShown<R>(runs: readonly R[], all: boolean): { shown: R[]; hidden: number } {
  const newest = [...runs].reverse();
  if (all || newest.length <= LATEST_RUNS) return { shown: newest, hidden: 0 };
  return { shown: newest.slice(0, LATEST_RUNS), hidden: newest.length - LATEST_RUNS };
}
