// What the write tools act on: everything the read tools read, a store they may put into, and
// the trial's write session. The session is per trial like the store, so a replay of the tool
// log on a fresh store and a fresh session reproduces every id, stamp and result.
import type { Arrival, EventSpec } from '../../events.ts';
import type { Store } from '../../store.ts';
import type { ReadContext } from '../read/context.ts';

export interface WriteSession {
  // Committed writes so far. The n-th committed write is stamped clock.stamp(n), its created
  // resource gets id <prefix>-t<n>, and its Provenance prov-t<n>. A rejected write does not
  // advance it.
  writeSeq: number;
  // The agent's summary from finish; set once, when the episode ends. Its presence is what
  // makes every later write CONFLICT (tool.ts).
  summary?: string;
  // The model turn the current call belongs to: the loop sets it before each call, replay from
  // each recorded tool_call. 0 outside a trial.
  turn: number;
  // Mid-trial arrivals so far (packages/env/events.ts). The k-th is stamped
  // clock.arrivalStamp(writeSeq at the time, k); it never advances writeSeq.
  arrivalSeq: number;
  // Every event that fired, in firing order: the finish guard reads the turn of each.
  fired: Arrival[];
  // Every id a successful call's result exposed so far: what an after_exposed trigger reads.
  // Kept only while the trial has active event specs.
  exposed: Set<string>;
}

export const newSession = (): WriteSession => ({ writeSeq: 0, turn: 0, arrivalSeq: 0, fired: [], exposed: new Set() });

export interface WriteContext extends ReadContext {
  world: Pick<Store, 'get' | 'search' | 'put'>;
  session: WriteSession;
  // The trial's active event specs (packages/env/events.ts activeSpecs); none when absent.
  events?: readonly EventSpec[];
}

// The signed-in user every write is made as (read/context.ts).
export { USER } from '../read/context.ts';
