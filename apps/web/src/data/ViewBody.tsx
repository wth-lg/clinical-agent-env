// The view the shell shows for ?view=: each rail view, and the glossary its fault labels link to.
// Each is its own chunk, loaded when first shown.
import { lazy, Suspense, type Ref } from 'react';

type Body = (p: { headingRef?: Ref<HTMLHeadingElement> | undefined }) => React.JSX.Element;
const BODIES: Record<string, React.LazyExoticComponent<Body>> = {
  overview: lazy(() => import('../overview/Overview.tsx').then((m) => ({ default: m.Overview }))),
  tasks: lazy(() => import('../tasks/Tasks.tsx').then((m) => ({ default: m.Tasks }))),
  runs: lazy(() => import('../runs/Runs.tsx').then((m) => ({ default: m.Runs }))),
  findings: lazy(() => import('../findings/Findings.tsx').then((m) => ({ default: m.Findings }))),
  environment: lazy(() => import('../environment/Environment.tsx').then((m) => ({ default: m.Environment }))),
  glossary: lazy(() => import('../glossary/Glossary.tsx').then((m) => ({ default: m.Glossary }))),
};

export function ViewBody({ id, headingRef }: { id: string; headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const Body = BODIES[id] ?? BODIES.overview!;
  return (
    <Suspense fallback={<p className="px-6 py-6 text-ink-muted">Loading…</p>}>
      <Body headingRef={headingRef} />
    </Suspense>
  );
}
