# P20 pilot-2

claude-opus-5-5 at effort high, 8 trials per task on main a5048ad4 (P19 behaviour-driven levers, world state hash 95d2f519…, every record's initial hash equal to fixtures/manifest.json at a5048ad4).

Lists: L5 = empty, because the P19 overlay batch moved every env_version; L8 = all six tasks (renal-dose-review, results-inbox, crc-care-gap, discharge-medrec, contrast-ct-prep, message-queue). User row 'P20 overlay checkpoint': run all 48 trials, dry-run X8 $47.42.

48 of 48 PASS, no trial discarded, ENV_ERROR 0, GRADER_ERROR 0, refusals 0. Every task_version moved in P19, so the pooled estimate is pilot-2 alone.

## Per task

Passes/8 with Wilson 95% [0.68, 1.00]; mean / p90 cost per trial with the judge; mean turns:

- T1 renal-dose-review: 8/8, $0.49 / $0.62, 9.0.
- T2 results-inbox: 8/8, $1.08 / $1.29, 34.8.
- T3 crc-care-gap: 8/8, $1.93 / $2.21, 26.9.
- T4 discharge-medrec: 8/8, $0.29 / $0.41, 8.9.
- T5 contrast-ct-prep: 8/8, $0.58 / $0.66, 11.9.
- T6 message-queue: 8/8, $0.83 / $0.95, 28.1.

## Exit rule and audit

The P20 exit rule fails for all six tasks: each is pooled at 1.00, above 0.65, and this round alone is 8 of 8, above 5. All 48 transcripts were read and audited as confirmed PASSes (`audit.jsonl`, one row per trial; `pnpm cli audit-check` reports 0 violations). No FAIL exists, and no PASS is one a clinician would reject. None of the P19 levers bit, and in each task the policy text the agent reads points straight at the trap:

- T1: the active apixaban order's reason reads "History of pulmonary embolism", and RBC-PHARM-07 §2 opens with its NVAF scope sentence. Every trial named the indication right after the policy read.
- T2: RBC-RAD-05 §2's screening clause sent every trial to a screening check. Seven searched her DiagnosticReports, and one searched her notes for LDCT.
- T3: a group-wide note search shows E16's rehab stay. That primes a residence check, which finds E15's nursing facility visits, address or housing status.
- T4: §7 states the potassium rule. The outside report was read in turn 3 every time.
- T5: §6 tells the agent to read any ED summary for AKI. It was read in turn 3-4 every time.
- T6: the RBC-RX-05 preamble ("from any source") led to a potassium note search every time.

## Design leaks

Pilot-1 and pilot-2 ran on a world with agent-visible design leaks, fixed in the leak-cleanup PR. Read these results with that in mind.

## Score-only grader observations

- The judge spliced its quote with "...", so the code rule turned the item unknown, in 8 trials: T3/0, /5, /7 on the outreach_on_topic penalty (verdict not_met), T4/4 and /6 on note_lists_changes, and T5/0, /5, /7 on note_distinguishes_allergies (verdict met).
- T3/3: the outreach_message_false penalty (-5) was met on "that test covers you for up to 10 years" beside "you are due". This is a strict but defensible reading.
- T6/6: the m4_message_doxycycline miss repeats pilot-1's strict reading (verifier F4).

## Spend

Live spend: 3094 ledger rows, $41.53 settled. Ledger total $98.38. Final-run reserve on pilot-2 p90s: $151.39.
