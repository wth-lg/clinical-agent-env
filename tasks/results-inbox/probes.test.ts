// Grader rules of tests/grader.ts and tests/rubric.ts on scripts the matrix does not commit.
//   - Pilot-3 (results-inbox/1): a call task "URGENT clinician call TODAY to patient's mother/guardian"
//     tells the family of the urgent result, so urgent_item_unnotified does not apply
//     (verifier-phase-P17i-W0-3-pilot3-1 row 12; contact.test.ts holds the phrase rule).
//   - A page to on-call that carries no patient and that no item links cannot be placed by a gate
//     (gate-view.ts keeps free text from gates): it fails item_no_forbidden's outside part, closed
//     (decisions.tsv 2026-10-27T07:00), and no item (w1-probe-rulings R9).
//   - P17 exploit I2: an item closed before any of its results was read fails result_seen_before_action
//     on that item alone.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, main } from '../../cli/matrix.ts';
import type { MatrixOptions } from '../../packages/grader/matrix/matrix.ts';
import type { Agent, MatrixTask } from '../../packages/grader/matrix/types.ts';
import { solve } from './solution/solve.ts';
import { ITEM_READS, read, readsWithout, SRC } from './solution/steps.ts';

const task = await loadMatrixTask('results-inbox');
const ONE = { trials: 1, regrades: 1, isolation: false } as const satisfies MatrixOptions;

async function run(alternatives: Agent[]) {
  const lines: string[] = [];
  const over: Partial<MatrixTask> = { alternatives: [...task.alternatives, ...alternatives] };
  await main(['--task', task.id], { env: {}, out: (l) => lines.push(l), load: async () => ({ ...task, ...over }), options: { ...ONE, cases: alternatives.map((a) => a.id) } });
  return lines.join('\n');
}

describe('results-inbox probes', () => {
  it("counts the pilot-3 call task to the patient's mother as telling the family of the urgent result", async () => {
    const script = solve({ plans: { prelim_positive: { contact: null, more: (w) => [w.task('pt-0053', 'Group/pool-rn-triage', '2026-10-23', 'urgent', "URGENT clinician call TODAY to patient's mother/guardian", SRC.xr)] } } });
    const text = await run([{ id: 'probe_pilot3_call_mother', why: 'probe', script }]);
    expect(text).toMatch(/alternative probe_pilot3_call_mother: PASS score 1\.000/);
  });

  it('fails item_no_forbidden on a page with no patient that no item links', async () => {
    // The page names Walter Brennan only in its text; no gate can tell whose page it is.
    const script = solve({ plans: { hemolyzed_note: { more: (w) => [w.message('Group/pool-oncall', 'stat', 'Critical potassium', 'Walter Brennan: potassium 6.4 mmol/L, please review.', [])], links: (m) => m.slice(0, 2) } } });
    const text = await run([{ id: 'probe_unlinked_page', why: 'probe', script }]);
    expect(text).toMatch(/alternative probe_unlinked_page: FAIL .*failed: item_no_forbidden\)/);
  });

  it('fails the one item closed before its result was read', async () => {
    // The normal TSH closed without reading it: its read is dropped.
    const script = solve({ reads: readsWithout([read(SRC.tsh)]) });
    const text = await run([{ id: 'probe_tsh_unread', why: 'probe', script }]);
    // R14/R18: its result never seen fails decisive_seen; the closure before it, seen_before_change.
    expect(text).toMatch(/alternative probe_tsh_unread: FAIL .*failed: decisive_seen, result_seen_before_action, seen_before_change\)/);
    expect(ITEM_READS.normal_tsh).toEqual([read(SRC.tsh)]);
  });
});
