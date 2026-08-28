/**
 * Material hatch patterns — a small named hatch *library*. Each material maps to
 * an SVG `<pattern>` builder (for the SVG backend), a natural rotation, and a
 * predefined DXF HATCH pattern name (so the hatch survives to CAD as a real
 * `HATCH` entity, not just boundary lines).
 *
 * Zero-dependency and deterministic. `poche` is the default (the v0.1 45° hatch);
 * the rest are selectable via `wall <kind> thickness N material <name> { … }`,
 * optionally scaled/rotated with `material <name> scale <s> angle <a>`. Patterns
 * are monochrome (base + line colours) so they stay theme-driven.
 *
 * A {@link HatchSpec} (material + scale + angle) is the data the Scene carries;
 * `scale` multiplies the tile size and `angle` is added to the pattern's natural
 * rotation. The default spec (`scale 1`, `angle 0`) renders byte-identically to
 * the pre-v0.9 hatches.
 */

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
 * The GROUND materials (v1.31) — the patterns `outdoor <kind>` fills with.
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
  // Ground materials (v1.31) always take the DEFAULT scale/angle — there is no authorable
  // `scale`/`angle` on an `outdoor` statement — so they are appended as bare specs. The
  // parameter defaults to empty, which is what makes every pre-v1.31 caller (and every
  // plan with no `outdoor`) produce a byte-identical list: same entries, same sort key.
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
 * Deterministic scatter for the `gravel` pattern: eleven (x, y, r) triples as FRACTIONS
 * of the tile, measured once and frozen here.
 *
 * There is no `Math.random()` anywhere in `src/` and there is not going to be one — a
 * random scatter would make `compile()` non-deterministic, which is the project's first
 * invariant. A fixed table buys the same visual irregularity with none of that: the tile
 * still reads as scattered stone, because at the size a hatch is drawn the eye does not
 * find the tiling, and the bytes are identical on every run and every machine.
 */
const GRAVEL_SCATTER: readonly (readonly [number, number, number])[] = [
  [0.13, 0.21, 0.9],
  [0.41, 0.09, 0.6],
  [0.72, 0.24, 1.0],
  [0.92, 0.47, 0.65],
  [0.27, 0.44, 0.75],
  [0.56, 0.55, 0.95],
  [0.08, 0.68, 0.7],
  [0.36, 0.81, 0.85],
  [0.63, 0.9, 0.6],
  [0.86, 0.74, 0.8],
  [0.5, 0.31, 0.55],
];

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

  // ---- ground materials (v1.31) ----------------------------------------------
  // None of the seven paints a background rectangle: each is drawn over the flat tint
  // the `outdoor` element emits beneath it. See the META doc comment above.

  // Short angled tufts, two per tile on opposite diagonals — turf.
  grass: {
    natural: 0,
    dxfPattern: "GRASS",
    build: (id, c) => {
      const w = c.gap * 3.4 * c.scale;
      const sw = c.fmt(c.thin * 0.4);
      const l = c.gap * 0.7 * c.scale;
      // One tuft = three strokes fanning up out of a point (the standard turf glyph).
      // `lean` skews the fan, so no two tufts in the tile are the same mark — the first
      // pass drew two identical upright tridents and the eye read the tiling instantly,
      // as a grid of repeated icons rather than as grass.
      const tuft = (cx: number, cy: number, lean: number): string =>
        `<path d="M${c.fmt(cx)},${c.fmt(cy)} L${c.fmt(cx - l * (0.5 - lean))},${c.fmt(cy - l * 0.85)}` +
        ` M${c.fmt(cx)},${c.fmt(cy)} L${c.fmt(cx + l * lean)},${c.fmt(cy - l * 1.1)}` +
        ` M${c.fmt(cx)},${c.fmt(cy)} L${c.fmt(cx + l * (0.5 + lean))},${c.fmt(cy - l * 0.8)}"` +
        ` stroke="${c.line}" stroke-width="${sw}" fill="none"/>`;
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        tuft(w * 0.2, w * 0.34, 0.12) +
        tuft(w * 0.62, w * 0.62, -0.15) +
        tuft(w * 0.35, w * 0.95, 0.02) +
        `</pattern>`
      );
    },
  },

  // Dots on a staggered grid — a planting bed / shrub area.
  planting: {
    natural: 0,
    dxfPattern: "DOTS",
    build: (id, c) => {
      const w = c.gap * 1.9 * c.scale;
      const r = c.fmt(c.thin * 1.1);
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        `<circle cx="${c.fmt(w * 0.25)}" cy="${c.fmt(w * 0.25)}" r="${r}" fill="${c.line}"/>` +
        `<circle cx="${c.fmt(w * 0.75)}" cy="${c.fmt(w * 0.75)}" r="${r}" fill="${c.line}"/>` +
        `</pattern>`
      );
    },
  },

  // Running-bond slabs — paving and patios. The same construction as `brick` (which is
  // the point: paving IS brickwork laid flat) at a coarser module.
  paving: {
    natural: 0,
    dxfPattern: "AR-B816",
    build: (id, c) => {
      const w = c.gap * 4 * c.scale;
      const h = c.gap * 2 * c.scale;
      const sw = c.fmt(c.thin * 0.55);
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(h)}"${xform(0, c)}>` +
        `<line x1="0" y1="${c.fmt(h)}" x2="${c.fmt(w)}" y2="${c.fmt(h)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `<line x1="0" y1="${c.fmt(h / 2)}" x2="${c.fmt(w)}" y2="${c.fmt(h / 2)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `<line x1="${c.fmt(w / 2)}" y1="0" x2="${c.fmt(w / 2)}" y2="${c.fmt(h / 2)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `<line x1="0" y1="${c.fmt(h / 2)}" x2="0" y2="${c.fmt(h)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `<line x1="${c.fmt(w)}" y1="${c.fmt(h / 2)}" x2="${c.fmt(w)}" y2="${c.fmt(h)}" stroke="${c.line}" stroke-width="${sw}"/>` +
        `</pattern>`
      );
    },
  },

  // Parallel boards — timber decking. One line per tile, so the boards run continuously
  // across the whole surface rather than breaking at every tile edge.
  deck: {
    natural: 0,
    dxfPattern: "LINE",
    build: (id, c) => {
      const w = c.gap * 2.2 * c.scale;
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        `<line x1="0" y1="${c.fmt(w)}" x2="${c.fmt(w)}" y2="${c.fmt(w)}" ` +
        `stroke="${c.line}" stroke-width="${c.fmt(c.thin * 0.7)}"/>` +
        `</pattern>`
      );
    },
  },

  // Scattered stones, from the FROZEN table above — never `Math.random()`.
  gravel: {
    natural: 0,
    dxfPattern: "GRAVEL",
    build: (id, c) => {
      const w = c.gap * 3.2 * c.scale;
      const dots = GRAVEL_SCATTER.map(
        ([fx, fy, fr]) =>
          `<circle cx="${c.fmt(w * fx)}" cy="${c.fmt(w * fy)}" r="${c.fmt(c.thin * fr)}" fill="${c.line}"/>`,
      ).join("");
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        dots +
        `</pattern>`
      );
    },
  },

  // Wave lines — the drafting convention for open water (a pool, a pond). Each wave is
  // two half-period quadratics spanning the tile exactly, so the line is continuous from
  // tile to tile with no seam.
  water: {
    natural: 0,
    dxfPattern: "SWAMP",
    build: (id, c) => {
      const w = c.gap * 4 * c.scale;
      const h = c.gap * 2.4 * c.scale;
      const sw = c.fmt(c.thin * 0.6);
      const wave = (y: number): string =>
        `<path d="M0,${c.fmt(y)} q${c.fmt(w * 0.25)},${c.fmt(-h * 0.22)} ${c.fmt(w * 0.5)},0` +
        ` q${c.fmt(w * 0.25)},${c.fmt(h * 0.22)} ${c.fmt(w * 0.5)},0"` +
        ` stroke="${c.line}" stroke-width="${sw}" fill="none"/>`;
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(h)}"${xform(0, c)}>` +
        wave(h * 0.3) +
        wave(h * 0.8) +
        `</pattern>`
      );
    },
  },

  // Fine, dense speckle — bitumen. A driveway is neither slabs nor loose stone.
  tarmac: {
    natural: 0,
    dxfPattern: "AR-SAND",
    build: (id, c) => {
      const w = c.gap * 1.3 * c.scale;
      const r = c.fmt(c.thin * 0.5);
      return (
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}"${xform(0, c)}>` +
        `<circle cx="${c.fmt(w * 0.3)}" cy="${c.fmt(w * 0.65)}" r="${r}" fill="${c.line}"/>` +
        `<circle cx="${c.fmt(w * 0.78)}" cy="${c.fmt(w * 0.22)}" r="${r}" fill="${c.line}"/>` +
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
