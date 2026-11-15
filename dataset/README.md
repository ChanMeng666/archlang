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
the deterministic ArchLang compiler with **zero model or API involvement** (the separate,
model-written `model-authoring` config is described in its own section below):

- **`repair`** (flagship, ~1,200 rows): a procedural base plan, one deterministically injected fault,
  and the broken source healed by the shipped deterministic pipeline — `arch fix` (syntactic span
  edits) then `arch repair` (the geometric corrector). Each row carries the broken source, its
  catalogued diagnostics, the healed source, a unified diff, `fix_kind`, and the per-stage steps.
- **`authoring`** (secondary, ~400 rows): a natural-language brief, its golden `.arch`, the
  `describe()` facts, and a machine-checkable intent contract (shape of `schemas/intent.schema.json`)
  — all descending from one ground truth so they cannot drift.

This is **not a benchmark** and **not** a held-out set: the project's 26-brief evaluation corpus is
a public fixture (see the iron law below).

## Module map

| File | Role |
| --- | --- |
| `generate.ts` | Entry point (`npm run dataset:gen`). Orchestrates generation, self-verification, dedup, and the report; writes `out/{repair,authoring}.jsonl` + `out/report.json`. |
| `templates.ts` | Procedural `.arch` plan generator — three template families producing a fully-literal `PlanModel` (no scripting; `repair()` declines scripted sources), asserted strict-clean before use. |
| `faults.ts` | Deterministic fault injectors — perturb one element's coordinates to seed exactly one (or, for `combined`, two) of the six fault classes, mirroring `eval/faults/*.arch`. |
| `trajectory.ts` | The repair-trajectory recorder — mirrors `cmdFix` / `eval/l1.ts`'s `l1Pipeline` byte-for-byte and records the intermediate fix/repair steps; sets `fix_kind`. |
| `briefs.ts` | The authoring split's briefs + intent contracts, both derived from one `PlanModel` so they cannot drift; every row's `validateIntent(source, intent).ok` must hold. |
| `dedup.ts` | Dual deduplication against the eval corpus (text Jaccard + 8-gram, structural `describe()` fingerprint) — the enforcement arm of the iron law; used at gen time and by the CI guard. |
| `canary.ts` | The hardcoded canary GUID (`CANARY`) + its first-line source comment (`CANARY_COMMENT`). |
| `diff.ts` | A tiny zero-dependency line-based unified-diff generator (LCS backtrack + hunk grouping). |
| `rng.ts` | The seeded, deterministic PRNG (`mulberry32` / `splitmix32`) — the only randomness source; no clock, no entropy. |
| `model-authoring/` | The `model-authoring` config (see its section below): `briefs.ts` (the `spine` brief family), `manifest.ts` (seeded, deduplicated brief set), `corpora.ts` (the dedup indices), `published.json` (SHA-256 pin of the uploaded splits), `batch.ts` (the Message Batches client, on `fetch`), `prices.ts` (copied list prices, cost estimate), `rows.ts` (row derivation + replay), `cli.ts` (the four phases). |
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
**(a) leakage** — no eval brief/golden text or structure appears; **(b) canary** — every row
carries the field and the first-line source comment; **(c) determinism** — same seed ⇒ byte-identical
JSONL, and no clock/entropy API anywhere under `dataset/`; **(d) self-verification** — a sample of
rows re-verifies from scratch (broken raises its fault; fixed is strict-clean and idempotent;
authoring intent validates; `fix_kind` matches).

## The iron law — the dataset stays disjoint from the eval corpus

> **The eval's 26-brief corpus and its goldens (`eval/corpus.json` + the golden `.arch` files it
> references, under `eval/goldens/` and `examples/`) are a public regression fixture, not a
> holdout: no number measured against them may be called held-out. `dataset/` never imports
> `eval/`.** The generator imports **only** the pure core (`../src/index.js`); the public corpus is
> generated **independently** and **double-deduplicated** against the eval corpus:
>
> - **Text:** a candidate brief is rejected on token-set Jaccard ≥ 0.5 with any eval prompt, or on
>   any shared 8-word n-gram.
> - **Structure:** a candidate plan is rejected if its `describe()` fingerprint (normalized room-label
>   multiset with areas rounded to 0.5 m², the interior-door adjacency edge set, the room count)
>   exactly or near-matches any eval golden.
>
> `test/dataset.test.ts` enforces this **permanently**. `dedup.ts` reads the eval corpus only to
> *reject* look-alikes — copying any eval byte into dataset output is the one unforgivable failure.

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

## The `model-authoring` config

> The generator is in the repository; rows exist only after the owner runs the paid, owner-only
> `submit` phase (product-roadmap RM-D47). `CARD.md` carries this config's card text; the upload
> itself is the owner's step (§ Re-uploading to Hugging Face).

A separate HF config, `model-authoring` (split `one_shot`, files `model-authoring.jsonl` and `model-authoring-fable.jsonl`; keep that order in `CARD.md`'s `configs:`, the 1170-row file first for schema inference). Real
models write `.arch` **one-shot** from procedural briefs, and the deterministic tools heal the
result. The consumer-facing description, fields and limitations are in
`CARD.md`; this section covers how it is built and what must not break.

**Licensing (owner ruling, 2026-11-15, RM-D47).** The config is CC0-1.0. Its card section says
plainly that every row's reply was generated by an Anthropic Claude model through the Anthropic
API, naming the model id per row (`model`, `response_model`), and that users are responsible for
complying with Anthropic's terms themselves. It does not present the config as SFT, fine-tuning
or training data. The `default` config's CC0 text is unchanged.

**Phases** (`npm run dataset:model-authoring -- <phase>`; output under `dataset/out/model-authoring/`,
git-ignored; `--out <dir>` overrides it):

```bash
npm run dataset:model-authoring -- plan --briefs 390 --models haiku-5-5,sonnet-5-5,opus-5-5   # free
npm run dataset:model-authoring -- submit --yes --models haiku-5-5,sonnet-5-5,opus-5-5 --briefs 390 --max-usd <X>   # PAID, owner-only
npm run dataset:model-authoring -- collect           # re-run until done, or add --wait [--poll 60]
npm run dataset:model-authoring -- build             # deterministic, no network
```

- `plan` makes no API call. It builds the brief set and prints the brief count, the models and
  three cost figures per model at Batch prices (50 % of list, with each model's own cache-read
  multiplier): the cache hitting, the cache never hitting, and a ceiling with `max_tokens` output
  on every reply. All three are **estimates**: input tokens are estimated at 3 characters per
  token, not counted. The list prices are copied from `eval/run.ts`, since `dataset/` may not
  import it; a test fails when the copies drift.
- `submit` is paid and owner-only. It refuses when `state.json` or `results/` exists, without
  `--yes`, without `--max-usd`, for a model with no copied price, or when the summed estimated
  ceiling exceeds `--max-usd` (so `--max-usd` caps an estimate; it is not a billing limit). It
  writes `briefs.jsonl` (the manifest), `system-prompt.txt` and `state.json` (with the git commit
  and whether the tree was dirty) before its first paid call, and records each batch id the
  moment the batch is created. An interrupted submit therefore leaves a state file listing what
  was created, and that file blocks a second submit. `--cache-ttl 1h` switches the cache to the
  one-hour TTL.
- `collect` polls each batch. For every ended batch it downloads the results verbatim to
  `results/<model>.jsonl`, writing a `.partial` file and renaming it. A batch whose results file
  already exists is skipped, so a re-run resumes; a model the state lists but has no batch for
  (submit stopped first) is reported, not polled. The results URL must be on
  `https://api.anthropic.com`, or the download is refused (the key travels in its header).
- `build` checks the manifest's and the system prompt's SHA-256 against the state, that the
  running `archlang_version` is the pinned one, and that the repository is at the commit submit
  ran at. It derives each row, applies the leak gate, writes the row, parses the line back and
  replays it, and keeps only rows that replay byte for byte. Rows come in state order (model) then
  manifest order (brief), so the output does not depend on the order of the results file.

Unknown flags, `--briefs` below 1, `--poll` below 5 and `--seed 20260712` (the `default` config's
seed) are refused.

**Which dedup check runs where.** The briefs must be disjoint from the published splits as
uploaded, so `plan` and `submit` index the uploaded `repair.jsonl` and `authoring.jsonl`, not a
regeneration:

```bash
hf download ChanMeng666/archlang-repair-trajectories repair.jsonl authoring.jsonl --repo-type dataset --revision dc90d7c0e21f760b465c204c526cd09d76263066 --local-dir dataset/out/published
```

`model-authoring/published.json` pins the revision and each file's SHA-256; `publishedIndex()`
refuses to run on a missing or different file. The uploaded files were generated with ArchLang
1.15.0, and a regeneration at the pinned seed today is **not** byte-equal to them (checked
2026-11-15 at ArchLang 1.62.0: both files' SHA-256 values differ; the 400 `authoring` rows differ
only in `archlang_version`, while the `repair` rows share 1,162 of 1,200 ids and only 2 rows are
otherwise identical). That is why the uploaded bytes are indexed.
CI cannot download them, so `test/dataset.test.ts` § e indexes an in-repo regeneration instead
(the full `authoring` split plus the first 40 `repair` rows, at today's version) and checks a
12-brief set against it. That is a smaller and different corpus than the uploaded one: CI proves
the gates work, the CLI run is the check against the published bytes.

**Invariants.**

- **One-shot only.** The model sees one brief and never sees a diagnostic. No multi-turn or
  model-repair trajectory is ever added (the T3 bound; ADR 0013's 2026-11-15 amendments).
- **Seed space.** Briefs use seed `20261115` by default, never the `default` config's `20260712`.
  The `default` generator's bytes at `20260712` are untouched; `test/dataset.test.ts` pins its
  determinism.
- **Disjointness.** Every brief passes `textReject` and `structReject` (`dedup.ts`) against the
  eval corpus, the fidelity corpus and the published splits, plus an intra-set check
  (`manifest.ts`). `build` drops a row whose normalized reply contains an eval golden or fidelity
  reference plan, or that has any fenced block (or a healed plan) matching one structurally; model
  text is fingerprinted with no World, so it reads no file. `test/dataset.test.ts` § e and
  `test/dataset-model-authoring.test.ts` enforce this.
- **Canary.** The same `CANARY`, embedded the same way: a `canary` field, and the first line of
  every stored `.arch` source (`source`, `after_fix_source`, `after_repair_source`).
- **Imports.** `dataset/model-authoring/` imports only `../../src/index.js`, `node:*` and other
  `dataset/` modules, never `eval/`. The Batch client is its own `fetch` code. The system prompt is
  `spec.llm.md` read from disk plus `REPLY_FORMAT` (`rows.ts`).
- **Healing** is `recordTrajectory` (`trajectory.ts`), the `repair` split's own pipeline: the fix
  fixpoint, then one `repair()`, which declines what it cannot rewrite literally.
- **The API key** is read from `ANTHROPIC_API_KEY` and only ever placed in the `x-api-key`
  header. It is never logged or written; a test checks that no file `submit` writes contains it.

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
- **The `model-authoring` config** (`CARD.md` already carries its `configs:` entry and section).
  Its data files and reports upload alongside `CARD.md` as `README.md`. **Upload `README.md` last**,
  after the data files it names exist on HF: an unresolvable `data_files` path breaks loading for
  the whole repo.

  ```bash
  hf upload ChanMeng666/archlang-repair-trajectories dataset/out/model-authoring/model-authoring.jsonl model-authoring.jsonl --repo-type dataset
  hf upload ChanMeng666/archlang-repair-trajectories dataset/out/model-authoring/model-authoring-report.json model-authoring-report.json --repo-type dataset
  hf upload ChanMeng666/archlang-repair-trajectories dataset/out/model-authoring-fable/model-authoring.jsonl model-authoring-fable.jsonl --repo-type dataset
  hf upload ChanMeng666/archlang-repair-trajectories dataset/out/model-authoring-fable/model-authoring-report.json model-authoring-fable-report.json --repo-type dataset
  hf upload ChanMeng666/archlang-repair-trajectories dataset/CARD.md README.md --repo-type dataset
  ```

## Prose discipline

Two standing rules for anything written in this directory or the card:

- **Never claim a diagnostic-feedback-loop gain — or its absence.** The owner declined the T3
  live experiment on 2026-07-12 and ratified exactly one live run of it on 2026-11-15 (bounds in
  `docs/agents/iron-laws.md`; ran 2026-11-15). Its analysis was pre-registered before the run in
  `eval/live-runs/2026-11-t3-preregistration.md`, and its record is published in
  `eval/live-runs/2026-11-t3-result.md`.
  That published record is the only statement of the result; nothing in this directory or the
  card restates it, either way, and any other claim needs an owner decision. The run adds no
  multi-turn model-repair trajectories to the dataset. State only structural facts.
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
- [`eval/README.md`](../eval/README.md) — the eval corpus and its contamination warning.
- `archcanvas-growth/archive/archlang/docs-archive/research/2026-07-roadmap-proposal.md` (archived) →
  Tranche 5.
