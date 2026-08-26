/**
 * Living- and dining-room plan symbols: seating, tables and the media wall.
 *
 * Nothing here draws yet — every function returns `null`, so each category renders as the
 * labelled rectangle it already did. See `glyphs-bedroom.ts`'s header for why the vocabulary
 * ships a phase ahead of the art.
 *
 * The seating pieces are free-standing (no `requiresWall`) on purpose: a sofa floated in the
 * middle of a room is a normal plan, and making it wall-requiring would raise a placement
 * warning on drawings that are correct.
 */

import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";

/** WP-L1 — the sofa: seat, back cushion along the rear edge, arms at both ends. */
export function drawSofa(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-L1 — the armchair: the sofa's drawing at one seat width. */
export function drawArmchair(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-L2 — the coffee table. */
export function drawCoffeeTable(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-L2 — a plain table. */
export function drawTable(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-L3 — the dining table. */
export function drawDiningTable(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-L3 — the dining chair. */
export function drawChair(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-L3 — the stool: a round seat with no back, so its symbol is rotation-symmetric. */
export function drawStool(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-L4 — the bench. */
export function drawBench(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-L5 — the TV unit / media console. */
export function drawTvUnit(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}
