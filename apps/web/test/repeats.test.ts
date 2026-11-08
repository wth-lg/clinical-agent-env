// Repeated reasons in a Runs list (P25c, Runs minor): a later row of the same task with the same
// reason names the first row that shows it, so the sentence appears once per group.
import { describe, expect, it } from 'vitest';
import { repeatedReasons } from '../src/runs/repeats.ts';

const row = (name: string, task: string, reason: string, faulted = true, lead: string | null = null) => ({ name, task, reason, faulted, lead });

describe('repeatedReasons', () => {
  it('maps each later row to the first row of its task with the same reason', () => {
    const rows = [row('a/0', 'a', 'x failed'), row('a/1', 'a', 'y failed'), row('a/2', 'a', 'x failed'), row('b/0', 'b', 'x failed'), row('b/1', 'b', 'x failed')];
    expect([...repeatedReasons(rows)]).toEqual([['a/2', 'a/0'], ['b/1', 'b/0']]);
  });
  it('ignores rows that show no reason', () => {
    const rows = [row('a/0', 'a', 'x failed', false), row('a/1', 'a', 'x failed'), row('a/2', 'a', 'x failed')];
    expect([...repeatedReasons(rows)]).toEqual([['a/2', 'a/1']]);
  });
  // verifier-1 addendum 3 (G2): final-1 crc-care-gap/6 and /12 share the grader sentence, but
  // their plain leads name different windows (2026-01-01 and 2024-01-01), so "Same reason as
  // crc-care-gap/6" under /12 read as false. Rows group only when the lead matches too, step
  // numbers aside; contrast-ct-prep/0 and /1 differ only in their steps and still group.
  it('keeps crc-care-gap/6 and /12 apart: the same grader sentence under leads with different dates', () => {
    const reason = 'fit_orders failed: expected one new FIT kit order for each patient with a screening gap, found a FIT order for Patient/pt-0009 (Elly Shyla Trantow) without a complete screening review ever made; Kind: retrieval';
    const lead = (step: number, from: string) => `Missed a record it needed: the model wrote a FIT order for Patient/pt-0009 (Elly Shyla Trantow) at step ${step} without a complete review of the patient's results from ${from} on, the records that decide the order.`;
    const rows = [row('crc-care-gap/6', 'crc-care-gap', reason, true, lead(84, '2026-01-01')), row('crc-care-gap/12', 'crc-care-gap', reason, true, lead(86, '2024-01-01'))];
    expect([...repeatedReasons(rows)]).toEqual([]);
  });
  it('groups rows whose leads differ only in step numbers', () => {
    const reason = 'event_seen failed: expected each result or report that arrived during the trial opened, found Patient/pt-0047 (Britt Vincenzo Mohr, 08:00)';
    const lead = (a: number, b: number) => `Missed a record it needed: new results for Patient/pt-0047 (Britt Vincenzo Mohr, 08:00) arrived at step ${a}. The model opened Observation/obs-07502 at step ${b} and never opened Observation/obs-07501.`;
    const rows = [row('contrast-ct-prep/0', 'contrast-ct-prep', reason, true, lead(52, 75)), row('contrast-ct-prep/1', 'contrast-ct-prep', reason, true, lead(52, 76)), row('contrast-ct-prep/2', 'contrast-ct-prep', reason, true, lead(57, 80))];
    expect([...repeatedReasons(rows)]).toEqual([['contrast-ct-prep/1', 'contrast-ct-prep/0'], ['contrast-ct-prep/2', 'contrast-ct-prep/0']]);
  });
});
