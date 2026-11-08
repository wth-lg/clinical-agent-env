# How failures are attributed

Every trial gets one outcome. A trial that did not pass gets the fault whose criterion holds first in the order below. The fault gives its label: model, environment or grader. The definitions below are rendered from `packages/core/outcomes.ts`. The UI's Glossary page and the CLI's audit check read the same file, and a test fails on a copy written anywhere else.

<!-- docs-gen:block definitions -->

## Who did the clinical reads

Every clinical read of a trajectory and every task-validity verdict in this run came from LLM sessions, not from a human clinician. Four rulings moved grades, and each is in the results changelog. The S-0 fixes G1 to G4 went into grader 19 and moved one pilot-4a trial from fail to pass. The G5 continuation rule went into grader 20 and moved one pilot-4b trial from fail to pass. R41 decides window completeness by exposure of the target set. It went into grader 22 and moved twelve trials of the colorectal task's first version from fail to pass. R48 allows a held renewal in the message queue. It changed that task's grader with no grader version bump and moved one final-run trial from fail to pass. Each was fixed in the grader, and the affected run was regraded. A review of the same failures by a human clinician is listed under Next steps.

## How we told grader faults apart

A grader fault never comes from the grader alone. Three checks stand between a task and its first live trial. The reference solution must score full marks. Every declared alternative route must pass. Every mutant, one per clinical trap, must fail on its item alone with the label it declares. The matrix runs on every pull request, and a judge cache miss fails the build.

After a run, an LLM clinical read goes through every failure and every penalised pass from the trajectory. It writes an audit row with the evidence ids. A script refuses an id the trajectory never exposed. The criteria M1 to M5 then confirm the label, or contradict it, from the record, the manifest, the matrix and the audit row.

Two grader faults came out of the final run of the colorectal task. Both refused a complete review because the search had a shape the rule did not list. The coordinator ruled both grader faults, rewrote the rule by exposure of the target set, bumped the grader version and regraded the run offline. The records keep the first grade and carry the regrade. No trial was rerun. A third grader fault came out of the final run of the message queue. The coordinator ruled it under R48, fixed that task's grader and regraded the run offline in the same way.

Known strictness limits stand and are disclosed. In the results inbox task, a call task focused on the trial's own order reads as the wrong form. A gate cannot read free text, and a Task has no structured purpose. In the message queue task, the gate reads the final owner of an item. A forward to the on-call clinician and a reassignment back look the same. A note that says "no change" and contradicts the chart is not penalised when the dose gate already fails the trial. Each is listed in the task page and the changelog.

"Model fault" is relative to this harness. The tool texts, the oldest-first default sort and the closed-book calculator shape what the model sees. A different harness over the same chart could move some labels, as MedicalHarness shows for its benchmark.
