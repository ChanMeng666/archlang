/**
 * The block-stair fixtures (issue #362, card S1): each a stair written as the author writes it,
 * with its geometry repeated as plain numbers so a test can derive what it expects from those
 * numbers, never from what the resolver made of them. `tails` is what a person works out by hand:
 * the edge each flight is entered by when climbing, flight by flight.
 */

export type Side = "top" | "bottom" | "left" | "right";

/** One piece as written: `[x, y, w, h]`. */
export type Rect = readonly [number, number, number, number];

export interface BlockStair {
  name: string;
  width: number;
  /** Flight, landing, flight, … in climbing order. */
  pieces: readonly Rect[];
  /** Hand-derived: the edge each flight is climbed from. */
  tails: readonly Side[];
}

/** The issue's own quarter-turn: a square first flight rising north, then one running west. */
export const L_STAIR: BlockStair = {
  name: "quarter-turn",
  width: 1000,
  pieces: [
    [1500, 1100, 1000, 1000],
    [1500, 100, 1000, 1000],
    [100, 100, 1400, 1000],
  ],
  tails: ["bottom", "right"],
};

/** A half-turn with a 200 mm well: north, across the landing, then south. */
export const U_STAIR: BlockStair = {
  name: "half-turn",
  width: 1000,
  pieces: [
    [500, 2000, 1000, 2000],
    [500, 1000, 2200, 1000],
    [1700, 2000, 1000, 2000],
  ],
  tails: ["bottom", "top"],
};

/** Two flights in line with a mid landing, the shape the steepness advice describes. */
export const STRAIGHT_LANDING: BlockStair = {
  name: "in-line",
  width: 1000,
  pieces: [
    [1000, 3000, 1000, 1400],
    [1000, 2000, 1000, 1000],
    [1000, 600, 1000, 1400],
  ],
  tails: ["bottom", "bottom"],
};

/** A flight whose run is its footprint's SHORT side, wider than `width`: no long-axis rule tells
 *  this one, and the landing beyond it is wider than the flights. */
export const SHORT_AXIS: BlockStair = {
  name: "short-axis",
  width: 1000,
  pieces: [
    [800, 2200, 1400, 840],
    [800, 1200, 2600, 1000],
    [2200, 2200, 1200, 1800],
  ],
  tails: ["bottom", "top"],
};

/** Three flights round a square well, each landing a quarter-turn the same way. */
export const THREE_FLIGHTS: BlockStair = {
  name: "three flights",
  width: 900,
  pieces: [
    [100, 2100, 900, 1800],
    [100, 1200, 900, 900],
    [1000, 1200, 1800, 900],
    [2800, 1200, 900, 900],
    [2800, 2100, 900, 1800],
  ],
  tails: ["bottom", "left", "top"],
};

export const BLOCK_STAIRS: readonly BlockStair[] = [L_STAIR, U_STAIR, STRAIGHT_LANDING, SHORT_AXIS, THREE_FLIGHTS];

/** The block statement for `s`, drawn `dir` on this storey, indented `pad`. */
export function stairBlock(s: BlockStair, dir: "up" | "down" = "up", id = "s", pad = "    "): string {
  const lines = s.pieces.map(
    (p, i) => `${pad}  ${i % 2 === 0 ? "flight" : "landing"} at (${p[0]},${p[1]}) size ${p[2]}x${p[3]}`,
  );
  return `${pad}stair id=${id} dir ${dir} width ${s.width} {\n${lines.join("\n")}\n${pad}}`;
}

/** The body of a walled hall, 6 m square, holding `run`. */
export const hallBody = (
  run: string,
): string => `    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=r at (0,0) size 6000x6000 label "Hall" uses hall
    door id=d at (3000,6000) width 900 wall shell
${run}`;

/** A whole one-storey plan of {@link hallBody}. */
export const hallPlan = (run: string, head = ""): string =>
  `plan "Block stair" {\n  units mm\n${head}${hallBody(run)}\n}\n`;

/** A plan with `s` drawn in the hall. */
export const planOf = (s: BlockStair, dir: "up" | "down" = "up", head = ""): string =>
  hallPlan(stairBlock(s, dir), head);
