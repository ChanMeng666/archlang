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

import type { AttachFrom, AttachPos, ExprPoint, OpeningAttach, OpeningBetween, Point, WallsPairRoom } from "./ast.js";
import type { Diagnostic, FixSuggestion } from "./diagnostics.js";
import type { Expr, ParseExprOpts } from "./expr.js";
import { chargeSteps } from "./expr.js";
import type { ParseCtx, ResolveCtx } from "./registry.js";
import type { WallLike, WallSegment } from "./geometry.js";
import { segmentLength, segmentPointAlong, segmentsOfWall } from "./geometry.js";
import type { OpeningRelation } from "./ir.js";
import { EDGE_WORDS } from "./room-datums.js";
import { fmt3 as numStr } from "./num-format.js";
import { hostedDatumDistance, placeBetween, placeOnEdge, type RelationCtx } from "./opening-relation.js";

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
 * Parse the attachment position after `at`: `<expr>%` | `<expr>` (mm) | `center`, and ADR
 * 0028 §5's datum forms `<expr> from start|end|<room>.<edge>` and `axis <label>`.
 *
 * The value is a full expression — the same one every other numeric slot takes, parsed
 * by the same {@link ParseCtx.parseExpr} entry point — so `for i in 0..4 { door on w1 at
 * bay * i + 600 width 900 }` places a generated run along the wall. Reading a single
 * `number` token here would force a generated run back onto the absolute `at (x,y) …
 * wall <id>` form, hand-computing the coordinate the `on` form exists to avoid.
 *
 * `noModulo` is what makes the trailing `%` readable: see {@link ParseExprOpts}.
 * `center` is still matched first, as a keyword, so it can never be read as a
 * bare reference. `axis` is read as the datum word only when a label follows it (a number,
 * or a name other than the `width` that always follows a position): `axis <label>` was never
 * a legal expression, so a plan that names a binding `axis` (`at axis width 900`) reads as
 * it always did. `from` after the value was never legal either.
 */
function parseAttachPos(ctx: ParseCtx): { pos: AttachPos; end: number } {
  if (ctx.isKeyword("center")) {
    const c = ctx.next();
    return { pos: { kind: "center" }, end: c.end };
  }
  if (ctx.isKeyword("axis")) {
    const after = ctx.peek(1);
    if (after.type === "number" || (after.type === "ident" && after.value !== "width")) {
      ctx.next();
      const t = ctx.next();
      return { pos: { kind: "axis", label: t.value, span: { start: t.start, end: t.end } }, end: t.end };
    }
  }
  const value = ctx.parseExpr({ noModulo: true });
  if (ctx.isType("percent")) {
    const pct = ctx.next();
    return { pos: { kind: "percent", value }, end: pct.end };
  }
  if (ctx.isKeyword("from")) {
    ctx.next();
    if (ctx.isKeyword("axis")) {
      ctx.fail(
        "An offset is measured `from start`, `from end` or `from <room>.<edge>`; to stand on an axis write `at axis <label>`",
      );
    }
    const t = ctx.eatIdent();
    const from: AttachFrom =
      t.value === "start" || t.value === "end"
        ? { word: t.value }
        : { datum: t.value, span: { start: t.start, end: t.end } };
    return { pos: { kind: "from", value, from }, end: t.end };
  }
  return { pos: { kind: "mm", value }, end: ctx.peek(-1).end };
}

/** Is `name` written as a room edge (`r.top`, `west.main.left`)? Only such an `on` target may
 *  leave its position out. */
export function isEdgeName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot > 0 && EDGE_WORDS.includes(name.slice(dot + 1));
}

/**
 * Parse an opening's leading position — shared by door/window/opening. Either the
 * existing absolute `at (x,y)` (with the `wall <ref>` clause left to the caller,
 * since it follows `width`), the wall-attached `on <wall> at <pos>` (which may also name
 * a room edge, `on <room>.<edge> [at <pos>]`, ADR 0028 §5), or — for a door or a cased
 * opening, `between` true — the relational `between <A> and <B> [at <pos>]`.
 */
export function parseAttachTarget(
  ctx: ParseCtx,
  between = false,
): { at?: ExprPoint; attach?: OpeningAttach; between?: OpeningBetween } {
  if (ctx.isKeyword("on")) {
    const onTok = ctx.next();
    const wall = ctx.eatIdent().value;
    // `on <room>.<edge>` may leave its position out (a window then stands at the edge's
    // centre); every other `on` target needs its `at`, exactly as before.
    if (!ctx.isKeyword("at") && isEdgeName(wall)) {
      return { attach: { wall, pos: { kind: "default" }, span: { start: onTok.start, end: ctx.peek(-1).end } } };
    }
    ctx.eatKeyword("at");
    const { pos, end } = parseAttachPos(ctx);
    return { attach: { wall, pos, span: { start: onTok.start, end } } };
  }
  if (ctx.isKeyword("between")) {
    if (!between) {
      ctx.fail(
        "A window is placed on one room's exterior edge (`window on <room>.<edge> [at …]`), not `between` two rooms",
      );
    }
    const kw = ctx.next();
    const room = (): WallsPairRoom => {
      const t = ctx.eatIdent();
      return { id: t.value, span: { start: t.start, end: t.end } };
    };
    const a = room();
    ctx.eatKeyword("and");
    const b = room();
    let pos: AttachPos = { kind: "default" };
    let end = b.span.end;
    if (ctx.isKeyword("at")) {
      ctx.next();
      ({ pos, end } = parseAttachPos(ctx));
    }
    return { between: { a, b, pos, span: { start: kw.start, end } } };
  }
  ctx.eatKeyword("at");
  return { at: ctx.parsePoint() };
}

/**
 * `pct` % of `len`, exact wherever the true product is a double. `(pct / 100) * len` rounds
 * twice — 0.55 is not a double, so 55 % of 6000 came out 3300.0000000000005, an ulp off a
 * room corner that a translated copy of the same plan then landed on exactly. Here the
 * percentage is read as the decimal it was written as, `n / 10^k` with the fewest digits
 * that reads back as `pct` (k ≤ 6), and the length is multiplied by the integer `n` before
 * the one division: an integer run within `MODEL_RANGE_MM` times `n ≤ 10^8` stays below
 * 2^53, so the only rounding is the division's, and a representable result is exact.
 * A percentage that needs more than 6 decimals (k > 6) falls back to the plain
 * `(len · pct) / 100`: two roundings, as before this fix.
 */
export function percentOf(len: number, pct: number): number {
  for (let k = 0, s = 1; k <= 6; k++, s *= 10) {
    const n = Math.round(pct * s);
    if (n / s === pct) return (len * n) / (100 * s);
  }
  return (len * pct) / 100;
}

/**
 * The walls a reference `on <ref>` names (B3a). A `status demolish` wall is no member of a CATEGORY
 * (`partition` is the standing partitions, as if the demolished one were deleted), but its own id
 * still names it, so a door written on it reaches `E_OPENING_ON_DEMOLISHED_WALL`. The copy is
 * charged to the step meter before it is allocated, and only when a wall is demolished.
 */
function wallsNamed<W extends WallLike & { status?: string }>(walls: readonly W[], ref: string): W[] {
  const named = walls.filter((w) => w.id === ref || w.category === ref);
  if (!named.some((w) => w.status === "demolish")) return named;
  chargeSteps(walls.length);
  return named.filter((w) => w.status !== "demolish" || w.id === ref);
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
  walls: readonly (WallLike & { status?: string })[],
  snapPt: (p: Point) => Point,
  diag: (d: Diagnostic) => void,
  what: string,
  evalNum: (e: Expr) => number,
  /** The datum positions (`from start|end|<room>.<edge>`, `axis <label>`, ADR 0028 §5); a
   *  plan that writes none never reads it. */
  rel?: RelationCtx,
  /** Is the name a pairwise wall the rooms refused (`ResolveCtx.unplacedWall`)? */
  unplacedWall?: (ref: string) => boolean,
): { at: Point; host: WallSegment } | null {
  const matches = wallsNamed(walls, attach.wall);
  if (matches.length === 0) {
    diag({
      severity: "error",
      message: unplacedWall?.(attach.wall)
        ? `${what} is attached \`on ${attach.wall}\`, but wall "${attach.wall}" could not be placed (see its own error)`
        : `${what} is attached \`on ${attach.wall}\` but no wall has that id or category`,
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
  const value = "value" in p ? p.value : undefined;
  const raw = value === undefined ? 0 : evalNum(value);
  if (p.kind !== "center" && !Number.isFinite(raw)) {
    diag({
      severity: "error",
      message: `${what} attachment position is not a finite number (got ${raw})`,
      code: "E_ATTACH_POS_RANGE",
      span: attach.span,
    });
    return null;
  }
  if (p.kind === "from" || p.kind === "axis" || p.kind === "default") {
    // A datum position: measured from an end of the run or from where a datum line crosses
    // it, then held to the run exactly as a millimetre position is (no clamp to offer: the
    // written form is not a distance from the start).
    const d = rel ? hostedDatumDistance(attach, segs, segmentLength, total, raw, rel, what) : null;
    if (d === null) return null;
    if (!(d >= 0 && d <= total)) {
      diag({
        severity: "error",
        message: `${what} attachment position is ${numStr(d)} mm along the wall run, outside it (0…${total})`,
        code: "E_ATTACH_POS_RANGE",
        span: attach.span,
      });
      return null;
    }
    dist = d;
  } else if (p.kind === "center") {
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
    dist = percentOf(total, pct);
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

/**
 * Resolve an opening's hosted lead — `between <A> and <B> …`, `on <room>.<edge> …` (both
 * relational, ADR 0028 §5) or `on <wall> at …` — to its point and host. `undefined` for the
 * `at (x,y)` form, which each element resolves itself (its off-wall warning is its own).
 * After a diagnostic the opening stands nowhere (`host: null`), as an unresolvable
 * attachment always has.
 *
 * `on <name>` is read as a wall reference whenever a wall has that id or category, exactly
 * as before; otherwise a name written as a room edge (`r.top`) is that edge. A name that is
 * both a wall and a room edge of the group is refused (`E_DATUM_NAME`), never read either way.
 */
export function resolveOpeningLead(
  n: { attach?: OpeningAttach; between?: OpeningBetween },
  kind: "door" | "window" | "opening",
  width: number,
  ctx: ResolveCtx,
  what: string,
): { at: Point; host: WallSegment | null; relation?: OpeningRelation } | undefined {
  const rel: RelationCtx = {
    grid: ctx.grid,
    walls: ctx.walls,
    snapPt: ctx.snapPt,
    diag: ctx.diag,
    eval: (e) => ctx.eval(e),
    ...(ctx.datums ? { datums: ctx.datums } : {}),
  };
  const none = { at: { x: 0, y: 0 }, host: null };
  if (n.between) return placeBetween(n.between, kind, width, rel, what) ?? none;
  const attach = n.attach;
  if (!attach) return undefined;
  if (isEdgeName(attach.wall) && ctx.datums) {
    const isWall = ctx.walls.some((w) => w.id === attach.wall || w.category === attach.wall);
    const room = attach.wall.slice(0, attach.wall.lastIndexOf("."));
    const isRoom = ctx.datums.table.rooms.has(room) || ctx.datums.table.refused.has(room);
    if (isWall && isRoom) {
      ctx.diag({
        severity: "error",
        message: `\`on ${attach.wall}\` could be the wall "${attach.wall}" or an edge of the room "${room}"; rename the wall so the name reads one way`,
        code: "E_DATUM_NAME",
        ...(attach.span ? { span: attach.span } : {}),
      });
      return none;
    }
    if (!isWall) return placeOnEdge(attach, kind, width, rel, what) ?? none;
  }
  const a = resolveAttachment(attach, ctx.walls, ctx.snapPt, ctx.diag, what, (e) => ctx.eval(e), rel, ctx.unplacedWall);
  return a ?? none;
}
