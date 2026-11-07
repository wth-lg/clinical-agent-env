// summary --require band-or-disclosed (P25c fix, the user's accept-and-disclose decision of
// 2026-11-06T17:27Z): an out-of-band task passes only when results/tasks-final.json holds a
// disclosure that names the task, its verdict, the decision and its date, and the writeup's
// generated pass-rates block marks the task with that verdict and disclosure. band= is not
// weakened: it still exits 1 on the same run.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../packages/core/anthropic.ts';
import { disclosedVerdictText, type Disclosure } from '../../packages/core/disclosure.ts';
import { main as summary } from '../summary.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { writeFixtureRun, type Fixture } from './run-fixtures.ts';

const DISCLOSURE: Disclosure = { verdict: 'Above band', decision: 'accept and disclose', decided_by: 'user', date: '2026-11-06', source: 'decisions.tsv 2026-11-06T17:27Z' };

// A results root: the run, a freeze that holds the given disclosures, and a writeup whose
// pass-rates block marks each task with the given verdict cell.
function root(fixture: Fixture, disclosures: Record<string, Disclosure>, cells: Record<string, string>): { dir: string; run: string; freeze: string; writeup: string } {
  const dir = tempDir(`disclosed-${fixture}`);
  const run = join(dir, 'results/runs/final-1');
  writeFixtureRun(run, fixture);
  const freeze = join(dir, 'results/tasks-final.json');
  const tasks = Object.fromEntries(['t-alpha', 't-beta'].map((id) => [id, { task_version: `v-${id}`, ...(disclosures[id] ? { disclosure: disclosures[id] } : {}) }]));
  writeFileSync(freeze, JSON.stringify({ schema_version: 1, tasks }));
  const writeup = join(dir, 'writeup.html');
  writeFileSync(writeup, writeupWith(cells));
  return { dir, run, freeze, writeup };
}

// The pass-rates block as scripts/docs-gen.ts renders a row: the id in a row header, the verdict
// cell with its numbers wrapped (nowrapNumbers), so the check reads text, not markup.
const writeupWith = (cells: Record<string, string>) =>
  `<html><body><!-- docs-gen:begin pass-rates -->\n<table><tbody>\n${Object.entries(cells).map(([id, cell]) => `<tr><th scope="row">${id}</th><td><span class="nw">8/10</span></td><td>${cell.replace(/(\S*\d\S*)/g, '<span class="nw">$1</span>')}</td></tr>`).join('\n')}\n<tr><th scope="row">t-alpha <span class="nw">v1</span> (superseded, not counted)</th><td>x</td><td>Above band</td></tr>\n</tbody></table>\n<!-- docs-gen:end pass-rates --></body></html>`;

async function cli(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await summary(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n'), json: args.includes('--json') && out.length > 0 ? (JSON.parse(out.at(-1)!) as { violations: string[]; disclosed?: Record<string, Disclosure>; requirements: Record<string, unknown> }) : null };
}

const MARK = disclosedVerdictText('Above band', DISCLOSURE);

describe('summary --require band-or-disclosed', () => {
  it('passes an out-of-band task that is disclosed and marked, and lists the disclosure in its JSON; band= still exits 1', async () => {
    const r = root('eight-of-ten', { 't-alpha': DISCLOSURE }, { 't-alpha': MARK, 't-beta': 'In band' });
    const ok = await cli([r.run, '--require', `valid=10,band-or-disclosed=0.2-0.7,model=${MODEL}`, '--freeze', r.freeze, '--writeup', r.writeup, '--json']);
    expect(ok.err).not.toMatch(/violation/);
    expect(ok.code).toBe(0);
    expect(ok.json?.requirements).toEqual({ valid: 10, band_or_disclosed_rate: [0.2, 0.7], model: MODEL });
    expect(ok.json?.disclosed).toEqual({ 't-alpha': DISCLOSURE });
    const strict = await cli([r.run, '--require', 'band=0.2-0.7', '--freeze', r.freeze, '--writeup', r.writeup]);
    expect(strict.code).toBe(1);
    expect(strict.out).toMatch(/violation: t-alpha: 8\/10 passes, outside the band 0.2-0.7 of its valid trials/);
  });

  it('fails an out-of-band task with no disclosure record', async () => {
    const r = root('eight-of-ten', {}, { 't-alpha': 'Above band', 't-beta': 'In band' });
    const x = await cli([r.run, '--require', 'band-or-disclosed=0.2-0.7', '--freeze', r.freeze, '--writeup', r.writeup]);
    expect(x.code).toBe(1);
    expect(x.out).toMatch(/violation: t-alpha: 8\/10 passes, outside the band 0.2-0.7 of its valid trials, and .*tasks-final\.json holds no disclosure for it/);
  });

  it('fails a disclosure for a task that is in the band as stale', async () => {
    const r = root('clean', { 't-alpha': { ...DISCLOSURE, verdict: 'In band' } }, { 't-alpha': 'In band', 't-beta': 'In band' });
    const x = await cli([r.run, '--require', 'band-or-disclosed=0.2-0.7', '--freeze', r.freeze, '--writeup', r.writeup]);
    expect(x.code).toBe(1);
    expect(x.out).toMatch(/violation: t-alpha: 5\/10 passes, inside the band 0.2-0.7 of its valid trials, but .*tasks-final\.json holds a disclosure for it \(stale: remove it\)/);
  });

  it('fails a disclosure whose verdict is not the task\'s current verdict as stale', async () => {
    const r = root('eight-of-ten', { 't-alpha': { ...DISCLOSURE, verdict: 'Saturated' } }, { 't-alpha': disclosedVerdictText('Saturated', DISCLOSURE), 't-beta': 'In band' });
    const x = await cli([r.run, '--require', 'band-or-disclosed=0.2-0.7', '--freeze', r.freeze, '--writeup', r.writeup]);
    expect(x.code).toBe(1);
    expect(x.out).toMatch(/violation: t-alpha: the disclosure in .*tasks-final\.json names the verdict Saturated, but the task's verdict is Above band \(stale\)/);
  });

  it('fails when the writeup\'s pass-rates block does not mark the disclosed task with its verdict and disclosure', async () => {
    for (const cell of ['Above band', 'Saturated (disclosed: user decision 2026-11-06)', '']) {
      const r = root('eight-of-ten', { 't-alpha': DISCLOSURE }, cell === '' ? { 't-beta': 'In band' } : { 't-alpha': cell, 't-beta': 'In band' });
      const x = await cli([r.run, '--require', 'band-or-disclosed=0.2-0.7', '--freeze', r.freeze, '--writeup', r.writeup]);
      expect(x.code, cell).toBe(1);
      expect(x.out, cell).toMatch(new RegExp(`violation: t-alpha: disclosed, but the pass-rates block of .*writeup\\.html does not mark it "${MARK.replace(/[()]/g, '\\$&')}"`));
    }
  });

  it('fails on a malformed disclosure, and on a missing freeze or writeup file', async () => {
    const bad = root('eight-of-ten', { 't-alpha': { ...DISCLOSURE, date: '6 Nov' } }, { 't-alpha': MARK });
    const x = await cli([bad.run, '--require', 'band-or-disclosed=0.2-0.7', '--freeze', bad.freeze, '--writeup', bad.writeup]);
    expect(x.code).toBe(1);
    expect(x.out).toMatch(/violation: .*tasks-final\.json: tasks\.t-alpha\.disclosure\.date must be a YYYY-MM-DD date/);
    const r = root('eight-of-ten', { 't-alpha': DISCLOSURE }, { 't-alpha': MARK });
    const noFreeze = await cli([r.run, '--require', 'band-or-disclosed=0.2-0.7', '--freeze', join(r.dir, 'none.json'), '--writeup', r.writeup]);
    expect(noFreeze.code).toBe(1);
    expect(noFreeze.out).toMatch(/violation: .*none\.json: missing/);
    const noWriteup = await cli([r.run, '--require', 'band-or-disclosed=0.2-0.7', '--freeze', r.freeze, '--writeup', join(r.dir, 'none.html')]);
    expect(noWriteup.code).toBe(1);
    expect(noWriteup.out).toMatch(/violation: t-alpha: disclosed, but .*none\.html: missing/);
  });

  it('refuses band and band-or-disclosed together, and takes the counts form too', async () => {
    const r = root('eight-of-ten', { 't-alpha': DISCLOSURE }, { 't-alpha': MARK, 't-beta': 'In band' });
    const both = await cli([r.run, '--require', 'band=0.2-0.7,band-or-disclosed=0.2-0.7']);
    expect(both.code).toBe(2);
    expect(both.err).toMatch(/give band or band-or-disclosed, not both/);
    const counts = await cli([r.run, '--require', 'band-or-disclosed=2-7', '--freeze', r.freeze, '--writeup', r.writeup, '--json']);
    expect(counts.code).toBe(0);
    expect(counts.json?.requirements).toEqual({ band_or_disclosed: [2, 7] });
  });

  it('an in-band run needs no record and no file: the freeze and writeup are read only for an out-of-band task', async () => {
    const r = root('clean', {}, {});
    writeFileSync(r.freeze, JSON.stringify({ schema_version: 1, tasks: {} }));
    const ok = await cli([r.run, '--require', 'band-or-disclosed=0.2-0.7', '--freeze', r.freeze, '--writeup', join(r.dir, 'none.html'), '--json']);
    expect(ok.code).toBe(0);
    expect(ok.json?.disclosed).toEqual({});
    expect(readFileSync(r.freeze, 'utf8')).toContain('"tasks":{}');
  });
});
