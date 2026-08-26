/**
 * Bathroom plan symbols: the WC, the basin, the shower tray and the tub.
 *
 * These four bodies moved here VERBATIM from `fixtures-glyphs.ts` — same primitives, same
 * proportions, same draw order — with the local `poly`/`line` closures replaced by the
 * {@link GlyphCtx} factories and `ellipse`/`roundedRect` by their `glyph-lib` twins. Nothing
 * about the drawing changed, which is the point: `test/fixture-byte-identity.test.ts` holds
 * a full-SVG snapshot of each one, so a conversion that moved a byte would have said so.
 *
 * Symbols are drawn with their "back" (the side placed against a wall) along the TOP edge of
 * the footprint; `furniture.render()` quarter-turns the result about the footprint centre.
 * Pure and deterministic.
 */

import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import { ellipsePoly, insetRect, rectPoly, roundedRectPoly } from "./glyph-lib.js";

/** Cistern across the back (top), bowl ellipse in front. */
export function drawWc(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  const cisH = r.h * 0.22;
  g.poly(
    [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + cisH },
      { x: r.x, y: r.y + cisH },
    ],
    g.body,
  );
  const bowlCy = r.y + cisH + (r.h - cisH) * 0.52;
  g.poly(ellipsePoly(cx, bowlCy, r.w * 0.4, (r.h - cisH) * 0.46), g.basin);
  return g.nodes;
}

/** Vanity/counter slab with an inset oval bowl and a tap at the back. */
export function drawBasin(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  g.poly(rectPoly(r), g.body);
  g.poly(ellipsePoly(cx, r.y + r.h * 0.56, r.w * 0.34, r.h * 0.32), g.basin);
  g.seg({ x: cx, y: r.y + r.h * 0.1 }, { x: cx, y: r.y + r.h * 0.24 });
  return g.nodes;
}

/** Tray outline, corner-to-corner diagonals, centre drain. */
export function drawShower(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  g.poly(rectPoly(r), g.basin);
  g.seg({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
  g.seg({ x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h });
  g.poly(ellipsePoly(cx, cy, Math.min(r.w, r.h) * 0.08, Math.min(r.w, r.h) * 0.08), g.body);
  return g.nodes;
}

/** Eased outer rim, an inset well, and the tap at the left end. */
export function drawBathtub(r: Rect, g: GlyphCtx): SceneNode[] {
  const cy = r.y + r.h / 2;
  g.poly(roundedRectPoly(r, Math.min(r.w, r.h) * 0.18), g.body);
  g.poly(roundedRectPoly(insetRect(r, 0.14), Math.min(r.w, r.h) * 0.12), g.basin);
  g.poly(ellipsePoly(r.x + r.w * 0.07, cy, Math.min(r.w, r.h) * 0.05, Math.min(r.w, r.h) * 0.05), g.stroke);
  return g.nodes;
}
