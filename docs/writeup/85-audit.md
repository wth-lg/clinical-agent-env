# Audit against research and public environments

Three statements about the judge hold throughout. The judge never gates: gates are code-only checks, and a judged rubric item changes the score alone. Judge calibration measures stability on authored answers, re-asked live, and not agreement with clinicians. The judge is the same model as the agent, claude-opus-5-5.

The novelty claims are narrow. A policy served as a tool is not new: CliniCARE-Bench and CHI-Bench both have one, and CHI-Bench serves its handbook through MCP tools. Four things are narrow-new here. The fault criteria per trial are built on exposure tags. Each trap has a grader mutant, with alternatives that prove path independence. The FHIR store runs in process with a canonical hash and replay. The judge never gates. MedHarnessBench separates harness from agent faults with perturbations at benchmark level, and MedicalHarness decomposes variance across harnesses. Neither labels a single trial.

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

PhysicianBench's tasks are about one and a half times longer than this environment's by tool calls. Opus 5.5 at max effort scores well above the band on them. That anchor says why short, trap-dense tasks can still land above the band at effort high, and why change during the trial was needed.

## Public agent-environment repositories

TODO-R16: a researcher fills this table from each repository's latest release, with a URL and a YYYY-MM-DD date in every row.

| repository | release date | task layout (instruction, tests, solution) | tool interface | grader | repeatable state |
|---|---|---|---|---|---|
| this environment | see the Changes section | `tasks/<id>/instruction.md`, `tests/grader.ts`, `solution/solve.ts` | eighteen MCP-shaped tool definitions, no server | gates plus a rubric, matrix-validated | world hash, pinned clock, replay |
| Harbor and Terminal-Bench 2.0 | TODO-R16 | TODO-R16 | TODO-R16 | TODO-R16 | TODO-R16 |
| tau2-bench | TODO-R16 | TODO-R16 | TODO-R16 | TODO-R16 | TODO-R16 |
| MedAgentBench | TODO-R16 | TODO-R16 | TODO-R16 | TODO-R16 | TODO-R16 |
| CHI-Bench | TODO-R16 | TODO-R16 | TODO-R16 | TODO-R16 | TODO-R16 |
| OpenEnv | TODO-R16 | TODO-R16 | TODO-R16 | TODO-R16 | TODO-R16 |

## What was ruled against the research

NICE NG12 recommends considering a very urgent referral when an X-ray suggests bone sarcoma. The results inbox policy sets its contact window by the next business day, a realistic rule, and the grader reads that window. Harbor's task format and Inspect AI's limits and pass^k reducer are cited as source files at their tags. Their release notes do not name them.
