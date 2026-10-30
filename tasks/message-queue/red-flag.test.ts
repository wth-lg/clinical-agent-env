// m3_red_flag's decisive id is the M3 item's focus, the message the red flag is in: the item is a
// list_inbox row, never exposed, so naming it would make every marked omission retrieval
// (tests/grader.ts, R14-12). The matrix checks each mutant's label.
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { M } from './expected.ts';
import { checks } from './tests/grader.ts';

const store = await loadStore(matrixEnv().world);
const gate = (id: string) => checks.find((c) => c.id === id)!;

describe('m3_red_flag', () => {
  it("names the M3 item's focus as its decisive id", () => {
    const item = store.get('Task', M.m3.item.split('/')[1]!) as { focus?: { reference?: string } } | undefined;
    expect(item?.focus?.reference).toBeDefined();
    expect(gate('m3_red_flag').decisive_ids).toEqual([item!.focus!.reference]);
  });
});
