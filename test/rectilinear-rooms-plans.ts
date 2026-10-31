/**
 * The plans behind `test/rectilinear-rooms.test.ts` (issue #363, card L1): a rectilinear
 * `room polygon` inside `walls from rooms`. No corpus plan reaches this form, so these are what
 * the new paths run on. Importable without vitest, so the digests are measured by the same body
 * the test runs.
 *
 * `issue` and `issue-tiled` are the issue's first and second plans. Both drop the door and the
 * anchored sofa, and `issue` places the bath at (6000,0) for its `right-of liv` (card L3); the ring
 * and the rooms are the issue's own. `doors-both-runs` onward are card L2's: `door|opening between`
 * on a polygon (`test/rectilinear-doors.test.ts`).
 */

const plan = (title: string, body: string): string => `plan "${title}" {\n  units mm\n${body}\n}\n`;

/** The issue's L: the notch at the bottom right. */
export const L_RING = "(0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000)";
/** The same ring written the other way round and from another vertex. */
export const L_RING_REVERSED = "(3000,6000) (3000,3000) (6000,3000) (6000,0) (0,0) (0,6000)";
export const BED = '  room id=bed at (3000,3000) size 3000x3000 label "Bedroom" uses bedroom';
export const STATEMENT = "  walls from rooms exterior 200 partition 100";

const LIV = `  room id=liv polygon ${L_RING} label "Living" uses living`;

/** A U round a room: three runs of one pair, meeting at two reflex corners. */
export const U_PLAN = plan(
  "U room",
  `  room id=u polygon (0,0) (9000,0) (9000,6000) (6000,6000) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Hall" uses living\n  room id=core at (3000,3000) size 3000x3000 label "Core" uses bedroom\n${STATEMENT}`,
);

/** A comb: one room whose teeth reach down between rooms, and two of its slots left empty. */
export const COMB_PLAN = plan(
  "Comb",
  `  room id=a polygon (0,0) (9000,0) (9000,1000) (8000,1000) (8000,3000) (7000,3000) (7000,1000) (6000,1000) (6000,3000) (5000,3000) (5000,1000) (4000,1000) (4000,3000) (3000,3000) (3000,1000) (2000,1000) (2000,3000) (1000,3000) (1000,1000) (0,1000) label "A" uses living\n  room id=b at (0,1000) size 1000x2000 label "B" uses bedroom\n  room id=c at (2000,1000) size 1000x2000 label "C" uses bedroom\n  walls from rooms exterior 200 partition 100 { between a and b thickness 150 }`,
);

/** Two polygons interlocked: three runs of one pair, and no rectangle at all. */
export const INTERLOCKED_PLAN = plan(
  "Two interlocked Ls",
  `  room id=a polygon ${L_RING} label "A" uses living\n  room id=b polygon (6000,0) (9000,0) (9000,6000) (3000,6000) (3000,3000) (6000,3000) label "B" uses bedroom\n${STATEMENT}`,
);

/** The issue's first plan, as far as L1 reaches. */
export const ISSUE_PLAN = plan(
  "L-shaped living room",
  `${LIV}\n${BED}\n  room id=bath at (6000,0) size 2000x3000 label "Bath" uses bath\n${STATEMENT}`,
);

export const RECTILINEAR_PLANS: [string, string][] = [
  ["issue", ISSUE_PLAN],
  [
    // The hybrid plan of the issue with the L derived instead of typed: the bath 6000 long.
    "issue-tiled",
    plan(
      "L-shaped living room, tiled",
      `${LIV}\n${BED}\n  room id=bath at (6000,0) size 2000x6000 label "Bath" uses bath\n${STATEMENT}`,
    ),
  ],
  ["notch-outside", plan("L alone", `${LIV}\n${STATEMENT}`)],
  ["u", U_PLAN],
  ["comb", COMB_PLAN],
  ["interlocked", INTERLOCKED_PLAN],
  [
    // A redundant vertex on the top edge, and two runs of one pair on one line with a room between.
    "two-runs-one-line",
    plan(
      "Runs of one pair on one line",
      `  room id=c polygon (0,0) (3000,0) (6000,0) (6000,6000) (4000,6000) (4000,3000) (2000,3000) (2000,6000) (0,6000) label "C" uses living\n  room id=d at (2000,3000) size 2000x3000 label "D" uses bedroom\n  room id=e at (0,6000) size 6000x2000 label "E" uses hall\n${STATEMENT}`,
    ),
  ],
  [
    // A courtyard closed by an L and a rectangle: the hole is covered, so it keeps its inner ring.
    "courtyard",
    plan(
      "A courtyard inside a U",
      `  room id=u polygon (0,0) (9000,0) (9000,6000) (6000,6000) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Hall" uses living\n  room id=s at (0,6000) size 9000x2000 label "South" uses bedroom\n  outdoor patio at (3000,3000) size 3000x3000\n${STATEMENT}`,
    ),
  ],
  [
    // An authored wall takes the middle of the second run: `liv|bed#2` and `liv|bed#2~2`.
    "coexist-second-run",
    plan(
      "Coexistence on a later run",
      `  wall id=w partition thickness 150 { (4000,3000) (5000,3000) }\n${LIV}\n${BED}\n${STATEMENT}`,
    ),
  ],
  [
    // One run with its neighbour: the L can still be opened to a room it shares one edge with.
    "open-one-run",
    plan(
      "An L open to a room along one edge",
      `${LIV}\n${BED}\n  room id=din at (6000,0) size 3000x3000 label "Dining" uses dining\n  walls from rooms exterior 200 partition 100 { open between liv and din }`,
    ),
  ],
  [
    "door-at",
    plan(
      "Doors by position on each run of a pair",
      `${LIV}\n${BED}\n${STATEMENT}\n  door at (3000,4500) width 800 wall partition hinge left swing in\n  door at (4500,3000) width 800 wall partition hinge left swing in\n  door at (0,1500) width 1000 wall exterior hinge left swing in\n  window at (1500,0) width 1500 wall exterior`,
    ),
  ],
  [
    "placed",
    plan(
      "An L in a placed component",
      `  component wing() {\n  ${LIV}\n  ${BED}\n  ${STATEMENT}\n    door at (3000,4500) width 800 wall partition hinge left swing in\n  }\n  place wing() as w at (0,0)\n  place wing() as m at (15000,0) rotate 90\n  place wing() as n at (6000,7000) mirror x`,
    ),
  ],
  [
    // One door on each run of the pair, and a door on the pair of one run beside it.
    "doors-both-runs",
    plan(
      "A door on each run",
      `${LIV}\n${BED}\n  room id=bath at (6000,0) size 2000x3000 label "Bath" uses bath\n${STATEMENT}\n  door id=d1 between liv and bed at 1500 from bed.top width 800 swing into bed\n  door id=d2 between liv and bed at 1500 from bed.left width 800 swing into liv\n  door id=d3 between liv and bath at center width 800 swing into bath`,
    ),
  ],
  [
    // The U's middle run is picked by either side of the neighbour; its side runs have no word.
    "door-u",
    plan(
      "A door in a U",
      `  room id=u polygon (0,0) (9000,0) (9000,6000) (6000,6000) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Hall" uses living\n  room id=core at (3000,3000) size 3000x3000 label "Core" uses bedroom\n${STATEMENT}\n  door id=d1 between u and core at 1500 from core.left width 800 swing into core\n  door id=d2 at (3000,4500) width 800 wall partition`,
    ),
  ],
  [
    // A door between the L and a room that shares one run with it, written every way one run allows.
    "door-one-run",
    plan(
      "Every position on one run",
      `${LIV}\n${BED}\n  room id=din at (6000,0) size 3000x3000 label "Dining" uses dining\n${STATEMENT}\n  door id=d1 between liv and din at 700 from start width 800 swing into din\n  door id=d2 between din and liv at 700 from end width 800 hinge right swing into din\n  opening id=o1 between liv and din at 1500 from din.top width 300`,
    ),
  ],
  [
    "doors-placed",
    plan(
      "Doors on an L in placed components",
      `  component wing() {\n  ${LIV}\n  ${BED}\n  ${STATEMENT}\n    door id=a between liv and bed at 1200 from bed.top width 800 swing into bed\n    door id=b between liv and bed at 1200 from bed.left width 800 swing into liv\n  }\n  place wing() as w at (0,0)\n  place wing() as m at (15000,0) rotate 90\n  place wing() as n at (6000,7000) mirror x`,
    ),
  ],
];
