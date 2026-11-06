# ArchLang Playground

A Vite + CodeMirror 6 web app that edits `.arch` source and shows the compiled SVG
floor plan live, entirely client-side. **Not published** — it's a dev/demo app that
consumes the built core (`../dist/index.js`). Deployed at
[playground.archlang.uk](https://playground.archlang.uk).

## Features

- **View mode by default:** a visit opens on the drawing alone (the default example's, written into
  `index.html` at build time by `scripts/gen-static.mjs`, so it is there before any JavaScript).
  The header holds the plan picker, **Source** (edit mode: the editor beside the drawing),
  **Tools** (every action below, in one menu) and **Make your own**. `&edit` in the hash
  (`#z=…&edit`, or `#edit`) opens edit mode; `arch link` and the docs' "Open in playground" add it,
  and a link copied here does not. The compiler, the editor, the panels, three.js, the GLB writer
  and jsPDF are their own chunks, loaded after the first paint or on first use.
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
  stage and a dot on **Source**; `#statusText` stays a live region either way.
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
- **Export:** **copy** SVG/PNG to the clipboard, or **download** SVG / PNG / DXF / PDF.
  Exports strip the `data-span` annotations, so downloaded files stay clean.
- **Layout:** draggable resizable split, 5 render themes, 2 lint profiles; responsive —
  at ≤900px view mode is the drawing full screen, and edit mode shows one of
  **Code / Plan / Problems** at a time under a sticky switcher (Problems: the diagnostics over
  the Checks tab's content), with touch-sized controls and no sideways scroll.

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
| `shell.ts` | the header's Source toggle, Tools menu (which opens no tab) and Make-your-own dialog |
| `checks-panel.ts` / `checks-overlay.ts` | the Checks layer (lazy): the review rings over the drawing and their findings list, over the drawing in view mode, docked in the Checks tab in edit mode |
| `level-switcher.ts` / `levels.ts` | the one storey switcher, on the stage under Plan \| 3D |
| `compiler.ts` | the compiler functions main.ts calls, behind its one dynamic import (the `compiler` chunk, named in `vite.config.js`) |
| `edit-mode.ts` | edit mode, loaded on first entry: the editor, diagnostics, Describe (the Facts tab), Lint (Repair, Suggest) and Intent (the Checks tab) |
| `editor-setup.ts` | CodeMirror instance: extensions, theme, linter, completion |
| `arch-language.js` | **GENERATED** by `scripts/gen-grammars.ts` — StreamLanguage + linter. **Do not hand-edit** (CI fails on drift); edit `src/grammar/tokens.ts` and run `npm run gen:grammars`. |
| `arch-completion.ts` | CodeMirror `autocompletion` over the core `completion()` (hand-written) |
| `preview.ts` / `pan-zoom.ts` | SVG preview + circulation Paths overlay; CSS-transform pan/zoom/fit controller |
| `interact.ts` | hover-room tooltip + click-to-source (`data-span`) |
| `actions.ts` | header actions: **Format**, **Finish** (core `finish()`, one undo step, log in the Checks tab's Lint section), **Repair furniture**, **Embed**, copy-link, **Open in Claude / ChatGPT** |
| `llm-prompt.ts` | builds the **Copy for LLM** payload (source + `describe()` facts + diagnostics) and the short **Ask AI** prompt and chat-host URL |
| `embed-snippets.ts` | the Embed dialog's iframe and Markdown snippets (an example's hosted drawing, or a plain link) |
| `embed.ts` / `viewer.ts` | the chrome-less `embed.html` page and its viewer runtime |
| `facts-strip.ts` / `describe-panel.ts` / `takeoff-panel.ts` / `lint-panel.ts` / `intent-panel.ts` / `diagnostics-panel.ts` | the `describe()`/`lint()` fact & diagnostic panels (the facts line; the Facts and Checks tabs' sections; the diagnostics drawer) |
| `mobile-views.ts` | the ≤900px Code / Plan / Problems view switcher of edit mode (`main[data-mview]`; Problems opens the Checks tab) |
| `share.ts` | `#z=` deflate-raw permalink encode/decode (reads legacy `#src=`), the `&edit` mode flag and the `&3d` view flag; asks the Worker for a short link and reads `#s=<id>` |
| `preview3d.ts` / `plan3d.ts` / `glb-export.ts` | the 3D preview (lazy: three.js and archlang-3d), the plan → Mesh3D path it shares with Download GLB, and the GLB writer (its own lazy chunk) |
| `raster-export.ts` | copy/download SVG · PNG · DXF · PDF |
| `snapshots.ts` / `storage.ts` | named snapshot history UI + defensive `localStorage` helpers |
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
