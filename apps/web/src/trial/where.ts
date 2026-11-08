// Where a failure happened, as steps a reader can open (P25u S3, J4): the arrival that put a
// decisive record in the queues, the step each decisive record was first shown at (or never), and
// the decisive step the grader points at. Agent failures start before the step where they show
// (the arrival at 52 and the partial read at 75, not only the finish at 104), so the header's Where
// and the Attribution tab list them all, in step order. The decisive step alone when the record
// gives nothing else. Pure.
import type { DecisiveSource } from './decisive.ts';
import { andList } from './headline.ts';

export interface WhereStep {
  step: number | null;
  kind: 'arrival' | 'shown' | 'never' | 'decisive';
  text: string;
}

export interface WhereInput {
  decisiveStep: number | null;
  // Where the decisive step comes from (decisive.ts DecisiveSource); 'grader' when not given.
  decisiveSource?: DecisiveSource;
  // The decisive ids of the failed check and the step each was first returned to the model
  // (record.attribution.exposure, as explain.ts fittingAttribution reads it).
  exposure: ReadonlyArray<{ id: string; first_exposed_step: number | null }>;
  // The mid-trial arrivals (steps.ts Arrival rows): the step whose call fired each, and what it put in the store.
  arrivals: ReadonlyArray<{ step: number | null; keys: readonly string[] }>;
}

// What the decisive step is, by its source (claim audit: one sentence, "the step the failed check
// points at", sat on a failing item's write on crc-care-gap/5 and on the finish call on
// contrast-ct-prep/0).
export const DECISIVE_TEXT: Readonly<Record<DecisiveSource, string>> = {
  item: 'the write the failed check judged',
  finish: 'the finish call, since the failed check judged no write',
  grader: 'the last write to a record the failed check names',
};

// An arrival's inbox Task (inbox-aNNNN, packages/env/clock.ts) is the notice, not a record of the chart.
const INBOX_TASK = /^Task\/inbox-a\d+$/;

export function whereSteps({ decisiveStep, decisiveSource = 'grader', exposure, arrivals }: WhereInput): WhereStep[] {
  const ids = exposure.map((x) => x.id);
  const out: WhereStep[] = [];
  // An arrival that holds a decisive record names every chart record it put in the queues, so the
  // line agrees with the header's lead, which names the arrival's records the model opened
  // (claim audit: renal-dose-review/4 read "obs-04004 arrived" while the lead named obs-04003
  // and enc-04001 of the same arrival).
  for (const a of arrivals) {
    if (a.step === null || !a.keys.some((k) => ids.includes(k))) continue;
    out.push({ step: a.step, kind: 'arrival', text: `${andList(a.keys.filter((k) => !INBOX_TASK.test(k)))} arrived in the queues` });
  }
  for (const x of exposure) out.push(x.first_exposed_step === null ? { step: null, kind: 'never', text: `${x.id} was never shown to the model` } : { step: x.first_exposed_step, kind: 'shown', text: `${x.id} was first shown to the model` });
  if (decisiveStep !== null) out.push({ step: decisiveStep, kind: 'decisive', text: DECISIVE_TEXT[decisiveSource] });
  // By step; a record never shown last. The sort is stable, so equal steps keep arrival, shown, decisive.
  return out.sort((a, b) => (a.step === null ? Infinity : a.step) - (b.step === null ? Infinity : b.step));
}
