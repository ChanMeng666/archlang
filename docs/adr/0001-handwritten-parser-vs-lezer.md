# 1. Hand-written recursive-descent parser, not Lezer/tree-sitter

- **Status:** Accepted
- **Date:** 2026-06 (v1.0)

## Context

ArchLang needs a parser that (a) stays zero-dependency, (b) produces precise byte
spans for diagnostics and the LSP, (c) recovers from errors instead of bailing on
the first one, and (d) feeds both the compiler and the editor grammars. A common
alternative is a parser generator such as Lezer (the CodeMirror parser system) or
tree-sitter, driven by a declarative grammar.

## Decision

Keep the hand-written lexer (`src/lexer.ts`) + recursive-descent parser
(`src/parser.ts`). A single grammar token table (`src/grammar/tokens.ts`) is the
source of truth for keywords/operators; `scripts/gen-grammars.ts` generates the
TextMate and CodeMirror grammars from it, and a drift test asserts they stay in
sync. Element syntax is parsed through the open element registry, so adding an
element is one module — no grammar regeneration.

## Consequences

**Pros.** Zero runtime dependency. Full control over error recovery (the parser
emits `ErrorNode`s and resynchronises at statement starts, so one typo doesn't
sink the rest of the file). Byte-accurate spans for every node, which the LSP and
the framed diagnostics rely on. The registry-driven element parsing is an
extension point a fixed generated grammar could not offer as cleanly.

**Cons.** We hand-maintain the parser rather than a declarative grammar, and the
editor grammars are generated from a separate token table (kept honest by the
drift test) rather than sharing the parser's own grammar. For a language this size
(~7 element kinds + a small expression grammar) the maintenance cost is low and
the control is worth it.
