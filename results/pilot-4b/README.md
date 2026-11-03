# pilot-4b: PW4-P2, crc-care-gap 4 more trials on v1 (S-2 v1_plus_4; historical once the world or the task changes, ruling R37)

crc-care-gap only, 4 trials on v1 (4 active mid-trial events: crc-b1, crc-b2, crc-o1 and the lure crc-d1), claude-opus-5-5 at effort high, batch ee3087d4, $9.41 settled. Recorded at grader 19 (3/4 PASS). The current grades are the grader 22 regrade (R41, builder-304; it changes no grade), after the grader 21 regrade (P21, builder-297; no change) and the grader 20 regrade (#210, the S-0 fix G5) that moved crc-care-gap/1 FAIL -> PASS: **4/4 PASS**; pooled with results/pilot-4a, 6/8 on v1 (Wilson 95% [0.41, 0.93]), and S-3 freezes crc-care-gap on v1. The audit, the grader fault G5, the S-3 reading and the class tables are in classes.md. The card is result-card.md (from summary.json and classes.json).

It is pinned to:

- world ba0b02069ab423eeb28c4671bc239c4aa1ec45c28911dbb9dd21948c77ca3a86
- crc-care-gap task_version 2b6dd996375d39528cbfc39c0676ddc6116615828e471f1a535e44933a59b181, env_version df481c520ddc09dbafb0011b40fa583187697768f255d3c80019200604dc38ee, grader_task_version 1cf41ce2ca1d0ad8afcfdd3116f32bd2ff449ed9f916669cd087c9cbed105afd as recorded (manifest.json); the grader 20 regrade is at grader_task_version ab38fbcd413fd3dd0ab137b27b58a893ea5032e9db20e374f42769e8e51058a9, the grader 21 regrade at 385c668dcaee778ebbfbf548d2354c8ba48a8bcbd37c6579d5486c291b5c7ba3 and the grader 22 regrade at 623064d5c6aa2e8867105293db5bf96b25124e996ea5a6f44be1b896a11ab7c9 (matrix.json carries all four)
- the item and event table in item-classes.json, equal to pilot-4a's pinned crc-care-gap table

## Reproduce

Reproduce commit for the records: dc7ddcfc8b06ef4844a4a9e9780c1885df82d2fe (main after PW4-P1, #209). The regrade: a checkout at or after the R41 fix (grader 22).

```sh
cp -R results/pilot-4b /tmp/pilot-4b    # replay, regrade and summary --write write into the run directory; keep the committed copy clean
pnpm cli replay /tmp/pilot-4b
pnpm cli summary /tmp/pilot-4b --require env_error_raw=0,env_limit=0,model=claude-opus-5-5
pnpm cli audit-check results/pilot-4b
pnpm cli classes results/pilot-4b --json
pnpm cli classes results/pilot-4a,results/pilot-4b   # the pooled 8
```

#210 moved only GRADER_VERSION (every grader_task_version, so every task_version); the world and env_version stayed, so `replay` on a checkout at or after #210 reproduces 4 of 4, and `classes` reads the run as historical (R37, items from the records). The current grades are reproduced on such a checkout by:

```sh
pnpm cli regrade <copy of results/pilot-4b, regrades[] removed> --grader-version 22   # at or after the R41 fix; --grader-version 21 at the P21 freeze, 20 at #210
```

The judge caches already hold every answer the grader 20 regrade asks for (0 misses, no fill).
