// The browser tab's title names the view, and the task or trial it shows, so tabs, history and
// bookmarks can be told apart (P25u J13): "Overview · Riverbend", "renal-dose-review · Tasks ·
// Riverbend", "contrast-ct-prep/0 · Runs · Riverbend". A token such as trial=first-nonpass names
// no trial, so the view alone shows until the trial page resolves it (titleOf is for that). The
// key gate keeps the product's full name.
import { describe, expect, it } from 'vitest';
import { BASE_TITLE, documentTitle, titleOf } from './title.ts';

const at = (q: string) => `https://example.test/clinical-agent-env/${q}`;

describe('documentTitle', () => {
  it('names the view', () => {
    expect(documentTitle(at(''))).toBe('Overview · Riverbend');
    expect(documentTitle(at('?view=overview'))).toBe('Overview · Riverbend');
    expect(documentTitle(at('?view=findings'))).toBe('Findings · Riverbend');
    expect(documentTitle(at('?view=glossary'))).toBe('Glossary · Riverbend');
  });

  it('names the task a Tasks or Live trial view shows', () => {
    expect(documentTitle(at('?view=tasks&task=renal-dose-review&tab=prompt'))).toBe('renal-dose-review · Tasks · Riverbend');
    expect(documentTitle(at('?view=live&task=crc-care-gap'))).toBe('crc-care-gap · Live trial · Riverbend');
    expect(documentTitle(at('?view=tasks'))).toBe('Tasks · Riverbend');
  });

  it('names the trial a Runs view shows, but not a token the page still has to resolve', () => {
    expect(documentTitle(at('?view=runs&run=final-1&trial=contrast-ct-prep%2F0'))).toBe('contrast-ct-prep/0 · Runs · Riverbend');
    expect(documentTitle(at('?view=runs&run=final-1&trial=first-nonpass'))).toBe('Runs · Riverbend');
    expect(documentTitle(at('?view=runs&run=final-1'))).toBe('Runs · Riverbend');
  });

  it('falls back to the default view for an unknown one', () => {
    expect(documentTitle(at('?view=nope'))).toBe('Overview · Riverbend');
  });

  it('titleOf joins the parts a view resolves, for the trial page to name the outcome', () => {
    expect(titleOf(['contrast-ct-prep/0 FAIL', 'Runs'])).toBe('contrast-ct-prep/0 FAIL · Runs · Riverbend');
    expect(BASE_TITLE).toBe('Riverbend clinical agent environment');
  });
});
