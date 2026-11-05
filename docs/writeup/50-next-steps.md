# Next steps

With more time, in this order.

1. Add a withdraw path for the agent's own writes. A revoked ServiceRequest, a cancelled own Task and an own note marked entered in error are the three forms.
2. Ship a stdio MCP server over the same tool definitions. A transport contract test checks it, and the tool annotations live there.
3. Calibrate the judge against human labels. Two clinicians read about fifty judge calls, agreement is reported with prevalence, and a second judge from another model family checks the negative items.
4. Add a route and form product rule to medication orders. The same change records the AI actor in Provenance as a Device on behalf of the signed-in clinician.
5. Make the steroid premedication of the contrast task route-aware.
6. Add a reverse traceability report that lists each policy section with no check.
7. Export the tasks in the Harbor format through the MCP server, with measured difficulty in each task's metadata.
8. Add the US Core search parameters the store lacks. They are Condition clinical-status, MedicationRequest intent and authoredon, and `_include`. Then require `patient` on Observation searches, as Oracle does.
9. Run the final sample on every task once the record-integrity lever is set, and publish the official run.
