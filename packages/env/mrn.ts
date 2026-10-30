// The medical record number (builder-208, pilot-3; builder-209): one rule for every Patient in the
// world, whoever writes the patient. The cohort generator gave 1000NN, the patient's id number, and
// the task overlays hand-wrote NNNN-NN, so the form alone marked a task patient. fixtures:build now
// sets every base Patient's MRN by this rule before the overlays run, so an overlay reads the MRN
// it quotes in a note from the world, and checks after them that every Patient, a Patient an
// overlay adds included, carries the rule's MRN and no two share one.
import type { Resource } from './store.ts';

export const MRN_SYSTEM = 'urn:riverbend:mrn';
const MR = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] };

// FNV-1a, then murmur3's finalizer, so neighbouring ids (pt-0001, pt-0002) land far apart. Pure
// JavaScript: packages/env runs in the browser too.
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// A Patient's MRN, NNNN-NN from a hash of its world id: the digits say nothing of the id.
export function mrn(patientId: string): string {
  const s = String(hash(`riverbend-mrn:${patientId}`) % 1_000_000).padStart(6, '0');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

type Patient = Extract<Resource, { resourceType: 'Patient' }>;

// The patient's MRN as the record holds it, if it holds one.
export const mrnOf = (p: Patient): string | undefined => p.identifier?.find((i) => i.system === MRN_SYSTEM)?.value;

// Every Patient with the rule's MRN, in place of any it held: the base cohort, before the overlays.
export function assignMrns(resources: readonly Resource[]): Resource[] {
  return resources.map((r) => {
    if (r.resourceType !== 'Patient') return r;
    const value = mrn(r.id!);
    const rest = (r.identifier ?? []).filter((i) => i.system !== MRN_SYSTEM);
    return { ...r, identifier: [{ type: MR, system: MRN_SYSTEM, value }, ...rest] };
  });
}

// After the overlays: a Patient with no MRN gets the rule's; one whose MRN is not the rule's, or
// two that share one, fail the build.
export function checkMrns(resources: readonly Resource[]): Resource[] {
  const seen = new Map<string, string>();
  return resources.map((r) => {
    if (r.resourceType !== 'Patient') return r;
    const held = mrnOf(r);
    const out = held === undefined ? assignMrns([r])[0]! : r;
    if (held !== undefined && held !== mrn(r.id!)) throw new Error(`Patient/${r.id}: MRN ${held} is not ${mrn(r.id!)}, the one packages/env/mrn.ts assigns; an overlay keeps the world's MRN`);
    const value = mrnOf(out as Patient)!;
    if (seen.has(value)) throw new Error(`Patient/${r.id} and Patient/${seen.get(value)} share MRN ${value}`);
    seen.set(value, r.id!);
    return out;
  });
}
