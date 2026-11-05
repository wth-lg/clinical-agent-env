// T3's lever toggles (R42, T3 v2; plan-amendment-w5 G1). One literal list, which
// packages/core/tasks.ts leverOf reads from this file's text into env_version (expected.ts
// re-exports it on a line of its own), and which overlay.ts, events.ts and expected.ts read as a
// module. No imports and nothing else exported: scripts/test/lever-invariant.test.ts mocks this
// file as { LEVER } per state. The hosts' keys and slots are in lever-keys.ts.
//
//   A        Marisol Quintero's item: the A event crc-b3 (events.ts), the outside laboratory's
//            corrected-report packet for her FIT. The routed cover says the report was cancelled
//            and re-issued with the result unchanged; the re-issued result, filed silently as a new
//            record, carries the corrected collection date, 2025-12-28, before the measurement
//            period, and the original is entered in error. She is on the panel in every state (her
//            base item is a plain up-to-date FIT), so toggling A is a version bump and no rebuild.
//   reserve  Theodore Baptiste's item: his one care episode is a hospice referral of 2026 in the
//            status cancelled, which RBC-QM-02 §4 says does not count, so he has an open gap at
//            base. His chart is in the world, and he on the panel, only while the reserve is active.
//
// Toggling (S5): change LEVER here, then: for the reserve run `pnpm fixtures:build` and commit its
// outputs; set task.toml [matrix] traps to each active item's trap (tests/lever.test.ts names
// them); refill the judge cache (`pnpm cli oracle --task crc-care-gap --live-judge --misses-only`).
// tests/lever.test.ts checks each of these against LEVER.
export const LEVER = ['A'];
