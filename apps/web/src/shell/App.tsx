import { useEffect, useRef, useState } from 'react';
import { KeyGate } from '../keygate/KeyGate.tsx';
import { ADD_KEY_EVENT, forget, keyStatus, useKeyStatus } from '../keygate/key.ts';
import { deleteKey } from '../keygate/runner.ts';
import type { Surface } from '../surface/detect.ts';
import { LOCAL_RUN_PANEL_ID, LocalRunPanel } from '../surface/LocalRunPanel.tsx';
import { ViewBody } from '../data/ViewBody.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { Rail } from './Rail.tsx';
import { TopBar } from './TopBar.tsx';
import { viewFromUrl, viewHref } from './views.ts';

// "Browse without a key", remembered for this tab, so a reload or a shared ?view= link opened in
// it goes straight to the view (a per-tab convenience: storage may be unavailable, and then the
// gate shows again, as it does in a new tab).
const BROWSING = 'clinenv-browsing';
const browsing = () => {
  try {
    return sessionStorage.getItem(BROWSING) === '1';
  } catch {
    return false;
  }
};
const rememberBrowsing = () => {
  try {
    sessionStorage.setItem(BROWSING, '1');
  } catch {
    // Not remembered: the gate shows on the next load.
  }
};

// The views that show the "Run it on your computer" card on the hosted site.
const RUN_PANEL_VIEWS = ['overview', 'tasks'];

// The app shell: the key gate first when there is no key and the tab has not chosen to browse,
// then the rail, the top bar and the view named in ?view=.
export function App({ surface }: { surface: Surface }) {
  const status = useKeyStatus();
  const [gate, setGate] = useState(() => keyStatus().kind === 'none' && !browsing());
  // A Forget the runner refused: a plain first sentence, then the runner's own message as detail.
  const [notice, setNotice] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(() => viewFromUrl(location.href));
  // Set when the gate closes, so focus lands on the view's heading instead of <body>.
  const [arrived, setArrived] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (arrived && !gate) heading.current?.focus();
  }, [arrived, gate]);

  useEffect(() => {
    const onAdd = () => setGate(true);
    addEventListener(ADD_KEY_EVENT, onAdd);
    return () => removeEventListener(ADD_KEY_EVENT, onAdd);
  }, []);

  useEffect(() => {
    const onPop = () => setView(viewFromUrl(location.href));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  async function onForget() {
    setNotice(undefined);
    if (status.kind === 'runner') {
      setBusy(true);
      const r = await deleteKey();
      setBusy(false);
      if (!r.ok) {
        setNotice(r.message);
        setGate(true);
        return;
      }
    }
    forget();
    setGate(true);
  }

  const leaveGate = () => {
    setGate(false);
    setArrived(true);
  };
  const browse = () => {
    rememberBrowsing();
    leaveGate();
  };
  // The notice is the shell's, not a Validate failure, so the key field is not marked invalid.
  if (gate) {
    return (
      <>
        {notice !== undefined && (
          <div role="alert" data-testid="forget-notice" className="mx-auto mt-6 w-[calc(100%-2rem)] max-w-[480px] rounded-sm border border-danger bg-canvas p-3">
            <p className="font-medium text-danger">The local runner did not forget the key.</p>
            <p className="mt-2 font-mono text-xs break-words text-ink-muted">{notice}</p>
          </div>
        )}
        <KeyGate surface={surface} onDone={leaveGate} onBrowse={browse} />
      </>
    );
  }

  // The local-run panel shows on browser-direct only; the Overview intro card reads the same fact.
  const localRun = surface.kind === 'browser-direct';
  return (
    <div className="flex h-screen flex-col bg-canvas">
      <TopBar surface={surface} status={status} onForget={onForget} onAdd={() => setGate(true)} busy={busy} />
      <div className="flex min-h-0 flex-1">
        <Rail
          active={view}
          onNavigate={(id) => {
            // popstate, as data/url.ts navigate() sends it: the shell sets the view, and every
            // other reader of the URL (Runs, the trial detail) reads it again, even when the view
            // stays the same (verifier-phase-P16-1 N2).
            history.pushState(null, '', viewHref(location.href, id));
            dispatchEvent(new PopStateEvent('popstate'));
          }}
        />
        <main className="min-w-0 flex-1 overflow-auto">
          <ErrorBoundary key={view.id}>
            <ViewBody id={view.id} headingRef={heading} localRun={localRun} />
          </ErrorBoundary>
          {localRun && RUN_PANEL_VIEWS.includes(view.id) && <LocalRunPanel id={LOCAL_RUN_PANEL_ID} surface={surface} className="mx-auto mb-6 w-[calc(100%-3rem)] max-w-[720px]" />}
        </main>
      </div>
    </div>
  );
}
