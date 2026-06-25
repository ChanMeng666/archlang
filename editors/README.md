# ArchLang editor support

Editor tooling for `.arch` files. **None of this is part of the published
`@chanmeng666/archlang` package** — the core stays zero-dependency. The TextMate
engine used to verify the grammar (`vscode-textmate`, `vscode-oniguruma`) is a
dev-only dependency.

## `archlang.tmLanguage.json`

A TextMate grammar (scope `source.arch`) for syntax highlighting on GitHub
(Linguist) and in any TextMate-compatible editor. It mirrors `src/lexer.ts`:

| Token | Scope |
|-------|-------|
| `plan` `component` `let` `theme` `title` | `keyword.control.arch` |
| `wall` `room` `door` `window` `furniture` `dim` `column` | `storage.type.element.arch` |
| `units` `grid` `scale` `north` `at` `size` `width` `thickness` `material` `hinge` `swing` `label` `offset` `text` `close` … | `keyword.other.arch` |
| `up` `down` `left` `right` `in` `out` `mm` | `constant.language.arch` |
| `4000x6000` (literal dimension) | `constant.numeric.dimension.arch` |
| `123` `1.5` | `constant.numeric.arch` |
| `"…"` | `string.quoted.double.arch` |
| `# …` | `comment.line.number-sign.arch` |
| `-> + - * / % = : ,` | `keyword.operator.arch` |

`language-configuration.json` adds comment toggling, bracket matching, and
auto-closing pairs for editors that consume it (e.g. a VS Code extension).

## Verification

`test/grammar.test.ts` tokenizes `examples/studio.arch` with the real TextMate
engine (the same one VS Code/GitHub use) and asserts representative tokens land
in the expected scopes — so `npm test` / CI guard the grammar against
regressions.

## Using it in VS Code

A minimal extension contributes the grammar and language config:

```jsonc
// package.json (extension)
"contributes": {
  "languages": [{ "id": "arch", "extensions": [".arch"], "configuration": "./language-configuration.json" }],
  "grammars": [{ "language": "arch", "scopeName": "source.arch", "path": "./archlang.tmLanguage.json" }]
}
```

## Using it on GitHub

GitHub highlights via Linguist, which would need an entry mapping `.arch` to this
grammar (a `languages.yml`/`grammars.yml` contribution upstream). Until then the
grammar is consumable by editors directly.
