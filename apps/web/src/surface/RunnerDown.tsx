import { RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BUTTON_PRIMARY } from '../data/ui.tsx';
import { RUNNER_STOPPED } from '../live/copy.ts';
import { detectSurface } from './detect.ts';
import { LocalCommand } from './LocalCommand.tsx';

export const RETRY_MS = 2000;

// Probes api/health every RETRY_MS while `active`, and reloads the page when the runner answers
// as clinenv-runner, which also picks up a new token if the runner restarted. The runner-down
// screen runs it always; the Live trial view runs it once it finds the runner gone mid-trial
// (P25u A2), so that page reconnects by itself too.
export function useRunnerRetry(active = true): void {
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if ((await detectSurface()).kind === 'local-runner') return location.reload();
      if (!stop) timer = setTimeout(loop, RETRY_MS);
    };
    timer = setTimeout(loop, RETRY_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [active]);
}

// The runner's own page when its api/health did not answer as clinenv-runner. It retries every
// RETRY_MS and on an answer reloads. Nothing here takes a key. The reader already has the clone,
// so the restart command comes first (P25u A12).
export function RunnerDown() {
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    const s = await detectSurface();
    if (s.kind === 'local-runner') location.reload();
    else setChecking(false);
  }

  useRunnerRetry();

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <section className="w-full max-w-[440px] rounded-sm border border-line bg-surface p-6" aria-labelledby="runner-down">
        <span className="text-xs text-ink-muted">Riverbend clinical agent environment</span>
        <h1 id="runner-down" className="mt-4 text-base font-semibold text-ink">
          Local runner not responding
        </h1>
        <p className="mt-1 text-ink-muted">
          This page comes from the local runner, but the runner did not answer. {RUNNER_STOPPED}
        </p>
        <div className="mt-4">
          <LocalCommand local />
        </div>
        <button
          type="button"
          onClick={check}
          disabled={checking}
          className={`${BUTTON_PRIMARY} mt-4 h-9`}
        >
          <RotateCw aria-hidden className="h-4 w-4" strokeWidth={1.75} />
          {checking ? 'Checking…' : 'Retry now'}
        </button>
      </section>
    </main>
  );
}
