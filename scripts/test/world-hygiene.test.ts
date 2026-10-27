// World hygiene (plan P17j JT2, pre-audit S11 and M5), measured on the committed world
// (fixtures/world.ndjson.gz) for the resources of the Synthea base cohort (fixtures/synthea/
// base.ndjson.gz): task overlays plant their own traps, such as T4's duplicate metoprolol, and stay
// as written. Each rule counts 0:
//   - a base ambulatory encounter starting outside Monday to Friday 08:00-18:00 local time;
//   - an active acute-class order (antibiotic, antihistamine, immediate-release opioid for acute
//     pain) authored more than 12 months before NOW;
//   - a patient with two active base orders of one ingredient;
//   - a clinic patient with no generalPractitioner;
//   - a base resource dated before the start of the encounter it references (unless it already was
//     in the base cohort);
//   - a pair of a patient's base resources whose order in time differs from the base cohort.
// The pass that makes them 0 is scripts/fixtures-lib.ts hygiene(), run by fixtures:build between
// the base cohort and the overlays; the counts on the merge base are in the CHANGELOG fragment.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOW_MS } from '../../packages/env/clock.ts';
import type { Resource } from '../../packages/env/store.ts';
import { acuteClass, activeOrderAuthored, easternParts, gunzip, hygiene, ingredientsOf, MONTHS_12_MS, patientOf, timeOf } from '../fixtures-lib.ts';
import { repoRoot } from './helpers.ts';

type R = Record<string, unknown> & { resourceType: string; id: string };
const read = (file: string): R[] => gunzip(readFileSync(join(repoRoot, file))).toString('utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as R);
const world = read('fixtures/world.ndjson.gz');
const cohort = read('fixtures/synthea/base.ndjson.gz');
const baseIds = new Set(cohort.map((r) => `${r.resourceType}/${r.id}`));
const base = world.filter((r) => baseIds.has(`${r.resourceType}/${r.id}`));
const refOf = (v: unknown) => (v as { reference?: string } | undefined)?.reference ?? null;

// The encounters the pass leaves where they are, listed with the reason in the CHANGELOG fragment
// (decisions.tsv 2026-10-27T15:25Z F4: exactly these are exempt):
//   - a task file about the patient writes the encounter's date: enc-00010, -00011, -00060, -00106,
//     -00198;
//   - a time of it on a date a task file writes would move: enc-00019, -00023, -00024, -00196,
//     -00258, -00344, -00346;
//   - a time of it would move to another month: enc-00007, -00076, -00236;
//   - the move would change the patient's order of dated resources: enc-00004 (its Friday is the
//     patient's visit enc-00003), enc-00259 and enc-00260 (cond-00835 references enc-00259 and is
//     dated at enc-00260's start).
// The pass also leaves enc-00012 and enc-00154, which task overlays then remove.
const LEFT_OUT = ['enc-00004', 'enc-00007', 'enc-00010', 'enc-00011', 'enc-00019', 'enc-00023', 'enc-00024', 'enc-00060', 'enc-00076', 'enc-00106', 'enc-00196', 'enc-00198', 'enc-00236', 'enc-00258', 'enc-00259', 'enc-00260', 'enc-00344', 'enc-00346'];

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

  it('no base resource is dated before the start of the encounter it references, unless it already was in the base cohort', () => {
    const early = (rs: R[]) => {
      const start = new Map(rs.filter((r) => r.resourceType === 'Encounter').map((e) => [`Encounter/${e.id}`, Date.parse((e.period as { start: string }).start)]));
      return rs.flatMap((r) => {
        const ref = refOf(r.encounter) ?? refOf((r.context as { encounter?: unknown[] } | undefined)?.encounter?.[0]);
        const t = timeOf(r as unknown as Resource);
        const s = ref === null ? undefined : start.get(ref);
        return s !== undefined && t !== null && t < s ? [`${r.resourceType}/${r.id}`] : [];
      });
    };
    const before = new Set(early(cohort));
    expect(early(base).filter((id) => !before.has(id))).toEqual([]);
  });

  it('keeps each patient\'s order in time of their base resources', () => {
    const times = (rs: R[]) => new Map<string, number>(rs.flatMap((r) => { const t = timeOf(r as unknown as Resource); return t === null ? [] : [[`${r.resourceType}/${r.id}`, t] as const]; }));
    const was = times(cohort);
    const now = times(base);
    const byPatient = new Map<string, string[]>();
    for (const r of base) {
      const p = patientOf(r as unknown as Resource);
      const id = `${r.resourceType}/${r.id}`;
      if (p !== null && was.has(id) && now.has(id)) byPatient.set(p, [...(byPatient.get(p) ?? []), id]);
    }
    const flipped: string[] = [];
    for (const ids of byPatient.values()) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = [ids[i]!, ids[j]!];
          if (Math.sign(was.get(a)! - was.get(b)!) !== Math.sign(now.get(a)! - now.get(b)!)) flipped.push(`${a} ${b}`);
        }
      }
    }
    expect(flipped.length, flipped.slice(0, 5).join('; ')).toBe(0);
  });
});

// The pass on small hand-made cohorts (verifier-phase-P17i-JT2-1 F1, F3, P3, P4).
describe('hygiene()', () => {
  const NOW = Date.parse('2026-10-23T08:00:00-04:00');
  const none = { now: NOW, literalDates: new Map<string, Set<string>>(), anyLiteralDates: new Set<string>() };
  const pt = { resourceType: 'Patient', id: 'p1' };
  const enc = (id: string, start: string, end?: string) => ({ resourceType: 'Encounter', id, class: { code: 'AMB' }, subject: { reference: 'Patient/p1' }, period: end === undefined ? { start } : { start, end } });
  const obs = (id: string, at: string, encounter?: string) => ({ resourceType: 'Observation', id, subject: { reference: 'Patient/p1' }, effectiveDateTime: at, issued: at, ...(encounter ? { encounter: { reference: `Encounter/${encounter}` } } : {}) });
  const run = (rs: object[]) => hygiene(rs as Resource[], none);
  const get = (out: Resource[], id: string) => out.find((r) => r.id === id) as unknown as Record<string, unknown>;

  it('moves a resource that references the encounter by the same delta, also when it is stamped after the encounter ends', () => {
    // Tuesday 2026-01-06 06:47-07:20; a questionnaire stamped at 07:49 references it.
    const { resources } = run([pt, enc('e1', '2026-01-06T06:47:00-05:00', '2026-01-06T07:20:00-05:00'), obs('o1', '2026-01-06T07:49:00-05:00', 'e1')]);
    expect((get(resources, 'e1').period as { start: string }).start).toBe('2026-01-06T14:47:00-05:00');
    expect(get(resources, 'o1').effectiveDateTime).toBe('2026-01-06T15:49:00-05:00');
  });

  it('keeps the fraction of a second of a moved time, so a note stamped just after its visit stays after it', () => {
    const { resources } = run([pt, enc('e1', '2026-01-06T06:47:00-05:00', '2026-01-06T07:20:00-05:00'), obs('o1', '2026-01-06T06:47:00.206-05:00', 'e1')]);
    expect(get(resources, 'o1').effectiveDateTime).toBe('2026-01-06T14:47:00.206-05:00');
  });

  it('moves the resources of an encounter with no end', () => {
    // Saturday 2026-10-17 21:00 with an observation at 21:30: Friday 2026-10-16 09:00 and 09:30.
    const { resources } = run([pt, enc('e1', '2026-10-17T21:00:00-04:00'), obs('o1', '2026-10-17T21:30:00-04:00', 'e1')]);
    expect((get(resources, 'e1').period as { start: string }).start).toBe('2026-10-16T09:00:00-04:00');
    expect(get(resources, 'o1').effectiveDateTime).toBe('2026-10-16T09:30:00-04:00');
  });

  it('leaves a weekend encounter, listed, when the earlier weekday would change the patient\'s order; it never moves it later in the month for that', () => {
    // Saturday 2026-04-18 10:00; another resource of the patient on Friday 2026-04-17 at 12:00.
    const { resources, report } = run([pt, enc('e1', '2026-04-18T10:00:00-04:00', '2026-04-18T10:30:00-04:00'), obs('o0', '2026-04-17T12:00:00-04:00')]);
    expect((get(resources, 'e1').period as { start: string }).start).toBe('2026-04-18T10:00:00-04:00');
    expect(report.skipped.e1).toMatch(/order/);
  });

  it('moves a weekend encounter to the nearest later weekday only when the earlier one is in another month', () => {
    // Saturday 2026-08-01: Friday is in July, so Monday 2026-08-03.
    const { resources } = run([pt, enc('e1', '2026-08-01T10:00:00-04:00', '2026-08-01T10:30:00-04:00')]);
    expect((get(resources, 'e1').period as { start: string }).start).toBe('2026-08-03T10:00:00-04:00');
  });

  it('reads ingredients by their full names, so different drugs that share a first word stay apart', () => {
    expect(ingredientsOf('insulin lispro 100 UNT/ML Injectable Solution')).toEqual(['insulin lispro']);
    expect(ingredientsOf('insulin isophane, human 70 UNT/ML / insulin, regular, human 30 UNT/ML Injectable Suspension')).toEqual(['insulin isophane human', 'insulin regular human']);
    expect(ingredientsOf('sodium chloride 9 MG/ML Injectable Solution')).not.toEqual(ingredientsOf('sodium bicarbonate 650 MG Oral Tablet'));
    expect(ingredientsOf('24 HR metoprolol succinate 100 MG Extended Release Oral Tablet')).toEqual(['metoprolol succinate']);
    expect(ingredientsOf('Acetaminophen 325 MG / Oxycodone Hydrochloride 5 MG Oral Tablet')).toEqual(['acetaminophen', 'oxycodone hydrochloride']);
    expect(acuteClass('Acetaminophen 325 MG / Oxycodone Hydrochloride 5 MG Oral Tablet')).toBe('acute opioid');
  });

  it('skips and lists an order whose authoredOn cannot be read', () => {
    const mr = (id: string, authoredOn: string) => ({ resourceType: 'MedicationRequest', id, status: 'active', subject: { reference: 'Patient/p1' }, authoredOn, medicationCodeableConcept: { text: 'simvastatin 20 MG Oral Tablet' } });
    expect(activeOrderAuthored({ authoredOn: 'garbage' })).toBeNull();
    const { resources, report } = run([pt, mr('m1', 'garbage'), mr('m2', '2026-01-05T10:00:00-05:00')]);
    expect(get(resources, 'm2').status).toBe('active');
    expect(get(resources, 'm1').status).toBe('active');
    expect(report.unreadable).toEqual(['Patient/p1 m1 authoredOn garbage']);
  });
});

