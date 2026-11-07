// The numbers behind the "Why tasks fail" card (P25u V3, J8c), apart from the components so
// apps/web/test reads them without JSX: the kind bar drawn to scale, and the confirmation counts.
import type { Explanation } from '../../../../packages/core/explain.ts';
import { FAILURE_KINDS, type FaultCounts } from '../../../../packages/core/summary.ts';
import { isFailure, m1m4, type FailureKind } from '../data/failures.ts';

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
// the phrase, over the valid non-pass trials of the explanations given. The record's count is
// data/failures.ts m1m4, the one rule (F7: no second copy here).
export function confirmation(es: readonly Explanation[]): Confirmation {
  const m = m1m4(es);
  return {
    failures: m.failures,
    record: m.met,
    audit: es.filter(isFailure).filter((e) => e.criteria.find((c) => c.id === 'M5')?.met === true).length,
  };
}

// What a task's "Why tasks fail" row shows under its bar (V3, F3): the fault box only with
// failures; the infrastructure reruns line on its own when a task with no failures still had
// trials rerun, so that count is never hidden.
export function whyFailParts(fc: Pick<FaultCounts, 'failures' | 'infra_reruns'>): { faultBox: boolean; reruns: boolean } {
  return { faultBox: fc.failures > 0, reruns: fc.failures === 0 && fc.infra_reruns > 0 };
}
