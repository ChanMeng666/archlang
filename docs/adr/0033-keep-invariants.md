# 33. `keep`: declared invariants, checked by the compiler, never solved

- **Status:** Accepted 2026-10-26 with the PR that builds the statement and its law (plan-soundness
  card PS4.3a, PR #272; `docs/plans/plan-soundness/README.md` §6 and §7 row 6). Design record:
  `docs/plans/plan-soundness/research/2026-10-26-ps43-keep-design.md`; as built:
  `docs/plans/plan-soundness/research/2026-10-26-ps43a-as-built.md`. Decision 6 (the `--facts depends`
  rows and `arch impact`'s keeps) is built by PS4.3b.
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
  `keep` compiles, describes, lints, validates and reports impact byte for byte as before. A plan
  whose keeps are all accepted, and which resolves within the step budget, draws, lints and resolves
  every element exactly as the same plan without them. A refused keep is a compile error, which
  stops lint, `describe()` and `finish` as any compile error does.
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

   A datum `<d>` is a rectangular room's edge or centre (`r.left`, ADR 0028 §2), `axis <label>`, or
   a straight wall (or `<wall> segment <n>`) read as its centreline. A keep reads a datum exactly as
   an expression in the plan would: grid-snapped, as ADR 0028 §2 resolves it. Each value is then put
   on the 0.001 mm lattice by sign-symmetric rounding (`sign(v)·round(|v|·1000)/1000`) and compared
   in lattice integers without tolerance; a centre is compared at twice its value. A keep's own
   `<mm>` is put on the lattice and **never grid-snapped**. A target is an authored id. The residual
   is signed (`+` is right or below, `+y` down; for `min clear`, `+` is margin), in mm. `stacked`
   compares each element's resolved `at` + `size` rectangle; `offset` reads a piece of furniture at
   its footprint rectangle's own centre. `min clear` measures the widest free span between the bodies
   (± t/2, on the joined wall outline) of the straight walls that span the room's whole extent, on
   each axis, counts every wall body whatever its `height` (heights measure nothing), and reports the
   walls it could not read.

3. **Three grades, monotone in every consequence. `hard` is the default.**

   | | `hard` | `soft` | `advisory` |
   |---|---|---|---|
   | compile channel | `W_KEEP_VIOLATED` when broken | — | — |
   | `validate --strict` | fails | passes | passes |
   | `validate --json` `next` | tier `warning` | tier `intent`, after the brief's gating items | never |
   | `describe()`, `validate --json`, `arch impact` | reported | reported | reported |
   | no-worse law of every source-rewriting transform (`finish`, `furnish`, `repair`, fix-apply, `reroll`) | counted | not counted | not counted |
   | taste cap, `lint()` | never | never | never |

   A broken hard keep means the source does not resolve to what it declares, so it ranks with the
   other compile-channel warnings ahead of validity, as plan-soundness D13 orders `next`. A keep is
   never a lint rule: lint's validity layer judges whether geometry contradicts itself, a keep
   records the author's contract, and a soft keep in lint would gate `--strict` and the never-worse
   law exactly as a hard one does while capping taste where a hard one does not. No grade caps taste,
   because the cap reads validity-layer lint codes only (ADR 0032 decision 4).

4. **Evaluated once, last, on the step meter.** A storey's keeps are evaluated after its resolution
   has finished (groups, `facing`, frames, openings, cross-element checks), in source order, and on
   a `paper` plan in the drawn pass only. Root-level keeps are taken out of the statements every
   storey shares before the storeys are built; `stacked` is evaluated after the last storey. Each
   keep is charged once, immediately before its measure (`1 + targets`, or its share of the wall
   scan for `min clear`), on `MAX_EVAL_STEPS`; the per-storey indexes the measures read are built and
   charged once. The storeys share one step counter, and the `stacked` pass continues it. There is
   no iteration and no fixed point. A result is stored beside the resolved plan, never on an element
   or on the memoised AST. A plan that crosses the step budget inside its keep pass, the `stacked`
   pass included, stops with `E_STEP_LIMIT` and is unresolved, as any plan that crosses it is.

5. **Refusals are typed and never chosen around.** `E_KEEP_TARGET` (an unknown, auto-id'd or
   unplaced target, an undeclared axis, a missing level), `E_KEEP_MEASURE` (no such measure: a
   polygon or circle room, mixed orientations, a curved or multi-segment wall, an opening's depth),
   `E_KEEP_SELF` (a target compared with itself), `E_KEEP_PLACEMENT` (inside a `component`;
   `stacked` inside a `level` or on a single-storey plan; another form at the root of a multi-storey
   plan, raised once and without a level), `E_KEEP_VALUE` (a length outside `MODEL_RANGE_MM`, a
   `min clear` ≤ 0), `E_KEEP_LIMIT` (more than 1,000 keeps, or more than 64 targets in one; raised
   once, every later keep dropped while still charged). Each is a compile error, as every refused
   statement's code is. Every `E_KEEP_*` and `W_KEEP_VIOLATED` message is id-free: rooms and walls
   are named by the shared phrase builder (`src/naming.ts`, plan-soundness card PS2.29), and the ids and datums as written go in
   the first hint. The grammar is unambiguous by rule: a trailing grade word is always the grade, a
   value is the longest complete expression, and only `keep` is reserved (`min` stays the built-in).
   A keep defines no value, so keeps cannot form a cycle. Two keeps that contradict each other are
   both legal: both are measured, at least one reports, nothing moves.

6. **Static facts, reported, never acted on.** `describe --facts depends` lists per keep its
   targets, the bound names it constrains, its equation count, which of its equations the source
   already implies (a relational placement, a wall written on a datum) or another keep implies, and
   the keeps or statements it conflicts with, decided exactly on the declarations alone. A source
   implication is entered only when it survives grid snapping: the datum is an edge, never a centre,
   and every literal of the implying statement is a multiple of the grid. `arch impact` matches keeps
   by storey, text and occurrence, and lists keeps that broke, held while a target moved, healed,
   were added or were removed, each with its residual before and after (an upper-storey keep is
   classified by its residual alone until storeys are compared); it reports `W_KEEP_VIOLATED` there
   rather than twice. The solver that would
   act on these facts stays an explicit transform (ADR 0006, plan-soundness card PS6.1).

7. **The byte-identity law is pinned in two strengths.** Weak: a plan with no keep is unchanged in
   every storey's SVG, `describe()` (with and without `--facts depends`), `lint()`,
   `compile().diagnostics` and its order, `validate --json` and `impact --json`, against a baseline
   taken before code lands. Strong, for accepted keeps on plans within the step budget: a plan with
   keeps, compared with the same source with each keep's bytes blanked by spaces (newlines kept, so
   every later span, line and column stays put) inside the test, has the same SVG and `lint()`, the
   same `describe()` once the `keeps` key, `depends.keeps` and the `W_KEEP_VIOLATED` rows of its
   diagnostics are removed, and the same `compile().diagnostics` once the `W_KEEP_VIOLATED` rows are
   removed; with every keep holding, the diagnostics are the same with nothing removed. The D4
   equivariance law is checked through a source-level transformer of keeps (datum words, measure
   words and axes mapped by the turn or mirror), comparing residual sets unordered; the component
   route of the D4 oracle does not apply, since keeps are refused inside components.

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
  drops axes, until a consumer needs them, and the export says how many it dropped.
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
