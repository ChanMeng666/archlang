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

const META: Record<Material, HatchMeta> = {
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
};

export function isKnownMaterial(name: string): name is Material {
  return (KNOWN_MATERIALS as readonly string[]).includes(name);
}

/** Predefined DXF HATCH pattern name for a material (assumed known). */
export function dxfPatternName(material: string): string {
  return META[material as Material].dxfPattern;
}

/** Whether a material is a solid (unpatterned) fill — drives the DXF solid flag. */
export function isSolidFill(material: string): boolean {
  return material === "none";
}

/** Render the `<pattern>` markup for a hatch spec (material assumed known). */
export function hatchPattern(spec: HatchSpec, base: Omit<HatchCtx, "scale" | "angle">): string {
  const meta = META[spec.material as Material];
  const id = patternId(spec.material, spec.scale, spec.angle);
  return meta.build(id, { ...base, scale: spec.scale, angle: spec.angle });
}
