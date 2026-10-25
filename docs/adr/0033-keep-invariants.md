# 33. `keep`: declared invariants, checked by the compiler, never solved

- **Status:** Proposed (plan-soundness card PS4.3, `docs/plans/plan-soundness/README.md` §6 and §7
  row 6). Design record: `docs/plans/plan-soundness/research/2026-10-26-ps43-keep-design.md`. To be
  accepted when the PR that builds the statement and its law (PS4.3a) merges.
- **Date:** 2026-10
- **Relates to:** [ADR 0004](0004-relational-placement-not-optimizer.md) and
  [ADR 0006](0006-solver-as-explicit-transform.md) (no solver inside `compile()`; a solver is an
  explicit transform), [ADR 0005](0005-no-invisible-architect.md) (refuse, never choose),
  [ADR 0016](0016-component-instances-and-frames.md) (an instance is closed),
  [ADR 0022](0022-exact-decisions-and-bounded-input.md) (exact decisions, counted budgets),
  [ADR 0028](0028-rooms-primary-derived-walls.md) §2 (the datum vocabulary a keep reads),
  [ADR 0029](0029-furniture-relations.md) (a declaration lint checks: `clear front`),
  [ADR 0032](0032-taste-separate-score.md) (the validity cap), [ADR 0024](0024-finish-as-explicit-transform.md)
  §6 and [ADR 0025](0025-furnish-as-explicit-transform.md) §7 (the never-worse law)
- **Scope:** one control statement, `keep`, with seven forms and three grades; its evaluation inside
  `compile()`; one compile-channel warning, `W_KEEP_VIOLATED`, and six refusal codes; a `keeps` fact
  in `describe()`, `validate --json`, `describe --facts depends` and `arch impact`. A plan with no
  `keep` compiles, describes, lints, validates and reports impact byte for byte as before; a plan
  with keeps draws, lints and resolves every element exactly as the same plan without them.
- **Numbering:** a new number rather than an addendum to ADR 0028, because a keep derives no
  geometry: what it decides is where a declared invariant is checked and reported, across
  `validate`, `next`, the taste cap, the never-worse law and the solver seam. 0030 and 0031 are
  reserved by the archlang-3d drafts (`docs/plans/archlang-3d/`).

## Context

Nothing in an ArchLang source says "this must stay". The plan-soundness programme's hold-fixed
ladder (the brief's numbers, then the lot, party walls, structural axes, shafts, wet stacks, and so
on down to annotations) is enforced by hosting and by `arch impact`'s report, and the third
mechanism it names, a declaration, does not exist.

The widening drill shows the cost (`docs/plans/plan-soundness/repro/widen-before.arch`, `archlang
impact … --set AW=4500`). The living room grows by 500 mm, the bedroom placed `right-of` it moves
with it, and the partition between them, written at fixed coordinates, stays where it was. The
report lists three lint symptoms on the bedroom (no wall between the rooms, no door, floor outside
the shell) and nothing that names the cause, because the partition depends on nothing and so is
never "held". The first-contact audits found the same shape across storeys three runs in a row: an
upper partition over the middle of a hall, a first floor 100 mm wider than the ground floor because
`grid 100` snapped a size, and a first floor whose partitions stand on no wall below. No rule reads
any of them.

Every comparable system lets the author state an invariant: Revit's locked dimensions, FreeCAD's
and SolveSpace's sketch constraints, and IFC's `IfcObjective` with its `IfcConstraintEnum` grade
(HARD "must be followed rigidly", SOFT "should be followed", ADVISORY). Those systems *solve* their
constraints. ArchLang cannot inside `compile()` (ADR 0004, 0006), and does not need to: what is
missing is the check, and a residual that says by how much and which way.

Optional declarations are not used by cold authors (a `facing` clause appeared 0 times in 12
cold-authored plans), so a keep is not expected to lower first-contact defect counts unless a brief,
a reviewer or an authoring role writes it. Its use is in the change loop and in briefs that bind a
number.

## Decision

1. **`keep` declares an invariant that `compile()` checks and never solves.** It draws nothing and
   moves nothing: every element resolves exactly as it would without the keep, and the drawing is
   the same. It is a control statement, not an element (no id, no `drawCost`, outside
   `MAX_ELEMENTS`).

2. **Seven forms, each one exact measure on the resolved plan:**

   ```arch static
   keep align <d> <d> [<d> …]                  # one line: v(di) − v(d1) = 0
   keep equal width|depth <t> <t> [<t> …]      # one extent: m(ti) − m(t1) = 0
   keep offset <x> from <d> <mm>               # (v(x) − v(d)) − mm = 0
   keep min clear <room> <mm>                  # clear span − mm ≥ 0
   keep on axis <label> <wall>                 # v(wall) − v(axis) = 0
   keep stacked <id> on levels <n> <n> [<n> …] # footprint edges equal across storeys
   keep fixed <d> at <mm>                      # v(d) − mm = 0
   ```

   A datum `<d>` is a rectangular room's edge or centre (`r.left`, ADR 0028 §2, read as written
   there), `axis <label>`, or a straight wall (or `<wall> segment <n>`) read as its centreline. A
   target is an authored id. The residual is signed (`+` is right or below, `+y` down; for `min
   clear`, `+` is margin), in mm, exact on the 0.001 mm lattice and compared without tolerance.
   `min clear` measures the widest free span between the bodies of the straight walls that cross
   the room's whole extent, on each axis, and reports the walls it could not read.

3. **Three grades, monotone in every consequence. `hard` is the default.**

   | | `hard` | `soft` | `advisory` |
   |---|---|---|---|
   | compile channel | `W_KEEP_VIOLATED` when broken | — | — |
   | `validate --strict` | fails | passes | passes |
   | `validate --json` `next` | tier `warning` | tier `intent`, after the brief's gating items | never |
   | `describe()`, `validate --json`, `arch impact` | reported | reported | reported |
   | `finish`/`furnish` never-worse law | counted | not counted | not counted |
   | taste cap, `lint()` | never | never | never |

   A broken hard keep means the source does not resolve to what it declares, so it ranks with the
   other compile-channel warnings ahead of validity, as plan-soundness D13 orders `next`. A keep is
   never a lint rule: lint's validity layer judges whether geometry contradicts itself, a keep
   records the author's contract, and a soft keep in lint would gate `--strict` and the never-worse
   law exactly as a hard one does while capping taste where a hard one does not. No grade caps taste,
   because the cap reads validity-layer lint codes only (ADR 0032 decision 4).

4. **Evaluated once, last, on the step meter.** A storey's keeps are evaluated after its resolution
   has finished (groups, `facing`, frames, openings, cross-element checks), in source order;
   `stacked` after the last storey. Each charges its cost (`1 + targets`, or the wall scan for `min
   clear`) to `MAX_EVAL_STEPS` before it reads. There is no iteration and no fixed point. A result
   is stored beside the resolved plan, never on an element or on the memoised AST. A plan that
   crosses the step budget inside its keep pass stops with `E_STEP_LIMIT`, as any plan does.

5. **Refusals are typed and never chosen around.** `E_KEEP_TARGET` (an unknown, auto-id'd or
   unplaced target, an undeclared axis, a missing level), `E_KEEP_MEASURE` (no such measure: a
   polygon or circle room, mixed orientations, a curved or multi-segment wall, an opening's depth),
   `E_KEEP_SELF` (a target compared with itself), `E_KEEP_PLACEMENT` (inside a `component`;
   `stacked` inside a `level` or on a single-storey plan; another form at the root of a multi-storey
   plan), `E_KEEP_VALUE` (a length outside `MODEL_RANGE_MM`, a `min clear` ≤ 0), `E_KEEP_LIMIT` (more
   than 1,000 keeps, or more than 64 targets in one). A keep defines no value, so keeps cannot form a
   cycle. Two keeps that contradict each other are both legal: both are measured, at least one
   reports, nothing moves.

6. **Static facts, reported, never acted on.** `describe --facts depends` lists per keep its
   targets, the bound names it constrains, its equation count, which of its equations the source
   already implies (a relational placement, a wall written on a datum) or another keep implies, and
   the keeps or statements it conflicts with, decided exactly on the declarations alone. `arch
   impact` lists keeps that broke, held while a target moved, or healed, each with its residual
   before and after, and reports `W_KEEP_VIOLATED` there rather than twice. The solver that would
   act on these facts stays an explicit transform (ADR 0006, plan-soundness card PS6.1).

7. **The byte-identity law is pinned in two strengths.** Weak: a plan with no keep is unchanged in
   every storey's SVG, `describe()` (with and without `--facts depends`), `lint()`,
   `compile().diagnostics` and its order, `validate --json` and `impact --json`, against a baseline
   taken before code lands. Strong: a plan with keeps, compared with the same source with every keep
   removed inside the test, has the same SVG and `lint()`, and the same `describe()` and diagnostics
   once the `keeps` key and the `W_KEEP_VIOLATED` rows are removed; with every keep holding, the
   diagnostics are the same with nothing removed.

## Consequences

- An author, a brief or a reviewer can write down what must stay, and an edit that breaks it is
  named at the point of change with how far and which way, instead of through its symptoms. In the
  widening drill, `keep align a.right b.left p` turns three lint symptoms into one warning that says
  the partition is 500 mm left of the room edge.
- Stacking across storeys becomes checkable for rooms and shafts (`keep stacked`). Partitions over
  walls below need level-qualified datums, a later card.
- `lint()` never reads a keep, so no keep moves the lint output of any plan, and the drafting-layer
  carve-out of the drawing-change law is never touched by one.
- A soft keep never blocks shipping; an advisory keep is information only. An author who wants a
  keep to gate leaves the grade off.
- `keep` becomes a reserved word; the form words and grades after it are contextual, so no plan that
  uses `soft`, `fixed` or `stacked` as a name changes meaning. Plan JSON drops keeps, as it already
  drops axes, until a consumer needs them.
- The spec gains one grammar line (432 UTF-16 units), paid for by cutting drawing-only prose from the
  `door`, `outdoor` and `height` lines; the language reference keeps that prose.
- `arch solve` gets its input: declared equalities, an inequality, grades that map to IFC's, and the
  static redundancy and conflict facts.

## Alternatives considered

- **Solve the keeps in `compile()`** (FreeCAD, SolveSpace, Revit): refused by ADR 0004 and 0006. A
  solved keep would move geometry the source does not state, and an over- or under-determined set
  would need a choice.
- **Report every grade as a lint rule** (the original research sketch): lint would read declarations
  that are not plan soundness, `--strict` and the never-worse law could not tell hard from soft, and
  the taste cap would rank a soft keep above a hard one.
- **An addendum to ADR 0028**: 0028 decides derived geometry; a keep derives none, and its decisions
  touch five other records.
- **`keep fixed` without a value** (checked only between two versions): `compile()` could never find
  it broken. With `at <mm>` every form is checked in every compile.
- **A static conflict warning** (`W_KEEP_CONFLICT`): a contradictory set already shows up as a broken
  keep with its residual, and the fact names the set; a second code would report the same problem
  twice.

## Reverse if

- A re-measure shows authors fixing lint warnings while leaving broken soft keeps they wrote: then a
  soft keep gains a lint presence that neither gates nor caps, decided again against decision 3.
- Hard keeps are seen failing `--strict` on plans whose authors meant them as notes: then the
  default grade becomes `soft`.
- A corpus plan crosses the step budget in its keep pass: then keeps move to a separate counted
  budget that skips visibly, as the taste score's does.
- Review of the implementation finds no decision here beyond ADR 0028's vocabulary: then this
  record is folded into 0028 as a dated amendment before it is accepted.
