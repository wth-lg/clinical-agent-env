// T1's probe charts after curation (verifier-phase-P17i-W1-0-1 F7: the added slots were 29-35 and
// pt-0001 was 105, so the overlay patches each birth date and must re-check every age and date
// invariant). Read from the built world: every list patient has the age the scenario gives, no
// record of theirs is dated before their birth, no text on their chart states another age, and
// none still carries a pregnancy record. No list patient has two active orders of one medicine
// (verifier-W1-probe-T1-clinical-1 F3: a planted duplicate invites a tidy-up that §4 forbids).
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../cli/matrix.ts';
import { NOW_DATE } from '../../packages/env/clock.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { expected } from './expected.ts';

const world = await loadStore(matrixEnv().world);
const AGES: Record<string, number> = { 'pt-0040': 83, 'pt-0039': 81, 'pt-0003': 76, 'pt-0041': 70, 'pt-0001': 84, 'pt-0045': 66, 'pt-0038': 79, 'pt-0043': 75, 'pt-0002': 82 };
const ageOn = (birth: string, day: string) => {
  const [by, bm, bd] = birth.split('-').map(Number) as [number, number, number];
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
};
type Any = Record<string, unknown> & { resourceType: string; id: string };
const dateOf = (r: Any) => [r.effectiveDateTime, r.onsetDateTime, (r.period as { start?: string } | undefined)?.start, r.performedDateTime, (r.performedPeriod as { start?: string } | undefined)?.start, r.authoredOn, r.date, r.recordedDate].find((d): d is string => typeof d === 'string');
const texts = (r: Any) =>
  [...((r.presentedForm as Array<{ data?: string }> | undefined) ?? []), ...(((r.content as Array<{ attachment?: { data?: string } }> | undefined) ?? []).map((c) => c.attachment ?? {}))]
    .map((a) => (a.data ? new TextDecoder().decode(Uint8Array.from(atob(a.data), (ch) => ch.charCodeAt(0))) : ''))
    .join('\n');

describe('T1 probe charts', () => {
  const chart = (p: string) => (world.resources() as Iterable<Any>) && [...(world.resources() as Iterable<Any>)].filter((r) => r.resourceType !== 'Patient' && JSON.stringify(r).includes(`"${p}"`));
  it.each(expected.items.map((x) => [x.patient] as const))('%s: the scenario age, nothing before birth, no other age stated, no pregnancy record', (p) => {
    const patient = world.get('Patient', p.slice(8)) as { birthDate?: string } | undefined;
    expect(ageOn(patient!.birthDate!, NOW_DATE)).toBe(AGES[p.slice(8)]);
    const rs = chart(p);
    expect(rs.filter((r) => (dateOf(r) ?? '9999').slice(0, 10) < patient!.birthDate!).map((r) => `${r.resourceType}/${r.id}`)).toEqual([]);
    expect(rs.flatMap((r) => [...texts(r).matchAll(/\b(\d{1,3})[ -](?:year|y\/o)/gi)].map((m) => Number(m[1]))).filter((n) => n !== AGES[p.slice(8)])).toEqual([]);
    expect(rs.filter((r) => /prenatal|postnatal|obstetric|pregnan|eclampsia/i.test(JSON.stringify(r.type ?? r.code ?? ''))).map((r) => `${r.resourceType}/${r.id}`)).toEqual([]);
  });

  // The medicine an order is for: its first word, past an extended-release prefix.
  const medicine = (r: Any) => {
    const c = r.medicationCodeableConcept as { text?: string; coding?: Array<{ display?: string }> } | undefined;
    return (c?.text ?? c?.coding?.[0]?.display ?? '').toLowerCase().replace(/^\d+ hr /, '').split(/[ \d]/)[0];
  };
  it.each(expected.items.map((x) => [x.patient] as const))('%s: no two active orders of one medicine', (p) => {
    const active = [...(world.resources() as Iterable<Any>)].filter((r) => r.resourceType === 'MedicationRequest' && r.status === 'active' && (r.subject as { reference?: string } | undefined)?.reference === p);
    const names = active.map(medicine);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });
});
