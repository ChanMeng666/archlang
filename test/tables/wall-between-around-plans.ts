/**
 * The pairwise-wall plans pinned by `test/wall-between-around-digests.test.ts` (ADR 0028 §4;
 * card PS3.3): both forms with what they host, the forms beside `walls from rooms`, a
 * component under all eight frames, both widths of the widening drill, and one plan per
 * refusal family.
 */

const plan = (name: string, body: string, grid = 50): string =>
  `plan "${name}" {\n  units mm\n  grid ${grid}\n${body}\n}\n`;

const ROOMS =
  '  room id=a at (0,0) size 4000x3000 label "A" uses living\n  room id=b at (4000,0) size 3000x3000 label "B" uses bedroom\n  room id=c at (0,3000) size 7000x2000 label "C" uses kitchen\n';
const WALLS =
  "  wall id=e exterior thickness 200 material brick height 2800 around [a b c]\n  wall id=p partition thickness 100 between a and b\n  wall id=q partition thickness 100 between c and a\n  wall id=r partition thickness 100 height 2400 between b and c\n";
const HOSTED =
  "  door id=front on c.bottom at 1000 from start width 900 hinge left swing in\n  door id=d between a and b at 800 from end width 800 hinge left swing into b\n  door id=k on q at 50% width 800\n  window id=w1 on a.top width 1500\n  window id=w2 on b.top at 1000 from b.left width 1200\n";

const component = (): string =>
  `plan "frames" {\n  units mm\n  grid 50\n  component unit() {\n${ROOMS.replace(/^ {2}/gm, "    ")}${WALLS.replace(/^ {2}/gm, "    ")}${HOSTED.replace(/^ {2}/gm, "    ")}  }\n` +
  [0, 90, 180, 270]
    .flatMap((r, i) => [
      `  place unit() as r${r} at (${i * 20000},0) rotate ${r}\n`,
      `  place unit() as m${r} at (${i * 20000},20000) rotate ${r} mirror x\n`,
    ])
    .join("") +
  "}\n";

const widen = (aw: number): string =>
  plan(
    "widen",
    `  room id=a at (0,0) size ${aw}x5000 label "Living"\n  room id=b right-of a align top gap 0 size 4000x5000 label "Bed"\n` +
      "  wall id=e exterior thickness 200 around [a b]\n  wall id=p partition thickness 100 between a and b\n" +
      "  door id=front on a.bottom at 1000 from start width 900 hinge left swing in\n  door id=d between a and b at 800 from end width 800 hinge left swing into b\n  window id=w on b.top width 1500",
  );

export const WALL_BETWEEN_AROUND_PLANS: ReadonlyArray<readonly [string, string]> = [
  // `on e at … from end` walks the ring from its end, so this row also pins where the ring
  // starts and which way it runs (§3): a wrong start moves the window.
  ["pairwise-forms", plan("forms", `${ROOMS}${WALLS}${HOSTED}  window id=w3 on e at 1500 from end width 1000\n`)],
  [
    "beside-walls-from-rooms",
    plan(
      "beside",
      `${ROOMS}  walls from rooms exterior 200 partition 100\n  wall id=shell exterior thickness 300 around [a b c]\n  wall id=p partition thickness 150 material brick between a and b\n${HOSTED.replace("door id=k on q at 50%", "door id=k between c and a at center")}`,
    ),
  ],
  ["frames", component()],
  ["widen-4000", widen(4000)],
  ["widen-4500", widen(4500)],
  [
    "refused",
    plan(
      "refused",
      `${ROOMS}  room id=o at (3000,0) size 2000x1000 label "O"\n  room id=z at (9000,0) size 1000x1000 label "Z"\n  room id=s at (7000,2950) size 2000x2000 label "S"\n  room id=L polygon (12000,0) (14000,0) (14000,2000) (12000,2000) label "L"\n` +
        "  wall partition thickness 100 between a and o\n  wall partition thickness 100 between a and z\n  wall partition thickness 100 between b and L\n  wall partition thickness 100 between b and s\n  wall exterior thickness 200 around [a z]\n  wall partition thickness 100 between a and nope\n" +
        "  walls from rooms exterior 200 partition 100 { except o z s L open between a and b }\n  wall partition thickness 100 between a and b",
    ),
  ],
];
