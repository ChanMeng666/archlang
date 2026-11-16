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
  - config_name: model-authoring
    data_files:
      - split: one_shot
        path:
          - model-authoring.jsonl
          - model-authoring-fable.jsonl
---

# ArchLang Repair Trajectories

A dataset of floor-plan program-repair and authoring examples for
[ArchLang](https://github.com/ChanMeng666/archlang) — a small declarative language
that compiles `.arch` floor-plan source to professional SVG. The `default` config
(the `repair` and `authoring` splits) is fully synthetic and procedurally generated, and every row
is self-verifying through the deterministic ArchLang compiler, with **zero model or API
involvement** in its construction. The separate `model-authoring` config holds replies written by
Anthropic Claude models; see *The `model-authoring` config*.

- **Generator + seed:** open source in the main repository (`dataset/`, `npm run dataset:gen`),
  so the `default` config's corpus is reproducible **byte-for-byte**. (The `model-authoring`
  config's model replies are a snapshot; see its section for what replays.)
- **Pinned:** `default` config: `archlang_version` `1.15.0`, seed `20260712`. `model-authoring`
  config: `archlang_version` `1.62.0`, seed `20261115`.
- **License:** CC0-1.0 (public domain dedication).

## What this is

The `default` config has two splits, both generated from a pinned seed with no clock and no
entropy randomness:

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

Both `default` splits are procedural and narrow by design. This is **not a benchmark** and
**not** a held-out evaluation set: the project's 26-brief evaluation corpus is a public fixture
(see *Contamination defense*).

## Provenance and self-verification

Every row of the `default` config is constructed and checked by the ArchLang compiler at
generation time, with no model involved (the `model-authoring` config's provenance is in its own
section). A candidate that
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

## The `model-authoring` config

**What it is.** Each row holds one reply that an Anthropic Claude model wrote, one-shot, to one
procedural brief, together with the deterministic ArchLang compiler's verdicts on that reply,
before and after `arch fix` then `arch repair`. The model sees the brief once and never sees a
diagnostic; the config holds no multi-turn or model-repair trajectories.

**License and provenance of the replies.** This config is released under CC0-1.0, like the rest of
the dataset. The `raw_reply` of every row, and the `.arch` extracted from it, was generated by an
Anthropic Claude model through the Anthropic API (the Message Batches API). Each row names its
model: `model` is the model id requested, and `response_model` is the model id the API reported.
Anyone who uses these rows is responsible for complying with Anthropic's terms themselves. This
config records how models author ArchLang one-shot and how the deterministic tools respond to
what they wrote; it is not offered as SFT, fine-tuning or training data.

**What is in it.** Two generated data files, both from repository commit
`2a210589fa2624c22bd0869d8e8c59bd5ed2da34`, `archlang_version` `1.62.0`, brief seed `20261115`,
uploaded unmodified:

- `model-authoring.jsonl`: 1170 rows, 390 briefs × 3 models (390 rows each: `claude-haiku-5-5`,
  `claude-sonnet-5-5`, `claude-opus-5-5`). SHA-256
  `f424599f9fa1ceb0d32a0a66731877f4df942cf0140b144c183ec663f875295b`.
- `model-authoring-report.json`: its report. SHA-256
  `895b7ea4ddca303ff5095558bc8af3328abd4f8414c85cf44da711d725346760`.
- `model-authoring-fable.jsonl`: 200 rows, `claude-fable-5-2` only. **It covers only the first 200
  of the 390 briefs** (generated with `--briefs 200`), with the same generator, commit, version,
  seed, deduplication and healing. What a consumer can check: its 200 `brief_id`s are the first 200
  of the brief manifest, in order, and for each, `brief`, `brief_params`, `intent`, `generator`,
  `canary`, `archlang_version` and `system_prompt_sha256` equal those of the first file's row with
  the same `brief_id`. SHA-256 `feb7f9121890b3d53d830cd5ce1d5c98df4324ccdd5b06cbf7822cfc7797d383`.
- `model-authoring-fable-report.json`: its report. SHA-256
  `42b9505408fbd1f14bbd70a88c1246005f853dd8a8d789a738090959aa19e4cb`.

Verdict counts per model (from the two reports; `valid` and `sound` are defined under *Fields*; `l0` is
the raw reply, `final` is after `arch fix` then `arch repair`):

| Model | Rows | L0 valid | L0 sound | Final valid | Final sound |
| --- | --- | --- | --- | --- | --- |
| `claude-haiku-5-5` | 390 | 347 | 252 | 347 | 253 |
| `claude-sonnet-5-5` | 390 | 387 | 351 | 387 | 353 |
| `claude-opus-5-5` | 390 | 389 | 247 | 389 | 247 |
| `claude-fable-5-2` | 200 (first 200 briefs only) | 200 | 194 | 200 | 194 |

On the same 200 `brief_id`s the other models score L0 valid / sound: haiku 181 / 132, sonnet
199 / 176, opus 200 / 116. Compare Fable with them only on those ids, not against the 390-row totals above.

**File order.** The order of the two files under `configs:` matters: the 1170-row file comes first,
so that schema inference reads it first.

**How the rows were made.**

- **Briefs.** Generated by `dataset/model-authoring/` in the main repository from seed `20261115`
  (the `default` config uses `20260712`). There is one procedural family, `spine`: a single-storey
  flat whose named, sized rooms line both sides of a central corridor, entered at its west end,
  phrased three ways. Each brief comes with a reference plan that must be strict-clean and satisfy
  the brief's intent contract, or the brief is rejected. The reference plan only shows that the
  brief can be met; no row publishes it.
- **Deduplication of the briefs.** Each brief was checked against the evaluation corpus, the
  fidelity corpus, and the `repair.jsonl` and `authoring.jsonl` files of this dataset as uploaded
  (pinned by SHA-256 at a Hugging Face revision). The checks are the `default` config's own: text
  (token-set Jaccard ≥ 0.5, or a shared 8-word n-gram) and structure (the reference plan's
  `describe()` fingerprint). Briefs were also checked against each other (an exact brief repeat,
  or an exact fingerprint repeat). The rejection counts are in the report.
- **Requests.** One Message Batch per model, one request per brief, `max_tokens` 16384, at the
  model's default sampling (no `temperature` is sent). The system prompt is the repository's
  `spec.llm.md` followed by a one-line reply-format instruction (reply with one fenced `arch`
  block); every row stores its SHA-256, and it was marked for prompt caching.
- **Healing.** The `repair` split's own deterministic pipeline: the machine-applicable fix
  fixpoint, then one `repair()`. `repair` declines what it cannot rewrite without discarding the
  author's arithmetic (for example furniture placed by an expression), and the row records why.
- **Rows not published.** A request that errored, expired or was cancelled, or that has no result,
  produces no row. Nor does a reply whose normalized text contains an evaluation golden or
  fidelity reference plan, or that has any fenced block (or a healed plan) whose structure matches
  one. Each case is counted in the report. These checks reduce the chance that a reply echoes an
  evaluation plan; they are not a proof that none does.

**Fields.**

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `<brief_id>--<model>` |
| `canary` | string | The dataset canary GUID (see *Contamination defense*). |
| `archlang_version` | string | The ArchLang version every diagnostic and verdict in the row was computed with. |
| `generator` | object | `{ name, version, seed, commit, tree_dirty }`: `seed` is the brief's own row seed; `commit` is the repository commit the batches were submitted from, and `tree_dirty` whether that working tree had uncommitted changes. |
| `brief_id` | string | `ma-spine-<seed>`; also the batch request's `custom_id`. |
| `brief` | string | The procedural brief, exactly as sent. |
| `brief_params` | object | The structured parameters the brief was written from: plan and corridor sizes, and each room's label, concept, side and size. |
| `intent` | object | The brief's machine-checkable intent contract (shape of `schemas/intent.schema.json`), including each named room's size. |
| `model` | string | The Anthropic model id requested. |
| `response_model` | string or null | The model id the API reported. |
| `batch_id`, `custom_id`, `message_id` | string | The Message Batch, request and response ids. |
| `system_prompt_sha256` | string | SHA-256 of the system prompt. |
| `raw_reply` | string | The reply's text, verbatim. |
| `stop_reason` | string or null | The API's stop reason (`end_turn`, `max_tokens`, …). |
| `usage` | object or null | The API's token usage, verbatim. |
| `source` | string | The canary comment line, then the `.arch` extracted from the reply (the first fenced block, else the whole reply). |
| `l0` | object | The verdicts on `source` (see below). |
| `after_fix_source` | string | `source` after the fix fixpoint. |
| `after_repair_source` | string | `after_fix_source` after one `repair()`: the healed plan. |
| `fix_kind` | string | `"none"`, `"fix"`, `"repair"` or `"both"`: which stage changed bytes. |
| `steps` | object\[] | The per-stage healing trajectory, in the `repair` split's shape. |
| `repair_unresolved` | object\[] | `{ id, reason }` for each problem `repair` declined to fix. |
| `final` | object | The verdicts on `after_repair_source`. |

`l0` and `final` share one shape: `errors` and `warnings` (counts), `valid` (compiles with no error
and draws), `sound` (valid and lint-clean), `diagnostics` (the compile and lint diagnostics, as in
the `repair` split), `intent` (the brief's intent check: `ok`, `satisfied`, `total`, `violations`
and, where a room size is bound, `measures`), and `facts`, the `describe()` projection that check
reads (rooms with labels, uses, areas and bounding boxes; windows and their rooms; doors; the
adjacency graph; the total area).

**Replaying a row.** Everything in a row except the reply and the API's ids and usage is computed
from the brief and `raw_reply` by the deterministic tools. Running extraction, `compile`/`lint`,
the fix/repair pipeline, the intent check and `describe()` again on a row's stored brief and
`raw_reply`, with the row's `archlang_version`, reproduces the row byte for byte against the raw
JSONL line (a row loaded through `datasets` pads `facts.adjacency` keys with nulls). The generator
wrote each row, parsed the line back and ran that replay before publishing it. Its `build` step is
byte-deterministic given the same raw batch results. Under a different ArchLang version the
replay is not expected to match.

**Limitations.**

- **One procedural family**, phrased three ways. Narrow by design: not a survey of real briefs,
  and not a benchmark.
- **The replies are a snapshot.** They depend on the model version, its default sampling, the
  system prompt (identified by its SHA-256) and the day the batch ran. A new run is a new sample,
  not a reproduction; only the part of a row computed from `raw_reply` reproduces.
- **The intent check is the brief's own contract**, not the project's evaluation judge. The
  verdict counts in this config are not comparable with the evaluation baseline numbers in this
  card, and they carry no claim about a feedback loop (see *Scope*, statement 3).
- **Not the evaluation set**, and never to be called held-out. The evaluation corpus and the
  fidelity corpus are public regression fixtures in the main repository.

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
an SFT-shaped asset (the `default` config; the `model-authoring` config is not offered as SFT,
fine-tuning or training data) plus reward-harness documentation (`arch score --brief` /
`validateIntent` as a continuous, deterministic reward signal); it carries no claim about the training outcomes of any
method.

**3. No feedback-loop claim.** Whether a diagnostic-feedback loop beats equal-token-budget
resampling has not been measured for ArchLang. One live run of that experiment was ratified by
the project owner on 2026-11-15 and ran that day; its analysis was pre-registered before
the run (`eval/live-runs/2026-11-t3-preregistration.md` in the main repository) and its record
is published in `eval/live-runs/2026-11-t3-result.md`. This dataset and card make no claim that
such a loop helps or does not help, before or after that run: the published record is the only statement of the result.
The run adds no rows to this dataset. Only structural facts are stated.

## Baseline context

For orientation only — these are numbers about a *model authoring plans*, not about this dataset.
Measured on the project's public 26-brief evaluation fixture with judge v2 (`gpt-5.5`, seed-pinned).

**Current baseline** (set 2026-11-16 from three runs at commit `2a210589`, the commit this
dataset's `model-authoring` config was generated at; the median run on valid and intent):

- **One-shot (L0):** valid 22/26 (85%) · intent 9/26 (35%) · sound 1/26 (4%).
- **Deterministic-tool overlay (L1)** — `fix` + `repair`, zero extra model calls: intent
  16/26 · sound 1/26.

**Earlier baseline, 2026-07-12** (an older author prompt and older compile and lint checks):
L0 valid 23/26 · intent 14/26 · sound 3/26; L1 intent 18/26 · sound 7/26. The two baselines were
measured with different rulers and are not compared: the difference is neither a measured
regression nor evidence against one (`eval/README.md` in the main repository).

The L1 lift belongs to the deterministic tool tier's ledger, not to any model loop. All figures
are judge-v2; the project never compares rates across judge versions, and neither should any use of
this dataset.

## Contamination defense

The 26-brief evaluation corpus and its goldens are a public regression fixture in the main
repository, not a holdout. The `default` corpus is generated independently and
**double-deduplicated**
against it:

- **Text:** a candidate brief is rejected if its normalized token-set Jaccard similarity with any
  evaluation prompt is ≥ 0.5, or if it shares any 8-word n-gram with one.
- **Structure:** a candidate plan is rejected if its `describe()` fingerprint (normalized room-label
  multiset with areas rounded to 0.5 m², the interior-door adjacency edge set, and the room count)
  exactly or near-matches any evaluation golden.

A CI test in the main repository (`test/dataset.test.ts`) enforces this permanently.

Every row embeds a canary **twice** — a `canary` field and a first-line `.arch` source comment — so
downstream model developers can probe for training-set leakage. The full string, documented openly:

```
ARCHLANG-DATASET-CANARY-422d0bc5-c0c6-4c6b-b3c5-3fbc401aefbf
```

## Verify any row yourself (zero install)

Every `default` row can be re-checked with the published CLI (`npx @chanmeng666/archlang …`).
A `model-authoring` row replays from its stored `brief` and `raw_reply` (see *Replaying a row*);
its `source`, `after_repair_source` and `intent` can be checked the same way as below:

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

- **Synthetic and procedural (`default` config).** Three template families (single-room studio, hall-served flat,
  consulting-room corridor) and six fault classes (off-wall door / window / opening,
  furniture-through-wall, blocked-doorway, and a combined case) — mirroring the repository's own
  fault-injection gate.
- **Narrow distribution by design.** Not a survey of real floor plans, and not a benchmark.
- **Not the evaluation set.** The `default` config is generated to be provably disjoint from the
  evaluation corpus; the `model-authoring` config's briefs are deduplicated against it (see its
  section), which reduces overlap but is not a proof for the model replies.
- **Sizes.** Approximately 1,200 `repair` rows and 400 `authoring` rows; exact counts, per-family
  and per-fault-class breakdowns, and rejection tallies are in the accompanying `report.json`.
  The `model-authoring` config holds at most one row per brief per model (1170 rows in the first file, 200 in the second); its counts
  are in the two report files.

## Why publish this

For an adoption-driven, open-source language, any model that learns ArchLang is a win. Publishing
the generator, the dataset, and the reward-harness documentation recruits community training on the `default` config rather than gatekeeping it. The
`model-authoring` config is not offered as training data.

## Links

- **Repository:** https://github.com/ChanMeng666/archlang (generator: `dataset/`)
- **Docs:** https://archlang.uk
- **npm:** https://www.npmjs.com/package/@chanmeng666/archlang
- **License:** CC0-1.0
