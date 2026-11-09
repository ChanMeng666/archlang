/**
 * The plans of `net-area-stamp.test.ts`, kept import-free so the baseline of their digests can be
 * taken from the SAME text against an older `src/` (`git archive`), never a lookalike.
 *
 * `SHELL` is the shape every twin shares: a 6000 x 4000 shell, 300 mm exterior and a 100 mm partition,
 * two 3000 x 4000 rooms (12 m² on the centreline, 10.36 m² net), a polygon room and a circle room beside.
 */

const BODY = `  units mm
  paper A3 landscape
  scale 1:50
  wall id=w exterior thickness 300 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=p interior thickness 100 { (3000,0) (3000,4000) }
  room id=a at (0,0) size 3000x4000 label "Living"
  room id=b at (3000,0) size 3000x4000 label "Bed"
`;

/** The schedule, as authors write it today. */
export const TWIN = `plan "net twin" {\n  schedule rooms\n${BODY}}\n`;
/** The same plan with the stamp reading the schedule's net area. */
export const NET = `plan "net twin" {\n  schedule rooms net\n${BODY}}\n`;
/** No `schedule`: the word cannot be written without one, and a plan without a schedule stamps as ever. */
export const NO_SCHEDULE = `plan "no schedule" {\n${BODY}}\n`;

/** A polygon room and a circle room, each with a wall through or around it. */
const SHAPES = `  units mm
  paper A3 landscape
  scale 1:50
  wall id=w exterior thickness 300 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall id=p interior thickness 100 { (4000,0) (4000,4000) }
  room id=l polygon (0,0) (4000,0) (4000,4000) (2000,4000) (2000,2000) (0,2000) label "Ell"
  room id=c circle at (6000,2000) radius 1500 label "Round"
`;
export const SHAPES_TWIN = `plan "shapes" {\n  schedule rooms\n${SHAPES}}\n`;
export const SHAPES_NET = `plan "shapes" {\n  schedule rooms net\n${SHAPES}}\n`;

const SHELL_ONLY = `  units mm
  paper A3 landscape
  scale 1:50
`;

/** A component named `net`, called on the line after `schedule rooms`: `net` there is a macro call, not the word. */
export const MACRO = `plan "macro" {
  units mm
  paper A3 landscape
  scale 1:50
  component net() {
    room id=r at (0,0) size 3000x4000 label "Cell"
  }
  wall id=w exterior thickness 300 { (0,0) (3000,0) (3000,4000) (0,4000) close }
  schedule rooms
  net()
}
`;

/** Net 9.45 m² exactly (2700 x 3500 inside the walls): a tie at one decimal. */
export const ROUND = `plan "round" {
  schedule rooms net
  units mm
  paper A3 landscape
  scale 1:50
  wall id=w exterior thickness 300 { (0,0) (3000,0) (3000,3800) (0,3800) close }
  room id=a at (0,0) size 3000x3800 label "Nine"
}
`;

/** No wall anywhere: nothing is deducted from either room. */
export const NO_WALLS = `plan "no walls" {
  schedule rooms net
${SHELL_ONLY}  room id=a at (0,0) size 3000x4000 label "Living"
  room id=b at (3000,0) size 3000x4000 label "Bed"
}
`;

export const FIXTURES: Record<string, string> = {
  TWIN,
  NO_SCHEDULE,
  SHAPES_TWIN,
  MACRO,
};
