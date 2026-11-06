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
  wood: m("#c6a785", 0.75),
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

/** The slot a stair is built in (card X3): oak treads. The core gives a stair no material, so
 *  this is a drafting default, ledgered (`stair-material-default`). */
export const STAIR_MATERIAL = "wood" satisfies Exclude<MaterialSlot, "body">;

/**
 * The building's own materials (visual-assets V9), by Mesh3D kind, and `<kind>:<part>` where a
 * part differs (a window's frame and glass, a demolished wall's ghost): the light replay's colours
 * and, through `linearRgb`, the GLB's. Soft daylight on a refined model: warm-white walls on a
 * warm-grey concrete slab, oak doors, slim dark-bronze window frames, pale glass. A floor takes its
 * finish's colour (`FINISH_PALETTE`), never a kind colour.
 */
export const KIND_PALETTE = {
  slab: m("#bdb6ab", 0.9),
  column: m("#e6e1d8", 0.85),
  wall: m("#f2f0eb", 0.9),
  door: m("#c2a27e", 0.7),
  "window:frame": m("#55534f", 0.5),
  "window:glass": m("#bcd6e0", 0.05, 0, 0.4),
  opening: m("#e6e1d8", 0.85),
  furniture: m("#d6cec1", 0.9),
  roof: m("#9c958a", 0.9),
  "wall:demolish": m("#c8553d", 0.9, 0, 0.3),
  // A stair (card X3): the core gives it no material, so the ledgered default (`STAIR_MATERIAL`,
  // `stair-material-default`): that slot's own entry, never a second copy of its colour.
  stair: PALETTE[STAIR_MATERIAL],
} as const satisfies Readonly<Record<string, SlotMaterial>>;

export type KindMaterial = keyof typeof KIND_PALETTE;

/**
 * The replay's colour for a wall's cut top (its cap, the faces at its full height): the poché of a
 * plan, read as the section through a model whose roof is lifted off. A display convention of the
 * viewer, not a material: the GLB has no cap.
 */
export const WALL_CAP_SRGB = "#8f877d";

/** The floor finishes a room's floor is laid in (visual-assets V9): colour only, no texture. */
export const FLOOR_FINISHES = ["timber", "tile", "neutral"] as const;
export type FloorFinish = (typeof FLOOR_FINISHES)[number];

/** Light oak boards, pale stone tile, and the neutral finish a room whose use is unknown keeps. */
export const FINISH_PALETTE: Readonly<Record<FloorFinish, SlotMaterial>> = {
  timber: m("#cdb596", 0.6),
  tile: m("#e3e1db", 0.35),
  neutral: m("#e8e2d7", 0.9),
};

/**
 * A room's floor finish from its declared `uses` (the core's use kinds, read off the plan by
 * `adaptPlan`), first rule that names one of them: a wet room is tiled whatever else it is (`bath
 * wc`, `utility wc`); a room lived in, slept or worked in, or walked through is timber (an open
 * `living kitchen` keeps its boards); a kitchen or an entry on its own is tiled; anything else (a
 * garage, a store, a room without `uses`) keeps the neutral finish. A drafting default, ledgered per
 * floor as `floor-finish-default` (ADR 0030 decision 5); never read from a label.
 */
export const FLOOR_FINISH_RULES: ReadonlyArray<readonly [FloorFinish, readonly string[]]> = [
  ["tile", ["bath", "wc", "utility"]],
  ["timber", ["living", "dining", "bedroom", "office", "hall", "circulation"]],
  ["tile", ["kitchen", "entry"]],
];

/** The finish {@link FLOOR_FINISH_RULES} gives a room with these `uses`. */
export function floorFinish(uses: readonly string[] | undefined): FloorFinish {
  for (const [finish, kinds] of FLOOR_FINISH_RULES) if (uses?.some((u) => kinds.includes(u))) return finish;
  return "neutral";
}

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

/**
 * A floor finish's viewer colour under a replay theme: the finish itself on the light theme; on the
 * dark one, 60% of the way to the theme's floor colour (the same arithmetic as `slotColour`).
 */
export function finishColour(finish: FloorFinish, theme: "light" | "dark", floor: string): string {
  const own = FINISH_PALETTE[finish].srgb;
  if (theme === "light") return own;
  const mix = (i: number): string => {
    const a = Number.parseInt(own.slice(i, i + 2), 16);
    const b = Number.parseInt(floor.slice(i, i + 2), 16);
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
