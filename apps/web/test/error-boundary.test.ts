// A view that throws while it renders (ui-polish 5.5): the error boundary shows a plain lead
// first, then a primary Reload, then the raw message inside a closed "Show details". The server
// renderer does not run error boundaries, so the test takes the state React would derive from the
// child's throw and renders the boundary in it.
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// The root tsconfig, which checks apps/web/test, has no JSX and no DOM, so the boundary is imported
// by a path tsc does not follow; vitest compiles it as the app does.
interface Boundary { state: { error: Error | null }; render(): ReactNode }
const PATH = '../src/shell/ErrorBoundary.tsx';
const { ErrorBoundary } = (await import(PATH)) as { ErrorBoundary: { new (props: { children: ReactNode }): Boundary; getDerivedStateFromError(e: unknown): { error: Error } } };

function Throws(): never {
  throw new Error('records.ts: cannot read trial 7 (unexpected token)');
}

function caught(): Error {
  try {
    Throws();
  } catch (e) {
    return ErrorBoundary.getDerivedStateFromError(e).error;
  }
}

describe('ErrorBoundary', () => {
  it('shows the lead, a Reload button and the raw message inside details', () => {
    const boundary = new ErrorBoundary({ children: createElement(Throws) });
    boundary.state = { error: caught() };
    const html = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="view-error"');
    // In reading order: the lead, then Reload, then details.
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const lead = text.indexOf('Something went wrong on this page. The other pages still work.');
    expect(lead).toBeGreaterThan(-1);
    expect(text.indexOf('Reload', lead)).toBeGreaterThan(lead);
    expect(text.indexOf('Show details')).toBeGreaterThan(text.indexOf('Reload', lead));
    expect(html).toMatch(/<button[^>]*class="[^"]*bg-primary[^"]*"[^>]*>(<[^>]+>)*Reload/);
    const details = html.indexOf('<details');
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Show details<\/summary>.*records\.ts: cannot read trial 7 \(unexpected token\).*<\/details>/s);
    // The raw message shows only inside details, after the lead.
    expect(html.indexOf('records.ts: cannot read')).toBeGreaterThan(details);
    expect(html).not.toMatch(/<details[^>]* open/);
  });
});
