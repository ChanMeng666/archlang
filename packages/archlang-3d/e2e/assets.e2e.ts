/**
 * The public surfaces' 3D assets are fresh (public-surfaces card X4): `docs-site/public/3d/`, written
 * by `npm run gen:3d-assets`, still matches what this tree would write. `checkAssets` (in the
 * generator, so `npm run gen:3d-assets -- --check` runs the same thing) compares each plan's source
 * and imports with their recorded SHA-256, every file with its recorded bytes and its budget, the
 * GLB's content rebuilt with its recorded content hash, and each poster frame re-rendered here with
 * the recorded frame hash, each plan PNG re-rasterised (resvg, exact everywhere) with its recorded
 * pixels' hash, and each entry against its `PLANS` row (an MP4 exactly when `video`); it fails on a
 * file in the directory that no entry lists. Encoded image
 * and video bytes are never compared (encoders differ; Q21). A file written by another core or
 * package version is printed, not failed: what it shows decides, so a version bump alone stays green.
 *
 * The poster leg is exact only where the poster was rendered (each poster records its environment:
 * platform, CPU architecture, Chromium build). Elsewhere, CI's Linux runner on posters rendered on a
 * Windows workstation for one, a frame hash that differs is advisory: printed, and failed only past
 * the pixel tolerance against the committed PNG (`TOLERANCE`), because SwiftShader's rasterisation
 * differs between platforms by a few pixels while the GLB leg, which is exact everywhere, holds the
 * geometry.
 *
 * Red means: run `npm run gen:3d-assets` (Chromium and ffmpeg; `archlang3d doctor`) and commit
 * `docs-site/public/3d/`.
 */
import { describe, expect, it } from "vitest";
import { checkAssets, DEFAULT_OUT } from "../scripts/gen-3d-assets.js";

describe("gen:3d-assets freshness (cards X4, X4b)", () => {
  it("the committed 3D assets match their sources, this package, their budgets, their poster frames and plan PNGs", async () => {
    const reports = await checkAssets(DEFAULT_OUT, { render: true });
    for (const r of reports) for (const n of r.notes) console.log(`${r.name}: ${n}`);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.filter((r) => !r.ok).map((r) => `${r.name}: ${r.problems.join("; ")}`)).toEqual([]);
  }, 600_000);
});
