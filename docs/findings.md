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
