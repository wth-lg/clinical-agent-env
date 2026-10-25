// Judge penalties fail closed in the record (R14-04): the quote check normalises quotes, dashes,
// case and whitespace on both sides and reads "..." or "…" as a gap, so a met penalty whose quote
// uses a typographic apostrophe is not dropped as unknown; a penalty that stays unknown is counted
// in judge.unknown_penalties, with the score as if it were met and as if it were not.
import type { Resource } from '../../env/store.ts';
import { describe, expect, it } from 'vitest';
import { gate, judged, rubric, type Check, type RubricCtx } from '../check.ts';
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
// A credit item's question, or with `penalty` a penalty item's, the only kind a gapped quote can meet.
const judgeQuote = (quote: string, text = TEXT, penalty = false) => new Judge({ client: scriptedJudge([met(quote)]).client }).judge({ criterion: 'c', text, ...(penalty ? { penalty } : {}) });
const penaltyQuote = (quote: string, text = TEXT) => judgeQuote(quote, text, true);

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

  it('for a penalty item, reads "..." and "…" as gaps whose segments must all appear, in order', async () => {
    expect(await penaltyQuote("I've sent ... to the pharmacy", TEXT)).toMatchObject({ met: true });
    expect(await penaltyQuote('Ms. Vance…any questions', TEXT)).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await penaltyQuote("I've sent…to the pharmacy", TEXT)).toMatchObject({ met: true });
    expect(await penaltyQuote("pharmacy ... I've sent", TEXT)).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await penaltyQuote("I've sent ... refill", TEXT)).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await penaltyQuote('...', TEXT)).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
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
    expect(await penaltyQuote('I ... sent your prescription', 'I have not sent your prescription yet.')).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await penaltyQuote('I have ... sent your prescription', 'I have not sent your prescription yet.')).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    for (const neg of ['no', 'never', "didn't", 'without', 'denies', 'declined'])
      expect(await penaltyQuote('the patient ... chest pain today', `the patient ${neg} chest pain today`)).toMatchObject({ met: 'unknown' });
  });

  it('P2b: a gap segment needs at least 2 words and 8 characters', async () => {
    expect(await penaltyQuote('i ... s', 'Visit summary.')).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await penaltyQuote("I've sent ... pharmacy", TEXT)).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await penaltyQuote("I've sent ... to the pharmacy", TEXT)).toMatchObject({ met: true });
  });

  it('a quote with no gap keeps the plain substring check, however short', async () => {
    expect(await judgeQuote('sent', TEXT)).toMatchObject({ met: true });
    expect(await judgeQuote('I have not sent', 'I have not sent it.')).toMatchObject({ met: true });
  });
});

describe('an extractor quote never takes a gap (verifier M1, B1-3 item a)', () => {
  const extract = (field: string, value: number, quote: string, text: string) => new Judge({ client: scriptedJudge([JSON.stringify({ value, quote })]).client }).extract({ field, text, pattern: /CrCl of (\d+)/ });
  const CRCL = 'Cockcroft-Gault creatinine clearance (CrCl), mL/min';
  const EGFR = 'eGFR (CKD-EPI 2021), mL/min/1.73 m2';
  const unknown = { value: 'unknown', reason: 'quote not in text' };

  it('P1, N5, N5c and a true gapped quote are not in the text', async () => {
    expect(await extract('CrCl', 42, 'CrCl ... 42', 'CrCl pending, not yet resulted. Patient age 42.')).toMatchObject(unknown);
    expect(await extract(CRCL, 42, 'CrCl result pending ... patient age 42', 'CrCl result pending today, patient age 42.')).toMatchObject(unknown);
    expect(await extract(CRCL, 42, 'serum creatinine 1.4 mg/dl today ... weight 42 kg; creatinine clearance', 'Serum creatinine 1.4 mg/dL today, weight 42 kg; creatinine clearance to follow.')).toMatchObject(unknown);
    expect(await extract(EGFR, 3, 'egfr pending from lab ... ckd stage 3 noted', 'eGFR pending from lab, history of CKD stage 3 noted.')).toMatchObject(unknown);
    expect(await extract(CRCL, 42, 'Cockcroft-Gault used ... CrCl is 42 mL/min', 'Cockcroft-Gault used with actual weight, CrCl is 42 mL/min.')).toMatchObject(unknown);
  });

  it('a contiguous quote extracts as before', async () => {
    expect(await extract(CRCL, 42, 'Clearance is 42 mL/min', 'Clearance is 42 mL/min.')).toMatchObject({ value: 42, source: 'llm' });
    expect(await extract(EGFR, 52, 'eGFR is 52 mL/min/1.73 m2', 'Latest eGFR is 52 mL/min/1.73 m2.')).toMatchObject({ value: 52 });
  });
});

describe('a quote found as written is never read as gapped', () => {
  it('P3d: an ellipsis that is in the text itself still matches', async () => {
    expect(await judgeQuote('wait... then call', 'Please wait... then call us.')).toMatchObject({ met: true });
    expect(await judgeQuote('wait… then call', 'Please wait… then call us.')).toMatchObject({ met: true });
  });
});

describe('gap segments match whole words (verifier B1-2 F1, rule 1)', () => {
  it('N3, N3b: a segment that ends inside a word cannot hide its negation', async () => {
    expect(await penaltyQuote('I have n... sent your prescription', 'I have not sent your prescription yet.')).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
    expect(await penaltyQuote('we have no... sent the order to', 'We have not sent the order to radiology.')).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
  });

  it('N7: a later placement of the segments counts when the first one fails', async () => {
    expect(await penaltyQuote('the order was ... signed by dr lee', 'The order was not signed by Dr Lee. Later the order was reviewed and signed by Dr Lee.')).toMatchObject({ met: true });
  });

  it('a leading or trailing ellipsis is one segment, still at word edges', async () => {
    expect(await penaltyQuote("I've sent your prescription...", TEXT)).toMatchObject({ met: true });
    expect(await penaltyQuote('\u2026sent your prescription', TEXT)).toMatchObject({ met: true });
    expect(await penaltyQuote('ve sent your prescription...', TEXT)).toMatchObject({ met: 'unknown' });
  });

  it('N4: a fake ellipsis over nothing is harmless', async () => {
    expect(await penaltyQuote("I've sent your ... prescription to the pharmacy", "I've sent your prescription to the pharmacy.")).toMatchObject({ met: true });
  });
});

describe('a gap is short, in one sentence, and holds no negation (verifier B1-2 F2/F3, rule 2)', () => {
  const unknown = { met: 'unknown', evidence: { reason: 'quote not in text' } };
  it('N1: a gap across a sentence end is not in the text', async () => {
    expect(await penaltyQuote("I've sent your ... prescription to the pharmacy", "I've sent your lab results. Your prescription to the pharmacy is on hold pending review.")).toMatchObject(unknown);
    expect(await penaltyQuote('the visit went ... the plan is set', 'The visit went well!\nToday the plan is set.')).toMatchObject(unknown);
    expect(await penaltyQuote('the visit went ... the plan is set', 'The visit went well\nand the plan is set.')).toMatchObject(unknown);
  });

  it('a gap over 80 characters is not in the text', async () => {
    const long = `${'and then some more words '.repeat(4)}`;
    expect(long.length).toBeGreaterThan(80);
    expect(await penaltyQuote('the visit went ... the plan is set', `The visit went ${long}the plan is set.`)).toMatchObject(unknown);
    expect(await penaltyQuote('the visit went ... the plan is set', 'The visit went well, and after review the plan is set.')).toMatchObject({ met: true });
  });

  it('N2a-j: no negation form in a gap', async () => {
    const cases: Array<[string, string]> = [
      ['the clinic team ... confirm the refill today', 'The clinic team cannot confirm the refill today.'],
      ['the clinic team ... confirm the refill today', 'The clinic team didnt confirm the refill today.'],
      ['the clinic team ... confirm the refill today', 'The clinic team didn’t confirm the refill today.'],
      ['your prescription was ... sent to the pharmacy', 'Your prescription was not yet sent to the pharmacy.'],
      ['the patient ... chest pain today', 'The patient denied chest pain today.'],
      ['the patient ... the contrast scan', 'The patient refused the contrast scan.'],
      ['the nurse was ... reach the patient by phone', 'The nurse was unable to reach the patient by phone.'],
      ['the pharmacy ... receive the prescription', 'The pharmacy failed to receive the prescription.'],
      ['the order was ... signed by the provider', 'The order was neither reviewed nor signed by the provider.'],
      ['the urine culture ... e. coli growth', 'The urine culture was negative for e. coli growth.'],
      ['the team found ... allergies on file', 'The team found none of the allergies on file.'],
      ['the doctor will ... the apixaban dose', 'The doctor will stop the apixaban dose.'],
      ['the doctor has ... the apixaban dose', 'The doctor has stopped the apixaban dose.'],
      ['please ... the lisinopril tablets', 'Please hold the lisinopril tablets.'],
      ['the nurse ... the lisinopril tablets', 'The nurse held the lisinopril tablets.'],
    ];
    for (const [quote, text] of cases) expect(await judgeQuote(quote, text), quote + ' / ' + text).toMatchObject(unknown);
  });
});

describe('real extractor quotes are met (verifier B1-3 F1)', () => {
  // The live pilot-0 answers for renal-dose-review note_states_crcl and note_states_egfr
  // (results/pilot-0, live/0-2, source llm) and two more shapes, with the task's regexes.
  const CRCL = 'Cockcroft-Gault creatinine clearance (CrCl), mL/min';
  const CRCL_RE = /\b(?:CrCl|creatinine clearance)\b[^\d\n]{0,60}?(\d+(?:\.\d+)?)\s*mL\/min(?!\/)/i;
  const EGFR = 'eGFR (CKD-EPI 2021), mL/min/1.73 m2';
  const EGFR_RE = /\beGFR\b[^\d\n]{0,60}?(\d+(?:\.\d+)?)\s*mL\/min\/1\.73/i;
  const rows: Array<[string, string, RegExp, number, string]> = [
    ['live/0 crcl', CRCL, CRCL_RE, 43, 'Cockcroft-Gault using actual weight: (140 - 82) x 64.9 / (72 x 1.21) = about 43 mL/min.'],
    ['live/1 crcl', CRCL, CRCL_RE, 43.2, 'CrCl by Cockcroft-Gault, using actual weight: (140 - 82) x 64.9 / (72 x 1.21) = 43.2 mL/min.'],
    ['live/2 crcl', CRCL, CRCL_RE, 43.2, 'CrCl (Cockcroft-Gault, actual body weight) = (140 - 82) x 64.9 / (72 x 1.21) = 43.2 mL/min.'],
    ['live/1 egfr', EGFR, EGFR_RE, 59.8, 'eGFR by CKD-EPI 2021 (race-free): 142 x (1.21/0.9)^-1.200 x 0.9938^82 = 59.8 mL/min/1.73 m2.'],
    ['live/2 egfr', EGFR, EGFR_RE, 59.8, 'eGFR (CKD-EPI 2021, race-free, male, SCr 1.21, age 82) = 59.8 mL/min/1.73 m2.'],
    ['E1', EGFR, EGFR_RE, 45, 'eGFR (CKD-EPI 2021): 45 mL/min/1.73 m2'],
    ['E2', CRCL, CRCL_RE, 41, 'CrCl (CG, weight 62.3 kg): 41 mL/min'],
  ];
  it.each(rows)('%s', async (_id, field, pattern, value, quote) => {
    const j = new Judge({ client: scriptedJudge([JSON.stringify({ value, quote })]).client });
    expect(await j.extract({ field, text: `Assessment. ${quote} Plan follows.`, pattern })).toMatchObject({ value, source: 'llm' });
  });
});

describe('a gapped quote counts only for a penalty item (verifier B1-3 item a)', () => {
  const unknown = { met: 'unknown', evidence: { reason: 'quote not in text' } };
  it('a credit item takes no gapped quote, true or false', async () => {
    const probes: Array<[string, string]> = [
      ["I've sent ... to the pharmacy", TEXT],
      ["I've sent\u2026to the pharmacy", TEXT],
      ["I've sent your ... prescription to the pharmacy", "I've sent your prescription to the pharmacy."],
      ['the order was ... signed by dr lee', 'The order was not signed by Dr Lee. Later the order was reviewed and signed by Dr Lee.'],
      ["I've sent your prescription...", TEXT],
      ['I ... sent your prescription', 'I have not sent your prescription yet.'],
      ['i ... s', 'Visit summary.'],
      ['I have n... sent your prescription', 'I have not sent your prescription yet.'],
      ["I've sent your ... prescription to the pharmacy", "I've sent your lab results. Your prescription to the pharmacy is on hold pending review."],
      ['the clinic team ... confirm the refill today', 'The clinic team cannot confirm the refill today.'],
      ['sent your prescription ... to the pharmacy today', 'I have not sent your prescription to the pharmacy today.'],
      ['with the ... and the', 'Started with the plan and the follow-up.'],
    ];
    for (const [quote, text] of probes) expect(await judgeQuote(quote, text), quote).toMatchObject(unknown);
  });

  it('in a grade, a gapped quote meets the -8 penalty but not the +10 item', async () => {
    const g = await gradeWith([met("Hi Ms. Vance ... sent your prescription"), met("I've sent your ... to the pharmacy")]);
    expect(g.checks.find((c) => c.id === 'R1')).toMatchObject({ met: 'unknown' });
    expect(g.checks.find((c) => c.id === 'R2')).toMatchObject({ met: true });
    expect(g.score).toBeNull();
    const h = await gradeWith([met('Ms. Vance'), met("I've sent your ... to the pharmacy")]);
    expect(h.score).toBeCloseTo(0.2, 10);
  });
});

describe('more sentence ends in a penalty gap (verifier B1-3 F3, item c)', () => {
  const unknown = { met: 'unknown', evidence: { reason: 'quote not in text' } };
  it('U+2028, U+2029 and an ellipsis in the text end a sentence', async () => {
    expect(await penaltyQuote('the visit went ... the plan is set', 'The visit went well and the plan is set.')).toMatchObject(unknown);
    expect(await penaltyQuote('the visit went ... the plan is set', 'The visit went well and the plan is set.')).toMatchObject(unknown);
    expect(await penaltyQuote('the visit went ... the plan is set', 'The visit went well… and the plan is set.')).toMatchObject(unknown);
    expect(await penaltyQuote('the visit went ... the plan is set', 'The visit went well, and the plan is set.')).toMatchObject({ met: true });
  });
});

describe('the grader, not the caller, says what a penalty is (verifier B1-4 F1)', () => {
  const TRUE_TEXT = 'Warfarin was held for two days because of the procedure and then continued at 5 mg daily.';
  const FALSE_TEXT = 'Warfarin was discontinued; lisinopril continued at 5 mg.';
  const gradeText = (text: string, checks: Check[], answers: string[]) =>
    grade({ checks, initial: INITIAL, final: [...INITIAL, note('doc-1', text)], events, trial: facts() }, { judge: scriptedJudge(answers).client });
  // A code item that asks the judge itself, as T1 note_uses_wrong_scr, T4 used_2025_summary and
  // T5 shellfish_as_risk_factor do; `extra` is what its code adds to the question.
  const direct = (id: string, points: number, extra: object = {}) =>
    rubric({ id, points, method: 'judge', category: 'documentation', traces_to: 't', decisive_ids: [], fn: (ctx: RubricCtx) => ctx.judge({ criterion: `criterion ${id}`, text: notesText(ctx), ...extra } as Parameters<RubricCtx['judge']>[0]) });

  it('a -5 code item that calls ctx.judge directly reads a true gapped quote', async () => {
    const g = await gradeText(`x. ${TRUE_TEXT}`, [judged({ id: 'R1', points: 10, category: 'documentation', traces_to: 't', decisive_ids: [], criterion: 'criterion R1', text: notesText }), direct('P1', -5)], [met('x'), met('warfarin was held ... continued at 5 mg daily')]);
    expect(g.checks.find((c) => c.id === 'P1')).toMatchObject({ met: true });
    expect(g.score).toBe(0.5);
  });

  it('a +10 item that passes penalty: true still needs a contiguous quote', async () => {
    const g = await gradeText(FALSE_TEXT, [direct('R1', 10, { penalty: true })], [met('warfarin was ... continued at 5 mg')]);
    expect(g.checks.find((c) => c.id === 'R1')).toMatchObject({ met: 'unknown', evidence: { reason: 'quote not in text' } });
  });

  it('a -5 item that passes penalty: false still reads the gap', async () => {
    const g = await gradeText(TRUE_TEXT, [direct('P1', -5, { penalty: false })], [met('warfarin was held ... continued at 5 mg daily')]);
    expect(g.checks.find((c) => c.id === 'P1')).toMatchObject({ met: true });
  });
});
