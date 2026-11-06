# ArchLang Playground

A Vite + CodeMirror 6 web app that edits `.arch` source and shows the compiled SVG
floor plan live, entirely client-side. **Not published** — it's a dev/demo app that
consumes the built core (`../dist/index.js`). Deployed at
[playground.archlang.uk](https://playground.archlang.uk).

## Features

- **View mode by default:** a visit opens on the drawing alone (the default example's, written into
  `index.html` at build time by `scripts/gen-static.mjs`, so it is there before any JavaScript).
  The header (ruling PG-D6) is one row: the brand, which is the page's one h1 ("ArchLang
  Playground" as real text), the plan gallery, **Source** (edit mode: the editor beside the
  drawing), **Share ▾**, **⋯** (More) and **Make your own**. There is no intro band: the page's
  lede, the canonical line from site-shared/doors.json, is small text at the right of the stage's
  foot, beside the facts line, in the served bytes. `&edit` in the hash
  (`#z=…&edit`, or `#edit`) opens edit mode; `arch link` and the docs' "Open in playground" add it,
  and a link copied here does not. The compiler, the editor, the panels, three.js, the GLB writer
  and jsPDF are their own chunks, loaded after the first paint or on first use.
- **Plan gallery (ruling PG-D2):** the header's one way to choose a plan. Its trigger names the
  plan on screen (`▦ Furnished Flat ▾`); it opens a grid of thumbnail cards under the example
  groups, each card a plan's clean name with any trailing parenthetical as a small grey tag
  (`plan-label.js`), then the playground-only "Try Checks" sample. Every example card is a real
  link to its static page, written into `index.html` at build time, so it works with no script
  and crawlers follow it; with script a plain click opens the plan here (a modified click keeps
  the link's meaning). The arrow keys, Home and End move through the grid, typing filters it by
  name, Escape closes it. Its thumbnails load on the first open, not before. On a phone it opens
  as a full-width two-column sheet.
- **One entry point per function (ruling PG-D3):** view mode has no tab row and no status row; the
  stage's **Plan | 3D** switch is its one view control. `&3d` in the hash (`#z=…&3d`, or `#3d`)
  opens on the 3D preview, the hash keeps it while the 3D preview is on screen, and a full link
  copied then keeps it too (a short link opens on the drawing). Edit mode's output pane has one
  row of four tabs, **Plan · 3D · Facts · Checks**, which replace the switch there: **Facts** is
  Describe and Takeoff (two sections, from the same `describe()` data; the takeoff loads on first
  open), **Checks** is the review findings, Lint (profile, Repair, Suggest, Finish results) and
  Intent. The **storey switcher** has one home, top-left on the stage under Plan | 3D, in both
  modes, driving every view. The **status** shows only while the plan is compiling (once that is
  slow enough to notice) or broken, or for a moment after an action: a dismissible notice on the
  stage and a dot on **Source**. Its live region is `#statusLive`, a visually hidden copy of the
  notice's text directly under `<body>`, so it is heard in every layout, the phone's Code view
  included.
- **One menu per kind of action (ruling PG-D5):** **Share ▾** holds Copy short link and Copy full
  link (with ADR 0034's note beside them), **Embed**, and **Export**: Copy SVG, Copy PNG and
  Download SVG · PNG · PDF · DXF · TXT · GLB (GLB is the whole plan, written in the page with its
  note that the browser does not validate it; it works whether or not the 3D view was opened, and
  loads the 3D chunk and the writer on the first click, as PDF loads jsPDF). **⋯** (More) holds the
  render theme and a11y, **Format / Finish / Saved** (they open the editor first), and the links
  (agents, docs, guide, reference, spec, example plans, npm, GitHub, ArchCanvas). **Make your own**
  holds every way to get a plan of your own and "Continue this plan with your AI": **Open in
  Claude ↗**, **Open in ChatGPT ↗** (the plan's share link in the host's URL, as the note beside
  them says; a plan too long is copied instead; an edit drops them to the bare host) and **Copy for
  LLM**. The stage toolbar is **− + ⤢ ⛶ · Checks · Paths**, one row on a phone too.
- **Editor:** syntax highlighting, inline lint (from the compiler's `diagnostics`),
  and **autocomplete** (reuses the core `completion()` language service).
- **Preview:** live SVG with **pan / zoom / fit** and a floating toolbar; a **facts
  strip** showing `describe()` totals (rooms/doors/windows/area/entrance); and a
  **Paths** toggle that overlays the human-**circulation** routes
  (`compile(..., { overlays: ["circulation"] })` — entrance→room walks + pinch markers); beside it
  a **Checks** toggle that rings what compile and lint warn about, as `arch preview --review`
  does (2D only: it leaves with the drawing in the 3D view; in view mode its findings list floats
  over the drawing, in edit mode it is the Checks tab's first section).
- **IDE-parity actions:** **Format** (idempotent, comment-preserving source rewrite),
  **Repair furniture** (runs the deterministic `arch repair` corrector and shows the
  change log), and clickable diagnostics.
- **Editor ↔ plan linking:** **click any element** in the preview to jump the caret to
  its source (via `compile(..., { annotate: true })` → `data-span`), and **hover a room**
  for an area/size tooltip (geometric hit-test against `describe()` bboxes).
- **Embed:** an **Embed** button builds an `<iframe>` snippet pointing at the
  chrome-less viewer page (`embed.html`), which reads a plan from the `#z=` hash.
- **Persistence & sharing:** autosaved draft + named **snapshot history** in
  `localStorage`; a **compressed permalink** (`#z=` deflate-raw, still reads legacy `#src=`), and
  on request a **short link** (`/s/<id>`, the plan stored on the server; ADR 0034) that opens the
  same permalink. `embed.html` reads `#s=<id>` too.
- **Export (Share ▾):** **copy** SVG/PNG to the clipboard, or **download** SVG / PNG / PDF / DXF /
  TXT / GLB. Exports strip the `data-span` annotations, so downloaded files stay clean.
- **Layout:** draggable resizable split, 5 render themes, 2 lint profiles; responsive —
  at ≤900px view mode is the drawing full screen, and edit mode shows one of
  **Code / Plan / 3D / Facts / Checks** at a time under a sticky switcher, its one view control
  there (Checks: the diagnostics over the Checks tab's content), with 44 px touch targets and no
  sideways scroll.

The app is written in **TypeScript** (`src/*.ts`). Note that `npm run build` does **not**
typecheck it — Vite strips types with esbuild without checking them. Run `npm run typecheck`
(in this workspace) or the repo-root `npm run typecheck:all` for that; both are in CI. The
typecheck resolves the bare `archlang` specifier to `../dist/index.d.ts`, so build the core
first (`npm run build` at the repo root).

## Module layout (`src/`)

The playground is TypeScript; every module below is `.ts` except the generated grammar.

| File | Role |
|------|------|
| `main.ts` | app entry, the view path (the startup chunk) — modes, the output tabs and the Plan \| 3D switch, the status, render pipeline, permalink, facts, storeys, lazy loading of everything below it |
| `shell.ts` | the header's Source toggle, the Share and More (⋯) menus (one open at a time; neither opens a tab) and the Make-your-own dialog (it forwards the sheet's chat links and Copy for LLM to actions.ts) |
| `checks-panel.ts` / `checks-overlay.ts` | the Checks layer (lazy): the review rings over the drawing and their findings list, over the drawing in view mode, docked in the Checks tab in edit mode |
| `level-switcher.ts` / `levels.ts` | the one storey switcher, on the stage under Plan \| 3D |
| `compiler.ts` | the compiler functions main.ts calls, behind its one dynamic import (the `compiler` chunk, named in `vite.config.js`) |
| `edit-mode.ts` | edit mode, loaded on first entry: the editor, diagnostics, Describe (the Facts tab), Lint (Repair, Suggest) and Intent (the Checks tab) |
| `editor-setup.ts` | CodeMirror instance: extensions, theme, linter, completion |
| `arch-language.js` | **GENERATED** by `scripts/gen-grammars.ts` — StreamLanguage + linter. **Do not hand-edit** (CI fails on drift); edit `src/grammar/tokens.ts` and run `npm run gen:grammars`. |
| `arch-completion.ts` | CodeMirror `autocompletion` over the core `completion()` (hand-written) |
| `preview.ts` / `pan-zoom.ts` | SVG preview + circulation Paths overlay; CSS-transform pan/zoom/fit controller |
| `interact.ts` | hover-room tooltip + click-to-source (`data-span`) |
| `actions.ts` | header actions: **Format**, **Finish** (core `finish()`, one undo step, log in the Checks tab's Lint section) and Saved (More); **Repair furniture**; Share's copy-link, **Embed**, Copy SVG / PNG and the downloads (GLB through the 3D chunk and `glb-export.ts`); the sheet's **Open in Claude / ChatGPT** and **Copy for LLM** |
| `llm-prompt.ts` | builds the **Copy for LLM** payload (source + `describe()` facts + diagnostics) and the short chat prompt and chat-host URL of **Open in Claude / ChatGPT** |
| `make-own.ts` | the Make-your-own sheet (lazy): the doors from `site-shared/doors.json`, "Continue this plan with your AI" (the chat links, their note, **Copy for LLM**), the two top asks |
| `glb-note.ts` | the GLB note's words beside Share → GLB (startup-safe: no writer, no three.js) |
| `embed-snippets.ts` | the Embed dialog's iframe and Markdown snippets (an example's hosted drawing, or a plain link) |
| `embed.ts` / `viewer.ts` | the chrome-less `embed.html` page and its viewer runtime |
| `facts-strip.ts` / `describe-panel.ts` / `takeoff-panel.ts` / `lint-panel.ts` / `intent-panel.ts` / `diagnostics-panel.ts` | the `describe()`/`lint()` fact & diagnostic panels (the facts line; the Facts and Checks tabs' sections; the diagnostics drawer) |
| `mobile-views.ts` | the ≤900px Code / Plan / 3D / Facts / Checks view switcher of edit mode, which replaces the tab row there (`main[data-mview]`; each view but Code opens its tab) |
| `share.ts` | `#z=` deflate-raw permalink encode/decode (reads legacy `#src=`), the `&edit` mode flag and the `&3d` view flag; asks the Worker for a short link and reads `#s=<id>` |
| `preview3d.ts` / `plan3d.ts` / `glb-export.ts` | the 3D preview (lazy: three.js and archlang-3d), the plan → Mesh3D path it shares with Share → Download GLB, and the GLB writer (its own lazy chunk) |
| `raster-export.ts` | the PNG/PDF rasterising and the download helper behind Share → Export |
| `snapshots.ts` / `storage.ts` | named snapshot history UI + defensive `localStorage` helpers |
| `gallery.ts` / `plan-label.js` | the header's plan gallery (opens a plan in place, marks the current one, filters, keyboard), and the label → name + tag split it shares with `scripts/gen-static.mjs` |
| `examples.ts`, `escape.ts` | example plans, HTML-escape helper |
| `styles/*.css` | the shell's styles, split by concern: `tokens.css` (the shared "Compile Boundary" brand tokens, byte-identical with the docs site), `chrome.css` (the cool light source-world header + the compile-seam divider), `editor.css`, `panels.css` (sheet-world output panels), `embed.css` (the chrome-less viewer) |

## The Worker (`worker/`)

The site is static assets plus one script, `worker/index.ts` (`main` in `wrangler.jsonc`), which
runs only for `/s/*` and `/api/*` (`assets.run_worker_first`): short links, stored in Workers KV
(`worker/app.ts`, `worker/share-core.ts`), and their 1200×630 card images, `/s/<id>.png`
(`worker/preview.ts`: the plan's `compile()` SVG rasterised by `@resvg/resvg-wasm` with the core's
Roboto; ADR 0034, `docs/hosting-and-domains.md`). wrangler
bundles it at deploy, against the built core. Locally: `wrangler dev --local` from this directory
after `npm run playground:build`; never `wrangler deploy` (CI deploys).

## Run

```bash
# from the repo root
npm run build                      # build the core into dist/ (the playground imports it)
npm install --prefix playground
npm run dev --prefix playground    # dev server with HMR
# or: npm run build --prefix playground && npm run preview --prefix playground
```

`vite.config.js` aliases `archlang` → `../dist/index.js`, so rebuild the core
(`npm run build`) after changing `src/`.

## How highlighting works — StreamLanguage, not Lezer

`src/arch-language.js` provides a CodeMirror 6 `StreamLanguage` that mirrors
`src/lexer.ts` token-for-token, plus a `HighlightStyle` and a `linter`.

The implementation plan floated a **Lezer** grammar. We deliberately use
`StreamLanguage` instead, because:

- ArchLang's lexer is **hand-written** (the single source of truth). A Lezer LR
  grammar would be a *second*, parallel definition that silently drifts from the
  real lexer.
- A correct LR grammar for the full language (expressions, points, dimensions,
  `let`/`component`) is brittle: a parse error anywhere degrades highlighting,
  whereas the stream tokenizer is robust and only ever classifies tokens.
- The acceptance — *highlighting + inline lint from `diagnostics`* — is fully met
  by `StreamLanguage`, with far less machinery and no grammar-compilation step.

The tmLanguage grammar in [`../editors`](../editors) covers the static
GitHub/TextMate highlighting case; this StreamLanguage covers the live editor.

## Lint

`archLinter()` runs `compile(source).diagnostics` and maps each `Diagnostic`'s
`span` (source offsets) to an editor range with its severity and `code`. Errors
keep the last good SVG preview; warnings render and annotate.
