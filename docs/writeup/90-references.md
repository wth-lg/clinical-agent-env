# References

Each entry gives the version or page we read and its date. A baseline marks a source older than 2025 that the design still rests on.

## Research and benchmarks

- PhysicianBench, arXiv 2605.02240, https://arxiv.org/abs/2605.02240, 2026-05-04.
- CliniCARE-Bench, arXiv 2608.07796, https://arxiv.org/abs/2608.07796, 2026-08-07.
- CHI-Bench, arXiv 2605.16679, https://arxiv.org/abs/2605.16679, v3 2026-09-30.
- MedicalHarness, arXiv 2610.05778, https://arxiv.org/abs/2610.05778, 2026-10-05.
- MedHarnessBench, arXiv 2610.15714, https://arxiv.org/abs/2610.15714, 2026-10-11.
- MedAgentBench, arXiv 2501.14654, https://arxiv.org/abs/2501.14654, 2025-02-12.
- Same-input reruns on MedAgentBench, arXiv 2609.13582, https://arxiv.org/abs/2609.13582, 2026-09-11.
- FHIR-AgentBench, arXiv 2509.19319, https://arxiv.org/abs/2509.19319, 2025-11-13.
- FHIR-AgentEval, Research Square preprint, https://pmc.ncbi.nlm.nih.gov/articles/PMC12919212/, 2026-02-09.
- HealthAgentBench, arXiv 2606.31179, https://arxiv.org/abs/2606.31179, 2026-06-30.
- HealthAdminBench, arXiv 2604.09937, https://arxiv.org/abs/2604.09937, 2026-04-10.
- ClinEnv, arXiv 2606.02568, https://arxiv.org/abs/2606.02568, 2026-06-01.
- EHR-RobustGym, arXiv 2609.39371, https://arxiv.org/abs/2609.39371, 2026-09-30.
- HealthBench, arXiv 2505.08775, https://arxiv.org/abs/2505.08775, 2025-05-13.
- HealthBench Professional, arXiv 2604.27470, https://arxiv.org/abs/2604.27470, 2026-04-30.
- MedHELM, arXiv 2505.23802, https://arxiv.org/abs/2505.23802, 2025-05-26.
- Terminal-Bench 2.0, arXiv 2601.11868, https://arxiv.org/abs/2601.11868, 2026-01-17.
- Agreement metrics for LLM-as-judge evaluation, arXiv 2606.00093, https://arxiv.org/abs/2606.00093, 2026-07-31.
- Self-preference bias in rubric-based evaluation, arXiv 2604.06996, https://arxiv.org/abs/2604.06996, 2026-04-08.
- Adding error bars to evals, arXiv 2411.00640, https://arxiv.org/abs/2411.00640, 2024-11-01, baseline.
- Claude Sonnet 5.5 system card, section 8.15, https://www-cdn.anthropic.com/870c8f525702625d2c62fc6dd04c857e3250bec1/Claude%20Sonnet%205.5%20System%20Card.pdf, 2026-09-28.
- Anthropic, Demystifying evals for AI agents, https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents, 2026-01-09.
- Anthropic, Writing effective tools for agents, https://www.anthropic.com/engineering/writing-tools-for-agents, 2025-09-11.

## Public environments and runners

- tau2-bench v2.0.0, docs/evaluation.md at the tag, https://github.com/sierra-research/tau2-bench/blob/v2.0.0/docs/evaluation.md, 2026-10-20.
- tau2-bench commit 85e5017, infrastructure-errored calls excluded from the score denominators, https://github.com/sierra-research/tau2-bench/commit/85e501724ded198b6dcf0c64563e2740fd3b5fa6, 2026-10-20.
- tau2-bench v2.0.0 environment.py, strict set_state replay, https://github.com/sierra-research/tau2-bench/blob/v2.0.0/src/tau2/environment/environment.py, 2026-10-20.
- Harbor v0.24.0, the task config, NopAgent and quality-check files at the tag, https://github.com/harbor-framework/harbor/tree/v0.24.0, 2026-10-05.
- Inspect AI 0.3.284, the pass_k reducer and the per-task limits in the source at the tag, https://github.com/UKGovernmentBEIS/inspect_ai/releases/tag/0.3.284, 2026-10-25.
- verifiers v0.4.0, runtimes architecture, https://github.com/PrimeIntellect-ai/verifiers/blob/v0.4.0/docs/v1/architecture.md, 2026-10-12.
- OpenEnv v0.10.0 README, https://github.com/meta-pytorch/OpenEnv/blob/v0.10.0/README.md, 2026-10-22.
- MedAgentBench repository, server task handling, https://github.com/stanfordmlgroup/MedAgentBench, 2025-11-21.
- Terminal-Bench 2 repository, https://github.com/laude-institute/terminal-bench-2, 2026-04-30.

## Standards and tooling

- Model Context Protocol specification 2025-11-25, Tools, https://modelcontextprotocol.io/specification/2025-11-25/server/tools, 2025-11-25.
- Model Context Protocol specification 2025-03-26, changelog (tool annotations), https://modelcontextprotocol.io/specification/2025-03-26/changelog, 2025-03-26.
- Model Context Protocol specification 2026-07-28, changelog (stateless servers, deterministic tool order), https://modelcontextprotocol.io/specification/2026-07-28/changelog, 2026-07-28.
- FHIR R4 v4.0.1, Search, https://hl7.org/fhir/R4/search.html, 2019-11-01, baseline.
- FHIR R4 v4.0.1, ServiceRequest, https://hl7.org/fhir/R4/servicerequest.html, 2019-11-01, baseline.
- US Core 9.0.0 server CapabilityStatement, https://hl7.org/fhir/us/core/CapabilityStatement-us-core-server.html, 2026-05-31.
- Epic on FHIR documentation, API change log, https://fhir.epic.com/Documentation, 2026-10-16.
- Oracle Health Millennium FHIR R4 Observation search, https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/op-observation-get.html, 2026-04-23.
- SMART App Launch 2.2.0, scopes and launch context, https://hl7.org/fhir/smart-app-launch/scopes-and-launch-context.html, 2024-04-30, baseline.
- RFC 8785, JSON Canonicalization Scheme, https://www.rfc-editor.org/rfc/rfc8785, 2020-06-01, baseline.
- ASD-STE 100, Simplified Technical English, issue 8, https://www.asd-ste100.org/, 2021-04-30, baseline.

## Clinical sources behind the policies

- Eliquis (apixaban) label, DailyMed, https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e9481622-7cc6-418a-acb6-c5450daae9b0, 2025-04-17.
- Neurontin (gabapentin) label, DailyMed, https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee9ad9ed-6d9f-4ee1-9d7f-cfad438df388, 2022-07-12, baseline.
- ACR Manual on Contrast Media, https://www.acr.org/Clinical-Resources/Clinical-Tools-and-Reference/Contrast-Manual, 2026-04-17.
- ACR-AAAAI consensus on hypersensitivity to radiocontrast media, Radiology 315(2), https://www.rad.pitt.edu/sites/rad_image/feed/wang-et-al-2025-management-and-prevention-of-hypersensitivity-reactions-to-radiocontrast-media-a-consensus-statement.pdf, 2025-05-01.
- CMS130v14 colorectal cancer screening, eCQI, https://ecqi.healthit.gov/ecqm/ec/2026/cms0130v14, 2026-05-13.
- USPSTF colorectal cancer screening recommendation, https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/colorectal-cancer-screening, 2021-05-18, baseline.
- NICE NG12, suspected cancer: recognition and referral, https://www.nice.org.uk/guidance/ng12/chapter/Recommendations-organised-by-site-of-cancer, 2026-04-15.
- Fleischner Society pulmonary nodule recommendations, Radiopaedia revision, https://radiopaedia.org/articles/fleischner-society-pulmonary-nodule-recommendations-1, 2025-11-25.
- ADA Standards of Care in Diabetes 2026, older adults, https://pmc.ncbi.nlm.nih.gov/articles/PMC12690186/, 2025-12-08.
- Updates in the 2025 AHA/ACC hypertension guideline, Current Hypertension Reports, https://pmc.ncbi.nlm.nih.gov/articles/PMC12995957/, 2026-03-17.
- Frimley Health NHS, ACE inhibitor initiation and titration v6.0, https://guidelines.fhft.nhs.uk/Cardiology-Heart_Failure-Angiotensin_Converting_Enzyme_Inhibitors_(ACEI)_Initiation_and_Titration, 2025-06-25.
- Addressing reported penicillin allergy, 2022 practice parameter update, https://blog.unmc.edu/infectious-disease/2022/11/18/addressing-reported-penicillin-allergy-a-2022-practice-parameter-update/, 2022-11-18, baseline.
