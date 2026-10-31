/**
 * The body of the block-stair byte-identity law (issue #362, card S1), importable without vitest,
 * so the baseline was measured against an older `src/` by this very code and not a lookalike
 * (`test/byte-identity-digest.ts` says why that matters).
 *
 * The payload is the rectilinear-rooms law's ({@link lawDigest}: every page's SVG, `describe()`,
 * `lint()`, `compile().diagnostics`, every page's Scene and the step count) plus the two surfaces
 * that leaves out and this form can reach: `lint()` under the accessibility profile, which reads
 * stairs through other limits, and the circulation overlay, which draws the walking grid.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lawDigest, type LawApi, type LawRow, lawRows } from "./rectilinear-rooms-law.js";
import type { World } from "../src/world.js";

/** What the law reads beyond {@link LawApi}, handed in so an older tree can be measured. */
export interface StairLawApi extends LawApi {
  lintA11y(src: string, world: World | undefined): unknown;
  overlaySvgs(src: string, world: World | undefined): string[];
}

/** SHA-256 over {@link lawDigest}, the accessibility lint and every page's overlay SVG. */
export function stairLawDigest(api: StairLawApi, src: string, world: World | undefined): string {
  const payload = [
    lawDigest(api, src, world),
    JSON.stringify(api.lintA11y(src, world)),
    JSON.stringify(api.overlaySvgs(src, world)),
  ].join(" ");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

const plan = (body: string): string => `plan "S" {\n  units mm\n${body}\n}\n`;
const SHELL = `  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  room id=r at (0,0) size 6000x6000 label "Hall" uses hall
  door id=d at (3000,6000) width 900 wall shell`;

/**
 * Plans a corpus cannot supply, on this law's edge: a straight stair on every path a block stair
 * forks from. Words the form reads as keywords, used as the names they have always been; a square
 * and a narrow flight; a stair in a `place`, turned and mirrored; a walk that arrives by a straight
 * flight beside a lift; and the straight form's own refusals, whose wording must not move.
 */
export const STAIR_INLINE_ROWS: readonly LawRow[] = [
  {
    name: "inline:stair-words-as-names",
    src: plan(
      `  let flight = 1200\n  let landing = 3000\n${SHELL}\n  room id=flight at (6000,0) size 3000x3000 uses bedroom\n  stair id=landing at (500,500) size flight x landing dir up`,
    ),
  },
  {
    name: "inline:stair-square-and-narrow",
    src: plan(
      `${SHELL}\n  stair id=a at (500,500) size 1600x1600 dir up width 1000\n  stair id=b at (3000,500) size 2000x1000 dir down width 800`,
    ),
  },
  {
    name: "inline:stair-placed",
    src: plan(
      `  component c() {\n    stair id=s at (0,0) size 1000x3000 dir up width 900\n    elevator id=e at (2000,0) size 1500x1500\n    escalator id=x at (0,3500) size 3000x1000 dir down\n  }\n${SHELL}\n  place c() as a at (500,500)\n  place c() as b at (5500,5500) rotate 180 mirror x`,
    ),
  },
  {
    name: "inline:stair-arrival",
    src: `plan "S" {
  units mm
  height 2750
  level 1 {
${SHELL}
    stair id=s at (500,1000) size 1000x3000 dir up
    elevator id=e at (4000,4000) size 1500x1500
  }
  level 2 {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=up at (0,0) size 6000x6000 uses hall circulation
    stair id=s at (500,1000) size 1000x3000 dir up
    elevator id=e at (4000,4000) size 1500x1500
  }
  level 3 {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=top at (0,0) size 6000x6000 uses hall circulation
    stair id=s at (500,1000) size 1000x3000 dir down
    elevator id=e at (4000,4000) size 1500x1500
  }
}
`,
  },
  {
    name: "inline:stair-refusals",
    src: plan(
      `${SHELL}\n  stair id=a at (0,0) size 900x0 dir up\n  stair id=b at (0,0) size 900x2600 dir up width 1200\n  stair id=c at (0,0) size 400000x1200 dir up`,
    ),
  },
  {
    // The clause order the form leaves alone: only `dir` straight after the id opens a block.
    name: "inline:stair-parse-refusals",
    src: plan(`${SHELL}\n  stair id=a size 900x900 at (0,0) dir up\n  stair id=b at (0,0) dir up size 900x900`),
  },
];

/** Every row of the law, in table order: the rectilinear law's, the stair-safety defect corpus
 *  (the plans the stair rules read), and {@link STAIR_INLINE_ROWS}. */
export function stairLawRows(root: string): LawRow[] {
  const dir = "test/defect-corpus/stair-safety";
  const defects = readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => ({ name: `${dir}/${f}`, src: readFileSync(join(root, dir, f), "utf8"), dir: join(root, dir) }));
  const plans = lawRows(root).filter((r) => !WRITES_THE_FORM.includes(r.name));
  return [...plans, ...defects, ...STAIR_INLINE_ROWS];
}

/** The shipped plans this law cannot hold, because they use the form. Named, so that a plan
 *  reaching the form by accident fails the law's "no row reaches the form" instead of leaving it. */
export const WRITES_THE_FORM: readonly string[] = ["examples/turning-stair.arch"];
