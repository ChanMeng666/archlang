# ArchLang Optimization — Detailed Implementation Plan (v0.2 → v0.5)

> **Audience:** a fresh Claude Code session executing this plan task-by-task with no prior conversation context. Read §0 and §1 first, then implement phases in order. Each task has a **Definition of Done (DoD)**; do not move on until it's met.

---

## 0. How to use this plan

- **Repo:** `D:\github_repository\archlang` (the language). Consumer product: `D:\github_repository\archcanvas` (a Next.js app that imports the published package — only touch it in the "consumer bump" step of each release).
- **Package:** published to npm as `@chanmeng666/archlang` (public, MIT). GitHub: `github.com/ChanMeng666/archlang`, default branch `main`.
- **Golden rules (do not violate):**
  1. **Core stays zero-runtime-dependency.** `dependencies: {}` in `package.json`. devDependencies (vitest, fast-check, tsx, tsup, typescript, @types/node) are fine. *Optional* tooling/export deps go under `optionalDependencies` or `peerDependencies` and must be lazy-`import()`ed so the core never hard-requires them.
  2. **`compile()` is pure, synchronous, isomorphic (Node + browser).** No `Date.now()`, `Math.random()`, `new Date()`, no Node-only APIs in `src/` except `src/cli.ts`.
  3. **Determinism is sacred.** Same source ⇒ byte-identical SVG. Route all number formatting through the `fmt()` helper. There is a test asserting `compile(s) === compile(s)`; never break it.
  4. **Errors are returned, never thrown** for user-source problems. (Exceptions only for internal invariant bugs.)
  5. **`compile()` return shape is append-only.** Keep `{ svg, errors, warnings, ast? }`; you may ADD fields (e.g. `diagnostics`) but never remove/rename.
- **Per-task workflow:** make the change → `npm run typecheck` → `npm test` → for visual changes, `npm run build && node dist/cli.js compile examples/studio.arch -o /tmp/s.svg` and open it. Commit with a Conventional Commit (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`) ending with the line `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Branching:** do each phase on a branch `feat/v0.x-<slug>`; open a PR or merge to `main` when the phase's DoD is met and tests are green.
- **Release (end of each phase):** bump `version` in `package.json`, update `CHANGELOG.md` (Keep a Changelog format already in repo), `npm run build && npm test`, then `npm publish --access public` (requires `npm login`; npm asks for a 2FA OTP — the human must supply it). Tag `v0.x.0` and push.
- **Consumer bump (after publish):** in `archcanvas`, set `@chanmeng666/archlang` to the new `^0.x.0`, `npm install`, `npx tsc --noEmit`, `npm run build`. Do **not** push archcanvas `main` (auto-deploys live) unless explicitly asked.
- **Setup for a cold session:** `cd D:\github_repository\archlang && npm install && npm test` (expect 12 passing) and `npm run build`.

---

## 1. Current state primer (ArchLang v0.1)

A 5-stage, ~1400-line, zero-dep compiler. Pipeline: **lex → parse → validate → (geometry helpers) → render**.

```
src/
  index.ts     compile(source, opts?) => { svg, errors, warnings, ast? }; memo cache (Map, 64 entries,
               key = JSON.stringify([source, width])); clearCache(). The ONLY public surface.
  types.ts     CompileError {message, line?, col?}; CompileWarning = CompileError;
               CompileOptions {width?, noCache?}; CompileResult.
  ast.ts       Point{x,y}; NorthDir; PlanNode{name,units,grid,scale?,north,walls,rooms,doors,windows,
               furniture,dims,title?}; *Node types each carry a `line:number`.
  lexer.ts     Token{type:TokenType, value, num?, num2?, line, col}; lex(src)=>{tokens,errors}.
               Hand-written; tracks line/col and an index `i` (= byte offset, but NOT stored on tokens).
               TokenType: ident|number|string|dimension|lparen|rparen|lcurly|rcurly|comma|equals|colon|arrow|eof.
  parser.ts    parse(src)=>{plan?, errors}. Recursive-descent Parser class. THROWS ParseError on first
               error, caught at top, returns a single error. Helpers: peek/next/eat/eatKeyword/eatNumber/
               eatString/eatIdent/isKeyword/isType/parsePoint/parseIdOpt; parseWall/Room/Door/Window/
               Furniture/Dim/Title; the plan loop switch-dispatches on the leading ident.
  validate.ts  validate(plan)=>{errors,warnings}. MUTATES plan in place (grid-snap, auto-id assignment).
               Semantic checks: positive sizes, duplicate ids, door/window on a wall (warn via
               distPointToSegment), overlapping rooms (warn, O(n²)). 
  geometry.ts  Vec helpers (sub/add/mul/unit/normal/length); distPointToSegment; rectCorners;
               segmentRectangle (square-capped offset rect per wall segment — NO boolean union, hence
               corner seams); wallSegments; hostSegment (nearest wall to an opening point); planBounds.
  render.ts    render(plan,opts)=>svg string. THEME constant (colors). fmt() (round 2dp, strip -0) +
               xml() escaper. Sizes scale off refDim = max(drawW,drawH). Draws: poché <pattern>, room
               fills+labels+area, furniture, wall fills+faces, door openings+leaf+swing arc, window
               panes, dims, northArrow, scaleBar, titleBlock.
  cli.ts       `arch compile <in.arch> [-o out] [-w width]` and `arch watch`.
test/compile.test.ts   12 tests: valid render, determinism, grid-snap, escaping, error/warning cases.
examples/      studio.arch, two-bed.arch.
docs/          language-reference.md.
```

**Language today:** `plan "name" { units mm | grid N | scale A:B | north up|down|left|right|deg | wall <kind> thickness N {(x,y)… [close]} | room [id=] at (x,y) size WxH [label "…"] | door [id=] at (x,y) width N [wall ref] [hinge left|right] [swing in|out] | window [id=] at (x,y) width N [wall ref] | furniture <kind> [id=] at (x,y) size WxH [label "…"] | dim (x,y)->(x,y) [offset N] [text "…"] | title { project|drawn_by|date "…" } }`. Units mm, integers, origin top-left, +x right, +y down. All coordinates are **literal numbers** (no expressions).

---

## 2. Target architecture (end state after v0.5)

```
source ─▶ lex (tokens carry byte-offset spans)
       ─▶ parse  → AST + Diagnostic[]   (resilient: never throws, recovers, reports ALL errors)
       ─▶ resolve(AST) → IR             (eval exprs/vars, expand components, grid-snap, assign ids,
                                          host openings) — pure AST→IR, the single place semantics live
       ─▶ layout(IR)                    (geometry: wall boolean-union, opening cuts, bounds)
       ─▶ render backends: SVG (default) · DXF/PDF (optional)
```

Core shared types to introduce (in `src/types.ts` / new `src/diagnostics.ts`):

```ts
export interface Span { start: number; end: number; }          // byte offsets into source
export type Severity = "error" | "warning";
export interface Diagnostic {
  severity: Severity;
  message: string;
  span?: Span;
  code?: string;            // e.g. "E_ROOM_SIZE"
  hints?: string[];         // "did you mean …?"
}
```

`CompileResult` gains `diagnostics: Diagnostic[]`. `errors`/`warnings` (the old `{message,line,col}` shape) are **derived** from diagnostics (compute line/col from `span.start`) so existing consumers keep working.

Element registry (introduced v0.3): every element is one module implementing a common interface; parse/resolve/render iterate the registry, never a hard-coded switch.

---

## 3. PHASE v0.2 — Resilient parser + professional diagnostics

**Goal:** the compiler never throws on bad source; it reports **all** problems in one pass, each with a caret-framed source snippet and optional hints. This is the foundation every later phase emits into, and it directly upgrades ArchCanvas's AI self-correction loop.

**Why first:** later phases produce more diagnostics; editor/LSP needs error recovery; better errors = better LLM fixes.

### T2.1 — Byte-offset spans through lexer → tokens
- In `src/lexer.ts`, add `start:number; end:number` to `Token` (byte offsets; `start` = `i` at token begin, `end` = `i` after). Keep `line/col` too (back-compat + cheap frames).
- Collect **all** lexical errors into the returned `errors` array (today it returns early after one). Each lexer error becomes `{message, span:{start,end}, severity:"error"}` shaped data (store offsets).
- DoD: tokens carry correct spans (add a unit test asserting span of a known token); lexer returns multiple errors for multiple bad chars.

### T2.2 — `Diagnostic` type + codespan-style renderer
- New `src/diagnostics.ts`: export `Diagnostic`, `Span`, `Severity` (move from types.ts or re-export), plus:
  - `offsetToLineCol(source, offset) => {line, col}` (1-based).
  - `formatDiagnostic(source, d: Diagnostic) => string` producing:
    ```
    error[E_ROOM_SIZE]: room "bed" must have a positive size
      --> 4:30
       |
     4 | room id=bed at (0,0) size 0x4000
       |                           ^^^^^^ width is 0
       = help: did you mean 3000x4000?
    ```
    (~50–70 lines, zero-dep; handle missing span gracefully → just the message line.)
- DoD: snapshot test of `formatDiagnostic` output for one error and one warning.

### T2.3 — Parser: error recovery + multi-error collection
- Refactor `src/parser.ts` so the `Parser` holds `diagnostics: Diagnostic[]`. Replace "throw `ParseError`, catch at top, return one" with: on a syntax error, push a diagnostic and **recover** — `synchronize()` advances tokens until the next statement-start keyword (`units|grid|scale|north|wall|room|door|window|furniture|dim|title`) or `rcurly`/`eof`, then the plan loop continues.
- Element parse helpers (`eat*`) throw an internal `ParseError` as today, but the **statement loop** catches it per-statement, records the diagnostic (with the token span), calls `synchronize()`, and proceeds — yielding a best-effort partial AST plus all errors.
- Attach `span` to each parsed AST node (add `span: Span` to node types in `ast.ts`; set from the leading keyword token's `start` to the last consumed token's `end`). Keep `line` for back-compat.
- DoD: a source with 3 separate statement errors returns 3 diagnostics (new test); partial AST still contains the well-formed statements.

### T2.4 — Wire diagnostics through `validate` and `compile`
- `validate.ts`: change to push `Diagnostic` objects (with spans where available — element nodes now have spans) instead of `{message,line}`; keep returning `{errors, warnings}` by mapping severity, OR return `Diagnostic[]` and split in index.ts. Prefer: `validate(plan) => Diagnostic[]`.
- `src/index.ts`: assemble `diagnostics = [...lexDiags, ...parseDiags, ...validateDiags]`. Set `errors = diagnostics.filter(severity==="error").map(toLegacy)`, `warnings = …"warning"`. `toLegacy(d)` = `{message, ...offsetToLineCol(source, d.span.start)}`. Render aborts (svg = "") iff any error-severity diagnostic. Add `diagnostics` to `CompileResult`. Keep memoization.
- `cli.ts`: print `formatDiagnostic` for each diagnostic (errors to stderr, warnings too); exit nonzero iff errors.
- DoD: `compile()` returns `diagnostics`; old `errors`/`warnings`/`svg` semantics unchanged; all 12 existing tests still pass.

### T2.5 — Tests + docs + release
- Add tests: multi-error recovery, span accuracy, `formatDiagnostic` snapshots, "warnings don't block render".
- Update `docs/language-reference.md` (Compilation result section) to document `diagnostics`.
- **Release v0.2.0** (per §0 release steps) + **consumer bump**: in archcanvas `src/lib/agent/tools.ts`, the two tools already map `errors`; additionally pass `diagnostics` (message + line) back to the model for richer self-correction. Verify `tsc --noEmit` + `next build`.
- **Phase DoD:** bad input never throws; all errors shown at once with frames; ArchCanvas agent receives framed diagnostics.

---

## 4. PHASE v0.3 — Encapsulation: element registry + AST→IR layering

**Goal:** adding an element type becomes **one new module + one register call**, not edits across 5 files. Introduce a real IR so semantics live in one place and backends are swappable.

**Why second:** v0.4/v0.5 add many element kinds and a backend; do the encapsulation refactor before piling features on.

### T3.1 — Define the element registry interface
- New `src/registry.ts`:
  ```ts
  export interface ElementDef<TNode> {
    keyword: string;                                   // e.g. "wall"
    parse(ctx: ParseCtx): TNode;                       // consumes tokens, returns an AST node
    resolve(node: TNode, ctx: ResolveCtx): void;       // grid-snap, ids, host openings → push to IR
    /** which render pass(es) this element draws in, and the draw fn */
    render(node: ResolvedNode, ctx: RenderCtx): RenderOp[];
  }
  export const RENDER_PASSES = ["floor","furniture","walls","openings","labels","dims","annotations"] as const;
  ```
- `ParseCtx` exposes the existing Parser helpers (`eat`, `eatKeyword`, `eatNumber`, `eatString`, `eatIdent`, `isKeyword`, `isType`, `peek`, `next`, `parsePoint`, `parseIdOpt`, `diag(...)`). `ResolveCtx` exposes the env/snap/id-assign utilities + `pushDiag`. `RenderCtx` exposes `fmt`, theme, sizes, and SVG string builders. `RenderOp = { pass: typeof RENDER_PASSES[number]; svg: string }`.
- DoD: interfaces compile; no behavior change yet.

### T3.2 — Move each element into `src/elements/*`
- Create `src/elements/{wall,room,door,window,furniture,dim,title}.ts`, each exporting an `ElementDef`. Move the per-element parse/validate/geometry/render logic from the monolith into these modules (lift, don't rewrite). Register them in `src/elements/index.ts` → `registry: Map<string, ElementDef>`.
- Refactor `parser.ts` plan loop to: `const def = registry.get(tok.value); if (def) plan.elements.push(def.parse(ctx)); else diag("unknown statement…")`. (Plan-level settings `units/grid/scale/north/title` can stay special-cased or also be registry entries — recommend keeping settings special, elements in registry.)
- Change `PlanNode` to hold a single `elements: AstElement[]` discriminated union (each node gets a `kind` field) instead of separate arrays — OR keep arrays but populate via registry. Recommend the discriminated `elements[]` for genericity; update render/resolve to iterate.
- DoD: all 12 tests pass unchanged; output byte-identical to v0.2 (snapshot guard).

### T3.3 — Introduce `resolve(ast) => IR` (stop mutating the AST)
- New `src/ir.ts`: `ResolvedPlan` mirroring AST but post-processing. Move `validate.ts`'s in-place mutations (grid-snap, id assignment) into a **pure** `resolve(ast): { ir, diagnostics }` that returns a new IR (AST stays immutable). Opening-hosting (currently in render via `hostSegment`) computes here and stores the host segment on the resolved door/window.
- `render(ir)` consumes IR only. `compile()` becomes `parse → resolve → render`.
- DoD: determinism test passes; a new test asserts the input AST is not mutated by `resolve`.

### T3.4 — Prove extensibility + release
- Add a tiny example element to demonstrate locality (e.g., `column`: `column at (x,y) size WxH` → filled square in the "furniture" pass) implemented as a **single** `src/elements/column.ts` + one register line; add a test that registering it requires no edits to parser/render core. (Keep `column` as a real shipped feature — it's genuinely useful.)
- **Release v0.3.0** + consumer bump (no API change for archcanvas; just version bump + rebuild).
- **Phase DoD:** a new element type is addable in one file; semantics live in `resolve`; render is backend-ready.

---

## 5. PHASE v0.4 — Language power: variables, expressions, components

**Goal:** parametric, DRY plans. `let` bindings, arithmetic anywhere a number appears, and reusable `component`s. Built on the v0.3 IR (expressions are AST nodes evaluated during `resolve`).

**Why third:** depends on the AST/IR split; biggest real-world usability unlock.

### T4.1 — Expression lexer + Pratt parser
- Lexer: add operator tokens `+ - * / ( )` and `%` if desired; numbers already tokenize. Note `(`/`)` already exist for points — disambiguate by context (expression vs point) in the parser (points are `( expr , expr )`; an expression may start with `(`). Keep `x` in `WxH` working (dimension token) but ALSO allow `W x H` where W/H are expressions → introduce a `by`-style or require `size <expr> x <expr>` parsed specially (recommend: parse `size` value as `<expr> "x" <expr>`, lexing bare `x` between exprs as a dimension separator only in `size`/component contexts; document the rule).
- New `src/expr.ts`: `Expr` AST (`Num{value}`, `Ref{name}`, `Bin{op,l,r}`, `Unary{op,e}`, `Paren{e}`), a Pratt `parseExpr(ctx)`, and `evalExpr(expr, env): number` (pure; division-by-zero → diagnostic, returns 0).
- Replace literal-number reads in element parsers (`eatNumber`, coords, sizes, offsets, widths, thickness) with `parseExpr`; store `Expr` in AST; `evalExpr` during `resolve` to produce concrete mm numbers in IR.
- DoD: `room id=r at (0,0) size (3000) x (3000-500) label "R"` compiles; tests for arithmetic + precedence + div-by-zero diagnostic.

### T4.2 — `let` bindings + environment
- Grammar: `let NAME = <expr>` as a plan-level (and component-level) statement; binds in an `Env` (Map<string, number>) used by `evalExpr`. Lexical scope: plan scope is global; component bodies get a child scope with params + locals.
- Forward references disallowed (evaluate top-to-bottom); referencing an unknown name → diagnostic with a "did you mean" hint (Levenshtein over known names).
- DoD: `let W = 3000` then `size W x W` works; unknown-ref diagnostic test; redefinition rule documented + tested.

### T4.3 — Components (parameterized reusable sub-plans)
- Grammar: `component NAME(p1, p2, …) { <statements> }` (body = the same element/let statements, using params as variables). Instantiation: `NAME(expr, expr, …)` as a statement; on resolve, bind params in a child env, evaluate the body, and emit its elements into the parent IR. Components compose (a component body may instantiate another); guard against infinite recursion (depth limit → diagnostic).
- No implicit translation magic — the body positions things using its params (e.g. `component bath(x,y){ room id=... at (x,y) size 2000x2000 ... }`). Keep it predictable.
- Auto-ids must stay unique across instantiations (suffix by instantiation index).
- DoD: a `component` instantiated twice yields two correctly-placed, uniquely-ided element groups; recursion-limit test; an example file `examples/parametric.arch` using `let` + `component`.

### T4.4 — Docs + release
- Expand `docs/language-reference.md` with Expressions, `let`, and Components sections + examples. Update the playground examples.
- **Release v0.4.0** + consumer bump. Update ArchCanvas's system prompt (`src/lib/agent/prompts.ts`) to teach the model `let`/expressions/components so it emits DRY parametric plans (additive prompt change; verify with one live E2E generation).
- **Phase DoD:** plans are parametric and reusable; the AI can write `let`/`component` source that compiles.

---

## 6. PHASE v0.5 — Rendering fidelity + theming

**Goal:** drawings that match professional CAD standards — clean merged wall corners, material hatches, and user-controllable themes/line-weights/fonts.

**Why last:** highest visual polish; benefits from the registry (hatches/materials as registered modules) and IR.

### T6.1 — Clean wall joins (boolean union)
- Replace per-segment independent rectangles with a **union** of wall polygons so corners merge seamlessly.
  - Step 1 (zero-dep): handle the common **orthogonal** case by unioning axis-aligned rectangles (rectangle-union via sweep, or merge collinear/overlapping rects) in a new `src/geometry/union.ts`.
  - Step 2 (optional dep): for general angled walls, lazy-`import()` a polygon-clipping lib (`polygon-clipping` or `martinez-polygon-clipping`, both pure-JS; or Clipper2-wasm) under `optionalDependencies`; fall back to the v0.1 segment rendering if absent. Gate behind a `CompileOptions` flag or auto-detect.
- Render the unioned wall polygon with poché fill + a single outlined boundary (no internal seams).
- DoD: a plan with a T-junction and an L-corner renders with no visible seams (snapshot + visual check); determinism preserved; works with the optional dep absent.

### T6.2 — Material hatches registry
- A registry of hatch patterns (`concrete`, `brick`, `insulation`, `tile`, `none`) each emitting an SVG `<pattern>`. Grammar: `wall <kind> thickness N material brick { … }` (optional `material`). Default keeps the current poché.
- DoD: each material renders its distinct pattern; unknown material → diagnostic + fallback.

### T6.3 — Theming
- Replace the hardcoded `THEME` with a default theme object + `theme { wall: "#…"; lineWeight: 0.5; font: "…"; … }` plan directive AND `CompileOptions.theme` (deep-merge: options override directive override defaults). Expose line-weight and font controls.
- DoD: a theme directive changes colors/weights deterministically; `CompileOptions.theme` overrides it; snapshot tests.

### T6.4 — Docs + release
- Document materials + theming; add a themed example.
- **Release v0.5.0** + consumer bump (optionally let ArchCanvas pass a brand theme).
- **Phase DoD:** professional-grade output (clean corners, materials, themable).

---

## 7. Cross-cutting tracks (do alongside the phases)

- **Testing (devDeps):** adopt **snapshot/golden-SVG** tests (vitest `toMatchSnapshot`) for `examples/*.arch` — add in v0.2 and keep updated so every phase guards rendering regressions. Add **property-based/fuzz** tests with `fast-check`: `compile(arbitraryString)` must never throw and must return within bounds; resolved geometry never `NaN`; determinism holds. Expand unit coverage (windows, furniture, all 4 door swing combos, cache eviction at 64 entries, grid-snap rounding).
- **Performance:** memoize per-stage by content hash (currently only top-level) once IR exists (v0.3); add a spatial grid/index for the O(n²) overlap + per-opening `hostSegment` scans if a benchmark (add `bench/` with a 1000-element plan) shows it matters. Never sacrifice determinism.
- **Tooling (optional peer deps, after v0.3's IR):**
  - **CodeMirror 6 + Lezer** grammar mirroring the lexer → playground gets syntax highlighting + inline lint fed by `diagnostics`. Build `playground/` into a small Vite app (currently a single HTML + esbuild bundle).
  - **LSP** server (`vscode-languageserver`) reusing the resilient parser + `diagnostics`; ship a minimal VS Code extension. 
  - **tmLanguage** grammar for GitHub/editor highlighting of `.arch`.
  - **Export backends** (trivial once IR/backends exist): DXF via `dxf-writer`, PDF via `svg-to-pdfkit`/`pdfkit`. Add `arch compile … --format dxf|pdf`.
- **Security:** output stays a fixed SVG element allowlist (no `<script>`/handlers) — already XSS-safe; revisit only if free-form user SVG/text is added.
- **CI:** add `.github/workflows/ci.yml` running `npm ci && npm run typecheck && npm test` on PRs; the repo already has a release workflow placeholder.

---

## 8. Per-release checklist (repeat for v0.2 … v0.5)
1. All phase tasks' DoD met; `npm run typecheck` + `npm test` green; `npm run build` clean.
2. Visual check: `node dist/cli.js compile examples/studio.arch -o /tmp/s.svg` + open; playground loads.
3. Bump `package.json` version; update `CHANGELOG.md`.
4. `npm publish --access public` (human supplies npm 2FA OTP). Tag `v0.x.0`, `git push --tags`.
5. Consumer bump in archcanvas: set dep `^0.x.0`, `npm install`, `npx tsc --noEmit`, `npm run build`. Push archcanvas only if explicitly requested (auto-deploys live).

---

## 9. Reference material (studied for this plan)
- **Mermaid** — diagram registry (`packages/mermaid/src/diagram-api/*`), Langium grammars (`packages/parser/src/language/*`), theming/config, DOMPurify sanitization → the **registry** model for §4.
- **D2** — parser always returns a valid AST + error list; `AST → IR → graph` layering; pluggable layout → the **IR/recovery** model for §3/§4.
- **Typst** — `docs/dev/architecture.md`: resilient parse with error nodes, typed-vs-untyped tree, `comemo` constrained memoization, span stability → the **diagnostics/perf** model for §3/§7.
- **Penrose** (TypeScript) — Domain/Substance/Style separation + optimization-based constraint layout → informs a *future* constraints phase (beyond v0.5).
- Library shortlist (sizes/zero-dep): parser (hand-written now; Lezer/Chevrotain if scaling), geometry (`polygon-clipping`, `martinez`, Clipper2-wasm, `flatten-js`), export (`dxf-writer`, `pdfkit`/`svg-to-pdfkit`), testing (`vitest`, `fast-check`, `pixelmatch`), LSP (`vscode-languageserver`).

---

## 10. Suggested execution order (single checklist for the cold session)
1. v0.2: T2.1 → T2.2 → T2.3 → T2.4 → T2.5 → release + consumer bump.
2. v0.3: T3.1 → T3.2 → T3.3 → T3.4 → release + bump.
3. v0.4: T4.1 → T4.2 → T4.3 → T4.4 → release + bump.
4. v0.5: T6.1 → T6.2 → T6.3 → T6.4 → release + bump.
5. Cross-cutting (§7): fold snapshot+fuzz tests in from v0.2; add tooling/export after v0.3.

Implement strictly in order; each phase's DoD gates the next. Keep the golden rules in §0 at all times.
