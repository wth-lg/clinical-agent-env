# Findings (sample run)

This is the sample run `sample-1` that the browse tests build against. Its trials are scripted, not model runs, so the numbers say nothing about the model.

## Pass rates

| Task | Passes | Wilson 95% interval |
| --- | --- | --- |
| contrast-ct-prep | 3/12 | 9% to 53% |
| crc-care-gap | 5/12 | 19% to 68% |
| discharge-medrec | 7/12 | 32% to 81% |
| message-queue | 9/12 | 47% to 91% |
| renal-dose-review | 4/12 | 14% to 61% |
| results-inbox | 8/12 | 39% to 86% |

## Failures

Most failures are mutants of the reference solution that fall into one trap each. One refusal and one limit stand in for the outcomes a scripted model cannot produce.
