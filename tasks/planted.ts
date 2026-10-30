// Every task's id registry (tasks/<id>/ids.ts) by task id, as world ids: what each overlay planted
// in the shared world. World ids are neutral (obs-03462), so this is the only way to tell a
// planted resource from a base or setting one; the web's Chart tab and the tool tests that leave
// planted rows out read it here.
import { IDS as T5 } from './contrast-ct-prep/ids.ts';
import { IDS as T3 } from './crc-care-gap/ids.ts';
import { IDS as T4 } from './discharge-medrec/ids.ts';
import { IDS as T6 } from './message-queue/ids.ts';
import { IDS as T1 } from './renal-dose-review/ids.ts';
import { IDS as T2 } from './results-inbox/ids.ts';

export const PLANTED: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  Object.entries({ 'renal-dose-review': T1, 'results-inbox': T2, 'crc-care-gap': T3, 'discharge-medrec': T4, 'contrast-ct-prep': T5, 'message-queue': T6 }).map(
    ([task, ids]) => [task, new Set<string>(Object.values(ids))],
  ),
);

const ALL = new Set(Object.values(PLANTED).flatMap((ids) => [...ids]));

// Whether a world id (obs-03462, or Type/id) is one a task overlay planted.
export const isPlanted = (id: string | undefined): boolean => id !== undefined && ALL.has(id.slice(id.indexOf('/') + 1));
