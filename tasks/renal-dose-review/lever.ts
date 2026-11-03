// T1's active lever items (plan-amendment-w5 G1; the shared W5 interface: one file, no imports,
// re-exported from expected.ts, read by overlay.ts and events.ts). The items are in expected.ts
// LEVER_ITEMS: A (the silent newer creatinine in an outside batch; toggles without a rebuild, its
// patient is always built), B (the copied-forward letter) and the reserve (the §2 branch of an
// inhibitor at a criteria dose of 2.5 mg), whose patients the overlay builds only while they are
// on, so a B or reserve toggle needs `pnpm fixtures:build` (R40). Toggling moves env_version.
export const LEVER = ['A', 'B'];
export const LEVER_KEYS = { A: 'fairweather', B: 'castellano', reserve: 'whitcombe' } as const;
export type LeverId = keyof typeof LEVER_KEYS;
export const leverOn = (id: LeverId): boolean => (LEVER as readonly string[]).includes(id);
