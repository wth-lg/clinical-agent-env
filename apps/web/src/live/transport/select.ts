// One TrialTransport for the page's surface, which does not change after load: the Live trial
// view runs trials through it, and main.tsx reads the session's committed spend from it (the
// spend meter's source). The shell shows the runner-down screen instead of any view when the
// runner does not answer.
import { sessionCap } from '../../spend/session.ts';
import type { TrialTransport } from '../types.ts';
import { runnerTransport } from './runner.ts';
import { workerTransport } from './worker.ts';

let transport: TrialTransport | undefined;
export const theTransport = (hosted: boolean): TrialTransport => (transport ??= hosted ? workerTransport(sessionCap) : runnerTransport());
