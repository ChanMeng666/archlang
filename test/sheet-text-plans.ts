/**
 * The plans of the `sheet text` tests, importable without vitest, so the baseline of the byte law was
 * measured against an older `src/` by this very list.
 *
 * {@link SHEET_INLINE_ROWS} write no `sheet text`, on the edges the form forks from: the word `sheet` as
 * the names it has always been, every drawn table, a fractional number at each site that prints one, and
 * the near misses of the block, whose refusals must keep their words.
 */

import type { LawRow } from "./rectilinear-rooms-law.js";

const plan = (body: string): string => `plan "T" {\n  units mm\n${body}\n}\n`;
const SHELL = `  wall id=s exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=a at (0,0) size 6000x4000 label "Hall" uses hall
  door id=d at (3000,4000) width 900 wall s
`;

/**
 * A plan that draws every fixed word of the sheet and a number at every site that prints one, on two
 * storeys. `head` goes in the plan's settings: the `sheet text` under test, or nothing.
 */
export const everyWord = (head: string): string => `plan "Every word" {
  units mm
  dims auto all
  scale 1:12.5
${head}
  title { project "P" drawn_by "D" date "2026-11-02" number "A-1.5" revision "R" }
  schedule rooms net
  schedule openings
  legend
  notes "Stand 1.5" "Plan 2.5 of 3.5"
  level 1 "Ground" {
    wall id=sh exterior thickness 300.5 material brick scale 1.5 angle 22.5 { (0,0) (9000.5,0) (9000.5,6000) (0,6000) close }
    wall id=pa partition thickness 100 { (4000.5,0) (4000.5,6000) }
    wall id=go partition thickness 100 status demolish { (0,3000) (4000.5,3000) }
    zone z "Wing" {
      room id=a at (0,0) size 4000.5x6000 label "Living"
    }
    room id=b at (4000.5,0) size 5000x6000 label "Bed 1.5"
    door id=d1 at (2000,6000) width 900.5 wall exterior hinge left swing in
    door id=d2 at (4000.5,1500) width 800 wall partition hinge right swing in
    door id=d3 at (6000,6000) width 900 wall exterior hinge right swing out
    window casement at (0,1500) width 1200 wall exterior
    window at (9000.5,1500) width 1200 wall exterior
    furniture sofa at (500,500) size 2000x800
    stair id=s at (7000,500) size 1000x2400 dir up
    escalator id=e at (5000,3500) size 1000x2000 dir down
    outdoor lawn at (0,6500) size 3000.5x1200 label "Lawn"
    dim (0,-800)->(1000.5,-800) offset 0
    dim (2000,-800)->(3000,-800) offset 0 text "1.5 m"
  }
  level 2 "Upper" {
    wall id=up exterior thickness 200 { (0,0) (9000.5,0) (9000.5,6000) (0,6000) close }
    room id=c at (0,0) size 9000.5x6000 label "Upper"
    stair id=s at (7000,500) size 1000x2400 dir down
  }
}
`;

export const SHEET_INLINE_ROWS: readonly LawRow[] = [
  {
    name: "inline:sheet-word-as-names",
    src: plan(
      `  let sheet = 3000
  component text() {
    room id=x at (0,0) size 1000x1000
  }
${SHELL}  room id=sheet at (6000,0) size sheet x 2000
  furniture table at (500,500) size sheet x 800 label "sheet text"
  text()`,
    ),
  },
  {
    name: "inline:sheet-macro",
    src: plan(`  component sheet() {\n    room id=x at (0,0) size 1000x1000\n  }\n${SHELL}  sheet()`),
  },
  {
    name: "inline:every-table",
    src: everyWord(""),
  },
  {
    name: "inline:fractional-sites",
    src: plan(
      `  dims auto all
  paper A3
  schedule rooms net
  wall id=s exterior thickness 150.5 { (0,0) (5000.25,0) (5000.25,4000.75) (0,4000.75) close }
  room id=a at (0,0) size 2500.25x4000.75 label "A"
  room id=b at (2500.25,0) size 2500x4000.75 label "B"
  wall id=p partition thickness 100.5 { (2500.25,0) (2500.25,4000.75) }`,
    ),
  },
  {
    name: "inline:curve-call-outs",
    src: plan(
      `  dims auto all
  wall id=s exterior thickness 200 { (0,0) (6000,0) arc (6000,3000) radius 1500.5 cw (0,3000) close }
  room id=d circle at (3000,1500) radius 750.5 label "Round"`,
    ),
  },
  // The block's near misses: every one was a parse error, and each keeps its words. The block itself
  // inside a `level` is no near miss: it writes the form, and its refusal is `test/sheet-text.test.ts`'s.
  ...["sheet", "sheet text", 'sheet text "x"', 'sheet words { total "T" }', 'sheet "text" { total "T" }'].map(
    (line, i) => ({
      name: `inline:sheet-near-miss-${i}`,
      src: plan(`${SHELL}  ${line}`),
    }),
  ),
  ...['sheet text "x"', 'sheet words { total "T" }', 'sheet "text" { total "T" }'].map((line, i) => ({
    name: `inline:sheet-near-miss-in-a-level-${i}`,
    src: plan(`  level 1 {\n${SHELL}  ${line}\n  }`),
  })),
];
