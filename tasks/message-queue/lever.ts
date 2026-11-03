// T6's lever toggle (plan-amendment-w5 G1, W5-H): the ids of the active lever items, one literal
// list, no imports, so overlay.ts, events.ts and the task loader (packages/core/tasks.ts leverOf,
// which reads this text into env_version through expected.ts's re-export) all read one value.
//   A        webb-a1 in place of webb-c1: Marcus Webb's redrawn panel arrives with its potassium
//            notified alone (expected.ts, events.ts); toggles with no rebuild
//   B        Leonard Kaplan's same-day creatinines (overlay.ts); a toggle is a world rebuild
//   reserve  Rosalind Mercer's corrected creatinine and recalculated eGFR (overlay.ts, events.ts),
//            inactive; a toggle is a world rebuild
// Toggling (W5-S): change the list here; for B or the reserve run `pnpm fixtures:build` and commit
// its outputs, and for the reserve add "corrected_egfr_unread" to task.toml [matrix] traps
// (tests/lever.test.ts checks each against the list); then refill the judge cache
// (`pnpm cli oracle --task message-queue --live-judge --misses-only`).
export const LEVER = ['A', 'B'];
