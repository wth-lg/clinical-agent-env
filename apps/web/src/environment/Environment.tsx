// Environment: the world every trial starts from (pinned clock, state hash, resources by type, from
// fixtures/manifest.json), Verify reset (a fresh store built in this tab, its state hash shown next
// to the manifest's), and the tool catalogue with a keyless Try panel that runs one read tool on a
// scratch store. The catalogue and Try go only through packages/core/try-tool.ts.
import { useState, type Ref } from 'react';
import { loadStore } from '../../../../packages/env/fixture-source.ts';
import { stateHash } from '../../../../packages/env/hash.ts';
import { toolCatalog, tryReadTool, type TryResult } from '../../../../packages/core/try-tool.ts';
import { Card, Page } from '../data/ui.tsx';
import { MANIFEST, worldSource } from '../data/world.ts';

const TOOLS = toolCatalog();
const READ = TOOLS.filter((t) => t.kind === 'read');
// A first input for each read tool's Try; any other is typed by hand.
const EXAMPLES: Record<string, unknown> = {
  fhir_search: { resource_type: 'Patient', count: 5 },
  get_context: {},
};
const button = 'inline-flex h-8 items-center rounded-sm border border-line-strong bg-surface px-3 text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:text-ink-muted';
const short = (h: string) => `${h.slice(0, 12)}…${h.slice(-6)}`;

export function Environment({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const w = MANIFEST.world;
  return (
    <Page title="Environment" headingRef={headingRef} lead="A synthetic FHIR R4 world, the same for every trial: each trial starts from a fresh copy and is checked against its state hash.">
      <Card title="World">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
          <dt className="text-ink-muted">Pinned clock</dt><dd data-testid="pinned-clock">{MANIFEST.now}</dd>
          <dt className="text-ink-muted">State hash (manifest)</dt><dd data-testid="manifest-hash" className="break-all font-mono text-xs">{w.state_hash}</dd>
          <dt className="text-ink-muted">Resources</dt><dd data-testid="resource-total">{w.resources}</dd>
        </dl>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3" data-testid="resource-counts">
          {Object.entries(w.by_type).map(([type, n]) => <li key={type} className="flex justify-between border-b border-line py-0.5"><span>{type}</span><span>{n}</span></li>)}
        </ul>
        <VerifyReset />
      </Card>
      <Card title={`Tools (${TOOLS.length})`}>
        <ul className="divide-y divide-line" data-testid="tool-catalog">
          {TOOLS.map((t) => (
            <li key={t.name} data-testid="tool" data-tool={t.name} className="py-2">
              <details>
                <summary className="cursor-pointer"><code className="font-medium">{t.name}</code> <span className="text-xs text-ink-muted">{t.kind}</span></summary>
                <p className="mt-1 text-ink-muted" data-testid="tool-description">{t.description}</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded-sm bg-canvas p-2 text-xs">{JSON.stringify(t.inputSchema, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      </Card>
      <TryPanel />
    </Page>
  );
}

function VerifyReset() {
  const [state, setState] = useState<{ kind: 'idle' | 'running' } | { kind: 'done'; hash: string; ms: number } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const run = async () => {
    setState({ kind: 'running' });
    try {
      const t0 = performance.now();
      const store = await loadStore(worldSource());
      const hash = await stateHash(store.resources());
      setState({ kind: 'done', hash, ms: performance.now() - t0 });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" className={button} disabled={state.kind === 'running'} onClick={() => void run()}>Verify reset</button>
      {state.kind === 'running' && <span className="text-ink-muted" role="status">Building a fresh store in this tab…</span>}
      {state.kind === 'error' && <span role="alert">Verify reset did not finish: {state.message}</span>}
      {state.kind === 'done' && (
        <span data-testid="reset-result" data-hash={state.hash} data-equal={String(state.hash === MANIFEST.world.state_hash)}>
          Fresh store hash <code className="break-all text-xs">{state.hash}</code> {state.hash === MANIFEST.world.state_hash ? 'equals' : 'does NOT equal'} the manifest's ({Math.round(state.ms)} ms).
        </span>
      )}
    </div>
  );
}

function TryPanel() {
  const [name, setName] = useState(READ[0]?.name ?? '');
  const [args, setArgs] = useState(() => JSON.stringify(EXAMPLES[READ[0]?.name ?? ''] ?? {}, null, 2));
  const [state, setState] = useState<{ kind: 'idle' | 'running' } | { kind: 'done'; r: TryResult } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const run = async () => {
    setState({ kind: 'running' });
    try {
      setState({ kind: 'done', r: await tryReadTool(name, JSON.parse(args) as unknown, worldSource()) });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };
  const text = state.kind === 'done' ? JSON.stringify(state.r.result.content, null, 2) : '';
  return (
    <Card title="Try a read tool">
      <p className="text-ink-muted">Runs one read tool on a scratch copy of the world in this tab, with no key and no model. The state hash before and after shows that a read changes nothing.</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Tool
          <select aria-label="Tool" className="h-8 rounded-sm border border-line-strong bg-surface px-2 text-ink" value={name} onChange={(e) => { setName(e.target.value); setArgs(JSON.stringify(EXAMPLES[e.target.value] ?? {}, null, 2)); }}>
            {READ.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-ink-muted">
          Input (JSON)
          <textarea aria-label="Input (JSON)" value={args} onChange={(e) => setArgs(e.target.value)} rows={4} className="rounded-sm border border-line-strong bg-surface p-2 font-mono text-xs text-ink" />
        </label>
      </div>
      <button type="button" className={`${button} mt-3`} disabled={state.kind === 'running'} onClick={() => void run()}>Try</button>
      {state.kind === 'running' && <p className="mt-2 text-ink-muted" role="status">Building a scratch store…</p>}
      {state.kind === 'error' && <p className="mt-2" role="alert">{state.message}</p>}
      {state.kind === 'done' && (
        <div className="mt-3 space-y-2" data-testid="try-result" data-error={String(state.r.result.is_error)} data-hash-before={state.r.hash_before} data-hash-after={state.r.hash_after}>
          <p>Hash before <code className="text-xs">{short(state.r.hash_before)}</code>, after <code className="text-xs">{short(state.r.hash_after)}</code>: <span data-testid="try-unchanged">{state.r.hash_before === state.r.hash_after ? 'unchanged' : 'CHANGED'}</span>.</p>
          <p>exposed_ids ({state.r.result.exposed_ids.length}): <span data-testid="try-exposed" className="break-all text-xs">{state.r.result.exposed_ids.join(', ') || 'none'}</span></p>
          <pre data-testid="try-content" className="max-h-96 overflow-auto rounded-sm bg-canvas p-2 text-xs">{text.length > 20000 ? `${text.slice(0, 20000)}\n… (${text.length} characters in all)` : text}</pre>
        </div>
      )}
    </Card>
  );
}
