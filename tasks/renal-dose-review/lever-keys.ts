// The lever items' keys and the LEVER helper (lever.ts holds the list alone, so the central
// lever-invariant test can mock it as { LEVER }): each item's registry key suffix (overlay.ts
// pt-t1-<key>) and whether LEVER names it.
import { LEVER } from './lever.ts';

export const LEVER_KEYS = { A: 'fairweather', B: 'castellano', reserve: 'whitcombe' } as const;
export type LeverId = keyof typeof LEVER_KEYS;
export const leverOn = (id: LeverId): boolean => (LEVER as readonly string[]).includes(id);
