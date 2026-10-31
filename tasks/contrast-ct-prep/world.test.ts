// T5's built world against the items (W1 probe rulings R7 margins, R8 chart consistency): every
// number an item turns on clears its threshold by the fixture lint margin after the profile pass
// has moved the planted times, and no planted or kept chart record contradicts an item.
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { MARGINS } from '../../packages/env/lint/index.ts';
import { expected } from './expected.ts';
import { ref } from './ids.ts';

const store = await loadStore(matrixEnv().world);
type Rec = { resourceType: string; id?: string; date?: string; effectiveDateTime?: string; subject?: { reference?: string }; medicationCodeableConcept?: { text?: string }; valueQuantity?: { value?: number }; content?: Array<{ attachment?: { data?: string } }>; presentedForm?: Array<{ data?: string }> };
const all = [...store.resources()] as unknown as Rec[];
const HOUR = 3_600_000;
const SCR = MARGINS.scr;
const get = (key: Parameters<typeof ref>[0]): Rec => {
  const [type, id] = ref(key).split('/') as [string, string];
  return store.get(type, id) as unknown as Rec;
};
// A record's text: a note's attachment, or a report's printed form (Synthea files a visit note as both).
const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
const textOf = (d: Rec) => [...(d.content ?? []).map((c) => c.attachment?.data), ...(d.presentedForm ?? []).map((f) => f.data)].map((x) => decode(x ?? '')).join('\n');
const notesOf = (patient: string) => all.filter((r) => (r.resourceType === 'DocumentReference' || r.resourceType === 'DiagnosticReport') && r.subject?.reference === patient && textOf(r) !== '');
// The booking screen's line, a question asked of every contrast booking, is not a record of a drug.
const SCREEN = /Contrast screening \([^)]*\):[^\n]*/g;

describe('T5 world: margins (R7)', () => {
  it("Brakus's creatinine rise meets both KDIGO limbs by the margin: 0.3 mg/dL within 48 hours, and 1.5 times baseline", () => {
    const early = get('Observation/obs-t5-brakus-1019');
    const late = get('Observation/obs-t5-brakus-1021');
    const hours = (Date.parse(late.effectiveDateTime!) - Date.parse(early.effectiveDateTime!)) / HOUR;
    const [x, y] = [early.valueQuantity!.value!, late.valueQuantity!.value!];
    // The profile pass keeps a planted time in its hour, so 2 hours clear any move.
    expect(hours, 'hours between the draws').toBeLessThanOrEqual(46);
    expect(y - x, 'rise').toBeGreaterThanOrEqual(0.3 + SCR);
    expect(y, '1.5 x baseline').toBeGreaterThanOrEqual(1.5 * x + SCR);
  });

  it("Schuster's ED discharge creatinine is clear of her baseline by 0.3 mg/dL and the margin (not back at baseline)", () => {
    const text = textOf(get('DocumentReference/doc-t5-schuster-ed'));
    const discharge = Number(/\bCr at discharge:\s*(\d+(?:\.\d+)?)/.exec(text)?.[1]);
    const baseline = Number(/baseline about (\d+(?:\.\d+)?)/.exec(text)?.[1]);
    expect(discharge - baseline).toBeGreaterThanOrEqual(0.3 + SCR);
  });
});

describe('T5 world: chart consistency (R8)', () => {
  it('no note of a list patient without a metformin order says the patient takes or started metformin', () => {
    const onMetformin = new Set(all.filter((r) => r.resourceType === 'MedicationRequest' && /metformin/i.test(r.medicationCodeableConcept?.text ?? '')).map((r) => r.subject?.reference));
    const hits = expected.items
      .filter((x) => !onMetformin.has(x.patient))
      .flatMap((x) => notesOf(x.patient).filter((d) => /metformin/i.test(textOf(d).replace(SCREEN, ''))).map((d) => `${x.name}: ${d.resourceType}/${d.id}`));
    expect(hits).toEqual([]);
  });

  // verifier-W1-probe-T5-clinical-4 C4-1: Schuster's and Brakus's older visit notes listed their
  // history and medicines without the planted diabetes and metformin.
  it('every note of a list patient that lists the history or the medicines names the diabetes and the metformin the chart had by then', () => {
    type Cond = Rec & { onsetDateTime?: string; code?: { coding?: Array<{ code?: string }> }; clinicalStatus?: { coding?: Array<{ code?: string }> } };
    const at = (d: Rec) => Date.parse(d.date ?? d.effectiveDateTime ?? '');
    const hits = expected.items.flatMap((x) => {
      const diabetes = (all as Cond[]).filter((c) => c.resourceType === 'Condition' && c.subject?.reference === x.patient && c.clinicalStatus?.coding?.[0]?.code === 'active' && (c.code?.coding ?? []).some((k) => ['44054006', '46635009', '73211009'].includes(k.code ?? '')));
      const since = Math.min(...diabetes.map((c) => Date.parse(c.onsetDateTime!)));
      const metformin = all.filter((r) => r.resourceType === 'MedicationRequest' && r.subject?.reference === x.patient && /metformin/i.test(r.medicationCodeableConcept?.text ?? '')) as Array<Rec & { authoredOn?: string }>;
      const started = Math.min(...metformin.map((m) => Date.parse(m.authoredOn!)));
      return notesOf(x.patient).flatMap((d) => {
        const lines = textOf(d).split('\n');
        const history = lines.filter((l) => /^Past medical history:/.test(l));
        const meds = lines.filter((l) => /^Medications:/.test(l));
        return [
          ...(at(d) > since && history.some((l) => !/diabetes/i.test(l)) ? [`${x.name}: ${d.resourceType}/${d.id} history has no diabetes`] : []),
          ...(at(d) > started && meds.some((l) => !/metformin/i.test(l)) ? [`${x.name}: ${d.resourceType}/${d.id} medicines have no metformin`] : []),
        ];
      });
    });
    expect(hits).toEqual([]);
  });

  it('no note written after a recorded contrast reaction says the patient has no known drug allergies', () => {
    const hits = expected.items
      .filter((x) => x.class === 'allergy_grade')
      .flatMap((x) => {
        // The report of the day, the item's deciding record.
        const reaction = Date.parse((store.get('DocumentReference', x.decisive[0]!.split('/')[1]!) as { date: string }).date);
        return notesOf(x.patient).filter((d) => Date.parse(d.date ?? d.effectiveDateTime ?? '') > reaction && /\bNKDA\b|no known drug allerg/i.test(textOf(d))).map((d) => `${x.name}: ${d.resourceType}/${d.id} (${d.date ?? d.effectiveDateTime})`);
      });
    expect(hits).toEqual([]);
  });

  it("every booking note gives its study's slot time as the appointment holds it", () => {
    for (const x of expected.items) {
      const hhmm = x.start.slice(11, 16);
      const h = Number(hhmm.slice(0, 2));
      const clock = `${h % 12 || 12}:${hhmm.slice(3)} ${h < 12 ? 'AM' : 'PM'}`;
      const booking = notesOf(x.patient).filter((d) => /booked at St\. Brigid Imaging for Monday 10\/26/.test(textOf(d)));
      // The filler's chart gets only its appointment (overlay.ts), so it has no booking note.
      expect(booking.length, x.name).toBe(x.class === 'filler' ? 0 : 1);
      for (const d of booking) expect(textOf(d), x.name).toContain(`Monday 10/26 at ${clock}`);
    }
  });
});
