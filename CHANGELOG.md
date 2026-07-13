# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.16.0] - 2026-07-14

Downstream-driven round: ArchCanvas's archlang-1.15 adoption surfaced two upstream gaps its own
ship gate + topology fixer had already filled locally, so those capabilities move **upstream as
advisory data** and the generated agent docs are re-pointed to teach the v1.13 placement sugar
where models actually imitate it — the worked examples. Core stays zero runtime dependencies; the
default SVG output is byte-identical throughout.

### Added

- **`suggestTopology` gains two connectivity-fault kinds** — `Suggestion.code` widens 2 → 4 to
  `W_ROOM_UNREACHABLE | W_BEDROOM_NO_WINDOW | W_NO_ENTRANCE | W_BATH_VIA_BEDROOM`. Both new builders
  are ported from capabilities proven in ArchCanvas's production topology fixer and each mirrors the
  semantics of the matching `arch lint` rule so a suggestion fires iff the lint fires:
  - **`W_NO_ENTRANCE`** — fires when the plan has an exterior wall but no entrance
    (`access.hasEntrance === false`). Emits `door on <wall> at <pct>% width 900` candidates on the
    longest opening-free exterior run of an entrance-suitable room (not a bedroom, not a wet room),
    falling back to the remaining rooms only when no suitable room touches an exterior wall; the
    rationale names the room and that this creates the building's entrance.
  - **`W_BATH_VIA_BEDROOM`** — reuses the two-BFS pattern from the reachability lint (reach-all vs
    reach-excluding-bedrooms) to find a wet room reachable only through a bedroom, and suggests a
    door onto a neighbour that itself has a bedroom-free route (non-bedroom neighbours preferred over
    an exterior-wall fallback regardless of run length — reconnecting to circulation is the real fix).
    One suggestion per affected wet room.

  Both stay ADR 0005-compliant ([facts and lint, not an architect](docs/adr/0005-facts-and-lint-not-an-architect.md)):
  deterministic, closed-form, data-only, fail-open (`[]` on ambiguity or a resolve error), ordered by
  the existing free-run-length → wall-id → position tie-break, top 3 — never applied.
- **Furniture-aware door candidates.** For **door** candidates only, the blocked-span computation now
  also subtracts wall runs where a furniture footprint intrudes into the door's approach corridor — the
  strip inside the target room along that wall, `APPROACH_DEPTH = 900` mm deep — so a suggested door
  never opens straight onto a piece. Windows are exempt (furniture under a window is normal). The three
  door builders (`W_NO_ENTRANCE`, `W_ROOM_UNREACHABLE`, `W_BATH_VIA_BEDROOM`) feed the furniture-blocked
  runs into `longestFreeRun`; the window builder is unchanged. Fail-open — a furniture-free plan yields
  no blocked runs, so every pinned golden (all furniture-free fixtures) stays byte-identical.

### Changed

- **The generated agent spec now teaches attachment-first through its worked example.**
  `scripts/gen-llm-spec.ts`'s `SPEC_EXAMPLES` swaps the coordinate-math `studio.arch` for the
  attachment/strip/anchor `attached.arch` as the flagship worked example (`parametric.arch` stays second
  as the sanctioned computed-`at` idiom); neither `examples/*.arch` file changed. The `## Common
  mistakes` table is rewritten from coordinate fixes to attachment-first guidance (off-wall opening →
  `on <wall> at <pos>`, hosted by construction; hand-summed room offsets → `strip`; a guessed furniture
  `at` → `in <room> anchor <9-point>`), keeping the genuinely universal rows (mm units, +y down, unique
  ids). The fix-topology prose now names all four suggest kinds and leads with `arch suggest --json`.
  `spec.llm.md` regenerated (~15.9 → ~14.8 KB; `llms-full.txt` regenerated in the same chain).
- **`SKILL.md` anchor grammar corrected.** The stale `anchor <corner|edge>` placeholder becomes the real
  nine-point token list (`top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right`),
  and the topology section names all four suggest faults and notes the candidates are furniture-aware.
- **CLI / MCP prose lists all four suggest kinds.** The `arch suggest` usage line (`src/cli.ts`), the
  `cmdSuggest` doc comment (`src/cli/commands-author.ts`), and the MCP `suggest` tool description
  (`packages/mcp/src/server.ts`) now name unreachable / no-entrance / bath-via-bedroom / windowless-bedroom
  and note the attachment form + furniture-awareness. No wiring change — the raw `Suggestion[]` passes
  through untouched. The MCP shim republishes as **`@chanmeng666/archlang-mcp@0.2.1`** (version-bump-only
  release so the refreshed tool description actually reaches npm and the MCP registry — the release
  workflow's idempotency guard would have skipped an unbumped 0.2.0).
- **`suggestTopology`'s pre-existing `W_ROOM_UNREACHABLE` builder is now gated on the plan having an
  entrance.** An entrance-less plan previously produced per-room `W_ROOM_UNREACHABLE` suggestions; it now
  yields the single `W_NO_ENTRANCE` suggestion instead, matching the lint's own suppression behavior (the
  reachability rule reports no-entrance, not per-room unreachability, when there is no way in). No pinned
  golden is affected — the existing `faulty` fixture has an entrance.
- **Note (eval baseline):** `spec.llm.md` is the eval's author prompt, and this change replaces a worked
  example in it, so it now differs from the prompt behind the calibrated live baseline. No scoring/judge/fixture
  code changed; re-running the paid live baseline under the new prompt stays a separate, owner-approved action
  (default: not run).

## [Unreleased]

Repo tooling only — **no core code change; the published core stays at 1.15.0** (no new tag, no
release). Roadmap Tranche 5.

### Added

- **`dataset/` — the repair-trajectory + authoring dataset generator** (`npm run dataset:gen`;
  tsx, no new dependency). Produces two fully synthetic, self-verifying splits, deterministic from
  a pinned seed (default `20260712`), with `archlang_version` pinned to 1.15.0:
  - `repair` — a procedurally generated base plan, one injected fault (mirroring the six classes of
    the repository's fault-injection gate), the machine-readable diagnostics it raises, the source
    healed by the deterministic `fix` → `repair` pipeline, a unified diff, per-stage healing steps,
    and a `fix_kind` (`fix`/`repair`/`both`) that preserves the ADR 0011/0006 boundary in the data;
  - `authoring` — an NL brief, its golden `.arch`, the `describe()` facts, and a machine-checkable
    intent contract, all descending from one ground truth.

  Every row is constructed and re-checked by the deterministic compiler at generation time; a
  candidate that fails any gate is rejected and counted in `report.json`, never silently emitted.
  The generator imports only the pure core surface and nothing from `eval/`.
- **`test/dataset.test.ts` — the permanent contamination CI guard.** Generates a small fixed-seed
  corpus and asserts zero leakage against the private 26-brief eval holdout (dual dedup: normalized
  text Jaccard + 8-word n-gram, and structural `describe()` fingerprint), that the canary appears in
  every row's field and source comment, that generation is deterministic, and that a sample of rows
  replays its own verification. The private holdout is never published.

Consistent with the permanently-declined T3 experiment, the dataset and its card make **no claim
that a diagnostic-feedback loop does or does not beat equal-token-budget resampling** — only
structural facts. Published to HF as `ChanMeng666/archlang-repair-trajectories` (CC0-1.0) on
2026-07-13 — repair 1200 + authoring 400 rows.

## [1.15.0] - 2026-07-12

Roadmap Tranche 6 resolved (2026-07-12): **Gate G2 closed with residual area failures = 0/8**
on the calibrated baseline (`docs/research/2026-07-g2-verdict.md`) — the T6 area-syntax sugar
is **parked** behind frozen reversal triggers, and only the tranche's unconditional Track B
items ship below.

### Added

- **`matchVocabulary` — one shared closed-vocabulary matcher, and the advisory `W_ALIAS_MATCH`.**
  The token-bounded matcher core (`normalizeLabel`/`synonymMatchesLabel`) moved from
  `src/intent-concepts.ts` into new `src/vocabulary.ts`, and the scattered room-label regexes in
  `analyze.ts`/`analyze/circulation.ts` are re-expressed as its data-driven `USE_VOCABULARY`
  (canonical vs alias words per use kind). One matcher core, two vocabularies at two layers — the
  brief-level `CONCEPTS` table and `SYNONYMS_VERSION` are untouched (judge fixture byte-green; no
  second concept table). New advisory **`W_ALIAS_MATCH`** fires when a room with no authored
  `uses` classifies only via an indirect alias ("Powder" → WC, "Foyer" → entry), carrying a
  machine-applicable fix that inserts the explicit `uses …`; corpus classification is pinned
  byte-identical by `test/vocabulary-equivalence.test.ts` over every example and eval golden.
- **`rankFixes` — deterministic cost ordering for a diagnostic's fix alternatives** (exported).
  Orders the mutually-exclusive `fixes` on one diagnostic by applicability rank → total edit
  magnitude (smallest change wins) → earliest offset → stable index. `arch fix` now applies only
  the top-ranked alternative per diagnostic; LSP code actions present alternatives in the same
  canonical order. Identity on today's singleton arrays, so existing behavior is byte-identical.
- **`describe().freedom` — a degrees-of-freedom placement report** (append-only). Per placed
  element, whether its position was authored absolutely or derived by the resolver — rooms
  `absolute`/`relational`/`strip`, openings `attached`/`absolute`, furniture
  `anchored`/`against-wall`/`absolute` — as per-family counts plus one `elements` row each.
  Facts only (ADR 0005); the internal marker never reaches the Scene, so rendered output is
  unchanged.
- **Optional metric unit suffixes on numeric literals** (roadmap Tranche 6 Track B). A number may
  carry a `mm`/`cm`/`m` suffix, folded to millimetres at lex time: `3m` → `3000`, `3.5m` → `3500`,
  `3cm` → `30`, `3mm` → `3` (an explicit no-op). Bare numbers still mean millimetres, so **every
  existing plan's output is byte-identical** (a determinism/byte-equality test compiles a suffixed
  plan and its bare-mm twin and asserts equal SVG). The conversion is exact — decimal-point
  shifting on the digit string, never a floating-point multiply — so `3.333m` is exactly `3333` and
  `0.0005m` is exactly `0.5` mm. The suffix must sit immediately after the digits (no space) and
  does not fire when a letter follows (`3meters` = number `3` + ident `meters`); each component of a
  `WxH` literal may carry its own suffix (`3mx4m`, `3.5mx4200`). Deliberately **no area unit**
  (`m²`) — that belongs to the parked T6 area syntax (Gate G2 closed; see
  `docs/research/2026-07-g2-verdict.md`). The formatter normalises a suffixed literal to its mm
  value (`3.5m` → `3500`). Folded in the lexer (`src/lexer.ts`); the grammar source of truth
  (`src/grammar/tokens.ts`) and every generated artifact — editor grammars, `grammars/archlang.gbnf`,
  `spec.llm.md`, `llms-full.txt` — carry the optional suffix.
- **Note (eval baseline):** `spec.llm.md` is the eval's author prompt, and this change adds a line
  to it, so it now differs from the prompt behind the 2026-07-11/12 calibrated live baseline. No
  scoring/judge/fixture code changed; re-running the paid live baseline under the new prompt stays a
  separate, owner-approved action (default: not run).

### Changed

- **`arch fix` now collects fixes from lint diagnostics too** (previously compile-stage
  diagnostics only). `W_ALIAS_MATCH` is the first lint rule to carry a fix; the L1 gate's
  `l1Pipeline` remains the compile-stage-fix + `repair` reference pipeline and is unaffected.
- **A room labelled with a WC-only alias (e.g. "Powder") now classifies as a WC.** The word was
  dead in the old regex cascade (`WC_RE` was only consulted after `WET_RE`, which never matched
  it); the vocabulary form resolves it, flagged by `W_ALIAS_MATCH`. The one deliberate
  reclassification — every other label classifies exactly as before (pinned by test).

## [1.14.0] - 2026-07-12

v1.14 Tranches 1–2 + 4 — **the measurement foundation, then the intent channel it licensed**
(roadmap `docs/research/2026-07-roadmap-proposal.md`). Tranches 1–2 were repo-internal (eval/ and
CI only; the one core exception is the `repair()` purity fix under _Fixed_): **fix the ruler before
measuring capability**. Gate G1's PASS then cleared **Tranche 4**, which DOES extend the published
surface — the intent channel below.

### Added — Tranche 4: the intent channel (2026-07-12; core + CLI, zero new runtime deps)

- **`src/intent.ts` — the judge-v2 scoring core, lifted into the core package.** A brief's
  checkable expectations as data (`Intent`), lowered to the shallow predicate kinds
  (`room-count` / `room-exists` / `room-area` / `total-area` / `adjacent` / `reachable`, plus a
  new gating `room-windows`), checked against `describe()` facts.
  **`validateIntent(source, intent)`** → `{ ok, satisfied, total, violations, subscores,
  assertions, diagnostics }` with typed, catalogued violations and Nickel-style spanless blame
  messages (`intent /roomsInclude/1: no room matching concept "bathroom" …`);
  **`intentFromJson`** (zero-dep pathed shape walker); **`feedbackForResult`** (deterministic
  per-violation correction prompts — advisory data, ADR 0005, never auto-applied).
- **`src/intent-concepts.ts` — the concept vocabulary, now production name resolution.** Byte-
  mirrors the eval's table; a known concept resolves exactly as the eval judges (label →
  `room_type` → `uses`, token-bounded), an unknown one falls back to a literal
  id → label → uses → room_type match.
- **Eight catalogued codes**: `E_INTENT_ROOM_MISSING` / `_ROOM_COUNT` / `_ROOM_AREA` /
  `_TOTAL_AREA` / `_NO_WINDOW` gate; `E_INTENT_NOT_ADJACENT` / `_NO_DOOR` / `_UNREACHABLE` are
  advisory (`gate: false` — scored, never failing `ok`; `reachable` blames by cause: no entrance
  → `NO_DOOR`, cut-off rooms → `UNREACHABLE`). Promoting adjacency/reachability to gating stays
  parked on T3's still-open loop-vs-resampling question.
- **`schemas/intent.schema.json`** (`npm run gen:intent-schema`, drift-tested, served by the docs
  site). Its field docs make Gate G1's two lessons **normative**: the area **band conventions**
  ("about/~/bare N m²" → ±10%; "at least N" → `min` only; qualitative words → no assertion) and
  the **count discipline** ("assert a room count only when the brief enumerates it").
- **CLI**: `arch validate --intent <intent.json>` (the gate — exit 2 on a gating violation;
  composes with `--graph`/`--strict`; `--feedback` appends the correction prompts) and
  **`arch score <file> --brief <intent.json>`** (the continuous meter — `satisfied/total` +
  subscores, exit 0 on any successful measurement).
- **`describe()` windows gain `facing: "N"|"S"|"E"|"W"`** (append-only; the outward normal of the
  window's host wall), and intent `windows` assertions take an optional `facing`.
- **The eval now consumes the same implementation** (`eval/assertions.ts`/`synonyms.ts` are thin
  re-export shims; run.ts's `Expect` *is* the production `Intent`) — one judge, zero eval↔prod
  skew. **`JUDGE_VERSION` stays "2"**, proven by a pinned fixture (`eval/judge-fixture.json` +
  `test/eval-fixture.test.ts`) that every corpus per-assertion judgment is byte-identical across
  the lift; the fixture is regenerated only to record an approved bump, never to green a red suite.

### Added — release engineering: tokenless OIDC publishing (npm + MCP registry)

- **`.github/workflows/release.yml`** — a `v*` tag push (or manual dispatch) publishes the core,
  then the MCP shim, to npm via **OIDC trusted publishing with provenance** (no npm token exists
  anywhere; each package carries a one-time Trusted Publisher registration on npmjs.com pointing
  at this workflow), then syncs the **MCP registry** with `mcp-publisher login github-oidc` —
  also tokenless. Every step is idempotent (versions already on a registry are skipped, and the
  registry sync is guarded by the registry's own state), so partial failures re-run safely.
  Replaces the local granular-token publish flow that npm is deprecating through 2026–2027.
- **MCP shim 0.2.0** (`@chanmeng666/archlang-mcp`, registry entry updated): the `validate` tool
  takes an optional `intent` (gating assertions fail it; advisory ones score), a new **`score`**
  tool is the continuous satisfaction meter, and `intent.schema.json` ships as the
  `intent-schema` resource — the same `intentFromJson`/`validateIntent`/`feedbackForResult` path
  the CLI uses.
- Provenance gotcha, recorded: npm E422-rejects a publish whose `package.json`
  `repository.url` casing differs from the OIDC-attested repo (`ChanMeng666`, not
  `chanmeng666`) — fixed in both package.json files + server.json.

### Added — Gate G1 verdict + the L2 experiment harness (2026-07-12; still repo-internal)

- **Gate G1: PASS** (`eval/g1/` — generator harness, generated intents, double-blind scores,
  report). NL→intent-JSON per-assertion faithfulness on all 26 briefs: **154/157 (98.1%)** vs
  93.4% per-assertion accuracy of direct `.arch` generation (one-tailed z = 2.08, p = .019;
  valid-only sensitivity variant below resolution — recorded). The intent channel (roadmap T4:
  `src/intent.ts`, `arch validate --intent`, `intent.schema.json`) is **cleared** for a future
  release. The generation prompt is oracle-isolated and `test/g1.test.ts` enforces it.
- **T3 harness: the L2 tier** (`eval/l2.ts` + `eval/l2-run.ts` + `.github/workflows/eval-l2.yml`,
  `npm run eval:l2`). Diagnostic feedback loop (≤2 rounds, fed only compile/lint diagnostics +
  `fix --dry-run` previews + trimmed `describe()` — oracle-isolated) against an **equal-token-budget
  i.i.d. resampling control** (Olausson accounting, round-up favours the control), per-metric
  best-of, mean±σ across trials, `pass@n`/`pass^n`, retrying author + per-brief error isolation.
  Offline-tested (14 tests). **The live experiment has not been run** (cost declined) — the
  loop-vs-resampling question remains open and no loop-gain claim is made.

### Added — judge v2: brief-grounded intent scoring

- **Intent-assertion scoring core** (`eval/assertions.ts`, `JUDGE_VERSION = "2"`). `scoreSource` no
  longer greps the goldens for label substrings and golden-derived area bands; it lowers each brief
  to a small **intent-assertion data structure** — the shallow five kinds `room-count` /
  `room-exists` / `room-area` / `total-area` / `adjacent` / `reachable` — and checks the model's
  plan against *those*. The five-kind boundary is deliberately the one a future `src/intent.ts` can
  lift wholesale (Tranche 4 hook). `Score` gains append-only `subscores` / `assertions` /
  `judgeVersion` fields.
- **Oracle-isolated synonym table** (`eval/synonyms.ts`, `SYNONYMS_VERSION = 1`). Room-label matching
  runs through a versioned, **never-shown-to-the-model** concept table with token-bounded,
  one-room-one-concept greedy assignment — so "wc"/"toilet"/"bath" resolve to one concept without
  leaking the answer into the prompt.
- **Brief-grounded area checks.** Area is verified **only where the brief states a number**, in a
  ±10–15% band around *the brief's* number; all 20 golden-derived bands were deleted. Qualitative
  size words ("compact", "generous") carry **no** cap yet (a documented tier-b hook, added the day a
  real "oversized compact" instance appears).
- **Frozen corpus-review rubric** (`eval/rubric.md`). Blind-drafted by an isolated agent, then frozen
  with the approver's decisions: **room-count policy B** (a ±1 surplus passes the gate *only* when the
  extra room is pure circulation, operationalized as `planCirc >= expectedCirc + 1`); one-room-one-concept
  greedy assignment; qualitative size words carry no cap. Adjacency and reachability score as
  **subscores only, never a gate** (Tranche 4 hook).
- **Corpus 22 → 26.** Three prompts amended so every room count is brief-derivable
  (`two-bath-flat`, `against-wall-bath`, `accessible-bath`), plus a new **per-room-area slice**
  (`sized-kitchen-flat`, `sized-bedrooms`, `sized-wet-room`, `sized-office-mix`) so the area dimension
  is no longer total-only (H5) — every band carries the brief-source quote it came from.
- **L1 deterministic-tool gate** (`eval/faults/`, `eval/l1.ts`, `test/fault-injection.test.ts`, in CI
  via `npm test`). Six single-defect fixtures (off-wall door/window/opening, furniture-through-wall,
  blocked-doorway, and a combined case) prove the `l1Pipeline` — a bounded machine-applicable-`fix`
  fixpoint (mirroring `arch fix`) followed by `repair()`, in the ADR 0011 → ADR 0006 order — **heals
  every defect class deterministically and idempotently**, and is a byte no-op on a clean golden.
- **`--l1` live overlay** (`eval/run.ts`, live runs only). Reports the **deterministic dividend**
  ΔL0→L1 (what `fix`+`repair` recover for free, **zero extra API calls**) with a per-row heal column;
  the committed baseline delta stays L0-only so cross-run comparisons don't silently fold the tool
  tier into a model score.
- **eval-live workflow inputs** (`.github/workflows/eval-live.yml`): a `--l1` toggle (default on) and
  the corpus-covering `max` default of 26.

### Changed — live-harness integrity

- **Token budget & determinism.** Anthropic `max_tokens` 2048 → **16384** (reasoning models spend
  thinking tokens out of the completion cap — the 2048 ceiling truncated output into false
  invalidity) with `temperature: 0` and ephemeral **prompt caching**; the OpenAI path pins
  `seed = 20260711` and records `system_fingerprint` (temperature deliberately not sent).
- **`--budget <n>tok|<n>usd` circuit breaker** — a pre-call estimate halts the run before it
  overspends; skipped briefs are excluded from the denominators (over-estimating direction, verified
  price map).
- **Cross-judge guard.** `Baseline` now carries a `judge` field and `renderDelta` flags any delta
  taken across a judge-version change as **non-comparable** — a judge change is never a capability
  result.
- **Calibrated judge-v2 baseline** (`eval/live-baseline.json`; 26 briefs, `gpt-5.5-2026-04-23`,
  seed-pinned, GitHub Actions): **L0 valid 25/26 (96%) · intent 13/26 (50%) · sound 4/26 (15%)**;
  the `--l1` overlay lifts it to **intent 18/26 (69%, ΔL0→L1 +5) · sound 6/26 (+2)** — 7 briefs
  healed by 47 repair moves, 0 `fix` edits. The old 9% one-shot intent was ~55–65% **measurement
  artifact** (deep-dive H2); the calibrated 50% sits inside the roadmap's predicted 45–60% band.
  Residual true failures are dominated by physical violations (which L1 clears), with a few
  room-count and placeholder-label misses and one compile failure (the model inventing a `label`
  statement). Judge-v1 numbers are kept only as history.

### Fixed

- **`repair()` is pure again across repeated calls.** It mutated the shared parse-stage
  memo's AST in place (moving furniture `at` nodes), so a second `repair()` of the
  byte-identical source saw already-moved pieces and reported zero changes — same input,
  history-dependent output, violating ADR 0006's determinism promise. `repair` now works
  on a private deep clone of the parsed plan; `compile()` output was never affected
  (regression-tested in `test/repair.test.ts`). Found by the new fault-injection L1 gate.

## [1.13.0] - 2026-07-11

AI-native authoring release: make ArchLang **easier to write correctly the first time**
(placement sugar), **self-correcting as data** (machine-applicable fixes), **structured
in and out** (Plan JSON + a constrained-decoding grammar), **visible without a raster**
(ASCII), and **discoverable** where MCP hosts look (an optional server). The core stays
zero runtime dependencies; the default SVG output is byte-identical throughout.

### Added — placement sugar: write plans without hand-computed coordinates

- **Opening attachment.** `door` / `window` / `opening` can attach to a wall **by
  position** instead of absolute coordinates: `door on <wall> at <pos> …`, where `<pos>`
  is millimetres along the wall or a percentage (`50%`). `swing into <room>` picks the
  hinge/swing direction toward a named room; `hinge near start|end` hinges at the
  segment end nearer a wall end. Off-wall or ambiguous references are the catalogued
  `E_ATTACH_WALL_REF`; a position past the wall is `E_ATTACH_POS_RANGE`.
- **`strip` layout.** `strip <right|left|down|up> at (x,y) gap <mm> [height|width <mm>] {
  room … room … }` lays a row/column of rooms end to end, each sized on the run axis and
  sharing the strip's cross dimension. Pure sugar — it expands to ordinary absolute-placed
  rooms during resolve, so walls, doors, and relational references downstream are
  unchanged (`E_STRIP_NEST`, `E_STRIP_SIZE`).
- **Furniture by anchor.** `furniture <kind> in <room> anchor <corner|edge> [inset <mm>]
  …` snaps a piece to a room corner/edge with an optional inset, so furniture never needs
  a raw coordinate. New flagship example `examples/attached.arch` authors a full 1-BR with
  no hand-computed openings or furniture. See the [language reference](docs/language-reference.md).

### Added — machine-applicable fixes ([ADR 0011](docs/adr/0011-machine-applicable-fixes.md))

- **Structured `Diagnostic.fixes`.** Alongside the prose `fix`, a diagnostic can carry
  `FixSuggestion[]` — each a `title` plus byte-span edits and one of four rustc-style
  applicability tiers (`machine-applicable` · `maybe-incorrect` · `has-placeholders` ·
  `unspecified`). `diagnosticToJson` projects them; producers attach them (e.g. an
  off-wall opening → the attachment form, `machine-applicable` only when the nearest wall
  is unambiguous, else `maybe-incorrect`).
- **`applyFixes`** (exported): a pure piece-table replacer ported from rustfix — applies
  each suggestion atomically, rejects (never half-applies) any that overlaps an earlier
  edit, and reports what it skipped.
- **`arch fix`**: a bounded, self-checking fixpoint (compile → collect fixes → apply →
  recompile, ≤4 passes) that applies **only `machine-applicable`** by default; `--unsafe`
  widens to `maybe-incorrect`, `--dry-run` previews, `--force` keeps a pass that would
  otherwise be rolled back for raising the error count. Distinct from `arch repair`, which
  stays the geometric furniture solver ([ADR 0006](docs/adr/0006-solver-as-explicit-transform.md)).
- **`arch suggest`**: advisory topology suggestions as data (`suggestTopology`, exported)
  — ready-to-paste `door`/`window` statements (attachment form) that resolve an
  unreachable room or a windowless bedroom, never applied (ADR 0005).
- **LSP quick-fixes**: `codeActions` surfaces the same suggestions in-editor; a lone
  `machine-applicable` fix is marked the preferred action.

### Added — structured Plan JSON in & out, and a constrained-decoding grammar

- **Plan JSON** (RPLAN / DStruct2Design shape): `planFromJson` builds a plan from a JSON
  object, `planToJson`/`resolvedToJson` project a resolved plan out with enrichments
  (area, floor polygon, `input_graph`, edges), and `astToJson` is a span-bearing AST
  projection — all pure, deterministic, zero-dep, exported. Surfaced as **`arch compile
  --from-json`** and **`arch ast`**. Bad shapes are catalogued `E_JSON_SCHEMA` /
  `E_JSON_KIND`.
- **`schemas/plan.schema.json`** — the Plan-JSON JSON Schema (2020-12), generated from the
  `PLAN_JSON_SCHEMA` source (`npm run gen:plan-schema`, drift-tested).
- **Intent-graph check.** `checkGraph(source, intent)` compares a plan's interior-door
  adjacency to an intended `{ room: [neighbours] }` graph; surfaced as **`arch validate
  --graph <g.json>`** (a mismatch is a user-source error).
- **`grammars/archlang.gbnf`** — a GBNF constrained-decoding grammar generated from the
  token source (`npm run gen:gbnf`, drift-tested), so a local model can be constrained to
  emit only parseable ArchLang.
- **`arch complete --at <offset>`** — the LSP `completion()` core as a CLI command.

### Added — zero-dependency ASCII rendering

- **`renderAscii(scene)`** (exported): serializes a Scene to a fixed-width text floor
  plan — the channel a sandboxed, text-only agent uses to *see* its plan with no raster
  binary. Surfaced as **`arch compile -f txt`** and **`arch preview --ascii`**, with
  `--cols` (grid width) and `--charset unicode|ascii`. Deterministic; default output of
  every other format is unchanged.

### Added — MCP server ([ADR 0012](docs/adr/0012-mcp-shim-discoverability.md))

- **`@chanmeng666/archlang-mcp`** (new `packages/mcp/` workspace, published `0.1.1`): an optional
  stdio Model Context Protocol server that wraps the **library** (never a CLI subprocess)
  — tools `compile` / `describe` / `lint` / `validate` (with the optional intent-graph
  check) / `repair` / `fix` / `suggest` / `complete`, and resources `archlang://spec`,
  `archlang://context`, `archlang://schema`, `archlang://grammar`. **The core stays
  zero-dependency — the MCP SDK lives only in this package.** The CLI remains the primary,
  token-cheaper interface; the server is the *discoverability* channel (registry),
  amending [ADR 0009](docs/adr/0009-ai-first-context-and-distribution.md)'s
  distribution-over-protocol stance. Published to the official MCP registry as
  **`io.github.ChanMeng666/archlang-mcp`** (live on registry.modelcontextprotocol.io).
  `0.1.0` was published then superseded the same day by `0.1.1`: the registry namespace is
  case-sensitive and exact-matches the npm package's `mcpName` against `server.json`'s `name`,
  and caps the server description at 100 chars — `0.1.1` fixed the casing
  (`io.github.ChanMeng666/…`) and shortened the description.
- **Docs site**: every generated doc page is now also served as **raw markdown at
  `/<route>.md`** (e.g. `/spec.md`, `/reference.md`), and the machine-native
  **`/plan.schema.json`** and **`/archlang.gbnf`** artifacts are served at the site root
  (advertised in `llms.txt`).
- **VS Code extension** repacked and published as **`ChanMeng.archlang@0.5.0`** (bundles core
  1.13.0, so the language-surface additions — the attachment / `strip` / `anchor` grammar and the
  new codes — and the LSP quick-fix `codeActions` reach extension users). Marketplace upload stays a
  manual web step.

## [1.12.1] - 2026-07-07

### Fixed

- The PNG backend's lazy `import("node:fs")` / `import("node:url")` (font lookup) now carry
  `/* webpackIgnore: true */ /* @vite-ignore */` like every other Node-only lazy import, so a
  webpack/Next.js consumer importing the core **client-side** no longer fails its build trying to
  resolve `fs` for the browser (the code path never runs in a browser; same class of bug as the
  1.0.0 → 1.0.1 fix). Found by ArchCanvas's first in-browser use of the core.

## [1.12.0] - 2026-07-06

AI-first release (Mermaid-inspired): make ArchLang maximally discoverable, self-describing and
distributable for AI agents. Default SVG output stays byte-identical throughout; every new output
behavior is opt-in (ADR 0007 discipline).

### Added — agent context & diagnostics

- **`llms-full.txt`** (generated, drift-tested via `npm run gen:llms` / `scripts/gen-llms-full.ts`):
  the full language spec, the `SKILL.md` agent workflow, a manifest-derived CLI reference and the
  complete diagnostic catalog bundled into one system-prompt-ready document (~40 KB). Ships in the
  npm package; the docs site now serves **`/llms.txt`** and **`/llms-full.txt`** at its root
  (copied into `docs-site/public/` by `sync-docs.mjs`, per llmstxt.org convention).
- **`arch context`**: prints the bundle — one command gives a cold-start agent everything
  (`arch spec` remains the language-only view).
- **`diagnosticToJson(source, d)` + `DiagnosticJson`** (new `src/diagnostic-json.ts`, exported):
  the CLI's agent-facing diagnostic projection (line/col from byte spans + catalogued `fix`) is now
  public API for SDK/playground/LSP consumers. CLI JSON output is byte-identical.

### Added — always-visible errors & eval spine

- **Opt-in error-card SVG**: `compile(src, { onError: "svg" })` / `--error-svg` on
  `compile`/`preview`/`md` — a plan that fails to compile still renders a deterministic,
  self-describing SVG card (severity, code chip, line:col, message, catalogued fix; new
  `src/backends/error-svg.ts`, exported `renderErrorSvg`). Errors/diagnostics/exit codes are
  unchanged; without the opt-in, a broken plan still produces no bytes. `arch md --error-svg`
  renders failing fenced blocks as error cards instead of skipping them. Also exported:
  `renderPngFromSvg` (raster core extracted from the PNG backend).
- **Authorability eval hardened**: corpus grown 3 → **18 briefs** with hand-verified goldens
  (relational placement, `dims auto`, `against wall`, multi-bath topology, open-plan `opening`,
  accessibility briefs, scripting, an intentional-warning shell, 30–126 m²); offline golden
  regression gate wired into CI (**`npm run eval:ci`**, no API key); default live-eval model id
  updated.

### Added — distribution

- **Docs site**: plain ```` ```arch ```` fences in any docs page now render as live, editable
  `<ArchLive>` widgets (markdown-it fence transform; SSR/no-JS keeps the highlighted block;
  ```` ```arch static ```` opts out). Explicit `<ArchLive>` usage is untouched.
- **GitHub Action** `.github/actions/arch-render` (composite, in-repo): render every fenced
  ` ```arch ` block in a repo's Markdown via `arch md` — inputs `files`/`format`/`out-dir`/
  `error-svg`/`version`, with a self-test workflow. With `error-svg: true` (default) broken blocks
  become error-card images and the job stays green.
- **Playground**: **Copy-for-LLM** button (current source + `describe()` facts + diagnostics with
  fixes + spec pointer as one paste-ready prompt; pure `buildLlmPrompt` helper) and diagnostics
  now show their catalogued fix inline (full cause/example still behind the disclosure).

### Added — accessibility as a language feature

- **`compile(src, { accessible: true })` / `arch compile --accessible`**: the SVG carries
  `<title>` (plan name), `<desc>` (a derived one-sentence caption) and `role="img"` +
  `aria-labelledby`. The caption is also exposed as **`describe().caption`** (same sentence,
  guaranteed identical). Default output byte-identical without the flag.
- **`accTitle` / `accDescr`** plan-level keywords (the release's one language-surface change):
  explicit accessible metadata overriding the derived title/caption. Duplicate → new
  `W_DUP_ACC_METADATA` (last wins); misplaced → new `E_ACC_PLACEMENT`. Grammar/spec/editor
  artifacts regenerated; new `examples/accessible.arch`; `arch fmt` prints and preserves both.
  **VS Code extension repack required** (it bundles the core).

## [1.11.0] - 2026-07-03

### Added

- Annotate mode now stamps `data-arch-id` / `data-arch-kind` on element primitives.
  `data-arch-kind` is stamped for **every element kind except `wall`** — currently `room`,
  `door`, `window`, `opening`, `furniture`, `dim`, and `column` (the non-wall members of
  `ElementKind`; the set is open-ended and grows as kinds are added). Walls are excluded —
  their SVG is unioned geometry stitched across many statements, so per-element attribution
  is ambiguous. Default (non-annotate) output remains byte-identical.
- `diffPlans(sourceA, sourceB, opts?)`: deterministic semantic diff of two plans built on
  `describe()` — room/opening/furniture changes, per-room bbox edge deltas, circulation deltas,
  and human-readable summary sentences.

## [1.10.0] - 2026-07-02

### Added — human circulation: facts, lint, overlay & repair guard (ADR 0008)

Circulation analysis grows from "is every room reachable?" to "how far, how wide, how direct is
the walk?" — strictly as **facts + advisory + explicit transform** (ADR 0005/0006 discipline; no
generative layout). The authoring language is untouched and **default output stays byte-identical**
(pinned by tests).

- **Facts** (`describe().circulation`, new `src/analyze/circulation.ts`): a whole-plan navigation
  grid — walls rasterised, rooms stitched through door/opening portals, obstacles inflated by a
  300 mm body radius — yields per-room `walkDistanceMm`, `bottleneckClearWidthMm` (widest-path
  pinch) and `detourRatio` from the entrance, plus key-pair routes (kitchen↔living/dining,
  bedroom↔bath). `null` when the plan has no entrance. Deterministic BFS; pure; zero-dep.
- **Lint**: `W_PATH_TOO_NARROW` (a walk's unavoidable pinch below `minPathClearWidthMm`, default
  700 mm = a standard door's clear opening; the `accessibility-advisory` profile raises it to
  900 mm) and `W_CIRCUITOUS_PATH` (entrance walk > `maxDetourRatio` × straight-line, default 3.0).
  Appended after all existing rules, so prior lint output order is unchanged; `examples/studio.arch`
  stays lint-clean at defaults.
- **Overlay** (opt-in, ADR 0007 pattern): `compile(src, { overlays: ["circulation"] })` /
  `arch compile --overlay circulation` draws the entrance walks (dashed), key routes, and a
  bottleneck marker + clear-width label per room on the annotations layer — appended after all
  existing nodes, folded into the compile cache key; without the option the SVG is byte-equal to
  the default (tested). The playground gains an off-by-default **Paths** toggle; exports stay
  overlay-free.
- **Repair guard**: `arch repair` now rejects a candidate furniture move that would *newly* pinch
  any entrance walk or key route below `minPathClearWidthMm`, leaving the piece in place and
  reporting it in `unresolved` (report-don't-guess; fixpoint convergence and all pre-existing
  repair outputs verified byte-identical).

### Changed — foundation refactor: perf, architecture & tooling (default output byte-identical)

A ground-up hardening pass. **Every default artifact is byte-identical** — SVG/PNG goldens, scene
snapshots, DXF, the formatter and all `--json` outputs are unchanged (`UPDATE_GOLDENS` was never
used); the public API only grew (`COMPLETION_KINDS`, `EXPORT_FORMATS`, `Scene.chrome`).

- **Perf — wall union rewritten** (`src/geometry/union.ts`): coverage is rasterized once into a flat
  cell grid with packed-integer edge keys instead of per-cell centre-in-rect scans over every
  rectangle. Opening-heavy plans: `toScene` ~19.5 → ~2.6 ms (full compile ~42 → ~24 ms).
  `toScene` also computes `hatchesUsed`/`layoutChrome` once and carries the chrome on the Scene
  (new optional `Scene.chrome`; backends fall back for hand-built Scenes).
- **Perf — `arch validate`/`arch lint` no longer render the SVG they discard**: both use the
  internal resolve pipeline (diagnostics verified byte-identical), so the ship-gate path skips the
  most expensive compile stage entirely.
- **Bench told the truth for the first time**: stage rows had measured memo-cache hits (~0.08 ms)
  and the generated BALANCED plan had 100 furniture parse errors from a stale `id=` slot. Timed
  closures now clear the stage caches, `render` split into `toScene`/`renderSvg`, new `lint`/
  `describe` rows, baseline regenerated (old numbers not comparable).
- **Architecture**: `lint()`'s 290-line body is now one module per rule (`src/lint/rules/*`) over a
  shared precomputed `LintContext`, with the emission order documented as contract; the duplicated
  rect/wall-intrusion/door-landing math lives once in `src/geometry/rect.ts`; the deterministic
  number formatter lives once in `src/num-format.ts` (per-site precisions preserved); the three
  long orchestrators (`parsePlan`, `resolveImpl`, `synthDims`) are decomposed; the legacy
  `render.ts` shim is gone.
- **Drift joints pinned by tests**: `KEYWORDS.element` ↔ `BUILTIN_DEFS` (both directions + order),
  fixture zone classification derived from the catalog (`zones` field; membership pinned to the
  historical lint literals), glyph categories ⊆ catalog, and the VS Code completion-icon map is now
  compile-time exhaustive over the new `COMPLETION_KINDS` core export. Export formats single-source
  from `EXPORT_FORMATS` (deliberately not a public registry seam — documented in AGENTS.md).
- **Tooling**: Biome adopted repo-wide (format + lint, CI-gated); `noUncheckedIndexedAccess`
  enabled and fixed across `src/`; CI matrix gains Node 22 and an explicit `gen:spec` drift step.
- **Playground is TypeScript**: all hand-written modules migrated under `strict` (the generated
  `arch-language.js` stays JS), `main` split into focused modules (~695 → ~290 lines), and the
  share codec / storage / snapshots / completion map gained 22 vitest tests wired into the root
  suite. Suite: 488 → **515 tests**.
- **Docs**: completed build plans archived under `docs/archive/`; AGENTS.md's headline no longer
  embeds a version.

### Added — embeddable playground viewer + live docs examples (sites only; core untouched)

Two ZenUML-inspired distribution/UX wins, both entirely in the deployed sites — **no change to the
published `@chanmeng666/archlang` core** (its `src/`, output, goldens, and 488-test suite are
untouched):

- **Playground — embeddable widget.** A new chrome-less `embed.html` page renders any plan from the
  existing `#z=` share hash, so a floor plan can be dropped into a blog / Confluence / GitHub-Pages
  via a single `<iframe>`. A new **Embed** button generates the iframe + Markdown snippet; the embed
  supports `&editable=1` (live editor), `&theme=`, pan/zoom, and an attribution chip. The share codec
  moved to `playground/src/share.js` (one scheme for both pages); SVG-sizing to `playground/src/viewer.js`.
- **Playground — IDE-parity actions** wiring already-shipped core APIs into the UI: a **Format**
  button (`format()`), a **Repair furniture** panel (`repair()`) that shows the change log with an
  **Apply fixes** action (opt-in, reviewable — ADR 0006 preserved), and **clickable diagnostics** that
  jump the caret to the source span and reveal the error-catalog cause/fix/example (`ERROR_CATALOG`).
- **Docs — live, editable examples.** A new `<ArchLive>` VitePress component compiles a plan in the
  browser (SSR-safe, so no-JS visitors still get the SVG) with a live editor, a `describe()` facts
  strip, and an **Open in Playground** link. The examples gallery and the guide hero are now live;
  example sources are generated into `examples-data.js` from `examples/*.arch` by `sync-docs.mjs`.

## [1.9.0] - 2026-07-01

### Added — opt-in source annotation (`compile(src, { annotate: true })`)

An additive, opt-in compile option that stamps `data-span="start:end"` (the source byte range) on
each drawn SVG primitive that carries a span, so a tool can map a clicked element back to the source
that produced it. **Default output is byte-identical** — with the flag off, the Scene IR and the SVG
string are unchanged (existing goldens/snapshots untouched; exported files stay clean). `toScene`
copies the resolved element's span onto its nodes only in this mode; walls are unioned across
statements, so their per-node span is intentionally left unset. The option is folded into the compile
cache key. The core stays zero-dependency and deterministic (the annotated output is itself stable).
See **[ADR 0007](docs/adr/0007-opt-in-source-annotation.md)**. Programmatic only — not a CLI flag.

### Changed — playground: mermaid-live-editor–grade editing + click-to-source

The deployed playground (the Vite app, not the published package) was brought to
mermaid-live-editor parity and given two floor-plan-specific affordances:

- Preview **pan / zoom / fit** with a floating toolbar (zero-dep CSS-transform controller);
- **Editor autocomplete**, reusing the core `completion()` language service;
- **Compressed share links** (`#z=` deflate-raw via native `CompressionStream`; still reads the
  legacy `#src=` form);
- **Autosave + named snapshot history** in `localStorage`;
- **Copy SVG / Copy PNG** to the clipboard, and **draggable resizable panes**;
- An always-visible **facts strip** (`describe()` totals: rooms/doors/windows/area/entrance);
- **Click any element → jump the editor caret to its source** (via the new `annotate` `data-span`);
- **Hover a room → area/size tooltip** (geometric hit-test against `describe()` bboxes).

Every export/copy strips the `data-span` annotations, so downloaded SVG/PNG/PDF stay clean.

## [1.8.0] - 2026-07-01

### Added — agent CLI ergonomics (mermaid-cli-inspired): preview · batch · md · manifest

Four additive commands close the gaps between the `arch` CLI and a frictionless agent workflow,
without touching the zero-runtime-dependency, deterministic core:

- **`arch preview <plan> -o out.png`** — render a PNG an agent can *look at*, PNG-first at `scale 2`.
  Zero-install where the optional `@resvg/resvg-js` binary is present (a normal `npm i`/`npx`
  installs it); when it is genuinely absent the failure is the catalogued, self-correcting
  **`E_PNG_DEPENDENCY`** (with a `fix`) instead of an opaque thrown error, and `--install` fetches
  the dep (detecting npm/pnpm/yarn) and retries. The auto-install is the one opt-in, networked CLI
  action — confined to the CLI seam, never the core.
- **`arch batch <a.arch> <b.arch> …`** — render many files concurrently (`-j` jobs, default CPU
  count; `-o <dir>`), with a stable `{ ok, results: [...] }` JSON shape for exploring design variants.
- **`arch md <doc.md> -o out.md`** — render every ` ```arch ` block in a Markdown file and rewrite
  each to an image link (mermaid-cli's markdown mode). Pure `extractArchBlocks`/`rewriteMarkdown`
  helpers back it.
- **`arch manifest --json`** (alias `capabilities`) — the whole CLI API as one structured document
  (commands, flags, formats + their optional deps, elements, keywords, lint profiles, fixture
  categories, error codes) so an agent discovers the surface without parsing prose. A drift test
  keeps it in lockstep with the command dispatch and the fixture glyphs.

`spec.llm.md` (`arch spec`), `SKILL.md`, and the README agent section document the new commands;
`--install` is opt-in and the core stays zero-dependency.

## [1.7.1] - 2026-06-30

### Added — agent guidance: repair topology (doors/windows) from the access graph

`SKILL.md` (and a pointer in the generated `spec.llm.md` / `arch spec`) now documents a concrete,
verified procedure for the agent layer to make every room reachable and every bedroom lit by **adding
doors/windows** — the design choice the core deliberately won't make (ADR 0005). It drives off
`describe --json` (access graph, room bboxes/adjacency, building extent), with exact on-centerline
coordinate arithmetic, a priority that gives a cut-off living space its own exterior entrance rather
than routing circulation through a bedroom, and a re-`repair` → `validate --strict` loop. Verified
end-to-end on two ArchCanvas plans (broken AI plan → `repair` + this procedure → fully clean). No core
code change.

## [1.7.0] - 2026-06-30

### Changed — `arch repair` also clears door-swing arcs

`arch repair` now fixes six furniture-placement faults (was five): a piece sitting in a
door's **swing arc** (`W_SWING_OBSTRUCTED`) is moved out of the quarter-disc the leaf
sweeps. Because the swing is a 90° sector (not a box), the minimal clearing shift along
each axis is found by grid-stepping against the *same* predicate the lint uses
(`sectorIntersectsRect`), so repair clears exactly what the warning flags — preferring a
shift that doesn't drive the piece into a wall, reporting an exact tie. Priority is now
wall → wrong-room → overlap → doorway → **swing** → floating. On the three motivating
ArchCanvas plans, repair now drives every furniture-placement *and* swing warning to zero.

## [1.6.0] - 2026-06-30

### Changed — `arch repair` also separates overlaps and relocates wrong-room fixtures

`arch repair` now fixes five furniture-placement faults (was three), via a global
fixpoint that iterates every piece to a stable arrangement:

- **Separates overlapping pieces** (`W_FURNITURE_OVERLAP`) — the later piece in source
  order yields, pushed along the axis of least overlap (a deterministic mover order, so
  a pair never chases itself).
- **Relocates a fixture to its declared room** (`W_FIXTURE_WRONG_ROOM`) — a piece placed
  `in <room>` but drawn outside it is moved back inside (fully inside when it fits).

These compose with the existing wall / doorway / floating fixes (priority: wall →
wrong-room → overlap → doorway → floating), so e.g. a wrongly-placed fixture is moved
into its room *and then* snapped to that room's wall in one repair. Still deterministic,
closed-form, and report-don't-guess (cycling / ambiguous / too-far pieces go to
`unresolved`).

## [1.5.0] - 2026-06-30

### Changed — `arch repair` now fixes all three furniture-placement faults

`arch repair` previously only pushed furniture out of walls. It now iterates each piece
to a stable position across three closed-form fixes (priority wall → doorway → floating):

- **Clears door landings** — a piece in a door's clear approach is pushed out, preferring
  an exit that doesn't drive it into a wall (so a fixture by a doorway moves into the room,
  not into the wall behind it).
- **Snaps floating fixtures** — a wall-requiring fixture floating mid-room is snapped onto
  its nearest wall (within a sane distance; farther pieces are reported, not dragged).
- **Convergence + honest reporting** — a piece that would cycle, sits with no majority
  side, or floats too far is left at its best position and reported in `unresolved`.

On the three motivating ArchCanvas plans, `arch repair` now drives every furniture
placement warning (`W_FURNITURE_WALL_COLLISION` / `W_DOORWAY_BLOCKED` /
`W_FIXTURE_FLOATING`) to **zero**, and is idempotent.

`RepairChange.kind` is now `"moved"` (a single move may combine fixes); the per-piece
`reason` string summarises every fix applied.

## [1.4.0] - 2026-06-30

### Added — physical-correctness & circulation (Claude × Codex adversarial pass)

A second Claude Code × Codex review (prompted by AI-generated plans that rendered with furniture
through walls, fixtures piled in doorways, and rooms with no door) hardened the renderer and the
soundness layer, **without** turning `compile()` into an arranger. See the new
[ADR 0006](docs/adr/0006-solver-as-explicit-transform.md): a solver may exist only as an explicit
source-to-source transform, never as invisible render behavior.

- **Render fidelity:** `dims auto walls` annotates each distinct wall thickness once (deduped); the
  new mode is also included in `dims auto all`. Per-room dimensions (`dims auto rooms`) now sit in the
  page margin on the side each room faces, instead of overlapping the room label/area inside the room.
- **New lint rules (advisory, deterministic facts — ADR 0005-compliant):**
  `W_FURNITURE_WALL_COLLISION` (a piece drawn through a wall solid, via AABB intrusion over
  `segmentRectangle`, opening-aware), `W_DOORWAY_BLOCKED` (furniture in a door's clear landing — the
  walk-through path, distinct from the swing arc), and `W_ROOM_NO_CLEAR_PATH` (a grid flood-fill in
  `analyze/occupancy.ts` finds a room whose doorways can't reach a usable patch of floor). New ruleset
  knobs `doorwayLandingMm` and `minClearAreaM2`; the accessibility profile tightens the landing depth.
- **Strict gating:** `arch validate --strict` (alias `--fail-on-warning`) makes advisory warnings
  fail too (exit `2`) — the gate a generation pipeline runs so it can't ship a plan lint flagged. The
  agent contract (`SKILL.md`, `spec.llm.md`) now mandates this gate and an explicit furniture-placement
  discipline (back fixtures to walls with `against wall`, keep every room reachable, keep doorways
  clear).
- **Catalogued footprints:** a known fixture placed `against wall` may omit `size` and take its
  conventional footprint from `fixtures-catalog.ts` (closed-form, never a guess).
- **`arch repair`:** a new opt-in, source-to-source corrector. It pushes furniture out of walls and
  emits **new `.arch` source plus a change log** (never an invisible edit); ambiguous, scripted, or
  `against wall` pieces are reported, not guessed. Exported as `repair()` from the public API.
- **eval:** the offline harness now fails any golden that has a physical-correctness violation (the
  three new codes), guarding authorability regressions.

### Fixed

- The formatter (`arch fmt`) silently dropped the `dims auto` directive; it is now preserved.

## [1.3.2] - 2026-06-28

### Changed — docs site & playground brought up to v1.3 (no compiler changes)

A documentation/UX patch: the compiled core (`dist/`) is **byte-identical** to 1.3.0/1.3.1 — only the
two visitor-facing surfaces changed. They had fallen a release behind the language and didn't show
the v1.3 features (`opening`, room `uses`, wall-anchored furniture, the access graph, lint profiles).

**Docs site (`docs/`, `docs-site/`):**

- **`docs/language-reference.md` rewritten to v1.3** (synced verbatim to the site's `/reference`):
  documents the cased **`opening`** element, room **`uses`** tags, the v1.3 furniture grammar
  (`against wall [segment|offset|side]`, `rotate`, `in <room>`), lint **profiles**, and an Analysis
  pointer.
- **Two new pages**: `docs/furniture.md` (absolute vs wall-anchored placement, the fixture-symbol
  catalogue, the importable fixture library, fixture lint rules) and `docs/analysis.md`
  (`describe` schema, the modelled **access graph**, the lint rule families + profiles, the ADR-0005
  "facts not an architect" framing). The JSON in both is pasted **verbatim from real
  `arch describe` / `arch lint` output**.
- **Wiring**: `sync-docs.mjs` copies the two pages; the VitePress sidebar/nav add them and surface
  the previously-missing **ADR 0005**. The home/guide/agents/examples pages were refreshed (and the
  agents page's stale `describe` example — wrong areas/adjacencies/room count — corrected).

**Playground (`playground/`):**

- **All canonical examples** in the picker as a learning progression (Single room → Studio →
  Two-bed → Relational → Themed → Parametric), imported via Vite `?raw` so they can't drift.
- **Theme switcher** (re-render in blueprint/dark/mono/presentation via `CompileOptions.theme`),
  **lint-profile toggle** (`residential-basic` ↔ `accessibility-advisory`), an **access-graph
  visual** in the Describe tab (rooms bucketed by depth-from-entrance with clear-width + reachability,
  raw JSON kept in a `<details>`), and a backend-free **shareable permalink** (`#src=` base64url) with
  a Copy-link button. No new dependencies.

439 tests pass; typecheck, `docs:build`, and `playground:build` all clean; no codegen drift. Verified
in-browser: every example renders, all four playground controls work, and the permalink round-trips.

## [1.3.1] - 2026-06-28

### Fixed — bundled examples & agent spec (no compiler changes)

A content/documentation patch: the compiled core (`dist/`) is **byte-identical** to 1.3.0 — only the
shipped example sources and the generated agent spec changed. The flagship examples are embedded
verbatim in `spec.llm.md` (what an agent ingests via `arch spec`) and consumed by the playground and
docs gallery, and they taught a few unprofessional patterns. Fixed at the source:

- **`examples/studio.arch`** — the bath door's inside entry path was blocked by the shower
  (re-laid the fixtures: shower to the far corner, basin/WC against the walls, so the entry stays
  clear); replaced the redundant living↔hall swing door with a leaf-less **`opening`** (circulation
  stays sound — the bath is reached via the hall, never the bedroom); and referenced the perimeter
  dimensions to the building's **outer faces** so the extension lines start at the wall and read
  outward instead of denting back into it (spans unchanged: 4000 · 3000 · 7000 · 6000).
- **`examples/parametric.arch`** — the overall "units" dimension ran left-to-right and landed
  *inside* the building; reversed it and referenced the outer face so it sits above the row.
- **`spec.llm.md`** regenerated from the corrected examples; SVG/scene snapshots and visual goldens
  updated.
- **Playground** now imports the canonical `examples/*.arch` via Vite `?raw` instead of a
  hand-copied duplicate, so the live demo can no longer drift from the shipped source.

439 tests pass; `arch lint examples/studio.arch` is clean; no codegen drift.

## [1.3.0] - 2026-06-28

### Added — architectural soundness, circulation facts & professional placement

A Claude × Codex adversarial design pass. The compiler stays a faithful, deterministic renderer; the
new "design intelligence" ships as **facts** (`describe`) and **advisory `lint`** — never as an
auto-arranger (codified in `docs/adr/0005-no-invisible-architect.md`).

- **Room `uses` tags** — `room … uses living|kitchen|bedroom|bath|wc|hall|…` makes room
  classification authored intent instead of a label-regex guess. A central `roomUses()` classifier
  (`src/analyze.ts`) wins over the regex; untagged plans behave identically. Surfaced as
  `describe().rooms[].uses`.
- **Modeled door/opening access graph** (`buildDoorAccessGraph`) — entrances, per-room
  reachability + depth from a synthetic exterior node, and a widest-path clear-width bottleneck
  (nominal vs estimated clear width). Surfaced append-only as `describe().access`.
- **Cased `opening` element** — `opening at (x,y) width N [wall …]`, a leaf-less gap that voids the
  wall and connects two spaces, so open-plan layouts read as connected in the access graph.
- **`furniture rotate 0|90|180|270`** — quarter-turn the drawn symbol (exact integer rotation,
  byte-stable), and **`furniture … against wall <id> [segment <n>] [offset <d>] [side left|right]
  size <along>×<depth>`** — closed-form wall-anchored placement that derives position + rotation so
  the symbol's back sits flush; `side` is inferred from `in <room>` when omitted.
- **Furniture ownership** — `furniture … in <roomId>` declares the owning room.
- **New lint rules**: `W_ROOM_UNREACHABLE`, `W_FURNITURE_OVERLAP`, `W_FIXTURE_FLOATING`,
  `W_FIXTURE_WRONG_ROOM`, `W_FURN_CLEARANCE` (a fixture's use-space blocked by free-standing
  furniture). New errors `E_OPENING_WIDTH`, `E_FURN_ROOM`, `E_FURN_ROTATE`, `E_FURN_AGAINST`.
- **Advisory lint profiles** — `arch lint --profile residential-basic|accessibility-advisory`.
  Honestly named (never `ada`/`iso`): an advisory check, not a compliance guarantee.

### Fixed

- **Door swing arcs were concave.** The SVG sweep flag in `doorSwing` was inverted, selecting the
  wrong candidate circle; arcs are now convex quarter-discs centred on the hinge (SVG + PDF; DXF was
  already correct).
- **Overall/right-edge dimensions were drawn into the building.** Corrected the `synthDims` endpoint
  order and the studio example so a positive `offset` always lands outside the footprint.
- **The title block was crossed by the bottom dimension.** A new shared `src/chrome-layout.ts` stacks
  the scale bar + title block below the dimension band and grows per-side page margins; the SVG and
  PDF backends now build chrome from the one source.

### Changed

- `examples/studio.arch` now demonstrates `uses` tags and stays lint-clean. Snapshots, visual
  goldens, the editor grammars, the embedded spec, and `docs/error-codes.md` were regenerated.
- `WallSegment` carries `wallId` + `index`, so every opening host knows which wall (`AccessEdge.hostWallId`).

## [1.2.0] - 2026-06-27

### Added — architectural soundness, fixtures, auto-dimensioning

The mechanical compiler was sound but blind to tacit architectural knowledge: the canonical studio
passed `arch lint` despite a bathroom open to the living room and reachable only through the bedroom.
This release makes wrong plans hard to ship and easy to detect, and makes wet rooms read
professionally. Existing rendered output is unchanged except where a fixture symbol now draws.

- **Four architectural lint rules** (`src/lint.ts`), tunable via the existing `LintRuleset`:
  `W_BATH_VIA_BEDROOM` (a bath reachable from the entrance only by passing through a bedroom —
  door-graph BFS), `W_ROOM_NOT_ENCLOSED` (a wet room with an unwalled perimeter run),
  `W_SWING_OBSTRUCTED` (a door leaf sweeping onto furniture or another door's swing), and
  `W_ROOM_NO_FIXTURE` (a bath/kitchen with no fixtures). Documented in the catalog (`arch explain`).
- **Drawn fixture symbols** (`src/elements/fixtures-glyphs.ts`). `furniture wc|basin|shower|bathtub|
  kitchen_sink|counter|fridge|stove …` draws a real plan symbol instead of an empty labelled box,
  with a safe fallback to the rectangle for any other kind. Standard fixtures also ship as a
  component library (`examples/lib/fixtures.arch`).
- **`dims auto [overall|rooms|all]`** — synthesize dimension strings without hand-placing each `dim`.
  Presentation-only (lowered in `scene-build.ts`), so `describe`/`lint` and the resolve cache are
  unaffected.
- Shared geometry — the door-swing quarter-disc, the room-connectivity graph, and perimeter
  enclosure — is factored into `src/geometry.ts` / `src/analyze.ts` and reused by both the renderer
  and the linter (no duplicated geometry).

### Changed

- **`examples/studio.arch`** rewritten to be architecturally sound: an enclosed bath off a central
  hall (no longer reached through the bedroom), a fitted kitchen and bath, non-colliding door swings,
  and dimension strings. It now lints clean. Snapshots, the visual golden, and the embedded spec were
  regenerated; the editor grammars gained the `dims`/`auto` keywords.

## [1.1.0] - 2026-06-27

### Added — AI-agent-native interface (CLI-first)

ArchLang's interface for AI agents is its **CLI** — token-cheap, harness-agnostic, and
self-correcting — not an MCP server (a CLI costs nothing in context until called, where an MCP
schema sits in the window permanently). All additions are pure and keep existing rendered output
byte-identical.

- **`describe(source)` → semantic JSON** (`src/describe.ts`). A text-only verification channel:
  rooms (areas, bounding boxes, edge-touch adjacency), doors (what spaces they connect), windows
  (the room they serve), and totals. Exported from the public surface and surfaced as
  `arch describe --json`.
- **`lint(source)` → architectural soundness** (`src/lint.ts`). Habitability rules as `W_*`
  diagnostics: `W_ROOM_TOO_SMALL`, `W_ROOM_DISCONNECTED`, `W_BEDROOM_NO_WINDOW`, `W_DOOR_CLEARANCE`,
  `W_NO_ENTRANCE`. Configurable ruleset; surfaced as `arch lint --json`. Codes documented in the
  catalog (`arch explain`).
- **Agent-native CLI** (`src/cli.ts`). Every command takes `--json` (result on stdout, messages on
  stderr) with deterministic exit codes (`0` ok · `2` user-source error · `1` IO · `3` usage); each
  JSON diagnostic carries the catalog `fix`. Source reads from stdin (`-`); artifacts write to
  stdout (`-o -`). New verbs: `validate`, `describe`, `lint`, `spec`, `new`/`init`.
- **`arch spec` / `spec.llm.md`** — the whole language in one page (~2k tokens), generated from
  `src/grammar/tokens.ts` + `examples/` by `npm run gen:spec` (drift-guarded in CI).
- **`SKILL.md`** — a filesystem agent Skill that teaches the `spec → write → compile/describe/lint`
  loop. `llms.txt`, `AGENTS.md`, and the README now document the zero-install CLI loop
  (`npx @chanmeng666/archlang …`).
- **NL→ArchLang eval harness** (`eval/`). Scores natural-language prompts against semantic
  expectations; offline mode (`npm run eval`) is a CI authorability-regression guard, live mode
  (`--live`, needs `ANTHROPIC_API_KEY`) produces the headline number.
- Shared pure analysis layer (`src/analyze.ts`) backs `describe` and `lint` (resolve pipeline +
  rectilinear geometry, no duplication).

## [1.0.1] - 2026-06-26

### Fixed

- **Bundler builds in downstream consumers (webpack / Next.js).** The lazy
  `import()`s of the optional native/wasm dependencies (`@resvg/resvg-js`,
  `pdfkit`, `clipper2-wasm`) are now annotated with `/* webpackIgnore: true */`
  and `/* @vite-ignore */`, so a consumer's bundler no longer follows them into a
  native `.node` binary at build time (which failed with *"Module parse failed:
  Unexpected character"*). These dependencies are still loaded lazily at runtime
  under Node when the relevant export (`renderPng`/`toPdf`/angled-wall geometry)
  is used; nothing changes for the zero-dependency SVG/DXF path.

## [1.0.0] - 2026-06-26

### Added — Polish, ecosystem & launch (v1.0)

The 1.0 release rounds out the language and ships the public surface that makes
ArchLang adoptable: relational placement, a PNG backend, a visual-regression
safety net, a multi-format playground, a docs site, and a workspaces monorepo.
The core stays pure, deterministic, and zero-runtime-dependency, and **every
existing rendered output (the absolute/manual coordinate path) is byte-identical**
to v0.11.

- **Relational placement (`right-of` / `left-of` / `below` / `above`).** A room
  can be positioned relative to another with an optional `align` (`top|middle|
  bottom` or `left|center|right`) and `gap`, instead of absolute `at (x,y)`.
  Positions resolve to absolute coordinates by **pure arithmetic in dependency
  order** (a topological pass in `src/layout.ts`) — deterministic sugar, not an
  optimizer. Reference cycles raise `E_LAYOUT_CYCLE`; unknown references raise
  `E_LAYOUT_REF`. The absolute path is unchanged and remains the default. The
  lexer learns `right-of`/`left-of` as compound keywords; the formatter, error
  catalog, and editor grammars are updated; new `examples/relational.arch`.
- **PNG export backend.** `renderPng(scene)` (exported) and `arch compile -f png`
  rasterize the Scene's SVG with the **optional, lazily-loaded** `@resvg/resvg-js`
  and a **bundled font** (system fonts disabled), so output is deterministic and
  byte-identical across machines. The dependency is absent from the default
  bundle (`optionalDependencies`, external to the build, font read lazily).
- **Visual-regression suite.** Golden PNGs are pixel-diffed with `pixelmatch`
  (strict threshold) so geometry changes are caught visually; refresh with
  `UPDATE_GOLDENS=1`. Skips when the optional raster dep is absent.
- **Playground multi-format download.** The Vite + CodeMirror playground now
  downloads **SVG, PNG, DXF, and PDF** (PNG/PDF via canvas + lazily-loaded jsPDF,
  bounded so large plans don't overflow the canvas limit).
- **Documentation site.** A VitePress site (`docs-site/`) with a guide, the
  language reference, the error catalog, a relational-placement page, an examples
  gallery, and the ADRs — all generated from the canonical repo sources so it
  cannot drift.
- **Workspaces monorepo.** The core stays the published root package; `editors/
  vscode`, `playground`, and `docs-site` are npm-workspace members sharing one
  root lockfile, so a single `npm install` bootstraps everything.
- **Architecture Decision Records** (`docs/adr/`): hand-written parser vs Lezer;
  optional-dependency geometry; expand-time scripting; relational placement is
  not an optimizer.
- **Benchmarks in CI.** `bench/run.ts --json` + `bench/compare.mjs` post an
  informational per-stage regression comment on PRs (never gates the build).

### Changed

- `CompileResult` is unchanged in shape (append-only); the PNG output is produced
  on demand from `scene`, not added as a field.
- `docs/language-reference.md` folded forward to v1.0 (relational placement, the
  four export formats); `AGENTS.md` and `README.md` refreshed to the current
  Scene-IR / registry / World architecture and the v1.0 surface.
- Repo-wide LF line endings enforced via `.gitattributes` (determinism hygiene).

## [0.11.0] - 2026-06-26

### Added — IDE-grade tooling & DX

The compiler grows a proper toolchain: a comment-preserving formatter, a full
language server, one grammar source of truth, and a documented error catalog.
The parser becomes lossless and never throws. All of this is tooling/internal —
the core stays pure, deterministic, and zero-runtime-dependency, and **every
existing rendered output (SVG/DXF/PDF) is byte-identical**.

- **Lossless, error-recovering parse tree.** The lexer captures comments as
  trivia (`LexResult.comments`); the AST gains an `ErrorNode` statement variant,
  `PlanNode.comments`, and a `bodyStart` offset. The parser never throws on user
  source: a malformed header recovers (so `CompileResult.ast` is present even on
  partial input), and a broken line emits an `Error` node + diagnostic and keeps
  the rest of the tree instead of dropping it (progress-aware `synchronize`; the
  expression parser refuses to swallow a new-line statement keyword). New
  read-only AST cursor (`src/cursor.ts`).
- **`arch fmt` formatter.** A ~150-line zero-dep Wadler/Prettier `Doc` IR
  (`src/doc.ts`) + `format(source)` (`src/format.ts`, exported): deterministic,
  idempotent, comment-preserving, and semantics-preserving (`compile(x) ===
  compile(format(x))`). Precedence-correct expressions, `WxH` vs `<expr> x
  <expr>` sizing, and long wall point-lists that wrap one-per-line. CLI: `arch
  fmt <in.arch> [--write]`. Returns source unchanged on parse error.
- **Full LSP.** Promoted from diagnostics-only to hover, completion,
  go-to-definition, scope-aware rename, and signature help — a pure, isomorphic,
  unit-tested core (`src/lsp.ts`, exported) driven by an append-only `params`
  schema on `ElementDef` (one source for the LSP and the docs). The VS Code
  server advertises and delegates to it.
- **One grammar source of truth.** `src/grammar/tokens.ts` is the single source
  for keyword categories, operators, and statement-start keywords; the parser
  derives its statement set from it, and `scripts/gen-grammars.ts`
  (`npm run gen:grammars`) generates the TextMate grammar and the playground
  StreamLanguage. A drift test + CI step keep them in sync.
- **Error-code catalog + richer diagnostics.** `src/error-catalog.ts` documents
  every `E_*`/`W_*` code (cause/fix/example); `arch explain <CODE>` prints an
  entry; `scripts/gen-error-codes.ts` (`npm run gen:errors`) generates
  `docs/error-codes.md` (drift-checked). `Diagnostic` gains `relatedSpans`, and a
  door/window off every wall now points at the nearest wall.

## [0.10.0] - 2026-06-26

### Added — extensible platform

ArchLang becomes a platform: third-party elements, a clean environment seam, an
import system for `.arch` libraries, a richer theming cascade, and config
sanitization with per-stage memoization. All additive and infrastructural — the
core stays pure, deterministic, and zero-runtime-dependency, and **every existing
rendered output is byte-identical**.

- **Open, per-call plugin registry.** `compile(src, { plugins })` merges
  third-party `ElementDef`s into a registry built fresh **per call** — no global
  mutation, so the compile cache stays correct. A new element type now compiles
  with zero core edits. `register{Element,Theme,Hatch,Backend}` validate/construct
  extensions; `createRegistry`/`BUILTIN_REGISTRY` are exported. Plugin, theme,
  backend, hatch, and World **identity is folded into the compile cache key** (via
  stable process-local id tokens), so distinct extension sets never bleed across
  compiles. `CompileOptions` gains `plugins`, `backend`, `hatches`, `themes`.
- **`World` seam.** New `World { read(path): string | null; now?(): Date }` is the
  compiler's single, injectable window onto its environment, keeping `compile()`
  pure/synchronous/isomorphic. `NULL_WORLD` (default) and `makeVirtualWorld(files)`
  ship for browser/test use; the CLI builds a real-fs World. `now` makes
  time-dependent output injectable (never a hidden `Date.now()`). An import-free
  plan compiles byte-identically with or without a World.
- **Import system.** `import "<spec>": a, b as c` (named items, `as`, `*`) brings a
  module's components into a plan. A new `link` phase — the compiler's only I/O,
  behind `World.read` — resolves specs (relative `.arch` paths and namespaced
  `@local/name:1.0.0`), parses each module, and merges components. Cyclic imports
  yield `E_IMPORT_CYCLE` (no hang); missing/unexported/conflicting/bad-spec each get
  a diagnostic. Seeded standard libraries under `examples/lib/` (`furniture.arch`,
  `doors.arch`) + an `examples/imports.arch` demo. Works in Node and the browser.
- **Theming cascade.** Built-in named themes (`THEMES`: `blueprint`, `mono`, `dark`,
  `presentation`) via `theme <name> { … }` (named base + overrides; one-liner
  `theme <name>` works too). Per-element `style <kind> { fill … }` overrides resolve
  element → theme → default. Opt-in `theme from "#color"` derives a finished poché
  from one wall colour (deterministic, zero-dep HSL). `registerTheme` adds named
  themes per call. Theme stays **out of the IR** (re-theming never re-resolves);
  cascade order is default → named base → `theme{}` → `theme from` → per-element
  `style` → `CompileOptions.theme` (always wins). Opt-in derivation keeps all golden
  snapshots byte-identical.
- **Config sanitization.** `sanitizeConfig()` denylist for **untrusted** `.arch`
  config: drops prototype-polluting keys (`__proto__`/`constructor`/`prototype`) and
  blanks string values carrying markup (`<`/`>`) or a `data:` URL. Applied to source
  theme/style values; trusted `CompileOptions` skip it. Theme/style key resolution
  hardened to own-property checks.
- **Per-stage memoization.** Content-hash/identity caches for `lex → tokens`,
  `parse → ast`, and `resolve → ir` (FNV-1a; registry/World identity in the keys),
  bounded and cleared by `clearCache()`. ~22× faster re-render on reparse (e.g.
  re-theming or resizing the same source). Stages are pure, so cached objects are
  shared transparently — determinism intact.

## [0.9.0] - 2026-06-26

### Added — professional CAD fidelity

Output that reads as a real drawing: line-weight hierarchy and line types, CAD
layers, openings that truly cut walls, clean angled joinery, data-driven hatches,
self-consistent dimensions, and sub-linear geometry. Everything stays pure and
deterministic; the core remains zero-runtime-dependency.

- **Style metadata on the Scene.** `SceneNode` gains optional `lineWeight`
  (`heavy|medium|thin|extraThin`), `lineType` (`continuous|dashed|center|hidden`),
  and `layerName`. SVG maps weight → `stroke-width` and type → `stroke-dasharray`;
  DXF emits an `LTYPE` table (before `LAYER`) with group codes `6`/`8`. Additive —
  nodes that set none render as before.
- **AIA CAD layers.** Element kinds map to standard layer names (`A-WALL`,
  `A-FLOR`, `A-DOOR`, `A-GLAZ`, `A-FURN`, `A-COLS`, `A-ANNO-TEXT`, `A-ANNO-DIMS`).
  SVG wraps each layer in an Inkscape `<g>`; DXF declares the layers with colours.
- **Openings void walls (IFC-style).** A hosted door/window registers an opening
  on its wall; the wall solid is the boolean difference of its offset segments and
  the opening rectangles, so an opening genuinely cuts the wall. Orthogonal case is
  fully zero-dependency.
- **Optional angled-wall geometry engine.** A new `GeometryBackend` seam unions
  angled (non-axis-aligned) walls into one seamless outline. The optional
  `clipper2-wasm` adapter (declared in `optionalDependencies`, lazily `import()`ed
  only for angled geometry) is registered by the CLI when present; otherwise angled
  walls fall back to per-segment rendering. The default build pulls no new
  dependency, and **orthogonal output is byte-identical with or without** the engine.
- **Data-driven hatches.** Wall poché is now a backend-neutral `hatch` Scene
  primitive. SVG emits a tiled `<pattern>` and DXF a real `HATCH` entity. Tune with
  `material <name> [scale <n>] [angle <deg>]`.
- **Computed dimensions.** A `dim` with no explicit `text` shows its measured
  length `|to−from|`, formatted via a shared formatter so SVG and DXF agree.
- **Spatial grid index.** Host lookup and room-overlap detection are backed by a
  uniform-grid index (~O(n) for distributed plans), provably byte-identical to the
  former O(n²) scans (fast-check equivalence tests).

### Changed

- **Rendered output intentionally changed** (per-layer `<g>` grouping, line
  weights/types, walls cut by openings, hatch fills). SVG goldens for the orthogonal
  examples remain byte-identical; the Scene-IR golden was updated deliberately.
- **DXF version bumped `AC1009` → `AC1015`** (AutoCAD 2000) so the new `HATCH`
  entity is supported; `LINE`/`ARC`/`TEXT` entities stay R12-style.

## [0.8.0] - 2026-06-25

### Added — a full (pure, expand-time) scripting language

The expression calculator (`Value === number`) is promoted to a small scripting
language. Everything stays **expand-time and deterministic**: loops,
conditionals, and function calls are evaluated while the drawing is built — no
runtime, no I/O, no clock — so the same source still produces byte-identical
output. Numbers remain unitless millimetres.

- **Generalized values.** `Value` is now `number | boolean | string | array |
  function` (`src/expr.ts`). Using a non-number where a number is required is a
  typed diagnostic (`E_TYPE`) with a safe default — never a throw.
- **Richer expressions.** Comparisons (`< > <= >= == !=`), logical operators
  (`&& ||`, short-circuiting), `!`, array literals `[a, b]`, half-open ranges
  `a..b`, indexing `arr[i]` (bounds-checked), function calls, and `if … else`
  **as an expression**.
- **Control flow** that expands into the element stream: `for x in <array|range>
  { … }`, `if <cond> { … } else { … }`, and bounded `while` (10k-iteration cap).
  `name = <expr>` reassigns an existing binding (so `while` loops can progress).
- **Value-functions / closures.** `let area(w, h) = w * h` defines a pure
  closure (recursion bounded; arity checked). Distinct from `component`, which
  emits elements.
- **Built-in functions** (a frozen, pure set): `min, max, abs, sqrt, floor,
  ceil, round, len, str`. Shadowable by a user `let`.
- **Scoped `set` rules.** `set door(swing: out)` overrides defaults for
  subsequent doors in scope; an explicit attribute still wins.
- **String interpolation.** `label "Studio {i}"` interpolates expressions into
  labels/dimension text; interpolated content is escaped at the serialization
  boundary (XSS-safe).
- **Lexical scope chain** with shadowing; `ResolveCtx` gains `evalStr`, and
  `ParseCtx` gains `parseStringExpr`.

### Changed
- `examples/parametric.arch` is rewritten to showcase the new language (a
  `for`-loop row, a value-function, an array, a scoped `set`, an `if`, and
  interpolated labels). Its golden snapshot updates accordingly.
- Existing non-scripting examples (`studio`, `two-bed`, `themed`) render
  **byte-identically** — the value generalization changes nothing for plans that
  use no new constructs.
- `docs/language-reference.md` documents values, operators, arrays/ranges,
  conditional expressions, interpolation, reassignment, functions, control flow,
  built-ins, and `set` rules.

## [0.7.0] - 2026-06-25

### Added
- **Backend-neutral Scene IR.** A new positioned-primitive drawing IR
  (`src/scene.ts`: `Scene`, `SceneNode`, `ScenePrim`, `Paint`) sits between
  `resolve` and the backends, so geometry is defined **exactly once** and every
  backend is a thin, pure serializer. Inspired by Typst's `Frame` and D2's
  `d2target`.
  - `toScene(ir, opts)` (`src/scene-build.ts`) lowers the resolved IR to a Scene
    (elements emit primitives; orthogonal walls union into clean multi-loop
    regions). Exported, plus the Scene types.
  - `compile().scene` exposes the Scene (append-only `CompileResult` field) so
    consumers can target alternate backends without re-resolving.
- **Vector PDF.** `toPdf(scene)` now emits **true vector** PDF via `pdfkit`
  (strokes are real paths, text is selectable) instead of rasterizing the SVG.

### Changed
- **SVG rendering is now a pure serializer** of the Scene (`src/backends/svg.ts`);
  `render(ir)` is a thin composition. Output is **byte-identical** to v0.6 (golden
  snapshots unchanged).
- **DXF backend (`toDxf`) is now a pure Scene serializer** and no longer
  re-derives door arcs / window panes / dimension geometry (the duplicated
  `emitDoor`/`emitWindow`/`emitDim` are deleted). DXF output is correspondingly
  richer (full dimension geometry + computed room areas).
- **API:** `toDxf` and `toPdf` now take a `Scene` (was the IR / an SVG string);
  build one with `toScene(ir)` or read `compile().scene`.

### Removed
- The `svg-to-pdfkit` optional dependency (the PDF backend no longer round-trips
  through SVG). `pdfkit` remains the only optional, lazy-loaded dependency; the
  default SVG/DXF path stays zero-dependency.

## [0.6.0] - 2026-06-25

### Added
- **Export backends.** `arch compile … --format svg|dxf|pdf` (default `svg`), plus
  programmatic `toDxf(ir)` / `toPdf(svg)`:
  - **DXF** — a pure, synchronous, **zero-dependency** ASCII DXF (R12) writer from
    the resolved IR (wall faces, room/furniture/column rectangles, door swing
    arcs, window glazing, dimension lines + labels; Y-flipped for CAD).
    Deterministic.
  - **PDF** — `pdfkit` + `svg-to-pdfkit` lazy-loaded under `optionalDependencies`,
    so the core never hard-requires them (clear error if absent).
- **Public IR access.** `resolve(ast)` and the IR types (`ResolvedPlan`,
  `ResolvedElement`, `RWall`, `RRoom`, `RDoor`, `RWindow`, `RFurniture`, `RDim`,
  `RColumn`) are now exported for consumers that want resolved geometry or custom
  backends.
- **Editor tooling** (in-repo, not shipped in the package; the published core
  stays zero-dependency):
  - A **TextMate grammar** (`editors/archlang.tmLanguage.json`) for `.arch`
    highlighting, TextMate-engine verified.
  - The **playground** rebuilt as a Vite + CodeMirror 6 app with syntax
    highlighting and live inline lint fed by `compile().diagnostics`.
  - A minimal **VS Code extension + LSP server** (`editors/vscode`) that
    publishes the compiler's diagnostics for open `.arch` documents.
- **Benchmark harness** (`npm run bench`): a deterministic ~1000-element plan with
  per-stage timings.
- **CI** (`.github/workflows/ci.yml`): `npm ci → typecheck → test` on Node 18 + 20.

### Changed
- **Performance**: each opening's `isOnWall` + `hostSegment` checks are fused into
  a single wall scan (`hostInfoForWalls`), roughly halving the dominant resolve
  cost. Output is byte-identical (golden snapshots + a fast-check equivalence
  property guard).

### Fixed / Security
- **SVG output XSS hardening.** Theme strings (colours/font) from the `theme { … }`
  directive or `CompileOptions.theme` are now escaped once at the render boundary
  (`sanitizeTheme`), closing an attribute-breakout vector introduced with v0.5
  theming. Output is byte-identical for well-formed themes; the XSS-safety
  guarantee (fixed element allowlist, escaped user text) is documented in
  `SECURITY.md` and covered by `test/security.test.ts`.

## [0.5.0] - 2026-06-25

### Added
- **Clean wall joins**: orthogonal walls are boolean-unioned into a single
  poché fill + mitred outline, so corners and T-junctions render with no
  internal seams (zero-dep, deterministic). Angled walls fall back to
  per-segment outlines.
- **Material hatches**: `wall <kind> thickness N material <name> { … }` with
  `poche` (default), `concrete`, `brick`, `insulation`, `tile`, `none`. Unknown
  materials warn and fall back to the default hatch.
- **Theming**: a `theme { … }` plan directive and `CompileOptions.theme` control
  colours, `lineWeight`, and `font`. Resolution: defaults < directive < options.
  Friendly directive aliases (`wall`, `room`, `wallFill`, …) map to theme fields.
- New diagnostics: `W_UNKNOWN_MATERIAL`, `W_UNKNOWN_THEME_KEY`.
- `examples/themed.arch` — a dark, brick-walled themed plan.

### Changed
- Walls are rendered centrally (unioned by material) rather than per element.
  Default-material, default-theme output is unchanged for non-wall-seam content;
  wall rendering is cleaner (golden snapshots updated + visually verified).
- The memoization cache key now includes `CompileOptions.theme`.

## [0.4.0] - 2026-06-25

### Added
- **Arithmetic expressions** anywhere a number appears (coordinates, sizes,
  widths, thickness, offsets): `+ - * / %`, unary minus, and parentheses with
  the usual precedence. Sizes accept `WxH` or `<expr> x <expr>`. Division by
  zero is a compile error.
- **`let` bindings**: `let NAME = <expr>`, evaluated top-to-bottom (no forward
  references); unknown names get a `did you mean …?` hint.
- **Components**: `component NAME(params) { … }` plus `NAME(args)` instantiation
  — reusable, parameterised sub-plans that compose. Component bodies see their
  params, own `let`s, and plan-level `let`s. Auto-ids stay unique across
  instantiations; infinite recursion is bounded and reported.
- New diagnostics: `E_UNKNOWN_REF`, `E_REDEF`, `E_DIV_ZERO`, `E_ARGCOUNT`,
  `E_UNKNOWN_COMPONENT`, `E_RECURSION`.
- `examples/parametric.arch` — a parametric studio row built from one component.

### Changed
- Lexer: added `+ - * / %` operator tokens; bare numbers are non-negative
  (negation is a unary operator). The `WxH` dimension literal still works.
- AST: element numeric fields are expressions evaluated during `resolve`; the
  plan body is a statement stream (`elements` + `let`s + component instances).
  SVG output is byte-identical for non-parametric plans (golden-snapshot
  verified for `studio.arch` and `two-bed.arch`).

## [0.3.0] - 2026-06-25

### Added
- **Element registry + AST→IR layering.** Each element type (wall, room, door,
  window, furniture, dim) is now a single self-contained module in
  `src/elements/` implementing a common `ElementDef`; parse/resolve/render
  iterate the registry instead of hard-coded switches. Adding an element type is
  one new module + one `register()` line.
- **`column`** element: `column [id=] at (x,y) size WxH` — a solid structural
  column, and the worked example of the new one-file extensibility.
- Pure `resolve(ast) → IR` (`src/ir.ts`): grid-snap, id assignment, opening
  hosting, and semantic checks now produce a new immutable IR — the input AST is
  no longer mutated. `render()` consumes the IR only (backend-ready).

### Changed
- `compile()` pipeline is now `parse → resolve → render`. `CompileResult.ast`
  is the raw parsed AST (unmutated); snapped/resolved geometry lives in the IR.
- AST: elements live in a single discriminated `PlanNode.elements` array (each
  node carries a `kind`); wall/furniture's category field renamed `kind` →
  `category`. SVG output is byte-identical to v0.2 (golden-snapshot verified).

## [0.2.0] - 2026-06-25

### Added
- **Resilient parsing + professional diagnostics.** The compiler now recovers from syntax
  errors and reports **all** problems in a single pass instead of throwing on the first one.
- `CompileResult.diagnostics: Diagnostic[]` — every problem with a byte-offset `span`, a
  stable `code` (e.g. `E_ROOM_SIZE`), and optional `hints`. `errors`/`warnings` are now
  derived projections of this list (back-compatible).
- New `diagnostics` module: `Diagnostic`/`Span`/`Severity` types, `offsetToLineCol()`, and
  `formatDiagnostic()` which renders a zero-dependency, caret-framed source snippet.
- Tokens now carry `start`/`end` byte offsets; the lexer collects every lexical error.
- AST element nodes carry an optional `span`.
- `arch` CLI prints framed diagnostics for every problem.
- Tests: error-recovery, span accuracy, `formatDiagnostic` snapshots, golden-SVG snapshots
  for the example plans, and `fast-check` fuzz properties (never throws, deterministic).

### Changed
- `validate()` now returns `Diagnostic[]` (was `{ errors, warnings }`).

## [0.1.0] - 2026-06-25

### Added
- Initial release of **ArchLang** — a declarative language that compiles `.arch` source to
  professional SVG floor plans.
- Compiler pipeline (lexer → parser → validate → geometry → render) in pure TypeScript with
  **zero runtime dependencies**; runs in Node and the browser.
- Public `compile(source, opts)` API returning `{ svg, errors, warnings, ast }` (errors are
  returned, never thrown), with source-keyed memoization.
- Language elements: `wall` (poché-hatched, thickness), `room` (label + computed area),
  `door` (opening + leaf + swing arc), `window` (glazing), `furniture`, `dim` (dimension
  lines), `title`; plan settings `units`, `grid` (snap), `scale`, `north`.
- Drawing features: north arrow, scale bar, title block, grid snapping, auto-assigned ids,
  XML-escaped labels.
- `arch` CLI (`compile`, `watch`) and a fully client-side web playground.
- Documentation: language reference, examples (`studio.arch`, `two-bed.arch`), and a test
  suite covering validity, determinism, grid-snap, escaping, and error/warning cases.
