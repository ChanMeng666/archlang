---
paths:
  - "eval/**"
  - "dataset/**"
  - ".github/workflows/eval-l2.yml"
---

# Eval harness and dataset
- T3 has one owner-ratified live run (ratified 2026-11-15, not yet run; bounds in
  `docs/agents/iron-laws.md`); never dispatch `eval-l2.yml`, never re-propose another run. Until
  that run's pre-registered result is published, claim no loop gain and no absence of one; the
  published record is the only statement of the result, and any other claim, either way, needs an
  owner decision. `npm run eval:live` is paid and owner-only; CI runs the offline `eval:ci`.
- Never compare rates across a `JUDGE_VERSION`/`SYNONYMS_VERSION` change; regenerate
  `eval/judge-fixture.json` only for an approved bump. `eval/rubric.md` is frozen.
- The eval corpus and goldens are a public regression fixture, never called held-out; the dataset
  stays disjoint from them; `dataset/` imports only `../src/index.js`; the
  canary in `dataset/canary.ts` is never regenerated (`test/dataset.test.ts`).
- `eval:fidelity` has its own corpus and scorecard — never compare it with `eval:ci`.
  `eval:fidelity-live` (paid, owner-only; product-roadmap RM-D46) is compared with neither, nor with
  the L0 baseline.
- `npm run dataset:model-authoring -- submit` is paid and owner-only (product-roadmap RM-D47): never
  run it, nor upload anything to HF; `plan` and `build` are free. Its config is one-shot model
  replies, CC0 with the provider note in `dataset/CARD.model-authoring.draft.md`, never promoted as
  training data; `CARD.md` changes only when that config is uploaded.
- **(Dataset) `dataset/out/` is gitignored and HF-only.** On re-upload the card's
  `task_categories` must come from HF's official list (`text-generation`), under the `ChanMeng666`
  namespace. See `dataset/README.md`.
