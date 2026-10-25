// The State diff tab: first whether the trial started from the world in today's manifest, then
// the record's initial, final and replay hashes and the resources the trajectory wrote, each
// linked to its step. Replay re-executes the tool log in this tab with no key (replay.ts) and
// shows whether it reproduces the record's final hash, and each resource the trial created or
// changed with the fields that differ. Replay runs in the validation Worker (tasks/
// validation-thread.ts), with no key and no network beyond this site.
import { Loader2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import type { Step } from '../../../../packages/grader/check.ts';
import type { Trial } from '../data/results.ts';
import { Hash } from '../data/ui.tsx';
import { MANIFEST } from '../data/world.ts';
import { EvidenceId, Section } from './Grading.tsx';
import { validate, type StateRun } from '../tasks/validate-protocol.ts';
import type { Loaded } from './Trajectory.tsx';

const button = 'inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50';
const show = (v: unknown) => (v === undefined ? '(absent)' : JSON.stringify(v, null, 1));

type Run = { state: 'idle' } | { state: 'running' } | { state: 'error'; message: string } | { state: 'done'; value: StateRun };

export function StateDiff({ t, events, steps, written, onStep }: { t: Trial; events: Loaded<TrialEvent[]> | null; steps: readonly Step[] | null; written: readonly string[]; onStep: (n: number) => void }) {
  const [run, setRun] = useState<Run>({ state: 'idle' });
  const h = t.record.state_hash;
  const manifest = MANIFEST.world.state_hash;
  const url = t.trajectoryUrl;
  const replay = async () => {
    if (url === null) return;
    setRun({ state: 'running' });
    try {
      setRun({ state: 'done', value: await validate({ op: 'state', task: t.task, trajectoryUrl: url }) });
    } catch (e) {
      setRun({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };
  const canReplay = url !== null;
  return (
    <div className="space-y-4">
      <p data-testid="manifest-line" className="break-words text-ink">
        {h.initial === manifest
          ? 'Initial state hash matches the manifest: the trial started from the world every trial starts from.'
          : 'Initial state hash does not match the manifest: the trial started from another world than today\'s, so a replay here cannot reproduce it.'}
      </p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)] [&_dd]:min-w-0 [&_dt]:text-ink-muted">
        <dt>Manifest</dt><dd><Hash value={manifest} testId="hash-manifest" /></dd>
        <dt>Initial</dt><dd><Hash value={h.initial} testId="hash-initial" /></dd>
        <dt>Final</dt><dd><Hash value={h.final} testId="hash-final" /></dd>
        <dt>Replay at grading</dt><dd><Hash value={h.replay_final ?? null} testId="hash-replay" /></dd>
      </dl>
      <Section title={`Resources the trial wrote (${written.length})`}>
        {written.length === 0 ? <p className="text-ink-muted">{events?.state === 'ready' ? 'The trial wrote nothing.' : 'Shown when the trajectory is loaded.'}</p> : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1">{written.map((id) => <li key={id}><EvidenceId id={id} steps={steps} onStep={onStep} /></li>)}</ul>
        )}
      </Section>
      <div className="space-y-2">
        <button type="button" className={button} disabled={!canReplay || run.state === 'running'} onClick={() => void replay()}>
          {run.state === 'running' ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <RotateCcw aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />}
          Replay
        </button>
        <p className="text-xs text-ink-muted">{canReplay ? 'Runs the tool calls again on a fresh copy of the world, in this tab. It needs no key and makes no API call.' : 'Replay needs the trajectory, which is not published for this trial.'}</p>
        {run.state === 'running' && <p className="text-ink-muted">Replaying…</p>}
        {run.state === 'error' && (
          <div role="alert" data-testid="replay-error" className="rounded-sm border border-danger p-3">
            <p className="font-medium text-danger">Replay failed.</p>
            <p className="mt-1 break-words font-mono text-xs text-ink-muted">{run.message}</p>
          </div>
        )}
        {run.state === 'done' && <Result r={run.value} recorded={h.final} />}
      </div>
    </div>
  );
}

function Result({ r, recorded }: { r: StateRun; recorded: string | null }) {
  const match = r.final !== null && r.final === recorded;
  return (
    <div data-testid="replay-result" data-match={String(match)} data-final={r.final ?? ''} className="space-y-3">
      <p className={`break-words ${match ? 'text-ink' : 'font-medium text-danger'}`}>
        {r.error !== null ? `A tool call failed on replay: ${r.error}` : recorded === null ? 'The record has no final hash to compare.' : match ? 'The replayed final state hash matches the record.' : 'The replayed final state hash differs from the record.'}
      </p>
      <p className="flex flex-wrap items-center gap-x-1 text-ink-muted">Replayed final <Hash value={r.final} testId="hash-replayed" /></p>
      <Section title={`Created (${r.diff.created.length}), changed (${r.diff.updated.length})`}>
        {r.changes.length === 0 ? <p className="text-ink-muted">The trial left the world as it found it.</p> : (
          <ul className="divide-y divide-line rounded-sm border border-line">
            {r.changes.map((c) => (
              <li key={c.id} data-testid="diff-row" data-id={c.id} data-kind={c.kind} className="min-w-0 px-3 py-2">
                <details>
                  <summary className="cursor-pointer break-words">
                    <code className="text-xs text-ink">{c.id}</code> <span className="text-xs text-ink-muted">{c.kind}{c.status ? `, status ${c.status.from ?? 'none'} to ${c.status.to ?? 'none'}` : ''}{c.kind === 'updated' ? `, ${c.fields.length} field${c.fields.length === 1 ? '' : 's'} changed` : ''}</span>
                  </summary>
                  {c.kind === 'created' ? (
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-canvas p-2 font-mono text-xs text-ink">{JSON.stringify(Object.fromEntries(c.fields.map((f) => [f.key, f.after])), null, 1)}</pre>
                  ) : (
                    <dl className="mt-2 space-y-2">
                      {c.fields.map((f) => (
                        <div key={f.key} className="min-w-0">
                          <dt className="text-xs font-medium text-ink">{f.key}</dt>
                          <dd className="grid min-w-0 gap-1 sm:grid-cols-2">
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-canvas p-2 font-mono text-xs text-ink-muted"><span className="block font-sans text-ink-muted">Before</span>{show(f.before)}</pre>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-canvas p-2 font-mono text-xs text-ink"><span className="block font-sans text-ink-muted">After</span>{show(f.after)}</pre>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
