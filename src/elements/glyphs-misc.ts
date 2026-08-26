/**
 * The remaining plan symbols: the workspace pieces, and the two that belong to no room at
 * all (a plant, a parked car).
 *
 * Nothing here draws yet — every function returns `null`, so each category renders as the
 * labelled rectangle it already did. See `glyphs-bedroom.ts`'s header for why the vocabulary
 * ships a phase ahead of the art.
 *
 * `car` earns its place for the same reason a `bench` does: it is drawn on real plans (a
 * carport, a driveway, a garage) and a model asked for one will write the word whether or
 * not the catalog knows it. Catalogued, it is free-standing and unsized-by-default, so it
 * behaves exactly like any other unlisted word until someone draws it.
 */

import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";

/** WP-O1 — the desk. */
export function drawDesk(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-O1 — the swivel office chair. */
export function drawOfficeChair(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-O2 — the bookshelf: a carcass with its shelf lines drawn across the run. */
export function drawBookshelf(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-M1 — the potted plant. */
export function drawPlant(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-M2 — the car, in plan. */
export function drawCar(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}
