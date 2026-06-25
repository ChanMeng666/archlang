# ArchLang v0.7→v1.0 — Implementation Work Log & Handoff

> **Purpose.** This is a session-to-session handoff. A fresh Claude Code session
> should read **this file first**, then the roadmap
> [`docs/IMPLEMENTATION-PLAN-v0.7-v1.0.md`](./IMPLEMENTATION-PLAN-v0.7-v1.0.md),
> then continue the **remaining tasks** from where this log stops. It records
> exactly what has shipped, the git state, the conventions to keep, and where to
> pick up.

_Last updated after: v0.9 **T3.1–T3.7 complete** + release-prepped to **0.9.0** (built, tested, NOT published)._

---

## 1. TL;DR — status

- **v0.7 (Scene IR):** shipped before this work began (commit `5974d23`, released 0.7.0).
- **v0.8 (full scripting language, T2.1–T2.8):** ✅ **COMPLETE and merged to `main`.** Version bumped to **0.8.0**. **Not yet published to npm.**
- **v0.9 (CAD fidelity, T3.1–T3.7):** ✅ **COMPLETE** on branch `feat/v0.9-cad-fidelity` (not merged to `main`). Version bumped to **0.9.0**, CHANGELOG written. **Not yet published to npm; `archcanvas` not touched.**
- **v0.10 / v0.11 / v1.0:** not started.
- **Tests:** **225 passing** (was 204 at the v0.9 checkpoint), typecheck + build clean, all examples deterministic (with the optional geometry engine present AND absent).

---

## 2. Git state (read carefully before doing anything)

- **Default branch:** `main`. **Current working branch:** `feat/v0.9-cad-fidelity`.
- `main` contains **v0.8** and is **~10 commits ahead of `origin/main`** — **nothing has been pushed** (push only when the human asks).
- `feat/v0.9-cad-fidelity` is `main` + 3 commits (T3.1–T3.3), **not merged**.
- **`package.json` version is `0.8.0`** (v0.9 release prep not done yet).
- **Nothing is published to npm** (publish needs the human's 2FA OTP). **`archcanvas` was not touched** (its system prompt still needs teaching the v0.8 constructs — pending the human's go-ahead).
- A harmless CRLF/autocrlf artifact may show `test/__snapshots__/*.snap` as modified; check `git diff --ignore-all-space` before worrying.

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

## 5. Remaining work — START HERE

Implement strictly in roadmap order; each task is gated by its DoD (roadmap §6 for v0.9, §7–§9 for v0.10–v1.0).

### v0.9 — ✅ COMPLETE (T3.1–T3.7 + release prep). Awaiting the human's go-ahead to:
1. **Merge** `feat/v0.9-cad-fidelity` → `main` (`--no-ff` when ready).
2. **Publish** `npm publish --access public` (needs the human's npm 2FA OTP), then tag `v0.9.0` + `git push --tags`.
3. **Consumer bump** `archcanvas` to `^0.9.0` (`npm install`, `npx tsc --noEmit`, `npm run build`); optionally expose layers/linetypes/hatch params to its system prompt. Do NOT push `archcanvas main` unless asked.

(Done this phase: T3.4 GeometryBackend + clipper2-wasm, T3.5 data-driven hatches + DXF HATCH, T3.6 computed dims, T3.7 spatial grid index. The earlier "OPEN DECISION" on clipper2-wasm was resolved with the human: install it as an optional dep.)

### START HERE next: v0.10 (platform), then v0.11 (tooling/DX), v1.0 (launch)
See roadmap §7, §8, §9. Highlights: open registry + plugins (T4.1), `World` seam + imports/packages (T4.2–T4.3), theming cascade + config sanitization + stage memo (T4.4–T4.5); lossless/recoverable parse tree, `arch fmt`, full LSP, one-grammar-source, error catalog (T5.x); docs site + deployed playground, relational placement, PNG backend, visual-regression, workspaces (T6.x). Each phase ends with a release + (version-only) consumer bump.

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
git branch --show-current          # expect: feat/v0.9-cad-fidelity
git log --oneline -5               # see T3.1–T3.3
npm install && npm test            # expect 204 passing
npm run build && node dist/cli.js compile examples/studio.arch -o out.svg   # see cut walls + AIA layers
```

Then open the roadmap §6 (T3.4 onward) and continue.
