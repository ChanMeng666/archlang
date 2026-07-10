# 11. Machine-applicable fixes: the rustc model, kept distinct from the geometric repairer

- **Status:** Accepted
- **Date:** 2026-07 (v1.13 planning)

## Context

Every ArchLang diagnostic already carries a one-line prose `fix` (from the error
catalog) — enough for a human or an agent to know *what* to do, but not something a
tool can apply. Two prior facilities correct plans, and neither fits every case:

- **`arch repair`** ([ADR 0006](0006-solver-as-explicit-transform.md)) is a
  **geometric solver** — it moves furniture out of walls, doorways, and swing arcs by
  iterating positions to a fixpoint. It reasons about *space*, not text.
- The **error catalog `fix`** is prose. It cannot be applied programmatically.

A large class of faults, though, is neither geometric nor merely advisory: it is a
**mechanical edit of a specific span**. An opening written `at (x,y)` that lands off
every wall wants to become the attachment form `on <wall> at <pos>`; an attachment
position past the end of its wall wants clamping into range. The fault is known
exactly, the edit is known exactly, and a byte span pins where it goes. That is the
shape `rustc`/`rustfix` and Biome solved with **structured, machine-applicable
suggestions** — and the shape ArchLang was missing.

## Decision

**1. A diagnostic can carry structured `fixes`, each a set of span edits with an
applicability tier.** Alongside the prose `fix`, a `Diagnostic` may now carry
`fixes: FixSuggestion[]`, where each suggestion is a `title` plus a list of
`FixEdit`s (a byte `span` → replacement string). This is data, not behavior: emitting
a fix never changes what `compile()` renders, and the default output stays
byte-identical.

**2. Four applicability tiers, straight from rustc.** Every suggestion declares one of
`machine-applicable` · `maybe-incorrect` · `has-placeholders` · `unspecified`:

- **`machine-applicable`** — provably correct; safe to apply unattended. A golden test
  proves the applied edit compiles to the intended result. Example: an off-wall
  opening with a **single unambiguous nearest wall** → the attachment form.
- **`maybe-incorrect`** — likely right but a judgement call the tool shouldn't make
  silently. Example: an off-wall opening with **more than one** candidate wall (which
  did the author mean?).
- **`has-placeholders`** — contains a `/* … */`-style hole a human must fill; never
  auto-applied.
- **`unspecified`** — confidence unknown; never auto-applied.

`arch fix` applies **only `machine-applicable` by default**; `--unsafe` widens the gate
to `maybe-incorrect`. `has-placeholders`/`unspecified` are **never** applied whatever
the flag — the conservative default is the point.

**3. Application is a piece-table replacer ported from rustfix.** `applyFixes` lays the
source out as a piece table and replaces each suggestion's spans in one pass. A
suggestion is **atomic**: if any of its edits overlaps an already-applied edit, the
*whole* suggestion is rejected and reported in `skipped[]` — never half-applied. This
is the exact rustfix discipline (overlapping suggestions are dropped, not merged), so
the result is deterministic regardless of suggestion order.

**4. `arch fix` is a bounded, self-checking fixpoint.** Because one fix can expose the
next, `arch fix` loops: compile → collect `diagnostics[].fixes` → apply → recompile,
up to 4 passes. A pass that **raises the error count is rolled back** and the loop
stops (unless `--force`) — the corrector may not make a plan *worse*. It stops on zero
progress or when no error-bearing fixes remain.

**5. The fix/repair boundary is a hard line.** `arch fix` does **syntactic span
edits** — it rewrites text where the correct text is known. `arch repair` does
**geometric solving** — it searches a space of positions no span edit could express.
They compose (fix the off-wall door, then repair the furniture its new swing now
overlaps) but never merge: keeping "known text edit" and "searched geometry" as
separate verbs keeps each one honest about what it can guarantee.

**Biome's conservatism, adopted as a promotion rule.** Following Biome's safe/unsafe
split, a producer emits `machine-applicable` **only when it can prove uniqueness**
(the single-nearest-wall test); the *moment* there is a choice, it emits
`maybe-incorrect` instead. Confidence is earned by proof, never assumed — a fix is
promoted to auto-applicable only when a golden test pins its output.

## Consequences

- An agent's self-correction loop gets shorter: `arch compile --json` → `arch fix
  --dry-run` (preview the machine-applicable edits) → apply, with no prose-to-edit
  translation step. The LSP surfaces the same suggestions as quick-fixes (a lone
  `machine-applicable` fix is marked the preferred action).
- The determinism and facts-over-magic invariants hold: fixes are data attached to
  diagnostics, `applyFixes` is pure, and nothing is auto-applied above the
  `machine-applicable` tier without an explicit `--unsafe`.
- `repair` is untouched and still owns everything geometric; `fix` never guesses at
  space. The two-verb split is the ADR's load-bearing decision.
- Adding a new machine-applicable fix means writing a producer **and** a golden test
  that proves the applied edit compiles — the promotion rule is enforced, not
  aspirational.
