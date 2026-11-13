# Reviewed Dread source contracts

Test-only snapshots of all 21 real Dread cards. These are not runtime overrides.

- `void-20261102`: production JSON at release a2f602b, generated 2026-11-02T10:58:19.198Z. Source: playtest-the-void; H&F count 0, Void count 21, Warlock H&F starter count 3.
- `hope-and-fear-20261110`: independently retained refresh generated 2026-11-10T15:01:46.210Z, previously verified in journal/beta integration. Source: hope-and-fear; H&F count 21, Void count 0, Warlock H&F starter count 6.

Only irrelevant image paths and attribution/cache metadata are omitted. Source tags, card identity, level, type, stress, full rules text and features are retained. The helper fingerprints the served corpus against these explicit reviewed snapshots; it does not derive desired counts from unknown input. Added, removed, text-changed and mixed/unknown-source cards fail closed. Do not regenerate these files automatically to make CI green. A new source revision requires review and an explicit contract.

`node --test tests/scripts/reviewed-dread-contract.test.mjs` covers both accepted snapshots and ten negative mutations. Browser coverage: `content-access.spec.ts` and `hope-and-fear.spec.ts`, Chromium, against each independently prepared build. Each checks the served JSON rather than assuming the local source tree is the served build.
