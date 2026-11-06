/**
 * The public surfaces' 3D assets are fresh (public-surfaces card X4): `docs-site/public/3d/`, written
 * by `npm run gen:3d-assets`, still matches what this tree would write. `checkAssets` (in the
 * generator, so `npm run gen:3d-assets -- --check` runs the same thing) compares each plan's source
 * and imports with their recorded SHA-256, the package version with the recorded one, every file
 * with its recorded bytes and its budget, the GLB rebuilt with its recorded SHA-256, and the poster
 * frame re-rendered here with the recorded frame hash, or, in another environment than the one that
 * rendered it, within a pixel tolerance of the committed PNG. Encoded image and video bytes are never
 * compared (encoders differ; Q21). A different core version is printed, not failed: the re-rendered
 * frame says whether it moved a pixel.
 *
 * Red means: run `npm run gen:3d-assets` (Chromium and ffmpeg; `archlang3d doctor`) and commit
 * `docs-site/public/3d/`. A version bump of this package turns it red by design, until the assets
 * are regenerated with the new version.
 */
import { describe, expect, it } from "vitest";
import { checkAssets, DEFAULT_OUT } from "../scripts/gen-3d-assets.js";

describe("gen:3d-assets freshness (card X4)", () => {
  it("the committed 3D assets match their sources, this package, their budgets and their poster frames", async () => {
    const reports = await checkAssets(DEFAULT_OUT, { render: true });
    for (const r of reports) for (const n of r.notes) console.log(`${r.name}: ${n}`);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.filter((r) => !r.ok).map((r) => `${r.name}: ${r.problems.join("; ")}`)).toEqual([]);
  }, 600_000);
});
