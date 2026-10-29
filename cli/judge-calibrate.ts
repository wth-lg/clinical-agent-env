// pnpm cli judge-calibrate --task <id|all> [--dry-run]
//                         [--from-trials <run dir>[,<run dir>...] | --probes | --annotate]
// Live judge calibration (plan phase P11c): asks every key of tasks/<id>/tests/judge-cache.json
// live, once, compares each live answer with the scripted one and writes
// results/judge-calibration/<id>.json. It never writes the cache; a disagreement is fixed in
// the cache or the judge prompt by hand, with a grader version bump, and asked again.
//   The cache keeps answers, not questions, so each key's question is found the way
//   `oracle --live-judge` finds its projection: every matrix case of the task is run once and
//   graded with a Judge whose client sends nothing and answers "unknown". A cache key no case
//   asks cannot be asked; it is listed as a disagreement.
//   live        one batch per task: batchStart(that task's projection) on the Node ledger, so
//               batchStart refuses with 0 calls when its exposure plus the projection would
//               cross PROJECTED_CAP_USD; a MessagesClient on the grant and one Judge ask each
//               key in key order. The oracle case is then graded from the live answers alone
//               (no further call). Two answers agree when the judge verdicts, or the extracted
//               values, are equal; quotes may differ.
//   --dry-run   prints each task's projection and LIVE_PROJECTION_USD, makes no call and opens
//               nothing. Projection: each key a case asks, priced at its worst case from its real
//               body and max_tokens, times JUDGE_CALLS_PER_ITEM (the schema retry).
// Every calibration file says what it compared (P17i C12, R14-29): `reference` is where the
// answers compared with came from (scripted, or live: crc-care-gap's cache, and every
// --from-trials file), reference_counts counts each, and `protocol` states the design
// (scripted reference, or test-retest when the reference is the same judge model's earlier live
// answers), the texts, and how agreement, unknowns, invalid answers, exclusions and pooling are
// handled.
//   --from-trials  the live recalibration P21 runs: reads the live, valid trials of the task in
//               each run dir (a comma-separated list), grades each again from its trajectory with
//               a Judge that notes each question and sends nothing, then asks every question
//               live, once, and compares with every distinct answer the judge gave while the
//               trials ran (reference: live, no oracle); trials that recorded different answers
//               for one key are a disagreement whatever the live answer. A mock trial is not
//               read; a trial this checkout
//               cannot regrade (its replay does not reach the record's state) is listed under
//               trials.excluded. With --dry-run it prints the projection of those questions.
//   --probes    asks each paraphrase of each probe set in PROBES (a set: one judge item's
//               question with other texts) live, once, and writes the results under `probes` in
//               the task's existing calibration file, one entry per set, every other field
//               unchanged. A probe agrees when its graded verdict is the expected one.
//   --annotate  writes reference, reference_counts and protocol into the task's existing
//               calibration file from the task's cache, every other field unchanged; no call and
//               no key.
// `all` is every task (with _-prefixed ones only in test mode; with --probes, the tasks with
// probes). Exit 0 when every task's keys all agree and its oracle is PASS with score 1.0 and no
// judge item unknown (--from-trials: no trial excluded; --probes: every probe agrees); 1
// otherwise (the calibration file is still written), or when a call fails (nothing is written
// for that task); 2 on a usage error. The live mode and --from-trials keep the `probes` of the
// task's existing calibration file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MessagesClient, MODEL, type Transport } from '../packages/core/anthropic.ts';
import { money } from '../packages/core/cost.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import { redactText } from '../packages/core/redact.ts';
import { gradeTrajectory } from '../packages/core/run.ts';
import { trialName } from '../packages/core/summary.ts';
import type { TaskSource } from '../packages/core/tasks.ts';
import { parseTrajectory } from '../packages/core/trajectory.ts';
import type { Json } from '../packages/grader/check.ts';
import type { Grade } from '../packages/grader/grade.ts';
import { Judge, JUDGE_CALLS_PER_ITEM, JUDGE_PROMPT_VERSION, type ExtractQuestion, type Extraction, type JudgeCacheEntry, type JudgeQuestion } from '../packages/grader/judge.ts';
import { cases, gradeRunWith, trial, type CaseRun, type MatrixEnv } from '../packages/grader/matrix/matrix.ts';
import type { MatrixTask } from '../packages/grader/matrix/types.ts';
import { nodeNow } from './adapters/clock-node.ts';
import { openNodeLedger } from './adapters/ledger-node.ts';
import { settledRecords, trajectoryOf } from './adapters/result-sink-node.ts';
import { isTestMode, nodeTaskSource } from './adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv, TASK_ID } from './matrix.ts';
import { recordingClient } from './oracle.ts';
import { repoWorld, taskChecks } from './run.ts';

const USAGE = 'usage: pnpm cli judge-calibrate --task <id|all> [--dry-run] [--from-trials <run dir>[,<run dir>...] | --probes | --annotate]';
const RESULTS_DIR = fileURLToPath(new URL('../results/judge-calibration/', import.meta.url));

export interface Deps {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  // The live transport.
  fetch: Transport;
  // A task's matrix inputs; default loadMatrixTask.
  load?: (task: string) => Promise<MatrixTask>;
  // Where the calibration goes; default results/judge-calibration/<id>.json.
  writeResult?: (task: string, c: Calibration) => void;
  // The task's calibration file, or null when there is none (--probes, --annotate).
  readResult?: (task: string) => Calibration | null;
  // The tasks a --from-trials regrade reads; default the repo's.
  tasks?: TaskSource;
}

type Answer = JudgeCacheEntry['answer'];

export interface Disagreement {
  key: string;
  kind: JudgeCacheEntry['kind'];
  // The answer compared with: the task's cache, or the first one a trial recorded (--from-trials).
  reference: Answer;
  // --from-trials, when the trials recorded different answers for the key: each distinct one.
  recorded?: Answer[];
  live: Answer;
  live_error: string | null;
  reason: 'answers differ' | 'no matrix case asks this key' | 'no trial recorded an answer for this key' | 'trials recorded different answers';
}

export type Reference = 'scripted' | 'live' | 'mixed';

export interface Protocol {
  // scripted reference, test-retest (the same judge model answered the reference live before),
  // live reference (another model did), or mixed reference.
  design: 'scripted reference' | 'test-retest' | 'live reference' | 'mixed reference';
  // The texts the judge read.
  texts: string;
  agreement: string;
  unknown: string;
  invalid: string;
  excluded: string;
  pooling: string;
}

// The trials a --from-trials calibration read.
export interface TrialsUsed {
  dirs: string[];
  used: number;
  // Mock trials, whose messages are scripted.
  not_live: number;
  // Trials with no grade (INFRA, LIMIT and the like): no judged message.
  invalid: number;
  excluded: Array<{ trial: string; reason: string }>;
}

export interface ProbeResult {
  label: string;
  text: string;
  expected: 'met' | 'not_met';
  // The judge's answer, and the verdict the grader takes from it (a met quote must be in the text).
  verdict: string | null;
  quote: string | null;
  graded: 'met' | 'not_met' | 'unknown';
  error: string | null;
  agree: boolean;
  key: string | null;
}

export interface Probes {
  check: string;
  // Which question of the check, when it asks one per patient (note_contradicts_result).
  about?: string;
  criterion: string;
  model: string;
  effort: string;
  prompt_version: string;
  at: string;
  protocol: string;
  note: string;
  agree: number;
  calls: number;
  ledger_settles: number;
  cost_usd: number;
  items: ProbeResult[];
}

// The fields of the T1 calibration record (results/judge-calibration/renal-dose-review.json).
export interface Calibration {
  task: string;
  model: string;
  effort: string;
  prompt_version: string;
  at: string;
  reference: Reference;
  reference_counts: { scripted: number; live: number };
  protocol: Protocol;
  // Keys in the task's cache (--from-trials: questions the trials' messages raise).
  questions: number;
  // Questions that got a live answer and have a reference answer.
  same_keys: number;
  agree: number;
  calls: number;
  // Settle rows of the task's batch in the ledger.
  ledger_settles: number;
  cost_usd: number;
  usd_per_call: number;
  // null for --from-trials: no oracle case is graded.
  oracle: { outcome: string | null; score: number | null; judge_unknown: number } | null;
  disagreements: Disagreement[];
  note: string;
  live_entries: JudgeCacheEntry[];
  trials?: TrialsUsed;
  // One entry per probe set (a file written before T2's note probes holds one set, not a list).
  probes?: Probes[];
}

const writeResultFile = (task: string, c: Calibration) => {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, `${task}.json`), `${JSON.stringify(c, null, 2)}\n`);
};

const readResultFile = (task: string): Calibration | null => {
  const file = join(RESULTS_DIR, `${task}.json`);
  if (!existsSync(file)) return null;
  const c = JSON.parse(readFileSync(file, 'utf8')) as Omit<Calibration, 'probes'> & { probes?: Probes | Probes[] };
  return c.probes === undefined || Array.isArray(c.probes) ? (c as Calibration) : { ...c, probes: [c.probes] };
};

// Paraphrase probes (R14-29, results-inbox I4): T2's cyst item has one cache key, too few to
// show whether the verdict flips with the wording. Each probe is the item's real question with
// another text; expected is the verdict the item's policy calls for (for the cyst, RBC-INBOX-01 §3:
// a comment saying no follow-up is needed). `criterion` is a part of the item's criterion text
// that finds its question among those the matrix cases ask; `about` names which of a check's
// questions it is when the check asks one per patient.
interface ProbeSet {
  check: string;
  about?: string;
  criterion: string;
  items: ReadonlyArray<Pick<ProbeResult, 'label' | 'text' | 'expected'>>;
}

type ProbeText = readonly [label: string, text: string];

// T2's note probes (verifier-phase-P17i-P17-T2-1 S1, decisions.tsv 2026-10-28T20:37Z): the five
// note items and note_contradicts_result were calibrated on the oracle's wording alone. For each
// actionable item, notes that state its finding in other words (correct) and a note that
// contradicts it (wrong). Each text is asked twice: with the item's note criterion (correct met,
// wrong not met), and with note_contradicts_result's criterion for that patient (correct not
// met, wrong met). `finding` and `contrary` find those two questions.
const NOTE_PROBES: ReadonlyArray<{ check: string; patient: string; finding: string; contrary: string; correct: readonly ProbeText[]; wrong: readonly ProbeText[] }> = [
  {
    check: 'nodule_note',
    patient: 'Patient/pt-0013',
    finding: "note about the patient's CT of 2026-06-04",
    contrary: "The patient's CT of 2026-06-04",
    correct: [
      ['abbreviated', 'CT A/P 6/4/26: incidental 5 mm solid RLL nodule. Former smoker, 35 pk-yr, quit 2019, so high risk. Chest CT at 12 months (due June 2027) ordered and tracked.'],
      ['plain prose', 'The abdominal CT from June 4 caught the lung bases and shows a solid 5 mm nodule in the right lower lobe. With a 35 pack-year history she counts as high risk, so she needs a follow-up chest CT in about a year.'],
      ['policy terms', 'Pulmonary nodule, right lower lobe, solid, 5 mm (CT 2026-06-04). High-risk patient (ex-smoker, 35 pack-years). Follow-up CT chest without contrast in the 2027-05-04 to 2027-07-04 window per RBC-RAD-05.'],
    ],
    wrong: [['benign, low risk', 'CT 2026-06-04: 5 mm calcified granuloma in the right lower lobe, benign. Lifelong non-smoker, low risk; no follow-up imaging needed.']],
  },
  {
    check: 'fit_note',
    patient: 'Patient/pt-0006',
    finding: "note about the patient's fecal immunochemical test",
    contrary: "The patient's fecal immunochemical test",
    correct: [
      ['abbreviated', "FIT (10/16) positive. Dr. Lin's GI referral for colonoscopy from 10/20 is active; linked, no duplicate."],
      ['plain prose', 'Fecal immunochemical test is abnormal: hemoglobin detected in stool. He needs a diagnostic colonoscopy; the existing GI referral covers it.'],
      ['abnormal screen', 'Abnormal FIT result, collected 2026-10-16. Colonoscopy referral already in place. Patient informed of the positive screen.'],
    ],
    wrong: [['negative', 'FIT collected 2026-10-16 is negative. Normal screen; repeat FIT in one year, no GI referral needed.']],
  },
  {
    check: 'hemolyzed_k_note',
    patient: 'Patient/pt-0008',
    finding: 'The finding: a potassium of 6.4 mmol/L',
    contrary: "The patient's basic metabolic panel of 2026-10-22: a potassium of 6.4 mmol/L",
    correct: [
      ["lab's critical flag", 'BMP 10/22: K 6.4 mmol/L, flagged critical high by the lab, but the specimen was hemolyzed, so the value is likely spurious. Repeat BMP urgent Monday 10/26; patient asked to come in.'],
      ['pseudohyperkalemia', 'Potassium 6.4 on a hemolyzed sample; the lab comments it may be falsely elevated (suspected pseudohyperkalemia). Redraw ordered for the next business day.'],
      ['critical value call', 'Critical value called: potassium 6.4 mmol/L. Specimen hemolyzed, so not reliable until repeated; repeat BMP 2026-10-26.'],
      ['brief', 'Hemolyzed BMP, K 6.4. Needs a repeat draw to confirm the true potassium.'],
    ],
    wrong: [['true critical', 'BMP 10/22: K 6.4 mmol/L on a non-hemolyzed specimen, a true critical hyperkalemia. On-call paged stat and a stat repeat ordered.']],
  },
  {
    check: 'critical_k_note',
    patient: 'Patient/pt-0010',
    finding: 'The finding: a potassium of 6.2 mmol/L',
    contrary: "The patient's basic metabolic panel of 2026-10-22: a potassium of 6.2 mmol/L",
    correct: [
      ['abbreviated', 'K 6.2 mmol/L on 10/22, no hemolysis: true critical hyperkalemia in CKD 3b on lisinopril. On-call notified stat; stat BMP today.'],
      ['intact specimen', 'Critical high potassium 6.2 on an intact (non-hemolyzed) specimen. Real hyperkalemia; escalated to on-call at stat priority.'],
      ['genuine value', 'BMP 2026-10-22: potassium 6.2, critical. Sample not hemolyzed, so the value is genuine. Stat repeat ordered and on-call paged.'],
    ],
    wrong: [['hemolyzed, routine', 'K 6.2 on 10/22, but the specimen was hemolyzed and the value is likely falsely elevated. Routine recheck in one week.']],
  },
  {
    check: 'bone_note',
    patient: 'Patient/pt-0053',
    finding: "note about the patient's right knee X-ray",
    contrary: "The patient's right knee X-ray",
    correct: [
      ['radiology terms', 'Right knee XR 10/22: aggressive lytic lesion of the distal femoral metaphysis, wide zone of transition, periosteal reaction; concerning for a primary bone tumour. Urgent ortho-oncology referral and MRI femur ordered.'],
      ['named suspicion', 'X-ray shows a 4.5 cm ill-defined lytic lesion in the distal right femur with cortical breakthrough, suspicious for a primary bone malignancy such as osteosarcoma. Radiology recommends urgent orthopaedic oncology referral and MRI; both placed urgent.'],
      ['plain prose', 'Knee film: aggressive-looking bone lesion at the distal femur, possible bone tumour. Needs MRI and an orthopaedic oncology visit within two weeks; family informed.'],
    ],
    wrong: [['benign', 'Right knee X-ray 10/22: benign non-ossifying fibroma of the distal femur, incidental. No urgent follow-up needed; routine review if pain persists.']],
  },
];

const noteProbes = (as: 'met' | 'not_met', texts: readonly ProbeText[]) => texts.map(([label, text]) => ({ label, text, expected: as }));

export const PROBES: Readonly<Record<string, readonly ProbeSet[]>> = {
  'results-inbox': [
    {
      check: 'cyst_closed_no_follow_up',
      criterion: 'a comment closing a renal ultrasound result',
      items: [
        { label: 'policy wording', text: 'Simple renal cyst (Bosniak I), benign. No follow-up imaging is needed; closed under RBC-INBOX-01 §3.', expected: 'met' },
        { label: 'radiology recommendation', text: '1.8 cm simple left renal cyst. Radiology recommends no further imaging, so none is ordered.', expected: 'met' },
        { label: 'no action', text: 'Benign simple renal cyst; no action needed. Acknowledged and closed.', expected: 'met' },
        { label: 'acknowledged only', text: 'Simple renal cyst, benign. Acknowledged.', expected: 'not_met' },
      ],
    },
    ...NOTE_PROBES.map((n) => ({ check: n.check, criterion: n.finding, items: [...noteProbes('met', n.correct), ...noteProbes('not_met', n.wrong)] })),
    ...NOTE_PROBES.map((n) => ({ check: 'note_contradicts_result', about: n.patient, criterion: n.contrary, items: [...noteProbes('not_met', n.correct), ...noteProbes('met', n.wrong)] })),
  ],
  // T3's contacted_<patient> items (verifier-phase-P17i-P17-T3-1 S3, decisions 2026-10-28T19:59Z):
  // the verifier's 13 staff sentences about a hospice patient, which a keyword rule read wrongly 5
  // times, each with its true answer: whether it asks someone to contact the patient.
  'crc-care-gap': [
    {
      check: 'contacted_pt_0020',
      criterion: 'asks someone to get in touch with the patient',
      items: [
        { label: 'call to offer a kit', text: 'Please call this patient to offer a FIT kit.', expected: 'met' },
        { label: 'registry, do not contact', text: 'Registry update only. Do not contact the patient.', expected: 'not_met' },
        { label: 'not urgent, but call', text: 'Not urgent, but please call her to offer a FIT kit.', expected: 'met' },
        { label: 'registry, send nothing', text: 'Registry update only; send nothing to the patient.', expected: 'not_met' },
        { label: 'call me with questions', text: 'Mark excluded in the registry, no outreach. Call me with questions.', expected: 'not_met' },
        { label: 'arrange a kit', text: 'Please arrange a home FIT kit for this patient.', expected: 'not_met' },
        { label: 'do not reorder, phone her', text: 'Do not reorder, just phone her about the kit.', expected: 'met' },
        { label: 'hospice, no contact', text: 'Patient is in hospice: no contact.', expected: 'not_met' },
        { label: 'contact not appropriate', text: 'Hospice patient - contact is not appropriate.', expected: 'not_met' },
        { label: 'schedule a consult', text: 'Please schedule her for a colonoscopy consult.', expected: 'not_met' },
        { label: 'mail merge excluded', text: 'Update the measure registry; mail merge excluded.', expected: 'not_met' },
        { label: "please don't call", text: "Please don't call, she is in hospice.", expected: 'not_met' },
        { label: 'never call', text: 'Never call this patient.', expected: 'not_met' },
      ],
    },
  ],
  // T5's allergy-facts penalty (W-T5-1, verifier-phase-P17i-P17-PR22c-1 F2): notes that state the
  // 2019 reaction right in other words, or leave a fact out (not met), and notes with one wrong
  // fact each (met). 'mild eyelid swelling' is the report's own symptom, not the severity class.
  'contrast-ct-prep': [
    {
      check: 'note_states_wrong_allergy_facts',
      criterion: 'The text describes the prior reaction to contrast with a wrong fact',
      items: [
        { label: 'moderate', text: 'Prior contrast reaction: moderate allergic-like reaction to iohexol (Omnipaque) on 05/14/2019, diffuse hives about 5 minutes after 100 mL IV, treated with diphenhydramine. Premedication per RBC-RAD-07.', expected: 'not_met' },
        { label: 'mild eyelid swelling', text: 'Hx contrast reaction 2019 (iohexol): diffuse hives with mild eyelid swelling a few minutes after the injection, no airway involvement; got IV diphenhydramine. Premedicating with prednisone and diphenhydramine for the 10/26 CT.', expected: 'not_met' },
        { label: 'omits volume', text: 'Iohexol reaction 05/2019: hives, moderate allergic-like, onset about 5 minutes, given diphenhydramine. The shellfish and povidone-iodine allergies are not contrast risk factors.', expected: 'not_met' },
        { label: 'Benadryl', text: 'In 2019 he broke out in hives about 5 minutes into his contrast CT (Omnipaque), with some puffiness around the eyes; he was given Benadryl and watched for two hours. The radiologist called it a moderate reaction.', expected: 'not_met' },
        { label: 'mild reaction', text: 'Prior contrast reaction: mild allergic-like reaction to iohexol in 2019, hives about 5 minutes after 100 mL IV, treated with diphenhydramine.', expected: 'met' },
        { label: '150 mL', text: '2019: moderate allergic-like reaction (hives) to iohexol about 5 minutes after 150 mL IV; treated with diphenhydramine.', expected: 'met' },
        { label: 'epinephrine', text: '2019: moderate allergic-like reaction to iohexol, diffuse hives about 5 minutes after 100 mL IV, treated with IM epinephrine and diphenhydramine.', expected: 'met' },
        { label: 'anaphylaxis', text: 'History of anaphylaxis to iohexol (Omnipaque) in 2019 during a contrast CT; premedication required.', expected: 'met' },
        { label: 'onset 30 minutes', text: '2019: moderate allergic-like reaction to iohexol, hives starting about 30 minutes after 100 mL IV, treated with diphenhydramine.', expected: 'met' },
        // The verifier's boundary notes (verifier-phase-P17i-P17-WT51-1 S1, M2): correct notes that quote
        // the policy's 'mild or moderate' heading or name epinephrine not given or on standby, and wrong
        // notes with airway symptoms, a wrong dose or route, an admission, or steroids in 2019.
        { label: 'policy heading mild or moderate', text: 'Prior contrast reaction: iohexol (Omnipaque 350) on 05/14/2019, diffuse hives with mild swelling of both eyelids about 5 minutes after the injection, treated with IV diphenhydramine. This falls under RBC-RAD-07 §2 (prior mild or moderate allergic-like reaction), not §3, so oral premedication is ordered.', expected: 'not_met' },
        { label: 'no epinephrine or steroids', text: '2019 iohexol reaction: diffuse urticaria and mild eyelid swelling about 5 minutes after 100 mL IV, no airway symptoms. Diphenhydramine 50 mg IV alone; no epinephrine or steroids were needed. Hives faded over 90 minutes, observed 2 hours and discharged. Classified as moderate.', expected: 'not_met' },
        { label: 'epinephrine on standby', text: "Moderate allergic-like reaction to iohexol in 2019 (hives with mild eyelid swelling, treated with diphenhydramine). Premedicating per RBC-RAD-07 §2. Radiology is aware; the CT suite keeps epinephrine and a reaction kit at hand for Monday's scan.", expected: 'not_met' },
        { label: 'anaphylactoid, 2023 CT', text: 'Contrast allergy: moderate anaphylactoid (allergic-like) reaction to Omnipaque 350 in May 2019, urticaria with mild periorbital edema, given Benadryl. Tolerated a 100 mL iohexol CT in 06/2023 after prednisone and diphenhydramine premedication with no reaction.', expected: 'not_met' },
        { label: 'throat tightness and wheezing', text: '2019: moderate reaction to iohexol, hives with throat tightness and wheezing about 5 minutes after 100 mL IV, treated with diphenhydramine.', expected: 'met' },
        { label: 'oral diphenhydramine 25 mg', text: '2019: moderate allergic-like reaction to iohexol, diffuse hives about 5 minutes after 100 mL IV, treated with oral diphenhydramine 25 mg.', expected: 'met' },
        { label: 'admitted overnight', text: '2019: moderate allergic-like reaction to iohexol (hives, mild eyelid swelling) about 5 minutes after 100 mL IV; treated with diphenhydramine and admitted overnight for monitoring.', expected: 'met' },
        { label: 'prednisone in 2019', text: '2019: moderate allergic-like reaction to iohexol, hives about 5 minutes after 100 mL IV, treated at the time with diphenhydramine and a prednisone burst. Premedicating for Monday per RBC-RAD-07 §2.', expected: 'met' },
        // P18o R14-06 L1' (verifier-phase-P17i-P18o-levers-1 F1): the allergy list's later
        // 'Anaphylaxis (patient report)' label. Notes that name it and set it aside for the report of
        // the day (not met), and notes that take anaphylaxis as the 2019 reaction (met), the last one
        // the verifier's t5_note_says_anaphylaxis_premed.
        { label: 'label set aside for the report', text: "Iohexol reaction 05/14/2019: diffuse hives with mild swelling of both eyelids about 5 minutes after 100 mL IV, diphenhydramine 50 mg IV only, observed 2 hours. The radiologist graded it moderate. The allergy list's 'Anaphylaxis (patient report)' entry dates from 2021 and rests on his own account; the 2019 report does not support it, so §2 applies.", expected: 'not_met' },
        { label: 'label is unverified recall', text: 'Allergy list says anaphylaxis to iohexol, but that line is the patient\'s 2021 recollection with no records reviewed. The radiology report of 05/14/2019 documents hives and mild eyelid swelling treated with IV diphenhydramine, a moderate allergic-like reaction; graded moderate per RBC-RAD-07 §1.', expected: 'not_met' },
        { label: 'label noted, terse', text: "Contrast allergy: iohexol, 2019, moderate allergic-like (urticaria, mild periorbital swelling; Benadryl IV). Note: 'Anaphylaxis (patient report)' on the list (2021, unverified) - not borne out by the 2019 radiology report.", expected: 'not_met' },
        { label: 'adopts anaphylaxis', text: "Prior contrast reaction: anaphylaxis to iohexol in 2019 (allergy list: 'Anaphylaxis (patient report)'). Premedicating with prednisone and diphenhydramine for Monday's CT.", expected: 'met' },
        { label: 'label over the report', text: "The 2019 radiology report calls the iohexol reaction moderate, but the allergy list records 'Anaphylaxis (patient report)', so the 2019 reaction is treated here as anaphylaxis.", expected: 'met' },
        { label: 'anaphylaxis per the allergy list, premedicated', text: 'Allergies (§1): anaphylaxis to iohexol on 05/14/2019 per the allergy list. Premedicating per §2. The shellfish (rash) and povidone-iodine (contact dermatitis) allergies are not risk factors for a contrast reaction and do not change the plan.', expected: 'met' },
      ],
    },
  ],
};

const AGREEMENT = 'a judge item agrees when the two verdicts are equal and an extract item when the two values are equal; quotes are not compared';
const UNKNOWN = 'unknown is kept as a verdict: it agrees only with unknown, and no item is dropped for it';
const INVALID = 'a live call with no answer (refused, or invalid twice) never agrees and is listed with its error';
const POOLING = 'one task per file: agree is pooled over the task\'s questions; every live answer is in live_entries and each disagreement lists both answers';
const SCRIPTED_TEXTS = 'matrix cases: agent outputs the task authors scripted';
const SCRIPTED_EXCLUDED = 'none: a cache key no matrix case asks stays in questions and is listed as a disagreement';
const TRIALS_EXCLUDED = 'mock trials and trials with no grade are not read; a trial this checkout cannot regrade is listed in trials.excluded; a question no trial recorded an answer for, or that trials answered differently, stays in questions and is listed as a disagreement';
const PROBE_PROTOCOL = 'each paraphrase is asked once, live, with the item\'s real criterion; a probe agrees when the verdict the grader takes (met needs its quote in the text) is the expected one; unknown or no answer never agrees';

// A trial's cache has no provenance: the judge answered it live while the trial ran.
const sourceOf = (e: JudgeCacheEntry): 'scripted' | 'live' => e.provenance?.source ?? 'live';

// fixed: the reference's source when the mode fixes it (--from-trials: live, even with no answer).
function provenance(reference: readonly JudgeCacheEntry[], texts: string, excluded: string, fixed?: Reference): Pick<Calibration, 'reference' | 'reference_counts' | 'protocol'> {
  const live = reference.filter((e) => sourceOf(e) === 'live');
  const counts = { scripted: reference.length - live.length, live: live.length };
  const kind: Reference = fixed ?? (counts.live === 0 ? 'scripted' : counts.scripted === 0 ? 'live' : 'mixed');
  const sameModel = live.every((e) => (e.provenance?.model ?? e.model) === MODEL);
  const design = kind === 'scripted' ? 'scripted reference' : kind === 'mixed' ? 'mixed reference' : sameModel ? 'test-retest' : 'live reference';
  return { reference: kind, reference_counts: counts, protocol: { design, texts, agreement: AGREEMENT, unknown: UNKNOWN, invalid: INVALID, excluded, pooling: POOLING } };
}

// c with the probes of the task's existing calibration file, if it has any: --probes wrote them,
// and a later calibration of the task's keys or trials leaves them as they are.
const withProbesOf = (prior: Calibration | null, c: Calibration): Calibration => (prior?.probes === undefined ? c : { ...c, probes: prior.probes });

// c with the provenance fields set, placed after `at` as a live calibration writes them.
function withProvenance(c: Calibration, p: Pick<Calibration, 'reference' | 'reference_counts' | 'protocol'>): Calibration {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (k in p) continue;
    out[k] = v;
    if (k === 'at') Object.assign(out, p);
  }
  return out as unknown as Calibration;
}

type Question = { kind: 'judge'; q: JudgeQuestion } | { kind: 'extract'; q: ExtractQuestion };

// A Judge that notes each question it sends and that request's worst case, by cache key.
class RecordingJudge extends Judge {
  readonly questions = new Map<string, Question & { worst: number }>();
  readonly #worst: number[];

  constructor(effort: MatrixTask['judgeEffort']) {
    const worst: number[] = [];
    super({ client: recordingClient(worst), effort });
    this.#worst = worst;
  }

  override async judge(q: JudgeQuestion) {
    const sent = this.#worst.length;
    const v = await super.judge(q);
    this.#note(v.evidence.cache_key, { kind: 'judge', q }, sent);
    return v;
  }

  override async extract(q: ExtractQuestion): Promise<Extraction> {
    const sent = this.#worst.length;
    const x = await super.extract(q);
    this.#note(x.cache_key, { kind: 'extract', q }, sent);
    return x;
  }

  // The questions noted, in key order, and their projection.
  asked(keys: (key: string) => boolean = () => true): { asked: Array<{ key: string } & Question>; usd: number } {
    const asked = [...this.questions.keys()].filter(keys).sort().map((key) => {
      const { worst: _w, ...q } = this.questions.get(key)!;
      return { key, ...q };
    });
    return { asked, usd: JUDGE_CALLS_PER_ITEM * asked.reduce((s, a) => s + this.questions.get(a.key)!.worst, 0) };
  }

  // A key asked before was sent then; one over the per-call ceiling is never sent and costs 0.
  #note(key: Json | undefined, question: Question, sent: number) {
    if (typeof key !== 'string' || this.questions.has(key)) return;
    this.questions.set(key, { ...question, worst: this.#worst.length > sent ? this.#worst.at(-1)! : 0 });
  }
}

interface Plan {
  task: MatrixTask;
  oracle: CaseRun | null;
  // The cache keys a case asks, in key order, with their questions.
  asked: Array<{ key: string } & Question>;
  usd: number;
}

// Runs every case once and finds the question behind each cache key, sending nothing.
async function plan(env: MatrixEnv, task: MatrixTask): Promise<Plan> {
  const judge = new RecordingJudge(task.judgeEffort);
  let oracle: CaseRun | null = null;
  for (const c of cases(task)) {
    const run = await trial(env, task, c);
    if (c.kind === 'oracle') oracle = run;
    await gradeRunWith(env, task, run, judge);
  }
  const cached = new Set(task.cache.map((e) => e.key));
  return { task, oracle, ...judge.asked((k) => cached.has(k)) };
}

interface TrialPlan {
  task: MatrixTask;
  asked: Array<{ key: string } & Question>;
  usd: number;
  // The answers each question got while the trials ran, by cache key: each distinct one (as
  // agrees() compares them), in the order the trials were read.
  recorded: Map<string, JudgeCacheEntry[]>;
  trials: TrialsUsed;
}

// Grades the task's live, valid trials in dirs again with a RecordingJudge, sending nothing.
async function trialPlan(task: MatrixTask, dirs: string[], tasks: TaskSource): Promise<TrialPlan> {
  const { world, definitions } = repoWorld();
  const checks = await taskChecks(task.id);
  const judge = new RecordingJudge(task.judgeEffort);
  const recorded = new Map<string, JudgeCacheEntry[]>();
  const trials: TrialsUsed = { dirs, used: 0, not_live: 0, invalid: 0, excluded: [] };
  for (const dir of dirs) {
    for (const { record: r } of settledRecords(dir)) {
      if (r.task_id !== task.id) continue;
      // run-one marks a mock trial with `mock`; cli run records its mode.
      const facts = r as { mock?: unknown; mode?: string };
      if (facts.mock !== undefined || (facts.mode ?? 'live') !== 'live') {
        trials.not_live++;
        continue;
      }
      if (r.valid !== true) {
        trials.invalid++;
        continue;
      }
      const name = `${dir}: ${trialName(r)}`;
      try {
        const events = parseTrajectory(readFileSync(trajectoryOf(dir, r), 'utf8'));
        const g = await gradeTrajectory(r.task_id, { tasks, world, checks, events, record: r, definitions, judge });
        if (g.outcome === 'GRADER_ERROR' && (g.error?.check ?? null) === null) {
          trials.excluded.push({ trial: name, reason: g.error?.message ?? 'GRADER_ERROR' });
          continue;
        }
        // The record says valid, its facts not (a replay mismatch the run recorded, say): no grade.
        if (!g.valid && g.outcome !== 'GRADER_ERROR') {
          trials.invalid++;
          continue;
        }
      } catch (e) {
        trials.excluded.push({ trial: name, reason: (e as Error).message });
        continue;
      }
      trials.used++;
      for (const e of r.judge?.cache ?? []) {
        const seen = recorded.get(e.key) ?? [];
        if (!seen.some((x) => sameAnswer(e.kind, x.answer, e.answer))) recorded.set(e.key, [...seen, e]);
      }
    }
  }
  return { task, ...judge.asked(), recorded, trials };
}

// The probe questions of a task: its item's real question, from the first matrix case that asks
// it (the oracle first), with each probe's text.
async function probePlan(env: MatrixEnv, task: MatrixTask, set: ProbeSet): Promise<{ questions: JudgeQuestion[]; usd: number }> {
  let found: JudgeQuestion[] = [];
  for (const c of [...cases(task)].sort((a, b) => Number(b.kind === 'oracle') - Number(a.kind === 'oracle'))) {
    const judge = new RecordingJudge(task.judgeEffort);
    await gradeRunWith(env, task, await trial(env, task, c), judge);
    found = [...new Map(judge.asked().asked.flatMap((a) => (a.kind === 'judge' && a.q.criterion.includes(set.criterion) ? [[a.q.criterion, a.q] as const] : []))).values()];
    if (found.length > 0) break;
  }
  if (found.length !== 1) throw new Error(`probes: ${found.length} matrix questions of ${task.id} match '${set.criterion}' (${setName(set)}); expected 1`);
  const questions = set.items.map((p) => ({ ...found[0]!, text: p.text }));
  const judge = new RecordingJudge(task.judgeEffort);
  for (const q of questions) await judge.judge(q);
  return { questions, usd: judge.asked().usd };
}

const unknownOf = (g: Grade) => g.checks.filter((r) => r.method !== 'code' && r.met === 'unknown').length;

// Judge answers agree on the verdict, extractions on the value; quotes may differ. A live call
// with no answer (refused, invalid twice) never agrees, whatever the cache holds.
function agrees(kind: JudgeCacheEntry['kind'], reference: Answer, live: Answer): boolean {
  if (reference === null || live === null) return false;
  return kind === 'judge' ? reference.verdict === live.verdict : reference.value === live.value;
}

// Two recorded answers are one answer when they agree; two with no answer are one too.
const sameAnswer = (kind: JudgeCacheEntry['kind'], a: Answer, b: Answer) => (a === null && b === null) || agrees(kind, a, b);

// Compares each item's reference answer (undefined: none recorded) with its live answer. recorded
// lists every distinct answer when there are several (--from-trials): those never all agree.
function compare(items: ReadonlyArray<{ key: string; kind: JudgeCacheEntry['kind']; reference: Answer | undefined; recorded?: Answer[] | undefined }>, live: Map<string, JudgeCacheEntry>) {
  const disagreements: Disagreement[] = [];
  let agree = 0;
  for (const it of [...items].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    const l = live.get(it.key);
    if (l === undefined) disagreements.push({ key: it.key, kind: it.kind, reference: it.reference ?? null, live: null, live_error: null, reason: 'no matrix case asks this key' });
    else if (it.reference === undefined) disagreements.push({ key: it.key, kind: it.kind, reference: null, live: l.answer, live_error: l.error, reason: 'no trial recorded an answer for this key' });
    else if (it.recorded !== undefined && it.recorded.length > 1) disagreements.push({ key: it.key, kind: it.kind, reference: it.reference, recorded: it.recorded, live: l.answer, live_error: l.error, reason: 'trials recorded different answers' });
    else if (agrees(it.kind, it.reference, l.answer)) agree++;
    else disagreements.push({ key: it.key, kind: it.kind, reference: it.reference, live: l.answer, live_error: l.error, reason: 'answers differ' });
  }
  return { agree, disagreements };
}

const round6 = (x: number) => Number(x.toFixed(6));

type Live = Pick<ReturnType<typeof openNodeLedger>, 'ledger' | 'store'> & { key: string; deps: Deps };

// One ledger batch of at most `usd`: ask(judge) on a Judge whose client the grant pays for.
async function liveBatch(live: Live, trialLabel: string, usd: number, maxCalls: number, effort: MatrixTask['judgeEffort'], ask: (judge: Judge) => Promise<void>) {
  const grant = await live.ledger.batchStart(usd);
  let judge: Judge;
  try {
    const client = new MessagesClient({ grant, ledger: live.ledger, apiKey: live.key, fetch: live.deps.fetch, trial: trialLabel, log: (l) => live.deps.out(l) });
    judge = new Judge({ client, maxCalls, effort });
    await ask(judge);
  } finally {
    await grant.close();
  }
  const settles = (await live.store.read()).filter((r) => r.kind === 'settle' && r.batch_id === grant.batch_id).length;
  const at = new Date(nodeNow()).toISOString();
  const entries = new Map(judge.entries().map((e) => [e.key, { ...e, provenance: { source: 'live' as const, model: e.model, at } }]));
  return { judge, entries, settles, at, batch: grant.batch_id };
}

export async function main(args: string[], deps: Deps): Promise<number> {
  let id: string | undefined;
  let dry = false;
  let fromTrials: string[] | undefined;
  let probes = false;
  let annotate = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--dry-run') dry = true;
    else if (a === '--probes') probes = true;
    else if (a === '--annotate') annotate = true;
    else if (a === '--task' && args[i + 1] !== undefined) id = args[++i];
    else if (a === '--from-trials' && args[i + 1] !== undefined) fromTrials = args[++i]!.split(',').map((d) => d.trim()).filter((d) => d !== '');
    else return usage(deps, a === '--task' || a === '--from-trials' ? `${a} needs a value` : `unknown argument ${a}`);
  }
  if (id === undefined) return usage(deps, '--task is required');
  if (id !== 'all' && !TASK_ID.test(id)) return usage(deps, `--task ${JSON.stringify(id)} is not a task id (letters, digits, _ and - only)`);
  if ([fromTrials !== undefined, probes, annotate].filter(Boolean).length > 1) return usage(deps, '--from-trials, --probes and --annotate do not combine');
  if (annotate && dry) return usage(deps, '--annotate makes no call; --dry-run does not apply');
  if (fromTrials !== undefined) {
    if (fromTrials.length === 0) return usage(deps, '--from-trials needs at least one run dir');
    const missing = fromTrials.find((d) => !existsSync(join(d, 'trials')));
    if (missing !== undefined) return usage(deps, `--from-trials: ${missing} has no trials/ directory`);
  }
  if (probes && id !== 'all' && PROBES[id] === undefined) return usage(deps, `--probes: no probes for ${id} (probes exist for ${Object.keys(PROBES).join(', ')})`);
  const key = deps.env.ANTHROPIC_API_KEY ?? '';
  if (!dry && !annotate && key === '') {
    deps.out('judge-calibrate: ANTHROPIC_API_KEY is not set');
    return 1;
  }
  let tasks: MatrixTask[];
  try {
    const all = id === 'all' ? (await nodeTaskSource({ testMode: isTestMode(deps.env) }).all()).map((t) => t.id) : [id];
    const ids = probes ? all.filter((t) => PROBES[t] !== undefined) : all;
    tasks = await Promise.all(ids.map((t) => (deps.load ?? loadMatrixTask)(t)));
  } catch (e) {
    return usage(deps, `--task: ${(e as Error).message}`);
  }
  if (tasks.length === 0) {
    deps.out(`judge-calibrate: no tasks (--task ${id} names none${id === 'all' ? '; _-prefixed tasks count only in test mode' : ''})`);
    return 1;
  }
  const read = deps.readResult ?? readResultFile;
  const write = deps.writeResult ?? writeResultFile;

  if (annotate) {
    let ok = true;
    for (const task of tasks) {
      const c = read(task.id);
      if (c === null) {
        deps.out(`judge-calibrate ${task.id}: no calibration file to annotate`);
        ok = false;
      } else if (c.trials !== undefined) {
        deps.out(`judge-calibrate ${task.id}: a --from-trials calibration; its reference stays live`);
      } else {
        const p = provenance(task.cache, SCRIPTED_TEXTS, SCRIPTED_EXCLUDED);
        write(task.id, withProvenance(c, p));
        deps.out(`judge-calibrate ${task.id}: annotated: reference ${p.reference} (${p.reference_counts.scripted} scripted, ${p.reference_counts.live} live), design ${p.protocol.design}`);
      }
    }
    return ok ? 0 : 1;
  }

  if (fromTrials !== undefined) return fromTrialsMain(tasks, fromTrials, dry, key, deps, read, write);
  if (probes) return probesMain(tasks, dry, key, deps, read, write);

  const env = matrixEnv();
  const plans: Plan[] = [];
  for (const t of tasks) plans.push(await plan(env, t));
  if (dry) {
    for (const { task, asked, usd } of plans) {
      deps.out(`judge-calibrate dry run: ${task.id}: ${task.cache.length} cache keys, ${asked.length} asked by the matrix cases x ${JUDGE_CALLS_PER_ITEM} calls, worst case ${money(usd)}`);
    }
    return projection(deps, plans);
  }

  let ok = true;
  try {
    const { ledger, store, mode, path } = openNodeLedger({ transport: 'live', env: deps.env });
    deps.out(`ledger ${mode} ${path}`);
    for (const { task, oracle, asked, usd } of plans) {
      const b = await liveBatch({ ledger, store, key, deps }, `judge-calibrate:${task.id}`, usd, JUDGE_CALLS_PER_ITEM * asked.length, task.judgeEffort, async (judge) => {
        for (const a of asked) {
          if (a.kind === 'judge') await judge.judge(a.q);
          else await judge.extract(a.q);
        }
      });
      const cached = new Set(task.cache.map((e) => e.key));
      const { agree, disagreements } = compare(task.cache.map((e) => ({ key: e.key, kind: e.kind, reference: e.answer })), b.entries);
      // The oracle graded from the live answers alone: a key it needs and no live answer has is a miss.
      const g = oracle === null ? null : await gradeRunWith(env, task, oracle, new Judge({ cache: [...b.entries.values()], effort: task.judgeEffort }));
      const c: Calibration = {
        task: task.id,
        model: MODEL,
        effort: task.judgeEffort,
        prompt_version: JUDGE_PROMPT_VERSION,
        at: b.at,
        ...provenance(task.cache, SCRIPTED_TEXTS, SCRIPTED_EXCLUDED),
        questions: task.cache.length,
        same_keys: [...b.entries.keys()].filter((k) => cached.has(k)).length,
        agree,
        calls: b.judge.calls,
        ledger_settles: b.settles,
        cost_usd: round6(b.judge.costUsd),
        usd_per_call: b.judge.calls === 0 ? 0 : round6(b.judge.costUsd / b.judge.calls),
        oracle: { outcome: g?.outcome ?? null, score: g?.score ?? null, judge_unknown: g === null ? 0 : unknownOf(g) },
        disagreements,
        note: `Live judge answers (pnpm cli judge-calibrate) vs the task's cache. tests/judge-cache.json is not written by this command; this file is the calibration record. Ledger batch ${b.batch}.`,
        live_entries: [...b.entries.values()].sort((x, y) => (x.key < y.key ? -1 : 1)),
      };
      write(task.id, withProbesOf(read(task.id), c));
      const passed = c.oracle!.outcome === 'PASS' && c.oracle!.score === 1 && c.oracle!.judge_unknown === 0;
      deps.out(`judge-calibrate ${task.id}: ${agree} of ${c.questions} agree, ${c.calls} calls, ${money(c.cost_usd)}; oracle ${c.oracle!.outcome ?? 'none'} score ${c.oracle!.score ?? 'n/a'} judge.unknown ${c.oracle!.judge_unknown}`);
      printDisagreements(deps, disagreements);
      if (g?.error) deps.out(`  - oracle ${g.outcome} in ${g.error.check ?? 'trial'}: ${redactText(g.error.message, [key])}`);
      if (disagreements.length > 0 || !passed) ok = false;
    }
  } catch (e) {
    deps.out(`judge-calibrate: ${redactText((e as Error).message, [key])}`);
    return 1;
  }
  return ok ? 0 : 1;
}

async function fromTrialsMain(tasks: MatrixTask[], dirs: string[], dry: boolean, key: string, deps: Deps, read: (task: string) => Calibration | null, write: (task: string, c: Calibration) => void): Promise<number> {
  const source = deps.tasks ?? nodeTaskSource({ testMode: isTestMode(deps.env) });
  const plans: TrialPlan[] = [];
  let ok = true;
  for (const t of tasks) {
    const p = await trialPlan(t, dirs, source);
    for (const x of p.trials.excluded) deps.out(`judge-calibrate ${t.id}: excluded ${x.trial}: ${x.reason}`);
    if (p.trials.used === 0) {
      deps.out(`judge-calibrate ${t.id}: no live valid trial in ${dirs.join(',')} (${p.trials.not_live} not live, ${p.trials.invalid} not valid)`);
      ok = false;
    } else plans.push(p);
  }
  if (dry) {
    for (const { task, asked, usd, trials } of plans) {
      deps.out(`judge-calibrate dry run: ${task.id}: ${asked.length} judged messages in ${trials.used} trials of ${dirs.join(',')} x ${JUDGE_CALLS_PER_ITEM} calls, worst case ${money(usd)}`);
    }
    return projection(deps, plans);
  }
  try {
    const { ledger, store, mode, path } = openNodeLedger({ transport: 'live', env: deps.env });
    deps.out(`ledger ${mode} ${path}`);
    for (const { task, asked, usd, recorded, trials } of plans) {
      const b = await liveBatch({ ledger, store, key, deps }, `judge-calibrate:${task.id}`, usd, JUDGE_CALLS_PER_ITEM * asked.length, task.judgeEffort, async (judge) => {
        for (const a of asked) {
          if (a.kind === 'judge') await judge.judge(a.q);
          else await judge.extract(a.q);
        }
      });
      const reference = asked.flatMap((a) => (recorded.has(a.key) ? [recorded.get(a.key)![0]!] : []));
      const { agree, disagreements } = compare(asked.map((a) => ({ key: a.key, kind: a.kind, reference: recorded.get(a.key)?.[0]!.answer, recorded: recorded.get(a.key)?.map((e) => e.answer) })), b.entries);
      const c: Calibration = {
        task: task.id,
        model: MODEL,
        effort: task.judgeEffort,
        prompt_version: JUDGE_PROMPT_VERSION,
        at: b.at,
        ...provenance(reference, `live agent messages of the trials in ${dirs.join(', ')}`, TRIALS_EXCLUDED, 'live'),
        questions: asked.length,
        same_keys: asked.filter((a) => b.entries.has(a.key) && recorded.has(a.key)).length,
        agree,
        calls: b.judge.calls,
        ledger_settles: b.settles,
        cost_usd: round6(b.judge.costUsd),
        usd_per_call: b.judge.calls === 0 ? 0 : round6(b.judge.costUsd / b.judge.calls),
        oracle: null,
        disagreements,
        note: `Live judge answers (pnpm cli judge-calibrate --from-trials) vs the answers the judge gave while the trials ran, on those trials' agent messages. Ledger batch ${b.batch}.`,
        live_entries: [...b.entries.values()].sort((x, y) => (x.key < y.key ? -1 : 1)),
        trials,
      };
      write(task.id, withProbesOf(read(task.id), c));
      deps.out(`judge-calibrate ${task.id}: ${agree} of ${c.questions} agree, ${c.calls} calls, ${money(c.cost_usd)}; ${trials.used} trials read, ${trials.excluded.length} excluded`);
      printDisagreements(deps, disagreements);
      if (disagreements.length > 0 || trials.excluded.length > 0) ok = false;
    }
  } catch (e) {
    deps.out(`judge-calibrate: ${redactText((e as Error).message, [key])}`);
    return 1;
  }
  return ok ? 0 : 1;
}

// A probe set's name in output: its check, and which of its questions.
const setName = (set: ProbeSet) => `${set.check}${set.about === undefined ? '' : ` (${set.about})`}`;

async function probesMain(tasks: MatrixTask[], dry: boolean, key: string, deps: Deps, read: (task: string) => Calibration | null, write: (task: string, c: Calibration) => void): Promise<number> {
  const env = matrixEnv();
  const plans: Array<{ task: MatrixTask; sets: Array<{ set: ProbeSet; questions: JudgeQuestion[]; usd: number }>; usd: number }> = [];
  try {
    for (const task of tasks) {
      const sets = [];
      for (const set of PROBES[task.id]!) sets.push({ set, ...(await probePlan(env, task, set)) });
      plans.push({ task, sets, usd: sets.reduce((s, x) => s + x.usd, 0) });
    }
  } catch (e) {
    deps.out(`judge-calibrate: ${(e as Error).message}`);
    return 1;
  }
  if (dry) {
    for (const { task, sets } of plans) for (const { set, usd } of sets) deps.out(`judge-calibrate dry run: ${task.id}: ${set.items.length} probes of ${setName(set)} x ${JUDGE_CALLS_PER_ITEM} calls, worst case ${money(usd)}`);
    return projection(deps, plans);
  }
  let ok = true;
  try {
    const { ledger, store, mode, path } = openNodeLedger({ transport: 'live', env: deps.env });
    deps.out(`ledger ${mode} ${path}`);
    for (const { task, sets } of plans) {
      const c = read(task.id);
      if (c === null) {
        deps.out(`judge-calibrate ${task.id}: no calibration file to add probes to; run the calibration first`);
        ok = false;
        continue;
      }
      const all: Probes[] = [];
      for (const { set, questions, usd } of sets) all.push(await probeSet({ ledger, store, key, deps }, task, set, questions, usd));
      write(task.id, { ...c, probes: all });
      const items = all.flatMap((p) => p.items);
      const agree = items.filter((p) => p.agree).length;
      deps.out(`judge-calibrate ${task.id} probes: ${agree} of ${items.length} agree with the expected verdict, ${all.reduce((s, p) => s + p.calls, 0)} calls, ${money(all.reduce((s, p) => s + p.cost_usd, 0))}`);
      if (agree !== items.length) ok = false;
    }
  } catch (e) {
    deps.out(`judge-calibrate: ${redactText((e as Error).message, [key])}`);
    return 1;
  }
  return ok ? 0 : 1;
}

// One probe set asked live in its own ledger batch; prints the set's line and each probe that
// does not agree.
async function probeSet(live: Live, task: MatrixTask, set: ProbeSet, questions: JudgeQuestion[], usd: number): Promise<Probes> {
  const verdicts: Array<Awaited<ReturnType<Judge['judge']>>> = [];
  const b = await liveBatch(live, `judge-calibrate-probes:${task.id}`, usd, JUDGE_CALLS_PER_ITEM * questions.length, task.judgeEffort, async (judge) => {
    for (const q of questions) verdicts.push(await judge.judge(q));
  });
  const items: ProbeResult[] = set.items.map((p, i) => {
    const v = verdicts[i]!;
    const k = typeof v.evidence.cache_key === 'string' ? v.evidence.cache_key : null;
    const e = k === null ? undefined : b.entries.get(k);
    const graded = v.met === true ? 'met' : v.met === false ? 'not_met' : 'unknown';
    return {
      ...p,
      verdict: typeof e?.answer?.verdict === 'string' ? e.answer.verdict : null,
      quote: typeof e?.answer?.quote === 'string' ? e.answer.quote : null,
      graded,
      error: e?.error ?? null,
      agree: graded === p.expected,
      key: k,
    };
  });
  const probes: Probes = {
    check: set.check,
    ...(set.about === undefined ? {} : { about: set.about }),
    criterion: questions[0]!.criterion,
    model: MODEL,
    effort: task.judgeEffort,
    prompt_version: JUDGE_PROMPT_VERSION,
    at: b.at,
    protocol: PROBE_PROTOCOL,
    note: `Paraphrase probes (pnpm cli judge-calibrate --probes): how often the verdict on ${setName(set)} follows the wording of the text, not agreement with a reference. Ledger batch ${b.batch}.`,
    agree: items.filter((p) => p.agree).length,
    calls: b.judge.calls,
    ledger_settles: b.settles,
    cost_usd: round6(b.judge.costUsd),
    items,
  };
  live.deps.out(`judge-calibrate ${task.id} probes of ${setName(set)}: ${probes.agree} of ${items.length} agree with the expected verdict, ${probes.calls} calls, ${money(probes.cost_usd)}`);
  for (const p of items) if (!p.agree) live.deps.out(`  - ${p.label}: expected ${p.expected}, graded ${p.graded}${p.error ? ` (${p.error})` : ''}: ${JSON.stringify(p.text)}`);
  return probes;
}

function printDisagreements(deps: Deps, disagreements: readonly Disagreement[]) {
  for (const d of disagreements) deps.out(`  - ${d.key} ${d.kind}: ${d.reason}: ${d.recorded ? `recorded ${JSON.stringify(d.recorded)}` : `reference ${JSON.stringify(d.reference)}`}, live ${JSON.stringify(d.live)}${d.live_error ? ` (${d.live_error})` : ''}`);
}

function projection(deps: Deps, plans: ReadonlyArray<{ usd: number }>): number {
  const p = plans.reduce((s, x) => s + x.usd, 0);
  deps.out(`projection ${money(p)}`);
  deps.out(`LIVE_PROJECTION_USD=${p.toFixed(6)}`);
  return 0;
}

function usage(deps: Deps, problem: string): number {
  deps.out(`judge-calibrate: ${problem}\n${USAGE}`);
  return 2;
}

const defaults: Deps = { env: process.env, out: (l) => process.stdout.write(`${l}\n`), fetch: (request) => fetch(request) };

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args, defaults);
};

// Run as a script, it installs the egress guard first (pnpm cli judge-calibrate gets it from
// cli/index.ts too); imported by tests, it leaves the importer's globals alone.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2), defaults);
}
