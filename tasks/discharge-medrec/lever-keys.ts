// The lever hosts' registry keys and the LEVER helper (lever.ts holds the list alone, so the
// central lever-invariant test can mock it as { LEVER }): each item's host Patient key
// (overlay.ts leverHosts; fixtures:build numbers each at its fixed slot of T4's added range,
// packages/env/overlay.ts TASKS added: pt-0067 pruitt, pt-0068 salazar, pt-0069 whitcomb) and
// whether LEVER names the item.
import { LEVER } from './lever.ts';

export const HOSTS = { A: 'pt-t4-whitcomb', B: 'pt-t4-pruitt', reserve: 'pt-t4-salazar' } as const;
export type LeverId = keyof typeof HOSTS;
// The slot of each host in T4's added-Patient range (Overlay.added), fixed whether or not the host
// is in a build.
export const SLOT: Readonly<Record<LeverId, number>> = { B: 0, reserve: 1, A: 2 };
export const leverOn = (id: LeverId): boolean => (LEVER as readonly string[]).includes(id);
