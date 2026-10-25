// pnpm cli audit-check <run> [--final] [--json]
// Checks a run's human audit, <run>/audit.jsonl, one label per line (design section 5, "Human
// audit"; packages/core/explain.ts AuditRow):
//   {trial: "<task>/<index>", outcome, taxonomy, label?, label_subtype?, model_fault: yes|no|unclear,
//    decisive_step, evidence_ids: [...], llm_auditor_agrees, adjudicated_label?, note, criteria?}
// A PASS label has taxonomy, model_fault and decisive_step null. A row's label is its
// adjudicated_label, else its label, else the one its taxonomy implies (explain.ts auditLabelOf). Every check reads each record's current grade
// (packages/core/summary.ts currentGrade: its last cli regrade, else its recorded outcome), and the
// label set, the fault, the criteria and their texts come from packages/core/outcomes.ts through
// explain.ts explainTrial; nothing here restates them. It exits 1, naming each violation, unless:
//   - every failure (a valid trial that is not a PASS) has exactly one label, whose outcome is the
//     current grade, whose label is one of AUDIT_LABELS and equals AUDIT_LABEL of the trial's
//     fault (a refusal: model with subtype refusal), and whose taxonomy, on a model label that is
//     not a refusal, is in packages/grader/attribution.ts TAXONOMY;
//   - no INFRA or CANCELLED trial (FAULT infra) carries a label or is in the valid set;
//   - no failure label contradicts itself: on an outcome FAULT gives model, a model label never
//     says model_fault no, and an environment or grader label never says yes;
//   - each failure label names a decisive step that is a step of the trajectory;
//   - every evidence id of every label appears in the trajectory (exposed, referenced or written);
//   - confirmation criteria M1 and M4 (outcomes.ts CONFIRMATION_CRITERIA) are met on every failure:
//     pending is a violation too, because an audited trial must show met or not met;
//   - no failure is the environment's or the grader's fault (explain.ts excludedFromHeadline): such
//     a trial is not allowed in a committed run, so a run with one has no headline pass rate
//     (DENOMINATOR_RULE). This is where that block is enforced; summary.ts reads no audit rows,
//     matrix or world;
//   - no run-level block (outcomes.ts RUN_BLOCKS, B1: the oracle or an alternative fails the matrix)
//     holds on the grader_task_version of any current grade of the run, named once per
//     grader_task_version;
//   - no attempt, re-queued ones included, had an INTERNAL tool error;
//   - every record's replay_final equals its final hash, and replay.json, when present, says
//     every trial reproduced;
//   - every label with model_fault unclear or llm_auditor_agrees false carries an adjudicated_label,
//     one of AUDIT_LABELS;
//   - each task has at least 2 audited PASS trials with evidence ids (all of them when it has
//     fewer than 2 passes);
//   - each task the consistency flag marks (packages/core/summary.ts consistencyOf: >= 80% of its
//     valid failures fail the same check first, counted from 5 valid
//     failures, or at any count with --final; or 0 passes in >= 10 valid trials) has one
//     task-validity review line in audit.jsonl, beside the per-trial rows:
//       {task, kind: "task-validity", reviewer, verdict: "fair-trap" | "check-defect", note}
//     A check-defect verdict meets the check and is printed as a grader finding: the check is
//     fixed and the run regraded, as for any grader bug;
//   - with --final (P17i C6, R14-33: the final audit, never a pilot audit), every valid failure's
//     label has an LLM auditor verdict: llm_auditor_agrees true or false, not null or missing;
//   - a label's clinically_acceptable and tool_rejections_correct (explain.ts AuditRow), when
//     given, are yes or no, and a "no" comes with GR3 (the label's outcome GRADER_BUG with an
//     evidence id), an environment label, or an adjudicated_label with a note: a "no" says the
//     grader or a tool rejected valid work, so the label must say whose fault that is.
// It writes each label's criteria, explainTrial's M1-M5 for its trial, into audit.jsonl (only when
// they changed, so a second run leaves the file as it was). The context it gives explainTrial
// (explainContext) is packages/core/explain-context.ts over the run's files, the one builder the
// web Runs view uses too: the trajectory; the task's check text (tasks/<id>.check-text.ts) and
// checks; <run>/manifest.json's world_hash as the manifest hash (none without a manifest, so M3
// is pending); the world for exposability, loaded only when M1 reads it; <run>/matrix.json, as
// `pnpm cli matrix --out <run>` writes it, for M4, GR4 and B1, looked up by the
// grader_task_version of each record's current grade, so a matrix run for the fixed grader speaks
// for a regraded trial and one for the grader it ran under does not; and, on a regraded trial
// whose first failed check is not the one its recorded attribution names, that check's decisive
// ids with the step each was first exposed at in the trajectory.
// --json prints {failures, labelled, labelled_environment, labelled_grader, faults, valid, excluded,
// denominator, task_validity, violations}: task_validity maps each flagged task to its flags and
// its review's verdict and reviewer (null without one); labelled_environment and labelled_grader count the failures the audit
// labels environment or grader (after adjudication); faults counts the failures by the fault
// explainTrial computes ({model, refusal, env, grader, infra}), which the label must agree with
// but need not (a model label on an E5 failure is a violation, counted model there and env here);
// valid counts the settled trials whose current grade is valid, excluded names (sorted) the
// failures excludedFromHeadline names, and denominator is valid without them, for the UI and the
// writeup; a run with an excluded trial fails, so it has no headline pass rate. Exit 2 on a usage error.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BatchRecord } from '../packages/core/batch.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import type { TrialEvent } from '../packages/core/events.ts';
import { explainContext as contextOf, needsWorld, worldLookup, type TaskCheck } from '../packages/core/explain-context.ts';
import { auditLabelOf, excludedFromHeadline, explainTrial, formatCriterion, type AuditRow, type CheckText, type ExplainContext, type ExplainRecord } from '../packages/core/explain.ts';
import { AUDIT_LABEL, AUDIT_LABELS, FAULT, FAULT_PRECEDENCE, type Fault, type Outcome } from '../packages/core/outcomes.ts';
import { parseTrajectory } from '../packages/core/trajectory.ts';
import { consistencyOf, currentGrade, describeConsistency, type ConsistencyFlag } from '../packages/core/summary.ts';
import { loadStore } from '../packages/env/fixture-source.ts';
import { TAXONOMY } from '../packages/grader/attribution.ts';
import { sameId, stepsOf } from '../packages/grader/exposure.ts';
import { requeuedRecords, settledRecords, trajectoryOf } from './adapters/result-sink-node.ts';
import { TASKS_DIR } from './adapters/tasks-node.ts';
import { trialName } from './replay.ts';
import { repoWorld, taskChecks } from './run.ts';
import { readReplay } from './summary.ts';

// A task's checks as far as the context reads them (packages/core/explain-context.ts TaskCheck).
export type TaskChecks = (task: string) => Promise<readonly TaskCheck[]>;

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
  // Default cli/run.ts taskChecks.
  checks?: TaskChecks;
}

export type AuditLabel = AuditRow;

// A task-validity review line of audit.jsonl (header).
export const TASK_VALIDITY_VERDICTS = ['fair-trap', 'check-defect'] as const;
export interface TaskValidityReview {
  task: string;
  kind: 'task-validity';
  reviewer: string;
  verdict: (typeof TASK_VALIDITY_VERDICTS)[number];
  note: string;
}
type Line = { raw: string; label: AuditLabel | null; review?: TaskValidityReview };

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const MIN_AUDITED_PASSES = 2;
const isLabel = (l: string | null | undefined): boolean => (AUDIT_LABELS as readonly (string | null | undefined)[]).includes(l);

// audit.jsonl's lines, each with its label, or its task-validity review, when it parses.
function readLabels(dir: string, violations: string[]): Line[] | null {
  const file = join(dir, 'audit.jsonl');
  if (!existsSync(file)) {
    violations.push('audit.jsonl is missing');
    return null;
  }
  return readFileSync(file, 'utf8').split('\n').flatMap((raw, i): Line[] => {
    if (raw.trim() === '') return [];
    try {
      const parsed = JSON.parse(raw) as { kind?: unknown };
      if (parsed.kind === 'task-validity') {
        const r = parsed as TaskValidityReview;
        const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim() !== '';
        if (!nonEmpty(r.task) || !nonEmpty(r.reviewer) || typeof r.note !== 'string') throw new Error('a task-validity review needs task, reviewer and note');
        if (!(TASK_VALIDITY_VERDICTS as readonly string[]).includes(r.verdict)) throw new Error(`task-validity verdict must be ${TASK_VALIDITY_VERDICTS.join(' or ')}`);
        return [{ raw, label: null, review: r }];
      }
      const l = parsed as AuditLabel;
      if (typeof l.trial !== 'string' || !Array.isArray(l.evidence_ids)) throw new Error('needs trial and evidence_ids');
      return [{ raw, label: l }];
    } catch (e) {
      violations.push(`audit.jsonl line ${i + 1}: ${(e as Error).message}`);
      return [{ raw, label: null }];
    }
  });
}

const readJson = (file: string): unknown => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

// A task's check text (tasks/<id>.check-text.ts, what each gate check requires in words), or null
// when it has none; the Runs view reads the same files, so both give the same reasons.
const checkTexts = new Map<string, Promise<CheckText | null>>();
function checkTextOf(task: string): Promise<CheckText | null> {
  const file = join(TASKS_DIR, `${task}.check-text.ts`);
  if (!checkTexts.has(task)) checkTexts.set(task, existsSync(file) ? import(pathToFileURL(file).href).then((m: { checkText: CheckText }) => m.checkText) : Promise.resolve(null));
  return checkTexts.get(task)!;
}

// What explainTrial gets for each record of the run in dir (see the header): packages/core/
// explain-context.ts over the run's files, as the web Runs view builds it from the same files.
export async function explainContext(dir: string, checks: TaskChecks = taskChecks): Promise<(r: BatchRecord) => Promise<ExplainContext & { events: TrialEvent[] }>> {
  const manifest = readJson(join(dir, 'manifest.json'));
  const matrix = readJson(join(dir, 'matrix.json'));
  const events = new Map<string, TrialEvent[]>();
  let world: Promise<(id: string) => boolean> | undefined;
  const inWorld = () => (world ??= loadStore(repoWorld().world).then((store) => worldLookup(new Set([...store.resources()].map((r) => `${r.resourceType}/${r.id}`)))));
  const gates = new Map<string, Promise<readonly TaskCheck[]>>();
  return async (r) => {
    const name = trialName(r);
    if (!events.has(name)) {
      const file = trajectoryOf(dir, r);
      events.set(name, existsSync(file) ? parseTrajectory(readFileSync(file, 'utf8')) : []);
    }
    const trajectory = events.get(name) as TrialEvent[];
    if (!gates.has(r.task_id)) gates.set(r.task_id, checks(r.task_id).catch(() => []));
    const input = { record: r as ExplainRecord, events: trajectory, manifest, matrix, checks: await gates.get(r.task_id)!, text: await checkTextOf(r.task_id) };
    return { ...contextOf({ ...input, inWorld: needsWorld(input) ? await inWorld() : null }), events: trajectory };
  };
}

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  const json = args.includes('--json');
  const final = args.includes('--final');
  const rest = args.filter((a) => a !== '--json' && a !== '--final');
  if (rest.length !== 1 || rest[0]!.startsWith('--')) {
    deps.err('usage: pnpm cli audit-check <run> [--final] [--json]');
    return 2;
  }
  const dir = rest[0] as string;
  if (!existsSync(join(dir, 'trials'))) {
    deps.err(`audit-check: ${dir} has no trials/ directory`);
    return 1;
  }
  const v: string[] = [];
  const records = new Map(settledRecords(dir).map((s) => [trialName(s.record), s.record]));
  const requeued = requeuedRecords(dir).map((s) => s.record);
  const lines = readLabels(dir, v);
  const labels = (lines ?? []).flatMap((l) => (l.label === null ? [] : [l.label]));
  const reviews = new Map<string, TaskValidityReview>();
  for (const { review } of lines ?? []) {
    if (review === undefined) continue;
    if (reviews.has(review.task)) v.push(`${review.task}: more than one task-validity review`);
    reviews.set(review.task, review);
  }
  const byTrial = new Map<string, AuditLabel>();
  for (const l of labels) {
    if (byTrial.has(l.trial)) v.push(`${l.trial}: more than one audit label`);
    byTrial.set(l.trial, l);
  }
  const ctxOf = await explainContext(dir, deps.checks);
  const explain = async (r: BatchRecord, row?: AuditLabel) => {
    const { criteria: _criteria, ...audit } = row ?? ({} as AuditLabel);
    return explainTrial(r as ExplainRecord, row === undefined ? undefined : audit, await ctxOf(r));
  };
  const stepsFor = async (r: BatchRecord) => stepsOf((await ctxOf(r)).events);

  const valid = [...records.values()].filter((r) => currentGrade(r).valid);
  const failures = valid.filter((r) => currentGrade(r).outcome !== 'PASS');
  const excludedTrials: string[] = [];
  let environment = 0;
  let grader = 0;
  for (const l of labels) {
    const r = records.get(l.trial);
    if (r === undefined) {
      const infra = requeued.find((a) => trialName(a) === l.trial && FAULT[currentGrade(a).outcome as Outcome] === 'infra');
      v.push(infra === undefined ? `${l.trial}: audit label for a trial the run has not settled` : `${l.trial}: ${currentGrade(infra).outcome} carries a label, and an INFRA trial gets none (it is rerun); the run has not settled the trial`);
      continue;
    }
    const { outcome, regraded } = currentGrade(r);
    if (l.outcome !== outcome) v.push(`${l.trial}: labelled ${l.outcome}, ${regraded ? 'the current grade is' : 'the record says'} ${outcome}`);
    const steps = await stepsFor(r);
    const ids = new Set(steps.flatMap((s) => [...s.exposed_ids, ...s.referenced_ids, ...s.written_ids]));
    for (const id of l.evidence_ids) if (![...ids].some((k) => sameId(k, id))) v.push(`${l.trial}: evidence id ${id} is not in the trajectory`);
    if (l.adjudicated_label !== undefined && l.adjudicated_label !== null && !isLabel(l.adjudicated_label)) v.push(`${l.trial}: adjudicated_label ${l.adjudicated_label} is not one of ${AUDIT_LABELS.join(', ')}`);
    else if ((l.model_fault === 'unclear' || l.llm_auditor_agrees === false) && !isLabel(l.adjudicated_label)) {
      v.push(`${l.trial}: ${l.model_fault === 'unclear' ? 'model_fault unclear' : 'the LLM auditor disagrees'}, and no adjudicated_label is recorded`);
    }
    for (const field of ['clinically_acceptable', 'tool_rejections_correct'] as const) {
      const a = l[field];
      if (a === undefined || a === null || a === 'yes') continue;
      if (a !== 'no') v.push(`${l.trial}: ${field} must be yes or no, not ${JSON.stringify(a)}`);
      else if (!((l.outcome === 'GRADER_BUG' && l.evidence_ids.length > 0) || auditLabelOf(l) === 'environment' || (isLabel(l.adjudicated_label) && (l.note ?? '').trim() !== ''))) {
        v.push(`${l.trial}: ${field} no needs GR3 (an audit outcome GRADER_BUG with evidence), an environment label or an adjudicated_label with a note`);
      }
    }
    if (outcome === 'PASS') continue;
    // The trial's fault without the audit: the label must agree with it, not define it.
    const { fault } = await explain(r);
    const want = fault === null ? null : AUDIT_LABEL[fault];
    const label = auditLabelOf(l);
    if (label === 'environment') environment++;
    if (label === 'grader') grader++;
    if (want === null) {
      v.push(`${l.trial}: ${outcome} carries the label ${label ?? 'none'}, and an INFRA trial gets none (it is rerun)`);
      continue;
    }
    if (label === null) v.push(`${l.trial}: taxonomy ${l.taxonomy} is not in the label set (${TAXONOMY.join(', ')})`);
    else if (!isLabel(label)) v.push(`${l.trial}: label ${label} is not one of ${AUDIT_LABELS.join(', ')}`);
    else if (label !== want.label) v.push(`${l.trial}: labelled ${label}, and its fault ${fault} has the label ${want.label}`);
    else if (l.label_subtype !== undefined && (l.label_subtype ?? null) !== want.subtype) v.push(`${l.trial}: label subtype ${l.label_subtype ?? 'none'}, and its fault ${fault} has the subtype ${want.subtype ?? 'none'}`);
    else if (label === 'model' && want.subtype === null && !(TAXONOMY as readonly (string | null)[]).includes(l.taxonomy)) v.push(`${l.trial}: taxonomy ${l.taxonomy} is not in the label set (${TAXONOMY.join(', ')})`);
    if (!['yes', 'no', 'unclear'].includes(l.model_fault as string)) v.push(`${l.trial}: model_fault must be yes, no or unclear`);
    else if (FAULT[outcome as Outcome] === 'model') {
      if (label === 'model' && l.model_fault === 'no') v.push(`${l.trial}: labelled ${l.taxonomy ?? label}, a model failure, with model_fault no`);
      if (label !== 'model' && isLabel(label) && l.model_fault === 'yes') v.push(`${l.trial}: labelled ${label}, not the model's fault, with model_fault yes`);
    }
    const n = steps.length;
    if (!Number.isSafeInteger(l.decisive_step) || (l.decisive_step as number) < 1 || (l.decisive_step as number) > n) {
      v.push(`${l.trial}: decisive step ${l.decisive_step} is not a step of the trajectory (1-${n})`);
    }
    if (l.evidence_ids.length === 0) v.push(`${l.trial}: no evidence ids`);
  }
  const faults = Object.fromEntries(FAULT_PRECEDENCE.map((f) => [f, 0])) as Record<Fault, number>;
  for (const r of failures) {
    const name = trialName(r);
    const row = byTrial.get(name);
    if (row === undefined) v.push(`${name}: ${currentGrade(r).outcome}, no audit label`);
    else if (final && typeof row.llm_auditor_agrees !== 'boolean') {
      v.push(`${name}: ${currentGrade(r).outcome} has no LLM auditor verdict (llm_auditor_agrees ${row.llm_auditor_agrees === undefined ? 'missing' : JSON.stringify(row.llm_auditor_agrees)}); --final requires one on every valid failure`);
    }
    const e = await explain(r, byTrial.get(name));
    if (e.fault !== null) faults[e.fault]++;
    for (const c of e.criteria) {
      if ((c.id === 'M1' || c.id === 'M4') && (c.met === false || c.met === 'pending')) v.push(`${name}: ${formatCriterion(c).replace(': ', ' ')}: ${c.evidence}`);
    }
    const excluded = excludedFromHeadline(e);
    if (excluded !== null) {
      v.push(`${name}: ${excluded}`);
      excludedTrials.push(name);
    }
  }
  // A run-level block holds for its whole grader_task_version: named once, from the first record that shows it.
  const blocked = new Map<string, string>();
  for (const r of records.values()) {
    const g = `${r.task_id} at grader_task_version ${currentGrade(r).grader_task_version}`;
    for (const n of (await explain(r)).notes) {
      const key = `${g}: ${n.id}`;
      if (n.id === 'B1' && !blocked.has(key)) blocked.set(key, `${g}: ${n.id} holds: ${n.evidence}; it blocks the run until the task or the grader is fixed`);
    }
  }
  v.push(...blocked.values());
  for (const r of [...records.values(), ...requeued]) {
    const g = currentGrade(r);
    if (FAULT[g.outcome as Outcome] === 'infra' && (g.valid || (!g.regraded && r.valid === true))) v.push(`${trialName(r)}: ${g.outcome} is in the valid set; an INFRA or CANCELLED trial is excluded from it`);
  }
  const internal = [...records.values(), ...requeued].filter((r) => (r.tool_errors?.INTERNAL ?? 0) > 0);
  if (internal.length > 0) v.push(`INTERNAL tool errors in ${internal.map((r) => `${trialName(r)} (${r.attempt})`).join(', ')}; the run must have 0`);
  const replay = readReplay(dir);
  for (const [name, r] of records) {
    if (r.state_hash.final === null || r.state_hash.replay_final !== r.state_hash.final) v.push(`${name}: replay_final ${r.state_hash.replay_final} is not final ${r.state_hash.final}`);
    if (replay !== null && replay[name] !== true) v.push(`${name}: replay.json says it did not reproduce`);
  }
  for (const task of [...new Set([...records.values()].map((r) => r.task_id))].sort()) {
    const passes = [...records.values()].filter((r) => r.task_id === task && currentGrade(r).outcome === 'PASS');
    const audited = passes.filter((r) => (byTrial.get(trialName(r))?.evidence_ids.length ?? 0) > 0).length;
    const need = Math.min(MIN_AUDITED_PASSES, passes.length);
    if (audited < need) v.push(`${task}: ${audited} audited PASS with evidence ids, need ${need}`);
  }
  const taskValidity: Record<string, { flags: ConsistencyFlag[]; verdict: string | null; reviewer: string | null }> = {};
  const findings: string[] = [];
  for (const task of [...new Set([...records.values()].map((r) => r.task_id))].sort()) {
    const c = consistencyOf([...records.values()].filter((r) => r.task_id === task).map(currentGrade), { final });
    if (c.flags.length === 0) continue;
    const review = reviews.get(task);
    taskValidity[task] = { flags: c.flags, verdict: review?.verdict ?? null, reviewer: review?.reviewer ?? null };
    const why = describeConsistency(c).join('; ');
    if (review === undefined) v.push(`${task}: ${why}; no task-validity review line in audit.jsonl ({task, kind: "task-validity", reviewer, verdict: ${TASK_VALIDITY_VERDICTS.join(' | ')}, note})`);
    else findings.push(`${task}: task-validity review ${review.verdict} by ${review.reviewer}${review.verdict === 'check-defect' ? ': a grader finding; fix the check and regrade the run' : ''} (${why})`);
  }

  // Each label's criteria, as explainTrial gives them, written back when they changed.
  if (lines !== null) {
    const out: string[] = [];
    for (const { raw, label } of lines) {
      const r = label === null ? undefined : records.get(label.trial);
      out.push(label === null || r === undefined ? raw : JSON.stringify({ ...label, criteria: (await explain(r, label)).criteria }));
    }
    const text = `${out.join('\n')}\n`;
    const file = join(dir, 'audit.jsonl');
    if (readFileSync(file, 'utf8') !== text) writeFileSync(file, text);
  }

  const labelled = failures.filter((r) => byTrial.has(trialName(r))).length;
  const say = json ? deps.err : deps.out;
  for (const line of findings) say(line);
  for (const line of v) say(`violation: ${line}`);
  say(`audit-check: ${labelled}/${failures.length} failures labelled, environment ${environment}, grader ${grader}; ${v.length === 0 ? 'every check holds' : `${v.length} violation(s)`}`);
  const excluded = excludedTrials.sort();
  if (json) deps.out(JSON.stringify({ failures: failures.length, labelled, labelled_environment: environment, labelled_grader: grader, faults, valid: valid.length, excluded, denominator: valid.length - excluded.length, task_validity: taskValidity, violations: v }));
  return v.length === 0 ? 0 : 1;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2));
}
