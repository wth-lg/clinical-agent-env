import { CircleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BUTTON_PRIMARY, Notice } from '../data/ui.tsx';

// Catches an error a view throws while it renders, so the rail and the top bar stay and the other
// views still open; the shell keys it by view, so moving to another view clears it. A plain lead
// first, then Reload, then the raw message behind "Show details" (ui-polish 5.5).
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    if (this.state.error === null) return this.props.children;
    return (
      <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6" data-testid="view-error" role="alert">
        <Notice tone="danger" icon={CircleAlert} detail={this.state.error.message} action={<button type="button" onClick={() => location.reload()} className={BUTTON_PRIMARY}>Reload</button>}>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Something went wrong on this page.</h1>
          <p className="mt-1.5">The other pages still work. Reload to try this one again.</p>
        </Notice>
      </section>
    );
  }
}
