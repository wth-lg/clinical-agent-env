// Double derivation for T4 (design section 4, "Double derivation"; plan-amendment-worklist W1 T4
// probe): policy.ts applied to the committed world must give expected.ts, the worklist must hold
// exactly two items of each kept class and one filler, and the decisive facts must be the design's.
// The matrix checks the same equality; this test shows it on its own and pins what each rule turns
// on, so a rule that reads a text shape rather than the policy fails here.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { lintWorld } from '../../packages/env/lint/index.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { expected, type Item } from './expected.ts';
import { derive } from './policy.ts';
import { id, ref } from './ids.ts';

const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const decode = (data: string | undefined) => new TextDecoder().decode(Uint8Array.from(atob(data ?? ''), (c) => c.charCodeAt(0)));
const encode = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const view = (rs: typeof all): WorldView => ({ get: (type, rid) => rs.find((r) => r.resourceType === type && r.id === rid), all: (type) => (type === undefined ? rs : rs.filter((r) => r.resourceType === type)) });
const world = view(all);
// The world with one document's text edited.
const edit = (key: Parameters<typeof id>[0], fn: (text: string) => string) =>
  view(all.map((r) => (r.resourceType === 'DocumentReference' && r.id === id(key) ? { ...r, content: [{ ...r.content[0]!, attachment: { ...r.content[0]!.attachment, data: encode(fn(decode(r.content[0]!.attachment.data))) } }] } : r)));
const itemsOf = (w: WorldView) => (derive(w) as unknown as { items: Item[] }).items;
const item = (w: WorldView, key: string) => itemsOf(w).find((x) => x.key === key);

describe('discharge-medrec worklist', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(derive(world)).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it('holds exactly two items of each kept class and one filler, on the four slot patients', () => {
    const count = (cls: string) => expected.items.filter((x) => x.cls === cls).length;
    expect(['precedence', 'fill_history', 'formulary', 'brand', 'fill_gap', 'potassium'].map(count)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(count('filler')).toBe(1);
    expect(expected.items).toHaveLength(13);
    expect(new Set(expected.items.map((x) => x.patient))).toEqual(new Set(['Patient/pt-0004', 'Patient/pt-0005', 'Patient/pt-0042', 'Patient/pt-0044']));
    // Each class's two instances sit on two different patients.
    for (const cls of ['precedence', 'fill_history', 'formulary', 'brand', 'fill_gap', 'potassium']) expect(new Set(expected.items.filter((x) => x.cls === cls).map((x) => x.patient)).size, cls).toBe(2);
  });

  // §7 is a rule over the most recent potassium after discharge, not a text shape.
  it.each([['5.4', 'hold'], ['5.0', 'resume'], ['4.6', 'resume']])('Walter Kim at potassium %s: lisinopril %s', (k, kind) => {
    const w = edit('doc-t4-kim-lab', (t) => t.replace(/^Potassium(\s+)5\.4 mmol\/L/m, `Potassium$1${k} mmol/L`));
    expect(item(w, 'kim-lisinopril')?.kind).toBe(kind);
  });
  it('Earnest Roberts: the 10/22 report is the most recent potassium; without it the 10/20 clinic draw (5.3) holds the resume', () => {
    expect(item(world, 'roberts-lisinopril')).toMatchObject({ kind: 'resume', decisive: [ref('DocumentReference/doc-t4-roberts-dc'), ref('DocumentReference/doc-t4-roberts-lab'), ref('Observation/obs-t4-roberts-scr-1020')], atoms: { [ref('DocumentReference/doc-t4-roberts-lab')]: ['Potassium 4.6'] } });
    const w = view(all.filter((r) => !(r.resourceType === 'DocumentReference' && r.id === id('doc-t4-roberts-lab'))));
    expect(item(w, 'roberts-lisinopril')).toMatchObject({ kind: 'hold', decisive: [ref('Observation/obs-t4-roberts-k-1020')], due: { from: '2026-10-22', to: '2026-10-27' } });
  });

  // verifier-W1-probe-T4-clinical-5 F1 (R14, R21): the resume turns on a creatinine after discharge
  // below the summary's 1.3, and either result shows one: the 10/20 clinic Observation (1.24, seen
  // when exposed) or the 10/22 report's line (1.08, seen by its atom). A creatinine at or above the
  // limit is no route, nor is an older one below it; when the report is the only route, its atoms
  // take both its potassium and its creatinine line.
  it('Earnest Roberts: the resume needs a creatinine after discharge below 1.3, from any record that shows one (R21)', () => {
    const lab = ref('DocumentReference/doc-t4-roberts-lab');
    const obs = ref('Observation/obs-t4-roberts-scr-1020');
    expect(item(world, 'roberts-lisinopril')).toMatchObject({ decisive: [ref('DocumentReference/doc-t4-roberts-dc'), lab, obs], also: { [obs]: [{ id: lab, atoms: ['Creatinine 1.08'] }] } });
    expect(item(world, 'roberts-lisinopril')!.atoms[obs]).toBeUndefined();
    const reportOnly = (w: WorldView) => expect(item(w, 'roberts-lisinopril')).toEqual(expect.objectContaining({ kind: 'resume', decisive: [ref('DocumentReference/doc-t4-roberts-dc'), lab], atoms: { [ref('DocumentReference/doc-t4-roberts-dc')]: ['Resume', 'SCr < 1.3'], [lab]: ['Potassium 4.6', 'Creatinine 1.08'] } }));
    reportOnly(view(all.filter((r) => !(r.resourceType === 'Observation' && r.id === id('obs-t4-roberts-scr-1020')))));
    reportOnly(view(all.map((r) => (r.resourceType === 'Observation' && r.id === id('obs-t4-roberts-scr-1020') ? { ...r, valueQuantity: { ...r.valueQuantity!, value: 1.35 } } : r))));
  });

  // §1: without the addendum the summary rules.
  it('takes each signed addendum over its summary', () => {
    const noKim = edit('doc-t4-kim-add', (t) => t.replace('Correction: furosemide 40 mg twice daily, not 40 mg daily.', 'No change to the medication list.'));
    expect(item(noKim, 'kim-furosemide')).toMatchObject({ kind: 'dose', cls: 'filler', daily_mg: 40, per_day: 1 });
    const noThompson = edit('doc-t4-thompson-add', (t) => t.replace('Correction: hydrochlorothiazide: stop. Do not restart.', 'No change to the medication list.'));
    expect(item(noThompson, 'thompson-hctz')).toBeUndefined();
  });

  // §5b: the 80% line over the 180 days before admission (24% and 41% here); a fill that closes the
  // gap clears the flag.
  it('flags a continued order whose fills cover under 80% of the 180 days before admission', () => {
    expect(itemsOf(world).filter((x) => x.kind === 'flag_order').map((x) => x.key)).toEqual(['stark-atorvastatin', 'thompson-levothyroxine']);
    const filled = edit('doc-t4-stark-fills', (t) => t.replace(/^(03\/04\/2026 +atorvastatin.*)$/m, '$1\n06/02/2026   atorvastatin 80 mg tablet                      90    90             Maya Okafor, MD                             Riverbend Pharmacy\n08/31/2026   atorvastatin 80 mg tablet                      90    90             Maya Okafor, MD                             Riverbend Pharmacy'));
    expect(item(filled, 'stark-atorvastatin')).toBeUndefined();
  });

  // §5a: a filled drug with no clinic order is flagged unless a discharge line addresses it.
  it('flags a filled drug with no clinic order that no discharge line addresses', () => {
    expect(itemsOf(world).filter((x) => x.kind === 'flag_fill').map((x) => [x.key, x.fills])).toEqual([
      ['stark-glipizide', ref('DocumentReference/doc-t4-stark-outfills')],
      ['roberts-sertraline', ref('DocumentReference/doc-t4-roberts-outfills')],
    ]);
  });

  // §4: a brand name reads as the chart's drug; at the chart's dose with 'continue' it is no change.
  it('reads a brand name as the chart order of its ingredient', () => {
    const same = edit('doc-t4-stark-dc', (t) => t.replace('- Coreg 12.5 mg by mouth twice daily.', '- Coreg 6.25 mg by mouth twice daily: continue.'));
    expect(item(same, 'stark-carvedilol')).toBeUndefined();
  });

  // The overlay cannot read instruction.md or the policy file, so their prompt-date, weekday and
  // leakage checks run here. No policy sentence names a planted patient, id, date or an item's drug.
  it('states no date the clock gives and no answer in the prompt or policy text; the policy names no item', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('discharge-medrec');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const answers = ['40 mg twice daily', 'SCr 1.32', 'Potassium 5.4', 'Potassium 4.6', 'glipizide', 'sertraline', '24%', '41%'];
    const findings = lintWorld(all, [{ source: 'discharge-medrec', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : 'RBC-TOC-02', text })) } } }]);
    expect(findings).toEqual([]);
    const policyText = task.policies.map((p) => p.text).join('\n').toLowerCase();
    const named = [...expected.patients.flatMap((p) => [p.name, ...p.name.split(' '), p.patient.split('/')[1]!]), ...expected.items.flatMap((x) => [x.ingredient, ...(x.substitute ? [x.substitute] : [])]), 'coreg', 'procardia', '2026-10', '10/'];
    expect(named.filter((w) => policyText.includes(w.toLowerCase()))).toEqual([]);
  });

  // R1: an item's decisive ids are only the records that decide its action. A signed correction
  // decides its drug whatever the summary's line says, and §7 holds the resume whatever the
  // discharge documents say, so for those items the summary is not decisive.
  it('names as decisive only the records that decide each item (R1)', () => {
    const kimAdd = ref('DocumentReference/doc-t4-kim-add');
    const thompsonAdd = ref('DocumentReference/doc-t4-thompson-add');
    const kimLab = ref('DocumentReference/doc-t4-kim-lab');
    expect(item(world, 'kim-furosemide')).toMatchObject({ decisive: [kimAdd] });
    expect(item(world, 'thompson-hctz')).toMatchObject({ decisive: [thompsonAdd] });
    expect(item(world, 'kim-lisinopril')).toMatchObject({ decisive: [kimLab] });
    // The summary's own line cannot move these items.
    const kimLine = edit('doc-t4-kim-dc', (t) => t.replace('- Furosemide 40 mg by mouth daily (increased from 20 mg).', '- Furosemide 60 mg by mouth daily (increased from 20 mg).').replace('when SCr < 1.5', 'when SCr < 2.0'));
    expect(item(kimLine, 'kim-furosemide')).toEqual(item(world, 'kim-furosemide'));
    expect(item(kimLine, 'kim-lisinopril')).toEqual(item(world, 'kim-lisinopril'));
  });

  // R16: a resume item's chart gives no clinical reason to defer the resume: the patient fills no
  // NSAID and no other potassium-raising drug.
  it('gives a resume item no co-medication that would make holding defensible (R16)', () => {
    const NSAID = /\b(ibuprofen|naproxen|diclofenac|meloxicam|celecoxib|ketorolac|indomethacin|ketoprofen|etodolac|nabumetone|piroxicam)\b/i;
    const RAISES_K = /\b(spironolactone|eplerenone|finerenone|\w+pril|\w+sartan|potassium chloride|trimethoprim)\b/i;
    for (const x of expected.items.filter((i) => i.kind === 'resume')) {
      const p = expected.patients.find((q) => q.patient === x.patient)!;
      const lines = p.fills.flatMap((f) => {
        const d = store.get('DocumentReference', f.split('/')[1]!);
        return decode(d?.resourceType === 'DocumentReference' ? d.content[0]!.attachment.data : '').split('\n').filter((l) => /^\d\d\/\d\d\/\d{4}/.test(l));
      });
      expect(lines.length, x.key).toBeGreaterThan(0);
      const other = lines.filter((l) => NSAID.test(l) || (RAISES_K.test(l) && !l.toLowerCase().includes(x.ingredient)));
      expect(other, x.key).toEqual([]);
    }
  });

  // verifier-W1-probe-T4-clinical-1 M1: the policy's example abbreviations are not the worklist's
  // own release-form tokens, so the example does not coach one item.
  it("uses no worklist drug's release-form abbreviation as the policy's example", async () => {
    const task = await nodeTaskSource({ testMode: false }).get('discharge-medrec');
    const examples = [...task.policies.map((p) => p.text).join('\n').matchAll(/for example ((?:"[^"]+"(?: or |, )?)+)/g)].flatMap((m) => [...m[1]!.matchAll(/"([^"]+)"/g)].map((q) => q[1]!));
    expect(examples.length).toBeGreaterThan(0);
    const worklist = all.filter((r) => (r.resourceType === 'DocumentReference' || r.resourceType === 'MedicationRequest') && expected.patients.some((p) => (r as { subject?: { reference?: string } }).subject?.reference === p.patient));
    const texts = worklist.map((r) => (r.resourceType === 'DocumentReference' ? decode(r.content[0]!.attachment.data) : JSON.stringify((r as { medicationCodeableConcept?: unknown }).medicationCodeableConcept)));
    expect(examples.filter((e) => texts.some((t) => new RegExp(`\\b${e}\\b`).test(t)))).toEqual([]);
  });

  it('gives every worklist patient Dr. Okafor as PCP and keeps each Synthea age (W1-0 F7)', () => {
    for (const p of expected.patients) {
      const pt = store.get('Patient', p.patient.split('/')[1]!);
      expect(pt?.resourceType === 'Patient' && pt.generalPractitioner, p.name).toEqual([{ reference: 'Practitioner/pr-okafor' }]);
    }
    const age = (rid: string) => {
      const pt = store.get('Patient', rid);
      const born = pt?.resourceType === 'Patient' ? pt.birthDate! : '';
      return 2026 - Number(born.slice(0, 4)) - ('10-23' < born.slice(5) ? 1 : 0);
    };
    expect(['pt-0005', 'pt-0004', 'pt-0042', 'pt-0044'].map(age)).toEqual([74, 76, 32, 31]);
  });

  // verifier-W1-probe-T4-clinical-2 N1 (R1, R2) and R29: an item a discharge-summary line decides
  // has that line's atoms, the minimal facts that decide it without the drug's name, so a search
  // snippet that shows them counts as seen. Several items share one summary, each by its own line:
  // a dose line's strength and frequency words, a stop line's 'stop', a §3 clause's substitute and
  // 'in place of home', a conditional resume's 'Resume' and its creatinine condition. Each line
  // holds its atoms in order, and no other line of its summary holds them all.
  it("gives each item a discharge-summary line decides that line's atoms (R2, R29)", () => {
    const lines = (doc: string) => {
      const d = store.get('DocumentReference', doc.split('/')[1]!);
      return decode(d?.resourceType === 'DocumentReference' ? d.content[0]!.attachment.data : '').split('\n').map((l) => l.replace(/\s+/g, ' ').toLowerCase());
    };
    const inOrder = (line: string, atoms: readonly string[]) => atoms.reduce<number>((at, a) => (at === -1 ? -1 : ((i) => (i === -1 ? -1 : i + a.length))(line.indexOf(a.toLowerCase(), at))), 0) !== -1;
    const bySummary = itemsOf(world).flatMap((x) => {
      const summary = expected.patients.find((p) => p.patient === x.patient)!.summary;
      return x.decisive.includes(summary) ? [[x.key, x.atoms[summary] ?? null, summary] as const] : [];
    });
    expect(bySummary.map(([k, atoms]) => [k, atoms])).toEqual([
      ['kim-kcl', ['stop']],
      ['kim-omeprazole', ['pantoprazole', 'in place of home']],
      ['stark-carvedilol', ['12.5 mg', 'twice daily']],
      ['thompson-nifedipine', ['60 mg']],
      ['roberts-lisinopril', ['Resume', 'SCr < 1.3']],
      ['roberts-rosuvastatin', ['atorvastatin', 'in place of home']],
    ]);
    for (const [k, atoms, summary] of bySummary) expect(lines(summary).filter((l) => inOrder(l, atoms!)).length, k).toBe(1);
  });

  // R29 at the other records: a correction's atoms are its ruling's (after the 'Correction:' label),
  // a report's result line's are the analyte and value, a fill line's the drug's name as filled.
  it('gives each addendum, report and fill-history record the atoms of its deciding line (R29)', () => {
    const summaries = new Set(expected.patients.map((p) => p.summary));
    const other = itemsOf(world).flatMap((x) => Object.entries(x.atoms).filter(([d]) => !summaries.has(d)).map(([, atoms]) => [x.key, atoms]));
    expect(other).toEqual([
      ['kim-furosemide', ['40 mg', 'twice daily']],
      ['kim-lisinopril', ['Potassium 5.4']],
      ['stark-glipizide', ['glipizide']],
      ['thompson-hctz', ['stop']],
      ['roberts-lisinopril', ['Potassium 4.6']],
      ['roberts-sertraline', ['sertraline']],
    ]);
  });

  // verifier-W1-probe-T4-2 N2 and clinical-2 N3 (R9): §7 forbids a new order of a potassium-raising
  // drug while the most recent potassium after discharge is above 5.0, so the stop item of such a
  // drug carries that forbid; at a potassium of 5.0 or below it does not.
  it('marks a stop of a potassium-raising drug as forbidding a new order while potassium is above 5.0 (§7)', () => {
    expect(itemsOf(world).filter((x) => x.no_new_order === true).map((x) => x.key)).toEqual(['kim-kcl']);
    const low = edit('doc-t4-kim-lab', (t) => t.replace(/^Potassium(\s+)5\.4 mmol\/L/m, 'Potassium$14.6 mmol/L'));
    expect(item(low, 'kim-kcl')?.no_new_order).toBeUndefined();
    expect(item(world, 'thompson-hctz')?.no_new_order).toBeUndefined();
  });

  // verifier-W1-probe-T4-clinical-2 N2: §5b's source (CMS PDC) counts the days from the first fill,
  // so a drug started inside the window and refilled on time is taken as prescribed.
  it('counts §5b coverage from the first fill when it falls inside the 180 days (CMS PDC)', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('discharge-medrec');
    expect(task.policies.map((p) => p.text).join('\n')).toMatch(/or of the days from its first fill to admission when that fill falls inside them/);
    const line = (d: string) => `${d}   atorvastatin 80 mg tablet                      30    30             Maya Okafor, MD                             Riverbend Pharmacy`;
    const late = edit('doc-t4-stark-fills', (t) => t.split('\n').filter((l) => !/^\d\d\/\d\d\/\d{4} +atorvastatin/.test(l)).join('\n').concat('\n', ['08/18/2026', '09/17/2026'].map(line).join('\n')));
    expect(item(late, 'stark-atorvastatin')).toBeUndefined();
    const gap = edit('doc-t4-stark-fills', (t) => t.split('\n').filter((l) => !/^\d\d\/\d\d\/\d{4} +atorvastatin/.test(l)).join('\n').concat('\n', ['07/01/2026', '09/17/2026'].map(line).join('\n')));
    expect(item(gap, 'stark-atorvastatin')).toMatchObject({ kind: 'flag_order' });
  });

  // verifier-W1-probe-T4-clinical-2 N4 (R8): the reconciliation is done before the post-discharge
  // visit, so no planted clinic encounter after discharge reads as a visit; Roberts' 10/20 draw is a
  // lab-only encounter.
  it('plants no post-discharge clinic visit, only a lab draw (R8)', () => {
    const VISITS = new Set(['185349003', '162673000', '390906007', '185347001', '185345009']);
    const enc = store.get('Encounter', id('enc-t4-roberts-lab'));
    const codes = enc?.resourceType === 'Encounter' ? (enc.type ?? []).flatMap((t) => (t.coding ?? []).map((c) => c.code ?? '')) : [];
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.filter((c) => VISITS.has(c))).toEqual([]);
  });
});
