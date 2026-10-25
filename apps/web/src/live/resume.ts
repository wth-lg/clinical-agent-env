// Browser-direct resume (design section 1, "Tab close or reload"): a trial the reload cut off is
// run again from its checkpoint, the events IndexedDB kept. The checkpoint's responses answer the
// loop's first requests without a call, so the loop rebuilds the same state through the same
// tools, then re-sends the request that had no answer and goes on live. Every event the resumed
// run emits inside the checkpoint must equal the kept one (timestamps aside), state hashes
// included; the first that differs stops the trial. run() itself is unchanged: this is only a
// TrialClient.
import type { CallResult, Message } from '../../../../packages/core/anthropic.ts';
import type { ResponseEvent, TrialEvent, UsageEvent } from '../../../../packages/core/events.ts';
import type { TrialClient } from '../../../../packages/core/loop.ts';

const withoutTs = ({ ts: _ts, ...rest }: TrialEvent) => JSON.stringify(rest);

export const sameEvent = (a: TrialEvent, b: TrialEvent): boolean => withoutTs(a) === withoutTs(b);

// The kept answers in order, each with what the ledger settled for it (the usage totals' step).
export function keptAnswers(checkpoint: readonly TrialEvent[]): Array<{ result: CallResult; settled: number }> {
  const out: Array<{ result: CallResult; settled: number }> = [];
  let total = 0;
  for (let i = 0; i < checkpoint.length; i++) {
    const r = checkpoint[i]!;
    if (r.type !== 'response') continue;
    const usage = checkpoint.slice(i + 1).find((e): e is UsageEvent => e.type === 'usage');
    if (usage === undefined) break;
    // The loop adds each settle to its total, so the priced cost, when it gives the kept total
    // exactly, keeps the totals byte-equal; a retried call's settles are one step.
    const settled = r.cost_usd !== null && total + r.cost_usd === usage.cost_usd ? r.cost_usd : usage.cost_usd - total;
    out.push({ result: callResult(r), settled });
    total = usage.cost_usd;
  }
  return out;
}

function callResult(r: ResponseEvent): CallResult {
  const message: Message = { id: r.id, model: r.model, role: 'assistant', content: r.content, stop_reason: r.stop_reason, usage: r.usage, ...(r.stop_details === null ? {} : { stop_details: r.stop_details }) };
  const d = r.stop_details as { category?: string | null; explanation?: string | null } | null;
  const refusal = r.stop_reason === 'refusal' ? { category: d?.category ?? null, explanation: d?.explanation ?? null } : null;
  return { status: 200, message, refusal, attempts: r.attempts };
}

// Answers the first sends from the checkpoint, then sends through `live`.
export function resumeClient(live: TrialClient, checkpoint: readonly TrialEvent[]): TrialClient {
  const kept = keptAnswers(checkpoint);
  let n = 0;
  return {
    async send(history, params, opts) {
      const k = kept[n++];
      if (k === undefined) return live.send(history, params, opts);
      opts?.onSettle?.(k.settled);
      // As MessagesClient does: an answer that is not a refusal joins the conversation.
      if (k.result.refusal === null) history.push({ role: 'assistant', content: k.result.message.content });
      return k.result;
    },
  };
}
