// Task titles without their policy codes (pre-audit U10, P17j JU12 part 2): "... under RBC-PHARM-07"
// moves the code to the card's meta line; a title whose "under ..." names no policy of the task
// keeps its words.
import { describe, expect, it } from 'vitest';
import { liveTaskTitle, policyLine, taskTitle, titleParts } from '../src/tasks/title.ts';

describe('titleParts', () => {
  it('moves a trailing "under <policy id>" of the task to the codes', () => {
    expect(titleParts('Renal and age dose review of Harold Vance under RBC-PHARM-07', ['RBC-PHARM-07'])).toEqual({ title: 'Renal and age dose review of Harold Vance', codes: ['RBC-PHARM-07'] });
    expect(titleParts('Contrast CT order and premedication for Daniel Ferreira under RBC-RAD-07', ['RBC-RAD-07', 'RBC-LAB-03'])).toEqual({ title: 'Contrast CT order and premedication for Daniel Ferreira', codes: ['RBC-RAD-07', 'RBC-LAB-03'] });
  });
  it('keeps words that are not policy ids, and lists the task\'s codes on the meta line', () => {
    expect(titleParts("Clear Dr. Okafor's messages queue under the standing protocols", ['RBC-RX-05'])).toEqual({ title: "Clear Dr. Okafor's messages queue under the standing protocols", codes: ['RBC-RX-05'] });
    expect(titleParts('A title', [])).toEqual({ title: 'A title', codes: [] });
  });
});

// Every place that names a task (Tasks cards, the Overview task list, the trial heading) shows it
// without its codes, and the Overview meta line names them (verifier-phase-P17j-retro-JU12-1 D1).
describe('taskTitle and policyLine', () => {
  it('taskTitle is the title without the task\'s policy codes', () => {
    expect(taskTitle({ title: 'Renal and age dose review of Harold Vance under RBC-PHARM-07', policies: [{ id: 'RBC-PHARM-07' }] })).toBe('Renal and age dose review of Harold Vance');
    expect(taskTitle({ title: "Clear Dr. Okafor's messages queue under the standing protocols", policies: [{ id: 'RBC-RX-05' }] })).toBe("Clear Dr. Okafor's messages queue under the standing protocols");
  });
  it('policyLine counts the policies and names each code', () => {
    expect(policyLine(['RBC-PHARM-07'])).toBe('1 policy: RBC-PHARM-07');
    expect(policyLine(['RBC-RAD-07', 'RBC-LAB-03'])).toBe('2 policies: RBC-RAD-07, RBC-LAB-03');
    expect(policyLine([])).toBe('0 policies');
  });
});

// The live launcher and its headings name a task by its title, never its id (ui-polish 5.1). The
// practice task is not in the task list, so it has a title of its own.
describe('liveTaskTitle', () => {
  const tasks = [{ id: 'renal-dose-review', title: 'Renal and age dose review of Harold Vance under RBC-PHARM-07', policies: [{ id: 'RBC-PHARM-07' }] }];
  it('is the task\'s title, the practice task\'s plain name, or the id for a task it does not know', () => {
    expect(liveTaskTitle('renal-dose-review', tasks)).toBe('Renal and age dose review of Harold Vance');
    expect(liveTaskTitle('_toy', tasks)).toBe('Practice task (write one note)');
    expect(liveTaskTitle('_toy', null)).toBe('Practice task (write one note)');
    expect(liveTaskTitle('unknown-task', tasks)).toBe('unknown-task');
  });
});
