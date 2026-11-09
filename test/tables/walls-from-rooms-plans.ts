/**
 * The plans the `walls from rooms` digest table pins (`test/walls-from-rooms-digests.test.ts`):
 * the two example twins, the widening drill at both widths, a courtyard, a void hole, two
 * `place`d instances, coexistence with an authored wall, a refused tiling, and (part C) the pair
 * clauses: an open plan, an open `width`, open instances and refused clauses (their diagnostics
 * are part of the payload). Importable without vitest, so the digests are measured by the same
 * body the test runs (`test/helpers/byte-identity-digest.ts`).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const plan = (body: string): string => `plan "W" {\n  units mm\n  grid 50\n${body}\n}\n`;
const COURT = `  room id=n at (0,0) size 9000x3000 uses living\n  room id=s at (0,6000) size 9000x3000 uses bedroom\n  room id=w at (0,3000) size 3000x3000 uses kitchen\n  room id=e at (6000,3000) size 3000x3000 uses hall`;

export const WALLS_FROM_ROOMS_PLANS: [string, string][] = [
  ["studio-twin", read("test/walls-from-rooms/studio.arch")],
  ["two-bed-twin", read("test/walls-from-rooms/two-bed.arch")],
  ["widen-4000", read("test/walls-from-rooms/widen.arch")],
  ["widen-4500", read("test/walls-from-rooms/widen.arch").replace("let AW = 4000", "let AW = 4500")],
  [
    "courtyard",
    plan(
      `${COURT}\n  outdoor patio at (3000,3000) size 3000x3000\n  walls from rooms exterior 250 partition 100\n` +
        `  door at (4500,3000) width 900 wall exterior hinge left swing in\n  door at (1500,3000) width 800 wall partition\n  roof overhang 500`,
    ),
  ],
  ["void-hole", plan(`${COURT}\n  void at (3000,3000) size 3000x3000\n  walls from rooms exterior 250 partition 100`)],
  [
    "instances",
    `plan "W" {\n  units mm\n  grid 50\n  component unit() {\n    room id=a at (0,0) size 4000x3000 uses living\n    room id=b at (4000,0) size 3000x3000 uses bedroom\n` +
      `    walls from rooms exterior 200 partition 100\n    door at (4000,1500) width 800 wall partition hinge left swing in\n  }\n` +
      `  place unit() as west at (0,0)\n  place unit() as east at (12000,0) rotate 90 mirror x\n}\n`,
  ],
  [
    "coexist",
    plan(
      `  wall id=p partition thickness 150 material brick { (4000,1000) (4000,3000) }\n  room id=a at (0,0) size 4000x3000 uses living\n` +
        `  room id=b at (4000,0) size 3000x3000 uses bedroom\n  walls from rooms exterior 200 partition 100`,
    ),
  ],
  [
    "refused",
    plan(
      `  room id=a at (0,0) size 4000x3000\n  room id=b at (5000,0) size 3000x3000\n  room id=c at (2000,0) size 3000x1000\n  walls from rooms exterior 200 partition 100`,
    ),
  ],
  // PS3.0 part C: the pair clauses (`open between`, `between … thickness`).
  [
    "open-plan",
    plan(
      `  schedule openings\n  dims auto all\n  room id=a at (0,0) size 4000x3000 uses living\n  room id=b at (4000,0) size 3000x3000 uses kitchen\n  room id=c at (0,3000) size 7000x2000 uses hall\n` +
        `  walls from rooms exterior 200 partition 100 { open between a and b  between a and c thickness 150 }\n` +
        `  door at (5500,5000) width 900 wall exterior hinge left swing in\n  door at (2000,3000) width 800 wall partition hinge left swing in`,
    ),
  ],
  [
    "open-width",
    plan(
      `  room id=a at (0,0) size 4000x3000 uses living\n  room id=b at (4000,0) size 3000x3000 uses bedroom\n  room id=c at (0,3000) size 4000x2000 uses bath\n  room id=d at (4000,3000) size 3000x2000 uses kitchen\n` +
        `  walls from rooms exterior 200 partition 100 { open id=ab between a and b width 1200  open between a and c  between b and d thickness 200 }\n` +
        `  door at (5500,5000) width 900 wall exterior hinge left swing in\n  furniture wc in c anchor bottom flush size 400x700`,
    ),
  ],
  [
    "open-instances",
    `plan "W" {\n  units mm\n  grid 50\n  component unit() {\n    room id=a at (0,0) size 4000x3000 uses living\n    room id=b at (4000,0) size 3000x3000 uses kitchen\n` +
      `    walls from rooms exterior 200 partition 100 { open between a and b width 1000 }\n  }\n` +
      `  place unit() as west at (0,0)\n  place unit() as east at (12000,0) rotate 90 mirror x\n}\n`,
  ],
  [
    "clauses-refused",
    plan(
      `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000\n  room id=d at (7000,0) size 2000x3000\n  room id=t at (0,3000) size 9000x1000\n` +
        `  walls from rooms exterior 200 partition 100 { open between a and d  open between a and b width 5000  between b and q thickness 100  open between t and a  between a and t thickness 150 }\n` +
        `  door at (4000,1500) width 800 wall partition`,
    ),
  ],
];
