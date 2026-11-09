/**
 * The relational-opening plans pinned by `test/openings-between-digests.test.ts` (ADR 0028 §5;
 * card PS3.4): every placement form, the hosted datum offsets, a component under all eight
 * frames, both widths of the widening drill, and one plan per refusal family.
 */

const plan = (name: string, body: string, grid = 50): string =>
  `plan "${name}" {\n  units mm\n  grid ${grid}\n${body}\n}\n`;

const ROOMS =
  '  room id=a at (0,0) size 4000x5000 label "Living" uses living\n  room id=b at (4000,0) size 4000x5000 label "Bed" uses bedroom\n';
const WALLS = "  walls from rooms exterior 200 partition 100\n";

const component = (body: string): string =>
  `plan "frames" {\n  units mm\n  grid 50\n  component unit() {\n    room id=a at (0,0) size 4000x5000 uses living\n    room id=b at (4000,0) size 4000x5000 uses bedroom\n    walls from rooms exterior 200 partition 100\n${body}\n  }\n` +
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
    `  room id=a at (0,0) size ${aw}x5000 label "Living"\n  room id=b right-of a align top gap 0 size 4000x5000 label "Bed"\n${WALLS}` +
      `  door id=front on a.bottom at 1000 from start width 900 hinge left swing in\n  door id=d between a and b at 800 from end width 800 hinge left swing into b\n  window id=w on b.top width 1500`,
  );

export const OPENINGS_BETWEEN_PLANS: ReadonlyArray<readonly [string, string]> = [
  [
    "relational-forms",
    plan(
      "forms",
      `  axes {\n    x at 2000\n    y at 1000\n  }\n${ROOMS}${WALLS}` +
        `  door id=front on a.bottom at 1000 from start width 900 hinge left swing in\n` +
        `  door id=d between a and b at 800 from end width 800 hinge left swing into b\n` +
        `  opening id=o between b and a at 1500 from a.top width 900\n` +
        `  window id=w1 on b.top width 1500\n  window id=w2 on a.top at axis 1 width 1200\n` +
        `  window id=w3 on b.right at 1200 from b.top width 1200 sill 600\n  door id=d2 on a.left at center width 900`,
    ),
  ],
  [
    "hosted-datums",
    plan(
      "hosted",
      `  axes {\n    y at 4000\n  }\n${ROOMS}  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
        `  wall id=w1 partition thickness 100 { (4000,0) (4000,5000) }\n` +
        `  door id=d1 on w1 at 800 from end width 800\n  door id=d2 on w1 at 1200 from a.top width 800\n  opening id=o on w1 at axis A width 900`,
    ),
  ],
  [
    "frames",
    component(
      "    door id=d between a and b at 800 from end width 800 hinge left swing into b\n    window id=w on b.top at 1000 from b.left width 1200",
    ),
  ],
  ["widen-4000", widen(4000)],
  ["widen-4500", widen(4500)],
  [
    "refused",
    plan(
      "refused",
      `${ROOMS}  room id=c at (8000,0) size 2000x5000\n  wall id=half partition thickness 100 { (8000,0) (8000,2500) }\n` +
        `  walls from rooms exterior 200 partition 100 { open between a and b width 900 }\n` +
        `  door id=d1 between a and b at 800 from end width 800\n  door id=d2 between a and c at center width 800\n` +
        `  door id=d3 between b and c at 600 from end width 800\n  door id=d4 on a.bottom width 900\n` +
        `  door id=d5 on a.bottom at 400 from start width 900\n  window id=w on a.right width 900\n  door id=d6 on a.bottom at 300 from a.top width 900`,
    ),
  ],
];
