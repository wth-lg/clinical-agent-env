// A trial's plain lead, as the trial page's header writes it (headline.ts plainHeadline with the
// kind the header shows, the record's exposure and, once loaded, the trajectory's arrivals), so
// the Runs row and the trial page say the same thing (eval-p25u-2 S9: the Runs row showed the raw
// explainTrial sentence with its "; Kind: …" suffix and internal item ids). The Runs row has no
// trajectory, so where an arrival filed records the item does not name, the trial page adds what
// the model opened of them. exactReason: that sentence without the suffix, which
// the lead already says in words; the row keeps it under the lead (trace row U31). Pure.
import { fittingAttribution, type ExplainRecord, type Explanation } from '../../../../packages/core/explain.ts';
import { shownKind } from '../data/failures.ts';
import { sameId } from '../../../../packages/grader/exposure.ts';
import { plainHeadline, type HeadlineArrival, type HeadlineCheck, type HeadlineExposure } from './headline.ts';

// The trajectory as steps.ts trajectoryOf folds it, narrowed to what the lead reads.
export interface LeadTrajectory {
  rows: ReadonlyArray<{ kind: string; step: number | null; spec?: string; keys?: readonly string[] }>;
  steps: ReadonlyArray<{ n: number; exposed_ids: readonly string[] }>;
}

// Each arrival with the records it filed and the first step after it that showed each record. The
// inbox Task that announces an arrival is the notice, not a record of it, so it is left out.
export function arrivalsOf(traj: LeadTrajectory): HeadlineArrival[] {
  return traj.rows.flatMap((r) => {
    if (r.kind !== 'arrival' || r.spec === undefined) return [];
    const records = (r.keys ?? []).filter((id) => !id.startsWith('Task/')).map((id) => ({
      id,
      opened_step: traj.steps.find((s) => (r.step === null || s.n > r.step) && s.exposed_ids.some((k) => sameId(k, id)))?.n ?? null,
    }));
    return [{ spec: r.spec, records }];
  });
}

// trajectory: the folded trajectory when the caller has loaded it (the trial page); the Runs row
// has the record alone, so its lead names only the records the record covers.
export function trialLead(e: Explanation, record: object, trajectory?: LeadTrajectory | null): string | null {
  const exposure = (fittingAttribution(record as ExplainRecord) as { exposure?: HeadlineExposure } | null)?.exposure ?? null;
  const arrivals = trajectory ? arrivalsOf(trajectory) : null;
  return plainHeadline(e, (record as { checks?: readonly HeadlineCheck[] | null }).checks, shownKind(e) === null ? null : e.taxonomy, exposure, arrivals);
}

const KIND = '; Kind: ';
export const exactReason = (reason: string): string => {
  const at = reason.lastIndexOf(KIND);
  return at < 0 ? reason : reason.slice(0, at);
};
