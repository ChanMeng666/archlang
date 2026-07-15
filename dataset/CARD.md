---
license: cc0-1.0
language:
  - en
pretty_name: ArchLang Repair Trajectories
tags:
  - code-repair
  - program-repair
  - dsl
  - synthetic
  - floor-plans
  - svg
  - deterministic
  - reward-harness
task_categories:
  - text-generation
size_categories:
  - 1K<n<10K
configs:
  - config_name: default
    data_files:
      - split: repair
        path: repair.jsonl
      - split: authoring
        path: authoring.jsonl
---

# ArchLang Repair Trajectories

A fully synthetic, procedurally generated dataset of floor-plan program-repair and authoring
examples for [ArchLang](https://github.com/ChanMeng666/archlang) — a small declarative language
that compiles `.arch` floor-plan source to professional SVG. Every row is self-verifying through
the deterministic ArchLang compiler, with **zero model or API involvement** in its construction.

- **Generator + seed:** open source in the main repository (`dataset/`, `npm run dataset:gen`),
  so the corpus is reproducible **byte-for-byte**.
- **Pinned:** `archlang_version` `1.15.0`; default seed `20260712`.
- **License:** CC0-1.0 (public domain dedication).

## What this is

Two splits, both generated from a pinned seed with no clock and no entropy randomness:

- **`repair`** (flagship). A base plan is generated from a procedural template, a single
  deterministic fault is injected (mirroring the six fault classes of the repository's own
  fault-injection gate), and the broken source is healed by the deterministic tool pipeline —
  `arch fix` (syntactic span edits) then `arch repair` (the geometric corrector). Each row carries
  the broken source, the machine-readable diagnostics it raises, the healed source, a unified diff,
  and the per-stage healing steps.
- **`authoring`** (secondary). A natural-language brief, its golden `.arch`, the `describe()` facts
  the plan yields, and a machine-checkable intent contract (in the shape of
  `schemas/intent.schema.json`). The brief, the golden, and the intent all descend from one ground
  truth, so they cannot drift.

Both splits are procedural and narrow by design. This is **not a benchmark** and **not** the
project's private evaluation set (see *Contamination defense*).

## Provenance and self-verification

Every row is constructed and checked by the ArchLang compiler at generation time. A candidate that
fails any gate is **rejected and counted in the accompanying `report.json`**, never silently
emitted or truncated. For `repair` rows the generator asserts the broken source raises exactly the
injected fault code(s), the healed source compiles with zero errors and is strict-clean (zero
warnings), and the healing pipeline is idempotent (a second pass is a byte no-op). For `authoring`
rows it asserts the golden is strict-clean and `validateIntent(source, intent).ok` is true.

The generator imports only the pure core surface of `@chanmeng666/archlang`
(`compile`, `applyFixes`, `repair`, `lint`, `describe`, `diagnosticToJson`, `validateIntent`). It
imports nothing from the project's evaluation harness.

## The `repair` split — fields

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `repair-<family>-<fault>-<seed>` |
| `canary` | string | The dataset canary GUID (see *Contamination defense*). |
| `archlang_version` | string | The ArchLang version this row was generated against (`1.15.0`). |
| `generator` | object | `{ name, version, seed }` for this row's row-seed. |
| `fault_classes` | string\[] | The injected target diagnostic code(s), e.g. `["W_DOOR_OFF_WALL"]`. |
| `broken_source` | string | The `.arch` source with the fault (first line is the canary comment). |
| `diagnostics` | object\[] | The broken source's `compile` + `lint` diagnostics, as JSON. |
| `fixed_source` | string | The deterministically healed `.arch` source. |
| `diff` | string | Unified diff from `broken_source` to `fixed_source`. |
| `fix_kind` | string | `"fix"`, `"repair"`, or `"both"` — which stage(s) changed bytes. |
| `steps` | object\[] | The per-stage healing trajectory (see below). |
| `verification` | object | `{ broken_raises_fault, fixed_errors, fixed_warnings, idempotent }`. |

Each entry in `diagnostics` is the project's `DiagnosticJson` projection: `code` (a stable
`E_*`/`W_*` code), `severity`, `message`, and — when the diagnostic bears a span — `line`, `col`,
`span` (`[start, end)` byte range), an optional catalogued `fix` string, and optional `hints`.

`steps` is an ordered list of two kinds:

- a **fix** step — `{ "stage": "fix", "pass": <n>, "applied": [{ "title", "edits":
  [[start, end, "replacement"], ...] }] }` — the machine-applicable suggestions committed on one
  fixpoint pass, each edit a `[start, end, newText]` span replacement;
- a **repair** step — `{ "stage": "repair", "changes": [...] }` — the geometric corrector's
  furniture moves, each `{ id, category, kind: "moved", from: {x,y}, to: {x,y}, reason }`.

The fix loop mirrors the repository's `l1Pipeline` / `arch fix` contract exactly: it applies only
the machine-applicable fix tier, runs at most four passes, rolls back any pass that raises the
compile-error count, and stops at the fixpoint; one `repair()` pass follows. A recorded
`fixed_source` is therefore precisely what the shipped tools produce.

## The `authoring` split — fields

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `authoring-<family>-<seed>` |
| `canary` | string | The dataset canary GUID. |
| `archlang_version` | string | `1.15.0`. |
| `generator` | object | `{ name, version, seed }`. |
| `brief` | string | The procedural natural-language brief. |
| `source` | string | The golden `.arch` source (first line is the canary comment). |
| `facts` | object | The `describe()` projection (see below). |
| `intent` | object | The machine-checkable intent contract (shape of `schemas/intent.schema.json`). |
| `verification` | object | `{ errors: 0, warnings: 0, intent_ok: true }`. |

`facts` is `{ rooms: [{ id, label, uses, room_type, area_m2 }], total_area_m2, doors: [{ id,
between, width }], adjacency }`, where `adjacency` is the interior-door room-adjacency graph
(`describe().input_graph`). `intent` asserts only what the brief's words license — a room count
only when the brief enumerates the rooms, and an area band around a number the brief actually
states — following the normative rules in `schemas/intent.schema.json`.

## The fix / repair boundary

ArchLang draws a hard line, and `fix_kind` preserves it in the data:

- **`fix`** — a **syntactic span edit** where the correct replacement text is known (the
  rustc/rustfix model; ArchLang only ever emits the machine-applicable tier here). See
  [ADR 0011](https://github.com/ChanMeng666/archlang/blob/main/docs/adr/0011-machine-applicable-fixes.md).
- **`repair`** — a **geometric solve** that no span edit could express (pushing furniture out of a
  wall, off a door's landing). See
  [ADR 0006](https://github.com/ChanMeng666/archlang/blob/main/docs/adr/0006-solver-as-explicit-transform.md).
- **`both`** — the two composed (e.g. an off-wall door healed by `fix`, then a blocked entrance
  cleared by `repair`).

Diagnostics are **data, not prose**: catalogued (stable `E_*`/`W_*` codes), span-bearing, and
fix-carrying. A consumer keys off the code and the span, not a message string.

## Scope — three statements to read before you use this dataset

**1. Drivability, not one-shot intent.** This dataset does NOT solve one-shot intent satisfaction.
It packages *drivability* — the property that ArchLang plans can be driven to physical soundness by
deterministic tools.

**2. SFT-shaped evidence, no training claim.** Evidence that SFT corpora lift *validity* is not
evidence about RLVR (which targets intent, geometry, and topology), and vice versa. This dataset is
an SFT-shaped asset plus reward-harness documentation (`arch score --brief` / `validateIntent` as a
continuous, deterministic reward signal); it carries no claim about the training outcomes of any
method.

**3. No feedback-loop claim.** Whether a diagnostic-feedback loop beats equal-token-budget
resampling was never measured for ArchLang (the experiment was declined). This dataset and card
make no claim that such a loop helps or does not help; only structural facts are stated.

## Baseline context

For orientation only — these are numbers about a *model authoring plans*, not about this dataset.
Measured on the project's private 26-brief evaluation set with judge v2, recalibrated 2026-07-12
(`gpt-5.5`, seed-pinned):

- **One-shot (L0):** valid 23/26 (88%) · intent 14/26 (54%) · sound 3/26 (12%).
- **Deterministic-tool overlay (L1)** — `fix` + `repair`, zero extra model calls: intent
  18/26 (69%) · sound 7/26.

That L1 lift belongs to the deterministic tool tier's ledger, not to any model loop. All figures
are judge-v2; the project never compares rates across judge versions, and neither should any use of
this dataset.

## Contamination defense

The 26-brief evaluation corpus and its goldens are a **private holdout** and are never published.
This public corpus is generated independently and **double-deduplicated** against that holdout:

- **Text:** a candidate brief is rejected if its normalized token-set Jaccard similarity with any
  holdout prompt is ≥ 0.5, or if it shares any 8-word n-gram with one.
- **Structure:** a candidate plan is rejected if its `describe()` fingerprint (normalized room-label
  multiset with areas rounded to 0.5 m², the interior-door adjacency edge set, and the room count)
  exactly or near-matches any holdout golden.

A CI test in the main repository (`test/dataset.test.ts`) enforces this permanently.

Every row embeds a canary **twice** — a `canary` field and a first-line `.arch` source comment — so
downstream model developers can probe for training-set leakage. The full string, documented openly:

```
ARCHLANG-DATASET-CANARY-422d0bc5-c0c6-4c6b-b3c5-3fbc401aefbf
```

## Verify any row yourself (zero install)

Every row can be re-checked with the published CLI (`npx @chanmeng666/archlang …`):

```bash
# A repair row's healed source should compile clean and lint clean:
echo "<fixed_source>" | npx @chanmeng666/archlang compile --json -
echo "<fixed_source>" | npx @chanmeng666/archlang lint --json -
echo "<fixed_source>" | npx @chanmeng666/archlang validate --strict -

# An authoring row's golden should satisfy its intent contract:
npx @chanmeng666/archlang validate --intent intent.json golden.arch
npx @chanmeng666/archlang score --brief intent.json golden.arch
```

The language spec is available with `npx @chanmeng666/archlang spec`, and the full agent context
(spec + skill + CLI reference + error catalog) with `npx @chanmeng666/archlang context` or from the
docs site's `/llms-full.txt`.

## Limitations

- **Synthetic and procedural.** Three template families (single-room studio, hall-served flat,
  consulting-room corridor) and six fault classes (off-wall door / window / opening,
  furniture-through-wall, blocked-doorway, and a combined case) — mirroring the repository's own
  fault-injection gate.
- **Narrow distribution by design.** Not a survey of real floor plans, and not a benchmark.
- **Not the evaluation set.** It is generated to be provably disjoint from the private holdout.
- **Sizes.** Approximately 1,200 `repair` rows and 400 `authoring` rows; exact counts, per-family
  and per-fault-class breakdowns, and rejection tallies are in the accompanying `report.json`.

## Why publish this

For an adoption-driven, open-source language, any model that learns ArchLang is a win. Publishing
the generator, the dataset, and the reward-harness documentation recruits community training rather
than gatekeeping it.

## Links

- **Repository:** https://github.com/ChanMeng666/archlang (generator: `dataset/`)
- **Docs:** https://archlang.uk
- **npm:** https://www.npmjs.com/package/@chanmeng666/archlang
- **License:** CC0-1.0
