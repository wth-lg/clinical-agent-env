// The per-item gate (plan-amendment-worklist W1-1): a worklist task's gate checks each item of its
// expected.items on its own and records every item's result on the gate's result (Verdict.items),
// so the grade says which item failed and why, not only which gate. The gate is met exactly when
// every item is, by construction. Each item names the decisive ids its decision depends on; the
// gate's decisive_ids are the items' (in order, each once), and attribution labels each failed
// item from its own ids by the gate's rules: exposure, a decisive phrase, or the gate's seen_at
// (attribution.ts itemLabels). Its why is a sentence the check builds from structured fields; a
// gate still reads no free text.
//
// A part of the gate that belongs to no item (a write about a patient outside the list) is the
// `outside` check, recorded as the item OUTSIDE; it has no decisive ids. A gate marks its failure
// action_form or omission only when every failed item carries the mark (decisiveGate's rule, one
// level down).
import { gate, type GateCheck, type GateCtx, type Json, type Verdict } from './check.ts';

// The item key of the part of a gate no item owns.
export const OUTSIDE = 'outside';

export interface ItemVerdict {
  met: boolean;
  // For a failed item: why, in a clinician's words, built from structured fields.
  why?: string;
  evidence?: { [k: string]: Json };
  // The resources the item's verdict is about, as <Type>/<id>.
  ids?: readonly string[];
  omission?: true;
  action_form?: true;
}

export interface ItemResult {
  item: string;
  met: boolean;
  why?: string;
  // The item's decisive ids, as the gate's decisive_ids spell them.
  decisive_ids: string[];
  evidence: { [k: string]: Json };
  ids?: string[];
  omission?: true;
  action_form?: true;
}

type Common = Omit<GateCheck, 'kind' | 'method' | 'fn' | 'decisive_ids'>;

export interface ItemGateSpec<I, S> extends Common {
  items: readonly I[];
  key: (item: I) => string;
  // The source resources the item's decision depends on (bare ids or <Type>/<id>).
  decisive?: (item: I) => readonly string[];
  // State every item's check shares, computed once per grading.
  prepare?: (ctx: GateCtx) => S;
  check: (item: I, shared: S, ctx: GateCtx) => ItemVerdict;
  outside?: (shared: S, ctx: GateCtx) => ItemVerdict;
  // The gate's own evidence and ids; by default the failed items' keys and their ids.
  verdict?: (shared: S, results: readonly ItemResult[], ctx: GateCtx) => { evidence: { [k: string]: Json }; ids?: readonly string[] };
}

const result = (item: string, decisive: readonly string[], v: ItemVerdict): ItemResult => ({
  item, met: v.met,
  ...(v.met || v.why === undefined ? {} : { why: v.why }),
  decisive_ids: [...decisive],
  evidence: v.evidence ?? {},
  ...(v.ids ? { ids: [...v.ids] } : {}),
  ...(!v.met && v.omission === true ? { omission: true as const } : {}),
  ...(!v.met && v.action_form === true ? { action_form: true as const } : {}),
});

export function itemGate<I, S = undefined>(spec: ItemGateSpec<I, S>): GateCheck {
  const { items, key, decisive = () => [], prepare, check, outside, verdict, ...common } = spec;
  // A gate over no items would be met vacuously (verifier-phase-P17i-W1-1-1 M1).
  if (items.length === 0) throw new Error(`itemGate ${spec.id}: no items; a gate over an empty list is met whatever the trial did`);
  const keys = items.map(key);
  for (const [i, k] of keys.entries()) {
    if (k === OUTSIDE) throw new Error(`itemGate ${spec.id}: item key ${OUTSIDE} is reserved for the part of the gate no item owns`);
    if (keys.indexOf(k) !== i) throw new Error(`itemGate ${spec.id}: two items with key ${k}`);
  }
  return gate({
    ...common,
    decisive_ids: [...new Set(items.flatMap((x) => decisive(x)))],
    fn: (ctx): Verdict<boolean> => {
      const shared = (prepare ? prepare(ctx) : undefined) as S;
      const results = items.map((x, i) => result(keys[i]!, decisive(x), check(x, shared, ctx)));
      if (outside) results.push(result(OUTSIDE, [], outside(shared, ctx)));
      const failed = results.filter((r) => !r.met);
      const own = verdict ? verdict(shared, results, ctx) : { evidence: { failed_items: failed.map((r) => r.item) }, ids: failed.flatMap((r) => r.ids ?? []) };
      const all = (mark: 'omission' | 'action_form') => failed.length > 0 && failed.every((r) => r[mark] === true);
      return {
        met: failed.length === 0,
        evidence: own.evidence,
        ...(own.ids ? { ids: own.ids } : {}),
        items: results,
        ...(all('omission') ? { omission: true as const } : {}),
        ...(all('action_form') ? { action_form: true as const } : {}),
      };
    },
  });
}
