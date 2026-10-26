// The notification rules of tests/notify.ts and tests/rubric.ts on cases the matrix does not
// commit: a page to on-call with nothing in about that the item's closure does not link. The
// rubric reads its text and finds the patient; a gate cannot (gate-view.ts keeps free text from
// gates), so the gates fail closed on it: hemolyzed_k_no_oncall counts it as a page that may be
// about the hemolyzed patient, and for item 5 critical_k_oncall still fails.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, main } from '../../cli/matrix.ts';
import type { MatrixOptions } from '../../packages/grader/matrix/matrix.ts';
import type { Agent, MatrixTask } from '../../packages/grader/matrix/types.ts';
import { ORACLE, solve } from './solution/solve.ts';
import { PT, SRC, writer } from './solution/steps.ts';

const task = await loadMatrixTask('results-inbox');
const ONE = { trials: 1, regrades: 1, isolation: false } as const satisfies MatrixOptions;

async function run(alternatives: Agent[]) {
  const lines: string[] = [];
  const over: Partial<MatrixTask> = { alternatives: [...task.alternatives, ...alternatives] };
  await main(['--task', task.id], { env: {}, out: (l) => lines.push(l), load: async () => ({ ...task, ...over }), options: { ...ONE, cases: alternatives.map((a) => a.id) } });
  return lines.join('\n');
}

// The oracle with no message to the Ruiz family, plus a task for the RN triage pool about Tomás.
// Unless the task asks to contact the family, item 6 loses bone_patient_message and is an
// urgent item no one was told of (urgent_item_unnotified).
function staffTask(description: string): Agent['script'] {
  const s = solve({ bone: { ...ORACLE.bone, message: false } });
  const t = writer().task(PT.ruiz, 'Group/pool-rn-triage', '2026-10-23', 'urgent', description, SRC.xr);
  return [...s.slice(0, -1), { calls: [t.call] }, s.at(-1)!];
}

describe('results-inbox notifications', () => {
  it('fails the hemolyzed item on an on-call page that carries no patient and that no item links', async () => {
    // Item 4 links its repeat order and the patient message, not the page, and the page names
    // Brennan only in its text: no gate can tell whose page it is, so hemolyzed_k_no_oncall fails
    // closed (decisions.tsv 2026-10-27T07:00; before, the trial passed at 0.800).
    const text = await run([{ id: 'probe_hemolyzed_page_unlinked', why: 'probe', script: solve({ hemolyzed: { ...ORACLE.hemolyzed, oncall: true, oncallAbout: [] }, links: { 4: (m) => [m[0]!, m[2]!] } }) }]);
    expect(text).toMatch(/alternative probe_hemolyzed_page_unlinked: FAIL .*failed: hemolyzed_k_no_oncall\)/);
  });

  it('cannot see an unlinked page with no patient from a gate, and fails closed on it', async () => {
    const text = await run([{ id: 'probe_critical_page_unlinked', why: 'probe', script: solve({ critical: { ...ORACLE.critical, oncallAbout: [] }, links: { 5: (m) => [m[1]!] } }) }]);
    expect(text).toMatch(/alternative probe_critical_page_unlinked: FAIL .*failed: hemolyzed_k_no_oncall, critical_k_oncall\)/);
  });

  it('does not count a staff task to contact ortho as contacting the patient (-1 and -5 of 15)', async () => {
    const text = await run([
      { id: 'probe_contact_ortho', why: 'probe', script: staffTask('Contact ortho to confirm the urgent orthopaedic oncology referral is booked by 2026-11-05.') },
      { id: 'probe_call_the_mother', why: 'probe', script: staffTask('Call the mother today: Dr. Okafor needs to discuss the knee X-ray and the referral.') },
    ]);
    expect(text).toMatch(/alternative probe_contact_ortho: PASS score 0\.600/);
    expect(text).toMatch(/alternative probe_call_the_mother: PASS score 1\.000/);
  });

  it('counts the other ways a staff task asks to contact the patient or family (R14-28)', async () => {
    const asks = {
      probe_reach_out: 'Please reach out to the patient today about the urgent MRI and ortho-oncology referral.',
      probe_get_in_touch: 'Please get in touch with the family today about the knee X-ray and the referral.',
      probe_call_pt: 'Call pt today re urgent MRI result and referral.',
      probe_contact_him: 'Please contact him today to schedule the urgent MRI.',
    };
    const text = await run(Object.entries(asks).map(([id, description]) => ({ id, why: 'probe', script: staffTask(description) })));
    for (const id of Object.keys(asks)) expect(text).toMatch(new RegExp(`alternative ${id}: PASS score 1\\.000`));
  });

  it('does not count a pronoun that is not about the patient or family (-1 and -5 of 15)', async () => {
    const text = await run([{ id: 'probe_tell_them', why: 'probe', script: staffTask('Contact ortho and tell them the MRI femur is urgent; book it by 2026-11-05.') }]);
    expect(text).toMatch(/alternative probe_tell_them: PASS score 0\.600/);
  });
});
