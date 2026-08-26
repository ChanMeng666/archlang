/**
 * Bedroom plan symbols — the bed and what stands beside it.
 *
 * Nothing here draws yet. Every function returns `null`, which is exactly what an
 * uncatalogued category has always done: `furniture.render()` falls back to the labelled
 * rectangle, so adding this module changes no drawing at all. The vocabulary lands first and
 * on its own, so its real fallout — derived rotation from a wall anchor, default footprints,
 * the placement lint rules — is visible before any art moves.
 *
 * A bed's back edge is its HEAD, which is why every wall-requiring category here is
 * orientation-bearing (not `symmetric`): which way it faces is an architectural fact, and
 * the resolver derives it from the wall the anchor names.
 */

import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";

/** WP-B1 — the single bed: mattress, pillow at the head, turned-down coverlet. */
export function drawBed(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-B1 — the double bed: two pillows, otherwise the single's drawing. */
export function drawDoubleBed(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-B2 — the nightstand. */
export function drawNightstand(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-B3 — the wardrobe: a carcass with the hanging rail drawn along its back. */
export function drawWardrobe(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}
