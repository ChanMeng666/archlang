/**
 * Plans for openings drawn on a curved wall (card ARC-W1): the straight-host rows the byte-identity
 * law pins, importable without vitest so their baseline was measured against `main`'s `src/` by this
 * very list, and the curved plans the geometry laws draw.
 *
 * Every straight row stands an opening on a path the curved drawing forks from: each window kind
 * with and without a sill, a hinge either way, an oblique wall, a corner window, a hinged door, a
 * double door, a cased opening, and a window, door and opening on the STRAIGHT runs of a wall that
 * also has an arc, so the fork is taken per segment and never per wall.
 */

import type { LawRow } from "../helpers/rectilinear-rooms-law.js";

const plan = (...lines: string[]): string => `plan "t" {\n  units mm\n  grid 50\n${lines.join("\n")}\n}\n`;

const BOX = `  wall id=w exterior thickness 250 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  wall id=p partition thickness 100 { (4000,0) (4000,6000) }
  room id=a at (0,0) size 4000x6000 label "Living" uses living
  room id=b at (4000,0) size 4000x6000 label "Study" uses office`;

export const STRAIGHT_ROWS: readonly LawRow[] = [
  {
    name: "inline:every-window-kind-straight",
    src: plan(
      BOX,
      `  window id=w0 on w at 1000 width 1200
  window id=w1 casement on w at 3000 width 1400 hinge left
  window id=w2 casement on w at 5500 width 1400
  window id=w3 sliding on w at 9000 width 1600
  window id=w4 tilt_turn on w at 11500 width 1200 hinge right
  window id=w5 tilt on w at 12800 width 1000
  window id=w6 fixed on w at 17000 width 1500
  window id=w7 at (4000,3000) width 900 wall p
  door id=d1 on w at 25000 width 900 swing inward
  door id=d2 double on p at 1500 width 1600
  opening id=o1 on p at 4500 width 1000`,
    ),
  },
  {
    name: "inline:oblique-wall",
    src: plan(
      `  wall id=w exterior thickness 200 { (0,0) (6000,1500) (5000,6000) (0,5000) close }
  room id=a polygon (0,0) (6000,1500) (5000,6000) (0,5000) label "Room" uses living
  window id=w1 on w at 3000 width 1500
  window id=w2 sliding on w at 8000 width 1200
  door id=d1 on w at 12000 width 900 hinge right swing inward
  opening id=o1 on w at 16000 width 800`,
    ),
  },
  {
    name: "inline:corner-window",
    src: plan(
      `  room id=a at (0,0) size 6000x5000 label "Living" uses living
  walls from rooms exterior 200 partition 100
  door id=d on a.left at 2500 from start width 900 swing into a
  window id=n casement on a.top at corner a.right width 1800
  window id=e on a.right at corner a.top width 1200`,
    ),
  },
  {
    name: "inline:straight-runs-of-a-curved-wall",
    src: plan(
      `  wall id=s exterior thickness 250 {
    (0,0) (2400,0) arc (5400,0) radius 1900 cw (8000,0) (8000,6000) (0,6000) close
  }
  room id=a at (0,0) size 8000x6000 label "Living" uses living
  window id=w1 at (1200,0) width 1200 wall s
  window id=w2 casement at (6700,0) width 1000 wall s
  window id=w3 at (8000,3000) width 1600 wall s
  door id=d1 at (4000,6000) width 900 wall s swing inward
  opening id=o1 at (0,3000) width 1000 wall s`,
    ),
  },
];

/** A drum of two semicircles (centre (3000,3000), centreline radius 3000, 250 thick) with a room
 *  inside, so a window's sill has a side; `body` stands openings on it. */
export const drum = (body: string, dir: "" | " cw" = ""): string =>
  plan(
    `  wall id=drum exterior thickness 250 {
    (6000,3000)
    arc (0,3000) radius 3000${dir}
    arc (6000,3000) radius 3000${dir}
  }
  room id=r circle at (3000,3000) radius 3000 label "Drum" uses living`,
    body,
  );

/** The bay of the card's repro (ArchCanvas's bay bungalow): a window across a 1900 mm arc. */
export const BAY = plan(
  `  wall id=shell exterior thickness 250 {
    (0,0) (2400,0) arc (5400,0) radius 1900 cw (8000,0) (8000,6000) (0,6000) close
  }
  room id=a at (0,0) size 8000x6000 label "Living" uses living
  window id=win_bay on shell at 4000 width 1600`,
);
