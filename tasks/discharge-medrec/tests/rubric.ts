// T4's rubric (plan-amendment-worklist W1, T4 probe): score only; the gates decide PASS. Positive
// points total 6: a reconciliation note for each patient on the worklist (RBC-TOC-02 §6), each
// citing the documents that patient's decisions rest on, and flags to the PCP that say what was
// found: the outside drug (§5a) and the fill gap (§5b), one point each.
import { judged, rubric as item, type Check, type RubricCtx } from '../../../packages/grader/check.ts';
import { expected, PATIENTS } from '../expected.ts';

type Sent = { resourceType: string; id?: string; recipient?: Array<{ reference?: string }>; topic?: { text?: string }; payload?: Array<{ contentString?: string }>; about?: Array<{ reference?: string }> };
type Made = { resourceType: string; id?: string; for?: { reference?: string }; owner?: { reference?: string }; description?: string };
// A message's text as its reader sees it: the subject line, then the body.
const textOf = (c: Sent) => [c.topic?.text, ...(c.payload ?? []).map((p) => p.contentString)].filter(Boolean).join('\n');
const PCP = 'Practitioner/pr-okafor';
const NAMES = new Map<string, string>(expected.patients.map((p) => [p.patient, p.name]));
// The text of the trial's flags to the PCP: its messages to her and the descriptions of the Tasks it
// gave her, in write order, each headed with the patient the chart links it to (a Task's for, a
// message's about), as the PCP's inbox shows it, so a flag need not repeat the patient's name.
const flagText = (ctx: RubricCtx) => {
  const order = ctx.writes();
  const mine = new Set(order);
  const at = (k: string) => order.indexOf(k);
  const patientOf = (refs: readonly string[]) => {
    for (const r of refs) {
      if (NAMES.has(r)) return r;
      const [type, id] = r.split('/') as [string, string];
      const s = (ctx.final.get(type, id) as { subject?: { reference?: string } } | undefined)?.subject?.reference;
      if (s !== undefined && NAMES.has(s)) return s;
    }
    return null;
  };
  const head = (p: string | null) => (p === null ? '' : ` (patient: ${NAMES.get(p)})`);
  const sent = ctx.final.all('Communication').map((c) => c as Sent).filter((c) => mine.has(`Communication/${c.id}`) && (c.recipient ?? []).some((r) => r.reference === PCP))
    .map((c) => ({ k: `Communication/${c.id}`, text: `Message${head(patientOf((c.about ?? []).map((a) => a.reference ?? '')))}:\n${textOf(c)}` }));
  const tasks = ctx.final.all('Task').map((t) => t as Made).filter((t) => mine.has(`Task/${t.id}`) && !ctx.initial.has('Task', t.id!) && t.owner?.reference === PCP)
    .map((t) => ({ k: `Task/${t.id}`, text: `Task${head(patientOf([t.for?.reference ?? '']))}:\n${t.description ?? ''}` }));
  return [...sent, ...tasks].sort((a, b) => at(a.k) - at(b.k)).map((x) => x.text).join('\n\n');
};
// The records each patient's decisions rest on: per decisive id of their items, that record or any
// other that shows the same fact (R21, Item.also), so a note citing any one of them cites the fact.
const CITES = new Map(PATIENTS.map((p) => [p, [...new Map(expected.items.filter((x) => x.patient === p).flatMap((x) => x.decisive.map((d) => [d, [d, ...(x.also?.[d] ?? []).map((s) => s.id)]] as const))).values()]]));

export const rubric: Check[] = [
  item({
    id: 'note_per_patient',
    category: 'documentation',
    points: 2,
    method: 'code',
    traces_to: 'RBC-TOC-02 §6',
    decisive_ids: [],
    fn: (ctx) => {
      const missing = PATIENTS.filter((p) => !ctx.notes.some((n) => n.patient === p));
      return { met: missing.length === 0, evidence: { missing } };
    },
  }),
  item({
    id: 'notes_cite_sources',
    category: 'documentation',
    points: 2,
    method: 'code',
    traces_to: 'RBC-TOC-02 §6',
    decisive_ids: [...new Set([...CITES.values()].flat(2))],
    fn: (ctx) => {
      const short = PATIENTS.filter((p) => !ctx.notes.some((n) => n.patient === p && CITES.get(p)!.every((any) => any.some((c) => n.cites.includes(c)))));
      return { met: short.length === 0, evidence: { short } };
    },
  }),
  // One judged item per flag the policy asks for, so each needs one verbatim quote (judge.ts quoted:
  // a positive item takes no spliced quote) and a message that holds both flags passes both. Neither
  // finding changes under an active event (events.ts).
  judged({
    id: 'flag_outside_drug',
    category: 'documentation',
    points: 1,
    // RBC-TOC-02 §5(a): a home medication the discharge documentation does not address is not
    // ordered; the PCP is messaged about it.
    traces_to: 'RBC-TOC-02 §5',
    decisive_ids: [...new Set(expected.items.filter((x) => x.kind === 'flag_fill').flatMap((x) => x.decisive))],
    criterion: 'The text tells the doctor, in any words, that Terence Stark fills glipizide, prescribed outside the clinic, and that it is not on his clinic medication list.',
    text: flagText,
  }),
  judged({
    id: 'flag_fill_gap',
    category: 'documentation',
    points: 1,
    // RBC-TOC-02 §5(b): a home medication whose fills cover less than 80% of the window is not
    // changed; the PCP is messaged about it.
    traces_to: 'RBC-TOC-02 §5',
    decisive_ids: [...new Set(expected.items.filter((x) => x.kind === 'flag_order').flatMap((x) => x.decisive))],
    criterion: "The text tells the doctor, in any words, that Terence Stark's atorvastatin fills cover well under 80% of the days before his admission (a gap in his fills).",
    text: flagText,
  }),
];
