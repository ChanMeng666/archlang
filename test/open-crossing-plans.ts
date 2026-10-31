/**
 * The plans of `test/open-crossing.test.ts` (issue #368), in a module of their own so the digests
 * there can be measured by running this file against the tree before the fix.
 */

const BODY = `  units mm
  room id=a at (0,0) size 4000x3000 label "A" uses living
  room id=b at (4000,0) size 3000x3000 label "B" uses dining
  room id=c at (0,3000) size 4000x3000 label "C" uses kitchen
  room id=d at (4000,3000) size 3000x3000 label "D" uses hall
`;

const OPENINGS = `  door on d.right at center width 1000 swing into d
  window on a.top width 1500
`;

const crossing = (lastClause: string, extra = ""): string =>
  `plan "Pier" {\n${BODY}  walls from rooms exterior 300 partition 120 {
    open between a and b
    open between a and c
    open between b and d
    ${lastClause}
  }\n${extra}${OPENINGS}}\n`;

/** The issue's plan, as filed. */
export const FOUR_OPEN = crossing("open between c and d");

/** The same four rooms in a component, placed turned and mirrored. */
export const FOUR_OPEN_PLACED = `plan "Placed" {
  units mm
  grid 50
  component unit() {
    room id=a at (0,0) size 4000x3000 uses living
    room id=b at (4000,0) size 3000x3000 uses dining
    room id=c at (0,3000) size 4000x3000 uses kitchen
    room id=d at (4000,3000) size 3000x3000 uses hall
    walls from rooms exterior 300 partition 120 {
      open between a and b
      open between a and c
      open between b and d
      open between c and d
    }
  }
  place unit() as west at (0,0)
  place unit() as east at (20000,0) rotate 90 mirror x
}
`;

/** The same four rooms placed turned and mirrored, with only three boundaries open. */
export const THREE_OPEN_PLACED = FOUR_OPEN_PLACED.replaceAll("      open between c and d\n", "").replace(
  'plan "Placed"',
  'plan "Placed three"',
);

/** Three rooms at a T, the `A` room down the whole left side, with `doors` beside the rooms. */
const tee = (clauses: readonly string[]): string =>
  `plan "Tee" {
  units mm
  room id=a at (0,0) size 3000x6000 label "A" uses living
  room id=b at (3000,0) size 3000x3000 label "B" uses dining
  room id=c at (3000,3000) size 3000x3000 label "C" uses kitchen
  walls from rooms exterior 300 partition 120 {
${clauses.map((c) => `    ${c}\n`).join("")}  }
  door on c.right at center width 1000 swing into c
}
`;

/**
 * Plans whose crossing changes: one run left standing ends flush on the point, and a tee of three
 * open runs draws nothing. Each names the point and the direction the wall that stands leaves it
 * in (`null`: none stands).
 */
export const FLUSH: ReadonlyArray<
  readonly [name: string, src: string, at: { x: number; y: number }, stands: "n" | "s" | "e" | "w" | null, half: number]
> = [
  // Three of the four open: the issue's plan. The c|d wall ends on the point.
  ["three-open", crossing(""), { x: 4000, y: 3000 }, "s", 60],
  ["three-open-north", crossing("").replace("between a and b", "between c and d"), { x: 4000, y: 3000 }, "n", 60],
  ["three-open-west", crossing("").replace("between a and c", "between c and d"), { x: 4000, y: 3000 }, "w", 60],
  ["three-open-east", crossing("").replace("between b and d", "between c and d"), { x: 4000, y: 3000 }, "e", 60],
  // The wall left is thicker than the open runs: it ends flush across its own width.
  ["three-open-thick", crossing("between c and d thickness 200"), { x: 4000, y: 3000 }, "s", 100],
  // Thinner: the block's sides beside it go too.
  ["three-open-thin", crossing("between c and d thickness 60"), { x: 4000, y: 3000 }, "s", 30],
  // The fourth opening is narrower than its run, so a length of wall stands at the crossing.
  ["narrowed", crossing("open between c and d width 1000"), { x: 4000, y: 3000 }, "s", 60],
  // The fourth run keeps a length of wall, and a door written first hangs on what stays of it.
  [
    "door-on-narrowed",
    crossing("open between c and d width 800").replace(
      "  walls from rooms",
      "  door at (4000,3400) width 680 wall partition hinge left swing in\n  walls from rooms",
    ),
    { x: 4000, y: 3000 },
    "s",
    60,
  ],
  // Three rooms at a T, three open boundaries: no wall is left at the point.
  [
    "open-tee",
    tee(["open between a and b", "open between a and c", "open between b and c"]),
    { x: 3000, y: 3000 },
    null,
    0,
  ],
  // The tee's stem stands, the line it meets is open: the stem stops on the line.
  ["tee-stem-stands", tee(["open between a and b", "open between a and c"]), { x: 3000, y: 3000 }, "e", 60],
  // One half of the line stands, its other half and the stem are open.
  ["tee-line-stands", tee(["open between a and b", "open between b and c"]), { x: 3000, y: 3000 }, "s", 60],
];

/** Plans that must draw what they drew before the fix. */
export const UNMOVED: ReadonlyArray<readonly [string, string]> = [
  // Two open at a corner of the four rooms: the two walls left meet as a corner does.
  ["two-open-corner", crossing("").replace("    open between b and d\n", "")],
  // Two open across from each other: the two walls left are one line through the point.
  [
    "two-open-across",
    crossing("").replace("    open between a and c\n", "").replace("between b and d", "between c and d"),
  ],
  // Three open, and the wall left is authored: it keeps what it draws, cap and all.
  ["authored-fourth", crossing("", "  wall id=x partition thickness 120 between c and d\n")],
  // A wall of the plan crosses the point: the square is partly that wall's.
  [
    "wall-through",
    crossing("open between c and d", "  wall id=x partition thickness 100 { (3500,2500) (4500,3500) }\n"),
  ],
  // A wall's band holds the whole square, with no edge of it anywhere near.
  ["wall-over", crossing("open between c and d", "  wall id=x partition thickness 2000 { (3000,3300) (5000,3300) }\n")],
  // A wall's band takes in a corner of the square and misses its centre.
  [
    "wall-beside",
    crossing("open between c and d", "  wall id=x partition thickness 200 { (3000,3120) (5000,3120) }\n"),
  ],
  // Four authored walls, each opening's jamb flush with the crossing: what an author writes stands.
  [
    "authored-flush",
    `plan "Authored" {
${BODY}  wall id=ext exterior thickness 300 { (0,0) (7000,0) (7000,6000) (0,6000) close }
  wall id=ab partition thickness 120 between a and b
  wall id=ac partition thickness 120 between a and c
  wall id=bd partition thickness 120 between b and d
  wall id=cd partition thickness 120 between c and d
  opening on ab at 1545 from start width 2790
  opening on ac at 2045 from start width 3790
  opening on bd at 1455 from start width 2790
  opening on cd at 1455 from start width 2790
${OPENINGS}}
`,
  ],
];

const pair = (clause: string, door: string): string => `plan "Nib" {
  units mm
  room id=hall at (0,0) size 2400x4000 label "Hall" uses hall
  room id=liv at (2400,0) size 5000x4000 label "Living" uses living
  walls from rooms exterior 300 partition 100 { ${clause} }
  ${door}
  window on liv.top width 1500
}
`;

const ON_HALL = "door on hall.bottom at 1800 from start width 1135 swing into hall";
const CLOSE_TO_LINE = "door at (1850,4000) width 1000 wall exterior swing inward";
const ACROSS_LINE = "door at (2400,4000) width 900 wall exterior swing inward";

/** A door beside an open boundary (issue #368, part 2). */
export const NIB = {
  /** The issue's plan: the boundary is open over its whole shared edge. */
  whole: pair("open between hall and liv", ON_HALL),
  /** The same, the width written out: 3700 is the clear span between the ring's faces. */
  wholeWritten: pair("open between hall and liv width 3700", ON_HALL),
  /** A narrower opening leaves wall on the boundary, so the door stays refused. */
  narrower: pair("open between hall and liv width 2000", ON_HALL),
  /** No clause: a partition, as ever. */
  closed: pair("", ON_HALL),
  /** Measured against the room's own edge, which an open boundary does not change. */
  pastTheEdge: pair("open between hall and liv", "door on hall.bottom at 2200 from start width 1135 swing into hall"),
  /** The lint twin: placed by point, a jamb on the boundary's face. */
  byPoint: pair("open between hall and liv", CLOSE_TO_LINE),
  byPointNarrower: pair("open between hall and liv width 2000", CLOSE_TO_LINE),
  /** Placed by point across the boundary's line, so the door opens on both rooms. */
  acrossLine: pair("open between hall and liv", ACROSS_LINE),
  acrossLineNarrower: pair("open between hall and liv width 2000", ACROSS_LINE),
};

/** A partition under an open boundary: `liv|kit` carries on past the end of `hall|kit`. */
const under = (extra: string): string => `plan "Under" {
  units mm
  room id=hall at (0,0) size 2400x3000 label "Hall" uses hall
  room id=liv at (2400,0) size 5000x3000 label "Living" uses living
  room id=kit at (0,3000) size 7400x2000 label "Kitchen" uses kitchen
  walls from rooms exterior 300 partition 100 { open between hall and liv ${extra} }
  door between hall and kit at 2000 from start width 800 swing into kit
  door on kit.bottom at center width 1000 swing into kit
  window on liv.top width 1500
}
`;

/** Past the end of `b|c`, nothing: the line it stops on is open, so a jamb there has no wall. */
const stem = (at: number): string => `plan "Stem" {
  units mm
  room id=a at (0,0) size 3000x6000 label "A" uses living
  room id=b at (3000,0) size 3000x3000 label "B" uses dining
  room id=c at (3000,3000) size 3000x3000 label "C" uses bedroom
  walls from rooms exterior 300 partition 120 {
    open between a and b
    open between a and c
  }
  door between b and c at ${at} from start width 800 swing into c
  door on a.left at center width 1000 swing into a
}
`;

export const NIB_HOSTS = {
  under: under(""),
  underNarrower: under("width 1000"),
  /** The jamb 40 mm from the open line's face: refused, or a free 60 mm stub would stand there. */
  stemAtFreeEnd: stem(500),
  stemClear: stem(1500),
};
