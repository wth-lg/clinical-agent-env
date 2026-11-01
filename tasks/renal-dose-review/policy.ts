// T1's expected end state, computed from the initial world by RBC-PHARM-07 (design section 4,
// "Double derivation"; plan-amendment-worklist W1): the members of the review list the
// instruction names, each one's inputs as §1 picks them (the newest valid creatinine from any
// laboratory, a umol/L result divided by 88.4; the newest measured weight; age in whole years; the
// active orders and the inhibitors an outside letter of the last 90 days names), the dose §2 or §3
// gives, and which kind of decision it is. It never imports expected.ts or overlay constants
// (lint: no-policy-expected-import).
import { NOW_DATE } from '../../packages/env/clock.ts';
import type { Json } from '../../packages/grader/check.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { dailyDose, dosesPerDay, isActive, isDrug, quantity, type MedicationRequest } from '../../packages/grader/normalize.ts';

const LIST_NAME = 'DOAC dose review - week of 10/19/2026';
const LOINC = 'http://loinc.org';
const SCR_MASS = '2160-0';
const SCR_MOLAR = '14682-9';
const WEIGHT = '29463-7';
const UMOL_PER_MGDL = 88.4;
const INHIBITORS = ['ketoconazole', 'itraconazole', 'ritonavir'];
const INHIBITOR_TEXT = /\b(ketoconazole|itraconazole|ritonavir)\b/i;
const CLINIC = 'Organization/org-riverbend';
const DAY = 86_400_000;

type R = Readonly<Record<string, unknown>> & { resourceType: string; id?: string };
type Obs = R & { status?: string; code?: { coding?: Array<{ system?: string; code?: string }> }; subject?: { reference?: string }; effectiveDateTime?: string; valueQuantity?: { value?: number; unit?: string; code?: string } };
type Doc = R & { status?: string; subject?: { reference?: string }; date?: string; custodian?: { reference?: string }; content?: Array<{ attachment?: { contentType?: string; data?: string } }> };

function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

const valid = (o: Obs) => o.status !== 'entered-in-error' && o.status !== 'cancelled';
const coded = (o: Obs, code: string) => (o.code?.coding ?? []).some((c) => c.system === LOINC && c.code === code);
const newestFirst = (a: Obs, b: Obs) => Date.parse(b.effectiveDateTime ?? '') - Date.parse(a.effectiveDateTime ?? '');

function decode(r: Doc): string {
  return (r.content ?? [])
    .filter((c) => (c.attachment?.contentType ?? '').startsWith('text/') && c.attachment?.data)
    .map((c) => new TextDecoder().decode(Uint8Array.from(atob(c.attachment!.data!), (ch) => ch.charCodeAt(0))))
    .join('\n');
}

export function derive(world: WorldView): Json {
  const group = (world.all('Group') as ReadonlyArray<R & { name?: string; member?: Array<{ entity?: { reference?: string } }> }>).find((g) => g.name === LIST_NAME);
  if (!group) throw new Error(`no Group named ${LIST_NAME}`);
  const members = (group.member ?? []).map((m) => m.entity?.reference ?? '');
  const now = Date.parse(`${NOW_DATE}T12:00:00Z`);

  const items = members.map((ref) => {
    const p = world.get('Patient', ref.slice(8)) as (R & { birthDate?: string; gender?: string; name?: Array<{ use?: string; given?: string[]; family?: string }> }) | undefined;
    if (!p?.birthDate) throw new Error(`${ref}: no birth date`);
    const name = p.name?.find((n) => n.use === 'official') ?? p.name?.[0];
    const female = p.gender === 'female';
    const age = ageOn(p.birthDate, NOW_DATE);

    // §1 inputs.
    const obs = (world.all('Observation') as readonly Obs[]).filter((o) => o.subject?.reference === ref && valid(o));
    const scrObs = obs.filter((o) => coded(o, SCR_MASS) || coded(o, SCR_MOLAR)).sort(newestFirst)[0];
    const weightObs = obs.filter((o) => coded(o, WEIGHT)).sort(newestFirst)[0];
    if (!scrObs?.valueQuantity || !weightObs?.valueQuantity) throw new Error(`${ref}: no valid SCr or measured weight`);
    const mgdl = coded(scrObs, SCR_MOLAR) ? scrObs.valueQuantity.value! / UMOL_PER_MGDL : quantity({ value: scrObs.valueQuantity.value!, unit: scrObs.valueQuantity.code ?? scrObs.valueQuantity.unit! }, 'mg/dL')!.value;
    const kg = quantity({ value: weightObs.valueQuantity.value!, unit: weightObs.valueQuantity.code ?? weightObs.valueQuantity.unit! }, 'kg')!.value;

    const meds = (world.all('MedicationRequest') as ReadonlyArray<R & MedicationRequest & { subject?: { reference?: string } }>).filter((m) => m.subject?.reference === ref && isActive(m));
    const doacs = meds.filter((m) => isDrug(m.medicationCodeableConcept, { ingredient: 'apixaban' }) || isDrug(m.medicationCodeableConcept, { ingredient: 'rivaroxaban' }));
    if (doacs.length !== 1) throw new Error(`${ref}: ${doacs.length} active DOAC orders`);
    const doac = doacs[0]!;
    const drug = isDrug(doac.medicationCodeableConcept, { ingredient: 'apixaban' }) ? 'apixaban' : 'rivaroxaban';
    const perDay = dosesPerDay(doac.dosageInstruction![0]!.timing!.repeat!)!;
    const mgNow = dailyDose(doac)!.value / perDay;

    // Inhibitors: an active order, or an outside clinic's letter of the last 90 days.
    const ordered = meds.filter((m) => INHIBITORS.some((ingredient) => isDrug(m.medicationCodeableConcept, { ingredient }))).map((m) => `MedicationRequest/${m.id}`);
    const letters = (world.all('DocumentReference') as readonly Doc[])
      .filter((d) => d.subject?.reference === ref && d.status === 'current' && d.custodian?.reference !== CLINIC && now - Date.parse(d.date ?? '') <= 90 * DAY && INHIBITOR_TEXT.test(decode(d)))
      .map((d) => `DocumentReference/${d.id}`);
    const inhibitor = [...ordered, ...letters];

    // The dose, and the records that decide it (and only those: a record that cannot change the
    // dose is not decisive). The age (and sex) is on the Patient, a decisive record wherever it
    // decides (rulings R33).
    const W = `Observation/${weightObs.id}`;
    const S = `Observation/${scrObs.id}`;
    let mg: number;
    let decisive: string[];
    if (drug === 'apixaban') {
      const criteria: Array<[string, boolean]> = [[W, kg <= 60], [S, mgdl >= 1.5], [ref, age >= 80]];
      mg = criteria.filter(([, met]) => met).length >= 2 ? 2.5 : 5;
      // 2.5 mg on the criteria: the records of the met criteria. 5 mg: those of the criteria not
      // met. An inhibitor that lowers 5 mg to 2.5 mg decides it alone.
      decisive = criteria.filter(([, met]) => met === (mg === 2.5)).map(([id]) => id);
      if (inhibitor.length > 0 && mg === 5) {
        mg = 2.5;
        decisive = inhibitor;
      }
    } else {
      // Cockcroft-Gault takes the age (and the sex) from the Patient, the weight and the creatinine.
      const crcl = (((140 - age) * kg) / (72 * mgdl)) * (female ? 0.85 : 1);
      mg = crcl > 50 ? 20 : 15;
      decisive = [W, S, ref];
    }
    const action = mg < mgNow ? 'reduce' : mg > mgNow ? 'increase' : 'unchanged';
    const cls = drug === 'apixaban' && inhibitor.length > 0 ? 'pgp_cyp3a4_inhibitor'
      : coded(scrObs, SCR_MOLAR) ? 'outside_scr_umol'
      : action === 'unchanged' ? 'filler'
      : drug === 'rivaroxaban' ? 'cg_crcl_weight_rule'
      : 'apixaban_two_of_three';
    return {
      patient: ref,
      name: [...(name?.given ?? []), name?.family ?? ''].join(' ').trim(),
      class: cls,
      request: `MedicationRequest/${doac.id}`,
      action,
      dose: { drug, mg, per_day: drug === 'apixaban' ? 2 : 1 },
      decisive,
    };
  });
  return { group: `Group/${group.id}`, items };
}
