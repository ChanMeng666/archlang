/**
 * The **vertical datum layer** — the heights a floor plan implies but has never written
 * down.
 *
 * ArchLang draws a horizontal cut through a building. Every coordinate in the language is
 * a plan coordinate, and until now the third dimension existed nowhere: a wall had a
 * thickness and no height, a window had a width and no sill, and a consumer asking "how
 * tall is this?" had nothing to read. This module is the answer, and it is deliberately a
 * **datum, not a feature**: nothing here draws, nothing here moves a line, and a plan that
 * writes no height clause is byte-identical in SVG, `describe()` and `lint()` to the same
 * plan compiled before this file existed.
 *
 * ## What the numbers are, and where they come from
 *
 * They are drafting conventions, not physics, and each is the value a set of construction
 * drawings would carry if the author said nothing:
 *
 *  - **{@link STOREY_HEIGHT} 3000 mm** — floor-to-floor for a dwelling. GB 50352-2019 §5.2
 *    puts the residential floor-to-floor at 2800 mm and the clear height at not less than
 *    2400 mm; 3000 is the common drawn figure once a slab and a finish are allowed for, and
 *    it is what a plan is read at when nothing else is declared.
 *  - **{@link DOOR_HEAD} 2100 mm** — the standard leaf head. A 2000 mm leaf on a 100 mm
 *    frame is the ordinary door in both the GB and the ISO worlds.
 *  - **{@link WINDOW_SILL} 900 mm** — GB 50352-2019 requires a residential external window
 *    sill to be **at least 900 mm** above the floor (below that it wants a guard), so 900
 *    is the floor of the convention and therefore the honest default.
 *  - **{@link WINDOW_HEAD} 2100 mm** — heads align with doors on an ordinary elevation,
 *    which is why the two numbers are equal and not a coincidence to be "tidied" apart.
 *  - **{@link CASED_OPENING_HEAD} = {@link STOREY_HEIGHT}** — a cased opening with no leaf
 *    is drawn full height unless the author says otherwise. Its default is therefore not a
 *    constant at all but *the host wall's own height*, and the constant here is only the
 *    value that falls out when the wall is the default one.
 *
 * **There is no slab thickness in v1.** A storey height is floor-to-floor and a wall runs
 * the full storey; separating structural depth from clear height needs a second number and
 * a rule for which one every consumer means, and inventing that without a consumer is how a
 * datum becomes a feature. Deferred by name.
 *
 * ## The gating rule
 *
 * `describe()` emits its height keys **only when the plan authored at least one height
 * clause** — anywhere: a wall, a level, an opening, an imported module. {@link
 * plansAuthorHeights} is the single predicate that decides, and it is the reason the
 * byte-identity law holds for every plan written before this layer existed. It is the
 * `describe().doors[].kind` precedent (present only when not the default) applied to a
 * whole block rather than one field.
 */

import type { DoorNode, LevelNode, OpeningNode, PlanNode, Statement, WallNode, WindowNode } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { Expr } from "./expr.js";
import type { WallSegment } from "./geometry.js";
import type { RWall } from "./ir.js";
import type { ParseCtx, ResolveCtx } from "./registry.js";

/** Floor-to-floor height of a storey, in mm, when the plan declares none. */
export const STOREY_HEIGHT = 3000;

/** Head height of a door leaf, in mm, when the statement declares none. */
export const DOOR_HEAD = 2100;

/** Sill height of a window, in mm, when the statement declares none. */
export const WINDOW_SILL = 900;

/** Head height of a window, in mm, when the statement declares none. */
export const WINDOW_HEAD = 2100;

/**
 * Head height of a leaf-less cased opening when neither the statement nor its host wall
 * declares anything — i.e. a full-height opening in a default-height storey.
 *
 * The *rule* is "as tall as the wall it sits in"; this constant is only what that rule
 * evaluates to in the default case, and a consumer should read the resolved number rather
 * than this one.
 */
export const CASED_OPENING_HEAD = STOREY_HEIGHT;

/**
 * The largest height, in mm, any clause may name — 100 m.
 *
 * A cap, not a judgement about architecture: it exists so a typo (`height 30000000`, a
 * misplaced unit) is REFUSED with a span rather than silently accepted into a datum
 * everything downstream trusts. Anything genuinely taller than this is outside what a
 * single floor-plan storey models.
 */
export const MAX_HEIGHT = 100_000;

/**
 * The elevation of a storey above the building's lowest floor, in mm: the sum of the
 * heights of the storeys below it.
 *
 * **This is an accumulation, not `level × storeyHeight`.** Because `level <n> height <h>`
 * lets each storey declare its own height, a building whose ground floor is 3600 and whose
 * upper floors are 3000 puts level 2 at 3600 — a closed form multiplying the level number
 * by one height would report 6000 and be wrong for exactly the plans the clause exists for.
 * When every storey does share a height the two agree, which is what
 * `test/datum.test.ts` pins.
 *
 * The lowest storey is the datum, so a single-storey plan (and the ground floor of any
 * plan) is elevation `0`.
 */
export function elevationOf(heightsBelow: readonly number[]): number {
  let sum = 0;
  for (const h of heightsBelow) sum += h;
  return sum;
}

/**
 * Is `h` a height a storey can be built at — finite, strictly positive, within
 * {@link MAX_HEIGHT}?
 *
 * The `> 0` is strict: a wall or a head at zero is not a low one, it is a missing one, and
 * accepting it would put a nonsense number into a datum every later consumer trusts. A
 * window's SILL is the one height that may legitimately be `0` (a floor-length window), so
 * it is checked with {@link isPlacedHeight} instead.
 */
export function isDrawableHeight(h: number): boolean {
  return Number.isFinite(h) && h > 0 && h <= MAX_HEIGHT;
}

/** {@link isDrawableHeight} for a height measured FROM the floor, where `0` is the floor
 *  itself and therefore legal — a window sill flush with the slab. */
export function isPlacedHeight(h: number): boolean {
  return Number.isFinite(h) && h >= 0 && h <= MAX_HEIGHT;
}

/**
 * The one `E_HEIGHT_RANGE` diagnostic, so every clause that carries a height refuses in
 * the same words with the same span.
 *
 * It REFUSES rather than clamping. A clamped height is a number the author never wrote
 * sitting silently in a datum, which is the failure mode this whole layer exists to avoid
 * — the `E_ROOF_*` precedent, where an `arc` edge is refused rather than approximated.
 * The fix is to DROP the clause (falling back to the inherited default), because the one
 * thing nobody can guess is what the author meant instead.
 */
export function heightRangeDiagnostic(subject: string, clause: string, value: number, span?: Span): Diagnostic {
  return {
    severity: "error",
    code: "E_HEIGHT_RANGE",
    message:
      `${subject} has a \`${clause}\` of ${value} mm — a height must be greater than 0 and no more than ` +
      `${MAX_HEIGHT} mm (100 m)`,
    ...(span ? { span } : {}),
    ...(span
      ? {
          fixes: [
            {
              title: `drop the \`${clause}\` clause and inherit the default`,
              applicability: "machine-applicable" as const,
              edits: [{ span, newText: "" }],
            },
          ],
        }
      : {}),
  };
}

/** The authored vertical clauses of one opening statement, as the parser read them. */
export interface OpeningHeightClauses {
  sill?: Expr;
  sillSpan?: Span;
  head?: Expr;
  headSpan?: Span;
}

/**
 * Parse the trailing vertical clauses of a `window` / `door` / `opening` statement.
 *
 * **They come LAST, after every clause the statement already had, and `sill` precedes
 * `head`.** Both facts are grammar, not taste: the three parsers read a fixed SEQUENCE of
 * optional clauses rather than a set, so an order is what the language accepts and what
 * `arch fmt` must re-emit to stay a fixed point. Putting them last is what keeps every
 * existing statement's parse untouched.
 *
 * `sill` is offered only to `window`. A door's sill is the floor by definition and a cased
 * opening's is too; a clause that can only ever be written `sill 0` is a clause with
 * nothing to say.
 */
export function parseOpeningHeights(ctx: ParseCtx, opts: { sill: boolean }): OpeningHeightClauses {
  const out: OpeningHeightClauses = {};
  if (opts.sill && ctx.isKeyword("sill")) {
    const k = ctx.next();
    out.sill = ctx.parseExpr();
    out.sillSpan = { start: k.start, end: ctx.peek(-1).end };
  }
  if (ctx.isKeyword("head")) {
    const k = ctx.next();
    out.head = ctx.parseExpr();
    out.headSpan = { start: k.start, end: ctx.peek(-1).end };
  }
  return out;
}

/**
 * The height of the wall an opening is hosted on, or `fallback` when it sits on none.
 *
 * `WallSegment` carries its owner's id, so this is a lookup rather than a geometric match
 * — which matters, because the same question asked geometrically in `registerOpenings`
 * has to compare four coordinates and could answer differently on a coincident segment.
 */
export function hostWallHeight(host: WallSegment | null, walls: readonly RWall[], fallback: number): number {
  if (!host) return fallback;
  return walls.find((w) => w.id === host.wallId)?.height ?? fallback;
}

/**
 * Resolve one opening's `sill`/`head` against its defaults and refuse anything impossible.
 *
 * Three refusals, all of them refusals rather than clamps (the `E_ROOF_*` precedent):
 * `E_HEIGHT_RANGE` for a value outside the buildable range, `E_SILL_ABOVE_HEAD` for
 * glazing with no glass in it, and `E_OPENING_ABOVE_WALL` for a head above the wall the
 * opening is cut in. The returned numbers are always usable — a refused value falls back
 * to its default — so a downstream consumer never meets a nonsense datum even on a plan
 * that failed to compile.
 */
export function resolveOpeningHeights(
  ctx: ResolveCtx,
  subject: string,
  clauses: OpeningHeightClauses,
  defaults: { sill: number; head: number },
  host: WallSegment | null,
  stmtSpan?: Span,
): { sill: number; head: number } {
  const wallHeight = hostWallHeight(host, ctx.walls, ctx.storeyHeight);

  let sill = defaults.sill;
  if (clauses.sill !== undefined) {
    const v = ctx.eval(clauses.sill);
    if (isPlacedHeight(v)) sill = v;
    else ctx.diag(heightRangeDiagnostic(subject, "sill", v, clauses.sillSpan ?? stmtSpan));
  }

  let head = defaults.head;
  if (clauses.head !== undefined) {
    const v = ctx.eval(clauses.head);
    if (isDrawableHeight(v)) head = v;
    else ctx.diag(heightRangeDiagnostic(subject, "head", v, clauses.headSpan ?? stmtSpan));
  }

  if (sill >= head) {
    const span = clauses.sillSpan ?? clauses.headSpan ?? stmtSpan;
    ctx.diag({
      severity: "error",
      code: "E_SILL_ABOVE_HEAD",
      message:
        `${subject} has a \`sill\` of ${sill} mm at or above its \`head\` of ${head} mm — ` +
        `there is no opening between them`,
      ...(span ? { span } : {}),
      ...(clauses.sillSpan
        ? {
            fixes: [
              {
                title: `drop the \`sill\` clause and inherit ${defaults.sill} mm`,
                applicability: "machine-applicable" as const,
                edits: [{ span: clauses.sillSpan, newText: "" }],
              },
            ],
          }
        : {}),
    });
    sill = defaults.sill;
    if (sill >= head) head = defaults.head;
  }

  // The head is measured against the wall the opening is actually cut in, not against the
  // storey: a 2400 head in a 2200 parapet is wrong even in a 3000 storey.
  if (head > wallHeight) {
    const span = clauses.headSpan ?? stmtSpan;
    ctx.diag({
      severity: "error",
      code: "E_OPENING_ABOVE_WALL",
      message:
        `${subject} has a \`head\` of ${head} mm but its host wall is only ${wallHeight} mm tall — ` +
        `the opening would run out through the top of the wall`,
      ...(span ? { span } : {}),
      ...(clauses.headSpan
        ? {
            fixes: [
              {
                title: `lower the head to the wall's own height (${wallHeight} mm)`,
                applicability: "machine-applicable" as const,
                edits: [{ span: clauses.headSpan, newText: `head ${wallHeight}` }],
              },
            ],
          }
        : {}),
    });
    head = wallHeight;
    if (sill >= head) sill = 0;
  }

  return { sill, head };
}

/**
 * Did this plan author a height anywhere?
 *
 * The predicate behind the `describe()` gating rule. It walks the WHOLE tree — every
 * level, zone, loop, conditional and component body, and (because `import` is linked
 * before resolve) every imported module's statements too — and answers true the moment it
 * meets a vertical clause.
 *
 * **`strip … height <mm>` is deliberately NOT one of them.** That clause shares the
 * keyword and means the strip's cross-axis extent *in plan*: counting it would switch the
 * height block on for four shipped examples that say nothing about the third dimension at
 * all, which is precisely the byte-identity failure this predicate exists to prevent.
 */
export function plansAuthorHeights(plan: PlanNode): boolean {
  if (plan.height !== undefined) return true;
  for (const def of plan.components.values()) if (bodyAuthorsHeights(def.body)) return true;
  return bodyAuthorsHeights(plan.body);
}

/** {@link plansAuthorHeights} over one statement list, recursing into every block form. */
function bodyAuthorsHeights(body: readonly Statement[]): boolean {
  for (const s of body) if (statementAuthorsHeights(s)) return true;
  return false;
}

/** {@link plansAuthorHeights} for one statement. */
function statementAuthorsHeights(s: Statement): boolean {
  switch (s.kind) {
    case "wall":
      return (s as WallNode).height !== undefined;
    case "window": {
      const w = s as WindowNode;
      return w.sill !== undefined || w.head !== undefined;
    }
    case "door":
      return (s as DoorNode).head !== undefined;
    case "opening":
      return (s as OpeningNode).head !== undefined;
    case "level": {
      const l = s as LevelNode;
      return l.height !== undefined || bodyAuthorsHeights(l.body);
    }
    case "zone":
      return bodyAuthorsHeights(s.body);
    case "for":
    case "while":
      return bodyAuthorsHeights(s.body);
    case "if":
      return bodyAuthorsHeights(s.then) || (s.else !== undefined && bodyAuthorsHeights(s.else));
    default:
      return false;
  }
}
