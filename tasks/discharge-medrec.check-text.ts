// discharge-medrec's gate checks in words (packages/core/explain.ts CheckText): what each one
// requires, and the first difference its evidence (tests/grader.ts) shows. The Tasks view and the
// failure reasons read it. It sits beside the task directory, not in it, so neither task version
// covers it: rewording it regrades nothing. Each failed item of an item gate also carries its own
// why (packages/grader/items.ts), which the trial page lists.
import { fields, items, show, type CheckText } from '../packages/core/explain.ts';
import { expected } from './discharge-medrec/expected.ts';

const N = expected.items.length;

export const checkText: CheckText = {
  med_actions: {
    requires: `each of the ${N} worklist items ends where RBC-TOC-02 puts it: dose changes on the existing order at the addendum's or the discharge line's dose, stops, home drugs kept over inpatient substitutes, a held ACE inhibitor held (with a PCP Task) or resumed by the most recent potassium, and each flag the policy asks for sent to the PCP with the order or the fill history in about (a fill-history flag naming its drug); an item with no medication write passes only once its deciding records were seen`,
    found: (ev) => {
      const failed = items(ev.failed_items);
      const why = items(ev.why);
      return `${show(why[0] ?? failed[0])}${failed.length > 1 ? ` (and ${failed.length - 1} more item${failed.length > 2 ? 's' : ''})` : ''}`;
    },
  },
  decisive_seen: {
    requires: "each item's deciding records seen at some step of the trial: the record read whole, or one search snippet showing the facts of the line that decides the item (the discharge summary's line for the item, the signed addendum's correction, the fill history's fill line, the outside lab report's potassium line); a resume also needs a creatinine after discharge that meets its condition, from any record that shows one",
    found: (ev) => {
      const unseen = items(ev.unseen);
      const first = fields(unseen[0]);
      return `${show(items(first.sources)[0])}, which decides ${show(first.item)}, was never seen${unseen.length > 1 ? ` (and ${unseen.length - 1} more item${unseen.length > 2 ? 's' : ''})` : ''}`;
    },
  },
  nothing_else: {
    requires: 'no medication write RBC-TOC-02 forbids: no held potassium-raising drug made active and no new order of a stopped one while potassium is above 5.0 (§7), no inpatient substitute ordered and no kept home drug ended (§3), no second order of a drug (§4), no change to an order whose fills fall short (§5b), no order of a filled drug the clinic never ordered (§5a), no change to or new order of a drug no item of that patient decides, and no medication write for a patient off the list',
    found: (ev) => {
      const extra = items(ev.extra);
      const failed = items(ev.failed_items);
      return `${show(extra[0])} was written${failed[0] !== undefined ? ` (item ${show(failed[0])})` : ''}${extra.length > 1 ? ` (and ${extra.length - 1} more)` : ''}`;
    },
  },
  seen_before_change: {
    requires: "each item's first medication write, and the recheck Task or flag that satisfies it, after the deciding records the trial saw were shown: the discharge summary's line for the item, the signed addendum's correction, the fill history, and the outside lab report's potassium line and a creatinine after discharge where the item rests on them",
    found: (ev) => {
      const late = fields(items(ev.late)[0]);
      return `the ${show(late.item)} write came before ${show(items(late.sources)[0])} was shown`;
    },
  },
};
