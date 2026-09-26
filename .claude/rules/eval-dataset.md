---
paths:
  - "eval/**"
  - "dataset/**"
  - ".github/workflows/eval-l2.yml"
---

# Eval harness and dataset

- Never trigger `eval-l2.yml` live and never claim a loop gain or its absence (T3 is declined for
  good). `npm run eval:live` is paid and owner-only; CI runs the offline `eval:ci`.
- Never compare rates across a `JUDGE_VERSION`/`SYNONYMS_VERSION` change; regenerate
  `eval/judge-fixture.json` only for an approved bump. `eval/rubric.md` is frozen.
- The eval corpus and goldens are a private holdout; `dataset/` imports only `../src/index.js`; the
  canary in `dataset/canary.ts` is never regenerated (`test/dataset.test.ts`).
- `eval:fidelity` has its own corpus and scorecard — never compare it with `eval:ci`.
