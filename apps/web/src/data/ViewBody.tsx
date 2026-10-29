// The view the shell shows for ?view=: each rail view, and the glossary its fault labels link to.
// The published results and the task list start loading when the app starts, behind the key
// gate, so a view shows them as soon as it opens.
import type { Ref } from 'react';
import { Environment } from '../environment/Environment.tsx';
import { Findings } from '../findings/Findings.tsx';
import { Glossary } from '../glossary/Glossary.tsx';
import { LiveTrial } from '../live/LiveTrial.tsx';
import { Overview } from '../overview/Overview.tsx';
import { Runs } from '../runs/Runs.tsx';
import { Tasks } from '../tasks/Tasks.tsx';
import { loadResults } from './results.ts';
import { loadTaskList } from './tasks.ts';

void loadResults();
loadTaskList().catch(() => undefined);

const BODIES = { overview: Overview, tasks: Tasks, runs: Runs, live: LiveTrial, findings: Findings, environment: Environment, glossary: Glossary } as const;

export function ViewBody({ id, headingRef }: { id: string; headingRef?: Ref<HTMLHeadingElement> | undefined }) {
  const Body = BODIES[id as keyof typeof BODIES] ?? Overview;
  return <Body headingRef={headingRef} />;
}
