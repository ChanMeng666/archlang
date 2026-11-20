# AI-first language: what ArchLang can borrow from TypeScript, Rust and AI-native languages

Research record, 2026-11-18. **Status: building since RM-D65** (the owner, 2026-11-18,
`../product-roadmap/README.md` §6.28), which ended the research stage of RM-D64 (§6.27). AF9 is
phase A only (RM-D70, §6.32). The cards are queued as track 10 of
`../product-roadmap/cards.md` (RM-D15: one queue). The four decisions this research raised are
RM-D60…RM-D63 (same section). Card designs live here; status, size, dependencies and gates live in
`cards.md`.

**Origin.** The owner asked (2026-11-18) whether the claim "TypeScript and Rust are the best
languages of the AI era" holds, and what ArchLang should borrow, given that ArchLang's first
priority is to be understood, written and verified by AI (humans are not expected to learn it).
The owner asked for source-level study of comparable projects, the literature, and any other source
that can be read; no development.

## How to use this document

1. §1 answers the question; §2–§4 give the evidence; §5 is ArchLang's measured position; §6
   the findings reproduced on the CLI.
2. §7 is the card design (AF0…AF26). Before taking a card, read its row in §7, its gate in
   `../product-roadmap/cards.md` track 10, and the rulings RM-D60…RM-D64.
3. §8 lists what not to borrow, §9 the evidence's weak points. A claim marked *unverified* is a
   lead, never a citation.
4. `file:line` anchors refer to `main@d828bf7a` (2026-11-18). Re-read them before acting.

## Method

Five read-only research tracks ran on 2026-11-18, one agent each, and a coordinator checked the
load-bearing claims:

| Track | What was read |
|---|---|
| Internal inventory | `spec.llm.md`, `docs/adr/`, `src/diagnostics.ts`, `src/error-catalog/`, `src/manifest.ts`, `src/cli/`, `packages/mcp`, `eval/`, `dataset/`, `editors/vscode`, `docs/backlog.md` |
| TypeScript | Sparse clones of `microsoft/TypeScript` (`release-6.0` `050880ce` for the JS compiler; `main` `68672025`, now the Go port), `microsoft/language-server-protocol` 3.18; papers and interviews (§2) |
| Rust | Sparse clones of `rust-lang/rust` (`rustc_errors`, `rustc_error_codes`, `rustc_lint_defs`, lint docs), `rust-lang/rust-clippy`, `rust-lang/cargo` (`cargo fix`, `rustfix`), `rust-lang/edition-guide`; papers (§3) |
| Literature | About 45 sources; about 25 arXiv PDFs had their results tables read from the text (§4) |
| AI-native and adjacent languages | Sparse clones of MoonBit (`moonbit-docs`, `core`), Zoo KCL (`KittyCAD/modeling-app`), CUE, Pkl, Nickel, KCL (config), Typst, D2, Gleam, Elm (`compiler`), Unison, Darklang, build123d, and three 2026 "language for agents" projects (zerolang, Vera, nanolang) |

No builds and no installs ran on the clones. The probes below ran against the CLI built from
`main` (`dist/cli.js`), writing to stdout only.

## 1. The answer in short

**The claim is half supported.**

- **Supported.** What helps is a **cheap, deterministic checker** that names the problem at an exact
  span, explains it and offers a fix, exposed as services an agent calls in a loop.
  - TypeScript: 94% of the compile errors LLMs make in TypeScript are type errors and 6% are syntax
    errors. Constraining generation by the types removes more than half of them and lifts repair
    by 37% relative (Mündler et al., PLDI 2025).
  - Rust: RustAssistant fixes about 74% of real compile errors by iterating with rustc's own
    structured messages (ICSE 2025).
- **Not supported.** No controlled study shows Rust is intrinsically better for agents.
  - The widely shared essays are opinion.
  - The best model translates 47% of real C samples to Rust (arXiv:2405.11514).
  - MultiPL-E found no overall effect of type annotations on pass@1 (p = 0.33).
- **Not borrowable.** Both languages benefit from a vast training corpus. Hejlsberg: "New
  languages are actually disadvantaged."

**ArchLang already has most of the supported half**:
- catalogued codes with byte spans;
- rustc-style applicability tiers and an atomic fix applier (ADR 0011);
- a fix loop that rolls back a pass that makes things worse;
- `--json` everywhere, the MCP server, `next`, `--stage`, `--expected-hash`, and `keep`.

So **what is worth borrowing is the information density of the diagnostics and the
change-management machinery**, not a type system or a borrow checker.

**ArchLang's bottleneck is semantic, not syntactic.** On the 26-brief eval fixture, live runs
compile 13–22 of 26 and come back lint-clean on 0–6 of 26 (§5), and most of the compile errors
that remain are semantic refusals of an opening, not syntax (EV.1: six of seven). The literature says the levers for that layer are relational defaults,
precise actionable diagnostics and worked examples. Grammar-constrained decoding is not one of them
(§4). The cards are therefore ordered by expected effect on soundness and intent, not by
resemblance to TypeScript or Rust.

## 2. TypeScript: what the evidence and the source say

| Claim | Evidence | Reading |
|---|---|---|
| Types help LLMs | Mündler, He, Wang, Sen, Song, Vechev, *Type-Constrained Code Generation with Language Models*, PLDI 2025, https://arxiv.org/abs/2504.09246 (pp. 171:1–171:3 read). 94% of compile errors are type errors, 6% syntax. Type-constrained decoding "reduces compilation errors by more than half", lifts functional correctness 3.5–5.5% relative, and lifts repair by 37% relative | The value is that types are **checkable**, not that they make the model smarter |
| Types reduce bugs | Gao, Bird, Barr, *To Type or Not to Type*, ICSE 2017, https://janvitek.org/events/NEU/7575/pubs/no-type.pdf (p. 758): about 15% of the public bugs studied are detectable by TypeScript or Flow | Human-written bugs, not LLM output |
| Annotations help generation | Cassano et al., MultiPL-E, https://arxiv.org/abs/2208.08227 §6.2: "no overall effect" (p = 0.33). Replacing TypeScript's precise types with `Any` costs 2.5% (p < 0.001) | Counter-evidence; the effect is small and language-specific |
| Corpus matters | Cassano et al., MultiPL-T, OOPSLA 2024, https://arxiv.org/abs/2308.09895. Hejlsberg interview, GitHub Blog 2025-11-06: "New languages are actually disadvantaged"; AI "doesn't need an IDE … It needs the services" | ArchLang cannot borrow the corpus; it can borrow "the services" |
| TS is now #1 on GitHub | GitHub Octoverse 2025, https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/ | Adoption, not mechanism |
| "Hejlsberg dismisses AI-first languages" | Only in an aggregator summary | **Unverified; do not cite** |

**Mechanisms read at source.** The `ts6` paths are `release-6.0`; `tsgo` is the Go port on `main`.

- **Related information on a diagnostic** reaches LSP clients:
  - `relatedInformation`, `src/compiler/types.ts:7259-7297` (ts6);
  - `ls/lsconv/converters.go:506-561` (tsgo).
- **Spelling suggestion** (`core.ts:2155-2233`, ts6):
  - a case-only difference costs 0.1;
  - suggestions are capped at 10 per file (`checker.ts:2355`);
  - it also covers closed sets of allowed words (`checker.ts:22679-22683`);
  - **one** spelling codefix serves 14 error codes under one fix-all id
    (`codefixes/fixSpelling.ts:46-76`).
- **An error type stops cascades.** An unresolved name gets the error type, and later checks
  return early on it (`checker.ts:2082, 38269`).
- **Error elaboration chains** (`checker.ts:21371`, `utilities.ts:8751`). LSP flattens the chain to
  prose (`converters.go:615-621`), which is a loss ArchLang should not copy.
- **Error codes are a contract.** They survived the rewrite into Go unchanged (2322 is still
  2322), and `getSupportedErrorCodes()` publishes the fixable set (`codeFixProvider.ts:66-67`).
- **LSP 3.18** gives a diagnostic `data` (fixes travel with it), `codeDescription` (a link to the
  explanation), and `isPreferred` on a code action.
  - Sources: `types/diagnostic.md:10-71`, `codeAction.md:515-525`.

Not borrowed, with reasons in §8: structural and gradual typing; `satisfies` (ArchLang's `keep`,
ADR 0033, already plays that role); exhaustiveness checks (an internal concern the element registry
already covers).

## 3. Rust: what the evidence and the source say

| Claim | Evidence | Reading |
|---|---|---|
| A strict compiler gives agents a tight loop | Deligiannis, Lal, Mehrotra, Rastogi, *RustAssistant*, ICSE 2025, https://arxiv.org/abs/2308.05177. About 74% of real compile errors fixed by iterating with rustc. The prompt is the error text, plus `--explain` output, plus snippets chosen from the error's related spans. Clippy warnings fixed at 75%, "almost 2.4 times better" than Clippy's own autofix | The lever is **structured, located, explained diagnostics** |
| LLMs write Rust well | Eniser et al., https://arxiv.org/abs/2405.11514: the best model translates 47% of real-world C. RustRepoTrans, https://arxiv.org/abs/2411.13990: at most 51.5% Pass@1 | Counter-evidence |
| "Lost in Translation" shows Rust is hard | Pan et al., ICSE 2024, https://arxiv.org/abs/2308.03109 | It covers C, C++, Go, Java and Python, **not Rust** |
| "Rust is the native language of agentic development" | GoDaddy, 2026-07-06 | Opinion; it calls its ideas "working premises rather than settled conclusions" |
| Error-message design history | Turner, *Shape of errors to come*, 2016, https://blog.rust-lang.org/2016/08/10/Shape-of-errors-to-come/; Czaplicki, *Compiler Errors for Humans*, 2015, https://elm-lang.org/news/compiler-errors-for-humans | Rust copied Elm; ArchLang copied rustc (ADR 0011) |

**Mechanisms read at source** (`rust-lang/rust` unless named):

1. **Every span in JSON carries `is_primary` and `label`** (`rustc_errors/src/json.rs:185-208`).
   The long explanation can travel inline (`json.rs:236-242, 322-327`).
2. **Applicability tiers** (`rustc_errors/src/lib.rs:91-104`): `MachineApplicable`,
   `MaybeIncorrect`, `HasPlaceholders`, `Unspecified`. Tool-only suggestions are hidden from human
   output but visible to tools.
3. **Error-code pages pair a wrong example with a corrected one**, and both run as tests
   (`rustc_error_codes`, e.g. `error_codes/E0382.md:1-37`). Clippy's lint docs end with "Use
   instead" (`book/src/development/adding_lints.md:591-603`).
4. **Lint levels and `#[expect]`** (RFC 2383; `rustc_lint_defs/src/lib.rs:161-172`).
   - `expect` warns when the expected lint stops firing (`src/doc/rustc/src/lints/levels.md:37-43`).
   - Every level can carry a `reason`.
   - `Forbid` cannot be lowered.
5. **Clippy categories by confidence** (`declare_clippy_lint/src/lib.rs:156-274`).
   - `correctness` is deny-by-default and meant to be free of false positives.
   - `pedantic` and `nursery` are allow-by-default.
6. **Editions** (`edition-guide/src/editions/index.md:13-27`).
   - They are opt-in and "skin deep", and every edition compiles to one internal form.
   - Each breaking change is a machine-applicable lint in a `rust-20xx-compatibility` group
     (`rustc_lint_defs/src/lib.rs:398-410`).
   - `cargo fix --edition` applies those lints and silences unrelated ones during the migration
     (`cargo/src/ops/cargo_fix/mod.rs:1306-1314`).
7. **Diagnostics are typed structs**, and one that is built but never emitted panics
   (`rustc_errors/src/diagnostic.rs:340-353`).
8. **Units of measure as types** (`uom`, https://github.com/iliekturtles/uom; `dimensioned`).
   `length + time` is a compile error at zero runtime cost.

Not borrowed, with reasons in §8: a borrow checker or ownership types; exhaustive `match`.

## 4. The literature: principles for an AI-first DSL

Ranked by evidence strength × relevance. **Strong** means several peer-reviewed studies with
controlled numbers; **moderate** means one controlled study or several indirect ones; **weak** means
essays, vendor claims or a single workshop paper.

| # | Principle | Evidence (numbers quoted from the sources) | Strength | ArchLang |
|---|---|---|---|---|
| P1 | **Models state relations; the compiler computes coordinates** | Holodeck, CVPR 2024, https://arxiv.org/abs/2312.09067, Table 1: GPT-4 absolute placement 0.364, random 0.369, relational constraints plus solver 0.706. LayoutGPT, NeurIPS 2023, https://arxiv.org/abs/2305.15393: 43–55% of 3D rooms out of bounds with numeric placement. Tell2Design, ACL 2024, https://arxiv.org/abs/2311.15941: only 38% of a trained model's plans "meet all" instructions | Strong | Done: relational placement (ADR 0004), `walls from rooms` (ADR 0028), hosted openings. Gap: absolute `at (x,y)` stays the default for rooms |
| P2 | **An external deterministic checker beats self-critique** | Huang et al., ICLR 2024, https://arxiv.org/abs/2310.01798. Olausson et al., ICLR 2024, https://arxiv.org/abs/2306.09896: GPT-4's own feedback was wrong in 32/80 cases vs 7/80 for humans. Self-Debug, ICLR 2024, https://arxiv.org/abs/2304.05128: the gains need execution information | Strong | Done |
| P3 | **A loop is credited only against equal-budget resampling** | Olausson 2024; Large Language Monkeys, https://arxiv.org/abs/2407.21787 (15.9% → 56% at 250 samples); Codex pass@k, https://arxiv.org/abs/2107.03374 | Strong | Done (the L2 control arm). The T3 run's only statement is its published record, `eval/live-runs/2026-11-t3-result.md` |
| P4 | **Design for transfer from what models already write; name foreign forms in diagnostics** | SPEAC, NeurIPS 2024, https://arxiv.org/abs/2406.03636: 24–28/33 parse vs ≤ 4/33 for few-shot, fine-tuning and self-repair. CangjieBench, https://arxiv.org/abs/2603.14501: about 59% of failures are syntax borrowed from other languages. CAD-Recode and Text-to-CadQuery reuse Python; LayoutGPT reuses CSS | Strong | Partial: tuples, `WxH`, unit suffixes, order-free clauses, some did-you-mean. Gap: no classified corpus of foreign-syntax attempts (AF21) |
| P5 | **Semantic constraints help; syntax-only constrained decoding barely does** | Grammar Prompting, NeurIPS 2023, https://arxiv.org/abs/2305.19234, Table 1: constrained decoding alone +0.4 on GeoQuery. Mündler 2025 (types). JSONSchemaBench, https://arxiv.org/abs/2501.10868: at most +4% | Strong | Partial: `grammars/archlang.gbnf` exists, drift-tested, never used in an eval. Low priority: the compile errors that remain are mostly semantic refusals (EV.1) |
| P6 | **Teach with worked examples; rule prose is for checking** | Aycock et al., ICLR 2025, https://arxiv.org/abs/2409.19151: "almost all improvements stem from the book's parallel examples rather than its grammatical explanations" | Moderate–strong | Partial: the ` ```arch ` blocks hold ~3.9k of the spec's ~29.6k characters (~13%, measured); never ablated (AF23) |
| P7 | **Diagnostics must be precise and actionable; vague ones are worse than none** | Deo, Campanoni, McMichen, arXiv:2604.13927 (3-page workshop paper): precise remarks 3.3×, ambiguous ones "actively detrimental". RustAssistant ~74%. FeedbackEval, https://arxiv.org/abs/2504.06939: bare compiler feedback 49.2% vs mixed 63.6% | Moderate (no study isolates wording) | Done in kind; the density gaps are AF1–AF8 |
| P8 | **A short curated cheat-sheet beats doc retrieval** | CangjieBench: a 2,146-token cheat-sheet 50.4 pass@1 vs 26.2 for retrieval over the official docs. Bassamzadeh and Methani, https://arxiv.org/abs/2407.02742: "too many API descriptions can confuse" | Moderate | Done (one spec, ADR 0009), at ~4× that size; a shorter core never measured |
| P9 | **Self-verified synthetic data is the scalable route to weights that know the language** | MultiPL-T: OCaml 6.9 → 19.9. RLVR floor plans, https://arxiv.org/abs/2605.14117: ≥ 94% relative reduction in compatibility error | Strong for fine-tuning | Done as data (ADR 0013); the project does not train |
| P10 | **Measure fidelity to the brief apart from validity** | Tell2Design's IoU vs 38% "meet all" | Moderate | Done (the fidelity slice includes infeasible briefs) |
| P11 | **Constrain only the artifact, never the reasoning** | Tam et al., https://arxiv.org/abs/2408.02442: JSON mode −27 points on GSM8K. Contested by the vendor-written dottxt reply, https://blog.dottxt.ai/say-what-you-mean.html | Moderate, contested | Done by construction (`eval/live-author.ts` forces no output format) |
| P12 | **Token economy is second-order; retries dominate agent cost** | SimPy, https://arxiv.org/abs/2404.16333 (8.6–34.7% fewer tokens, needs fine-tuning). Formatting study, https://arxiv.org/abs/2508.13666. *Tokenmaxxing*, https://arxiv.org/abs/2607.22807 | Moderate | Partial: tokens-to-sound never measured (AF22) |
| P13 | **Explicit, or every inference observable** | MultiPL-E (precise types beat `Any`); Ronacher, *A Language For Agents*, https://lucumr.pocoo.org/2026/2/9/a-language-for-agents/ (essay) | Weak–moderate | Partial: walls, areas and clearances are derived and visible only through `describe` (AF17) |
| P14 | **Local reasoning and stable output** | Ronacher; MoonBit's flat top level (vendor) | Weak | Done |
| P15 | **Measure the repairer's dividend apart from the model** | SPEAC; type-constrained repair | Moderate | Done (`fix`, `repair`, the L1 tier) |

### What the AI-native and adjacent languages add (mechanisms read at source)

| Mechanism | Source | ArchLang today |
|---|---|---|
| Element-addressed edit operations that recompile after each step and refuse stale input | D2 `d2oracle/edit.go` (`Create` :31, `Set` :80, `Delete` :937, `Rename` :1699, `Move` :1760); Zoo KCL `frontend/sketch.rs:85-135` (operations carry a `Version`, stale refused at `api.rs:225`); zerolang `zero patch` (`program_graph_patch.c:214-227`, expected vs actual per operation) | `--expected-hash` covers whole files only; `impact --set` edits `let` values only → AF13 |
| A conflict lists every contributing position | CUE `adt/errors.go:201-213, 566-583`; Nickel "evaluated to this value" labels (`error/mod.rs:1619-1690`); Pkl 0.31 prints each sub-expression under a failed constraint | `W_KEEP_VIOLATED` (`src/keep.ts:374-381`) has values in hints, no related spans → AF7 |
| A paired error example and fixed example per code, both run in CI | MoonBit docs (`_error/` must raise the code; `_fixed/` must pass `moon check` with no warnings) | One raising example per code (`src/error-catalog.ts:35-46`) → AF5 |
| Free / Fixed / Conflict state per point | Zoo KCL `sketch_solve.rs:37-55, 585-594`; LLM4CAD-Editor, https://arxiv.org/abs/2606.20607 (1.4× editing robustness when referencing features by name) | Placement provenance not reported → AF17 |
| Intent-preserving codemods | Gleam's 50 code actions (`language-server/src/code_action.rs`); KCL `PRINCIPLES.md:38-50` ("honour the initial KCL intent, whether it was written by a person, LLM, or generated by another codemod") | `reroll`, `repair`, `finish`, `fix` → AF16 |
| Id stability across edits | Unison (definitions identified by a hash of the syntax tree); D2 `MoveIDDeltas`/`DeleteIDDeltas`/`RenameIDDeltas` (`edit.go:2778, 2972, 3163`) | Auto ids are positional and shift (`src/lock.ts`) → AF14 |
| A minimal grammar slice per task | Grammar Prompting: the full grammar "did not yield any improvements", a per-example minimal grammar did | The `furniture` signature line in `spec.llm.md:82` is over 1,500 characters → AF18 |
| A grammar plus a one-violation membership corpus | Zoo `kcl-grammar` (a reference recogniser; every failing file holds exactly one violation); OpenAI custom tools accept Lark grammars (secondary sources only; an OpenAI forum thread disputes guaranteed conformance) | GBNF only → AF20 (low) |
| A version declared in source | KCL `@settings(kclVersion = 3.0)` (`known-issues.md:22`); DIAGRAM-FAIL-BENCH (NeurIPS 2026) tests models against stale syntax | No version in `.arch` → AF15 |
| Spec-size measurement | VeraBench (self-reported: six of nine models write 100%-correct Vera from a 163 KB skill file, 60 problems); DIAGRAM-FAIL-BENCH: docs "improve render rates but fail to eliminate" constraint violations | Never measured → AF23 |

Not borrowed: MoonBit's token-level semantic sampler (hosted models expose no hook, and its paper PDF
link returns 404; its compile-rate gain appears only in a blog image); Vera's unnamed positional
references; build123d's sort-then-index selectors (ArchLang's `E_SEGMENT_SELECT`, which refuses
unless exactly one match, is the better design). Pel, Weft and Agentis appeared only in aggregator
articles and are left out.

## 5. ArchLang's measured position

**Counts** (`main@d828bf7a`):

| Measure | Value | Source |
|---|---|---|
| `spec.llm.md` | 29,932 bytes = 29,629 UTF-16 units, ~7.5k tokens | The cap is 30,000 UTF-16 units (`test/llm-spec-drift.test.ts:87` asserts `spec.length`), so **headroom is 371 units**. Any new language form needs spec room first |
| Full bundle (`arch context`) | ~176 KB | `src/context-size.ts` |
| Diagnostic codes | 270 (167 E, 103 W) | `docs/error-codes.md` |
| Codes with a machine span-edit fix | 26 of 270 | `test/fix-coverage.test.ts:14` |
| Fix applicability uses in `src/` | 25 machine-applicable, 10 maybe-incorrect, 4 has-placeholders | grep |
| Lint rules | 63 entries in `LINT_RULES` | `src/lint/rules/index.ts` |
| CLI commands / MCP tools | 26 (29 names with aliases; `arch manifest`) / 11 | `src/manifest.ts`; `packages/mcp/src/tools.ts` |

**Measured weak spots:**

1. **Soundness (lint-clean) is the weak axis.**
   - Offline goldens: valid 26/26, sound 4/26 (`eval/results.md`).
   - Live, Fable 5.2: sound 5, 5, 5 after CO-1 and 5, 4, 6 after CO-1 + CO-2 (three runs each,
     `eval/live-runs/2026-11-authorability-remeasure.md`).
   - Claude 5.5 models: Opus 2, Sonnet 4, Haiku 1 of 26 (`eval/live-runs/2026-10-27-claude-5.md`).
   - Current live baseline: valid 22, intent 9, sound 1 (RM-D52, `eval/live-baseline.json`). Live
     valid ranges 13–22 of 26 (`eval/live-runs/2026-10-27-claude-5.md`).
   - **Counter-evidence, on different briefs:** one-shot L0 sound on the model-authoring set is
     252/390 (Haiku), 351/390 (Sonnet), 247/390 (Opus) and 194/200 (Fable 5.2) (`dataset/CARD.md`).
     Those briefs are not comparable with the fixture, but the claim that orders the cards rests on
     the 26-brief fixture alone (§9).
2. **`W_DOORWAY_BLOCKED` appears in all 19 brief-runs that lost intent to physical lint**
   (`eval/live-runs/2026-11-ev1-intent-gap.md`).
3. **Six of the seven compile-error losses in EV.1 are refused openings**, none with a fix
   (backlog EV.5).
4. **The deterministic L1 tier (fix plus repair) moved soundness by nothing** on the gpt-5.5 runs
   (`dataset/CARD.md`).
5. **Syntax invention fell sharply after CO-1 and CO-2** (`eval/live-runs/2026-11-authorability-remeasure.md`).
   What remains: `offset`, `hinged`, and the kind word written after `width` (EV.8).

The failures that remain are the ones `fix` and `repair` do not touch. That is why the order below
puts semantic fixes (AF9) and diagnostic density (AF1–AF8) first.

## 6. Findings reproduced on 2026-11-18

Each was re-run by the coordinator against `dist/cli.js` built from `main`:

1. **`diagnosticToJson` never reads `relatedSpans`** (`src/diagnostic-json.ts:120-155`). The text
   output shows "first declared here", but `--json`, both MCP hosts and the VS Code mapping
   (`editors/vscode/src/diagnostics.ts:71-90`) drop it. Already listed in backlog M.15.
2. **`arch fmt --json` on a file that does not parse returns `"ok": true, "changed": false`.** The
   probe was a plan with an unknown statement `dor on a.top …`. An agent reads that as "formatted
   and fine". Backlog M.8 records the exit-0 half.
3. **No dimension check.** With `let W = 4m` and `let A = W*W`, writing `size A x 3000` compiles
   and lints with no size diagnostic, and `describe` reports one room 16,000,000 mm wide with
   48,000 m². `W_LENGTH_IN_METRES` (`src/ir/silent-accepts.ts`) catches only values that are too
   small.

The research agents found these too (each is noted against the card that would fix it):

- `dor` gets "Unknown statement" with no suggestion. `STRAY_CLAUSE_HINTS` (`src/parser.ts:83`,
  looked up at `:1732`) covers two words. → AF2
- `furniture sofaa …` gets `W_UNKNOWN_FURNITURE` with a fix, but its span is the whole statement
  and the fix reprints it (`(500,500)` becomes `(500, 500)`). → AF2
- `right-of hal` gets no hint, and its span covers the whole statement (`src/layout.ts:166-172`). → AF2
- An unknown name evaluates to zero after its `E_UNKNOWN_REF` (`src/expr.ts:915`, `return NUM0`),
  so `wdth` also yields a spurious "positive size" error. → AF3
- `size (A)x3000` reads `x3000` as a name: correct but confusing. → AF4
- Stale counts:
  - `test/error-catalog-examples.test.ts:89` says "50 of 155"; the catalogue now has 270 codes and
    66 exemptions.
  - `test/llm-spec-drift.test.ts:42`'s title says "< ~4.6k tokens" against a 30,000-unit cap.
  - Backlog U.2 and U.5 may be partly done (`W_LENGTH_IN_METRES`; `src/elements/wall.ts:53` accepts
    `id=` after the category). → AF0

**Irregular grammar rules the spec has to teach** (read from `spec.llm.md`; each one costs spec
bytes and is a place a model can guess wrong; P4 and Gleam's "one way to do it" argue for fewer):

- Rule 6: `id=` goes right after the element keyword, or after the kind word of `furniture`,
  `door`, `window`, `outdoor`, `wall` (`spec.llm.md:18`).
- Written out of the listed clause order, a parenthesised value (`rotate (90)`) reads as a call
  (`spec.llm.md:74`).
- `%` ends a position expression, so a modulo must be parenthesised (`spec.llm.md:79`).
- `swing in|out` is relative to the wall's drawn direction, so the spec recommends `inward|outward`
  (`spec.llm.md:79`).
- Door clauses depend on the door kind (`E_DOOR_KIND_CLAUSE`), and `wall …` pairs only with
  `at (x,y)` (`spec.llm.md:79`).
- The kind word after `width` is still a parse error (backlog EV.8).

AF26 audits them; any change to the grammar they lead to is a separate, ruled card.

**Fixed since (read 2026-11-21):** finding 1 by AF1 (#944); finding 2 by AF6 (#946); the `dor`,
`sofaa` and `right-of hal` items by AF2 (#978); `wdth`'s spurious error by AF3 (#951); the stale
counts by AF5 (#974) and AF0 (#983); U.2/U.5 by AF0 (U.2a holds U.2's rest, U.5 is narrowed); the kind word after
`width` by EV.8 (#943, same line only). Finding 3 is AF10's, not started.

## 7. Card design (AF0…AF26)

Columns: what each card borrows, what it changes, and the constraints from `AGENTS.md`. 🔒 means the
card depends on a ruling (RM-D60…D63). The status, size, model and gate of each card are in
`../product-roadmap/cards.md` track 10.

### Wave A: diagnostic density (cheap, additive)

| Card | Borrowed from | Design | Constraints |
|---|---|---|---|
| AF0 | — | Housekeeping: fix the two stale test comments in §6; re-check U.2 and U.5 against the code and mark them done or narrow them | Records only |
| AF1 | rustc `spans[]{is_primary,label}`; TS `relatedInformation` | `relatedSpans`, `instance` and `component` appear in `diagnosticToJson`, in both MCP hosts and in LSP `relatedInformation`. A duplicate id gains "first declared here" | JSON is append-only (new keys only on diagnostics that carry them). Check whether `lint()`/`describe()` serialisation moves; if it does, the new key stays out of the pinned payload or the card stops and reports. Carries M.15's first bullet |
| AF2 | TS `getSpellingSuggestion` plus one spelling codefix for 14 codes | One did-you-mean producer for unknown statements (`dor`), unknown ids in relations (`right-of hal`), clause words (`betwen`) and `uses` words (`bedrom`). Each emits a **word-level span** and a fix that replaces only that word (machine-applicable when the candidate is unique within distance; maybe-incorrect otherwise). The existing `sofaa` fix is narrowed to the same shape. An unknown name in an expression (`wdth`) belongs to AF3 | Diagnostics of already-failing plans change only; pin them. Closed sets come from `src/grammar/tokens.ts`, never retyped |
| AF3 | TS error type | An unknown name evaluates to an error value that suppresses dependent diagnostics (no "size must be positive" after `E_UNKNOWN_REF`) | Charge to the step meter as today; diagnostics of failing plans only |
| AF4 | TS elaboration; rustc "expected one of" | `E_PARSE` carries a structured `expected[]` (from the token table) and a suggestion when one alternative is close | `E_PARSE` currently says "no machine-applicable fix"; keep the list structured, never prose-only |
| AF5 | rustc paired examples; MoonBit `_error/` and `_fixed/`; Clippy "Use instead" | `CatalogEntry` gains `fixed`. CI checks that the example raises the code and that `fixed` compiles without it. `explain --json` returns both. An MCP `explain` tool | Generated docs (`docs/error-codes.md`) via `gen:*`; the 66 exemptions shrink, never grow |
| AF6 | — | `fmt --json` reports `parsed: false` (or `ok: false`) when it refuses, together with M.8's exit code and precision | One card with M.8 |
| AF7 | CUE, Nickel, Pkl | `W_KEEP_VIOLATED` and placement conflicts list the statements that placed each named element as related spans | Additive; same serialisation check as AF1 |
| AF8 | TS `getSupportedErrorCodes()` | The capabilities resource lists the codes `fix` can resolve, by applicability | Generated from the fix producers |

### Wave B: fixes that reach the semantic losses (largest expected effect)

| Card | Borrowed from | Design | Constraints |
|---|---|---|---|
| AF9 | rustc `HasPlaceholders` and tool-only suggestions | For the EV.5 refusals (jamb too close, window on a partition, parallel edge) and `W_DOORWAY_BLOCKED`: a placeholder skeleton or a maybe-incorrect move. Machine-applicable only when provably the single nearest legal place (ADR 0011's bar) | EV.5's gate stands: a design note or an ADR before code. ADR 0005 (no invisible architect) and ADR 0028 §5 bound it. L1 applies only machine-applicable fixes, so AF9 may move no L1 number |
| AF10 | `uom` / `dimensioned` | Step 1: an advisory lint for an implausibly large room, wall or opening (the probe in §6). Step 2: count length dimensions through expressions and warn when an area is used as a length; never convert units | Step 1 is a new W code and lint rule (the `new-lint-rule` skill); its threshold needs a `V` or `S-full` source (product-roadmap principle 10) or it stays a hint. Step 2 is charged to the step meter; only its escalation to an error waits for an edition boundary (AF15) |
| AF11 🔒 | Clippy categories | Every lint rule declares a confidence category (`correctness`, `suspicious`, `style`, `pedantic`). `LintLayer` has only two values (`validity`, `drafting`; `src/lint/context.ts:247`), so it can only give a default; each rule's own declaration does the work | RM-D60: metadata only; it never enters `lint()` serialisation and moves no corpus bytes |
| AF12 🔒 | Rust `#[expect]` with `reason`; `Forbid` | Source-level `expect <CODE> reason "<text>"` for a deliberate design choice (a windowless store) | RM-D60: an ADR first. Expected warnings are still computed and marked, never deleted. An unfulfilled `expect` warns. `correctness` codes and errors cannot be waived. Eval and score count a waived warning as fired. A new language form: byte-identity law, needs spec headroom |

### Wave C: editing and change

| Card | Borrowed from | Design | Constraints |
|---|---|---|---|
| AF13 | D2 `d2oracle`; KCL versioned operations; zerolang `patch` | `arch edit` and an MCP `edit` tool: `set room#living size 4200x4000 expect 4000x4000`. It is printed through `statement-print.ts`, refuses on a stale value and returns the `impact` report | `compile()` stays pure; edit lives in the CLI and MCP layers. `new-cli-flag` and `new-mcp-tool` skills |
| AF14 | D2 id deltas | `impact` and `diff` gain `id_deltas` (auto ids that shifted) | Additive JSON key. Content-derived ids are declined (RM-D62) |
| AF15 🔒 | Rust editions; KCL `kclVersion` | An optional source header naming the language edition (absent = current, byte-identical). A compat group of lints for every source-breaking 2.0 change, each with the strongest fix that can be proved; `arch fix --edition` reuses the `while` → `for` migration (`src/while-fix.ts`) | RM-D61: designed now, built only with 2.0. Its scope is the backlog's 2.0 bucket (`docs/backlog.md`: the escalations ruled by RM-D6 and RM-D16, V.5, V.6, 6.7) plus the two deprecated forms, `while` and reassignment; RM-D61 adds none. Today only `while` has a fix (the canonical counted loop; maybe-incorrect inside a component, `src/while-fix.ts:2-33`); `W_REASSIGN_DEPRECATED` has hints only. `--view` is a CLI flag, removed in 2.0 outside the edition |
| AF16 | Gleam code actions; KCL principle | Named refactorings that preserve intent: absolute → `right-of` when exactly equal; hand-written walls → `walls from rooms` when equal; extract/inline `let` | Each proves byte-identical SVG + `describe()` + `lint()` before and after on the corpus; refuses otherwise |
| AF17 🔒 | KCL point states; LLM4CAD-Editor | Placement provenance (`literal`, `right-of X`, `derived`) through an **opt-in** surface (for example `describe --provenance`), plus an advisory "a relation would hold here" hint | RM-D62: opt-in only; default `describe()` bytes never move |

### Wave D: context and editor

| Card | Borrowed from | Design | Constraints |
|---|---|---|---|
| AF18 | `lib.d.ts`; Grammar Prompting's minimal per-example grammar | A typed signature sheet (one line per statement and clause), **generated** from the registry, `tokens.ts` and the catalog; `arch context --for door,furniture` returns those signatures, their codes and one error/fixed pair | Never a third hand-written description; a `gen:*` generator with a drift test. Its form follows AF21's result |
| AF19 | LSP 3.18 | VS Code parity: fixes in `Diagnostic.data`, `isPreferred` on machine-applicable fixes, `relatedInformation`, `codeDescription` links, a formatting provider | `editors/vscode` only |
| AF20 | Zoo `kcl-grammar`; Lark | A Lark grammar generated from the same tokens; the rejection snippets turned into a one-violation-per-file corpus | Low priority (P5) |

### Wave E: measurement (decides which of the above pay)

| Card | What | Cost |
|---|---|---|
| AF21 | Classify the foreign-syntax attempts by source language, the CangjieBench way. Inputs: the published model-authoring rows on Hugging Face and the `eval-results-live` workflow artifacts (RM-D53). **Never `eval/live-runs/t3/`**: a reading of the T3 arms would be a second statement of that result, which needs an owner decision (`docs/agents/iron-laws.md`) | Free, offline; no paid call |
| AF22 | Tokens to a lint-clean plan per brief, from the same inputs and with the same exclusion; one arm at a time, never a loop-against-control comparison | Free, offline |
| AF23 🔒 | Spec ablation: examples vs rule prose; starter vs spec vs full bundle | Paid (`eval:live`). RM-D63: parked; reopen conditions in that ruling |
| AF26 | Audit the irregular grammar rules (§6): for each, the spec bytes it costs, whether AF21's classification finds models tripping on it, and the regular form that would replace it. The output is a document; a grammar change it proposes is its own card, and a source-breaking one joins the 2.0 bucket (RM-D61) | Free, offline; analysis only |

### Wave F: hygiene and surface parity (added by the completeness pass)

| Card | Borrowed from | Design | Constraints |
|---|---|---|---|
| AF24 | rustc's typed diagnostics (`rustc_errors/src/diagnostic.rs:340-353`: built but never emitted panics) | Migrate the remaining string-literal diagnostic sites (about 440 `code: "…"` literals in `src/`, against `diag(code: CatalogCode)`, `src/diagnostics.ts`) to `diag()`, so `tsc` rejects an uncatalogued code everywhere | One batch per PR; the JSON key order of a migrated diagnostic can move (`src/diagnostics.ts:159-161`), so each batch proves the byte-identity payload unchanged or stops |
| AF25 | TS "the services, not the IDE" (Hejlsberg) | The MCP server reaches what the CLI already does that an agent needs: `fmt`, `impact`, `ast`, `reroll` (absent from `packages/mcp/src/tools.ts`; `explain` is AF5) | One tool per PR with the `new-mcp-tool` skill; hosted Worker and stdio shim together |

### Ideas recorded, not carded

Each has evidence but no card yet, because a cheaper card answers first or because it is paid
(owner-only):

| Idea | Evidence | Why not carded now |
|---|---|---|
| Name-aware constrained decoding: a prefix checker that also knows declared ids and the closed word sets | Mündler 2025 (types, not syntax, carry the gain); ArchLang's "types" are mostly names and closed sets | Helps only self-hosted decoders; AF2 gives the same knowledge to every model through diagnostics |
| Retrieve examples matched to the brief instead of one fixed set | Aycock 2025; DocPrompting; LayoutGPT (models copy values from exemplars, a caution) | Waits for AF21 and AF23 to show examples matter for this spec |
| Measure how often a model mis-predicts a derived fact (a wall, an area, a clearance) | P13 | Needs a paid run or AF22's artifacts first |
| Report pass@k with the unbiased estimator next to the single-sample L0 | Chen 2021 | A change to the eval's reporting; belongs to the next eval card, not this track |
| Ablate feedback type (minimal vs full diagnostics vs diagnostics plus fix) and diagnostic wording | Self-Debug Table 2; FeedbackEval; P7 (no study isolates wording) | Paid; same gate as AF23 (RM-D63) |
| A light `compile --json` envelope | Backlog U.8 (13.7 KB of `describe()` for five rooms) | Already carded as U.8 |

## 8. What not to borrow

| Idea | Why not |
|---|---|
| A borrow checker or ownership types | Openings name their host wall, walls derive from rooms (ADR 0028), and meaningless clauses are refused, so the class of error is structurally absent. At most, report which room owns which wall as a fact |
| Structural or gradual typing, exhaustive `match` | No user-defined types; `--stage` and `--strict` already give gradual strictness |
| More syntax-only constrained decoding | ≤ 4% in the literature (P5); the compile errors that remain are mostly semantic refusals (EV.1) |
| A token-level type sampler (MoonBit) | Hosted models give no hook; GBNF covers local models |
| Content-derived ids | They would move `describe()` over the corpus and rename what authors see; `id_deltas` (AF14) answers the real problem (RM-D62) |
| Positional references (Vera); sort-then-index selectors (build123d) | Named references are what the CAD studies reward; `E_SEGMENT_SELECT` refuses ambiguity instead |

## 9. Weak points of this evidence

- No study isolates diagnostic **wording** as the variable for LLM repair rates. P7 rests on
  adjacent ablations.
- Several venue attributions came from the researcher's memory and are marked "verify" in the
  working notes. The numbers quoted above were read from the papers' results sections.
- **Unverified, not used:** EsoLang-Bench; the NeurIPS 2025 esolang in-context paper;
  ChatHouseDiffusion's numbers; Pel; Weft; Agentis; the "Hejlsberg dismisses AI-first languages"
  summary. Alderson's token-efficiency post was read only through search snippets.
- MoonBit's AI claims are vendor claims with no baseline. VeraBench is self-reported on 60 problems.
- The card order rests on the 26-brief fixture alone. On the model-authoring briefs, one-shot
  sound is far higher (§5), so part of the soundness gap may be a property of the fixture. AF21 and
  AF22 report both sets.
- The run-to-run noise is high: three gpt-5.5 runs at one commit disagree on 15 of 26 briefs (EV.1).
  Any measurement card (AF21–AF23, AF26) must report its own variance.
- The working notes (four reports with every quote and `path:line`) are kept outside this public
  repository by the owner's convention for research material. This record is self-contained.
