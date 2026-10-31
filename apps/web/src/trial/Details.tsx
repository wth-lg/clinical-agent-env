// The Environment tab (what the trial ran on: versions, hashes, model, effort, times and counts)
// and the Raw tab (the record as JSON, with a download, and the trajectory file).
import { Download } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Trial } from '../data/results.ts';
import { BUTTON, Hash } from '../data/ui.tsx';
import { MANIFEST } from '../data/world.ts';
import { LINK } from './Attribution.tsx';

type Facts = Trial['record'] & {
  trial_id?: string; fixture_hash?: string; model_requested?: string | null; models_returned?: readonly string[]; effort?: string; api_version?: string;
  tool_calls?: number; tool_errors?: Readonly<Record<string, number>>; status?: string | null; stop?: string; stop_reason?: string | null; api_retries?: number;
};

const dash = <span className="text-ink-muted">—</span>;
const text = (v: unknown): ReactNode => (v === undefined || v === null || v === '' ? dash : String(v));
const hash = (v: string | null | undefined, testId: string) => (v ? <Hash value={v} testId={testId} /> : dash);

export function EnvironmentTab({ t }: { t: Trial }) {
  const r = t.record as Facts;
  const errors = Object.entries(r.tool_errors ?? {}).filter(([, n]) => n > 0);
  const rows: Array<[string, string, ReactNode]> = [
    ['task', 'Task', t.task],
    ['trial', 'Trial id', text(r.trial_id ?? t.name)],
    ['task_version', 'Task version', hash(r.task_version, 'env-task-version')],
    ['env_version', 'Environment version', hash(r.env_version, 'env-env-version')],
    ['grader_version', 'Grader version', text(r.grader_version)],
    ['grader_task_version', 'Grader task version', hash(r.grader_task_version, 'env-grader-task-version')],
    ['fixture_hash', 'Fixture hash', hash(r.fixture_hash, 'env-fixture-hash')],
    ['manifest', 'World in today\'s manifest', <Hash key="m" value={MANIFEST.world.state_hash} />],
    ['model', 'Model', r.models_returned && r.models_returned.length > 0 && r.models_returned.some((m) => m !== r.model_requested) ? `${text(r.model_requested)} requested; ${r.models_returned.join(', ')} returned` : text(r.model_requested)],
    ['effort', 'Effort', text(r.effort)],
    ['api_version', 'API version', text(r.api_version)],
    ['started', 'Started', text(r.started)],
    ['ended', 'Ended', text(r.ended)],
    ['turns', 'Turns', text(r.turns)],
    ['tool_calls', 'Tool calls', text(r.tool_calls)],
    ['tool_errors', 'Tool errors', errors.length === 0 ? 'none' : errors.map(([k, n]) => `${n} ${k}`).join(', ')],
    ['api_retries', 'API retries', text(r.api_retries)],
    ['status', 'Status', `${text(r.status)}${r.stop ? `, stopped by ${r.stop}` : ''}${r.stop_reason ? `, last stop reason ${r.stop_reason}` : ''}`],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_minmax(0,1fr)] [&_dd]:min-w-0 [&_dd]:break-words [&_dt]:text-ink-muted">
      {rows.map(([key, label, value]) => (
        <div key={key} data-testid="env-row" data-key={key} className="contents">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Raw({ t }: { t: Trial }) {
  const json = useMemo(() => JSON.stringify(t.record, null, 2), [t.record]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [json]);
  const file = `${t.name.replace(/[^A-Za-z0-9._-]+/g, '-')}.json`;
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {url !== null && (
          <a data-testid="raw-download" href={url} download={file} className={BUTTON}>
            <Download aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />Download the record (JSON)
          </a>
        )}
        {t.trajectoryUrl && <a className={LINK} href={t.trajectoryUrl}>Trajectory (JSONL)</a>}
      </p>
      <pre data-testid="raw-json" tabIndex={0} aria-label="The trial record as JSON" className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-sm bg-canvas p-3 font-mono text-xs text-ink">{json}</pre>
    </div>
  );
}
