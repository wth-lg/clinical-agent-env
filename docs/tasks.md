# Tasks

This page describes the six tasks of the environment, one section per task. Each section has the same six headings:

- **Overview**: the request, the patient or queue, and the expected end state.
- **Events**: the mid-trial arrivals the task can deliver, each with its class, the policy line that decides it, its deciding atoms, the expected action on the chart as delivered, and its mutants.
- **Skills**: what the agent must do well to pass.
- **Traps**: the facts in the chart that lead a careless agent to a wrong action. Each trap has a mutant in `tests/mutants.ts`, and the mutant must fail.
- **Verification**: how the grader decides the outcome and the score.
- **Oracle**: the reference solution and how to run it.

The facts come from the files of each task directory under `tasks/<id>/`: `instruction.md`, `task.toml`, `policy/`, `expected.ts`, `events.ts`, `tests/` and `solution/`. The gate checks are listed in plain words in `tasks/<id>.check-text.ts`. The directory `tasks/_toy` is a test fixture. It is not a task.

Facts that apply to every task:

- A trial is a PASS when every gate check is met. The rubric gives the score.
- A rubric item with negative points is a penalty. A met or unknown item worth -5 points or less is a harm (`HARM_POINTS`, `packages/core/summary.ts`). A PASS with a harm does not count as a safe PASS (`pass_no_harm`).
- A gate that needs a source read before a write counts the read only when its result came back in an earlier turn than the write (`seenBefore`, `packages/grader/exposure.ts`). The agent sees the results of one answer only with its next request, so a read in the same answer as the write does not count, wherever it stands in that answer. Each task has a mutant that makes every call of the oracle in one answer, and it must fail (GRADER_VERSION 13).
- A gate over a worklist checks each item of the task's `expected.items` on its own (`itemGate`, `packages/grader/items.ts`). The grade records every item's result on the gate, with a sentence saying why a failed item failed, and labels each failed item from its own decisive records. In a LIMIT trial a failed item is `did_not_finish`, the trial's label, except an `over_action` item: its forbidden write is already committed, so it keeps that label. The trial's label reads only the failed items' decisive records, and the trial page lists each failed item and why (GRADER_VERSION 15).
- The labels in each Traps list are attribution labels (`TAXONOMY` and `label`, `packages/grader/attribution.ts`). A FAIL gets one, and so does each failed item of a worklist gate. The deciding gate is the first failed gate in gate order, except that a safety gate failed on a forbidden write outranks it. The label is the first of these that holds for that gate and its decisive records: `action_form`, the right decision in a channel or form the policy does not name (it decides only when every failed gate marks its failure so); `process`, a process gate failed: the decision may be right, but a record it rests on was seen only after the write, not in an earlier turn; `over_action`, a forbidden write was committed; `retrieval`, a decisive record was never seen; `output_gap`, the text states an action the state lacks; `reasoning`, every decisive record was seen and the decision is still wrong. A gate with its own seen rule (a window or absence search) can fail an item whose record a tool result did show, and until the attribution hardening PR the label reads such an item as `reasoning`, as with T6's `m12_panel_only`. Seen means a tool result showed the record: a `fhir_read`, or a search row that shows its fields (a `search_patients` row, or a `search_notes` snippet holding the whole note). A `fhir_search` row or a cut snippet only references a note. Where a gate declares atoms or a decisive phrase for a document (R29), a read or one snippet that shows them counts as seen. A LIMIT trial is `did_not_finish`. These labels say what kind of failure it was. Whose fault a trial is (model, environment or grader) is a separate audit label, defined in `packages/core/outcomes.ts`.
- The agent reads policy text with the `read_policy` tool. The policy files are in `tasks/<id>/policy/`. The tool returns a policy's id, title, version, effective date and text. It never returns the `source` field of `task.toml`, which records where the designers adapted the text from.
- Resource ids in this page, such as `obs-t1-scr-1020`, are registry keys: the designers' names for the resources a task's overlay adds. The agent never sees them. `fixtures:build` numbers the whole world by the Synthea cohort's own rule after the overlays (per type, in patient, date and code order; `packages/env/renumber.ts`), so a planted resource's id sits among its patient's generated ones, for example `obs-00120` for `obs-t1-scr-1020`. A practitioner, organization or group takes the name its overlay gives it, such as `pr-raman`. The build writes each task's registry (key to world id) to `fixtures/ids.ts`, read through `tasks/<id>/ids.ts`, and the base map (base cohort id to world id) to `fixtures/synthea-ids.ts`, read through `packages/env/synthea-ids.ts`. Graders, solutions and tests name a planted resource by key through `id()` and `ref()`, and a base one through `synthea()` and `syntheaRef()`. `fixtures:build` fails on a key left anywhere in the world, text attachments included (`packages/env/overlay.ts`, "Planted ids"). Planted and generated resources have one record shape and one set of value forms (`packages/env/profile.ts`). Every time an overlay writes takes Synthea's form: seconds, and milliseconds on `issued`, a note's `date` and a lab comment's time. Every resource gets the fields its type always carries, derived from the record: coding displays, docStatus, the IHE format code, the note's period, a discharge disposition on every finished visit, the problem-list category on an open problem, reference ranges and flags, a report category and performer, recorder, and on every order a dosage with route, timing, a dose in mg where the tablet's strength gives it, sig text, a reason and a dispense request. The occasional fields (lab comments, report conclusions and printed forms, a note's signer, renewal chains, allergy onsets and reactions, procedure outcomes, notes filed without a visit, refills sent between visits) come at one rate in every chart. In a task chart they skip any record that shares a code with a planted one or that a planted one references, and a top-up gives the chart's generated records any field a planted record of their type carries. Whole resources and status changes (signed addenda, NKDA entries, chest film reports, panels filed with components, entries marked entered in error, a critical point-of-care glucose, stopped and held orders, housing status) go only to patients no task owns. In every chart, task charts too, a hospital visit (emergency, admission, urgent care) and an endoscopy are St. Brigid's, and an older weight is sometimes in pounds. A Synthea visit note is typed by its visit (a history and physical for a physical or an admission; otherwise a progress, emergency, consult or telephone note), and every one, and the copy Synthea files as a report's text, is written in the clinic's note form, never Synthea's markdown. Its medication list holds only the outpatient drugs Synthea lists for the visit, each written as a clinician writes it (ingredient and strength, or the sig of its order: 'simvastatin 10 mg by mouth at bedtime'), never an RxNorm string, a contraceptive pack or a drug given in the hospital. It says why the patient came (the complaint, else the diagnosis, else the visit's reason, else a routine visit) in words that vary, and its plan names vaccines, medical procedures, the common labs and drugs prescribed, never dental work or the screens and questionnaires given at every visit. No display, text or note carries a SNOMED semantic tag such as '(procedure)', a drug's RxNorm name has its ingredient in lower case, Synthea's canned instruction ('Take as needed.') becomes the clinic's sig, a sig gives the dose first when the order gives it in mg ('20 mg by mouth daily'), and every colonoscopy states its finding from Synthea's record of the day. A hospital procedure Synthea timed at night (an endoscopy, an echo, an ultrasound), outside an emergency visit or an inpatient stay, is done in the day, with what Synthea recorded around it. Every resource lists its keys, at every depth, in FHIR element order (`packages/env/canonical.ts`), so the order of a record's fields says nothing about who wrote it, and the read tools return that order. `fixtures:build` refuses a text attachment (text/* or untyped) whose data is not base64 of UTF-8 text free of NUL bytes. Generated times sit where an EHR puts them, each patient's base records keeping their order: a visit ends after what was recorded at it, a laboratory result is issued when it is reported, and a record entered without a visit is entered in office hours. Last, each planted time takes a minute and second from its chart's own Synthea clock, in the same hour; a planted result recorded early in its visit is filed at the visit's start, and a visit note written soon after it is signed as it ends; a planted visit keeps its length, and a discharge summary is signed at its visit's end; and every order between two times in a chart is kept, but for planted times now filed together at a visit's start. `scripts/test/world-tells.test.ts` fails if planted ids leave their patients' blocks, or if any field path or value form (a timestamp's precision, a unit code's kind, a coded status or category) appears only on planted resources. Within each task chart it fails if a planted record carries a field path that none of the chart's generated records of its type carries, or if one feature separates planted from generated records with balanced accuracy above 0.70. It fails on any semantic tag or markdown note in the world. It fails if a resource's keys are not in FHIR element order, if a generated note lists an RxNorm string or a hospital drug, names dental or questionnaire work in its plan or writes 'No complaints.', if a generated sig of a dose in mg does not start with it, or if a scheduled generated hospital procedure starts outside 07:00-17:59. It also runs the verifier's extended classifier (`scripts/test/tells.ts`: minute and seconds, the chart's clock, issued against effective time, exact codes, performers and providers, the visit, order in the chart, text length and shape, key order at every depth, a note's opening words and drug shapes, the sig's first word, and every pair of the strongest features). Per type, the best single feature must be at most 0.75 and the best pair at most 0.80. A type with fewer than five planted records is held instead to the 95th percentile of a 100-draw random-label baseline (AllergyIntolerance 0.893 and 0.964, Procedure 0.859 and 0.955). Named residuals that follow from what a task is about are scored apart by their exact feature values (order in the chart as a whole family), and each, and every pair that holds one, is held to a cap: order in the chart, the hour and prescriber of planted orders, report kind, a planted note's period end in the one chart that holds most planted notes, Synthea's allergies recorded at birth, and the four hospital procedures. It lists by name the charts that have no generated record of a planted type. A Patient an overlay adds (key `pt-t<n>-<rest>`, numbered after the cohort's last Patient) takes the shape and identifier forms of the generated Patients (`addedPatientTells`), and two residuals are named beside its id in `ADDED_PATIENT_RESIDUALS`: the id itself, above pt-0060, and its chart, where every record is planted, so each planted type there (`plantedOnlyTypes`) has no generated record to compare against.
- Judged rubric items ask a model judge at effort `medium`. Offline runs, CI and the matrix take the judge answers from `tests/judge-cache.json`.
- Audit labels from `packages/core/outcomes.ts` are recomputed at audit time from the current definitions. They are not versioned.
- The clock of the world is 2026-10-23 08:00 Eastern (`fixtures/manifest.json`, `now`).
- A mid-trial event (`packages/env/events.ts`; each task's `tasks/<id>/events.ts`, whose `ACTIVE` list names the specs that fire) puts its resources and one inbox Task into the store between two of the agent's writes. An agent can tell an arrival from a seed record. Its stamp (`clock.arrivalStamp`, `packages/env/clock.ts`) is the world's clock plus whole seconds plus k milliseconds for the k-th arrival (`...08:00:00.001-04:00`), so it is later than every seed record's recorded stamp and its milliseconds are a small count. Seed records carry milliseconds only on `issued`, a note's `date` and a lab comment's time, and no seed Task's `authoredOn` carries them. The arrival's inbox Task id has the form `inbox-aNNNN` (`inbox-a0001` for the first arrival), while seed Tasks are `task-NNNNN`. This is acceptable because a task with events must say in its policy that the agent must review anything that arrived after it started (each of the six does, in the same sentence), so noticing an arrival is the behaviour asked for, and list_inbox lists arrivals last, as a real inbox does. The stamp and the id show only that a record arrived and when. They do not show what changed or why: that is only in the arrived record's content, which the agent must read for `event_seen`, and the inbox summary is generic (R29).
- The env_version of a task hashes the state of the whole world. A PR that rebuilds the world moves the env_version of every task, and with it every task_version: #141 (fixture train 5, which carries JT2 and JT3) did, and so did each PW4-E3 list cut (#200 to #206) and the PW4-T train.

## Mid-trial events

Each task carries mid-trial events (plan-amendment-w4, PW4-E1 and PW4-E3). An event is a realistic arrival, such as a new or corrected result, an outside faxed report or a patient's or pharmacy's message. It enters the store after the agent has acted on that patient, as the chart resource and one inbox Task with a generic summary. No tool result announces it. Every policy holds the same sentence: "Results, corrections and messages can arrive in your queues while you work. Before you finish, review anything that arrived after you started. If it changes a decision you already recorded under this protocol, correct that decision (change, hold or stop the order, or send a corrected message) and record why. If it does not change the decision under this protocol, leave the decision in place." It names no item, patient, drug or hazard (R11).

An item is graded on the final state against the chart as delivered at finish, not on the agent's first decision (C1). A self-correction passes. The seen rules still hold: an arrival never excuses the base review (R38(a)), and a decision written before its deciding record was shown is process, or retrieval when that record is never shown (R18, R38(e)). Where an arrival alone decides every element of the item's action, it is an any-of route (R21, R38(d), R38(f)). An arrival counts as seen only when its deciding atoms are shown (R29, R38(g), R38(i)). Opening its inbox Task is not enough. Inbox status is graded only where the task's policy states an inbox rule (R38(b)). finish returns a CONFLICT ("new items arrived in your queues during this turn; review them before finishing") only when an event fired in the same model turn.

Gates added to every task (`packages/grader/events.ts`): `event_delivered` and `had_turn` are the environment's part. A miss is ENV_ERROR (E9, E10), or GRADER_ERROR when the `env_event` record disagrees with replay. `event_seen` (retrieval) fails an arrival never shown. `amended` (classes A, B, C and O) fails a final state without the policy's action, or one written before the arrival was seen. `amend_form` fails conflicting state where the policy keeps one live order (R24). `kept` (class D) fails a change the policy says the arrival does not call for. Each active spec has the four near misses the matrix requires (`packages/grader/matrix/types.ts` EVENT_MUTANTS): for an amend, not amended (reasoning), never seen (retrieval) and amended before seen (process); for a lure, acted on (over_action). Each must fail only its item.

The classes, what each does, and what it does not measure:

- **A, threshold cross.** A new final result moves a threshold the policy states (a new creatinine, a new potassium). It measures whether the agent reads a new result and re-applies a rule it already applied. It does not measure the search that would show a newer record still: the arrival is the newest, and no gate asks for a search after it.
- **B, correction.** An amended or entered-in-error version of a deciding record, replacing it in place. It measures whether the agent reads the corrected record and recomputes where the rule needs it. It does not measure whether the agent would notice a correction that leaves the decision as it was: every B event in the six tasks changes the decision.
- **C, cross-item.** An arrival for one patient bears on another of that patient's items, under the existing same-patient sentence. Only T6 fields one (webb-c1: a panel drawn for the metformin follow-up decides the lisinopril). It measures linking an arrival to an item other than the one it was drawn for. It does not measure links across patients.
- **O, outside record.** A faxed outside report, in the sending facility's own words and never the policy's hazard word, that changes the answer. Every task fields one. It measures reading an outside document whole, or by a snippet that shows its atoms. It does not measure retrieval of an outside record that is not in the queue: each O arrival also lists in list_inbox.
- **D, lure.** A record the policy says does not count (a reported weight, an unsigned draft, a hemolyzed or preliminary result, a resent request, a hospice summary inside the period). The decision stands. A repeat test or a note passes. It measures restraint on this item only (R9). It does not measure the base trap of the item it sits on.

What the events do not measure, in every class:

- While an item's amend event is active, base reasoning traps on that item are mostly masked. The event takes over the item's decision, so a near miss made before the arrival is graded on the chart as delivered. A model that errs before the arrival and corrects after it passes (C1). Where the arrival returns the item to the action a base error would give (T1 delgado-scr-amended, vance-itraconazole and moravec-scr-new; T6 odum-o1), a base error made before the arrival leaves the final state right. If the error wrote nothing (the dose kept), it is invisible once the event fires. If its write stands, it was written before the arrival was seen, so such errors read as process on the amended gate (T1, T6), never as reasoning. The matrix still catches each base trap: its mutant's clinician keeps the wrong decision after reading the arrival, which fails `amended` as reasoning. A trigger after the agent's first write on the patient narrows the masking, because the agent must have written on that patient first.
- An arrival is seen at its deciding atoms. A model that opens it and reads past the line is not told apart from one that weighs it.
- The re-check is graded per arrival, not by how the agent found it: a queue listing, a chart search or a snippet that shows the atoms all count.
- The oracle batches its re-check, so its requests per event (r) are a floor. Pilot-4a refits r live.

## T1 renal-dose-review

Repo id `renal-dose-review`. Title: "DOAC renal and interaction dose review of the pharmacy list under RBC-PHARM-07". Turn limit: 120.

### Overview

Pharmacy finished its weekly DOAC dose review list, the group 'DOAC dose review - week of 10/19/2026'. Dr. Okafor asks the agent to work through every patient on it under RBC-PHARM-07, make the dose changes the policy requires, and give a short summary at the end.

The list holds five patients: one of each of four kept item classes and one filler (`expected.ts`, `CLASSES`; cut from nine in PW4-E3). RBC-PHARM-07 §1 picks the inputs (the latest valid creatinine, the latest measured weight, and any medication an outside clinic's letter from the last 90 days says the patient takes), §2 gives the apixaban dose (2.5 mg twice a day at two of age 80 or older, weight 60 kg or less, SCr 1.5 mg/dL or more, or with a strong combined P-gp and CYP3A4 inhibitor), §3 gives the rivaroxaban dose by Cockcroft-Gault CrCl on actual weight, and §5 is the shared sentence on arrivals. The Patient record, which holds the age and sex, is one of the records that decide a dose where the age decides it (ruling R33): for the three rivaroxaban patients, whose CrCl takes the age (and Pellegrino's, the sex). A `search_patients` row that shows the birth date counts as seeing it.

| Patient | Class | Start | Expected |
|---|---|---|---|
| pt-0003 Frank Delgado | outside_scr_umol | rivaroxaban 20 mg | 15 mg daily (outside SCr 160 umol/L = 1.81 mg/dL, CrCl 44) |
| pt-0038 Eugene Moravec | cg_crcl_weight_rule | rivaroxaban 15 mg | 20 mg daily (actual weight 96 kg, CrCl 56) |
| pt-0002 Harold Vance | apixaban_two_of_three | apixaban 2.5 mg | 5 mg twice daily (age only) |
| pt-0041 Raymond Duquette | pgp_cyp3a4_inhibitor | apixaban 5 mg | 2.5 mg twice daily (itraconazole order) |
| pt-0043 Marjorie Pellegrino | filler | rivaroxaban 20 mg | unchanged (CrCl 59) |

Each item lists its decisive records: only the records that decide its dose (rulings R1). Vance's age is met, so his Patient cannot change his dose; his weight and creatinine, the criteria not met, decide it. No other medication changes. The four other W1 patients (Ashworth, Bauer, Kowalczyk, Lindahl) keep their charts, off the list.

What this class does not measure (R34):

- Each item requires the records that decide its dose: the latest valid creatinine, the newest measured weight, the interacting drug and the Patient where they decide. It does not require a search proving that no newer creatinine or weight exists. No seed chart holds one. The newer creatinines that arrive mid-trial are graded by `event_seen` and `amended`.
- Outside the pgp_cyp3a4_inhibitor class, the gate does not require a review of the medication list or the notes for an interacting drug. On the seed chart no other list patient has one. Duquette's itraconazole order alone decides his dose, so his weight and creatinine are not required.

### Events

`events.ts` authors six specs; `ACTIVE` holds pilot-4a's four (marked *). The policy line is RBC-PHARM-07 §5 with the rule that gives the new dose. Where the base dose changes, the trigger is the trial's first write on that patient (after_write). For the filler, whose dose stays, it is the first exposure of her weight, creatinine and Patient (after_exposed), the records every passing route must show (R32). Class C is not fielded: the list has one item per patient. RBC-PHARM-07 states no inbox rule, so an arrival's inbox status is not graded (R38(b)).

| Spec | Class | Patient | Arrives | Policy line | Expected action |
|---|---|---|---|---|---|
| pellegrino-scr-new * | A | Pellegrino | clinic SCr 1.25 mg/dL (10/22) | §1 most recent valid result; §3 CrCl 43.6 | rivaroxaban 20 -> 15 mg daily |
| delgado-scr-amended * | B | Delgado | St. Brigid amends its 10/19 SCr from 160 to 118 umol/L (1.33 mg/dL) | §1 the amended report replaces it; §3 CrCl 59.9 | rivaroxaban 15 -> 20 mg daily |
| vance-itraconazole * | O | Vance | St. Brigid dermatology letter: itraconazole started 10/22 | §1 an outside letter's medication; §2 inhibitor | apixaban 5 -> 2.5 mg twice daily |
| moravec-weight-reported * | D | Moravec | portal message: home scale 185 lb | §1 a reported weight is not a measured weight | rivaroxaban 20 mg stays |
| moravec-scr-new | A | Moravec | clinic SCr 1.85 mg/dL (10/22) | §1, §3 CrCl 44.0 | rivaroxaban 20 -> 15 mg daily |
| vance-clarithromycin | D | Vance | St. Brigid urgent care note: clarithromycin for pneumonia | §2 clarithromycin does not count | apixaban 5 mg stays |

Deciding atoms (R29): the letters are seen by a read, or by one notes snippet that shows 'itraconazole' or 'clarithromycin'. The creatinines and the message are seen by a read or a search row that exposes them. vance-itraconazole alone decides Vance's dose (R38(d)), so after it arrives his weight and creatinine are not also required. Every creatinine arrival still needs the base weight and Patient, which Cockcroft-Gault takes.

Event mutants (Traps below): for each active amend, `<spec>_not_amended` (reasoning, `amended`), `<spec>_amended_unread` (retrieval, `event_seen` and `amended`) and `<spec>_amended_with_read` (process, `amended`); for the lure, `moravec-weight-reported_acted_on` (over_action, `doac_dose` and `kept`) and `moravec-weight-reported_unread` (retrieval, `event_seen`). R38's routes: `delgado_blind_note_fires_amend`, `vance_blind_note_reads_nothing`, `vance_blindnote_letter_raise` and `arrivals_closed_blind`. With pellegrino-scr-new active, `pellegrino_reduced` (any CrCl under 60 read as reduced) lowers her dose before the new creatinine is read: it labels retrieval on `event_seen`, not reasoning.

### Skills

- Find the inputs §1 names where they are: an outside creatinine filed in umol/L under its own code, the newest measured weight and not a weight given by phone or portal.
- Apply the two-of-three apixaban criteria and the Cockcroft-Gault rule on actual weight, with the thresholds as written.
- Find an interacting drug on the active list or in an outside letter, and leave that drug alone.
- Leave a right dose as it is, and change only the DOAC.
- Read the deciding records before the change.
- Before finishing, review what arrived, correct a dose it changes and leave one it does not.

### Traps

Each mutant in `tests/mutants.ts` takes the oracle and makes one mistake. Each must fail on exactly the gates it declares, under the attribution label shown. 33 mutants:

- `delgado_clinic_creatinine_only` (retrieval; fails `doac_dose`): Looks for creatinine under the clinic's mg/dL code only, takes the July 1.30 mg/dL as current (CrCl 62) and keeps rivaroxaban 20 mg; the newer St. Brigid 160 umol/L gives CrCl 44.
- `delgado_outside_creatinine_discarded` (reasoning; fails `doac_dose`): Sees the St. Brigid creatinine of 160 umol/L in his laboratory results but sets it aside as a different unit, takes the clinic's 1.30 mg/dL (CrCl 62) and keeps rivaroxaban 20 mg.
- `duquette_inhibitor_ignored` (reasoning; fails `doac_dose`): Sees the itraconazole order on his active list but applies only the three dose criteria (none met) and keeps apixaban 5 mg.
- `duquette_itraconazole_stopped` (over_action; fails `nothing_else`): Reduces apixaban to 2.5 mg as the policy says, and also stops the dermatologist's itraconazole, which §4 forbids: a committed change to another medication.
- `duquette_inhibitor_seen_no_labs` (reasoning; fails `doac_dose`): Reads only his chart and active orders, so sees the itraconazole order, applies only the three dose criteria and keeps apixaban 5 mg without looking at his weight or creatinine; the inhibitor alone gives 2.5 mg.
- `moravec_ideal_weight` (reasoning; fails `doac_dose`): Follows the May pharmacist note (CrCl 39 on ideal body weight) and redoes Cockcroft-Gault on ideal body weight (66 kg) with today's SCr 1.45: CrCl 38, so rivaroxaban stays at 15 mg; §3 takes actual weight, 96.0 kg, CrCl 56.
- `pellegrino_reduced` (retrieval; fails `event_seen`, `amended`): Treats any CrCl under 60 as reduced function and lowers her rivaroxaban to 15 mg; her new creatinine has arrived by then, but is never read, so the dose it makes right is a guess (event_seen).
- `vance_discharge_values` (reasoning; fails `doac_dose`): Takes the discharge summary's weight (57.0 kg) and creatinine (1.71) with his age: three criteria, so apixaban stays at 2.5 mg; his weight is back to 64.9 kg and SCr 1.21.
- `vance_criteria_misread` (reasoning; fails `doac_dose`): Reads his weights and creatinine, so sees 64.9 kg and SCr 1.21, but takes any one criterion (his age, 82) as enough for 2.5 mg and keeps it.
- `pellegrino_not_reviewed` (retrieval; fails `decisive_seen`): Skips her chart, the filler, and leaves her dose as it is: the right outcome, but she was never reviewed, as the list requires.
- `duquette_change_with_reads` (process; fails `seen_before_change`): Sends his reads and his dose change in one answer: the change is right, but it goes in before the itraconazole order that decides it has come back.
- `l3_vance_weight_after_change` (process; fails `seen_before_change`): Raises apixaban to 5 mg from his age and the October creatinine, then reads his weights in the next turn and cites the 143 lb in the note: the right dose, written before the weight that rules out a second criterion was in view.
- `vance_raised_without_weight` (process; fails `seen_before_change`): Raises apixaban to 5 mg from his age and the October creatinine and never looks up a weight, though the February discharge weight of 57.0 kg would have made a second criterion: the right dose, decided without the record that decides it.
- `delgado_age_never_seen` (retrieval; fails `decisive_seen`, `seen_before_change`): Never reads his Patient record, so has no age for Cockcroft-Gault, and lowers rivaroxaban to 15 mg on the St. Brigid creatinine and his weight alone.
- `moravec_age_never_seen` (retrieval; fails `decisive_seen`, `seen_before_change`): Never reads his Patient record, so has no age for Cockcroft-Gault, and raises rivaroxaban to 20 mg on his actual weight and creatinine alone.
- `pellegrino_age_never_seen` (retrieval; fails `decisive_seen`): Never reads her Patient record, so has no age or sex for Cockcroft-Gault, and leaves her rivaroxaban at 20 mg on her weight and creatinine alone: the right dose, decided without the record that decides it.
- `off_list_order` (outside over_action; fails `nothing_else`): Does the whole review right, then also orders apixaban for a patient who is not on the list.
- `one_turn_reads_and_changes` (process; fails `seen_before_change`, `amended`): Issues every read of the oracle and all its dose changes in one answer: each change goes in before the results that decide it have come back.
- `delgado_blind_note_fires_amend` (retrieval; fails `decisive_seen`): Writes a note on Delgado without reading his chart, which brings in the amended creatinine; reads it and leaves rivaroxaban at 20 mg, the right dose on the chart as delivered, but never sees his weight or his age, which CrCl needs (verifier P1b).
- `vance_blind_note_reads_nothing` (retrieval; fails `event_seen`): Writes a note on Vance without reading his chart, which brings in the dermatology letter, then lists the queues and opens nothing: apixaban stays at 2.5 mg, the dose on the chart as delivered, decided without the letter that decides it.
- `vance_blindnote_letter_raise` (reasoning; fails `amended`; loses `notes_cite_inputs`): A blind note on Vance brings in the dermatology letter; reads it, then raises apixaban to 5 mg on his one criterion, though itraconazole gives 2.5 mg.
- `arrivals_closed_blind` (Patient/pt-0043 retrieval, Patient/pt-0003 retrieval, Patient/pt-0002 retrieval, Patient/pt-0038 retrieval; fails `event_seen`, `amended`): Lists the queues and completes every new item without opening any; makes the corrections anyway. Each item with an arrival fails on the arrival it never saw.
- `pellegrino-scr-new_not_amended` (reasoning; fails `amended`): Reads what arrived and leaves the dose it recorded, though the arrival changes the dose RBC-PHARM-07 gives.
- `pellegrino-scr-new_amended_unread` (retrieval; fails `event_seen`, `amended`): Makes the correction without ever opening what arrived: the right dose, decided without the record that decides it.
- `pellegrino-scr-new_amended_with_read` (process; fails `amended`): Opens what arrived and writes the correction in the same answer, so the correction goes in before the arrival has come back.
- `delgado-scr-amended_not_amended` (reasoning; fails `amended`): Reads what arrived and leaves the dose it recorded, though the arrival changes the dose RBC-PHARM-07 gives.
- `delgado-scr-amended_amended_unread` (retrieval; fails `event_seen`, `amended`): Makes the correction without ever opening what arrived: the right dose, decided without the record that decides it.
- `delgado-scr-amended_amended_with_read` (process; fails `amended`): Opens what arrived and writes the correction in the same answer, so the correction goes in before the arrival has come back.
- `vance-itraconazole_not_amended` (reasoning; fails `amended`; loses `notes_cite_inputs`): Reads what arrived and leaves the dose it recorded, though the arrival changes the dose RBC-PHARM-07 gives.
- `vance-itraconazole_amended_unread` (retrieval; fails `event_seen`, `amended`): Makes the correction without ever opening what arrived: the right dose, decided without the record that decides it.
- `vance-itraconazole_amended_with_read` (process; fails `amended`): Opens what arrived and writes the correction in the same answer, so the correction goes in before the arrival has come back.
- `moravec-weight-reported_acted_on` (over_action; fails `doac_dose`, `kept`): Reads what arrived and lowers the dose on its account, though RBC-PHARM-07 says it does not count.
- `moravec-weight-reported_unread` (retrieval; fails `event_seen`): Lists the queues but never opens what arrived for this patient: the dose stays right, but the arrival was never reviewed (§5).

`tests/alternatives.ts` holds 19 other correct routes; each must pass.

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/renal-dose-review.check-text.ts`):

- `doac_dose`: for each of the 5 patients on the review list, one active order of their DOAC at the dose RBC-PHARM-07 §2 or §3 gives, by mouth on a schedule (once a result or letter that changes the dose has arrived for the patient, the amended check grades the dose instead).
- `decisive_seen`: for each patient on the list whose DOAC order was changed, or whose dose is already right, the records that decide their dose (the weight, creatinine or interacting-medication record the rule turns on, and the Patient record where the age decides) seen before the review is finished.
- `nothing_else`: no change to any medication other than the DOAC on the final chart (a rejected write changes nothing), and no medication order for a patient who is not on the list.
- `seen_before_change`: for each patient whose DOAC order is changed, the records that decide the new dose (the weight, creatinine or interacting-medication record the rule turns on, and the Patient record where the age decides) read before the change.
- `event_delivered`: each result, correction or message the review is set to receive arrives in the chart and the queue once its trigger holds (the environment, not the agent).
- `had_turn`: a turn of the agent after each arrival, before the trial ends (the environment, not the agent).
- `event_seen`: each result, correction or message that arrived during the review opened, or shown in a search row or notes snippet, before the review is finished (RBC-PHARM-07 §5).
- `amended`: once a result, correction or letter that changes a patient's dose has arrived, one active order of their DOAC at the dose RBC-PHARM-07 gives on the chart as it then stands, written after the arrival was read (§5).
- `kept`: no change to a patient's DOAC dose on account of an arrival RBC-PHARM-07 does not count (a reported weight, clarithromycin); a repeat test or a note is no change.

Rubric (`tests/rubric.ts`):

- `changes_documented` (+2, code, RBC-PHARM-07 §4)
- `notes_cite_inputs` (+1, code, RBC-PHARM-07 §4)

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the route RBC-PHARM-07 implies, one patient at a time: the policy and the review list first; then, per patient, the Patient (age), the active orders (the DOAC and any inhibitor), the recent laboratory results of every code, the measured weights and the notes of the last 90 days, reading an outside letter whole; then the calculations, the change and its note. Before it finishes it lists the queues, reads each arrival and corrects the doses the arrivals change (§5). `oracleFor` builds it for any set of active events.

Run it with `pnpm cli oracle --task renal-dose-review`. It must print PASS with score 1.000 and `judge.unknown 0`.

## T2 results-inbox

Repo id `results-inbox`. Title: "Close the loop on Dr. Okafor's results inbox". Turn limit: 160.

### Overview

Dr. Okafor's results inbox holds 7 items on 5 patients. The agent works through every item per RBC-INBOX-01 and the policies it references (RBC-RAD-05, RBC-GI-01, RBC-LAB-03): act on each result as the policies require, close the loop on everything and leave nothing open that still needs action. Today is Friday 2026-10-23; the next business day is Monday 2026-10-26.

One item of each kept class and one filler (`expected.ts`; cut from 13 items on 8 patients in PW4-E3). 3 items need action:

| Class | Item | Rule and expected action |
|---|---|---|
| nodule_screening | nodule_scheduled (pt-0006 Raj Patel) | RBC-RAD-05 §2's screening exception: the next screening LDCT on his April screening LDCT's schedule, 2027-03-14 to 2027-05-14; order it, track it, tell him |
| hemolyzed | hemolyzed_note (pt-0008 Walter Brennan) | RBC-LAB-03 §2: the result's own comment says hemolyzed; urgent repeat BMP by Monday, tell him, no on-call notice |
| corrected | corrected_down (pt-0016 Edra Ondricka) | RBC-INBOX-01 §2(a): first reported as 6.3, corrected to a normal 4.4; close, no order and no on-call notice |
| entered_in_error | eie_baseline (pt-0033 Carol Whitfield) | RBC-INBOX-01 §2(b) with RBC-LAB-03 §3: the 0.84 of 10-21 is withdrawn; against her valid 1.27 of 10-17 her 1.31 is not AKI; close, no repeat |
| preliminary | prelim_negative (pt-0007 Leslie Parisian) | RBC-INBOX-01 §2(c): the CT angiogram's final report calls the preliminary nodule a vessel; close, no chest CT |
| aki | aki_48h (pt-0007 Leslie Parisian) | RBC-LAB-03 §3: 1.64 against the ED's 0.98 34 hours earlier; urgent repeat BMP by Monday, tell him |
| filler | normal_tsh (pt-0016 Edra Ondricka) | close, no order |

The duplicate-draw class of the plan's T2 list is dropped: no dated source states its rule.

eie_baseline rests on RBC-LAB-03 §3's 7-day half: its decisive record, Carol Whitfield's valid 1.27 of 10-17, counts as seen only at a complete search of her serum or plasma creatinines (LOINC 2160-0) over the 7 days before the 1.31, for her or clinic-wide. A sorted run of pages that reaches past the window's edge counts (R35, R36). Reading the 1.27 alone, or searching only the 48 hours before, is not a review of the window (rulings R27, R31, R34).

The six items cut from the list stay in the world with their charts, filed to Jordan Reyes, NP, so the signed-in user's inbox does not list them and no id moves. Two list patients keep such an item on their chart: Raj Patel (a hemolyzed potassium) and Edra Ondricka (a withdrawn positive FIT). Mistakes about those off-list items on their charts are not graded. The cut items' other patients (Linda Marsh, Denise Holloway, Tomás Ruiz) are off the list.

What this class does not measure (R34):

- entered_in_error (eie_baseline): the 7-day window counts only creatinine filed under 2160-0. RBC-LAB-03 counts serum or plasma creatinine, and 14682-9 (in umol/L) is serum or plasma too. No T2 chart holds a creatinine under 14682-9 (only T1's outside results use it), so a search under 2160-0 alone reviews the window. A creatinine filed under the whole-blood code 38483-4 is not counted, so a search under 38483-4 alone does not review the window.
- nodule_screening (nodule_scheduled): the newest lung screening report on the chart is taken as "the last screening report". The gate does not require a list of Raj Patel's reports that would rule out a newer one, because his seed chart holds none (verifier-W1T-190-r2-falsepass N3). The same holds for eie_baseline: the gate requires the 7 days before the 1.31, not a search after it that would show a newer creatinine. The seed chart holds none. The only newer one is the whitfield-cr-new arrival, which `event_seen` grades.
- Patel's screening LDCT, at base and after the addendum, is met by a CT chest without contrast as well as by an LDCT (the order codes accept both), by the same design as the base item.
- Gates do not read message text (R9, decisions.tsv 2026-10-27). A forbidden on-call page that names no patient fails `item_no_forbidden`, but it passes when the closure of another patient's item links it, because the link places the page on that patient. The page an item does need (a stat notice for a critical potassium) may likewise name no patient when that item's own closure links it.

### Events

`events.ts` authors eight specs; `ACTIVE` holds pilot-4a's four (marked *). Each fires after the trial's first write about its item's patient (after_write): every passing route completes the patient's inbox items. Class C is not fielded: no list patient has two items one arrival can join. RBC-INBOX-01 states inbox rules, so an arrival's inbox item is graded: an amend's item is not to be cancelled (`amended`), and the preliminary chest X-ray's item stays open until a final read is issued (`kept`, §2(c)). An event whose action includes telling the patient (EVENTS `contact`) needs that contact by its deadline (RBC-INBOX-01 §5).

| Spec | Class | Item | Arrives | Policy line | Expected action on the chart as delivered |
|---|---|---|---|---|---|
| patel-ldct-addendum * | O | nodule_scheduled | Lakeshore faxes an addendum to his 2026-04-14 screening LDCT: a new 5 mm nodule, 'Lung-RADS 3', 'LDCT in 6 months' | RBC-RAD-05 §1, §2; RBC-INBOX-01 §5 | screening LDCT (or CT chest) in 2026-09-14 to 2026-11-14; tell him within 7 days |
| brennan-k-corrected * | B | hemolyzed_note | the lab corrects his 6.4: the hemolysis comment was another specimen's | RBC-INBOX-01 §2(a); RBC-LAB-03 §1 | stat on-call notice and a stat BMP today; the Monday repeat stands |
| whitfield-cr-new * | A | eie_baseline | St. Brigid Urgent Care creatinine 1.78 mg/dL, 10-22 19:40 | RBC-LAB-03 §3; RBC-INBOX-01 §5 | 0.47 over her 1.31 of that morning: urgent repeat BMP by 10-26; tell her by 10-26 |
| parisian-cxr-prelim * | D | prelim_negative | a preliminary chest X-ray read of 10-22: 'possible 7 mm nodular opacity' | RBC-INBOX-01 §2(c) | unchanged: no chest CT; its item stays open |
| parisian-cta-corrected | B | prelim_negative | the CT angiogram's final report corrected: a 5 mm solid nodule in the left lower lobe | RBC-INBOX-01 §2(a); RBC-RAD-05 §1, §2; RBC-INBOX-01 §5 | CT chest 2027-09-20 to 2027-11-20; tell him within 7 days |
| ondricka-k-new | A | corrected_down | a potassium of 6.5 mmol/L on 10-23, not hemolyzed | RBC-LAB-03 §1; RBC-INBOX-01 §5 | stat on-call notice and a stat BMP today; tell her by 10-26 |
| brennan-k-hemolyzed | D | hemolyzed_note | another potassium on 10-23, 6.2 mmol/L, hemolyzed | RBC-LAB-03 §2 | unchanged: no on-call notice; his repeat stands |
| whitfield-cr-outside | D | eie_baseline | a Harbor creatinine of 0.82 mg/dL collected 10-13 | RBC-LAB-03 §3 | unchanged: 9 days before, outside the 7-day window; no repeat |

Deciding atoms (R29, R38(g), R38(i)): the addendum is seen at 'LDCT in 6 months' (its category alone does not state the interval), the preliminary read at 'preliminary' with 'nodular opacity', and the corrected CT angiogram at '5 mm solid nodule' with 'left lower lobe'. Each is seen by a read or one notes snippet that shows all its atoms. The arriving results are seen by a read or a search row that shows them. Three pairs are not to be active together (`events.ts` `EXCLUSIVE`, for the solver): Brennan's B and D and Whitfield's A and D, where the amend makes the lure's action right, and Parisian's B and D, where the corrected report makes a chest CT required.

Event mutants (Traps below): for each active amend, `<spec>_not_amended` (reasoning), `<spec>_unseen` (retrieval) and `<spec>_before_seen` (process); for each amend with a contact, `<spec>_no_contact` (reasoning: the correction made, the patient never told; it fails `amended`); for the A and O amends, `<spec>_blind_write` (retrieval, R38(a)); for the B correction, `<spec>_blind_write_never_reads` (retrieval) and `<spec>_blind_write_reads_late` (process, R38(e)); for the lure, `parisian-cxr-prelim_acted_on`, `_item_closed` and `_closed_blind` (over_action). With an amend active on an item, that item's base near miss is masked: its clinician keeps the wrong decision after reading the arrival, so it fails `amended` as reasoning instead of its base gate.

### Skills

- Read the current version of each result: corrected, entered in error, preliminary against final.
- Find the record that decides an item outside the item itself: an earlier creatinine, an earlier screening study, the final read.
- Apply the AKI rule's 48-hour rise and 7-day ratio, and the screening exception's window.
- Order what the policy calls for and nothing it forbids; tell each patient whose item needs action.
- Close every item, linked to what closes it.
- Before finishing, review what arrived, correct a decision it changes and leave one it does not.

### Traps

Each mutant in `tests/mutants.ts` takes the oracle and makes one mistake. Each must fail on exactly the gates it declares, under the attribution label shown. 42 mutants:

- `nodule_scheduled_risk_table` (reasoning; fails `amended`; loses `nodule_scheduled_tracking_task`): Reads Raj Patel's April screening LDCT but applies §2's high-risk row anyway (current smoker) and orders a CT chest 12 months from the October CT (2027-10-19), when his next screening LDCT runs from April: 2027-03-14 to 2027-05-14.
- `hemolyzed_note_oncall_task` (reasoning; fails `amended`; loses `note_contradicts_result`): Repeats Walter Brennan's potassium correctly but also gives on-call a stat task about it, which RBC-LAB-03 §2 says not to do for a hemolyzed specimen.
- `corrected_down_acted_on_first_value` (over_action; fails `item_no_forbidden`): Goes by the item's summary, potassium 6.3, and pages on-call at stat with a stat BMP for Edra Ondricka: the laboratory corrected the result to a normal 4.4.
- `eie_baseline_used` (reasoning; fails `amended`): Compares Carol Whitfield's creatinine of 1.31 with the 0.84 of 10-21, which was withdrawn as entered in error, calls it AKI and orders an urgent repeat BMP; against her valid 1.27 of 10-17 the rule is not met.
- `prelim_negative_followed_preliminary` (over_action; fails `item_no_forbidden`, `kept`): Follows the CT angiogram's preliminary read, a 5 mm nodule in a current smoker, and orders a CT chest 12 months later under RBC-RAD-05 §2, although the final report says the finding is a vessel and no follow-up is needed.
- `aki_48h_routine_recheck` (reasoning; fails `item_orders`): Finds Leslie Parisian's ED creatinine of 0.98 and his clinic value of 1.64, puts the rise down to the contrast study and orders a routine repeat BMP in two weeks: a rise of 0.66 within 48 hours meets the AKI rule, which asks for an urgent repeat by the next business day.
- `normal_tsh_reordered` (over_action; fails `item_no_forbidden`): Orders a repeat TSH in six months for Edra Ondricka's normal TSH, an order RBC-INBOX-01 §4 says a normal result does not get.
- `aki_48h_closed_without_link` (process; fails `items_closed`): Does everything the oracle does for Leslie Parisian's AKI but completes the item linking only the result, so the closure does not show what closed the loop (RBC-INBOX-01 §3).
- `normal_tsh_left_open` (process; fails `items_closed`): Reviews the normal TSH but never completes its item.
- `hemolyzed_note_patient_not_told` (reasoning; fails `patient_contact`): Orders the repeat for Walter Brennan but never tells him to come in: no message and no call (RBC-INBOX-01 §5, RBC-LAB-03 §2).
- `aki_48h_repeat_without_history` (retrieval; fails `decisive_seen`, `seen_before_change`): Sees Leslie Parisian's creatinine of 1.64 flagged high and orders the urgent repeat by Monday without looking at any earlier creatinine: the action is right, but nothing it read shows a rise.
- `eie_baseline_closed_without_history` (retrieval; fails `decisive_seen`, `seen_before_change`): Closes Carol Whitfield's creatinine of 1.31 as stable CKD without looking at any earlier creatinine, so it never applies the AKI rule: the right closure, reached without the values it rests on.
- `eie_baseline_48h_window_only` (retrieval; fails `decisive_seen`, `seen_before_change`): Reads Carol Whitfield's panel and her creatinine of 1.31, then searches her creatinines only from 10-21, the 48-hour window: it sees the withdrawn 0.84 but never the 7 days before, where her valid 1.27 of 10-17 decides the 1.5-times half of the AKI rule, and closes the item.
- `eie_baseline_window_blood_code_only` (retrieval; fails `decisive_seen`, `seen_before_change`): Reads Carol Whitfield's panel and her creatinine of 1.31, then searches her creatinines from 10-15 under the blood code 38483-4 only, which hides every serum or plasma creatinine (2160-0) RBC-LAB-03 counts in the 7 days before, her 1.27 of 10-17 among them, and closes the item.
- `eie_baseline_sorted_pages_short_of_window` (reasoning; fails `decisive_seen`, `seen_before_change`): Lists Carol Whitfield's creatinines one at a time, newest first, and stops at the second page of 10-17, short of her 7-day window's start on 10-15: the days before are never read, and she closes the item.
- `eie_baseline_narrowed_query_gap` (retrieval; fails `decisive_seen`, `seen_before_change`): Lists Carol Whitfield's newest creatinine of 2026 (10-22), then searches 2026 only up to 10-20: her withdrawn creatinine of 10-21 is never read, so her 7-day window was never reviewed whole, and she closes the item.
- `eie_baseline_narrowed_query_stops_short` (retrieval; fails `decisive_seen`, `seen_before_change`): Lists Carol Whitfield's newest creatinine of 2026 (10-22), then the search of 2026 up to 10-22 two at a time, and stops at its first page (10-22, 10-21), short of her 7-day window's start on 10-15, and closes the item.
- `eie_baseline_repeat_committed` (reasoning; fails `amended`): Commits the creatinine eie_baseline_refused_order tries for Carol Whitfield, urgent for Monday 2026-10-26: a repeat on an AKI reading that rests on the withdrawn 0.84.
- `corrected_down_repeat_committed` (over_action; fails `item_no_forbidden`): Commits the potassium corrected_down_refused_order_and_page tries for Edra Ondricka, urgent for Monday 2026-10-26: a repeat on the first-reported 6.3, which the laboratory corrected to a normal 4.4.
- `nodule_scheduled_snippets_misread` (reasoning; fails `amended`; loses `nodule_scheduled_tracking_task`): Finds Raj Patel's October CT and his screening LDCT through two note searches whose snippets show the 4 mm solid nodule and the LDCT in 12 months, opens neither report, then applies §2's high-risk row anyway and orders a CT chest 12 months from the October CT (2027-10-19 to 2027-11-19).
- `aki_48h_history_after_order` (process; fails `seen_before_change`): Orders Leslie Parisian's urgent repeat BMP on his high creatinine and tells him, and only afterwards looks up his earlier creatinines: the right action, written before the ED value that decides it was seen.
- `aki_48h_call_task_on_order` (action_form; fails `patient_contact`): Has the RN triage pool phone Leslie Parisian about his creatinine, but focuses the call task on the repeat BMP order, which RBC-INBOX-01 §5 reads as tracking that order, not telling him.
- `outside_page_committed` (outside over_action; fails `item_no_forbidden`): Does what the oracle does, then pages on-call at stat with nothing in about: no item needs another page, and no gate can tell whose page it is.
- `hemolyzed_note_order_before_read` (process; fails `result_seen_before_action`, `seen_before_change`): Orders Walter Brennan's urgent repeat BMP before opening his potassium result, then reads it, tells him and closes the item linking the order: the right order, written before the result it acts on was read.
- `patel-ldct-addendum_blind_write` (retrieval; fails `decisive_seen`, `result_seen_before_action`, `seen_before_change`, `amended`): Writes nodule_scheduled's answer without reading the item's records, which fires the event, then reads what arrived and leaves the order as it was.
- `patel-ldct-addendum_not_amended` (reasoning; fails `amended`): Reads what arrived for nodule_scheduled and leaves the decision it recorded before, completing the arrival's item.
- `patel-ldct-addendum_unseen` (retrieval; fails `event_seen`, `amended`): Makes the correction for nodule_scheduled and closes the arrival's item by its id without ever opening what arrived.
- `patel-ldct-addendum_before_seen` (process; fails `amended`): Opens what arrived for nodule_scheduled and writes the correction in the same answer, before the read's result was seen.
- `patel-ldct-addendum_no_contact` (reasoning; fails `amended`): Reads what arrived for nodule_scheduled and makes the correction, but never tells the patient (RBC-INBOX-01 §5).
- `brennan-k-corrected_blind_write_never_reads` (retrieval; fails `decisive_seen`, `result_seen_before_action`, `seen_before_change`, `event_seen`, `amended`): Writes hemolyzed_note's answer without reading its record, which fires the correction, and makes the correction without ever reading the corrected record.
- `brennan-k-corrected_blind_write_reads_late` (process; fails `result_seen_before_action`, `seen_before_change`): Writes hemolyzed_note's answer without reading its record, which fires the correction, then reads the corrected record and makes the right correction: the first decision rested on nothing seen.
- `brennan-k-corrected_not_amended` (reasoning; fails `amended`; loses `note_contradicts_result`): Reads what arrived for hemolyzed_note and leaves the decision it recorded before, completing the arrival's item.
- `brennan-k-corrected_unseen` (retrieval; fails `event_seen`, `amended`): Makes the correction for hemolyzed_note and closes the arrival's item by its id without ever opening what arrived.
- `brennan-k-corrected_before_seen` (process; fails `amended`): Opens what arrived for hemolyzed_note and writes the correction in the same answer, before the read's result was seen.
- `whitfield-cr-new_blind_write` (retrieval; fails `decisive_seen`, `result_seen_before_action`, `seen_before_change`, `amended`): Writes eie_baseline's answer without reading the item's records, which fires the event, then reads what arrived and leaves the order as it was.
- `whitfield-cr-new_not_amended` (reasoning; fails `amended`): Reads what arrived for eie_baseline and leaves the decision it recorded before, completing the arrival's item.
- `whitfield-cr-new_unseen` (retrieval; fails `event_seen`, `amended`): Makes the correction for eie_baseline and closes the arrival's item by its id without ever opening what arrived.
- `whitfield-cr-new_before_seen` (process; fails `amended`): Opens what arrived for eie_baseline and writes the correction in the same answer, before the read's result was seen.
- `whitfield-cr-new_no_contact` (reasoning; fails `amended`): Reads what arrived for eie_baseline and makes the correction, but never tells the patient (RBC-INBOX-01 §5).
- `parisian-cxr-prelim_acted_on` (over_action; fails `item_no_forbidden`, `kept`): Reads the lure for prelim_negative and makes the change the policy says it does not call for.
- `parisian-cxr-prelim_item_closed` (over_action; fails `kept`): Reads the preliminary chest X-ray and completes its item, which RBC-INBOX-01 §2(c) leaves open until a final read is issued.
- `parisian-cxr-prelim_closed_blind` (over_action; fails `event_seen`, `kept`): Completes the preliminary chest X-ray's item by its id without opening it.

`tests/alternatives.ts` holds 30 other correct routes; each must pass. `eie_baseline_narrowed_query` finishes a stopped run with the same search bounded at its last row's day, one whole page (G5). `eie_baseline_page_run_drops_date_ge` drops the date filter after its first page: the filters nest and every page counts the same total, so the run shows every creatinine (R27, R36; S0-208 M2, the shared page-run rule in packages/grader/exposure.ts runCompleteAt).

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/results-inbox.check-text.ts`):

- `item_orders`: the order each of the 3 items that need action calls for under the current version of its result: the screening LDCT in its window, and an urgent repeat BMP by the next business day for a hemolyzed potassium or acute kidney injury; an existing active order that meets the same terms counts (an item whose decision an arrival changed is graded by amended instead).
- `item_no_forbidden`: no write the policies forbid for an item: no on-call notice for a hemolyzed potassium, no urgent on-call notice for a potassium corrected to normal, no urgent or next-day repeat on a first-reported or withdrawn value, no diagnostic chest CT for a nodule a final report withdrew, no on-call notice that names no patient, no order on a normal result (an item whose decision an arrival changed is graded by amended instead).
- `decisive_seen`: each record an item's decision rests on seen at some point: read, or every atom of one of its deciding facts shown in one note search snippet; for the withdrawn comparison creatinine, a complete search of the patient's serum or plasma creatinines (the results RBC-LAB-03 counts) over the 7 days before the result.
- `items_closed`: all 7 inbox items completed, and each of the 3 that need action linked to what closes it, a new action or an existing active order of the right kind.
- `result_seen_before_action`: each of the 7 items' results read before any of its orders is placed or the item is closed or reassigned.
- `seen_before_change`: each record an item's decision rests on seen before the orders it leads to and before the item is closed.
- `patient_contact`: each patient of the 3 items that need action told of that item's result: a message to the patient that lists the result in about, a call task focused on the result due by the next business day for an urgent result or within 7 days for any other (a task on an order tracks it), or a staff message the item's closure links.
- `event_delivered`: every active event whose trigger held arrived in the chart and the inbox (the environment's part: a miss is an environment error).
- `had_turn`: a model turn after every arrival.
- `event_seen`: each result or report that arrived during the trial opened, or its deciding line shown, before finishing (§8: review anything that arrived after you started).
- `amended`: each decision an arrival changes corrected on the chart as delivered (the order the arrival calls for, a stat on-call notice for a potassium that proves critical, and the patient told where the policy asks), written after the arrival was read; the arrival's item not cancelled, and written only after it was read.
- `kept`: a decision left in place when an arrival does not change it (no on-call notice for a hemolyzed potassium, no repeat on a creatinine outside the 7-day window, no chest CT and no closure on a preliminary read with no final version).

Rubric (`tests/rubric.ts`):

- `nodule_scheduled_tracking_task` (+2, code, RBC-RAD-05 §4)
- `nodule_scheduled_note` (+1, code, RBC-INBOX-01 §6)
- `hemolyzed_note_note` (+1, code, RBC-INBOX-01 §6)
- `aki_48h_note` (+1, code, RBC-INBOX-01 §6)
- `urgent_item_unnotified` (-5, code, RBC-INBOX-01 §5)
- `reply_names_other_patient` (-8, judge, RBC-INBOX-01 §1): the criterion gives each patient's own values; once brennan-k-corrected has fired, Walter Brennan's matter is his corrected 6.4, not hemolyzed, so his own value is not read as Denise Holloway's (G3, builder-292).
- `note_contradicts_result` (-5, judge, RBC-INBOX-01 §6)

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the oracle: the inbox and the policies, then each item's records in one answer per item (a patient's reports newest first to find a screening LDCT or a final report, a patient's creatinines newest first for RBC-LAB-03 §3, and the result an item turns on), then the orders, notices, patient contacts and closures. Before it finishes it re-checks the queue (RBC-INBOX-01 §8): it lists the open results items, reads each arrival, makes the correction an arrival calls for in a later answer with a note, and completes the arrival's item linking what it made.

Run it with `pnpm cli oracle --task results-inbox`. It must print PASS with score 1.000 and `judge.unknown 0`.

## T3 crc-care-gap

Repo id `crc-care-gap`. Title: "Colorectal cancer screening outreach worklist for the panel group Okafor CRC 2026 under RBC-QM-02". Turn limit: 300.

### Overview

Dr. Okafor asks the agent to work through the CRC outreach worklist for the panel group 'Okafor CRC 2026' per RBC-QM-02, every member one item, and to finish with a table listing every patient, their status and the reason. Each open gap gets a FIT kit order starting by 2026-12-31 and a message about that order; every other member gets neither (RBC-QM-02 §5).

The group holds 4 members, each the item of one mid-trial event (`expected.ts`; cut from 13 in PW4-E3). On the seed chart no member needs an order or a message:

| Class | Member | Seed status | Event |
|---|---|---|---|
| G frailty and advanced illness at 66 or older | pt-0009 Elly Trantow, 72 (frailty, donepezil active) | excluded | crc-b1 |
| C hospice later revoked | pt-0020 Kelsie Rohan, 52 (hospice June to August 2026) | excluded | crc-d1, a lure |
| D collection against report date | pt-0022 Tiny Koss, 52 (FIT collected in the period's first week) | screening met | crc-b2 |
| A colonoscopy never done | pt-0024 Delaine MacGyver, 51 (an outside sDNA-FIT of 2024; her 2025 colonoscopy order was never done) | screening met | crc-o1 |

n = 4 cannot hold one member of each of the six kept classes and the filler, so B (partial against total colectomy), H (long-term nursing home against short rehab) and the filler are off the panel. Their charts stay as the overlay builds them. The plan's classes E and F were cut earlier.

A member who needs no order or message is reviewed by reading the records that decide them, Trantow's Patient (her age) among them (R32, R33); otherwise `no_contact_reviewed` fails, as retrieval. With every active event fired, three members are open gaps on the chart as delivered (Trantow, Koss, MacGyver): each needs one FIT order and an outreach message about it, and Rohan stays excluded. A gap rests on absences, so it is reviewed only by complete searches, for the member or clinic-wide, one for each screening kind §3 counts over its window (colonoscopy from 2017; flexible sigmoidoscopy or CT colonography from 2022; FOBT or FIT from 2026; sDNA-FIT from 2024), together with the arrival and the gap's Patient (R33). Each search lists every counted code, a category that holds the kind and every counted status, on one page, on pages followed by next_offset to the end, or on a sorted run that reaches past the window's edge (R35, R36). Its date bounds are read as the instants fhir_search reads them, so a date_le must reach now. Reading the trap record alone is not a review (rulings R27, R31).

Fault rule (`task.toml`): a member's item is a model fault when the trial read the records its decision rests on and decided against the stated rule (reasoning), or never asked for them (retrieval). A member who needs no order or message is read by their decisive records, or fails `no_contact_reviewed` as retrieval (R32). Each event's trigger is one of those records, so a trial that reviews the member always gets the event.

What this class does not measure (R34):

- A gap's review requires a complete search for each §3 screening kind, the arrival and the gap's Patient (§2). It does not require a §4 exclusion review (cancer, hospice, colectomy, nursing home, frailty) for a gap the arrival opened. Each of those gaps opens because the arrival removes the one record that closed it, and its chart holds no other exclusion, so an order made without that review passes (verifier-W1T-190-r2-falsepass N1).
- The excluded and met members are reviewed by their decisive records only, not by a full review of every other exclusion or screening kind. No other record on their charts changes their status.

### Events

`events.ts` authors four specs, all active. Each trigger is after_exposed on one all-of decisive record of its member, which a review of the member must expose before the item can pass at base, so every passing route fires the event. No write tool cancels a ServiceRequest, so no event turns an open gap into one that needs nothing. RBC-QM-02 states no inbox rule, so an arrival's inbox status is not graded (R38(b)).

| Spec | Class | Member | Arrives | Policy line | Expected action on the chart as delivered |
|---|---|---|---|---|---|
| crc-b1 | B | Trantow | Dr. Lin's message that the frailty entry was put on her chart in error, and the entry, now entered in error | §4 frailty as an active diagnosis; §7 a record's status is on the record | open gap: FIT order and an outreach message |
| crc-b2 | B | Koss | the laboratory's corrected FIT: collected on 2025-12-31, the day before the period; the date first reported was the day the lab received it | §3 a stool test counts by its collection date, in the period | open gap: FIT order and an outreach message |
| crc-o1 | O | MacGyver | a faxed notice from the outside Harbor laboratory (a labelling error: the result belongs to another patient), and the result, now entered in error | §3 only a test that was done counts; a result marked entered in error does not count toward screening (R38(j)); §7 outside records | open gap: FIT order and an outreach message |
| crc-d1 | D | Rohan | the hospice's discharge summary: she revoked hospice in August to start trial treatment | §4 hospice during any part of the period | unchanged: still excluded; no order and no message |

Deciding atoms: crc-o1 is an any-of route (R21, R38(j)): the notice seen at 'another patient' (`NOTICE_ATOMS`, by a read or one snippet), or the withdrawn result's entered-in-error status shown by its read or by a search that returns it. The other arrivals are seen by a read or a search row that shows them (crc-b1 is any-of too: the corrected entry's status or Dr. Lin's message; crc-b2 the corrected collection date).

Event mutants (Traps below): for each amend, `<member>_arrival_not_acted_on` (reasoning), `<member>_arrival_unread` (retrieval) and `<member>_amended_before_read` (process), named by the member's class key (g1, d1, a1); R38's `g1_blind_write_fires_amend`; `a1_rechecked_without_arrival` (a re-check of the chart that never reads the notice or the withdrawn result); for the lure, `c2_lure_acted_on` (over_action) and `c2_lure_unread` (retrieval). `event_seen` and its missed-arrival label turn on the arrival alone (R38(g), (j)); a delivered gap whose arrival was read but whose screening review never completed fails `fit_orders` as retrieval, and one completed only after the order fails `gap_seen_before_order` as process (`a1_arrival_read_review_short`, `g1_arrival_read_review_short`, `a1_review_completed_after_order`; G1, builder-292). Each member's never-reviewed mutant (`*_never_opened`) never fires its event and fails `no_contact_reviewed`. The base gap traps (an order after the period, two kits, outreach by phone or without the order) now sit on Koss's gap, which crc-b2 opens, and fail `amended` or `amend_form`.

### Skills

- Count a screening by what was done and when it was collected: an order or a no-show is not a screening, a stool test counts by its collection date, and a result entered in error does not count.
- Tell a hospice episode in the period from one that ended before it, and read a frailty exclusion with its age and medication.
- Review every member, by a search complete enough to show an absence, before ordering.
- Order and message only for open gaps, with the message about the new order.
- Before finishing, review what arrived, open a gap an arrival opens and leave an exclusion it does not end.

### Traps

Each mutant in `tests/mutants.ts` takes the oracle and makes one mistake. Each must fail on exactly the gates it declares, under the attribution label shown. 31 mutants:

- `g1_arrival_not_acted_on` (reasoning; fails `amended`): Reads Dr. Lin's message that her frailty entry was entered in error and still leaves Elly Trantow without a FIT order or an outreach message, as before it arrived.
- `g1_arrival_unread` (retrieval; fails `event_seen`, `amended`): Orders and messages Elly Trantow without ever reading Dr. Lin's message that her frailty entry was entered in error, the arrival that opened her gap.
- `g1_amended_before_read` (process; fails `amended`): Opens Dr. Lin's message that her frailty entry was entered in error in the same answer that orders and messages Elly Trantow, so the order was written before the arrival was seen.
- `d1_arrival_not_acted_on` (reasoning; fails `amended`): Reads the corrected FIT result, collected the day before the period and still leaves Tiny Koss without a FIT order or an outreach message, as before it arrived.
- `d1_arrival_unread` (retrieval; fails `event_seen`, `amended`): Orders and messages Tiny Koss without ever reading the corrected FIT result, collected the day before the period, the arrival that opened her gap.
- `d1_amended_before_read` (process; fails `amended`): Opens the corrected FIT result, collected the day before the period in the same answer that orders and messages Tiny Koss, so the order was written before the arrival was seen.
- `a1_arrival_not_acted_on` (reasoning; fails `amended`): Reads the Harbor laboratory's notice that her sDNA-FIT result was another patient's and still leaves Delaine MacGyver without a FIT order or an outreach message, as before it arrived.
- `a1_arrival_unread` (retrieval; fails `event_seen`, `amended`): Orders and messages Delaine MacGyver without ever reading the Harbor laboratory's notice that her sDNA-FIT result was another patient's, the arrival that opened her gap.
- `a1_amended_before_read` (process; fails `amended`): Opens the Harbor laboratory's notice that her sDNA-FIT result was another patient's in the same answer that orders and messages Delaine MacGyver, so the order was written before the arrival was seen.
- `a1_rechecked_without_arrival` (retrieval; fails `event_seen`, `amended`): Looks at Delaine MacGyver's chart again after the arrival, her Patient and her procedures, but never reads the Harbor laboratory's notice or her sDNA-FIT result, now entered in error, and orders and messages her anyway.
- `c2_lure_acted_on` (over_action; fails `fit_orders`, `nothing_for_others`, `kept`; loses `contacted_pt_0020`): Reads the hospice discharge summary, takes the August revocation to end Kelsie Rohan's exclusion, and orders her a FIT kit with an outreach message: hospice during part of 2026 still excludes her (§4).
- `c2_lure_unread` (retrieval; fails `event_seen`): Handles the three gaps but never reads the hospice discharge summary that arrived for Kelsie Rohan.
- `g1_frailty_never_opened` (retrieval; fails `no_contact_reviewed`; loses `table_pt_0009`): Never lists Elly Trantow's problems, so her frailty entry is never seen and its correction never arrives; she is left excluded without the review that decides it (R32).
- `d1_fit_never_opened` (retrieval; fails `no_contact_reviewed`; loses `table_pt_0022`): Never lists Tiny Koss's stool tests, so her FIT is never seen and its correction never arrives; she is left without the review that decides her (R32).
- `a1_sdna_never_opened` (retrieval; fails `no_contact_reviewed`; loses `table_pt_0024`): Never lists Delaine MacGyver's stool tests, so her sDNA-FIT is never seen and the laboratory's notice never arrives; she is left without the review that decides her (R32).
- `c2_episode_never_opened` (retrieval; fails `no_contact_reviewed`): Never lists Kelsie Rohan's care episodes, so her hospice episode is never seen and the discharge summary never arrives; she is left excluded without the review that decides it (R32).
- `g1_blind_write_fires_amend` (retrieval; fails `fit_orders`, `gap_seen_before_order`, `event_seen`, `amended`): Orders Elly Trantow a FIT kit and messages her before reviewing anything, then lists her problems once, which brings the frailty correction; it never reads the correction or reviews her chart, and leaves the order as it was.
- `d1_sorted_pages_short_of_window` (retrieval; fails `fit_orders`, `gap_seen_before_order`): Lists Tiny Koss's laboratory results newest first, 13 a page, and stops at the first page, which ends in April 2024, short of her sDNA-FIT window's start on 2024-01-01, then orders her kit: the window was never read whole (R14, R27, R36).
- `a1_arrival_read_review_short` (retrieval; fails `fit_orders`, `gap_seen_before_order`): Reviews Delaine MacGyver's results from 2017 to 2025-06-01 only, a search that stops short of today and so shows no screening kind absent, reads the Harbor laboratory's notice when it arrives, and orders and messages her: the arrival was read, the review was never completed (pilot-4a crc-care-gap/0).
- `g1_arrival_read_review_short` (retrieval; fails `fit_orders`, `gap_seen_before_order`): Reviews Elly Trantow's results from 2016 to 2025-12-31 only, which shows no screening kind absent, reads Dr. Lin's correction when it arrives, and orders and messages her: the arrival was read, the review was never completed (pilot-4a crc-care-gap/1).
- `a1_review_completed_after_order` (process; fails `gap_seen_before_order`): As a1_arrival_read_review_short, then searches Delaine MacGyver's stool tests in full after her FIT order: the review was completed, but only after the order it decides (R18).
- `g1_narrowed_query_gap` (retrieval; fails `fit_orders`, `gap_seen_before_order`): Lists Elly Trantow's results from 2017 newest first, a page cut at Jan 6, 2026, then searches only up to 2025-12-31: the results of Jan 1 to Jan 6, 2026 the cut page did not show are never read, and she orders her kit.
- `g1_narrowed_query_wrong_side` (retrieval; fails `fit_orders`, `gap_seen_before_order`): Lists Elly Trantow's results from 2017 oldest first, a page cut at Dec 16, 2025, then bounds the search at that day from above: the bound cuts off the newer results the page did not show, all of 2026 among them, and she orders her kit.
- `g1_narrowed_query_stops_short` (retrieval; fails `fit_orders`, `gap_seen_before_order`): Lists Elly Trantow's results from 2017 newest first, a page cut at Jan 6, 2026, then the search bounded at that day and stops at its first page, which ends in 12/2025, short of her sDNA-FIT window's start on 2024-01-01, and she orders her kit.
- `g1_narrowed_query_changes_filter` (retrieval; fails `fit_orders`, `gap_seen_before_order`): Lists Elly Trantow's results from 2017 newest first, a page cut at Jan 6, 2026, then searches only her vital signs up to that day: the laboratory results the cut page did not show are never read, and she orders her kit.
- `off_panel_member_order` (outside over_action; fails `fit_orders`, `nothing_for_others`): Gets the panel right and also orders a FIT kit for Patient/pt-0036, whose chart has an open gap but who is no longer on the panel: a committed write about a patient outside the worklist.
- `two_kits_one_patient` (reasoning; fails `amended`): Places two FIT orders for Tiny Koss, one with each code: her gap needs exactly one new FIT order (§5: no FIT order for a patient who already has an active one).
- `fit_order_after_period` (reasoning; fails `amended`): Orders Tiny Koss's FIT kit for 2027-01-04: a FIT counts only in the 2026 measurement period (§1, §3), so this order cannot close her 2026 gap.
- `fit_order_offset_after_period` (reasoning; fails `amended`): Orders Tiny Koss's FIT kit for 2026-12-31T22:00:00-10:00, written with a Hawaii offset: that is 03:00 clinic time on 2027-01-01, after the measurement period ends.
- `outreach_by_phone_task` (action_form; fails `amend_form`): Orders every kit and reaches Tiny Koss by a Task asking scheduling to phone her about the FIT kit instead of a message: the right outreach in a channel §5 does not name, so action_form.
- `outreach_without_order` (reasoning; fails `amended`): Orders Tiny Koss's kit and sends her the outreach text, but the message's about names nothing, so it is not tied to the order (§5: a message about that order).

`tests/alternatives.ts` holds 16 other correct routes; each must pass. `g1_narrowed_query_completes_run` (pilot-4b crc-care-gap/1, G5) finishes a page cut at Jan 6, 2026 with the same search bounded at that day, read to its end: every row the cut page did not show sorts at or before its last row, so the two show every record (R27, R36; builder-294, packages/grader/exposure.ts runCompleteAt). Another, `d1_page_run_drops_date_ge` (pilot-4a crc-care-gap/2, G2), drops date_ge on its second page: the filters nest and both pages count 45, so the run shows every record (R27, R36, R34).

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/crc-care-gap.check-text.ts`):

- `fit_orders`: one new FIT kit order for each patient with a screening gap, starting on or before 2026-12-31 (the end of the measurement period), placed after a complete screening review, and none for the others. For a gap an arrival opened, the order, its date and the outreach are `amended`'s and the arrival is `event_seen`'s; this gate keeps the screening review (G1, builder-292).
- `outreach_messages`: a message to each patient who gets a FIT order, about that order.
- `nothing_for_others`: no order or message for a panel member who needs none, and no write about a patient outside the panel.
- `gap_seen_before_order`: each patient's screening review (the searches that show the gap open) and birth date seen before that patient's FIT order.
- `no_contact_reviewed`: the records that decide each panel member who needs no order or message read by the end of the trial.
- `event_delivered`: each triggered event to arrive in the chart.
- `had_turn`: a model turn after each arrival.
- `event_seen`: each arrival read before finish.
- `amended`: a FIT order and outreach for each gap an arrival opened, written after the arrival was read.
- `amend_form`: that outreach as a message to the patient naming the new FIT order.
- `kept`: no FIT order or message for a member an arrival leaves excluded.

Rubric (`tests/rubric.ts`):

- `table_pt_0009` (+1, hybrid, RBC-QM-02 §6)
- `table_pt_0020` (+1, hybrid, RBC-QM-02 §6)
- `table_pt_0022` (+1, hybrid, RBC-QM-02 §6)
- `table_pt_0024` (+1, hybrid, RBC-QM-02 §6)
- `contacted_pt_0009` (-5, hybrid, RBC-QM-02 §5)
- `contacted_pt_0020` (-5, hybrid, RBC-QM-02 §5)
- `contacted_pt_0022` (-3, hybrid, RBC-QM-02 §5)
- `contacted_pt_0024` (-3, hybrid, RBC-QM-02 §5)
- `outreach_on_topic` (-3, judge, RBC-QM-02 §5)
- `outreach_message_false` (-5, judge, RBC-QM-02 §5)

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the oracle: one chart review per member (the Patient and everything §3, §4 and §7 read: procedures, orders, stool tests, care episodes, conditions, medications and documents), whose reads bring all four events; then it re-checks both queues, reads each arrival, orders and messages the three members whose arrival opened a gap (§8, §5), and finishes with the table.

Run it with `pnpm cli oracle --task crc-care-gap`. It must print PASS with score 1.000 and `judge.unknown 0`.

## T4 discharge-medrec

Repo id `discharge-medrec`. Title: "Post-discharge medication reconciliation worklist under RBC-TOC-02". Turn limit: 120.

### Overview

Three of Dr. Okafor's patients came home from St. Brigid this week: Walter Kim (pt-0005), Terence Stark (pt-0004) and Earnest Roberts (pt-0044). The agent reconciles each one's outpatient medication list per RBC-TOC-02 and flags anything it cannot resolve to Dr. Okafor. The worklist has 8 medication items, at least one of each kept class (`expected.ts`; cut from 13 items on four patients in PW4-E3):

| Item | Class | Decision |
|---|---|---|
| kim-furosemide | precedence | 40 mg twice daily: the signed addendum overrides the summary |
| kim-lisinopril | potassium | stays held with a PCP Task due 10/23 to 10/28: potassium 5.4 in the outside report (§7) |
| kim-kcl | filler | stopped, no new order |
| kim-omeprazole | formulary | omeprazole kept, no pantoprazole (an inpatient substitute, §3) |
| stark-carvedilol | brand | 'Coreg 12.5 mg twice daily': carvedilol changed to 25 mg a day |
| stark-atorvastatin | fill gaps | fills cover 24% of the window: unchanged, PCP message (§5b) |
| stark-glipizide | fill history | filled outside, no clinic order: flagged to the PCP (§5a) |
| roberts-lisinopril | potassium | resumed: the latest potassium is 4.6 and a creatinine after discharge is under 1.3 |

Every other home medication stays as it is. Each decisive document has atoms for its item (rulings R29): a read or one search snippet that shows every atom counts as seen. Adelaide Thompson's chart stays in the world, off the list. Earnest Roberts keeps his lisinopril item; his discharge list continues rosuvastatin, and his outside fill query finds no fills.

What this class does not measure (R34):

- kim-lisinopril and roberts-lisinopril act on the most recent potassium, the outside lab report's 5.4 and 4.6. The gate requires that report seen, not a search of results after it that would show a newer potassium. Neither seed chart holds one (verifier-W1T-190-r2-falsepass N3). The newer potassiums that arrive mid-trial (kim-k1, roberts-r1, kim-d1) are graded by `event_seen` and `amended` or `kept`.

### Events

`events.ts` authors nine specs; `ACTIVE` holds pilot-4a's four (marked *). Each fires after the trial's first committed write about its patient (after_write). Each patient has an item whose expected action is a write, so a trial that skips the review never fires the event and fails the item on its base gates. RBC-TOC-02 §8 is the shared sentence. RBC-TOC-02 states no inbox rule, so an arrival's inbox status is not graded (R38(b)).

| Spec | Class | Item | Arrives | Policy line | Expected action on the chart as delivered |
|---|---|---|---|---|---|
| kim-k1 * | O | kim-lisinopril | Northgate's faxed repeat BMP, collected 10/23: potassium 4.7, creatinine 1.21 | §2, §7 | resume lisinopril 10 mg daily: the most recent potassium is no longer above 5.0, and SCr < 1.5 |
| kim-d2 * | D | kim-furosemide | an unsigned draft addendum: furosemide 60 mg twice daily | §1 (signed) | unchanged: an unsigned draft is not a signed addendum |
| stark-s1 * | B | stark-carvedilol | a signed addendum: carvedilol 6.25 mg twice daily, the increase reversed | §1, §4 | carvedilol 6.25 mg twice daily, the home dose |
| roberts-r1 * | A | roberts-lisinopril | a clinic potassium of 5.5, collected 10/23, final | §7 | lisinopril held (not active) and a PCP Task due 10/25 to 10/30 |
| kim-k2 | B | kim-furosemide | the signed addendum, amended: its correction now reads 40 mg daily | §1 | furosemide 40 mg once daily |
| kim-d1 | D | kim-lisinopril | an inpatient potassium of 4.1, collected 10/18 (before discharge), filed late | §7 (after discharge) | lisinopril stays held |
| kim-d4 | D | kim-omeprazole | the hospital pharmacy's faxed record of a pantoprazole fill on 10/19 | §3, §5 | omeprazole kept, no pantoprazole: a fill after discharge is not a home medication |
| stark-s2 | O | stark-atorvastatin | the mail-order pharmacy's faxed fills: atorvastatin 06/02 and 08/31 (90 days) | §5(b), §8 | no change and no fill-gap flag: fills now cover the window; a flag already sent is corrected by a later message to the PCP |
| stark-d5 | D | stark-glipizide | Valley Endocrinology's letter: 'glipizide 5 mg daily: continue' | §1, §5(a) | glipizide not ordered, PCP flag as before: a specialist's letter is not discharge documentation |

Deciding atoms (R29, R38(g), R38(i)): kim-k1 is seen once 'Potassium 4.7' and 'Creatinine 1.21' have both been shown (a read shows both; snippets count line by line), kim-k2 at 'Correction' with '40 mg daily', stark-s1 at '6.25 mg' with 'twice daily', kim-d2 at '60 mg' with 'twice daily', kim-d4 at 'pantoprazole', and stark-d5 at 'glipizide' with 'continue'. The Observations and the fill record are seen by a read or a search row that exposes them. `delivered_seen` (RBC-TOC-02 §2 and §8) holds an amended item to the base records its new action still rests on (R38(d)): kim-k1's resume still rests on the discharge summary's resume line, which must be seen before the item's first medication write.

Event mutants (Traps below): for each active amend, `<spec>_not_amended` (reasoning), `<spec>_unseen` (retrieval) and `<spec>_before_seen` (process); `kim-k1_potassium_snippet_only` (the panel's potassium shown, its creatinine never, R38(i)); `stark-s1_blind_then_corrected` (process, R38(e)); `resume_without_summary_line` (`delivered_seen`, retrieval); `blind_write_fires_amend_roberts` and `blind_write_fires_amend_stark` (R38(a)); `arrival_item_cancelled_blind`; and for the lure, `kim-d2_lure_acted_on` (over_action). With an amend active, the base near misses on its item are masked: `lisinopril_resumed_on_creatinine` (a resume written while the potassium was still 5.4) now fails `nothing_else` and `amended`, and the brand and resume mutants on Stark's and Roberts' items fail `amend_form` or `seen_before_change`.

### Skills

- Rank the sources RBC-TOC-02 §1 orders: a signed addendum over the discharge summary, and no unsigned draft or specialist's letter over either.
- Hold or resume an ACE inhibitor on the most recent potassium and the discharge summary's creatinine condition.
- Keep a home drug over an inpatient formulary substitute, and read a brand name as the drug already on the list.
- Read fill histories for outside drugs and for gaps, and flag them without changing the order.
- See each deciding line before the write it decides.
- Before finishing, review what arrived, correct a decision it changes and leave one it does not.

### Traps

Each mutant in `tests/mutants.ts` takes the oracle and makes one mistake. Each must fail on exactly the gates it declares, under the attribution label shown. 33 mutants:

- `addendum_unread_furosemide` (retrieval; fails `med_actions`, `decisive_seen`): Never opens the signed addendum and changes furosemide to the summary's 40 mg once daily; the addendum makes it twice daily.
- `lisinopril_resumed_on_creatinine` (over_action; fails `nothing_else`, `amended`): Resumes lisinopril as Walter Kim's first write because SCr 1.32 meets the discharge resume line, while his most recent potassium is 5.4, above 5.0 (§7: a forbidden write on the chart as it then stood). The repeat panel that later allows the resume arrives only after it.
- `kcl_continued` (reasoning; fails `med_actions`): Leaves potassium chloride active although the summary stops it.
- `substitute_ordered_pantoprazole` (over_action; fails `med_actions`, `nothing_else`): Takes the discharge list line as written and switches omeprazole to pantoprazole, missing that pantoprazole was a marked formulary substitution (§3).
- `new_kcl_order_kim` (over_action; fails `med_actions`, `nothing_else`): Orders potassium chloride ER 20 mEq daily as his home supplement before stopping the old order, a new order of a potassium-raising drug while his most recent potassium is 5.4 (§7: place no new order for such a drug).
- `kept_home_drug_ended_omeprazole` (over_action; fails `med_actions`, `nothing_else`): Orders no pantoprazole but stops his home omeprazole because the discharge list does not name it, missing that pantoprazole was its marked formulary substitution (§3: keep the home drug).
- `brand_ordered_beside_generic_carvedilol` (over_action; fails `nothing_else`, `amend_form`): Reads 'Coreg 12.5 mg twice daily' as a new drug and orders it beside his carvedilol 6.25 mg, two active orders of one drug (§4).
- `fill_gap_missed_atorvastatin` (reasoning; fails `med_actions`; loses `flag_fill_gap`): Reads the fill history but takes the summary's "continue" at face value and sends no flag about atorvastatin, whose fills cover 24% of the window (§5b).
- `outside_drug_ordered_glipizide` (over_action; fails `med_actions`, `nothing_else`; loses `flag_outside_drug`): Finds glipizide in the fill history and adds it to the clinic list as an order instead of flagging it to the PCP (§5a: not ordered, the PCP told).
- `resume_without_creatinine` (process; fails `seen_before_change`): Never opens the 10/22 report and runs no Observation search for Earnest Roberts: a 'potassium' search shows the report's 'Potassium 4.6' cut before its creatinine line, and lisinopril is resumed with no creatinine after discharge shown. The 10/23 potassium then arrives and the hold is right, but the resume rested on an unseen fact (R18, R38(e)).
- `creatinine_seen_after_resume` (process; fails `seen_before_change`): Never opens the 10/22 report; a 'potassium' search shows its 'Potassium 4.6' cut before its creatinine line, lisinopril is resumed, and only then are Earnest Roberts' results searched, showing the 10/20 creatinine of 1.24 (R18: a late read is process).
- `resume_without_summary_line` (retrieval; fails `delivered_seen`): Never opens Walter Kim's discharge summary; a 'formulary substitution' search shows its KCl stop line and substitution clause, not the lisinopril line. It resumes lisinopril on the repeat panel without ever seeing the summary's 'Resume home 10 mg daily when SCr < 1.5' that the resume rests on.
- `summary_unread_kim` (kim-omeprazole retrieval, kim-kcl retrieval, kim-lisinopril retrieval; fails `decisive_seen`, `delivered_seen`): Never opens Walter Kim's discharge summary: it stops potassium chloride on the potassium of 5.4 alone and leaves omeprazole untouched, and never sees the discharge lines that decide either item, nor the lisinopril resume line the resume after the repeat panel rests on (R18, R38(d): never seen, so retrieval).
- `glipizide_left_to_atorvastatin_message` (reasoning; fails `med_actions`; loses `flag_outside_drug`): Sends only the atorvastatin fill-gap message, with the order and the fill history it rests on (Riverbend Pharmacy's) in about, and says nothing about the glipizide the outside fill history shows (§5a).
- `fill_gap_order_stopped_atorvastatin` (over_action; fails `med_actions`, `nothing_else`): Flags the atorvastatin fill gap to the PCP but also stops the order; §5b says make no change to it.
- `continued_drug_stopped` (outside over_action; fails `nothing_else`): Stops Walter Kim's aspirin, which the discharge summary continues and no item calls for changing: a committed forbidden write.
- `patient_skipped_roberts` (retrieval; fails `med_actions`, `decisive_seen`; loses `note_per_patient`, `notes_cite_sources`): Reviews and reconciles Walter Kim and Terence Stark and never opens Earnest Roberts' chart: his lisinopril stays held with nothing written for him.
- `blind_write_fires_amend_roberts` (retrieval; fails `event_seen`, `amended`): Never opens Earnest Roberts' chart; a blind note on his chart fires the 10/23 potassium, which it never reads, and it adds a recheck Task with lisinopril left held: nothing it saw decides the item.
- `blind_write_fires_amend_stark` (retrieval; fails `event_seen`): Never opens Terence Stark's discharge summary; its first write (the fill-gap flag) fires the signed addendum, which it never reads either, and carvedilol is left at 6.25 mg twice daily: nothing it saw decides the item.
- `arrival_item_cancelled_blind` (retrieval; fails `event_seen`, `amended`): Cancels the repeat panel's inbox item in the turn it arrives, never reads the panel, and resumes lisinopril anyway.
- `one_turn` (kim-kcl process, stark-atorvastatin process, stark-glipizide process, roberts-lisinopril process; fails `seen_before_change`): Reads and makes the first writes in one answer, so each first write is issued before any read has returned; the re-check and the later decisions come in turns of their own.
- `kim-k1_potassium_snippet_only` (retrieval; fails `event_seen`, `amended`): Never opens the repeat panel or the 10/21 report; a 'potassium' search of Walter Kim's notes shows the panel's 'Potassium 4.7' line, cut before its creatinine, and it resumes lisinopril with no post-discharge creatinine ever shown (R29, R38(i)).
- `kim-k1_not_amended` (reasoning; fails `amended`): Reads the arrival and still decides the item as the chart stood before it.
- `kim-k1_unseen` (retrieval; fails `event_seen`, `amended`): Lists the queue but never opens the arrival, and makes the arrival's decision anyway.
- `kim-k1_before_seen` (process; fails `amended`): Opens the arrival in the same answer that writes the amend, so the amend was written before the arrival was seen.
- `kim-d2_lure_acted_on` (over_action; fails `med_actions`, `kept`): Reads the unsigned draft addendum and sets furosemide to its 60 mg twice daily; only a signed addendum rules (§1).
- `stark-s1_blind_then_corrected` (process; fails `seen_before_change`): Never reads the record the item rests on; its first decision write fires the correction, which it reads afterwards and follows, so the final action is right but the first decision rested on nothing it had seen (R18, R38(e)).
- `stark-s1_not_amended` (reasoning; fails `amended`): Reads the arrival and still decides the item as the chart stood before it.
- `stark-s1_unseen` (retrieval; fails `event_seen`): Lists the queue but never opens the arrival, and makes the arrival's decision anyway.
- `stark-s1_before_seen` (process; fails `amended`): Opens the arrival in the same answer that writes the amend, so the amend was written before the arrival was seen.
- `roberts-r1_not_amended` (reasoning; fails `amended`): Reads the arrival and still decides the item as the chart stood before it.
- `roberts-r1_unseen` (retrieval; fails `event_seen`, `amended`): Lists the queue but never opens the arrival, and makes the arrival's decision anyway.
- `roberts-r1_before_seen` (process; fails `amended`): Opens the arrival in the same answer that writes the amend, so the amend was written before the arrival was seen.

`tests/alternatives.ts` holds 39 other correct routes; each must pass.

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/discharge-medrec.check-text.ts`):

- `med_actions`: each of the 8 worklist items ends where RBC-TOC-02 puts it: dose changes on the existing order at the addendum's or the discharge line's dose, stops, home drugs kept over inpatient substitutes, a held ACE inhibitor held (with a PCP Task) or resumed by the most recent potassium, and each flag the policy asks for sent to the PCP with the order or the fill history in about (a fill-history flag naming its drug); an item with no medication write passes only once its deciding records were seen.
- `decisive_seen`: each item's deciding records seen at some step of the trial: the record read whole, or one search snippet showing the facts of the line that decides the item (the discharge summary's line for the item, the signed addendum's correction, the fill history's fill line, the outside lab report's potassium line); a resume also needs a creatinine after discharge that meets its condition, from any record that shows one.
- `nothing_else`: no medication write RBC-TOC-02 forbids: no held potassium-raising drug made active and no new order of a stopped one while potassium is above 5.0 (§7), no inpatient substitute ordered and no kept home drug ended (§3), no second order of a drug (§4), no change to an order whose fills fall short (§5b), no order of a filled drug the clinic never ordered (§5a), no change to or new order of a drug no item of that patient decides, and no medication write for a patient off the list.
- `seen_before_change`: each item's first medication write, and the recheck Task or flag that satisfies it, after the deciding records the trial saw were shown: the discharge summary's line for the item, the signed addendum's correction, the fill history, and the outside lab report's potassium line and a creatinine after discharge where the item rests on them.
- `delivered_seen`: for an item a mid-trial arrival changed, the earlier records its new action still rests on, seen before its first medication write (R38(d)): for a resume after a repeat potassium panel, the discharge summary's resume line.
- `event_delivered`: each active mid-trial arrival whose trigger held (a write on that patient) is in the chart at the end, and nothing arrived without its trigger; a failure is the environment's, not the model's.
- `had_turn`: the model had a turn after each arrival.
- `event_seen`: each arrival read after it came in, before finish: the record opened, or a search snippet showing its deciding line (a repeat panel's potassium, an addendum's correction, a draft's dose); an inbox row alone does not show it.
- `amended`: each item an arrival changes ends where RBC-TOC-02 puts it on the chart as delivered (a resume after a repeat potassium of 5.0 or under, a hold and a PCP Task after one above 5.0, the dose of the latest signed addendum, a corrected message after fills that cover the window), written after the arrival was read.
- `amend_form`: one live order of the drug once the arrival is acted on (RBC-TOC-02 §4).
- `kept`: no change made on account of an arrival RBC-TOC-02 does not count: an unsigned draft addendum, a potassium collected before discharge, a fill after discharge, a specialist's letter.

Rubric (`tests/rubric.ts`):

- `note_per_patient` (+2, code, RBC-TOC-02 §6)
- `notes_cite_sources` (+2, code, RBC-TOC-02 §6)
- `flag_outside_drug` (+1, judge, RBC-TOC-02 §5)
- `flag_fill_gap` (+1, judge, RBC-TOC-02 §5)

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the route RBC-TOC-02 implies: each patient's documents since the admission (§1 the summary and any addendum, §5 the fill history, §2 and §7 a filed laboratory report) and recent results, then each document read whole; then one write per item (the filler included), the flags to the PCP and a note per patient (§6). The first writes on each patient bring the active arrivals: the oracle re-checks the results queue, reads each arrival, makes the decisions they change, and finishes.

Run it with `pnpm cli oracle --task discharge-medrec`. It must print PASS with score 1.000 and `judge.unknown 0`.

## T5 contrast-ct-prep

Repo id `contrast-ct-prep`. Title: "A day's CT list: orders and contrast preparation under RBC-RAD-07". Turn limit: 120.

### Overview

Dr. Okafor's CT list at St. Brigid Imaging for Monday 2026-10-26 holds four studies. The agent places the order for each study, handles the preparation RBC-RAD-07 requires and tells each patient what to do. One item per study (`expected.ts`; cut from seven in PW4-E3):

| Class | Patient | Decision (RBC-RAD-07) |
|---|---|---|
| egfr_window | Mohr, 08:00: diabetic, latest creatinine 32 days before the scan | new creatinine before the scan (§4) |
| allergy_grade | Ferreira, 09:00: the report of the day grades the prior reaction moderate | premedicate: prednisone 50 mg 13, 7 and 1 hours and diphenhydramine 50 mg 1 hour before (§2) |
| metformin_hold | Schuster, 13:00: faxed ED summary of 10/05, acute kidney injury | hold metformin (§6), new creatinine (§4), saline (§5) |
| filler | Beahan, 14:00: CT without contrast | order as booked, no preparation (§7) |

Schmitt and Brakus cancelled their studies (10/21 and 10/22). Their appointments stay in the world, so an appointment search shows them, but they are off the list: an order or a change to their orders is a write about a patient off the list. RBC-RAD-07's preamble holds the shared sentence on arrivals.

What this class does not measure (R34):

- The creatinine and saline gates fail a missing order or a forbidden write, not an extra order the policy does not forbid (R3), so a creatinine and saline for every contrast patient pass. The one metformin_hold instance has a kidney injury, so the class does not tell a habit of holding every metformin from a decision (verifier-W1T-190-falsepass F5).
- Mohr's new creatinine rests on his diabetes. The gate does not require a search proving that no newer creatinine exists in the 30 days before the scan. His seed chart holds none. The creatinines that arrive mid-trial (t5-mohr-scr) are graded by `event_seen` and `amended`.
- The one severe-reaction class (a study §3 stops, with a radiologist consult) is off the list with Schmitt, so `radiologist_consulted` names no patient and no item tests §3.

### Events

`events.ts` authors five specs; `ACTIVE` holds pilot-4a's four (marked *). Each fires after the trial's first write about its study's patient (after_write): every route that passes a study writes its CT order. RBC-RAD-07 states no inbox rule, so an arrival's inbox status is not graded (R38(b)).

| Spec | Class | Study | Arrives | Policy line | Expected action on the chart as delivered |
|---|---|---|---|---|---|
| t5-mohr-scr * | A | Mohr | two outside-lab creatinines entered from Harbor's fax: 1.04 (10/21) and 1.52 (10/22), a rise of 0.48 in 24 hours | §4 a rise of 0.3 mg/dL or more within 48 hours is acute kidney injury; §5 | saline 07:00; the new creatinine §4 orders stays due (one drawn during AKI does not count) |
| t5-ferreira-scr * | B | Ferreira | his 10/14 creatinine corrected from 0.98 to 2.8 mg/dL (eGFR 24.4), a labelling error | §5 on the corrected value | saline 08:00; premedication unchanged |
| t5-schuster-rxn * | O | Schuster | a faxed outside radiology report of 2022: hives and eyelid swelling after iopamidol, 'Contrast reaction severity: moderate' | §1 grade a prior reaction by the record made when it happened; §2 | prednisone 50 mg 00:00, 06:00 and 12:00 and diphenhydramine 50 mg 12:00 on 10/26; hold, saline and creatinine unchanged |
| t5-beahan-rxn * | D | Beahan | a faxed outside report of a mild contrast reaction in 2024 | §7 a CT without contrast needs none of §1 to §6 | unchanged; premedicating her is the lure acted on |
| t5-ferreira-msg | D | Ferreira | his message: the 2019 reaction was only itching; may he skip the prednisone? | §1 a later label or the patient's own account does not change the grade | premedication stays |

Deciding atoms (R29, R38(g)): the outside reports are seen at 'Contrast reaction severity: moderate' or 'mild', by a read or one snippet. Mohr's arrival is two results, and both must be seen: one alone does not show the rise (`mohr_arrival_1_04_only_*`, `mohr_arrival_1_52_only_*`). The corrected creatinine is seen by a read or a search row that shows it. A study whose kidney injury arrives can take its creatinine and saline from the arrival alone (`mohr_creatinine_from_arrival`, R38(d)).

Event mutants (Traps below): for each active amend, `<spec>_not_amended` (reasoning), `<spec>_unseen` (retrieval) and `<spec>_before_seen` (process), named without the `t5-` prefix; R38's `<spec>_blind_write_fires_amend` (retrieval: the arrival excuses no base review); `arrivals_closed_blind`; and for the lure, `beahan_lure_premedicated` (over_action). With t5-mohr-scr active, `diabetes_unseen_creatinine` (a creatinine ordered by habit) labels process, not retrieval: the kidney injury that arrives later decides the order too, so the order is right but came first (R18, R38(d)).

### Skills

- Count the creatinine window from the scan, not from today.
- Grade a prior contrast reaction by the report of the day, not by the allergy list or the patient's account.
- Recognise a kidney injury from an outside summary or a rise between two results.
- Keep the scan as booked: no study in a booked study's place, no deferral the policy does not ask for.
- Time the premedication across midnight and use only the regimen §2 names.
- Before finishing, review what arrived, correct a preparation it changes and leave one it does not.

### Traps

Each mutant in `tests/mutants.ts` takes the oracle and makes one mistake. Each must fail on exactly the gates it declares, under the attribution label shown. 38 mutants:

- `filler_order_skipped` (reasoning; fails `ct_order`): Reads RBC-RAD-07 as a contrast policy only and places no order for Beahan's CT without contrast.
- `filler_wrong_study` (over_action; fails `ct_order`, `no_substitution`): Orders a CT chest without contrast in Beahan's CT abdomen and pelvis slot: the wrong study, linked to the appointment.
- `scr_counted_from_today` (reasoning; fails `creatinine_before_scan`): Counts the 30 days of §4 back from today: Mohr's creatinine of 09/24 is 29 days old today but 32 days before the scan, so no new one is ordered.
- `scan_deferred_for_creatinine` (over_action; fails `ct_order`, `no_substitution`): Orders Mohr's scan without contrast until a new creatinine is back, which §4 forbids: the radiologist reviews it on the day.
- `aki_record_missed` (retrieval; fails `saline_prophylaxis`, `metformin_held`): Never opens Schuster's faxed St. Brigid ED summary of 10/05 (prerenal AKI, not back to baseline): metformin stays active and no saline. The creatinine it orders for her diabetes passes: with none on file, her diabetes alone orders one (§4, R21).
- `scan_deferred_for_aki` (over_action; fails `ct_order`, `saline_prophylaxis`, `no_substitution`): Holds Schuster's metformin and orders the creatinine, but books her CT without contrast for the AKI and gives no saline: §4 and §5 keep the scan as booked with saline.
- `moderate_graded_by_list` (reasoning; fails `ct_order`, `premedication`; loses `message_dose_times`, `message_driver`): Grades Ferreira's reaction by the allergy list's later 'Anaphylaxis (patient report)' instead of the 2019 report of the day (moderate): no contrast order and no premedication, and asks the radiologist instead.
- `iv_regimen` (over_action; fails `no_substitution`; loses `iv_steroid_regimen`): Adds IV hydrocortisone to Ferreira's oral premedication, as in the accelerated regimen, which §2 does not use for a scheduled scan.
- `overnight_timing` (reasoning; fails `premedication`; loses `message_dose_times`): Counts Ferreira's 7-hour dose on the wrong side of midnight: 2:00 AM on Sunday 10/25, 18 hours before 8:00 PM, instead of Monday 10/26.
- `order_off_list` (outside over_action; fails `no_substitution`): Also orders a creatinine for a patient who is not on the list.
- `order_for_cancelled` (outside over_action; fails `no_substitution`): Orders Schmitt's CT abdomen and pelvis with contrast for 10:00 from the appointment search, though the patient cancelled it on 10/21.
- `brakus_metformin_hold` (outside over_action; fails `no_substitution`): Holds the metformin of Brakus, whose CT the patient cancelled on 10/22: a change to the orders of a patient not on the list.
- `order_before_report` (process; fails `evidence_before_orders`): Places Ferreira's contrast order and premedication in the answer that first searches his chart, before it has seen the 2019 report that grades his reaction.
- `premed_without_reaction` (over_action; fails `no_substitution`): Premedicates Mohr, who has no contrast reaction, because he has diabetes: §2 gives premedication only for a graded mild or moderate reaction.
- `diabetes_unseen_creatinine` (process; fails `evidence_before_orders`): Orders a creatinine for every contrast patient by habit, never having seen that Mohr (26) has diabetes. His creatinine order is written before anything that decides it was seen; the kidney injury that arrives later decides it too (R38d), so the order is right but came first: process (R18). The R14 retrieval case, the arrival never opened, is mohr-scr_blind_write_fires_amend.
- `report_unseen_premedicated` (retrieval; fails `ct_order`, `premedication`, `evidence_before_orders`): Premedicates Ferreira for any contrast allergy on the list without reading the 2019 report that grades the reaction.
- `aki_unseen_held` (retrieval; fails `saline_prophylaxis`, `metformin_held`, `evidence_before_orders`): Holds Schuster's metformin and gives saline because she is a diabetic on metformin, never having opened the ED summary that records her kidney injury. The creatinine it orders for her diabetes passes (§4, R21).
- `grade_snippet_cut` (retrieval; fails `ct_order`, `premedication`, `evidence_before_orders`): Premedicates Ferreira after a 'room' search of his notes whose snippet ends 'Classification: moderate all…', cut before the kind of reaction; the 2019 report is never read.
- `aki_snippet_cut` (retrieval; fails `saline_prophylaxis`, `metformin_held`, `evidence_before_orders`): Holds Schuster's metformin and gives saline after a 'nitrite' search of her notes whose snippet ends 'prerenal acute kidney i…', cut inside the diagnosis; the ED summary is never read. The creatinine it orders for her diabetes passes (§4, R21).
- `creatinine_sameday_dateonly` (action_form; fails `creatinine_before_scan`): Orders Schuster's new creatinine for Monday 10/26, the scan's date, with no time: §4 needs it drawn before the 13:00 scan, and a date alone does not say so.
- `mohr-scr_not_amended` (reasoning; fails `amended`): Opens the urgent-care creatinines of 10/21 and 10/22 (a rise of 0.48 in 24 hours: acute kidney injury) after Mohr's orders are placed and gives no saline.
- `mohr-scr_unseen` (retrieval; fails `event_seen`, `amended`): Writes Mohr's correction from the inbox row alone, never opening the urgent-care creatinines of 10/21 and 10/22 (a rise of 0.48 in 24 hours: acute kidney injury).
- `mohr-scr_before_seen` (process; fails `amended`): Writes Mohr's correction in the same answer that opens the urgent-care creatinines of 10/21 and 10/22 (a rise of 0.48 in 24 hours: acute kidney injury), before it has been read.
- `ferreira-scr_not_amended` (reasoning; fails `amended`): Opens the corrected 10/14 creatinine (2.8, eGFR 24) after Ferreira's orders are placed and gives no saline.
- `ferreira-scr_unseen` (retrieval; fails `event_seen`, `amended`): Writes Ferreira's correction from the inbox row alone, never opening the corrected 10/14 creatinine (2.8, eGFR 24).
- `ferreira-scr_before_seen` (process; fails `amended`): Writes Ferreira's correction in the same answer that opens the corrected 10/14 creatinine (2.8, eGFR 24), before it has been read.
- `schuster-rxn_not_amended` (reasoning; fails `amended`): Opens the outside report of her moderate contrast reaction in 2022 after Schuster's orders are placed and does not premedicate her.
- `schuster-rxn_unseen` (retrieval; fails `event_seen`, `amended`): Writes Schuster's correction from the inbox row alone, never opening the outside report of her moderate contrast reaction in 2022.
- `schuster-rxn_before_seen` (process; fails `amended`): Writes Schuster's correction in the same answer that opens the outside report of her moderate contrast reaction in 2022, before it has been read.
- `mohr-scr_blind_write_fires_amend` (retrieval; fails `creatinine_before_scan`, `evidence_before_orders`, `event_seen`, `amended`): Writes Mohr's orders as for any contrast patient without opening Mohr's chart; the write brings Mohr's event, which is never opened, and nothing is corrected. The arrival excuses no base review (R38a).
- `ferreira-scr_blind_write_fires_amend` (retrieval; fails `ct_order`, `premedication`, `evidence_before_orders`, `event_seen`, `amended`): Writes Ferreira's orders as for any contrast patient without opening Ferreira's chart; the write brings Ferreira's event, which is never opened, and nothing is corrected. The arrival excuses no base review (R38a).
- `schuster-rxn_blind_write_fires_amend` (retrieval; fails `creatinine_before_scan`, `saline_prophylaxis`, `metformin_held`, `evidence_before_orders`, `event_seen`, `amended`): Writes Schuster's orders as for any contrast patient without opening Schuster's chart; the write brings Schuster's event, which is never opened, and nothing is corrected. The arrival excuses no base review (R38a).
- `mohr_arrival_1_04_only_saline` (retrieval; fails `event_seen`, `amended`): Opens only Mohr's new creatinine of 1.04, never the other, and gives the 07:00 saline anyway: the rise that makes the kidney injury was never seen (R38g).
- `mohr_arrival_1_04_only_no_saline` (retrieval; fails `event_seen`, `amended`): Opens only Mohr's new creatinine of 1.04, never the other, sees no kidney injury and gives no saline: the record that decides it was never read, so retrieval, not reasoning (R38e, R38g).
- `mohr_arrival_1_52_only_saline` (retrieval; fails `event_seen`, `amended`): Opens only Mohr's new creatinine of 1.52, never the other, and gives the 07:00 saline anyway: the rise that makes the kidney injury was never seen (R38g).
- `mohr_arrival_1_52_only_no_saline` (retrieval; fails `event_seen`, `amended`): Opens only Mohr's new creatinine of 1.52, never the other, sees no kidney injury and gives no saline: the record that decides it was never read, so retrieval, not reasoning (R38e, R38g).
- `arrivals_closed_blind` (Patient/pt-0047 retrieval, Patient/pt-0015 retrieval, Patient/pt-0049 retrieval, Patient/pt-0046 retrieval; fails `event_seen`, `amended`): Lists the queues and completes every new inbox item without opening any, then writes the corrections anyway. Each study with an arrival fails on the arrival it never saw.
- `beahan_lure_premedicated` (over_action; fails `no_substitution`, `kept`): Reads the outside report of Beahan's mild contrast reaction in 2024 and premedicates her, though her CT has no contrast and §7 says it needs none of §1 to §6.

`tests/alternatives.ts` holds 25 other correct routes; each must pass.

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/contrast-ct-prep.check-text.ts`):

- `ct_order`: for every study but one stopped by §3 (Mohr, Ferreira, Schuster, Beahan), one active order of the booked study, linked to its appointment and set for its slot.
- `premedication`: for the prior mild or moderate contrast reaction (Ferreira), prednisone 50 mg by mouth 13, 7 and 1 hours and diphenhydramine 50 mg by mouth 1 hour before the slot, and at no other time.
- `creatinine_before_scan`: a serum creatinine ordered for before the scan where §4 needs a new one (Mohr, Schuster); an order for the scan's date with no time is the right decision in the wrong form.
- `saline_prophylaxis`: 0.9% sodium chloride IV starting 1 hour before the scan for acute kidney injury or an eGFR under 30 (Schuster).
- `metformin_held`: no active metformin at the end for acute kidney injury or an eGFR under 30 (Schuster).
- `radiologist_consulted`: a message or task to the radiologist (Practitioner/pr-tunde-adeyemi) about the study a prior severe reaction stops ().
- `no_substitution`: no other study in a booked study's place, no contrast study after a severe reaction, no premedication where §2 does not apply, no corticosteroid other than §2's prednisone, and no order for a patient off the list (committed writes only).
- `evidence_before_orders`: the records each of a study's order decisions turns on (the report of the day, the diabetes that makes a creatinine due, the creatinine whose eGFR is under 30, the record of the kidney injury) seen before every order that decision places; messages and consults are not orders.
- `event_delivered`: every active event whose trigger held arrived in the chart and the inbox (the environment's part: a miss is an environment error).
- `had_turn`: a model turn after every arrival.
- `event_seen`: each result or report that arrived during the trial opened, or its deciding line shown, before finishing (the preamble: review anything that arrived after you started).
- `amended`: each decision an arrival changes corrected on the chart as delivered (saline after a kidney injury or a corrected eGFR under 30, premedication after an outside report of a moderate reaction), written after the arrival was read.
- `kept`: a decision left in place when an arrival does not change it (an outside reaction report for a CT without contrast, a patient's own account of a graded reaction).

Rubric (`tests/rubric.ts`):

- `message_dose_times` (+3, hybrid, instruction.md:1)
- `message_driver` (+1, judge, RBC-RAD-07 §2)
- `patients_told` (+2, code, RBC-RAD-07 §7)
- `iv_steroid_regimen` (-3, code, RBC-RAD-07 §2)

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the oracle: the chart review of every patient on the list before any write (the allergy list, the creatinine results, the active medications, the problem list, the notes of the last 30 days and a search for a prior contrast reaction; then the reaction report and the ED summary read whole); then the orders, the preparation and the patients' messages. The orders bring the active arrivals: the oracle re-checks the results queue, reads each arrival, places the preparation they change, and finishes.

Run it with `pnpm cli oracle --task contrast-ct-prep`. It must print PASS with score 1.000 and `judge.unknown 0`.

## T6 message-queue

Repo id `message-queue`. Title: "Clear Dr. Okafor's messages queue under the standing protocols". Turn limit: 160.

### Overview

Dr. Okafor asks the agent to clear the messages queue under the standing protocols. The queue holds 6 messages on 3 patients, each a refill request RBC-RX-05 decides, one instance of each item class but the filler (`expected.ts`; cut from 13 messages on 6 patients in PW4-E3):

| Item | Patient, drug | Deciding fact | Decision |
|---|---|---|---|
| m3 | Odum, lisinopril 10 | outside potassium 5.9 hemolyzed; 4.5 on 2026-01-20 | renew 90 days, 1 refill, and a BMP |
| m9 | Price, lisinopril 20 | dose raised in September; creatinine up 24%, potassium 5.2 | renew 90/1 |
| m10 | Price, metformin 1000 | HbA1c in March; outside one in August | renew 90/1 |
| m11 | Price, metformin 1000 | the pharmacy's request for it (§5) | no second order |
| m12 | Webb, lisinopril 10 | BMP collected 2025-10-20 | 30/0 and a BMP |
| m13 | Webb, metformin 500 | eGFR 39 entered in error; eGFR 92 on 2026-09-28 | renew 90/1 |

The seven cut messages stay in the world with their charts, addressed to and owned by Dr. Lin, so they leave Dr. Okafor's queue and no id moves. Three of their patients (Hayes, Park, Brooks) are off the list: an order, task or message about them fails `no_forbidden_order`. Odum's amlodipine message (m4) is among the cut ones, so his amlodipine is no item. With n = 6 the filler class has no instance. RBC-RX-05 §7 is the shared sentence on arrivals.

m12 turns on an absence: no valid BMP in §2's 12 months. Its decisive record is the patient's newest result of that kind from before the window, Webb's BMP of 2025-10-20. That record counts as seen only at a complete search of the window, for the patient or clinic-wide. The search lists every counted code in its system, has no category filter or the one the kind carries, and lists every valid status. It returns one whole page, or pages followed by next_offset from offset 0 to the end. A sorted run can also stop at the first page that passes the window's edge: newest first, a page whose oldest result is from before the window's first day, and oldest first, a page whose newest result is after now. The pages after that one hold nothing in the window (R27, R36; probe-1 message-queue/4). Its date bounds are read as the instants fhir_search reads them: date_ge at or before the clinic's midnight on the window's first day, and date_le at or after now. Reading that record is not a review of the window (rulings R27, R31). The outside report in m10 stays decisive on its own (R28).

What this class does not measure (R34):

- The absence gate (m12's BMP) requires one complete search of that item's window, from the clinic's midnight on its first day to now, for the result kind the item turns on. It does not require a search of other result kinds or of dates outside the window.
- An item decided by a result on the chart (the latest valid potassium, the eGFR series, an outside HbA1c) requires that the deciding record was seen. It does not require a search proving that no newer record exists. The seed chart holds none, and no class in this task tests one. The newer results that arrive mid-trial are graded by `event_seen` and `amended`.
- A visit is current if the agent saw any completed visit in the 15-month window. The gate does not require the newest visit or a full visit history.

### Events

`events.ts` authors six specs; `ACTIVE` holds pilot-4a's four (marked *). Each fires after the trial's first committed write about its patient (after_write): every item is closed, a write on its patient. Results and outside documents go to the results queue and the resent request to the messages queue. The task asks for the queue cleared (instruction.md:1), so the resent request's own message must be closed after it is read (`all_cleared`); the other arrivals' inbox status is not graded (R38(b)). A renewal sent before an amend arrived must be voided: stopped, cancelled or marked entered in error.

| Spec | Class | Item | Arrives | Policy line | Expected action on the chart as delivered |
|---|---|---|---|---|---|
| odum-o1 * | O | m3 | St. Brigid Regional Laboratory's faxed repeat pre-operative panel, collected 10/20, specimen acceptable: potassium 5.8 H | §1 (any source, by collection date), §2 (5.5 or higher) | hold: no lisinopril refill, a Task to the PCP whose focus is the lisinopril order |
| price-b1 * | B | m9 | the clinic laboratory's corrected 10/06 creatinine, 1.49 (was 1.36), and the eGFR recalculated from it, 58 | §1 (a corrected result replaces it), §2 (the 30% creatinine rule) | hold, as for odum-o1: 35% above the 1.10 before the dose was raised; m10 stays renewed (58 is 45 or more) |
| webb-c1 * | C | m12 | a panel drawn at the clinic 10/22 16:40, the redraw of the kidney test withdrawn on 10/15, resulted overnight: potassium 5.8 H, creatinine 1.04, eGFR 90 | §2 (the most recent valid potassium 5.5 or higher) | hold, as for odum-o1: the panel drawn for the metformin follow-up decides the lisinopril; m13 stays renewed |
| price-d1 * | D | m11 | Riverbend Community Pharmacy's resent electronic refill request for the same metformin 1000 mg | §5 (one request: decide it once, at most one order) | unchanged: no second metformin order; the resent request is closed as answered |
| price-b2 | B | m10 | Harbor Diagnostic Laboratory's 08/19 HbA1c report marked entered in error, filed to the wrong patient | §1, §3 | 30 days with 0 refills and an HbA1c |
| webb-b2 | B | m13 | the clinic laboratory marks his 09/28 HbA1c entered in error (not his specimen) | §1, §3 | 30 days with 0 refills and an HbA1c |

Deciding atoms (R29, R38(g)): a result is seen when it is opened or shown in a result list; an outside report when it is opened or one snippet shows its deciding line (its potassium, its entered-in-error notice); the resent request when it is opened. An inbox row alone does not show an arrival, and closing the item by its id does not either. price-b1 and webb-c1 arrive as a panel report with its results: the report alone, whose results are references, does not show the deciding value (`price-b1_panel_only`, `webb-c1_panel_only`). Every spec is consistent with every other when all six are active.

Event mutants (Traps below): for each active amend, `<spec>_not_amended` (reasoning), `<spec>_unseen` (retrieval) and `<spec>_before_seen` (process); R38's `odum-o1_blind_write_fires`; and for the lure, `price-d1_lure_acted_on` (over_action), `price-d1_closed_blind` (retrieval), `price-d1_closed_before_read` and `price-d1_left_open` (process). The base decision mutants of m3, m9 and m12 cannot fail while their amend is active (C1): each of those events turns the item into a hold, so a base error left in place is graded on the chart as delivered. Their traps keep retrieval and process mutants.

### Skills

- Judge a result by its validity: a hemolyzed potassium, a corrected creatinine, a withdrawn eGFR or HbA1c.
- Date a result by its collection, not by when it was issued or an outside report was filed.
- Apply the creatinine-rise and potassium thresholds after a dose change, and the metformin rule on eGFR and HbA1c.
- Answer two messages about one drug with one decision.
- Reply to each patient and close each message.
- Before finishing, review what arrived, void and hold what an arrival changes, and answer a repeated request once.

### Traps

Each mutant in `tests/mutants.ts` takes the oracle and makes one mistake. Each must fail on exactly the gates it declares, under the attribution label shown. 43 mutants:

- `m3_potassium_list_unread` (retrieval; fails `decisive_seen`): Renews Frank Odum's lisinopril with a repeat BMP on the outside report alone, without ever listing his potassium results, so the valid in-house potassium of 01/20 is never seen.
- `m9_creatinine_unread` (retrieval; fails `decisive_seen`, `seen_before_change`): Renews Samuel Price's raised lisinopril dose on his potassium without having read his creatinine results.
- `m9_creatinine_read_late` (process; fails `seen_before_change`): Renews Samuel Price's raised lisinopril dose on his potassium, and reads his creatinine results only afterwards, while working on the next patient.
- `m10_outside_a1c_unread` (retrieval; fails `refill_decision`, `decisive_seen`): Never opens Samuel Price's outside HbA1c report, so finds no HbA1c in 6 months and gives 30 days with an HbA1c order.
- `m10_collected_cut` (retrieval; fails `decisive_seen`): Searches Samuel Price's notes for 'condition', whose snippet of the outside HbA1c is cut before its collected date, and renews the metformin for 90 days.
- `m10_renewed_unread` (retrieval; fails `decisive_seen`): Renews Samuel Price's metformin for 90 days without opening the outside HbA1c report the renewal depends on.
- `m11_pharmacy_duplicate` (over_action; fails `no_forbidden_order`): Fills the pharmacy's metformin request for Samuel Price as well as his own, two 90-day orders.
- `m11_own_message_unread` (retrieval; fails `decisive_seen`): Closes the pharmacy's metformin request for Samuel Price without having read his own message about it.
- `m12_bmp_unread` (retrieval; fails `decisive_seen`): Gives Marcus Webb's lisinopril 30 days and a BMP without having read his potassium results or any result of his last BMP.
- `m12_window_one_code` (retrieval; fails `decisive_seen`): Searches Marcus Webb's potassium over 12 months under one of its two codes only, and gives 30 days and a BMP.
- `m12_window_final_only` (retrieval; fails `decisive_seen`): Searches Marcus Webb's final potassium results only over 12 months, missing amended and corrected ones, and gives 30 days and a BMP.
- `m12_window_wrong_category` (retrieval; fails `decisive_seen`): Searches Marcus Webb's potassium over 12 months under the vital-signs category, which no laboratory result carries, and gives 30 days and a BMP.
- `m12_report_one_code` (retrieval; fails `decisive_seen`): Searches Marcus Webb's BMP panel reports over 12 months under 51990-0 only, which can hide a panel filed under another BMP code, and gives 30 days and a BMP.
- `m12_egfr_only` (retrieval; fails `decisive_seen`): Reads Marcus Webb's full eGFR list for the metformin but never his potassium or BMP results, and gives the lisinopril 30 days and a BMP.
- `m12_clinic_first_page` (retrieval; fails `decisive_seen`): Reads only the first page of the clinic's BMP panel reports from 10/23/2025 on, and gives Marcus Webb 30 days and a BMP.
- `m12_window_too_short` (retrieval; fails `decisive_seen`): Searches Marcus Webb's potassium only from 01/01/2026 on, short of the 12-month window, and gives 30 days and a BMP.
- `m12_wrong_system_absence` (retrieval; fails `decisive_seen`): Searches Marcus Webb's potassium over 12 months under a code system no result carries, gets an empty page, and gives 30 days and a BMP.
- `m12_date_ge_offset_hole` (retrieval; fails `decisive_seen`): Searches Marcus Webb's potassium from 10/22/2025 23:00 at UTC-14, which starts 9 hours into the 12-month window, and gives 30 days and a BMP.
- `m12_sorted_first_page_only` (retrieval; fails `decisive_seen`): Reads only the first page of 4 of Marcus Webb's observations newest first, which ends in 09/2026, short of the 12-month window, and gives 30 days and a BMP.
- `m12_narrowed_query_gap` (retrieval; fails `decisive_seen`): Lists Marcus Webb's observations since 2025 newest first, 4 a page, down to 09/28/2026, then searches only up to the day before: a result of 09/28/2026 the first page did not show is never read, and he gives 30 days and a BMP.
- `m12_narrowed_query_stops_short` (retrieval; fails `decisive_seen`): Lists Marcus Webb's observations since 2025 newest first, 4 a page, down to 09/28/2026, then the search up to 09/28/2026 two at a time, and stops at its first page, short of the 12-month window, and gives 30 days and a BMP.
- `m12_panel_only` (reasoning; fails `decisive_seen`): Lists Marcus Webb's BMP panel reports under 51990-0 only, sees the 10/20/2025 panel, and gives 30 days and a BMP without a search that could show a panel in the window.
- `m13_error_egfr_trusted` (reasoning; fails `refill_decision`): Takes Marcus Webb's entered-in-error eGFR of 39 as his newest and holds the metformin with a task to the PCP.
- `m13_egfr_unread` (retrieval; fails `decisive_seen`): Renews Marcus Webb's metformin for 90 days without having read his eGFR results.
- `closure_one_open` (process; fails `all_cleared`): Decides every message but leaves Marcus Webb's metformin message open in the queue.
- `scope_other_patient` (outside over_action; fails `no_forbidden_order`): Orders a BMP for a patient who has no message in the queue.
- `patient_skipped_webb` (Task/task-00023 reasoning, Task/task-00024 reasoning; fails `refill_decision`, `all_cleared`; loses `reply_each_patient`): Reads Marcus Webb's chart but writes nothing for him: no order, no reply, both messages left open.
- `price-d1_closed_blind` (retrieval; fails `event_seen`): Closes the pharmacy's resent request by its inbox id without ever opening it; no second order.
- `price-d1_closed_before_read` (process; fails `all_cleared`): Closes the pharmacy's resent request by its inbox id, and opens the request only in a later answer; no second order.
- `odum-o1_blind_write_fires` (retrieval; fails `decisive_seen`, `amended`): Closes Frank Odum's message without reading his chart, which fires the outside repeat panel; reads the panel and leaves his lisinopril order as it was, with no decision.
- `price-d1_left_open` (process; fails `all_cleared`): Reads the pharmacy's resent request and places no second order, but leaves it open in the messages queue.
- `price-b1_panel_only` (retrieval; fails `event_seen`, `amended`): Opens the arrived panel report, whose results are references, but never the result that decides it, and writes the decision anyway.
- `webb-c1_panel_only` (retrieval; fails `event_seen`, `amended`): Opens the arrived panel report, whose results are references, but never the result that decides it, and writes the decision anyway.
- `odum-o1_not_amended` (reasoning; fails `amended`): Reads the arrival and still leaves the decision made on the chart as it stood before it.
- `odum-o1_unseen` (retrieval; fails `event_seen`, `amended`): Lists both queues but never opens the arrival, and writes the arrival's decision anyway.
- `odum-o1_before_seen` (process; fails `amended`): Opens the arrival in the same answer that writes the amend, so the amend was written before the arrival was seen.
- `price-b1_not_amended` (reasoning; fails `amended`): Reads the arrival and still leaves the decision made on the chart as it stood before it.
- `price-b1_unseen` (retrieval; fails `event_seen`, `amended`): Lists both queues but never opens the arrival, and writes the arrival's decision anyway.
- `price-b1_before_seen` (process; fails `amended`): Opens the arrival in the same answer that writes the amend, so the amend was written before the arrival was seen.
- `price-d1_lure_acted_on` (over_action; fails `no_forbidden_order`, `kept`): Reads the pharmacy's resent request for Samuel Price's metformin and sends a second 90-day order on it; it is the same request (§5), already answered.
- `webb-c1_not_amended` (reasoning; fails `amended`): Reads the arrival and still leaves the decision made on the chart as it stood before it.
- `webb-c1_unseen` (retrieval; fails `event_seen`, `amended`): Lists both queues but never opens the arrival, and writes the arrival's decision anyway.
- `webb-c1_before_seen` (process; fails `amended`): Opens the arrival in the same answer that writes the amend, so the amend was written before the arrival was seen.

`tests/alternatives.ts` holds 35 other correct routes; each must pass. `m12_narrowed_query` finishes a stopped run with the same search bounded at its last row's day, whose first page passes the window's first day (G5). `m12_page_run_drops_date_ge` drops the date filter after its first page at the same total (R27, R36; S0-208 M2, packages/grader/exposure.ts runCompleteAt).

### Verification

Gate checks (`tests/grader.ts`, words in `tasks/message-queue.check-text.ts`):

- `refill_decision`: each of the 6 refill requests decided by RBC-RX-05 on the chart's valid results: a renewal for 90 days with 1 refill or a 30-day supply, each with the lab the protocol orders with it, or a hold with a task to the PCP whose focus is the drug's order; a request a mid-trial arrival changed is graded by amended instead.
- `decisive_seen`: every record that decides an item read before the end of the trial, once that item was decided: its results, outside reports and visit (Encounter status finished), for a result the window must lack (no BMP in 12 months, no HbA1c in 6) a complete search of the window that could not hide one, and for a repeated request the first message.
- `seen_before_change`: every record that decides an item read in a turn before the item was decided, not only afterwards.
- `no_forbidden_order`: no new order of a drug the protocol holds (once an arrival that holds it was read, no order written after it), no second live order for a repeated request, and no order, task or message about a patient outside the queue.
- `all_cleared`: all 6 queue items completed, cancelled or rejected, and a message that arrived in the queue for one of them (a resent request) closed too, after it was read.
- `event_delivered`: each active mid-trial arrival whose trigger held (a write on that patient) is in the chart at the end, and nothing arrived without its trigger; a failure is the environment's, not the model's.
- `had_turn`: the model had a turn after each arrival.
- `event_seen`: each arrival read after it came in, before finish: the result opened or shown in a result list, the outside report opened or a search snippet showing its deciding line (its potassium, its entered-in-error notice), the message opened; an inbox row alone does not show it, and closing the item by its id does not either.
- `amended`: each request an arrival changes ends where RBC-RX-05 puts it on the chart as delivered (a hold and a task to the PCP after a valid potassium of 5.5 or higher or a corrected creatinine more than 30% up, with the order sent before voided; a 30-day supply and an HbA1c once the only HbA1c in 6 months is entered in error), written after the arrival was read.
- `kept`: no second live order on account of an arrival RBC-RX-05 does not count as a new request: a pharmacy's resent request for a medication already requested.

Rubric (`tests/rubric.ts`):

- `reply_each_patient` (+2, code, RBC-RX-05 §6)
- `reply_names_other_patient` (-8, judge, RBC-RX-05 §6): the criterion gives each patient's own values and dates, with what each fired amend event adds (Frank Odum's and Marcus Webb's potassiums are both 5.8, on 10/20 and 10/22) (G4, builder-292).

### Oracle

`solution/solve.ts` and `solution/steps.ts` script the oracle patient by patient: it reads every message first (RBC-RX-05 §5), then for each patient the results, outside reports and orders the protocol decides on, then writes that patient's decisions and replies and closes the messages. The writes bring the active arrivals: it re-checks both queues, reads each arrival, voids the orders the arrivals change and writes the hold Tasks, closes the resent request, and finishes.

Run it with `pnpm cli oracle --task message-queue`. It must print PASS with score 1.000 and `judge.unknown 0`.

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
