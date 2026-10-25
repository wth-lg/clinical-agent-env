// TOOLS_VERSION is part of every task's env_version (packages/core/tasks.ts), and a changed tool
// name, description or input schema must bump it (registry.ts, tool-change checklist). This test
// holds the fingerprint of the definitions the model sees at each TOOLS_VERSION, so a change to
// them that forgets the bump fails here. After a bump, add the new version's fingerprint as the
// failure message prints it; never edit an old one.
import { describe, expect, it } from 'vitest';
import { definitions, TOOLS_VERSION } from '../registry.ts';
import { TOOLS } from '../write/index.ts';

const FINGERPRINTS: Record<string, string> = {
  // 4: update_inbox_item's linked no longer names an existing result as closing the loop (P11f (8)).
  '4': 'e46230eac94af0ebe94454a5622b86122327b2a89995922b264f27267178cc56',
  // 5: P17i B2 (R14-08, R14-09, R14-10, R14-11, R14-44): lookup_catalog token rule, fhir_search
  // MedicationRequest date and filters per type, fhir_read Type/id, send_message about, search_patients example;
  // the medication catalog's RxNorm or SNOMED CT codes (pinned before B2 merged, so still 5).
  '5': 'eed986542df2e74d0794dbbdaa2ecb4f7dc0bd2d91d5d637b2a7211a3196dbc9',
};

async function fingerprint(): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(definitions(TOOLS)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('TOOLS_VERSION', () => {
  it('names the tool definitions the model sees: a change to them bumps it', async () => {
    const now = await fingerprint();
    expect(FINGERPRINTS[TOOLS_VERSION], `TOOLS_VERSION ${TOOLS_VERSION} has no recorded fingerprint; the definitions' fingerprint is ${now}`).toBe(now);
  });

  it('update_inbox_item says what closes the loop: the order, task or message, not an existing result', () => {
    const d = definitions(TOOLS).find((t) => t.name === 'update_inbox_item')!.description;
    expect(d).not.toMatch(/existing result/);
    expect(d).toContain('linked names the resources of the same patient that close the loop (the order, task or message)');
  });
});
