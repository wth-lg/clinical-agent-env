// T3's expected end state, computed from the initial world by RBC-QM-02 (design section 4,
// "Double derivation"): the members of the group the instruction names, each one's age at the
// end of the measurement period (§2), the screening that counts in calendar years (§3: a test
// done, a stool test by its collection date), the exclusions (§4, a total colectomy found in coded
// data or in the text of a note; hospice care during any part of the period; long-term nursing
// home residence as CMS130v14 reads it, the newest housing status assessment), and the outreach
// (§5: an order and a message for each open gap and for no one else), and the records each
// member's decision rests on. It never imports expected.ts or overlay constants (lint:
// no-policy-expected-import).
import type { Json } from '../../packages/grader/check.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { isActive, isDrug, type MedicationRequest } from '../../packages/grader/normalize.ts';

const GROUP_NAME = 'Okafor CRC 2026';
const YEAR = 2026;
const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';

const COLONOSCOPY = ['73761001'];
const SIGMOIDOSCOPY_OR_CTC = ['44441009', '418714002'];
const COLECTOMY = ['26390003'];
const FOBT = ['2335-8', '29771-3', '57905-2', '58453-2', '80372-6', '27396-1', '12503-9'];
const SDNA = ['77354-9', '77353-1'];
const COLORECTAL_CANCER = ['363406005', '363351006', '93761005', '109838007'];
const FRAILTY = ['248279007'];
// A short list from the measure's advanced illness value set: heart failure, COPD, dementia,
// end-stage kidney and liver disease, metastatic and pancreatic cancer.
const ADVANCED_ILLNESS = ['84114007', '13645005', '185086009', '52448006', '26929004', '433146000', '19943007', '128462008', '363418001'];
const DEMENTIA_MEDICATIONS = ['donepezil', 'galantamine', 'rivastigmine', 'memantine'];
const HOSPICE = ['385763009'];
const PALLIATIVE = ['103735009'];
// CMS130v14 'Is Age 66 or Older Living Long Term in a Nursing Home': the last 'Housing status'
// assessment (LOINC 71802-3) on or before the end of the period has the result 'Lives in nursing
// home (finding)' (SNOMED 160734000).
const HOUSING_STATUS = ['71802-3'];
const LIVES_IN_NURSING_HOME = ['160734000'];
const FIT_ORDER = [['urn:riverbend:orders', 'LAB-FIT-KIT'], ...FOBT.map((c) => [LOINC, c])];
// A skilled nursing stay (Synthea's encounter type) that ended in a discharge home (NUBC 01 home
// or self care, 06 home health): with its discharge summary, it settles where the patient lives as
// the housing status does (§7, ruling R21).
const SNF_STAY = ['25675004'];
const NUBC = 'http://www.nubc.org/patient-discharge';
const DISCHARGED_HOME = ['01', '06'];
// The words a note uses for a total colectomy (§4), and a discharge summary for a stay that ended
// at home (§7, R21); policy reads the first, and both are a decisive note's atoms (R29).
const TOTAL_COLECTOMY = /\btotal\s+(?:procto)?colectomy\b/i;
const DISCHARGED_HOME_TEXT = /\bdischarged\s+(?:to\s+)?home\b/i;
// The searches that show a gap is open (rulings R20, R27, R31; expected.ts Absence): one per kind of
// record whose presence would close it, with every code ('system|code'), category and status this
// derivation counts for that kind, so a search whose filters would hide one does not count. Every
// gap rests on the absence of each screening kind §3 counts in its window, and on the absence of
// the §4 exclusion the reason it stays open turns on: a hospice or palliative care episode in the
// period for a hospice episode that ended before it; a total colectomy, coded or in the text of a
// note, at any time, for a partial one; an advanced illness diagnosis and a dementia medication for
// frailty without either. Stool tests are laboratory results counted final, amended or corrected
// (`tests` below); procedures count completed and carry no category; a hospice episode counts
// planned, active, on hold or finished and a palliative care episode active, on hold or finished
// (§4; CMS130v14 counts a hospice order authored in the period but has no palliative care order
// element: verifier-W1-probe-T3-clinical-4 N1), so a search must keep all four; EpisodeOfCare
// takes no code or category; notes count unless entered in error; a medication order counts in
// any status (taken in the window, `dementiaMed` below) and is matched by ingredient, so no code
// filter can name it. A kind counted at any time, or whose type fhir_search dates by a field a
// record may lack (a Condition has no date; a MedicationRequest is dated by its dosage timing),
// has no window start (null): no date filter counts.
const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';
const RESULTED = ['final', 'amended', 'corrected'];
const HOSPICE_STATUSES = ['planned', 'active', 'onhold', 'finished'];
const PALLIATIVE_STATUSES = ['active', 'onhold', 'finished'];
// The statuses in which either kind counts: the filter a search of care episodes must keep.
const EPISODE_STATUSES = [...new Set([...HOSPICE_STATUSES, ...PALLIATIVE_STATUSES])];
const NOTE_STATUSES = ['current', 'superseded'];
const MEDICATION_STATUSES = ['active', 'on-hold', 'cancelled', 'completed', 'entered-in-error', 'stopped', 'draft', 'unknown'];
const tok = (system: string, codes: readonly string[]) => codes.map((c) => `${system}|${c}`);
type Absence = { type: string; from: string | null; codes: string[]; categories: string[]; statuses: string[] };
const procedureAbsence = (years: number | null, codes: readonly string[]): Absence => ({ type: 'Procedure', from: years === null ? null : `${YEAR - years}-01-01`, codes: tok(SNOMED, codes), categories: [], statuses: ['completed'] });
const testAbsence = (years: number, codes: readonly string[]): Absence => ({ type: 'Observation', from: `${YEAR - years}-01-01`, codes: tok(LOINC, codes), categories: tok(OBSERVATION_CATEGORY, ['laboratory']), statuses: RESULTED });
const SCREENING_ABSENCES: Absence[] = [procedureAbsence(9, COLONOSCOPY), procedureAbsence(4, SIGMOIDOSCOPY_OR_CTC), testAbsence(0, FOBT), testAbsence(2, SDNA)];
const EXCLUSION_ABSENCES: Readonly<Record<string, Absence[]>> = {
  hospice_before_period: [{ type: 'EpisodeOfCare', from: `${YEAR}-01-01`, codes: [], categories: [], statuses: EPISODE_STATUSES }],
  partial_colectomy: [procedureAbsence(null, COLECTOMY), { type: 'DocumentReference', from: null, codes: [], categories: [], statuses: NOTE_STATUSES }],
  frailty_without_advanced_illness: [
    { type: 'Condition', from: null, codes: tok(SNOMED, ADVANCED_ILLNESS), categories: [], statuses: [] },
    { type: 'MedicationRequest', from: null, codes: [], categories: [], statuses: MEDICATION_STATUSES },
  ],
};

type R = Readonly<Record<string, unknown>> & { resourceType: string; id?: string };
type Concept = { coding?: Array<{ system?: string; code?: string }>; text?: string };
type Ref = { reference?: string };

const coded = (c: Concept | undefined, system: string, codes: readonly string[]) => (c?.coding ?? []).some((x) => x.system === system && codes.includes(x.code ?? ''));
const yearOf = (d: string | undefined) => (d ? Number(d.slice(0, 4)) : NaN);
// §4: a hospice episode in a status it counts in, or a palliative care episode in one it counts in.
const careGiven = (e: { status?: string; type?: Concept[] }) =>
  (e.type ?? []).some((t) => coded(t, SNOMED, HOSPICE)) ? HOSPICE_STATUSES.includes(e.status ?? '')
  : (e.type ?? []).some((t) => coded(t, SNOMED, PALLIATIVE)) && PALLIATIVE_STATUSES.includes(e.status ?? '');
const of = (world: WorldView, type: string, patient: string, field = 'subject') => (world.all(type) as readonly R[]).filter((r) => (r[field] as Ref | undefined)?.reference === patient);

function decodeNote(r: R): string {
  const content = (r.content as Array<{ attachment?: { contentType?: string; data?: string } }> | undefined) ?? [];
  return content
    .filter((c) => (c.attachment?.contentType ?? '').startsWith('text/') && c.attachment?.data)
    .map((c) => new TextDecoder().decode(Uint8Array.from(atob(c.attachment!.data!), (ch) => ch.charCodeAt(0))))
    .join('\n');
}

export function derive(world: WorldView): Json {
  const group = (world.all('Group') as ReadonlyArray<R & { name?: string; member?: Array<{ entity?: Ref }> }>).find((g) => g.name === GROUP_NAME);
  if (!group) throw new Error(`no Group named ${GROUP_NAME}`);
  const members = (group.member ?? []).map((m) => m.entity?.reference ?? '').sort();

  return {
    group: `Group/${group.id}`,
    period: { start: `${YEAR}-01-01`, end: `${YEAR}-12-31` },
    items: members.map((ref) => {
      const p = world.get('Patient', ref.slice(8)) as (R & { birthDate?: string; name?: Array<{ use?: string; given?: string[]; family?: string }> }) | undefined;
      if (!p?.birthDate) throw new Error(`${ref}: no birth date`);
      const name = p.name?.find((n) => n.use === 'official') ?? p.name?.[0];
      // §2: the age reached in YEAR, since every birthday falls by 31 December.
      const age = YEAR - yearOf(p.birthDate);

      const procedures = of(world, 'Procedure', ref).filter((r) => r.status === 'completed') as ReadonlyArray<R & { code?: Concept; performedDateTime?: string }>;
      const tests = of(world, 'Observation', ref).filter((r) => RESULTED.includes(r.status as string)) as ReadonlyArray<R & { code?: Concept; effectiveDateTime?: string; valueCodeableConcept?: Concept }>;
      const conditions = of(world, 'Condition', ref) as ReadonlyArray<R & { code?: Concept; onsetDateTime?: string; abatementDateTime?: string; verificationStatus?: Concept }>;
      const meds = of(world, 'MedicationRequest', ref) as ReadonlyArray<R & MedicationRequest & { authoredOn?: string }>;
      const episodes = of(world, 'EpisodeOfCare', ref, 'patient') as ReadonlyArray<R & { status?: string; type?: Concept[]; period?: { start?: string; end?: string } }>;
      const orders = of(world, 'ServiceRequest', ref) as ReadonlyArray<R & { status?: string; code?: Concept; authoredOn?: string }>;
      const notes = of(world, 'DocumentReference', ref).filter((r) => r.status !== 'entered-in-error');

      // §3, newest first within each kind.
      const latest = <T extends R>(rs: readonly T[], date: (r: T) => string | undefined) => [...rs].sort((a, b) => (date(b) ?? '').localeCompare(date(a) ?? ''))[0];
      const colonoscopy = latest(procedures.filter((r) => coded(r.code, SNOMED, COLONOSCOPY)), (r) => r.performedDateTime);
      const ctc = latest(procedures.filter((r) => coded(r.code, SNOMED, SIGMOIDOSCOPY_OR_CTC)), (r) => r.performedDateTime);
      const fobt = latest(tests.filter((r) => coded(r.code, LOINC, FOBT)), (r) => r.effectiveDateTime);
      const sdna = latest(tests.filter((r) => coded(r.code, LOINC, SDNA)), (r) => r.effectiveDateTime);
      const within = (d: string | undefined, years: number) => yearOf(d) >= YEAR - years && yearOf(d) <= YEAR;
      const screening =
        fobt && within(fobt.effectiveDateTime, 0) ? 'fobt'
        : sdna && within(sdna.effectiveDateTime, 2) ? 'sdna_fit'
        : ctc && within(ctc.performedDateTime, 4) ? 'ct_colonography'
        : colonoscopy && within(colonoscopy.performedDateTime, 9) ? 'colonoscopy'
        : null;
      // Why a member with no current screening has none: the newest expired test, if any.
      const expired = [
        colonoscopy && { reason: 'colonoscopy_expired', date: colonoscopy.performedDateTime, id: `Procedure/${colonoscopy.id}` },
        sdna && { reason: 'sdna_fit_expired', date: sdna.effectiveDateTime, id: `Observation/${sdna.id}` },
        fobt && { reason: 'fobt_expired', date: fobt.effectiveDateTime, id: `Observation/${fobt.id}` },
        ctc && { reason: 'ct_colonography_expired', date: ctc.performedDateTime, id: `Procedure/${ctc.id}` },
      ].filter((x): x is { reason: string; date: string; id: string } => Boolean(x)).sort((a, b) => b.date.localeCompare(a.date))[0];

      // §4
      const inPeriodOrYearBefore = (c: { onsetDateTime?: string; abatementDateTime?: string }) => yearOf(c.onsetDateTime) <= YEAR && !(yearOf(c.abatementDateTime) < YEAR - 1);
      const confirmed = conditions.filter((c) => !coded(c.verificationStatus, 'http://terminology.hl7.org/CodeSystem/condition-ver-status', ['entered-in-error', 'refuted']));
      const colectomy =
        procedures.some((r) => coded(r.code, SNOMED, COLECTOMY)) || notes.some((n) => TOTAL_COLECTOMY.test(decodeNote(n)));
      const cancer = confirmed.some((c) => coded(c.code, SNOMED, COLORECTAL_CANCER));
      const hospice = episodes.some(
        (e) => careGiven(e) && yearOf(e.period?.start) <= YEAR && !(yearOf(e.period?.end) < YEAR),
      );
      const frail = confirmed.some((c) => coded(c.code, SNOMED, FRAILTY) && yearOf(c.onsetDateTime) <= YEAR && !(yearOf(c.abatementDateTime) < YEAR));
      const advancedDx = confirmed.some((c) => coded(c.code, SNOMED, ADVANCED_ILLNESS) && inPeriodOrYearBefore(c));
      const housing = latest(tests.filter((r) => coded(r.code, LOINC, HOUSING_STATUS) && yearOf(r.effectiveDateTime) <= YEAR), (r) => r.effectiveDateTime);
      const nursingHome = coded(housing?.valueCodeableConcept, SNOMED, LIVES_IN_NURSING_HOME);
      const dementiaMed = meds.some((m) => DEMENTIA_MEDICATIONS.some((ingredient) => isDrug(m.medicationCodeableConcept, { ingredient })) && (isActive(m) || yearOf(m.authoredOn) >= YEAR - 1));
      const exclusion =
        colectomy ? 'total_colectomy'
        : cancer ? 'colorectal_cancer'
        : hospice ? 'hospice'
        : age >= 66 && nursingHome ? 'nursing_home'
        : age >= 66 && frail && dementiaMed ? 'frailty_dementia_medication'
        : age >= 66 && frail && advancedDx ? 'frailty_advanced_illness'
        : null;

      // §5
      const activeFit = orders.some((o) => o.status === 'active' && FIT_ORDER.some(([s, c]) => coded(o.code, s!, [c!])));
      // The records weighed for a member whose status they leave unchanged: a colonoscopy order or
      // appointment with no colonoscopy done since (§3: only a test done counts), a partial
      // colectomy (§4: only a total one excludes), a hospice episode that ended before the period,
      // frailty with a dementia medication outside the period and the year before it, and the
      // newest housing status of a member 66 or older that is not a nursing home.
      const colonoscopyOrders = orders.filter((o) => o.status !== 'entered-in-error' && coded(o.code, SNOMED, COLONOSCOPY));
      const notDone = colonoscopyOrders.filter((o) => !procedures.some((p) => coded(p.code, SNOMED, COLONOSCOPY) && (p.performedDateTime ?? '') >= (o.authoredOn ?? '')));
      const appointments = (world.all('Appointment') as ReadonlyArray<R & { basedOn?: Ref[]; status?: string }>).filter((a) => (a.basedOn ?? []).some((b) => notDone.some((o) => b.reference === `ServiceRequest/${o.id}`)));
      const partial = procedures.filter((r) => /\bcolectomy\b/i.test(r.code?.text ?? '') && !coded(r.code, SNOMED, COLECTOMY) && !/\btotal\b/i.test(r.code?.text ?? ''));
      const endedHospice = episodes.filter((e) => careGiven(e) && yearOf(e.period?.end) < YEAR);
      const frailty = confirmed.find((c) => coded(c.code, SNOMED, FRAILTY));
      const staleDementiaMeds = meds.filter((m) => DEMENTIA_MEDICATIONS.some((ingredient) => isDrug(m.medicationCodeableConcept, { ingredient })) && !isActive(m) && yearOf(m.authoredOn) < YEAR - 1);
      const id = (r: R) => `${r.resourceType}/${r.id}`;
      // §7, ruling R21: a skilled nursing stay that ended in a discharge home, and the notes written
      // for that stay, show where the patient lives as the housing status does.
      const homeStays = (of(world, 'Encounter', ref) as ReadonlyArray<R & { type?: Concept[]; hospitalization?: { dischargeDisposition?: Concept } }>).filter(
        (e) => (e.type ?? []).some((t) => coded(t, SNOMED, SNF_STAY)) && coded(e.hospitalization?.dischargeDisposition, NUBC, DISCHARGED_HOME),
      );
      const homeNotes = notes.filter((n) => ((n.context as { encounter?: Ref[] } | undefined)?.encounter ?? []).some((e) => homeStays.some((h) => e.reference === id(h))));
      let status: string, reason: string, decisive: string[];
      if (age < 46) [status, reason, decisive] = ['not_in_population', 'age_under_46', [ref]];
      else if (age > 75) [status, reason, decisive] = ['not_in_population', 'age_over_75', [ref]];
      else if (exclusion) {
        [status, reason] = ['excluded', exclusion];
        decisive =
          exclusion === 'total_colectomy' ? [...procedures.filter((r) => coded(r.code, SNOMED, COLECTOMY)), ...notes.filter((n) => TOTAL_COLECTOMY.test(decodeNote(n)))].map(id)
          : exclusion === 'hospice' ? episodes.filter((e) => careGiven(e) && !(yearOf(e.period?.end) < YEAR)).map(id)
          : exclusion === 'nursing_home' ? [id(housing!)]
          : exclusion.startsWith('frailty') ? [id(frailty!), ...meds.filter((m) => DEMENTIA_MEDICATIONS.some((ingredient) => isDrug(m.medicationCodeableConcept, { ingredient })) && (isActive(m) || yearOf(m.authoredOn) >= YEAR - 1)).map(id)]
          : [];
      } else if (screening) {
        [status, reason] = ['met', screening];
        const record = { fobt, sdna_fit: sdna, ct_colonography: ctc, colonoscopy }[screening]!;
        decisive = [id(record)];
      } else {
        status = 'gap';
        // Why the gap is open, and the one record whose reading decides it (ruling R1): the missed
        // appointment, else the open order; the expired test; the partial colectomy; the hospice
        // episode that ended before the period; the latest dementia medication order outside the
        // window; the housing status, or any record of a stay that ended at home (R21: any one of
        // them settles it); else the birth date that puts the member in the population.
        [reason, decisive] =
          activeFit ? ['active_fit_order', []]
          : notDone.length ? ['colonoscopy_not_done', (appointments.length ? appointments : notDone).map(id)]
          : expired ? [expired.reason, [expired.id]]
          : partial.length ? ['partial_colectomy', partial.map(id)]
          : endedHospice.length ? ['hospice_before_period', endedHospice.map(id)]
          : age >= 66 && frailty ? ['frailty_without_advanced_illness', staleDementiaMeds.length ? [id(latest(staleDementiaMeds, (m) => m.authoredOn)!)] : [id(frailty)]]
          : age >= 66 && housing ? ['not_nursing_home', [id(housing), ...homeNotes.map(id), ...homeStays.map(id)]]
          : ['no_screening', [ref]];
      }
      // The atoms of each decisive note's deciding line (ruling R29): the words that settle the
      // member, as the note writes them. A total colectomy note names the operation; a stay's
      // discharge summary names the discharge home. A decisive record without atoms is seen by
      // exposure.
      const atoms: Record<string, string[]> = {};
      for (const n of notes.filter((x) => decisive.includes(id(x)))) {
        const line = reason === 'total_colectomy' ? TOTAL_COLECTOMY.exec(decodeNote(n)) : reason === 'not_nursing_home' ? DISCHARGED_HOME_TEXT.exec(decodeNote(n)) : null;
        if (line) atoms[id(n)] = [line[0].replace(/\s+/g, ' ')];
      }
      // An order and a message for each open gap without an active FIT order, and for no one else.
      const required = status === 'gap' && !activeFit;
      const order = required;
      const message = activeFit ? null : required;
      return {
        patient: ref,
        name: [...(name?.given ?? []), name?.family ?? ''].join(' ').trim(),
        family: name?.family ?? '',
        age,
        status,
        reason,
        order,
        message,
        decisive,
        atoms,
        evidence: status === 'gap' && reason === 'not_nursing_home' ? 'any' : 'all',
        absences: status === 'gap' ? [...SCREENING_ABSENCES, ...(EXCLUSION_ABSENCES[reason] ?? [])] : [],
      };
    }),
  };
}
