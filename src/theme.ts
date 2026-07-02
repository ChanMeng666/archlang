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

/** Resolve a directive key (canonical or alias) to a Theme key, or null. Uses
 *  own-property checks so prototype keys (`__proto__`, `constructor`) resolve to
 *  null (rejected as unknown) rather than slipping through `in`. */
export function resolveThemeKey(key: string): keyof Theme | null {
  const owns = (o: object, k: string): boolean => Object.hasOwn(o, k);
  if (owns(DEFAULT_THEME, key)) return key as keyof Theme;
  if (owns(ALIASES, key)) return ALIASES[key];
  return null;
}

/**
 * Named theme bases. `theme <name> { … }` merges the named base over the default
 * (and the block's overrides over that). These are *additions* over
 * {@link DEFAULT_THEME}; the default — and therefore default output — is
 * untouched. A one-liner `theme blueprint` looks finished with no block.
 */
export const THEMES: Record<string, Partial<Theme>> = {
  // Classic cyanotype: white linework on blueprint blue.
  blueprint: {
    bg: "#0b3d6b",
    wallStroke: "#ffffff",
    pocheBase: "#0e4a82",
    pocheHatch: "#3b6ea5",
    roomFill: "#0b3d6b",
    roomLabel: "#eaf2fb",
    areaLabel: "#a9c6e8",
    furnitureStroke: "#9fc0e6",
    furnitureFill: "#0e4a82",
    furnitureLabel: "#cfe0f5",
    opening: "#0b3d6b",
    doorLeaf: "#cfe0f5",
    windowPane: "#bcd6f2",
    dim: "#eaf2fb",
    annotation: "#eaf2fb",
    annotationMuted: "#9fc0e6",
    column: "#ffffff",
  },
  // Pure black & white, for crisp print / line drawings.
  mono: {
    bg: "#ffffff",
    wallStroke: "#000000",
    pocheBase: "#ffffff",
    pocheHatch: "#000000",
    roomFill: "#ffffff",
    roomLabel: "#000000",
    areaLabel: "#444444",
    furnitureStroke: "#000000",
    furnitureFill: "#ffffff",
    furnitureLabel: "#333333",
    opening: "#ffffff",
    doorLeaf: "#000000",
    windowPane: "#000000",
    dim: "#000000",
    annotation: "#000000",
    annotationMuted: "#555555",
    column: "#000000",
  },
  // Dark UI / screen presentation.
  dark: {
    bg: "#1e2127",
    wallStroke: "#e8e8e8",
    pocheBase: "#3a3f4b",
    pocheHatch: "#5a6172",
    roomFill: "#272b33",
    roomLabel: "#f0f0f0",
    areaLabel: "#9aa0aa",
    furnitureStroke: "#6b7280",
    furnitureFill: "#2f343d",
    furnitureLabel: "#c9ced8",
    opening: "#1e2127",
    doorLeaf: "#c9ced8",
    windowPane: "#6cb6ff",
    dim: "#6cb6ff",
    annotation: "#cfd3da",
    annotationMuted: "#888f99",
    column: "#cbd1db",
  },
  // Warm, soft, finished-looking — for slides and client decks.
  presentation: {
    bg: "#faf7f2",
    wallStroke: "#2b2b2b",
    pocheBase: "#e7ded0",
    pocheHatch: "#b9a98f",
    roomFill: "#fffdf9",
    roomLabel: "#2b2b2b",
    areaLabel: "#8a7f70",
    furnitureStroke: "#b7a98f",
    furnitureFill: "#f3ece0",
    furnitureLabel: "#9a8d78",
    opening: "#faf7f2",
    doorLeaf: "#6b5d49",
    windowPane: "#7fa8c9",
    dim: "#3c6b8a",
    annotation: "#3a3a3a",
    annotationMuted: "#9a8d78",
    column: "#5a5044",
    font: "Georgia, 'Times New Roman', serif",
    lineWeight: 1.1,
  },
};

/**
 * Per-element style override keys: a friendly attribute (`fill`/`stroke`/`label`)
 * maps, per element kind, to a concrete {@link Theme} key. Drives
 * `style <kind> { fill … }` (T4.4); resolution is element → theme → default.
 */
const STYLE_KEYS: Record<string, Record<string, keyof Theme>> = {
  room: { fill: "roomFill", label: "roomLabel", area: "areaLabel" },
  furniture: { fill: "furnitureFill", stroke: "furnitureStroke", label: "furnitureLabel" },
  wall: { stroke: "wallStroke", fill: "pocheBase", hatch: "pocheHatch" },
  door: { leaf: "doorLeaf", opening: "opening" },
  window: { pane: "windowPane", opening: "opening" },
  dim: { stroke: "dim", label: "dim" },
  column: { fill: "column", stroke: "wallStroke" },
};

/** Resolve a `style <kind> { <key> … }` attribute to a Theme key, or null.
 *  Own-property checks keep prototype keys from resolving. */
export function resolveStyleKey(kind: string, key: string): keyof Theme | null {
  const owns = (o: object, k: string): boolean => Object.hasOwn(o, k);
  if (!owns(STYLE_KEYS, kind)) return null;
  const m = STYLE_KEYS[kind];
  return owns(m, key) ? m[key] : null;
}

/** Per-element style overrides, by element kind, as resolved Theme partials. */
export type StyleMap = Record<string, Partial<Theme>>;

// ---- Deterministic, zero-dependency HSL for one-colour poché derivation ----

/** Parse `#rrggbb` (or `rrggbb`) to HSL in [0,1]; null if not a 6-digit hex. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

/** HSL in [0,1] → `#rrggbb` (deterministic rounding). */
export function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const to = (x: number): string =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Derive a finished poché from a single wall colour (`theme from "#color"`):
 * the wall keeps its colour; the fill is a light tint of that hue and the hatch
 * a mid tint. Opt-in only — never fires unless `theme from` is written — so
 * existing plans (which carry the default poché) stay byte-identical.
 */
export function derivePoche(wall: string): Partial<Theme> {
  const hsl = hexToHsl(wall);
  if (!hsl) return { wallStroke: wall };
  const clamp = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  return {
    wallStroke: wall,
    pocheBase: hslToHex(hsl.h, clamp(hsl.s * 0.3), 0.92),
    pocheHatch: hslToHex(hsl.h, clamp(hsl.s * 0.55), 0.72),
  };
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
