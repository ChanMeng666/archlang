# Gotchas & Anti-patterns

> Moved verbatim from `AGENTS.md` (2026-09-18) so it loads on demand. Entries are tagged by area — `(Typecheck)`, `(Releasing)`, `(MCP registry)`, `(Eval harness)`, `(Dataset)`, `(place)`, `(Sites)`, `(Parallel worktrees)`, `(Docs vs npm)`; untagged ones concern the core compiler. Skim the tags for the area you are touching before you change it.

- **(Typecheck) A file's options come from the PROGRAM compiling it, not from the tsconfig nearest
  it — and `exclude` cannot hold a file out of a program it was IMPORTED into.** `tsconfig.dev.json`
  checks `test/` and excludes `playground`/`docs-site`/`packages`/`editors`, but a root test that
  imports `../playground/src/share.js` pulls that module into the ROOT program, where
  `noUncheckedIndexedAccess` is ON; the playground tsconfig's deliberate relaxation does not travel,
  because `exclude` only filters a config's own `include` globs. So any workspace module a root test
  imports is compiled once per leg of `typecheck:all`, under two option sets, and must satisfy the
  stricter one — `test/lsp-diagnostics.test.ts` → `editors/vscode/src/diagnostics.ts` is a second
  live instance that happens to pass. Symptom: `TS2345 … | undefined` on workspace source that
  `tsc -p <workspace>` reports as clean — check WHICH leg emitted it before blaming the workspace
  config (`tsc -p tsconfig.dev.json --listFiles` names every file the program actually pulls in),
  and fix it IN the shared module (guard or a provably-safe assertion), never by relaxing the root
  option or adding an exclude.
- **A quoted dimension must name its convention, or carry a tilde.** Every plan with a
  `wall … thickness` has TWO legitimate sizes — the wall centrelines (`describe --json`'s `bbox`,
  and what the `let W`/`let D` in an example usually are) and the outer faces (`bbox_outer`) — so a
  bare "5.2 × 10.7 m" is under-specified by construction, and a reader cannot tell a convention
  choice from an error. Two instances shipped. Landing-page card A-102 said "a 5.2 × 10.7 m terrace
  **footprint**" for `townhouse`, which is the centreline pair under a word that means the outside
  face (`bbox_outer` is 5500 × 11000); and `examples/aquarium.arch` opened with "~60 x 46 m" for a
  shell that closes at `(60000,40000)` — wrong under either convention, and shipped since v1.24
  while `docs-site/examples.md` had 60 × 40 right all along. **Settle it with
  `arch describe <file> --json --select bbox,bbox_outer`** and then write one of: the qualified form
  ("outer faces 5500 x 11000", "12 × 14 m bounding box", "22 × 22 m suburban lot"), or a tilde on a
  round figure that is true either way ("~50 x 32 m" — the outer face is 50.3 × 32.3). Both forms
  are already in the corpus and are why the other sixteen quoted dimensions survived the 2026-09-20
  sweep. **Deliberately NOT gated:** whether a number is the right one for the sentence around it is
  not decidable from prose, and a guard that cannot decide would either pass everything or block
  honest wording — don't build one.
- **Don't edit `dist/` or generated files.** `dist/` is a build output. The generated artifacts —
  editor grammars (`editors/archlang.tmLanguage.json`, `playground/src/arch-language.js`,
  `docs-site/.vitepress/theme/arch-highlight.js`),
  `docs/error-codes.md`, `docs/cli-reference.md`, `spec.llm.md`, `llms-full.txt`,
  `grammars/archlang.gbnf`, the two `schemas/*.schema.json`, **the twenty committed
  `examples/*.svg`** the README embeds and **the two axonometric renders `docs/axonometric.md`
  embeds** (`README_SVGS` and `VIEW_SVGS`, both in `scripts/gen-example-svgs.ts`) — each come from a
  single source (`src/grammar/tokens.ts` / `src/error-catalog.ts` / `src/manifest.ts` / `examples/` /
  `SKILL.md` + manifest / `PLAN_JSON_SCHEMA` / `INTENT_JSON_SCHEMA` / the matching `.arch`) via the matching `npm run gen:*`
  (order: `gen:spec` before `gen:llms`, which consumes it). **CI fails on drift** — edit the source
  and regenerate, never hand-edit. **The `examples/*.svg` are the newest members of that list and
  the reason it is worth restating:** they were hand-committed for years and nothing compared them
  to the compiler, so `studio`/`two-bed`/`attached` silently showed the README a building rendered
  before the opening-void fix, the fixture-orientation fix, the miter cap and the label-placement
  pass. `npm run gen:example-svgs` renders them; `test/example-svgs-drift.test.ts` gates them and
  also pins the curated list against the README's own `<img>` tags, in both directions. The docs site
  copies the root artifacts + a raw markdown copy of each page into `public/` via
  `docs-site/sync-docs.mjs` — edit the repo-root source, not the copies. **Editor syntax colors also
  route through the generator:** `arch-language.js` emits each `HighlightStyle` tag as
  `var(--syn-<name>, <fallback>)` (palette in `playground/src/styles/editor.css`) — recolor via the
  `scripts/gen-grammars.ts` template or `--syn-*` values + `npm run gen:grammars`, never by hand.
- **Determinism is tested.** The suite asserts `compile(s) === compile(s)` byte-for-byte, geometry
  engine both present and absent — which since v1.30 holds for the trivial reason that nothing reads
  the engine; `test/union.test.ts` and `test/miter-limit.test.ts` now assert that registering one
  changes no byte, on angled and rectilinear plans alike. Anything varying output across runs (object key order, floats, time)
  fails — route number formatting through `fmt()`. The one opt-in output change is
  `compile(src, { annotate: true })` (adds `data-span`, plus the element anchors
`data-arch-id`/`-kind`/`-label` and `data-arch-primary`); it is deterministic and leaves the **default**
  output byte-identical, so never emit annotation unconditionally (ADR 0007) — a test enforces equality.
- **The parse-stage memo's AST is shared — never mutate it downstream.** `parser.ts` memoizes
  `parse()` by content key (parser.ts ~line 59–63) on the contract that the cached `PlanNode` is never
  mutated. Anything consuming `parse()` or any memoized structure treats it as immutable — clone before
  you mutate (an in-place `repair()` edit once made output history-dependent; fixed in `51a47ee`).
- **Relational placement is deterministic, not an optimizer.** `src/layout.ts` resolves
  `right-of`/`below`/… by pure arithmetic in topological order; the absolute `at (x,y)` path must stay
  byte-identical (it is the default and has its own golden snapshots). See ADR 0004.
- **The PNG backend is Node-only and async** (resvg is a native binding); it rasterizes the SVG with a
  **bundled font** so text is deterministic. Keep `node:*` imports lazy so the module stays browser-safe.
- **Keep every Node-only lazy `import()` bundler-safe.** The lazy `import()`s of `@resvg/resvg-js`,
  `pdfkit`, `clipper2-wasm` — **and** the PNG font-lookup `import("node:fs")` / `import("node:url")` —
  carry `/* webpackIgnore: true */ /* @vite-ignore */` so a downstream webpack/Next.js consumer doesn't
  try to resolve a native `.node` binary or a `node:*` builtin for the browser and fail its build. The
  comments are needed even though these paths never run in a browser — preserve them on any new
  Node-only or optional-dep import (the 1.0.0→1.0.1 + 1.12.1 fixes).
- **`npm run dev`** (repo root) runs `tsup --watch` (a rebuild watcher), not a web server — the
  playground/docs sites are separate Vite apps (`npm run playground:dev` / `docs:dev`).
- **(Releasing) npm provenance exact-matches `repository.url`'s casing.** The OIDC release
  (`.github/workflows/release.yml`; a `v*` tag push runs it) fails with `E422` if `repository.url`'s
  owner segment isn't `ChanMeng666` byte-for-byte (the v1.14.0 release needed a same-day casing fix +
  re-tag). See the release/npmjs iron law in [iron-laws.md](iron-laws.md) and `docs/npm-oidc-publishing-playbook.md`.
- **(MCP registry) The `io.github.<Owner>/*` namespace is case-sensitive and identity-checked.**
  registry.modelcontextprotocol.io exact-matches the published npm package's **`mcpName`** against
  `server.json`'s `name`, so the owner segment must match your GitHub login byte-for-byte
  (`io.github.ChanMeng666/…`, not `chanmeng666`); it also **caps the server `description` at 100
  chars**. A mismatch or over-long description is rejected at publish (the 0.1.0 → 0.1.1 patch fixed exactly this).
- **(Eval harness) Reasoning models spend thinking tokens out of `max_completion_tokens`.** A too-low
  cap starves the model into truncated (invalid) output and a bogus low baseline; `eval/run.ts` uses
  16384. If a model scores implausibly low, suspect a token cap before the language.
- **(Eval harness) Never compare rates across a judge change** (an iron law in [iron-laws.md](iron-laws.md); the mechanics:
  `JUDGE_VERSION` / `SYNONYMS_VERSION` are pinned by tests and stamped into every result +
  `live-baseline.json`'s `judge` field, and `renderDelta` prints a non-comparability warning when they
  differ). See `eval/README.md`.
- **(Dataset) Holdout never published, canary never regenerated, `repair`-split sources stay literal**
  — the contamination iron law in [iron-laws.md](iron-laws.md), enforced by `test/dataset.test.ts`. Operationally: `dataset/out/`
  is git-ignored (HF-only); on re-upload the HF card's `task_categories` must come from HF's official
  list (`text-generation`, not `text2text-generation` — the upload warns), namespace uses the canonical
  `ChanMeng666` casing. See `dataset/README.md` and [ADR 0013](../adr/0013-repair-trajectory-dataset.md).
- **(`place`) NEVER pre-transform a resolver's INPUT coordinates.** A `place`d instance resolves in
  its OWN frame — against its own walls and rooms, with its own `placeRelational` pass — and
  `frame.ts`'s `transformElement` then carries the resolved element into plan coordinates. That is
  not an implementation accident: every derived-geometry rule is stated in world terms (`anchor
  top-left` names a corner of the page, `against wall … side left` a face, `hinge left` a wall
  handedness, `right-of` the page's +x, a room's `at` its TOP-LEFT — which a turn moves), so
  feeding rotated coordinates in would silently change what each one means and force every element
  resolver to learn about frames. Add a handed rule ⇒ add its flip to `transformElement` (`det < 0`),
  not a frame parameter to the element. **The general question, when any fact crosses a frame, is
  "can this be re-expressed in plan coordinates?"** — and the two answers are both legitimate, so do
  not assume a reflection always flips. A *placement clause* (`anchor top-right`) names a corner in
  the instance's own local vocabulary, which plan space has no word for and the reflection renames:
  it is **dropped** (backlog G.4). A *symbol's handedness* does not exist before the crossing — the
  frame creates it — and is re-expressible exactly, as one reflection about the footprint's own
  centre line: it is **flipped** (backlog 5.4). Flip what can be re-expressed; drop what cannot.
  Both land in the same arm of `transformGeometry`, on different fields, with no ordering between
  them. See [ADR 0016](../adr/0016-component-instances-and-frames.md).
- **(`place`) A bare `wing()` call is still the LEGACY MACRO and must stay byte-identical** — caller's
  coordinates, caller's GLOBAL auto-id counters, no namespace, no zone. A plan with no `place` has
  exactly one resolution group and takes the historical single pass; the SVG snapshots and visual
  goldens are the gate. Never "unify" the two forms.
- **A diagnostic's `span` is not always in the file you compiled.** A component's body statements
  carry spans into the module they were WRITTEN in, so `Diagnostic.file` names that module when it is
  not the compiled source — and `applyFixes` **skips** any `FixSuggestion` carrying a `file`. Before
  v1.22 it did not, and an imported component's off-wall-door fix rewrote the middle of the
  importer's `wall` statement. Any new consumer of `diagnostics[].fixes` must honour `file`.
- **Door `hinge left/right` is relative to the wall's traversal direction**, not the screen — so the
  hinge side can flip with the order of a wall's points. The swing quarter-disc is computed once in
  `geometry.ts` (`doorSwing`) and shared by `door.render()` and the `W_SWING_OBSTRUCTED` lint rule —
  keep them on that one helper.
- **Fixtures draw by category, not a new element kind — and a drawn symbol IGNORES its `label`.**
  `furniture.render()` dispatches the category to `elements/fixtures-glyphs.ts`, which since v1.32
  covers **129 category words across 83 families** (all six domain modules); anything else falls back
  to the labelled rectangle, and that fallback is the escape hatch, not a defect. The label rule is
  long-standing for `wc`/`basin` and now true of twenty shipped examples whose fixture words vanish
  from the drawing while staying in the source and in `describe()` — so **do not add a `label` to make
  a catalogued piece read; add a category, or accept the rectangle.** Adding a family means one row in
  the single-source `FIXTURE_FAMILIES` table plus a `CATALOG` entry, never a new element or a `switch`
  arm, and the three catalog flags mean different things (`requiresWall` = services only,
  `directional` = has a back worth turning to a wall, `underlay` = lies flat and is stood on — read
  ONLY through `solidFurniture()`, never re-tested inline). The lint rules
  key off two closed vocabularies: room-label classification through `src/vocabulary.ts`
  (`USE_VOCABULARY` + token-bounded `matchVocabulary`; an alias-only classification raises advisory
  `W_ALIAS_MATCH` with a fix) and fixture category through `src/fixtures-catalog.ts`. Corpus
  classification is pinned by `test/vocabulary-equivalence.test.ts` — fix the vocabulary, never regenerate the pin.
- **`examples/studio.arch` is import-free on purpose** (`test/world.test.ts` asserts the flagship
  compiles from a single file with no World) — use inline `furniture <fixture>` there, not imports.
- **(Sites) A bare `|` inside inline code in a Markdown TABLE cell breaks the docs build.** GFM
  splits table cells on `|` *before* inline-code parsing, so `` `anchor|centered` `` severs the
  backtick pair and any `<token>` inside leaks out as raw HTML — VitePress/Vue then fails the whole
  build with "Element is missing end tag" (took the docs deploy down for four pushes on 2026-07-12).
  Write `\|` inside table cells, and treat **`npm run docs:build` as verification for any `docs/*.md`
  edit** — the core test suite doesn't compile the site.
- **(Sites) `docs/adr/*.md` is copied FLAT into `docs-site/adr/`, so a relative link from an ADR to
  anything outside `docs/adr/` is a dead link that FAILS the build.** `../archive/…`, `../research/…`
  and `../testing.md` all resolve at the repo but not on the site, because the copy loses the parent
  directory. Sibling ADR links (`0012-mcp-shim-discoverability.md`) are fine. Cite an out-of-tree path
  as inline code instead of linking it. Cost a build during the 2026-08-12 doc sweep; `docs:build` is
  the only gate that sees it.
- **(Sites) A plain ```` ```arch ```` fence in a published page COMPILES in the reader's browser.**
  The fence rule in `docs-site/.vitepress/config.ts` rewrites every one into a live `<ArchLive>`
  widget, so an illustrative FRAGMENT (a lone `room …` line) or a deliberate error demo renders a red
  error card on the public page. `npm run docs:build` cannot catch it — the compile happens at
  runtime. Mark those fences ```` ```arch static ````: same ArchLang highlighting, no live compile.
  Two real instances: `/relational`'s opening fragment, and `/errors`, where 104 error-catalog
  examples each showed a generic `Expected "plan" but found …` instead of the code they document
  (fixed at the source — `scripts/gen-error-codes.ts` emits `arch static`). `test/docs-fences.test.ts`
  is the gate, and it pins the `static` convention against config.ts's own source.
- **(Sites) There is no dark mode — if you are writing a `.dark` rule, you are on the wrong plan.**
  (History, in case you are tempted: a partial `:global(.dark) …` selector inside a Vue `<style scoped>`
  block miscompiles to a bare `.dark { … }` rule and once inverted the whole site.) The docs site sets
  `appearance: false`, and `color-scheme: only light` in the shared `:root` is what keeps Chromium's
  Auto Dark Mode off — do not "restore" a `light dark` declaration.
- **(Sites) VitePress `.vp-doc a:hover` (specificity 0,2,1) outranks a two-class rule (0,2,0) on
  hover.** Any `.vp-doc <class> a` control whose color must survive hover has to re-assert `color` in
  its own `:hover` rule. Verify interactive states (hover/focus/active), not just static render.
- **(Sites) Nothing flips per mode any more, so a fixed hex in the site CSS is a FOSSIL** — convert it
  to a token. (The old rule was "a mode-flipping token is unsafe on ground that doesn't flip", which is
  why the CTAs and the terminal once carried literal `#b3261e` / `#f0705f`. ADR 0014 retired all of
  them.) The one legitimate literal left is the CodeMirror lint squiggle's data-URI hex — a `var()`
  cannot cross into an SVG — so keep it in step with `--redline` / `--warn-ink` by hand.
- **(Sites) The public hosts are `archlang.uk` / `playground.archlang.uk`, served by Cloudflare
  Workers — the old `*.vercel.app` URLs are gone from source AND gone from the internet** (they used
  to 301 onward; they died with the Vercel projects in the 2026-09 hosting migration, which changed
  no URL of ours). If you ever change a public host again: grep the host **prefix without dots**
  (`archlang-playground`, not
  `archlang-playground.vercel.app`) — some references are regexes with escaped dots (e.g.
  `test/readme-permalink.test.ts`) that a literal-dot grep misses. Edit sources and regenerate (schema
  `$id`s in `src/plan-json.ts`/`src/intent.ts` → `gen:*-schema`; agent-context URLs in `SKILL.md` →
  `gen:llms`); never hand-edit `schemas/*.json` or `llms-full.txt`. The README `#z=` permalinks are
  base-independent, so only the host prefix swaps. Full playbook: `docs/hosting-and-domains.md`.
- **(Sites) The two sites have an SEO/GEO surface, mapped in [`docs/seo.md`](../seo.md)** — robots,
  sitemaps, canonical + `PAGE_META`, JSON-LD, the playground intro band and its 27 static example
  pages. Three rules get broken. **Static bytes are all an AI crawler sees**: none of them executes
  JavaScript, so anything a script paints is invisible. **The hand-written copy tables** (`PAGE_META`,
  `EXAMPLE_ROWS`) are gated by killed-claim regexes — fix the copy, never widen the regex. And
  **`/embed.html` is de-indexed by an `X-Robots-Tag` header, not a `robots.txt` Disallow**: a Disallow
  stops the fetch, and a header nobody fetches de-indexes nothing. A fourth, learned in PR #99:
  **`_headers` binds to the REQUEST path**, so `/` and `/index.html` each need their own rule — the
  `/ → /index.html` rewrite carries none across (measured on a local `wrangler dev`).
- **(Sites) `vitepress preview` caches its file index at STARTUP, so a server left running across a
  rebuild serves a 200 for the page and a 404 for the new hashed CSS.** The asset name carries a
  content hash, so a rebuild renames it; the old server has never heard of the new name and the
  browser gets an entirely unstyled page. What that looks like in a probe is the trap: every
  measurement comes back plausible and wrong — `.aside-container` computes to `position: static`
  rather than `fixed` OR `sticky`, the outline has zero links, the footer's own `z-index` reads
  `auto` — which is indistinguishable from "the change broke the site", and is exactly the false
  negative a fix would be reverted over. **Restart the preview after every build**, and confirm a
  POSITIVE marker off the wire before trusting a number (`curl` the page, pull its
  `assets/style.*.css` and grep for a declaration only the new build has). A second edge with the
  same shape: the port. Both sites' preview servers and both E2E configs use fixed ports, and a
  parallel worktree running its own `preview` will hold one — a `--strictPort` loser started in the
  background dies into its log while `curl` still answers 200 **from the other checkout**, so the
  numbers describe somebody else's branch. Give a measurement server a port of its own and gate it on
  a marker, never on a status code.
- **(Parallel worktrees) A worktree is isolated from OTHER worktrees, not from a second actor in
  the SAME one.** A reviewer verifying a branch and the agent writing it share one working directory,
  and `git checkout` there is global to it: a throwaway `git checkout -b probe` silently redirects
  every commit the other party makes until they check back out. Measured on 2026-09-20 — a reviewer
  planted a secret-scanner probe on a temporary branch inside a live worktree; the agent's next
  `git add -A && git commit` landed on the PROBE branch, the checkout back left the real branch
  without that work, and the agent nearly reported it as delivered. The branch was then merged at its
  stale tip and pushed, shipping a card sentence whose "above" inverted its own meaning. Nothing
  fails: the commit succeeds, the tree is clean, and `git log` on the branch simply does not show it.
  **Verify a branch from a SEPARATE checkout** (another worktree, or a clone), never by switching
  branches inside one somebody is working in; if you must, `git -C` a different path rather than
  `cd`+`checkout`. Before merging an agent's branch, re-read its tip — `git rev-parse` it against
  what the agent last reported — because a stale tip merges cleanly and says nothing.
- **(Parallel worktrees) A clean auto-merge is NOT evidence of correctness when one branch MOVED a
  function another MODIFIED.** v1.25.0's closest call: one agent fixed `windowFacing` in
  `describe.ts` while a second, branched earlier, *extracted that function into a new
  `src/site.ts`* — carrying the pre-fix body. Git conflicted only on the doc comment; taking
  "theirs" would have **silently reverted the fix with a fully green suite**, because the moving
  branch had no courtyard fixture to fail. The typechecker then caught the second half — the new
  lint rule still called the old 4-arg signature, which would have let `arch lint` and `arch
  describe` disagree about a window's facing (invisible on a rectangular plan, wrong on a
  courtyard). **When merging parallel agent branches: diff the MOVED body against the newer
  version, and run both branches' fixtures TOGETHER** — that pairing is the only real proof, and
  neither branch can produce it alone.
- **(Docs vs npm) Pushing to `main` deploys the docs site; only a `v*` tag moves npm.** So a
  language feature merged and not released puts `archlang.uk` in the position of documenting syntax
  `npx @chanmeng666/archlang` cannot parse. This actually happened between the v1.25.0 merges and
  the release (the live reference served `site { … }` and `door pocket … slide left` while npm was
  still 1.24.0). If you land a language surface and are not releasing it the same day, say so
  explicitly — the mismatch is invisible from inside the repo, where everything is consistent.
