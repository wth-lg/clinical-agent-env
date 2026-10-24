// verifier-phase-snippet-2, after #33 (P11f (12)): a row's whole: true says a search_notes
// snippet is its note's whole text, so it exposes the note only in a search_notes result: another
// tool's payload (a write tool echoing its input, say) that holds a {note, snippet, whole: true}
// object cannot claim whole-note exposure.
import { describe, expect, it } from 'vitest';
import { callTool, type Tool } from '../registry.ts';

const NOTE = 'DocumentReference/doc-x';
const row = { note: NOTE, snippet: 'Patient seen today; plan unchanged.', whole: true };
const tool = (name: string, payload: unknown): Tool<null> => ({ name, description: name, inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false }, run: () => payload });
const run = (name: string, payload: unknown) => callTool([tool(name, payload)], name, {}, null);

describe('whole: true exposes a note only in a search_notes result (P11f (12))', () => {
  it('a write tool echoing a nested {note, snippet, whole: true} only references the note', () => {
    const r = run('write_note', { echo: { input: { rows: [row] } }, status: 'ok' });
    expect(r.exposed_ids).toEqual([]);
    expect(r.referenced_ids).toEqual([NOTE]);
    expect(r.shown).toEqual({ [NOTE]: row.snippet });
  });

  it('a search_notes row with whole: true still exposes its note; whole: false still references it', () => {
    expect(run('search_notes', { results: [row] })).toMatchObject({ exposed_ids: [NOTE], referenced_ids: [] });
    expect(run('search_notes', { results: [{ ...row, whole: false }] })).toMatchObject({ exposed_ids: [], referenced_ids: [NOTE] });
  });
});
