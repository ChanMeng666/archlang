# AGENTS.md

This file provides project guidance to AI coding assistants (Claude Code, GitHub Copilot, Cursor,
Codex, etc.) working with this repository. Read it before writing or changing any code.

## Project Overview

ArchLang — A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.

- **Primary language / stack:** TypeScript (Node 18+; the core also runs in the browser)
- **Default branch:** `main`
- **Repository:** https://github.com/ChanMeng666/archlang

## Project status & where things live (current)

**ArchLang is shipped and launched.** This is a published, deployed monorepo —
not a work-in-progress. Treat the live artifacts below as the source of truth
(the exact current version lives in the table and `CHANGELOG.md`, never in prose).

| Thing | Current | Where |
|-------|---------|-------|
| **Core package** | `@chanmeng666/archlang@1.13.0` (published, `latest`) | npmjs.com/package/@chanmeng666/archlang |
| **Agent interface** | the `arch` **CLI** (`--json`, exit codes, stdin — now incl. `ast`/`complete`/`fix`/`suggest`, `compile --from-json`/`-f txt`, `validate --graph`) + `SKILL.md` + `spec.llm.md` + **`llms-full.txt` / `arch context`** + **`schemas/plan.schema.json`** + **`grammars/archlang.gbnf`**. Primary interface stays the CLI; an **optional MCP shim** (`packages/mcp`) is a discoverability channel, not a replacement | `src/cli.ts`, `SKILL.md`, `spec.llm.md`, `llms-full.txt`, `packages/mcp` |
| **MCP server** | `@chanmeng666/archlang-mcp@0.1.1` (published, `latest`; registry entry `io.github.ChanMeng666/archlang-mcp` v0.1.1 live on registry.modelcontextprotocol.io; `packages/mcp/`; stdio shim over the library; tools compile/describe/lint/validate/repair/fix/suggest/complete + spec/context/schema/grammar resources; SDK dep quarantined here, core stays zero-dep) | `packages/mcp/`, `server.json` |
| **VS Code extension** | `ChanMeng.archlang@0.5.0` (published, live — bundles core 1.13.0 with the v1.13 language sugar — attachment/`strip`/anchor + the new codes) | marketplace.visualstudio.com/items?itemName=ChanMeng.archlang |
| **Playground** | deployed, redesigned (**"The Compile Boundary"** two-world UI — see below · TypeScript app · pan/zoom · autocomplete · history · click-to-source · format · repair · error-explain · embeddable `embed.html` · circulation Paths toggle · **Copy-for-LLM** · inline diagnostic fixes) | https://archlang-playground.vercel.app |
| **Docs site** | deployed, redesigned (**"The Compile Boundary"** two-world UI · compiler-as-hero · VitePress · live editable `<ArchLive>` examples · plain ```` ```arch ```` fences auto-live · serves `/llms.txt` + `/llms-full.txt` + **raw `/<page>.md`** + **`/plan.schema.json`** + **`/archlang.gbnf`**) | https://archlang-docs.vercel.app |
| **Git** | `main`, tags `v1.0.0` → `v1.13.0` (latest) | github.com/ChanMeng666/archlang |
| **Tests** | 794 passing (90 files, incl. the `packages/mcp` stdio smoke test and the fault-injection L1 gate) + offline authorability eval (26 briefs, judge v2, `npm run eval:ci`, in CI); typecheck (`noUncheckedIndexedAccess` on) + build + `npm run lint` (Biome) clean | — |

**Unreleased (post-1.13, on `main`) — v1.14 Tranches 1–2: the measurement foundation
(2026-07-11; roadmap `docs/research/2026-07-roadmap-proposal.md`, verdicts in the
companion deep-dive).** The eval's ruler is fixed and the deterministic-tool tier is
measured on its own ledger:
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
  see the honest-eval paragraph below. Next on the roadmap spine: Gate G1, then T3 (L2
  loop vs equal-budget resampling).

**Latest release — v1.13.0 (2026-07-11; AI-native authoring). Six tranches
(see `CHANGELOG.md` for detail):**
1. **Placement sugar** (write plans without hand-computed coordinates). Openings attach to a wall by
   position — `door|window|opening on <wall> at <pos>` (mm or `%`), `swing into <room>`, `hinge near
   start|end` (`E_ATTACH_WALL_REF`, `E_ATTACH_POS_RANGE`); **`strip <dir> at (x,y) gap … { rooms }`**
   lays rooms end to end (pure resolve-time sugar; `E_STRIP_NEST`, `E_STRIP_SIZE`); **`furniture …
   in <room> anchor <a> [inset <mm>]`** snaps furniture to a room corner/edge. New flagship
   `examples/attached.arch`. Documented in `docs/language-reference.md`.
2. **Machine-applicable fixes ([ADR 0011](docs/adr/0011-machine-applicable-fixes.md)).** `Diagnostic.fixes`
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
5. **MCP server ([ADR 0012](docs/adr/0012-mcp-shim-discoverability.md)).** New `packages/mcp/`
   workspace **`@chanmeng666/archlang-mcp@0.1.1`** (published; registry entry
   `io.github.ChanMeng666/archlang-mcp`) — a stdio MCP shim wrapping the library (tools
   compile/describe/lint/validate/repair/fix/suggest/complete; resources spec/context/schema/grammar),
   published to the official MCP registry from its `server.json`. **The core stays zero-dependency — the MCP SDK lives
   only in this package.** The CLI remains primary (token cost); MCP is the discoverability channel,
   amending [ADR 0009](docs/adr/0009-ai-first-context-and-distribution.md)'s distribution-over-protocol point.
6. **Docs distribution.** The docs site now serves every generated page as **raw markdown at
   `/<route>.md`** and the machine-native **`/plan.schema.json`** + **`/archlang.gbnf`** at its root
   (advertised in `llms.txt`).

**Honest eval read (calibrated 2026-07-11; judge v2, 26 briefs, `gpt-5.5-2026-04-23`,
seed-pinned).** The single-digit one-shot intent number that motivated the round-2 research was
~55–65% **measurement artifact** (deep-dive H2, dual-audit): judge v1 tested golden mimicry
(label substrings, golden-derived area bands), not brief satisfaction. Under judge v2
(brief-grounded assertions) the same model measures **valid 25/26 (96%) · intent 13/26 (50%) ·
sound 4/26 (15%)** — inside the predicted 45–60% true-deliverable band. Residual true failures
are dominated by **physical violations**, and the deterministic tools clear most of those for
free: the same run's `--l1` overlay (fix+repair, zero extra API calls) scores **intent 18/26
(69%, ΔL0→L1 +5) · sound +2**, with 7 briefs healed by 47 repair moves. That dividend belongs
to the tool tier's ledger, never a model loop's (H3); whether a diagnostic feedback loop beats
equal-budget resampling is T3's still-open question. Two standing harness lessons: reasoning
models spend thinking tokens out of the completion cap (use 16384, both providers), and never
compare rates across a judge change (the harness flags it). Judge-v1 numbers (9% intent) are
kept only as history; `eval/live-baseline.json` carries the calibrated L0 baseline.

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
**[ADR 0010](docs/adr/0010-compile-boundary-design-system.md)**. VS Code extension bumped to 0.4.1
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
1. **Human circulation ([ADR 0008](docs/adr/0008-circulation-as-facts.md)).** Facts →
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
  flag). See [ADR 0007](docs/adr/0007-opt-in-source-annotation.md).
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
> `docs/archive/` (see its README), and the earlier half of `docs/WORK-LOG.md` is
> historical. The table above and `CHANGELOG.md` reflect what actually shipped.

**Monorepo layout (npm workspaces, one root lockfile):**

```
.                     @chanmeng666/archlang — the core (PUBLISHED package; src/, dist/)
├─ spec.llm.md        GENERATED one-page language spec for agents (`arch spec`); see scripts/gen-llm-spec.ts
├─ SKILL.md           agent Skill: the spec → compile → fix → describe → validate loop (CLI-driven)
├─ llms.txt           machine-readable project map (how to USE vs CONTRIBUTE)
├─ llms-full.txt      GENERATED full agent context (spec + skill + CLI + errors); see scripts/gen-llms-full.ts
├─ schemas/           GENERATED plan.schema.json — Plan-JSON JSON Schema (`gen:plan-schema`, drift-tested)
├─ grammars/          GENERATED archlang.gbnf — GBNF constrained-decoding grammar (`gen:gbnf`, drift-tested)
├─ packages/mcp/      @chanmeng666/archlang-mcp — stdio MCP shim over the library (SDK dep quarantined here);
│                     src/server.ts, server.json (registry manifest), test/ smoke test — see ADR 0012
├─ editors/vscode     archlang-vscode → published as ChanMeng.archlang (esbuild-bundled extension)
├─ editors/*.json     generated TextMate grammar + language-configuration (shared by the extension)
├─ playground/        Vite + CodeMirror live editor (consumes the built core via dist/);
│                     styles split under src/styles/{tokens,chrome,editor,panels,embed}.css
│                     (tokens.css = the shared "Compile Boundary" brand block);
│                     also ships embed.html — a chrome-less <iframe> viewer read from the #z= hash
├─ docs-site/         VitePress docs (pages generated from docs/*.md, examples/*.arch);
│                     theme CSS split as .vitepress/theme/{style,home,doc-pages}.css
│                     (style.css = the shared "Compile Boundary" brand block + .dark mylar);
│                     examples are live/editable <ArchLive> widgets (compile in the browser)
├─ docs/              language-reference.md · analysis.md · error-codes.md · adr/ · WORK-LOG.md
├─ brand/             logo kit + brand book (README.md); archlang-logo-master.svg is byte-sacred, variants are fill-swaps only
├─ examples/          studio · two-bed · parametric · themed · relational · attached · accessible · lib/ · imports
├─ eval/              NL→ArchLang authorability harness (corpus.json — 26 briefs, goldens/, run.ts,
│                     assertions.ts + synonyms.ts — the judge-v2 intent-assertion core, rubric.md —
│                     frozen review rubric, faults/ + l1.ts — the L1 deterministic-tool gate;
│                     offline golden gate `npm run eval:ci` in CI, no API key; guarded live run
│                     `npm run eval:live -- --yes` → eval/results.live.md + delta vs live-baseline.json)
├─ scripts/           gen-grammars · gen-error-codes · gen-llm-spec · gen-llms-full · gen-gbnf · gen-plan-schema (single-source generators)
├─ bench/             ~1000-element timing harness (+ --json mode, CI regression comment)
└─ test/              vitest: snapshot + fast-check + unit + visual-regression + CLI/describe/lint/eval
```

Key agent-facing `src/` modules (all pure, exported from `src/index.ts`): `describe.ts`
(semantic summary), `lint.ts` (architectural soundness rules — v1.2 added circulation/enclosure/
swing-clearance/fixture checks), `analyze.ts` (shared resolve pipeline + rectilinear geometry —
door connectivity, perimeter enclosure — behind both `describe` and `lint`). `geometry.ts` holds the
shared door-swing quarter-disc geometry used by both the renderer and the linter;
`elements/fixtures-glyphs.ts` (v1.2) draws the fixture symbols. `diagnostic-json.ts` (v1.12) is the
public line/col/`fix` projection of a `Diagnostic` (`diagnosticToJson`, used by the CLI/playground/
LSP); `backends/error-svg.ts` (v1.12) renders the opt-in error card (`renderErrorSvg`); and
`describe().caption` (v1.12) is the one-sentence accessible summary shared with `--accessible`. The
agent-facing CLI lives in `src/cli.ts`.

A single `npm install` at the root bootstraps every workspace.

### The sites' design system — "The Compile Boundary" (docs + playground)

Both public sites share one front-end system (deployed 2026-07-10; see
[ADR 0010](docs/adr/0010-compile-boundary-design-system.md) and `brand/README.md`). It is **site
chrome only** — no core/language change, and ArchCanvas keeps its own separate system.

- **Two worlds split by a compile seam.** Dark **SOURCE world** (carbon `#0f1115` / `#171b23`, with
  plum `#8052ff` surviving *only* as the syntax-highlight accent + logo fills) vs. light **SHEET
  world** (drafting paper `#f5f2ea`, blue-black ink `#1c2430`, hairlines, drafting grids, title
  blocks). One shared accent, **REDLINE** (`#c2362b` graphics / `#b3261e` text), for attention only
  (CTAs, errors); amber `#8a6d00` stays advisory. Docs dark mode is a "mylar film" variant.
- **Fonts** (self-hosted `@fontsource`, zero CDN): **Archivo Variable** (display, `wdth` axis) +
  **Public Sans Variable** (body) + **IBM Plex Mono** (code/figures). Space Grotesk / Geist Mono are
  retired from the sites (the wordmark asset still carries outlined Space Grotesk paths — unchanged).
- **Token-lockstep law.** The brand token block is **duplicated byte-identically** — there is no
  shared import, the two build systems are separate — in exactly these two files; change one, change
  the other:
  - `docs-site/.vitepress/theme/style.css`
  - `playground/src/styles/tokens.css`
- **Where each site's styles live.** Docs: `.vitepress/theme/{style,home,doc-pages}.css` (tokens +
  VitePress mapping / landing / inner pages) plus `CompileSeam.vue` (compiler-as-hero), `SheetGrid`,
  `FactsSection`, `TitleBlockFooter`, `ArchLive`. Playground:
  `src/styles/{tokens,chrome,editor,panels,embed}.css`. The playground is a fixed two-world layout
  with **no light/dark toggle** by design.
- **Machine-readable routes (v1.13).** `sync-docs.mjs` also publishes, at the docs-site root, a **raw
  markdown copy of every generated page** at `/<route>.md` (e.g. `/spec.md`, `/reference.md`) plus the
  **`/plan.schema.json`** and **`/archlang.gbnf`** artifacts. The `.md` copies live in `public/` and
  are excluded from VitePress page parsing (`srcExclude: ["public/**"]`) so they serve verbatim
  without being routed or dead-link-checked.

## Commands

This is an **npm-workspaces monorepo**: the core (`@chanmeng666/archlang`) lives at
the repo root and is the published package; `editors/vscode`, `playground`,
`docs-site`, and `packages/*` (currently `packages/mcp`) are workspace members
sharing one root lockfile.

```bash
npm install          # bootstraps ALL workspaces (core has ZERO runtime deps)
npm run build        # build core library + CLI into dist/ (tsup)
npm run typecheck    # tsc --noEmit
npm run lint         # biome check . (format + lint; `npm run lint:fix` applies safe fixes)
npm test             # run the vitest suite (test/**/*.test.ts)
npm run cli -- compile examples/studio.arch -o studio.svg   # run the CLI from source via tsx
npm run bench        # compile a generated ~1000-element plan and report per-stage timings
npm run gen:grammars # regenerate editor grammars from src/grammar/tokens.ts (CI checks drift)
npm run gen:errors   # regenerate docs/error-codes.md from the catalog (CI checks drift)
npm run gen:spec     # regenerate spec.llm.md from tokens.ts + examples/ (CI checks drift)
npm run gen:llms     # regenerate llms-full.txt from spec + SKILL.md + manifest + error catalog (CI checks drift)
npm run gen:gbnf     # regenerate grammars/archlang.gbnf from src/grammar/tokens.ts (CI checks drift)
npm run gen:plan-schema  # regenerate schemas/plan.schema.json from PLAN_JSON_SCHEMA (CI checks drift)

npm run playground:dev   # build core, then run the Vite playground dev server
npm run docs:build       # build core, then build the VitePress docs site
npm run mcp:build        # build core, then build the MCP shim (packages/mcp → dist/ + copied resources)
```

Export to other formats from the CLI: `-f svg|dxf|txt|pdf|png` (`txt` is the
zero-dep ASCII plan; `pdf` needs optional `pdfkit`; `png` needs optional
`@resvg/resvg-js`).

**The CLI is agent-native.** Every command takes `--json` (structured result to stdout, messages to
stderr) with deterministic exit codes (`0` ok · `2` user-source error · `1` IO/internal · `3` bad
usage), and source can come from stdin (`-`). Beyond `compile`/`watch`/`fmt`/`explain` there are
`arch spec` (print the whole language — `spec.llm.md`), `arch context` (print the full bundled agent
context — `llms-full.txt`: spec + skill + CLI reference + error catalog, for a cold-start agent),
`arch describe` (semantic JSON: rooms,
areas, adjacency, door connections — backed by `describe()` in `src/describe.ts`), `arch lint`
(architectural soundness `W_*` warnings — `src/lint.ts`), `arch validate` (parse+resolve+lint, no
render; `--strict`/`--fail-on-warning` makes warnings fail too — the pipeline ship-gate; `--graph
<g.json>` also checks interior-door adjacency against an intended graph via `checkGraph`), `arch ast`
(parse-only span-bearing AST JSON — `astToJson`), `arch complete --at <offset>` (LSP `completion()`
items in scope), `arch fix` (apply the machine-applicable `diagnostics[].fixes` via a bounded
fixpoint — `applyFixes`, `--unsafe`/`--dry-run`/`--force`; ADR 0011), `arch suggest` (advisory
door/window topology statements as data — `suggestTopology`, ADR 0005), `arch new` (scaffold),
`arch repair` (the explicit source-to-source **geometric** corrector — pushes furniture out of walls
and emits new `.arch` + a change log; `src/repair.ts`, see ADR 0006 — distinct from `fix`), `arch
preview` (render a PNG an agent can look at, or `--ascii` for a zero-dep text plan; opt-in `--install`
fetches the optional `@resvg/resvg-js`), `arch batch` (render many files concurrently → `{ ok,
results[] }`), `arch md` (render the ` ```arch ` blocks in a Markdown file → image links; pure
`src/markdown.ts`), and `arch manifest`/`capabilities` (the whole CLI API as structured data —
`src/manifest.ts`). Output-shaping flags: `-f txt` (zero-dep ASCII plan via `renderAscii`),
`compile --from-json` (read Plan JSON — `planFromJson` — instead of `.arch`); opt-in
`--error-svg` (on `compile`/`preview`/`md`) renders a failing plan as a self-describing error-card
SVG instead of no bytes, and `--accessible` (on `compile`) emits SVG `<title>`/`<desc>` +
`role="img"`; the error-svg/accessible paths leave the default output byte-identical.
`describe`/`lint` share the pure analysis layer in `src/analyze.ts` (+ `src/analyze/occupancy.ts`, the
circulation flood-fill); all are exported from `src/index.ts`. The CLI is the **primary** agent
interface; an optional stdio **MCP shim** (`packages/mcp`, `@chanmeng666/archlang-mcp`) wraps the same
library functions for MCP-native hosts as a discoverability channel (see ADR 0012 and the README's
agent section) — the core stays zero-dependency, the SDK lives only in that package.

## Architecture & Conventions

ArchLang is a compiler pipeline. Source text → backend-neutral **Scene IR** →
backends, in stages:

```
source (.arch)
  └─ src/lexer.ts       hand-written lexer  → Token[]   (byte spans)
  └─ src/parser.ts      recursive descent   → PlanNode  (src/ast.ts); recovers, never throws
  └─ src/import.ts      link `import`s through the World seam (the one I/O phase)
  └─ src/ir.ts          resolve(): expand scripting, grid-snap, auto-id, host openings,
                        relational placement (src/layout.ts) → ResolvedPlan
  └─ src/scene-build.ts toScene(): wall union/offset, hatches, page sizing → Scene (src/scene.ts)
  └─ src/backends/      pure serializers of the Scene:
       svg.ts (default, zero-dep) · png.ts (optional @resvg/resvg-js)
  └─ src/export/        dxf.ts (zero-dep) · pdf.ts (optional pdfkit)
  └─ src/index.ts       compile() — orchestrates the above; memoizes by source + extension id
```

- **`src/index.ts` is the only public surface.** It exports `compile(source, opts) =>
  { svg, errors, warnings, diagnostics, ast?, scene? }` plus the backends, the
  extension registry, the World seam, and the types. The `CompileResult` is
  **append-only** — add fields, never remove/rename.
- **`compile()` is pure, synchronous, and isomorphic** — no I/O, no `Date.now()`, no
  `Math.random()`. This guarantees determinism and lets it run in the browser. Do **not**
  introduce non-determinism or Node-only APIs into the `src/` core. The CLI (`src/cli.ts`)
  is the one place Node APIs and real time are allowed; everything else gets its environment
  injected through the **`World`** seam (`src/world.ts`).
- **Optional power is lazily `import()`ed.** Heavy/native deps (Clipper2 geometry, pdfkit,
  resvg) are `optionalDependencies`, loaded only at point of use, so the default SVG path
  pulls nothing. See ADRs in `docs/adr/`.
- **Errors are returned, never thrown** for user-source problems. Push a `Diagnostic` (with a
  byte `span` and an `E_*`/`W_*` `code` documented in `src/error-catalog.ts`); the parser
  recovers and reports all problems in one pass.
- **Adding an element = one module** in `src/elements/` exporting an `ElementDef`, registered
  in `src/elements/defs.ts`. Parse/resolve/render dispatch through the registry, not a switch.
- **Output formats are deliberately NOT a public registry seam** (unlike elements/themes/
  hatches/geometry-backend): formats drag optional native deps and CLI flags with them, which
  a registry can't abstract cleanly. Adding one = a row in `EXPORT_FORMATS`
  (`src/manifest.ts`) + a serializer line in `src/cli.ts` `serialize()`.
- **Coordinates are millimetres**; origin top-left, +x right, +y down (matches SVG).
- **Rendering constants** (colours, line weights, fonts) live in the theme (`src/theme.ts`)
  and the size formulas in the backends — tune there, not inline.
- **Zero runtime dependencies in the core is a feature.** Don't add a hard runtime dep;
  prefer arithmetic or an optional lazy dep.

## Gotchas & Anti-patterns

- **Don't edit `dist/` or generated files.** `dist/` is a build output. The editor grammars
  (`editors/archlang.tmLanguage.json`, `playground/src/arch-language.js`) and
  `docs/error-codes.md` are generated from `src/grammar/tokens.ts` / `src/error-catalog.ts`
  — edit the source and run `npm run gen:grammars` / `npm run gen:errors` (CI fails on drift).
  Likewise `spec.llm.md` is generated from `src/grammar/tokens.ts` + `examples/` by
  `npm run gen:spec` (the curated prose lives in `scripts/gen-llm-spec.ts`); CI fails on drift.
  `llms-full.txt` (the bundled full agent context) is generated from `spec.llm.md` + `SKILL.md` +
  the manifest + the error catalog by `npm run gen:llms` (`scripts/gen-llms-full.ts`); CI fails on
  drift — regenerate it after editing any of those sources. `grammars/archlang.gbnf` (GBNF grammar,
  `npm run gen:gbnf`) and `schemas/plan.schema.json` (Plan-JSON schema, `npm run gen:plan-schema`)
  are likewise generated from `src/grammar/tokens.ts` / `PLAN_JSON_SCHEMA` and CI-drift-tested.
  The docs site copies the four root artifacts (`llms.txt`, `llms-full.txt`, `plan.schema.json`,
  `archlang.gbnf`) and a raw markdown copy of each generated page into `public/` via
  `docs-site/sync-docs.mjs` — edit the repo-root source, not the copies. **Editor syntax colors also route
  through the generator:** `playground/src/arch-language.js` emits each `HighlightStyle` tag as
  `var(--syn-<name>, <fallback>)` (the on-carbon palette lives in `playground/src/styles/editor.css`)
  — to recolor the live editor, edit the `scripts/gen-grammars.ts` template or the `--syn-*` values
  and run `npm run gen:grammars`; never hand-edit `arch-language.js` (the tmLanguage JSON is byte-unchanged by this).
- **Determinism is tested.** The suite asserts `compile(s) === compile(s)` byte-for-byte, with
  the optional geometry engine both present and absent. Anything that varies output across runs
  (object key order, floats, time) will fail — route number formatting through `fmt()`. The one
  opt-in output change is `compile(src, { annotate: true })` (adds `data-span` attributes for
  editor tooling); it is itself deterministic and leaves the **default** output byte-identical, so
  never emit annotation unconditionally (ADR 0007) — a test strips `data-span` and asserts equality
  with the default SVG.
- **Relational placement is deterministic, not an optimizer.** `src/layout.ts` resolves
  `right-of`/`below`/… by pure arithmetic in topological order; the absolute `at (x,y)` path
  must stay byte-identical (it is the default and has its own golden snapshots). See ADR 0004.
- **The PNG backend is Node-only and async** (resvg is a native binding); it rasterizes the SVG
  with a **bundled font** so text is deterministic. Keep `node:*` imports lazy inside the
  function so the module stays browser-safe.
- **Keep every Node-only lazy `import()` bundler-safe.** The lazy `import()`s of `@resvg/resvg-js`,
  `pdfkit`, and `clipper2-wasm` — **and** the PNG backend's font-lookup `import("node:fs")` /
  `import("node:url")` — carry `/* webpackIgnore: true */ /* @vite-ignore */` so a downstream
  webpack/Next.js consumer doesn't try to resolve a native `.node` binary or a `node:*` builtin for
  the browser and fail its build (this was the 1.0.0→1.0.1 fix; the PNG `node:*` case was the
  1.12.1 fix, found when a downstream consumer first imported the core client-side). The comments
  are needed even though these paths never run in a browser. Preserve them on any new Node-only or
  optional-dep import.
- **`npm run dev`** (repo root) runs `tsup --watch` (a rebuild watcher), not a web server. The
  playground/docs sites are separate Vite apps — use `npm run playground:dev` / `docs:dev`.
- **(MCP registry) The `io.github.<Owner>/*` namespace is case-sensitive and identity-checked.**
  registry.modelcontextprotocol.io exact-matches the published npm package's **`mcpName`** field
  against `server.json`'s `name`, so the owner segment must match your GitHub login byte-for-byte
  (`io.github.ChanMeng666/…`, not `chanmeng666`); it also **caps the server `description` at 100
  chars**. A mismatch or an over-long description is rejected at publish — the 0.1.0 → 0.1.1 patch
  fixed exactly this (casing + shortened description), which is why a same-day republish was needed.
- **(Eval harness) Reasoning models spend thinking tokens out of `max_completion_tokens`.** The live
  eval's original 4096 cap starved `gpt-5.5` into truncated (invalid) output and produced a bogus
  low baseline; `eval/run.ts` uses 16384. If a new provider/model scores implausibly low, suspect a
  token cap before the language — bump the budget and re-run before trusting the number.
- **Door `hinge left/right` is relative to the wall's traversal direction**, not the screen —
  so the hinge side can flip depending on the order of a wall's points. The swing quarter-disc is
  computed once in `geometry.ts` (`doorSwing`) and shared by `door.render()` and the
  `W_SWING_OBSTRUCTED` lint rule — keep them on that one helper.
- **Fixtures draw by category, not a new element kind.** `furniture.render()` dispatches the
  category to `elements/fixtures-glyphs.ts`; a known fixture (`wc`, `basin`, `shower`, `bathtub`,
  `kitchen_sink`/`sink`, `counter`, `fridge`, `stove`…) draws a symbol and ignores its `label`,
  anything else falls back to the labelled rectangle. The lint rules key off the **room label**
  (`/bath|wc|shower/i`, `/kitchen/i`) and the **fixture category** — keep those classifiers in sync.
- **`examples/studio.arch` is import-free on purpose** (`test/world.test.ts` asserts the flagship
  compiles from a single file with no World). Use inline `furniture <fixture>` there, not imports.
- **(Sites) A partial `:global(.dark) …` selector inside a Vue `<style scoped>` block miscompiles.**
  A `:global(.dark) .foo` written *inside* scoped styles collapses to a bare `.dark { … }` rule (it
  once inverted the whole site). Put dark-mode overrides of a component's scoped internals in a
  **separate unscoped `<style>` block**, not in the scoped one.
- **(Sites) VitePress `.vp-doc a:hover` (specificity 0,2,1) outranks a two-class rule (0,2,0) on
  hover.** Any `.vp-doc <class> a` control whose color must survive hover has to re-assert `color`
  in its own `:hover` rule. Verify interactive states (hover/focus/active), not just static render.
- **(Sites) A token that flips per mode is unsafe on ground that does not flip.** `--redline` (and
  any mode-flipping var) must not be used on the fixed carbon terminal or the always-dark bands — use
  a fixed hex + a comment there (e.g. the solid CTA is fixed `#b3261e` + white).

## Reading Order

**To USE ArchLang (author/edit floor plans as an agent):** read `spec.llm.md` (the whole language
in one page — or run `arch spec`), then follow `SKILL.md`'s loop: `spec` → write `.arch` →
`arch compile --json` → fix from each `diagnostics[].fix` → `arch describe --json` to confirm
intent. Zero install: `npx @chanmeng666/archlang …`.

**To CONTRIBUTE (work on this repo), read in this order:**
1. `README.md` — what the project is and how to run it
2. This `AGENTS.md` — how to work in it
3. `CONTRIBUTING.md` — contribution workflow and quality gates

## Conventions for Changes

- Follow [Conventional Commits](https://www.conventionalcommits.org/).
- Run the project's lint/test commands before proposing changes.
- Keep this file up to date when you change build steps, structure, or conventions.
