// Trial outcomes (design section 5, "Outcomes"): the one definition of which outcomes exist,
// which count as valid trials, and whose fault each one is. The grader (packages/grader), the
// cost model's final-run reserve (cost.ts) and every reader of a record import it from here, so
// they cannot disagree on whether a trial counts.
//
// Each trial gets exactly one outcome, checked in this order. The first five are never valid
// trials and never model failures: they are rerun, not graded. CANCELLED sits with the INFRA
// outcomes: the run was stopped from outside, so it says nothing about the model. GRADER_ERROR
// is a check that threw, or a regrade whose world or replay differs from the record: the
// grader's fault, never rerun (RERUN_OUTCOMES). REFUSAL, LIMIT, FAIL and PASS are valid and count
// in the headline denominator. GRADER_BUG is set only by an audit, never by code, so it is not
// listed.
//
// The attribution definitions (plan phase P14a) live here too, and only here: FAULT_DEFINITIONS
// (one sentence per Fault and the criteria that decide it), FAULT_PRECEDENCE, the confirmation
// criteria M1-M5 and CONFIRMATION_DEFINITIONS, RUN_BLOCKS, AUDIT_LABEL, PASS_DEFINITION, DENOMINATOR_RULE and
// DENOMINATOR_OPERATOR_NOTE. explain.ts evaluates the criteria; the UI, cli/audit-check.ts, the
// auditor prompt and the writeup render these strings, and scripts/test/one-definition.test.ts
// fails on a copy written anywhere else.
export const OUTCOMES = ['INVALID', 'INFRA_HARNESS', 'INFRA_API', 'CANCELLED', 'ENV_ERROR', 'GRADER_ERROR', 'REFUSAL', 'LIMIT', 'FAIL', 'PASS'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const VALID_OUTCOMES: readonly Outcome[] = ['REFUSAL', 'LIMIT', 'FAIL', 'PASS'];

// An allowlist: an unknown, misspelled or missing outcome is not a valid trial.
export const isValid = (o: string | null | undefined): boolean => (VALID_OUTCOMES as readonly (string | null | undefined)[]).includes(o);

// Whose fault an outcome is: the model's (it failed or did not finish), a refusal (reported
// both ways), the environment's, the grader's, or the infrastructure's (API, harness, a
// substituted model, a stop from outside). A PASS is nobody's fault.
export type Fault = 'model' | 'refusal' | 'env' | 'grader' | 'infra';
export const FAULT: Readonly<Record<Outcome, Fault | null>> = {
  INVALID: 'infra',
  INFRA_HARNESS: 'infra',
  INFRA_API: 'infra',
  CANCELLED: 'infra',
  ENV_ERROR: 'env',
  GRADER_ERROR: 'grader',
  REFUSAL: 'refusal',
  LIMIT: 'model',
  FAIL: 'model',
  PASS: null,
};

// The excluded outcomes a rerun can cure. A grader's fault is not one: rerunning would pay for a
// model trial to work around a grader bug.
export const RERUN_OUTCOMES: readonly Outcome[] = OUTCOMES.filter((o) => !isValid(o) && FAULT[o] !== 'grader');
const NEVER_RERUN: readonly Outcome[] = OUTCOMES.filter((o) => !isValid(o) && FAULT[o] === 'grader');

// done-when (6)'s three attribution labels, and the one mapping from the five faults to them. An
// INFRA trial gets no label: it is not a failure, it is excluded from the valid denominator and
// rerun.
export type AuditLabelName = 'model' | 'environment' | 'grader';
export const AUDIT_LABEL: Readonly<Record<Fault, { label: AuditLabelName; subtype: 'refusal' | null } | null>> = {
  model: { label: 'model', subtype: null },
  refusal: { label: 'model', subtype: 'refusal' },
  grader: { label: 'grader', subtype: null },
  env: { label: 'environment', subtype: null },
  infra: null,
};
export const AUDIT_LABELS: readonly AuditLabelName[] = [...new Set(Object.values(AUDIT_LABEL).flatMap((l) => (l === null ? [] : [l.label])))];
// The adjudicated_label that confirms a PASS (verifier-phase-P17j-retro-JG5-unread-1 D1). Labels
// attribute failures, so a PASS row has two outcomes when its model_fault is unclear or its LLM
// auditor disagrees: the adjudicator labels it grader, a false PASS (GR5), or confirms the PASS with
// this value, and a confirmed PASS carries no label (decisions.tsv 2026-10-29T14:50). It is not an
// audit label: the row it settles gives none (explain.ts auditLabelOf). It settles only the rows
// passConfirmationBreaks allows; cli/audit-check.ts rejects it anywhere else.
export const PASS_CONFIRMED = 'pass';
export type Adjudication = AuditLabelName | typeof PASS_CONFIRMED;
// When PASS_CONFIRMED settles a row (verifier-phase-P17i-P17j-S3retro-1 A1): the current grade is
// PASS; the row needs adjudication, because its model_fault is unclear, its LLM auditor disagrees,
// or an adjudicated yes overrules an auditor's no; and, when the row has a label of its own, any
// label, valid or not (verifier-phase-P17i-P17j-S3retror2-1 B3), a non-empty note says why it is
// overruled. The rule the row breaks, or null when it settles it. explain.ts reads a pass that
// breaks one as no adjudication, so the row keeps its own label (a false PASS nobody disputed stays
// GR5), and cli/audit-check.ts names the rule as a violation.
export function passConfirmationBreaks(
  row: { model_fault?: string | null; llm_auditor_agrees?: boolean | null; note?: string | null } & Partial<Record<`${'' | 'adjudicated_'}${'clinically_acceptable' | 'tool_rejections_correct'}`, string | null>>,
  ownLabel: string | null,
  outcome: string,
): string | null {
  if (outcome !== 'PASS') return `adjudicated_label ${PASS_CONFIRMED} confirms a PASS, and the current grade is ${outcome}`;
  const overruled = (['clinically_acceptable', 'tool_rejections_correct'] as const).some((q) => row[q] === 'no' && row[`adjudicated_${q}`] === 'yes');
  if (!(row.model_fault === 'unclear' || row.llm_auditor_agrees === false || overruled)) {
    return `adjudicated_label ${PASS_CONFIRMED} confirms a PASS only on a row that needs adjudication (model_fault unclear, the LLM auditor disagrees, or an answer no overruled to yes); nothing here calls for it`;
  }
  if (ownLabel !== null && !hasNote(row)) return `adjudicated_label ${PASS_CONFIRMED} overrules the label ${ownLabel}, and needs a note that says why`;
  return null;
}

// A row's note says something: it is text, and not blank. A note that is not text is no note
// (cli/audit-check.ts readLabels reports it; verifier-phase-P17i-P17j-S3retror2-1 B1n).
export const hasNote = (row: { note?: unknown }): boolean => typeof row.note === 'string' && row.note.trim() !== '';

// The grader validation matrix's verdict on one grader_task_version (pnpm cli matrix --out
// writes it to matrix.json under that key). failed_checks names the gate checks the oracle or an
// alternative fails; absent when the matrix does not say.
export interface MatrixResult {
  grader_task_version: string;
  oracle_pass: boolean;
  alternatives_pass: boolean;
  failed_checks?: readonly string[];
}

// What a criterion is checked over: one trial's facts at its current grade, gathered by
// explain.ts from the record, the audit row and the caller's context. null where the caller
// could not say (no manifest, no matrix, no world to ask).
export interface AttributionFacts {
  // record.outcome, or the last record.regrades[].outcome (summary.ts currentGrade).
  outcome: string;
  regraded: boolean;
  status: string | null;
  detail: string | null;
  stop_reason: string | null;
  model_requested: string | null;
  // MODEL (packages/core/anthropic.ts), the model every trial must request and get.
  model_expected: string | null;
  models_returned: readonly string[];
  internal_errors: number;
  state_hash: { initial: string | null; final: string | null; replay_final: string | null };
  // The message of the trial's ENV_ERROR event when the caller has the trajectory (run.ts: for a
  // replay_mismatch, the call, its tool and what differs); absent or null when it does not.
  env_error?: string | null;
  manifest_hash: string | null;
  // The grader_task_version of the current grade (summary.ts currentGrade): what the matrix
  // must have validated for its verdict to speak for this grade. null when the record or its
  // last regrade predates the env/grader split.
  grader_task_version: string | null;
  // The decisive gate check of the current grade (attribution.ts decisiveGate), the first failed
  // gate check when it is another (first_failed, else null), and the decisive ids of both, the
  // decisive check's first (decisions.tsv 2026-10-28T20:55); exposure null when nothing says what
  // these ids were exposed at (a regrade failed another check and the caller could not recompute it).
  // exposable: a tool result exposed or referenced the id to a passing oracle or alternative in the
  // matrix run on the trial's world and env_version (R14-30); null when it was exposed, or when
  // exposability_unchecked says why the matrix cannot say.
  decisive: { id: string; first_failed: string | null; exposure: ReadonlyArray<{ id: string; first_exposed_step: number | null; exposable: boolean | null }> | null; exposability_unchecked?: string | null } | null;
  matrix: MatrixResult | null;
  check_error: { check: string | null; message: string } | null;
  // The audit row's answers clinically_acceptable and tool_rejections_correct (explain.ts AuditRow),
  // each its adjudicated answer when the row has one, else the auditor's: 'yes', 'no' or null when
  // the row gives neither. decisive_step is the step the row cites, and cited_step that step of the
  // trajectory (null when the row cites none or the trajectory has no such step).
  audit: {
    outcome: string; label: AuditLabelName | null; model_fault: string | null; llm_auditor_agrees: boolean | null; adjudicated_label: Adjudication | null; evidence_ids: readonly string[];
    clinically_acceptable: AuditAnswer | null; tool_rejections_correct: AuditAnswer | null; decisive_step: number | null;
    // schema_error: the cited refusal's input broke the tool's input schema, or named no tool (explain.ts citedStep).
    cited_step: { tool: string; is_error: boolean; error_code: string | null; schema_error: string | null } | null;
  } | null;
}

// An audit row's answer to one of its two questions (explain.ts AuditRow).
export type AuditAnswer = 'yes' | 'no';

// 'n/a': the criterion asks about something the trial does not have (M1 with no failed check).
export type CriterionMet = boolean | 'pending' | 'n/a';
export interface CriterionResult {
  met: CriterionMet;
  evidence: string;
}
export interface Criterion {
  id: string;
  // One sentence a reader can check against the record.
  text: string;
  // The record fields (and audit row, manifest, matrix, world or trajectory) the check reads.
  reads: readonly string[];
  check: (f: AttributionFacts) => CriterionResult;
  // An environment or grader criterion that is a fact of the record: when it decides, the label is
  // confirmed without an audit (CONFIRMATION_DEFINITIONS). The others are judgments an audit confirms.
  record_fact?: boolean;
}
export interface FaultDefinition {
  sentence: string;
  // Any one that holds makes the fault apply; FAULT_PRECEDENCE picks among faults that apply.
  criteria: readonly Criterion[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const replayOk = (h: AttributionFacts['state_hash']) => h.final !== null && h.replay_final === h.final;
const ENV_DETAILS = ['INTERNAL', 'initial_hash_mismatch', 'replay_mismatch'];
const result = (met: CriterionMet, evidence: string): CriterionResult => ({ met, evidence });
// What confirms an audit's tool_rejections_correct no for E6, or null: an adjudicated_label
// environment, or with no adjudicated_label an agreeing LLM auditor; an adjudicated label that is
// not environment confirms nothing (decisions.tsv 2026-10-27T08:50). audit-check reads it too.
export const e6Confirmation = (a: { adjudicated_label: string | null; llm_auditor_agrees: boolean | null }): string | null =>
  a.adjudicated_label !== null ? (a.adjudicated_label === 'environment' ? 'adjudicated environment' : null) : a.llm_auditor_agrees === true ? 'LLM auditor agrees' : null;
// Holds exactly when the criterion is not met; pending or n/a decide nothing.
const negation = (c: Criterion['check']): Criterion['check'] => (f) => {
  const r = c(f);
  return result(r.met === false, r.evidence);
};
const statusIs = (o: Outcome) => (f: AttributionFacts) => result(f.status === o || f.outcome === o, `status ${f.status}${f.detail ? `, detail ${f.detail}` : ''}`);

// The criteria that confirm a model or refusal label: all met is confirmed, one pending is
// provisional, one not met is contradicted. M1-M4 not met each make an env or grader criterion
// hold (E5, E1, E2 or E4, GR4), so a trial labelled model never shows them not met. M4 and GR4 ask
// about the check the trial failed: a matrix that fails another check is the run-level block B1,
// a note, and decides no trial's fault.
const M1: Criterion = {
  id: 'M1',
  text: "Every deciding record of the failed gate check, and of the first failed gate check when that is another, was shown to the model, or is reachable: in the grader validation matrix, run on the trial's world and environment version, a tool result showed or referenced it to the task's reference solution or an accepted alternative, so a tool would have returned it had the model asked.",
  reads: ['record.attribution.exposure (recomputed from the trajectory when a regrade failed another check)', "manifest world_hash and matrix.json's world_hash (the same world)", "record env_version and matrix.json's env_version (the same env files and tools)", "matrix.json's ids a tool result showed or referenced to the oracle and the alternatives that ran as expected (probes[].reachable_ids, as_expected)"],
  check: ({ decisive, outcome }) => {
    // A check that threw leaves no verdict on the model, though the grade records it not met.
    if (outcome === 'GRADER_ERROR') return result('n/a', 'a grader check failed with an error, so no gate check gave a verdict on the model');
    if (decisive === null) return result('n/a', 'no gate check failed');
    const checks = decisive.first_failed === null ? decisive.id : `${decisive.id} and ${decisive.first_failed}`;
    if (decisive.exposure === null) return result('pending', `the record does not say what the decisive ids of ${checks} were exposed at`);
    if (decisive.exposure.length === 0) return result(true, `${checks} ${decisive.first_failed === null ? 'names' : 'name'} no decisive ids`);
    const lines = decisive.exposure.map((e) =>
      e.first_exposed_step !== null ? `${e.id} exposed at step ${e.first_exposed_step}`
        : e.exposable === true ? `${e.id} never exposed but exposable (the reference solution or an accepted alternative reached it in the matrix)`
          : e.exposable === false ? `${e.id} was never exposed and is not exposable (neither the reference solution nor an accepted alternative reached it in the matrix)`
            : `${e.id} never exposed; exposability not checked${decisive.exposability_unchecked ? ` (${decisive.exposability_unchecked})` : ''}`);
    const met = decisive.exposure.every((e) => e.first_exposed_step !== null || e.exposable === true) ? true
      : decisive.exposure.some((e) => e.first_exposed_step === null && e.exposable === false) ? false : 'pending';
    return result(met, lines.join('; '));
  },
};
const M3: Criterion = {
  id: 'M3',
  text: 'The start state hash is the same as the hash in the run manifest, and a replay of the trajectory gives the same final state hash.',
  reads: ['record.state_hash.initial', 'record.state_hash.final', 'record.state_hash.replay_final', 'manifest world_hash'],
  check: ({ state_hash: h, manifest_hash }) => {
    const replay = replayOk(h) ? `replay_final equals final ${h.final}` : `replay_final ${h.replay_final} is not final ${h.final}`;
    if (!replayOk(h) || h.initial === null) return result(false, `${h.initial === null ? 'no initial hash; ' : ''}${replay}`);
    if (manifest_hash === null) return result('pending', `run has no manifest; initial ${h.initial} not compared; ${replay}`);
    return result(h.initial === manifest_hash, `initial ${h.initial} ${h.initial === manifest_hash ? 'equals' : 'is not'} the manifest's ${manifest_hash}; ${replay}`);
  },
};
const M4: Criterion = {
  id: 'M4',
  text: "The task's reference solution and every accepted alternative pass the grader validation matrix at the grader version of the trial's current grade, or none of them fails the gate check the trial failed, or the trial's outcome is not FAIL (a refusal or a limit comes from the record status, which no grader fix changes).",
  reads: ['record.outcome', 'record.grader_task_version, or its last regrade\'s', 'record.checks (the first failed gate check)', 'matrix oracle_pass, alternatives_pass and failed_checks for that grader_task_version'],
  check: ({ outcome, matrix, grader_task_version: g, decisive }) => {
    if (matrix === null || g === null) return result('pending', `no grader validation matrix result for grader_task_version ${g ?? 'unknown (the grade predates the env/grader split)'}`);
    if (matrix.grader_task_version !== g) return result('pending', `the matrix result is for grader_task_version ${matrix.grader_task_version}, the current grade is at ${g}`);
    const verdict = `oracle ${matrix.oracle_pass ? 'passes' : 'fails'}, alternatives ${matrix.alternatives_pass ? 'all pass' : 'do not all pass'} on grader_task_version ${g}`;
    if (matrix.oracle_pass && matrix.alternatives_pass) return result(true, verdict);
    if (decisive === null) return result(true, `${verdict}; the trial failed no gate check`);
    if (outcome !== 'FAIL') return result(true, `${verdict}; the outcome ${outcome} comes from the record status, not from ${decisive.id}`);
    if (matrix.failed_checks === undefined) return result('pending', `${verdict}; the matrix does not say which checks fail, so it cannot say whether ${decisive.id} does`);
    const fails = matrix.failed_checks.includes(decisive.id);
    return result(!fails, `${verdict}, failing ${matrix.failed_checks.length === 0 ? 'no named check' : list(matrix.failed_checks)}; the trial failed ${decisive.id}`);
  },
};

export const CONFIRMATION_CRITERIA: readonly Criterion[] = [
  M1,
  {
    id: 'M2',
    text: 'No tool call of the trial returned an internal error.',
    reads: ['record.tool_errors.INTERNAL'],
    check: (f) => result(f.internal_errors === 0, plural(f.internal_errors, 'INTERNAL tool error')),
  },
  M3,
  M4,
  {
    id: 'M5',
    text: 'A human audit labels the trial model (its adjudicated label, else its label), and either the audit has an adjudicated label or it says the model is at fault and no LLM auditor disagrees.',
    reads: ['audit.adjudicated_label', 'audit.label (else implied by audit.taxonomy)', 'audit.model_fault', 'audit.llm_auditor_agrees'],
    check: ({ audit, outcome }) => {
      if (audit === null) return result('pending', 'not human-audited');
      if (outcome === 'PASS') return result(audit.outcome === 'PASS', `audited ${audit.outcome}`);
      const llm = audit.llm_auditor_agrees === null ? 'no LLM auditor verdict' : `LLM auditor ${audit.llm_auditor_agrees ? 'agrees' : 'disagrees'}`;
      const said = audit.adjudicated_label ?? audit.label;
      const met = said === 'model' && (audit.adjudicated_label !== null || (audit.model_fault === 'yes' && audit.llm_auditor_agrees !== false));
      return result(met, `labelled ${audit.label ?? 'none'}, model_fault ${audit.model_fault ?? 'none'}, ${llm}${audit.adjudicated_label === null ? '' : `, adjudicated ${audit.adjudicated_label}`}`);
    },
  },
];

export const FAULT_DEFINITIONS: Readonly<Record<Fault, FaultDefinition>> = {
  model: {
    sentence: 'The model is at fault when a valid trial failed a gate check or stopped at a limit, and no infrastructure, grader or environment criterion holds.',
    criteria: [
      {
        id: 'MF1',
        text: 'The trial failed a gate check in its current grade.',
        reads: ['record.outcome or the last record.regrades[].outcome', 'record.checks or the last record.regrades[].checks'],
        check: (f) => result(f.outcome === 'FAIL', `current outcome ${f.outcome}${f.decisive === null ? '' : `, ${f.decisive.id} failed`}`),
      },
      {
        id: 'MF2',
        text: 'The trial stopped at its turn, cost, time or output limit before the model finished.',
        reads: ['record.status', 'record.detail'],
        check: (f) => result(f.outcome === 'LIMIT', `current outcome ${f.outcome}${f.outcome === 'LIMIT' && f.detail ? `, ${f.detail} limit` : ''}`),
      },
    ],
  },
  refusal: {
    sentence: 'The model refuses when it does not do the task: a refusal counts as a model failure in the pass rate, and the results also give the pass rate without refusals.',
    criteria: [
      {
        id: 'R1',
        text: 'The API stopped the model\'s turn and gave refusal as the reason.',
        reads: ['record.stop_reason', 'record.status'],
        check: (f) => result(f.stop_reason === 'refusal' || f.status === 'REFUSAL' || f.outcome === 'REFUSAL', `stop_reason ${f.stop_reason ?? 'not recorded'}, status ${f.status}`),
      },
    ],
  },
  env: {
    sentence: 'The environment is at fault when a tool failed on its own or refused a valid call, the start or final state is not correct, an environment rule broke, or a record that a check needs was not reachable: no tool result showed it to the reference solution or an accepted alternative of the task in the grader validation matrix.',
    criteria: [
      {
        id: 'E1',
        record_fact: true,
        text: 'A tool call failed with an internal error, or the trial ended ENV_ERROR because of an internal error (M2 not met).',
        reads: ['record.tool_errors.INTERNAL', 'record.status', 'record.detail'],
        check: (f) => result(f.internal_errors > 0 || (f.status === 'ENV_ERROR' && f.detail === 'INTERNAL'), `${plural(f.internal_errors, 'INTERNAL tool error')}${f.detail === 'INTERNAL' ? ', ended ENV_ERROR INTERNAL' : ''}`),
      },
      {
        id: 'E2',
        record_fact: true,
        text: 'The start state hash is missing, or it is not the same as the hash in the run manifest.',
        reads: ['record.state_hash.initial', 'record.detail', 'manifest world_hash'],
        check: ({ detail, state_hash: h, manifest_hash }) =>
          result(detail === 'initial_hash_mismatch' || h.initial === null || (manifest_hash !== null && h.initial !== manifest_hash), `initial ${h.initial ?? 'missing'}, manifest ${manifest_hash ?? 'not given'}`),
      },
      {
        id: 'E3',
        record_fact: true,
        text: 'The trial ended ENV_ERROR for a reason different from an internal error or a wrong state hash, for example a broken environment rule.',
        reads: ['record.status', 'record.detail'],
        check: ({ status, detail }) => result(status === 'ENV_ERROR' && !ENV_DETAILS.includes(detail ?? ''), `status ${status}, detail ${detail}`),
      },
      {
        id: 'E4',
        record_fact: true,
        text: 'The final state hash is missing, or a replay of the trajectory did not give the same hash.',
        reads: ['record.state_hash.final', 'record.state_hash.replay_final', 'record.detail', 'trajectory error event'],
        // The evidence names the call that did not replay when the trajectory says which.
        check: ({ detail, state_hash: h, env_error }) => result(detail === 'replay_mismatch' || !replayOk(h), detail === 'replay_mismatch' && env_error ? env_error : `final ${h.final ?? 'missing'}, replay_final ${h.replay_final ?? 'missing'}`),
      },
      {
        id: 'E5',
        text: "A deciding record of the failed gate check, or of the first failed gate check when that is another, was never shown to the model, and in the grader validation matrix run on the trial's world and environment version no tool result showed or referenced it to the task's reference solution or an accepted alternative, so it was not reachable (M1 not met).",
        reads: M1.reads,
        check: negation(M1.check),
      },
      {
        id: 'E6',
        text: 'A human audit says, after adjudication, that a tool refusal was wrong: at the step the audit names as decisive, a tool refused a call, the trajectory shows a tool error there, and the tool\'s input schema, run on the recorded call, does not give the same refusal (a refusal the schema gives, or a refusal of a tool the environment does not have, was right); and the audit is confirmed, by an adjudicated label environment or, with no adjudicated label, an LLM auditor that agrees.',
        reads: ['audit.adjudicated_tool_rejections_correct (else audit.tool_rejections_correct)', 'audit.decisive_step', 'trajectory (the cited step is_error, and its call\'s input against the tool\'s input schema)', 'audit.adjudicated_label', 'audit.llm_auditor_agrees'],
        check: ({ audit }) => {
          if (audit === null) return result(false, 'not human-audited');
          const s = audit.cited_step;
          const refused = s === null ? '' : `refused (${s.error_code ?? 'error'})${s.schema_error === null ? '' : ` for input that breaks its schema (${s.schema_error})`}`;
          const step = audit.decisive_step === null ? 'no step cited' : s === null ? `step ${audit.decisive_step} is not in the trajectory` : `step ${audit.decisive_step} ${s.tool} ${s.is_error ? refused : 'succeeded'}`;
          const confirmed = e6Confirmation(audit);
          const unconfirmed = audit.adjudicated_label === null ? 'not confirmed' : `not confirmed (adjudicated ${audit.adjudicated_label})`;
          return result(audit.tool_rejections_correct === 'no' && s?.is_error === true && s.schema_error === null && confirmed !== null, `tool_rejections_correct ${audit.tool_rejections_correct ?? 'not answered'}, ${step}, ${confirmed ?? unconfirmed}`);
        },
      },
    ],
  },
  grader: {
    sentence: "The grader is at fault when a check failed with an error, a regrade could not grade the record, a human audit found a grader bug or a false PASS, or the task's reference solution or an accepted alternative fails the same check as the trial.",
    criteria: [
      {
        id: 'GR1',
        record_fact: true,
        text: 'A grader check failed with an error while the grader graded the trial.',
        reads: ['record.outcome', 'record.error.check', 'record.error.message'],
        check: (f) => result(f.outcome === 'GRADER_ERROR' && !f.regraded && f.check_error?.check != null, f.check_error === null ? 'no grader error' : `check ${f.check_error.check}: ${f.check_error.message}`),
      },
      {
        // A regrade keeps no error, so a check that threw in a regrade lands here too. A regrade
        // that cannot rebuild the recorded world is the grader's fault, not the environment's: the
        // trial's own hashes were checked when it ran (E2, E4), and only the regrade failed.
        id: 'GR2',
        record_fact: true,
        text: 'An offline regrade ended GRADER_ERROR, or the grade ended GRADER_ERROR and did not name the check that failed with an error.',
        reads: ['record.regrades[].outcome', 'record.outcome', 'record.error.check'],
        check: (f) => result(f.outcome === 'GRADER_ERROR' && (f.regraded || f.check_error?.check == null), `current outcome ${f.outcome}${f.regraded ? ', from a regrade' : ''}`),
      },
      {
        id: 'GR3',
        text: 'A human audit marks the trial as a grader bug (GRADER_BUG) and gives at least one evidence id.',
        reads: ['audit.outcome', 'audit.evidence_ids'],
        check: ({ audit }) => result(audit !== null && audit.outcome === 'GRADER_BUG' && audit.evidence_ids.length > 0, audit === null ? 'not human-audited' : `audited ${audit.outcome}, ${plural(audit.evidence_ids.length, 'evidence id')}`),
      },
      {
        id: 'GR4',
        text: 'In the grader validation matrix, the reference solution or an accepted alternative fails the same gate check as this FAIL trial (M4 not met).',
        reads: M4.reads,
        check: negation(M4.check),
      },
      {
        // A false PASS (P17j JG5): the only fault criterion that decides a PASS. explain.ts lets it
        // decide, and a GR5 trial is not counted as a pass and blocks the run (DENOMINATOR_RULE).
        id: 'GR5',
        text: 'The trial is a PASS, and a human audit of that PASS labels it grader with at least one evidence id: the grader passed a trial that the policy fails.',
        reads: ['record.outcome', 'audit.outcome', 'audit.label (else implied by audit.taxonomy)', 'audit.adjudicated_label', 'audit.evidence_ids'],
        // The row must be about the PASS: a grader label from the audit of a FAIL that a grader fix
        // and regrade turned into a PASS is the resolved failure, not a false PASS (JG5-1 S2). An
        // adjudicated_label pass (PASS_CONFIRMED) confirms the PASS over a label grader when
        // passConfirmationBreaks allows it; explain.ts passes any other pass as null. An audit
        // outcome GRADER_BUG (GR3) is the outcome form of a grader label on a failure; on a PASS it
        // is not a false PASS, because the row's outcome is the current grade (audit-check names the
        // mismatch and this form).
        check: ({ outcome, audit }) => {
          const said = audit === null ? null : (audit.adjudicated_label ?? audit.label);
          return result(outcome === 'PASS' && audit?.outcome === 'PASS' && said === 'grader' && audit.evidence_ids.length > 0, audit === null ? 'not human-audited' : `outcome ${outcome}, audited ${audit.outcome}, audit label ${said ?? 'none'}, ${plural(audit.evidence_ids.length, 'evidence id')}`);
        },
      },
    ],
  },
  infra: {
    sentence: 'The infrastructure is at fault when the API, the harness, a wrong model or a stop from outside ended the trial, so the trial gives no data about the model.',
    criteria: [
      {
        id: 'I1',
        text: 'The API returned, or the trial requested, a model different from the model under test, or the harness marked the trial INVALID.',
        reads: ['record.models_returned', 'record.model_requested', 'record.status', 'record.model_requested and record.models_returned against MODEL (packages/core/anthropic.ts), as packages/grader/outcome.ts compares them'],
        check: (f) => {
          const want = [f.model_requested, f.model_expected].filter((m): m is string => m !== null);
          const other = f.models_returned.filter((m) => want.some((w) => m !== w));
          const wrongRequest = f.model_requested !== null && f.model_expected !== null && f.model_requested !== f.model_expected;
          const evidence = wrongRequest ? `requested ${f.model_requested}, MODEL is ${f.model_expected}` : other.length > 0 ? `requested ${f.model_requested}, returned ${list([...new Set(other)])}` : `status ${f.status}${f.detail ? `, detail ${f.detail}` : ''}`;
          return result(other.length > 0 || wrongRequest || f.status === 'INVALID' || f.outcome === 'INVALID', evidence);
        },
      },
      { id: 'I2', text: 'The harness crashed or lost its worker before the trial ended.', reads: ['record.status', 'record.detail'], check: statusIs('INFRA_HARNESS') },
      { id: 'I3', text: 'The Anthropic API continued to fail after the client tried again.', reads: ['record.status', 'record.detail'], check: statusIs('INFRA_API') },
      { id: 'I4', text: 'A stop from outside the harness ended the run before the trial ended.', reads: ['record.status', 'record.detail'], check: statusIs('CANCELLED') },
    ],
  },
};

// Which fault decides when criteria of several hold. The FAULT map's fault of an outcome is
// always among them (an INFRA outcome meets an I criterion, GRADER_ERROR a GR one, and so on).
export const FAULT_PRECEDENCE: readonly Fault[] = ['infra', 'grader', 'env', 'refusal', 'model'];
export const FAULT_PRECEDENCE_RULE = 'When criteria of several faults hold, the first in the order infra, grader, environment, refusal, model decides and the others are shown as notes: a trial the infrastructure ended says nothing about the model, a grader fault on the check the trial failed means the grade itself is wrong, an environment fault means the trial was unfair to the model, and a refusal is reported both with and without refusals.';

// Run-level blocks: facts about a grader_task_version, not about one trial. One that holds is shown
// as a note on every trial whose current grade is at that grader_task_version, decides no trial's fault, and blocks the run
// (cli/audit-check.ts exits 1) until it no longer holds.
export const RUN_BLOCKS: readonly Criterion[] = [
  {
    id: 'B1',
    text: "The task's oracle or a declared alternative fails the grader validation matrix on the grader_task_version of the trial's current grade, which blocks the run until the task or the grader is fixed.",
    reads: ['record.grader_task_version, or its last regrade\'s', 'matrix oracle_pass and alternatives_pass for that grader_task_version'],
    check: ({ matrix, grader_task_version: g }) => {
      if (matrix === null || g === null || matrix.grader_task_version !== g) return result('pending', `no grader validation matrix result for grader_task_version ${g ?? 'unknown (the grade predates the env/grader split)'}`);
      const failed = matrix.failed_checks?.length ? `, failing ${list(matrix.failed_checks)}` : '';
      return result(!(matrix.oracle_pass && matrix.alternatives_pass), `oracle ${matrix.oracle_pass ? 'passes' : 'fails'}, alternatives ${matrix.alternatives_pass ? 'all pass' : 'do not all pass'} on grader_task_version ${g}${failed}`);
    },
  },
];

export type Confirmation = 'confirmed' | 'provisional' | 'contradicted';
export const CONFIRMATION_DEFINITIONS: Readonly<Record<Confirmation, string>> = {
  confirmed: 'Every criterion that can confirm the label is met: M1-M5 for a model or refusal label; for an environment or grader label, the record alone when E1-E4, GR1 or GR2 decided it, and a human audit with the same label when E5, E6, GR3, GR4 or GR5 decided it; and the record alone for infra.',
  provisional: 'Nothing contradicts the label, but a confirming criterion is still pending, such as a missing audit, manifest hash or matrix result.',
  contradicted: 'A confirming criterion is not met or a human audit gives another label, so the label must be reviewed before it is used.',
};

export const PASS_DEFINITION = 'A trial is a PASS when every gate check of its current grade is met (record.checks, or the last record.regrades[].checks); any environment or grader criterion that holds is shown as a note and does not change the outcome. A PASS is a false PASS (GR5) when the human audit of that PASS labels it grader with evidence: the outcome stays PASS, but it is the grader\'s fault and is not counted as a pass. A grader label from the audit of a failure that a grader fix and regrade turned into a PASS is not a false PASS, and neither is an audit outcome GRADER_BUG on a PASS: the audit row of a PASS has the outcome PASS, and a false PASS is its label grader.';

export const DENOMINATOR_RULE = [
  `Only ${list(VALID_OUTCOMES)} count in the denominator, and every other outcome is excluded: ${list(RERUN_OUTCOMES)} are excluded and rerun, and ${list(NEVER_RERUN)} ${NEVER_RERUN.length === 1 ? 'is' : 'are'} excluded and never rerun as a model trial.`,
  'A GRADER_ERROR in a committed run blocks the run until a grader fix and a full offline regrade, and a valid failure labelled environment or grader is not allowed in a committed run: cli audit-check fails the run until a grader label is resolved by that fix and regrade, or an environment label by an environment fix and a rerun of only the affected trials, disclosed in results/changelog.d, so a run with one has no headline pass rate.',
  'A false PASS (GR5) is not counted as a pass, and it blocks the run in the same way until a grader fix, a full offline regrade and a disclosure in results/changelog.d.',
  'A refusal counts as a model failure inside the denominator, and refusal_excluded_rate gives the pass rate with refusals left out.',
].join(' ');

export const DENOMINATOR_OPERATOR_NOTE = [
  'ENV_ERROR trials still count raw against the env_error_raw requirement.',
  "`summary --require grader_error=0` checks each record's current grade after any offline regrade, so a regraded record counts by its new outcome; the summary prints grader_error_history (every GRADER_ERROR ever recorded, regraded ones included) for disclosure, and grader_error_history is never a require key.",
].join(' ');
