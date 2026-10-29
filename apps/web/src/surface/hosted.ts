// Whether this page is the hosted site (browser-direct) rather than the local runner's: one fact,
// from the surface main.tsx detects once at load (plan JU5; verifier-phase-P17j-retro-JU5-103-1
// D1). The shell provides it; the local-run panel, the intro card, the Live trial transport and
// its relay wording, and the session notice all read it here.
import { createContext, useContext } from 'react';
import type { Surface } from './detect.ts';

export const isHosted = (surface: Surface) => surface.kind === 'browser-direct';

export const HostedContext = createContext<boolean | null>(null);

export function useHosted(): boolean {
  const hosted = useContext(HostedContext);
  if (hosted === null) throw new Error('useHosted() outside the shell: App provides HostedContext');
  return hosted;
}
