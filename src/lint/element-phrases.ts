/**
 * How a lint MESSAGE names a wall or a door, window or opening (PS2.29: a message never quotes
 * an id). A wall is named by its kind and the line it runs on ("the exterior wall at y 0"), a
 * connector by the rooms it joins ("the door between the kitchen and the hall") and, when it joins
 * no two rooms, by the wall it stands in. Rooms are named as `ctx.nameOf` names them
 * (`phrases.ts`). The id an agent edits by is in the hints.
 */

import { connectorConnection, EXTERIOR_NODE } from "../analyze.js";
import type { WallSegment } from "../geometry.js";
import type { RDoor, ROpening, RWindow } from "../ir.js";
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
