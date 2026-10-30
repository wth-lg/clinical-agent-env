import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BUTTON_PRIMARY } from '../data/ui.tsx';

// Catches an error a view throws while it renders, so the rail and the top bar stay and the other
// views still open; the shell keys it by view, so moving to another view clears it.
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
        <h1 className="text-base font-semibold text-danger">This view stopped with an error</h1>
        <p className="mt-2 break-words text-ink-muted">{this.state.error.message}</p>
        <p className="mt-2 text-ink-muted">The other views still work. Reload the page to try this one again.</p>
        <button type="button" onClick={() => location.reload()} className={`${BUTTON_PRIMARY} mt-3`}>Reload</button>
      </section>
    );
  }
}
