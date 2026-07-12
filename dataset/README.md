# dataset/ — the repair-trajectory + authoring dataset generator

This directory is the **maintainer- and agent-facing** documentation for ArchLang's synthetic
training dataset (roadmap Tranche 5). It is **repo tooling, not a workspace** — it is not an npm
package, adds no runtime dependency, and imports only the pure core surface of
`@chanmeng666/archlang`.

> **This file vs `CARD.md`.** `dataset/CARD.md` is the **Hugging Face consumer README** (it uploads
> as the dataset repo's `README.md`, carries the HF YAML front-matter, and speaks to someone
> *using* the published corpus). **This** file is the **repository** doc — how the generator is
> built, how to regenerate, and the invariants a future contributor must not break. When they
> disagree, the code wins; keep both in sync with it.

## What this is

The `dataset/` generator produces the public Hugging Face dataset
[`ChanMeng666/archlang-repair-trajectories`](https://huggingface.co/datasets/ChanMeng666/archlang-repair-trajectories)
(CC0-1.0) — two fully synthetic, procedurally generated splits, every row **self-verifying** through
the deterministic ArchLang compiler with **zero model or API involvement**:

- **`repair`** (flagship, ~1,200 rows): a procedural base plan, one deterministically injected fault,
  and the broken source healed by the shipped deterministic pipeline — `arch fix` (syntactic span
  edits) then `arch repair` (the geometric corrector). Each row carries the broken source, its
  catalogued diagnostics, the healed source, a unified diff, `fix_kind`, and the per-stage steps.
- **`authoring`** (secondary, ~400 rows): a natural-language brief, its golden `.arch`, the
  `describe()` facts, and a machine-checkable intent contract (shape of `schemas/intent.schema.json`)
  — all descending from one ground truth so they cannot drift.

This is **not a benchmark** and **not** the project's private evaluation set (see the iron law
below).

## Module map

| File | Role |
| --- | --- |
| `generate.ts` | Entry point (`npm run dataset:gen`). Orchestrates generation, self-verification, dedup, and the report; writes `out/{repair,authoring}.jsonl` + `out/report.json`. |
| `templates.ts` | Procedural `.arch` plan generator — three template families producing a fully-literal `PlanModel` (no scripting; `repair()` declines scripted sources), asserted strict-clean before use. |
| `faults.ts` | Deterministic fault injectors — perturb one element's coordinates to seed exactly one (or, for `combined`, two) of the six fault classes, mirroring `eval/faults/*.arch`. |
| `trajectory.ts` | The repair-trajectory recorder — mirrors `cmdFix` / `eval/l1.ts`'s `l1Pipeline` byte-for-byte and records the intermediate fix/repair steps; sets `fix_kind`. |
| `briefs.ts` | The authoring split's briefs + intent contracts, both derived from one `PlanModel` so they cannot drift; every row's `validateIntent(source, intent).ok` must hold. |
| `dedup.ts` | Dual deduplication against the private holdout (text Jaccard + 8-gram, structural `describe()` fingerprint) — the enforcement arm of the iron law; used at gen time and by the CI guard. |
| `canary.ts` | The hardcoded canary GUID (`CANARY`) + its first-line source comment (`CANARY_COMMENT`). |
| `diff.ts` | A tiny zero-dependency line-based unified-diff generator (LCS backtrack + hunk grouping). |
| `rng.ts` | The seeded, deterministic PRNG (`mulberry32` / `splitmix32`) — the only randomness source; no clock, no entropy. |
| `CARD.md` | The Hugging Face consumer README (uploads as the dataset repo's `README.md`). |
| `out/` | The generated artifacts (`repair.jsonl`, `authoring.jsonl`, `report.json`). **Git-ignored — HF-only.** |

## How to regenerate

```bash
npm run dataset:gen        # writes dataset/out/{repair,authoring}.jsonl + report.json
```

Optional flags (defaults are the pinned publishing values):

```bash
npm run dataset:gen -- --repair-rows 1200 --authoring-rows 400 --seed 20260712 --out dataset/out
```

Generation is **fully deterministic**: the same seed yields **byte-for-byte identical** JSONL, with
no network, no clock, and no entropy randomness (a test grep-asserts the absence of `Date.now`,
`Math.random`, and `new Date(`). `dataset/out/` is git-ignored — the committed source of truth is the
generator + the seed, not the emitted rows.

## The verification story

Every row is constructed **and checked** by the compiler at generation time. A candidate that fails
any gate is **rejected and counted in `out/report.json`**, never silently emitted or truncated:

- **`repair`**: the broken source raises exactly the injected fault code(s); the healed source
  compiles with zero errors and is strict-clean (zero warnings); the healing pipeline is idempotent
  (a second pass is a byte no-op).
- **`authoring`**: the golden is strict-clean and `validateIntent(source, intent).ok` is true.

The permanent CI guard `test/dataset.test.ts` re-proves this on a fresh small corpus in four groups:
**(a) leakage** — no holdout brief/golden text or structure appears; **(b) canary** — every row
carries the field and the first-line source comment; **(c) determinism** — same seed ⇒ byte-identical
JSONL, and no clock/entropy API anywhere under `dataset/`; **(d) self-verification** — a sample of
rows re-verifies from scratch (broken raises its fault; fixed is strict-clean and idempotent;
authoring intent validates; `fix_kind` matches).

## The iron law — the private holdout is never published

> **The eval's 26-brief corpus and its goldens (`eval/corpus.json` + the golden `.arch` files it
> references, under `eval/goldens/` and `examples/`) are a private holdout as a *set*. They are
> never published as a dataset, and `dataset/` never imports `eval/`.** The generator imports
> **only** the pure core (`../src/index.js`); the public corpus is generated **independently** and
> **double-deduplicated** against the holdout:
>
> - **Text:** a candidate brief is rejected on token-set Jaccard ≥ 0.5 with any holdout prompt, or on
>   any shared 8-word n-gram.
> - **Structure:** a candidate plan is rejected if its `describe()` fingerprint (normalized room-label
>   multiset with areas rounded to 0.5 m², the interior-door adjacency edge set, the room count)
>   exactly or near-matches any holdout golden.
>
> `test/dataset.test.ts` enforces this **permanently**. Getting it wrong **voids the eval forever**:
> once the holdout leaks into a published corpus, no honest number can ever be reported against it
> again. `dedup.ts` reads the holdout only to *reject* look-alikes — copying any holdout byte into
> dataset output is the one unforgivable failure.

## The canary rule

Every row embeds the canary **twice** — a `canary` field and a first-line `.arch` source comment — so
downstream model developers can probe for training-set leakage. The value is **generated once and
hardcoded in `canary.ts`**; **never regenerate it.** A new value would silently split the corpus
across regenerations and defeat the leakage probe. The full string, documented openly:

```
ARCHLANG-DATASET-CANARY-422d0bc5-c0c6-4c6b-b3c5-3fbc401aefbf
```

## The literal-source constraint

Plans in the `repair` split must stay **fully literal** — no `let`/`for`/scripting — because
`repair()` (the geometric corrector) declines scripted sources. `templates.ts` produces a structured
`PlanModel` and serializes it to fully-literal `.arch`; do not add scripting to the emitted plans, or
the repair stage will refuse them and the row is rejected.

## Re-uploading to Hugging Face

Upload is the owner's manual step (the `hf` CLI, logged in as the owner — **no tokens in the repo**).
Use the **canonical `ChanMeng666` namespace casing** (the same class of lesson as npm provenance and
the MCP registry — the owner segment is identity-checked):

```bash
hf upload ChanMeng666/archlang-repair-trajectories dataset/out/repair.jsonl    repair.jsonl    --repo-type dataset
hf upload ChanMeng666/archlang-repair-trajectories dataset/out/authoring.jsonl authoring.jsonl --repo-type dataset
hf upload ChanMeng666/archlang-repair-trajectories dataset/out/report.json     report.json     --repo-type dataset
hf upload ChanMeng666/archlang-repair-trajectories dataset/CARD.md             README.md       --repo-type dataset
```

Notes:

- **`CARD.md` uploads as `README.md`** — it is the dataset repo's front page.
- **`task_categories` in the card front-matter must come from HF's official list** — use
  `text-generation`, **not** `text2text-generation` (the upload warns on an off-list value).
- **A core version bump that changes generated output** means a new `archlang_version`: regenerate at
  the pinned seed, re-upload all three artifacts, and update `archlang_version` in `CARD.md`. A
  card-only edit re-uploads `README.md` alone. This is a release-checklist item — see
  `CONTRIBUTING.md` → "Releasing".

## Prose discipline

Two standing rules for anything written in this directory or the card:

- **Never claim a diagnostic-feedback-loop gain — or its absence.** The T3 live experiment was
  permanently declined (owner decision 2026-07-12); the loop-vs-equal-budget-resampling question is
  **permanently unanswered**. State only structural facts.
- **Cite only judge-v2 baseline numbers** (the 2026-07-12 recalibration): one-shot L0 valid 23/26 ·
  intent 14/26 · sound 3/26; the deterministic-tool L1 overlay intent 18/26 · sound 7/26. That L1
  lift belongs to the tool tier's ledger, never a model loop. Never compare rates across judge
  versions, and never cite judge-v1 numbers.

## See also

- [`docs/adr/0013-repair-trajectory-dataset.md`](../docs/adr/0013-repair-trajectory-dataset.md) — why
  this dataset exists and the decisions behind it.
- [`docs/adr/0011-machine-applicable-fixes.md`](../docs/adr/0011-machine-applicable-fixes.md) /
  [`0006-solver-as-explicit-transform.md`](../docs/adr/0006-solver-as-explicit-transform.md) — the
  fix/repair boundary `fix_kind` preserves.
- [`eval/README.md`](../eval/README.md) — the holdout and its contamination warning.
- [`docs/research/2026-07-roadmap-proposal.md`](../docs/research/2026-07-roadmap-proposal.md) →
  Tranche 5.
