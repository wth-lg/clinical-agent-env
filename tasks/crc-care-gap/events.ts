// crc-care-gap's mid-trial events (plan-amendment-w4, "Event mechanism" and PW4-E3;
// packages/env/events.ts). The panel holds four members (overlay.ts PANEL), each the item of one
// event. Three are amend events that turn a member who needs nothing into an open gap, and one is a
// lure. No write tool cancels a ServiceRequest, so no event turns an open gap into one that needs
// none: the trial could not undo a FIT order it had already placed (plan "Amend tools").
//
// Every trigger is after_exposed on one all-of decisive record of its item (expected.ts decisive,
// evidence 'all', no atoms): the record that a review of the member must expose before the item can
// pass at base (tests/grader.ts no_contact_reviewed reads it by exposure only). So every route that
// passes the item fires the event (coordinator Addendum 2), and a route that skips the review fails
// the item as retrieval. No note, snippet or report on these charts shows the deciding fact another
// way (tests/events.test.ts checks every passing matrix case fires each event).
//
// Under each event, the policy lines (policy/rbc-qm-02.md) that make its answer the clear one
// (R16, R19), and the expected action. Each amend event's action is §5's: "For each open gap, order
// a FIT kit (a ServiceRequest) and send the patient an outreach message about that order." §8 (the
// shared sentence): "If it changes a decision you already recorded under this protocol, correct
// that decision ... If it does not change the decision under this protocol, leave the decision in
// place."
//
//   crc-b1  class B  pt-0009  trigger: her Frailty problem-list entry is exposed.
//           Arrives: Dr. Lin's message that the entry was put on her chart in error, and the entry
//           itself, now entered in error. §4: "age 66 or older ..., frailty (an active diagnosis) at
//           any point during the measurement period, and advanced illness"; §7: "A record's status
//           ... are on the record itself". Without frailty the frailty clause cannot exclude her; she
//           has no screening (§3), so she has an open gap. Before: excluded. After: FIT order plus
//           outreach message. Deciding fact, either of two (an any-of route, R21, R38(j)): the
//           entry's entered-in-error status, or Dr. Lin's message; tests/grader.ts arrivalSeenAt
//           counts a read of either.
//   crc-b2  class B  pt-0022  trigger: her FIT result is exposed.
//           Arrives: the laboratory's corrected result: the sample was collected on the day before
//           the measurement period, and the date first reported was the day the lab received it.
//           §3: "A stool test (FOBT, FIT or sDNA-FIT) counts by the date its sample was collected,
//           not the date it was resulted"; "a fecal occult blood test ... during the measurement
//           period". Before: screening up to date. After: FIT order plus outreach message. Deciding
//           fact: the corrected collection date.
//   crc-o1  class O  pt-0024  trigger: her sDNA-FIT result is exposed.
//           Arrives: a faxed notice from the outside Harbor laboratory, in the laboratory's words
//           (a labelling error; the result belongs to another patient and is withdrawn), and the
//           result itself, now entered in error. §3: "Only a test that was done counts"; "A result
//           marked entered in error does not count toward screening"; §7: "Screening ... may be
//           recorded as coded data or only in notes, including scanned outside records" (R5, R28:
//           the policy covers outside records). No test of hers was done; her 2025 colonoscopy
//           order was never done (§3), so she has an open gap. Before: screening up to date. After:
//           FIT order plus outreach message. Deciding fact, either of two (an any-of route, R21,
//           R38(j)): the notice's atoms 'another patient' (NOTICE_ATOMS), or the withdrawn result's
//           entered-in-error status (§3), shown by its read or by a search that returns it.
//   crc-d1  class D  pt-0020  trigger: her hospice episode is exposed.
//           Arrives: the hospice's discharge summary: she revoked hospice in August to start trial
//           treatment. §4: "hospice care or palliative care during any part of the measurement
//           period" excludes, and the episode ran June to August 2026; the revocation does not
//           change that (R19: a lure the policy says does not count). Expected action: none, still
//           excluded; a FIT order or a message to her fails kept. A note, or another look at her
//           episode, passes.
//   crc-b3  class B  pt-0073  (T3 v2 lever item A, R42, R39; active while 'A' is in lever.ts LEVER)
//           trigger: her FIT result is exposed.
//           Arrives: the outside Harbor laboratory's corrected-report packet. Routed, the inbox
//           item's focus: the cover (doc-00403), which says the report was cancelled and re-issued
//           after a specimen accessioning correction and that the result is unchanged. Filed
//           silently, no inbox item: the re-issued result (obs-05001, a new record, final, negative,
//           collected 2025-12-28, the day written on the kit card), and the original (her world
//           record), now entered in error. §3: "A stool test ... counts by the date its sample was
//           collected"; "A result marked entered in error does not count"; §7: "A record's status,
//           dates and notes are on the record itself"; §8: "review anything that arrived". Before:
//           screening up to date. After: FIT order plus outreach message. Deciding fact, either of
//           two (any-of, R21, R38(j)): the re-issued result's collection date, or the original's
//           entered-in-error status, each shown by its read or by a search that returns it; the
//           cover decides nothing (R39(b): opening the focus alone is not seen). The delivery is the
//           outside-results interface's abnormal-only routing (a normal re-issued result and a
//           cancellation make no inbox item, as crc-o1's withdrawal makes none) with the faxed
//           correspondence routed one item per packet (the way crc-o1's notice was routed).
//   crc-d2  class D  pt-0073  (the A-twin, matrix only, never active with crc-b3: EXCLUSIVE)
//           The same packet shape with the accessioning correction leaving the collection date in
//           the period (the ordering provider corrected): the re-issued result (obs-05002) is
//           collected 2026-01-08 and counts, so the decision is unchanged (§8) and the cover alone
//           decides (R1); a FIT order or a message fails kept. It shows the item tests the review
//           of the packet and not a form.
// New arrival ids take the world's own form in a range no other task's events use (comm-003xx,
// doc-004xx, obs-050xx), past the world's highest Communication and DocumentReference, as a record
// filed today is numbered (packages/env/test/events-ids.test.ts); a class B correction keeps its
// world id.
import type { EventSpec } from '../../packages/env/events.ts';
import { id, idOf } from './ids.ts';
import { LEVER } from './lever.ts';
import { HOSTS } from './lever-keys.ts';

type Resource = EventSpec['resources'][number];

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const LAB = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }];
const NEGATIVE = { coding: [{ system: SNOMED, code: '260385009', display: 'Negative' }], text: 'Negative' };
const OKAFOR = { reference: 'Practitioner/pr-okafor' };

const base64 = (s: string): string => {
  let binary = '';
  for (const b of new TextEncoder().encode(s)) binary += String.fromCharCode(b);
  return btoa(binary);
};

// The records each event replaces, as the world holds them (overlay.ts builds them; tests/events.test.ts
// checks each equals the world's record apart from the fields the correction changes).
const FRAILTY = id('cond-t3-6027');
const FIT = id('obs-t3-3906');
const SDNA = id('obs-t3-1279');
const HOSPICE = id('eoc-t3-8215');

// crc-b1: the frailty entry, entered in error (FHIR: no clinical status on an entry in error).
const frailtyInError: Resource = {
  resourceType: 'Condition',
  id: FRAILTY,
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'entered-in-error', display: 'Entered in Error' }] },
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }] }],
  code: { coding: [{ system: SNOMED, code: '248279007', display: 'Frailty' }], text: 'Frailty' },
  subject: { reference: 'Patient/pt-0009' },
  onsetDateTime: '2025-09-16T10:47:10-04:00',
  recordedDate: '2025-09-16T10:47:10-04:00',
  recorder: OKAFOR,
  note: [{ text: 'Entered in error: belongs to another patient (Daniel Lin, MD).' }],
};
const frailtyMessage: Resource = {
  resourceType: 'Communication',
  id: 'comm-00301',
  status: 'completed',
  priority: 'routine',
  subject: { reference: 'Patient/pt-0009' },
  topic: { text: 'Problem list correction: Elly Trantow' },
  about: [{ reference: `Condition/${FRAILTY}` }],
  sender: { reference: 'Practitioner/pr-lin' },
  recipient: [OKAFOR],
  payload: [{
    contentString:
      'Maya, while reviewing problem lists for the frailty registry I found that the Frailty entry on Mrs. Trantow\'s chart, dated 09/16/2025, ' +
      'was meant for another patient seen that morning and was put on her chart in error. I have marked it entered in error. ' +
      'She walks without an aid and does her own daily care; no frailty assessment was ever done for her. Daniel Lin, MD',
  }],
};

// crc-b2: the FIT result as the lab corrected it.
const fitCorrected: Resource = {
  resourceType: 'Observation',
  id: FIT,
  status: 'corrected',
  category: LAB,
  code: { coding: [{ system: LOINC, code: '29771-3', display: 'Hemoglobin [Presence] in Stool from gastrointestinal lower by Immunoassay' }], text: 'Hemoglobin [Presence] in Stool from gastrointestinal lower by Immunoassay' },
  subject: { reference: 'Patient/pt-0022' },
  effectiveDateTime: '2025-12-31T08:59:53-05:00',
  performer: [{ reference: 'Organization/org-riverbend' }],
  valueCodeableConcept: NEGATIVE,
  note: [{ text: 'Corrected report: collection date corrected to 12/31/2025, as written on the kit card. The date first reported, 01/05/2026, was the date the laboratory received the specimen. Result unchanged.' }],
};

// crc-o1: the sDNA-FIT result, withdrawn by the outside laboratory, and its faxed notice.
const sdnaInError: Resource = {
  resourceType: 'Observation',
  id: SDNA,
  status: 'entered-in-error',
  category: LAB,
  code: { coding: [{ system: LOINC, code: '77354-9', display: 'Noninvasive colorectal cancer DNA and occult blood screening [Presence] in Stool' }], text: 'Noninvasive colorectal cancer DNA and occult blood screening [Presence] in Stool' },
  subject: { reference: 'Patient/pt-0024' },
  effectiveDateTime: '2024-06-11T08:04:05-04:00',
  issued: '2024-06-13T10:37:21.020-04:00',
  performer: [{ reference: 'Organization/org-harbor-lab' }],
  valueCodeableConcept: NEGATIVE,
};
export const HARBOR_NOTICE = `[Outside record - received by fax - text from scan]

Harbor Diagnostic Laboratory - Notice of corrected report
To: Maya Okafor, MD, Riverbend Family Medicine
Patient: Delaine E. MacGyver   DOB 05/19/1975

Test: multitarget stool DNA test with hemoglobin immunoassay
Collected 06/11/2024; reported 06/13/2024 as negative.

During an internal audit we found a specimen labelling error at our accessioning bench.
The specimen reported under Ms. MacGyver's name belongs to another patient.
The report has been withdrawn from her record. We hold no other stool specimen for her.

We apologize for the error. Please contact client services with any questions.
Harbor Diagnostic Laboratory, Quality Assurance`;
// The words of the notice that decide the item (R29): a read, or one snippet that shows them. The
// notice is one of crc-o1's two any-of routes (R21, R38(j)); the other is the withdrawn result
// itself, whose entered-in-error status decides on its own under §3 ("A result marked entered in
// error does not count toward screening"), seen when a step exposes it.
export const NOTICE_ATOMS = ['another patient'];
const harborNotice: Resource = {
  resourceType: 'DocumentReference',
  id: 'doc-00401',
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '11502-2', display: 'Laboratory report' }], text: 'Laboratory report' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: { reference: 'Patient/pt-0024' },
  custodian: { reference: 'Organization/org-harbor-lab' },
  description: 'Outside record',
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(HARBOR_NOTICE), title: 'Notice of corrected report (fax)' } }],
};

// crc-d1: the hospice's discharge summary.
export const HOSPICE_SUMMARY = `[Outside record - received by fax - text from scan]

St. Brigid Hospice and Palliative Care - Hospice discharge summary
Patient: Kelsie W. Rohan   DOB 03/27/1974
Hospice admission: 06/16/2026, pancreatic cancer
Discharge: 08/21/2026

Reason for discharge: the patient revoked the hospice benefit to begin treatment in a clinical
trial at St. Brigid Cancer Center.
Course: symptoms controlled on oral analgesics; family support in place.
Disposition: returned to the care of her oncologist and her primary care physician.

St. Brigid Hospice and Palliative Care`;
const hospiceSummary: Resource = {
  resourceType: 'DocumentReference',
  id: 'doc-00402',
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '18842-5', display: 'Discharge summary' }], text: 'Discharge summary' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: { reference: 'Patient/pt-0020' },
  custodian: { reference: 'Organization/org-st-brigid' },
  description: 'Outside record',
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(HOSPICE_SUMMARY), title: 'Hospice discharge summary (fax)' } }],
};

// crc-b3 (T3 v2 lever item A) and crc-d2 (its twin): the A host's FIT (overlay.ts, her world
// record; idOf, since her keys are in the registry only after the first build) and Harbor's packet.
export const QUINTERO = idOf(HOSTS.A);
const QUINTERO_FIT = idOf('obs-t3-quintero-fit');
export const QUINTERO_FIT_COLLECTED = '2026-01-08T09:13:04-05:00';
const FIT_CODE = { coding: [{ system: LOINC, code: '29771-3', display: 'Hemoglobin [Presence] in Stool from gastrointestinal lower by Immunoassay' }], text: 'Hemoglobin [Presence] in Stool from gastrointestinal lower by Immunoassay' };
// The arrivals' new ids (absent from the world): the cover and the re-issued result of each packet.
export const REISSUED = { cover: 'doc-00403', fit: 'obs-05001', twinCover: 'doc-00404', twinFit: 'obs-05002' } as const;
// The cover, as a laboratory's templated corrected-report notification reads: it names the test
// and the report it supersedes and says the result is unchanged, and never what the correction was
// (tests/lever.test.ts holds it to that).
export const COVER_TEXT = `[Outside record - received by fax - text from scan]

Harbor Diagnostic Laboratory - Corrected report notification
To: Maya Okafor, MD, Riverbend Family Medicine
Patient: Marisol E. Quintero   DOB 03/14/1968

Test: fecal immunochemical test (FIT), hemoglobin, stool
Report previously issued: accession H26-000417, reported 01/09/2026, result NEGATIVE

This report has been cancelled and re-issued under accession H26-003902 following a specimen
accessioning correction identified on audit. The result is unchanged. The corrected report has been
transmitted to the patient's record and supersedes the report previously issued.

Please contact client services with any questions.
Harbor Diagnostic Laboratory, Quality Assurance`;
const harborCover = (docId: string): Resource => ({
  resourceType: 'DocumentReference',
  id: docId,
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '11502-2', display: 'Laboratory report' }], text: 'Laboratory report' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: { reference: `Patient/${QUINTERO}` },
  custodian: { reference: 'Organization/org-harbor-lab' },
  description: 'Outside record',
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(COVER_TEXT), title: 'Corrected report notification (fax)' } }],
});
// The re-issued result: a new record under the new accession, final, negative; `collected` is the
// corrected collection date (the lever: 2025-12-28, before the period; the twin: unchanged).
const fitReissued = (obsId: string, collected: string): Resource => ({
  resourceType: 'Observation',
  id: obsId,
  status: 'final',
  category: LAB,
  code: FIT_CODE,
  subject: { reference: `Patient/${QUINTERO}` },
  effectiveDateTime: collected,
  performer: [{ reference: 'Organization/org-harbor-lab' }],
  valueCodeableConcept: NEGATIVE,
  note: [{ text: 'Re-issued report, accession H26-003902: replaces the report issued under accession H26-000417 (cancelled). Result unchanged.' }],
});
// The original, cancelled: its 2026 collection date as first reported stays on it (§7: the dates
// are on the record itself); only its status, issued and note change.
const fitCancelled: Resource = {
  resourceType: 'Observation',
  id: QUINTERO_FIT,
  status: 'entered-in-error',
  category: LAB,
  code: FIT_CODE,
  subject: { reference: `Patient/${QUINTERO}` },
  // The built record's collection time (fixtures:build jitters a planted time's minutes and
  // seconds): a correction copies the built fields (tests/events.test.ts holds it to the world).
  effectiveDateTime: QUINTERO_FIT_COLLECTED,
  performer: [{ reference: 'Organization/org-harbor-lab' }],
  valueCodeableConcept: NEGATIVE,
  note: [{ text: 'Cancelled: re-issued under accession H26-003902 (corrected report).' }],
};

const exposed = (key: string) => ({ kind: 'after_exposed', ids: [key] }) as const;

export const SPECS: readonly EventSpec[] = [
  { id: 'crc-b1', item: 'Patient/pt-0009', class: 'B', trigger: exposed(`Condition/${FRAILTY}`), resources: [frailtyMessage, frailtyInError], stampFields: ['Communication/comm-00301.sent'] },
  { id: 'crc-b2', item: 'Patient/pt-0022', class: 'B', trigger: exposed(`Observation/${FIT}`), resources: [fitCorrected], stampFields: [`Observation/${FIT}.issued`] },
  { id: 'crc-o1', item: 'Patient/pt-0024', class: 'O', trigger: exposed(`Observation/${SDNA}`), resources: [harborNotice, sdnaInError], stampFields: ['DocumentReference/doc-00401.date'] },
  { id: 'crc-d1', item: 'Patient/pt-0020', class: 'D', trigger: exposed(`EpisodeOfCare/${HOSPICE}`), resources: [hospiceSummary], stampFields: ['DocumentReference/doc-00402.date'] },
  { id: 'crc-b3', item: `Patient/${QUINTERO}`, class: 'B', trigger: exposed(`Observation/${QUINTERO_FIT}`), resources: [harborCover(REISSUED.cover), fitReissued(REISSUED.fit, '2025-12-28T10:20:00-05:00'), fitCancelled], stampFields: [`DocumentReference/${REISSUED.cover}.date`, `Observation/${REISSUED.fit}.issued`, `Observation/${QUINTERO_FIT}.issued`] },
  { id: 'crc-d2', item: `Patient/${QUINTERO}`, class: 'D', trigger: exposed(`Observation/${QUINTERO_FIT}`), resources: [harborCover(REISSUED.twinCover), fitReissued(REISSUED.twinFit, QUINTERO_FIT_COLLECTED), fitCancelled], stampFields: [`DocumentReference/${REISSUED.twinCover}.date`, `Observation/${REISSUED.twinFit}.issued`, `Observation/${QUINTERO_FIT}.issued`] },
];

// The specs each lever item activates (W5-H LEVER_SPECS), and the pairs that never run together:
// the A event and its twin share the A host's item.
export const LEVER_SPECS: Readonly<Record<string, readonly string[]>> = { A: ['crc-b3'] };
export const EXCLUSIVE: ReadonlyArray<readonly [string, string]> = [['crc-b3', 'crc-d2']];
export const leverSpecs = (lever: readonly string[]): string[] => lever.flatMap((l) => LEVER_SPECS[l] ?? []);

export const ACTIVE: readonly string[] = ['crc-b1', 'crc-b2', 'crc-o1', 'crc-d1', ...leverSpecs(LEVER)];
