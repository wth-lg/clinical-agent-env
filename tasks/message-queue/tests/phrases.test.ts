// The atom sweep for T6 (coordinator rulings R26 and R29 as revised), on the model of
// tasks/discharge-medrec/tests/phrases.test.ts. A scanned outside report decides its item by a line
// of it, written as atoms: the minimal deciding facts of that line, without the drug's name
// (expected.ts Item.atoms). A report may have more than one deciding line, so its atoms are any-of
// sets. m3: the specimen was hemolyzed, shown by 'hemolyzed' on the condition line or by
// 'hemolysis' (that line's index, or the comment that the potassium may be falsely elevated by
// hemolysis). m5 and m8: the specimen was collected before the window, shown by the collected date
// or by a received or reported date before the window (each falls on or after the collection).
// m10: the specimen was collected inside the window, shown by the collected date alone (a later
// received or reported date does not place the collection inside it). The gates count the report as
// seen when one read or one search snippet holds every atom of one set, in order, as whole words
// (tests/grader.ts firstSeenBy, through seenStep). This test sweeps every snippet route: for each
// report it runs the real search_notes, with the patient filter, for every word of the report's
// text, finds the report's row on any page, and asserts both directions for every row:
//   the snippet shows a deciding line of one set from its first atom to its last  <=>  the gate counts it seen.
// The left side is this test's own reading of the chart text (the stretch of the line, as the report
// writes it, inside the snippet); the right side is the gate's rule. A snippet that misses an atom of
// every set is not seen, whatever else it shows: 'Potassium 5.9 H' says nothing of the specimen, and
// a cut '…ted: 08/19/2026 07:40' shows no collected date (the word is an atom, unlike the drug name
// T4's sweep lets a snippet cut).
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../../cli/matrix.ts';
import { clock } from '../../../packages/env/clock.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { READ_TOOLS, type ReadContext } from '../../../packages/env/tools/read/index.ts';
import { callTool } from '../../../packages/env/tools/registry.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { trajectory } from '../../../packages/grader/test/helpers.ts';
import { ITEMS } from '../expected.ts';
import { ref } from '../ids.ts';
import { seenStep } from './grader.ts';

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

type Row = { note: string; snippet: string };

// Rows a later edit must keep as they are: the routes the gate rounds and the policy test named.
const PINNED: ReadonlyArray<{ item: string; doc: string; query: string; seen: boolean; why: string }> = [
  { item: 'm3', doc: 'doc-t6-odum-0827', query: 'hemolyzed', seen: true, why: 'R12: the targeted rule-term search shows the hemolyzed specimen (discover.test)' },
  { item: 'm5', doc: 'doc-t6-park-1002', query: 'collected', seen: true, why: 'R26: the rule word of §1 shows the collection date (policy.test)' },
  { item: 'm8', doc: 'doc-t6-brooks-0412', query: 'collected', seen: true, why: 'R26: the rule word of §1 shows the collection date (policy.test)' },
  { item: 'm10', doc: 'doc-t6-price-0819', query: 'collected', seen: true, why: 'R26: the rule word of §1 shows the collection date (policy.test)' },
];

describe('T6 decisive atoms: a snippet is seen exactly when it shows every atom (R29 sweep)', async () => {
  const world = await loadStore(matrixEnv().world);
  const ctx: ReadContext = { world, clock, policies: [], catalog: [] };
  const routes = ITEMS.flatMap((x) => Object.entries(x.atoms).map(([doc, sets]) => ({ x, item: x.name, doc, patient: x.patient.split('/')[1]!, sets })));
  const textOf = (doc: string) => {
    const d = world.get('DocumentReference', doc.split('/')[1]!) as { content: Array<{ attachment: { data: string } }> };
    return new TextDecoder().decode(Uint8Array.from(atob(d.content[0]!.attachment.data), (c) => c.charCodeAt(0)));
  };
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
    const lines = textOf(e.doc).split('\n').map(comparable);
    // Per atom set, the lines of the report that hold it.
    const held = e.sets.map((atoms) => lines.filter((l) => stretches(l, atoms).length > 0));
    const words = [...new Set((textOf(e.doc).toLowerCase().match(WORD) ?? []) as string[])];
    const rows: Array<{ query: string; snippet: string; by: boolean[]; shown: boolean; seen: boolean }> = [];
    for (const q of words) {
      const hit = rowOf(e.doc, q, e.patient);
      if (hit === null) continue;
      const snip = comparable(hit.row.snippet.replace(/…/g, ' '));
      const by = e.sets.map((atoms, i) => held[i]!.some((l) => shows(l, atoms, snip)));
      rows.push({ query: q, snippet: hit.row.snippet, by, shown: by.some(Boolean), seen: seenStep(e.x, e.doc)([hit.step]) !== null });
    }
    return { ...e, lines: held.map((h) => h.length), words: words.length, rows };
  });
  console.log(
    [
      'item | record | atom set | lines | words | rows | shown by this set | seen | not seen | mismatched',
      ...sweep.flatMap((s) =>
        s.sets.map((atoms, i) => `${s.item} | ${s.doc.split('/')[1]} | ${atoms.join(' + ')} | ${s.lines[i]} | ${s.words} | ${s.rows.length} | ${s.rows.filter((r) => r.by[i]).length} | ${s.rows.filter((r) => r.seen).length} | ${s.rows.filter((r) => !r.seen).length} | ${s.rows.filter((r) => r.shown !== r.seen).map((r) => r.query).join(', ') || '-'}`),
      ),
    ].join('\n'),
  );

  it('every outside report an item rests on has atom sets, none names the drug, and a line of the report holds each set', () => {
    const reports = ITEMS.flatMap((x) => x.decisive.filter((d) => d.startsWith('DocumentReference/')).map((d) => `${x.name} ${d}`));
    expect(routes.map((r) => `${r.item} ${r.doc}`)).toEqual(reports);
    expect(routes.filter((r) => r.sets.length === 0 || r.sets.some((a) => a.length === 0)).map((r) => r.item)).toEqual([]);
    // R29: the drug's name is not an atom; the patient and the line fix it.
    expect(routes.filter((r) => r.sets.flat().some((a) => comparable(a).includes(r.x.drug))).map((r) => r.item)).toEqual([]);
    // 'hemolysis' is on two lines (the condition's index and the comment); every other set on one.
    expect(sweep.map((s) => `${s.item} ${s.lines.join(',')}`)).toEqual(['m3 1,2', 'm5 1,1,1', 'm8 1,1,1', 'm10 1']);
  });

  it.each(sweep.map((s) => [`${s.item} ${s.doc.split('/')[1]} ${s.sets.map((a) => a.join(' + ')).join(' | ')}`, s] as const))('%s: a snippet is seen exactly when it shows every atom of one set', (_k, s) => {
    expect(s.rows.some((r) => r.seen), 'some word of the report shows every atom in a snippet').toBe(true);
    expect(s.rows.some((r) => !r.seen), 'some word of the report shows a snippet that misses an atom').toBe(true);
    expect(s.rows.filter((r) => r.shown !== r.seen)).toEqual([]);
  });

  it.each(PINNED.map((p) => [`${p.item} ${p.doc} '${p.query}'`, p] as const))('%s', (_k, p) => {
    const s = sweep.find((x) => x.item === p.item && x.doc === ref(`DocumentReference/${p.doc}` as Parameters<typeof ref>[0]))!;
    expect(s, p.why).toBeDefined();
    expect(s.rows.find((r) => r.query === p.query)?.seen, p.why).toBe(p.seen);
  });
});
