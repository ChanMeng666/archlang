/**
 * Material hatch patterns — each emits an SVG `<pattern>` for wall poché.
 *
 * Zero-dependency and deterministic. `poche` is the default (the v0.1 45° hatch);
 * the rest are selectable via `wall <kind> thickness N material <name> { … }`.
 * Patterns are monochrome (base + line colours) so they stay theme-driven.
 */

export interface HatchCtx {
  fmt: (n: number) => string;
  /** Hatch module size in user units (derives from refDim). */
  gap: number;
  /** A thin stroke width. */
  thin: number;
  base: string;
  line: string;
}

/** Builds the inner markup of a `<pattern>` (id + attributes are added by caller). */
export type HatchDef = (id: string, c: HatchCtx) => string;

export const KNOWN_MATERIALS = ["poche", "concrete", "brick", "insulation", "tile", "none"] as const;
export type Material = (typeof KNOWN_MATERIALS)[number];
export const DEFAULT_MATERIAL: Material = "poche";

/** The SVG element id for a material's pattern (default keeps the bare "poche"). */
export function patternId(material: string): string {
  return material === "poche" ? "poche" : `hatch-${material}`;
}

const HATCHES: Record<Material, HatchDef> = {
  poche: (id, c) =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(c.gap)}" height="${c.fmt(c.gap)}" patternTransform="rotate(45)">` +
    `<rect width="${c.fmt(c.gap)}" height="${c.fmt(c.gap)}" fill="${c.base}"/>` +
    `<line x1="0" y1="0" x2="0" y2="${c.fmt(c.gap)}" stroke="${c.line}" stroke-width="${c.fmt(c.thin * 0.7)}"/>` +
    `</pattern>`,

  // Aggregate speckle.
  concrete: (id, c) => {
    const w = c.gap * 1.6;
    return (
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}">` +
      `<rect width="${c.fmt(w)}" height="${c.fmt(w)}" fill="${c.base}"/>` +
      `<circle cx="${c.fmt(w * 0.25)}" cy="${c.fmt(w * 0.3)}" r="${c.fmt(c.thin * 0.9)}" fill="${c.line}"/>` +
      `<circle cx="${c.fmt(w * 0.7)}" cy="${c.fmt(w * 0.62)}" r="${c.fmt(c.thin * 0.6)}" fill="${c.line}"/>` +
      `<circle cx="${c.fmt(w * 0.45)}" cy="${c.fmt(w * 0.85)}" r="${c.fmt(c.thin * 0.75)}" fill="${c.line}"/>` +
      `</pattern>`
    );
  },

  // Running-bond brick courses.
  brick: (id, c) => {
    const w = c.gap * 3;
    const h = c.gap * 1.4;
    const sw = c.fmt(c.thin * 0.6);
    return (
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(h)}">` +
      `<rect width="${c.fmt(w)}" height="${c.fmt(h)}" fill="${c.base}"/>` +
      `<line x1="0" y1="${c.fmt(h)}" x2="${c.fmt(w)}" y2="${c.fmt(h)}" stroke="${c.line}" stroke-width="${sw}"/>` +
      `<line x1="0" y1="${c.fmt(h / 2)}" x2="${c.fmt(w)}" y2="${c.fmt(h / 2)}" stroke="${c.line}" stroke-width="${sw}"/>` +
      `<line x1="${c.fmt(w / 2)}" y1="0" x2="${c.fmt(w / 2)}" y2="${c.fmt(h / 2)}" stroke="${c.line}" stroke-width="${sw}"/>` +
      `<line x1="0" y1="${c.fmt(h / 2)}" x2="0" y2="${c.fmt(h)}" stroke="${c.line}" stroke-width="${sw}"/>` +
      `<line x1="${c.fmt(w)}" y1="${c.fmt(h / 2)}" x2="${c.fmt(w)}" y2="${c.fmt(h)}" stroke="${c.line}" stroke-width="${sw}"/>` +
      `</pattern>`
    );
  },

  // Cross-hatch batting.
  insulation: (id, c) => {
    const w = c.gap * 1.2;
    return (
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}">` +
      `<rect width="${c.fmt(w)}" height="${c.fmt(w)}" fill="${c.base}"/>` +
      `<path d="M0,0 L${c.fmt(w)},${c.fmt(w)} M${c.fmt(w)},0 L0,${c.fmt(w)}" stroke="${c.line}" stroke-width="${c.fmt(c.thin * 0.5)}" fill="none"/>` +
      `</pattern>`
    );
  },

  // Square tile grid.
  tile: (id, c) => {
    const w = c.gap * 1.8;
    return (
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(w)}" height="${c.fmt(w)}">` +
      `<rect width="${c.fmt(w)}" height="${c.fmt(w)}" fill="${c.base}"/>` +
      `<rect x="0" y="0" width="${c.fmt(w)}" height="${c.fmt(w)}" fill="none" stroke="${c.line}" stroke-width="${c.fmt(c.thin * 0.6)}"/>` +
      `</pattern>`
    );
  },

  // Solid fill, no hatch.
  none: (id, c) =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${c.fmt(c.gap)}" height="${c.fmt(c.gap)}">` +
    `<rect width="${c.fmt(c.gap)}" height="${c.fmt(c.gap)}" fill="${c.base}"/>` +
    `</pattern>`,
};

export function isKnownMaterial(name: string): name is Material {
  return (KNOWN_MATERIALS as readonly string[]).includes(name);
}

/** Render the `<pattern>` markup for a material (assumed known). */
export function hatchPattern(material: Material, c: HatchCtx): string {
  return HATCHES[material](patternId(material), c);
}
