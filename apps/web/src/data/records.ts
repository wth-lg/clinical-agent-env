// The checks a published trial record and audit line pass before a view reads them: the fields
// the browse views and packages/core/explain.ts explainTrial read, with the types they read them
// as, and a task-validity review line's own fields. A record that fails shows as an error on its own row, so one bad file never blanks a view.
import type { AuditRow } from '../../../../packages/core/explain.ts';
import { OUTCOMES } from '../../../../packages/core/outcomes.ts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown) => typeof v === 'string';
const orNull = (ok: (v: unknown) => boolean) => (v: unknown) => v === null || ok(v);
const hashes = (v: unknown) => isObj(v) && orNull(str)(v.initial) && orNull(str)(v.final) && (v.replay_final === undefined || orNull(str)(v.replay_final));
const checks = (v: unknown) => Array.isArray(v) && v.every((c) => isObj(c) && str(c.id));
// Rule P-L's facts on a cap stop (packages/grader/progress.ts Progress).
const progress = (v: unknown) => isObj(v) && num(v.tail) && num(v.repeats) && num(v.new_writes) && typeof v.looping === 'boolean';

// Each problem as "<field> is missing" or "<field> is not <what>"; empty when the record is good.
export function validateRecord(x: unknown): string[] {
  if (!isObj(x)) return ['the file is not a JSON object'];
  const errors: string[] = [];
  const need = (k: string, ok: (v: unknown) => boolean, what: string) => {
    if (!Object.hasOwn(x, k) || x[k] === undefined) errors.push(`${k} is missing`);
    else if (!ok(x[k])) errors.push(`${k} is not ${what}`);
  };
  const may = (k: string, ok: (v: unknown) => boolean, what: string) => {
    if (x[k] !== undefined && !ok(x[k])) errors.push(`${k} is not ${what}`);
  };
  need('task_id', (v) => str(v) && v !== '', 'a task id');
  need('outcome', (v) => (OUTCOMES as readonly unknown[]).includes(v), `one of ${OUTCOMES.join(', ')}`);
  need('task_version', orNull(str), 'a string or null');
  need('state_hash', hashes, 'an object with initial and final hashes');
  need('cost_usd', num, 'a number');
  may('judge_cost_usd', orNull(num), 'a number');
  may('score', orNull(num), 'a number or null');
  may('index', (v) => Number.isSafeInteger(v) && (v as number) >= 0, 'a whole number');
  may('trajectory', str, 'a path');
  may('env_version', orNull(str), 'a string or null');
  may('checks', orNull(checks), 'a list of checks with ids');
  may('progress', orNull(progress), 'rule P-L facts (tail, repeats, new_writes, looping)');
  may('regrades', (v) => Array.isArray(v) && v.every((g) => isObj(g) && (OUTCOMES as readonly unknown[]).includes(g.outcome) && (g.checks === undefined || checks(g.checks))), 'a list of regrades');
  return errors;
}

// A task-validity review line (P17i C3, cli/audit-check.ts): one task's verdict on its
// consistency flag, beside the per-trial rows. It names a task, not a trial.
export const TASK_VALIDITY_VERDICTS = ['fair-trap', 'check-defect'] as const;
export interface TaskValidityReview {
  task: string;
  kind: 'task-validity';
  reviewer: string;
  verdict: (typeof TASK_VALIDITY_VERDICTS)[number];
  note: string;
}
const nonEmpty = (v: unknown) => str(v) && v.trim() !== '';

export function validateAuditRow(x: unknown): string[] {
  if (!isObj(x)) return ['the line is not a JSON object'];
  const errors: string[] = [];
  if (x.kind === 'task-validity') {
    if (!nonEmpty(x.task)) errors.push('task is missing');
    if (!nonEmpty(x.reviewer)) errors.push('reviewer is missing');
    if (!(TASK_VALIDITY_VERDICTS as readonly unknown[]).includes(x.verdict)) errors.push(`verdict is not ${TASK_VALIDITY_VERDICTS.join(' or ')}`);
    if (!str(x.note)) errors.push('note is not text');
    return errors;
  }
  if (!str(x.trial)) errors.push('trial is missing');
  if (!str(x.outcome)) errors.push('outcome is missing');
  if (x.evidence_ids !== undefined && !(Array.isArray(x.evidence_ids) && x.evidence_ids.every(str))) errors.push('evidence_ids is not a list of ids');
  // As cli/audit-check.ts readLabels reads it (verifier-phase-P17i-P17j-S3retror2-1 B1n).
  if (x.note !== undefined && x.note !== null && !str(x.note)) errors.push('note is not text');
  return errors;
}

// audit.jsonl's lines: the per-trial rows, the task-validity review lines, and a warning for each
// line that cannot be read.
export function readAudit(text: string): { rows: AuditRow[]; reviews: TaskValidityReview[]; warnings: string[] } {
  const out = { rows: [] as AuditRow[], reviews: [] as TaskValidityReview[], warnings: [] as string[] };
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch (e) {
      out.warnings.push(`audit.jsonl line ${i + 1} cannot be read: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const errors = validateAuditRow(row);
    if (errors.length > 0) out.warnings.push(`audit.jsonl line ${i + 1} cannot be read: ${errors.join('; ')}`);
    else if ((row as { kind?: unknown }).kind === 'task-validity') out.reviews.push(row as TaskValidityReview);
    else out.rows.push(row as AuditRow);
  });
  return out;
}
