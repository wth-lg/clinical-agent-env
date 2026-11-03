// A regrade stores the attribution of the grade it computes (builder-292, coordinator at the
// handshake): classes, result-card (through classes) and summary read a record's labels from its
// current grade (summary.ts currentGrade), so a FAIL that stays a FAIL under a grader fix does not
// keep the labels of the grade it replaced. The fixture is pilot-4a crc-care-gap/0 (results/pilot-4a
// at 4f11a36d): recorded at grader 18 as a missed arrival (event_seen -> retrieval); at grader 19
// (G1) the arrival was read and the base screening review never completed, so fit_orders ->
// retrieval, and the trial saw every arrival.
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { explainTrial, type ExplainRecord } from '../../packages/core/explain.ts';
import { parseTrajectory } from '../../packages/core/trajectory.ts';
import { GRADER_VERSION } from '../../packages/grader/grade.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as classes, type ClassesJson } from '../classes.ts';
import { main as regrade } from '../regrade.ts';

const FIXTURE = join(import.meta.dirname, 'fixtures/pilot-4a-crc0');
// The fixture is a historical run (ruling R37): it regrades only on the world it ran on. On a
// checkout whose world differs (a later overlay moved it, R40; W5-E builder-299), regrade refuses it
// with the named world-mismatch error and writes nothing, and classes still reads the stored
// attribution; the regrade's own assertions run where the world is the record's.
const CHECKOUT_WORLD = (JSON.parse(readFileSync(join(import.meta.dirname, '../../fixtures/manifest.json'), 'utf8')) as { world: { state_hash: string } }).world.state_hash;
const FIXTURE_WORLD = (JSON.parse(readFileSync(join(FIXTURE, 'trials/crc-care-gap/0.json'), 'utf8')) as { state_hash: { initial: string } }).state_hash.initial;
const MACGYVER = 'Patient/pt-0024';

async function cli(main: (args: string[], deps: { out: (l: string) => void; err: (l: string) => void }) => Promise<number>, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('regrade stores the new grade\'s attribution; classes reads it', () => {
  it('pilot-4a crc-care-gap/0 at grader 19: fit_orders -> retrieval, not event_seen; q 1/1', async () => {
    const dir = join(tempDir('regrade-attribution'), 'pilot-4a');
    cpSync(FIXTURE, dir, { recursive: true });
    const before = await cli(classes, [dir, '--json']);
    expect(before.code).toBe(0);
    const labelsOf = (j: ClassesJson) => j.tasks['crc-care-gap']!.classes.flatMap((c) => c.labels).filter((l) => l.item === MACGYVER).map((l) => `${l.gate} -> ${l.label}`);
    expect(labelsOf(JSON.parse(before.out))).toEqual(['event_seen -> retrieval']);

    const r = await cli(regrade, [dir, '--grader-version', GRADER_VERSION]);
    if (CHECKOUT_WORLD !== FIXTURE_WORLD) {
      // R37/R38(c): a historical run on another world is refused by name, never regraded.
      expect(r.code).toBe(1);
      expect(`${r.out}\n${r.err}`).toMatch(/crc-care-gap\/0: environment changed: .*world mismatch: run at [0-9a-f]+, checkout at [0-9a-f]+; reproduce at the commit in results\/pilot-4a\/README\.md/);
      const after = await cli(classes, [dir, '--json']);
      expect(after.code).toBe(0);
      expect(labelsOf(JSON.parse(after.out))).toEqual(['event_seen -> retrieval']);
      return;
    }
    expect([r.code, r.err]).toEqual([0, '']);
    const rec = JSON.parse(readFileSync(join(dir, 'trials/crc-care-gap/0.json'), 'utf8')) as { outcome: string; regrades: Array<{ outcome: string; changed: boolean; attribution?: { auto: string; first_failed: string; items?: Array<{ item: string; gate: string; auto: string }> } | null }> };
    const last = rec.regrades.at(-1)!;
    expect([rec.outcome, last.outcome, last.changed]).toEqual(['FAIL', 'FAIL', false]);
    expect(last.attribution).toMatchObject({ auto: 'retrieval', first_failed: 'fit_orders' });
    expect(last.attribution!.items!.map((i) => [i.item, i.gate, i.auto])).toEqual([[MACGYVER, 'fit_orders', 'retrieval']]);

    const after = JSON.parse((await cli(classes, [dir, '--json'])).out) as ClassesJson;
    expect(labelsOf(after)).toEqual(['fit_orders -> retrieval']);
    expect(after.tasks['crc-care-gap']!.q).toMatchObject({ trials: 1, seen_all: 1 });

    // verifier-phase-P17i-S0-208-1 S1: explainTrial, which the trial page, the failures and runs
    // views and audit-check read, gives the current grade's kind of failure too, not none.
    const record = JSON.parse(readFileSync(join(dir, 'trials/crc-care-gap/0.json'), 'utf8')) as ExplainRecord;
    const events = parseTrajectory(readFileSync(join(dir, 'trajectories/crc-care-gap/0.jsonl'), 'utf8'));
    const e = explainTrial(record, null, { events });
    expect([e.fault, e.taxonomy]).toEqual(['model', 'retrieval']);
  });
});
