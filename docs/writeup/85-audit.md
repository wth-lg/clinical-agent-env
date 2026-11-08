# Audit against research and public environments

Three statements about the judge hold throughout. The judge never gates: gates are code-only checks, and a judged rubric item changes the score alone. Judge calibration measures stability on authored answers, re-asked live, and not agreement with clinicians. The judge is the same model as the agent, claude-opus-5-5.

The novelty claims are narrow. A policy served as a tool is not new: CliniCARE-Bench and CHI-Bench both have one, and CHI-Bench serves its handbook through MCP tools. Four things are narrow-new here. The fault criteria per trial are built on exposure tags. Among the clinical systems compared, only this one gives each trap a grader mutant, with alternatives that prove path independence. The FHIR store runs in process with a canonical hash and replay. The judge never gates. MedHarnessBench separates harness from agent faults with perturbations at benchmark level, and MedicalHarness decomposes variance across harnesses. Neither labels a single trial.

## Clinical agent benchmarks

<!-- docs-check:allow-numbers published results of other benchmarks, each with its source and date -->

| benchmark | date | what the agent does | grading | reported result |
|---|---|---|---|---|
| PhysicianBench | 2026-05-04 | 100 long consult workflows, about 27 tool calls each, FHIR writes plus a note | 670 checkpoints: code, hybrid and LLM-judged; LLM-judged checkpoints are part of task completion | at effort high: GPT-5.5 46.3%, Opus 4.6 31.7%, Opus 4.7 29.3%; the Sonnet 5.5 system card gives Opus 5.5 68.4% at max effort |
| HealthAgentBench | 2026-06-30 | 54 tasks across imaging, pathology, trials, EHR and MEDS | binary success against hidden labels | best about 42% |
| MedAgentBench | 2025-02-12 | 300 mostly single-lookup or single-order FHIR tasks | task-specific checks | Claude 3.5 Sonnet v2 69.67%, later saturated |
| FHIR-AgentBench | 2025-11-13 | 2,931 read-only questions over MIMIC-IV-FHIR | answer correctness | best baseline 50% |
| FHIR-AgentEval | 2026-02-09 | 43 appointment and genetic-testing tasks, 23 with writes | ids for queries; the write validator checks field existence only | GPT-4.1 mini 60.6% |
| HealthAdminBench | 2026-04-10 | 135 GUI admin tasks across an EHR, payer portals and fax | 1,698 verifiable subtasks | Opus 4.6 36.3% end to end |
| ClinEnv | 2026-06-01 | multi-stage admissions that commit to orders and diagnoses | ontology-grounded matching | best decision F1 0.31 |
| CliniCARE-Bench | 2026-08-07 | 750 EHR audits with retrieval, computation and policy-access tools | four-way verdict, defect-free accuracy | 65.3% to 76.1% |
| CHI-Bench | 2026-09-30 | hospital workflows over a 1,290-document handbook and 87 MCP tools | task success, strict pass^3 | best agent under 20% at pass^3 |
| EHR-RobustGym | 2026-09-30 | clean and noisy database question pairs | task success | 62.2% clean against 37.9% noisy |
| MedHarnessBench | 2026-10-11 | 342 FHIR, admin and multimodal tasks with single-fault perturbations | outcome plus seven process dimensions | abstract only |
| MedicalHarness | 2026-10-05 | one benchmark run under several harnesses | variance decomposition | about a quarter of the variance from the harness and its interaction with the model |
| Terminal-Bench 2.0 | 2026-01-17 | 89 kept tasks from 229 candidates | oracle, tests, an exploit agent | human "medium" read as hard 54.5% of the time |

<!-- docs-check:end-allow-numbers -->

PhysicianBench's tasks take between a quarter and a third as many tool calls as this environment's final-run trials. Opus 5.5 at max effort scores near the upper edge of the band on them. That anchor says why trap-dense tasks can still land above the band at effort high, and why change during the trial was needed.

## Public agent-environment repositories

The table reads each repository at its latest release on 2026-11-05, or at its last commit on main where it has no release. Our row reads origin/main at commit ad740dae of 2026-11-04.

| repository | release (date) | task layout (instruction, tests, solution) | tool interface | grader | repeatable state |
|---|---|---|---|---|---|
| this environment, [clinical-agent-env](https://github.com/wth-lg/clinical-agent-env) | no release; last main commit ad740dae (2026-11-04) | `tasks/<id>/`: `instruction.md`, `task.toml`, `policy/*.md`, `expected.ts`, `events.ts`, `solution/solve.ts`, `tests/grader.ts`, `tests/rubric.ts`, `tests/mutants.ts`, `tests/alternatives.ts`; six tasks | eighteen typed in-process tools over an in-memory FHIR R4 store, sent as MCP-shaped definitions; no MCP server | code gates decide pass or fail; a rubric with code, hybrid and judged items gives the score; attribution labels; a mutant and alternative matrix | a fresh store from a hashed world, a fixed clock, a pinned Synthea generator; task and environment versions are content hashes |
| [Harbor](https://github.com/harbor-framework/harbor) and Terminal-Bench 2.0 | v0.25.0 (2026-10-25) | a task directory with `instruction.md`, `task.toml`, `environment/`, `solution/solve.sh`, `tests/test.sh`; Terminal-Bench 2.0 has 89 tasks | the agent's own tools over container primitives; an optional per-task MCP server list, empty in every Terminal-Bench 2.0 task | `test.sh` writes a reward; Terminal-Bench 2.0 grades the final container state with no LLM judge | a fresh container per trial; images pinned by date tag; verification installs packages over the network |
| [tau2-bench](https://github.com/sierra-research/tau2-bench) | v2.0.0 (2026-10-20) | per-domain data: policy, database, `tasks.json`, splits; a task holds the user scenario, the initial state and the evaluation criteria | in-process Python toolkits sent as function-calling schemas; a simulated user with its own tools; no MCP | the product of a database hash, assertions, deterministic actions, and LLM-judged communication and natural-language assertions | a database rebuilt fresh; the gold state replays the reference actions; the simulated user and the judges stay stochastic |
| [MedAgentBench](https://github.com/stanfordmlgroup/MedAgentBench) | no release; last commit 99260117 (2025-11-21) | one JSON file of 300 tasks; the reference graders are a separate download | plain-text GET, POST and FINISH actions; v2 uses function tools that write to a HAPI server; no MCP | deterministic Python per category, by exact match or a live FHIR recompute; writes graded from the transcript | a prebuilt HAPI image tagged latest; the original never mutates the server; v2 has no reset |
| [CHI-Bench](https://github.com/actava-ai/chi-bench) | no release; last commit 7998d113 (2026-10-26); dataset tag chi-bench-v1.0.0 (2026-05-21) | Harbor-format task directories: 75 single-domain, 23 end-to-end, 3 marathon; fixtures hold judge rubrics and documents | MCP: three role-scoped servers with 87 tools over a simulator of 20 applications | a Claude Code judge writes per-rubric verdicts beside deterministic stage checks; a malformed judge output voids the trial | separate agent and trusted containers; state exported after tool calls drain; the judge stays stochastic |
| [OpenEnv](https://github.com/openenv/OpenEnv) | v0.12.0 (2026-11-05) | no fixed layout: an Environment class with reset, step and state, served over HTTP or WebSocket | MCP built in, one endpoint per environment | server-side rubrics, deterministic by default, with an optional LLM judge | a container per environment with a seeded reset; the framework does not enforce determinism |
| [FHIR-AgentEval](https://github.com/YoussefMkst/FHIR-AgentEval) | no release; last commit 8686a84c (2026-10-26) | 48 Python task modules with templated prompts, a validator and a scripted human agent | MCP: a FHIR CRUD server against HAPI, with optional lookup and memory servers | deterministic checks on the HAPI state, the response and the tool-call sequence; an optional LLM audit of the validator that does not score | a HAPI image tagged latest with a persistent volume; each task seeds and cleans its resource types |

What this environment can claim, against these six systems and as of 2026-11-05:

- It differs from MedAgentBench, CHI-Bench and FHIR-AgentEval in grading by turn-ordered exposure. A write counts as informed only when the deciding record was shown in an earlier turn.
- Among the clinical systems compared, it is the only one that delivers chart arrivals between the agent's writes. It grades whether the agent noticed and amended. tau2-bench has a dynamic user, but no unannounced arrivals.
- Among the clinical systems, it is the only one where every task ships mutants that must fail and alternatives that must pass. The matrix checks them before any trial.
- It runs without a container and without a live FHIR server. Every clinical comparator depends on a HAPI image or containers, and those HAPI images are tagged latest.
- Its judged rubric items need a quote that the grader finds in the text, and their answers are cached for offline regrading. Code gates alone decide pass or fail. CHI-Bench's pass depends on its judge.
- Its scope is primary care and pharmacy operations under written clinic policies, which differs from the scope of MedAgentBench, CHI-Bench and FHIR-AgentEval.

What it does not claim:

- That it speaks MCP or ships an MCP server. The tools are MCP-shaped definitions sent as Messages API tools.
- That Harbor can run its tasks. The repository has a name map, not a runnable export.
- That it came before other clinical agent benchmarks, or any claim of scale. It has six tasks and 68 patients, against 300 tasks in MedAgentBench.
- Full determinism. The model's sampling is not deterministic. The environment, the grading and the cached judging are.
- Novelty over private or unpublished environments.

## What was ruled against the research

NICE NG12 recommends considering a very urgent referral when an X-ray suggests bone sarcoma. The results inbox policy sets its contact window by the next business day, a realistic rule, and the grader reads that window. Harbor's task format and Inspect AI's limits and pass^k reducer are cited as source files at their tags. Their release notes do not name them.
