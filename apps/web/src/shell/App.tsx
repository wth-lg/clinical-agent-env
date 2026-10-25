import { useEffect, useRef, useState } from 'react';
import { KeyGate } from '../keygate/KeyGate.tsx';
import { forget, keyStatus, useKeyStatus } from '../keygate/key.ts';
import { deleteKey } from '../keygate/runner.ts';
import type { Surface } from '../surface/detect.ts';
import { LocalRunPanel } from '../surface/LocalRunPanel.tsx';
import { ViewBody } from '../data/ViewBody.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { Rail } from './Rail.tsx';
import { TopBar } from './TopBar.tsx';
import { viewFromUrl, viewHref } from './views.ts';

// The app shell: the key gate first when there is no key, then the rail, the top bar and the
// view named in ?view=.
export function App({ surface }: { surface: Surface }) {
  const status = useKeyStatus();
  const [gate, setGate] = useState(() => keyStatus().kind === 'none');
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
        <KeyGate surface={surface} onDone={leaveGate} onBrowse={leaveGate} />
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <TopBar surface={surface} status={status} onForget={onForget} onAdd={() => setGate(true)} busy={busy} />
      <div className="flex min-h-0 flex-1">
        <Rail
          active={view}
          onNavigate={(id) => {
            history.pushState(null, '', viewHref(location.href, id));
            setView(viewFromUrl(location.href));
          }}
        />
        <main className="min-w-0 flex-1 overflow-auto">
          <ErrorBoundary key={view.id}>
            <ViewBody id={view.id} headingRef={heading} />
          </ErrorBoundary>
          {surface.kind === 'browser-direct' && <LocalRunPanel surface={surface} className="mx-auto mb-6 w-[calc(100%-3rem)] max-w-[720px]" />}
        </main>
      </div>
    </div>
  );
}
