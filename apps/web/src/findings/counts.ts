// The numbers behind the "Why tasks fail" card (P25u V3, J8c), apart from the components so
// apps/web/test reads them without JSX: the kind bar drawn to scale, and the confirmation counts.
import { m1ToM4Met, type Explanation } from '../../../../packages/core/explain.ts';
import { FAILURE_KINDS, type FaultCounts } from '../../../../packages/core/summary.ts';
import { isFailure, type FailureKind } from '../data/failures.ts';

export interface KindSegment {
  kind: FailureKind;
  count: number;
  // The kind's share of the track, in percent.
  width: number;
}

// The bar's track is the task's failures over its valid trials, in percent of the full width, so
// the bar's length is the failure rate (V3: before, every bar filled its track); each kind is its
// share of that track, in FAILURE_KINDS order. No valid trials, or no failure: an empty track.
export function kindSegments(fc: FaultCounts, trials: number): { track: number; segments: KindSegment[] } {
  const track = trials > 0 && fc.failures > 0 ? Math.min(100, (100 * fc.failures) / trials) : 0;
  const segments = fc.failures === 0 ? [] : FAILURE_KINDS.filter((k) => fc.taxonomy[k] > 0).map((k) => ({ kind: k, count: fc.taxonomy[k], width: (100 * fc.taxonomy[k]) / fc.failures }));
  return { track, segments };
}

export interface Confirmation {
  failures: number;
  // The failures the record confirms as a fair test of the model: M1-M4 met or n/a
  // (packages/core/explain.ts m1ToM4Met, the rule audit-check's fault box counts by).
  record: number;
  // The failures the human audit agrees with: M5 met.
  audit: number;
}

// "Confirmed by the record (M1–M4) and the human audit (M5)" (copy rule C5): the counts behind
// the phrase, over the valid non-pass trials of the explanations given.
export function confirmation(es: readonly Explanation[]): Confirmation {
  const failed = es.filter(isFailure);
  return {
    failures: failed.length,
    record: failed.filter((e) => m1ToM4Met(e.criteria)).length,
    audit: failed.filter((e) => e.criteria.find((c) => c.id === 'M5')?.met === true).length,
  };
}
