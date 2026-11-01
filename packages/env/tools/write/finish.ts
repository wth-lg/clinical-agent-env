// finish (design section 3): ends the trial with the agent's summary. It writes no resource
// and consumes no write sequence number; the loop stops after it (an end_turn with no tool
// use also ends a trial). Once the session has a summary the episode is over: writeTool answers
// a second finish, and any write after it, with CONFLICT. While a mid-trial event fired in the same
// model turn (packages/env/events.ts), finish answers CONFLICT and the episode goes on, so the model
// always gets a turn after an arrival.
import { firedThisTurn, FINISH_GUARD_MESSAGE } from '../../events.ts';
import { ToolError } from '../errors.ts';
import { text } from './schema.ts';
import { writeTool } from './tool.ts';

export const finish = writeTool({
  name: 'finish',
  description: 'End the work with a short summary of what you did. Call it once, when everything is done: no write is accepted after it.',
  inputSchema: { type: 'object', properties: { summary: text('Summary of the work', 20_000) }, required: ['summary'], additionalProperties: false },
  run(input: { summary: string }, { session }) {
    if (firedThisTurn(session)) throw new ToolError('CONFLICT', FINISH_GUARD_MESSAGE);
    session.summary = input.summary;
    return { ok: true };
  },
});
