# AGENTS.md — release-status narrative (archived 2026-07)

> **Frozen historical record.** This is the release-narrative prose that formerly lived
> in `AGENTS.md` § "Project status & where things live" — moved here verbatim (zero
> information loss) to keep the always-loaded `AGENTS.md` inside its context budget.
> **Nothing here is the current source of truth.** The canonical release notes are
> [`CHANGELOG.md`](../../CHANGELOG.md); the current shipped state (versions, live
> artifacts) is the status table in [`AGENTS.md`](../../AGENTS.md); tranche verdicts
> live in [`docs/research/`](../research/). Read those, not this, for what is true today.

---

**Latest release — v1.15.0 (2026-07-12) — Tranche 6 resolved: Gate G2 closed and all four
unconditional Track B smalls shipped** (see `CHANGELOG.md` for detail; the G2 verdict is
recorded as a bullet in the v1.14.0 block below): `src/vocabulary.ts` shared closed-vocabulary
matcher replacing the scattered room-label regexes + advisory fix-carrying **`W_ALIAS_MATCH`**
(judge untouched — CONCEPTS/SYNONYMS_VERSION/fixture byte-green; `arch fix` now also applies
lint-stage fixes, while the L1 gate's `l1Pipeline` stays the compile-stage-fix + `repair`
reference); exported **`rankFixes`** deterministic cost ordering (cmdFix picks top-ranked per
diagnostic, LSP presents in canonical order; identity on today's singletons); **optional metric
unit suffixes** `3m`/`3cm`/`3mm` → mm folded exactly at lex time (language surface: full
generator chain regenerated; `spec.llm.md` therefore drifted from the calibrated live baseline's
author prompt — see eval/README); and **`describe().freedom`** degrees-of-freedom placement
report (append-only). Released as `@chanmeng666/archlang@1.15.0` via the tokenless OIDC
tag-push flow (MCP shim stays 0.2.0 — its `^1.14.0` dep satisfies 1.15.0, no new tool surface);
VS Code 0.7.0 uploaded and live the same day.

**Tranche 5 — the repair-trajectory dataset (2026-07-13; repo tooling only, no core change,
no release).** The roadmap's last open item (deep-dive H4, conditionally adopted) ships as a
new top-level `dataset/` generator (`npm run dataset:gen`) producing two fully synthetic,
self-verifying splits — `repair` (broken `.arch` + catalogued diagnostics → deterministically
healed source + diff + per-stage steps) and `authoring` (NL brief + golden + `describe()` facts +
intent contract) — deterministic from a pinned seed, with `archlang_version` pinned to 1.15.0.
It imports only the pure core surface; the core stays zero-dependency and unchanged at 1.15.0.
The T5 iron law is enforced permanently by `test/dataset.test.ts`: the private 26-brief eval
holdout is never published, and every dataset row is double-deduplicated against it (text
Jaccard + n-gram, structural `describe()` fingerprint) and carries the canary twice for downstream
leakage probing. The card frames the asset as *drivability* packaging plus reward-harness
documentation; consistent with the permanently-declined T3 experiment, **no diagnostic-feedback
loop gain (or its absence) is claimed anywhere.** Published to HF as
`ChanMeng666/archlang-repair-trajectories` (CC0-1.0) on 2026-07-13 — repair 1200 + authoring 400
rows, uploaded via the owner's existing `hf` CLI credentials.

**Prior release — v1.14.0 (2026-07-12) — Tranches 1–2 + 4: the measurement foundation,
then the intent channel it licensed (roadmap `docs/research/2026-07-roadmap-proposal.md`,
verdicts in the companion deep-dive).** The eval's ruler is fixed, the deterministic-tool
tier is measured on its own ledger, and Gate G1's PASS cleared Tranche 4 to ship. Published
to npm as `1.14.0` (core) + `0.2.0` (MCP shim) via the new tokenless OIDC release workflow:
- **Judge v2** (`eval/assertions.ts` + `eval/synonyms.ts`): scoring lowered to an
  intent-assertion data structure (room-count / room-exists / room-area / total-area /
  adjacent / reachable — the shallow five-kind boundary a future `src/intent.ts` can
  lift). Labels match through a versioned, oracle-isolated synonym/`room_type` concept
  table (token-bounded, one-room-one-concept); area is checked **only where the brief
  states a number** (±10–15% around the brief's number — all 20 golden-derived bands
  deleted); room count follows the frozen rubric's policy B (±1 passes only when the
  surplus room is pure circulation); adjacency/reachability score as subscores, never
  gate (T4 hook). Policies frozen in `eval/rubric.md` (blind-drafted, then approved).
- **Corpus 22 → 26**: three prompts amended so every room count is brief-derivable, plus
  a per-room-area slice (`sized-*`) so the area dimension is no longer total-only (H5).
- **Harness integrity**: Anthropic path 2048 → 16384 max_tokens + temperature 0 + prompt
  caching; OpenAI seed pinned + `system_fingerprint` recorded; `--budget <n>tok|usd`
  circuit breaker; baseline carries a `judge` field and cross-judge deltas are flagged
  non-comparable.
- **L1 deterministic-tool gate** (`eval/faults/` + `eval/l1.ts` +
  `test/fault-injection.test.ts`, in CI): six fault-injected fixtures prove `fix`+`repair`
  heal off-wall openings, wall collisions, and blocked doorways deterministically and
  idempotently; `arch fix`-mirroring `l1Pipeline` powers the live `--l1` overlay
  (ΔL0→L1, zero extra API calls). Found and fixed a real core bug on the way: `repair()`
  mutated the parse-memo AST (see CHANGELOG Unreleased).
- **Calibrated baseline** (26 briefs, gpt-5.5, seed-pinned, judge v2): valid 25/26 (96%),
  **intent 13/26 (50%)**, sound 4/26 (15%); ΔL0→L1 = intent **+5** (69%), sound +2 —
  see the honest-eval paragraph below.
- **Gate G1: PASS (2026-07-12, `eval/g1/report.md`).** NL→intent-JSON per-assertion
  faithfulness measured double-blind on all 26 briefs (gpt-5.5 generator, oracle-isolated
  prompt; raters: 3 blind opus subagents + fable pre-registered, human adjudicated the 2
  disagreements): **154/157 (98.1%)** vs direct-`.arch` per-assertion accuracy 155/166
  (93.4%, reconstructed reproducibly in `eval/g1/baseline-accuracy.ts`) — ≥85% and
  one-tailed z = 2.08 (p = .019). **T4 (the intent channel) is cleared** for a future
  session; recorded caveat: against the valid-only control variant (95.7%) the margin is
  below statistical resolution at n≈160/arm. All 3 unfaithful assertions were room-count/
  topology derivations on under-determined briefs — T4's schema docs must make the band
  conventions and "assert a count only when the brief enumerates it" normative.
- **T3: harness shipped, live experiment NOT run (2026-07-12).** The L2 tier is fully
  implemented and offline-tested (`eval/l2.ts` pure protocol engine — diagnostic feedback
  ≤2 rounds, oracle-isolated to compile/lint/`fix --dry-run`/trimmed-describe only;
  `eval/l2-run.ts` guarded CLI with retrying author + per-brief error isolation; Olausson
  **equal-token-budget i.i.d. resampling control** with round-up-favors-control accounting;
  per-metric best-of, mean±σ over trials, `pass@n`/`pass^n`; `eval-l2.yml` workflow).
  **OWNER DECISION (2026-07-12): the ~440-call live run (est. $70–95) is PERMANENTLY
  DECLINED — it will never be dispatched.** The loop-vs-resampling question is therefore
  permanently unanswered: never claim a net model-loop gain (or its absence) anywhere.
  Everything gated on it is closed for good: L3/L4/L5 stay unbuilt, and T4's
  adjacency/reachability assertions stay advisory (`gate: false`) permanently. The harness
  + its offline tests are kept as the protocol's reference implementation only.
- **Tranche 4: the intent channel (2026-07-12; core + CLI, zero new runtime deps).**
  The judge-v2 core is lifted into the core package:
  **`src/intent.ts`** (`validateIntent(source, intent)` → `{ ok, satisfied, total,
  violations, subscores, assertions, diagnostics }`, `intentFromJson`, `feedbackForResult`
  — advisory prompts per ADR 0005, `compileIntent`/`checkPredicates`/`projectSubscores`)
  + **`src/intent-concepts.ts`** (the concept table as production name resolution; unknown
  concepts fall back to literal id → label → uses → `room_type`). Eight catalogued codes
  (`E_INTENT_ROOM_MISSING/_ROOM_COUNT/_ROOM_AREA/_TOTAL_AREA/_NO_WINDOW` gate;
  `_NOT_ADJACENT/_NO_DOOR/_UNREACHABLE` advisory — promotion parked on T3). Generated
  **`schemas/intent.schema.json`** (`gen:intent-schema`, drift-tested) makes G1's two
  lessons normative in its field docs (band conventions; count only when the brief
  enumerates). CLI: **`arch validate --intent <f>` (gate, exit 2; `--feedback`) + `arch
  score <file> --brief <f>`** (continuous meter, exit 0). `describe()` windows gain
  `facing: N|S|E|W` (append-only) with an optional intent `windows.facing` assertion.
  **The eval consumes the same implementation** (`eval/assertions.ts`/`synonyms.ts` are
  re-export shims) — one judge, zero skew; **JUDGE_VERSION stays "2"**, proven by the
  pinned `eval/judge-fixture.json` byte-equivalence suite (regenerate it only to record an
  approved bump, never to green a red suite).
- **Gate G2: CLOSED (2026-07-12, `docs/research/2026-07-g2-verdict.md`) — residual area
  failures = 0/8 on the calibrated baseline** (incl. both two-sided per-room bands from the
  `sized-*` slice; the one invalid plan carries no area assertion, so nothing is blinded).
  Per the roadmap's gate: only T4's assertion form ships; **T6's area-syntax sugar is
  PARKED** behind the verdict doc's frozen reversal triggers (a same-judge calibrated run
  with ≥1 gating area failure; a harder area corpus slice with residual > 0; or a real
  downstream area-arithmetic failure report). No `area` token enters the grammar; unit
  suffixes deliberately exclude `m2`. Tranche 6's unconditional Track B smalls
  (`matchVocabulary`, `rankFixes`, unit suffixes, `describe().freedom`) were never gated
  on G2 and proceed.

**Prior release — v1.13.0 (2026-07-11; AI-native authoring). Six tranches
(see `CHANGELOG.md` for detail):**
1. **Placement sugar** (write plans without hand-computed coordinates). Openings attach to a wall by
   position — `door|window|opening on <wall> at <pos>` (mm or `%`), `swing into <room>`, `hinge near
   start|end` (`E_ATTACH_WALL_REF`, `E_ATTACH_POS_RANGE`); **`strip <dir> at (x,y) gap … { rooms }`**
   lays rooms end to end (pure resolve-time sugar; `E_STRIP_NEST`, `E_STRIP_SIZE`); **`furniture …
   in <room> anchor <a> [inset <mm>]`** snaps furniture to a room corner/edge. New flagship
   `examples/attached.arch`. Documented in `docs/language-reference.md`.
2. **Machine-applicable fixes ([ADR 0011](../adr/0011-machine-applicable-fixes.md)).** `Diagnostic.fixes`
   (rustc's 4-tier `Applicability`) + **`applyFixes`** (a pure piece-table replacer ported from
   rustfix, exported); fix producers (off-wall opening → attachment form); **`arch fix`** (bounded,
   self-checking fixpoint; `--unsafe`/`--dry-run`/`--force`) and **`arch suggest`** (`suggestTopology`
   — advisory door/window statements, never applied, ADR 0005); LSP quick-fixes. `fix` = syntactic
   span edits; `repair` stays the geometric solver (ADR 0006) — a hard boundary.
3. **Plan JSON + intent graph + GBNF.** `planFromJson`/`planToJson`/`astToJson`/`checkGraph`/
   `PLAN_JSON_SCHEMA` (pure, exported) behind **`arch compile --from-json`**, **`arch ast`**,
   **`arch validate --graph`**, **`arch complete --at`**; generated **`schemas/plan.schema.json`**
   (`npm run gen:plan-schema`) and **`grammars/archlang.gbnf`** constrained-decoding grammar
   (`npm run gen:gbnf`), both drift-tested. `E_JSON_SCHEMA`/`E_JSON_KIND`.
4. **Zero-dependency ASCII.** **`renderAscii`** (exported) behind **`arch compile -f txt`** and
   **`arch preview --ascii`** (`--cols`, `--charset`) — a text-only agent can *see* its plan with no
   raster binary. Every other format's output is unchanged.
5. **MCP server ([ADR 0012](../adr/0012-mcp-shim-discoverability.md)).** New `packages/mcp/`
   workspace **`@chanmeng666/archlang-mcp@0.1.1`** (published; registry entry
   `io.github.ChanMeng666/archlang-mcp`) — a stdio MCP shim wrapping the library (tools
   compile/describe/lint/validate/repair/fix/suggest/complete; resources spec/context/schema/grammar),
   published to the official MCP registry from its `server.json`. **The core stays zero-dependency — the MCP SDK lives
   only in this package.** The CLI remains primary (token cost); MCP is the discoverability channel,
   amending [ADR 0009](../adr/0009-ai-first-context-and-distribution.md)'s distribution-over-protocol point.
6. **Docs distribution.** The docs site now serves every generated page as **raw markdown at
   `/<route>.md`** and the machine-native **`/plan.schema.json`** + **`/archlang.gbnf`** at its root
   (advertised in `llms.txt`).

**Honest eval read (calibrated; judge v2, 26 briefs, `gpt-5.5-2026-04-23`, seed-pinned;
current baseline re-measured 2026-07-12 under the post-v1.15.0 author prompt).** The
single-digit one-shot intent number that motivated the round-2 research was
~55–65% **measurement artifact** (deep-dive H2, dual-audit): judge v1 tested golden mimicry
(label substrings, golden-derived area bands), not brief satisfaction. Under judge v2
(brief-grounded assertions) the same model measures **valid 23/26 (88%) · intent 14/26 (54%) ·
sound 3/26 (12%)** — inside the predicted 45–60% true-deliverable band. (The original
2026-07-11 read, pre-suffix prompt, was 25/13/4; the one-line spec drift moved nothing beyond
run noise, and all 8 area assertions passed in both runs — Gate G2 re-confirmed.) Residual true
failures are dominated by **physical violations**, and the deterministic tools clear most of
those for free: the same run's `--l1` overlay (fix+repair, zero extra API calls) scores
**intent 18/26 (69%, ΔL0→L1 +4) · sound 7/26 (+4)**, 8 briefs healed / 1 regressed by 41
repair moves. That dividend belongs to the tool tier's ledger, never a model loop's (H3);
whether a diagnostic feedback loop beats equal-budget resampling is **permanently unanswered**
(the T3 live experiment was permanently declined by owner decision — never claim a loop gain
or its absence). Two standing harness lessons: reasoning models spend thinking tokens out of
the completion cap (use 16384, both providers), and never compare rates across a judge change
(the harness flags it). Judge-v1 numbers (9% intent) are kept only as history;
`eval/live-baseline.json` carries the calibrated L0 baseline.

**v1.12.1** — bundler-safety patch: the PNG backend's lazy
`import("node:fs")`/`import("node:url")` (font lookup) now carry
`/* webpackIgnore: true */ /* @vite-ignore */` like every other Node-only lazy import, so a
webpack/Next.js consumer importing the core **client-side** no longer fails its build resolving
`fs` for the browser (default output unchanged; found by a downstream product's first in-browser
use of the core).

**Sites redesign — "The Compile Boundary" (2026-07-10, deployed; not a core release —
`@chanmeng666/archlang` stays 1.12.1).** Both public sites (docs + playground) were rebuilt on a
shared two-world design system that makes the brand line "Designs that compile" literal — every
surface is split by a visible **compile seam** into a dark **SOURCE world** (carbon, plum syntax
accent) and a light **SHEET world** (drafting paper, ink, title blocks). The docs hero is the real
compiler drawing a plan as source typewrites; a shipped bug where the playground **Format** button
never worked (duplicate `id="format"`) is fixed. See the "sites' design system" subsection below and
**[ADR 0010](../adr/0010-compile-boundary-design-system.md)**. VS Code extension bumped to 0.4.1
(icon-only repack, published & live on the Marketplace 2026-07-10); core untouched.

**v1.12.0 (AI-first: agent context, error rendering, distribution &
accessibility). Four tranches (see `CHANGELOG.md` for detail):**
1. **Agent context & diagnostics.** Generated **`llms-full.txt`** (spec + agent workflow + CLI
   reference + error catalog in one ~40 KB system-prompt-ready bundle; `npm run gen:llms`,
   drift-tested) — served by the docs site at **`/llms.txt` + `/llms-full.txt`**; new **`arch
   context`** command prints it; **`diagnosticToJson`** (line/col/fix projection) promoted from a
   private CLI helper to the public API (`src/diagnostic-json.ts`).
2. **Always-visible errors & eval spine.** Opt-in **error-card SVG** (`compile(src, { onError:
   "svg" })` / `--error-svg` on compile/preview/md — a broken plan still yields a self-describing
   image; default path byte-identical); authorability **eval corpus 3→18** briefs with verified
   goldens, offline regression gate **`npm run eval:ci` wired into CI**.
3. **Distribution.** Docs-site markdown transform: **plain ```` ```arch ```` fences render as live
   editable `<ArchLive>` widgets** (SSR fallback; ```` ```arch static ```` opt-out); in-repo
   composite **GitHub Action** `.github/actions/arch-render` (render fenced blocks in any repo's
   Markdown via `arch md`); playground **Copy-for-LLM** button (source + `describe()` facts +
   diagnostics as one paste-ready prompt) + always-visible diagnostic fixes.
4. **Accessibility as a language feature.** `compile(src, { accessible: true })` / `--accessible`
   emits SVG `<title>`/`<desc>` + `role="img"`/`aria-labelledby` (caption derived from
   `describe()`, now exposed as `describe().caption`); new plan-level **`accTitle` / `accDescr`**
   keywords override the derived pair (codes `E_ACC_PLACEMENT`, `W_DUP_ACC_METADATA`;
   `examples/accessible.arch`). The one language-surface change → VS Code extension repack.

**v1.11.0** — annotate mode stamps `data-arch-id`/`data-arch-kind`; `diffPlans()` semantic diff.

**Prior release — v1.10.0 (human circulation + foundation refactor). Three tranches
(see `CHANGELOG.md` for detail):**
1. **Human circulation ([ADR 0008](../adr/0008-circulation-as-facts.md)).** Facts →
   `describe().circulation` (per-room walk distance / bottleneck clear width / detour ratio + key
   routes, on a clearance-eroded nav grid in `src/analyze/circulation.ts`); advisory lint →
   `W_PATH_TOO_NARROW` (default 700 mm; accessibility profile 900) + `W_CIRCUITOUS_PATH` (3.0×);
   opt-in overlay → `compile(src, { overlays: ["circulation"] })` / `arch compile --overlay
   circulation` + a playground **Paths** toggle; and a **repair guard** that declines any furniture
   move that would newly pinch a walk below the lint threshold (reported in `unresolved`).
2. **Foundation refactor** (default output byte-identical): wall-union rewrite (opening-heavy
   `toScene` ~19.5→2.6 ms), render-free `validate`/`lint`, honest bench, one-module-per-lint-rule,
   shared `geometry/rect.ts` + `num-format.ts`, drift-tested element/fixture/completion/format
   joints, Biome + `noUncheckedIndexedAccess` + Node 22 CI, playground migrated to TypeScript.
3. **Sites.** Embeddable playground viewer (`embed.html` + Embed button), IDE-parity
   actions (Format / Repair panel / clickable diagnostics), live editable `<ArchLive>` docs examples.

**v1.9.0 (opt-in source annotation + playground overhaul).** Two things:
- **Core: opt-in source annotation.** `compile(src, { annotate: true })` stamps `data-span="start:end"`
  (source byte range) on each drawn SVG primitive that has a span, so a tool can map a clicked element
  back to its source. **Default output is byte-identical** (Scene IR + SVG unchanged, goldens
  untouched, exports clean); `toScene` carries the span onto nodes only in this mode; walls are unioned
  so they are intentionally unstamped. Deterministic, still zero-dependency. Programmatic only (no CLI
  flag). See [ADR 0007](../adr/0007-opt-in-source-annotation.md).
- **Playground: mermaid-live-editor parity + editor↔plan linking.** The Vite app now has preview
  pan/zoom/fit, editor autocomplete (via the core `completion()`), compressed share links (`#z=`,
  reads legacy `#src=`), autosave + named snapshot history (localStorage), copy SVG/PNG, resizable
  panes, an always-visible `describe()` facts strip, **click-any-element → jump-to-source** (via
  `annotate`), and **hover-a-room → facts tooltip**. All client-side; exports strip the annotations.
  New modules: `playground/src/{pan-zoom,interact,snapshots,storage,arch-completion}.js`.

**v1.8.0 (agent CLI ergonomics).** Four additive commands, no core change and the
core stays zero-dependency: **`arch preview`** (render a PNG an agent can look at; PNG-first @2×,
zero-install where `@resvg/resvg-js` is present, else the catalogued `E_PNG_DEPENDENCY` + a `fix`, and
opt-in `--install` fetches it); **`arch batch`** (render many files concurrently, `{ ok, results[] }`);
**`arch md`** (render every ` ```arch ` block in a Markdown file → image links, via pure
`extractArchBlocks`/`rewriteMarkdown`); and **`arch manifest --json`** (the whole CLI API as structured
data, drift-tested against the dispatch + fixture glyphs). The auto-install is the one opt-in,
networked action — confined to the CLI seam.

**v1.7.1** (docs: `SKILL.md` adds a verified agent procedure to repair plan
**topology** — make every room reachable & every bedroom lit by adding doors/windows from the
`describe` access graph; the design choice stays in the agent layer per ADR 0005. No core change.)

**v1.7.0 (`arch repair` also clears door-swing arcs).** The corrector now fixes six
furniture-placement faults via a global fixpoint (priority wall → wrong-room → overlap → doorway →
swing → floating), deterministic and report-don't-guess (ADR 0006). On the motivating plans it drives
every furniture-placement and swing warning to zero.

**v1.6.0 (`arch repair` separates overlaps + relocates wrong-room fixtures).** The
corrector fixes furniture-placement faults via a global fixpoint, deterministic and report-don't-guess
(ADR 0006).

**v1.5.0 (`arch repair` clears doorways + snaps floating fixtures).** The corrector
iterates each piece to a stable position across closed-form fixes, converges, and reports rather than
guesses (ADR 0006). On the motivating plans it drives every furniture-placement warning to zero.

**v1.4.0 (physical-correctness & circulation; a 2nd Claude × Codex pass).**
The compiler stays a faithful deterministic renderer; corrective arranging is an **explicit
source-to-source transform** (`arch repair`), never invisible render behavior (see ADR 0006). v1.4
adds: **`dims auto walls`** + per-room dims in the page margin; lint **`W_FURNITURE_WALL_COLLISION`**,
**`W_DOORWAY_BLOCKED`**, **`W_ROOM_NO_CLEAR_PATH`** (a grid flood-fill in `src/analyze/occupancy.ts`);
**`arch validate --strict`** (warnings fail too — the pipeline ship-gate); catalogued fixture
footprints (`against wall` may omit `size`); and **`arch repair`**. See `CHANGELOG.md`.

**Prior release — v1.3.0 (architectural soundness, circulation facts & professional placement).**
A Claude × Codex adversarial pass. The compiler stays a faithful deterministic renderer; the new
"design intelligence" ships as **facts** (`describe`) and **advisory `lint`**, never an auto-arranger
(see ADR 0005). v1.3 adds: **room `uses` tags** + a central classifier; a **modeled door/opening
access graph** (`describe().access` — entrances, reachability, clear-width bottleneck); a leaf-less
**`opening` element**; **furniture `rotate`**, closed-form **`against wall` placement**, and `in
<room>` ownership; new lint (`W_ROOM_UNREACHABLE`, `W_FURNITURE_OVERLAP`, `W_FIXTURE_FLOATING`,
`W_FIXTURE_WRONG_ROOM`, `W_FURN_CLEARANCE`); **advisory profiles** (`arch lint --profile`); and fixes
for concave door arcs, dimensions drawn into the building, and the title-block overlap (shared
`chrome-layout.ts`). See `CHANGELOG.md`.

> Beware older docs that predate the launch: the completed build plans live in
> `docs/archive/` (see its README), and the now-frozen work log
> `docs/archive/WORK-LOG-v0.7-v1.15.md` is historical. The table above and
> `CHANGELOG.md` reflect what actually shipped.
</content>
</invoke>
