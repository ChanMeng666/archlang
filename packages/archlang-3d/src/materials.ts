/**
 * Material slots (visual-assets card V1): the ONE palette both the GLB writer (`glb/write.ts`) and
 * the replay viewer (`replay/mount.ts`) read, so a piece's oak or ceramic is the same colour in
 * both. A T0 part names its slot (`Part.mat`, `mesh/t0.ts`); its shell carries it (`Shell.slot`);
 * a node with slotted shells is still ONE node under its key (`furniture:<id>`), drawn as one
 * primitive (GLB, material `fixture:<slot>`) or one mesh (viewer) per slot.
 *
 * `body` is the untagged part: it carries no slot and keeps its kind's own colour, so a piece that
 * names no slot is drawn exactly as before. Browser-safe and pure: no clock, no random source.
 */
import type { Shell } from "./mesh/types.js";

/** The closed set of slots, in the order a node's primitives (GLB) and meshes (viewer) are written. */
export const MATERIAL_SLOTS = [
  "body",
  "wood",
  "wood_dark",
  "fabric",
  "cushion",
  "linen",
  "wool",
  "ceramic",
  "stone",
  "metal",
  "glass",
  "appliance",
  "screen",
  "paint",
  "rubber",
  "foliage",
  "bark",
  "soil",
  "water",
] as const;

export type MaterialSlot = (typeof MATERIAL_SLOTS)[number];

export interface SlotMaterial {
  /** Base colour, sRGB `#rrggbb`: the viewer's colour, and the GLB's after `linearRgb`. */
  srgb: string;
  /** 1 = opaque; below 1 the GLB writes `alphaMode: BLEND` and the viewer draws it translucent. */
  alpha: number;
  /** glTF metallic-roughness factors (the viewer's Lambert shading reads neither). */
  metallic: number;
  roughness: number;
}

const m = (srgb: string, roughness: number, metallic = 0, alpha = 1): SlotMaterial => ({
  srgb,
  alpha,
  metallic,
  roughness,
});

/**
 * The palette: warm and quiet, a furnished Scandinavian interior rather than a massing model —
 * light oak and walnut, warm grey upholstery, off-white linen and ceramics, a pale stone worktop,
 * brushed steel, a sage-grey kitchen and muted greens outdoors.
 */
export const PALETTE: Readonly<Record<Exclude<MaterialSlot, "body">, SlotMaterial>> = {
  wood: m("#c9a57a", 0.75),
  wood_dark: m("#7b5b44", 0.7),
  fabric: m("#968f85", 0.95),
  cushion: m("#bfb7ab", 0.95),
  linen: m("#f3efe7", 0.9),
  wool: m("#a7ac98", 1),
  ceramic: m("#f6f4f0", 0.25),
  stone: m("#d8d4cc", 0.45),
  metal: m("#aeb2b4", 0.35, 1),
  glass: m("#c9dee6", 0.05, 0, 0.35),
  appliance: m("#dcdcd8", 0.35),
  screen: m("#2e3033", 0.2),
  paint: m("#a9b1a2", 0.6),
  rubber: m("#3b3b3b", 0.9),
  foliage: m("#8c9b78", 0.9),
  bark: m("#6f5b49", 0.9),
  soil: m("#5f4b3b", 1),
  water: m("#a3c6d0", 0.1, 0, 0.7),
};

/** sRGB `#rrggbb` → linear RGB, each channel rounded to 4 decimals (glTF base colours are linear). */
export function linearRgb(hex: string): [number, number, number] {
  const ch = (i: number): number => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    const v = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return Math.round(v * 1e4) / 1e4;
  };
  return [ch(1), ch(3), ch(5)];
}

/**
 * A slot's viewer colour under a replay theme: the palette itself on the light theme; on the dark
 * (blueprint) theme, 60% of the way from the palette to the theme's furniture colour, so materials
 * stay told apart without leaving the theme. Each channel is one float multiply-add of 0–255
 * integers, rounded to a whole channel value: basic IEEE-754 operations, correctly rounded in
 * every engine, so every engine agrees.
 */
export function slotColour(slot: Exclude<MaterialSlot, "body">, theme: "light" | "dark", furniture: string): string {
  const own = PALETTE[slot].srgb;
  if (theme === "light") return own;
  const mix = (i: number): string => {
    const a = Number.parseInt(own.slice(i, i + 2), 16);
    const b = Number.parseInt(furniture.slice(i, i + 2), 16);
    return Math.round(a * 0.4 + b * 0.6)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/** A node's shells grouped by slot, in `MATERIAL_SLOTS` order (untagged `body` first). */
export function slotGroups(shells: readonly Shell[]): Array<{ slot: MaterialSlot; shells: Shell[] }> {
  const by = new Map<MaterialSlot, Shell[]>();
  for (const s of shells) {
    const k = s.slot ?? "body";
    const g = by.get(k);
    if (g) g.push(s);
    else by.set(k, [s]);
  }
  return MATERIAL_SLOTS.filter((k) => by.has(k)).map((slot) => ({ slot, shells: by.get(slot) as Shell[] }));
}
