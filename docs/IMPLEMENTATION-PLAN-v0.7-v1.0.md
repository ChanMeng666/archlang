# ArchLang Optimization — Detailed Implementation Plan (v0.7 → v1.0)

> **Audience:** a fresh Claude Code session executing this plan task-by-task with **no prior conversation context**. Read §0, §1, §2 first, then implement phases in order. Each task has a **Definition of Done (DoD)**; do not move on until it's met. This plan is the successor to `docs/IMPLEMENTATION-PLAN.md` (which delivered v0.2→v0.5 and is now shipped); it carries the same golden rules and per-task discipline.

> **Provenance:** this roadmap was produced by deeply studying how comparable "new language → professional output" projects are built — **Typst** (source-level: `frame.rs`, `value.rs`, `typst-syntax`, `comemo`), **Mermaid** (`diagram-api` registry, Langium, config/theming), **D2** (`d2compiler`, `d2target`, pluggable layout), **Penrose** (constraint layout), **Clipper2** (CAD geometry), and **Prettier/Lezer/tree-sitter** (formatter + grammar tooling) — and mapping each lesson onto ArchLang's actual code. §3 lists exactly what to borrow from each and which upstream files to consult.

---

## 0. How to use this plan

- **Repo:** `D:\github_repository\archlang` (the language). Consumer product: `D:\github_repository\archcanvas` (a Next.js app importing the published package — only touch it in the "consumer bump" step of each release).
- **Package:** published to npm as `@chanmeng666/archlang` (public, MIT). GitHub `ChanMeng666/archlang`, default branch `main`. Current version **0.6.0**.
- **Cold-session setup:** `cd D:\github_repository\archlang && npm install && npm test` (expect all green) and `npm run build`. Skim `AGENTS.md`, `docs/IMPLEMENTATION-PLAN.md` (the prior plan, for conventions), and `docs/language-reference.md`.
- **Optional reference study:** clone the upstream repos named in §3 into `D:\.claude-scratch\<YYYY-MM-DD>\archlang-refs\` and read **only** the specific files cited there (e.g. Typst `crates/typst-library/src/layout/frame.rs`). Do not vendor any upstream code.

### Golden rules (do not violate — carried from the prior plan, with this roadmap's two new decisions)
1. **Core stays zero-runtime-dependency.** `dependencies: {}`. New power (geometry engine, PDF, PNG, image libs) goes under `optionalDependencies`/`peerDependencies` and **must be lazy-`import()`ed** so the core never hard-requires it — exactly how `src/export/pdf.ts` loads `pdfkit` today. ✅ *Decision for this roadmap: optional lazy-loaded deps ARE allowed for hard geometry/raster (Clipper2, PNG). The default SVG path must still run with zero deps.*
2. **`compile()` is pure, synchronous, isomorphic (Node + browser).** No `Date.now()`/`Math.random()`/`new Date()` and no Node-only APIs in `src/` except `src/cli.ts`. All environment access (file reads for imports, "now") goes through the **`World`** seam introduced in Phase 4.
3. **Determinism is sacred.** Same source ⇒ byte-identical output. Route number formatting through `fmt()`. The test asserting `compile(s) === compile(s)` must never break. ✅ *Decision for this roadmap: the full scripting language must stay **expand-time and pure** — `for`/`if`/`while` expand into the element stream at `resolve` (no runtime), iteration order is fixed, built-ins are a frozen pure map, no I/O, no wall-clock. Integer-mm coords (already grid-snapped) feed the optional geometry engine so its output is stable.*
4. **Errors are returned, never thrown** for user-source problems. Phase 5 extends this *into the parser* (recover; never bail on first error).
5. **`CompileResult` is append-only.** Keep `{ svg, errors, warnings, diagnostics, ast }`; you may ADD fields (`scene`, `dxf`, `png`) but never remove/rename.
6. **Output stays XSS-safe.** Escape interpolated strings/labels at the *serialization* boundary; keep the SVG element/attribute allowlist; add a final whole-SVG scrub as defense-in-depth (Phase 4).

### Per-task workflow
Make the change → `npm run typecheck` → `npm test` → for visual changes `npm run build && node dist/cli.js compile examples/studio.arch -o <scratch>/s.svg` (and `-f dxf|pdf|png`) and open it → commit with a Conventional Commit (`feat:`/`fix:`/`refactor:`/`test:`/`docs:`) ending with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

### Branching & release (per phase)
Work each phase on `feat/v0.x-<slug>`; merge when the Phase DoD is met and tests are green. Then: bump `version` in `package.json`, update `CHANGELOG.md` (Keep a Changelog), `npm run build && npm test`, `npm publish --access public` (human supplies npm 2FA OTP), tag `v0.x.0`, `git push --tags`. **Consumer bump:** set `@chanmeng666/archlang` to `^0.x.0` in `archcanvas`, `npm install`, `npx tsc --noEmit`, `npm run build`; do not push `archcanvas main` (auto-deploys) unless explicitly asked.

---

## 1. Current state primer (ArchLang v0.6.0)

A ~2,400-line, zero-dep, deterministic, isomorphic compiler. Pipeline: **lex → parse → resolve(IR) → render(SVG)** + optional DXF/PDF. Registry-driven elements; Rust/Typst-quality diagnostics; snapshot + property tests; LSP (diagnostics only); Vite+CodeMirror playground; TextMate grammar.

```
src/
  index.ts      compile(source, opts?) => { svg, errors, warnings, diagnostics, ast }. Memo cache (Map,
                64 entries, key = JSON.stringify([source, width, theme]) at index.ts:51). Pipeline at
                index.ts:76-95: parse → resolve → render; render aborts (svg="") iff any error-severity diag.
                Also exports resolve, toDxf, toPdf (not part of compile()).
  lexer.ts      Hand-written. Token carries byte spans {start,end} + line/col. TokenTypes incl. lparen/
                comma/star/slash/percent/arrow/dimension/…
  parser.ts     Recursive-descent. Per-statement error recovery (synchronize to next stmt); collects all
                diagnostics; returns {plan?, diagnostics}. Plan loop dispatches elements via the registry.
  ast.ts        PlanNode{name,units,grid,scale?,north,body:Statement[],components,title?,theme?}; Statement
                = let | instance | AstElement; ExprPoint{x:Expr,y:Expr}; nodes carry span.
  expr.ts       Expr = num | ref | unary | bin (ARITHMETIC ONLY). Env = Map<string, number> (expr.ts:18).
                Pratt parseExpr; evalExpr(e, env, onError) => number (div-by-zero/unknown-ref → diagnostic,
                yields 0). closest()/levenshtein() for "did you mean".
  ir.ts         resolve(ast) => { ir: ResolvedPlan, diagnostics }. expandScope() (ir.ts:120) flattens
                lets + inlines component instances into a flat element stream; assigns ids in registry
                order; resolves walls-first so openings host. ResolvedElement = RWall|RRoom|RDoor|RWindow|
                RFurniture|RDim|RColumn. O(n²) room-overlap + per-opening host scan (one-entry memo).
  registry.ts   ElementDef{kind,keyword,parse,idPrefix,resolve,bounds,render}. RenderOp = { pass, svg }
                (registry.ts:35 — OPAQUE SVG STRINGS). RENDER_PASSES ordered layers. Parse/Resolve/Render
                facades (ParseCtx/ResolveCtx/RenderCtx).
  elements/     wall,room,door,window,furniture,dim,column — each an ElementDef; index.ts registers them
                (registryOrder + Map). Adding an element = one module + one register line.
  render.ts     render(ir,opts) => svg string. Theme merge + sanitize; fmt()/xml(); poché <pattern>;
                walls special-cased (orthogonal → rectUnionOutline; angled → per-segment, hence seams);
                northArrow/scaleBar/titleBlock.
  geometry.ts   vec ops; distPointToSegment; segmentRectangle (square-capped offset); hostInfoForWalls;
                rectCorners; segmentsOfWall.
  geometry/union.ts  rectUnionOutline — sweep-line boolean UNION of AXIS-ALIGNED rectangles ONLY.
  hatches.ts    material → SVG <pattern> (poche/concrete/brick/insulation/tile/none); hardcoded geometry.
  theme.ts      DEFAULT_THEME (~18 color keys + lineWeight + font); 3-layer merge; sanitizeTheme (XSS).
  export/dxf.ts  toDxf(resolve(ast).ir) => ASCII DXF R12. RE-DERIVES geometry (emitDoor/emitWindow/emitDim
                 recompute arcs/panes/ticks — DUPLICATES wall.ts/door.ts). Y-flip; LAYER table.
  export/pdf.ts  toPdf(svg) => Uint8Array via lazy pdfkit + svg-to-pdfkit (SVG RASTERIZATION, not vector).
  cli.ts        arch compile/watch <in.arch> [-o out] [-w width] [-f svg|dxf|pdf].
editors/vscode/   extension.ts + server.ts (LSP: diagnostics only) + diagnostics.ts (pure mapping).
editors/archlang.tmLanguage.json   TextMate grammar (hand-synced to lexer; verified by test/grammar.test.ts).
playground/       Vite + CodeMirror 6; src/arch-language.js StreamLanguage MIRRORS src/lexer.ts; linter calls
                  compile().diagnostics. (Not deployed.)
test/             19 files: snapshot, compile, grammar (real TextMate), diagnostics, lang, lsp-diagnostics,
                  expr, elements, cache, fuzz (fast-check), union, geometry-hostinfo, doors, windows-
                  furniture, gridsnap, export-dxf, export-pdf, security, theme.
docs/             IMPLEMENTATION-PLAN.md (prior), language-reference.md (needs v0.4+ catch-up).
.github/workflows/ci.yml   typecheck + test on Node 18/20.
```

**Three structural facts that drive this roadmap:** (a) `RenderOp` carries SVG *strings*, so backends duplicate geometry and PDF is rasterized; (b) `Value === number`, so the DSL is a calculator; (c) the element registry is the one clean extension point but is *closed* (central `register` list) and there is no plugin/import/World seam.

---

## 2. Target architecture (end state after v1.0)

```
source
 ─▶ lex       tokens carry byte spans; keyword/operator table from ONE source (src/grammar/tokens.ts)
 ─▶ parse     → lossless CST + typed AST views + Diagnostic[]   (never throws; recovers to next stmt)
 ─▶ resolve   → semantic IR (ResolvedPlan): evaluate Values (num/bool/str/arr/fn), expand for/if/while
                + components, apply set-rules, resolve relational placement, assign ids, host openings
 ─▶ layout    → geometry: wall offset+union (core rectilinear │ optional Clipper2 for angled),
                openings VOID walls, spatial-grid hosting/overlap (O(n) not O(n²))
 ─▶ scene     → Scene IR: positioned primitives {polyline,polygon,line,arc,circle,text,hatch}
                each tagged {layer, lineWeight, lineType, paint}   ★ KEYSTONE — backend-neutral
 ─▶ backends  SVG (default, <g> per layer) · DXF (LAYER/LTYPE/HATCH) · PDF (vector + OCG layers) · PNG
                — all PURE serializers of Scene; geometry defined exactly once
```

Side channels on the same core: `format(source)→source` (formatter over the CST); the LSP consumes CST + diagnostics + the registry's parameter schemas; `World` abstracts file reads for `import`/packages; an **open registry** lets third parties add elements/backends/hatches/themes via `compile(src, { plugins })`.

**Core new types introduced (forward reference):**
```ts
// src/scene.ts (Phase 1)
export type Paint = { fill?: string; stroke?: string; width?: number; dash?: [number, number]; opacity?: number };
export type LineWeight = "heavy" | "medium" | "thin" | "extraThin";              // Phase 3
export type LineType   = "continuous" | "dashed" | "center" | "hidden";          // Phase 3
export type ScenePrim =
  | { t: "polyline"; pts: Point[]; closed: boolean }
  | { t: "polygon";  pts: Point[] }
  | { t: "line";     a: Point; b: Point }
  | { t: "arc";      center: Point; r: number; a0: number; a1: number; ccw: boolean }
  | { t: "circle";   center: Point; r: number }
  | { t: "text";     at: Point; value: string; size: number; anchor: "start"|"middle"|"end" }
  | { t: "hatch";    region: Point[]; pattern: string; scale: number; angle: number; origin?: Point };
export interface SceneNode { layer: RenderPass; prim: ScenePrim; paint: Paint;
                             lineWeight?: LineWeight; lineType?: LineType; layerName?: string; span?: Span }
export interface Scene { width: number; height: number; nodes: SceneNode[] }

// src/expr.ts (Phase 2) — Value generalizes from `number`
export type Value = { t:"num"; v:number } | { t:"bool"; v:boolean } | { t:"str"; v:string }
                  | { t:"arr"; v:Value[] } | { t:"fn"; params:string[]; body:Expr; closure:Env };

// src/geometry/backend.ts (Phase 3)
export interface GeometryBackend { union(p:Point[][]):Point[][]; difference(a:Point[][],b:Point[][]):Point[][];
                                   offset(path:Point[], delta:number, join:"miter"|"bevel"|"round"):Point[][] }

// src/world.ts (Phase 4)
export interface World { read(path:string): string | null; now?(): Date }

// src/doc.ts (Phase 5) — Wadler/Prettier Doc IR builders: group/indent/line/softline/hardline/join/ifBreak
```

---

## 3. Reference material studied (what to borrow, and where to look)

| Project | Consult these upstream files/modules | Borrow → Phase |
|---|---|---|
| **Typst** (`typst/typst`) | `crates/typst-library/src/layout/frame.rs` (`Frame`/`FrameItem`); `crates/typst-library/src/foundations/value.rs` (`Value`); `crates/typst-syntax/src/{node,ast}.rs` (lossless CST + typed overlay + error nodes); `docs/dev/architecture.md` (the `World` trait); scripting docs (`if`/`for`/`while`, closures, `set`/`show`, packages) | Scene IR (P1); Value+control-flow (P2); CST/recovery + World + imports + set-rules (P4–P5) |
| **`typst/comemo`** | `README.md` (constrained memoization via `#[track]`/`Tracked`) | *Cheap 20% only:* content-hash stage caches (P4). Full constraint engine = out of scope. |
| **Mermaid** (`mermaid-js/mermaid`) | `packages/mermaid/src/diagram-api/*` (`registerDiagram`, external diagrams, `detectType`); `langium-config.json` (one grammar → TextMate/Monarch/Prism); config `sanitize()` + theme variables | Open registry (P4); one-grammar-source-of-truth (P5); config/theme cascade + sanitization (P4) |
| **D2** (`terrastruct/d2`) | `d2graph/layout.go` (`LayoutGraph func(ctx,*Graph) error`); `d2target/*` (flat pointer-free render target); `d2compiler` (AST→IR); resilient parser (always AST + []error) | Pluggable-layout seam (P6); pure-backends-from-flat-target (reinforces P1); parser-always-returns-AST (P5) |
| **Penrose** (`penrose/penrose`) | constraints/objectives reference (`above`/`below`/`leftwards`/`near`/`align`; `ensure`/`encourage`) | Relational-placement *vocabulary* only, resolved deterministically (P6). Optimizer = out of scope. |
| **Clipper2** (`AngusJohnson/Clipper2`) | `ClipperOffset`/`InflatePaths` (offset: `JoinType{Miter,Bevel,Round}`, `EndType`); integer-coord robustness | Optional geometry backend (P3). TS port `clipper2-ts` / `Clipper2-WASM`. |
| **Prettier / Wadler** | Prettier "technical details" (Doc IR: `group/indent/line/ifBreak`); Wadler "A prettier printer" | `arch fmt` formatter (P5) |
| **Lezer / tree-sitter** | Lezer guide (error recovery); `highlights.scm` / `styleTags` (one grammar drives highlighting) | Parser recovery posture + single-source highlighting (P5). Do NOT migrate parser — keep hand-written. |

---

## 4. PHASE v0.7 — Backend-neutral **Scene IR** (the keystone) · *professional + maintainable*

**Goal.** Insert a positioned-primitive drawing IR between `resolve` and the backends so geometry is defined **once** and every backend is a thin serializer. Unblocks layers, line types, vector PDF, and PNG (Phase 3); kills the DXF geometry duplication; is the substrate `set`-rules retarget onto (Phase 2).

**Why first.** `RenderOp = { pass, svg }` (`registry.ts:35`) is opaque SVG; `export/dxf.ts` re-derives door arcs / window panes / dim ticks; `export/pdf.ts` rasterizes SVG. Everything visual is blocked on this.

- **T1.1 — Define the Scene IR.** New `src/scene.ts` with `Paint`, `ScenePrim`, `SceneNode`, `Scene` (see §2; omit `lineWeight`/`lineType`/`layerName` for now — add in Phase 3). Flat node list (no nested transforms — ArchLang has none; that part of Typst's `Frame` is overkill). **DoD:** types compile; a doc comment cites Typst `frame.rs` / D2 `d2target`.
- **T1.2 — Switch the element contract to primitives.** In `registry.ts` change `ElementDef.render` to return `SceneNode[]`; replace `RenderCtx`'s SVG-string helpers with primitive constructors (keep `fmt`, `theme`, `sizes`, `bounds`). Keep `RENDER_PASSES` as the `SceneNode.layer` discriminant (preserves deterministic draw order). **DoD:** interface compiles; `RenderOp` removed or aliased.
- **T1.3 — Port each element to emit primitives.** Rewrite `src/elements/*.ts` `render()` to return primitives instead of SVG strings. `door.ts` emits **one** `arc` + `line` (swing math lives here once); `dim.ts` emits ticks/line/text primitives; walls emit polygons; rooms/furniture/columns emit polygon + text. **DoD:** every element returns `SceneNode[]`; no SVG strings remain in `elements/`.
- **T1.4 — Lower IR → Scene.** New `src/scene-build.ts` (`toScene(ir, opts): Scene`): iterate `registryOrder`, call each `render`, bucket by pass, compute width/height/bounds (lift the sizing math from `render.ts`). Move the wall special-casing (orthogonal union vs per-segment) here so walls also become primitives. **DoD:** `toScene` reproduces today's geometry; golden Scene snapshot test added.
- **T1.5 — SVG backend = pure serializer.** New `src/backends/svg.ts` (`renderSvg(scene, opts): string`): pattern-match `ScenePrim` → `<polygon>/<line>/<path A…>/<text>`; keep `fmt()` + XSS escaping + northArrow/scaleBar/titleBlock chrome. `render.ts` becomes a thin re-export. **DoD:** all existing SVG snapshots byte-identical (the regression guard).
- **T1.6 — DXF backend = pure serializer; delete duplication.** Rewrite `src/export/dxf.ts` as `toDxf(scene)`: generic `arc→ARC`, `line→LINE`, `polygon→LWPOLYLINE/LINEs`, `text→TEXT` (Y-flip applied uniformly). **Delete `emitDoor`/`emitWindow`/`emitDim`.** **DoD:** `test/export-dxf.test.ts` passes; a test asserts no arc/swing math remains in `backends/dxf.ts`; door geometry provably shares the element code path.
- **T1.7 — PDF backend = true vector.** Rewrite `src/export/pdf.ts` to walk the `Scene` into vector PDF (still via lazy `pdfkit`, but emitting real paths/arcs/text — no SVG round-trip). **DoD:** PDF text is selectable and strokes are vector (not a raster image); `test/export-pdf.test.ts` updated.
- **T1.8 — Wire pipeline + result.** `src/index.ts`: `parse → resolve → toScene → renderSvg`; add `scene` to `CompileResult` (append-only). **DoD:** `compile()` unchanged externally; all 19 test files green; determinism test green.

**Phase DoD & release.** One IR → SVG/DXF/PDF with geometry defined once; vector PDF; byte-identical SVG. Add `CHANGELOG` "Scene IR + vector PDF; DXF dedup". **Release v0.7.0** + consumer bump (version only).

---

## 5. PHASE v0.8 — **Language Mk2: full small scripting language** · *elegant + usable*

**Goal.** Promote the arithmetic calculator to a real (still pure, still deterministic, expand-time) language: values, control flow, functions, arrays, string interpolation, built-ins, and scoped `set` rules.

**Why now.** `Value === number` is the root cause of "no loops/conditionals/functions/arrays/strings". Built on Phase-1's stable rendering. Borrow Typst `value.rs` + scripting; keep numbers unitless mm (do NOT port `Length`/`Ratio`/`Angle` — one unit, overkill).

- **T2.1 — Generalize `Value`.** `src/expr.ts`: replace `number` with the `Value` union (§2); `Env = Map<string, Value>`. `evalExpr` returns `Value`; add type-mismatch + div-by-zero diagnostics (errors-as-data; yield a safe default). Update `ir.ts`/`registry.ts` call sites (`eval`/`evalPt` coerce `num` Values to numbers, diagnosing non-numbers). **DoD:** existing expr tests pass with `Value` wrapping; type-mismatch test added.
- **T2.2 — Grow the expression grammar.** `src/lexer.ts`: add tokens `< > <= >= == != ! && ||`, `..`, `[` `]`. `src/expr.ts`: extend the Pratt parser with comparisons, logical ops, `if … else` **expression**, array literals `[a,b]`, ranges `a..b`, indexing `arr[i]`, calls `f(args)`, and string interpolation `"...{expr}..."`. **DoD:** precedence tests; each construct has a unit test.
- **T2.3 — Control flow as expand-time statements.** `src/ast.ts`: add `For`/`If`/`While` statements. `src/ir.ts` `expandScope` (ir.ts:120): expand `for x in <arr|range> { … }`, `if <cond> { … } else { … }`, bounded `while` into the flat element stream — mirroring how `instance` inlines today (ir.ts:140-162). Deterministic, no runtime; cap `while` iterations with a diagnostic. **DoD:** `for i in 0..3 { column at (i*600,0) size 300x300 }` renders 3 columns; if/else + bounded-while tests; determinism green.
- **T2.4 — Formalize the scope chain.** Replace the three-env pattern in `expandScope` with an explicit `Scope { names: Map<string,Value>; parent?: Scope }` (clear shadowing; component body = child of global + params). **DoD:** shadowing test; redefinition (`E_REDEF`) still caught; behavior unchanged for existing examples.
- **T2.5 — User value-functions / closures.** `let area(w,h) = w*h` parses to a `fn` Value evaluated by `evalExpr`; keep `component` as the "returns elements" form. **DoD:** closure capturing an outer `let` works; arity-mismatch diagnostic.
- **T2.6 — Built-ins.** New `src/builtins.ts`: a frozen `Map<string,(Value[])=>Value>` — `min,max,abs,sqrt,floor,ceil,round,len,str`. Injected into the global scope. **DoD:** each built-in tested; calling unknown fn → diagnostic with hint.
- **T2.7 — `set` rules (subset).** `set door(swing: out)` overrides defaults for subsequent `door`s in scope; folds into `expandScope` as a scoped default-map merged into each element's args before resolve. (Skip `show`/selectors — no text content to match.) **DoD:** a `set` changes later elements only within its scope; test.
- **T2.8 — String-interpolated labels + docs.** `label "Bed {i}"` works; interpolation escaped at serialization (XSS rule). Expand `docs/language-reference.md` (Values, control flow, functions, arrays, `set`); add `examples/parametric.arch` exercising all of it. **DoD:** docs updated; example renders.

**Phase DoD & release.** Plans are parametric/DRY with values, loops, conditionals, functions, arrays, and scoped defaults — all pure/deterministic. **Release v0.8.0** + consumer bump: teach `archcanvas`'s system prompt the new constructs (additive; verify one live generation).

---

## 6. PHASE v0.9 — **Professional CAD fidelity** · *professional*

**Goal.** Output that reads as a real drawing: layers, line-weight hierarchy + line types, openings that truly cut walls, clean angled joinery, data-driven hatches, self-consistent dimensions, sub-linear geometry.

**Why now.** Needs the Scene IR (Phase 1) for style metadata and the value language (Phase 2) for hatch/material params. This is where the optional-deps decision pays off.

- **T3.1 — Style metadata on the Scene.** Add `lineWeight`/`lineType`/`layerName` to `SceneNode` (§2). SVG → `stroke-width` (from weight→mm via theme) + `stroke-dasharray` (from line type); DXF → `LTYPE` table (emitted **before** `LAYER`) + group codes `6`/`8`. **DoD:** a dashed/center line round-trips to SVG and DXF; weights map to a named ramp.
- **T3.2 — AIA layers.** Map element kinds → standard names (`wall→A-WALL`, `door→A-DOOR`, `window→A-GLAZ`, `dim→A-ANNO-DIMS`, labels→`A-ANNO-TEXT`, furniture→`A-FURN`, column→`A-COLS`). SVG wraps each layer in `<g id inkscape:groupmode="layer">`; DXF `LAYER` table uses these (color group `62`); PDF uses **OCG** optional-content groups. **DoD:** SVG has per-layer `<g>`; DXF/PDF layers toggle in a viewer.
- **T3.3 — Openings VOID walls (IFC void/fill model).** `RWall` gains `openings: Ref[]`; resolving a door/window registers an explicit opening on its host wall (replaces nearest-segment guesswork). Geometry pass computes `wallSolid = Difference(offset(centerline,t/2,miter), ⋃ openingRects)`. Add wall *types* carrying default thickness/material/layer (nod to `IfcWallType`). *(Borrow only void/fill + wall-type from IFC; full schema out of scope.)* **DoD:** a door visibly cuts its wall in SVG/DXF; orthogonal case works zero-dep.
- **T3.4 — Optional `GeometryBackend` seam.** New `src/geometry/backend.ts` (§2). **Core pure path:** generalize `geometry/union.ts` `rectUnionOutline` to a true integer **rectilinear** boolean (covers common case + orthogonal opening cuts, zero-dep). **Optional adapter** `src/geometry/clipper.ts` over `clipper2-wasm` (under `optionalDependencies`), **lazy-`import()`ed only** when a wall has a non-axis-aligned segment, an opening must be cut on an angled wall, or cavity walls are requested; feed integer mm coords; fall back to per-segment if absent. **DoD:** angled T/L junctions render seamless with the engine present; deterministic with engine present AND absent; engine absent from default bundle (build-size check).
- **T3.5 — Hatch as data.** New named hatch library (`src/hatches.ts` → ANSI31-style entries) emitting the `hatch` primitive `{patternName,scale,angle,origin}`. SVG bakes scale→tile size, angle→`patternTransform`; DXF emits a real `HATCH` entity (hatches finally survive to CAD). DSL sugar `material poche scale 1.5 angle 30`. **DoD:** scale/angle change output deterministically; DXF HATCH validates.
- **T3.6 — Computed dimensions.** When `dim` has no explicit `text`, compute length from `|to−from|` (or a referenced wall/room edge) and format via `fmt()`. **DoD:** a `dim` with no text shows the measured value; matches geometry.
- **T3.7 — Spatial grid index.** New `src/geometry/grid-index.ts`: uniform-grid bucket index; rewrite `hostInfoForWalls` and the room-overlap loop (ir.ts:264) to query overlapping cells (~O(n)). Add `bench/` 1000-element plan. **DoD:** bench shows near-linear hosting/overlap; results identical to the O(n²) path (property test).

**Phase DoD & release.** Angled walls seamless; openings cut walls; per-layer SVG; DXF with layers/linetypes/hatches; vector PDF with OCG layers; near-linear geometry. **Release v0.9.0** + consumer bump (optionally expose layers/linetypes to `archcanvas`).

---

## 7. PHASE v0.10 — **Extensible platform** · *extensible*

**Goal.** Open the closed parts (registry, themes) and enable cross-file reuse (imports/packages) via a clean `World` seam.

**Why now.** The Scene IR (backends to register) and the value language (things worth importing) exist. Borrow Mermaid `registerDiagram` + config/theming; Typst `World` + packages.

- **T4.1 — Open the registry.** `src/registry.ts`: export `registerElement`, `registerBackend`, `registerHatch`, `registerTheme`. `compile(src, { plugins?: ElementDef[] })` merges extras into a **per-call** registry (no global mutation → cache-safe); add plugin identity to the cache key (`index.ts:51`). Built-ins stay statically imported (zero extra core deps; bundler-visible — do NOT use filesystem auto-import). **DoD:** a third-party element compiles via `{ plugins }` with zero core edits; cache key reflects plugins.
- **T4.2 — `World` seam.** New `src/world.ts` (`{ read, now? }`, §2). Thread through `compile()`; Node supplies real `fs`, browser a virtual map; tests inject a frozen `World`. **DoD:** `compile` accepts an optional `World`; default no-op preserves current behavior; determinism via injected `now`.
- **T4.3 — Package / import system.** New `src/import.ts`: `import "lib.arch": bed, sofa` (named items, `*`, `as`) and namespaced `@local/office-kit:1.0.0`, resolved through `World`. Borrow Typst's spec shape verbatim. Seed standard libraries (`furniture`, `doors`) as importable `.arch` files under `examples/lib/`. **DoD:** import works in Node and browser (virtual-FS test); cyclic import → diagnostic.
- **T4.4 — Theming cascade.** `src/theme.ts`: ship `THEMES: Record<string,Partial<Theme>>` (`blueprint`, `mono`, `dark`, `presentation`); DSL `theme blueprint { wall #000 }` = named base + overrides; **per-element style overrides** (`style room { fill … }` / inline) resolved element→theme→default; **derive** poché tints from one wall color (deterministic HSL, zero-dep). Keep theme OUT of the IR (re-theming never re-resolves). **DoD:** named themes + per-element overrides render deterministically; one-line theme looks finished.
- **T4.5 — Config sanitization + stage memo.** Route untrusted `.arch` config through `sanitizeConfig()` denylist (`__proto__`, `<`/`>`, `url(data:`); trusted `CompileOptions` skip it. Add content-hash caches for `lex→tokens`, `parse→ast`, `resolve→ir` (the cheap 20% of `comemo`). **DoD:** prototype-pollution test blocked; stage caches speed LSP reparse (bench); determinism intact.

**Phase DoD & release.** Third parties extend elements/backends/hatches/themes without forking; cross-file imports work; named/overridable themes. **Release v0.10.0** + consumer bump.

---

## 8. PHASE v0.11 — **IDE-grade tooling & DX** · *usable + maintainable*

**Goal.** A formatter, a full LSP, one grammar source of truth, and an error catalog.

**Why now.** Needs a lossless, error-recovering parse tree and the registry's parameter schemas (Phase 4).

- **T5.1 — Lossless + recoverable parse tree.** `src/parser.ts`/`src/lexer.ts`: keep **trivia** (comments/whitespace) and **never throw** — on error emit an `Error` node + diagnostic, synchronize to next statement/`}`, continue. Typed AST becomes thin *views* over the CST (TS structural typing). Add a `LinkedNode`-style cursor. *(Skip incremental reparse — overkill at plan scale.)* Borrow Typst `typst-syntax`, Lezer recovery posture. **DoD:** a broken line no longer drops the rest of the tree; `CompileResult.ast` present on partial input.
- **T5.2 — `arch fmt` formatter.** New `src/doc.ts` (~150-line zero-dep Wadler/Prettier Doc printer: `group/indent/line/softline/hardline/join/ifBreak`) + `src/format.ts` lowering CST → Doc. Add `format(source)` to the public surface and `arch fmt` to `src/cli.ts`. Pure text→text. **DoD:** `arch fmt examples/studio.arch` is idempotent and preserves comments; wraps long point lists cleanly.
- **T5.3 — Full LSP.** Extend `editors/vscode/src/server.ts`: hover, completion (keywords + element kinds + in-scope `let`s/components/functions), go-to-definition + rename (over the CST cursor), signature help. Drive these from an enriched `ElementDef` parameter schema `{ name, type, default, doc }[]` (one source for LSP + docs + formatter). **DoD:** hover/completion/goto/rename work in VS Code over the studio example.
- **T5.4 — One grammar source of truth.** New `src/grammar/tokens.ts` (keyword categories + operators + comment/string/number rules); lexer reads it; new `scripts/gen-grammars.ts` generates `editors/archlang.tmLanguage.json` and the playground StreamLanguage; CI runs the generator + `git diff --exit-code`. Borrow Mermaid `langium generate` idea (zero-dep). **DoD:** editing a keyword in one place updates both editor grammars; CI drift check green.
- **T5.5 — Error-code catalog + diagnostic enrichment.** Generate `docs/error-codes.md` from the codebase (each `E_*`/`W_*` → message + cause + fix + example); add `arch explain E_ROOM_SIZE`. Add `relatedSpans`/`trace` to diagnostics (e.g. door-not-on-wall points at the expected wall) and headline + `hint:`-prefixed CLI rendering. **DoD:** `arch explain` prints catalog entries; related-span error navigable.

**Phase DoD & release.** Formatter + full LSP + single-source grammar + error catalog. **Release v0.11.0** + consumer bump.

---

## 9. PHASE v1.0 — **Polish, ecosystem & launch** · *all five axes*

**Goal.** Ship the public surface that makes ArchLang adoptable and 1.0-worthy.

- **T6.1 — Hosted docs site + deployed playground.** Deploy the Vite+CodeMirror playground (Vercel/Netlify; isomorphic, no backend) with SVG **and** DXF/PDF/PNG download; build a docs site (language reference, error catalog, examples, ADRs). Borrow Typst.app / Mermaid Live / D2 Playground. **DoD:** public URL renders + downloads all formats.
- **T6.2 — Relational placement sugar (optional layout seam).** `room kitchen right-of living align top gap 100` (+ `below/left-of/above`), resolved arithmetically in dependency order (topological sort over references; cycles → `E_LAYOUT_CYCLE`). Built-in `"manual"` (absolute coords) stays default — fully backward-compatible. Borrow Penrose's *vocabulary* + D2's `LayoutGraph` func *shape* (for future engines). *(Optimizer out of scope — fights determinism.)* **DoD:** relational example compiles deterministically; manual path unchanged.
- **T6.3 — PNG backend.** New `src/backends/png.ts`: rasterize the Scene (optional lazy dep, e.g. `@napi-rs/canvas` Node-side / canvas browser-side) or rasterize SVG. **DoD:** `-f png` produces a deterministic image; optional dep absent from default bundle.
- **T6.4 — Visual-regression tests.** Render golden examples to PNG and pixel-diff (`pixelmatch`, devDep) so geometry changes are caught visually. **DoD:** suite green; intentional changes update goldens.
- **T6.5 — Repo/maintainability + docs reconcile.** npm/pnpm **workspaces** (core + `editors/vscode` + `playground` share one lockfile); run `bench/` in CI with PR regression comments; write ADRs (hand-written parser vs Lezer; optional-dep geometry; expand-time scripting); JSDoc public exports; fold all v0.7–v0.11 features into `docs/language-reference.md`; refresh `AGENTS.md`/`README.md`. **DoD:** root `npm install` bootstraps all packages; docs current.

**Phase DoD & release.** **Release v1.0.0** + tag + publish; final consumer bump.

---

## 10. Cross-cutting tracks (fold into every phase)

- **Testing:** keep snapshot + `fast-check` property tests; add a determinism assertion per new feature; add Scene-IR snapshots (P1) and visual-regression (P6). Never merge with a failing `compile(s) === compile(s)`.
- **Security:** escape interpolated strings/labels at serialization; final whole-SVG allowlist scrub; sanitize untrusted config (P4); document the trust model in `SECURITY.md`.
- **Determinism guards:** integer mm into the optional geometry engine; frozen built-ins; fixed `for` iteration order; injectable `World.now`; pin optional-engine version.
- **Release discipline:** per §0 — branch, bump, `CHANGELOG`, build+test, publish, tag, consumer-bump (don't push `archcanvas main`).

---

## 11. Per-release checklist (repeat for v0.7 … v1.0)
1. Phase tasks' DoD met; `npm run typecheck` + `npm test` green; `npm run build` clean.
2. Visual: `node dist/cli.js compile examples/studio.arch -o <scratch>/s.svg` (and `-f dxf|pdf|png`) + open; playground loads. Phase-specific check (e.g. P1: PDF text selectable; P3: open DXF in a CAD viewer and toggle layers; angled-wall example has no seams).
3. Determinism: compile twice, byte-identical — with the optional geometry engine present AND absent.
4. Bump `package.json` version; update `CHANGELOG.md`.
5. `npm publish --access public` (human supplies 2FA OTP). Tag `v0.x.0`, `git push --tags`.
6. Consumer bump in `archcanvas`: dep `^0.x.0`, `npm install`, `npx tsc --noEmit`, `npm run build`. Push only if explicitly asked.

---

## 12. Suggested execution order (single checklist for a cold session)
1. **v0.7** Scene IR: T1.1 → … → T1.8 → release + bump.
2. **v0.8** Language: T2.1 → … → T2.8 → release + bump.
3. **v0.9** CAD fidelity: T3.1 → … → T3.7 → release + bump.
4. **v0.10** Platform: T4.1 → … → T4.5 → release + bump.
5. **v0.11** Tooling: T5.1 → … → T5.5 → release + bump.
6. **v1.0** Launch: T6.1 → … → T6.5 → release + bump.
7. Cross-cutting (§10): fold tests/security/determinism into every phase.

Implement strictly in order; each phase's DoD gates the next. Keep the golden rules in §0 at all times.
