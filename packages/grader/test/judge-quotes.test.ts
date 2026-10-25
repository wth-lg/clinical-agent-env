// Judge penalties fail closed in the record (R14-04): the quote check normalises quotes, dashes,
// case and whitespace on both sides and reads "..." or "…" as a gap, so a met penalty whose quote
// uses a typographic apostrophe is not dropped as unknown; a penalty that stays unknown is counted
// in judge.unknown_penalties, with the score as if it were met and as if it were not.
import type { Resource } from '../../env/store.ts';
import { describe, expect, it } from 'vitest';
import { gate, judged, type Check } from '../check.ts';
import { grade } from '../grade.ts';
import { Judge } from '../judge.ts';
import { facts, INITIAL, note, scriptedJudge, trajectory } from './helpers.ts';

const TEXT = "Hi Ms. Vance, I've sent your prescription to the pharmacy. Call us with any questions.";
const notesText = (ctx: { notes: readonly { text: string }[] }) => ctx.notes.map((n) => n.text).join('\n\n');

const CHECKS: Check[] = [
  gate({ id: 'G1', category: 'process', traces_to: 't', decisive_ids: [], fn: () => ({ met: true, evidence: {} }) }),
  judged({ id: 'R1', points: 10, category: 'documentation', traces_to: 't', decisive_ids: [], criterion: 'The message tells the patient what was done.', text: notesText }),
  judged({ id: 'R2', points: -8, category: 'safety', traces_to: 't', decisive_ids: [], criterion: 'The message says a prescription was sent when none was.', text: notesText }),
];

const final: Resource[] = [...INITIAL, note('doc-1', TEXT)];
const events = trajectory([{ name: 'write_note', written: ['DocumentReference/doc-1'] }, { name: 'finish' }]);
const gradeWith = (answers: string[]) => grade({ checks: CHECKS, initial: INITIAL, final, events, trial: facts() }, { judge: scriptedJudge(answers).client });

const met = (quote: string) => JSON.stringify({ verdict: 'met', quote });
const judgeQuote = (quote: string, text = TEXT) => new Judge({ client: scriptedJudge([met(quote)]).client }).judge({ criterion: 'c', text });

describe('quote normalisation (R14-04)', () => {
  it('a met penalty quoting U+2019 against a straight apostrophe counts: score 0.2, not 1', async () => {
    const g = await gradeWith([met('Ms. Vance'), met('I’ve sent your prescription')]);
    expect(g.checks.find((c) => c.id === 'R2')).toMatchObject({ met: true });
    expect(g.score).toBeCloseTo(0.2, 10);
    expect(g.judge.unknown).toBe(0);
    expect(g.judge.unknown_penalties).toBe(0);
  });

  it('folds curly quotes, dashes, case and whitespace on both sides', async () => {
    expect(await judgeQuote('“stat” – call', 'Order "STAT" - Call   back today.')).toMatchObject({ met: true });
    expect(await judgeQuote("order 'stat'", 'Order ‘stat’ now.')).toMatchObject({ met: true });
    expect(await judgeQuote('2 — 3 days', 'Repeat in 2 - 3 days.')).toMatchObject({ met: true });
    expect(await judgeQuote('I’VE  SENT\nyour', TEXT)).toMatchObject({ met: true });
  });

  it('reads "..." and "…" as gaps whose segments must all appear, in order', async () => {
    expect(await judgeQuote("I've sent ... to the pharmacy", TEXT)).toMatchObject({ met: true });
    expect(await judgeQuote('Ms. Vance…any questions', TEXT)).toMatchObject({ met: true });
    expect(await judgeQuote("pharmacy ... I've sent", TEXT)).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await judgeQuote("I've sent ... refill", TEXT)).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await judgeQuote('...', TEXT)).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
  });

  it('a quote of different words is still not in the text', async () => {
    expect(await judgeQuote('I have sent your prescription', TEXT)).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
  });

  it('the hybrid extractor uses the same check', async () => {
    const j = new Judge({ client: scriptedJudge(['{"value":42,"quote":"CrCl – 42"}']).client });
    expect(await j.extract({ field: 'CrCl', text: 'Cockcroft-Gault: CrCl - 42 mL/min.', pattern: /CrCl of (\d+)/ })).toMatchObject({ value: 42, source: 'llm' });
  });
});

describe('unknown penalties (R14-04)', () => {
  it('an unknown -8 penalty is counted, with the score as if met (0.2) and as if not met (1.0)', async () => {
    const g = await gradeWith([met('Ms. Vance'), '{"verdict":"unknown","quote":""}']);
    expect(g.score).toBe(1);
    expect(g.judge.unknown).toBe(1);
    expect(g.judge.unknown_penalties).toBe(1);
    expect(g.judge.score_penalties_met).toBeCloseTo(0.2, 10);
    expect(g.judge.score_penalties_not_met).toBe(1);
  });

  it('with no unknown penalty both bounds equal the score', async () => {
    const g = await gradeWith([met('Ms. Vance'), '{"verdict":"not_met","quote":""}']);
    expect(g.judge).toMatchObject({ unknown_penalties: 0, score_penalties_met: 1, score_penalties_not_met: 1 });
    expect(g.score).toBe(1);
  });
});

describe('more dash and apostrophe forms (verifier M3)', () => {
  it('folds U+2010, U+2011 and U+2212 to - and U+02BC and U+FF07 to the apostrophe', async () => {
    expect(await judgeQuote('follow-up', 'Book a follow‑up visit.')).toMatchObject({ met: true });
    expect(await judgeQuote('follow-up', 'Book a follow‐up visit.')).toMatchObject({ met: true });
    expect(await judgeQuote('K -0.5', 'K −0.5 change.')).toMatchObject({ met: true });
    expect(await judgeQuote('Iʼve sent', "I've sent it")).toMatchObject({ met: true });
    expect(await judgeQuote('I＇ve sent', "I've sent it")).toMatchObject({ met: true });
  });
});

describe('gap segments are words, and a gap never hides a negation (verifier M2)', () => {
  it('P2: a gap over a negation is not in the text', async () => {
    expect(await judgeQuote('I ... sent your prescription', 'I have not sent your prescription yet.')).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await judgeQuote('I have ... sent your prescription', 'I have not sent your prescription yet.')).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    for (const neg of ['no', 'never', "didn't", 'without', 'denies', 'declined'])
      expect(await judgeQuote('the patient ... chest pain today', `the patient ${neg} chest pain today`)).toMatchObject({ met: 'unknown' });
  });

  it('P2b: a gap segment needs at least 2 words and 8 characters', async () => {
    expect(await judgeQuote('i ... s', 'Visit summary.')).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await judgeQuote("I've sent ... pharmacy", TEXT)).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await judgeQuote("I've sent ... to the pharmacy", TEXT)).toMatchObject({ met: true });
  });

  it('a quote with no gap keeps the plain substring check, however short', async () => {
    expect(await judgeQuote('sent', TEXT)).toMatchObject({ met: true });
    expect(await judgeQuote('I have not sent', 'I have not sent it.')).toMatchObject({ met: true });
  });
});

describe('a gapped hybrid quote states the value beside its label (verifier M1)', () => {
  const extract = (field: string, quote: string, text: string) => new Judge({ client: scriptedJudge([JSON.stringify({ value: 42, quote })]).client }).extract({ field, text, pattern: /CrCl of (\d+)/ });
  const FIELD = 'Cockcroft-Gault creatinine clearance (CrCl), mL/min';

  it('P1: a gap that joins the label to an unrelated number is unknown', async () => {
    expect(await extract('CrCl', 'CrCl ... 42', 'CrCl pending, not yet resulted. Patient age 42.')).toMatchObject({ value: 'unknown' });
    expect(await extract(FIELD, 'CrCl result pending ... patient age 42', 'CrCl result pending today. Patient age 42.')).toMatchObject({ value: 'unknown', reason: 'value not with its label' });
    // The units after the comma are not the label.
    expect(await extract(FIELD, 'CrCl result pending ... age 42 mL/min', 'CrCl result pending today. Patient age 42 mL/min.')).toMatchObject({ value: 'unknown', reason: 'value not with its label' });
  });

  it('a gapped quote whose value segment names the label, and any contiguous quote, still extract', async () => {
    expect(await extract(FIELD, 'Cockcroft-Gault used ... CrCl is 42 mL/min', 'Cockcroft-Gault used with actual weight. CrCl is 42 mL/min.')).toMatchObject({ value: 42, source: 'llm' });
    expect(await extract(FIELD, 'is 42 mL/min', 'Clearance is 42 mL/min.')).toMatchObject({ value: 42, source: 'llm' });
  });
});
