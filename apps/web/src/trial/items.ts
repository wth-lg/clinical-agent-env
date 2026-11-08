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
  // The step each of the item's deciding records was first returned to the model (the record's
  // attribution.items[].exposure), when the grade stored it.
  exposure?: ReadonlyArray<{ id: string; first_exposed_step: number | null }>;
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

const and = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`);

// The grader's event_seen sentence (packages/grader/events.ts) says an event "was never read"
// when the seen rule failed, though a tool result may have shown some of its records. The trial
// page's Where block lists each record shown and never shown, so the item line says the same from
// the same exposure (claim audit, verifier-1 addendum 2 must-fix 4): the records shown with their
// first step, then the records never shown. With no exposure, or when every record was shown
// (the seen rule failed on what the results showed), the grader's words stay.
const NEVER_READ = /^(event \S+ arrived at step \d+) and was never read before finish$/;
export function itemWhy(why: string, exposure: ItemLabel['exposure'] | undefined): string {
  const m = NEVER_READ.exec(why);
  if (m === null || exposure === undefined || exposure.length === 0) return why;
  const never = exposure.filter((x) => x.first_exposed_step === null).map((x) => x.id);
  if (never.length === 0) return why;
  const shown = exposure.filter((x) => x.first_exposed_step !== null).map((x) => `${x.id} was first shown to the model at step ${x.first_exposed_step}`);
  const notShown = `${and(never)} ${never.length === 1 ? 'was' : 'were'} never shown to the model before finish`;
  return `${m[1]}; ${shown.length === 0 ? notShown : `${and(shown)}, and ${notShown}`}`;
}

export function failedItems(gate: string, items: readonly ItemRow[], labels: readonly ItemLabel[] | null): FailedItem[] {
  return items.filter((i) => !i.met).map((i) => {
    const l = labels?.find((x) => x.item === i.item && x.gate === gate);
    return {
      item: i.item,
      name: i.item === OUTSIDE ? 'outside the list' : i.item,
      why: itemWhy(i.why ?? 'not met', l?.exposure),
      ids: i.ids ?? [],
      label: l?.auto ?? null,
    };
  });
}
