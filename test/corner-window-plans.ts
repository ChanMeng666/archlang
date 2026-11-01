/**
 * Plans for the corner window and for the position on an open boundary (issue #401): the
 * builders the suites share, and the rows the byte-identity law pins beside the corpus.
 */

import type { LawRow } from "./rectilinear-rooms-law.js";

export const CORNER_FIXTURE = "test/fixtures/corner-window/corner-window.arch";

const HEAD = `  units mm\n  grid 50`;
export const plan = (...lines: string[]): string => `plan "t" {\n${HEAD}\n${lines.join("\n")}\n}\n`;

/** A room with a ring of 200 mm walls derived from it, which is what most of the cases stand on. */
export const ROOM = `  room id=a at (0,0) size 6000x5000 label "Living" uses living`;
export const DERIVED = `  walls from rooms exterior 200 partition 100`;
export const RING = `  wall id=x exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }`;
export const DOOR = `  door id=d on a.left at 2500 from start width 900 swing into a`;
export const LEG_N = `  window id=n on a.top at corner a.right width 1800`;
export const LEG_E = `  window id=e on a.right at corner a.top width 1200`;
export const CORNER = plan(ROOM, DERIVED, DOOR, LEG_N, LEG_E);

/** The two walls at the corner as separate walls of different thickness: 300 across the top. */
export const UNEVEN = `  wall id=t exterior thickness 300 { (0,0) (6000,0) }
  wall id=r exterior thickness 200 { (6000,0) (6000,5000) }
  wall id=q exterior thickness 200 { (6000,5000) (0,5000) (0,0) }`;

/** The same two windows on the same span, written by `at (x,y)`: ordinary windows, whose spans
 *  run to the outer corner. What the form changes against this is only what it says it does. */
export const ABSOLUTE = plan(
  ROOM,
  RING,
  `  door id=d at (0,2500) width 900 wall x swing inward`,
  `  window id=n at (5200,0) width 1800 wall x`,
  `  window id=e at (6000,500) width 1200 wall x`,
);

/** The two windows where #401 found them: written absolutely, stopping on the centrelines. */
export const SHORT_OF_THE_CORNER = plan(
  ROOM,
  RING,
  `  door id=d at (0,2500) width 900 wall x swing inward`,
  `  window id=n at (5100,0) width 1800 wall x`,
  `  window id=e at (6000,600) width 1200 wall x`,
);

/** A body for `witnessViolations`: a corner of each kind, so the frame carries both. */
export const CORNER_BODY = `    room id=a at (0,0) size 6000x5000 label "Living" uses living
    room id=b right-of a size 3000x5000 label "Study" uses office
    walls from rooms exterior 200 partition 100
    door id=d between a and b at 1500 from a.top width 800 swing into b
    door id=f on a.left at 2500 from start width 900 swing into a
    window id=n on a.top at corner a.left width 1800
    window id=w on a.left at corner a.top width 1200
    window id=p on b.bottom at corner b.right width 1500
    window id=q on b.right at corner b.bottom width 1000`;

/** The same corner on walls of two thicknesses: the mitre is not at 45 degrees. */
export const UNEVEN_BODY = `    room id=a at (0,0) size 6000x5000 label "Living" uses living
    wall id=t exterior thickness 300 { (0,0) (6000,0) }
    wall id=r exterior thickness 200 { (6000,0) (6000,5000) }
    wall id=q exterior thickness 200 { (6000,5000) (0,5000) (0,0) }
    door id=f on a.left at 2500 from start width 900 swing into a
    window id=n on a.top at corner a.right width 1800
    window id=e on a.right at corner a.top width 1200`;

/**
 * The law's own rows: each stands on a path the two forms fork from, and none writes them. Every
 * name here is a near miss: the word `corner` as a binding and a room, a window at the junction and
 * one clear of it, the openings `open between` is measured against.
 */
export const CORNER_INLINE_ROWS: readonly LawRow[] = [
  {
    name: "inline:windows-on-edges",
    src: plan(
      ROOM,
      DERIVED,
      DOOR,
      `  window id=m on a.top at 900 from a.right width 1000`,
      `  window id=o on a.right at 900 from a.top width 1000 sill 300 head 2400`,
      `  window on a.bottom width 1500`,
    ),
  },
  {
    name: "inline:windows-at-the-junction",
    src: SHORT_OF_THE_CORNER,
  },
  {
    name: "inline:windows-past-the-junction",
    src: ABSOLUTE,
  },
  {
    name: "inline:the-word-corner",
    src: plan(
      `  let corner = 1500`,
      `  room id=corner at (0,0) size 3000x3000 label "Corner" uses office`,
      `  room id=b right-of corner size 3000x3000 label "Next" uses office`,
      `  wall id=x exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }`,
      `  wall id=y partition thickness 100 { (3000,0) (3000,3000) }`,
      `  door on x at corner + 12000 width 900`,
      `  window id=w on x at corner width 900`,
      `  opening on y at corner width 900`,
    ),
  },
  {
    name: "inline:open-whole-and-narrow",
    src: plan(
      ROOM,
      `  room id=b right-of a size 3000x5000 label "Kitchen" uses kitchen`,
      `  room id=c below a size 9000x3000 label "Hall" uses hall`,
      `  walls from rooms exterior 200 partition 100 {`,
      `    open id=o between a and b`,
      `    open between a and c width 2000`,
      `  }`,
      `  door id=d on c.left at 1500 from start width 900 swing into c`,
    ),
  },
  {
    name: "inline:opening-between",
    src: plan(
      ROOM,
      `  room id=b right-of a size 3000x5000 label "Kitchen" uses kitchen`,
      DERIVED,
      DOOR,
      `  opening id=o between a and b at 1500 from start width 2000`,
      `  opening id=p between a and b at 1000 from end width 900`,
    ),
  },
  {
    name: "inline:windows-through-a-frame",
    src: `plan "t" {
${HEAD}
  component c() {
    room id=a at (0,0) size 4000x3000 uses office
    walls from rooms exterior 200 partition 100
    door id=d on a.left at 1500 from start width 900 swing into a
    window id=n on a.top at 900 from a.right width 1000
    window id=e on a.right width 1000
  }
  place c() as p at (0,0)
  place c() as q at (9000,0) rotate 90 mirror x
}
`,
  },
];
