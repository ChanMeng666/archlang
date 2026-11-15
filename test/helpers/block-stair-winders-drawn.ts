/**
 * The winders fixtures of the walking-arc law (`block-stair-winders-walking-arc.test.ts`), importable
 * WITHOUT vitest, so the digests taken before the arc was drawn come from handing these very sources
 * to the compiler of an older tree. Every row is a block stair that writes `winders`: the rows the
 * law next door (`block-stair-winders-law.ts`) leaves out by definition.
 */

import {
  type BlockStair,
  CLEAR_L,
  hallBody,
  hallPlan,
  L_STAIR,
  movedBlock,
  THREE_FLIGHTS,
  upperBody,
} from "../tables/block-stair-plans.js";

/** The storey height the "with height" row authors: 15 risers, so 11 goings of 220 mm once the winders' three are
 *  taken off, 2420 mm against 2400 mm of flights, which wakes `W_STAIR_TOO_STEEP`. */
const HEIGHT = "  height 3300\n";

/** The block statement for `s` with `winders[i]` written on its landing `i` (none where absent). */
export function winderStairBlock(
  s: BlockStair,
  winders: readonly (number | undefined)[],
  dir: "up" | "down" = "up",
  id = "s",
  pad = "    ",
): string {
  const lines = s.pieces.map((p, i) => {
    const n = i % 2 === 1 ? winders[(i - 1) / 2] : undefined;
    return `${pad}  ${i % 2 === 0 ? "flight" : "landing"} at (${p[0]},${p[1]}) size ${p[2]}x${p[3]}${n === undefined ? "" : ` winders ${n}`}`;
  });
  return `${pad}stair id=${id} dir ${dir} width ${s.width} {\n${lines.join("\n")}\n${pad}}`;
}

/** {@link L_STAIR} with four winders, drawn at the origin in a `component` and placed with `frame`. */
function placed(frame: string): string {
  const s = movedBlock(L_STAIR, -100, -100);
  return `plan "Block stair" {
  units mm
  component flightc() {
${winderStairBlock(s, [4], "up", "s", "    ")}
  }
${hallBody(`    place flightc() as a at (1000,1000) ${frame}`)}
}
`;
}

/** {@link CLEAR_L} with four winders on two storeys: `dir up` below, the same block `dir down` above. */
const shaft = (): string =>
  `plan "Shaft" {\n  units mm\n  level 1 "G" {\n${hallBody(winderStairBlock(CLEAR_L, [4], "up"))}\n  }\n  level 2 "1" {\n${upperBody(winderStairBlock(CLEAR_L, [4], "down"))}\n  }\n}\n`;

/** `[row name, source]`, in a fixed order. */
export function winderDrawnRows(): [string, string][] {
  const rows: [string, string][] = [];
  for (const n of [2, 3, 4, 6, 8])
    rows.push([`quarter-turn winders ${n} dir up`, hallPlan(winderStairBlock(L_STAIR, [n]))]);
  rows.push(["quarter-turn winders 4 dir down", hallPlan(winderStairBlock(L_STAIR, [4], "down"))]);
  rows.push(["quarter-turn winders 4 dir up, height 3300", hallPlan(winderStairBlock(L_STAIR, [4]), HEIGHT)]);
  for (const dir of ["up", "down"] as const)
    rows.push([`three flights winders 3 and 3 dir ${dir}`, hallPlan(winderStairBlock(THREE_FLIGHTS, [3, 3], dir))]);
  rows.push(["three flights winders 3 then level dir up", hallPlan(winderStairBlock(THREE_FLIGHTS, [3, undefined]))]);
  rows.push(["quarter-turn winders 4 placed mirror x", placed("mirror x")]);
  rows.push(["quarter-turn winders 4 placed rotate 90", placed("rotate 90")]);
  rows.push(["shaft winders 4, up below and down above", shaft()]);
  return rows;
}
