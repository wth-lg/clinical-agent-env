// A base cohort resource's world id. fixtures:build numbers the whole world by Synthea's rule after
// the overlays (packages/env/renumber.ts), so a base resource's world id can differ from its id in
// fixtures/synthea/base.ndjson.gz, which overlays and the hygiene tests use. Graders and tests that
// name a base resource in the world write synthea('mr-00009') or syntheaRef('MedicationRequest/mr-00009').
import { SYNTHEA_IDS } from '../../fixtures/synthea-ids.ts';

export function synthea(baseId: string): string {
  if (!Object.hasOwn(SYNTHEA_IDS, baseId)) throw new Error(`no numbered base resource '${baseId}' in the world`);
  return SYNTHEA_IDS[baseId]!;
}

export function syntheaRef(reference: string): string {
  const slash = reference.indexOf('/');
  return `${reference.slice(0, slash)}/${synthea(reference.slice(slash + 1))}`;
}
