# ArchLang — VS Code extension

Published as [`ChanMeng.archlang`](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang).
Full IDE support for `.arch` files: TextMate syntax highlighting (the grammar from
[`../`](..), which also highlights the optional metric unit suffixes `4m` / `40cm` / `20mm`) plus a
proper **LSP language server** that reuses the core compiler's language services. It provides:

- **Live diagnostics** — errors and warnings from `compile().diagnostics`, as
  squiggles and in the Problems panel.
- **Hover** — element/keyword docs at the cursor.
- **Completion** — context-aware suggestions from the core `completion()` service.
- **Go-to-definition** — jump to where an `id` / binding / component is defined.
- **Rename** — rename an id/binding across the document.
- **Signature help** — parameter hints for functions and components.
- **Quick fixes** — code actions that apply a diagnostic's machine-applicable fix (in the core's
  deterministic `rankFixes` order), including the `W_ALIAS_MATCH` fix that inserts the explicit
  `uses …` for a room whose function was inferred from an indirect label alias.

**Not part of the published core.** All LSP deps live here; the core stays
zero-dependency. The extension depends on the core via `file:../..` and pulls it
in at runtime through a dynamic import (the core is ESM-only). The language-service
functions (`hover`/`completion`/`definition`/`rename`/`signatureHelp`) all live in
the pure core (`src/lsp.ts`); this server is a thin LSP adapter over them.

## Layout

- `src/diagnostics.ts` — pure mapping of `compile().diagnostics` → LSP diagnostics
  (dependency-injected `compile`, no LSP import). Unit-tested by the core suite:
  `test/lsp-diagnostics.test.ts`.
- `src/server.ts` — the language server: declares the hover/completion/definition/
  rename/signature-help capabilities and, on document change, compiles and
  `sendDiagnostics`. Each request delegates to the corresponding core function.
- `src/extension.ts` — the client: launches the server over IPC for
  `language === "arch"`.

## Build & run

```bash
npm run build                         # build the core (dist/) first
npm install --prefix editors/vscode   # installs LSP deps + links the core
npm run build --prefix editors/vscode # tsc -> editors/vscode/dist/
```

Then press **F5** in VS Code with `editors/vscode` open to launch an Extension
Development Host, and open any `.arch` file: keywords highlight and compiler
errors/warnings appear inline (squiggles + Problems panel).

> Packaging note: `contributes.languages`/`grammars` reference the grammar and
> language-configuration in `../`. For `vsce package`, copy those two files into
> this folder (or adjust the paths) so they're included in the `.vsix`.
