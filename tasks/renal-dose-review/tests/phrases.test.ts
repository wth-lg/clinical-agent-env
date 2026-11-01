// The atom sweep for T1 (coordinator rulings R26 and R29 as revised; the model is
// tasks/discharge-medrec/tests/phrases.test.ts). A snippet-visible record that decides an item has
// atoms: the minimal facts of its deciding line, without the item's drug. On the five-patient list
// no base item turns on a note; the two outside documents that arrive mid-trial on pt-0002's chart
// do (events.ts): the dermatology letter, atom 'itraconazole' (an amend), and the urgent care note,
// atom 'clarithromycin' (a lure). The event gates count an arrival seen when a later step exposed it
// or showed one of its texts holding every atom (tests/grader.ts seenAfter). This test puts the two
// documents in the store as an arrival does, runs the real search_notes, with the patient filter, for
// every word of each text, finds the document's row on any page, and asserts both directions for
// every row:
//   the snippet shows a deciding line from its first atom to its last  <=>  the gate counts it seen.
// A deciding line is a line of the record that holds every atom in order. The left side is this
// test's own reading of the text; the right side is the gate's rule. It also asserts that no other
// note on pt-0002's chart names either drug, so each document is the only record that shows its
// fact (rulings R21: no any-of route the gate would miss).
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../../cli/matrix.ts';
import { clock } from '../../../packages/env/clock.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { READ_TOOLS, type ReadContext } from '../../../packages/env/tools/read/index.ts';
import { callTool } from '../../../packages/env/tools/registry.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { trajectory } from '../../../packages/grader/test/helpers.ts';
import { EVENT_EXPECT } from '../expected.ts';
import { SPECS } from '../events.ts';
import { seenAfter } from './grader.ts';

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
type Route = { patient: string; doc: string; atoms: readonly string[] };

// Rows a later edit must keep as they are, each by its query.
const PINNED: ReadonlyArray<{ doc: string; query: string; seen: boolean; why: string }> = [
  { doc: 'doc-00301', query: 'itraconazole', seen: true, why: 'the targeted route: a search for the drug (rulings R12)' },
  { doc: 'doc-00302', query: 'clarithromycin', seen: true, why: 'the targeted route: a search for the drug (rulings R12)' },
];

const world = await loadStore(matrixEnv().world);
// The documents with atoms, put in the store as their arrival does.
const ARRIVALS = SPECS.filter((s) => EVENT_EXPECT[s.id]!.atoms !== undefined).map((s) => ({ spec: s, doc: `DocumentReference/${s.resources[0]!.id}`, atoms: EVENT_EXPECT[s.id]!.atoms!, patient: s.item.slice('Patient/'.length) }));
const before = new Map(ARRIVALS.map((a) => [a.doc, world.get('DocumentReference', a.spec.resources[0]!.id!)]));
for (const a of ARRIVALS) for (const r of a.spec.resources) world.put(r);
const ctx: ReadContext = { world, clock, policies: [], catalog: [] };
const textOf = (doc: string) => {
  const d = world.get('DocumentReference', doc.split('/')[1]!) as { content: Array<{ attachment: { data: string } }> };
  return new TextDecoder().decode(Uint8Array.from(atob(d.content[0]!.attachment.data), (c) => c.charCodeAt(0)));
};
const searchAll = (query: string, patient: string) => {
  const rows: Array<{ row: Row; input: object; content: string; exposed: string[]; referenced: string[] }> = [];
  for (let offset = 0; ; ) {
    const input = { query, patient, count: 20, offset };
    const r = callTool(READ_TOOLS, 'search_notes', input, ctx);
    const page = (typeof r.content === 'string' ? JSON.parse(r.content) : r.content) as { entries?: Row[]; next_offset?: number };
    for (const row of page.entries ?? []) rows.push({ row, input, content: r.content as string, exposed: r.exposed_ids ?? [], referenced: r.referenced_ids ?? [] });
    if (page.next_offset === undefined) return rows;
    offset = page.next_offset;
  }
};
const sameDoc = (doc: string, note: string) => note === doc || doc.endsWith(`/${note}`);
// The record's row for a query with the patient filter, on whichever page it falls, as a step.
const rowOf = (doc: string, query: string, patient: string) => {
  const hit = searchAll(query, patient).find((h) => sameDoc(doc, h.row.note));
  if (hit === undefined) return null;
  return { row: hit.row, step: stepsOf(trajectory([{ name: 'search_notes', input: hit.input, content: hit.content, exposed: hit.exposed, referenced: hit.referenced }]))[0]! };
};

const routes: Route[] = ARRIVALS.map((a) => ({ patient: a.patient, doc: a.doc, atoms: a.atoms }));
const sweep = routes.map((e) => {
  const lines = textOf(e.doc).split('\n').map(comparable).filter((l) => stretches(l, e.atoms).length > 0);
  const words = [...new Set((textOf(e.doc).toLowerCase().match(WORD) ?? []) as string[])];
  const rows: Array<{ query: string; snippet: string; shown: boolean; seen: boolean }> = [];
  for (const q of words) {
    const hit = rowOf(e.doc, q, e.patient);
    if (hit === null) continue;
    const snip = comparable(hit.row.snippet.replace(/…/g, ' '));
    rows.push({ query: q, snippet: hit.row.snippet, shown: lines.some((l) => shows(l, e.atoms, snip)), seen: seenAfter(e.doc, e.atoms)([hit.step], 0) !== null });
  }
  return { ...e, lines: lines.length, words: words.length, rows };
});
const key = (doc: string) => doc.slice('DocumentReference/'.length);
console.log(
  ['patient | record | atoms | words | rows | seen | not seen | mismatched', ...sweep.map((s) => `${s.patient} | ${key(s.doc)} | ${s.atoms.join(' + ')} | ${s.words} | ${s.rows.length} | ${s.rows.filter((r) => r.seen).length} | ${s.rows.filter((r) => !r.seen).length} | ${s.rows.filter((r) => r.shown !== r.seen).map((r) => `${r.query} (shown ${r.shown}, seen ${r.seen})`).join(', ') || '-'}`)].join('\n'),
);

describe('T1 arrival atoms: a snippet is seen exactly when it shows every atom (R29 sweep)', () => {
  it('the two outside documents are the snippet-visible arrivals, new to the world; their atoms name no DOAC, and one line of each holds them', () => {
    expect(routes.map((r) => `${r.patient} ${key(r.doc)}`)).toEqual(['pt-0002 doc-00301', 'pt-0002 doc-00302']);
    expect([...before.values()]).toEqual([undefined, undefined]);
    expect(routes.filter((r) => r.atoms.length === 0 || r.atoms.some((a) => /apixaban|rivaroxaban/i.test(a)))).toEqual([]);
    expect(sweep.map((s) => s.lines)).toEqual([1, 1]);
  });

  it.each(sweep.map((s) => [`${s.patient} ${key(s.doc)} ${s.atoms.join(' + ')}`, s] as const))('%s: a snippet is seen exactly when it shows every atom', (_k, s) => {
    expect(s.rows.some((r) => r.seen), 'some word of the record shows every atom in a snippet').toBe(true);
    expect(s.rows.some((r) => !r.seen), 'some word of the record shows a snippet without the atoms').toBe(true);
    expect(s.rows.filter((r) => r.shown !== r.seen)).toEqual([]);
  });

  it.each(PINNED.map((p) => [`${p.doc} '${p.query}'`, p] as const))('%s', (_k, p) => {
    const s = sweep.find((x) => x.doc === `DocumentReference/${p.doc}`)!;
    expect(s, p.why).toBeDefined();
    expect(s.rows.find((r) => r.query === p.query)?.seen, p.why).toBe(p.seen);
  });

  it("no other note on pt-0002's chart names itraconazole or clarithromycin (rulings R21: each document is the only route to its fact)", () => {
    // search_notes returns a note only when it holds the word.
    const hits = ['itraconazole', 'clarithromycin'].flatMap((w) => searchAll(w, 'pt-0002').map((h) => `${w} ${h.row.note}`));
    expect(hits).toEqual(['itraconazole DocumentReference/doc-00301', 'clarithromycin DocumentReference/doc-00302']);
  });
});
