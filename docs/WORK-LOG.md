# ArchLang v0.7→v1.0 — Implementation Work Log (history) & current state

> **⚠️ Historical document (frozen 2026-07).** Everything below records how
> ArchLang reached 1.x — none of it is a pending plan. For current status read
> **`AGENTS.md`** and **`CHANGELOG.md`**; the completed build plans live in
> [`docs/archive/`](./archive/README.md).

> **Purpose.** A record of how ArchLang reached its **1.0 launch** and the state it
> is in now. The v0.7→v1.0 build is **complete** — there is no pending phase. A
> fresh session should read **`AGENTS.md` first** (the canonical status + how to
> work), then use this log for the per-phase implementation history (§3–§4d) and
> the post-1.0 continuation notes (§5). The roadmap
> [`docs/archive/IMPLEMENTATION-PLAN-v0.7-v1.0.md`](./archive/IMPLEMENTATION-PLAN-v0.7-v1.0.md) is
> the (now-completed) plan these phases executed.

_Last updated: **v1.2.0 SHIPPED (architectural soundness).** Core published `@chanmeng666/archlang@1.2.0` (`latest`); VS Code extension `ChanMeng.archlang@0.3.0` published; playground + docs site deployed. v1.2 makes architecturally wrong plans hard to ship and easy to detect: four new `arch lint` rules (bath-via-bedroom, room-not-enclosed, door-swing-obstructed, no-fixtures), drawn plumbing/kitchen fixture symbols + a `lib/fixtures.arch` library, `dims auto` dimension synthesis, and a corrected, lint-clean `examples/studio.arch`. v1.1 (prior) made ArchLang drivable by an AI agent end-to-end through its CLI (no MCP): an agent-native CLI (`--json`, exit codes, stdin, `fix`-carrying diagnostics), `arch spec`/`spec.llm.md`, `arch describe` (semantic JSON), `arch lint` (soundness), a `SKILL.md`, and an NL→ArchLang `eval/` harness. Sections 3–4b below are the accurate v0.8–v0.10 implementation history; sections 1, 2, 4c, 4d, 5, 7 reflect the launched state. For the full v1.1/v1.2 detail read `CHANGELOG.md`._

---

## 1. TL;DR — status

**Everything through v1.0 is shipped, published, and deployed.** For the canonical
"what's live and where" table, see **`AGENTS.md` → Project status**. Phase rollup:

- **v0.7 (Scene IR):** shipped (released 0.7.0).
- **v0.8 (scripting language, T2.1–T2.8):** ✅ shipped (0.8.0).
- **v0.9 (CAD fidelity, T3.1–T3.7):** ✅ shipped (0.9.0).
- **v0.10 (extensible platform, T4.1–T4.5):** ✅ shipped (0.10.0).
- **v0.11 (IDE-grade tooling, T5.1–T5.5):** ✅ shipped (0.11.0) — see §4c.
- **v1.0 (polish, ecosystem & launch, T6.1–T6.5):** ✅ shipped (1.0.0), plus a **1.0.1** consumer-bundler fix — see §4d.
- **v1.1 (AI-agent-native, CLI-first):** ✅ shipped (1.1.0) — agent-native CLI (`--json`, exit codes, stdin), `describe()`/`arch describe`, `lint()`/`arch lint`, `arch spec`/`spec.llm.md`, `SKILL.md`, and the `eval/` authorability harness. Additive; rendered output byte-identical to v1.0.
- **Published:** core `@chanmeng666/archlang@1.1.0` on npm (`latest`); extension `ChanMeng.archlang@0.2.0` on the VS Code Marketplace.
- **Deployed:** playground (archlang-playground.vercel.app) + docs site (archlang-docs.vercel.app).
- **Tests:** **371 passing** (41 files), typecheck + build clean, examples deterministic.

---

## 2. Git state

- **Default branch:** `main` — current, clean, and **pushed** to `origin/main`.
- **Tags:** `v1.0.0`, `v1.0.1`, `v1.1.0` (pushed); `v1.1.0` is `latest`.
- **`package.json` version:** `1.1.0` (published to npm).
- **Repo is now an npm-workspaces monorepo:** core at root + `editors/vscode` + `playground` + `docs-site`, one root lockfile. `.gitattributes` enforces LF endings (so the old CRLF snapshot artifact is gone).
- **Consumer `archcanvas`:** bumped to `^1.0.1` on branch `chore/bump-archlang-1.0.0` with PR #2 open (verified `tsc --noEmit` + `next build`); **not merged**.

**v0.8 commits on `main` (oldest→newest):** `ed14e22` T2.1 → `cdb7a11` T2.2 → `425c7d4` T2.3 → `7e199e8` T2.4 → `2dc64f4` T2.5 → `a4662da` T2.6 → `d864add` T2.7 → `53a2ce6` T2.8 → `40ebd03` release 0.8.0 → `a345096` merge.

**v0.9 commits on the branch:** `aa86c39` T3.1 → `1da366c` T3.2 → `28b936a` T3.3 → `a1e9451` T3.4 → `966c970` T3.5 → `9d3c744` T3.6 → `d2ab21c` T3.7 → (release-prep commit: 0.9.0 + CHANGELOG).

**Optional dependency added:** `clipper2-wasm@0.4.0` (pinned) under `optionalDependencies` — lazy-`import()`ed only for angled walls; absent from the default bundle. `npm install` flags transitive-dep audit warnings from clipper2-wasm's build chain (not on the runtime path).

---

## 3. What shipped — v0.8 (the scripting language), per task

The root change was generalizing `Value` from `number` to a real value union; everything else builds on it. All expand-time, pure, deterministic. Numbers stay unitless mm.

| Task | What | Key files |
|---|---|---|
| **T2.1** | `Value = num\|bool\|str\|arr\|fn\|builtin`; `Env=Map<string,Value>`; `evalExpr→Value`; `asNum/asBool/asStr` coercions (`E_TYPE`). **Seam:** `ResolveCtx.eval` stays `(Expr)=>number`, so `elements/*.ts` were untouched. | `src/expr.ts`, `src/ir.ts` |
| **T2.2** | Grammar: comparisons `< > <= >= == !=`, logical `&& \|\|` (short-circuit), `!`, ranges `a..b`, arrays `[…]`, indexing, calls, `if…else` **expression**, string-interpolation templates. New lexer tokens; string tokens carry `raw`. | `src/lexer.ts`, `src/expr.ts` |
| **T2.3** | Control flow expanded in `expandScope` like component inlining: `for x in <arr\|range>`, `if/else`, bounded `while` (10k cap, `E_WHILE_LIMIT`), and reassignment `x = expr` (so `while` can progress). Shared body-statement parser. | `src/ast.ts`, `src/parser.ts`, `src/ir.ts` |
| **T2.4** | Explicit parent-linked `Scope` chain (built in T2.3); shadowing + restoration; `E_REDEF` preserved; component body sees globals+params, not caller locals. | `src/ir.ts` (the `Scope` class) |
| **T2.5** | `let f(x)=…` value-functions / closures (capture defining scope; self-recursion via adding self to closure; `E_ARITY`; `E_CALL_DEPTH` cap 512). `component` (emits elements) unchanged. | `src/expr.ts`, `src/parser.ts`, `src/ir.ts` |
| **T2.6** | Frozen built-ins `min,max,abs,sqrt,floor,ceil,round,len,str` in a scope **above** plan globals (shadowable without `E_REDEF`). Wired via `setBuiltinDispatch` (no import cycle). | `src/builtins.ts`, `src/ir.ts` |
| **T2.7** | Scoped `set <kind>(key: value)` overrides stored on the `Scope`; door applies `swing`/`hinge` with precedence explicit > set > hard default. Door's hinge/swing became explicit-only in the AST. | `src/ast.ts`, `src/parser.ts`, `src/ir.ts`, `src/elements/door.ts` |
| **T2.8** | Interpolated labels: `room/furniture/dim` label/text are template `Expr`s, parsed via `ParseCtx.parseStringExpr`, resolved via `ResolveCtx.evalStr`; escaped at the SVG boundary (XSS test). Rewrote `examples/parametric.arch`; expanded `docs/language-reference.md`. | element files, `src/registry.ts`, docs, example |

Backward-compat for v0.8: the value generalization changed **no** output — `studio`/`two-bed`/`themed` snapshots stayed byte-identical; only `parametric.arch` changed (it was intentionally rewritten as the showcase).

---

## 4. What shipped — v0.9 (CAD fidelity), T3.1–T3.3

> **Important nuance about snapshots:** the strict "byte-identical" rule was a **v0.8** constraint (don't let the language generalization leak into output). **v0.9 is allowed to change visual output intentionally** (line weights, layers, openings cutting walls) — update the golden snapshots when it does, and keep determinism (`compile(s)===compile(s)`).

| Task | What | Key files |
|---|---|---|
| **T3.1** | `SceneNode` gains optional `lineWeight` (`heavy\|medium\|thin\|extraThin`), `lineType` (`continuous\|dashed\|center\|hidden`), `layerName`. SVG maps weight→stroke-width via a named ramp + type→`stroke-dasharray`; DXF adds an **LTYPE table (before LAYER)** + code-6 linetypes. **Additive** (nodes that set none render as before). | `src/scene.ts`, `src/backends/svg.ts`, `src/export/dxf.ts` |
| **T3.2** | **AIA CAD layers** via `aiaLayer(pass)`/`layerOf(node)` in `scene.ts` (wall→A-WALL, room→A-FLOR, door→A-DOOR, window→A-GLAZ, furniture→A-FURN, column→A-COLS, labels→A-ANNO-TEXT, dims→A-ANNO-DIMS). SVG groups nodes into `<g inkscape:groupmode="layer">`; DXF LAYER table uses AIA names + per-layer colours (code 62). Columns set `layerName: "A-COLS"`. | `src/scene.ts`, `src/backends/svg.ts`, `src/export/dxf.ts`, `src/elements/column.ts` |
| **T3.3** | **Openings void walls (IFC-style):** a hosted door/window registers an `Opening` on its `RWall`; the wall-lowering pass subtracts opening rects from the wall solid. The zero-dep rectilinear engine was generalized from union → **boolean**: `rectBooleanOutline(solid, holes)` (`rectUnionOutline` delegates with no holes → byte-identical). Orthogonal case is fully zero-dep. | `src/geometry/union.ts`, `src/ir.ts`, `src/scene-build.ts`, `src/elements/wall.ts` |
| **T3.4** | **Optional `GeometryBackend` seam.** `src/geometry/backend.ts` = interface (`union`/`difference`/`offset`) + a synchronous module-level registry (`setGeometryBackend`/`getGeometryBackend`). `src/geometry/clipper.ts` = lazy `clipper2-wasm` adapter (integer-scaled, deterministic). `lowerWalls` keeps orthogonal on `rectBooleanOutline` (byte-identical) and routes only **angled** groups through the backend → one seamless region. CLI loads the engine best-effort. | `src/geometry/backend.ts`, `src/geometry/clipper.ts`, `src/scene-build.ts`, `src/cli.ts`, `src/index.ts` |
| **T3.5** | **Hatch as data + real DXF HATCH.** New `hatch` ScenePrim `{region,material,scale,angle}`; `Scene.materials` → `Scene.hatches: HatchSpec[]`. `hatches.ts` parameterized by scale→tile/angle→`patternTransform` + DXF pattern names. DSL `material <name> [scale <n>] [angle <deg>]`. SVG emits one `<pattern>` per distinct spec; DXF emits a real `HATCH` entity (header bumped to `AC1015`). Orthogonal SVG byte-identical. | `src/scene.ts`, `src/hatches.ts`, `src/elements/wall.ts`, `src/scene-build.ts`, `src/backends/svg.ts`, `src/export/dxf.ts`, `src/ast.ts`, `src/ir.ts` |
| **T3.6** | **Computed dimensions.** `RenderCtx.fmt` (shared mm formatter); a `dim` with no `text` shows `|to−from|` via `fmt` so SVG + DXF agree. | `src/registry.ts`, `src/scene-build.ts`, `src/elements/dim.ts` |
| **T3.7** | **Spatial grid index.** `src/geometry/grid-index.ts` (uniform-grid `GridIndex<T>`); `WallGrid` in `geometry.ts` for host lookup; room-overlap grid in `ir.ts`. Provably byte-identical to the O(n²) paths (fast-check). Bench: resolve roughly halved on the skewed plans. | `src/geometry/grid-index.ts`, `src/geometry.ts`, `src/ir.ts`, `bench/README.md` |

New tests for v0.9 live in `test/style.test.ts` (line weights, dash round-trip, AIA layers, opening cuts), `test/union.test.ts` (GeometryBackend + hatch-as-data), `test/export-dxf.test.ts` (HATCH), `test/elements.test.ts` (computed dims), `test/grid-index.test.ts` + `test/geometry-hostinfo.test.ts` (grid equivalence).

### Deferrals already made in v0.9 (pick these up where relevant)
- **PDF OCG layers (part of T3.2):** deferred — `pdfkit` exposes no optional-content-group API; needs low-level `/OCProperties` + BDC/EMC plumbing. SVG + DXF layers are done.
- **Wall *types* (part of T3.3):** deferred — not in the T3.3 DoD. (IFC `IfcWallType`-style default thickness/material/layer.)

---

## 4b. What shipped — v0.10 (extensible platform), T4.1–T4.5

> **Snapshot rule restored:** v0.10 is **additive/infrastructural** — every existing
> rendered output stays **byte-identical** (the four golden snapshots are the
> tripwire; run without `-u`). The whole phase threads new capability through
> defaulted parameters that collapse to the prior behavior when unused.

| Task | What | Key files |
|---|---|---|
| **T4.1** | **Open, per-call plugin registry.** `createRegistry(plugins)` clones the static `BUILTIN_DEFS` per call (no global mutation → cache-safe). `Registry` (`byKeyword`/`byKind`/`order`) threaded through `parse`/`resolve`/`toScene`; parser `STATEMENT_STARTS` is now per-instance (plugin-aware recovery). `register{Element,Theme,Hatch,Backend}` validators/constructors. **Cache key folds in plugin/theme/backend/hatch/World identity** via process-local `idToken` (`src/identity.ts`). `ElementDef.kind` widened to allow new string kinds. | `src/elements/defs.ts`, `src/registry.ts`, `src/identity.ts`, `src/elements/index.ts`, `src/parser.ts`, `src/ir.ts`, `src/scene-build.ts`, `src/types.ts`, `src/index.ts` |
| **T4.2** | **`World` seam.** `World { read(path): string\|null; now?(): Date }`, `NULL_WORLD`, `makeVirtualWorld`. Threaded into `compile`/`resolve` (`ResolveCtx.now`); CLI builds a real-fs `makeNodeWorld` (the one place Node APIs + wall-clock live). Default no-op → byte-identical. | `src/world.ts`, `src/index.ts`, `src/ir.ts`, `src/registry.ts`, `src/cli.ts`, `src/types.ts` |
| **T4.3** | **Import system.** `import "<spec>": a, b as c \| *` brings a module's **components** into a plan. New `link` phase (the only I/O, behind `World.read`) between parse and resolve: resolves specs (relative `.arch` + namespaced `@local/name:1.0.0`, pure path joins), parses, merges components; cyclic → `E_IMPORT_CYCLE`; missing/unexported/conflict/bad-spec diagnostics. Parser now treats any `name(` as a component call (validated at expand) so imported/forward components resolve. Seeded `examples/lib/{furniture,doors}.arch` + `examples/imports.arch`. | `src/import.ts`, `src/ast.ts`, `src/parser.ts`, `src/index.ts`, `examples/lib/*` |
| **T4.4** | **Theming cascade.** `THEMES` (blueprint/mono/dark/presentation); `theme <name> { … }` named base (+ one-liner); per-element `style <kind> { fill … }`; opt-in `theme from "#color"` HSL poché derivation (zero-dep). Cascade (later wins): default → named base → `theme{}` → `theme from` → per-element `style` → `CompileOptions.theme`. Theme stays **out of the IR** (passthrough to `ResolvedPlan`); one unsanitized merge feeds base + styled themes, sanitize runs once each. Opt-in derivation keeps snapshots byte-identical. | `src/theme.ts`, `src/parser.ts`, `src/ast.ts`, `src/ir.ts`, `src/scene-build.ts`, `src/registry.ts`, `src/index.ts` |
| **T4.5** | **Config sanitization + stage memo.** `sanitizeConfig()` denylist (`__proto__`/`constructor`/`prototype` keys; `<`/`>`/`url(data:` values) on untrusted source theme/style values; trusted `CompileOptions` skip it; theme/style key resolution hardened to own-property checks. FNV-1a stage memos for `lex`/`parse`/`resolve` (registry/World identity in keys; cleared by `clearCache`). ~22× faster reparse (bench). | `src/sanitize.ts`, `src/hash.ts`, `src/parser.ts`, `src/lexer.ts`, `src/ir.ts`, `src/theme.ts`, `src/index.ts` |

New tests: `test/plugins.test.ts`, `test/world.test.ts`, `test/import.test.ts`, `test/theme-cascade.test.ts`, `test/sanitize.test.ts`, `test/stage-cache.test.ts` (48 new; 273 total).

**v0.10 commits on the branch:** `ec3b3d8` T4.1 → `ea8fd09` T4.2 → `be413d2` T4.3 → `02a7609` T4.4 → `75677b3` T4.5 → (release-prep: 0.10.0 + CHANGELOG + this log).

### Deferrals / notes for v0.10 (pick up where relevant)
- **`registerHatch`/`registerTheme` consumption depth:** `registerBackend` is fully per-call wired in scene-build, and `registerTheme` themes are consumed by the T4.4 cascade. `registerHatch` ships as a validated constructor + cache-key identity + `CompileOptions.hatches`, but custom hatches are **not yet threaded** into the SVG/DXF hatch table or wall material validation (that touches `wall.ts` resolve + both backends). Wire it when a real custom-hatch consumer appears.
- **Imports bring components only** (not plan-level `let` value-functions); seed libs are intentionally self-contained (no cross-component calls), so named imports don't need transitive dependency resolution. `@local` is the only supported namespace.
- **Unknown `theme <name>`** is silently treated as `{}` (no diagnostic) — `toScene` has no diagnostics channel, and registered theme names aren't known at resolve.

---

## 4c. What shipped — v0.11 (IDE-grade tooling & DX), T5.1–T5.5

All tooling/internal; the core stayed pure/deterministic/zero-dep and every existing rendered output (SVG/DXF/PDF) is byte-identical.

| Task | What | Key files |
|---|---|---|
| **T5.1** | **Lossless, error-recovering parse tree.** Lexer captures comments as trivia; AST gains an `ErrorNode` statement + `PlanNode.comments`/`bodyStart`; the parser never throws — a malformed header recovers (AST still present) and a broken line emits an `Error` node + diagnostic, keeping the rest. Read-only AST cursor. | `src/lexer.ts`, `src/ast.ts`, `src/parser.ts`, `src/cursor.ts` |
| **T5.2** | **`arch fmt` formatter.** Zero-dep Wadler/Prettier `Doc` IR + `format(source)` (exported): deterministic, idempotent, comment- and semantics-preserving (`compile(x)===compile(format(x))`). CLI `arch fmt [--write]`; returns source unchanged on parse error. | `src/doc.ts`, `src/format.ts`, `src/cli.ts` |
| **T5.3** | **Full LSP.** Hover, completion, go-to-definition, scope-aware rename, signature help — a pure, isomorphic, unit-tested core driven by an append-only `ElementDef.params` schema. The VS Code server delegates to it. | `src/lsp.ts`, `editors/vscode/src/server.ts` |
| **T5.4** | **One grammar source of truth.** `src/grammar/tokens.ts` feeds the parser's statement-start set and generates both editor grammars; CI asserts no drift. | `src/grammar/tokens.ts`, `scripts/gen-grammars.ts` |
| **T5.5** | **Error catalog.** Every `E_*`/`W_*` code with cause/fix/example in `src/error-catalog.ts`; powers `arch explain <CODE>` and the generated `docs/error-codes.md` (CI-checked). | `src/error-catalog.ts`, `scripts/gen-error-codes.ts` |

## 4d. What shipped — v1.0 (polish, ecosystem & launch), T6.1–T6.5

The absolute/"manual" coordinate path stayed byte-identical to v0.11 throughout.

| Task | What | Key files |
|---|---|---|
| **T6.2** | **Relational placement.** `room … right-of\|left-of\|below\|above <ref> [align <edge>] [gap <n>]` resolved to absolute coords by pure arithmetic in topological order — deterministic sugar, NOT an optimizer. Cycles → `E_LAYOUT_CYCLE`, unknown ref → `E_LAYOUT_REF`. Lexer learns `right-of`/`left-of` as compound keywords. | `src/layout.ts`, `src/elements/room.ts`, `src/ast.ts`, `src/ir.ts`, `src/lexer.ts`, `examples/relational.arch` |
| **T6.3** | **PNG backend.** `renderPng(scene)` + `arch -f png` rasterize the SVG via the OPTIONAL, lazy `@resvg/resvg-js` + a **bundled font** (deterministic). Dep absent from the default bundle. | `src/backends/png.ts`, `assets/fonts/`, `tsup.config.ts` |
| **T6.4** | **Visual-regression suite.** `pixelmatch` golden-PNG diffs (threshold 0); refresh with `UPDATE_GOLDENS=1`. Skips when resvg is absent. | `test/visual.test.ts`, `test/__goldens__/` |
| **T6.1** | **Multi-format playground + docs site.** Playground downloads SVG/PNG/DXF/PDF (PNG/PDF via canvas + lazy jsPDF). VitePress `docs-site/` (guide, reference, errors, relational, examples gallery, ADRs) generated from canonical sources. **Both deployed** (see §1). | `playground/`, `docs-site/` |
| **T6.5** | **Workspaces + maintainability.** npm workspaces (core at root + members); `bench --json` + `bench/compare.mjs` informational PR comment in CI; 4 ADRs; JSDoc; `language-reference.md`/`AGENTS.md`/`README.md` reconciled. | root `package.json`, `.github/workflows/ci.yml`, `docs/adr/`, `bench/` |

**Post-1.0 fix (1.0.1):** the lazy optional-dep `import()`s now carry `/* webpackIgnore: true */ /* @vite-ignore */` so downstream webpack/Next.js builds don't choke on a native `.node` binary. **VS Code extension (0.2.0):** rebuilt as an esbuild-bundled, self-contained ~218 KB `.vsix` (core inlined; no `node_modules`/native binaries; grammar included); published as `ChanMeng.archlang` (publisher id is `ChanMeng`, not the npm scope `chanmeng666`; the name `archlang` because `archlang-vscode` is taken by an unrelated extension).

---

## 5. Where to continue (post-1.0)

v1.0 is launched; there is no "next phase" queued. For new work:

- **Roadmap deferrals worth revisiting** (noted in §4): PDF OCG layers, IFC wall *types*, `registerHatch` threading into the hatch table, value-function imports.
- **Release process for the next version:** branch → implement (keep §6 golden rules + determinism) → bump `package.json` → update `CHANGELOG.md` → `npm publish --access public` (account uses auth-only 2FA, so no write-OTP) → tag `vX.Y.Z` + push → bump `archcanvas` to `^X.Y.Z` and verify. For the **VS Code extension**, bump `editors/vscode` + repackage with `npx vsce package --no-dependencies` and upload via the Marketplace web UI (no Azure DevOps org exists; see the memory note).
- **Deployments** redeploy from `playground/`/`docs-site/` builds via the Vercel CLI (scope `she-sharp1`).

---

## 6. How to work (conventions — keep these)

- **Golden rules (roadmap §0):** core stays **zero-runtime-dependency** (optional geometry/PDF/PNG deps must be lazy-`import()`ed; default SVG/DXF path zero-dep). `compile()` is pure/synchronous/isomorphic — no `Date.now()`/`Math.random()`/Node APIs in `src/` except `src/cli.ts`. **Determinism is sacred:** the `compile(s)===compile(s)` test must never break; route numbers through the backend `fmt()`. **Errors are returned, never thrown** for user-source problems (push `Diagnostic`s with a safe default). `CompileResult` is **append-only**. Output is **XSS-safe** — escape interpolated strings/labels at the *serialization* boundary.
- **Per-task loop:** implement → `npm run typecheck` → `npm test` → `npm run build && node dist/cli.js compile examples/parametric.arch -o <scratch>/s.svg` and inspect (use `-f dxf|pdf` for those backends) → **Conventional Commit** ending with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Tests:** snapshot + `fast-check` fuzz + unit. Add a DoD test per task and a determinism assertion for new features. When v0.9+ intentionally changes visuals, update golden snapshots with `npx vitest run test/snapshot.test.ts -u` (and `test/scene.test.ts -u` for the Scene-IR snapshot) — but verify the change is intended.
- **Branch per phase:** `feat/v0.x-<slug>`; merge with `--no-ff` when the phase DoD is met and tests are green. Do not push or publish unless the human asks.
- **Scratch files:** use the session scratch dir, not the repo (CLAUDE.md rule).
- **Pipeline recap:** `lex → parse → resolve(IR) → toScene → backends (SVG default / DXF / PDF)`. Public surface is `src/index.ts` (`compile`, plus `resolve`, `toScene`, `toDxf`, `toPdf`, and the types). The element **registry** (`src/elements/`) is the clean extension point; `ResolveCtx`/`RenderCtx`/`ParseCtx` are the facades.

---

## 7. Quick orientation commands

```bash
cd D:\github_repository\archlang
git branch --show-current          # expect: main (clean, pushed)
npm install && npm test            # expect 371 passing (one install bootstraps all workspaces)
npm run build && node dist/cli.js compile examples/relational.arch -f svg -o out.svg   # relational placement
node dist/cli.js compile examples/studio.arch -f png -o out.png                         # PNG (needs optional resvg)
node dist/cli.js spec              # the whole language in one page (agent-facing)
echo 'plan "X" { units mm room at (0,0) size 4000x3000 label "R" }' | node dist/cli.js describe - --json   # semantic facts
```

For the full current picture read **`AGENTS.md`** (status table + architecture); for the
language read **`docs/language-reference.md`**; for design rationale **`docs/adr/`**.

---

## 8. Post-launch — v1.12.0 (the AI-first release), 2026-07-06

> **This continues the frozen log for one later release.** Sections 1–7 above are the
> v0.7→v1.0 history and are not maintained release-by-release; the per-release story for
> **v1.3 → v1.11** lives in [`CHANGELOG.md`](../CHANGELOG.md) and the `AGENTS.md` status
> block, not here. This entry is added because v1.12.0 is a deliberate *strategic* turn —
> the north star below — worth recording alongside the design rationale in `docs/adr/`.
> As always the core stayed pure/deterministic/zero-dep and **default SVG output is
> byte-identical**; every new output behaviour is opt-in.

**AI-first release (Mermaid-inspired):** make ArchLang maximally discoverable,
self-describing, and distributable for AI agents. Four tranches (see `CHANGELOG.md` for the
full detail):

| Tranche | What | Key files |
|---|---|---|
| **Agent context & diagnostics** | One generated, drift-tested **`llms-full.txt`** (spec + `SKILL.md` workflow + manifest-derived CLI reference + error catalog, ~40 KB), printed by **`arch context`** and served at the docs root as `/llms-full.txt` (llmstxt.org). **`diagnosticToJson` / `DiagnosticJson`** promoted to public API (the CLI's line/col + catalogued-`fix` projection). | `scripts/gen-llms-full.ts`, `src/cli.ts`, `src/diagnostic-json.ts` |
| **Always-visible errors & eval spine** | Opt-in **error-card SVG** — `compile(src, { onError: "svg" })` / `--error-svg` (on `compile`/`preview`/`md`) renders a broken plan as a self-describing card (severity, code, `line:col`, message, fix); default no-bytes path unchanged. Authorability eval **3 → 18 briefs** with hand-verified goldens + an offline **`npm run eval:ci`** gate in CI. | `src/backends/error-svg.ts`, `eval/` |
| **Distribution** | Docs-site ` ```arch ` fences auto-render as live `<ArchLive>` widgets (` ```arch static ` opts out); in-repo **GitHub Action** `.github/actions/arch-render` (render fenced blocks in any repo's Markdown via `arch md`); playground **Copy-for-LLM** button. | `docs-site/`, `.github/actions/arch-render`, `playground/` |
| **Accessibility as a language feature** | `compile(src, { accessible: true })` / `--accessible` → SVG `<title>`/`<desc>` + `role="img"` + `aria-labelledby`, title/caption **derived from `describe()`**; new plan-level keywords **`accTitle` / `accDescr`** override them (`W_DUP_ACC_METADATA` on duplicate, `E_ACC_PLACEMENT` on misplacement). `describe().caption` exposes the derived sentence. Grammar/spec/editor artifacts regenerated. | `src/parser.ts`, `src/scene-build.ts`, `src/backends/svg.ts`, `examples/accessible.arch` |

**Release mechanics.** Core published `@chanmeng666/archlang@1.12.0` (`latest`); the VS Code
extension repacked and republished as `ChanMeng.archlang@0.4.0` (it bundles the core, so the
one language-surface change — `accTitle`/`accDescr` — required a repack); playground and docs
site redeployed. New design docs: **[ADR 0009](adr/0009-ai-first-context-and-distribution.md)**.

**Design north star (why this release exists).** The Mermaid lesson: a tool reaches agents by
**distribution and ingestible context**, not AI-specific machinery. So the bets are (1) one
generated bundle an agent can swallow whole, (2) rendering *wherever agents already write*
(live fences, a GitHub Action, `arch md`) rather than a protocol, and (3) opt-in visual
feedback for failures. The agent surface stays **CLI-first, no MCP** — a CLI costs nothing in
the context window until called; an MCP schema sits there permanently. MCP remains deferred to
a possible hosted/monetize phase.

---

## 9. Post-launch — sites redesign, "The Compile Boundary", 2026-07-10

> **Site chrome only — not a core release.** `@chanmeng666/archlang` stays **1.12.1**; the
> `src/` core had zero changes (the only in-repo source edit was the `scripts/gen-grammars.ts`
> template + its regenerated `playground/src/arch-language.js`; the tmLanguage JSON is
> byte-identical). Recorded here because it is a deliberate identity turn; full rationale in
> **[ADR 0010](adr/0010-compile-boundary-design-system.md)** and `brand/README.md`.

**What shipped.** Both public sites (docs + playground) were rebuilt on one shared design system
that makes "Designs that compile" literal: every surface is split by a visible **compile seam**
into a dark **SOURCE world** (carbon; plum survives only as syntax accent + logo fills) and a
light **SHEET world** (drafting paper, ink, hairlines, title blocks, drafting grid). One shared
**REDLINE** accent (`#c2362b`/`#b3261e`) for attention (CTAs + errors); amber stays advisory.
Type is **Archivo Variable** + **Public Sans Variable** + **IBM Plex Mono**, self-hosted
(`@fontsource`, zero CDN); Space Grotesk / Geist Mono retired from the sites.

| Area | What | Key files |
|---|---|---|
| **Signature hero** | `CompileSeam.vue` — the **real compiler** draws `examples/studio.arch` while source typewrites (line-boundary prefix + auto-balanced `}` → `compile()` ~1.4 ms; parser recovers, keep-last-good SVG). SSR renders the settled final state (hydration-safe); viewBox-locked box → **CLS 0.01**; IntersectionObserver start; `prefers-reduced-motion` → static. | `docs-site/.vitepress/theme/CompileSeam.vue` |
| **Docs theme** | CSS split `theme/{style,home,doc-pages}.css` (tokens + VitePress mapping / landing / inner pages; `.dark` = "mylar film", source world identical in both modes); new `SheetGrid`/`FactsSection`/`TitleBlockFooter`; `ArchLive` restyled as a mini seam. Deleted `BrandHero`, `FlowingLines(.js)`, `FamilyFooter`. | `docs-site/.vitepress/theme/` |
| **Playground** | Header rebuilt as one row of title-block cells; **fixed two-world layout, no light/dark toggle**; editor = dark source world, preview = paper sheet + drafting grid; `src/style.css` → `styles/{tokens,chrome,editor,panels,embed}.css`; syntax colors now flow through `gen-grammars.ts` as `var(--syn-*)`. | `playground/index.html`, `playground/src/styles/` |
| **Token lockstep** | The brand token block is **duplicated byte-identically** (no shared import — two build systems) in `docs-site/.vitepress/theme/style.css` **and** `playground/src/styles/tokens.css`. | (both files) |

**Bug fixes surfaced in the rebuild.** A shipped duplicate `id="format"` (select + button) meant
the playground **Format button never worked since it shipped** — the reformat control is now
`id="formatSrc"` and live. Both sites added `<meta name="color-scheme" content="light dark">` +
`robots.txt` (opting out of Chromium Auto Dark Mode, which had force-darkened a user's rendering).

**Accessibility.** **Lighthouse 100/100/100** (a11y/BP/SEO) on both sites; AA contrast on both
worlds/modes; real heading hierarchy + `role=main`; reduced-motion honored.

**Release mechanics.** Core untouched (no npm publish). VS Code extension bumped to
**`ChanMeng.archlang@0.4.1`** (icon-only repack: `images/icon.png`, dark gallery banner;
`.vsix` packaged & validated — **manual Marketplace upload still pending**, listing is 0.4.0).
`brand/README.md` gained a "The sites' design system" section. New design doc:
**[ADR 0010](adr/0010-compile-boundary-design-system.md)**.

**Hard-won engineering lessons** (also in `AGENTS.md` gotchas + ADR 0010 consequences): a partial
`:global(.dark) …` selector inside a Vue `<style scoped>` block miscompiles to a bare `.dark {…}`
rule (once inverted the whole site) — use a separate unscoped block; VitePress `.vp-doc a:hover`
(0,2,1) outranks a two-class rule (0,2,0) on hover — re-assert `color` in `:hover` and verify
interactive states; a mode-flipping token (`--redline`) is unsafe on ground that doesn't flip (the
fixed carbon terminal / dark bands) — use a fixed hex there.
