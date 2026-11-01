// The atom sweep for T3 (coordinator rulings R26 and R29 as revised; the model is
// tasks/discharge-medrec/tests/phrases.test.ts). Since the PW4-E3 list cut no base member's decision
// rests on a note, and the one snippet-visible deciding phrase is in an arrival: the Harbor
// laboratory's faxed notice (events.ts crc-o1), whose atoms are 'another patient' (events.ts
// NOTICE_ATOMS). The notice is longer than one snippet, so no search_notes row exposes it whole:
// only a snippet that shows the atoms can stand for a read.
//
// The event gates count the notice as seen when one read or one search snippet of it shows every
// atom on one line (tests/grader.ts arrivalSeenAt). This test puts the notice in the world as the
// event does, runs the real search_notes, with the patient filter, for every word of its text, finds
// its row on any page, and asserts both directions for every row:
//   the snippet shows the deciding line from its first atom to its last  <=>  the gate counts it seen.
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../../cli/matrix.ts';
import { clock } from '../../../packages/env/clock.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { Store } from '../../../packages/env/store.ts';
import { READ_TOOLS, type ReadContext } from '../../../packages/env/tools/read/index.ts';
import { callTool } from '../../../packages/env/tools/registry.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { trajectory } from '../../../packages/grader/test/helpers.ts';
import { HARBOR_NOTICE, NOTICE_ATOMS, SPECS } from '../events.ts';
import { arrivalSeenAt } from './grader.ts';

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
const NOTICE = 'DocumentReference/doc-e3-6804';
const PATIENT = 'pt-0024';

// Rows a later edit must keep as they are, each by its query.
const PINNED: ReadonlyArray<{ query: string; seen: boolean; why: string }> = [
  { query: 'labelling', seen: true, why: "alternative notice_by_snippet: the snippet runs from the labelling error through 'belongs to another patient'" },
  { query: 'patient', seen: false, why: "the first match is the 'Patient:' line of the header, and the snippet ends before the deciding line" },
  { query: 'withdrawn', seen: true, why: 'the snippet starts before the deciding line, which ends just before the match' },
];

describe('T3 decisive atoms: a snippet of the Harbor notice is seen exactly when it shows every atom (R29 sweep)', async () => {
  const base = await loadStore(matrixEnv().world);
  const notice = SPECS.find((s) => s.id === 'crc-o1')!.resources[0]!;
  // The notice as the event puts it, stamped as an arrival would be.
  const world = new Store([...base.resources(), { ...notice, date: '2026-10-23T08:00:00.002-04:00' } as typeof notice]);
  const ctx: ReadContext = { world, clock, policies: [], catalog: [] };
  // The notice's row for a query with the patient filter, on whichever page it falls, as a step.
  const rowOf = (query: string) => {
    for (let offset = 0; ; ) {
      const input = { query, patient: PATIENT, count: 20, offset };
      const r = callTool(READ_TOOLS, 'search_notes', input, ctx);
      const page = (typeof r.content === 'string' ? JSON.parse(r.content) : r.content) as { entries?: Row[]; next_offset?: number };
      const row = (page.entries ?? []).find((e) => e.note === NOTICE);
      if (row) return { row, step: stepsOf(trajectory([{ name: 'search_notes', input, content: r.content as string, exposed: r.exposed_ids ?? [], referenced: r.referenced_ids ?? [] }]))[0]! };
      if (page.next_offset === undefined) return null;
      offset = page.next_offset;
    }
  };

  const lines = HARBOR_NOTICE.split('\n').map(comparable).filter((l) => stretches(l, NOTICE_ATOMS).length > 0);
  const words = [...new Set((HARBOR_NOTICE.toLowerCase().match(WORD) ?? []) as string[])];
  const rows: Array<{ query: string; snippet: string; whole: boolean; shown: boolean; seen: boolean }> = [];
  for (const q of words) {
    const hit = rowOf(q);
    if (hit === null) continue;
    const snip = comparable(hit.row.snippet.replace(/…/g, ' '));
    rows.push({ query: q, snippet: hit.row.snippet, whole: hit.row.whole === true, shown: lines.some((l) => shows(l, NOTICE_ATOMS, snip)), seen: arrivalSeenAt([hit.step], 0, [NOTICE]) !== null });
  }
  console.log([
    `notice | atoms | words | rows | whole | shown | seen | mismatched`,
    `doc-e3-6804 | ${NOTICE_ATOMS.join(' + ')} | ${words.length} | ${rows.length} | ${rows.filter((r) => r.whole).length} | ${rows.filter((r) => r.shown).length} | ${rows.filter((r) => r.seen).length} | ${rows.filter((r) => r.shown !== r.seen).map((r) => r.query).join(', ') || '-'}`,
  ].join('\n'));

  it('the notice has atoms on exactly one line, is found by its words, and never fits in one snippet', () => {
    expect(lines).toHaveLength(1);
    expect(rows.length).toBeGreaterThan(words.length / 2);
    expect(rows.filter((r) => r.whole).map((r) => r.query)).toEqual([]);
  });

  it('a snippet is seen exactly when it shows every atom', () => {
    expect(rows.some((r) => r.shown), 'some word of the notice shows every atom in a snippet').toBe(true);
    expect(rows.some((r) => !r.shown), 'some word of the notice shows a snippet without them').toBe(true);
    expect(rows.filter((r) => r.shown !== r.seen).map((r) => ({ query: r.query, shown: r.shown, seen: r.seen, snippet: r.snippet }))).toEqual([]);
  });

  it.each(PINNED.map((p) => [`'${p.query}'`, p] as const))('%s', (_k, p) => {
    expect(rows.find((r) => r.query === p.query)?.seen, p.why).toBe(p.seen);
  });
});
