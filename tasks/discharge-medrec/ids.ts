// T4's id registry (packages/env/overlay.ts, "Planted ids"): every resource overlay.ts adds, by
// registry key, and the world id fixtures:build numbered it with (fixtures/ids.ts). Graders,
// solutions and tests name a planted resource by key, through id() and ref().
import { TASK_IDS } from '../../fixtures/ids.ts';
import { planted } from '../../packages/env/planted.ts';

export const IDS = TASK_IDS.T4;

export const { id, ref } = planted(IDS);
