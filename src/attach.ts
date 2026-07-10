/**
 * Opening attachment (`door|window|opening … on <wall> at <pos>`).
 *
 * Resolves a wall-relative position into an absolute point + the exact host wall
 * segment, by walking the named wall's polyline by cumulative length. Unlike the
 * nearest-wall search openings normally use, this pins the opening to the wall
 * *by construction*, so an attached opening can never be reported "off wall".
 *
 * Pure and deterministic: the derived point is grid-snapped through the same
 * `snapPt` the rest of resolve uses, so output is byte-stable.
 */

import type { ExprPoint, OpeningAttach, Point } from "./ast.js";
import type { Diagnostic, FixSuggestion } from "./diagnostics.js";
import type { ParseCtx } from "./registry.js";
import type { WallLike, WallSegment } from "./geometry.js";
import { add, length, mul, segmentsOfWall, sub, unit } from "./geometry.js";
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

/** Parse the attachment position after `at`: `40%` | `1200` (mm) | `center`. */
function parseAttachPos(ctx: ParseCtx): { pos: OpeningAttach["pos"]; end: number } {
  if (ctx.isKeyword("center")) {
    const c = ctx.next();
    return { pos: { kind: "center" }, end: c.end };
  }
  const numTok = ctx.eat("number");
  const n = numTok.num!;
  if (ctx.isType("percent")) {
    const pct = ctx.next();
    return { pos: { kind: "percent", value: n }, end: pct.end };
  }
  return { pos: { kind: "mm", value: n }, end: numTok.end };
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
  const total = segs.reduce((s, seg) => s + length(sub(seg.b, seg.a)), 0);

  // Distance from the wall's start to the attachment point, along the polyline.
  let dist: number;
  const p = attach.pos;
  if (p.kind === "center") {
    dist = total / 2;
  } else if (p.kind === "percent") {
    const pct = p.value ?? 0;
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
    const mm = p.value ?? 0;
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
    const segLen = length(sub(seg.b, seg.a));
    if (dist <= acc + segLen || k === segs.length - 1) {
      const along = dist - acc;
      const at = add(seg.a, mul(unit(sub(seg.b, seg.a)), along));
      return { at: snapPt(at), host: seg };
    }
    acc += segLen;
  }
  return null; // unreachable: a non-empty wall always has a final segment
}
