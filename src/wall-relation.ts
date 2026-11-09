/**
 * The pairwise wall forms (ADR 0028 §4, plan decision D1): an authored wall whose geometry is
 * written against the rooms rather than as points.
 *
 *     wall id=p partition thickness 100 between <A> and <B>
 *     wall id=e exterior thickness 200 around [<A> <B> <C>]
 *
 * `between` stands on the one shared edge run of two rectangular rooms, from its end with
 * the smaller `y`, then `x`; `around` is one closed ring on the outline of the listed rooms'
 * union, clockwise from its vertex with the smallest `y`, then `x` (ADR 0028 §3's direction
 * rule for derived walls). The geometry comes from the same sweep and ring linking
 * `walls from rooms` runs (`src/room-tiling.ts`), so the two forms cannot disagree about
 * where a shared edge or an outline is.
 *
 * The rooms are read from the group's frozen datum table (`ResolveCtx.datums`, ADR 0028 §1),
 * so a wall sees exactly the rooms a datum or a relational door sees: its own group's, and a
 * placed instance's under its dotted name (`west.main`). Every case with no single answer is
 * refused, never chosen (ADR 0005). Afterwards the wall is an ordinary authored wall: its
 * id, category, thickness, material and height are the author's, and it hosts, lints and
 * coexists with `walls from rooms` exactly as the same wall typed as points does.
 *
 * Step meter (`MAX_EVAL_STEPS`, `src/expr.ts`): one step per room name read, as a datum read
 * costs (`roomOf`).
 */

import type { Point, WallRelationNode, WallsPairRoom } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import { chargeSteps, closest } from "./expr.js";
import type { WallRelation } from "./ir.js";
import type { DatumAccess } from "./opening-relation.js";
import { deriveAround, deriveBetween, type TileRoom, type TilingRefusal } from "./room-tiling.js";

/** What a pairwise wall resolves to: its points, whether they close, and the relation. */
export interface ResolvedWallRelation {
  points: Point[];
  closed: boolean;
  relation: WallRelation;
}

/** What the resolution needs from `ResolveCtx`. */
export interface WallRelationCtx {
  datums?: DatumAccess;
  diag(d: Diagnostic): void;
}

/**
 * Resolve a wall's pairwise form, or `undefined` after a diagnostic (the wall then has no
 * points: it is drawn nowhere and hosts nothing, as a refused relational door draws nothing).
 * `thickness` is the wall's own, read by `E_PARTITION_TOO_SHORT`.
 */
export function resolveWallRelation(
  rel: WallRelationNode,
  wallId: string,
  thickness: number,
  ctx: WallRelationCtx,
): ResolvedWallRelation | undefined {
  if (rel.kind === "between") {
    const what = `Wall "${wallId}" cannot stand between "${rel.a.id}" and "${rel.b.id}"`;
    const a = roomOf(rel.a, ctx, what);
    const b = a ? roomOf(rel.b, ctx, what) : undefined;
    if (!a || !b) return undefined;
    if (a.id === b.id) {
      ctx.diag(refusalDiag("E_WALL_BETWEEN_NOT_ADJACENT", `${what}: a room shares no edge with itself`, rel.span));
      return undefined;
    }
    const got = deriveBetween(a, b, thickness);
    if (!got.ok) {
      ctx.diag(refusalDiag(got.refusal.code, `${what}: ${betweenWhy(got.refusal)}`, rel.span));
      return undefined;
    }
    return { points: got.points, closed: false, relation: { between: [rel.a.id, rel.b.id] } };
  }
  const list = rel.rooms.map((r) => r.id).join(" ");
  const what = `Wall "${wallId}" cannot go around [${list}]`;
  const seen = new Set<string>();
  const rooms: TileRoom[] = [];
  for (const r of rel.rooms) {
    if (seen.has(r.id)) {
      ctx.diag(
        refusalDiag("E_ROOMS_OVERLAP", `${what}: "${r.id}" is listed twice, so it would overlap itself`, r.span),
      );
      return undefined;
    }
    seen.add(r.id);
    const room = roomOf(r, ctx, what);
    if (!room) return undefined;
    rooms.push(room);
  }
  const got = deriveAround(rooms);
  if (!got.ok) {
    for (const r of got.refusals) ctx.diag(refusalDiag(r.code, `${what}: ${aroundWhy(r)}`, rel.span));
    return undefined;
  }
  return { points: got.points, closed: true, relation: { around: rel.rooms.map((r) => r.id) } };
}

/**
 * A named room as a rectangle, read from the group's frozen datum table, or `undefined`
 * after a diagnostic on the name: a polygon or circle room (`E_ROOM_NOT_RECTANGLE`), a room
 * that could not be placed or has no size (`E_DATUM_UNPLACED`), or a room the group cannot
 * see (`E_UNKNOWN_REF`). One step per name, as a datum read costs.
 */
function roomOf(room: WallsPairRoom, ctx: WallRelationCtx, what: string): TileRoom | undefined {
  chargeSteps(1);
  const table = ctx.datums?.table;
  const lines = table?.rooms.get(room.id);
  if (lines) return { id: room.id, rect: { x0: lines.left, y0: lines.top, x1: lines.right, y1: lines.bottom } };
  const why = table?.refused.get(room.id);
  if (why === "polygon" || why === "circle") {
    ctx.diag(
      refusalDiag(
        "E_ROOM_NOT_RECTANGLE",
        `${what}: "${room.id}" is a ${why} room, and only a rectangular room has edges a wall can be derived from`,
        room.span,
      ),
    );
    return undefined;
  }
  if (why === "unplaced" || why === "degenerate") {
    ctx.diag(
      refusalDiag(
        "E_DATUM_UNPLACED",
        why === "unplaced"
          ? `${what}: room "${room.id}" could not be placed (its own error says why), so it has no edge to stand on`
          : `${what}: room "${room.id}" has no positive size, so it has no edge to stand on`,
        room.span,
      ),
    );
    return undefined;
  }
  const hint = table ? closest(room.id, [...table.rooms.keys(), ...table.refused.keys()]) : undefined;
  ctx.diag({
    ...refusalDiag("E_UNKNOWN_REF", `${what}: "${room.id}" is not a room this plan or component can see`, room.span),
    ...(hint ? { hints: [`did you mean "${hint}"?`] } : {}),
  });
  return undefined;
}

function betweenWhy(r: TilingRefusal): string {
  switch (r.code) {
    case "E_ROOMS_OVERLAP":
      return "the two rooms overlap, so the edge between them is not one line";
    case "E_WALL_BETWEEN_NOT_ADJACENT":
      return "the two rooms share no edge (they are apart, or touch only at a corner)";
    default:
      return r.why;
  }
}

function aroundWhy(r: TilingRefusal): string {
  return r.code === "E_ROOMS_OVERLAP" ? `the rooms overlap (${r.why})` : r.why;
}

const HINTS: Record<string, string> = {
  E_ROOMS_OVERLAP: "Move or resize the rooms so they meet edge to edge, and name each room once.",
  E_WALL_BETWEEN_NOT_ADJACENT: "Name two rooms that meet along an edge, or type the wall's points.",
  E_PARTITION_TOO_SHORT: "Line the rooms' edges up, or make the shared edge at least as long as the wall is thick.",
  E_ROOMS_NOT_TILING:
    "List rooms that form one floor meeting edge to edge (write a gap as a room of its own), or type the ring's points; a courtyard or a void needs its own wall, or `walls from rooms`.",
  E_ROOM_NOT_RECTANGLE: "Type the wall's points, or name rectangular rooms.",
};

function refusalDiag(code: string, message: string, span: WallsPairRoom["span"]): Diagnostic {
  const hint = HINTS[code];
  return { severity: "error", message, code, span, ...(hint ? { hints: [hint] } : {}) };
}
