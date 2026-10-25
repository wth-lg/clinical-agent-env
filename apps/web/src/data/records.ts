// The checks a published trial record and audit line pass before a view reads them: the fields
// the browse views and packages/core/explain.ts explainTrial read, with the types they read them
// as. A record that fails shows as an error on its own row, so one bad file never blanks a view.
import { OUTCOMES } from '../../../../packages/core/outcomes.ts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown) => typeof v === 'string';
const orNull = (ok: (v: unknown) => boolean) => (v: unknown) => v === null || ok(v);
const hashes = (v: unknown) => isObj(v) && orNull(str)(v.initial) && orNull(str)(v.final) && (v.replay_final === undefined || orNull(str)(v.replay_final));
const checks = (v: unknown) => Array.isArray(v) && v.every((c) => isObj(c) && str(c.id));

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
  may('regrades', (v) => Array.isArray(v) && v.every((g) => isObj(g) && (OUTCOMES as readonly unknown[]).includes(g.outcome) && (g.checks === undefined || checks(g.checks))), 'a list of regrades');
  return errors;
}

export function validateAuditRow(x: unknown): string[] {
  if (!isObj(x)) return ['the line is not a JSON object'];
  const errors: string[] = [];
  if (!str(x.trial)) errors.push('trial is missing');
  if (!str(x.outcome)) errors.push('outcome is missing');
  if (x.evidence_ids !== undefined && !(Array.isArray(x.evidence_ids) && x.evidence_ids.every(str))) errors.push('evidence_ids is not a list of ids');
  return errors;
}
