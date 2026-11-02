/**
 * The rows the shared grid's byte-identity law pins beside the corpus (issue #345): a plan on each
 * path the form forks from, that does not write it.
 */

import type { LawRow } from "./rectilinear-rooms-law.js";

export const GRID_FIXTURE = "test/fixtures/shared-grid/shared-grid.arch";

const plan = (...lines: string[]): string => `plan "t" {\n  units mm\n${lines.join("\n")}\n}\n`;
const AXES = `  axes { x at 0, 6000, 12000 y at 0, 5000 }`;
const WALL = `  wall id=g partition thickness 200 { (6000,0) (6000,5000) }`;
const COLUMN = `  column id=c at (5800,4800) size 400x400`;

export const GRID_INLINE_ROWS: readonly LawRow[] = [
  {
    // The word in every place it has been a name: a `let`, a room, an instance, its edge datums.
    name: "inline:grid-the-word-as-a-name",
    src: plan(
      `  let axis = 3000`,
      `  room id=r at (0,0) size axis x axis`,
      `  component c() { room id=top at (0,0) size 1000x1000 }`,
      `  place c() as axisy at (4000, 0)`,
      `  wall id=w partition thickness 100 { (axis, 0) (axis, axis + 1) }`,
    ),
  },
  {
    name: "inline:grid-a-room-named-axis",
    src: plan(
      `  room id=axis at (500,500) size 3000x3000`,
      `  wall id=w partition thickness 100 { (axis.left, axis.top) (axis.right, axis.top) }`,
      `  column id=c at (axis.right, axis.cy) size 400x400`,
    ),
  },
  {
    // `at axis width 900`: a binding, and the datum word beside it, read as they always were.
    name: "inline:grid-at-axis-the-binding",
    src: plan(
      `  let axis = 1500`,
      `  wall id=w exterior thickness 200 { (0,0) (4000,0) }`,
      `  door id=d on w at axis width 900`,
    ),
  },
  {
    name: "inline:grid-at-axis-the-datum",
    src: plan(AXES, `  wall id=w exterior thickness 200 { (0,0) (12000,0) }`, `  door id=d on w at axis 2 width 900`),
  },
  {
    name: "inline:grid-at-axis-unknown",
    src: plan(AXES, `  wall id=w exterior thickness 200 { (0,0) (12000,0) }`, `  door id=d on w at axis 9 width 900`),
  },
  {
    // Every keep the column's path forks from: a wall, a wall segment, off the axis, a column
    // refused by every other form, a room, and a label the plan does not have.
    name: "inline:grid-keep-on-a-wall",
    src: plan(
      AXES,
      WALL,
      `  wall id=l partition thickness 100 { (6100,0) (6100,2000) (8000,2000) }`,
      `  keep on axis 2 g`,
      `  keep on axis 2 l segment 0`,
      `  keep on axis B l segment 1 soft`,
    ),
  },
  { name: "inline:grid-keep-a-column-aligned", src: plan(AXES, COLUMN, `  keep align axis 2 c`) },
  { name: "inline:grid-keep-a-column-fixed", src: plan(AXES, COLUMN, `  keep fixed c at 5800`) },
  {
    name: "inline:grid-keep-a-room",
    src: plan(AXES, `  room id=r at (0,0) size 3000x3000`, `  keep on axis 2 r`),
  },
  { name: "inline:grid-keep-unknown-label", src: plan(AXES, WALL, `  keep on axis Q g`) },
  {
    // One block on two storeys, read by a plan-level `let`, and two storey `let`s of one value.
    name: "inline:grid-two-storeys",
    src: plan(
      `  let BAY = 6000`,
      `  axes { x at 0, BAY, 2 * BAY }`,
      `  level 1 {\n${WALL}\n    keep on axis 2 g\n  }`,
      `  level 2 {\n${WALL}\n    keep on axis 2 g\n  }`,
    ),
  },
  {
    name: "inline:grid-two-storeys-one-value",
    src: plan(
      `  axes { x at 0, BAY }`,
      `  level 1 {\n    let BAY = 6000\n${WALL}\n  }`,
      `  level 2 {\n    let BAY = 6000\n${WALL}\n  }`,
    ),
  },
  {
    name: "inline:grid-a-placed-wall",
    src: plan(
      `  let BAY = 6000`,
      `  axes { x at 0, BAY y at 0, 5000 }`,
      `  component c() { wall id=s partition thickness 200 { (0,0) (5000,0) } }`,
      `  place c() as q at (BAY, 0) rotate 90`,
      `  keep on axis 2 q.s`,
    ),
  },
  {
    // A room's datums read in the room pass and at expansion: the reader the axis read shares.
    name: "inline:grid-a-datum-too-early",
    src: plan(`  room id=a at (0,0) size 3000x3000`, `  room id=b at (a.right, 0) size 3000x3000`, `  let x = a.top`),
  },
  {
    name: "inline:grid-a-datum-in-a-function",
    src: plan(`  room id=a at (0,0) size 3000x3000`, `  let f(d) = a.top + d`, `  column at (f(0), 0) size 400x400`),
  },
];
