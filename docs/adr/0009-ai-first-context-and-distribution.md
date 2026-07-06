# 9. AI-first: one bundled context artifact, opt-in error rendering, distribution over protocol

- **Status:** Accepted
- **Date:** 2026-07 (v1.12 planning)

## Context

ArchLang is authored more and more by AI agents, not only by hand. That reframes the
question the project keeps asking — *how does a tool reach an agent?* — and the honest
answer, watching how Mermaid became the diagram language models reach for, is: **not by
building AI-specific machinery, but by being everywhere an agent already is and being
trivially ingestible when it arrives.** Mermaid shipped no agent protocol; it won because
its syntax is short, its docs render inline everywhere, and a model can hold the whole
language in its head. The lesson is *distribution and ingestible context*, not tooling.

The existing agent surface was already good — an agent-native CLI (`--json`, exit codes,
stdin), `spec.llm.md`, `SKILL.md`, `describe`/`lint` for eyeless verification — but it was
**scattered**: a cold-start agent had to be pointed at several files, and the moment a plan
failed to compile it got *no image at all*, which is correct for a pipeline but blind for a
model trying to see what it wrote. Four decisions close those gaps without reopening the
determinism and facts-over-magic invariants that ADRs [0005](0005-no-invisible-architect.md),
[0007](0007-opt-in-source-annotation.md), and [0008](0008-circulation-as-facts.md) established.

## Decision

**1. One generated, drift-tested bundle is the cold-start channel.** `llms-full.txt` (built
by `npm run gen:llms` / `scripts/gen-llms-full.ts`, printed by `arch context`, and served at
the docs-site root as `/llms-full.txt` per the [llmstxt.org](https://llmstxt.org) convention)
is *the* one thing to hand a fresh agent: the language spec, the `SKILL.md` workflow, a
manifest-derived CLI reference, and the full error catalog in one system-prompt-ready
document. It is **assembled from the existing single sources** (the spec generator, `SKILL.md`,
`src/manifest.ts`, `src/error-catalog.ts`) — never hand-written — so, like the other generated
artifacts, **it cannot drift out of truth**: CI regenerates it and fails on any diff. The
alternative, a hand-curated mega-prompt, was rejected for the same reason the editor grammars
and `spec.llm.md` are generated — a second hand-maintained copy of the language is a lie
waiting to happen.

**2. Errors render only by opt-in.** A plan that fails to compile still produces **no bytes**
by default — that is a contract downstream tooling relies on (a broken build makes no image,
exit code says why). `compile(src, { onError: "svg" })` / `--error-svg` (on `compile`,
`preview`, and `md`) instead renders a deterministic, self-describing error card — severity,
code chip, `line:col`, message, catalogued fix — so an agent watching the drawing sees *why*
it broke. This is additive visual feedback, not a behavior change: diagnostics, exit codes,
and the default no-bytes path are untouched. Making the error card **always-on** was rejected —
it would turn a hard failure into a silently "successful" render and break every consumer that
keys off "no output means broken," exactly the [ADR 0007](0007-opt-in-source-annotation.md)
discipline of *new output behavior is opt-in, the default artifact never changes*.

**3. Accessibility is derived by default, explicit by keyword.** `compile(src, { accessible:
true })` / `--accessible` gives the SVG a `<title>`, `<desc>`, `role="img"`, and
`aria-labelledby` — the title and one-sentence caption **computed from facts** (`describe()`,
so `describe().caption` and the `<desc>` are guaranteed the same sentence). The two plan-level
keywords `accTitle "…"` / `accDescr "…"` let an author **override** that derived pair when
they want specific intent; absent them, the plan still describes itself. Facts stay facts and
authors get intent — the same stance as [ADR 0005](0005-no-invisible-architect.md). Making
accessibility metadata **always-on** was rejected: it is a different output artifact for one
class of consumer, so it rides the same opt-in rule as annotation and overlays, and the default
SVG stays byte-identical.

**4. Distribution over protocol.** The investment goes into rendering **wherever agents already
write** — ` ```arch ` fences that go live automatically in the docs site, an in-repo GitHub
Action (`.github/actions/arch-render`) that renders fenced blocks in any repo's Markdown via
`arch md`, and a playground **Copy-for-LLM** button — rather than into an MCP server. **MCP
remains deferred** for the reason recorded in the README's agent section: a CLI costs nothing
in an agent's context window until it is called, whereas an MCP schema sits in the window
permanently. An MCP server *now* was rejected as premature protocol before the cheaper,
higher-reach channels are saturated.

## Consequences

- A cold-start agent needs exactly one instruction — `arch context`, or fetch
  `/llms-full.txt` — instead of a reading list; and because the bundle is generated, it stays
  correct release over release for free.
- Failing plans are debuggable *by looking* when a consumer opts in, with no cost to the
  pipelines that depend on the no-bytes default. `renderErrorSvg` (and the extracted
  `renderPngFromSvg`) are exported for embedders.
- Accessibility ships as a real language feature (`accTitle`/`accDescr`, the release's one
  language-surface change) without touching the default artifact; `describe().caption` gives
  every tool the same derived sentence whether or not accessible mode is on.
- The agent surface stays **CLI-first, no MCP** — consistent with the launch decision — while
  reach grows through the channels agents already touch. If a hosted/monetized phase later
  wants a server, this ADR does not preclude it; it records why it is not the current bet.
- None of the four reopens determinism or facts-over-magic: every new output mode is opt-in and
  itself deterministic, and the accessible caption merely *reports* `describe()` — it never
  changes what is drawn.
