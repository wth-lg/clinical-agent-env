// pnpm cli hosted-call reserve --call-id <id> --usd <worst case>
// pnpm cli hosted-call settle --call-id <id> [--usd <cost>]
// Meters in the Node ledger one live call that a browser makes on the hosted site (plan phase
// P16h's live check: the hosted Validate and trial), which the browser's own tab ledger cannot
// write to the canonical ledger. Run it in the live-run form, so it opens the own-run ledger.
//   reserve  opens a batch with batchStart(<worst case>), which refuses past PROJECTED_CAP_USD,
//            and takes one reserve row of that worst case through reserveSpend. The batch stays
//            open after the command exits: a browser session holds it, not this process.
//   settle   settles the reservation at --usd, else at its worst case, and closes the batch.
// The reserve row's worst case is the smallest the ledger's cost model can express that is at
// least --usd (it differs by under $0.00001); the settle is exact to the micro-dollar. Both are
// idempotent by call_id: the rows carry run_id hosted-call:<id>, and a call_id that is already
// reserved, or already settled and closed, adds no row.
// Exit 0 on success or a repeat; 1 on a ledger refusal; 2 on a usage error.
import { parseArgs } from 'node:util';
import { INPUT_OVERHEAD_TOKENS, PRICE_USD_PER_MTOK, worstCaseUsd, type Usage } from '../packages/core/cost.ts';
import type { LedgerRow, ReserveRequest } from '../packages/core/ledger.ts';
import { openNodeLedger, reserveSpend } from './adapters/ledger-node.ts';

const USAGE = 'usage: pnpm cli hosted-call reserve --call-id <id> --usd <worst case>\n       pnpm cli hosted-call settle --call-id <id> [--usd <cost>]';
const CALL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const µ = (usd: number) => Math.round(usd * 1e6);

// The reserve request whose worst case is the smallest at least `usd`: input bytes only, each at
// the 1-hour cache-write price (worstCaseUsd in packages/core/cost.ts).
export function reserveFor(usd: number, trial: string): ReserveRequest {
  const perByte = PRICE_USD_PER_MTOK.cache_write_1h;
  const bodyBytes = Math.max(0, Math.ceil(µ(usd) / perByte) - INPUT_OVERHEAD_TOKENS);
  return { bodyBytes, maxTokens: 0, trial };
}

// A usage that prices to exactly `usd` (to the micro-dollar): input tokens at $4/MTok, the
// remainder in cache reads at $0.20/MTok (usageCostUsd in packages/core/cost.ts).
export function usageFor(usd: number): Usage {
  const micros = µ(usd);
  const input = Math.floor(micros / PRICE_USD_PER_MTOK.input);
  const rest = micros - input * PRICE_USD_PER_MTOK.input;
  return { input_tokens: input, output_tokens: 0, cache_read_input_tokens: Math.round(rest / PRICE_USD_PER_MTOK.cache_read) };
}

function usage(msg: string): number {
  process.stderr.write(`hosted-call: ${msg}\n${USAGE}\n`);
  return 2;
}

export default async function hostedCall(args: string[]): Promise<number> {
  const [verb, ...rest] = args;
  if (verb !== 'reserve' && verb !== 'settle') return usage(`unknown subcommand ${verb ?? '(none)'}`);
  let values;
  try {
    ({ values } = parseArgs({ args: rest, options: { 'call-id': { type: 'string' }, usd: { type: 'string' } } }));
  } catch (e) {
    return usage((e as Error).message);
  }
  const id = values['call-id'];
  if (id === undefined || !CALL_ID.test(id)) return usage('--call-id must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}');
  const usd = values.usd === undefined ? undefined : Number(values.usd);
  if (usd !== undefined && (!Number.isFinite(usd) || usd <= 0 || values.usd!.trim() === '')) return usage('--usd must be a number > 0');
  if (verb === 'reserve' && usd === undefined) return usage('reserve needs --usd <worst case>');

  const tag = `hosted-call:${id}`;
  let opened;
  try {
    opened = openNodeLedger({ transport: 'live', runId: tag });
  } catch (e) {
    process.stderr.write(`hosted-call: ${(e as Error).message}\n`);
    return 1;
  }
  const { ledger, store, path } = opened;
  const mine = (await store.read()).filter((r) => r.run_id === tag);
  const find = (kind: LedgerRow['kind']) => mine.find((r) => r.kind === kind);
  try {
    if (verb === 'reserve') {
      const done = find('reserve');
      if (done !== undefined) {
        process.stdout.write(`hosted-call: ${id} already reserved at $${done.cost_usd} (call ${done.call_id}); no row added\n`);
        return 0;
      }
      const req = reserveFor(usd!, tag);
      const open = find('open');
      // An open row with no reserve: an earlier reserve stopped between the two rows.
      const res = open?.batch_id
        ? await ledger.reserve(req, open.batch_id)
        : await reserveSpend(await ledger.batchStart(worstCaseUsd(req)), req);
      process.stdout.write(`hosted-call: reserved ${id} at its worst case $${res.worst_usd} (call ${res.call_id}, batch ${res.batch_id}) in ${path}\n`);
      return 0;
    }
    const reserve = find('reserve');
    if (reserve === undefined) {
      process.stderr.write(`hosted-call: ${id} has no reservation in ${path}; run hosted-call reserve first\n`);
      return 1;
    }
    const settled = mine.some((r) => r.kind === 'settle' && r.call_id === reserve.call_id);
    const closed = mine.some((r) => r.kind === 'close' && r.batch_id === reserve.batch_id) || reserve.batch_id === null;
    if (settled && closed) {
      process.stdout.write(`hosted-call: ${id} already settled and closed; no row added\n`);
      return 0;
    }
    if (!settled) {
      await ledger.settle({ call_id: reserve.call_id, batch_id: reserve.batch_id, trial: reserve.trial, worst_usd: reserve.cost_usd }, usd === undefined ? null : usageFor(usd));
    }
    if (reserve.batch_id !== null) await ledger.close(reserve.batch_id, { force: `hosted-call settle ${id}: the batch was held by a browser session, not by a process` });
    process.stdout.write(`hosted-call: settled ${id} at ${usd === undefined ? `its worst case $${reserve.cost_usd}` : `$${usd}`} and closed its batch in ${path}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`hosted-call: ${(e as Error).message}\n`);
    return 1;
  }
}
