// The atom sweep for T3 (coordinator rulings R26 and R29 as revised; the model is
// tasks/discharge-medrec/tests/phrases.test.ts). A decisive note's deciding line has atoms: the
// minimal words that settle its member (expected.ts Member.atoms). B1's outside operative note
// decides her total colectomy by 'total proctocolectomy'; H2's skilled nursing discharge summary
// decides that he lives at home by 'discharged home' (any-of with his housing status and the stay's
// encounter, R21). Both notes are longer than one snippet, so no search_notes row exposes either
// whole: only a snippet that shows the atoms can stand for a read.
//
// The gates count a note as seen when one read or one search snippet of it shows every atom on one
// line (tests/grader.ts seenAt, firstSeenBy). This test sweeps every snippet route: for each route
// (member, note, atoms), it runs the real search_notes, with the patient filter, for every word of
// the note's text, finds the note's row on any page, and asserts both directions for every row:
//   the snippet shows the deciding line from its first atom to its last  <=>  the gate counts it seen.
// The left side is this test's own reading of the chart text (the stretch of the line, as the note
// writes it, inside the snippet); the right side is the gate's rule for the note itself, read
// through recordSeenAt on the one search step alone (H2's gap also needs its screening searches,
// ruling R31, which seenAt adds on top of this rule).
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../../cli/matrix.ts';
import { clock } from '../../../packages/env/clock.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { READ_TOOLS, type ReadContext } from '../../../packages/env/tools/read/index.ts';
import { callTool } from '../../../packages/env/tools/registry.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { trajectory } from '../../../packages/grader/test/helpers.ts';
import { expected } from '../expected.ts';
import { ref } from '../ids.ts';
import { recordSeenAt } from './grader.ts';

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
type Route = { item: string; doc: string; patient: string; atoms: readonly string[] };

// Rows a later edit must keep as they are, each by its query.
const PINNED: ReadonlyArray<{ doc: string; query: string; seen: boolean; why: string }> = [
  { doc: 'doc-t3-1856', query: 'proctocolectomy', seen: true, why: 'alternative colectomy_from_snippet: the snippet shows the Procedure line' },
  { doc: 'doc-t3-1856', query: 'surgeon', seen: false, why: "builder-252 sweep: the snippet ends at 'Postoperative diagnosis: same.', before the Procedure line" },
  { doc: 'doc-t3-6193', query: 'disposition', seen: true, why: 'alternative h2_from_disposition_snippet' },
  { doc: 'doc-t3-6193', query: 'discharged', seen: false, why: "mutant h2_snippet_cut_before_disposition: the first match is the 'Discharged: 05/24/2026' header" },
  { doc: 'doc-t3-6193', query: 'home', seen: false, why: "builder-252 sweep: the first match is 'a fall at home', and the snippet ends before the Disposition line" },
];

describe('T3 decisive atoms: a snippet is seen exactly when it shows every atom (R29 sweep)', async () => {
  const world = await loadStore(matrixEnv().world);
  const ctx: ReadContext = { world, clock, policies: [], catalog: [] };
  const routes: Route[] = expected.items.flatMap((x) => x.decisive.flatMap((d) => (x.atoms[d] ? [{ item: x.patient, doc: d, patient: x.patient.split('/')[1]!, atoms: x.atoms[d]! }] : [])));
  const textOf = (doc: string) => {
    const d = world.get('DocumentReference', doc.split('/')[1]!) as { content: Array<{ attachment: { data: string } }> };
    return new TextDecoder().decode(Uint8Array.from(atob(d.content[0]!.attachment.data), (c) => c.charCodeAt(0)));
  };
  // The note's row for a query with the patient filter, on whichever page it falls, as a step.
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
    const lines = textOf(e.doc).split('\n').map(comparable).filter((l) => stretches(l, e.atoms).length > 0);
    const words = [...new Set((textOf(e.doc).toLowerCase().match(WORD) ?? []) as string[])];
    const rows: Array<{ query: string; snippet: string; whole: boolean; shown: boolean; seen: boolean }> = [];
    for (const q of words) {
      const hit = rowOf(e.doc, q, e.patient);
      if (hit === null) continue;
      const snip = comparable(hit.row.snippet.replace(/…/g, ' '));
      const shown = lines.some((l) => shows(l, e.atoms, snip));
      rows.push({ query: q, snippet: hit.row.snippet, whole: hit.row.whole === true, shown, seen: recordSeenAt([hit.step], e.doc) !== null });
    }
    return { ...e, lines: lines.length, words: words.length, rows };
  });
  const bare = (doc: string) => doc.split('/')[1]!;
  console.log(
    [
      'member | note | atoms | words | rows | whole | shown | seen | not seen | mismatched',
      ...sweep.map((s) => `${s.item} | ${bare(s.doc)} | ${s.atoms.join(' + ')} | ${s.words} | ${s.rows.length} | ${s.rows.filter((r) => r.whole).length} | ${s.rows.filter((r) => r.shown).length} | ${s.rows.filter((r) => r.seen).length} | ${s.rows.filter((r) => !r.seen).length} | ${s.rows.filter((r) => r.shown !== r.seen).map((r) => r.query).join(', ') || '-'}`),
      '',
      'note | query | shown | seen',
      ...sweep.flatMap((s) => s.rows.filter((r) => r.shown).map((r) => `${bare(s.doc)} | ${r.query} | ${r.shown} | ${r.seen}`)),
    ].join('\n'),
  );

  it('the two decisive notes have atoms, and exactly one line of each holds them', () => {
    expect(sweep.map((s) => `${s.item} ${bare(s.doc)} ${s.atoms.join(' + ')}`).sort()).toEqual([
      'Patient/pt-0021 doc-t3-1856 total proctocolectomy',
      'Patient/pt-0035 doc-t3-6193 discharged home',
    ].map((k) => k.replace(/doc-t3-\d+/, (d) => bare(ref(`DocumentReference/${d}` as Parameters<typeof ref>[0])))).sort());
    expect(sweep.filter((s) => s.lines !== 1).map((s) => `${s.item} ${s.doc} ${s.lines}`)).toEqual([]);
    // Neither note fits in one snippet, so the atoms are the only snippet route.
    expect(sweep.flatMap((s) => s.rows.filter((r) => r.whole).map((r) => `${s.doc} ${r.query}`))).toEqual([]);
  });

  it.each(sweep.map((s) => [`${s.item} ${bare(s.doc)} ${s.atoms.join(' + ')}`, s] as const))('%s: a snippet is seen exactly when it shows every atom', (_k, s) => {
    expect(s.rows.some((r) => r.shown), 'some word of the note shows every atom in a snippet').toBe(true);
    expect(s.rows.filter((r) => r.shown !== r.seen).map((r) => ({ query: r.query, shown: r.shown, seen: r.seen, snippet: r.snippet }))).toEqual([]);
  });

  it.each(PINNED.map((p) => [`${p.doc} '${p.query}'`, p] as const))('%s', (_k, p) => {
    const s = sweep.find((x) => x.doc === ref(`DocumentReference/${p.doc}` as Parameters<typeof ref>[0]))!;
    expect(s, p.why).toBeDefined();
    expect(s.rows.find((r) => r.query === p.query)?.seen, p.why).toBe(p.seen);
  });
});
