# 15. The CLI is an agent interface: one manifest, filters that never gate, loud misuse

- **Status:** Accepted
- **Date:** 2026-07 (v1.17 planning)
- **Extends:** [ADR 0009](0009-ai-first-context-and-distribution.md) (decision 1 — the generated,
  cannot-drift context bundle; now also *sliceable*), [ADR 0011](0011-machine-applicable-fixes.md)
  (the bounded fixpoint — now previewable and reversible), and
  [ADR 0005](0005-no-invisible-architect.md) (facts, never an invisible architect — now enforced at
  the CLI's own filter boundary).

## Context

Every ADR since [0009](0009-ai-first-context-and-distribution.md) has said the same sentence:
**the `arch` CLI is ArchLang's primary agent interface.** [0012](0012-mcp-shim-discoverability.md)
re-affirmed it while adding the MCP shim as a discovery channel. Yet no ADR ever wrote down what
that *obliges the CLI to be*. The contract lived in AGENTS.md prose and in the habits of whoever
last touched `src/cli.ts`.

The bill came due. Audited against the
**[7 Principles for Agent-Friendly CLIs](https://x.com/trevin/status/2037250000821059933)**
(non-interactive by default · structured output · actionable errors · safe retries with explicit
mutation boundaries · progressive help discovery · composable and predictable · bounded, high-signal
responses), the good news was that the *foundations* already held — and that is part of this record:
zero interactive prompts, zero ANSI colour, `--json` on 19 of 20 commands, the documented
`0` / `2` / `1` / `3` exit contract, a uniform stdin `-` seam, and JSON diagnostics that already
carried their own machine-applicable fixes ([0011](0011-machine-applicable-fixes.md)).

What did not hold were four things, and each one is paid for in agent retries and tokens:

- **Help was a blocker, not a wart.** `arch compile --help` fell through the argument parser into
  the positionals and was read as a *filename* (`cannot read --help`). The standard two-hop probe an
  agent uses to learn any unfamiliar CLI — top-level help, then subcommand help — was broken at the
  second hop. The CLI could not be asked what it was.
- **Two sources of truth for the surface.** The manifest (`src/manifest.ts`) generated
  `docs/cli-reference.md` and `arch manifest --json`; a hand-maintained `HELP` template literal in
  `src/cli.ts` told humans something else; and an if/else chain parsed the flags, agreeing with
  neither. Help advertised flags that no longer existed and omitted ones that did.
- **Misuse was silent.** A `-`-leading token the parser did not recognize was pushed into the
  positionals, so `arch lint --jsn plan.arch` quietly linted in *human* mode and an agent parsing
  stdout got prose. Nothing failed; the run just did the wrong thing.
- **Reads were unbounded and `fix` was irreversible.** `arch context` was 60 KB or nothing; a plan's
  whole `describe` came back or none of it; and `arch fix` rewrote the author's source in place with
  no preview and no way back.

## Decision

**The CLI is a first-class, versioned agent interface with a contract of its own.** Four decisions.

**1. `src/manifest.ts` is the single source of truth for the entire CLI surface.** Everything the
CLI says about itself, and everything it *accepts*, is derived from `buildManifest()`:

| Consumer | Derivation |
|----------|------------|
| Top-level and per-command help | `src/cli/help.ts` renders both from the manifest (pure: `Manifest` in, strings out) |
| Flag **parsing** | `FLAG_KEYS` in `src/cli/io.ts` — bidirectionally drift-tested against the manifest |
| `docs/cli-reference.md` | generated (`npm run gen:cli`), CI fails on drift |
| `arch manifest \| capabilities --json` | the manifest, verbatim |

The hand-written `HELP` string is deleted. Help can no longer advertise a flag a command does not
take, and the parser cannot accept one the docs do not list — the *bidirectional* drift test is the
load-bearing half: a flag present in only one of the two fails CI in either direction. Every command
carries a required, non-empty `examples[]`, so per-command help always shows a **worked invocation**,
not just a flag list. This is the same *generated, therefore cannot drift* principle
[ADR 0009](0009-ai-first-context-and-distribution.md) decision 1 applied to `llms-full.txt` — a
second hand-maintained copy of the truth is a lie waiting to happen — now turned on the CLI itself.

**2. A display filter never gates.** `describe --select/--room` and `lint`/`validate`
`--code`/`--severity` narrow what is **shown**. The **exit code and `ok` are computed from the
unfiltered diagnostic set.** `lint --code W_FOO` on a plan failing for some other reason still
fails. An agent must not be able to filter its way to a green build. This is
[ADR 0005](0005-no-invisible-architect.md)'s "facts, never an invisible architect" carried into the
CLI layer: the tool reports what is true and narrows only the *view*, never the verdict. A test pins
it.

**3. Misuse is loud.** An unrecognized flag or verb is a **usage error (exit 3)** carrying a
`closest()` did-you-mean and a `usage:` echo — never a silently-swallowed filename. `arch lint
--jsn` exits 3 with `` did you mean `--json`? ``; `arch comple` suggests `compile`. Bare `arch`
prints help to **stderr**, exit 3 (a missing command is a usage error; its output must not pollute a
pipe). A wrong invocation must cost one obvious retry, not one plausible-looking wrong answer.

**4. Anything that mutates or floods is bounded and previewable.** `arch fix` rewrites the author's
**source**, so it now prints the **unified diff it would write** to stderr — under `--dry-run` too —
and `--backup` saves the original bytes to `<file>.bak`. `--backup` is **opt-in**, so the default run
leaves no `.bak` litter: the same rule as [ADR 0007](0007-opt-in-source-annotation.md) —
*new behavior is opt-in; the default artifact is unchanged*. And reads are sliceable: `describe
--select/--room`, `lint --code/--severity`, and `arch context --section <spec|workflow|cli|errors>`
(which drops the bundle from 60,187 to 13,161 bytes) so one large plan cannot blow an agent's
context window.

`--section` is a **partial cold start**, and it amends [ADR 0009](0009-ai-first-context-and-distribution.md)
decision 1's implicit "one bundle, all or nothing": the bundle stays *the* cold-start channel and
stays generated, but an agent that only needs the error catalog may take just that. A test **welds
the splitter to the generator** — it regenerates `llms-full.txt` in memory and asserts the split — so
a format change breaks loudly instead of silently slicing garbage out of a document that no longer
has those seams.

### Alternatives considered

- **Rename `-o`'s three-way overload** (`compile` output path, `new` scaffold path, `md` image
  directory). Rejected and **documented instead**: the manifest now spells out the meaning per
  command, and per-command help shows it. Renaming is a backward-compatibility break for every
  existing script and agent for **zero information gain** — the overload is unambiguous *within a
  command*, which is the only scope a parse ever sees.
- **`watch --json` / an NDJSON event stream.** Punted. A streaming build protocol is a **new
  contract** (event kinds, ordering, backpressure, what a consumer may assume between events), not a
  flag; it deserves its own design and its own ADR. Bolting `--json` onto `watch` now would freeze a
  half-considered event shape into the public surface.
- **Route the MCP shim's tools through the CLI** so the two surfaces could not diverge. Rejected:
  [ADR 0012](0012-mcp-shim-discoverability.md) decision 2 is that the shim wraps **one pure exported
  function each**, never a subprocess. Both surfaces already derive from the same library; making MCP
  shell out would buy consistency we already have at the cost of process spawning, argv escaping, and
  a Node-only dependency in a package whose whole point is thinness. The shim is deliberately
  **unchanged** by this release.
- **Make help always-on-stdout for bare `arch`.** Rejected — see the cost below; a usage error's
  output belongs on stderr.

## Consequences

- **This is a behavior break, and it is the point.** Flags that were previously *ignored* now exit 3:
  `arch describe --strict` used to run and return a plan summary; it is now a usage error. Any script
  or agent passing a stray flag that happened to be harmless will start failing. We accept that — a
  flag that is silently ignored is a wrong answer wearing a green exit code — but it is a real break
  and it is why v1.17 is a minor, not a patch. Likewise **bare `arch`'s help moved from stdout to
  stderr**: a pipeline doing `arch | head` sees nothing on stdout now.
- An agent can learn the whole CLI from the CLI: `arch --help` → `arch <cmd> --help` (with worked
  examples) → `arch manifest --json` for the machine-readable whole. Progressive discovery, no docs
  fetch.
- Adding a command or a flag is now **one edit** — a manifest entry — and the help, the parser table,
  the generated reference, and `--json` capabilities all follow or CI fails. The cost is that the
  manifest is no longer optional bookkeeping: a command without `examples[]` will not typecheck.
- The `fix`/`repair` split of [ADR 0011](0011-machine-applicable-fixes.md) is untouched; what is
  added is a **safety layer over its bounded fixpoint** that 0011 did not anticipate. 0011 reasoned
  carefully about *which* edits may be applied unattended and never about the fact that the loop
  overwrites a file a human is editing. Preview-plus-backup closes that.
- **[ADR 0012](0012-mcp-shim-discoverability.md)'s token argument is strengthened, not contradicted.**
  Its claim — *a CLI costs nothing in an agent's context window until it is called, whereas an MCP
  tool schema sits in the window permanently* — gets **wider** the more self-describing the CLI is: a
  CLI that can be asked, on demand, for exactly the slice of its surface an agent needs right now
  (`<cmd> --help`, `context --section`, `manifest --json`) delivers schema *at call time and in
  bounded bites*. The MCP shim remains the discovery channel; the CLI remains what an agent should
  reach for once it has ArchLang.
- Nothing here touches the language or the compiler. `compile()` stays pure, synchronous, and
  deterministic, and the default SVG stays byte-identical: this ADR governs the **shell around** the
  compiler, which is the part an agent actually holds.
