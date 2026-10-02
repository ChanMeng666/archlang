/**
 * Bedroom plan symbols — the bed and what stands beside it.
 *
 * Drawn in the same vocabulary as the bath and kitchen families: an outline at `thin`, every
 * interior line at `extraThin`, no text, and every measure a FRACTION of the footprint so a
 * piece drawn at any size or aspect keeps its proportions. The back (the side a wall goes
 * behind) is the TOP edge of `r`; `furniture.render()` quarter-turns the result. For a bed the
 * back is the HEAD, which is why the headboard and the pillows are at the top and the
 * turned-down sheet is below them.
 *
 * Two proportions here are not free choices and are worth stating, because both were decided
 * against a constraint rather than by eye.
 *
 * **1. One pillow or two is read off the mattress SHAPE, not the category word.** `bed` and
 * `double_bed` share one drawing function, so the two categories cannot drift apart; what
 * separates a single from a double is `r.w / r.h`. A single mattress is 900 × 2000 (0.45), a
 * double 1500 × 2000 (0.75), so the branch sits at {@link PILLOW_TWO_ASPECT} = 0.6 — which on a
 * 2000-long bed falls at exactly the conventional 1200 mm single/double split. Reading the
 * shape rather than the word is what makes `furniture bed … size 1500x2000` draw the double it
 * plainly is, and a `double_bed` squeezed to 900 draw the single it has become. The glyph has
 * no millimetres to test against — it is handed a footprint and a palette and nothing else —
 * so an aspect ratio is the only honest form this rule can take.
 *
 * **2. The wardrobe is drawn the way a joiner's plan draws one: a carcass, a door-front line, a
 * run of door bays, and the hanging rail HIDDEN inside.** The door count is a fraction rule
 * ({@link WARDROBE_DOOR_PITCH} depths of width per door, so a 1800 x 600 robe gets three 600 mm
 * doors and a 1400 x 600 one three 467 mm ones — the 0.45 to 0.6 m door of real joinery), and each
 * bay holds its own rail segment and its own run of hangers ({@link WARDROBE_HANGER_PITCH} depths
 * apart, clamped), so a divider never lands on a hanger and the count is the same at every pen.
 * The rail is DASHED and so is nothing else in the piece: it stands above the horizontal cut a
 * plan is taken at and behind a closed door, which is the one meaning a dash has in this drawing.
 * The hangers are short `extraThin` strokes across it, 70% of the depth long — a garment seen from
 * above is a line, not a shape.
 *
 * Pure and deterministic: closed-form arithmetic on `(rect, theme, sizes)`, no clock, no
 * randomness, and no trig — every curve is a `roundedRectPath` or a `bulgeArc`, which are closed
 * form.
 */

import type { PathLoop, SceneNode } from "../scene.js";
import { weightWidth } from "../scene.js";
import type { GlyphCtx, GlyphWeight, Rect } from "./glyph-lib.js";
import { clamp, dashedPattern, dashedPoly, insetRect, rectPoly, roundedRectPath, shortSide } from "./glyph-lib.js";

/** Mattress aspect (`w / h`) at or above which the bed gets two pillows. See the header. */
const PILLOW_TWO_ASPECT = 0.6;

/**
 * The bed: the mattress, the headboard across the head, the pillow(s), and the duvet with its
 * turned-down band and one folded corner.
 *
 * Shared by `bed` and `double_bed` — see the header for why the pillow count is a property of
 * the footprint rather than of the category name.
 *
 * - **Mattress + headboard** (body fill, the outline pen): the headboard is a band 4.5% of the
 *   length across the head, its top corners on the mattress's own slight radius.
 * - **Pillows** (white, detail pen): 42% of the width × 18% of the length each, a pillow-height
 *   × 0.3 corner radius, 3% of the length below the headboard — two on a double, one on a single.
 * - **Duvet** (detail pen): from 30% of the length to the foot, standing in from the sides and
 *   the foot by 3% of the short side so its edge never lies on the mattress outline. Its head
 *   carries the TURNED-DOWN band (white, 10% of the length) and its foot-right corner is
 *   FOLDED back at 45°: the corner is cut off the duvet and its flap (white — the underside)
 *   lies reflected across the fold. That fold is the one handed mark in the symbol, on purpose:
 *   it is the convention that says "a bed, made", and a mirrored `place` mirrors it.
 *
 * Prim count: `5 + pillows`, i.e. 7 for a double and 6 for a single.
 */
function drawBedFrame(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.min(r.w, r.h);
  const rad = s * 0.015;
  g.path(roundedRectPath(r, rad), g.body);
  g.path(roundedRectPath({ x: r.x, y: r.y, w: r.w, h: r.h * 0.045 }, [rad, rad, 0, 0]), g.body);

  const pillowH = r.h * 0.18;
  const pillowY = r.y + r.h * 0.075;
  const pillow = (x: number, w: number): void =>
    g.path(roundedRectPath({ x, y: pillowY, w, h: pillowH }, pillowH * 0.3), g.basin, "extraThin");
  if (r.h > 0 && r.w / r.h >= PILLOW_TWO_ASPECT) {
    // Two, symmetric: three equal margins round two pillows of 0.42 of the width.
    const pw = r.w * 0.42;
    const m = (r.w - 2 * pw) / 3;
    pillow(r.x + m, pw);
    pillow(r.x + 2 * m + pw, pw);
  } else {
    pillow(r.x + r.w * 0.2, r.w * 0.6);
  }

  // The duvet, its folded foot-right corner, the turned-down band and the flap.
  const di = s * 0.03;
  const xl = r.x + di;
  const xr = r.x + r.w - di;
  const yt = r.y + r.h * 0.3;
  const yb = r.y + r.h - di;
  // The fold is 16% of the short side, held to what the duvet has room for.
  const t = Math.max(0, Math.min(s * 0.16, (xr - xl) * 0.5, (yb - yt) * 0.5));
  g.poly(
    [
      { x: xl, y: yt },
      { x: xr, y: yt },
      { x: xr, y: yb - t },
      { x: xr - t, y: yb },
      { x: xl, y: yb },
    ],
    g.body,
    "extraThin",
  );
  g.poly(rectPoly({ x: xl, y: yt, w: xr - xl, h: r.h * 0.1 }), g.basin, "extraThin");
  g.poly(
    [
      { x: xr, y: yb - t },
      { x: xr - t, y: yb },
      { x: xr - t, y: yb - t },
    ],
    g.basin,
    "extraThin",
  );
  return g.nodes;
}

/** The single bed: mattress, one pillow at the head, turned-down coverlet. */
export function drawBed(r: Rect, g: GlyphCtx): SceneNode[] {
  return drawBedFrame(r, g);
}

/** The double bed — the same drawing; its wider footprint is what earns it the second pillow. */
export function drawDoubleBed(r: Rect, g: GlyphCtx): SceneNode[] {
  return drawBedFrame(r, g);
}

/**
 * The nightstand: a carcass, the top's edge bevel, the lamp standing at the BACK, and the drawer
 * front with its pull facing the room.
 *
 * Both halves say which way the piece faces, on a category the catalog calls `directional`: the
 * lamp is pushed into the back third (where a lamp stands, against the wall) and the drawer
 * line with its pull is on the FRONT (where you open it from). The lamp is two concentric circles
 * — a white shade and the bulb ring inside it — which is the lamp every plan drawn by hand
 * carries, and is also the one construction a quarter-turn cannot separate.
 *
 * Prim count: 6.
 */
export function drawNightstand(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.max(0, shortSide(r));
  g.path(roundedRectPath(r, s * 0.02), g.body);
  const top = insetRect(r, 0.07);
  g.path(roundedRectPath(top, s * 0.015), "none", "extraThin");
  // The lamp: a white shade with the bulb ring in it, standing in the back third.
  const lamp = { x: r.x + r.w / 2, y: r.y + r.h * 0.34 };
  g.dot(lamp, s * 0.2, g.basin, "extraThin");
  g.ring(lamp, s * 0.09, "extraThin");
  // The drawer front on the room side, and its pull.
  const drawerY = r.y + r.h * 0.7;
  g.seg({ x: top.x, y: drawerY }, { x: top.x + top.w, y: drawerY }, "extraThin");
  g.seg({ x: r.x + r.w * 0.36, y: r.y + r.h * 0.85 }, { x: r.x + r.w * 0.64, y: r.y + r.h * 0.85 }, "extraThin");
  return g.nodes;
}

/** How far in from the front face the door-front line stands, as a fraction of the depth. */
const WARDROBE_FRONT = 0.04;

/**
 * Door bays: one per this many DEPTHS of width. At a 0.6 m deep robe that is a door per 0.525 m,
 * the middle of the 0.45 to 0.6 m a wardrobe door is in joinery — 1800 mm is three, 1200 two.
 */
const WARDROBE_DOOR_PITCH = 0.875;

/** The most door bays one robe draws; a longer run is more of the same and closes into a hatch. */
const WARDROBE_MAX_BAYS = 5;

/** Hangers: one per this many depths of rail, so their spacing follows the piece, not the pen. */
const WARDROBE_HANGER_PITCH = 0.2;

/** The fraction of a bay's width the rail stops short of each divider. */
const WARDROBE_RAIL_INSET = 0.06;

/**
 * The wardrobe: the carcass, the door-front line near the front face, a divider between each
 * pair of door bays, and in every bay the hanging rail (DASHED) with its hangers.
 *
 * - **Carcass** (outline pen): the body.
 * - **Door-front line**: `extraThin`, inset 4% of the depth from the front face — the thickness
 *   of the doors, read off the footprint and not off a millimetre.
 * - **Bays**: `round(w / (0.875 d))` held to `[1, 5]` — see {@link WARDROBE_DOOR_PITCH}. A
 *   divider is the carcass's own partition, so it runs the full depth.
 * - **Rail**: one per bay at mid-depth, DASHED — above the cut plane and behind a closed door.
 * - **Hangers**: short `extraThin` strokes ACROSS the rail, 70% of the depth, `round(rail /
 *   (0.2 d))` per bay held to `[3, 5]`, spread evenly so every bay is symmetric about its middle.
 *
 * Prim count: `2 + (bays - 1) + bays + hangers`, i.e. 19 at the catalogued 1800x600 (3 bays of 4)
 * and 36 at the clamp (5 bays of 5 hangers).
 */
export function drawWardrobe(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.max(0, shortSide(r));
  g.path(roundedRectPath(r, s * 0.01), g.body);
  const frontY = r.y + r.h * (1 - WARDROBE_FRONT);
  g.seg({ x: r.x, y: frontY }, { x: r.x + r.w, y: frontY }, "extraThin");

  // `clamp` lands the NaN of a zero-area footprint on 1 and pins the Infinity of a zero-depth one to 5.
  const bays = clamp(Math.round(r.w / (WARDROBE_DOOR_PITCH * r.h)), 1, WARDROBE_MAX_BAYS);
  const bayW = r.w / bays;
  for (let i = 1; i < bays; i++) {
    const x = r.x + bayW * i;
    g.seg({ x, y: r.y }, { x, y: r.y + r.h }, "extraThin");
  }

  const railY = r.y + r.h / 2;
  const half = r.h * 0.35;
  for (let b = 0; b < bays; b++) {
    const x0 = r.x + bayW * (b + WARDROBE_RAIL_INSET);
    const x1 = r.x + bayW * (b + 1 - WARDROBE_RAIL_INSET);
    g.seg({ x: x0, y: railY }, { x: x1, y: railY }, "extraThin", true);
    const n = clamp(Math.round((x1 - x0) / (WARDROBE_HANGER_PITCH * r.h)), 3, 5);
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
      g.seg({ x, y: railY - half }, { x, y: railY + half }, "extraThin");
    }
  }
  return g.nodes;
}

// ---------------------------------------------------------------------------
// ── bedroom ──
//
// Four families the bedroom vocabulary was missing. Appended at the foot of the file for the
// same reason they are appended to `FIXTURE_FAMILIES`: that table's order is the LEGEND's
// order, so slotting `dresser` in beside `wardrobe` would re-order the legend of every shipped
// plan that draws a robe.

/**
 * A closed `path` with a DASHED outline — {@link dashedPoly}'s curved sibling, for the one piece
 * here (the bunk's upper deck) that is dashed AND rounded. Sets `lineType` and `paint.dash` to the
 * same pattern for the reason `glyph-lib.ts`'s header gives, and takes its stroke colour from the
 * weight like every factory.
 */
function dashedPath(g: GlyphCtx, loop: PathLoop, fill: string, weight: GlyphWeight = "extraThin"): void {
  g.nodes.push({
    layer: "furniture",
    prim: { t: "path", loops: [loop] },
    paint: { fill, stroke: g.tone(weight), width: weightWidth(weight, g.sizes), dash: dashedPattern(g.sizes) },
    lineWeight: weight,
    lineType: "dashed",
  });
}

/**
 * The bunk bed: the frame with its headboard, the lower mattress and its pillow, the upper deck
 * drawn DASHED over it, and the ladder at the foot.
 *
 * **The upper bunk is dashed, and that is the drawing's one existing convention rather than a
 * new one.** A dashed outline in this repository means *above the horizontal cut a floor plan
 * is taken at* — it is what `upper_cabinet` has always meant, what `roof` and `void` ship, and
 * what the outdoor `pergola` and the `shed`'s ridge say. An upper bunk is exactly that: present
 * in the room, cut through by nothing. Drawing it solid would claim the room has two mattresses
 * of floor area, which is the one thing a plan must not say about a bunk.
 *
 * It is the pilot bed's language — a rounded frame, a headboard band across the head, a white
 * pillow — with the rails the frame needs: the upper deck's guard rail is the dashed outline
 * standing a rail's width in from the frame, and the lower mattress stands a rail's width in from
 * that, so the three nested outlines read as post, rail and mattress. The ladder is at the FOOT (a
 * frame and three rungs), which is where it goes and which is also what keeps the head clear for
 * the pillow — so the symbol says which end is which without a label, on a category the catalog
 * calls `directional`. Symmetric about its long axis, so it is not handed.
 *
 * Prim count: 9.
 */
export function drawBunkBed(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.max(0, shortSide(r));
  const rad = s * 0.015;
  g.path(roundedRectPath(r, rad), g.body);
  g.path(roundedRectPath({ x: r.x, y: r.y, w: r.w, h: r.h * 0.045 }, [rad, rad, 0, 0]), g.body);
  // The lower mattress and its pillow, at the head.
  const mat: Rect = { x: r.x + s * 0.085, y: r.y + r.h * 0.1, w: r.w - 2 * s * 0.085, h: r.h * 0.7 };
  g.path(roundedRectPath(mat, s * 0.04), g.body, "extraThin");
  const pillowH = r.h * 0.1;
  g.path(
    roundedRectPath({ x: r.x + r.w * 0.2, y: r.y + r.h * 0.12, w: r.w * 0.6, h: pillowH }, pillowH * 0.3),
    g.basin,
    "extraThin",
  );
  // The upper deck, above the cut: dashed, a rail's width inside the frame, stopping clear of the ladder.
  const upper: Rect = { x: r.x + s * 0.035, y: r.y + r.h * 0.07, w: r.w - 2 * s * 0.035, h: r.h * 0.76 };
  dashedPath(g, roundedRectPath(upper, s * 0.03), "none");
  // The ladder: two rails and three rungs across the foot end, inside the footprint.
  const ladder: Rect = { x: r.x + r.w * 0.3, y: r.y + r.h * 0.855, w: r.w * 0.4, h: r.h * 0.11 };
  g.path(roundedRectPath(ladder, s * 0.01), g.basin, "extraThin");
  for (const f of [0.25, 0.5, 0.75]) {
    const y = ladder.y + ladder.h * f;
    g.seg({ x: ladder.x, y }, { x: ladder.x + ladder.w, y }, "extraThin");
  }
  return g.nodes;
}

/**
 * The crib / cot: the frame, the mattress inside it with its blanket, and the rail bars down
 * both long faces.
 *
 * The bars are the symbol — a crib without them is a small `bed` with no pillow — and they are
 * drawn on the two LONG faces read off the footprint rather than off the page, so a cot turned
 * against a side wall draws the same object instead of a different one. Their count comes from
 * the aspect and is clamped to `[3, 7]`: at the clamp ceiling they read as a rail, and past it
 * they close into a solid band at plan scale. The blanket is the bed's duvet in little: from a
 * third of the mattress to the foot, with its turned-down band at the head end.
 *
 * `directional` follows the `bed` precedent: the head end is the top edge, which is what an
 * `anchor top` derives a quarter-turn from.
 *
 * Prim count: `4 + 2 x bars`, i.e. 14 at the catalogued 700x1300.
 */
export function drawCrib(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.max(0, shortSide(r));
  g.path(roundedRectPath(r, s * 0.03), g.body);
  const mat = insetRect(r, 0.14);
  g.path(roundedRectPath(mat, s * 0.03), g.basin, "extraThin");
  // The blanket, a gap in from the mattress's sides and foot, with its turned-down head band.
  const gap = s * 0.03;
  const blanket: Rect = { x: mat.x + gap, y: mat.y + mat.h * 0.36, w: mat.w - 2 * gap, h: mat.h * 0.64 - gap };
  g.path(roundedRectPath(blanket, s * 0.02), g.body, "extraThin");
  g.path(roundedRectPath({ ...blanket, h: blanket.h * 0.16 }, [s * 0.02, s * 0.02, 0, 0]), g.basin, "extraThin");
  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  const bars = clamp(Math.round((long / Math.max(1e-9, Math.min(r.w, r.h))) * 2.5), 3, 7);
  for (let i = 0; i < bars; i++) {
    const t = (i + 0.5) / bars;
    if (horizontal) {
      const x = r.x + r.w * t;
      g.seg({ x, y: r.y }, { x, y: mat.y }, "extraThin");
      g.seg({ x, y: mat.y + mat.h }, { x, y: r.y + r.h }, "extraThin");
    } else {
      const y = r.y + r.h * t;
      g.seg({ x: r.x, y }, { x: mat.x, y }, "extraThin");
      g.seg({ x: mat.x + mat.w, y }, { x: r.x + r.w, y }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * The dresser / chest of drawers: the carcass, and on the room side a row of drawer fronts, each
 * with its pull.
 *
 * A chest is a box, so everything that makes it read as one is inside it — and all of it is on
 * the FRONT (bottom) half, which is the orientation claim. A dresser drawn with its drawers
 * against the wall has been turned round, and it is the only thing separating this symbol from
 * a `bookshelf` of the same proportions. The drawer count is a fraction rule — one front per
 * 0.8 depths of width, `[2, 6]` — so a 1200 x 500 chest gets the three it has always had and a
 * longer one gets more rather than wider ones.
 *
 * Prim count: `1 + 2 x drawers`, i.e. 7 at the catalogued 1200x500.
 */
export function drawDresser(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.max(0, shortSide(r));
  g.path(roundedRectPath(r, s * 0.015), g.body);
  const n = clamp(Math.round(r.w / (0.8 * r.h)), 2, 6);
  const margin = s * 0.05;
  const gap = s * 0.025;
  const fw = (r.w - 2 * margin - (n - 1) * gap) / n;
  const top = r.y + r.h * 0.5;
  const bottom = r.y + r.h - margin;
  for (let i = 0; i < n; i++) {
    const x = r.x + margin + i * (fw + gap);
    g.path(roundedRectPath({ x, y: top, w: fw, h: bottom - top }, s * 0.012), "none", "extraThin");
    const cx = x + fw / 2;
    const y = top + (bottom - top) * 0.3;
    g.seg({ x: cx - fw * 0.17, y }, { x: cx + fw * 0.17, y }, "extraThin");
  }
  return g.nodes;
}

/**
 * The vanity / dressing table: the top, the mirror band DASHED across the wall side, a drawer
 * pedestal at each end, and the stool sitting between them.
 *
 * The mirror is dashed for the reason the bunk's upper deck is: it stands on the table, above
 * the cut plane, so drawing it solid would claim a piece of the room's section that is not
 * there. The stool is drawn INSIDE the footprint even though a real one is pulled out — the
 * footprint is what every clearance and collision rule measures, and a symbol that drew outside
 * it would make the drawing and `arch lint` disagree about where the piece is. That is the same
 * call `drawCar` makes about its wing mirrors, and the catalogued 600 mm `clearanceMm` is what
 * actually reserves the room to sit down. The pedestals are drawer fronts with a pull each, so
 * the knee-hole between them is where the stool is.
 *
 * Prim count: 8.
 */
export function drawVanity(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.max(0, shortSide(r));
  g.path(roundedRectPath(r, s * 0.015), g.body);
  const mirror = { x: r.x + r.w * 0.16, y: r.y + r.h * 0.07, w: r.w * 0.68, h: r.h * 0.13 };
  dashedPoly(g, rectPoly(mirror), "none", "extraThin");
  // A drawer pedestal at each end, with its pull on the room side.
  const ped = { y: r.y + r.h * 0.32, w: r.w * 0.24, h: r.h * 0.62 };
  for (const x of [r.x + r.w * 0.04, r.x + r.w * 0.72]) {
    g.path(roundedRectPath({ x, y: ped.y, w: ped.w, h: ped.h }, s * 0.012), "none", "extraThin");
    const py = ped.y + ped.h * 0.78;
    g.seg({ x: x + ped.w * 0.33, y: py }, { x: x + ped.w * 0.67, y: py }, "extraThin");
  }
  // Floored at 0: a negative extent would otherwise ask for a circle of negative radius.
  const rad = Math.max(0, Math.min(r.w * 0.09, r.h * 0.2));
  const stool = { x: r.x + r.w / 2, y: r.y + r.h - rad - r.h * 0.05 };
  g.dot(stool, rad, g.basin, "extraThin");
  g.ring(stool, rad * 0.55, "extraThin");
  return g.nodes;
}
