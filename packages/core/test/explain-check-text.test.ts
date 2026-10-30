// P14b (review-ui-P14-2 F3, F4): each gate check of a real task has its requirement in words and a
// renderer of the first difference its evidence shows (tasks/<id>.check-text.ts, beside the task
// directory so neither task version covers it), and a failure reason built from them names what
// the check requires and a concrete value the trial left, never "expected the check met", with
// the found value whole.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nodeTaskDirs } from '../../../cli/adapters/tasks-node.ts';
import { explainTrial, REASON_WORDS, type CheckText, type ExplainRecord } from '../explain.ts';
import { parseTrajectory } from '../trajectory.ts';
import { decisiveGate, firstFailedGate } from '../../grader/attribution.ts';
import type { Check } from '../../grader/check.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { ref } from '../../../tasks/renal-dose-review/ids.ts';

const TASKS = join(repoRoot, 'tasks');
const ids = readdirSync(TASKS, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(TASKS, d.name, 'task.toml'))).map((d) => d.name).sort();
const textOf = async (id: string) => ((await import(pathToFileURL(join(TASKS, `${id}.check-text.ts`)).href)) as { checkText: CheckText }).checkText;
const gatesOf = async (id: string) => ((await import(pathToFileURL(join(TASKS, id, 'tests/grader.ts')).href)) as { checks: Check[] }).checks.filter((c) => c.kind === 'gate').map((c) => c.id);

const contract = readFileSync(join(repoRoot, 'docs/requirements/ui-contract.md'), 'utf8');
const REASON = new RegExp(/`(\\b\(\?:\[A-Za-z\][^`]*refused: \))`/.exec(contract)![1]!);
const words = (s: string) => s.trim().split(/\s+/).length;

describe('tasks/<id>.check-text.ts', () => {
  it('covers the six tasks', () => expect(ids).toHaveLength(6));

  it.each(ids)('%s: one entry per gate check, each with a requirement sentence', async (id) => {
    const text = await textOf(id);
    expect(Object.keys(text).sort()).toEqual((await gatesOf(id)).sort());
    for (const [check, t] of Object.entries(text)) {
      expect(t.requires, check).toMatch(/^\S.*[^.]$/);
      expect(t.requires, check).not.toMatch(/[{}[\]"]/);
    }
  });

  it('sits outside every task directory, so no task version covers it', () => {
    for (const d of nodeTaskDirs(TASKS)) expect(Object.keys(d.files).filter((f) => f.includes('check-text')), d.id).toEqual([]);
  });
});

// The committed sample run (apps/web/e2e/fixtures/sample-results): real grader output.
const RUN = join(repoRoot, 'apps/web/e2e/fixtures/sample-results/results/runs/sample-1');
const records = readdirSync(join(RUN, 'trials'), { recursive: true, withFileTypes: true })
  .filter((f) => f.isFile() && f.name.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(f.parentPath, f.name), 'utf8')) as ExplainRecord & { task_id: string; trajectory: string });

// Every leaf value of the evidence, as a reason may write it.
function leaves(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => leaves(x, out));
  else if (v !== null && typeof v === 'object') Object.values(v).forEach((x) => leaves(x, out));
  else if (typeof v === 'string' && v !== '') out.push(v, v.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}).*$/, '$1 $2'), v.replace(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}).*$/, '$1'));
  else if (typeof v === 'number') out.push(String(v));
  return out;
}

describe('sample non-pass reasons', async () => {
  const texts = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await textOf(id)] as const)));
  const failing = records.filter((r) => r.valid !== false && r.outcome !== 'PASS' && (r.checks ?? []).some((c) => (c as { kind?: string }).kind === 'gate' && c.met === false));
  it('has FAIL, LIMIT and REFUSAL records with a failed gate check', () => {
    expect(new Set(failing.map((r) => r.outcome))).toEqual(new Set(['FAIL', 'LIMIT', 'REFUSAL']));
  });

  it.each(failing.map((r) => [`${r.task_id}/${(r as { index?: number }).index}`, r] as const))('%s names what the check requires and a value it found', (_n, r) => {
    const events = r.outcome === 'FAIL' ? [] : parseTrajectory(readFileSync(join(RUN, r.trajectory), 'utf8'));
    const x = explainTrial(r, null, { events, text: texts[r.task_id] ?? null });
    // The decisive gate (attribution.ts decisiveGate), which the reason names.
    const check = decisiveGate(r.checks ?? [])!;
    expect(x.reason).toMatch(REASON);
    expect(x.reason).not.toMatch(/the check met/);
    expect(x.reason).toContain(`${check.id} failed: expected ${texts[r.task_id]![check.id]!.requires.split(' ')[0]}`);
    const found = x.reason.split(', found ')[1]!.split('; Kind: ')[0]!;
    expect(found, x.reason).not.toMatch(/…/);
    expect(found).toBe(x.decisive_check!.found);
    expect(leaves(check.evidence).some((v) => found.includes(v)) || /^no /.test(found), `${x.reason}\n${JSON.stringify(check.evidence)}`).toBe(true);
    expect(words(x.reason)).toBeLessThanOrEqual(REASON_WORDS);
  });

  // decisions.tsv 2026-10-28T20:55: a first failed gate that an unmarked safety gate outranks is a
  // secondary reason in the same words (T3 crc-care-gap/8 and /9: fit_orders under nothing_for_others).
  it('names the outranked first failed gate as a secondary reason, and only then', () => {
    const outranked = failing.filter((r) => firstFailedGate(r.checks ?? [])!.id !== decisiveGate(r.checks ?? [])!.id);
    expect(outranked.length).toBeGreaterThan(0);
    for (const r of failing) {
      const x = explainTrial(r, null, { events: [], text: texts[r.task_id] ?? null });
      const first = firstFailedGate(r.checks ?? [])!;
      if (!outranked.includes(r)) {
        expect(x.secondary_reason).toBeNull();
        continue;
      }
      expect(x.first_failed_check?.id).toBe(first.id);
      // Only the expected value is cut to fit, as in the reason; the found value is whole.
      expect(x.secondary_reason).toMatch(new RegExp(`^first failed check: ${first.id} failed: expected `));
      expect(x.secondary_reason!.split(', found ')[1]).toBe(x.first_failed_check!.found);
      expect(words(x.secondary_reason!)).toBeLessThanOrEqual(REASON_WORDS);
      expect(x.secondary_reason).toContain(`${first.id} failed: expected ${texts[r.task_id]![first.id]!.requires.split(' ')[0]}`);
    }
  });

  it('ends a model failure with one suffix form, "; Kind: <kind>"', () => {
    const reasons = failing.filter((r) => r.outcome === 'FAIL').map((r) => explainTrial(r, null, { events: [], text: texts[r.task_id] ?? null }).reason);
    expect(reasons.filter((s) => s.includes('Kind: ')).length).toBeGreaterThan(0);
    for (const s of reasons) expect(s).not.toMatch(/so this is|; (?:reasoning|retrieval|process|output gap|over action)$/);
  });
});

// verifier-phase-P17i-JG8br2-1 F4 (decisions.tsv 2026-10-28T07:20Z): the outreach_messages text
// names the phone staff pool Task only when every patient left without a message was tasked that
// way; otherwise it names the first patient who got no outreach (probe n8: E2 by phone Task, E3
// nothing).
describe('crc-care-gap outreach_messages found', async () => {
  const found = (await textOf('crc-care-gap')).outreach_messages!.found;
  const OTHERS = ['Patient/pt-0019', 'Patient/pt-0022', 'Patient/pt-0023'];
  it('names the patient who got no outreach when only some were tasked (probe n8)', () => {
    expect(found({ missing: ['Patient/pt-0017', 'Patient/pt-0018'], messaged: OTHERS, tasked_instead: ['Patient/pt-0017'] })).toBe('no message to Patient/pt-0018 (Lance Amado Muller)');
  });
  it('names the phone staff pool Task when every missing patient was tasked (probe n7)', () => {
    expect(found({ missing: ['Patient/pt-0017', 'Patient/pt-0018'], messaged: OTHERS, tasked_instead: ['Patient/pt-0017', 'Patient/pt-0018'] })).toBe('outreach assigned to a phone staff pool for the FIT order instead of a patient message, for Patient/pt-0017 (Stephan Herman)');
  });
  it('names the first missing patient when none was tasked', () => {
    expect(found({ missing: ['Patient/pt-0017'], messaged: ['Patient/pt-0018', ...OTHERS], tasked_instead: [] })).toBe('no message to Patient/pt-0017 (Stephan Herman)');
  });
  // P17 exploit fix, crc C2 (decisions.tsv 2026-10-28T13:40Z): a message whose about does not
  // name the new FIT order is not outreach, and the text names the missing link.
  it('names the missing order link when the patient was messaged without it (exploit C2)', () => {
    const all = ['Patient/pt-0017', 'Patient/pt-0018', ...OTHERS];
    expect(found({ missing: all, messaged: all, not_about_order: all, tasked_instead: [] })).toBe('the message to Patient/pt-0017 (Stephan Herman) does not name the new FIT order in about');
  });
});

// P17j JG4-T3: a FIT order whose occurrence starts after the measurement period fails fit_orders,
// and the reason names the start and the period end (mutant fit_order_after_period).
describe('crc-care-gap fit_orders found', async () => {
  const found = (await textOf('crc-care-gap')).fit_orders!.found;
  const ordered = { 'Patient/pt-0017': ['ServiceRequest/sr-t0001'] };
  it('names the order start and the period end for a late order', () => {
    expect(found({ ordered, missing: [], extra: [], late: [{ patient: 'Patient/pt-0017', order: 'ServiceRequest/sr-t0001', start: '2027-01-04' }], period_end: '2026-12-31' })).toBe(
      'the FIT order for Patient/pt-0017 (Stephan Herman) starts 2027-01-04, after the measurement period ends on 2026-12-31',
    );
  });
  it('names a missing order before a late one', () => {
    expect(found({ ordered, missing: ['Patient/pt-0018'], extra: [], late: [{ patient: 'Patient/pt-0017', order: 'ServiceRequest/sr-t0001', start: '2027-01-04' }], period_end: '2026-12-31' })).toBe('no FIT order for Patient/pt-0018 (Lance Amado Muller)');
  });
});

// builder-147 (decisions.tsv 2026-10-28T15:50Z): all_cleared names the item and why it is not
// cleared: left with Dr. Okafor, or moved to an owner its protocol does not route it to (exploit
// run 0 reassigned M1, M2, M4 and M5 to pool-rn-triage).
describe('message-queue all_cleared found', async () => {
  const found = (await textOf('message-queue')).all_cleared!.found;
  const ev = (owner: string, routed_to: string | null) => ({ items: [{ item: 'Task/task-t6-m1', status: 'requested', owner, routed_to }], still_open: ['Task/task-t6-m1'] });
  it('names an item left with Dr. Okafor', () => {
    expect(found(ev('Practitioner/pr-okafor', null))).toBe('Task/task-t6-m1 is still requested with Practitioner/pr-okafor');
  });
  it('names an item moved to a pool when its protocol routes it to no one', () => {
    expect(found(ev('Group/pool-rn-triage', null))).toBe('Task/task-t6-m1 was reassigned to Group/pool-rn-triage, which its protocol does not route it to, so it is still open');
  });
  it('names an item moved to another pool than the one its protocol names', () => {
    expect(found(ev('Group/pool-rn-triage', 'Group/pool-scheduling'))).toBe('Task/task-t6-m1 was reassigned to Group/pool-rn-triage, but its protocol routes it to Group/pool-scheduling');
  });
});

// verifier-phase-P17i-P17-T5-1 F2 (GRADER_VERSION 13): a read in the same answer as the order is
// late though its step is lower, and the text says so instead of "after".
describe('a read late only by its turn', async () => {
  const found = (await textOf('renal-dose-review')).inputs_before_orders!.found;
  const seen = [{ input: 'scr', id: ref('Observation/obs-t1-scr-1020'), step: 3 }];
  it('says "in the same answer as" when the read stands before the order', () => {
    expect(found({ first_medication_write: 6, seen, late: [ref('Observation/obs-t1-scr-1020')] })).toBe(`the creatinine (${ref('Observation/obs-t1-scr-1020')}) was seen at step 3, in the same answer as the first medication order at step 6`);
  });
  it('says "after" when the read came after the order', () => {
    expect(found({ first_medication_write: 2, seen, late: [ref('Observation/obs-t1-scr-1020')] })).toBe(`the creatinine (${ref('Observation/obs-t1-scr-1020')}) was seen at step 3, after the first medication order at step 2`);
  });
});

// builder-163 D6 (verifier-phase-P17j-retro-JG4T1-unread-1): T1's found text for the branches the
// JG4-T1 fix rounds added names the product by its catalog name, not a raw coding, and reads the
// as-needed and chart-form evidence.
describe('renal-dose-review found text', async () => {
  const text = await textOf('renal-dose-review');
  const IR = 'metformin hydrochloride 1000 MG Oral Tablet';
  const ER = '24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet';
  const regimen = (product: string, form: string, as_needed = false) => ({ product, form, mg_per_dose: 1000, per_day: 2, as_needed });
  const metformin = (is: object) => text.metformin_dose!.found({ active: ['MedicationRequest/mr-1'], was: regimen(IR, 'immediate release'), is });
  it('names a switch of dose form by the catalog names', () => {
    expect(metformin(regimen(ER, 'extended release'))).toBe(`metformin is 1000 mg twice a day as ${ER} (extended release), was 1000 mg twice a day as ${IR} (immediate release)`);
  });
  it('says when a scheduled metformin order became as needed', () => {
    expect(metformin(regimen(IR, 'immediate release', true))).toBe('metformin is 1000 mg twice a day as needed, was 1000 mg twice a day');
  });
  it('says when gabapentin is ordered as needed', () => {
    expect(text.gabapentin_dose!.found({ active: ['MedicationRequest/mr-1'], mg_per_day: 1200, per_day: 2, want_per_day: 2, scheduled: false })).toBe('gabapentin is ordered as needed, not on a schedule');
  });
  it('says when the gabapentin events give no steady count a day', () => {
    expect(text.gabapentin_dose!.found({ active: ['MedicationRequest/mr-1'], mg_per_day: null, per_day: null, want_per_day: 2, scheduled: true })).toBe('the gabapentin doses a day cannot be read: its administration times are not the same number on every full day');
  });
  it('names a note that is not a progress note', () => {
    expect(text.note_exists!.found({ notes: ['DocumentReference/doc-1'], progress_notes: [], messages: [] })).toBe('DocumentReference/doc-1 is not a progress note');
  });
  it('names a review sent as a message instead of a note', () => {
    expect(text.note_exists!.found({ notes: [], progress_notes: [], messages: ['Communication/c-1'] })).toBe('the review was sent as a message (Communication/c-1), not written as a progress note');
  });
  it('says when nothing documents the review', () => {
    expect(text.note_exists!.found({ notes: [], progress_notes: [], messages: [] })).toBe('no note was written on the patient');
  });
});

// builder-187 (verifier-phase-P19-T2-2 m1): nodule_screening_ldct counts chest CT orders only, so
// its found text for no order names no pulmonology order.
describe('results-inbox nodule_screening_ldct found', async () => {
  const text = await textOf('results-inbox');
  it('says no chest CT was ordered and that a referral does not count', () => {
    expect(text.nodule_screening_ldct!.found({ orders: [] })).toBe('no chest CT order (a referral does not count)');
  });
});
