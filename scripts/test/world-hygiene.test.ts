// World hygiene (plan P17j JT2, pre-audit S11 and M5), measured on the committed world
// (fixtures/world.ndjson.gz) for the resources of the Synthea base cohort (fixtures/synthea/
// base.ndjson.gz): task overlays plant their own traps, such as T4's duplicate metoprolol, and stay
// as written. Each rule counts 0:
//   - a base ambulatory encounter starting outside Monday to Friday 08:00-18:00 local time;
//   - an active acute-class order (antibiotic, antihistamine, immediate-release opioid for acute
//     pain) authored more than 12 months before NOW;
//   - a patient with two active base orders of one ingredient;
//   - a clinic patient with no generalPractitioner.
// The pass that makes them 0 is scripts/fixtures-lib.ts hygiene(), run by fixtures:build between
// the base cohort and the overlays; the counts on the merge base are in the CHANGELOG fragment.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOW_MS } from '../../packages/env/clock.ts';
import { acuteClass, activeOrderAuthored, easternParts, gunzip, ingredientsOf, MONTHS_12_MS } from '../fixtures-lib.ts';
import { repoRoot } from './helpers.ts';

type R = Record<string, unknown> & { resourceType: string; id: string };
const read = (file: string): R[] => gunzip(readFileSync(join(repoRoot, file))).toString('utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as R);
const world = read('fixtures/world.ndjson.gz');
const baseIds = new Set(read('fixtures/synthea/base.ndjson.gz').map((r) => `${r.resourceType}/${r.id}`));
const base = world.filter((r) => baseIds.has(`${r.resourceType}/${r.id}`));
const refOf = (v: unknown) => (v as { reference?: string } | undefined)?.reference ?? null;

// The encounters the pass leaves where they are, listed with the reason in the CHANGELOG fragment:
// a task file about the patient writes the encounter's date (enc-00010, -00011, -00060, -00106,
// -00198), a time of it on a date a task file writes would move (enc-00023, -00024, -00258, -00346),
// or a time of it would move to another month (enc-00236). The pass also leaves enc-00012 and
// enc-00154, which task overlays then remove.
const LEFT_OUT = ['enc-00010', 'enc-00011', 'enc-00023', 'enc-00024', 'enc-00060', 'enc-00106', 'enc-00198', 'enc-00236', 'enc-00258', 'enc-00346'];

describe('world hygiene (JT2)', () => {
  it('no base ambulatory encounter starts outside Monday to Friday 08:00-18:00, but the listed ones', () => {
    const outside = base.filter((r) => r.resourceType === 'Encounter' && (r.class as { code?: string } | undefined)?.code === 'AMB').flatMap((e) => {
      const start = (e.period as { start?: string } | undefined)?.start;
      if (start === undefined) return [];
      const { weekday, hour } = easternParts(Date.parse(start));
      return weekday === 0 || weekday === 6 || hour < 8 || hour >= 18 ? [e.id] : [];
    });
    expect(outside.sort()).toEqual(LEFT_OUT);
  });

  it('no active acute-class order is older than 12 months', () => {
    const stale = base.filter((r) => r.resourceType === 'MedicationRequest' && r.status === 'active').flatMap((m) => {
      const text = (m.medicationCodeableConcept as { text?: string } | undefined)?.text ?? '';
      const authored = activeOrderAuthored(m as { authoredOn?: unknown });
      return acuteClass(text) !== null && authored !== null && NOW_MS - authored > MONTHS_12_MS ? [`${m.id} ${text} ${m.authoredOn as string}`] : [];
    });
    expect(stale).toEqual([]);
  });

  it('no patient has two active base orders of one ingredient', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const m of base.filter((r) => r.resourceType === 'MedicationRequest' && r.status === 'active')) {
      for (const ing of ingredientsOf((m.medicationCodeableConcept as { text?: string } | undefined)?.text ?? '')) {
        const key = `${refOf(m.subject)} ${ing}`;
        if (seen.has(key)) dupes.push(`${key}: ${seen.get(key)} and ${m.id}`);
        else seen.set(key, m.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('every clinic patient has a generalPractitioner', () => {
    const none = world.filter((r) => r.resourceType === 'Patient' && !(Array.isArray(r.generalPractitioner) && r.generalPractitioner.length > 0)).map((p) => p.id);
    expect(none).toEqual([]);
  });
});
