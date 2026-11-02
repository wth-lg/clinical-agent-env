// The atom sweep for T4 (coordinator rulings R26 and R29 as revised; verifier-W1-probe-T4-5 N1 and
// N2, verifier-W1-probe-T4-clinical-5 F1). Each record an item rests on, where a line of it decides
// the item, has atoms: the minimal deciding facts of that line, without the drug's name (expected.ts
// Item.atoms, and Item.also for a fact another record can show, R21). The gates count the record as
// seen when one read or one search snippet shows every atom (tests/grader.ts firstSeenBy). This test
// sweeps every snippet route: for each route (item, record, atoms), it runs the real search_notes,
// with the patient filter, for every word of the record's text, finds the record's row on any page,
// and asserts both directions for every row:
//   the snippet shows a deciding line from its first atom to its last  <=>  the gate counts it seen.
// A deciding line is a line of the record that holds every atom in order: one line, except in a fill
// history, where every fill line of the drug shows the fill. The left side is this test's own reading
// of the chart text (the stretch of the line, as the record writes it, inside the snippet); the right
// side is the gate's rule. So a snippet that shows two atoms out of their line's order, such as
// '…mg twice daily, not 40 mg daily' for '40 mg' then 'twice daily', is not seen.
// A snippet cut inside the drug's name ('…inopril: held for AKI. Resume home 20 mg daily when SCr <
// 1.3') shows every atom and is seen; a snippet that misses an atom is not, whatever else it shows
// (a 'potassium' snippet of Earnest Roberts' report shows 'Potassium 4.6' and is cut before
// 'Creatinine 1.08', so it shows no creatinine after discharge).
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
import { firstSeenBy } from './grader.ts';

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
type Route = { item: string; doc: string; patient: string; atoms: readonly string[] };

// Rows a later edit must keep as they are: the routes the gate rounds named, each by its query.
const PINNED: ReadonlyArray<{ item: string; doc: string; atoms: string; query: string; seen: boolean; why: string }> = [
  { item: 'roberts-lisinopril', doc: 'doc-t4-roberts-dc', atoms: 'Resume', query: 'labs', seen: true, why: 'verifier-W1-probe-T4-5 N1: cut inside the drug name, every atom shown' },
  { item: 'roberts-lisinopril', doc: 'doc-t4-roberts-dc', atoms: 'Resume', query: 'continue', seen: true, why: 'verifier-W1-probe-T4-4 N1' },
  { item: 'roberts-lisinopril', doc: 'doc-t4-roberts-lab', atoms: 'Potassium 4.6', query: 'potassium', seen: true, why: 'the potassium fact' },
  { item: 'roberts-lisinopril', doc: 'doc-t4-roberts-lab', atoms: 'Creatinine 1.08', query: 'potassium', seen: false, why: 'verifier-W1-probe-T4-clinical-5 F1: cut before the creatinine line' },
  { item: 'roberts-lisinopril', doc: 'doc-t4-roberts-lab', atoms: 'Creatinine 1.08', query: 'creatinine', seen: true, why: 'R21: the report route to the creatinine' },
  { item: 'kim-omeprazole', doc: 'doc-t4-kim-dc', atoms: 'pantoprazole', query: 'potassium', seen: true, why: 'verifier-W1-probe-T4-clinical-3 N1' },
];

describe('T4 decisive atoms: a snippet is seen exactly when it shows every atom (R29 sweep)', async () => {
  const world = await loadStore(matrixEnv().world);
  const ctx: ReadContext = { world, clock, policies: [], catalog: [] };
  const routes: Route[] = expected.items.flatMap((x) => {
    const patient = x.patient.split('/')[1]!;
    return x.decisive.flatMap((d) => [
      ...(x.atoms[d] ? [{ item: x.key, doc: d, patient, atoms: x.atoms[d]! }] : []),
      ...(x.also?.[d] ?? []).flatMap((s) => (s.atoms ? [{ item: x.key, doc: s.id, patient, atoms: s.atoms }] : [])),
    ]);
  });
  const textOf = (doc: string) => {
    const d = world.get('DocumentReference', doc.split('/')[1]!) as { content: Array<{ attachment: { data: string } }> };
    return new TextDecoder().decode(Uint8Array.from(atob(d.content[0]!.attachment.data), (c) => c.charCodeAt(0)));
  };
  // The record's row for a query with the patient filter, on whichever page it falls, as a step.
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
    const rows: Array<{ query: string; snippet: string; shown: boolean; seen: boolean }> = [];
    for (const q of words) {
      const hit = rowOf(e.doc, q, e.patient);
      if (hit === null) continue;
      const snip = comparable(hit.row.snippet.replace(/…/g, ' '));
      const shown = lines.some((l) => shows(l, e.atoms, snip));
      rows.push({ query: q, snippet: hit.row.snippet, shown, seen: firstSeenBy([hit.step], e.doc, e.atoms) !== null });
    }
    return { ...e, lines: lines.length, words: words.length, rows };
  });
  const planted = (doc: string) => expected.patients.flatMap((p) => [p.summary, p.addendum, p.lab, ...p.fills]).includes(doc) ? doc.split('/')[1]! : doc;
  console.log(
    ['item | record | atoms | words | rows | seen | not seen | mismatched', ...sweep.map((s) => `${s.item} | ${planted(s.doc)} | ${s.atoms.join(' + ')} | ${s.words} | ${s.rows.length} | ${s.rows.filter((r) => r.seen).length} | ${s.rows.filter((r) => !r.seen).length} | ${s.rows.filter((r) => r.shown !== r.seen).map((r) => r.query).join(', ') || '-'}`)].join('\n'),
  );

  it('every route has atoms, none names the drug, and one line of its record holds them (each fill line, in a fill history)', () => {
    expect(routes.filter((r) => r.atoms.length === 0).map((r) => r.item)).toEqual([]);
    // R29: the drug's name is not an atom (a fill line's name is: the fill is the fact).
    const named = routes.filter((r) => expected.items.find((x) => x.key === r.item)!.kind !== 'flag_fill' && r.atoms.some((a) => comparable(a).includes(comparable(expected.items.find((x) => x.key === r.item)!.ingredient))));
    expect(named.map((r) => r.item)).toEqual([]);
    const fill = (item: string) => expected.items.find((x) => x.key === item)!.kind === 'flag_fill';
    expect(sweep.filter((s) => (fill(s.item) ? s.lines < 1 : s.lines !== 1)).map((s) => `${s.item} ${s.doc} ${s.lines}`)).toEqual([]);
  });

  it.each(sweep.map((s) => [`${s.item} ${planted(s.doc)} ${s.atoms.join(' + ')}`, s] as const))('%s: a snippet is seen exactly when it shows every atom', (_k, s) => {
    expect(s.rows.some((r) => r.seen), 'some word of the record shows every atom in a snippet').toBe(true);
    expect(s.rows.filter((r) => r.shown !== r.seen)).toEqual([]);
  });

  it.each(PINNED.map((p) => [`${p.item} ${p.doc} ${p.atoms} '${p.query}'`, p] as const))('%s', (_k, p) => {
    const s = sweep.find((x) => x.item === p.item && x.doc === ref(`DocumentReference/${p.doc}` as Parameters<typeof ref>[0]) && x.atoms[0] === p.atoms)!;
    expect(s, p.why).toBeDefined();
    expect(s.rows.find((r) => r.query === p.query)?.seen, p.why).toBe(p.seen);
  });
});
