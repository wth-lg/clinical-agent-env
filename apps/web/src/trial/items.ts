// A gate check's item results on the Grading tab (plan-amendment-worklist W1-1): how many items of
// the worklist the gate found right, and each failed item with why and, on the gate that decided
// it, its label (packages/grader/attribution.ts items). It imports nothing, like rubric.ts: the e2e
// specs import it.
export interface ItemRow {
  item: string;
  met: boolean;
  why?: string;
  ids?: readonly string[];
}

export interface ItemLabel {
  item: string;
  gate: string;
  auto: string;
}

export interface FailedItem {
  item: string;
  // The item as a reader names it: the part of the gate no item owns reads 'outside the list'.
  name: string;
  why: string;
  ids: readonly string[];
  // The item's kind of failure, on the gate attribution took it from; null on any other gate, or
  // when the current grade has no item labels (a regrade entry written before regrades stored them).
  label: string | null;
}

// The current grade's item labels, as packages/core/summary.ts currentGrade reads the current
// grade (this file imports nothing, so it states the rule itself): the last regrade entry's stored
// attribution (cli/regrade.ts, builder-292), else none for an older entry that stored none, else the
// recorded attribution's. A FAIL that stays a FAIL under a grader fix shows the new grade's labels.
type Labelled = { attribution?: { items?: readonly ItemLabel[] } | null };
export function itemLabelsOf(record: Labelled & { regrades?: readonly object[] }): readonly ItemLabel[] | null {
  const last = record.regrades?.at(-1) as Labelled | undefined;
  if (last === undefined) return record.attribution?.items ?? null;
  return last.attribution === undefined ? null : (last.attribution?.items ?? null);
}

// packages/grader/items.ts OUTSIDE.
const OUTSIDE = 'outside';

export const itemsMetText = (items: readonly ItemRow[]): string => {
  const real = items.filter((i) => i.item !== OUTSIDE);
  return `${real.filter((i) => i.met).length} of ${real.length} items met`;
};

export function failedItems(gate: string, items: readonly ItemRow[], labels: readonly ItemLabel[] | null): FailedItem[] {
  return items.filter((i) => !i.met).map((i) => ({
    item: i.item,
    name: i.item === OUTSIDE ? 'outside the list' : i.item,
    why: i.why ?? 'not met',
    ids: i.ids ?? [],
    label: labels?.find((l) => l.item === i.item && l.gate === gate)?.auto ?? null,
  }));
}
