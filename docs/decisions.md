# Decisions

The design and run decisions behind the environment, in the order they were made. Each user decision carries its date. The rulings are the coordinator's, made when a gate or a probe found a case the plan did not cover. Each applies to every task from its date on. The writeup's Findings section says what the final run showed; this page says what was decided and why.

## User decisions

- **2026-10-23. Hosting and spend.** The site is GitHub Pages from a public repository. Live runs are metered in a ledger with a projected cap and a hard stop. The headline effort is high.
- **2026-10-23. Live demo through the local runner.** The local runner serves the same web UI as the hosted site. The hosted site browses and replays committed results.
- **2026-10-24. Repository name.** The public repository is clinical-agent-env, and the code identifiers carry no company name.
- **2026-10-24. The final run and the band.** The final run is twenty trials per task at effort high. A task is in the band when it passes between four and fourteen of twenty, both ends included. The writeup is one self-contained HTML file, and the README is short and in Simplified Technical English.
- **2026-10-24. Caps.** The ledger refuses a batch whose projection would pass the projected cap and stops every call at the hard stop. The first pilot ran under the hard caps alone, before any measured cost existed to size a reserve.
- **2026-10-24. Judge budget.** The judge may spend up to one dollar per call, with a larger output budget than the design first set.
- **2026-10-25. Hosted live runs through a relay.** The hosted site runs live trials through a stateless relay that forwards only the model call and keeps no key. If the relay cannot work, the hosted page falls back to the local runner and names the browsers it needs.
- **2026-10-25. Prerequisites.** The local app assumes Node 22.18 or newer and pnpm, and the start screen and the README state both with install links. One command clones, installs, builds and starts.
- **2026-10-29. Batch the first levers.** The first difficulty levers for three tasks went into one rebuild before the next pilot, by the user's word. This departed from the rule that levers are pulled only on pilot data.
- **2026-10-29. Behaviour-driven levers.** A research step reads every pilot transcript and proposes one harder step per task aimed at observed behaviour, with no form traps.
- **2026-10-30. Run all forty-eight trials.** The overlay pilot ran all six tasks at eight trials.
- **2026-10-30. Redesign as worklists.** After the leak cleanup, each task became a realistic worklist sized from measured failure rates. The grader enforces only stated policy.
- **2026-10-30. Unblock and polish.** The coordinator takes the remaining route checkpoints on the recommended option and records each with its reason. The UI design stands and gets polished.
- **2026-11-03. Run two now, redesign four.** The colorectal and contrast CT tasks, both in the band in their pilots, ran their final samples at once. The other four got a new lever, pilots, then their own final runs. The band requirement stands for all six.
- **2026-11-05. A second version of the colorectal task.** The colorectal task gets a second version with one record-integrity item, an eight-trial pilot and twenty new final trials, reported beside its first version.
- **2026-11-06. Accept and disclose.** After the final run, four tasks sat outside the band. The final run stands as measured. There is no second final run. The writeup discloses each result with its Wilson interval, the tuning procedure, the priors and why four tasks landed above the band. The code recognises this decision as `user-2026-11-06T17:27Z-accept-and-disclose` (packages/core/disclosure.ts, RECOGNISED_DECISIONS). It is the only decision a disclosure record in results/tasks-final.json may name.

## The route

- **Pilots on the plain chart.** The first pilots passed almost every trial. Static traps in the chart did not bind. A leak scan found design tells in ids, timestamps and policy text, and a world rebuild removed them.
- **Worklists.** Each task became a worklist of several patients or items, so that one trial exercises several decisions under one policy.
- **Mid-trial arrivals.** Each task delivers results, corrections, outside reports and messages while the model works, as the chart record and one inbox item. Every policy gained the same sentence: review anything that arrived after you started, and correct a recorded decision if the arrival changes it.
- **Record-integrity items.** For four tasks the arrivals alone did not bind. Each got two items: a result filed silently beside the one the inbox names, and a chart record whose deciding line a shallow read misreads. A pre-registered rule chose which items to keep.
- **Freezes.** Each task's version is frozen before its final run by its content hashes, its world hash and its grader version. A later world change never rewrites or regrades a frozen run.

## The tuning rule, as pre-registered

Written into the decision log on 2026-11-04, before the first lever pilot trial, and for the colorectal task's second version on 2026-11-05.

- Each item's catch rate is estimated as its passes plus one over its observations plus two. The rate of everything else is estimated the same way over trials. A set's predicted pass is the product.
- The set nearest the middle of the range is selected. A task whose selected set is the one it piloted freezes on it. Any other task runs a confirm pilot and freezes when the count lands inside the range.
- Otherwise one retune round, of at most two tasks, may toggle an item or apply one pre-declared softening. A retuned version freezes on its pilot result whatever it is.
- A lever item that fails more than three fifths of its observations gets a fairness audit before the rule runs. A clinician read labels every failure.
- The final run uses each task's latest frozen version, never an older one because its rate looks better. Reruns happen only by the re-queue rules.
- Two mechanism predictions are reported, not used. Item A is caught less often than item B in every task, and a missed A is a retrieval miss.

## Rulings in brief

The rulings are numbered in the order they were made. Each is stated here in one or two sentences.

- **R1 to R5.** Only the records that decide an item's expected action are decisive. A seen rule covers every place the agent can see the fact. That is the record, a search row that shows it, or a note snippet that shows the phrase. A gate forbids no more than the policy states and enforces only what the policy states. Every fact a rule depends on is reachable with the tools.
- **R6 and R7.** Every plausible first search is listed, and a trap-deciding record may not sit on its first page. Every threshold clears its margin.
- **R8 to R11.** A planted chart may not contradict its item. A retrieval class reads as retrieval when the model misses it. No policy sentence points at one item.
- **R12, R25 and R30.** A search for a policy word, a hazard word or a test name is the retrieval skill working and is exempt from the first-page rule.
- **R14 to R16.** No item passes without its deciding step shown first. Each item proves its own decision. The expected action is the clear clinical answer, and a defensible action never fails.
- **R18.** A deciding record never seen before finish fails the item as retrieval. One seen only after the decision fails it as process. A wrong action left in place after the record was read is reasoning.
- **R19 to R22.** A lure may sit on page one. An absence item counts as reviewed by a search whose filters cannot hide a qualifying record. Where the policy allows several records to establish a fact, any of them counts. A row that shows no deciding value is not exposure.
- **R27, R31 and R36.** An absence search counts only when its filters hide nothing and it is complete. Complete means one whole page, a run of pages from the start to the end, or a sorted run past the window's edge. Seeing the trap record alone is not a review.
- **R29.** A deciding phrase is a set of atoms. A record counts as seen when one exposure shows every atom.
- **R32 to R34.** Every item is gated, including no-action items. Facts on the Patient record are decisive. A gate requires the review that decides this item and no more; what a class does not measure is disclosed on the task page.
- **R37 and R40.** A run directory is historical data, pinned to its world and task versions, and reproduced at its commit. A per-task freeze pins the task's files, its grader version and its records, not the shared world.
- **R38.** A fired arrival never excuses the base review. An arrival's inbox status is graded only where the policy states a rule. A blind decision that an arrival later corrects is never credited. An arrival counts as seen only when its deciding atoms are shown.
- **R39.** A result filed silently in the same batch as a notified one is a fair trap under three conditions. The policy names the comparison, a policy-named route returns it, and the delivery mirrors a real routing configuration. Leaving an order right without the sibling shown fails as retrieval.
- **R41.** Window completeness is decided by exposure of the target set, not by the shape of the search. This was a grader bug fix: the frozen colorectal run was regraded offline, with disclosure, and twelve trials moved from fail to pass.
- **R42.** The colorectal task's second version enters the final run; its first version's trials move aside, byte for byte, and are reported beside it.
- **R43.** A judged note is headed "after the arrival" only when its turn is later than the turn that first exposed the arrival.
- **R44.** The tuning rule did not cover predictions on both sides of the range with none inside. A straddle takes the set nearest the range; an exact tie follows the measured item cost. Disclosed as a gap-fill.
- **R45.** After the confirm pilots, the retune round covered the two tasks nearest the middle of the range: one item toggle and one softening. The third task froze on its latest version, expected above the band.
- **R46.** A search filtered by codes proves an absence only when its codes cover every counted code. A record count alone does not make a review complete.
- **R47.** The softening names the count of results the arrival filed, computed from the arrival itself. The amendment's example wording named outside results, and the results were the clinic's own.
- **R48.** A message-queue trial held the two renewals where the gate expected a void. The refill policy allows the hold, so the gate is a grader fault. It is fixed in the grader and the final run is regraded offline, with disclosure and no rerun.

## Spend

The final run of all six tasks settled about two hundred dollars. The whole project, pilots, probes, calibration and the final run included, settled under the projected cap. The audit phase has its own allowance.
