/**
 * How a lint MESSAGE names a wall or a door, window or opening (PS2.29: a message never quotes
 * an id). A wall is named by its kind and the line it runs on ("the exterior wall at y 0"), a
 * connector by the rooms it joins ("the door between the kitchen and the hall") and, when it joins
 * no two rooms, by the wall it stands in. Rooms are named as `ctx.nameOf` names them
 * (`phrases.ts`). The id an agent edits by is in the hints.
 */

import { connectorConnection, EXTERIOR_NODE, pointInRoomBox } from "../analyze.js";
import type { WallSegment } from "../geometry.js";
import type { RDoor, ROpening, RWindow } from "../ir.js";
import { wallOf } from "../wall-ref.js";
import type { LintContext } from "./context.js";
import { mm } from "./measure.js";

/** A door, window or cased opening. */
export type Hosted = RDoor | RWindow | ROpening;

/** ` at x 4000` / ` at y 3000` for a straight axis-aligned segment, else nothing. */
export function axisLine(s: WallSegment): string {
  if (s.arc) return " (curved)";
  if (s.a.x === s.b.x && s.a.y !== s.b.y) return ` at x ${mm(s.a.x)}`;
  if (s.a.y === s.b.y && s.a.x !== s.b.x) return ` at y ${mm(s.a.y)}`;
  return ` from (${mm(s.a.x)}, ${mm(s.a.y)}) to (${mm(s.b.x)}, ${mm(s.b.y)})`;
}

/** A wall named by its kind and the line it runs on, never its id. */
export const wallPhrase = (s: WallSegment): string => `the ${s.category} wall${axisLine(s)}`;

/** An `open between` boundary named by the line it runs on: nothing is built along it. */
export const openBoundaryPhrase = (s: WallSegment): string => `the open boundary${axisLine(s)}`;

export const KIND_WORD: Record<Hosted["kind"], string> = { door: "door", window: "window", opening: "opening" };

/** An opening named by the rooms it serves (labels, never ids). */
export function openingName(ctx: LintContext, el: Hosted): string {
  const { between } = connectorConnection(el, ctx.roomRects, ctx.rules.tolMm);
  const label = (id: string): string | null => {
    const r = ctx.rooms.find((x) => x.id === id);
    return r ? ctx.nameOf(r) : null;
  };
  const word = KIND_WORD[el.kind];
  const [a, b] = [between[0] ?? "", between[1] ?? ""];
  const ext = a === EXTERIOR_NODE ? b : b === EXTERIOR_NODE ? a : null;
  if (ext !== null) {
    const r = label(ext);
    if (r) return el.kind === "window" ? `the window of ${r}` : `the exterior ${word} into ${r}`;
  } else {
    const ra = label(a);
    const rb = label(b);
    if (ra && rb) return `the ${word} between ${ra} and ${rb}`;
    if (ra || rb) return `the ${word} of ${ra ?? rb}`;
  }
  return el.host ? `the ${word} on ${wallPhrase(el.host)}` : `the ${word}`;
}

/**
 * A wall named by what stands on its two faces, for a message that must not quote its id: the
 * partition `walls from rooms` derived between two rooms, or any straight wall with a room on each
 * face ("the partition between the kitchen and the hall"), an exterior wall with one ("the exterior
 * wall of the kitchen"), else its kind and where it stands ("the exterior wall at the top of the
 * plan"). A curved wall falls back to {@link wallPhrase}.
 */
export function wallNamed(ctx: LintContext, seg: WallSegment): string {
  const w = wallOf(ctx.ir.walls, { wallId: seg.wallId, a: seg.a, b: seg.b });
  const roomNamed = (id: string): string | null => {
    const r = ctx.rooms.find((x) => x.id === id);
    return r ? ctx.nameOf(r) : null;
  };
  const between = w?._derived?.between;
  if (between) {
    const a = roomNamed(between[0]);
    const b = roomNamed(between[1]);
    if (a && b) return `the partition between ${a} and ${b}`;
  }
  // A curved wall, or a plan with no room to place it among: the kind and the line it runs on.
  if (seg.arc || ctx.rooms.length === 0) return wallPhrase(seg);
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const len = Math.hypot(dx, dy);
  const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
  if (len > 0) {
    // One probe each side, a little past the wall's own face, lands inside the room there.
    const off = seg.thickness / 2 + 50;
    const roomAt = (p: { x: number; y: number }) =>
      ctx.rooms.find((r) => {
        const box = ctx.roomRects.get(r.id);
        return box !== undefined && pointInRoomBox(p, box);
      });
    const a = roomAt({ x: mid.x - (dy / len) * off, y: mid.y + (dx / len) * off });
    const b = roomAt({ x: mid.x + (dy / len) * off, y: mid.y - (dx / len) * off });
    if (a && b && a !== b) return `the partition between ${ctx.nameOf(a)} and ${ctx.nameOf(b)}`;
    if ((a || b) && seg.category === "exterior") return `the exterior wall of ${ctx.nameOf((a ?? b)!)}`;
  }
  return `the ${seg.category} wall ${ctx.placeAt(mid)}`;
}
