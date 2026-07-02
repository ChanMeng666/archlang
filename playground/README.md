# ArchLang Playground

A Vite + CodeMirror 6 web app that edits `.arch` source and shows the compiled SVG
floor plan live, entirely client-side. **Not published** — it's a dev/demo app that
consumes the built core (`../dist/index.js`). Deployed at
[archlang-playground.vercel.app](https://archlang-playground.vercel.app).

## Features

- **Editor:** syntax highlighting, inline lint (from the compiler's `diagnostics`),
  and **autocomplete** (reuses the core `completion()` language service).
- **Preview:** live SVG with **pan / zoom / fit** and a floating toolbar; a **facts
  strip** showing `describe()` totals (rooms/doors/windows/area/entrance); and a
  **Paths** toggle that overlays the human-**circulation** routes
  (`compile(..., { overlays: ["circulation"] })` — entrance→room walks + pinch markers).
- **IDE-parity actions:** **Format** (idempotent, comment-preserving source rewrite),
  **Repair furniture** (runs the deterministic `arch repair` corrector and shows the
  change log), and clickable diagnostics.
- **Editor ↔ plan linking:** **click any element** in the preview to jump the caret to
  its source (via `compile(..., { annotate: true })` → `data-span`), and **hover a room**
  for an area/size tooltip (geometric hit-test against `describe()` bboxes).
- **Embed:** an **Embed** button builds an `<iframe>` snippet pointing at the
  chrome-less viewer page (`embed.html`), which reads a plan from the `#z=` hash.
- **Persistence & sharing:** autosaved draft + named **snapshot history** in
  `localStorage`; a **compressed permalink** (`#z=` deflate-raw, still reads legacy `#src=`).
- **Export:** **copy** SVG/PNG to the clipboard, or **download** SVG / PNG / DXF / PDF.
  Exports strip the `data-span` annotations, so downloaded files stay clean.
- **Layout:** draggable resizable split, 5 render themes, 2 lint profiles; responsive.

The app is written in **TypeScript** (`src/*.ts`), typechecked as part of the build.

## Module layout (`src/`)

The playground is TypeScript; every module below is `.ts` except the generated grammar.

| File | Role |
|------|------|
| `main.ts` | app entry — editor init, render pipeline, permalink, panel wiring |
| `editor-setup.ts` | CodeMirror instance: extensions, theme, linter, completion |
| `arch-language.js` | **GENERATED** by `scripts/gen-grammars.ts` — StreamLanguage + linter. **Do not hand-edit** (CI fails on drift); edit `src/grammar/tokens.ts` and run `npm run gen:grammars`. |
| `arch-completion.ts` | CodeMirror `autocompletion` over the core `completion()` (hand-written) |
| `preview.ts` / `pan-zoom.ts` | SVG preview + circulation Paths overlay; CSS-transform pan/zoom/fit controller |
| `interact.ts` | hover-room tooltip + click-to-source (`data-span`) |
| `actions.ts` | header actions: **Format**, **Repair furniture**, **Embed**, copy-link |
| `embed.ts` / `viewer.ts` | Embed-snippet builder; the chrome-less `embed.html` viewer runtime |
| `facts-strip.ts` / `describe-panel.ts` / `lint-panel.ts` / `diagnostics-panel.ts` | the `describe()`/`lint()` fact & diagnostic panels |
| `share.ts` | `#z=` deflate-raw permalink encode/decode (reads legacy `#src=`) |
| `raster-export.ts` | copy/download SVG · PNG · DXF · PDF |
| `snapshots.ts` / `storage.ts` | named snapshot history UI + defensive `localStorage` helpers |
| `examples.ts`, `flowing-lines.ts`, `escape.ts`, `style.css` | example plans, brand animation, HTML-escape helper, styles |

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
