/**
 * Card 3D.1: `checkAssets` decodes the committed `<name>.plan.png` and compares its pixels with the
 * manifest's `pixelsSha256`, so a plan PNG swapped together with its manifest `sha256` and `bytes`
 * fails the check. Before the card it compared the file only by SHA-256 with the manifest and
 * re-rasterised the source to the recorded pixel hash, so such a swap passed.
 *
 * A one-entry copy of the committed assets in a temporary directory (a non-default directory, so
 * the `PLANS` rows are not asked for); `render: false`, so no browser: the GLB rebuild and the
 * plan PNG's re-raster are resvg and pure code.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AssetManifest, checkAssets, DEFAULT_OUT, readManifest } from "../scripts/gen-3d-assets.js";

const NAME = "bungalow";
const OTHER = "corner-cafe";
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A directory holding `NAME`'s committed files and a manifest with only its entry. */
function oneEntryCopy(): { dir: string; manifest: AssetManifest } {
  const all = readManifest(DEFAULT_OUT);
  if (!all) throw new Error(`no manifest in ${DEFAULT_OUT}`);
  const entry = all.assets.find((a) => a.name === NAME);
  if (!entry) throw new Error(`no ${NAME} entry`);
  const dir = mkdtempSync(join(tmpdir(), "archlang-3d-plan-png-"));
  dirs.push(dir);
  for (const f of entry.files) copyFileSync(join(DEFAULT_OUT, f.path), join(dir, f.path));
  const manifest: AssetManifest = structuredClone({ ...all, assets: [entry] });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { dir, manifest };
}

const planProblems = (problems: string[]): string[] => problems.filter((p) => p.includes(".plan.png"));

describe("checkAssets decodes the committed plan PNG (card 3D.1)", () => {
  it("an untouched copy passes the plan PNG legs", async () => {
    const { dir } = oneEntryCopy();
    const [report] = (await checkAssets(dir, { render: false })).filter((r) => r.name === NAME);
    expect(report).toBeDefined();
    expect(planProblems(report!.problems)).toEqual([]);
  }, 120_000);

  it("a plan PNG swapped together with its manifest sha256 and bytes fails", async () => {
    const { dir, manifest } = oneEntryCopy();
    const planFile = `${NAME}.plan.png`;
    const swapped = readFileSync(join(DEFAULT_OUT, `${OTHER}.plan.png`));
    writeFileSync(join(dir, planFile), swapped);
    const entry = manifest.assets[0]!;
    entry.plan!.sha256 = createHash("sha256").update(swapped).digest("hex");
    for (const f of entry.files) if (f.path === planFile) f.bytes = statSync(join(dir, planFile)).size;
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const [report] = (await checkAssets(dir, { render: false })).filter((r) => r.name === NAME);
    expect(report?.ok).toBe(false);
    const plan = planProblems(report!.problems);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatch(/^bungalow\.plan\.png decodes to pixels [0-9a-f]{12}…, not the recorded /);
  }, 120_000);

  it("a plan PNG that does not decode fails without throwing", async () => {
    const { dir, manifest } = oneEntryCopy();
    const planFile = `${NAME}.plan.png`;
    const junk = Buffer.from("not a png");
    writeFileSync(join(dir, planFile), junk);
    const entry = manifest.assets[0]!;
    entry.plan!.sha256 = createHash("sha256").update(junk).digest("hex");
    for (const f of entry.files) if (f.path === planFile) f.bytes = junk.length;
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const [report] = (await checkAssets(dir, { render: false })).filter((r) => r.name === NAME);
    expect(report?.ok).toBe(false);
    expect(planProblems(report!.problems)).toEqual([
      expect.stringMatching(/^bungalow\.plan\.png does not decode as a PNG/),
    ]);
  }, 120_000);
});
