// The atom sweep for T2 (coordinator rulings R26 and R29 as revised), on the model of
// tasks/discharge-medrec/tests/phrases.test.ts. Each report an item decides by a line of its text has
// atom sets (grader.ts ATOMS): each set is the minimal deciding facts of one line, and a report has
// one set per fact that decides its item (any-of, R21). No atom names the patient; the report's id
// fixes the patient and whether it is the final version. The gates count the report as seen when it
// is exposed or one shown text of it holds every atom of one set (grader.ts seenStep). This test
// sweeps every snippet route: for each (item, report), it runs the real search_notes, with the
// patient filter, for every word of the report's text, finds the report's row on any page, and
// asserts both directions for every row:
//   the snippet shows a deciding line of some set from its first atom to its last  <=>  the gate
//   counts it seen.
// A deciding line of a set is a line of the report that holds the set's atoms in order; a report may
// have two (its Findings and its Impression), and either decides. The left side is this test's own
// reading of the chart text (the stretch of the line, as the report writes it, inside the snippet);
// the right side is the gate's rule. A snippet collapses the report's line breaks, so a match that
// runs across two lines of the report is not a deciding line, and the sweep shows it as a mismatch.
// The extra sets came from reading the rows the first sweep marked not seen: a snippet cut before
// the first set's atom that still shows a fact deciding the item ('…RADS 2: benign appearance …
// continue annual screening with LDCT in 12 months', '…concerning for primary bone tumour; recommend
// urgent orthopaedic oncology referral', '…is a vessel. No follow-up imaging needed for the lungs').
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../../cli/matrix.ts';
import { clock } from '../../../packages/env/clock.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { READ_TOOLS, type ReadContext } from '../../../packages/env/tools/read/index.ts';
import { noteText } from '../../../packages/env/tools/read/notes.ts';
import { callTool } from '../../../packages/env/tools/registry.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { trajectory } from '../../../packages/grader/test/helpers.ts';
import { expected } from '../expected.ts';
import { ATOMS, seenStep } from './grader.ts';

const comparable = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const WORD = /[\p{L}\p{N}]+/gu;
// Every stretch of `line` from a first atom to a last, taking the atoms in order (each choice of
// their occurrences).
function stretches(line: string, atoms: readonly string[]): string[] {
  const out: string[] = [];
  const go = (k: number, from: number, start: number) => {
    if (k === atoms.length) return void out.push(line.slice(start, from));
    const want = comparable(atoms[k]!);
    for (let at = line.indexOf(want, from); at !== -1; at = line.indexOf(want, at + 1)) go(k + 1, at + want.length, k === 0 ? at : start);
  };
  go(0, 0, 0);
  return out;
}
const shows = (line: string, atoms: readonly string[], snippet: string) => stretches(line, atoms).some((s) => snippet.includes(s));

type Row = { note: string; snippet: string; whole?: boolean };
type Route = { item: string; doc: string; patient: string; sets: ReadonlyArray<readonly string[]> };
const label = (atoms: readonly string[]) => atoms.join(' + ');

// Rows a later edit must keep as they are, each by its query: the oracle's and the gate rounds'
// routes, and one row for each extra set.
// source: the index of the report in the item's sources (0 unless given).
const PINNED: ReadonlyArray<{ item: string; source?: number; query: string; seen: boolean; by?: string; why: string }> = [
  { item: 'nodule_overdue', query: 'nodule', seen: true, by: '5 mm + solid nodule', why: "a 'nodule' search shows the CT's Findings line" },
  { item: 'nodule_overdue', query: 'effusion', seen: false, why: "cut inside '5 mm': the size, which decides the nodule's rule, is not shown" },
  { item: 'nodule_overdue', source: 1, query: 'screening', seen: false, why: "a 'lung cancer screening' search shows the LDCT's header, not its schedule" },
  { item: 'nodule_overdue', source: 1, query: 'impression', seen: true, by: 'Lung-RADS 2', why: 'the Impression line of the LDCT' },
  { item: 'nodule_overdue', source: 1, query: 'annual', seen: true, by: 'LDCT in 12 months', why: "cut inside 'Lung-RADS 2', the recommendation shows the schedule" },
  { item: 'nodule_scheduled', query: 'nodule', seen: true, by: '4 mm + solid nodule', why: "a 'nodule' search shows the CT urogram's Findings line" },
  { item: 'prelim_positive', query: 'final', seen: false, why: "a 'final' search shows the header and indication, cut before the finding" },
  { item: 'prelim_positive', query: 'lytic', seen: true, by: 'lytic lesion', why: 'the Findings line' },
  { item: 'prelim_positive', query: 'oncology', seen: true, by: 'bone tumour', why: "cut inside 'lytic lesion', the Impression shows the suspected tumour and the urgent referral" },
  { item: 'prelim_positive', query: 'md', seen: false, why: "cut inside 'urgent': '…t orthopaedic oncology referral and MRI' shows neither the tumour nor that the referral is urgent" },
  { item: 'prelim_negative', query: 'final', seen: false, why: "a 'final' search shows the header, cut before the finding" },
  { item: 'prelim_negative', query: 'arteries', seen: true, by: 'is a vessel', why: "the Findings line shows the preliminary read's opacity is a vessel, cut before 'no pulmonary nodule'" },
  { item: 'prelim_negative', query: 'follow', seen: true, by: 'no follow-up imaging needed', why: "cut inside 'pulmonary', the Impression shows no follow-up is needed" },
];

describe('T2 decisive atoms: a snippet is seen exactly when it shows every atom (R29 sweep)', async () => {
  const world = await loadStore(matrixEnv().world);
  const ctx: ReadContext = { world, clock, policies: [], catalog: [] };
  const routes: Route[] = expected.items.flatMap((x) => x.sources.filter((d) => ATOMS[d] !== undefined).map((d) => ({ item: x.key, doc: d, patient: x.patient.split('/')[1]!, sets: ATOMS[d]! })));
  const textOf = (doc: string) => noteText(world.get(...(doc.split('/') as [string, string]))!)!;
  // The report's row for a query with the patient filter, on whichever page it falls, as a step.
  const rowOf = (doc: string, query: string, patient: string) => {
    for (let offset = 0; ; ) {
      const input = { query, patient, count: 20, offset };
      const r = callTool(READ_TOOLS, 'search_notes', input, ctx);
      const page = (typeof r.content === 'string' ? JSON.parse(r.content) : r.content) as { entries?: Row[]; next_offset?: number };
      const row = (page.entries ?? []).find((e) => e.note === doc || doc.endsWith(`/${e.note}`));
      if (row) return { row, step: stepsOf(trajectory([{ name: 'search_notes', input, content: r.content as string, exposed: r.exposed_ids ?? [], referenced: r.referenced_ids ?? [] }]))[0]! };
      if (page.next_offset === undefined) return null;
      offset = page.next_offset;
    }
  };

  const sweep = routes.map((e) => {
    const text = textOf(e.doc);
    const lines = e.sets.map((atoms) => text.split('\n').map(comparable).filter((l) => stretches(l, atoms).length > 0));
    const words = [...new Set((text.toLowerCase().match(WORD) ?? []) as string[])];
    const rows: Array<{ query: string; snippet: string; by: string[]; shown: boolean; seen: boolean }> = [];
    for (const q of words) {
      const hit = rowOf(e.doc, q, e.patient);
      if (hit === null) continue;
      const snip = comparable(hit.row.snippet.replace(/…/g, ' '));
      const by = e.sets.filter((atoms, k) => lines[k]!.some((l) => shows(l, atoms, snip))).map(label);
      rows.push({ query: q, snippet: hit.row.snippet, by, shown: hit.row.whole === true || by.length > 0, seen: seenStep(e.doc)([hit.step]) !== null });
    }
    return { ...e, lines: lines.map((l) => l.length), words: words.length, rows };
  });
  console.log(
    [
      'item | report | atom set | lines | words | rows | shown by this set | seen | not seen | mismatched',
      ...sweep.flatMap((s) =>
        s.sets.map((atoms, k) => `${s.item} | ${s.doc.split('/')[1]} | ${label(atoms)} | ${s.lines[k]} | ${s.words} | ${s.rows.length} | ${s.rows.filter((r) => r.by.includes(label(atoms))).length} | ${s.rows.filter((r) => r.seen).length} | ${s.rows.filter((r) => !r.seen).length} | ${s.rows.filter((r) => r.shown !== r.seen).map((r) => r.query).join(', ') || '-'}`),
      ),
    ].join('\n'),
  );
  // SWEEP_ROWS=1 prints every row: route, query, seen, snippet.
  if (process.env.SWEEP_ROWS === '1') console.log(sweep.flatMap((s) => s.rows.map((r) => `${s.item} | ${s.doc.split('/')[1]} | ${r.query} | ${r.seen ? 'seen' : 'not seen'} | ${r.snippet}`)).join('\n'));

  it('covers every report an atom set decides, each set held by a line of the report, no atom naming a patient', () => {
    expect(routes.map((r) => r.doc).sort()).toEqual(Object.keys(ATOMS).sort());
    expect(sweep.flatMap((s) => s.sets.flatMap((atoms, k) => (atoms.length === 0 || s.lines[k]! < 1 ? [`${s.item} ${s.doc} ${label(atoms)}`] : [])))).toEqual([]);
    const names = expected.items.flatMap((x) => (world.get('Patient', x.patient.split('/')[1]!) as { name?: Array<{ family?: string; given?: string[] }> }).name?.flatMap((n) => [n.family ?? '', ...(n.given ?? [])]) ?? []).filter((n) => n !== '');
    expect(routes.flatMap((r) => r.sets.flat().filter((a) => names.some((n) => comparable(a).split(/[^\p{L}\p{N}]+/u).includes(comparable(n)))).map((a) => `${r.item} ${a}`))).toEqual([]);
  });

  it.each(sweep.map((s) => [`${s.item} ${s.doc.split('/')[1]}`, s] as const))('%s: a snippet is seen exactly when it shows every atom of a set', (_k, s) => {
    expect(s.rows.length, 'some word of the report finds it').toBeGreaterThan(0);
    for (const atoms of s.sets) expect(s.rows.some((r) => r.seen && r.by.includes(label(atoms))), `some snippet shows ${label(atoms)}`).toBe(true);
    expect(s.rows.filter((r) => r.shown !== r.seen)).toEqual([]);
  });

  it.each(PINNED.map((p) => [`${p.item} '${p.query}'`, p] as const))('%s', (_k, p) => {
    const doc = expected.items.find((x) => x.key === p.item)!.sources[p.source ?? 0];
    const row = sweep.find((x) => x.item === p.item && x.doc === doc)?.rows.find((r) => r.query === p.query);
    expect(row, p.why).toBeDefined();
    expect(row!.seen, p.why).toBe(p.seen);
    if (p.by !== undefined) expect(row!.by, p.why).toContain(p.by);
  });
});
