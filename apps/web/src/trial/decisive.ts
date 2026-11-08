// The decisive step the trial page links, in the header's Where and on the Attribution tab
// (eval-p25u-2 MF-2). The grader's attribution.decisive_step is the last write to any id of the
// decisive check, so on a gate over a worklist it can land on an item that passed (final-1
// crc-care-gap/5: step 102, pt-0009's order, while pt-0024's order at step 82 failed). The page
// takes the step of the check's failing items instead: each failing item's decision step (the
// item's `at`), else the last step that wrote one of its ids, and of those the first in step order.
// A check whose failing items name no step (event_seen: "never read before finish") keeps the
// grader's step, the finish. No decisive step (a fault that is not the model's) stays none. Pure.
import { currentGrade } from '../../../../packages/core/summary.ts';
import { lastWrite } from '../../../../packages/grader/exposure.ts';
import type { Step } from '../../../../packages/grader/check.ts';

interface ItemLike { met?: unknown; at?: unknown; ids?: readonly string[] }

export function decisiveStepOf(record: Parameters<typeof currentGrade>[0], check: string | null, graderStep: number | null, steps: readonly Step[] | null): number | null {
  if (graderStep === null || check === null) return graderStep;
  const gate = (currentGrade(record).checks ?? []).find((c) => c.id === check) as { items?: readonly ItemLike[] } | undefined;
  const at = (gate?.items ?? []).filter((i) => i.met === false).flatMap((i) => {
    if (typeof i.at === 'number') return [i.at];
    const w = steps === null || i.ids === undefined ? null : lastWrite(steps, i.ids);
    return w === null ? [] : [w];
  });
  return at.length === 0 ? graderStep : Math.min(...at);
}
