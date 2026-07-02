/**
 * Drawn symbols for plumbing & kitchen fixtures.
 *
 * Furniture renders as a labelled rectangle, which reads as an empty box for a WC
 * or a shower. {@link fixtureGlyph} returns a small set of Scene primitives drawing
 * a recognizable plan symbol for known fixture categories (a WC bowl + cistern, a
 * basin, a shower with a drain, …), in the same drawing vocabulary as the door
 * arcs and window panes. `furniture.render()` calls this first and falls back to
 * the plain rectangle when it returns `null` (any unknown category) — so this is
 * purely additive and never changes output for non-fixtures.
 *
 * Symbols are drawn with their "back" (the side placed against a wall) along the
 * top edge of the footprint, which matches the standard library sizes in
 * `examples/lib/fixtures.arch`. Pure and deterministic (no clock, no randomness).
 */

import type { Point } from "../ast.js";
import type { SceneNode } from "../scene.js";
import type { RenderSizes } from "../scene.js";
import type { Theme } from "../theme.js";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The fixture categories {@link fixtureGlyph} draws a dedicated plan symbol for
 * (every `case` below, aliases included). Exported as the single source of truth
 * so the CLI capability manifest (`arch manifest`) can advertise them without
 * re-listing — keep this in sync with the `switch` in {@link fixtureGlyph}; the
 * `test/cli-manifest.test.ts` drift guard asserts they match.
 */
export const FIXTURE_CATEGORIES: readonly string[] = [
  "wc",
  "toilet",
  "basin",
  "lavatory",
  "shower",
  "bathtub",
  "tub",
  "bath",
  "kitchen_sink",
  "sink",
  "counter",
  "worktop",
  "stove",
  "hob",
  "cooktop",
  "fridge",
  "refrigerator",
];

/** Closed polygon approximating an axis-aligned ellipse (24 points, deterministic). */
function ellipse(cx: number, cy: number, rx: number, ry: number): Point[] {
  const n = 24;
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
}

/** Closed polygon: a rectangle with its corners eased (a "rounded" rect look). */
function roundedRect(r: Rect, radius: number): Point[] {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  const x0 = r.x,
    y0 = r.y,
    x1 = r.x + r.w,
    y1 = r.y + r.h;
  const k = 4;
  const arc = (cx: number, cy: number, from: number, to: number): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i <= k; i++) {
      const a = from + ((to - from) * i) / k;
      pts.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
    }
    return pts;
  };
  const H = Math.PI / 2;
  return [
    ...arc(x1 - rad, y0 + rad, -H, 0),
    ...arc(x1 - rad, y1 - rad, 0, H),
    ...arc(x0 + rad, y1 - rad, H, 2 * H),
    ...arc(x0 + rad, y0 + rad, 2 * H, 3 * H),
  ];
}

/**
 * Scene primitives drawing a plan symbol for fixture `category` inside footprint
 * `r`, or `null` if the category has no special symbol (caller draws a rectangle).
 */
export function fixtureGlyph(category: string, r: Rect, theme: Theme, sizes: RenderSizes): SceneNode[] | null {
  const stroke = theme.furnitureStroke;
  const body = theme.furnitureFill;
  const basin = theme.opening; // white interior for bowls/tubs
  const w = sizes.thin;
  const nodes: SceneNode[] = [];
  const poly = (pts: Point[], fill: string): void => {
    nodes.push({ layer: "furniture", prim: { t: "polygon", pts }, paint: { fill, stroke, width: w } });
  };
  const line = (a: Point, b: Point): void => {
    nodes.push({ layer: "furniture", prim: { t: "line", a, b }, paint: { stroke, width: w } });
  };
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;

  switch (category) {
    case "wc":
    case "toilet": {
      // Cistern across the back (top), bowl ellipse in front.
      const cisH = r.h * 0.22;
      poly(
        [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + cisH },
          { x: r.x, y: r.y + cisH },
        ],
        body,
      );
      const bowlCy = r.y + cisH + (r.h - cisH) * 0.52;
      poly(ellipse(cx, bowlCy, r.w * 0.4, (r.h - cisH) * 0.46), basin);
      return nodes;
    }
    case "basin":
    case "lavatory": {
      // Vanity/counter slab with an inset oval bowl and a tap at the back.
      poly(
        [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ],
        body,
      );
      poly(ellipse(cx, r.y + r.h * 0.56, r.w * 0.34, r.h * 0.32), basin);
      line({ x: cx, y: r.y + r.h * 0.1 }, { x: cx, y: r.y + r.h * 0.24 });
      return nodes;
    }
    case "shower": {
      // Tray outline, corner-to-corner diagonals, centre drain.
      poly(
        [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ],
        basin,
      );
      line({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
      line({ x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h });
      poly(ellipse(cx, cy, Math.min(r.w, r.h) * 0.08, Math.min(r.w, r.h) * 0.08), body);
      return nodes;
    }
    case "bathtub":
    case "tub":
    case "bath": {
      poly(roundedRect(r, Math.min(r.w, r.h) * 0.18), body);
      const inset = Math.min(r.w, r.h) * 0.14;
      poly(
        roundedRect(
          { x: r.x + inset, y: r.y + inset, w: r.w - 2 * inset, h: r.h - 2 * inset },
          Math.min(r.w, r.h) * 0.12,
        ),
        basin,
      );
      // Tap at the left end.
      poly(ellipse(r.x + r.w * 0.07, cy, Math.min(r.w, r.h) * 0.05, Math.min(r.w, r.h) * 0.05), stroke);
      return nodes;
    }
    case "kitchen_sink":
    case "sink": {
      // Counter slab with two basins and a tap at the back.
      poly(
        [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ],
        body,
      );
      const m = Math.min(r.w, r.h) * 0.14;
      const bw = (r.w - 3 * m) / 2;
      const bh = r.h - 2 * m - r.h * 0.12;
      const by = r.y + m + r.h * 0.12;
      poly(
        [
          { x: r.x + m, y: by },
          { x: r.x + m + bw, y: by },
          { x: r.x + m + bw, y: by + bh },
          { x: r.x + m, y: by + bh },
        ],
        basin,
      );
      poly(
        [
          { x: r.x + 2 * m + bw, y: by },
          { x: r.x + 2 * m + 2 * bw, y: by },
          { x: r.x + 2 * m + 2 * bw, y: by + bh },
          { x: r.x + 2 * m + bw, y: by + bh },
        ],
        basin,
      );
      line({ x: cx, y: r.y + r.h * 0.08 }, { x: cx, y: r.y + r.h * 0.2 });
      return nodes;
    }
    case "counter":
    case "worktop": {
      poly(
        [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ],
        body,
      );
      // A line set in from the front edge suggests the counter nosing.
      line({ x: r.x, y: r.y + r.h * 0.82 }, { x: r.x + r.w, y: r.y + r.h * 0.82 });
      return nodes;
    }
    case "stove":
    case "hob":
    case "cooktop": {
      poly(
        [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ],
        body,
      );
      // Four burners.
      const br = Math.min(r.w, r.h) * 0.16;
      for (const bx of [r.x + r.w * 0.3, r.x + r.w * 0.7]) {
        for (const byc of [r.y + r.h * 0.3, r.y + r.h * 0.7]) {
          poly(ellipse(bx, byc, br, br), basin);
        }
      }
      return nodes;
    }
    case "fridge":
    case "refrigerator": {
      poly(
        [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ],
        body,
      );
      // Freezer/fridge split + a door-handle stub.
      line({ x: r.x, y: r.y + r.h * 0.36 }, { x: r.x + r.w, y: r.y + r.h * 0.36 });
      line({ x: r.x + r.w * 0.86, y: r.y + r.h * 0.12 }, { x: r.x + r.w * 0.86, y: r.y + r.h * 0.28 });
      return nodes;
    }
    default:
      return null;
  }
}
