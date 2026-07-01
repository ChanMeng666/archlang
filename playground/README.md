# ArchLang Playground

A Vite + CodeMirror 6 web app that edits `.arch` source and shows the compiled SVG
floor plan live, entirely client-side. **Not published** — it's a dev/demo app that
consumes the built core (`../dist/index.js`). Deployed at
[archlang-playground.vercel.app](https://archlang-playground.vercel.app).

## Features

- **Editor:** syntax highlighting, inline lint (from the compiler's `diagnostics`),
  and **autocomplete** (reuses the core `completion()` language service).
- **Preview:** live SVG with **pan / zoom / fit** and a floating toolbar; a **facts
  strip** showing `describe()` totals (rooms/doors/windows/area/entrance).
- **Editor ↔ plan linking:** **click any element** in the preview to jump the caret to
  its source (via `compile(..., { annotate: true })` → `data-span`), and **hover a room**
  for an area/size tooltip (geometric hit-test against `describe()` bboxes).
- **Persistence & sharing:** autosaved draft + named **snapshot history** in
  `localStorage`; a **compressed permalink** (`#z=` deflate-raw, still reads legacy `#src=`).
- **Export:** **copy** SVG/PNG to the clipboard, or **download** SVG / PNG / DXF / PDF.
  Exports strip the `data-span` annotations, so downloaded files stay clean.
- **Layout:** draggable resizable split, 5 render themes, 2 lint profiles; responsive.

## Module layout (`src/`)

| File | Role |
|------|------|
| `main.js` | app entry — editor init, render pipeline, permalink, exports, wiring |
| `arch-language.js` | **GENERATED** by `scripts/gen-grammars.ts` — StreamLanguage + linter. **Do not hand-edit** (CI fails on drift); edit `src/grammar/tokens.ts` and run `npm run gen:grammars`. |
| `arch-completion.js` | CodeMirror `autocompletion` over the core `completion()` (hand-written, kept out of the generated file) |
| `pan-zoom.js` | zero-dep CSS-transform pan/zoom/fit controller |
| `interact.js` | hover-room tooltip + click-to-source (`data-span`) |
| `snapshots.js` / `storage.js` | named snapshot history UI + defensive `localStorage` helpers |
| `examples.js`, `flowing-lines.js`, `style.css` | example plans, brand animation, styles |

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
