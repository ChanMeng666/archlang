---
paths:
  - "eval/**"
  - "dataset/**"
  - ".github/workflows/eval-l2.yml"
---

# Eval harness and dataset

Read the T3/T6, dataset-contamination, judge-comparability and rubric iron laws in
`docs/agents/iron-laws.md` and the `(Eval harness)`/`(Dataset)` entries of `docs/agents/gotchas.md`
before changing anything here. Never trigger `eval-l2.yml` live; `npm run eval:live` is owner-only.
