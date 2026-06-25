/**
 * Theme: colours, line-weight, and font for the rendered drawing.
 *
 * Resolution order (later wins): {@link DEFAULT_THEME} → the plan's `theme { … }`
 * directive → `CompileOptions.theme`. Merging is a shallow override, so any
 * subset of keys may be supplied at either layer.
 */

export interface Theme {
  bg: string;
  pocheBase: string;
  pocheHatch: string;
  wallStroke: string;
  roomFill: string;
  roomLabel: string;
  areaLabel: string;
  furnitureStroke: string;
  furnitureFill: string;
  furnitureLabel: string;
  opening: string;
  doorLeaf: string;
  windowPane: string;
  dim: string;
  annotation: string;
  annotationMuted: string;
  column: string;
  /** Multiplier on all stroke widths (1 = default). */
  lineWeight: number;
  /** SVG `font-family`. */
  font: string;
}

export const DEFAULT_THEME: Theme = {
  bg: "#ffffff",
  pocheBase: "#e9e4db",
  pocheHatch: "#b9b1a4",
  wallStroke: "#1b1b1b",
  roomFill: "#fbfaf7",
  roomLabel: "#222222",
  areaLabel: "#7a7a7a",
  furnitureStroke: "#a8a29a",
  furnitureFill: "#f4f2ee",
  furnitureLabel: "#9a948c",
  opening: "#ffffff",
  doorLeaf: "#555555",
  windowPane: "#3a6ea5",
  dim: "#0E5484",
  annotation: "#333333",
  annotationMuted: "#888888",
  column: "#4a4a4a",
  lineWeight: 1,
  font: "Helvetica, Arial, sans-serif",
};

/** Friendly directive aliases → canonical {@link Theme} keys. */
const ALIASES: Record<string, keyof Theme> = {
  background: "bg",
  wall: "wallStroke",
  wallFill: "pocheBase",
  wallHatch: "pocheHatch",
  room: "roomFill",
  furniture: "furnitureFill",
  door: "doorLeaf",
  window: "windowPane",
};

/** Resolve a directive key (canonical or alias) to a Theme key, or null. */
export function resolveThemeKey(key: string): keyof Theme | null {
  if (key in DEFAULT_THEME) return key as keyof Theme;
  if (key in ALIASES) return ALIASES[key];
  return null;
}

/** Keys whose values are numbers (everything else is a string). */
export function isNumericThemeKey(key: keyof Theme): boolean {
  return key === "lineWeight";
}

/** Shallow-merge theme layers (later overrides earlier); ignores undefined. */
export function mergeTheme(...layers: (Partial<Theme> | undefined)[]): Theme {
  const out: Theme = { ...DEFAULT_THEME };
  for (const layer of layers) {
    if (!layer) continue;
    for (const k of Object.keys(layer) as (keyof Theme)[]) {
      const v = layer[k];
      if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/**
 * XML-escape every string theme value (colours, font). Theme strings come from
 * untrusted `.arch` source (the `theme { … }` directive / `CompileOptions.theme`)
 * and are interpolated into SVG *attributes*; escaping `& < > "` here, once,
 * makes attribute breakout impossible regardless of how each render site emits
 * them. Numeric values (lineWeight) pass through. Valid colours/fonts contain no
 * escapable characters, so output is unchanged for well-formed themes.
 */
export function sanitizeTheme(theme: Theme): Theme {
  const esc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const out: Theme = { ...theme };
  for (const k of Object.keys(out) as (keyof Theme)[]) {
    const v = out[k];
    if (typeof v === "string") (out as unknown as Record<string, unknown>)[k] = esc(v);
  }
  return out;
}
