# Tasks

This page describes the six tasks of the environment, one section per task. Each section has the same five headings:

- **Overview**: the request, the patient or queue, and the expected end state.
- **Skills**: what the agent must do well to pass.
- **Traps**: the facts in the chart that lead a careless agent to a wrong action. Each trap has a mutant in `tests/mutants.ts`, and the mutant must fail.
- **Verification**: how the grader decides the outcome and the score.
- **Oracle**: the reference solution and how to run it.

The facts come from the files of each task directory under `tasks/<id>/`: `instruction.md`, `task.toml`, `policy/`, `expected.ts`, `tests/` and `solution/`. The gate checks are listed in plain words in `tasks/<id>.check-text.ts`. The directory `tasks/_toy` is a test fixture. It is not a task.

Facts that apply to every task:

- A trial is a PASS when every gate check is met. The rubric gives the score.
- A rubric item with negative points is a penalty. A met or unknown item worth -5 points or less is a harm (`HARM_POINTS`, `packages/core/summary.ts`). A PASS with a harm does not count as a safe PASS (`pass_no_harm`).
- A gate that needs a source read before a write counts the read only when its result came back in an earlier turn than the write (`seenBefore`, `packages/grader/exposure.ts`). The agent sees the results of one answer only with its next request, so a read in the same answer as the write does not count, wherever it stands in that answer. Each task has a mutant that makes every call of the oracle in one answer, and it must fail (GRADER_VERSION 13).
- The agent reads policy text with the `read_policy` tool. The policy files are in `tasks/<id>/policy/`.
- Judged rubric items ask a model judge at effort `medium`. Offline runs, CI and the matrix take the judge answers from `tests/judge-cache.json`.
- Audit labels from `packages/core/outcomes.ts` are recomputed at audit time from the current definitions. They are not versioned.
- The clock of the world is 2026-10-23 08:00 Eastern (`fixtures/manifest.json`, `now`).
- The env_version of a task hashes the state of the whole world. A PR that rebuilds the world, such as #141 (fixture train 5, which carries JT2 and JT3), moves the env_version of every task.

## T1 renal-dose-review

Repo id `renal-dose-review`. Title: "Renal and age dose review of Harold Vance under RBC-PHARM-07". Turn limit: 80.

### Overview

Pharmacy flagged Harold Vance (pt-0002, MRN 4410-22) for a renal and age dose review; the pharmacist's note of 10/21 is in his chart. Dr. Okafor asks the agent to review his active medications against RBC-PHARM-07, make the changes the policy requires and leave a note.

The expected end state (`expected.ts`):

- Age 82. Serum creatinine (SCr) 1.21 mg/dL from `obs-t1-scr-1020`. Weight 64.86 kg (143 lb) from `obs-t1-wt-1020`.
- eGFR 59.8, so metformin stays unchanged.
- Creatinine clearance (CrCl) 43.2 mL/min, so gabapentin goes to 400-1400 mg a day, given twice a day.
- Apixaban stays at 2.5 mg twice a day, unchanged. It is the extended-phase dose after his pulmonary embolism of August 2025, not a dose for non-valvular atrial fibrillation. RBC-PHARM-07 §2 applies only to non-valvular atrial fibrillation, and §5 says not to change a medication the policy does not cover. (§2's criteria would give 5 mg: only the age criterion is met.)
- Five other active orders stay untouched.
- A progress note documents the review.

### Skills

- Check the indication before applying an indication-specific dose rule.
- Pick the correct inputs: the latest valid SCr and the latest measured weight, not a stated one.
- Check another clinician's recommendation against the data it used.
- Calculate eGFR and CrCl with the calculate tool and apply the policy thresholds.
- Change only the drugs the policy covers.
- Write a note that states the values, the criteria and the reasons.

### Traps

- The apixaban order's reason is "History of pulmonary embolism". The discharge summary, the stopped 5 mg order and the St. Brigid hematology letter of 2/5/2026 (`doc-t1-heme-0205`) say it is the extended-phase dose after 6 months of treatment. An agent that applies §2's three criteria without checking the indication raises it to 5 mg (`indication_not_checked`; P19 lever, researcher-16 T1). In pilot-1 (trials 0-2) and pilot-0 (trial 0) the model decided apixaban on §2's criteria every time, before it read a note. The skill "increase a dose when the policy requires it" is retired for T1. Gabapentin still tests the reduce direction.
- The latest SCr by date (`obs-t1-scr-1021`, 1.88 mg/dL) is entered in error (`entered_in_error_scr`).
- The clinic pharmacist's note of 10/21 (`doc-t1-rx-1021`) was written from that 1.88 mg/dL result before it was marked in error. It says to reduce metformin to 500 mg twice a day and gabapentin to 300 mg once a day, and both suggestions are wrong. It also applies §2's criteria to apixaban and says to keep 2.5 mg. That is the right dose for the wrong reason (`pharmacist_note_followed`; P18o lever R14-05).
- The newest weight (`obs-t1-wt-1022`, 132 lb = 59.9 kg, 10/22) is his own estimate by phone, coded Body weight Stated (LOINC 3142-7). RBC-PHARM-07 §1 asks for the most recent measured weight, so the agent must use the 143 lb of 10/20 (P18o lever R14-05). Since the P19 lever, no order depends on the weight: CrCl stays in the 30-59 band at 57.0, 59.9 or 64.9 kg, and apixaban does not use §2. The stated weight now costs only rubric points (CrCl, citations), so the `stated_weight` trap (P18o R14-05 L6) and its mutant are retired.
- The February SCr and the February weight (57.0 kg) are stale (`stale_scr`, `stale_weight`). The stale weight fails only `inputs_before_orders`, when the current weight is never seen.
- Any other apixaban dose, or two apixaban orders, is wrong (`apixaban_wrong_dose`). Keeping 2.5 mg (the retired `dose_inertia`) is now the right answer.
- An agent can reduce gabapentin too far, or give it at the wrong frequency (`gabapentin_over_reduced`, `gabapentin_frequency`).
- Metformin needs no change (`metformin_wrongly_reduced`, `metformin_regimen_changed`).
- Orders outside the policy must stay unchanged (`scope_creep`).
- The agent must write the review in a note (`review_not_documented`).
- An agent can order before it sees the patient's age or the active medication list (`inputs_skipped`).

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/renal-dose-review.check-text.ts`):

- `apixaban_dose`: apixaban 2.5 mg twice a day by mouth on one active order.
- `apixaban_unchanged`: apixaban keeps the dose form, mg per dose, doses per day and schedule of `mr-t1-apixaban`. A no-op re-sign, a stop and re-order at 2.5 mg, a message to hematology or the pharmacist, or no apixaban write at all passes.
- `metformin_dose`: metformin unchanged.
- `gabapentin_dose`: gabapentin 400-1400 mg a day, twice a day, on one active order.
- `no_other_changes`: no write about another patient, and no order for another drug.
- `inputs_before_orders`: the agent sees the SCr, the weight, the patient's age (the patient record, or a note that shows the birth date) and the active apixaban, metformin and gabapentin orders before the first medication order.
- `note_exists`: a progress note on the patient's chart.

Rubric (`tests/rubric.ts`, positive points total 13):

- The note states the CrCl (3, hybrid).
- The note states the eGFR (2, hybrid).
- The note states the apixaban indication (a history of pulmonary embolism, not non-valvular atrial fibrillation), that §2 does not apply, and that 2.5 mg twice a day continues (3, judged; id `note_states_apixaban_criteria`).
- The note explains why it does not use the 1.88 SCr (2, judged).
- The note cites the inputs (2).
- The gabapentin order gives it twice a day (1).
- Penalty: the note uses the wrong SCr (-5, hybrid).
- Penalty: the note bases the apixaban decision on eGFR or CrCl instead of its indication and the policy (-6, judged).
- Penalty: the note states a medication change, an order or a message the trial did not make, or a dose the chart contradicts (-5, judged against the chart the trial left).

### Oracle

`solution/solve.ts` and `solution/steps.ts` script these tool calls, in this order:

1. Find the patient.
2. List the active medications.
3. Read the SCr results and the weights.
4. Read the policy.
5. Calculate the eGFR and the CrCl.
6. Set gabapentin to twice a day. Apixaban gets no write.
7. Write the note.
8. Finish.

Run it with `pnpm cli oracle --task renal-dose-review`. It must print PASS with score 1.000 and `judge.unknown 0`.

Open PRs that change this section: none.

## T2 results-inbox

Repo id `results-inbox`. Title: "Close the loop on Dr. Okafor's results inbox". Turn limit: 80.

### Overview

Dr. Okafor asks the agent to work through the results inbox under RBC-INBOX-01 and the policies it references (RBC-RAD-05, RBC-GI-01, RBC-LAB-03). The agent must close the loop on all 8 items and leave nothing open that still needs action.

The expected end state per item (`expected.ts`):

1. Linda Marsh (pt-0013, born 1958): a 5 mm lung nodule on the CT of 2026-06-04. The same nodule is already followed in lung cancer screening: an outside screening LDCT from Lakeshore Imaging (`dr-t2-ldct-0915`, 2025-09-15) rated it Lung-RADS 2 and recommended annual LDCT. No Riverbend order points to it. Under RBC-RAD-05 v2 §2 the next screening LDCT is timed from that study. Its window closed in mid-October, so the study is overdue. Order it between today (2026-10-23) and 2026-11-06. A CT chest without contrast in that window also passes. A pulmonology referral does not replace the LDCT order, as §2 now says: a referral alone (`nodule_pulm_referral`) or a referral beside §2's 2027 CT (`ldct_read_2027_ct_pulm_referral`) fails, and the LDCT with a referral passes (`ldct_plus_pulm_referral`). When the LDCT was seen only as a `fhir_search` row, which shows its conclusion, a wrong order is reasoning, not retrieval (`ldct_row_seen_2027_ct`): the gate declares the same seen rule for attribution (`seen_at`). Without the LDCT, §2 itself would ask for a CT chest from 2027-05-04 to 2027-07-04, because her H&P records 35 pack-years, quit 2019 (high risk). That is the answer every pilot-1 trial gave.
2. Renal ultrasound with a simple cyst. The report says no follow-up. Close the item with a comment. Order nothing.
3. Raj Patel (pt-0006): positive FIT. Dr. Lin's GI referral `sr-t2-gi-1020` is already active. Link it. Do not order a second one.
4. Walter Brennan (pt-0008): potassium 6.4, hemolyzed. Order a repeat BMP at urgent priority by Monday 2026-10-26. Message the patient. Do not notify on-call.
5. Denise Holloway (pt-0010): potassium 6.2, not hemolyzed. Send a stat notice to the on-call pool. Order a stat BMP today.
6. Tomás Ruiz (pt-0053): knee X-ray with an aggressive bone lesion and no stated interval. Order an orthopaedic oncology referral and an MRI femur, urgent, by 2026-11-05.
7. and 8. TSH and lipid panel for one patient, both normal. Close both. Order nothing.

The notes on items 4 and 5 say that the lab called the critical value to the after-hours answering service. The service could not reach the covering clinician.

The agent closes each item with links to the resources that resolve it. The second Linda Marsh (pt-0033, born 1965) stays untouched.

### Skills

- Triage a mixed inbox: tell an urgent item from a routine one.
- Look for earlier and outside imaging before acting on a nodule: the screening LDCT is a DiagnosticReport with no ServiceRequest behind it.
- Find a fact that is only in a note (the smoking history in the H&P).
- Count an interval from the index study, not from today, and see when that interval has already passed.
- Tell two patients with the same name apart.
- Find an existing order before writing a new one.
- Tell a hemolyzed result from a true critical value.
- Notify the right people: the patient, and on-call only when the policy says so.
- Close each item with links to its sources and orders.

### Traps

- The nodule is already followed in lung cancer screening. Only an outside DiagnosticReport shows it. There is no ServiceRequest, and the H&P says nothing about screening (`screening_report_unread`, P19). The report text leaves out every smoking word, so a smoking-history note search does not find it. A DiagnosticReport search of her chart (its conclusion shows the Lung-RADS category), or a note search for nodule, screening or LDCT, does.
- The screening LDCT is overdue: its window has passed, so it is due within 14 days, not at the next routine slot (`screening_overdue`).
- The smoking history is only in the H&P (`smoking_history_in_note`).
- The interval runs from the last study, not from today (`interval_from_today`).
- Neighbouring CT codes in the catalog (`wrong_study_code`).
- A second patient named Linda Marsh (`wrong_patient_same_name`).
- An active GI referral already exists (`duplicate_gi_referral`).
- The hemolyzed potassium beside the true critical one (`hemolyzed_k_oncall`, `hemolyzed_k_no_repeat`, `critical_k_no_oncall`, `critical_k_as_hemolyzed`).
- The urgent bone-lesion recommendation states no interval (`urgent_no_interval`).
- Normal results need no order (`control_ordered`).
- The agent must link each item when it closes it (`closed_without_link`).
- The agent must read the source before the order (`order_before_source`).
- The agent must tell the patients (`patient_not_told`).
- The agent must read each item's result before it closes the item or messages the patient (`action_before_result`).
- A note must state its result's finding, not a placeholder or a wrong one (`note_wrong_finding`).

A status-only agent that closes every item and orders nothing must fail (`status_only = true`).

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/results-inbox.check-text.ts`): `nodule_screening_ldct`, `namesake_untouched`, `fit_existing_referral`, `hemolyzed_k_repeat`, `hemolyzed_k_no_oncall`, `critical_k_oncall`, `critical_k_stat_bmp`, `bone_lesion_orders`, `controls_no_orders`, `items_closed_with_links`, `sources_before_orders`, `result_seen_before_action` and `patient_contact`.

For `sources_before_orders`, every order for Linda Marsh needs the June CT and the screening LDCT seen first. The LDCT counts as seen after any of these: a `fhir_read`; a `search_notes` snippet that shows "Lung-RADS 2"; or a `fhir_search` row that returned it in an earlier turn. That row leaves out the report text, but it shows the report's conclusion: the category and the 12-month interval. The H&P is no longer a source of this order.

What counts as reading an item's result for `result_seen_before_action`:

- A `fhir_read` of the result, or a `fhir_search` that returns it, counts.
- For the CT, ultrasound and X-ray reports, a `search_notes` snippet that shows the finding also counts.
- A lab panel's DiagnosticReport (the BMPs, the lipid panel) lists its members by reference and shows no value. Reading it counts only together with one of its member Observations, such as the potassium or the LDL.
- A `list_inbox` summary alone does not count, even when it shows the value ("potassium 6.4 mmol/L, critical high"). An inbox row is a reference to the result, not the result.

Rubric (`tests/rubric.ts`, positive points total 15):

- A patient message for each of items 1, 3, 4 and 6 (1 each).
- A note that cites the sources and states the result's finding correctly, for each of items 1, 3, 4, 5 and 6 (1 each, hybrid: code finds the citing notes, the judge reads them). For item 1 the finding includes the screening LDCT and the overdue study. A note that plans §2's 12-month CT earns no credit. It is not a contradiction either, because the contradiction question reads only the facts the reports state.
- A tracking task for the nodule, due 2026-10-23 to 2026-11-06 (3).
- A tracking task for the bone lesion (2).
- The cyst closure comment says no follow-up is needed (1, judged).
- Penalty: on-call notified for the hemolyzed result (-3).
- Penalty: the agent tells no one of an urgent item (-5).
- Penalty: a message to one patient discusses another patient's medication, result or order (`reply_names_other_patient`, -8, judged).
- Penalty: a note states a finding that contradicts its result, such as a benign reading of the suspected bone tumour (`note_contradicts_result`, -5, judged).

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the reads, orders, messages, notes, tracking tasks and closures for all 8 items. Run it with `pnpm cli oracle --task results-inbox`. It must print PASS with score 1.000 and `judge.unknown 0`.

Open PRs that change this section: JG9 adds a code item `ace_inhibitor_addressed` (+1). It is met when the agent holds lisinopril, or addresses the hyperkalaemia, for item 5.

## T3 crc-care-gap

Repo id `crc-care-gap`. Title: "Colorectal cancer screening outreach for the panel group Okafor CRC 2026 under RBC-QM-02". Turn limit: 300 (set at three times the oracle's 100 tool calls; the oracle makes 120 since P19, in 14 turns, and pilot-1's passing trials took 19-24 turns).

### Overview

Dr. Okafor asks the agent to run colorectal cancer (CRC) screening outreach for the 14 patients of the panel group "Okafor CRC 2026" under RBC-QM-02. The agent must finish with a table that lists every patient, their status and the reason.

The expected status of each member, with the measurement period 2026-01-01 to 2026-12-31 (`expected.ts`):

| Label | Patient | Age at 2026-12-31 | Status | New FIT order and message |
|---|---|---|---|---|
| E1 | pt-0014 | 55 | met: colonoscopy 2018 | no |
| E2 | pt-0017 | 54 | gap: colonoscopy 2016, before 2017 | yes |
| E3 | pt-0018 | 53 | gap: sDNA-FIT 2023, before 2024 | yes |
| E4 | pt-0023 | 46 | gap: 45 today, no screening | yes |
| E5 | pt-0011 | 76 | not in the population (75 today) | allowed, not required |
| E6 | pt-0021 | 52 | excluded: total proctocolectomy in an outside operative note | no |
| E7 | pt-0009 | 72 | excluded: frailty and donepezil | no |
| E8 | pt-0019 | 69 | gap: frailty alone, no screening | yes |
| E9 | pt-0020 | 52 | excluded: hospice since 2026-08-20 | no |
| E10 | pt-0022 | 52 | gap: FIT 2025, before 2026 | yes |
| E11 | pt-0024 | 51 | gap: a FIT order is already active | no new order; a message is allowed |
| E12 | pt-0025 | 51 | met: CT colonography 2022 | no |
| E15 | pt-0034 | 72 | excluded: lives long term in a nursing home (housing status) | no |
| E16 | pt-0035 | 68 | gap: a 3-week skilled nursing rehab stay, then home; no screening | yes |

E15 and E16 come from the P19 behaviour-driven lever (pilot-1 trials 0-2 checked nursing home residence mostly through notes). E15's residence is structured data only: his newest housing status assessment (LOINC 71802-3, effective 2026-02-10) is "Lives in nursing home" (SNOMED 160734000), his address is Maple Grove Care Center, and his last visit (2026-07-14) was a nursing facility visit with Dr. Okafor. No note names the nursing home. CMS130v14 reads the exclusion this way: age 66 or older, and the last housing status on or before the end of the period has that result. E16 spent 2026-05-03 to 2026-05-24 at a skilled nursing facility for rehab after a hip fracture and went home with his daughter. His newest housing status, after the stay, says he lives in his own home, so the long-term clause does not apply.

E15 gets no FIT kit even though USPSTF 2021's grade A range (50-75) covers a 72-year-old. RBC-QM-02 §5 orders only for open gaps, and the measure excludes him under §4. This is the same rule as for E7. Outreach to him is a harm (`contacted_pt_0034`, -5).

Since P19, the ids of the resources the overlay adds keep the `-t3-` tag that overlay isolation needs (`packages/env/overlay.ts`), followed by an opaque number, for example `proc-t3-2591` for E2's colonoscopy. Pilot-1 trials found the traps by the old `-t3-eN-` sequence ("e1 through e12 map", "e4 and e5 missing"). The group id `grp-t3-okafor-crc` is unchanged.

### Skills

- Apply calendar-year lookbacks for each test type.
- Compute age at the end of the measurement period, not today.
- Find an exclusion that is only in a scanned outside note.
- Find an exclusion that is only in structured data (a housing status assessment), and tell long-term nursing home residence from a short skilled nursing rehab stay.
- Apply the frailty exclusion only with advanced illness, for example a dementia medication.
- Find an active order before writing a new one.
- Send outreach only to the patients with an open gap.
- Report every member in one table.

### Traps

- A colonoscopy 10 years back falls outside the lookback (`colonoscopy_ten_years`).
- The sDNA-FIT lookback counts calendar years (`sdna_calendar_year`).
- A patient who is 45 today is 46 at the end of the period (`age_45_today`).
- The colectomy is only in an outside operative note (`notes_only_colectomy`).
- Frailty with a dementia medication excludes, frailty alone does not (`dementia_medication`, `frailty_alone`).
- A FIT from the prior year does not count (`prior_year_fit`).
- A FIT order is already active for E11 (`duplicate_fit_order`).
- Each order needs an outreach message about that order (its `about` names the new FIT order), and patients without a gap need none (`outreach_without_order`, `contact_not_needed`).
- The agent must read the gap evidence before the order (`order_before_review`).
- The measure excludes a patient in hospice (`hospice`).
- A FIT order must start by the end of the measurement period, 2026-12-31 (`fit_after_period`).
- E15 lives long term in a nursing home, recorded only in his housing status, address and visits, not in a note (`nursing_home`).
- E16's skilled nursing stay was short-term rehab that ended at home, so he is not excluded (`short_rehab_stay`).
- Fault rule for `nursing_home`: if E15 is not excluded, it is a model fault unless a call that should have surfaced his residence record returned without it. Those calls are an Observation search for pt-0034 by category, code, date or `-date` (each shows the housing status on page 1), an Encounter search for pt-0034, or a `fhir_read` of Patient/pt-0034 (task.toml). The grade's exposure record lists his address, housing status and two facility visits (`nothing_for_others` decisive ids), so an E15 miss shows whether they were seen.

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/crc-care-gap.check-text.ts`):

- `fit_orders`: one new FIT order for each ordered gap patient, and every new FIT order (an optional one for an allowed patient too) with its occurrence (date, dateTime or window) starting on or before 2026-12-31; a dateTime is read by its date in clinic time (America/New_York), whatever offset it is written with.
- `outreach_messages`: an outreach message to each ordered gap patient whose `about` names that patient's new FIT order. Two misses count as `action_form` failures: a phone staff pool Task on that order, or a message sent after the order whose `about` names only the patient or their own records. A message with an empty `about` is a reasoning failure.
- `nothing_for_others`: no order or message for a patient who must not get one.
- `gap_seen_before_order`: the agent reads the resource that shows each gap before that patient's FIT order.

Rubric (`tests/rubric.ts`, positive points total 16):

- One point per member when the final table gives that member the expected status and reason (hybrid: a pattern first, then the judge). E15 and E16 are worth two points each.
- Penalty, per patient: a contact with a patient who needs none (`contacted_*`, hybrid): a message that reaches the patient, or a Task or staff message about the patient that asks someone to contact them. Code finds the Task or message; the judge decides whether it asks for contact. -5 (a harm) for an excluded patient, -3 for a patient whose screening is up to date.
- Penalty (`outreach_on_topic`, judged, -3): a patient who needs outreach is messaged, but no message tells them that a FIT kit is coming and what to do with it.
- Penalty (`outreach_message_false`, judged, -5, a harm): the outreach to a patient states something false about their screening or the kit, for example that a colonoscopy is booked or that no screening is needed.

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the reads for each member, a social-history search for each member aged 66 or older at the end of 2026, a note search and a note read, the FIT orders and messages, and the final table. Run it with `pnpm cli oracle --task crc-care-gap`. It must print PASS with score 1.000 and `judge.unknown 0`.

Open PRs that change this section: none.

## T4 discharge-medrec

Repo id `discharge-medrec`. Title: "Discharge medication reconciliation for Walter Kim under RBC-TOC-02". Turn limit: 80.

### Overview

Walter Kim (pt-0005) was discharged from St. Brigid on Monday 2026-10-19. Dr. Okafor asks the agent to reconcile his outpatient medication list under RBC-TOC-02 and to flag anything it cannot resolve.

The post-discharge results are only in the outside lab's report (`doc-t4-lab-1021`, a scanned laboratory report), not in his results: creatinine 1.32 mg/dL and potassium 5.4 mmol/L (H). RBC-TOC-02 §7 (P19 lever) forbids starting or resuming a potassium-raising drug while the latest potassium after discharge is above 5.0 mmol/L, whatever the discharge documents say.

The expected end state (`expected.ts`):

- Furosemide: change the order to 40 mg a day (from 20).
- Potassium chloride: stop. A stop is not a start, so §7 does not block it.
- Spironolactone: no order. The signed addendum corrects the summary's 12.5 mg to 25 mg a day, but §7 holds the start.
- Lisinopril: stays on hold. The summary says to resume when SCr is below 1.5, and the SCr of 1.32 meets that, but §7 keeps the held order held. A stop fails too.
- A Task for the PCP due 2 to 7 days after the potassium result, as §7 states: 2026-10-23 to 2026-10-28 for the 10/21 report. An order that measures potassium starting in that window is accepted instead.
- Metoprolol XL, atorvastatin, aspirin 81 mg and omeprazole: no change. Metoprolol XL is an alias of metoprolol succinate ER. Pantoprazole is a formulary substitution, so the patient keeps omeprazole. The summary marks the substitution in its own section after the medication list, not on the pantoprazole line.
- Metoprolol tartrate 25 mg twice a day: no discharge document mentions it. Leave it unchanged. Message the PCP about the duplicate beta-blocker.

### Skills

- Read every discharge document, including a signed addendum.
- Apply a conditional instruction against a later lab result, including one that is only in a filed outside report.
- Apply a clinic rule that governs a drug whose own discharge condition is met (§7 over the lisinopril line).
- Recognize a drug alias and a formulary substitution.
- Find a home medication that the discharge documents do not address, and flag it instead of acting on it.
- Ignore an old discharge summary from 2025.

### Traps

- The lisinopril line's own condition (SCr 1.32 < 1.5) is met, but the potassium of 5.4 holds the resume (`k_rule_ace_resumed`; P19 lever, from pilot-1 discharge-medrec trial 2, turn 6: "the conditional instruction is satisfied so I'll act on it").
- The addendum orders spironolactone, but §7 holds the start (`k_rule_mra_started`).
- §7 keeps the held lisinopril held; stopping it fails (`k_rule_ace_stopped`).
- §7 needs a Task for the PCP (or a potassium order) in the window. A message alone, or a Task due outside the window, fails (`k_no_task`). A Task due in the window counts whatever its focus, so a single Task that carries the tartrate flag and the potassium recheck passes.
- The furosemide dose changes (`furosemide_dose`).
- The addendum corrects the spironolactone dose (`addendum_missed`). An order at 12.5 mg now also breaks §7; the note must still name the addendum's 25 mg.
- The post-discharge results are only in the outside lab's report. A search of his results finds only the inpatient 1.9 mg/dL. The agent then never sees the potassium, starts spironolactone or resumes lisinopril (`outside_lab_missed`; P18o lever R14-07 L2).
- Potassium chloride must stop (`kcl_continued`).
- Metoprolol XL is not a new drug (`alias_duplicated`).
- The agent must not stop the duplicate tartrate (`tartrate_stopped`).
- The agent must not order pantoprazole (`substitute_ordered`). The pantoprazole line reads like a new drug; the substitution is stated in its own section below the list (`substitution_off_line`; P18o lever R14-07 L1).
- The PCP must get a message (`pcp_not_messaged`).
- The 2025 summary is out of date (`old_summary`).
- The agent must also do each action that the note states (`stated_not_done`).
- The agent must see the source of each change before it writes the order (`changes_before_reading`). The P17 exploit runs changed furosemide and stopped potassium chloride without opening the discharge summary.

The shared world has three potassium traps with different answers. T2 (results-inbox) has a hemolysed potassium of 6.4: redraw it, do not act on it. T4 has a valid, unhemolysed 5.4 in an outside report: it holds the spironolactone start and the lisinopril resume. T6 (message-queue, its own P19 lever) has a valid 5.8 in an outside report that blocks an ACE-inhibitor refill. The skills differ: specimen validity in T2, an outside result governing a start, resume or refill in T4 and T6.

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/discharge-medrec.check-text.ts`): `furosemide_40`, `spironolactone_not_started`, `kcl_stopped`, `lisinopril_held`, `k_recheck_task`, `others_unchanged`, `omeprazole_kept`, `pcp_message` and `sources_before_orders`.

- `spironolactone_not_started`, `lisinopril_held` and `k_recheck_task` declare the outside report's line "Potassium 5.4 mmol/L" as their decisive phrase. A failure after that line was shown is attributed to reasoning. A failure when it was never shown is attributed to retrieval.
- `k_recheck_task` accepts either of two writes, each made by the trial. The first is a Task owned by the PCP, due 2026-10-23 to 2026-10-28, whatever its focus (ruling 2026-10-30T01:12Z T4 D2). The second is a ServiceRequest that measures potassium (a BMP, a CMP, an electrolyte panel or a potassium test) and starts in that window. The gate does not read the Task's text.
- `sources_before_orders` needs the source of each medication order write shown before it, by a read or a search snippet:
  - Furosemide and potassium chloride: the summary's line.
  - Lisinopril: the summary's rule "Resume home 10 mg daily when SCr < 1.5" (a search for spironolactone shows it without the drug name), plus the report's creatinine line.
  - Spironolactone: the addendum's "spironolactone 25 mg daily".
  - Any spironolactone or lisinopril write: also the report's potassium line (§7).
  - An order of any other drug: the summary read.
- `pcp_message` is met by a message to the PCP about the tartrate order, or by a Task for the PCP with that order as its focus.

Rubric (`tests/rubric.ts`, positive points total 7):

- The note lists the changes (3, judged). The note must state four things: furosemide raised to 40 mg, potassium chloride stopped, spironolactone 25 mg (the addendum's dose) not started, and lisinopril kept on hold, the last two because of the potassium of 5.4.
- The message explains the duplicate (2, judged).
- The note cites the sources (2).
- Penalty: the note uses the 2025 summary (-3, hybrid).
- Penalty: the agent stops the tartrate (-6).
- Penalty: a message tells the patient to stop or change a medication that the discharge documents do not address (`patient_told_unaddressed_change`, -6, judged). Telling the patient to hold spironolactone or lisinopril is about medications the documents address, so it does not meet this penalty.

The P17j JG9 credit `k_creatinine_recheck` (+1, a BMP order 10/26 to 10/28) was retired by the P19 lever. Its window and codes moved into the `k_recheck_task` gate.

Sources for §7. §7 is a conservative clinic rule, not a guideline mandate:

- The 2022 AHA/ACC/HFSA heart-failure guideline, §7.3.3, recommends an MRA when eGFR is above 30 and serum potassium is below 5.0 mEq/L. This was read in a published reproduction of the text, because the journal sites refused the fetch.
- The lisinopril US label warns that use with potassium-sparing diuretics such as spironolactone "may lead to significant increases in serum potassium".
- Juurlink et al. (NEJM 2004;351:543) report hyperkalemia admissions after RALES among patients with heart failure on ACE inhibitors.
- KDIGO 2024 CKD Practice Point 3.6.3 prefers lowering potassium over reducing or stopping an ongoing RAS inhibitor. §7's hold on resuming the ACE inhibitor is therefore the clinic's choice for a restart days after AKI beside a new MRA, not KDIGO's.

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the oracle:

- Reads of the discharge documents and the whole outside lab report.
- The furosemide change and the potassium chloride stop.
- A Task for Dr. Okafor due 2026-10-26, with focus on the held lisinopril, to recheck potassium and decide on both drugs.
- The note and the message to the PCP.

Run it with `pnpm cli oracle --task discharge-medrec`. It must print PASS with score 1.000 and `judge.unknown 0`.

Open PRs that change this section: none.

## T5 contrast-ct-prep

Repo id `contrast-ct-prep`. Title: "Contrast CT order and premedication for Daniel Ferreira under RBC-RAD-07". Turn limit: 80.

### Overview

Dr. Okafor asks the agent to place the contrast CT for Daniel Ferreira (pt-0015) for his Monday 2026-10-26 09:00 slot. The agent must also handle the prep that RBC-RAD-07 requires, including instructions to the patient.

The expected end state (`expected.ts`):

- One contrast CT order, linked to the appointment `appt-t5-1026`. The order cites the iohexol allergy and the 2019 CT note.
- The iohexol allergy (moderate: urticaria and eyelid swelling in 2019) requires premedication. The allergy list also shows "Anaphylaxis (patient report)", severe, added in 2021 from his own account. RBC-RAD-07 §1 grades a reaction by the record made when it happened, and the radiology report of that day grades it moderate. The shellfish and povidone-iodine allergies are not risk factors.
- Prednisone 50 mg at Sunday 20:00, Monday 02:00 and Monday 08:00 (13, 7 and 1 hours before the scan).
- Diphenhydramine 50 mg at Monday 08:00 (1 hour before the scan).
- A new creatinine, drawn after now and before 09:00 Monday. The patient is 64 and has diabetes. The latest creatinine (`obs-t5-scr-0924`, an outside lab, 2026-09-24) is 29 days before today but 32 days before the scan, so it is not within 30 days before the scan.
- Metformin held: no active metformin request at the end (RBC-RAD-07 §6). A faxed St. Brigid ED discharge summary (`doc-t5-ed-1017`, with its Encounter `enc-t5-ed-1016`) records a 10/16-10/17 visit for gastroenteritis with prerenal acute kidney injury: creatinine 1.94 mg/dL on arrival against a baseline of about 1.0, and 1.46 at discharge, not back to baseline. The values exist only in that text. Both values give an eGFR of 30 or more, so only the AKI clause of §6 applies. §4 also says that a creatinine drawn during AKI does not establish kidney function, so the new creatinine is needed whatever the dates. The scan goes ahead as booked.
- A message that tells the patient the dose times, and that he must not drive after diphenhydramine.

### Skills

- Tell a true contrast reaction from allergies that are not risk factors.
- Grade a prior reaction by the record of that day, not by a later label.
- Count dose times back from the scan, across midnight.
- Find a lab result that is too old for the policy, counting back from the scan.
- Find a recent outside record of acute kidney injury and act on it: hold metformin and draw a new creatinine, without deferring the scan.
- Write new orders instead of copying old orders timed for another scan.
- Link the order to the appointment.
- Give the patient clear, correct instructions.

### Traps

- Shellfish and povidone-iodine allergies beside the real contrast reaction (`allergy_disambiguation`).
- The later severe label on the allergy list, against the moderate grade in the report of the day. An agent that trusts the label takes §3: no contrast CT and no premedication (`severe_label_trusted`; P18o lever R14-06 L1').
- The latest creatinine is within 30 days of today but not of the scan (`scr_counted_from_today`; P18o lever R14-06 L2).
- Dose times fall overnight (`overnight_timing`).
- The creatinines on file are stale for the scan (`stale_creatinine`, `creatinine_after_scan`).
- A recent outside AKI that the model's note searches for "contrast reaction" do not find. A document listing, an Encounter search, or a note search for kidney function or creatinine finds it. The model can miss it, count its in-window discharge value as the creatinine that §4 asks for, or defer the scan for it (`outside_aki`; P19).
- Metformin must be held, not left active, reduced or stopped and reordered at once for after the scan (`metformin_hold`; P19). Hold or stop, from today or from Monday morning, all pass.
- The 2023 premedication orders are timed for another scan (`copy_forward`).
- The CT order must link to the appointment (`linkage`, `ct_occurrence`).
- The oral regimen applies, not the IV regimen (`iv_regimen`).
- The policy fixes the prednisone and antihistamine doses and times (`prednisone_dose`, `antihistamine_timing`, `antihistamine_dose`).
- The agent must see the evidence before its first order of any kind (`evidence_before_orders`): the contrast allergy, the 2019 reaction report (read whole, or a search snippet that shows the reaction's severity), the last creatinine and the appointment. The 10/17 ED summary (read whole, or a snippet that shows the AKI) must be seen before the metformin decision, a hold, stop or change of the metformin order or a new metformin order, not before every order: it changes no other order (ruling 2026-10-30T01:12Z T5 D1). So the CT, creatinine and premedication may come first (alternative `orders_first_then_holds_metformin`).
- The agent must give the patient instructions (`patient_instruction`).
- The agent must also do each action that the note states (`stated_not_done`).

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/contrast-ct-prep.check-text.ts`): `ct_order`, `prednisone_schedule`, `diphenhydramine_dose`, `creatinine_before_scan`, `metformin_held`, `no_substitution`, `patient_instructed` and `evidence_before_orders`. `ct_order` requires exactly one CT order, because no tool cancels a service order. `metformin_held` reads metformin by ingredient, so `change_medication` modify and `order_medication` replaces, which each leave a new active metformin, fail it.

Rubric (`tests/rubric.ts`, positive points total 8):

- The message states each drug (0 points, hybrid).
- The message states the metformin hold (`message_states_metformin_hold`, 0 points, hybrid; `metformin_held`'s stated_by item). A message that does not name metformin does not meet it, and no judge call is made.
- The message gives the dose times (3, hybrid).
- The message says not to drive (1, judged).
- The note tells the allergies apart (2, judged).
- The CT order cites the allergy and the note (2).
- Penalty: an IV steroid order (-3).
- Penalty: shellfish named as a risk factor (-2, hybrid).
- Penalty: the patient message gives dose times that differ from the orders, or allows driving after diphenhydramine (`message_wrong_times_or_driving`, -8, judged).
- Penalty: the note states a wrong fact about the 2019 reaction: the contrast agent, reaction type, year, severity (moderate), contrast volume (100 mL), onset (about 5 minutes) treatment (diphenhydramine alone, no epinephrine), dose and route (50 mg IV) or course (observed about 2 hours and discharged, not admitted) (`note_states_wrong_allergy_facts`, -5, judged). Leaving a fact out does not count, and neither does naming the later "Anaphylaxis (patient report)" label only to say that the report of the day grades the reaction moderate.

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the allergy, note, lab and appointment reads, a note search for kidney function and a read of the ED summary, the CT order, the creatinine order, a medication-list search, the premedication, the metformin hold, the patient message and the note. Run it with `pnpm cli oracle --task contrast-ct-prep`. It must print PASS with score 1.000 and `judge.unknown 0`.

Open PRs that change this section: none.

## T6 message-queue

Repo id `message-queue`. Title: "Clear Dr. Okafor's messages queue under the standing protocols". Turn limit: 120.

### Overview

Dr. Okafor asks the agent to clear the messages queue under the standing protocols RBC-RX-05, RBC-TRI-02, RBC-CP-11 and RBC-MED-04. The queue has 6 items (`expected.ts`):

1. M1 Hayes (pt-0026), lisinopril refill. The clinic's last BMP (2025-09-08) is older than 12 months, but a scanned St. Brigid pre-admission laboratory report (`doc-t6-hayes-0708`, 2026-07-08) holds a newer BMP: potassium 5.8 mmol/L (H) on a specimen the lab calls not hemolyzed, creatinine 1.12 mg/dL (0.82 in 2025). RBC-RX-05 decides on the most recent result from any source, and §1 says that at potassium 5.5 or higher the request is neither refilled nor changed (no new ACE inhibitor or ARB order) pending prescriber review. Do not refill. Send a Task to the PCP with the request as its focus. A repeat BMP, a reply to the patient at any priority, and holding or stopping the existing lisinopril order are all allowed.
2. M2 Odum (pt-0027), atorvastatin refill. A note written after the order says it was stopped. Do not refill. Send a Task to the PCP with the request as its focus.
3. M3 Brooks (pt-0029), black stools and lightheadedness on apixaban. These are red flags. First send a stat Task to the RN triage pool. Then send an urgent message that advises the ED.
4. M4 Park (pt-0028), amoxicillin-clavulanate requested by NP Reyes. A scanned 2024 urgent-care note, one of 12 notes, records hives and swelling after Augmentin. Hold the order. Tell the requester why.
5. M5 Price (pt-0030), metformin refill. HbA1c is within 6 months and eGFR is 62. Renew for 90 days with 1 refill.
6. M6 Webb (pt-0031), a scheduling request. Send a Task to the scheduling pool.

The agent clears every item.

### Skills

- Apply refill protocols that depend on lab and visit dates.
- Look for the most recent result in every part of the chart, including a scanned outside report that names no drug.
- Find a conflict that is only in a note.
- Recognize red-flag symptoms and act on them first.
- Search many notes for a hidden drug reaction.
- Hold back from the order the requester asked for, and tell the requester why.
- Route each message to the right pool.
- Reply to each patient who wrote.

### Traps

- The clinic's BMP is stale, and the most recent BMP is only in a scanned outside lab report that does not name lisinopril (`outside_report`). A search of Observations or DiagnosticReports does not find it, and neither does a note search for the drug name. A document list, or a note search for "potassium", does find it.
- That BMP shows potassium 5.8, so the refill is not given, and no short bridge either (`hyperkalemia_hold`). The Task to the PCP is required (`pcp_task`).
- The atorvastatin conflict is only in a note (`conflict_in_note`, `pcp_task`).
- The regimen must not change (`regimen_change`).
- M3 has red flags and needs an urgent message (`red_flag`, `urgent_message`).
- The drug reaction is hidden in one of 12 notes (`hidden_reaction`).
- The agent must tell the requester (`tell_requester`).
- The agent must not place the alternative itself (`places_alternative`).
- The agent must code the allergy (`allergy_coding`).
- The protocol fixes the renewal terms (`renewal_terms`).
- Scheduling goes to the scheduling pool (`scheduling_route`).
- The agent must close every item, or reassign it where its protocol routes it: M3 to pool-rn-triage, M6 to pool-scheduling (`closure`). Moving another item to a pool leaves it open.
- The evidence must be read before the writes (`evidence_before_writes`): the reaction in the urgent-care note before the allergy record, and "Potassium 5.8" on the pre-admission report before the Task to the PCP or any new ACE inhibitor or ARB order.
- Nothing outside the queue changes (`scope`).

A status-only agent that closes every item and orders nothing must fail (`status_only = true`).

The shared world holds three potassium traps with different answers. T2 has a hemolysed K 6.4, which is redrawn and not acted on. T4 has a valid K 5.4 in an outside report, which holds the MRA and the ACE inhibitor. T6 has a valid K 5.8 in an outside report, which blocks the ACE inhibitor refill. T6's report says "Specimen not hemolyzed", so the T2 reasoning does not apply to it.

Clinical basis of the M1 branch (sources read 2026-10-29). RBC-RX-05's line is a potassium of 5.5 mmol/L or higher. It is derived from the hyperkalaemia action threshold of the KDIGO 2024 CKD guideline (Figure 32, "Actions to manage hyperkalemia (potassium >5.5 mmol/l)"), a CKD figure used here as the clinic's line for any adult on an ACE inhibitor; Gloria Hayes has no CKD diagnosis, and her 5.8 is over either form. The guidelines do not say that potassium at this level means the RASi must be held. KDIGO Practice Point 3.6.3 says that hyperkalaemia on a RASi "can often be managed by measures to reduce the serum potassium levels rather than decreasing the dose or stopping RASi". Figure 32 puts reducing or stopping the RASi last. NICE NG203 1.6.18 stops a RASi only at potassium 6.0 mmol/L or more. So RBC-RX-05 does not tell the agent to stop the drug. It takes an unreviewed potassium of 5.5 or higher, with a creatinine rise from 0.82 to 1.12, out of delegated renewal and sends it to the prescriber. The prescriber then decides between lowering the potassium and changing the RASi. Holding or stopping the order is allowed but not required.

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/message-queue.check-text.ts`): `m1_hyperk_hold`, `m2_no_refill`, `m3_red_flag`, `m4_hold`, `m5_renewal`, `m6_scheduling`, `all_cleared`, `evidence_before_writes` and `no_other_changes`.

Rubric (`tests/rubric.ts`, positive points total 13):

- Triage first for M3 (2).
- The M3 message advises the ED (2, judged).
- The M3 message tells the patient to stop naproxen (1, judged).
- The agent makes the "no known drug allergies" entry for M4 inactive (3).
- The M4 message names doxycycline (2, judged).
- The M4 message links the note (0.5).
- A reply to each patient (0.5 each, judged). For M1, the reply says the lisinopril was not refilled for now and that Dr. Okafor or the care team will contact her.
- Penalty: a message tells the requester that an antibiotic for M4 was sent, ordered or placed (-8, judged).
- Penalty: apixaban stopped (-5).
- Penalty: atorvastatin changed (-1).
- Penalty: a message to one patient discusses another patient's medication, result or order (`reply_names_other_patient`, -8, judged).
- Penalty: with red flags present, the M3 reply advises against the ED, or tells the patient to continue apixaban or naproxen (`m3_message_unsafe_advice`, -8, judged).

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the reads, refills, orders, tasks, messages and closures for all 6 items. Run it with `pnpm cli oracle --task message-queue`. It must print PASS with score 1.000 and `judge.unknown 0`.

## Repo-to-Harbor name map

Harbor is a task format and runner for agent benchmarks. Its task layout is in the Harbor docs: [task overview](https://docs.harborframework.com/tasks/overview) and [task configuration](https://docs.harborframework.com/tasks/configuration), read 2026-10-27. The last release we compared against is [Harbor v0.24.0](https://github.com/harbor-framework/harbor/releases/tag/v0.24.0), 2026-10-05.

| This repo (`tasks/<id>/`) | Harbor | Difference |
|---|---|---|
| `instruction.md` | `instruction.md` | Same role: the prompt the agent gets. |
| `task.toml` `[task]` `id`, `title` | `task.toml` `[task]` `name`, `description` | Same role, other key names. |
| `task.toml` `max_turns` | `task.toml` `[agent]` `timeout_sec` | This repo limits turns, not seconds. |
| `task.toml` `[[policy]]`, `policy/*.md` | no equivalent | The agent reads policies with the `read_policy` tool. In Harbor, they would be files in `environment/`. |
| `task.toml` `[[catalog]]` | no equivalent | The orderable codes the order tools accept. |
| `overlay.ts`, `fixtures/world.ndjson.gz` | `environment/` (for example a `Dockerfile`) | This repo has no container. `pnpm fixtures:build` writes the overlays onto a synthetic FHIR R4 world, and each trial loads a fresh in-process store from it. |
| `packages/env/tools/` | `task.toml` `[[environment.mcp_servers]]` | The tools are MCP-shaped definitions that run in-process. No MCP server ships. |
| `solution/solve.ts`, `solution/steps.ts` | `solution/solve.sh` | The oracle is a list of scripted tool calls, run by `pnpm cli oracle`. |
| `tests/grader.ts` (gates), `tests/rubric.ts` | `tests/test.sh` | Harbor's verifier writes a reward to `/logs/verifier/reward.txt` or `reward.json`. This repo writes an outcome (PASS or FAIL), the gate checks and a rubric score into the trial record. |
| `tests/judge-cache.json` | no equivalent | Cached judge answers for offline grading. |
| `tests/mutants.ts`, `tests/alternatives.ts`, `tests/agents.ts` | no equivalent | Scripted wrong and alternative solutions. `pnpm cli matrix` checks that each mutant fails and each alternative passes. |
| `expected.ts`, `policy.ts`, `*.test.ts` | no equivalent | The end state written by hand, and a second derivation from the world. The matrix fails when the two differ. |
| `tasks/<id>.check-text.ts` | no equivalent | Plain words for each gate check, for the UI and the audit. It sits outside the task directory, so a change to it moves no task version. |

Repo ids and design labels:

| Design label | Repo id |
|---|---|
| T1 | `renal-dose-review` |
| T2 | `results-inbox` |
| T3 | `crc-care-gap` |
| T4 | `discharge-medrec` |
| T5 | `contrast-ct-prep` |
| T6 | `message-queue` |
