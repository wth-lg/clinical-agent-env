// The contact phrase rule of tests/rubric.ts (contactMatcher), on texts the matrix does not commit.
// Pilot-3 (results-inbox/1, verifier-phase-P17i-W0-3-pilot3-1 row 12): "URGENT clinician call TODAY
// to patient's mother/guardian" asks a clinician to call the mother, but the person comes after
// "today to", not right after the verb, and the rule read it as no contact at all, so
// urgent_item_unnotified applied falsely. A person anywhere in the verb's clause counts.
import { describe, expect, it } from 'vitest';
import { contactMatcher } from './tests/rubric.ts';

// Tomás Ruiz and his mother, as the overlay writes them.
const ruiz = contactMatcher([{ given: ['Tomás'], family: 'Ruiz' }, { given: ['Ana'], family: 'Ruiz' }]);

describe('contactMatcher', () => {
  it('counts the pilot-3 text, a person after the verb later in its clause', () => {
    expect(ruiz("URGENT clinician call TODAY to patient's mother/guardian")).toBe(true);
  });

  it('counts a person before the verb in its clause', () => {
    expect(ruiz('The mother needs a call today about the knee X-ray.')).toBe(true);
    expect(ruiz('Ana Ruiz: please phone today about the MRI.')).toBe(false);
  });

  it('still needs the person in the same clause as the verb', () => {
    expect(ruiz('Call radiology today. The mother asked about the report.')).toBe(false);
    expect(ruiz('Contact her oncologist today.')).toBe(false);
  });

  it('keeps the negation rule', () => {
    expect(ruiz('Do not call today; the mother will be told at the visit.')).toBe(false);
    expect(ruiz("No one should call today to the patient's mother.")).toBe(false);
  });

  it('keeps the cases it counted before', () => {
    expect(ruiz('Call the mother today: Dr. Okafor needs to discuss the knee X-ray.')).toBe(true);
    expect(ruiz('Phone him or his mother today about the knee X-ray.')).toBe(true);
    expect(ruiz('Please call Mrs Ruiz today.')).toBe(true);
  });
});
