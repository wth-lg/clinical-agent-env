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
//   - a pair of a patient's base resources whose order in time differs from the base cohort;
//   - a date-time, at any path, of a resource that references an encounter, before that encounter's
//     start (where the base cohort's was not);
//   - a text attachment, in any resource, whose leading date is not the Eastern day of its resource's
//     time (where the base cohort's was);
//   - a condition whose abatement lay inside an encounter's window and no longer sits at the same
//     offset from that encounter's start;
//   - a base resource whose own date-times (onset and abatement, for example) change order.
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
// Every date-time string in a resource, with its path.
const dateTimes = (v: unknown, path = ''): Array<[string, string]> =>
  typeof v === 'string' ? (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v) ? [[path, v]] : [])
    : Array.isArray(v) ? v.flatMap((x, i) => dateTimes(x, `${path}[${i}]`))
      : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => dateTimes(x, path ? `${path}.${k}` : k)) : [];
// The base64 data of every text attachment in a resource, at any path.
const attachments = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap(attachments)
    : v && typeof v === 'object' ? [...(typeof (v as { data?: unknown }).data === 'string' && /^text\//.test(String((v as { contentType?: unknown }).contentType)) ? [(v as { data: string }).data] : []), ...Object.values(v).flatMap(attachments)] : [];

// The encounters the pass leaves where they are, listed with the reason in the CHANGELOG fragment
// (decisions.tsv 2026-10-27T15:25Z F4 and 17:20Z: exactly these are exempt):
//   - a task file about the patient writes the encounter's date: enc-00010, -00011, -00060, -00106,
//     -00198;
//   - a time of it on a date a task file writes would move: enc-00023, -00024, -00258, -00346;
//   - a time of it would move to another month: enc-00007, -00076, -00236;
//   - the move would change the patient's order of dated resources: enc-00004 (its Friday is the
//     patient's visit enc-00003) and enc-00259 (cond-00835 references it but begins at enc-00260's
//     start, so moving it would put the condition's abatement before its onset).
// The pass also leaves enc-00012 and enc-00154, which task overlays then remove.
const LEFT_OUT = ['enc-00004', 'enc-00007', 'enc-00010', 'enc-00011', 'enc-00023', 'enc-00024', 'enc-00060', 'enc-00076', 'enc-00106', 'enc-00198', 'enc-00236', 'enc-00258', 'enc-00259', 'enc-00346'];

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

  it('no date-time of a resource that references an encounter lies before that encounter\'s start, unless it already did in the base cohort', () => {
    const early = (rs: R[]) => {
      const start = new Map(rs.filter((r) => r.resourceType === 'Encounter').map((e) => [`Encounter/${e.id}`, Date.parse((e.period as { start: string }).start)]));
      return rs.flatMap((r) => {
        const ref = refOf(r.encounter) ?? refOf((r.context as { encounter?: unknown[] } | undefined)?.encounter?.[0]);
        const s = ref === null ? undefined : start.get(ref);
        return s === undefined ? [] : dateTimes(r).flatMap(([path, v]) => (Date.parse(v) < s ? [`${r.resourceType}/${r.id} ${path}`] : []));
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

  it('every text attachment whose leading date was its resource\'s Eastern day still leads with that day', () => {
    const heads = (r: R) => attachments(r).map((a) => /^\s*(\d{4}-\d\d-\d\d)\b/.exec(Buffer.from(a, 'base64').toString('utf8'))?.[1] ?? null);
    const dayOf = (r: R) => { const t = timeOf(r as unknown as Resource); return t === null ? null : easternParts(t).date; };
    const matched = new Set(cohort.flatMap((r) => (heads(r).some((h) => h !== null && h === dayOf(r)) ? [`${r.resourceType}/${r.id}`] : [])));
    const stale = base.filter((r) => matched.has(`${r.resourceType}/${r.id}`)).flatMap((r) => heads(r).flatMap((h) => (h !== null && h !== dayOf(r) ? [`${r.resourceType}/${r.id} ${h} ${dayOf(r)}`] : [])));
    expect(stale).toEqual([]);
  });

  it('a condition that abated inside an encounter\'s window still abates at the same offset from that encounter\'s start', () => {
    // An encounter's window: its start to the later of its end and the times of the resources that
    // reference it within a day (the window the pass moves; decisions.tsv 2026-10-27T23:00Z).
    const windows = (rs: R[]) => {
      const refs = new Map<string, number[]>();
      for (const r of rs) {
        const ref = refOf(r.encounter) ?? refOf((r.context as { encounter?: unknown[] } | undefined)?.encounter?.[0]);
        const t = timeOf(r as unknown as Resource);
        if (ref !== null && t !== null) refs.set(ref, [...(refs.get(ref) ?? []), t]);
      }
      return new Map(rs.filter((r) => r.resourceType === 'Encounter').map((e) => {
        const p = e.period as { start: string; end?: string };
        const start = Date.parse(p.start);
        const end = Math.max(Date.parse(p.end ?? p.start), ...(refs.get(`Encounter/${e.id}`) ?? []).filter((t) => t - start <= 24 * 3600 * 1000));
        return [e.id, { patient: refOf(e.subject), start, end }] as const;
      }));
    };
    const was = windows(cohort);
    const now = windows(base);
    const byId = new Map(base.map((r) => [`${r.resourceType}/${r.id}`, r]));
    const drift = cohort.filter((c) => c.resourceType === 'Condition' && typeof c.abatementDateTime === 'string').flatMap((c) => {
      const at = Date.parse(c.abatementDateTime as string);
      const h = byId.get(`Condition/${c.id}`);
      if (h === undefined) return [];
      return [...was].filter(([id, w]) => w.patient === refOf(c.subject) && at >= w.start && at <= w.end && now.has(id)).flatMap(([id, w]) =>
        Date.parse(h.abatementDateTime as string) - now.get(id)!.start === at - w.start ? [] : [`${c.id} ${h.abatementDateTime as string} vs ${id}`]);
    });
    expect(drift).toEqual([]);
  });

  it('keeps the order of each base resource\'s own date-times', () => {
    const byId = new Map(base.map((r) => [`${r.resourceType}/${r.id}`, r]));
    const flipped = cohort.flatMap((r) => {
      const h = byId.get(`${r.resourceType}/${r.id}`);
      if (h === undefined) return [];
      const was = new Map(dateTimes(r));
      const now = dateTimes(h).filter(([p]) => was.has(p));
      return now.flatMap(([p, v], i) => now.slice(i + 1).flatMap(([q, w]) =>
        Math.sign(Date.parse(was.get(p)!) - Date.parse(was.get(q)!)) === Math.sign(Date.parse(v) - Date.parse(w)) ? [] : [`${r.resourceType}/${r.id} ${p} ${q}`]));
    });
    expect(flipped).toEqual([]);
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

  it('rewrites only the date at the head of a note whose date moves to another day', () => {
    const text = '\n2026-04-18\n\n# Chief Complaint\nSeen on 2026-04-18 for a cough.\n';
    const doc = { resourceType: 'DocumentReference', id: 'd1', subject: { reference: 'Patient/p1' }, date: '2026-04-18T10:00:00.120-04:00', context: { encounter: [{ reference: 'Encounter/e1' }] }, content: [{ attachment: { contentType: 'text/plain', data: Buffer.from(text).toString('base64') } }] };
    const { resources } = run([pt, enc('e1', '2026-04-18T10:00:00-04:00', '2026-04-18T10:30:00-04:00'), doc]);
    const out = get(resources, 'd1') as { date: string; content: Array<{ attachment: { data: string } }> };
    expect(out.date).toBe('2026-04-17T10:00:00.120-04:00');
    expect(Buffer.from(out.content[0]!.attachment.data, 'base64').toString('utf8')).toBe('\n2026-04-17\n\n# Chief Complaint\nSeen on 2026-04-18 for a cough.\n');
  });

  it('moves a condition\'s abatement with the encounter whose start it equals, not with the encounter it references', () => {
    // e1 (Saturday night) moves; e2 (a Wednesday at 10:00) stays. c1 references e1 and abates at e2's
    // start; c2 references e2 and abates at e1's start.
    const cond = (id: string, encounter: string, onset: string, abatement: string) => ({ resourceType: 'Condition', id, subject: { reference: 'Patient/p1' }, encounter: { reference: `Encounter/${encounter}` }, onsetDateTime: onset, abatementDateTime: abatement });
    const { resources } = run([pt, enc('e1', '2026-04-18T21:00:00-04:00', '2026-04-18T21:15:00-04:00'), enc('e2', '2026-04-22T10:00:00-04:00', '2026-04-22T10:15:00-04:00'),
      cond('c1', 'e1', '2026-04-18T21:00:00-04:00', '2026-04-22T10:00:00-04:00'), cond('c2', 'e2', '2026-04-22T10:00:00-04:00', '2026-04-18T21:00:00-04:00')]);
    expect((get(resources, 'e1').period as { start: string }).start).toBe('2026-04-17T09:00:00-04:00');
    expect(get(resources, 'c1').onsetDateTime).toBe('2026-04-17T09:00:00-04:00');
    expect(get(resources, 'c1').abatementDateTime).toBe('2026-04-22T10:00:00-04:00');
    expect(get(resources, 'c2').abatementDateTime).toBe('2026-04-17T09:00:00-04:00');
  });

  it('rewrites the head of a DiagnosticReport\'s presented form by the Eastern day of its effective time', () => {
    const text = '\n2026-04-18\n\n# Chief Complaint\nCough.\n';
    const dr = { resourceType: 'DiagnosticReport', id: 'r1', subject: { reference: 'Patient/p1' }, encounter: { reference: 'Encounter/e1' }, effectiveDateTime: '2026-04-18T10:00:00-04:00', issued: '2026-04-18T10:00:00.500-04:00', presentedForm: [{ contentType: 'text/plain; charset=utf-8', data: Buffer.from(text).toString('base64') }] };
    const { resources } = run([pt, enc('e1', '2026-04-18T10:00:00-04:00', '2026-04-18T10:30:00-04:00'), dr]);
    const out = get(resources, 'r1') as { effectiveDateTime: string; presentedForm: Array<{ data: string }> };
    expect(out.effectiveDateTime).toBe('2026-04-17T10:00:00-04:00');
    expect(Buffer.from(out.presentedForm[0]!.data, 'base64').toString('utf8')).toBe('\n2026-04-17\n\n# Chief Complaint\nCough.\n');
  });

  it('moves any date-time of the patient inside a moving encounter\'s window, such as an abatement at its end', () => {
    // c1 began long before and references e0 (2026-03-04, in hours); it abates at the end of e1
    // (Saturday night), which moves.
    const c1 = { resourceType: 'Condition', id: 'c1', subject: { reference: 'Patient/p1' }, encounter: { reference: 'Encounter/e0' }, onsetDateTime: '2026-03-04T10:00:00-05:00', abatementDateTime: '2026-04-18T21:15:00-04:00' };
    const { resources } = run([pt, enc('e0', '2026-03-04T10:00:00-05:00', '2026-03-04T10:15:00-05:00'), enc('e1', '2026-04-18T21:00:00-04:00', '2026-04-18T21:15:00-04:00'), c1]);
    expect(get(resources, 'c1').onsetDateTime).toBe('2026-03-04T10:00:00-05:00');
    expect(get(resources, 'c1').abatementDateTime).toBe('2026-04-17T09:15:00-04:00');
  });

  it('leaves a member\'s date-time that lies inside another encounter\'s window to that encounter', () => {
    // r1 references e1 (Saturday 07:00, moves to Friday 15:00); its issued time lies inside e2
    // (Saturday 2026-04-25 10:00-10:30, moves to Friday 2026-04-24 10:00).
    const r1 = { resourceType: 'Observation', id: 'o1', subject: { reference: 'Patient/p1' }, encounter: { reference: 'Encounter/e1' }, effectiveDateTime: '2026-04-18T07:00:00-04:00', issued: '2026-04-25T10:10:00-04:00' };
    const { resources } = run([pt, enc('e1', '2026-04-18T07:00:00-04:00', '2026-04-18T07:20:00-04:00'), enc('e2', '2026-04-25T10:00:00-04:00', '2026-04-25T10:30:00-04:00'), r1]);
    expect(get(resources, 'o1').effectiveDateTime).toBe('2026-04-17T15:00:00-04:00');
    expect(get(resources, 'o1').issued).toBe('2026-04-24T10:10:00-04:00');
  });

  it('leaves an encounter where it is when a member would move part of its date-times past the rest', () => {
    // c1 references e1 (Sunday night, moves back 2.5 days) but begins at e2's start (a Saturday months
    // later, moves back a day) and abates the day after e2: moving e1 would put the abatement before
    // the onset.
    const c1 = { resourceType: 'Condition', id: 'c1', subject: { reference: 'Patient/p1' }, encounter: { reference: 'Encounter/e1' }, onsetDateTime: '2023-07-29T09:30:00-04:00', abatementDateTime: '2023-07-30T02:00:00-04:00' };
    const { resources, report } = run([pt, enc('e1', '2023-05-07T20:30:00-04:00', '2023-05-07T20:45:00-04:00'), enc('e2', '2023-07-29T09:30:00-04:00', '2023-07-29T11:00:00-04:00'), c1]);
    expect((get(resources, 'e1').period as { start: string }).start).toBe('2023-05-07T20:30:00-04:00');
    expect(report.skipped.e1).toMatch(/order/);
    expect(get(resources, 'c1').onsetDateTime).toBe('2023-07-28T09:30:00-04:00');
    expect(get(resources, 'c1').abatementDateTime).toBe('2023-07-30T02:00:00-04:00');
  });

  it('moves a date-time inside the window the members span, past the encounter\'s end (verifier edge4 X1)', () => {
    // e1 Saturday 19:54-20:52 moves to Friday 17:54; a screening report that references it is dated
    // 22:36 (a member); c1, of no encounter, abates at that instant.
    const d1 = { resourceType: 'DiagnosticReport', id: 'd1', subject: { reference: 'Patient/p1' }, encounter: { reference: 'Encounter/e1' }, effectiveDateTime: '2026-04-18T22:36:00-04:00', issued: '2026-04-18T22:36:00-04:00' };
    const c1 = { resourceType: 'Condition', id: 'c1', subject: { reference: 'Patient/p1' }, onsetDateTime: '2024-02-05T21:00:00-05:00', abatementDateTime: '2026-04-18T22:36:00-04:00' };
    const { resources } = run([pt, enc('e1', '2026-04-18T19:54:00-04:00', '2026-04-18T20:52:00-04:00'), d1, c1]);
    expect((get(resources, 'e1').period as { start: string }).start).toBe('2026-04-17T17:54:00-04:00');
    expect(get(resources, 'd1').effectiveDateTime).toBe('2026-04-17T20:36:00-04:00');
    expect(get(resources, 'c1').abatementDateTime).toBe('2026-04-17T20:36:00-04:00');
  });

  it('reads ingredients by their full names, so different drugs that share a first word stay apart', () => {
    expect(ingredientsOf('insulin lispro 100 UNT/ML Injectable Solution')).toEqual(['insulin lispro']);
    expect(ingredientsOf('insulin isophane, human 70 UNT/ML / insulin, regular, human 30 UNT/ML Injectable Suspension')).toEqual(['insulin isophane human', 'insulin regular human']);
    expect(ingredientsOf('sodium chloride 9 MG/ML Injectable Solution')).not.toEqual(ingredientsOf('sodium bicarbonate 650 MG Oral Tablet'));
    expect(ingredientsOf('24 HR metoprolol succinate 100 MG Extended Release Oral Tablet')).toEqual(['metoprolol succinate']);
    expect(ingredientsOf('120 ACTUAT fluticasone propionate 0.044 MG/ACTUAT Metered Dose Inhaler')).toEqual(['fluticasone propionate']);
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

