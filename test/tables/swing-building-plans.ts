/**
 * The building-relative swing plans (card PS3.8): `swing inward|outward` on a wall drawn each
 * way, on a closed authored loop, on a derived ring, on a barn door's face, inside a component
 * under all eight `place` frames, and one plan per refusal. Shared by `test/swing-building.test.ts`
 * (twins, frames, refusals) and pinned by `test/swing-building-digests.test.ts`.
 */

export const plan = (name: string, body: string): string => `plan "${name}" {\n  units mm\n  grid 50\n${body}\n}\n`;

/** One room, north/east/west walls, and a SEPARATE south wall drawn in the given direction. */
export const southWall = (from: "west" | "east", door: string): string =>
  plan(
    "K1",
    "  room id=r at (0,0) size 6000x4000 uses living\n" +
      "  wall id=wn exterior thickness 200 { (0,4000) (0,0) (6000,0) (6000,4000) }\n" +
      `  wall id=ws exterior thickness 200 { ${from === "west" ? "(0,4000) (6000,4000)" : "(6000,4000) (0,4000)"} }\n` +
      `  door id=fire on ws at 50% width 900 ${door}`,
  );

/** A closed authored loop, drawn clockwise on the page, with a door on its bottom and its top runs. */
export const loop = (bottom: string, top: string): string =>
  plan(
    "loop",
    "  room id=r at (0,0) size 6000x4000 uses living\n" +
      "  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n" +
      `  door id=d_bottom at (3000,4000) width 900 wall w ${bottom}\n` +
      `  door id=d_top at (2000,0) width 900 wall w ${top}`,
  );

/** A derived ring (`walls from rooms`) with a door on each room's outer edge and a barn door. */
export const ring = (a: string, b: string, barn: string): string =>
  plan(
    "ring",
    '  room id=living at (0,0) size 5000x4000 label "Living" uses living\n' +
      '  room id=bed right-of living size 3600x4000 label "Bedroom" uses bedroom\n' +
      "  walls from rooms exterior 200 partition 100\n" +
      `  door id=front on living.bottom at 1200 from start width 900 ${a}\n` +
      `  door id=side on bed.right at center width 900 ${b}\n` +
      `  door id=store barn on living.top at center width 1000 ${barn} slide left\n` +
      "  door between living and bed at 1000 from start width 800 swing into bed",
  );

/** The eight `place` frames: rotations 0/90/180/270, each plain and mirrored. */
export const FRAMES: { rot: number; mirror: "" | "x" }[] = [0, 90, 180, 270].flatMap((rot) => [
  { rot, mirror: "" as const },
  { rot, mirror: "x" as const },
]);

/** A component holding the K1 wall (south run drawn west to east), placed under the given frames. */
export const framed = (door: string, frames = FRAMES): string =>
  `plan "frames" {\n  units mm\n  grid 50\n  component unit() {\n` +
  "    room id=r at (0,0) size 6000x4000 uses living\n" +
  "    wall id=wn exterior thickness 200 { (0,4000) (0,0) (6000,0) (6000,4000) }\n" +
  "    wall id=ws exterior thickness 200 { (0,4000) (6000,4000) }\n" +
  `    door id=fire on ws at 2000 width 900 ${door}\n` +
  "  }\n" +
  frames
    .map(
      ({ rot, mirror }, i) =>
        `  place unit() as u${i} at (${(i % 4) * 14000},${Math.floor(i / 4) * 14000}) rotate ${rot}${mirror ? ` mirror ${mirror}` : ""}\n`,
    )
    .join("") +
  "}\n";

export const SWING_BUILDING_PLANS: [string, string][] = [
  ["k1-west-to-east", southWall("west", "swing outward")],
  ["k1-east-to-west", southWall("east", "swing outward")],
  ["loop", loop("swing inward", "swing outward")],
  ["ring", ring("swing outward", "swing inward", "swing inward")],
  ["frames", framed("swing outward")],
  [
    "refused",
    plan(
      "refused",
      '  room id=a at (0,0) size 4000x5000 label "A"\n' +
        '  room id=b at (4000,0) size 4000x5000 label "B"\n' +
        "  walls from rooms exterior 200 partition 100\n" +
        "  door id=both between a and b at center width 800 swing inward\n" +
        "  wall id=garden exterior thickness 200 { (12000,0) (12000,5000) }\n" +
        "  door id=none on garden at 50% width 900 swing outward\n" +
        "  door id=kind pocket on a.bottom at center width 900 swing inward slide left",
    ),
  ],
];
