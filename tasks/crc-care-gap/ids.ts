// T3's id registry (packages/env/overlay.ts, "Planted ids"): every resource overlay.ts adds, by
// registry key, and the world id fixtures:build numbered it with (fixtures/ids.ts). Graders,
// solutions and tests name a planted resource by key, through id() and ref(). A lever host's
// records (lever-keys.ts) are in the registry only while the host is in the world, so idOf and refOf
// resolve a key the registry holds and return the key itself otherwise: expected.ts and the scripts
// stay importable in every LEVER state (and before the first build in a new state).
import { TASK_IDS } from '../../fixtures/ids.ts';
import { planted } from '../../packages/env/planted.ts';

export const IDS = TASK_IDS.T3;

export const { id, ref } = planted(IDS);

export const idOf = (key: string): string => (IDS as Readonly<Record<string, string>>)[key] ?? key;
export const refOf = (reference: string): string => {
  const slash = reference.indexOf('/');
  return slash < 0 ? idOf(reference) : `${reference.slice(0, slash)}/${idOf(reference.slice(slash + 1))}`;
};
