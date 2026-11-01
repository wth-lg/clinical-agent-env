// The worklist probe's shape and its policy text (plan-amendment-worklist.md W1 gate): expected.items
// holds exactly two instances of each kept class plus one filler, and no policy sentence or the
// instruction names a planted patient, an id, an item's date or an item-specific drug or finding
// (read from expected.items and the world), so every rule is stated in general terms.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { noteText } from '../../packages/env/tools/read/notes.ts';
import { CLASSES, expected } from './expected.ts';
import { IDS } from './ids.ts';

const I = expected.items;
const store = await loadStore(matrixEnv().world);
const task = await nodeTaskSource({ testMode: false }).get('results-inbox');
const texts: Array<[string, string]> = [['instruction.md', task.instruction], ...task.policies.map((p): [string, string] => [p.id, p.text])];

describe('results-inbox worklist', () => {
  it('holds exactly two items of each kept class and one filler', () => {
    const count = (c: string) => I.filter((x) => x.class === c).length;
    expect(Object.fromEntries(CLASSES.map((c) => [c, count(c)]))).toEqual({ nodule_screening: 2, hemolyzed: 2, corrected: 2, entered_in_error: 2, preliminary: 2, aki: 2, filler: 1 });
    expect(new Set(I.map((x) => x.key)).size).toBe(13);
    expect(new Set(I.map((x) => x.task)).size).toBe(13);
  });

  it('puts every item on a T2 slot patient and adds no Patient', () => {
    const slots = ['pt-0006', 'pt-0007', 'pt-0008', 'pt-0010', 'pt-0013', 'pt-0016', 'pt-0033', 'pt-0053'];
    expect([...new Set(I.map((x) => x.patient.replace('Patient/', '')))].sort()).toEqual(slots);
    expect(Object.keys(IDS).filter((k) => k.startsWith('pt-'))).toEqual([]);
  });

  // Item-specific words: each item patient's name and MRN, every id an item names (world ids and
  // registry keys), every date in expected.items, the drugs and findings the scenario turns on.
  const patients = [...new Set(I.map((x) => x.patient))].map((p) => store.get('Patient', p.split('/')[1]!) as { name?: Array<{ given?: string[]; family?: string }>; identifier?: Array<{ value?: string }> });
  const names = patients.flatMap((p) => (p.name ?? []).flatMap((n) => [n.family ?? '', ...(n.given ?? [])])).filter((w) => w.length > 2);
  const mrns = patients.flatMap((p) => (p.identifier ?? []).map((i) => i.value ?? '')).filter((v) => /\d{4}/.test(v));
  const ids = [...I.flatMap((x) => [x.task, x.patient, ...x.sources]).map((r) => r.split('/')[1]!), ...Object.keys(IDS), ...Object.values(IDS)];
  const dates = [...new Set(JSON.stringify(I).match(/\d{4}-\d{2}-\d{2}/g) ?? [])];
  const specific = ['lisinopril', 'ibuprofen', 'urogram', 'angiogram', 'femur', 'knee', 'lytic', 'vessel', 'Lakeshore', 'St. Brigid', 'analyzer', 'dilution', 'calibration', 'labelling', 'wrong patient', 'accession'];

  it.each(texts)('%s names no planted patient, id, item date or item-specific word', (_source, text) => {
    const found = [
      ...names.filter((n) => new RegExp(`\\b${n}\\b`).test(text)),
      ...mrns.filter((m) => text.includes(m)),
      ...ids.filter((i) => text.includes(i)),
      ...dates.filter((d) => text.includes(d)),
      ...specific.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text)),
    ];
    expect(found).toEqual([]);
  });

  // R5 (verifier-W1-probe-T2-clinical-1 F3): search_notes indexes note and report text only, so a
  // fact in a result's status, comment or a lab report's conclusion is not found by searching for the
  // rule's word. The inbox policy says where to look, and that route, reading the result, returns
  // the fact for every item whose deciding fact sits there.
  it("names the route to every fact search_notes cannot find, and the route returns it", async () => {
    const inbox = texts.find(([id]) => id === 'RBC-INBOX-01')![1];
    expect(inbox).toMatch(/status[^.]*comments?[^.]*conclusion[^.]*on the result itself/i);
    expect(inbox).toMatch(/not in the notes? search/i);
    const { clock } = await import('../../packages/env/clock.ts');
    const { READ_TOOLS } = await import('../../packages/env/tools/read/index.ts');
    const { callTool } = await import('../../packages/env/tools/registry.ts');
    const ctx = { world: store, clock, policies: [], catalog: [] } as never;
    const where: Array<[string, string, string]> = [
      ['hemolyzed_report', I.find((x) => x.key === 'hemolyzed_report')!.sources[0]!, 'hemolyzed'],
      ['hemolyzed_note', I.find((x) => x.key === 'hemolyzed_note')!.sources[0]!, 'hemolyzed'],
      ['corrected_up', I.find((x) => x.key === 'corrected_up')!.sources[0]!, '"corrected"'],
      ['corrected_down', I.find((x) => x.key === 'corrected_down')!.sources[0]!, '"corrected"'],
      ['eie_result', I.find((x) => x.key === 'eie_result')!.sources[0]!, '"entered-in-error"'],
      ['eie_baseline', (I.find((x) => x.key === 'eie_baseline') as { withdrawn: string }).withdrawn, '"entered-in-error"'],
    ];
    for (const [key, ref, fact] of where) {
      const [resource_type, id] = ref.split('/') as [string, string];
      const searched = JSON.stringify((callTool(READ_TOOLS, 'search_notes', { query: fact.replace(/"/g, '').replace('-', ' ') }, ctx) as { content: unknown }).content);
      expect([key, searched.includes(id)]).toEqual([key, false]);
      const read = JSON.stringify((callTool(READ_TOOLS, 'fhir_read', { resource_type, id }, ctx) as { content: unknown }).content);
      expect([key, read.includes(fact)]).toEqual([key, true]);
    }
  });

  // F4 (verifier-W1-probe-T2-clinical-1, decisions.tsv 2026-10-29T04:45Z and 05:42Z): every condition
  // patient_contact enforces is stated in the inbox policy in general terms: a day for a routine
  // result, a call task's focus, and a message or task naming the result it is about (R15).
  it('states every patient_contact condition in RBC-INBOX-01', () => {
    const inbox = texts.find(([id]) => id === 'RBC-INBOX-01')![1];
    expect(inbox).toMatch(/any other result that needs action within 7 days/i);
    expect(inbox).toMatch(/task[^.]*focused on the result[^.]*task focused on an order tracks that order/i);
    expect(inbox).toMatch(/names the result it is about/i);
  });

  // R4 (verifier-W1-probe-T2-clinical-2 N2): ace_inhibitor_addressed and ace_inhibitor_escalated
  // trace to RBC-LAB-03 §1, so §1 states the drug review in general terms and names no drug (R11).
  it('states the drug review the ACE inhibitor rubric items enforce in RBC-LAB-03 §1, naming no drug', () => {
    const lab = texts.find(([id]) => id === 'RBC-LAB-03')![1];
    const s1 = lab.slice(lab.indexOf('§1'), lab.indexOf('§2'));
    expect(s1).toMatch(/review[^.]*(drug|medication)[^.]*raises? potassium/i);
    expect(s1).toMatch(/hold[^.]*reduce|reduce[^.]*hold/i);
    expect(s1).not.toMatch(/lisinopril|ACE|angiotensin|losartan|spironolactone|\bARB\b|ibuprofen|trimethoprim/i);
    // N9 (verifier-W1-probe-T2-clinical-3): the hold is bounded by safety, so a literal reader does not
    // stop a drug such as a beta-blocker abruptly.
    expect(s1).toMatch(/hold or reduce it where that is safe/i);
  });

  // N10 (verifier-W1-probe-T2-clinical-3, R23): result_seen_before_action counts the item's orders and
  // every write of the item (closing it or reassigning it), so §1's verb names handing the item on.
  it('names in RBC-INBOX-01 §1 every write result_seen_before_action counts: ordering, completing and handing on', () => {
    const inbox = texts.find(([id]) => id === 'RBC-INBOX-01')![1];
    const s1 = inbox.slice(inbox.indexOf('§1'), inbox.indexOf('§2'));
    expect(s1).toMatch(/before ordering or completing the item, or handing it on/i);
  });

  it('states every class rule in the policies, in words that retrieve its evidence', () => {
    const all = texts.map(([, t]) => t).join('\n');
    // Each rule term is the word its evidence uses: a result status (corrected, entered in error,
    // preliminary), a lab comment or report conclusion (hemolyzed), a report's text (lung cancer
    // screening, final), a lab code's name (creatinine). search_notes does not stem
    // (verifier-phase-P17i-W0-3-pilot3-1 F1), so a policy word that differs from the record's would
    // not find it.
    for (const term of ['corrected', 'entered in error', 'preliminary', 'final', 'hemolyzed', 'lung cancer screening', 'creatinine', '48 hours', '7 days', '1.5 times', '0.3 mg/dL']) expect(all).toContain(term);
    const evidence = [...store.resources()].map((r) => `${JSON.stringify(r)}\n${noteText(r) ?? ''}`).join('\n');
    const missing = ['"status":"corrected"', '"status":"entered-in-error"', '"status":"preliminary"', 'FINAL REPORT', 'hemolyzed', 'LUNG CANCER SCREENING', 'Creatinine'].filter((term) => !evidence.includes(term));
    expect(missing).toEqual([]);
  });
});
