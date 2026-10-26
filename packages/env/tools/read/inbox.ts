// list_inbox (design section 3): the work queues, backed by Tasks whose code is
// INBOX_QUEUE_SYSTEM|<queue>. Rows are pointers: a one-line summary and status, with the
// result or message to act on left in the focus, so the Task, its focus and patient are
// referenced, not exposed (the exposure rule, registry.ts). Each row names its owner, and the
// default lists only the signed-in user's items, so an item reassigned away leaves the user's
// list (P17j JT1, pre-audit S10).
import type { Task } from '@medplum/fhirtypes';
import { STAFF } from '../../world.ts';
import type { Tool } from '../registry.ts';
import { INBOX_QUEUE_SYSTEM, INBOX_QUEUES, type ReadContext } from './context.ts';
import { page } from './page.ts';
import { count, FHIR_ID, offset } from './schema.ts';

// The signed-in user (get_context reports the same practitioner).
const USER = `Practitioner/${STAFF[0]}`;

// FHIR R4 Task.status.
const TASK_STATUSES = [
  'draft', 'requested', 'received', 'accepted', 'rejected', 'ready', 'cancelled', 'in-progress', 'on-hold', 'failed', 'completed', 'entered-in-error',
] as const;

// Received instant; an item without a parseable one sorts last.
const received = (t: Readonly<Task>) => {
  const ms = t.authoredOn === undefined ? NaN : Date.parse(t.authoredOn);
  return Number.isNaN(ms) ? Infinity : ms;
};

export const listInbox: Tool<ReadContext> = {
  name: 'list_inbox',
  description:
    'List a work queue: results or messages. Returns {task, focus, patient, received, from, summary, status, owner} rows, oldest first, ties by id. ' +
    "By default lists only items the signed-in user owns; owner lists another owner's items instead (e.g. Group/pool-oncall after a reassign). " +
    'status filters by Task status (e.g. requested for open items).',
  inputSchema: {
    type: 'object',
    properties: {
      queue: { type: 'string', description: 'Queue to list', enum: INBOX_QUEUES },
      status: { type: 'string', description: 'Task status', enum: TASK_STATUSES },
      owner: {
        type: 'string',
        description: "Owner reference, a Practitioner or Group, e.g. 'Group/pool-oncall' (default: the signed-in user)",
        pattern: `^(Practitioner|Group)/${FHIR_ID.slice(1)}`,
      },
      count: count(50, 20),
      offset,
    },
    required: ['queue'],
    additionalProperties: false,
  },
  run(input: { queue: string; status?: string; owner?: string; count?: number; offset?: number }, { world }) {
    const query: Record<string, string> = { code: `${INBOX_QUEUE_SYSTEM}|${input.queue}` };
    if (input.status !== undefined) query.status = input.status;
    const owner = input.owner ?? USER;
    const rows = world.search<Task>('Task', query).resources
      .filter((t) => t.owner?.reference === owner)
      .sort((a, b) => received(a) - received(b) || (a.id! < b.id! ? -1 : a.id! > b.id! ? 1 : 0))
      .map((t) => ({
        task: `Task/${t.id}`,
        focus: t.focus?.reference ?? null,
        patient: t.for?.reference ?? null,
        received: t.authoredOn ?? null,
        from: t.requester?.reference ?? null,
        summary: t.description ?? null,
        status: t.status,
        owner,
      }));
    return page(rows, input.offset ?? 0, input.count ?? 20);
  },
};
