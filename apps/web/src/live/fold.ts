// What the live view shows, folded from a trial's TrialEvents alone: the trajectory (summarised
// thinking, text, one row per tool call), the meters, the state diff and how it ended. Pure.
import type { TrialEvent } from '../../../../packages/core/events.ts';
import type { TrialRecord } from '../../../../packages/core/run.ts';

export type Item =
  | { kind: 'thinking' | 'text'; key: string; text: string }
  | { kind: 'tool'; key: string; name: string; target: string; input: unknown; result: unknown; done: boolean; error: string | null; written: string[]; executed: boolean };

export interface Folded {
  items: Item[];
  turn: number;
  tokens: { input: number; output: number; cache_read: number; cache_write: number };
  cost: number;
  hashes: { initial: string | null; latest: string | null; final: string | null };
  written: string[];
  // The event that ended the episode (limit, error, cancelled), and the graded record.
  end: Extract<TrialEvent, { type: 'limit' | 'error' | 'cancelled' }> | null;
  record: TrialRecord | null;
}

// The resource a call is about: its patient or id, else its first short string input.
function target(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const o = input as Record<string, unknown>;
  for (const k of ['patient', 'id', 'resource', 'medication_request', 'query']) if (typeof o[k] === 'string') return o[k] as string;
  const first = Object.values(o).find((v): v is string => typeof v === 'string' && v.length <= 60);
  return first ?? '';
}

export function fold(events: readonly TrialEvent[]): Folded {
  const out: Folded = { items: [], turn: 0, tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 }, cost: 0, hashes: { initial: null, latest: null, final: null }, written: [], end: null, record: null };
  const tools = new Map<string, Extract<Item, { kind: 'tool' }>>();
  for (const e of events) {
    out.turn = Math.max(out.turn, e.turn);
    switch (e.type) {
      case 'response':
        e.content.forEach((b, i) => {
          const block = b as { type: string; thinking?: string; text?: string };
          if (block.type === 'thinking' && block.thinking) out.items.push({ kind: 'thinking', key: `${e.seq}.${i}`, text: block.thinking });
          if (block.type === 'text' && block.text) out.items.push({ kind: 'text', key: `${e.seq}.${i}`, text: block.text });
        });
        break;
      case 'usage':
        out.tokens = { input: e.total.input, output: e.total.output, cache_read: e.total.cache_read, cache_write: e.total.cache_write };
        out.cost = e.cost_usd;
        break;
      case 'tool_call': {
        const item: Extract<Item, { kind: 'tool' }> = { kind: 'tool', key: e.tool_use_id, name: e.name, target: target(e.input), input: e.input, result: null, done: false, error: null, written: [], executed: true };
        tools.set(e.tool_use_id, item);
        out.items.push(item);
        break;
      }
      case 'tool_result': {
        const item = tools.get(e.tool_use_id);
        if (item) Object.assign(item, { result: e.content, done: true, executed: e.executed, error: e.is_error ? (e.error_code ?? 'error') : null, written: e.written_ids ?? [] });
        for (const id of e.written_ids ?? []) if (!out.written.includes(id)) out.written.push(id);
        break;
      }
      case 'state_hash':
        if (e.at === 'initial') out.hashes.initial = e.hash;
        if (e.at === 'final') out.hashes.final = e.hash;
        if (e.at !== 'replay_final') out.hashes.latest = e.hash;
        break;
      case 'limit':
      case 'cancelled':
        out.end = e;
        break;
      case 'error':
        out.end = e;
        break;
      case 'graded':
        out.record = e.record;
        break;
    }
  }
  return out;
}
