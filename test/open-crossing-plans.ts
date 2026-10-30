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

/** Plans that must draw what they drew before the fix. */
export const UNMOVED: ReadonlyArray<readonly [string, string]> = [
  // Three of the four open: the fourth wall stands and carries the crossing.
  ["three-open", crossing("")],
  // The fourth opening is narrower than its run, so a length of wall joins the crossing to it.
  ["narrowed", crossing("open between c and d width 1000")],
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
  // The fourth run keeps a length of wall, and a door written first hangs on the square.
  [
    "door-on-narrowed",
    crossing("open between c and d width 800").replace(
      "  walls from rooms",
      "  door at (4000,3400) width 680 wall partition hinge left swing in\n  walls from rooms",
    ),
  ],
  // Three rooms at a T: three open boundaries. Outside #368's four (see the PR); drawn as it was.
  [
    "open-tee",
    `plan "Tee" {
  units mm
  room id=a at (0,0) size 3000x6000 label "A" uses living
  room id=b at (3000,0) size 3000x3000 label "B" uses dining
  room id=c at (3000,3000) size 3000x3000 label "C" uses kitchen
  walls from rooms exterior 300 partition 120 {
    open between a and b
    open between a and c
    open between b and c
  }
  door on c.right at center width 1000 swing into c
}
`,
  ],
];
