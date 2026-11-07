// Where a failure happened, as steps a reader can open (P25u S3, J4): the arrival that put a
// decisive record in the queues, the step each decisive record was first shown at (or never), and
// the decisive step the grader points at. Agent failures start before the step where they show
// (the arrival at 52 and the partial read at 75, not only the finish at 104), so the header's Where
// and the Attribution tab list them all, in step order. The decisive step alone when the record
// gives nothing else. Pure.
import { andList } from './headline.ts';

export interface WhereStep {
  step: number | null;
  kind: 'arrival' | 'shown' | 'never' | 'decisive';
  text: string;
}

export interface WhereInput {
  decisiveStep: number | null;
  // The decisive ids of the failed check and the step each was first returned to the model
  // (record.attribution.exposure, as explain.ts fittingAttribution reads it).
  exposure: ReadonlyArray<{ id: string; first_exposed_step: number | null }>;
  // The mid-trial arrivals (steps.ts Arrival rows): the step whose call fired each, and what it put in the store.
  arrivals: ReadonlyArray<{ step: number | null; keys: readonly string[] }>;
}

export const DECISIVE_TEXT = 'the step the failed check points at';

export function whereSteps({ decisiveStep, exposure, arrivals }: WhereInput): WhereStep[] {
  const ids = exposure.map((x) => x.id);
  const out: WhereStep[] = [];
  for (const a of arrivals) {
    const named = a.keys.filter((k) => ids.includes(k));
    if (named.length > 0 && a.step !== null) out.push({ step: a.step, kind: 'arrival', text: `${andList(named)} arrived in the queues` });
  }
  for (const x of exposure) out.push(x.first_exposed_step === null ? { step: null, kind: 'never', text: `${x.id} was never shown to the model` } : { step: x.first_exposed_step, kind: 'shown', text: `${x.id} was first shown to the model` });
  if (decisiveStep !== null) out.push({ step: decisiveStep, kind: 'decisive', text: DECISIVE_TEXT });
  // By step; a record never shown last. The sort is stable, so equal steps keep arrival, shown, decisive.
  return out.sort((a, b) => (a.step === null ? Infinity : a.step) - (b.step === null ? Infinity : b.step));
}
