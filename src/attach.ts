/**
 * Opening attachment (`door|window|opening … on <wall> at <pos>`).
 *
 * Resolves a wall-relative position into an absolute point + the exact host wall
 * segment, by walking the named wall's polyline by cumulative RUN length — an `arc` edge
 * contributes its arc length, so a percentage means the same thing on a curve as on a
 * straight run. Unlike the
 * nearest-wall search openings normally use, this pins the opening to the wall
 * *by construction*, so an attached opening can never be reported "off wall".
 *
 * Pure and deterministic: the derived point is grid-snapped through the same
 * `snapPt` the rest of resolve uses, so output is byte-stable.
 */

import type { ExprPoint, OpeningAttach, Point } from "./ast.js";
import type { Diagnostic, FixSuggestion } from "./diagnostics.js";
import type { Expr, ParseExprOpts } from "./expr.js";
import type { ParseCtx } from "./registry.js";
import type { WallLike, WallSegment } from "./geometry.js";
import { segmentLength, segmentPointAlong, segmentsOfWall } from "./geometry.js";
import { fmt3 as numStr } from "./num-format.js";

/**
 * The fix for `E_ATTACH_POS_RANGE`: clamp the out-of-range attach position to the
 * nearer valid endpoint and rewrite the `on <wall> at <pos>` clause over its own
 * span. Machine-applicable — the clamped position is always on the wall, so the
 * applied edit compiles to a hosted opening (golden-tested).
 */
function attachClampFix(attach: OpeningAttach, valueText: string): FixSuggestion[] | undefined {
  if (!attach.span) return undefined;
  return [
    {
      title: `clamp the attachment position to ${valueText}`,
      applicability: "machine-applicable",
      fixId: "attach-pos-range",
      edits: [{ span: attach.span, newText: `on ${attach.wall} at ${valueText}` }],
    },
  ];
}

/**
 * Parse the attachment position after `at`: `<expr>%` | `<expr>` (mm) | `center`.
 *
 * The value is a full expression — the same one every other numeric slot takes, parsed
 * by the same {@link ParseCtx.parseExpr} entry point — so `for i in 0..4 { door on w1 at
 * bay * i + 600 width 900 }` places a generated run along the wall. Before v1.26.2 this
 * read a single `number` token, which is why a generated run had to fall back to the
 * absolute `at (x,y) … wall <id>` form and hand-compute the coordinate the `on` form
 * exists to avoid (`examples/transit-hall.arch` is the shipped instance).
 *
 * `noModulo` is what makes the trailing `%` readable: see {@link ParseExprOpts}.
 * `center` is still matched first, as a keyword, so it can never be read as a
 * bare reference.
 */
function parseAttachPos(ctx: ParseCtx): { pos: OpeningAttach["pos"]; end: number } {
  if (ctx.isKeyword("center")) {
    const c = ctx.next();
    return { pos: { kind: "center" }, end: c.end };
  }
  const value = ctx.parseExpr({ noModulo: true });
  if (ctx.isType("percent")) {
    const pct = ctx.next();
    return { pos: { kind: "percent", value }, end: pct.end };
  }
  return { pos: { kind: "mm", value }, end: ctx.peek(-1).end };
}

/**
 * Parse an opening's leading position — shared by door/window/opening. Either the
 * existing absolute `at (x,y)` (with the `wall <ref>` clause left to the caller,
 * since it follows `width`) or the wall-attached `on <wall> at <pos>`.
 */
export function parseAttachTarget(ctx: ParseCtx): { at?: ExprPoint; attach?: OpeningAttach } {
  if (ctx.isKeyword("on")) {
    const onTok = ctx.next();
    const wall = ctx.eatIdent().value;
    ctx.eatKeyword("at");
    const { pos, end } = parseAttachPos(ctx);
    return { attach: { wall, pos, span: { start: onTok.start, end } } };
  }
  ctx.eatKeyword("at");
  return { at: ctx.parsePoint() };
}

/**
 * Resolve an attachment against the (already-resolved) walls. Returns the
 * absolute (snapped) point and the host segment, or `null` after pushing a
 * catalogued diagnostic:
 *   - unknown / ambiguous wall ref → `E_ATTACH_WALL_REF`
 *   - percent outside 0–100, or mm outside `[0, wall length]` → `E_ATTACH_POS_RANGE`
 *   - a position that is not a finite number → `E_ATTACH_POS_RANGE`
 *
 * That third case is what an EXPRESSION position costs: `0/0` and `1/0` are values a
 * literal could never be, and `NaN < 0 || NaN > total` is false on both sides — so
 * without the finiteness check a non-finite position would walk straight past the range
 * test and into `segmentPointAlong`, putting `NaN` in the drawing. It is refused with the
 * same code as any other out-of-range position, but carries no fix: there is no nearest
 * legal value to clamp `NaN` to. (`E_DIV_ZERO` already covers the common cause; this is
 * the backstop for every other route to a non-finite number.)
 *
 * `evalNum` evaluates the position expression against the caller's binding environment
 * (`ResolveCtx.eval`), so `let`/`for` bindings are in scope exactly as they are for a
 * `width` or an `at (x,y)`. Its diagnostics (`E_UNKNOWN_REF`, `E_TYPE`, `E_DIV_ZERO`, …)
 * are catalogued by the evaluator itself.
 *
 * The host segment is taken from `segmentsOfWall(wall)` so `registerOpenings`
 * (which matches by endpoint coordinates) attributes the opening to this wall.
 */
export function resolveAttachment(
  attach: OpeningAttach,
  walls: readonly WallLike[],
  snapPt: (p: Point) => Point,
  diag: (d: Diagnostic) => void,
  what: string,
  evalNum: (e: Expr) => number,
): { at: Point; host: WallSegment } | null {
  const matches = walls.filter((w) => w.id === attach.wall || w.category === attach.wall);
  if (matches.length === 0) {
    diag({
      severity: "error",
      message: `${what} is attached \`on ${attach.wall}\` but no wall has that id or category`,
      code: "E_ATTACH_WALL_REF",
      span: attach.span,
    });
    return null;
  }
  if (matches.length > 1) {
    diag({
      severity: "error",
      message: `${what} is attached \`on ${attach.wall}\`, which matches ${matches.length} walls — reference a unique wall id`,
      code: "E_ATTACH_WALL_REF",
      span: attach.span,
    });
    return null;
  }
  const wall = matches[0]!;
  const segs = segmentsOfWall(wall);
  // RUN LENGTH, not chord length: an arc edge contributes its arc length `r·theta`, so
  // `on <wall> at 50%` lands halfway along the wall as WALKED — mid-curve on a curved
  // run — rather than halfway along a chord shorter than the wall it stands for.
  const total = segs.reduce((s, seg) => s + segmentLength(seg), 0);

  // Distance from the wall's start to the attachment point, along the polyline.
  let dist: number;
  const p = attach.pos;
  // One evaluation, shared by both value kinds. `center` carries no expression.
  const raw = p.kind === "center" || p.value === undefined ? 0 : evalNum(p.value);
  if (p.kind !== "center" && !Number.isFinite(raw)) {
    diag({
      severity: "error",
      message: `${what} attachment position is not a finite number (got ${raw})`,
      code: "E_ATTACH_POS_RANGE",
      span: attach.span,
    });
    return null;
  }
  if (p.kind === "center") {
    dist = total / 2;
  } else if (p.kind === "percent") {
    const pct = raw;
    if (pct < 0 || pct > 100) {
      const clamped = Math.min(Math.max(pct, 0), 100);
      const fixes = attachClampFix(attach, `${numStr(clamped)}%`);
      diag({
        severity: "error",
        message: `${what} attachment position ${pct}% is outside 0–100%`,
        code: "E_ATTACH_POS_RANGE",
        span: attach.span,
        ...(fixes ? { fixes } : {}),
      });
      return null;
    }
    dist = (pct / 100) * total;
  } else {
    const mm = raw;
    if (mm < 0 || mm > total) {
      const clamped = Math.min(Math.max(mm, 0), total);
      const fixes = attachClampFix(attach, numStr(clamped));
      diag({
        severity: "error",
        message: `${what} attachment position ${mm} mm is outside the wall run (0…${total})`,
        code: "E_ATTACH_POS_RANGE",
        span: attach.span,
        ...(fixes ? { fixes } : {}),
      });
      return null;
    }
    dist = mm;
  }

  // Walk segments until the running length reaches `dist`; the last segment
  // absorbs the endpoint (so `100%` / full length lands on the final vertex).
  let acc = 0;
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k]!;
    const segLen = segmentLength(seg);
    if (dist <= acc + segLen || k === segs.length - 1) {
      const along = dist - acc;
      return { at: snapPt(segmentPointAlong(seg, along)), host: seg };
    }
    acc += segLen;
  }
  return null; // unreachable: a non-empty wall always has a final segment
}
