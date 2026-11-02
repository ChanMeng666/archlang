/**
 * The plans of the `hidden`, `mirror` and `floor` tests, importable without vitest, so the baseline of
 * the byte law was measured against an older `src/` by this very list.
 *
 * {@link GAPS_INLINE_ROWS} use none of the three forms, on the edges they fork from: each word as the
 * names it has always been, on the line after the statement it could now trail, and near misses whose
 * refusals must keep their words. A row that writes the form is not a row: the law's premise test says so.
 */

import type { LawRow } from "./rectilinear-rooms-law.js";

const plan = (body: string): string => `plan "T" {\n  units mm\n${body}\n}\n`;
const SHELL = `  wall id=s exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=a at (0,0) size 6000x4000 label "Hall" uses hall
  door id=d at (3000,4000) width 900 wall s
`;

export const GAPS_INLINE_ROWS: readonly LawRow[] = [
  {
    name: "inline:hidden-word-as-names",
    src: plan(`  let hidden = 3000\n${SHELL}  room id=hidden at (6000,0) size hidden x 2000 label "hidden"`),
  },
  {
    // A statement that starts with the word stays a statement, on the next line and on the same one.
    name: "inline:hidden-on-the-next-line",
    src: plan(
      `  component hidden() {\n    room id=x at (7000,0) size 1000x1000\n  }\n  let n = 1\n  north up\n  hidden()\n  scale 1:50\n  hidden()\n${SHELL}`,
    ),
  },
  {
    name: "inline:hidden-reassigned",
    src: plan(`  let hidden = 1\n  north 45\n  hidden = 2\n  scale 1:50 hidden = 3\n${SHELL}`),
  },
  ...["north hide", "north none", "scale 1:50 hide", "scale none", "title hide", "title none"].map((line, i) => ({
    name: `inline:hidden-near-miss-${i}`,
    src: plan(`${SHELL}  ${line}`),
  })),
  {
    name: "inline:mirror-word-as-names",
    src: plan(
      `  let mirror = 900\n${SHELL}  furniture id=m1 mirror at (500,500) size mirror x 50 label "mirror"\n  room id=mirror at (6000,0) size 2000x2000`,
    ),
  },
  {
    name: "inline:mirror-on-the-next-line",
    src: plan(
      `  let mirror = 1\n  component flip() {\n    room id=x at (7000,0) size 1000x1000\n  }\n${SHELL}  furniture sofa_l at (500,500) size 2600x1600\n  mirror = 2\n  furniture desk at (3500,500) size 1400x700 rotate 90 mirror = 3`,
    ),
  },
  {
    name: "inline:mirror-macro",
    src: plan(
      `  component mirror() {\n    room id=x at (7000,0) size 1000x1000\n  }\n${SHELL}  furniture sofa_l at (500,500) size 2600x1600\n  mirror()`,
    ),
  },
  {
    // The one reflection there was: a placed handed piece, whose bit the statement now shares.
    name: "inline:mirror-place",
    src: plan(
      `  component c() {\n    wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }\n    room id=r at (0,0) size 4000x4000 label "R"\n    furniture sofa_l at (700,1200) size 2600x1600 in r\n    furniture table at (100,100) size 800x800 in r\n    door id=d at (2000,4000) width 900 wall w hinge left swing in\n  }\n  place c() as a at (0,0)\n  place c() as b at (9000,0) mirror x\n  place c() as e at (0,9000) mirror y\n  place c() as f at (9000,9000) rotate 90 mirror x`,
    ),
  },
  {
    name: "inline:floor-word-as-names",
    src: plan(
      `  let floor = 3000\n${SHELL}  room id=floor at (6000,0) size floor x 2000 label "floor" uses storage\n  furniture table at (500,500) size floor x 800 label "floor"`,
    ),
  },
  {
    name: "inline:floor-builtin",
    src: plan(`${SHELL}  room id=b at (6000,0) size floor(2500.5) x floor(1999.9) label "B"`),
  },
  {
    name: "inline:floor-on-the-next-line",
    src: plan(
      `  let floor = 1\n  component flat() {\n    room id=x at (7000,0) size 1000x1000\n  }\n${SHELL}  room id=b at (6000,0) size 1000x1000\n  floor = 2\n  room id=c at (6000,1000) size 1000x1000 label "C" uses storage floor = 3`,
    ),
  },
  {
    name: "inline:floor-macro",
    src: plan(
      `  component floor() {\n    room id=x at (7000,0) size 1000x1000\n  }\n${SHELL}  room id=b at (6000,0) size 1000x1000 uses storage\n  floor()\n  room id=c at (6000,1000) size 1000x1000\n  floor()`,
    ),
  },
  {
    // Every hatch a floor shares a list with: a legend row and a `<pattern>` per material, on a sheet.
    name: "inline:hatch-list",
    src: plan(
      `  paper A3\n  legend\n  wall id=s exterior thickness 200 material tile { (0,0) (6000,0) (6000,4000) (0,4000) close }\n  wall id=p partition thickness 100 material concrete scale 1.5 { (3000,0) (3000,4000) }\n  room id=a at (0,0) size 3000x4000 label "A"\n  room id=b at (3000,0) size 3000x4000 label "B"\n  outdoor paving at (0,4500) size 3000x1000\n  outdoor deck at (3000,4500) size 3000x1000`,
    ),
  },
  {
    // Rooms that overlap beyond the grid: the snap has nothing to do with it, so no hint joins it.
    name: "inline:overlap-past-the-grid",
    src: plan(
      `  grid 100\n  room id=a at (0,0) size 3000x3000 uses living\n  room id=b at (2000,0) size 3000x3000 uses bedroom`,
    ),
  },
  {
    name: "inline:overlap-no-grid",
    src: plan(`  room id=a at (0,0) size 3000x3000 uses living\n  room id=b at (2995,0) size 3000x3000 uses bedroom`),
  },
];
