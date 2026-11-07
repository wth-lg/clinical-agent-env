// The session's cap and what the session has committed against it, as one store the top bar
// meter, the key gate and the run launcher read. The cap the user set is kept in sessionStorage
// beside the tab ledger's rows, so a reload changes neither the cap nor the spend. The spend
// comes from one source per surface (setSpentSource, main.tsx): the tab ledger's exposure on the
// hosted site, the runner's session spend (GET api/spend) on the local runner, which is the
// figure the launcher's projection carries as committed (P25c: after a reload the meter read
// $0.00 while the launcher said "$5.71 already committed").
import { useSyncExternalStore } from 'react';
import { tabLedger } from '../adapters/ledger-browser.ts';
import { DEFAULT_SESSION_CAP_USD, parseCap } from './cap.ts';

export interface SessionSpend {
  cap: number;
  spent: number;
}

export const CAP_KEY = 'clinenv.cap';

const session = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

const storedCap = (): number => {
  try {
    return parseCap(session()?.getItem(CAP_KEY) ?? '') ?? DEFAULT_SESSION_CAP_USD;
  } catch {
    return DEFAULT_SESSION_CAP_USD;
  }
};

let state: SessionSpend = { cap: storedCap(), spent: 0 };
const listeners = new Set<() => void>();
const emit = (next: SessionSpend) => {
  state = next;
  for (const l of listeners) l();
};

export const sessionSpend = (): SessionSpend => state;

// The cap P15 sends with each local-runner batch and checks before each browser-direct trial.
export const sessionCap = (): number => state.cap;

export function setSessionCap(cap: number): void {
  try {
    session()?.setItem(CAP_KEY, String(cap));
  } catch {
    // storage blocked: the cap holds for this page
  }
  if (cap !== state.cap) emit({ ...state, cap });
}

let source: () => Promise<number> = async () => (await tabLedger().totals()).exposure;

// Where the spend is read from: the surface's transport (live/types.ts TrialTransport.spent).
export function setSpentSource(read: () => Promise<number>): void {
  source = read;
}

// The figure a projection carries as committed (TrialTransport.project), the same source.
export function setSpent(spent: number): void {
  if (spent !== state.spent) emit({ ...state, spent });
}

// Re-reads the source: at load, and after a call settles or a trial ends. A source that fails
// (the runner did not answer) leaves the last figure, so the page still renders; the Live trial
// view shows the runner's errors itself.
export async function refreshSpent(): Promise<number> {
  try {
    setSpent(await source());
  } catch {
    // kept: the last figure read
  }
  return state.spent;
}

export function useSessionSpend(): SessionSpend {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), sessionSpend);
}
