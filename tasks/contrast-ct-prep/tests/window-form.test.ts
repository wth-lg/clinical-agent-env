// The forms of creatinine window that reach creatinine_before_scan. order_service refuses a
// window whose start and end differ in form (packages/env/tools/write/service.ts), so a window
// that ends at the scan instant is all-dateTime (alternative creatinine_window_ends_at_scan); a
// date-form window ending on the scan's date covers the whole day, scan time included, and
// still fails, as does a single dateTime at the scan instant (mutant creatinine_at_scan_instant)
// or a zero-width window at it.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import type { TrialEvent } from '../../../packages/core/events.ts';
import { gradeRun, trial } from '../../../packages/grader/matrix/matrix.ts';
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { creatinineOrder, ct, diphenhydramine, DONE, finish, message, note, prednisone, READS } from '../solution/steps.ts';

const task = await loadMatrixTask('contrast-ct-prep');
const env = matrixEnv();
const gate = task.checks.filter((c) => c.id === 'creatinine_before_scan');

const withCreatinine = (start: string, end: string | null): Script => [
  ...READS,
  { calls: [ct(), creatinineOrder(start, end)] },
  { calls: [prednisone, diphenhydramine] },
  { calls: [message()] },
  { calls: [note()] },
  { calls: [finish(DONE)] },
];

async function probe(id: string, script: Script) {
  const run = await trial(env, task, { kind: 'alternative', id, script });
  const grade = await gradeRun(env, task, gate, run);
  const orders = run.events.filter((e): e is Extract<TrialEvent, { type: 'tool_result' }> => e.type === 'tool_result' && e.name === 'order_service');
  return { orders, met: grade.checks.find((c) => c.id === 'creatinine_before_scan')?.met };
}

describe('contrast-ct-prep creatinine window forms', () => {
  it('refuses a window from a date to the scan dateTime, so no creatinine is ordered', async () => {
    const { orders, met } = await probe('mixed_form', withCreatinine('2026-10-23', '2026-10-26T09:00:00-04:00'));
    const refused = orders.filter((o) => o.is_error);
    expect(refused).toHaveLength(1);
    expect(refused[0]!.error_code).toBe('INVALID_INPUT');
    expect(JSON.stringify(refused[0]!.content)).toContain("'occurrence_end' must have the same form as 'occurrence_start'");
    expect(met).toBe(false);
  });

  it('passes an all-dateTime window that ends at the scan instant', async () => {
    expect((await probe('ends_at_scan', withCreatinine('2026-10-23T10:00:00-04:00', '2026-10-26T09:00:00-04:00'))).met).toBe(true);
  });

  it('fails a date window that ends on the scan date', async () => {
    const { orders, met } = await probe('date_ends_on_scan_date', withCreatinine('2026-10-23', '2026-10-26'));
    expect(orders.every((o) => !o.is_error)).toBe(true);
    expect(met).toBe(false);
  });

  it('fails a zero-width window that starts and ends at the scan instant', async () => {
    expect((await probe('zero_width_at_scan', withCreatinine('2026-10-26T09:00:00-04:00', '2026-10-26T09:00:00-04:00'))).met).toBe(false);
  });

  it('fails a creatinine due at the scan instant', async () => {
    expect((await probe('at_scan_instant', withCreatinine('2026-10-26T09:00:00-04:00', null))).met).toBe(false);
  });
});
