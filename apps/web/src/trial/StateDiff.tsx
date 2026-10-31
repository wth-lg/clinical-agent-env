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
import { BUTTON, Hash } from '../data/ui.tsx';
import { MANIFEST } from '../data/world.ts';
import { EvidenceId, Section } from './Grading.tsx';
import { validate, type StateRun } from '../tasks/validate-protocol.ts';
import type { Loaded } from './Trajectory.tsx';

const show = (v: unknown) => (v === undefined ? '(absent)' : JSON.stringify(v, null, 1));

type Run = { state: 'idle' } | { state: 'running' } | { state: 'error'; message: string } | { state: 'done'; value: StateRun };

// decisiveIds: the evidence ids of the decisive check, marked wherever they show.
// official: the trial is of the official run. A pilot on another world is said in a neutral tone
// and offers no Replay (it cannot reproduce on today's world); an official trial on another world
// keeps the alert, because the committed results must run on today's world (P17j JU11).
export function StateDiff({ t, events, steps, written, onStep, decisiveIds = [], official = true }: { t: Trial; events: Loaded<TrialEvent[]> | null; steps: readonly Step[] | null; written: readonly string[]; onStep: (n: number) => void; decisiveIds?: readonly string[]; official?: boolean }) {
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
  // A trial from another world cannot be reproduced on today's: a differing hash is expected
  // there, not a failure (verifier-phase-P16-1 m3).
  const otherWorld = h.initial !== manifest;
  return (
    <div className="space-y-4">
      {!otherWorld ? (
        <p data-testid="manifest-line" className="break-words text-ink">Initial state hash matches the manifest: the trial started from the world every trial starts from.</p>
      ) : official ? (
        <p data-testid="manifest-line" role="alert" className="break-words rounded-sm border border-danger p-3 font-medium text-danger">Initial state hash does not match the manifest: the trial started from another world than today's, so a replay here cannot reproduce it.</p>
      ) : (
        <p data-testid="manifest-line" data-tone="neutral" className="break-words text-ink-muted">
          {h.initial === null ? 'This pilot\'s record has no initial state hash, so the world it ran on is not known.' : `This pilot ran on another world version (${h.initial.slice(0, 4)}…).`} Today's world is {manifest.slice(0, 4)}….
        </p>
      )}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)] [&_dd]:min-w-0 [&_dt]:text-ink-muted">
        <dt>Manifest</dt><dd><Hash value={manifest} testId="hash-manifest" /></dd>
        <dt>Initial</dt><dd><Hash value={h.initial} testId="hash-initial" /></dd>
        <dt>Final</dt><dd><Hash value={h.final} testId="hash-final" /></dd>
        <dt>Replay at grading</dt><dd><Hash value={h.replay_final ?? null} testId="hash-replay" /></dd>
      </dl>
      {decisiveIds.length > 0 && events?.state === 'ready' && (
        <p data-testid="decisive-resources" className="break-words text-ink">
          The decisive check names{' '}
          {decisiveIds.map((id, i) => (
            <span key={id} data-id={id} data-written={String(written.includes(id))}>
              {i > 0 && (i === decisiveIds.length - 1 ? ' and ' : ', ')}
              <code className="text-xs">{id}</code> ({written.includes(id) ? 'the trial wrote it' : 'the trial did not write it'})
            </span>
          ))}
          .
        </p>
      )}
      <Section title={`Resources the trial wrote (${written.length})`}>
        {written.length === 0 ? <p className="text-ink-muted">{events?.state === 'ready' ? 'The trial wrote nothing.' : 'Shown when the trajectory is loaded.'}</p> : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {written.map((id) => (
              <li key={id} data-testid="written" data-id={id} data-decisive={String(decisiveIds.includes(id))} className="inline-flex flex-wrap items-baseline gap-x-1.5">
                <EvidenceId id={id} steps={steps} onStep={onStep} />
                {decisiveIds.includes(id) && <DecisiveMark />}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {!(otherWorld && !official) && (
      <div className="space-y-2" data-testid="replay-block">
        <button type="button" className={BUTTON} disabled={!canReplay || run.state === 'running'} onClick={() => void replay()}>
          {run.state === 'running' ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.75} /> : <RotateCcw aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />}
          Replay
        </button>
        <p data-testid="replay-note" className="text-xs text-ink-muted">
          {canReplay ? 'Runs the tool calls again on a fresh copy of the world, in this tab. It needs no key and makes no API call.' : 'Replay needs the trajectory, which is not published for this trial.'}
          {canReplay && otherWorld && ' This trial started from another world, so the replayed final hash is expected to differ from the record.'}
        </p>
        {run.state === 'running' && <p className="text-ink-muted">Replaying…</p>}
        {run.state === 'error' && (
          <div role="alert" data-testid="replay-error" className="rounded-sm border border-danger p-3">
            <p className="font-medium text-danger">Replay failed.</p>
            <p className="mt-1 break-words font-mono text-xs text-ink-muted">{run.message}</p>
          </div>
        )}
        {run.state === 'done' && <Result r={run.value} recorded={h.final} decisiveIds={decisiveIds} otherWorld={otherWorld} />}
      </div>
      )}
    </div>
  );
}

const DecisiveMark = () => <span className="rounded-sm border border-danger px-1 text-xs text-danger">named by the decisive check</span>;

function Result({ r, recorded, decisiveIds, otherWorld }: { r: StateRun; recorded: string | null; decisiveIds: readonly string[]; otherWorld: boolean }) {
  const match = r.final !== null && r.final === recorded;
  const expected = !match && otherWorld;
  return (
    <div data-testid="replay-result" data-match={String(match)} data-expected={String(expected)} data-final={r.final ?? ''} className="space-y-3">
      <p data-testid="replay-line" className={`break-words ${match ? 'text-ink' : expected ? 'text-ink-muted' : 'font-medium text-danger'}`}>
        {r.error !== null ? `A tool call failed on replay: ${r.error}${expected ? ' This is expected: the trial started from another world.' : ''}` : recorded === null ? 'The record has no final hash to compare.' : match ? 'The replayed final state hash matches the record.' : expected ? 'The replayed final state hash differs from the record, as expected: the trial started from another world than today\'s.' : 'The replayed final state hash differs from the record.'}
      </p>
      <p className="flex flex-wrap items-center gap-x-1 text-ink-muted">Replayed final <Hash value={r.final} testId="hash-replayed" /></p>
      <Section title={`Created (${r.diff.created.length}), changed (${r.diff.updated.length})`}>
        {r.changes.length === 0 ? <p className="text-ink-muted">The trial left the world as it found it.</p> : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {r.changes.map((c) => (
              <li key={c.id} data-testid="diff-row" data-id={c.id} data-kind={c.kind} data-decisive={String(decisiveIds.includes(c.id))} className="min-w-0 px-3 py-2">
                <details>
                  <summary className="cursor-pointer break-words">
                    <code className="text-xs text-ink">{c.id}</code> {decisiveIds.includes(c.id) && <DecisiveMark />} <span className="text-xs text-ink-muted">{c.kind}{c.status ? `, status ${c.status.from ?? 'none'} to ${c.status.to ?? 'none'}` : ''}{c.kind === 'updated' ? `, ${c.fields.length} field${c.fields.length === 1 ? '' : 's'} changed` : ''}</span>
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
