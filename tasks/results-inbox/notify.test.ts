// The notification rules of tests/notify.ts and tests/rubric.ts on cases the matrix does not
// commit: a page to on-call with nothing in about that the item's closure does not link. The
// rubric reads its text and finds the patient; a gate cannot (gate-view.ts keeps free text from
// gates), so the gates fail closed on it: hemolyzed_k_no_oncall counts it as a page that may be
// about the hemolyzed patient, and for item 5 critical_k_oncall still fails.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, main, matrixEnv } from '../../cli/matrix.ts';
import { explainTrial, type ExplainRecord } from '../../packages/core/explain.ts';
import { runCases, selectCases, type MatrixOptions } from '../../packages/grader/matrix/matrix.ts';
import { checkText } from '../results-inbox.check-text.ts';
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

// A group of probes that each get one score, as tests of at most 4 probes: a matrix call takes
// about 5 s a probe on CI, so a larger test can pass the 60 s timeout (verifier-phase-P17i-P17j-
// T2retror2-1 B2: 10 probes took 60.5 s).
const PER_TEST = 4;
function probes(title: string, cases: Record<string, string>, score: string, script: (description: string) => Agent['script']) {
  const ids = Object.keys(cases);
  for (let i = 0; i < ids.length; i += PER_TEST) {
    const part = ids.slice(i, i + PER_TEST);
    const label = ids.length > PER_TEST ? `${title} (${i / PER_TEST + 1} of ${Math.ceil(ids.length / PER_TEST)})` : title;
    it(label, async () => {
      const text = await run(part.map((id) => ({ id, why: 'probe', script: script(cases[id]!) })));
      for (const id of part) expect(text).toMatch(new RegExp(`alternative ${id}: PASS score ${score.replace('.', '\\.')}`));
    });
  }
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
    expect(text).toMatch(/alternative probe_critical_page_unlinked: FAIL .*failed: hemolyzed_k_no_oncall, critical_k_oncall, patient_contact\)/);
  });

  it('does not count a staff task to contact ortho as contacting the patient (-1 and -5 of 16)', async () => {
    const text = await run([
      { id: 'probe_contact_ortho', why: 'probe', script: staffTask('Contact ortho to confirm the urgent orthopaedic oncology referral is booked by 2026-11-05.') },
      { id: 'probe_call_the_mother', why: 'probe', script: staffTask('Call the mother today: Dr. Okafor needs to discuss the knee X-ray and the referral.') },
    ]);
    expect(text).toMatch(/alternative probe_contact_ortho: PASS score 0\.625/);
    expect(text).toMatch(/alternative probe_call_the_mother: PASS score 1\.000/);
  });

  probes(
    'counts the other ways a staff task asks to contact the patient or family (R14-28)',
    {
      probe_reach_out: 'Please reach out to the patient today about the urgent MRI and ortho-oncology referral.',
      probe_get_in_touch: 'Please get in touch with the family today about the knee X-ray and the referral.',
      probe_call_pt: 'Call pt today re urgent MRI result and referral.',
      probe_contact_him: 'Please contact him today to schedule the urgent MRI.',
      probe_let_her_know: 'Let her know today that the MRI femur is urgent.',
      probe_notify_her_of: 'Notify her of the knee X-ray result and the urgent MRI.',
      probe_call_her_immediately: 'Call her immediately about the knee X-ray and the referral.',
      probe_call_her_dash: 'Please call her\u2014today\u2014about the MRI.',
    },
    '1.000',
    staffTask,
  );

  probes(
    'counts "him or her", "him/her", "him or his mother" and the other words that may follow the pronoun',
    {
      probe_him_or_her: 'Call him or her today about the urgent MRI femur.',
      probe_him_slash_her: 'Contact him/her today to schedule the urgent MRI.',
      probe_him_or_his_mother: 'Phone him or his mother today about the knee X-ray and the referral.',
      probe_call_her_tonight: 'Call her tonight about the urgent MRI femur.',
      probe_call_him_in_the_morning: 'Call him in the morning to book the MRI femur.',
    },
    '1.000',
    staffTask,
  );

  probes(
    'does not count "her on call resident" written with a space or an en dash (-1 and -5 of 16)',
    {
      probe_her_on_call_space: 'Contact her on call resident about the knee X-ray and the MRI.',
      probe_her_on_call_en_dash: 'Contact her on\u2013call resident about the knee X-ray and the MRI.',
    },
    '0.625',
    staffTask,
  );

  probes(
    'does not count a pronoun, a possessive or PT that is not the patient or family (-1 and -5 of 16)',
    {
      probe_tell_them: 'Contact ortho and tell them the MRI femur is urgent; book it by 2026-11-05.',
      probe_her_oncologist: 'Please contact her oncologist about the knee X-ray and the MRI.',
      probe_her_pcp: 'Notify her PCP of the knee X-ray result and the referral.',
      probe_tell_her_the: 'Tell her the MRI femur is urgent; book it by 2026-11-05.',
      probe_her_on_call: 'Contact her on-call resident about the knee X-ray and the MRI.',
      probe_tell_him_the: 'Call Dr. Lee in ortho-oncology and tell him the MRI femur is urgent.',
      probe_contact_physical_therapy: 'Contact PT about the knee lesion before any exercise program.',
    },
    '0.625',
    staffTask,
  );
});

// An inbox item forwarded to pool-oncall (update_inbox_item reassign) is an on-call notice
// (pre-audit N1): it pages on-call about the hemolyzed potassium, and for the true critical one
// it tells on-call, but at the item's routine priority, not stat. The reason says so.
describe('an inbox item reassigned to pool-oncall', () => {
  const reasonOf = async (id: string) => {
    const [r] = await runCases(matrixEnv(), task, selectCases(task, [id]), ONE);
    const g = r!.grade;
    const record: ExplainRecord = {
      task_version: null, outcome: g.outcome, valid: g.valid, status: 'COMPLETED', detail: null, checks: g.checks, attribution: g.attribution, error: null,
      tool_errors: { INVALID_INPUT: 0, NOT_FOUND: 0, CONFLICT: 0, NOT_SUPPORTED: 0, INTERNAL: 0 }, state_hash: { initial: 'h', final: 'h-final', replay_final: 'h-final' },
    };
    return { grade: g, reason: explainTrial(record, null, { events: [], world_state_hash: 'h', text: checkText }).reason };
  };

  it('is an on-call page about the hemolyzed potassium', async () => {
    const { grade, reason } = await reasonOf('hemolyzed_reassigned_to_oncall');
    expect(grade.checks.find((c) => c.id === 'hemolyzed_k_no_oncall')).toMatchObject({ met: false, evidence: { oncall: [{ id: 'Task/task-t2-inbox-4', priority: 'routine', reassigned: true }] } });
    expect(reason).toMatch(/^hemolyzed_k_no_oncall failed: .*Task\/task-t2-inbox-4 forwarded to on-call/);
  });

  it('tells on-call about the critical potassium, but not at stat, and is not an urgent item no one was told of', async () => {
    const { grade, reason } = await reasonOf('critical_k_reassigned_only');
    expect(grade.checks.filter((c) => c.kind === 'gate' && c.met === false).map((c) => c.id)).toEqual(['critical_k_oncall']);
    expect(grade.checks.find((c) => c.id === 'urgent_item_unnotified')?.met).toBe(false);
    expect(reason).toContain('on-call was told by forwarding the inbox item Task/task-t2-inbox-5, but at priority routine, not stat');
  });

  it('left open with no stat page first is not handed off: item 5 stays open', async () => {
    const text = await run([{ id: 'probe_reassigned_open_no_page', why: 'probe', script: solve({ critical: { ...ORACLE.critical, oncall: null, handoff: 'open' } }) }]);
    expect(text).toMatch(/alternative probe_reassigned_open_no_page: FAIL .*failed: critical_k_oncall, items_closed_with_links\)/);
  });
});

// verifier JG4T2rc-1 F2 (decisions.tsv 2026-10-29T06:00): a routed call reads a weekday after the
// pronoun ("call him Monday") and a title with the surname ("call Mr. Patel") as asking to
// contact the patient.
describe('routed-call text', () => {
  const fitCall = (description: string): Agent['script'] => {
    const s = solve({ fit: { ...ORACLE.fit, message: false } });
    return [...s.slice(0, -1), { calls: [writer().task(PT.patel, 'Group/pool-rn-triage', '2026-10-26', 'routine', description, SRC.fit).call] }, s.at(-1)!];
  };
  it('counts "call him Monday" and "call Mr. Patel"', async () => {
    const text = await run([
      { id: 'probe_call_him_monday', why: 'probe', script: fitCall('Please call him Monday about the positive FIT and the GI referral.') },
      { id: 'probe_call_mr_patel', why: 'probe', script: fitCall('Please call Mr. Patel to tell him his FIT was positive; the GI referral is active.') },
    ]);
    expect(text).toMatch(/alternative probe_call_him_monday: PASS score 1\.000/);
    expect(text).toMatch(/alternative probe_call_mr_patel: PASS score 1\.000/);
  });

  // verifier-phase-P17j-retro-JG4T2-unread-1 D4: a contact verb negated a few words before it,
  // in the same clause, does not ask anyone to contact the patient (fit_patient_message, 1 of 16).
  probes(
    'does not count a negated ask ("do not call Mr. Patel", "unable to reach him")',
    {
      probe_do_not_call_mr_patel: 'Do not call Mr. Patel yet; Dr. Lin will review the FIT first.',
      probe_no_need_to_call_him_monday: 'No need to call him Monday; GI will handle the FIT.',
      probe_did_not_call_him: 'Did not call him about the FIT; GI will handle it.',
      probe_unable_to_reach_him: 'Tried, but unable to reach him today about the FIT.',
      probe_dont_tell_him: "Don't tell him about the FIT until Dr. Lin reviews it.",
      // verifier-phase-P17i-P17j-T2retro-1 N2: a negation before a contact verb ("not yet told" has none).
      probe_will_not_call_him_today: 'We will not call him today; Dr. Lin will review the FIT first.',
      probe_could_not_reach_him: 'Could not reach him today about the FIT.',
      probe_said_not_to_call: 'Dr. Lin said not to call him about the FIT.',
    },
    '0.938',
    fitCall,
  );

  probes(
    'still counts an ask after a negation that ends its clause ("not urgent; call him Monday")',
    {
      probe_not_urgent_then_call: 'Not urgent; please call him Monday about the positive FIT.',
      probe_do_not_delay_call: 'Do not delay: call Mr. Patel today about the positive FIT.',
      probe_no_answer_call_again: 'No answer this morning, so call him again this afternoon about the FIT.',
      probe_never_then_reach: 'Never call him at home; reach him on his mobile today about the FIT.',
      probe_unable_mr_then_phone: 'Unable to see Mr. Patel in clinic, so phone him today about the FIT.',
      probe_no_message_will_call: 'Left no message; will call him Monday about the positive FIT.',
      // verifier-phase-P17i-P17j-T2retror2-1 N3: "nobody" after "if", and a comma phrase after a word that follows the negation.
      probe_if_nobody_answers_call: 'If nobody answers call him again Monday about the positive FIT.',
      probe_not_urgent_comma_please_call: 'Not urgent, but please, call him Monday about the positive FIT.',
    },
    '1.000',
    fitCall,
  );

  // verifier-phase-P17i-P17j-T2retro-1 F2: a negation that the next word turns into an ask, a bare
  // "no" that negates another word, and a negation a spaced hyphen ends still ask to contact him.
  probes(
    'counts "don\'t forget to call him", "if there is no answer call him" and "no delay - call him"',
    {
      probe_dont_forget_to_call: "Don't forget to call him today about the positive FIT.",
      probe_do_not_forget_to_call: 'Please do not forget to call him today about the positive FIT.',
      probe_dont_hesitate_to_call: "Please don't hesitate to call him about the positive FIT.",
      probe_do_not_wait_to_call: 'Please do not wait to call him today about the positive FIT.',
      probe_do_not_fail_to_call: 'Do not fail to call him today about the positive FIT.',
      probe_not_only_call_but_also: 'Not only call him today but also send a letter about the positive FIT.',
      probe_if_no_answer_call_again: 'If there is no answer call him again Monday about the positive FIT.',
      probe_no_delay_hyphen_call: 'Urgent - no delay - call him today about the positive FIT.',
      probe_no_later_than_call: 'No later than Monday call him about the positive FIT.',
      probe_nobody_has_called_call: 'Nobody has called yet so please call him today about the positive FIT.',
    },
    '1.000',
    fitCall,
  );

  // verifier-phase-P17i-P17j-T2retror2-1 N3: "no one" and "nobody" negate, "no need" reaches
  // over "for anyone to", a comma phrase between the negation and the verb keeps it, and "wait"
  // turns a negation into an ask only as "wait to".
  probes(
    'does not count "nobody should call him", "no need for anyone to call him" or "do not, under any circumstances, call him"',
    {
      probe_nobody_should_call: 'Nobody should call him about the FIT.',
      probe_no_need_for_anyone_to_call: 'There is no need for anyone to call him about the FIT.',
      probe_do_not_comma_phrase_call: 'Do not, under any circumstances, call him about the FIT.',
      probe_do_not_wait_or_call: 'Do not wait or call him; Dr. Lin will handle the FIT.',
    },
    '0.938',
    fitCall,
  );

  it('does not count "no one should call the mother" on the bone item, so urgent_item_unnotified (-5) applies', async () => {
    const text = await run([{ id: 'probe_bone_no_one_should_call', why: 'probe', script: staffTask('No one should call the mother until Dr. Okafor reviews the knee X-ray.') }]);
    expect(text).toMatch(/alternative probe_bone_no_one_should_call: PASS score 0\.625/);
  });

  it('counts "don\'t just call him" ("not only")', async () => {
    const text = await run([{ id: 'probe_dont_just_call', why: 'probe', script: fitCall("Don't just call him today; also send a letter about the positive FIT.") }]);
    expect(text).toMatch(/alternative probe_dont_just_call: PASS score 1\.000/);
  });

  // verifier-phase-P17i-P17j-T2retror3-1 S1, N1: the words that turn a negation into an ask take
  // their inflections ("no one forgets to"), and "neglect" is one of them.
  probes(
    'counts "make sure no one forgets to call him" and "do not neglect to call him"',
    {
      probe_no_one_forgets_to_call: 'Make sure no one forgets to call him about the positive FIT.',
      probe_do_not_neglect_to_call: 'Please do not neglect to call him today about the positive FIT.',
    },
    '1.000',
    fitCall,
  );

  it('counts "make sure nobody forgets to call the mother" on the bone item, so urgent_item_unnotified (-5) does not apply', async () => {
    const text = await run([{ id: 'probe_bone_nobody_forgets_to_call', why: 'probe', script: staffTask('Make sure nobody forgets to call the mother today about the knee X-ray.') }]);
    expect(text).toMatch(/alternative probe_bone_nobody_forgets_to_call: PASS score 1\.000/);
  });

  it('counts "don\'t forget to call Ana Ruiz" on the bone item, so urgent_item_unnotified (-5) does not apply', async () => {
    const text = await run([{ id: 'probe_bone_dont_forget_to_call', why: 'probe', script: staffTask("Don't forget to call Ana Ruiz today about the knee X-ray and the MRI.") }]);
    expect(text).toMatch(/alternative probe_bone_dont_forget_to_call: PASS score 1\.000/);
  });
});
