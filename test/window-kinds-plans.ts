/**
 * The rows of the window-kinds byte-identity law (issue #369) beyond the corpus, importable without
 * vitest, so the baseline was measured against an older `src/` by this very list.
 *
 * Each is a plan that writes neither form, on an edge the forms fork from: the kind words as the
 * names they have always been, a plain window on every path `window.resolve` takes, and every older
 * door kind, whose panels share `bypass` with the new one and whose rows the schedule and the legend
 * keep. The two refusals are the ones a kind word sits next to, and their wording must not move.
 */

import type { LawRow } from "./rectilinear-rooms-law.js";

const plan = (head: string, body: string): string => `plan "W" {\n  units mm\n${head}${body}\n}\n`;
const SHELL = `  wall id=w exterior thickness 300 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=p partition thickness 100 { (4000,0) (4000,5000) }
  room id=a at (0,0) size 4000x5000 label "Living" uses living
  room id=b at (4000,0) size 4000x5000 label "Study" uses office
`;

export const WINDOW_INLINE_ROWS: readonly LawRow[] = [
  {
    name: "inline:window-words-as-names",
    src: plan(
      "",
      `  let fixed = 1200
  let tilt = 1500
  room id=casement at (0,0) size 6000x4000 uses living
  wall id=sliding exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  furniture tilt_turn at (1000,1000) size fixed x fixed
  window on sliding at tilt width fixed
  door on sliding at tilt + 3000 width 900 swing inward
`,
    ),
  },
  {
    name: "inline:window-every-path",
    src: plan(
      "  schedule openings\n  legend\n",
      `  room id=a at (0,0) size 5000x4000 label "Living" uses living
  room id=b right-of a size 3000x4000 label "Study" uses office
  walls from rooms exterior 300 partition 100
  door on a.left at center width 1000 swing inward
  door between a and b at center width 900
  window on a.top at 1500 from start width 1500
  window on a.top at 3800 from start width 1200 sill 900 head 2100
  window on b.right width 1200 sill 0
  window at (6500,0) width 900 wall exterior
`,
    ),
  },
  {
    name: "inline:window-placed-and-curved",
    src: plan(
      "",
      `  component c() {
    wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r at (0,0) size 4000x3000 uses bedroom
    window on w at 2000 width 1200
    door on w at 9000 width 900
  }
  wall id=a exterior thickness 200 { (0,4000) arc (8000,4000) radius 6000 }
  window on a at 50% width 1200
  place c() as p at (0,0)
  place c() as q at (9000,3000) rotate 90 mirror x
`,
    ),
  },
  {
    name: "inline:door-every-older-kind",
    src: plan(
      "  schedule openings\n  legend\n",
      `${SHELL}  door on w at 1000 width 1000 swing into a
  door id=s sliding on p at 25% width 1400 slide right open 0.25
  door id=k pocket on p at 75% width 900 slide left open 0.4
  door id=c barn on w at 6000 width 1100 swing out slide left
  door id=f bifold on w at 15000 width 1500 swing in slide right
  door id=g garage on w at 20000 width 2400
  door id=h double on w at 12000 width 1800 swing inward
`,
    ),
  },
  {
    // A mirrored `sliding` door is the one reader of `bypass`'s track product a plain plan has.
    name: "inline:door-sliding-mirrored",
    src: plan(
      "",
      `  component c() {
    wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    room id=r at (0,0) size 6000x4000 uses living
    door sliding on w at 2000 width 1600 slide right open 0.25
  }
  place c() as p at (0,0)
  place c() as q at (13000,0) mirror x
`,
    ),
  },
  {
    // `W_BALCONY_NO_DOOR`'s two old wordings, and the plain window that serves it.
    name: "inline:balcony-windows",
    src: plan(
      "",
      `  room id=a at (0,0) size 6000x4000 uses living
  room id=b right-of a size 6000x4000 uses bedroom
  walls from rooms exterior 300 partition 100
  door on a.left at center width 1000 swing inward
  door between a and b at center width 900
  window id=low on a.bottom at center width 2000 sill 900
  window on a.bottom at 800 from start width 900 sill 1200
  window on b.bottom at center width 2000
  outdoor balcony id=one at (1000,4300) size 4000x1500
  outdoor balcony id=two at (7000,4300) size 4000x1500
`,
    ),
  },
  {
    name: "inline:door-narrow-and-double",
    src: plan(
      "",
      `${SHELL}  door on w at 1000 width 650 swing into a
  door double on p at 25% width 1200
  door sliding on p at 75% width 650
`,
    ),
  },
  {
    name: "inline:window-refusals",
    src: plan("", `${SHELL}  window at (2000,0) width 0\n  window at (20000,9000) width 900\n`),
  },
  {
    // The parse refusal a kind word sits next to, on a word that is no kind.
    name: "inline:window-parse-refusal",
    src: plan("", `${SHELL}  window louvre on w at 2000 width 900\n`),
  },
];
