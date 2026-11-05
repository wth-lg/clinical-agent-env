// pnpm cli supersede <run> --task <id> --version v<n>
// Moves a task's version out of a run into <run>/superseded/<task>-v<n>/ (R42: the official run
// holds one version per task; when a new version of a task enters it under the same trial names,
// the earlier version's records move, byte-identical, and are summarized beside the new ones,
// never counted). The move takes:
//   - trials/<task>/ and trajectories/<task>/ (and requeued/<task>/ when there is one), renamed
//     as they are, so each record's trajectory path still resolves under the new directory;
//   - the task's entries of replay.json (the settled records' trial names) into
//     superseded/<key>/replay.json, and out of the run's file: a verdict of a v1 record must
//     never stand for the v2 record of the same name (verifier-phase-P17i-TWOW-229-2-1 S1);
//   - the task's rows of audit.jsonl (a trial row of one of its records, or its task-validity
//     row) into superseded/<key>/audit.jsonl, which cli summary reads for the superseded
//     version's labels (readSuperseded), and out of the run's file.
// The manifest, matrix.json and summary.json are not touched: the new version's batch writes the
// manifest, matrix.json is keyed by grader_task_version, and summary --write follows. The README
// of the superseded version (what it was, its figures, its world and versions) is the builder's.
// Refuses a task with no settled records here, an existing <key> directory, or a version that is
// not v<n>, and moves nothing then. Exit 0 moved; 1 refused; 2 usage.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installEgressGuard } from '../packages/core/egress.ts';
import { trialName } from '../packages/core/summary.ts';
import { settledRecords, writeJson } from './adapters/result-sink-node.ts';

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const USAGE = 'usage: pnpm cli supersede <run> --task <id> --version v<n>';

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  let dir: string | undefined;
  let task: string | undefined;
  let version: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--task' && args[i + 1] !== undefined) task = args[++i] as string;
    else if (a === '--version' && args[i + 1] !== undefined) version = args[++i] as string;
    else if (!a.startsWith('--') && dir === undefined) dir = a;
    else {
      deps.err(`supersede: unexpected argument ${a}\n${USAGE}`);
      return 2;
    }
  }
  if (dir === undefined || task === undefined || version === undefined) {
    deps.err(`supersede: a run directory, --task and --version are required\n${USAGE}`);
    return 2;
  }
  if (!/^v\d+$/.test(version)) {
    deps.err(`supersede: --version ${version}: a version is v<n>\n${USAGE}`);
    return 2;
  }
  if (!existsSync(join(dir, 'trials'))) {
    deps.err(`supersede: ${dir} has no trials/ directory`);
    return 1;
  }
  const records = settledRecords(dir).filter((s) => s.record.task_id === task);
  if (records.length === 0) {
    deps.err(`supersede: no settled records of ${task} in ${dir}`);
    return 1;
  }
  const key = `${task}-${version}`;
  const target = join(dir, 'superseded', key);
  if (existsSync(target)) {
    deps.err(`supersede: ${target} exists; a version moves once`);
    return 1;
  }
  const names = new Set(records.map((s) => trialName(s.record)));

  // What moves, read before anything is renamed, so a refusal above leaves the run as it was.
  const replayFile = join(dir, 'replay.json');
  const replay = existsSync(replayFile) ? ((JSON.parse(readFileSync(replayFile, 'utf8')) as { trials?: Record<string, unknown> }).trials ?? {}) : null;
  const auditFile = join(dir, 'audit.jsonl');
  const auditLines = existsSync(auditFile) ? readFileSync(auditFile, 'utf8').split('\n').filter((l) => l.trim() !== '') : null;
  const isTaskRow = (line: string): boolean => {
    try {
      const row = JSON.parse(line) as { trial?: unknown; task?: unknown };
      return (typeof row.trial === 'string' && names.has(row.trial)) || (typeof row.trial !== 'string' && row.task === task);
    } catch {
      return false;
    }
  };

  mkdirSync(target, { recursive: true });
  let trajectories = 0;
  for (const sub of ['trials', 'trajectories', 'requeued']) {
    const from = join(dir, sub, task);
    if (!existsSync(from)) continue;
    mkdirSync(dirname(join(target, sub, task)), { recursive: true });
    renameSync(from, join(target, sub, task));
    if (sub === 'trajectories') trajectories = records.filter((s) => existsSync(join(target, s.record.trajectory ?? ''))).length;
  }
  let movedEntries = 0;
  if (replay !== null) {
    const mine = Object.fromEntries(Object.entries(replay).filter(([name]) => names.has(name)));
    const rest = Object.fromEntries(Object.entries(replay).filter(([name]) => !names.has(name)));
    movedEntries = Object.keys(mine).length;
    if (movedEntries > 0) writeJson(join(target, 'replay.json'), { trials: mine });
    writeJson(replayFile, { trials: rest });
  }
  let movedRows = 0;
  if (auditLines !== null) {
    const mine = auditLines.filter(isTaskRow);
    const rest = auditLines.filter((l) => !isTaskRow(l));
    movedRows = mine.length;
    if (movedRows > 0) writeFileSync(join(target, 'audit.jsonl'), `${mine.join('\n')}\n`);
    writeFileSync(auditFile, rest.length === 0 ? '' : `${rest.join('\n')}\n`);
  }
  deps.out(`supersede: moved ${records.length} records, ${trajectories} trajectories, ${movedEntries} replay.json entries and ${movedRows} audit.jsonl rows of ${task} to ${target}; write its README.md (R42)`);
  return 0;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2));
}
