/**
 * Kitchen plan symbols: the sink run, the worktop, the hob and the fridge.
 *
 * As with `glyphs-bath.ts`, these bodies moved VERBATIM out of `fixtures-glyphs.ts` — same
 * primitives, same proportions, same draw order — with the local closures swapped for the
 * {@link GlyphCtx} factories. The full-SVG snapshots in `test/fixture-byte-identity.test.ts`
 * are what prove the move drew nothing new.
 *
 * The stubs at the foot are the categories this domain OWNS but does not draw yet: they
 * return `null`, so `furniture.render()` falls back to the labelled rectangle it has always
 * drawn for them. That is deliberate — the vocabulary and the art land in separate phases,
 * so the vocabulary's own fallout (derived rotation, footprints, lint) is observable on its
 * own before any drawing changes.
 *
 * Symbols draw with their back along the TOP edge; `furniture.render()` turns them.
 */

import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import { ellipsePoly, rectPoly } from "./glyph-lib.js";

/** Counter slab with two basins and a tap at the back. */
export function drawKitchenSink(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  g.poly(rectPoly(r), g.body);
  const m = Math.min(r.w, r.h) * 0.14;
  const bw = (r.w - 3 * m) / 2;
  const bh = r.h - 2 * m - r.h * 0.12;
  const by = r.y + m + r.h * 0.12;
  g.poly(
    [
      { x: r.x + m, y: by },
      { x: r.x + m + bw, y: by },
      { x: r.x + m + bw, y: by + bh },
      { x: r.x + m, y: by + bh },
    ],
    g.basin,
  );
  g.poly(
    [
      { x: r.x + 2 * m + bw, y: by },
      { x: r.x + 2 * m + 2 * bw, y: by },
      { x: r.x + 2 * m + 2 * bw, y: by + bh },
      { x: r.x + 2 * m + bw, y: by + bh },
    ],
    g.basin,
  );
  g.seg({ x: cx, y: r.y + r.h * 0.08 }, { x: cx, y: r.y + r.h * 0.2 });
  return g.nodes;
}

/** A slab with a line set in from the front edge, suggesting the counter nosing. */
export function drawCounter(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  g.seg({ x: r.x, y: r.y + r.h * 0.82 }, { x: r.x + r.w, y: r.y + r.h * 0.82 });
  return g.nodes;
}

/** A slab with four burners. */
export function drawStove(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const br = Math.min(r.w, r.h) * 0.16;
  for (const bx of [r.x + r.w * 0.3, r.x + r.w * 0.7]) {
    for (const byc of [r.y + r.h * 0.3, r.y + r.h * 0.7]) {
      g.poly(ellipsePoly(bx, byc, br, br), g.basin);
    }
  }
  return g.nodes;
}

/** A slab with the freezer/fridge split and a door-handle stub. */
export function drawFridge(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  g.seg({ x: r.x, y: r.y + r.h * 0.36 }, { x: r.x + r.w, y: r.y + r.h * 0.36 });
  g.seg({ x: r.x + r.w * 0.86, y: r.y + r.h * 0.12 }, { x: r.x + r.w * 0.86, y: r.y + r.h * 0.28 });
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Not drawn yet — see the module header. Each returns `null`, so the piece renders as
// today's labelled rectangle until the phase named below draws it.

/** WP-K1 — the wall oven. Catalogued since before this module; still undrawn. */
export function drawOven(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-K2 — the dishwasher. */
export function drawDishwasher(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-K3 — the kitchen island. */
export function drawIsland(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-K4 — the upper (wall) cabinet, conventionally drawn dashed: it is above the cut plane. */
export function drawUpperCabinet(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-U1 — the washing machine. */
export function drawWasher(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}

/** WP-U2 — the tumble dryer. */
export function drawDryer(_r: Rect, _g: GlyphCtx): SceneNode[] | null {
  return null;
}
