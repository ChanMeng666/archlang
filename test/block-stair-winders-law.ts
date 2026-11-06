/**
 * The rows of the winder byte-identity law (`block-stair-winders-byte-identity.test.ts`), importable
 * WITHOUT vitest, so the baseline can be measured by handing these very sources to the compiler of
 * an older tree. Every row is a block stair with no `winders`, on the path the clause changes: the
 * landing records, `landingGoings`, the glyph's landing loop and `drawCost`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BLOCK_STAIRS, hallBody, L_STAIR, movedBlock, planOf, stairBlock } from "./block-stair-plans.js";

/** The storey height the "with height" rows author: it wakes `W_STAIR_TOO_STEEP`. */
const HEIGHT = "  height 2750\n";

/** {@link L_STAIR} at the origin, drawn in a `component` and placed into the hall with `frame`. */
function placed(frame: string): string {
  const s = movedBlock(L_STAIR, -100, -100);
  return `plan "Block stair" {
  units mm
${HEIGHT}  component flightc() {
${stairBlock(s, "up", "s", "    ")}
  }
${hallBody(`    place flightc() as a at (1000,1000) ${frame}`)}
}
`;
}

/** `[row name, source]`, in a fixed order. `root` is the repository root. */
export function winderLawRows(root: string): [string, string][] {
  const rows: [string, string][] = [
    ["examples/turning-stair.arch", readFileSync(join(root, "examples/turning-stair.arch"), "utf8")],
  ];
  for (const s of BLOCK_STAIRS)
    for (const dir of ["up", "down"] as const)
      for (const [h, head] of [
        ["no height", ""],
        ["height 2750", HEIGHT],
      ] as const)
        rows.push([`${s.name} dir ${dir}, ${h}`, planOf(s, dir, head)]);
  rows.push(["quarter-turn placed mirror x", placed("mirror x")]);
  rows.push(["quarter-turn placed rotate 90", placed("rotate 90")]);
  return rows;
}
