/**
 * Relational placement (T6.2) — the optional layout seam.
 *
 * Rooms declared with a relational clause (`right-of`/`left-of`/`below`/`above`
 * with optional `align`/`gap`) get their absolute top-left corner computed here
 * by **pure arithmetic in dependency order**. This is deliberately NOT an
 * optimizer: each room's position is a closed-form function of its reference
 * room's resolved box, resolved via a topological pass. References form a DAG;
 * a cycle is a user error (`E_LAYOUT_CYCLE`), an unknown reference is
 * `E_LAYOUT_REF`.
 *
 * Determinism: rooms are processed in declaration order within each pass, and
 * computed coordinates are grid-snapped exactly like absolute ones, so the same
 * source always yields byte-identical output. Rooms with an absolute `at` carry
 * no constraint and are untouched — the manual path is byte-identical to v0.11.
 */

import type { Point } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import type { RelConstraint, RRoom } from "./ir.js";

/** A room that definitely carries a relational constraint. */
type RelRoom = RRoom & { _rel: RelConstraint };

/**
 * Cross-axis alignment offset. For horizontal placement (`right-of`/`left-of`)
 * the cross axis is vertical (`top`/`middle`/`bottom`); for vertical placement
 * (`below`/`above`) it is horizontal (`left`/`center`/`right`). `center`≡`middle`.
 * The default and any axis-mismatched edge fall back to the leading edge.
 */
function alignOffset(
  start: number,
  refExtent: number,
  ownExtent: number,
  align: string | undefined,
  axis: "v" | "h",
): number {
  const trailing = axis === "v" ? "bottom" : "right";
  if (align === trailing) return start + refExtent - ownExtent;
  if (align === "middle" || align === "center") return start + (refExtent - ownExtent) / 2;
  return start; // leading edge (`top`/`left`) or unspecified
}

/** Compute and assign `room.at` from its (already-placed) reference room. */
function place(room: RelRoom, ref: RRoom, snapPt: (p: Point) => Point): void {
  const { dir, gap } = room._rel;
  const align = room._rel.align;
  let x: number;
  let y: number;
  switch (dir) {
    case "right-of":
      x = ref.at.x + ref.size.w + gap;
      y = alignOffset(ref.at.y, ref.size.h, room.size.h, align, "v");
      break;
    case "left-of":
      x = ref.at.x - room.size.w - gap;
      y = alignOffset(ref.at.y, ref.size.h, room.size.h, align, "v");
      break;
    case "below":
      x = alignOffset(ref.at.x, ref.size.w, room.size.w, align, "h");
      y = ref.at.y + ref.size.h + gap;
      break;
    case "above":
      x = alignOffset(ref.at.x, ref.size.w, room.size.w, align, "h");
      y = ref.at.y - room.size.h - gap;
      break;
  }
  room.at = snapPt({ x, y });
}

/**
 * Resolve every relational room's absolute position in place. No-op when no room
 * uses a relational clause (so absolute-only plans are byte-identical).
 *
 * @param rooms   All resolved rooms, in declaration order.
 * @param snapPt  Grid-snap used for absolute coords (computed coords snap too).
 * @param diag    Sink for `E_LAYOUT_REF` / `E_LAYOUT_CYCLE`.
 */
export function placeRelational(rooms: RRoom[], snapPt: (p: Point) => Point, diag: (d: Diagnostic) => void): void {
  const rel = rooms.filter((r): r is RelRoom => r._rel !== undefined);
  if (rel.length === 0) return;

  const byId = new Map<string, RRoom>(rooms.map((r) => [r.id, r]));
  // `unresolved` holds relational rooms whose `at` is still a placeholder.
  // Absolute rooms are never in this set, so they count as resolved from the
  // start (a relational room may reference an absolute or relational room).
  const unresolved = new Set<string>(rel.map((r) => r.id));
  const isResolved = (id: string): boolean => byId.has(id) && !unresolved.has(id);

  // Fixpoint: keep placing any room whose reference is resolved. Declaration
  // order within each sweep makes the result deterministic.
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rel) {
      if (!unresolved.has(r.id)) continue;
      const ref = byId.get(r._rel.ref);
      if (!ref) {
        diag({
          severity: "error",
          message: `Room "${r.id}" is placed relative to unknown room "${r._rel.ref}"`,
          code: "E_LAYOUT_REF",
          span: r._rel.span,
        });
        unresolved.delete(r.id); // can't place it; stop revisiting
        changed = true;
        continue;
      }
      if (isResolved(r._rel.ref)) {
        place(r, ref, snapPt);
        unresolved.delete(r.id);
        changed = true;
      }
    }
  }

  // Whatever remains depends (transitively) on itself: a placement cycle.
  for (const r of rel) {
    if (unresolved.has(r.id)) {
      diag({
        severity: "error",
        message: `Room "${r.id}" is part of a relational placement cycle`,
        code: "E_LAYOUT_CYCLE",
        span: r._rel.span,
      });
    }
  }
}
