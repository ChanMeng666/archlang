/**
 * Card AF9 (moves and skeletons for refused openings and blocked doorways): the byte-identity law.
 *
 * AF9 attaches fixes to five codes (`E_OPENING_NIB`, `E_OPENING_HOST_AMBIGUOUS`,
 * `E_OPENING_NO_SHARED_WALL`, `E_OPENING_DATUM`, `W_DOORWAY_BLOCKED`), corrects the hints of the
 * first and of a window's third (findings F1, F2), charges its search on those refusal paths alone,
 * and carries the lead clause of a literal position on the IR as `_lead`, which nothing draws or
 * reports. So a plan that raises none of the five resolves, draws, describes and lints exactly as
 * before, down to its Scene and its steps, in the accessibility profile and on the circulation
 * overlay too.
 *
 * Two halves:
 * - The rows of the widest law the repository has (`stairLawRows`, `test/helpers/block-stair-law.ts`)
 *   are already pinned with this very body by `test/block-stair-byte-identity.test.ts`; here only
 *   which of them raise one of the five is pinned ({@link RAISING}), so a plan that starts or stops
 *   raising one is a finding, not a silent move.
 * - The near misses of AF9's paths ({@link AF9_NEAR_MISS}, `test/helpers/opening-moves.ts`): each
 *   passes a check a refusal or the warning forks from, at its edge. Each digest is
 *   {@link stairLawDigest}, **measured against `src/` at `4e514311`** (`main` before AF9), that tree
 *   extracted by `git archive` and handed this body; the branch measures the same.
 *
 * The rows AF9 moves by design, the step-digesting rows of failing plans and `lint()` of the plans
 * the warning fires on, are named in the PR with their swap-back.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { NULL_WORLD, type World } from "../src/world.js";
import { type StairLawApi, stairLawDigest, stairLawRows } from "./helpers/block-stair-law.js";
import { AF9_CODES, AF9_NEAR_MISS, AF9_PLANS } from "./helpers/opening-moves.js";
import { ROOT } from "./helpers/rectilinear-rooms-law.js";

const stepsOf = (src: string, world: World | undefined): number => {
  clearResolveCache();
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return 0;
  const w = world ?? NULL_WORLD;
  return evaluationSteps(resolveAll(link(ast, w, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, w));
};

const API: StairLawApi = {
  compile,
  describe,
  lint,
  stepsOf,
  lintA11y: (src, world) => lint(src, { ...(world ? { world } : {}), profile: "accessibility-advisory" }),
  overlaySvgs(src, world) {
    const o = compile(src, { noCache: true, overlays: ["circulation"], ...(world ? { world } : {}) });
    return o.pages ? o.pages.map((p) => p.svg) : [o.svg];
  },
};

/** The five codes a plan raises: compile, and lint under both profiles (the law hashes both). */
function raised(src: string, world: World | undefined): string[] {
  const o = world ? { world } : {};
  const ds = [
    ...compile(src, { noCache: true, ...o }).diagnostics,
    ...lint(src, o),
    ...lint(src, { ...o, profile: "accessibility-advisory" }),
  ];
  return [...new Set(ds.flatMap((d) => (d.code && AF9_CODES.has(d.code) ? [d.code] : [])))].sort();
}

/** The law rows that raise one of the five, and which: the rows AF9 may move. */
const RAISING: [string, string[]][] = [
  // `W_DOORWAY_BLOCKED` under `accessibility-advisory` only (its 450 mm landing), but for off-path-bypass.
  ["examples/courtyard-family.arch", ["W_DOORWAY_BLOCKED"]],
  ["examples/hillside-villa.arch", ["W_DOORWAY_BLOCKED"]],
  ["examples/laneway-house.arch", ["W_DOORWAY_BLOCKED"]],
  ["examples/relational.arch", ["W_DOORWAY_BLOCKED"]],
  ["examples/tiny-house.arch", ["W_DOORWAY_BLOCKED"]],
  ["test/fixtures/off-path-bypass.arch", ["W_DOORWAY_BLOCKED"]],
  ["test/walls-from-rooms/relational.arch", ["W_DOORWAY_BLOCKED"]],
  ["inline:door-refusals", ["E_OPENING_DATUM", "E_OPENING_NIB"]],
];

/** Measured at `4e514311` with this body: `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["a8cd9062264562607dbd89f2e1f319c0feeb4c9104e72f17ea07fe52263b91cb", "inline:af9-nib-exact"],
  ["791717ace074556a8b0de475e78ba5b251ffb485ec5ffebce176f5837d88c01e", "inline:af9-flush-jamb"],
  ["a5ac641afca09acb5c05dedaa45def68fc96f36db89315a5c903cc3ed8c33552", "inline:af9-tee-bays"],
  ["59bec29a731ac63f2f4cdf5549381e06c794ccd81b82425d1fddff355d05bd54", "inline:af9-edge-two-walls"],
  ["a120412a63ec9e235d5cf07a4da7493d81237d456580f39fb68f95bb7a9a13c9", "inline:af9-edge-exterior"],
  ["8d61ce9462e4d4f465ddfc38d125346eb3c1b03312b7ff3beb57c695f3a8b0fe", "inline:af9-datum-through-end"],
  ["ac3b1222f54cd05d262f64d09788647782c30d7488814b74738c814deb21d865", "inline:af9-one-exterior-edge"],
  ["de8f693d53f03410722ce55f6b160f222369aad19d03f72e63d479abc148db74", "inline:af9-doorway-clear"],
  ["19636d7e16779777775685077d0be4980c66ac24a2e4d559ac1169937298aa76", "inline:af9-placed-relational"],
];

const worldOf = (dir: string | undefined): World | undefined => (dir ? makeNodeWorld(dir) : undefined);

suite("AF9: the byte-identity law", () => {
  const ROWS = stairLawRows(ROOT);
  it("the pinned raising rows are rows of the law", () => {
    expect(RAISING.map(([n]) => n).filter((n) => !ROWS.some((r) => r.name === n))).toEqual([]);
  });

  it.each(ROWS.map((r) => [r.name, r] as const))("%s raises exactly the pinned ones of the five", (name, r) => {
    expect(raised(r.src, worldOf(r.dir))).toEqual(RAISING.find(([n]) => n === name)?.[1] ?? []);
  });

  it("the premise can fail: the same check sees each of the design's plans raise its code", () => {
    expect(raised(AF9_PLANS.nib, undefined)).toEqual(["E_OPENING_NIB"]);
    expect(raised(AF9_PLANS.blocked, undefined)).toEqual(["W_DOORWAY_BLOCKED"]);
  });

  it("the table pins every near miss, and no near miss raises one of the five", () => {
    expect(BASELINE.map((b) => b[1])).toEqual(AF9_NEAR_MISS.map((r) => r.name));
    expect(AF9_NEAR_MISS.filter((r) => raised(r.src, undefined).length > 0).map((r) => r.name)).toEqual([]);
  });

  it.each(BASELINE)("%s %s", (digest, name) => {
    const row = AF9_NEAR_MISS.find((r) => r.name === name)!;
    expect(stairLawDigest(API, row.src, undefined)).toBe(digest);
  });
});
