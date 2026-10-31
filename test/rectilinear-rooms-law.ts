/**
 * The body of the rectilinear-rooms byte-identity law (issue #363, card L1), importable without
 * vitest, so the baseline was measured against an older `src/` by this very code and not a
 * lookalike (`test/byte-identity-digest.ts` says why that matters).
 *
 * The payload is the repository's whole-surface one ({@link allStoreysDiagnosticsPayload}: every
 * page's SVG, `describe()`, `lint()`, `compile().diagnostics`) plus the two things that surface
 * cannot show: the Scene of every page, and the evaluation steps the resolution spends. A change
 * to how many steps a rectangle costs moves no drawing and no fact, and it is still a change: it
 * moves where `E_STEP_LIMIT` lands.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allStoreysDiagnosticsPayload, type CompilerApi } from "./byte-identity-payload.js";
import { WALLS_FROM_ROOMS_PLANS } from "./walls-from-rooms-plans.js";
import type { World } from "../src/world.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The compiler surface the law reads, handed in so an older tree can be measured. */
export interface LawApi extends CompilerApi {
  /** The steps a source's whole resolution spends, every storey. */
  stepsOf(src: string, world: World | undefined): number;
}

/** SHA-256 over the whole-surface payload, every page's Scene and the step count. */
export function lawDigest(api: LawApi, src: string, world: World | undefined): string {
  const opts = world ? { world } : {};
  const out = api.compile(src, { noCache: true, ...opts });
  const scenes = out.pages ? out.pages.map((p) => p.scene) : [out.scene];
  const payload = [
    allStoreysDiagnosticsPayload(api, src, opts),
    JSON.stringify(scenes),
    String(api.stepsOf(src, world)),
  ].join(" ");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/** A plan the law pins: `dir` is what an `import` of its is read against. */
export interface LawRow {
  name: string;
  src: string;
  dir?: string;
}

const arch = (root: string, dir: string): LawRow[] =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => ({ name: `${dir}/${f}`, src: readFileSync(join(root, dir, f), "utf8"), dir: join(root, dir) }));

const plan = (body: string): string => `plan "W" {\n  units mm\n${body}\n}\n`;
const L = "(0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000)";

/**
 * Plans a corpus cannot supply. The first three are this law's edge: a rectilinear polygon with
 * a `walls from rooms` statement beside it that leaves it out, or none at all. The last rows are
 * rectangle pair clauses whose runs the sweep's new branches sit next to.
 */
export const INLINE_ROWS: readonly LawRow[] = [
  {
    // The issue's hybrid plan: the L is excepted, so nothing about it may change.
    name: "inline:issue-hybrid",
    src: plan(
      `  room id=liv polygon ${L} label "Living" uses living\n  room id=bed at (3000,3000) size 3000x3000 label "Bedroom" uses bedroom\n  room id=bath at (6000,0) size 2000x6000 label "Bath" uses bath\n  walls from rooms exterior 200 partition 100 { except liv }\n  wall id=lext exterior thickness 200 { (6000,0) (0,0) (0,6000) (3000,6000) }\n  wall id=p1 partition thickness 100 { (3000,6000) (3000,3000) (6000,3000) }\n  wall id=p2 partition thickness 100 { (6000,0) (6000,3000) }\n  door on lext at 3000 width 1000 swing inward\n  door on p1 at 1500 width 800 swing into bed\n  door on p2 at 1500 width 800 swing into bath\n  window on lext at 7500 width 1500\n  window on bed.bottom width 1200\n  furniture shower in bath anchor top-right flush size 900x900`,
    ),
  },
  {
    name: "inline:typed-walls",
    src: plan(
      `  room id=liv polygon ${L} uses living\n  room id=bed at (3000,3000) size 3000x3000 uses bedroom\n  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }\n  wall id=p partition thickness 100 { (3000,6000) (3000,3000) (6000,3000) }`,
    ),
  },
  {
    // `except` of a slanted polygon: out of the set, so its wording cannot move either.
    name: "inline:except-slanted",
    src: plan(
      `  room id=a at (0,0) size 4000x3000 uses living\n  room id=b at (4000,0) size 3000x3000 uses bedroom\n  room id=p polygon (20000,0) (22000,0) (21000,2000) uses hall\n  walls from rooms exterior 200 partition 100 { except p }`,
    ),
  },
  {
    name: "inline:clauses",
    src: plan(
      `  room id=a at (0,0) size 4000x3000 uses living\n  room id=b at (4000,0) size 3000x3000 uses kitchen\n  room id=c at (0,3000) size 7000x2000 uses hall\n  walls from rooms exterior 200 partition 100 { open id=ab between a and b width 1200  between a and c thickness 150 }`,
    ),
  },
];

/** Every row of the law, in table order. `root` is the tree the plans are read from. */
export function lawRows(root: string): LawRow[] {
  return [
    ...arch(root, "examples"),
    ...arch(root, "test/fixtures"),
    ...arch(root, "test/walls-from-rooms"),
    ...WALLS_FROM_ROOMS_PLANS.map(([name, src]) => ({ name: `plans:${name}`, src })),
    ...INLINE_ROWS,
  ];
}
