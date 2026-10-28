// The Chart tab's oracle, independent of src/tasks/chart.ts patientOf (verifier-phase-P17j-retro-JU10-1
// D2): a resource is on a patient's chart when any `reference` anywhere in it is Patient/<id>. The
// tests compare the tab's rows with this, so a patientOf that drops a field fails them.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export type WorldResource = { resourceType: string; id: string; [field: string]: unknown };

export const world: WorldResource[] = gunzipSync(readFileSync(new URL('../../../../fixtures/world.ndjson.gz', import.meta.url))).toString('utf8')
  .split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as WorldResource);

// Every `reference` string in a JSON value, at any depth.
export function refs(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) refs(x, out);
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'reference' && typeof x === 'string') out.push(x);
      else refs(x, out);
    }
  }
  return out;
}

// The ids of the world's resources of this type that reference the patient (Patient/<id>), sorted.
export const chartIds = (patient: string, type: string): string[] =>
  world.filter((r) => r.resourceType === type && refs(r).includes(patient)).map((r) => r.id).sort();
