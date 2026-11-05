/**
 * The plans of the `void … polygon` and `void … rail` tests (issue #405, plan decision CR-D8),
 * importable without vitest, so the baseline of the byte law was measured against an older `src/`
 * by this very list.
 *
 * {@link VOID_INLINE_ROWS} use neither form, on the edges they fork from: a rectangle void on every
 * path that now reads a void's pieces (the walking grid, a stair's head and foot, furniture on it,
 * `walls from rooms`, a `place` turned and mirrored), the balcony railing whose drawing the void's
 * now shares, the two words as the names they have always been, and the refusals whose words must
 * not move. A row that writes a form is not a row: the law's premise test says so.
 */

import type { LawRow } from "./rectilinear-rooms-law.js";

const plan = (body: string): string => `plan "V" {\n  units mm\n${body}\n}\n`;
const SHELL = `  wall id=s exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=a at (0,0) size 8000x6000 label "Hall" uses hall
  door id=d at (4000,6000) width 900 wall s
`;

export const VOID_INLINE_ROWS: readonly LawRow[] = [
  {
    name: "inline:void-rectangles",
    src: plan(
      `${SHELL}  void id=v1 at (500,500) size 2000x1000\n  void at (500,2000) size 1000x2000\n  furniture sofa at (600,2100) size 800x800\n  stair id=st at (5000,500) size 1000x3000 dir up\n  void id=v2 at (5000,3500) size 1000x1500`,
    ),
  },
  {
    name: "inline:void-placed",
    src: plan(
      `  component well() {\n    void id=v at (0,0) size 1200x2400\n  }\n${SHELL}  place well() as w1 at (500,500)\n  place well() as w2 at (7500,5500) rotate 90 mirror x\n  place well() as w3 at (4000,500) rotate 270 mirror y`,
    ),
  },
  {
    name: "inline:void-in-tiling",
    src: plan(
      "  room id=t at (0,0) size 6000x1000 uses hall\n  room id=b at (0,3000) size 6000x1000 uses hall\n  room id=l at (0,1000) size 2000x2000 uses hall\n  room id=r at (4000,1000) size 2000x2000 uses living\n  void id=w at (2000,1000) size 2000x2000\n  walls from rooms exterior 200 partition 100",
    ),
  },
  {
    name: "inline:balcony-rails",
    src: plan(
      `${SHELL}  outdoor balcony at (8000,500) size 1500x3000\n  outdoor balcony at (-2000,500) size 2000x1000 rail top left\n  outdoor balcony at (2000,6000) size 3000x1200 rail all\n  outdoor balcony at (2000,-900) size 900x900 rail none\n  outdoor balcony at (6000,6000) size 700x5000 rail bottom, right`,
    ),
  },
  {
    name: "inline:void-words-as-names",
    src: plan(
      `  let rail = 1200\n  let edges = [0, 1, 2]\n${SHELL}  room id=polygon at (8000,0) size rail x 3000 uses storage\n  void id=rail at (500,500) size rail x rail\n  room id=b at (8000,3000) size 1200x3000 uses storage`,
    ),
  },
  {
    name: "inline:void-refusals",
    src: plan(`${SHELL}  void id=z at (500,500) size 0x1000\n  void id=n at (2000,500) size 1000x-500`),
  },
  {
    name: "inline:outdoor-polygon-and-rail-refusals",
    src: plan(
      `${SHELL}  outdoor lawn polygon (0,7000) (3000,7000) (3000,9000) (0,9000) rail top\n  outdoor balcony polygon (8000,0) (9000,0) (9000,1000) (8000,1000)`,
    ),
  },
];

/**
 * A plan that writes both forms: an upper storey's L-shaped stair well and a railed gallery void.
 * Inline rather than a file, because several corpus tables walk `test/fixtures` and pin its counts.
 */
export const VOID_FIXTURE = `# An upper storey's L-shaped stair well with a railing, and a railed gallery void (#405, CR-D8).
# Edges 0 and 5 of the well stand on the walls' inner faces; edge 4, its foot, is where the stair
# arrives, so it is left open; edges 1 to 3 are railed.
plan "Railed voids" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=landing at (0,0) size 8000x6000 label "Landing" uses hall circulation
  door id=d on shell at 4000 width 900
  void id=well polygon (100,100) (3100,100) (3100,1100) (1100,1100) (1100,4100) (100,4100) rail 1 2 3
  void id=gallery at (5000,2000) size 2000x3000 rail top left bottom
}
`;
