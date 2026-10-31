import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { Fragment, useId, useRef, useState, type FormEvent } from 'react';
import { DEFAULT_SESSION_CAP_USD, MAX_SESSION_CAP_USD, parseCap } from '../spend/cap.ts';
import { sessionCap, setSessionCap } from '../spend/session.ts';
import type { Surface } from '../surface/detect.ts';
import { isHosted } from '../surface/hosted.ts';
import { LocalRunPanel } from '../surface/LocalRunPanel.tsx';
import { SurfaceChip } from '../surface/SurfaceChip.tsx';
import { BUTTON, BUTTON_PRIMARY, CARD, FIELD } from '../data/ui.tsx';
import { validateDirect } from './direct.ts';
import { describeFailure, keyFormatProblem, type Failure } from './failure.ts';
import { heldByRunner, holdInTab } from './key.ts';
import { postKey } from './runner.ts';

// Where the key goes, as three short points under the field (ui-polish 5.4).
const WHERE: Record<Surface['kind'], readonly string[]> = {
  'local-runner': ['The key goes to the local runner on this machine, which keeps it in memory.', 'The runner sends it only to the Anthropic API.', 'Use a workspace key with a spend limit.'],
  'browser-direct': ["The key stays in this tab's memory.", 'It is sent only to the Anthropic API, through a relay that forwards it and keeps no copy.', 'Use a workspace key with a spend limit.'],
};

const field = `${FIELD} h-9 w-full px-3`;

// The key field stays type="password": the browser masks it natively and assistive technology
// announces it as a secure field. Password managers are asked not to offer to save it
// (autocomplete="off" plus the 1Password, LastPass and Bitwarden ignore attributes);
// Chromium may still offer, because it ignores autocomplete="off" on password inputs. A
// text input styled to look masked would avoid that prompt but loses the native masking and
// semantics, so the residual prompt is the accepted cost.
const NO_SAVE = { autoComplete: 'off', 'data-1p-ignore': 'true', 'data-lpignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other' } as const;

// The key field is uncontrolled and read through a ref on submit: React mirrors a controlled
// input's value into its value attribute, so after a failed Validate the key would sit in the
// page's markup (review-security-P16h-web-1 M2). State holds only whether the field is filled.

// The first screen: a welcome, then paste a key, Validate, go. Or browse without one. Validate stays
// the one filled primary; while the field is empty it says "Paste a key to continue" and pressing it
// moves focus to the field (ui-polish 5.4). Below the form, outside any error, the local-run panel
// states the prerequisites and the one command.
export function KeyGate({ surface, onDone, onBrowse, notice }: { surface: Surface; onDone: () => void; onBrowse: () => void; notice?: string | undefined }) {
  const keyRef = useRef<HTMLInputElement>(null);
  const [filled, setFilled] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(false);
  const [capText, setCapText] = useState(String(sessionCap()));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(notice ? { kind: 'notice', message: notice } : null);
  const ids = { key: useId(), heading: useId(), hint: useId(), cap: useId(), error: useId(), panel: useId(), empty: useId() };
  const cap = parseCap(capText);
  const rounded = cap !== null && cap !== Number(capText.trim());
  const direct = isHosted(surface);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const k = keyRef.current?.value.trim() ?? '';
    if (k === '') return keyRef.current?.focus();
    if (cap === null || busy) return;
    // A key of the wrong form is refused here, before any call.
    const malformed = keyFormatProblem(k);
    if (malformed !== null) return setFailure(malformed);
    setBusy(true);
    setFailure(null);
    setSessionCap(cap);
    try {
      if (direct) {
        const r = await validateDirect(k, cap);
        if (!r.ok) return setFailure(r);
        holdInTab(k, remember);
      } else {
        const r = await postKey(k);
        if (!r.ok) return setFailure({ ...r, kind: 'runner' });
        heldByRunner();
      }
      if (keyRef.current) keyRef.current.value = '';
      setFilled(false);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 py-10">
      {/* noValidate: parseCap decides what submits, so the browser never blocks a value the app accepts. */}
      <form onSubmit={submit} noValidate className={`${CARD} w-full max-w-[440px] p-4 sm:p-6`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">Riverbend clinical agent environment</span>
          <SurfaceChip surface={surface} />
        </div>
        <p data-testid="gate-intro" className="mt-1 text-xs text-ink-muted">A mock health record, six clinical tasks, and a grader that explains each trial.</p>
        <span aria-hidden className="mt-5 flex h-8 w-8 items-center justify-center rounded-full bg-canvas text-ink dark:bg-line">
          <KeyRound className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">See an AI model do clinical tasks</h1>
        <p className="mt-1 text-ink-muted">You can look at everything with no key. Add a key only to run new trials.</p>

        {/* The requirements name this heading (docs/requirements/ui-contract.md, trace U3 and U23).
            It is the key field's visible label too, so no second label repeats it under it
            (verifier-phase-P17i-UI-5-1 m4). */}
        <h2 id={ids.heading} className="mt-5 text-sm font-semibold text-ink">Add an API key</h2>
        <div className="relative mt-2">
          <input
            id={ids.key}
            aria-labelledby={ids.heading}
            type={reveal ? 'text' : 'password'}
            ref={keyRef}
            onChange={(e) => setFilled(e.target.value.trim() !== '')}
            {...NO_SAVE}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            placeholder="sk-ant-…"
            aria-invalid={failure !== null && failure.kind !== 'cap'}
            aria-describedby={failure ? `${ids.hint} ${ids.error}` : ids.hint}
            className={`${field} pr-9 font-mono aria-[invalid=true]:border-danger`}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide key' : 'Show key'}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-muted hover:text-ink"
          >
            {reveal ? <EyeOff aria-hidden className="h-4 w-4" strokeWidth={1.75} /> : <Eye aria-hidden className="h-4 w-4" strokeWidth={1.75} />}
          </button>
        </div>
        <ul id={ids.hint} className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-ink-muted">
          {WHERE[surface.kind].map((line) => <li key={line}>{line}</li>)}
        </ul>

        {failure && <FailureNote id={ids.error} failure={failure} panelId={ids.panel} />}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div className="w-44">
            <label htmlFor={ids.cap} className="block text-xs text-ink-muted">
              Session spend cap (USD)
            </label>
            <input
              id={ids.cap}
              type="number"
              inputMode="decimal"
              min="0.01"
              max={MAX_SESSION_CAP_USD}
              step="0.01"
              value={capText}
              onChange={(e) => setCapText(e.target.value)}
              placeholder={String(DEFAULT_SESSION_CAP_USD)}
              aria-invalid={cap === null}
              className={`${field} mt-1 h-8`}
            />
          </div>
          {direct && (
            <label className="inline-flex items-center gap-2 text-ink-muted sm:mb-1.5">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-3.5 w-3.5 accent-accent" />
              Remember in this tab
            </label>
          )}
        </div>
        {cap === null && <p className="mt-1 text-xs text-ink-muted">Enter a cap from $0.01 to ${MAX_SESSION_CAP_USD}.</p>}
        {rounded && <p className="mt-1 text-xs text-ink-muted">Rounded to ${cap.toFixed(2)}.</p>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || cap === null}
            aria-describedby={filled ? undefined : ids.empty}
            className={`${BUTTON_PRIMARY} h-9 px-4`}
          >
            {busy ? 'Validating…' : 'Validate'}
          </button>
          <button type="button" onClick={onBrowse} className={`${BUTTON} h-9`}>
            Browse without a key
          </button>
        </div>
        {!filled && <p id={ids.empty} className="mt-2 text-xs text-ink-muted">Paste a key to continue.</p>}
      </form>
      <LocalRunPanel id={ids.panel} surface={surface} className="w-full max-w-[440px]" />
    </main>
  );
}

// Red: the danger token on the border and the first line. One plain sentence first, then what to
// do (for a relay failure: the local-run panel, with a button that moves focus to it, so the
// command shows once), then the API's or runner's own line in small mono, which wraps only
// between words.
function FailureNote({ id, failure, panelId }: { id: string; failure: Failure; panelId: string }) {
  const { lead, next, detail, local } = describeFailure(failure);
  return (
    <div id={id} role="alert" className="mt-3 rounded-md border border-danger bg-canvas p-3">
      <p className="font-medium text-danger">{lead}</p>
      {next !== undefined && <p className="mt-1 text-ink">{next}</p>}
      {local && (
        <button
          type="button"
          onClick={() => document.getElementById(panelId)?.focus()}
          className={`${BUTTON} mt-2 h-7 px-2`}
        >
          Show the steps
        </button>
      )}
      {detail !== undefined && <RawLine text={detail} />}
    </div>
  );
}

// Each word is an inline block, so a line breaks only between words; a word longer than the whole
// line still wraps inside itself rather than overflow. The text content stays exactly `text`.
function RawLine({ text }: { text: string }) {
  return (
    <p className="mt-2 font-mono text-xs text-ink-muted">
      {text.split(' ').map((word, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span data-word className="inline-block max-w-full wrap-anywhere">
            {word}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
