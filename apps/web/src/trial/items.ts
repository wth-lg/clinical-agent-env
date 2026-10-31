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
  // when the record's attribution has no item labels (a regraded trial).
  label: string | null;
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
