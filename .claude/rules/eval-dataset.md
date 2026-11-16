---
paths:
  - "eval/**"
  - "dataset/**"
  - ".github/workflows/eval-l2.yml"
---

# Eval harness and dataset
- T3 has one owner-ratified live run (ran 2026-11-15; record: eval/live-runs/2026-11-t3-result.md; bounds in
  `docs/agents/iron-laws.md`); never dispatch `eval-l2.yml`, never re-propose another run. The
  run is over: claim no loop gain and no absence of one beyond it; the
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
  run it; `plan` and `build` are free. Uploading to the HF dataset repo `ChanMeng666/archlang-repair-trajectories` is
  the agent's (RM-D55, owner 2026-11-16): with the owner's logged-in `hf` CLI, re-download and compare
  SHA-256 after (a mismatch stops and is reported); stop and guide the owner for a login, 2FA, token
  or any other step only the owner can do; never a token in the repo or chat. What may be uploaded is
  unchanged: replacing a published data file (a regeneration, new rows) needs an owner ruling first
  (RM-D47; the seed-`20260712` bytes stay as published); without one, only the card. The
  model-authoring config is one-shot model
  replies, CC0 with the provider note in `dataset/CARD.md`, never promoted as
  training data.
- **(Dataset) `dataset/out/` is gitignored and HF-only.** On re-upload the card's
  `task_categories` must come from HF's official list (`text-generation`), under the `ChanMeng666`
  namespace. See `dataset/README.md`.
