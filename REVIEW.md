# REVIEW.md

For whoever reviews a diff here (a person, `/code-review`, a reviewer agent). The rules themselves
are in `AGENTS.md`; this file says what breaking them looks like in a diff. Review the change's
intent and its evidence, not every line. Cite file and line for each finding.

## What failure looks like here

- **Compiler output stops being a function of the source.** Time, randomness, I/O or a Node API in
  `src/` outside `src/cli.ts`+`src/cli/`; an environment read other than through the `World` seam; a
  number formatted outside `src/num-format.ts`; a mutated parse-stage `PlanNode`; a runtime dependency
  added to the core, or `packages/archlang-3d` imported by it.
- **An element added outside the pattern**: a switch instead of one `src/elements/` module registered
  in `defs.ts`; a new language form without its byte-identity law pinned by a test; a height that draws.
- **A golden, digest or baseline moved without a byte-level reason.** Any change under
  `test/__goldens__/`, `test/__snapshots__/`, a digest table or a lockstep pin must be explained in the
  PR. A re-bless that makes a suite green is the bug.
- **A drawing change moved `describe()` or `lint()` over the corpus** (outside drafting-layer lint
  rules), or a glyph gained handedness.
- **Unbounded work.** New evaluator work not charged to the step meter before it allocates; a
  coordinate or length that can leave `MODEL_RANGE_MM`; an element whose `drawCost`, `bounds()` or
  `measures()` does not cover what it draws.
- **A user-source error thrown instead of returned** as a catalogued `Diagnostic`.
- **A generated file edited by hand**, or a generator template that retypes a fact instead of deriving it.
- **CI or a check got weaker.** A skipped or deleted assertion, a narrowed test glob, a relaxed
  workflow, a lowered budget or cap, a widened `.gitleaksignore`. Blocker unless the owner approved it.
- **A secret, a dark-mode site style, or a changed byte** in `brand/archlang-logo-master.svg`.
- **A public claim the code does not back** (README, docs, `spec.llm.md`, a package README):
  "first", "only", traction numbers, or 3D wording beyond "3D preview" (`.claude/rules/archlang-3d.md`).

## Not findings

Style the formatter owns, naming taste, code that predates the diff (note it once as pre-existing at
most), and hypothetical hardening the change does not need.

## Rounds

Two review rounds at most; the second reads only the new diff. Every finding is fixed or answered with
a reason. The tier comes from `node scripts/risk-tier.mjs` (`docs/agents/commands.md` § Merging a PR).
