import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { compile, renderPng } from "../src/index.js";

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
 * The suite skips when the optional raster dep (`@resvg/resvg-js`) is absent.
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

const EXAMPLES = ["studio.arch", "two-bed.arch", "parametric.arch", "themed.arch", "relational.arch"];

async function hasResvg(): Promise<boolean> {
  try {
    await import("@resvg/resvg-js" as string);
    return true;
  } catch {
    return false;
  }
}

describe("visual regression — golden PNG pixel-diff", () => {
  for (const name of EXAMPLES) {
    it(`${name} matches its golden`, async () => {
      if (!(await hasResvg())) return; // optional dep absent — skip
      const { scene, errors } = compile(example(name), { noCache: true });
      expect(errors).toEqual([]);
      const actual = await renderPng(scene!, { scale: GOLDEN_SCALE });

      if (UPDATE) {
        mkdirSync(goldenDir, { recursive: true });
        writeFileSync(goldenPath(name), Buffer.from(actual));
        return;
      }

      const a = PNG.sync.read(Buffer.from(actual));
      const b = PNG.sync.read(readFileSync(goldenPath(name)));
      expect({ w: a.width, h: a.height }).toEqual({ w: b.width, h: b.height });
      const mismatched = pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0 });
      expect(mismatched).toBe(0);
    });
  }
});
