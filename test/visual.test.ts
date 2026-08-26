import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { compile, makeVirtualWorld, renderPng } from "../src/index.js";

/**
 * Visual-regression suite (T6.4).
 *
 * Each shipped example is rasterized to PNG and pixel-diffed against a committed
 * golden, so an unintended geometry change shows up as non-zero mismatched
 * pixels (the SVG/Scene snapshots catch *string* changes; this catches *visual*
 * ones — e.g. a polygon winding flip that serializes differently but draws the
 * same, or vice-versa). Goldens are rendered at a reduced scale to keep the
 * committed binaries small while still covering the whole drawing.
 *
 * Update goldens intentionally with:  UPDATE_GOLDENS=1 vitest run test/visual.test.ts
 *
 * The optional raster dep (`@resvg/resvg-js`) is resolved ONCE, up front, and its
 * absence is never silent — see RESVG_REQUIRED below.
 *
 * Goldens are rasterized by resvg (pure-Rust tiny-skia) with a bundled font, so
 * they are reproducible for a given resvg version. The diff is strict (threshold
 * 0); regenerate the goldens with `UPDATE_GOLDENS=1` after an intentional change
 * or a resvg version bump.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");
const goldenDir = join(__dirname, "__goldens__");
const goldenPath = (name: string) => join(goldenDir, `${name}.png`);

/** Reduced raster scale — small goldens, still full-drawing coverage. */
const GOLDEN_SCALE = 0.25;
const UPDATE = process.env.UPDATE_GOLDENS === "1";

const EXAMPLES = [
  "studio.arch",
  "two-bed.arch",
  "parametric.arch",
  "themed.arch",
  "relational.arch",
  "museum.arch",
  // The wing on its own — the same file the composed building imports, so this golden
  // pins the component's own drawing independently of the transform applied to it.
  "museum-wing.arch",
  // v1.23: the polygon-room flagship. This is the golden that would move if a room's
  // ring, its centroid label anchor or the wall outline's mitre cap ever drifted.
  "gallery-l.arch",
  // v1.24: the curved-geometry flagship. This is the golden that would move if the arc
  // solve, the tessellation step, the true-arc faces, the tangent-borne openings or the
  // R/φ call-outs ever drifted — and, because it mixes a curved facade with straight
  // service wings, it also pins the per-wall split that keeps the straight walls on the
  // rectilinear boolean.
  "aquarium.arch",
  // v1.25: the orientation-and-openings example. Its golden is the only one that would
  // move if a NON-HINGED leaf's drawing drifted — the sliding, pocket and bifold panels
  // are Scene primitives with no swing arc, and nothing else under examples/ draws one.
  "bungalow.arch",
  // v1.27 showcase: the twelve examples added when the gallery was redrawn. They exist
  // here for the same reason the older entries do — each is the only shipped plan that
  // exercises some part of the drawing pipeline, so its golden is where that part's
  // drift would first become visible.
  //
  // The signature plan: nothing is positioned by hand, so this golden moves if the
  // `on <wall> at <pos>` walk, the `against wall` / `anchor … flush` resolvers, `strip`
  // or the pocket/sliding panels drift.
  "laneway-house.arch",
  // The smallest plan that renders anything at all — one room, one door, one window. A
  // diff here means something in the common path moved, with nothing else to blame.
  "one-room.arch",
  "tiny-house.arch",
  "garden-loft.arch",
  // A ring of rooms round a void: the only shipped plan where the outward face of a
  // window is NOT the side its bounding box suggests (the v1.25 courtyard case).
  "courtyard-house.arch",
  // Non-rectilinear rooms that are not the polygon flagship — six-sided rooms packed
  // round a hexagonal core, so the mitres are all oblique.
  "hexagon-pavilion.arch",
  // The wide-format sheets: A2 drawings with `schedule` / `legend` margin tables, so
  // these two goldens are where the sheet layer's table drawing would drift.
  "library.arch",
  "transit-hall.arch",
  "clinic.arch",
  // The only shipped example that uses `style <kind> { … }`, so it is the only golden
  // that pins a per-element style override reaching the SVG.
  "materials.arch",
  // A `for`-generated run of four identical units — the golden that would move if the
  // scripting expansion or its auto-id numbering drifted.
  "terrace-row.arch",
  // v1.28: the furniture flagship. Twenty-six drawn symbols on one sheet, which is what
  // makes it the visual golden for the glyph layer — a scallop that stopped tiling, a
  // burner ring that faceted, a pillow branch that flipped, all draw the same STRING
  // length and would slip past a snapshot while moving pixels here.
  "furnished-flat.arch",
];

async function hasResvg(): Promise<boolean> {
  try {
    await import("@resvg/resvg-js" as string);
    return true;
  } catch {
    return false;
  }
}

/**
 * A missing optional dep must never yield a silently-GREEN EMPTY suite. Each case
 * used to open with `if (!(await hasResvg())) return;`, so on any machine without
 * the raster dep every test "passed" having asserted nothing — including a CI run
 * whose install step had quietly stopped pulling `optionalDependencies`, which is
 * exactly the failure this suite exists to catch.
 *
 * So the dep is probed ONCE and its absence is reported, not swallowed:
 *   - in CI it is REQUIRED (`npm ci` installs optionalDependencies), so a missing
 *     dep FAILS loudly as the broken-install bug it is;
 *   - locally it degrades to a VISIBLE skip in the reporter, never silence.
 *
 * When the dep IS present the goldens are compared exactly as before.
 */
const HAS_RESVG = await hasResvg();
const RESVG_REQUIRED = !!process.env.CI;

/** Rasterize one Scene and pixel-diff it against `<key>.png` (or write it with UPDATE). */
async function diffAgainstGolden(key: string, scene: Parameters<typeof renderPng>[0]): Promise<void> {
  const actual = await renderPng(scene, { scale: GOLDEN_SCALE });
  if (UPDATE) {
    mkdirSync(goldenDir, { recursive: true });
    writeFileSync(goldenPath(key), Buffer.from(actual));
    return;
  }
  const a = PNG.sync.read(Buffer.from(actual));
  const b = PNG.sync.read(readFileSync(goldenPath(key)));
  expect({ w: a.width, h: a.height }).toEqual({ w: b.width, h: b.height });
  const mismatched = pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0 });
  expect(mismatched).toBe(0);
}

describe("visual regression — golden PNG pixel-diff", () => {
  if (!HAS_RESVG) {
    const gate = "optional raster dep @resvg/resvg-js is installed";
    if (RESVG_REQUIRED) {
      it(gate, () => {
        throw new Error(
          "optional dep @resvg/resvg-js missing in CI — install step is broken. " +
            "The visual-regression goldens were NOT compared. Check that the install " +
            "step still pulls optionalDependencies (npm ci without --omit=optional).",
        );
      });
    } else {
      // Visible in the reporter as a skip, with the reason in the name.
      it.skip(`${gate} (absent locally — visual goldens not compared)`, () => {});
    }
    return;
  }

  for (const name of EXAMPLES) {
    it(`${name} matches its golden`, async () => {
      const { scene, errors } = compile(example(name), { noCache: true });
      expect(errors).toEqual([]);
      await diffAgainstGolden(name, scene!);
    });
  }

  // Component v2: the multi-file flagship. It needs a World (it `import`s the wing file),
  // so it cannot ride the loop above. This golden is the one that would move if a
  // `place`'s transform, its id namespacing or the zone-grouped schedule ever drifted —
  // the drawing is one wing rendered twice, once mirrored.
  it("museum-wings.arch (two placed instances) matches its golden", async () => {
    const world = makeVirtualWorld({ "museum-wing.arch": example("museum-wing.arch") });
    const { scene, errors } = compile(example("museum-wings.arch"), { world, noCache: true });
    expect(errors).toEqual([]);
    await diffAgainstGolden("museum-wings.arch", scene!);
  });

  // Multi-storey: one golden per PAGE. A single golden of `scene` would pin only the
  // lowest level, leaving an upper storey's drawing unguarded.
  it("two-storey.arch matches a golden per level", async () => {
    const { pages, errors } = compile(example("two-storey.arch"), { noCache: true });
    expect(errors).toEqual([]);
    expect(pages).toHaveLength(2);
    for (const p of pages!) await diffAgainstGolden(`two-storey.arch.L${p.level}`, p.scene);
  });

  // The second multi-storey example, and the first with THREE levels — so it is the only
  // golden that would catch a fault appearing on a level that is neither the first nor
  // the last (a stair shaft's middle landing, a per-storey title-block row).
  it("townhouse.arch matches a golden per level", async () => {
    const { pages, errors } = compile(example("townhouse.arch"), { noCache: true });
    expect(errors).toEqual([]);
    expect(pages).toHaveLength(3);
    for (const p of pages!) await diffAgainstGolden(`townhouse.arch.L${p.level}`, p.scene);
  });
});
