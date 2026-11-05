# How the environment differs from a real EHR

The store is an in-memory FHIR R4 store behind eighteen typed tools, nine that read and nine that write. The tools are MCP-shaped definitions: a name, a description and an input schema, in the fixed order the model sees. No MCP server ships; a stdio adapter is a next step. The simplifications below are deliberate and kept.

| area | this environment | a real server |
|---|---|---|
| paging | an integer offset, with `total` always present | R4 Bundle `next` links; Epic a session URL; Oracle a page token |
| unsupported filters | NOT_SUPPORTED names the supported filters | R4 lenient handling ignores them; Oracle ignores `code` when `category` is set |
| errors | a JSON error with a code, a message and a field | an OperationOutcome |
| default sort | oldest first | Oracle sorts newest first |
| `patient` on a search | not required | Oracle requires it for Observation |
| authorization | none, no SMART scopes | SMART App Launch scopes |
| US Core parameters | Condition clinical-status, MedicationRequest intent and authoredon, and `_include` are missing | US Core 9.0.0 requires them |
| withdrawing a write | no path to revoke the agent's own ServiceRequest, Task or note | R4 `revoked` and `entered-in-error` |
| order to appointment | the order carries the link in `ServiceRequest.supportingInfo` | often `Appointment.basedOn` |
| unknown tool | a tool result that says so | a JSON-RPC error |
| tool metadata | no `title`, `annotations` or `outputSchema` | MCP annotations since the 2025-03-26 specification |
| result size | a cap on each tool result, for cost | a larger default in agent harnesses |
| formulas | `calculate` has no clinical formulas, so a renal dose needs recalled formulas | a clinical calculator in the EHR |

Two more facts of the setting matter to the model. The clock of the world is pinned, so every trial starts at the same moment. Arrivals during a trial carry a stamp later than every seed record, and their inbox items take a distinct id form. The policy of each task says to review anything that arrived after the start, so noticing an arrival is the behaviour asked for.
