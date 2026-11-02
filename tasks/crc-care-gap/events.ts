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
//           outreach message. Deciding fact: the entry's entered-in-error status, and the message.
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
import type { EventSpec } from '../../packages/env/events.ts';
import { id } from './ids.ts';

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
  id: 'comm-e3-5521',
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
  id: 'doc-e3-6804',
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
  id: 'doc-e3-7390',
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '18842-5', display: 'Discharge summary' }], text: 'Discharge summary' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: { reference: 'Patient/pt-0020' },
  custodian: { reference: 'Organization/org-st-brigid' },
  description: 'Outside record',
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(HOSPICE_SUMMARY), title: 'Hospice discharge summary (fax)' } }],
};

const exposed = (key: string) => ({ kind: 'after_exposed', ids: [key] }) as const;

export const SPECS: readonly EventSpec[] = [
  { id: 'crc-b1', item: 'Patient/pt-0009', class: 'B', trigger: exposed(`Condition/${FRAILTY}`), resources: [frailtyMessage, frailtyInError], stampFields: ['Communication/comm-e3-5521.sent'] },
  { id: 'crc-b2', item: 'Patient/pt-0022', class: 'B', trigger: exposed(`Observation/${FIT}`), resources: [fitCorrected], stampFields: [`Observation/${FIT}.issued`] },
  { id: 'crc-o1', item: 'Patient/pt-0024', class: 'O', trigger: exposed(`Observation/${SDNA}`), resources: [harborNotice, sdnaInError], stampFields: ['DocumentReference/doc-e3-6804.date'] },
  { id: 'crc-d1', item: 'Patient/pt-0020', class: 'D', trigger: exposed(`EpisodeOfCare/${HOSPICE}`), resources: [hospiceSummary], stampFields: ['DocumentReference/doc-e3-7390.date'] },
];

export const ACTIVE: readonly string[] = ['crc-b1', 'crc-b2', 'crc-o1', 'crc-d1'];
