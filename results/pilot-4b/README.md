# pilot-4b: PW4-P2, crc-care-gap 4 more trials on v1 (S-2 v1_plus_4; historical once the world or the task changes, ruling R37)

crc-care-gap only, 4 trials on v1 (4 active mid-trial events: crc-b1, crc-b2, crc-o1 and the lure crc-d1), claude-opus-5-5 at effort high, batch ee3087d4, $9.41 settled, grader 19. **3/4 PASS**; pooled with results/pilot-4a, 5/8 on v1. The audit, the suspected grader fault G5, the S-3 reading and the class tables are in classes.md. The card is result-card.md (from summary.json and classes.json).

It is pinned to:

- world ba0b02069ab423eeb28c4671bc239c4aa1ec45c28911dbb9dd21948c77ca3a86
- crc-care-gap task_version 2b6dd996375d39528cbfc39c0676ddc6116615828e471f1a535e44933a59b181, env_version df481c520ddc09dbafb0011b40fa583187697768f255d3c80019200604dc38ee, grader_task_version 1cf41ce2ca1d0ad8afcfdd3116f32bd2ff449ed9f916669cd087c9cbed105afd (manifest.json)
- the item and event table in item-classes.json, equal to pilot-4a's pinned crc-care-gap table

## Reproduce

Reproduce commit: dc7ddcfc8b06ef4844a4a9e9780c1885df82d2fe (main after PW4-P1, #209).

```sh
cp -R results/pilot-4b /tmp/pilot-4b    # replay writes replay.json; keep the committed copy clean
pnpm cli replay /tmp/pilot-4b
pnpm cli summary /tmp/pilot-4b --require env_error_raw=0,env_limit=0,model=claude-opus-5-5
pnpm cli audit-check results/pilot-4b
pnpm cli classes results/pilot-4b --json
pnpm cli classes results/pilot-4a,results/pilot-4b   # the pooled 8
```

`audit-check` exits 1 while crc-care-gap/1 is audited as the suspected grader fault G5 (classes.md). That is the S-0 rule, which allows no headline pass rate until a fix and an offline regrade.
