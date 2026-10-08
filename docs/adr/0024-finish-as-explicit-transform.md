# 24. Finishing a sheet is an explicit source transform

- **Status:** Accepted — **decision 7 superseded by [ADR 0025](0025-furnish-as-explicit-transform.md)**
- **Date:** 2026-10
- **Relates to:** [ADR 0005](0005-no-invisible-architect.md) and
  [ADR 0006](0006-solver-as-explicit-transform.md) (compile renders what is written; a
  correction is an explicit transform), [ADR 0011](0011-machine-applicable-fixes.md) (the
  piece-table applier), [ADR 0015](0015-cli-as-agent-interface.md) (the CLI is the agent
  interface)
- **Scope:** a new transform, `finish()` / `arch finish`. No language syntax, no change to
  `compile()`, `describe()` or `lint()`.

## Context

A plan can be sound and still not be a drawing sheet. `paper`, `scale`, `dims auto`, `title`,
`schedule rooms` and `legend` are all optional, and a plan without them compiles to a correct
picture with no sheet size, no dimension chains, no title block and no tables.

`spec.llm.md` recommends `paper` with `dims auto all`. Models still leave them out. In a run of
72 plans written from the public spec, the mean sheet-completeness score per model ranged from
0.00 to 0.72. A downstream product that post-processes its plans scored 1.00 on the same measure.
The gap is not knowledge of the syntax: it is a step nobody runs.

The obvious remedy is to make `compile()` add what is missing. ADR 0005 and ADR 0006 already
refuse that: a default sheet chosen inside the compiler is a decision the source does not state,
and every existing plan without `paper` would render differently.

## Decision

**1. `finish` is an explicit transform outside `compile()`.** `finish(source, opts?)` returns
`{ source, changes[], unresolved[], changed }`, the shape `repair` returns. `arch finish`
follows `arch fix`'s write conventions: it rewrites the input in place by default, prints the
unified diff on stderr, and takes `--dry-run`, `--backup` and `-o`.

**2. It fills only what is missing, and deletes nothing.** Each of the six statements is added
only when the plan has none. An authored `dim`, `axes`, `north` or title block is never
rewritten. A plan with hand-written `dim` lines gets no `dims auto`; that is reported in
`unresolved`. The title block carries only `project`, taken from the plan's own name: `finish`
does not invent a date or an author.

**3. `--reissue` may replace `paper` and `scale`, and nothing else.** Without it an authored
sheet is kept. If the drawing does not fit that sheet, `finish` gives up statements in a fixed
order (the two tables, then `dims auto`, then the title) until what is left fits, and reports
each one it left out. With `--reissue` it replaces the sheet instead: it keeps the authored scale
when some larger sheet holds it, and chooses both otherwise.

**4. The sheet is chosen by the compiler's own fit rule.** `finish` calls `fitsOnSheet`
(`src/sheet.ts`) with the extents, table rows and title rows that `resolve()` computes
(`sheetExtents`, `planTableRows`, `titleRows`), taking the largest extent over the storeys of a
multi-storey plan. It never reads a diagnostic's message. The order is: the finest of 1:50,
1:100, 1:200 and 1:500 that fits some sheet from A4 to A1, on the smallest such sheet, landscape
before portrait; A0 only when no scale fits A4 to A1. `dims auto` is `all`, or `overall` when
the building's short facade is under 60 mm on paper. When nothing up to A0 at 1:500 holds the
drawing, `paper` and `scale` are not added and that is reported.

**5. The edits are span-based inserts.** They go through the `Data` piece table
(`src/fix-apply.ts`), not through the formatter, so every authored byte and comment survives.
A statement is inserted only at a line boundary, in the file's own indentation and line ending.

**6. Four laws, each pinned by test** (`test/finish.test.ts`, `test/fuzz.test.ts`):

| Law | Statement |
|---|---|
| Fixpoint | `finish(finish(s).source).source === finish(s).source` |
| Never worse | the result has no compile error, no diagnostic code (compile and lint, counted) that the input did not have, and no new furniture conflict |
| Fitted | when `finish` wrote `paper` or `scale`, the result raises neither `W_SCALE_OVERFLOW` nor `W_DRAWING_OVERFLOW` |
| Untouched | a source that does not compile is returned byte-identical |

A result that breaks the never-worse law is not returned. The whole stage is rolled back and
the reason goes in `unresolved`. A plan that needs nothing comes back byte-identical with
`changed: false`.

> **Superseded (2026-10).** The `furnish` stage exists: see
> [ADR 0025](0025-furnish-as-explicit-transform.md). A full run is `furnish`, then `sheet`, and
> `--only furnish` runs that stage. The paragraph below is the record of the first version.

**7. Stages.** `finish` is built as stages so that `--only` can select one. This version has one
stage, `sheet`. A `furnish` stage (placing the furniture a room's use implies) is planned.
`--only furnish` is a usage error that says the stage is not available yet; it is never a
silent no-op.

## Why it is not a language form

A `finish` keyword, or a `paper auto` setting, would put the choice back inside `compile()`.
The source would then say "some sheet" and the drawing would show a particular one, which is
the invisible decision ADR 0005 refuses. As a transform, `finish` writes its choice into the
source as ordinary statements. The author reads the diff, and from then on the plan states its
own sheet.

It also keeps every existing plan stable. Nothing changes for a source nobody runs `finish`
on, so no byte-identity baseline moves.

## Consequences

- An agent's loop gains one step, after lint is clean: `arch finish plan.arch`. `SKILL.md`
  states it, and the command is in the manifest, so it is also in `arch context`, the CLI
  reference and the generated CLI block of `spec.llm.md`.
- `finish` adds a sheet to a plan that had none. That switches the plan to paper sizing: every
  annotation becomes a fixed size on the sheet. This is what `paper` means, and it is why the
  step is explicit.
- The roll-back is all or nothing. A sheet can crowd two hand-written `dim` lines into
  `W_DIM_OVERLAP`; `finish` then changes nothing and says so. Retrying with fewer statements
  is not done in this version.
- A plan with an authored sheet the drawing already overflows is left alone unless `--reissue`
  is passed.

## Provenance

The idea of a finishing pass comes from ArchCanvas, a closed product by the same owner, which
runs one over generated plans. This is an independent implementation under the MIT licence,
written against ArchLang's own internals. No code was copied.
