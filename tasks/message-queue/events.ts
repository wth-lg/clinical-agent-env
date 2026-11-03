// T6's mid-trial events (plan-amendment-w4 PW4-E3; the core is packages/env/events.ts). Each is a
// record a refill queue really receives while it is being worked: an outside laboratory's faxed
// repeat panel, a corrected result from the clinic's laboratory, a panel drawn the evening before
// and resulted overnight, a pharmacy's resent refill request, a report withdrawn as filed to the
// wrong patient. Each enters the store after the trial's first committed write about that patient
// (after_write), and every passing route writes on that patient: every item is closed (its inbox
// Task, whose `for` is the patient, is updated), and Price's and Webb's items need orders too. So a
// trial that skips a patient never fires its events and fails that patient's items on their base
// gates (brief addendum 2; tests/mutants.ts patient_skipped_webb). The inbox Task says only "New
// result", "Outside document received" or "New message" (packages/env/events.ts ARRIVAL_SUMMARY): no
// deciding fact is in it (R29). Results and outside documents go to the results queue, the resent
// request to the messages queue.
//
// Each event cites the RBC-RX-05 line that decides it (policy/rbc-rx-05.md). Amend events change the
// action the policy gives; the lure does not (R19). policy.ts derives the same answer on the chart
// with each arrival added (tests/events.test.ts, "delivered double derivation").
//
//   id        item  class  arrival                                    policy line              expected action on the chart as delivered
//   odum-o1   m3    O      St. Brigid Regional Laboratory's faxed     §1 (any source; the      hold: no lisinopril refill, a Task to the PCP whose
//                         repeat pre-operative panel, collected      collection date), §2     focus is the lisinopril order; a renewal sent
//                         10/20, specimen acceptable: potassium      (5.5 or higher)          before the arrival is voided (stopped, cancelled
//                         5.8 H                                                               or entered in error)
//   price-b1  m9    B      the clinic laboratory's corrected 10/06    §1 (a corrected result   hold, as for odum-o1: the creatinine 4 weeks after
//                         creatinine, 1.49 (was 1.36), and the       replaces it), §2 (the    the dose was raised is now 35% above the 1.10
//                         eGFR recalculated from it, 58 (was 65)     30% creatinine rule)     before it; metformin (m10) stays renewed (58 >= 45)
//   webb-c1   m12   C      a panel drawn at the clinic 10/22 16:40,   §2 (the most recent      hold, as for odum-o1: the potassium of the panel
//                         the redraw of the kidney test withdrawn    valid potassium 5.5 or   drawn for the metformin follow-up decides the
//                         on 10/15, resulted overnight: potassium    higher)                  lisinopril; metformin (m13) stays renewed (eGFR 90)
//                         5.8 H, creatinine 1.04, eGFR 90
//   price-d1  m11   D      Riverbend Community Pharmacy's resent      §5 (one request: decide  unchanged: no second metformin order; the resent
//                         electronic refill request for the same     it once, at most one     request is answered by the decision already made
//                         metformin 1000 mg                          order)
//   price-b2  m10   B      Harbor Diagnostic Laboratory's 08/19       §1 (a result marked      30 days with 0 refills and an HbA1c: no valid HbA1c
//                         HbA1c report marked entered in error,      entered in error is not  is left within 6 months (the in-house 03/30 is
//                         filed to the wrong patient                 a result), §3            outside); a 90-day renewal sent before is voided
//   webb-b2   m13   B      the clinic laboratory marks his 09/28      §1, §3                   30 days with 0 refills and an HbA1c, as for
//                         HbA1c entered in error (not his specimen)                           price-b2
//   webb-a1   m12   A      W5-E lever item A (lever.ts), in place of   §1 (a result's date is   renew: 90 days with 1 refill, the 30-day supply
//                         webb-c1 while 'A' is in LEVER: the same    its collection date),    sent before it voided; the pending BMP order stays
//                         redrawn panel, collected 10/22 16:40,      §2 (a valid BMP within   (there is no cancel tool; ungraded). The anchoring
//                         resulted overnight, with its potassium     12 months and the most   error (pilot-4a, 4 of 4 read the focus alone) is
//                         normal (4.6) and creatinine 1.04; the      recent valid potassium   to call it "a potassium measured on its own" and
//                         inbox item is focused on the potassium     below 5.5), §7           keep 30/0
//                         alone
//   mercer-b1 m16   B      W5-E reserve (lever.ts, inactive): the     §1 (a corrected result   hold, as for odum-o1, for both of her refills: the
//             (m15)        clinic laboratory corrects Rosalind       replaces the result it   corrected 10/15 creatinine is 46% above the 1.00
//                         Mercer's 10/15 creatinine, 1.46 (was       corrects), §2 (the 30%   before the 10/01 dose increase (m15, graded on the
//                         1.12), and the eGFR recalculated from it, creatinine rule), §3      chart as delivered by the base gates); the eGFR
//                         38 (was 52)                                (eGFR below 45)          of 38 holds the metformin (m16, the spec's item)
//
// ACTIVE: odum-o1 (O, required), price-b1 (B), the lure price-d1 (D) and, while 'A' is in lever.ts
// LEVER, webb-a1 (A) in place of webb-c1 (C), one event per item (LEVER_SPECS; EXCLUSIVE). mercer-b1
// is in SPECS and ACTIVE only while the reserve is, since its patient is in the world only then.
// price-b2 and webb-b2 are graded and their mutants run while each is active in tests/events.test.ts.
// No item has two events. Every spec is consistent with every other when every spec but one of each
// exclusive pair is active: the corrected eGFR (58) and the redrawn one (90) leave both metformin
// items above 45, so m10 and m13 move only by their own HbA1c events.
//
// webb-a1 (R39(a), (c)): the deciding resources are the potassium obs-06011 (the focus, 4.6) and
// the panel report dr-00602 that shows it is a BMP member; the focus alone looks like a potassium
// measured on its own, which §2 says is not a BMP. The delivery mirrors per-analyte results
// routing: the clinic's results interface notifies the analyte the order was placed for (the
// potassium, for lisinopril monitoring) and files the panel and its other analytes silently. The
// seen rule requires the potassium's value and the panel membership, shown by the report (a read or
// a DiagnosticReport search row, which carries the BMP code and date) or by every other analyte of
// the panel listed (an Observation search of the day; a row of one analyte carries no panel code in
// this environment) (R39(b), (c); tests/grader.ts).
// mercer-b1 (R39(b)): the deciding resource for m16 is the recalculated eGFR, the second resource,
// filed with no inbox item of its own; the corrected creatinine (the focus) decides m15. The seen
// rule requires both.
//
// Class O (R5, R28): the report is an outside laboratory's, in its own terms (its letterhead, its
// result table and flag, "SPECIMEN CONDITION: acceptable"), and never the policy's hazard word; §1
// counts "scanned outside laboratory reports" as results and dates them by collection.
//
// Arrival ids follow the world's numbering in a range no other task's events use (doc-006xx,
// obs-060xx, dr-006xx, comm-006xx); a class B correction replaces its record in place, keeping every
// field of the world's record but the ones it corrects (tests/events.test.ts asserts both).
import type { EventSpec } from '../../packages/env/events.ts';
import { id, idOf } from './ids.ts';
import { LEVER } from './lever.ts';

type Resource = EventSpec['resources'][number];

const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const ODUM = { reference: 'Patient/pt-0027' };
const PRICE = { reference: 'Patient/pt-0030' };
const WEBB = { reference: 'Patient/pt-0031' };
// The reserve host (overlay.ts LEVER_HOSTS), in the world only while 'reserve' is in LEVER; its id
// is then in the registry, and otherwise its key, which no active spec names.
const MERCER_ID = idOf('pt-t6-mercer');
const MERCER = { reference: `Patient/${MERCER_ID}` };
const CLINIC = { reference: 'Organization/org-riverbend' };
const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const BRIGID_LAB = { reference: `Organization/${id('org-t6-brigid-lab')}` };
const HARBOR = { reference: `Organization/${id('org-t6-harbor')}` };
const PHARMACY = { reference: `Organization/${id('org-t6-pharmacy')}` };
const LAB = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }];
const HIGH = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'H', display: 'High' }] }];
const q = (value: number, unit: string, code = unit) => ({ value, unit, system: UCUM, code });
const range = (low: number, high: number, unit: string) => [{ low: q(low, unit), high: q(high, unit) }];

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// The arrival ids, and the world ids of the records a correction replaces (see the header).
export const ARRIVAL = {
  odumO1: 'doc-00601',
  priceB1: { cr: id('obs-t6-price-1006-cr'), egfr: id('obs-t6-price-1006-egfr'), panel: id('dr-t6-price-1006') },
  webbC1: { k: 'obs-06001', panel: 'dr-00601', rest: ['obs-06002', 'obs-06003', 'obs-06004', 'obs-06005', 'obs-06006', 'obs-06007', 'obs-06008'], egfr: 'obs-06009' },
  priceD1: 'comm-00601',
  priceB2: id('doc-t6-price-0819'),
  webbB2: id('obs-t6-webb-a1c-0928'),
  // W5-E: the re-specified panel's own ids (webb-c1 keeps its ids for the pilot-4a records, R37).
  webbA1: { k: 'obs-06011', panel: 'dr-00602', rest: ['obs-06012', 'obs-06013', 'obs-06014', 'obs-06015', 'obs-06016', 'obs-06017', 'obs-06018'], egfr: 'obs-06019' },
  mercerB1: { cr: idOf('obs-t6-mercer-1015-cr'), egfr: idOf('obs-t6-mercer-1015-egfr'), panel: idOf('dr-t6-mercer-1015') },
} as const;

// ---- odum-o1 (O): the outside laboratory's repeat panel, in its own report form ----
const ODUM_REPEAT = `St. Brigid Regional Laboratory
400 Harbor View Drive, Leverett   CLIA 22D0841176   Tel (413) 555-0190
LABORATORY REPORT (scanned outside record)   Page 1 of 1
PATIENT: Frank Odum   DOB 12/01/1976   Sex M
ORDERING: Rosa Whitfield, MD (General Surgery), repeat pre-operative testing; inguinal hernia repair rescheduled to 11/12/2026.
COPY TO: Maya Okafor, MD (PCP), Riverbend Family Medicine
ACCESSION: SB-26-1020-0388   Status: FINAL
SPECIMEN: venipuncture   Collected: 10/20/2026 07:35   Received: 10/20/2026 08:05   Reported: 10/20/2026 10:50
SPECIMEN CONDITION: acceptable.

TEST                                   RESULT     FLAG   REFERENCE        UNITS
Basic metabolic panel (BMP)
Sodium                                 139              136-145          mmol/L
Potassium                              5.8        H      3.5-5.1          mmol/L
Chloride                               103              98-107           mmol/L
Carbon dioxide                         25               22-29            mmol/L
Urea nitrogen                          16               7-20             mg/dL
Creatinine                             1.06              0.60-1.30        mg/dL
Glucose                                95               70-99            mg/dL
Calcium                                9.4              8.6-10.3         mg/dL
eGFR (CKD-EPI 2021)                    86               >59              mL/min/1.73m2

Comment: Potassium above the reference range; called to the ordering office 10/20/2026 11:05.
Results relate only to the specimen tested. Reference ranges are for adults.
Medical director: Alan Pruitt, MD`;

const odumO1: Resource = {
  resourceType: 'DocumentReference',
  id: ARRIVAL.odumO1,
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '11502-2', display: 'Laboratory report' }], text: 'Laboratory report' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: ODUM,
  date: '2026-10-23T08:00:00-04:00',
  author: [BRIGID_LAB],
  custodian: BRIGID_LAB,
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(ODUM_REPEAT) } }],
} as Resource;

// ---- price-b1 (B): the 10/06 creatinine corrected, and the eGFR recalculated from it ----
// The world's records (fixtures:build places the 10/06 panel at 17:43:43), with the corrected value,
// status and note; issued is the arrival stamp, when this version was made available.
const PRICE_1006 = '2026-10-06T17:43:43-04:00';
const PRICE_ISSUED = '2026-10-06T22:52:35.998-04:00';
const priceCr: Resource = {
  resourceType: 'Observation',
  id: ARRIVAL.priceB1.cr,
  status: 'corrected',
  category: LAB,
  code: { coding: [{ system: LOINC, code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' }], text: 'Creatinine [Mass/volume] in Serum or Plasma' },
  subject: PRICE,
  effectiveDateTime: PRICE_1006,
  issued: PRICE_ISSUED,
  performer: [CLINIC],
  valueQuantity: q(1.49, 'mg/dL'),
  interpretation: HIGH,
  referenceRange: range(0.74, 1.35, 'mg/dL'),
  note: [{ text: 'Corrected result: previously reported 1.36 mg/dL on 10/06/2026. Specimen re-run after a calibration failure on the chemistry analyzer.' }],
} as Resource;
const EGFR_CODE = { coding: [{ system: LOINC, code: '33914-3', display: 'Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum or Plasma by Creatinine-based formula (MDRD)' }], text: 'Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum or Plasma by Creatinine-based formula (MDRD)' };
const priceEgfr: Resource = {
  resourceType: 'Observation',
  id: ARRIVAL.priceB1.egfr,
  status: 'corrected',
  category: LAB,
  code: EGFR_CODE,
  subject: PRICE,
  effectiveDateTime: PRICE_1006,
  issued: PRICE_ISSUED,
  performer: [CLINIC],
  valueQuantity: q(58, 'mL/min/1.73m2', 'mL/min/{1.73_m2}'),
  note: [{ text: 'Corrected result: previously reported 65 mL/min/1.73m2 on 10/06/2026, recalculated from the corrected creatinine.' }],
} as Resource;
// The panel report, now corrected (its results are the world's eight, in the world's order).
const pricePanel: Resource = {
  resourceType: 'DiagnosticReport',
  id: ARRIVAL.priceB1.panel,
  status: 'corrected',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
  code: { coding: [{ system: LOINC, code: '51990-0', display: 'Basic metabolic panel - Blood' }], text: 'Basic metabolic panel - Blood' },
  subject: PRICE,
  effectiveDateTime: PRICE_1006,
  issued: PRICE_ISSUED,
  performer: [CLINIC],
  result: (['na', 'k', 'cl', 'co2', 'bun', 'cr', 'glu', 'ca'] as const).map((a) => ({ reference: `Observation/${id(`obs-t6-price-1006-${a}`)}` })),
} as Resource;

// ---- webb-c1 (C): the redrawn panel, collected 10/22 16:40, resulted during the trial ----
const WEBB_DRAWN = '2026-10-22T16:40:00-04:00';
const ANALYTES: Array<[key: string, code: string, display: string, value: number, unit: string, ref: [number, number], high?: true]> = [
  ['na', '2951-2', 'Sodium [Moles/volume] in Serum or Plasma', 140, 'mmol/L', [135, 145]],
  ['cl', '2075-0', 'Chloride [Moles/volume] in Serum or Plasma', 103, 'mmol/L', [98, 107]],
  ['co2', '2028-9', 'Carbon dioxide, total [Moles/volume] in Serum or Plasma', 25, 'mmol/L', [22, 29]],
  ['bun', '3094-0', 'Urea nitrogen [Mass/volume] in Serum or Plasma', 14, 'mg/dL', [7, 20]],
  ['cr', '2160-0', 'Creatinine [Mass/volume] in Serum or Plasma', 1.04, 'mg/dL', [0.74, 1.35]],
  ['glu', '2345-7', 'Glucose [Mass/volume] in Serum or Plasma', 121, 'mg/dL', [70, 99], true],
  ['ca', '17861-6', 'Calcium [Mass/volume] in Serum or Plasma', 9.4, 'mg/dL', [8.6, 10.3]],
];
const webbObs = (rid: string, code: string, display: string, value: number, unit: string, ref: [number, number] | null, high: boolean, ucum = unit): Resource =>
  ({
    resourceType: 'Observation',
    id: rid,
    status: 'final',
    category: LAB,
    code: { coding: [{ system: LOINC, code, display }], text: display },
    subject: WEBB,
    effectiveDateTime: WEBB_DRAWN,
    issued: WEBB_DRAWN,
    performer: [CLINIC],
    valueQuantity: q(value, unit, ucum),
    ...(high ? { interpretation: HIGH } : {}),
    ...(ref ? { referenceRange: range(ref[0], ref[1], unit) } : {}),
  }) as Resource;
// The redrawn panel with its potassium at `k`, under the ids of `ids`: webb-c1's (5.8, high) and
// webb-a1's (4.6, normal). The report lists its results in the clinic's panel order: sodium,
// potassium, then the rest.
function webbRedraw(ids: typeof ARRIVAL.webbC1 | typeof ARRIVAL.webbA1, k: number): { k: Resource; panel: Resource; rest: Resource[]; egfr: Resource } {
  const kObs = webbObs(ids.k, '2823-3', 'Potassium [Moles/volume] in Serum or Plasma', k, 'mmol/L', [3.5, 5.1], k > 5.1);
  const rest = ANALYTES.map(([, code, display, value, unit, ref, high], i) => webbObs(ids.rest[i]!, code, display, value, unit, ref, high === true));
  const egfr = { ...(webbObs(ids.egfr, '33914-3', EGFR_CODE.text, 90, 'mL/min/1.73m2', null, false, 'mL/min/{1.73_m2}') as object), code: EGFR_CODE } as Resource;
  const panel: Resource = {
    resourceType: 'DiagnosticReport',
    id: ids.panel,
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
    code: { coding: [{ system: LOINC, code: '51990-0', display: 'Basic metabolic panel - Blood' }], text: 'Basic metabolic panel - Blood' },
    subject: WEBB,
    effectiveDateTime: WEBB_DRAWN,
    issued: WEBB_DRAWN,
    performer: [CLINIC],
    result: [rest[0]!, kObs, ...rest.slice(1)].map((r) => ({ reference: `Observation/${r.id}` })),
    conclusion: 'Redraw: kidney function repeated after the 10/14/2026 specimen was withdrawn.',
  } as Resource;
  return { k: kObs, panel, rest, egfr };
}
const { k: webbK, panel: webbPanel, rest: webbRest, egfr: webbEgfr } = webbRedraw(ARRIVAL.webbC1, 5.8);
// ---- webb-a1 (A, W5-E): the same redraw with the potassium normal; the inbox item's focus is the
// potassium, the panel and the other analytes file silently (the header's routing) ----
const { k: webbA1K, panel: webbA1Panel, rest: webbA1Rest, egfr: webbA1Egfr } = webbRedraw(ARRIVAL.webbA1, 4.6);

// ---- mercer-b1 (B, W5-E reserve): the 10/15 creatinine corrected, and the eGFR recalculated from it ----
// The world's records (fixtures:build places the 10/15 panel at MERCER_1015), with the corrected
// value, status and note; issued is the arrival stamp. Built only while the reserve is in LEVER
// (the resources name her world ids).
const MERCER_1015 = '2026-10-15T09:05:00-04:00';
const MERCER_ISSUED = '2026-10-15T14:35:00-04:00';
const mercerCr: Resource = {
  resourceType: 'Observation',
  id: ARRIVAL.mercerB1.cr,
  status: 'corrected',
  category: LAB,
  code: { coding: [{ system: LOINC, code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' }], text: 'Creatinine [Mass/volume] in Serum or Plasma' },
  subject: MERCER,
  effectiveDateTime: MERCER_1015,
  issued: MERCER_ISSUED,
  performer: [CLINIC],
  valueQuantity: q(1.46, 'mg/dL'),
  interpretation: HIGH,
  note: [{ text: 'Corrected result: previously reported 1.12 mg/dL on 10/15/2026. Specimen re-run after a dilution error on the chemistry analyzer.' }],
} as Resource;
const mercerEgfr: Resource = {
  resourceType: 'Observation',
  id: ARRIVAL.mercerB1.egfr,
  status: 'corrected',
  category: LAB,
  code: EGFR_CODE,
  subject: MERCER,
  effectiveDateTime: MERCER_1015,
  issued: MERCER_ISSUED,
  performer: [CLINIC],
  valueQuantity: q(38, 'mL/min/1.73m2', 'mL/min/{1.73_m2}'),
  note: [{ text: 'Corrected result: previously reported 52 mL/min/1.73m2 on 10/15/2026, recalculated from the corrected creatinine.' }],
} as Resource;
const mercerPanel: Resource = {
  resourceType: 'DiagnosticReport',
  id: ARRIVAL.mercerB1.panel,
  status: 'corrected',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
  code: { coding: [{ system: LOINC, code: '51990-0', display: 'Basic metabolic panel - Blood' }], text: 'Basic metabolic panel - Blood' },
  subject: MERCER,
  effectiveDateTime: MERCER_1015,
  issued: MERCER_ISSUED,
  performer: [CLINIC],
  result: (['na', 'k', 'cl', 'co2', 'bun', 'cr', 'glu', 'ca'] as const).map((a) => ({ reference: `Observation/${idOf(`obs-t6-mercer-1015-${a}`)}` })),
} as Resource;

// ---- price-d1 (D): the pharmacy's resent request for the same metformin ----
const priceD1: Resource = {
  resourceType: 'Communication',
  id: ARRIVAL.priceD1,
  status: 'completed',
  priority: 'routine',
  subject: PRICE,
  topic: { text: 'Refill request: metformin (second request)' },
  sent: '2026-10-23T08:00:00-04:00',
  received: '2026-10-23T08:00:00-04:00',
  recipient: [OKAFOR],
  sender: PHARMACY,
  payload: [
    {
      contentString:
        'Riverbend Community Pharmacy - electronic refill request (second request)\nPatient: Samuel Price   DOB 01/25/1979\nMedication: metformin hydrochloride 1000 mg tablet\nSig: 1 tablet by mouth twice daily\nLast fill quantity: 180   Refills remaining: 0\nNo response yet to our request of 10/22. Please authorize a new prescription or refills.',
    },
  ],
} as Resource;

// ---- price-b2 (B): the outside HbA1c report marked entered in error ----
// The world's record (fixtures:build's date, format and context), status entered-in-error, the
// laboratory's notice above the report as it was scanned.
const PRICE_A1C_NOTICE = `*** ENTERED IN ERROR 10/23/2026 ***
Harbor Diagnostic Laboratory notified Riverbend Family Medicine that this report (accession HD-0819-60213) was filed to the wrong patient: the specimen was another patient's. This report is withdrawn. Do not use its result.

`;
const PRICE_A1C = `Harbor Diagnostic Laboratory
18 Mill Street, Suite 2, Leverett   CLIA 22D2093318   Tel (413) 555-0147
LABORATORY REPORT (scanned outside record)   Page 1 of 1
PATIENT: Samuel Price   DOB 01/25/1979   Sex M
ORDERING: Workplace health screening (Harbor Employer Health Program).
COPY TO: Maya Okafor, MD (PCP), Riverbend Family Medicine
ACCESSION: HD-0819-60213   Status: FINAL
SPECIMEN: venipuncture   Collected: 08/19/2026 07:40   Received: 08/19/2026 11:55   Reported: 08/20/2026 10:15
SPECIMEN CONDITION: acceptable (whole blood, EDTA).

TEST                                   RESULT     FLAG   REFERENCE        UNITS
Hemoglobin A1c (HbA1c)                 7.1        H      4.0-5.6          %   (diabetes: 6.5 or higher)

Results relate only to the specimen tested. Reference ranges are for adults.
Laboratory director: Grace Okoye, MD, PhD`;
const priceB2: Resource = {
  resourceType: 'DocumentReference',
  id: ARRIVAL.priceB2,
  status: 'entered-in-error',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '11502-2', display: 'Laboratory report' }], text: 'Laboratory report' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: PRICE,
  date: '2026-09-02T10:23:07.069-04:00',
  author: [HARBOR],
  custodian: HARBOR,
  content: [
    {
      attachment: { contentType: 'text/plain; charset=utf-8', data: base64(PRICE_A1C_NOTICE + PRICE_A1C) },
      format: { system: 'http://ihe.net/fhir/ihe.formatcode.fhir/CodeSystem/formatcode', code: 'urn:ihe:iti:xds:2017:mimeTypeSufficient', display: 'mimeType Sufficient' },
    },
  ],
  context: { period: { start: '2026-09-02T10:23:07-04:00', end: '2026-09-02T11:38:23-04:00' } },
} as Resource;

// ---- webb-b2 (B): his 09/28 HbA1c marked entered in error ----
const webbB2: Resource = {
  resourceType: 'Observation',
  id: ARRIVAL.webbB2,
  status: 'entered-in-error',
  category: LAB,
  code: { coding: [{ system: LOINC, code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' }], text: 'Hemoglobin A1c/Hemoglobin.total in Blood' },
  subject: WEBB,
  encounter: { reference: `Encounter/${id('enc-t6-webb-0928')}` },
  effectiveDateTime: '2026-09-28T09:01:27-04:00',
  issued: '2026-09-28T14:02:32.718-04:00',
  performer: [CLINIC],
  valueQuantity: q(6.9, '%'),
  interpretation: HIGH,
  referenceRange: range(4, 5.6, '%'),
  note: [{ text: "Entered in error: the result was reported on the wrong patient (a sample-rack mix-up at the analyzer); this patient's specimen was not tested." }],
} as Resource;

const wrote = (patient: string) => ({ kind: 'after_write', patient }) as const;

export const SPECS: readonly EventSpec[] = [
  { id: 'odum-o1', item: `Task/${id('task-t6-m3')}`, class: 'O', trigger: wrote('pt-0027'), resources: [odumO1], stampFields: [`DocumentReference/${ARRIVAL.odumO1}.date`] },
  {
    id: 'price-b1',
    item: `Task/${id('task-t6-m9')}`,
    class: 'B',
    trigger: wrote('pt-0030'),
    resources: [priceCr, priceEgfr, pricePanel],
    stampFields: [`Observation/${ARRIVAL.priceB1.cr}.issued`, `Observation/${ARRIVAL.priceB1.egfr}.issued`, `DiagnosticReport/${ARRIVAL.priceB1.panel}.issued`],
  },
  { id: 'price-d1', item: `Task/${id('task-t6-m11')}`, class: 'D', trigger: wrote('pt-0030'), resources: [priceD1], stampFields: [`Communication/${ARRIVAL.priceD1}.sent`, `Communication/${ARRIVAL.priceD1}.received`] },
  { id: 'price-b2', item: `Task/${id('task-t6-m10')}`, class: 'B', trigger: wrote('pt-0030'), resources: [priceB2], stampFields: [] },
  {
    id: 'webb-c1',
    item: `Task/${id('task-t6-m12')}`,
    class: 'C',
    trigger: wrote('pt-0031'),
    resources: [webbK, webbPanel, ...webbRest, webbEgfr],
    stampFields: [webbK, webbPanel, ...webbRest, webbEgfr].map((r) => `${r.resourceType}/${r.id}.issued`),
  },
  { id: 'webb-b2', item: `Task/${id('task-t6-m13')}`, class: 'B', trigger: wrote('pt-0031'), resources: [webbB2], stampFields: [] },
  // W5-E A: the focus is the potassium; the panel is the second resource, the other analytes and
  // the eGFR follow.
  {
    id: 'webb-a1',
    item: `Task/${id('task-t6-m12')}`,
    class: 'A',
    trigger: wrote('pt-0031'),
    resources: [webbA1K, webbA1Panel, ...webbA1Rest, webbA1Egfr],
    stampFields: [webbA1K, webbA1Panel, ...webbA1Rest, webbA1Egfr].map((r) => `${r.resourceType}/${r.id}.issued`),
  },
  // W5-E reserve: in SPECS only with its patient; the focus is the corrected creatinine, the
  // recalculated eGFR the second resource.
  ...(LEVER.includes('reserve')
    ? [
        {
          id: 'mercer-b1',
          item: `Task/${idOf('task-t6-m16')}`,
          class: 'B' as const,
          trigger: wrote(MERCER_ID),
          resources: [mercerCr, mercerEgfr, mercerPanel],
          stampFields: [`Observation/${ARRIVAL.mercerB1.cr}.issued`, `Observation/${ARRIVAL.mercerB1.egfr}.issued`, `DiagnosticReport/${ARRIVAL.mercerB1.panel}.issued`],
        },
      ]
    : []),
];

// The lever specs (plan-amendment-w5 G1): the event each lever id activates (W5-H LEVER_ITEMS.spec).
export const LEVER_SPECS: Readonly<Record<string, readonly string[]>> = { A: ['webb-a1'], reserve: ['mercer-b1'] };
// Specs that are never active together: the re-specified redraw replaces the W4 one.
export const EXCLUSIVE: ReadonlyArray<readonly [string, string]> = [['webb-c1', 'webb-a1']];
// pilot-4a's four (plan-amendment-w4, Sizing), with webb-a1 in place of webb-c1 while 'A' is in
// LEVER, and the reserve's event while it is.
export const ACTIVE: readonly string[] = ['odum-o1', 'price-b1', 'price-d1', LEVER.includes('A') ? 'webb-a1' : 'webb-c1', ...(LEVER.includes('reserve') ? ['mercer-b1'] : [])];
