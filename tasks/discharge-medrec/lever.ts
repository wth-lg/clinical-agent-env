// T4's lever toggles (plan-amendment-w5 "T4 discharge-medrec", G1; W5-E). One literal list, which
// packages/core/tasks.ts leverOf reads from this file's text into env_version (expected.ts
// re-exports it on a line of its own), and which overlay.ts, events.ts and policy.ts read as a
// module. No imports and nothing else exported: scripts/test/lever-invariant.test.ts mocks this
// file as { LEVER } per state. The hosts' keys and slots are in lever-keys.ts.
//
//   A        whitcomb-lisinopril: the A event whitcomb-a1 (events.ts), an outside potassium batch
//            after the resume, the stale 5.4 notified and the newer 4.6 filed silently. The host,
//            Gerald Whitcomb, is on the list in every state (his base item is a plain resume), so
//            toggling A is a version bump and no rebuild.
//   B        pruitt-metformin: Lorraine Pruitt's conditional resume whose only creatinine is from
//            the stay (RBC-TOC-02 §2: a Task due when the result is expected). Her chart is in the
//            world only while B is active.
//   reserve  salazar-amlodipine: Victor Salazar's outside fill history prints a 180-day coverage of
//            60% for a drug first filled inside the window (§5(b): 100% from its first fill); the
//            discharge raises the dose. His chart is in the world only while the reserve is active.
//
// Toggling (W5-S): change LEVER here, then: for B or the reserve run `pnpm fixtures:build` and
// commit its outputs; edit instruction.md to name exactly the listed hosts; set task.toml [matrix]
// traps to each active item's trap (tests/lever.test.ts names them); refill the judge cache
// (`pnpm cli oracle --task discharge-medrec --live-judge --misses-only`). tests/lever.test.ts checks
// each of these against LEVER.
export const LEVER = ['B'];
