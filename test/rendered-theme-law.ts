/**
 * The body of the `rendered`-theme byte-identity law (visual-assets card V4), importable without
 * vitest, so the baseline was measured against `main`'s `src/` by this very code and not a
 * lookalike (`test/byte-identity-digest.ts` says why that matters).
 *
 * The claim: adding a theme that fills symbols with material tints moves nothing a plan already
 * draws. So the sweep compiles every row under the DEFAULT theme and under each theme that existed
 * before `rendered` ({@link LEGACY_THEMES}), handing the named base in as `CompileOptions.theme` —
 * the layer the playground and the embed use — and hashes the repository's whole-surface payload
 * for each ({@link allStoreysDiagnosticsPayload}: every page's SVG, `describe()`, `lint()`,
 * `compile().diagnostics`). A row's digest is SHA-256 over its five per-theme digests in sweep
 * order, so a row names the plan and the per-theme hexes name the theme when one moves.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { allStoreysDiagnosticsPayload, type CompilerApi, type DigestOptions } from "./byte-identity-payload.js";
import type { Theme } from "../src/theme.js";
import type { World } from "../src/world.js";

/** The named themes that shipped before `rendered`, in sweep order. A literal on purpose: the law
 *  is about THESE, and a theme added later must not silently join a baseline measured without it. */
export const LEGACY_THEMES: readonly string[] = ["blueprint", "mono", "dark", "presentation"];

/** The compiler surface the law reads, plus the named bases, handed in so `main` can be measured. */
export interface ThemeLawApi extends CompilerApi {
  themes: Readonly<Record<string, Partial<Theme>>>;
}

/** A plan the law pins: `dir` is what an `import` of its is read against. */
export interface ThemeLawRow {
  name: string;
  src: string;
  dir?: string;
}

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** One digest per sweep entry: the default (no theme option), then each of {@link LEGACY_THEMES}. */
export function perThemeDigests(api: ThemeLawApi, src: string, world: World | undefined): string[] {
  const w = world ? { world } : {};
  const out = [sha256(allStoreysDiagnosticsPayload(api, src, w))];
  for (const name of LEGACY_THEMES) {
    const theme = api.themes[name];
    if (!theme) throw new Error(`theme law: no built-in theme "${name}"`);
    // `DigestOptions` is the world alone; the theme rides the same options object to `compile()`,
    // `describe()` and `lint()`, which is exactly what a caller passing a theme does.
    out.push(sha256(allStoreysDiagnosticsPayload(api, src, { ...w, theme } as unknown as DigestOptions)));
  }
  return out;
}

/** The row's digest: SHA-256 over its per-theme digests joined by a comma. */
export function themeLawDigest(api: ThemeLawApi, src: string, world: World | undefined): string {
  return sha256(perThemeDigests(api, src, world).join(","));
}

/** The first 83 canonical fixture families — every family that existed when the law was measured
 *  (101 catalogued words with their aliases). The family table is append-only (its order is the
 *  legend's), so a family added later never enters this row; the list is passed in so the row is
 *  built from the table, never retyped. */
export const MEASURED_FAMILIES = 83;

const plan = (body: string): string => `plan "T" {\n  units mm\n${body}\n}\n`;

/**
 * Plans the example corpus cannot supply: every drawn family on one sheet with its legend (so every
 * glyph and every legend swatch is under the law, at both sheet pens), a `style furniture` override,
 * a plan-level `theme presentation { furniture … }` override with planting on a lawn, and an
 * uncatalogued word (the labelled-rectangle fallback, a group-1 permanent pin elsewhere).
 */
export function inlineRows(canonicalFamilies: readonly string[]): ThemeLawRow[] {
  // A shorter table would quietly shrink the row and move its digest for the wrong reason.
  if (canonicalFamilies.length < MEASURED_FAMILIES) {
    throw new Error(`theme law: ${canonicalFamilies.length} families, the row was measured over ${MEASURED_FAMILIES}`);
  }
  const fams = canonicalFamilies.slice(0, MEASURED_FAMILIES);
  const cols = 12;
  const pieces = fams.map((f, i) => {
    const x = 300 + (i % cols) * 1400;
    const y = 300 + Math.floor(i / cols) * 1200;
    return `  furniture ${f} at (${x},${y}) size 1000x800 in r`;
  });
  const W = 300 + cols * 1400;
  const H = 300 + Math.ceil(fams.length / cols) * 1200;
  return [
    {
      name: "inline:every-family-1:50",
      src: plan(
        `  paper A0 landscape\n  scale 1:50\n  legend\n  room id=r at (0,0) size ${W}x${H} label "All"\n  wall exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }\n${pieces.join("\n")}`,
      ),
    },
    {
      name: "inline:every-family-unscaled",
      src: plan(
        `  room id=r at (0,0) size ${W}x${H} label "All"\n  wall exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }\n${pieces.join("\n")}`,
      ),
    },
    {
      name: "inline:style-furniture",
      src: plan(
        `  style furniture { fill: "#ddeeff" stroke: "#335577" }\n  room id=r at (0,0) size 6000x4000 label "Living"\n  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n  furniture sofa at (300,300) size 2200x900 in r\n  furniture rug at (300,1400) size 2400x1600 in r\n  furniture bed at (3200,300) size 1600x2000 in r\n  furniture plant at (5000,3000) size 600x600 in r`,
      ),
    },
    {
      name: "inline:theme-override",
      src: plan(
        `  theme presentation { furniture: "#eeddcc" lawn: "#e0ead0" }\n  room id=r at (0,0) size 5000x4000 label "Kitchen"\n  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }\n  furniture counter at (300,300) size 3000x600 in r\n  furniture kitchen_sink at (3400,300) size 1000x600 in r\n  furniture dining_table at (1500,2000) size 1600x900 in r\n  outdoor id=g lawn at (6000,0) size 5000x4000\n  furniture tree at (7000,1000) size 2000x2000\n  furniture hedge at (6200,3400) size 4000x500`,
      ),
    },
    {
      name: "inline:uncatalogued",
      src: plan(
        `  room id=r at (0,0) size 4000x3000 label "Den"\n  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n  furniture widget at (500,500) size 2000x800 label "Widget" in r`,
      ),
    },
  ];
}

/** Every row of the law, in table order: the shipped examples, then {@link inlineRows}. */
export function themeLawRows(root: string, canonicalFamilies: readonly string[]): ThemeLawRow[] {
  const dir = "examples";
  const examples = readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => ({ name: `${dir}/${f}`, src: readFileSync(join(root, dir, f), "utf8"), dir: join(root, dir) }));
  return [...examples, ...inlineRows(canonicalFamilies)];
}
