/**
 * The segment-selector plans (plan card PS3.5): `segment north|south|east|west` and `segment
 * containing <room>.<edge>`, on an authored closed ring, an open polyline, a derived ring and
 * partition, inside a component under all eight frames, and one plan of refusals. Pinned by
 * `test/segment-select-digests.test.ts`; the twins and refusals are in
 * `test/segment-select.test.ts`, which also builds every numeric twin from these sources.
 */

const plan = (name: string, body: string, head = ""): string =>
  `plan "${name}" {\n  units mm\n  grid 50\n${head}${body}\n}\n`;

/** An L-shaped authored ring, clockwise on the page: segment 0 faces north, 1 and 3 east, 2
 *  and 4 south, 5 west. Rooms `r1` (the top bar) and `r2` (the foot). */
export const L_RING =
  "  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) close }\n" +
  "  room id=r1 at (0,0) size 6000x3000 uses living\n  room id=r2 at (0,3000) size 3000x3000 uses bedroom\n";

/** Each selector written in the plans below, and the number it must alias. */
export const RING_PIECES: [string, number][] = [
  ["furniture id=a wardrobe against wall w segment north offset 1500 size 1200x600 in r1", 0],
  ["furniture id=b wardrobe against wall w segment west offset 1500 size 1200x600 in r2", 5],
  ["furniture id=c wardrobe against wall w segment containing r1.right size 1200x600 in r1", 1],
  ["furniture id=d wardrobe against wall w segment containing r2.right size 1200x600 in r2", 3],
  ["furniture id=e wardrobe against wall w segment containing r2.bottom size 1200x600 in r2", 4],
  ["furniture id=f wardrobe against wall w segment containing r1.left offset 4500 size 1200x600 in r1", 5],
];

/** An open authored polyline: compass words are refused there, `containing` decides. */
export const OPEN_PIECES: [string, number][] = [
  ["furniture id=a wardrobe against wall q segment containing r.right size 1200x600 in r", 1],
  ["furniture id=b wardrobe against wall q segment containing r.top offset 1000 size 1200x600 in r", 0],
];
export const OPEN_WALL =
  "  wall id=q exterior thickness 200 { (0,0) (5000,0) (5000,4000) }\n  room id=r at (0,0) size 5000x4000 uses living\n";

/** A derived ring and its one partition, addressed by category as `segment <n>` is today. */
export const DERIVED_ROOMS =
  "  room id=a at (0,0) size 3000x4000 uses living\n  room id=b right-of a align top gap 0 size 3000x4000 uses bedroom\n  walls from rooms exterior 200 partition 100\n";
export const DERIVED_PIECES: [string, number][] = [
  ["furniture id=f wardrobe against wall exterior segment north offset 1500 size 1200x600 in a", 0],
  ["furniture id=g wardrobe against wall exterior segment containing b.right size 1200x600 in b", 1],
  ["furniture id=h wardrobe against wall exterior segment south offset 1500 size 1200x600 in b", 2],
  ["furniture id=i wardrobe against wall exterior segment west size 1200x600 in a", 3],
  ["furniture id=k wardrobe against wall partition segment containing a.right size 1200x600 in a", 0],
];

/** A component holding a closed ring, placed under all eight frames: inside it only
 *  `containing` (local words) is legal. */
export const framed = (piece: string): string =>
  `plan "frames" {\n  units mm\n  grid 50\n  component unit() {\n    wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n    room id=r at (0,0) size 4000x3000 uses bedroom\n    ${piece}\n  }\n` +
  [0, 90, 180, 270]
    .flatMap((r, i) => [
      `  place unit() as r${r} at (${i * 12000},0) rotate ${r}\n`,
      `  place unit() as m${r} at (${i * 12000},12000) rotate ${r} mirror x\n`,
    ])
    .join("") +
  "}\n";
export const FRAMED_PIECE: [string, number] = [
  "furniture id=robe wardrobe against wall w segment containing r.left size 1200x600 in r",
  3,
];

const pieces = (list: [string, number][]): string => list.map(([p]) => `  ${p}`).join("\n");

/** One plan per refusal family; every line refuses (see the test for the codes). */
export const REFUSED_BODY =
  L_RING +
  "  room id=r3 at (1000,1000) size 1000x1000 uses storage\n" +
  "  room id=poly polygon (7000,0) (9000,0) (9000,2000) uses storage\n" +
  "  wall id=q exterior thickness 200 { (7000,4000) (9000,4000) (9000,6000) }\n" +
  "  wall id=arcw exterior thickness 200 { (10000,0) arc (12000,0) radius 1500 }\n" +
  [
    "furniture id=x1 wardrobe against wall w segment east size 1200x600 in r1",
    "furniture id=x2 wardrobe against wall w segment containing r3.top size 1200x600 in r1",
    "furniture id=x3 wardrobe against wall q segment north side right size 1200x600",
    "furniture id=x4 wardrobe against wall w segment containing r1.cx size 1200x600 in r1",
    "furniture id=x5 wardrobe against wall w segment containing nope.top size 1200x600 in r1",
    "furniture id=x6 wardrobe against wall w segment containing poly.top size 1200x600 in r1",
    "dim radius arcw segment north",
  ]
    .map((l) => `  ${l}`)
    .join("\n");

export const SEGMENT_SELECT_PLANS: [string, string][] = [
  ["ring", plan("ring", L_RING + pieces(RING_PIECES))],
  ["open", plan("open", OPEN_WALL + pieces(OPEN_PIECES))],
  ["derived", plan("derived", DERIVED_ROOMS + pieces(DERIVED_PIECES))],
  ["frames", framed(FRAMED_PIECE[0])],
  ["refused", plan("refused", REFUSED_BODY)],
  [
    "compass-refused",
    plan(
      "compass-refused",
      `${L_RING}  furniture id=a wardrobe against wall w segment north size 1200x600 in r1`,
      "  north right\n",
    ),
  ],
];
