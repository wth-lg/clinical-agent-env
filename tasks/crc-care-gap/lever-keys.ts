// The lever hosts' registry keys and the LEVER helper (lever.ts holds the list alone, so the
// central lever-invariant test can mock it as { LEVER }): each item's host Patient key
// (overlay.ts leverHosts; fixtures:build numbers each at its fixed slot of T3's added range,
// packages/env/overlay.ts TASKS added: pt-0073 quintero, pt-0074 baptiste) and whether LEVER names
// the item.
import { LEVER } from './lever.ts';

export const HOSTS = { A: 'pt-t3-quintero', reserve: 'pt-t3-baptiste' } as const;
export type LeverId = keyof typeof HOSTS;
// The slot of each host in T3's added-Patient range (Overlay.added), fixed whether or not the host
// is in a build.
export const SLOT: Readonly<Record<LeverId, number>> = { A: 0, reserve: 1 };
export const leverOn = (id: LeverId): boolean => (LEVER as readonly string[]).includes(id);
// The hosts a LEVER state puts in the world and on the panel: the A host always, the reserve host
// while the reserve is active.
export const hostsOf = (lever: readonly string[]): string[] => [HOSTS.A, ...(lever.includes('reserve') ? [HOSTS.reserve] : [])];
