/**
 * Material hatch patterns — a small named hatch *library*. Each material maps to
 * an SVG `<pattern>` builder (for the SVG backend), a natural rotation, and a
 * predefined DXF HATCH pattern name (so the hatch survives to CAD as a real
 * `HATCH` entity, not just boundary lines).
 *
 * Zero-dependency and deterministic. `poche` is the default (a 45° hatch);
 * the rest are selectable via `wall <kind> thickness N material <name> { … }`,
 * optionally scaled/rotated with `material <name> scale <s> angle <a>`. Patterns
 * are monochrome (base + line colours) so they stay theme-driven.
 *
 * A {@link HatchSpec} (material + scale + angle) is the data the Scene carries;
 * `scale` multiplies the tile size and `angle` is added to the pattern's natural
 * rotation. The default spec (`scale 1`, `angle 0`) renders byte-identically to
 * the unparameterised hatch.
 */

import { EXTRA_THIN_RATIO } from "./scene.js";

export interface HatchCtx {
  fmt: (n: number) => string;
  /** Hatch module size in user units (derives from refDim). */
  gap: number;
  /** A thin stroke width. */
  thin: number;
  base: string;
  line: string;
  /** Tile-size multiplier (DSL `scale`; default 1). */
  scale: number;
  /** Extra rotation in degrees added to the pattern's natural angle (DSL `angle`; default 0). */
  angle: number;
}

/** Builds the inner markup of a `<pattern>` (id + attributes are added by caller). */
export type HatchDef = (id: string, c: HatchCtx) => string;

export const KNOWN_MATERIALS = ["poche", "concrete", "brick", "insulation", "tile", "none"] as const;
export type Material = (typeof KNOWN_MATERIALS)[number];
export const DEFAULT_MATERIAL: Material = "poche";

/**
 * The GROUND materials — the patterns `outdoor <kind>` fills with.
 *
 * A separate list from {@link KNOWN_MATERIALS} on purpose, and the separation is the
 * design decision worth stating here:
 *
 *  - **`wall … material grass` stays a `W_UNKNOWN_MATERIAL`.** {@link isKnownMaterial} is
 *    still the wall's accept-set and still reads `KNOWN_MATERIALS` alone, so the wall
 *    grammar line in `spec.llm.md` — which INTERPOLATES that array — does not silently
 *    grow seven words a wall has no use for. A ground pattern is chosen by the `outdoor`
 *    kind, never spelled by the author, so it needs no accept-set of its own.
 *  - **Both lists share ONE {@link META} table**, because everything downstream of the
 *    choice is identical: {@link hatchPattern} builds the SVG pattern, {@link
 *    dxfPatternName} names the CAD hatch, {@link patternId} keys the `url(#…)` reference.
 *    Sharing the table is what keeps a ground fill from being a second, parallel hatch
 *    system that the legend and the DXF export would each have to learn about separately.
 *
 * Pattern ids are keyed exactly as a wall's are, so a `paving` ground and a hypothetical
 * `paving` wall would reuse one pattern element rather than collide — which is the right
 * outcome, since the pattern IS the same pattern.
 */
export const GROUND_MATERIALS = ["grass", "planting", "paving", "deck", "gravel", "water", "tarmac"] as const;
/** One ground-surface hatch material. */
export type GroundMaterial = (typeof GROUND_MATERIALS)[number];

/** A concrete hatch request: which pattern, scaled and rotated how. */
export interface HatchSpec {
  material: string;
  scale: number;
  angle: number;
}

/**
 * The SVG `<pattern>` element id (and `url(#…)` reference) for a hatch spec. The
 * default (`scale 1`, `angle 0`) keeps the bare ids (`poche`, `hatch-brick`) so
 * existing output is unchanged; a scaled/rotated spec gets a deterministic suffix.
 */
export function patternId(material: string, scale = 1, angle = 0): string {
  const base = material === "poche" ? "poche" : `hatch-${material}`;
  if (scale === 1 && angle === 0) return base;
  const tag = (n: number): string => String(n).replace(/-/g, "n").replace(/\./g, "_");
  return `${base}-s${tag(scale)}-a${tag(angle)}`;
}

/** The hatch spec a wall fills with (material + scale + angle). */
export function hatchOf(w: { material: string; hatchScale: number; hatchAngle: number }): HatchSpec {
  return { material: w.material, scale: w.hatchScale, angle: w.hatchAngle };
}

/** Stable grouping key for a hatch spec (walls sharing it union together). */
export function hatchKey(h: HatchSpec): string {
  return `${h.material}|${h.scale}|${h.angle}`;
}

/**
 * Distinct hatch specs present, in a stable (key-sorted) order.
 *
 * Lives here rather than in `scene-build.ts` because two very different callers need the
 * same list: the wall lowering groups by it, and the LEGEND draws one row per entry — and
 * the sheet fit rule (`resolve()`, before any Scene exists) has to know how many rows that
 * will be. One derivation, three readers.
 */
export function hatchesUsed(
  walls: readonly { material: string; hatchScale: number; hatchAngle: number }[],
  ground: readonly string[] = [],
): HatchSpec[] {
  const seen = new Map<string, HatchSpec>();
  for (const w of walls) {
    const h = hatchOf(w);
    const k = hatchKey(h);
    if (!seen.has(k)) seen.set(k, h);
  }
  // Ground materials always take the DEFAULT scale/angle — there is no authorable
  // `scale`/`angle` on an `outdoor` statement — so they are appended as bare specs. The
  // parameter defaults to empty, which is what makes every caller that passes none (and
  // every plan with no `outdoor`) produce a byte-identical list: same entries, same sort key.
  for (const material of ground) {
    const h: HatchSpec = { material, scale: 1, angle: 0 };
    const k = hatchKey(h);
    if (!seen.has(k)) seen.set(k, h);
  }
  return [...seen.values()].sort((a, b) => (hatchKey(a) < hatchKey(b) ? -1 : 1));
}

/** Pattern metadata per material: natural rotation, DXF pattern name, SVG builder. */
interface HatchMeta {
  /** Natural rotation (deg) baked into the SVG pattern before the user `angle`. */
  natural: number;
  /** Predefined DXF HATCH pattern name (group code 2), recognized by CAD apps. */
  dxfPattern: string;
  build: HatchDef;
}

/** `patternTransform="rotate(...)"` for a pattern's natural + user angle (omitted at 0°). */
function xform(natural: number, c: HatchCtx): string {
  const a = natural + c.angle;
  return a === 0 ? "" : ` patternTransform="rotate(${c.fmt(a)})"`;
}

/**
 * The FROZEN scatters the ground patterns are drawn from — every position, size and lean a
 * FRACTION of the tile (or of the module), measured once and fixed here.
 *
 * There is no `Math.random()` anywhere in `src/` and there is not going to be one — a
 * random scatter would make `compile()` non-deterministic, which is the project's first
 * invariant. A fixed table buys the same visual irregularity with none of that: the tile
 * still reads as scattered stone, mulch or turf, because at the size a hatch is drawn the eye
 * does not find the tiling, and the bytes are identical on every run and every machine.
 *
 * Every mark stays inside its own tile (no position closer to an edge than the mark's own
 * reach), so nothing is cut off at a tile seam.
 */

/** `gravel`: `[x, y, r]` — a stone, an open ring of radius `r` modules. */
const GRAVEL_STONES: readonly (readonly [number, number, number])[] = [
  [0.14, 0.18, 0.2],
  [0.45, 0.12, 0.14],
  [0.76, 0.22, 0.24],
  [0.3, 0.42, 0.16],
  [0.62, 0.48, 0.21],
  [0.88, 0.56, 0.15],
  [0.12, 0.7, 0.23],
  [0.42, 0.78, 0.18],
  [0.7, 0.86, 0.14],
  [0.9, 0.88, 0.12],
];

/** `gravel`: `[x, y]` — the grit between the stones, a fine dot each. */
const GRAVEL_GRIT: readonly (readonly [number, number])[] = [
  [0.29, 0.25],
  [0.6, 0.3],
  [0.46, 0.6],
  [0.8, 0.7],
  [0.22, 0.9],
  [0.94, 0.36],
];

/** `grass`: `[x, y, lean, size]` — one tuft each; the lean and size vary so no two match. */
const GRASS_TUFTS: readonly (readonly [number, number, number, number])[] = [
  [0.16, 0.3, 0.1, 1],
  [0.66, 0.2, -0.12, 0.85],
  [0.42, 0.66, 0.04, 0.95],
  [0.86, 0.78, -0.06, 0.8],
];

/** `planting`: `[x, y, len, angle°]` — a bark chip (a short stroke `len` modules long), or a crumb (`len` 0, a dot). */
const MULCH_CHIPS: readonly (readonly [number, number, number, number])[] = [
  [0.12, 0.14, 0.36, 20],
  [0.42, 0.1, 0, 0],
  [0.7, 0.18, 0.3, -35],
  [0.9, 0.42, 0, 0],
  [0.26, 0.4, 0, 0],
  [0.54, 0.46, 0.4, 70],
  [0.12, 0.66, 0.28, -60],
  [0.4, 0.82, 0, 0],
  [0.72, 0.72, 0.34, 10],
  [0.88, 0.9, 0, 0],
];

/** `deck`: the butt-joint position of each of the tile's four board rows, as a fraction of its length. */
const DECK_JOINTS: readonly number[] = [0.15, 0.65, 0.4, 0.9];

/** `tarmac`: `[x, y]` — the fine aggregate speckle. */
const TARMAC_SPECKS: readonly (readonly [number, number])[] = [
  [0.18, 0.62],
  [0.46, 0.2],
  [0.8, 0.44],
  [0.62, 0.86],
  [0.3, 0.32],
];

/**
 * The ground patterns' pen: the drawing's FINEST, the `extraThin` width `weightWidth` gives
 * (`thin × EXTRA_THIN_RATIO`, 0.13 mm on a sheet — the ISO 128 floor), by the same arithmetic,
 * so the ground texture is drawn exactly at the bottom of the pen ramp the symbols use and
 * tracks it if the ramp moves. Ground is the finest, palest layer of the drawing (below the
 * symbol detail), and no ground stroke is finer than this, because below it a line stops
 * reproducing in print.
 */
const hairline = (c: HatchCtx): number => (c.thin * EXTRA_THIN_RATIO[0]) / EXTRA_THIN_RATIO[1];

/**
 * Pattern metadata for every material, wall and ground alike.
 *
 * ## The one rule that separates the two halves
 *
 * A WALL pattern paints its tile with `c.base` first: poché is an opaque fill and the
 * base colour is half of what makes it read as solid. A GROUND pattern paints **no
 * background rectangle at all** — it is drawn OVER a flat tint polygon the element emits
 * (`src/elements/outdoor.ts`), so the tint carries the colour and the pattern carries
 * only the texture. Painting a base here would cover the tint and flatten every ground
 * surface to one colour.
 *
 * ## Scale-awareness is not optional
 *
 * Every dimension below is `c.gap * k * c.scale`, and `c.gap` is `sizes.hatchGap`, which
 * derives from the drawing's `refDim` (or, on a `paper` plan, from the sheet millimetre
 * times the scale denominator). So a pattern is the same size ON THE SHEET at 1:50 and at
 * 1:200, which is the whole point of a drafting hatch. The competitor this feature was
 * scoped from ships `patternUnits="userSpaceOnUse"` with FIXED pixel sizes, and its
 * hatches therefore dissolve or clot as the drawing scale changes — do not copy that. The
 * model is ifc-lite's scale-proportional spacing, and `c.gap` is our version of it.
 */
const META: Record<string, HatchMeta> = {
  poche: {
    natural: 45,
    dxfPattern: "ANSI31",
    build: (id, c) => {
      const g = c.gap * c.scale;
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(g)}" height="${c.fmt(g)}"${xform(45, c)}>` +
        `<rect width="${c.fmt(g)}" height="${c.fmt(g)}" fill="${c.base}"/>` +
        `<line x1="0" y1="0" x2="0" y2="${c.fmt(g)}" stroke="${c.line}" stroke-width="${c.fmt(c.thin * 0.7)}"/>` +
        `</pattern>`
      );
    },
  },

  // Aggregate speckle.
  concrete: {
    natural: 0,
    dxfPattern: "ANSI37",
    build: (id, c) => {
      const w = c.gap * 1.6 * c.scale;
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        `<rect width="${c.fmt(w)}" height="${c.fmt(w)}" fill="${c.base}"/>` +
        `<circle cx="${c.fmt(w * 0.25)}" cy="${c.fmt(w * 0.3)}" r="${c.fmt(c.thin * 0.9)}" fill="${c.line}"/>` +
        `<circle cx="${c.fmt(w * 0.7)}" cy="${c.fmt(w * 0.62)}" r="${c.fmt(c.thin * 0.6)}" fill="${c.line}"/>` +
        `<circle cx="${c.fmt(w * 0.45)}" cy="${c.fmt(w * 0.85)}" r="${c.fmt(c.thin * 0.75)}" fill="${c.line}"/>` +
        `</pattern>`
      );
    },
  },

  // Running-bond brick courses.
  brick: {
    natural: 0,
    dxfPattern: "ANSI32",
    build: (id, c) => {
      const w = c.gap * 3 * c.scale;
      const h = c.gap * 1.4 * c.scale;
      const sw = c.fmt(c.thin * 0.6);
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(h)}"${xform(0, c)}>` +
        `<rect width="${c.fmt(w)}" height="${c.fmt(h)}" fill="${c.base}"/>` +
        `<line x1="0" y1="${c.fmt(h)}" x2="${c.fmt(w)}" y2="${c.fmt(h)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `<line x1="0" y1="${c.fmt(h / 2)}" x2="${c.fmt(w)}" y2="${c.fmt(h / 2)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `<line x1="${c.fmt(w / 2)}" y1="0" x2="${c.fmt(w / 2)}" y2="${c.fmt(h / 2)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `<line x1="0" y1="${c.fmt(h / 2)}" x2="0" y2="${c.fmt(h)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `<line x1="${c.fmt(w)}" y1="${c.fmt(h / 2)}" x2="${c.fmt(w)}" y2="${c.fmt(h)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `</pattern>`
      );
    },
  },

  // Cross-hatch batting.
  insulation: {
    natural: 0,
    dxfPattern: "ANSI33",
    build: (id, c) => {
      const w = c.gap * 1.2 * c.scale;
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        `<rect width="${c.fmt(w)}" height="${c.fmt(w)}" fill="${c.base}"/>` +
        `<path d="M0,0 L${c.fmt(w)},${c.fmt(w)} M${c.fmt(w)},0 L0,${c.fmt(w)}" stroke="${c.line}" stroke-width="${c.fmt(c.thin * 0.5)}" fill="none"/>` +
        `</pattern>`
      );
    },
  },

  // Square tile grid.
  tile: {
    natural: 0,
    dxfPattern: "NET",
    build: (id, c) => {
      const w = c.gap * 1.8 * c.scale;
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        `<rect width="${c.fmt(w)}" height="${c.fmt(w)}" fill="${c.base}"/>` +
        `<rect x="0" y="0" width="${c.fmt(w)}" height="${c.fmt(w)}" fill="none" stroke="${c.line}" stroke-width="${c.fmt(c.thin * 0.6)}"/>` +
        `</pattern>`
      );
    },
  },

  // Solid fill, no hatch.
  none: {
    natural: 0,
    dxfPattern: "SOLID",
    build: (id, c) => {
      const g = c.gap * c.scale;
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(g)}" height="${c.fmt(g)}">` +
        `<rect width="${c.fmt(g)}" height="${c.fmt(g)}" fill="${c.base}"/>` +
        `</pattern>`
      );
    },
  },

  // ---- ground materials ----------------------------------------------
  // None of the seven paints a background rectangle: each is drawn over the flat tint
  // the `outdoor` element emits beneath it. See the META doc comment above. Every stroke is
  // the {@link hairline}, so the ground is the finest layer of the drawing; the patterns
  // differ by what they draw, never by a heavier pen.

  // Turf: a few small tufts, scattered sparsely — the palest ground there is. One tuft =
  // three upright blades rising from a short base, the middle one tallest (the standard turf
  // glyph); the bases are spread so the blades do not meet in a point, which at plan scale
  // reads as an arrowhead rather than as grass. `lean` tilts the tuft and `size` scales it, so
  // no two tufts in the tile are the same mark and the eye does not read the tiling as a grid
  // of repeated icons.
  grass: {
    natural: 0,
    dxfPattern: "GRASS",
    build: (id, c) => {
      const w = c.gap * 6 * c.scale;
      const sw = c.fmt(hairline(c));
      const tuft = ([fx, fy, lean, size]: readonly [number, number, number, number]): string => {
        const cx = w * fx;
        const cy = w * fy;
        const l = c.gap * 0.6 * c.scale * size;
        const blade = (dx: number, top: number, tip: number): string =>
          `M${c.fmt(cx + l * dx)},${c.fmt(cy)} L${c.fmt(cx + l * (tip + lean))},${c.fmt(cy - l * top)}`;
        return (
          `<path d="${blade(-0.14, 0.7, -0.36)} ${blade(0, 1, 0)} ${blade(0.14, 0.78, 0.34)}"` +
          ` stroke="${c.line}" stroke-width="${sw}" fill="none"/>`
        );
      };
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        GRASS_TUFTS.map(tuft).join("") +
        `</pattern>`
      );
    },
  },

  // Mulch: a stipple of bark chips and crumbs at irregular places and angles — a planting
  // bed reads as a mulched, worked surface, denser than turf.
  planting: {
    natural: 0,
    dxfPattern: "DOTS",
    build: (id, c) => {
      const w = c.gap * 3.4 * c.scale;
      const hl = hairline(c);
      const marks = MULCH_CHIPS.map(([fx, fy, len, deg]) => {
        const x = w * fx;
        const y = w * fy;
        if (len === 0) return `<circle cx="${c.fmt(x)}" cy="${c.fmt(y)}" r="${c.fmt(hl * 0.9)}" fill="${c.line}"/>`;
        const a = (deg * Math.PI) / 180;
        const dx = (c.gap * c.scale * len * Math.cos(a)) / 2;
        const dy = (c.gap * c.scale * len * Math.sin(a)) / 2;
        return (
          `<line x1="${c.fmt(x - dx)}" y1="${c.fmt(y - dy)}" x2="${c.fmt(x + dx)}" y2="${c.fmt(y + dy)}"` +
          ` stroke="${c.line}" stroke-width="${c.fmt(hl)}"/>`
        );
      }).join("");
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        marks +
        `</pattern>`
      );
    },
  },

  // Slab paving — a square joint grid, five modules a side: a 600 mm slab at 1:100. The two
  // joints run through the tile's CENTRE, so neither is halved by a tile seam.
  paving: {
    natural: 0,
    dxfPattern: "AR-B816",
    build: (id, c) => {
      const w = c.gap * 5 * c.scale;
      const sw = c.fmt(hairline(c));
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        `<line x1="0" y1="${c.fmt(w / 2)}" x2="${c.fmt(w)}" y2="${c.fmt(w / 2)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `<line x1="${c.fmt(w / 2)}" y1="0" x2="${c.fmt(w / 2)}" y2="${c.fmt(w)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `</pattern>`
      );
    },
  },

  // Timber decking: parallel boards 1.25 modules wide (a 150 mm board at 1:100) with their
  // butt joints STAGGERED row to row ({@link DECK_JOINTS}) — boards that never end are a
  // ruled page, and joints in a line are a grid. The long lines run the full tile, so the
  // boards are continuous across the surface; the fourth row straddles the tile seam, so its
  // joint is drawn in two halves that meet there.
  deck: {
    natural: 0,
    dxfPattern: "LINE",
    build: (id, c) => {
      const p = c.gap * 1.25 * c.scale;
      const w = c.gap * 12 * c.scale;
      const h = p * 4;
      const y = (k: number): number => p * (k + 0.5);
      const seg = (x1: number, y1: number, x2: number, y2: number): string =>
        ` M${c.fmt(x1)},${c.fmt(y1)} L${c.fmt(x2)},${c.fmt(y2)}`;
      let d = "";
      for (let k = 0; k < 4; k++) d += seg(0, y(k), w, y(k));
      for (let k = 0; k < 3; k++) d += seg(w * DECK_JOINTS[k]!, y(k), w * DECK_JOINTS[k]!, y(k + 1));
      d += seg(w * DECK_JOINTS[3]!, y(3), w * DECK_JOINTS[3]!, h);
      d += seg(w * DECK_JOINTS[3]!, 0, w * DECK_JOINTS[3]!, y(0));
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(h)}"${xform(0, c)}>` +
        `<path d="${d.slice(1)}" stroke="${c.line}" stroke-width="${c.fmt(hairline(c))}" fill="none"/>` +
        `</pattern>`
      );
    },
  },

  // Loose gravel: stones as small open rings of varied size with fine grit between them, from
  // the FROZEN tables above — never `Math.random()`. Rings, not dots, are what tell stone from
  // the bitumen speckle of `tarmac`.
  gravel: {
    natural: 0,
    dxfPattern: "GRAVEL",
    build: (id, c) => {
      const w = c.gap * 4.2 * c.scale;
      const hl = hairline(c);
      const stones = GRAVEL_STONES.map(
        ([fx, fy, fr]) =>
          `<circle cx="${c.fmt(w * fx)}" cy="${c.fmt(w * fy)}" r="${c.fmt(c.gap * c.scale * fr)}" fill="none" stroke="${c.line}" stroke-width="${c.fmt(hl)}"/>`,
      ).join("");
      const grit = GRAVEL_GRIT.map(
        ([fx, fy]) => `<circle cx="${c.fmt(w * fx)}" cy="${c.fmt(w * fy)}" r="${c.fmt(hl * 0.7)}" fill="${c.line}"/>`,
      ).join("");
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        stones +
        grit +
        `</pattern>`
      );
    },
  },

  // Gentle waves — the drafting convention for open water (a pool, a pond). Two low waves a
  // tile, the second half a wavelength out of phase with the first so the surface does not
  // corrugate; each spans the tile exactly in two half-period quadratics, so the line is
  // continuous from tile to tile with no seam.
  water: {
    natural: 0,
    dxfPattern: "SWAMP",
    build: (id, c) => {
      const w = c.gap * 8 * c.scale;
      const h = c.gap * 4 * c.scale;
      const a = c.gap * 0.5 * c.scale;
      const sw = c.fmt(hairline(c));
      const wave = (y: number, up: 1 | -1): string =>
        `<path d="M0,${c.fmt(y)} q${c.fmt(w * 0.25)},${c.fmt(-a * up)} ${c.fmt(w * 0.5)},0` +
        ` q${c.fmt(w * 0.25)},${c.fmt(a * up)} ${c.fmt(w * 0.5)},0"` +
        ` stroke="${c.line}" stroke-width="${sw}" fill="none"/>`;
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(h)}"${xform(0, c)}>` +
        wave(h * 0.25, 1) +
        wave(h * 0.75, -1) +
        `</pattern>`
      );
    },
  },

  // Fine, sparse speckle — bitumen. A driveway is neither slabs nor loose stone.
  tarmac: {
    natural: 0,
    dxfPattern: "AR-SAND",
    build: (id, c) => {
      const w = c.gap * 2.6 * c.scale;
      const r = c.fmt(hairline(c) * 0.6);
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        TARMAC_SPECKS.map(
          ([fx, fy]) => `<circle cx="${c.fmt(w * fx)}" cy="${c.fmt(w * fy)}" r="${r}" fill="${c.line}"/>`,
        ).join("") +
        `</pattern>`
      );
    },
  },
};

/** Is `name` one of the ground materials an `outdoor` surface fills with? */
export function isGroundMaterial(name: string): name is GroundMaterial {
  return (GROUND_MATERIALS as readonly string[]).includes(name);
}

export function isKnownMaterial(name: string): name is Material {
  return (KNOWN_MATERIALS as readonly string[]).includes(name);
}

/** Predefined DXF HATCH pattern name for a material (assumed known). */
export function dxfPatternName(material: string): string {
  return META[material]!.dxfPattern;
}

/** Whether a material is a solid (unpatterned) fill — drives the DXF solid flag. */
export function isSolidFill(material: string): boolean {
  return material === "none";
}

/** Render the `<pattern>` markup for a hatch spec (material assumed known). */
export function hatchPattern(spec: HatchSpec, base: Omit<HatchCtx, "scale" | "angle">): string {
  const meta = META[spec.material]!;
  const id = patternId(spec.material, spec.scale, spec.angle);
  return meta.build(id, { ...base, scale: spec.scale, angle: spec.angle });
}

/**
 * The drawn size of one pattern tile for a hatch spec at hatch module `gap` (the drawing's
 * `sizes.hatchGap`): the larger of the `<pattern>`'s width and height. It is read off the
 * markup {@link hatchPattern} itself emits, through an exact formatter (this is a
 * measurement, never printed), so it is the tile the drawing gets and not a second table of
 * tile factors that could drift from the builders. The resolver holds it to the modelling
 * range; a tile that overflows reads `Infinity` here and is refused there.
 */
export function hatchTileMm(spec: HatchSpec, gap: number): number {
  const markup = hatchPattern(spec, { fmt: String, gap, thin: 0, base: "", line: "" });
  const m = /^<pattern [^>]*?width="([^"]*)" height="([^"]*)"/.exec(markup);
  if (!m) return Number.NaN;
  return Math.max(Number(m[1]), Number(m[2]));
}
