// Browser-direct resume (design section 1, "Tab close or reload"): a trial the reload cut off is
// run again from its checkpoint, the events IndexedDB kept. The checkpoint's responses answer the
// loop's first requests without a call, so the loop rebuilds the same state through the same
// tools, then re-sends the request that had no answer and goes on live. Every event the resumed
// run emits inside the checkpoint must equal the kept one (timestamps aside), state hashes
// included; the first that differs stops the trial. To run() this is only a TrialClient and the
// resumed option, so the record says the trial was resumed. The request the reload cut off was
// sent and is paid for: the tab ledger settles it at its worst case (closeOrphans), and the
// resumed record's cost_usd counts that too (cutOffUsd).
import type { CallResult, Message } from '../../../../packages/core/anthropic.ts';
import type { ResponseEvent, TrialEvent, UsageEvent } from '../../../../packages/core/events.ts';
import type { LedgerRow } from '../../../../packages/core/ledger.ts';
import type { TrialClient } from '../../../../packages/core/loop.ts';
import type { RunOptions } from '../../../../packages/core/run.ts';

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

const µ = (usd: number) => Math.round(usd * 1e6);

// What the loop calls a reload cut off cost: the tab ledger's settles for the trial beyond the
// loop total its kept events reach. Once the loop had ended (its final hash is kept), a call the
// reload cut off was a judge call, which the resumed run makes again and counts as its own.
export function cutOffUsd(rows: readonly LedgerRow[], trialId: string, checkpoint: readonly TrialEvent[]): number {
  if (checkpoint.some((e) => e.type === 'state_hash' && e.at === 'final')) return 0;
  const settled = rows.filter((r) => r.kind === 'settle' && r.trial === trialId).reduce((a, r) => a + µ(r.cost_usd), 0);
  const kept = checkpoint.findLast((e): e is UsageEvent => e.type === 'usage')?.cost_usd ?? 0;
  return Math.max(0, settled - µ(kept)) / 1e6;
}

// The run() options of a trial from its checkpoint: the resume client and the cut-off cost, or
// the live client as it is when nothing was kept.
export function resumeOptions(live: TrialClient, checkpoint: readonly TrialEvent[], cutOff: number): Pick<RunOptions, 'client' | 'resumed'> {
  return checkpoint.length > 0 ? { client: resumeClient(live, checkpoint), resumed: { cutOffUsd: cutOff } } : { client: live };
}
