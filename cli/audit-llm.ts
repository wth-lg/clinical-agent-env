// pnpm cli audit-llm <run> [--dry-run] [--result-chars <n>]
// The blinded LLM auditor (plan phase P23; design section 5, "Human audit"): a second reviewer,
// claude-opus-5-5, reads each audited trial's record and says whose fault its current grade is.
// It audits every valid failure of the run (a settled trial whose current grade is valid and not
// PASS) and every PASS with a penalty met or unknown (a rubric item with negative points; P17j
// JG5, cli/audit-check.ts metPenalties), in trial order.
//   The auditor is blind: its input is the trajectory, the task's instruction and system prompt,
// the current grade (the checks, the reason explainTrial gives, the record facts M1-M4 read) and
// the attribution definitions, rendered from prompts/auditor.md, whose {{definitions}} and
// {{labels}} placeholders cli/audit-llm.ts fills from packages/core/outcomes.ts FAULT_DEFINITIONS,
// FAULT_PRECEDENCE_RULE, PASS_DEFINITION, CONFIRMATION_CRITERIA (M1-M4) and AUDIT_LABEL, never
// from a hand-written copy (scripts/test/one-definition.test.ts). Nothing of audit.jsonl reaches
// it: no label, taxonomy, model_fault, note or earlier verdict. Each executed tool call is one
// step, numbered as packages/grader/exposure.ts stepsOf numbers them, so the decisive_step it
// names is the one audit-check reads; tool results are cut at RESULT_CHARS characters
// (--result-chars changes it; read_policy results are never cut, the auditor judges against them).
//   The auditor answers, for the trial, the label (on a failure one of AUDIT_LABELS; on a PASS
// pass, outcomes.ts PASS_CONFIRMED, or grader, a false PASS), the two audit questions of
// explain.ts AuditRow (R14-31), clinically_acceptable and tool_rejections_correct, a decisive_step,
// evidence_ids, the criteria it finds holding and a reason, as one JSON object (parseVerdict: the
// last balanced JSON object of the answer that has a label). Each verdict is written to
// <run>/auditor/<task>/<index>.json ({trial, outcome, model, effort, prompt_version,
// prompt_sha256, at, verdict | null, problem, answer, calls, cost_usd, ledger_batch}; the prompt
// itself is not kept, only its hash). A trial whose file holds a verdict is not asked again and
// is not projected; one with verdict null (no answer, a refusal, an answer that is not the
// verdict JSON or breaks its rules, a failed call) is asked again, and the command exits 1 while
// any target has none. results/runs/final-1/auditor/ holding outputs is what ends the auditor
// allowance in the final-run reserve (packages/core/cost.ts AUDITOR_ALLOWANCE_USD).
//   After the calls, every audit.jsonl row of an audited trial gets llm_auditor_agrees: true when
// the auditor's label equals the builder's (explain.ts auditLabelOf through audit-check rowLabel;
// on a PASS row with no label, pass), false otherwise, written only when it changes; a row whose
// builder label cannot be read, or a trial with no row, is counted unlabelled and left alone.
// audit-check --final then requires the verdict on every valid failure, and cli/judge-agreement.ts
// --double-label reads the verdicts for the builder-vs-auditor kappa.
//   Every call goes through one batchStart(projection) on the Node ledger and a MessagesClient on
// its grant, so the run is refused before any call when the ledger's exposure plus the projection
// would cross PROJECTED_CAP_USD. Projection: each trial to ask, priced at the worst case of its
// real request (body bytes and AUDITOR_MAX_TOKENS), one call each.
//   --dry-run   prints each trial, the projection and LIVE_PROJECTION_USD, makes no call, opens
//               no ledger and writes nothing.
// Exit 0 when every target has a verdict; 1 otherwise, or on a refused or failed batch; 2 on a
// usage error.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyFailure, MessagesClient, MODEL, reserveRequest, type ContentBlock, type MessageParams, type Transport } from '../packages/core/anthropic.ts';
import type { BatchRecord } from '../packages/core/batch.ts';
import { money, worstCaseUsd } from '../packages/core/cost.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import type { TrialEvent } from '../packages/core/events.ts';
import { AUDIT_QUESTIONS, explainTrial, type ExplainRecord, type Explanation } from '../packages/core/explain.ts';
import { AUDIT_LABEL, AUDIT_LABELS, CONFIRMATION_CRITERIA, FAULT_DEFINITIONS, FAULT_PRECEDENCE, FAULT_PRECEDENCE_RULE, PASS_CONFIRMED, PASS_DEFINITION, type AuditAnswer } from '../packages/core/outcomes.ts';
import { redactText } from '../packages/core/redact.ts';
import { currentGrade, trialName, type CurrentGrade } from '../packages/core/summary.ts';
import { parseTrajectory } from '../packages/core/trajectory.ts';
import { nodeNow } from './adapters/clock-node.ts';
import { openNodeLedger } from './adapters/ledger-node.ts';
import { settledRecords, trajectoryOf } from './adapters/result-sink-node.ts';
import { explainContext, metPenalties, readLabels, rowLabel, type TaskChecks } from './audit-check.ts';
import { lastJsonObject, prompt, refusal } from './probe.ts';

const USAGE = 'usage: pnpm cli audit-llm <run> [--dry-run] [--result-chars <n>]';
export const AUDITOR_PROMPT_VERSION = 'auditor-v1';
export const AUDITOR_EFFORT = 'high';
export const AUDITOR_MAX_TOKENS = 16_000;
// Each tool result the auditor sees is cut at this many characters; policies never are.
export const RESULT_CHARS = 3000;
const UNCUT_TOOLS = new Set(['read_policy']);
// A check's evidence in the grade, cut at this many characters.
const EVIDENCE_CHARS = 1200;
const PARAMS: MessageParams = { max_tokens: AUDITOR_MAX_TOKENS, output_config: { effort: AUDITOR_EFFORT } };

export interface Deps {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  // The live transport.
  fetch: Transport;
  // A task's checks for explainContext; default cli/run.ts taskChecks.
  checks?: TaskChecks;
}

// One trial the auditor reads: a valid failure, or a PASS with the named penalties met or unknown.
export interface Target {
  trial: string;
  record: BatchRecord;
  outcome: string;
  penalties: string[];
}

export interface Verdict {
  label: string;
  clinically_acceptable: AuditAnswer;
  tool_rejections_correct: AuditAnswer;
  decisive_step: number | null;
  evidence_ids: string[];
  criteria: string[];
  reason: string;
}

// <run>/auditor/<task>/<index>.json.
export interface AuditorOutput {
  trial: string;
  outcome: string;
  model: string;
  effort: string;
  prompt_version: string;
  prompt_sha256: string;
  at: string;
  verdict: Verdict | null;
  problem: string | null;
  answer: string | null;
  calls: number;
  cost_usd: number;
  ledger_batch: string | null;
}

const byTrial = (a: BatchRecord, b: BatchRecord) => (a.task_id < b.task_id ? -1 : a.task_id > b.task_id ? 1 : a.index - b.index);

// The run's targets, in trial order (header).
export function auditTargets(dir: string): Target[] {
  return settledRecords(dir).map((s) => s.record).sort(byTrial).flatMap((record) => {
    const g = currentGrade(record);
    if (!g.valid) return [];
    const penalties = g.outcome === 'PASS' ? metPenalties(g).map((p) => p.id) : [];
    if (g.outcome === 'PASS' && penalties.length === 0) return [];
    return [{ trial: trialName(record), record, outcome: g.outcome, penalties }];
  });
}

export const outputPath = (dir: string, r: Pick<BatchRecord, 'task_id' | 'index'>): string => join(dir, 'auditor', r.task_id, `${r.index}.json`);

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as ContentBlock[]).flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('');
};
const contentText = (content: unknown): string => (typeof content === 'string' ? content : (JSON.stringify(content) ?? 'null'));
const cut = (text: string, n: number): string => (text.length <= n ? text : `${text.slice(0, n)} [... ${text.length - n} more characters cut]`);

// The trajectory as the auditor reads it (header): the agent's text, each executed call as a
// numbered step with its input and result, arrivals, limits and errors.
export function renderTrajectory(events: readonly TrialEvent[], resultChars: number): { text: string; steps: number; instruction: string; system: string } {
  const lines: string[] = [];
  const inputs = new Map<string, unknown>();
  let steps = 0;
  let instruction = '';
  let system = '';
  let first = true;
  for (const e of events) {
    switch (e.type) {
      case 'request':
        if (first) {
          first = false;
          instruction = textOf(e.messages[0]?.content).trim();
          system = textOf(e.params?.system ?? '').trim();
        } else {
          for (const m of e.messages) {
            const t = m.role === 'user' ? textOf(m.content).trim() : '';
            if (t !== '') lines.push(`user: ${t}`);
          }
        }
        break;
      case 'response': {
        const t = textOf(e.content).trim();
        if (t !== '') lines.push(`agent (turn ${e.turn}): ${t}`);
        if (e.stop_reason !== null && e.stop_reason !== 'tool_use' && e.stop_reason !== 'end_turn') lines.push(`[stop_reason ${e.stop_reason}]`);
        break;
      }
      case 'tool_call':
        inputs.set(e.tool_use_id, e.input);
        break;
      case 'tool_result': {
        const call = `${e.name} ${JSON.stringify(inputs.get(e.tool_use_id) ?? null)}`;
        if (!e.executed) {
          lines.push(`(not executed, after finish) ${call}`);
          break;
        }
        steps++;
        const body = e.is_error ? `error ${e.error_code ?? 'unknown'}: ${cut(contentText(e.content), resultChars)}` : cut(contentText(e.content), UNCUT_TOOLS.has(e.name) ? Infinity : resultChars);
        lines.push(`step ${steps}: ${call}`, `  -> ${body}`);
        break;
      }
      case 'env_event':
        lines.push(`  [arrival after this call: ${e.spec}, ${e.keys.join(', ')}]`);
        break;
      case 'limit':
        lines.push(`[limit ${e.limit}: ${e.value} of ${e.cap}${e.code ? `, ${e.code}` : ''}]`);
        break;
      case 'error':
        lines.push(`[error ${e.status} ${e.code}: ${e.message}]`);
        break;
      case 'cancelled':
        lines.push(`[cancelled: ${e.reason}]`);
        break;
      case 'attempt_error':
        lines.push(`[API attempt ${e.attempt} failed: ${e.message}]`);
        break;
      default:
        break;
    }
  }
  return { text: lines.join('\n'), steps, instruction, system };
}

const met = (v: unknown): string => (v === true ? 'met' : v === false ? 'not met' : v === 'unknown' ? 'unknown' : String(v));

// The current grade as the auditor reads it: outcome and score, explainTrial's decisive check
// (expected and found) or, with none, its reason sentence (a limit or a refusal; on a failed check
// the reason adds the grader's automatic taxonomy, which the auditor must not be led by), then
// every check with its kind, category and points, and the items and evidence of the ones not met
// or unknown.
export function renderGrade(g: CurrentGrade, recorded: string, e: Explanation): string {
  const lines = [`Current grade: ${g.outcome}${g.score === null ? '' : `, score ${g.score}`}${g.regraded ? ` (an offline regrade; the grade as recorded was ${recorded})` : ''}${g.grader_task_version ? `, grader_task_version ${g.grader_task_version}` : ''}.`];
  if (e.decisive_check !== null) lines.push(`Decisive check ${e.decisive_check.id}: expected ${e.decisive_check.expected}; found ${e.decisive_check.found}.`);
  else lines.push(`Reason: ${e.reason}`);
  if (e.secondary_reason !== null) lines.push(`${e.secondary_reason[0]!.toUpperCase()}${e.secondary_reason.slice(1)}.`);
  lines.push('Checks:');
  for (const c of g.checks ?? []) {
    const what = [c.kind ?? 'check', ...(c.category ? [c.category] : []), ...(typeof c.points === 'number' ? [`${c.points} points`] : [])].join(', ');
    lines.push(`- ${c.id} (${what}): ${met(c.met)}`);
    if (c.met === true && !(c.kind === 'rubric' && typeof c.points === 'number' && c.points < 0)) continue;
    const items = (c as { items?: unknown }).items;
    if (Array.isArray(items)) {
      for (const it of items as Array<{ item?: unknown; met?: unknown; why?: unknown; evidence?: unknown }>) {
        if (it.met === true) continue;
        lines.push(`    item ${String(it.item)}: ${met(it.met)}${typeof it.why === 'string' ? `: ${it.why}` : ''}${it.evidence === undefined ? '' : `; evidence ${cut(JSON.stringify(it.evidence) ?? 'null', EVIDENCE_CHARS)}`}`);
      }
    }
    if (c.evidence !== undefined && c.evidence !== null) lines.push(`    evidence ${cut(JSON.stringify(c.evidence) ?? 'null', EVIDENCE_CHARS)}`);
  }
  return lines.join('\n');
}

// The record facts beside the grade: status, tool errors, and what M1-M4 read (M5 reads the human
// audit, which the auditor must not see).
export function renderFacts(r: BatchRecord, e: Explanation): string {
  const errors = Object.entries(r.tool_errors ?? {}).map(([k, n]) => `${k} ${n}`).join(', ');
  return [
    `- status ${r.status ?? 'none'}, detail ${r.detail ?? 'none'}, stop_reason ${r.stop_reason ?? 'none'}; ${r.turns ?? '?'} turns, ${r.tool_calls ?? '?'} tool calls`,
    `- tool errors: ${errors === '' ? 'none recorded' : errors}`,
    `- model requested ${r.model_requested ?? 'none'}, returned ${(r.models_returned ?? []).join(', ') || 'none'}`,
    ...e.criteria.filter((c) => c.id !== 'M5').map((c) => `- ${c.id} (${met(c.met)}): ${c.evidence}`),
  ].join('\n');
}

// The labels, each from AUDIT_LABEL with the criteria of its faults, and pass for a PASS.
export function labelsText(): string {
  const lines = AUDIT_LABELS.map((label) => {
    const faults = FAULT_PRECEDENCE.filter((f) => AUDIT_LABEL[f]?.label === label);
    return `- ${label}: the fault ${faults.map((f) => `${f} (${FAULT_DEFINITIONS[f].criteria.map((c) => c.id).join(', ')})`).join(' or ')}`;
  });
  lines.push(`- ${PASS_CONFIRMED}: on a PASS only, the PASS is right; a PASS the policy fails is labelled grader (a false PASS, GR5)`);
  return lines.join('\n');
}

// Every FAULT_DEFINITIONS sentence and criterion, the precedence rule, the PASS definition and the
// confirmation criteria M1-M4, from outcomes.ts.
export function definitionsText(): string {
  const parts = FAULT_PRECEDENCE.map((f) => [`## ${f}`, FAULT_DEFINITIONS[f].sentence, ...FAULT_DEFINITIONS[f].criteria.map((c) => `- ${c.id}: ${c.text}`)].join('\n'));
  parts.push(`## Precedence\n${FAULT_PRECEDENCE_RULE}`);
  parts.push(`## PASS\n${PASS_DEFINITION}`);
  parts.push(['## What confirms a model label', ...CONFIRMATION_CRITERIA.filter((c) => c.id !== 'M5').map((c) => `- ${c.id}: ${c.text}`)].join('\n'));
  return parts.join('\n\n');
}

// prompts/auditor.md for one target, filled; steps is the count of executed calls.
export function auditorPrompt(t: Target, events: readonly TrialEvent[], e: Explanation, resultChars = RESULT_CHARS): { text: string; steps: number } {
  const tr = renderTrajectory(events, resultChars);
  const g = currentGrade(t.record);
  const text = prompt('auditor', {
    trial: t.trial,
    task_id: t.record.task_id,
    outcome: t.outcome,
    labels: labelsText(),
    definitions: definitionsText(),
    system: tr.system,
    instruction: tr.instruction,
    steps: String(tr.steps),
    result_chars: String(resultChars),
    trajectory: tr.text,
    grade: renderGrade(g, t.record.outcome, e),
    facts: renderFacts(t.record, e),
  });
  return { text, steps: tr.steps };
}

const isAnswer = (v: unknown): v is AuditAnswer => v === 'yes' || v === 'no';
// "model, grader or environment".
const listed = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() !== '');

// The verdict in the auditor's answer (header), or why it is not one. steps is the number of
// executed calls, which a decisive_step must not exceed.
export function parseVerdict(text: string, outcome: string, steps: number): { verdict: Verdict } | { problem: string } {
  const v = lastJsonObject(text, (x) => typeof x.label === 'string');
  if (v === null) return { problem: `the last answer is not the verdict JSON: ${JSON.stringify(text.slice(0, 200))}` };
  const allowed: readonly string[] = outcome === 'PASS' ? [PASS_CONFIRMED, 'grader'] : AUDIT_LABELS;
  const label = v.label as string;
  if (!allowed.includes(label)) return { problem: `label ${label} is not allowed on a ${outcome} (${listed(allowed)})` };
  for (const q of AUDIT_QUESTIONS) if (!isAnswer(v[q])) return { problem: `${q} must be yes or no, not ${JSON.stringify(v[q])}` };
  const step = v.decisive_step ?? null;
  if (step !== null && !(Number.isSafeInteger(step) && (step as number) >= 1 && (step as number) <= steps)) return { problem: `decisive_step ${JSON.stringify(step)} is not a step of the trajectory (1-${steps}) or null` };
  if (!strings(v.evidence_ids)) return { problem: 'evidence_ids must be a list of resource ids' };
  const criteria = v.criteria === undefined ? [] : v.criteria;
  if (!strings(criteria)) return { problem: 'criteria must be a list of criterion ids' };
  return { verdict: { label, clinically_acceptable: v.clinically_acceptable as AuditAnswer, tool_rejections_correct: v.tool_rejections_correct as AuditAnswer, decisive_step: step as number | null, evidence_ids: v.evidence_ids, criteria, reason: typeof v.reason === 'string' ? v.reason : '' } };
}

const readOutput = (file: string): AuditorOutput | null => {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as AuditorOutput;
  } catch {
    return null;
  }
};

const writeJson = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

// The builder's label of each audit.jsonl row, as the agreement reads it: rowLabel, and pass on a
// PASS row with none; null when the row gives no label that can be read.
function builderLabels(dir: string, outcomes: ReadonlyMap<string, string>): { lines: NonNullable<ReturnType<typeof readLabels>>; labels: Map<string, string> } | null {
  const lines = readLabels(dir, []);
  if (lines === null) return null;
  const labels = new Map<string, string>();
  for (const { label } of lines) {
    if (label === null) continue;
    const said = rowLabel(label) ?? (outcomes.get(label.trial) === 'PASS' ? PASS_CONFIRMED : null);
    if (said !== null) labels.set(label.trial, said);
  }
  return { lines, labels };
}

// Writes llm_auditor_agrees into audit.jsonl for every audited trial with a verdict (header).
function syncAgreement(dir: string, verdicts: ReadonlyMap<string, Verdict>, outcomes: ReadonlyMap<string, string>): { agrees: number; disagrees: number; unlabelled: number } {
  const b = builderLabels(dir, outcomes);
  let agrees = 0;
  let disagrees = 0;
  let unlabelled = 0;
  if (b === null) return { agrees, disagrees, unlabelled: verdicts.size };
  const seen = new Set<string>();
  const out = b.lines.map(({ raw, label }) => {
    const verdict = label === null ? undefined : verdicts.get(label.trial);
    const builder = label === null ? undefined : b.labels.get(label.trial);
    if (label === null || verdict === undefined) return raw;
    seen.add(label.trial);
    if (builder === undefined) {
      unlabelled++;
      return raw;
    }
    const agree = verdict.label === builder;
    if (agree) agrees++;
    else disagrees++;
    return label.llm_auditor_agrees === agree ? raw : JSON.stringify({ ...(JSON.parse(raw) as Record<string, unknown>), llm_auditor_agrees: agree });
  });
  unlabelled += [...verdicts.keys()].filter((t) => !seen.has(t)).length;
  const text = `${out.join('\n')}\n`;
  const file = join(dir, 'audit.jsonl');
  if (readFileSync(file, 'utf8') !== text) writeFileSync(file, text);
  return { agrees, disagrees, unlabelled };
}

const round6 = (x: number) => Number(x.toFixed(6));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export async function main(args: string[], deps: Deps): Promise<number> {
  let dir: string | undefined;
  let dry = false;
  let resultChars = RESULT_CHARS;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--dry-run') dry = true;
    else if (a === '--result-chars') {
      const n = Number(args[++i]);
      if (!Number.isSafeInteger(n) || n < 1) return usage(deps, '--result-chars needs a whole number of characters, at least 1');
      resultChars = n;
    } else if (a.startsWith('--') || dir !== undefined) return usage(deps, dir !== undefined && !a.startsWith('--') ? 'one run directory' : `unknown argument ${a}`);
    else dir = a;
  }
  if (dir === undefined) return usage(deps, 'a run directory is required');
  if (!existsSync(join(dir, 'trials'))) {
    deps.out(`audit-llm: ${dir} has no trials/ directory`);
    return 1;
  }
  const targets = auditTargets(dir);
  const outcomes = new Map(targets.map((t) => [t.trial, t.outcome]));
  const verdicts = new Map<string, Verdict>();
  const todo: Target[] = [];
  for (const t of targets) {
    const prior = readOutput(outputPath(dir, t.record));
    if (prior?.verdict) verdicts.set(t.trial, prior.verdict);
    else todo.push(t);
  }
  const ctxOf = await explainContext(dir, deps.checks);
  const prepared: Array<{ t: Target; text: string; steps: number; worst: number; bytes: number }> = [];
  for (const t of todo) {
    const file = trajectoryOf(dir, t.record);
    const events = existsSync(file) ? parseTrajectory(readFileSync(file, 'utf8')) : [];
    const e = explainTrial(t.record as ExplainRecord, undefined, await ctxOf(t.record));
    const { text, steps } = auditorPrompt(t, events, e, resultChars);
    const req = reserveRequest([{ role: 'user', content: text }], PARAMS, `audit-llm:${t.trial}`);
    prepared.push({ t, text, steps, worst: worstCaseUsd(req), bytes: req.bodyBytes });
  }
  const projection = prepared.reduce((s, p) => s + p.worst, 0);
  const failures = targets.filter((t) => t.outcome !== 'PASS').length;
  const passes = targets.length - failures;
  if (dry) {
    deps.out(`audit-llm dry run: ${targets.length} trials (${failures} failures, ${passes} PASS with a penalty), ${todo.length} to ask, worst case ${money(Math.max(0, ...prepared.map((p) => p.worst)))} each at most`);
    for (const p of prepared) deps.out(`  ${p.t.trial}: ${p.t.outcome}${p.t.penalties.length > 0 ? ` (penalty ${p.t.penalties.join(', ')})` : ''}, ${p.steps} steps, ${p.bytes} prompt bytes, worst case ${money(p.worst)}`);
    deps.out(`projection ${money(projection)}`);
    deps.out(`LIVE_PROJECTION_USD=${projection.toFixed(6)}`);
    return 0;
  }
  const key = deps.env.ANTHROPIC_API_KEY ?? '';
  let calls = 0;
  let cost = 0;
  if (prepared.length > 0) {
    if (key === '') {
      deps.out('audit-llm: ANTHROPIC_API_KEY is not set');
      return 1;
    }
    const builder = builderLabels(dir, outcomes)?.labels ?? new Map<string, string>();
    try {
      const { ledger, mode, path } = openNodeLedger({ transport: 'live', env: deps.env });
      deps.out(`ledger ${mode} ${path}`);
      const grant = await ledger.batchStart(projection);
      try {
        const client = new MessagesClient({ grant, ledger, apiKey: key, fetch: deps.fetch, trial: 'audit-llm', log: (l) => deps.out(l) });
        for (const p of prepared) {
          let usd = 0;
          let attempts = 1;
          let answer: string | null = null;
          let problem: string | null = null;
          let verdict: Verdict | null = null;
          let stop = false;
          try {
            const result = await client.send([{ role: 'user', content: p.text }], PARAMS, { onSettle: (u) => (usd += u) });
            attempts = result.attempts;
            answer = redactText(textOf(result.message.content), [key]);
            if (result.refusal !== null) problem = `the auditor refused (${result.refusal.category ?? 'no category'})`;
            else {
              const parsed = parseVerdict(answer, p.t.outcome, p.steps);
              if ('verdict' in parsed) verdict = parsed.verdict;
              else problem = parsed.problem;
            }
          } catch (e) {
            problem = `the call failed: ${redactText((e as Error).message, [key])}`;
            stop = classifyFailure(e).stopsBatch;
          }
          calls += attempts;
          cost += usd;
          const out: AuditorOutput = {
            trial: p.t.trial, outcome: p.t.outcome, model: MODEL, effort: AUDITOR_EFFORT, prompt_version: AUDITOR_PROMPT_VERSION, prompt_sha256: sha256(p.text),
            at: new Date(nodeNow()).toISOString(), verdict, problem, answer, calls: attempts, cost_usd: round6(usd), ledger_batch: grant.batch_id,
          };
          writeJson(outputPath(dir, p.t.record), out);
          if (verdict === null) deps.out(`audit-llm ${p.t.trial}: ${p.t.outcome}, no verdict: ${problem}`);
          else {
            verdicts.set(p.t.trial, verdict);
            const b = builder.get(p.t.trial);
            const vs = b === undefined ? 'no builder label' : `builder ${b}: ${b === verdict.label ? 'agrees' : 'disagrees'}`;
            deps.out(`audit-llm ${p.t.trial}: ${p.t.outcome}, auditor ${verdict.label} (${vs}), clinically_acceptable ${verdict.clinically_acceptable}, tool_rejections_correct ${verdict.tool_rejections_correct}, decisive step ${verdict.decisive_step ?? 'none'}, ${money(usd)}`);
          }
          if (stop) {
            deps.out(`audit-llm: the batch stopped at ${p.t.trial}; the trials after it are not asked`);
            break;
          }
        }
      } finally {
        await grant.close();
      }
    } catch (e) {
      deps.out(refusal('audit-llm', e) ?? `audit-llm: ${redactText((e as Error).message, [key])}`);
      return 1;
    }
  }
  const sync = syncAgreement(dir, verdicts, outcomes);
  deps.out(`audit-llm: ${verdicts.size} of ${targets.length} verdicts, ${calls} calls, ${money(cost)}; agrees ${sync.agrees}, disagrees ${sync.disagrees}, unlabelled ${sync.unlabelled}`);
  return verdicts.size === targets.length ? 0 : 1;
}

function usage(deps: Deps, problem: string): number {
  deps.out(`audit-llm: ${problem}\n${USAGE}`);
  return 2;
}

const defaults: Deps = { env: process.env, out: (l) => process.stdout.write(`${l}\n`), fetch: (request) => fetch(request) };

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args, defaults);
};

// Run as a script, it installs the egress guard first (pnpm cli audit-llm gets it from
// cli/index.ts too); imported by tests, it leaves the importer's globals alone.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2), defaults);
}
