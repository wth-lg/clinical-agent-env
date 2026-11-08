// A trial's plain lead, as the trial page's header writes it (headline.ts plainHeadline with the
// kind the header shows and the record's exposure), so the Runs row and the trial page say the
// same thing (eval-p25u-2 S9: the Runs row showed the raw explainTrial sentence with its
// "; Kind: …" suffix and internal item ids). exactReason: that sentence without the suffix, which
// the lead already says in words; the row keeps it under the lead (trace row U31). Pure.
import { fittingAttribution, type ExplainRecord, type Explanation } from '../../../../packages/core/explain.ts';
import { shownKind } from '../data/failures.ts';
import { plainHeadline, type HeadlineCheck, type HeadlineExposure } from './headline.ts';

export function trialLead(e: Explanation, record: object): string | null {
  const exposure = (fittingAttribution(record as ExplainRecord) as { exposure?: HeadlineExposure } | null)?.exposure ?? null;
  return plainHeadline(e, (record as { checks?: readonly HeadlineCheck[] | null }).checks, shownKind(e) === null ? null : e.taxonomy, exposure);
}

const KIND = '; Kind: ';
export const exactReason = (reason: string): string => {
  const at = reason.lastIndexOf(KIND);
  return at < 0 ? reason : reason.slice(0, at);
};
