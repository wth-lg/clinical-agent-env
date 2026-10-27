// The run's model and effort line (plan P17j JU8), apart from results.ts so the unit tests and the
// root typecheck reach it without Vite's import.meta.
import type { Summary } from '../../../../packages/core/summary.ts';

// "Model claude-opus-5-5, effort high" from summary.json. summary.json's null means either that the
// records differ or that none sets the field (records that predate effort); the records tell which.
export function modelLine(s: Pick<Summary, 'model' | 'effort'>, trials: ReadonlyArray<{ record: { model_requested?: string | null; effort?: string | null } }>): string {
  const words = (v: string | null, of: (r: { model_requested?: string | null; effort?: string | null }) => string | null | undefined) =>
    v ?? (trials.some((t) => (of(t.record) ?? null) !== null) ? '(the trials differ)' : 'not recorded');
  return `Model ${words(s.model, (r) => r.model_requested)}, effort ${words(s.effort, (r) => r.effort)}`;
}
