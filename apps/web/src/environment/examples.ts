// A working first input for each read tool in the Environment Try panel (ui-polish 4.4): choosing a
// tool fills it in, and it runs on the committed world with no task, as the panel runs it
// (test/try-examples.test.ts runs each one). Harold Vance is the renal-dose-review patient.
export const TRY_EXAMPLES: Record<string, unknown> = {
  get_context: {},
  search_patients: { name: 'Harold Vance' },
  fhir_search: { resource_type: 'Patient', count: 5 },
  fhir_read: { resource_type: 'Patient', id: 'pt-0002' },
  search_notes: { query: 'apixaban', patient: 'pt-0002' },
  // The panel runs with no task, so there are no policies to read; with no id it lists them.
  read_policy: {},
  lookup_catalog: { query: 'apixaban', kind: 'medication' },
  list_inbox: { queue: 'results' },
  calculate: { expression: '(140 - 80) * 70 / (72 * 1.1)' },
};
