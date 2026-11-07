// The key gate's words (P25u J11 and A13), pure, so apps/web/test/key-hints.test.ts loads them in
// Node: the line under Browse the results, the cost of one trial from the official run's summary
// (copy rule C7: derived, never a fixed figure), and the hint lines under the key field.
// The surface's kind (surface/detect.ts Surface['kind']), written out here so the root tsconfig,
// which has no DOM types, does not follow this module into detect.ts.
export type SurfaceKind = 'local-runner' | 'browser-direct';

// Where the key goes, as three short points under the field (ui-polish 5.4). The hosted line
// `through a relay that forwards it and keeps no copy` is fixed in docs/requirements/ui-contract.md.
const WHERE: Record<SurfaceKind, readonly string[]> = {
  'local-runner': ['The key goes to the local runner on this machine, which keeps it in memory.', 'The runner sends it only to the Anthropic API.', 'Use a workspace key with a spend limit.'],
  'browser-direct': ["The key stays in this tab's memory.", 'It is sent only to the Anthropic API, through a relay that forwards it and keeps no copy.', 'Use a workspace key with a spend limit.'],
};

export const CONSOLE_HOST = 'console.anthropic.com';
export const CONSOLE_KEYS_URL = 'https://console.anthropic.com/settings/keys';
export const GET_A_KEY = `Get a key at ${CONSOLE_HOST} under API keys.`;
export const FORGET_HINT = 'Forget key in the top bar drops it at any time.';
export const REMEMBER_HINT = 'Keeps the key if you reload this tab; closing the tab forgets it.';

// The official run's passes over its trials, under Browse the results.
export const passLine = (totals: { passes: number; trials: number } | null): string =>
  (totals === null ? 'See the tasks, the published trials and why each failure happened.' : `${totals.passes} of ${totals.trials} trials pass; see why each failure happened.`);

// The cost of one trial: the range of the tasks' mean costs in the official run, to the cent.
export function costRangeText(tasks: Readonly<Record<string, { mean_cost_usd: number | null }>>): string | null {
  const costs = Object.values(tasks).map((t) => t.mean_cost_usd).filter((c): c is number => c !== null && Number.isFinite(c));
  if (costs.length === 0) return null;
  const lo = Math.min(...costs).toFixed(2);
  const hi = Math.max(...costs).toFixed(2);
  return lo === hi ? `about $${lo}` : `about $${lo} to $${hi}`;
}

// The lines under the key field: where the key goes, where a key comes from and what a trial
// costs, and how to drop the key.
export const keyHints = (kind: SurfaceKind, cost: string | null): string[] => [
  ...WHERE[kind],
  cost === null ? GET_A_KEY : `${GET_A_KEY} One trial costs ${cost}.`,
  FORGET_HINT,
];
