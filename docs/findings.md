# Findings

The headline numbers are in the Pass rates section of the writeup and on the Overview page. This section says what they mean. Every task has its final run of twenty trials. Two tasks landed in the band: the results inbox and the contrast CT order. Two landed above it: the DOAC renal dose review and the colorectal screening worklist. Two saturated: the discharge medication reconciliation and the refill message queue. The user's decision after the run was to accept the result as measured and to disclose it. No second final run was made.

**The base tasks were too easy for claude-opus-5-5 at effort high.** On the cleaned world, with the design tells of the leak scan removed, the model passed all but one of the trials in pilot-3. Static traps in the chart did not make the tasks hard. A frontier model reads a chart well when the deciding record is there to be read.

**What made the tasks hard was change during the trial.** Each task delivers arrivals while the model works: a new or corrected result, an outside report, a message. The policy of every task says to review anything that arrived after the start. The arrivals alone did not bind either: with four arrivals active per task, the four tasks that later got the lever passed every pilot trial. The record-integrity lever then added two items per task. Item A is a result filed silently beside the one the inbox names, the way an abnormal-only results interface routes it. Item B is a chart record whose deciding line a shallow read misreads.

**The silent sibling is the one device that binds.** The four tasks that ran it have seventeen failures in the final run, and twelve of them are the same slip. All twelve are in the DOAC review and the results inbox. The model opened the notified result and acted on it, and no later read or search showed it the sibling filed beside it. That sibling decided the item. In the contrast CT task, every failure is that slip too. The other five failures of the four tasks are in the colorectal task, which caught its sibling in every final trial. Each of the five is a screening order written before a complete review of a base member's window. Item B was caught in every pilot trial of every task. A chart record that is there to be read is read, whatever its shape. The table "Pass rate without the silent-sibling item" under Pass rates shows how much of each rate rests on the device.

**Why four tasks landed above the band.** The rule that set each task's version is described below, and its numbers are in the table "How difficulty was set" under Pass rates. The DOAC review froze on its first pilot with both items active. Its smoothed estimate sat inside the range, and the rule freezes a version whose estimate is in range when it is the version piloted. The pilot's raw count, six of eight, was already above the band, and the final run, sixteen of twenty, landed above it too. The discharge reconciliation caught item A in no pilot trial and item B in every one. No set of items had an estimate in the range: one far below, one far above. The rule took the set nearest the band, which was item B alone, and its confirm pilot passed every trial. It was the third of three tasks outside the range, and the retune round covered two, so it froze on that version. It was expected above the band before the final run. The message queue undershot on item A alone in its confirm pilot. The pre-declared softening was applied once: the inbox summary of the arrival names the count of results it filed. The softened version passed every retune-pilot trial, and the rule freezes a retuned version on its result whatever it is. The colorectal task's second version landed inside the range on its pilot and froze. Its lever item was caught in every final trial. Its failures are window reviews of base members that left some records unshown, which the pilot had shown more often.

**Every failure is a retrieval failure.** Every failure of the final run is labelled retrieval: the deciding record was never shown to the model. One message-queue trial first failed as reasoning. It reached the right decision and put two renewals on hold where the gate expected a void. The coordinator is the LLM session that ran this build's orchestration and ruled on cases the plan did not cover. After the run, it read the refill policy again and ruled the hold allowed, so that gate was a grader fault. The grader was fixed and the run regraded offline, with no rerun, and the trial is a pass. The records keep the first grade and carry the regrade. In the colorectal task, each failure left part of a member's result window unshown before the order. A long result list was read only in part, a search's dates cut the window, or a code-filtered search lacked a screening code. The absence of a counting test was never proven.

**No failure in the final run is the environment's.** The audit labels every failure model, with evidence ids the trajectory exposed. Three grader faults came out of LLM clinical reads of the final run: two in the colorectal task's first version, one in the message queue. Each was fixed in the grader, and the run was regraded offline. The section "How failures are attributed" says what changed.

**The judge changes the score, never a verdict.** Judged rubric items change the score of a trial and never decide a pass. The judge is the same model as the agent, and its calibration measures stability on authored answers, not clinician agreement. One judge false positive is known, and one judged penalty was left unknown. Neither decides a pass. The full writeup describes both in its section "Judge agreement and harm penalties", under Pass rates, beside the agreement rates the audit phase reports.

# How the lever was tuned

Difficulty was tuned on pilot data from the same model. The rule, S5, was written into the decision log before the first lever pilot trial. It gave each item's predicted catch rate and each task's predicted pass. The numbers are in the table "How difficulty was set" under Pass rates. Pilot trials are never counted in the final run.

The rule as pre-registered. Each of the four lever tasks built two items and a third held in reserve, and ran one pilot with both items active. From that pilot, the rule estimated each item's catch rate and the rate of everything else. One pass and one failure were added to each count. It predicted the pass rate of each set of items as the product, and picked the set nearest the middle of the range. A task whose selected set was the one it had piloted froze on it. Any other task ran a confirm pilot on its selected set and froze when the count landed inside the range. Otherwise one retune round, of at most two tasks, could toggle an item or apply one pre-declared softening. The retuned version froze on its pilot result whatever it was. The final run used each task's latest frozen version, never an older one because its rate looked better.

The departures from it, each ruled when it arose and recorded with its date:

- **A straddle.** The rule covered a set inside the range, every prediction above it and every prediction below it. It did not cover predictions on both sides with none inside. For a straddle the rule took the set nearest the range, with an exact tie broken by the measured item cost. Two tasks met this case.
- **The softening's trigger.** The softening clause was written for the first pilot. It was applied after the confirm pilot, under the retune clause that allows a softening. One task had caught item A in almost no confirm trial.
- **The softening's wording.** The amendment's example wording named outside results. The arrival's results are the clinic's own, so the summary reads the count of result records the arrival filed, computed from the arrival itself. The softening is still applied once.
- **A re-freeze.** The DOAC review was frozen before a later rebuild moved the shared world. It was frozen again on the final world before its run, with its own files unchanged since its pilot.
- **A second version of the colorectal task.** That task had run its final sample before the lever. The user chose a second version with one lever item, pre-registered the day after the others with its own prior and a one-item rule. The first version's trials are shown beside the second and never counted.

What held. The two mechanism predictions held in each of the four tasks that piloted both items. Item A was caught less often than item B, and every missed A was a retrieval miss with the sibling never shown. The bookkeeping test held too: no task's lever failures were form or seen-rule details. The two clarifying policy sentences the amendment allowed are in the policies. The discharge policy says a condition that names post-discharge results is not met by a result from the stay. The refill policy says a result's date is its collection date and time. The results inbox's reserve item and its sentence were never activated.

What the fairness audit noted. Two silent-sibling items run somewhat above real-world difficulty. The environment has no trend view and no parent-order display, so the deciding record sits one search away. That search is a route the policy names, and the models had used it before the arrival, so the items stand as fair traps. The message queue's softened inbox row is the only row in its queue that names a count of results. The other arrivals with several results read as a new result. The cue may account for part of the move the softening made. The colorectal task's second version has one documented edge. A search for a counting test of the year, filtered by status and made after the arrival, shows neither record. Neither the re-issued result nor the cancelled original appears. It does not count as seen, because the deciding records were never shown. The route is unlikely, and the task page says so.

# What is new in this design

Each claim here names its nearest prior art. The Audit section of the writeup compares the environment with public benchmarks and repositories.

- **Exposure-tagged tools drive attribution.** A tool result exposes a record only when it shows the fields a clinician acts on. The criterion M1 asks whether every deciding record of the failed check was shown to the model or was reachable. Its negation E5 is an environment fault.
- **A grader validation matrix runs before any trial.** The reference solution must pass. Every declared alternative route must pass. Every mutant, one per clinical trap, must fail on its item alone and carry the attribution label it declares.
- **Machine-checked fault criteria per trial.** The fault definitions and their criteria live in one file, `packages/core/outcomes.ts`, and the UI, the CLI and this writeup render them from there. A test fails on a copy written anywhere else.
- **Atomic validated writes with Provenance.** A rejected write leaves the store, the hash and the next id unchanged. Each write records its sources, so a gate can check what a decision rested on.
- **A canonical state hash and a replay check.** Every final-run trial of a task starts from that task's frozen world hash. In the final run, five tasks start from today's build and the contrast CT task starts from an earlier frozen world. A replay re-executes the tool log on a fresh copy and must give the same final hash and the same grade.
- **Mid-trial arrivals and silent siblings.** An arrival enters the store between two of the model's writes, as the chart record and one inbox item. A silently filed sibling result tests whether the model reviews the batch as filed, not the one result it was handed.

# Surprises

**Saturation came early.** The first full pilot on the cleaned world passed almost every trial. We had planned difficulty levers that sit in the chart. They did not bite. Change during the trial did, so the plan moved to mid-trial events and then to record-integrity items.

**The grader was stricter than the policy, twice.** An LLM clinical read of the colorectal task's first grade found twelve trials that had reviewed every record of the window. Nine of them split the window into two complete searches, and the grader refused the join. Three showed every record by page totals or by the tool's documented default order. The rule had been written by the shape of a search, not by what the model saw. We rewrote it by exposure of the target set and regraded the run offline with no model call.

**The static item never bit.** Item B, a chart record whose deciding line a shallow read misreads, was caught in every pilot trial of every task. The letter with a copied-forward medication block and the fax with another patient's identifiers were read right. So were the resume condition met by an inpatient value and the same-day creatinine drawn after the dose change.

**A one-line softening moved a task from almost no passes to all passes.** The message queue's silent panel was missed in almost every trial while its inbox row read as a single new result. Once the row named the count of results, every trial searched the panel. The model's review depends on what the queue row says is there.

**The selection rule froze on a smoothed estimate.** The DOAC review's pilot count, six of eight, was above the band. The rule's estimate, with one pass and one failure added to each count, sat inside the range. The rule froze on the estimate, as written, and the final run landed above the band.

**The planted records were visible.** A classifier told planted records from generated ones by field shape, timestamp precision and id range. Cleaning that took a world rebuild and a test that fails when any feature separates the two with balanced accuracy above a cap.

**The oldest-first default sort is a trap.** A search that returns the oldest page first makes a stale value the first one shown. Several failures read page one and stopped. We kept the sort, because a real server has one default too, and recorded a page-one failure as a retrieval slip.

**The judge's answers moved with the clock.** Judged items that asked about events in clock time gave different answers on repeated calls. Asking about relations between writes, before or after the arrival by turn, made the answers unanimous.

**An exploit agent with the answer key passes.** Given the ids the grader checks, an agent can read those records and skip the chart review. Without the key, finding the ids is the clinical work. We fixed every hole a normal agent could reach and recorded the rest as answer-key-only.

# Changes

What we would change, with what we know now.

- **Start from change during the trial.** The arrivals and the silent siblings are the difficulty. This run spent a world rebuild and two pilot rounds on static traps before it moved there.
- **Write every window rule by exposure.** A gate that asks "was every record of the window shown" is right by construction. A gate that asks "did the search have the right shape" refuses valid routes, as the colorectal task showed.
- **Pre-register the arrival label rule.** The rule that a missed arrival is a retrieval failure was ruled before the data, and we did not change it after the data. The writeup discloses it here.
- **Pre-register the straddle and the softening's wording.** The two gap-fills of the selection rule were ruled when the data arrived. Both belong in the rule before the first trial.
- **Freeze on the raw count as well as the estimate.** A version whose pilot count is already outside the band should run a confirm pilot before it freezes, even when it is the version piloted.
- **Give the agent a withdraw path.** The write layer can cancel the agent's own medication order. It has no way to revoke the agent's own service order, task or note. A wrong service order that the agent corrects stays in the chart.
- **Keep one command.** Keep the one-command start, the key gate and the same `run()` path on every surface.

# Next steps

With more time, in this order.

1. Add a withdraw path for the agent's own writes. A revoked ServiceRequest, a cancelled own Task and an own note marked entered in error are the three forms.
2. Ship a stdio MCP server over the same tool definitions. A transport contract test checks it, and the tool annotations live there.
3. Calibrate the judge against human labels. Two clinicians read about fifty judge calls, agreement is reported with prevalence, and a second judge from another model family checks the negative items.
4. Fix the judged criterion of the false positive and the quote rule behind the unknown answer, then recalibrate them. A medication on the recipient's own list is their own matter, and a quote must be one verbatim sentence.
5. Add a route and form product rule to medication orders. The same change records the AI actor in Provenance as a Device on behalf of the signed-in clinician.
6. Make the steroid premedication of the contrast task route-aware.
7. Add a reverse traceability report that lists each policy section with no check.
8. Export the tasks in the Harbor format through the MCP server, with measured difficulty in each task's metadata.
9. Add the US Core search parameters the store lacks. They are Condition clinical-status, MedicationRequest intent and authoredon, and `_include`. Then require `patient` on Observation searches, as Oracle does.
10. Have a human clinician read the audited failures and the task-validity verdicts. The reads in this run were LLM sessions, so where the two disagree the human read decides.
11. Add judged penalties for the two routes the gates cannot see today. One is an order that acts on a misfiled fax's finding without citing it. The other is an unneeded colonoscopy referral.
