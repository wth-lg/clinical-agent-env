# Findings

The headline numbers are in the Pass rates section of the writeup and on the Overview page. This section says what they mean. Two tasks have their final run of twenty trials today: the colorectal screening worklist and the contrast CT order. The other four tasks wait for their final run on the record-integrity lever. TODO-W5F: the findings for those four tasks are written once their final run is committed.

**The base tasks were too easy for claude-opus-5-5 at effort high.** On the cleaned world, with every design tell removed, the model passed all but one of the trials in pilot-3. Static traps in the chart did not make the tasks hard. A frontier model reads a chart well when the deciding record is there to be read.

**What made the tasks hard was change during the trial.** Each task now delivers arrivals while the model works: a new or corrected result, an outside report, a message. The policy of every task says to review anything that arrived after the start. The record-integrity lever adds a result filed silently beside the one the inbox names, and a chart record whose deciding line a shallow read misreads.

**Most failures are retrieval failures.** In the contrast CT task, every failure in the final run is one slip. The model opened the arrived creatinine and compared it with an older value. It never searched for the second value filed beside it. The policy's rule turns on the rise between the two values. In the colorectal task, the two failures that stand are page-one reads of a long result list. The model stopped at the first page and never fetched the next.

**No failure in the final run is the environment's or the grader's.** The audit labels every failure model, with evidence ids the trajectory exposed. The grader faults we did find came out in the clinician read of the colorectal task's first grade. We fixed them in the grader and regraded the run offline. The Pass rates section says what changed.

**The judge adds score, never a verdict.** Judged rubric items change the score of a trial and never decide a pass. The judge is the same model as the agent, and its calibration measures stability on authored answers, not clinician agreement.

# What is new in this design

Each claim here names its nearest prior art. The Audit section of the writeup compares the environment with public benchmarks and repositories.

- **Exposure-tagged tools drive attribution.** A tool result exposes a record only when it shows the fields a clinician acts on. The criterion M1 asks whether every deciding record of the failed check was shown to the model or was reachable. Its negation E5 is an environment fault.
- **A grader validation matrix runs before any trial.** The reference solution must pass. Every declared alternative route must pass. Every mutant, one per clinical trap, must fail on its item alone and carry the attribution label it declares.
- **Machine-checked fault criteria per trial.** The fault definitions and their criteria live in one file, `packages/core/outcomes.ts`, and the UI, the CLI and this writeup render them from there. A test fails on a copy written anywhere else.
- **Atomic validated writes with Provenance.** A rejected write leaves the store, the hash and the next id unchanged. Each write records its sources, so a gate can check what a decision rested on.
- **A canonical state hash and a replay check.** Every trial starts from the same world hash. A replay re-executes the tool log on a fresh copy and must give the same final hash and the same grade.
- **Mid-trial arrivals and silent siblings.** An arrival enters the store between two of the model's writes, as the chart record and one inbox item. A silently filed sibling result tests whether the model reviews the batch as filed, not the one result it was handed.

# Surprises

**Saturation came early.** The first full pilot on the cleaned world passed almost every trial. We had planned difficulty levers that sit in the chart. They did not bite. Change during the trial did, so the plan moved to mid-trial events and then to record-integrity items.

**The grader was stricter than the policy, twice.** A clinician read of the colorectal task's first grade found twelve trials that had reviewed every record of the window. Nine of them split the window into two complete searches, and the grader refused the join. Three showed every record by page totals or by the tool's documented default order. The rule had been written by the shape of a search, not by what the model saw. We rewrote it by exposure of the target set and regraded the run offline with no model call.

**The planted records were visible.** A classifier told planted records from generated ones by field shape, timestamp precision and id range. Cleaning that took a world rebuild and a test that fails when any feature separates the two with balanced accuracy above a cap.

**The oldest-first default sort is a trap.** A search that returns the oldest page first makes a stale value the first one shown. Several failures read page one and stopped. We kept the sort, because a real server has one default too, and recorded a page-one failure as a retrieval slip.

**The judge's answers moved with the clock.** Judged items that asked about events in clock time gave different answers on repeated calls. Asking about relations between writes, before or after the arrival by turn, made the answers unanimous.

**An exploit agent with the answer key passes.** Given the ids the grader checks, an agent can read those records and skip the chart review. Without the key, finding the ids is the clinical work. We fixed every hole a normal agent could reach and recorded the rest as answer-key-only.

# Changes

What we would change, with what we know now.

- **Start from change during the trial.** The arrivals and the silent siblings are the difficulty. A design that starts there saves a world rebuild and two pilot rounds spent on static traps.
- **Write every window rule by exposure.** A gate that asks "was every record of the window shown" is right by construction. A gate that asks "did the search have the right shape" refuses valid routes, as the colorectal task showed.
- **Pre-register the arrival label rule.** The rule that a missed arrival is a retrieval failure was ruled before the data. Changing it after the data would have moved two tasks into the band, and we did not change it. The writeup discloses it here instead.
- **Give the agent a withdraw path.** The write layer has no way to revoke the agent's own order, task or note. A self-corrected wrong order cannot be undone, so some failures that stand are the form's, not the model's.
- **Keep one command.** The one-command start, the key gate and the same `run()` path on every surface cost little and removed every setup question from the review.

# Next steps

With more time, in this order.

1. Add a withdraw path for the agent's own writes. A revoked ServiceRequest, a cancelled own Task and an own note marked entered in error are the three forms.
2. Ship a stdio MCP server over the same tool definitions. A transport contract test checks it, and the tool annotations live there.
3. Calibrate the judge against human labels. Two clinicians read about fifty judge calls, agreement is reported with prevalence, and a second judge from another model family checks the negative items.
4. Add a route and form product rule to medication orders. The same change records the AI actor in Provenance as a Device on behalf of the signed-in clinician.
5. Make the steroid premedication of the contrast task route-aware.
6. Add a reverse traceability report that lists each policy section with no check.
7. Export the tasks in the Harbor format through the MCP server, with measured difficulty in each task's metadata.
8. Add the US Core search parameters the store lacks. They are Condition clinical-status, MedicationRequest intent and authoredon, and `_include`. Then require `patient` on Observation searches, as Oracle does.
9. Have a human clinician read the audited failures and the task-validity verdicts. The reads in this run were LLM sessions, so where the two disagree the human read decides.
10. Run the final sample on every task once the record-integrity lever is set, and publish the official run.
