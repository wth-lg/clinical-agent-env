// T4's id registry (packages/env/overlay.ts, "Planted ids"): every resource overlay.ts adds, by
// registry key, and the world id fixtures:build numbered it with (fixtures/ids.ts). Graders,
// solutions and tests name a planted resource by key, through id() and ref().
import { TASK_IDS } from '../../fixtures/ids.ts';
import { planted } from '../../packages/env/planted.ts';

export const IDS = TASK_IDS.T4;

export const { id, ref } = planted(IDS);

// W5-E (plan-amendment-w5 G1): a lever host's resources are in the registry only while its item is
// in lever.ts LEVER (the A host's always). These take any T4 key and resolve it when the registry
// holds it; a key the registry lacks (an inactive host's) comes back as itself, which no script,
// gate or test names.
const LOOSE = IDS as Readonly<Record<string, string>>;
export const idOf = (key: string): string => LOOSE[key] ?? key;
export const refOf = (reference: `${string}/${string}`): string => {
  const slash = reference.indexOf('/');
  return `${reference.slice(0, slash)}/${idOf(reference.slice(slash + 1))}`;
};
