// The atom sweep for T5 (coordinator rulings R26 and R29 as revised), on the model of
// tasks/discharge-medrec/tests/phrases.test.ts. Every place a decisive record's fact shows in a note
// (expected.ts shown, R2) has atoms: the minimal facts of the line that decide the item (ATOMS
// below). The gates count the place as seen when one read or one search snippet shows the place's
// phrase (tests/grader.ts seenIn, through firstShown), or the note itself is exposed (a whole
// snippet). This test sweeps every snippet route: for each place, it runs the real search_notes,
// with the patient filter, for every word of the note's text, finds the note's row on any page, and
// asserts both directions for every row:
//   the snippet shows a deciding line from its first atom to its last  <=>  the gate counts it seen.
// A deciding line is a line of the note that holds every atom in order. The left side is this
// test's own reading of the chart text (the stretch of the line, as the note writes it, inside the
// snippet; or the whole note); the right side is the gate's rule. search_notes cuts a snippet by
// characters, about 80 before and 160 after the first query word, so a cut can fall inside a line.
// In every T5 place the atoms sit next to each other, so the rule holds exactly when each phrase is
// the stretch from its first atom to its last: no word before the first, none after the last (R26).
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../../cli/matrix.ts';
import { clock } from '../../../packages/env/clock.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { READ_TOOLS, type ReadContext } from '../../../packages/env/tools/read/index.ts';
import { callTool } from '../../../packages/env/tools/registry.ts';
import { firstShown, stepsOf } from '../../../packages/grader/exposure.ts';
import { trajectory } from '../../../packages/grader/test/helpers.ts';
import { syntheaRef } from '../../../packages/env/synthea-ids.ts';
import { expected, type Shown } from '../expected.ts';
import { ref } from '../ids.ts';

const comparable = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const WORD = /[\p{L}\p{N}]+/gu;

// The atoms of each kind of place, the drug's name never among them (R29):
//   the report of the day: the grade and the kind of reaction §1 grades ('moderate', 'allergic-
//     like'); 'reaction' decides nothing
//   the booking screen: the question and its answer ('Diabetes or metformin', 'yes')
//   a note that names the diabetes: 'diabetes' (§4 asks for diabetes, of any type)
//   the record of a kidney injury: 'acute kidney injury'
const ATOMS = (s: Shown): readonly string[] => {
  const grade = /\b(mild|moderate|severe) allergic-like\b/i.exec(s.phrase)?.[1];
  if (grade !== undefined) return [grade, 'allergic-like'];
  if (/kidney injury/i.test(s.phrase)) return ['acute kidney injury'];
  if (/^diabetes or metformin/i.test(s.phrase)) return ['Diabetes or metformin', 'yes'];
  if (/diabetes/i.test(s.phrase)) return ['diabetes'];
  throw new Error(`no atoms for the phrase '${s.phrase}' of ${s.note}`);
};

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

type Row = { note: string; snippet: string; whole: boolean };
type Route = { item: string; id: string; note: string; patient: string; phrase: string; atoms: readonly string[] };

// Rows a later edit must keep as they are: the cuts the sweep found, each by its query. The 'seen'
// rows failed the gate while the phrases ran past their atoms ('moderate allergic-like reaction',
// 'type 2 diabetes'); each is also an alternative (tests/alternatives.ts). The rows cut before the
// last atom stay unseen; two are mutants (tests/mutants.ts).
const FERREIRA = 'Daniel Ferreira';
const SCHMITT = 'Jamaal Derick Schmitt';
const SCHUSTER = 'Anisha Margarita Schuster';
const PINNED: ReadonlyArray<{ item: string; note: string; atoms: string; query: string; seen: boolean; why: string }> = [
  { item: FERREIRA, note: ref('DocumentReference/doc-t5-ct-2019'), atoms: 'moderate + allergic-like', query: 'diphenhydramine', seen: true, why: "'…Classification: moderate allergic-like…', cut before 'reaction' (alternative moderate_grade_by_snippet)" },
  { item: FERREIRA, note: ref('DocumentReference/doc-t5-ct-2019'), atoms: 'moderate + allergic-like', query: 'room', seen: false, why: "'…Classification: moderate all…', cut inside the kind of reaction (mutant grade_snippet_cut)" },
  { item: FERREIRA, note: ref('DocumentReference/doc-t5-ct-2019'), atoms: 'moderate + allergic-like', query: 'on', seen: false, why: "'…Classification: moderate…', the kind of reaction cut off" },
  { item: SCHMITT, note: ref('DocumentReference/doc-t5-schmitt-ct'), atoms: 'severe + allergic-like', query: '112', seen: true, why: "'…Classification: severe allergic-like re…' (alternative severe_grade_by_snippet)" },
  { item: SCHMITT, note: ref('DocumentReference/doc-t5-schmitt-ct'), atoms: 'severe + allergic-like', query: '70', seen: true, why: "'…Classification: severe allergic-like reacti…'" },
  { item: SCHMITT, note: ref('DocumentReference/doc-t5-schmitt-ct'), atoms: 'severe + allergic-like', query: '50', seen: false, why: "'…Classification: severe all…', cut inside the kind of reaction" },
  { item: SCHUSTER, note: syntheaRef('DocumentReference/doc-00291'), atoms: 'diabetes', query: 'cystitis', seen: true, why: "'…diabetes; sinusitis; …', 'type 2' cut off (alternative schuster_dm_by_history_snippet)" },
  { item: SCHUSTER, note: ref('DocumentReference/doc-t5-schuster-ed'), atoms: 'diabetes', query: 'fluids', seen: true, why: "'…pe 2 diabetes. Several coworkers…' (alternative schuster_dm_by_ed_snippet)" },
  { item: SCHUSTER, note: ref('DocumentReference/doc-t5-schuster-ed'), atoms: 'acute kidney injury', query: 'nitrite', seen: false, why: "'…prerenal acute kidney i…', cut inside the diagnosis (mutant aki_snippet_cut)" },
];

describe('T5 decisive atoms: a snippet is seen exactly when it shows every atom (R29 sweep)', async () => {
  const world = await loadStore(matrixEnv().world);
  const ctx: ReadContext = { world, clock, policies: [], catalog: [] };
  const routes: Route[] = expected.items.flatMap((x) => x.shown.map((s) => ({ item: x.name, id: s.id, note: s.note, patient: x.patient.split('/')[1]!, phrase: s.phrase, atoms: ATOMS(s) })));
  const textOf = (note: string) => {
    const d = world.get('DocumentReference', note.split('/')[1]!) as { content: Array<{ attachment: { data: string } }> };
    return new TextDecoder().decode(Uint8Array.from(atob(d.content[0]!.attachment.data), (c) => c.charCodeAt(0)));
  };
  // The note's row for a query with the patient filter, on whichever page it falls, as a step.
  const rowOf = (note: string, query: string, patient: string) => {
    for (let offset = 0; ; ) {
      const input = { query, patient, count: 20, offset };
      const r = callTool(READ_TOOLS, 'search_notes', input, ctx);
      const page = (typeof r.content === 'string' ? JSON.parse(r.content) : r.content) as { entries?: Row[]; next_offset?: number };
      const row = (page.entries ?? []).find((e) => e.note === note);
      if (row) return { row, step: stepsOf(trajectory([{ name: 'search_notes', input, content: r.content as string, exposed: r.exposed_ids ?? [], referenced: r.referenced_ids ?? [] }]))[0]! };
      if (page.next_offset === undefined) return null;
      offset = page.next_offset;
    }
  };

  const sweep = routes.map((e) => {
    const text = textOf(e.note);
    const lines = text.split('\n').map(comparable).filter((l) => stretches(l, e.atoms).length > 0);
    const words = [...new Set((text.toLowerCase().match(WORD) ?? []) as string[])];
    const rows: Array<{ query: string; snippet: string; shown: boolean; seen: boolean }> = [];
    for (const q of words) {
      const hit = rowOf(e.note, q, e.patient);
      if (hit === null) continue;
      const snip = comparable(hit.row.snippet.replace(/…/g, ' '));
      const shown = hit.row.whole || lines.some((l) => stretches(l, e.atoms).some((s) => snip.includes(s)));
      // The gate's rule for this place: the phrase shown in the note's text, or (for a note's own
      // fact) the note exposed.
      const seen = firstShown([hit.step], e.note, e.phrase) !== null || (e.id === e.note && hit.step.exposed_ids.includes(e.note));
      rows.push({ query: q, snippet: hit.row.snippet, shown, seen });
    }
    return { ...e, lines, words: words.length, rows };
  });
  console.log(
    [
      'item | record | note | phrase | atoms | words | rows | seen | not seen | mismatched',
      ...sweep.map((s) => `${s.item} | ${s.id} | ${s.note} | '${s.phrase}' | ${s.atoms.join(' + ')} | ${s.words} | ${s.rows.length} | ${s.rows.filter((r) => r.seen).length} | ${s.rows.filter((r) => !r.seen).length} | ${s.rows.filter((r) => r.shown !== r.seen).map((r) => r.query).join(', ') || '-'}`),
    ].join('\n'),
  );

  it('every place has atoms, none names a drug, one line of its note holds them, and its phrase is their stretch (R26)', () => {
    expect(routes.length).toBeGreaterThan(0);
    // R29: the drug's name is not an atom ('metformin' in the screen's question is the question).
    expect(routes.filter((r) => r.atoms.some((a) => /^(metformin|iohexol|prednisone|diphenhydramine)$/i.test(a))).map((r) => r.note)).toEqual([]);
    expect(sweep.filter((s) => s.lines.length === 0).map((s) => `${s.item} ${s.note}`)).toEqual([]);
    // The phrase starts at the first atom and ends at the last, on every deciding line.
    expect(sweep.filter((s) => s.lines.some((l) => !stretches(l, s.atoms).includes(comparable(s.phrase)))).map((s) => `${s.item} ${s.note} '${s.phrase}'`)).toEqual([]);
  });

  it.each(sweep.map((s) => [`${s.item} ${s.note} ${s.atoms.join(' + ')}`, s] as const))('%s: a snippet is seen exactly when it shows every atom', (_k, s) => {
    expect(s.rows.some((r) => r.seen), 'some word of the note shows every atom in a snippet').toBe(true);
    expect(s.rows.filter((r) => r.shown !== r.seen)).toEqual([]);
  });

  it.each(PINNED.map((p) => [`${p.item} ${p.note} ${p.atoms} '${p.query}'`, p] as const))('%s', (_k, p) => {
    const s = sweep.find((x) => x.item === p.item && x.note === p.note && x.atoms.join(' + ') === p.atoms)!;
    expect(s, p.why).toBeDefined();
    expect(s.rows.find((r) => r.query === p.query)?.seen, p.why).toBe(p.seen);
  });
});
