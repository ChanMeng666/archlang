# ArchLang Playground

A Vite + CodeMirror 6 web app: edit `.arch` source with syntax highlighting and
inline lint, see the compiled SVG floor plan live, load examples, and download
the SVG. **Not published** — it's a dev/demo app that consumes the built core.

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
