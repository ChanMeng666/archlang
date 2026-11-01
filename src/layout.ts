/**
 * Relational placement (T6.2) — the optional layout seam.
 *
 * Rooms declared with a relational clause (`right-of`/`left-of`/`below`/`above`
 * with optional `align`/`gap`) get their absolute top-left corner computed here
 * by **pure arithmetic in dependency order**. This is deliberately NOT an
 * optimizer: each room's position is a closed-form function of its reference
 * room's resolved box, resolved via a topological pass. References form a DAG;
 * a cycle is a user error (`E_LAYOUT_CYCLE`, members only), an unknown reference is
 * `E_LAYOUT_REF`, a reference with no one run on that side `E_PLACE_POLY`, and a room that
 * merely depends on one of those (directly, along a chain, or into a cycle) `E_LAYOUT_UNPLACED`.
 *
 * A rectilinear polygon is a reference through the ring's extreme run on that side, never its
 * box: the run's line is where the room stands, and its ends are what `align` reads.
 *
 * Determinism: rooms are processed in declaration order within each pass, and
 * computed coordinates are grid-snapped exactly like absolute ones, so the same
 * source always yields byte-identical output. Rooms with an absolute `at` carry
 * no constraint and are untouched by the solver.
 */

import type { Point } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import { rectLabelOutsideDiag } from "./elements/room.js";
import type { RelConstraint, RRoom } from "./ir.js";
import { type EdgeLine, extremeRuns, rectilinear, runsText, type SideWord } from "./room-tiling.js";

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

/** The side of a reference a relational clause reads. */
const SIDE_OF: Readonly<Record<RelConstraint["dir"], SideWord>> = {
  "right-of": "right",
  "left-of": "left",
  below: "bottom",
  above: "top",
};

/**
 * `place` against one run of a polygon reference: the closed form of `place`, with the run for the
 * rectangle's side. The rectangle's arithmetic above stays as it is, operand for operand.
 */
function placeOnRun(room: RelRoom, run: EdgeLine, snapPt: (p: Point) => Point): void {
  const { dir, gap } = room._rel;
  const cross = (own: number, axis: "v" | "h"): number =>
    alignOffset(run.lo, run.hi - run.lo, own, room._rel.align, axis);
  const at = {
    "right-of": { x: run.c + gap, y: cross(room.size.h, "v") },
    "left-of": { x: run.c - room.size.w - gap, y: cross(room.size.h, "v") },
    below: { x: cross(room.size.w, "h"), y: run.c + gap },
    above: { x: cross(room.size.w, "h"), y: run.c - room.size.h - gap },
  };
  room.at = snapPt(at[dir]);
}

/**
 * The run of a polygon reference a relational clause stands on, or why it has none. Only an outline
 * with every edge horizontal or vertical has sides at all, and a side of several runs does not
 * say which: both are an error naming the way out, never a guess (ADR 0005).
 */
function referenceRun(room: RelRoom, ref: RRoom & { poly: Point[] }): EdgeLine | string {
  const { dir, ref: id } = room._rel;
  const head = `Room "${room.id}" is placed \`${dir} ${id}\`, but`;
  const instead = "Place this room with `at (x,y)` instead.";
  if (ref._ringRefused) return `${head} the outline of "${id}" was refused (see its own error). ${instead}`;
  if (ref.circle || !rectilinear(ref.poly))
    return `${head} "${id}" is ${ref.circle ? "a circle room" : "a polygon room with an edge neither horizontal nor vertical"} — relational placement needs a rectangular or rectilinear reference. ${instead}`;
  const side = SIDE_OF[dir];
  const runs = extremeRuns(ref.poly, side);
  if (runs.length === 1) return runs[0]!;
  return `${head} the ${side} side of "${id}" is ${runs.length} separate runs (${runsText(runs)}), which does not say which. ${instead}`;
}

/**
 * Resolve every relational room's absolute position in place. No-op when no room
 * uses a relational clause (so absolute-only plans are byte-identical).
 *
 * @param rooms   All resolved rooms, in declaration order.
 * @param snapPt  Grid-snap used for absolute coords (computed coords snap too).
 * @param diag    Sink for `E_LAYOUT_REF` / `E_PLACE_POLY` / `E_LAYOUT_UNPLACED` /
 *                `E_LAYOUT_CYCLE`, emitted in declaration order of the offending room.
 *
 * Every room left without a real position (failed, unplaced or on a cycle) is marked
 * `_unplaced`. The mark survives `room.transform`, so an enclosing plan's pass sees an
 * instance's unplaced room as unplaced rather than as an absolute room at its placeholder,
 * and `checkRoomOverlaps` skips such rooms (their `at` is a placeholder, not geometry).
 */
export function placeRelational(
  rooms: RRoom[],
  snapPt: (p: Point) => Point,
  diag: (d: Diagnostic, room?: RRoom) => void,
): void {
  const rel = rooms.filter((r): r is RelRoom => r._rel !== undefined);
  if (rel.length === 0) return;

  const byId = new Map<string, RRoom>(rooms.map((r) => [r.id, r]));
  // `unresolved` holds relational rooms whose `at` is still a placeholder.
  // Absolute rooms are never in this set, so they count as resolved from the
  // start (a relational room may reference an absolute or relational room).
  const unresolved = new Set<string>(rel.map((r) => r.id));
  // Rooms that could NOT be placed (unknown reference, polygon reference). They leave
  // `unresolved` so the fixpoint stops revisiting them, but they are NOT resolved: a
  // dependent must never be placed against their (0,0) placeholder.
  const failed = new Set<string>();
  // A room blocked for a dependent: failed here, or carried in already unplaced by an
  // instance's own pass (a transformed room has no `_rel`, so it is not in `rel`).
  const blocked = (id: string): boolean => failed.has(id) || byId.get(id)?._unplaced === true;
  const isResolved = (id: string): boolean => byId.has(id) && !unresolved.has(id) && !blocked(id);
  // Layout errors are buffered per room and flushed in declaration order at the end, so
  // the phases (fixpoint, then leftover walk) cannot invert the order.
  const pending = new Map<string, Diagnostic>();

  // Fixpoint: keep placing any room whose reference is resolved. Declaration
  // order within each sweep makes the result deterministic.
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rel) {
      if (!unresolved.has(r.id)) continue;
      const ref = byId.get(r._rel.ref);
      if (!ref) {
        pending.set(r.id, {
          severity: "error",
          message: `Room "${r.id}" is placed relative to unknown room "${r._rel.ref}"`,
          code: "E_LAYOUT_REF",
          span: r._rel.span,
        });
        unresolved.delete(r.id); // can't place it; stop revisiting
        failed.add(r.id);
        changed = true;
        continue;
      }
      if (isResolved(r._rel.ref)) {
        // A relational clause is closed-form arithmetic on the REFERENCE's side ("its right
        // edge, its top edge"). A polygon's side is the ring's extreme run. Silently using its
        // bounding box would put the room against an edge the reference does not have.
        const run = ref.poly ? referenceRun(r, ref as RRoom & { poly: Point[] }) : undefined;
        if (typeof run === "string") {
          pending.set(r.id, { severity: "error", message: run, code: "E_PLACE_POLY", span: r._rel.span });
          unresolved.delete(r.id);
          failed.add(r.id);
          changed = true;
          continue;
        }
        if (run) placeOnRun(r, run, snapPt);
        else place(r, ref, snapPt);
        // `label … at (x,y)` is an absolute plan coordinate, so whether it lands on this
        // room's floor is only answerable once the floor has one — which is HERE, and
        // nowhere earlier: at resolve the room's `at` was still the (0,0) placeholder,
        // where the test would have been not merely unhelpful but wrong. Same predicate
        // the absolute path uses, imported rather than restated.
        const outside = rectLabelOutsideDiag(r);
        if (outside) diag(outside, r);
        unresolved.delete(r.id);
        changed = true;
      }
    }
  }

  // Whatever remains is stuck for one of two reasons. The reference relation is a
  // functional graph (each room has at most one reference), so following a leftover
  // room's single reference either reaches a failed room, closes a cycle through the
  // room itself, or runs into a cycle it is not on. Only rooms ON a cycle are blamed
  // as members; a room that merely depends on a failed room or on a cycle gets
  // `E_LAYOUT_UNPLACED` naming what it is waiting for. Its `at` stays the (0,0)
  // placeholder: an error plan renders nothing, so that position is never drawn and
  // there is no safer value to invent.
  for (const r of rel) {
    if (!unresolved.has(r.id)) continue;
    const walked = new Set<string>([r.id]);
    let cur: RelRoom = r;
    for (;;) {
      const next = cur._rel.ref;
      if (blocked(next) || (walked.has(next) && next !== r.id)) {
        pending.set(r.id, {
          severity: "error",
          message: `Room "${r.id}" cannot be placed: it depends on "${next}", which ${blocked(next) ? "could not be placed (see its own error)" : "is part of a relational placement cycle"}`,
          code: "E_LAYOUT_UNPLACED",
          span: r._rel.span,
        });
        break;
      }
      if (next === r.id) {
        pending.set(r.id, {
          severity: "error",
          message: `Room "${r.id}" is part of a relational placement cycle`,
          code: "E_LAYOUT_CYCLE",
          span: r._rel.span,
        });
        break;
      }
      walked.add(next);
      cur = byId.get(next) as RelRoom;
    }
  }

  for (const r of rel) {
    const d = pending.get(r.id);
    if (!d) continue;
    r._unplaced = true;
    diag(d, r);
  }
}
