// Environment: the world a trial starts from. Each task's official trials start from that task's
// frozen world (results/tasks-final.json); this page shows today's build world (pinned clock,
// world hash, resources by type, from fixtures/manifest.json), which Live trial and Try a read
// tool run on, and the Frozen worlds table beside it (P25u J3: before, the lead said the world
// was "the same for every trial" while a trial header named another hash; frozen.ts gives the
// rows). On screen the hash is the "world hash" (copy rule C3); "matches the manifest" stays the
// words of the Check a fresh copy matches result (docs/requirements/ui-contract.md). Then Check a
// fresh copy matches (a fresh store built in this tab, its world hash shown next to today's
// build), and the tool catalogue with a keyless Try panel that runs one read tool on a scratch
// store, prefilled with a working example (examples.ts); an input that is not JSON, or a tool
// that throws, is an error in the danger colour (P25c). The catalogue and Try go only through
// packages/core/try-tool.ts.
import { CircleAlert } from 'lucide-react';
import { useState, type Ref } from 'react';
import { loadStore } from '../../../../packages/env/fixture-source.ts';
import { stateHash } from '../../../../packages/env/hash.ts';
import { toolCatalog, tryReadTool, type TryResult } from '../../../../packages/core/try-tool.ts';
import { useResults } from '../data/results.ts';
import { ResultsError } from '../data/results-error.tsx';
import { BUTTON, BUTTON_PRIMARY, Card, ErrorNote, FIELD, GlossaryLink, Hash, Notice, Page, SELECT } from '../data/ui.tsx';
import { MANIFEST, worldSource } from '../data/world.ts';
import { firstSentence, formatClock } from '../data/text.ts';
import { TRY_EXAMPLES } from './examples.ts';
import { frozenCountLine, frozenRows, roleWords, worldWords } from './frozen.ts';

const TOOLS = toolCatalog();
const READ = TOOLS.filter((t) => t.kind === 'read');
const example = (name: string) => JSON.stringify(TRY_EXAMPLES[name] ?? {}, null, 2);

export function Environment({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const w = MANIFEST.world;
  const lead = (
    <>
      Each task's official trials start from that task's <GlossaryLink anchor="term-frozen-world">frozen world</GlossaryLink>, a synthetic <GlossaryLink anchor="term-fhir-r4">FHIR R4</GlossaryLink> record.
      This page shows <GlossaryLink anchor="term-todays-build">today's build</GlossaryLink> world, which Live trial and Try a read tool run on, and the frozen worlds beside it.
    </>
  );
  return (
    <Page title="Environment" headingRef={headingRef} lead={lead}>
      <Card title="Today's build">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
          <dt className="text-ink-muted">Pinned clock</dt><dd data-testid="pinned-clock" title={MANIFEST.now}>{formatClock(MANIFEST.now)}</dd>
          <dt className="text-ink-muted"><GlossaryLink anchor="term-world-hash">World hash</GlossaryLink></dt><dd><Hash testId="manifest-hash" value={w.state_hash} /></dd>
          <dt className="text-ink-muted">Resources</dt><dd data-testid="resource-total">{w.resources}</dd>
        </dl>
        <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-0.5 text-xs sm:grid-cols-3" data-testid="resource-counts">
          {Object.entries(w.by_type).map(([type, n]) => <li key={type} className="flex min-w-0 justify-between gap-2 border-b border-line py-0.5"><span className="min-w-0 truncate" title={type}>{type}</span><span className="text-right tabular-nums">{n}</span></li>)}
        </ul>
        <VerifyReset />
      </Card>
      <FrozenWorlds manifest={w.state_hash} />
      <Card title={`${TOOLS.length} tools`}>
        <ul className="divide-y divide-line" data-testid="tool-catalog">
          {TOOLS.map((t) => (
            <li key={t.name} data-testid="tool" data-tool={t.name} className="py-2">
              <details>
                <summary className="cursor-pointer break-all"><code className="font-medium">{t.name}</code> <span className="text-xs text-ink-muted">{t.kind}</span>
                  <span className="block break-words text-ink-muted" data-testid="tool-purpose">{firstSentence(t.description)}</span>
                </summary>
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

// The frozen worlds (results/tasks-final.json, data/results.ts Freezes): one row per freeze of
// each task, its world hash against today's build, so a trial header's "matches the frozen world
// of <task>" and this page name one hash. With no freeze yet, the official trials start from
// today's build, and the card says so.
function FrozenWorlds({ manifest }: { manifest: string }) {
  const results = useResults();
  const rows = results?.kind === 'ready' ? frozenRows(results.frozen, manifest) : [];
  const current = rows.filter((r) => r.role === 'current');
  const onToday = current.filter((r) => r.today).length;
  return (
    <Card title="Frozen worlds">
      {/* Claim audit: not "the world it was tuned on": renal-dose-review was re-frozen on a later
          world before its final run (results/tasks-final.json, R40). */}
      <p className="text-ink-muted">A task is frozen on one world before its final run, and its official trials start from that world, so a trial's world hash matches its task's row here and may differ from today's build.</p>
      {results === null && <p className="mt-2 text-ink-muted" role="status">Loading the published results…</p>}
      {results?.kind === 'error' && <div className="mt-2"><ResultsError nested testId="frozen-worlds-error" message={results.message} cannot="the frozen worlds cannot be listed" /></div>}
      {results?.kind === 'ready' && rows.length === 0 && <p className="mt-2 text-ink-muted" data-testid="frozen-worlds-none">No task is frozen yet: the official trials start from today's build.</p>}
      {rows.length > 0 && (
        <>
          <p className="mt-2 text-xs text-ink-muted" data-testid="frozen-worlds-count">{frozenCountLine(onToday, current.length)}</p>
          <ul className="mt-2 divide-y divide-line" data-testid="frozen-worlds">
            {rows.map((r) => (
              <li key={`${r.task}-${r.role}-${r.version ?? ''}`} data-testid="frozen-world" data-task={r.task} data-role={r.role} data-hash={r.hash} data-today={String(r.today)} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                <span className="min-w-0 break-words font-medium">{r.task}</span>
                <span className="text-xs text-ink-muted">{roleWords(r)}</span>
                <Hash value={r.hash} />
                <span className="text-xs text-ink-muted">frozen at tag {r.tag}</span>
                <span className={`text-xs ${r.today ? 'text-ink-muted' : 'text-ink'}`}>{worldWords(r.today)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
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
      <button type="button" className={BUTTON_PRIMARY} disabled={state.kind === 'running'} aria-describedby="reset-help" onClick={() => void run()}>Check a fresh copy matches</button>
      <p id="reset-help" className="order-last basis-full text-xs text-ink-muted">Builds a fresh copy of the world in this tab and compares its world hash with today's build (the manifest).</p>
      {state.kind === 'running' && <span className="text-ink-muted" role="status">Building a fresh store in this tab…</span>}
      {state.kind === 'error' && (
        <div className="basis-full">
          {/* Check a fresh copy matches above stays the card's primary, so Retry here is a plain button. */}
          <Notice nested tone="danger" role="alert" icon={CircleAlert} detail={state.message} action={<button type="button" className={BUTTON} onClick={() => void run()}>Retry</button>}>
            <p className="font-medium text-ink">The fresh store could not be built, so the check did not finish. The other pages still work.</p>
          </Notice>
        </div>
      )}
      {state.kind === 'done' && (
        <span className="min-w-0 break-words" data-testid="reset-result" data-hash={state.hash} data-equal={String(state.hash === MANIFEST.world.state_hash)}>
          Fresh copy world hash <Hash value={state.hash} /> {state.hash === MANIFEST.world.state_hash ? 'matches the manifest' : 'does NOT match the manifest'}, today's build ({Math.round(state.ms)} ms).
        </span>
      )}
    </div>
  );
}

function TryPanel() {
  const [name, setName] = useState(READ[0]?.name ?? '');
  const [args, setArgs] = useState(() => example(READ[0]?.name ?? ''));
  // An error says first what went wrong in plain words (the input, or the tool), then the message.
  const [state, setState] = useState<{ kind: 'idle' | 'running' } | { kind: 'done'; r: TryResult } | { kind: 'error'; lead: string; message: string }>({ kind: 'idle' });
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const run = async () => {
    setState({ kind: 'running' });
    let input: unknown;
    try {
      input = JSON.parse(args);
    } catch (e) {
      return setState({ kind: 'error', lead: 'The input is not valid JSON.', message: message(e) });
    }
    try {
      setState({ kind: 'done', r: await tryReadTool(name, input, worldSource()) });
    } catch (e) {
      setState({ kind: 'error', lead: 'The tool did not run.', message: message(e) });
    }
  };
  const text = state.kind === 'done' ? JSON.stringify(state.r.result.content, null, 2) : '';
  return (
    <Card title="Try a read tool">
      <p className="text-ink-muted">Runs one read tool on a scratch copy of today's build in this tab, with no key and no model. The world hash before and after shows that a read changes nothing.</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Tool
          <select aria-label="Tool" className={SELECT} value={name} onChange={(e) => { setName(e.target.value); setArgs(example(e.target.value)); }}>
            {READ.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-ink-muted">
          Input (JSON)
          <textarea aria-label="Input (JSON)" value={args} onChange={(e) => setArgs(e.target.value)} rows={4} className={`${FIELD} h-auto p-2 font-mono text-xs`} />
        </label>
      </div>
      <button type="button" className={`${BUTTON_PRIMARY} mt-3`} disabled={state.kind === 'running'} onClick={() => void run()}>Run tool</button>
      {state.kind === 'running' && <p className="mt-2 text-ink-muted" role="status">Building a scratch store…</p>}
      {state.kind === 'error' && <ErrorNote testId="try-error" lead={state.lead} detail={state.message} />}
      {state.kind === 'done' && (
        <div className="mt-3 space-y-2" data-testid="try-result" data-error={String(state.r.result.is_error)} data-hash-before={state.r.hash_before} data-hash-after={state.r.hash_after}>
          <p className="break-words">World hash before <Hash value={state.r.hash_before} />, after <Hash value={state.r.hash_after} />: <span data-testid="try-unchanged">{state.r.hash_before === state.r.hash_after ? 'unchanged' : 'CHANGED'}</span>.</p>
          <p>exposed_ids ({state.r.result.exposed_ids.length}): <span data-testid="try-exposed" className="break-all text-xs">{state.r.result.exposed_ids.join(', ') || 'none'}</span></p>
          <pre data-testid="try-content" className="max-h-96 overflow-auto rounded-sm bg-canvas p-2 text-xs">{text.length > 20000 ? `${text.slice(0, 20000)}\n… (${text.length} characters in all)` : text}</pre>
        </div>
      )}
    </Card>
  );
}
