---
paths:
  - "eval/**"
  - "dataset/**"
  - ".github/workflows/eval-l2.yml"
---

# Eval harness and dataset
- T3 has one owner-ratified live run (2026-11-15), bounds in `docs/agents/iron-laws.md`; never
  dispatch `eval-l2.yml`. Until that run's pre-registered result is published, claim no loop gain
  and no absence of one; after that, cite only its published record. `npm run eval:live` is paid
  and owner-only; CI runs the offline `eval:ci`.
- Never compare rates across a `JUDGE_VERSION`/`SYNONYMS_VERSION` change; regenerate
  `eval/judge-fixture.json` only for an approved bump. `eval/rubric.md` is frozen.
- The eval corpus and goldens are a public regression fixture, never called held-out; the dataset
  stays disjoint from them; `dataset/` imports only `../src/index.js`; the
  canary in `dataset/canary.ts` is never regenerated (`test/dataset.test.ts`).
- `eval:fidelity` has its own corpus and scorecard — never compare it with `eval:ci`.
- **(Dataset) `dataset/out/` is gitignored and HF-only.** On re-upload the card's
  `task_categories` must come from HF's official list (`text-generation`), under the `ChanMeng666`
  namespace. See `dataset/README.md`.
