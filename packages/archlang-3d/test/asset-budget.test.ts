/**
 * The 3D assets' PNGs have a byte budget too (card 3D.2): the budget table capped the WebP, MP4 and
 * GLB only, so a plan PNG (an A1 sheet) or a poster PNG could grow unchecked. The generator refuses
 * to write a PNG over its cap (`assertWithinBudget`) and `--check` (`checkAssets`) fails a committed
 * one. Light: `checkAssets` with `render: false` and no `plan` entry needs no browser.
 */
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertWithinBudget,
  BUDGET,
  budgetOf,
  checkAssets,
  DEFAULT_OUT,
  readManifest,
  writeManifest,
} from "../scripts/gen-3d-assets.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("the PNG budgets (card 3D.2)", () => {
  it("every asset kind the generator writes has a finite cap; the plan PNG's is 300 KB", () => {
    expect(budgetOf("studio.plan.png")).toBe(300_000);
    expect(budgetOf("studio.poster.png")).toBe(BUDGET.posterPng);
    expect(budgetOf("hillside-villa.poster-full.png")).toBe(BUDGET.posterPng);
    expect(budgetOf("studio.poster.webp")).toBe(BUDGET.webp);
    expect(budgetOf("studio.replay.mp4")).toBe(BUDGET.mp4);
    expect(budgetOf("studio.glb")).toBe(BUDGET.glb);
  });

  it("the generator refuses a PNG over its cap", () => {
    expect(() => assertWithinBudget("a.plan.png", BUDGET.planPng)).not.toThrow();
    expect(() => assertWithinBudget("a.plan.png", BUDGET.planPng + 1)).toThrow(/over its 300000-byte budget/);
    expect(() => assertWithinBudget("a.poster.png", BUDGET.posterPng + 1)).toThrow(/budget/);
  });

  it("--check fails a committed plan or poster PNG over its cap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang-3d-budget-"));
    dirs.push(dir);
    const big = (file: string, bytes: number) => {
      writeFileSync(join(dir, file), new Uint8Array(bytes));
      return { path: file, bytes, archlang: "x", archlang3d: "x" };
    };
    writeManifest(dir, {
      about: "test",
      assets: [
        {
          name: "x",
          source: { path: "examples/studio.arch", sha256: "0" },
          posters: [],
          files: [big("x.plan.png", BUDGET.planPng + 1), big("x.poster.png", BUDGET.posterPng + 1)],
        },
      ],
    } as unknown as Parameters<typeof writeManifest>[1]);
    const [report] = await checkAssets(dir, { render: false });
    expect(report?.problems).toContain(`x.plan.png is over its ${BUDGET.planPng}-byte budget`);
    expect(report?.problems).toContain(`x.poster.png is over its ${BUDGET.posterPng}-byte budget`);
  });

  it("every committed PNG is within its cap", () => {
    const m = readManifest(DEFAULT_OUT);
    const pngs = (m?.assets ?? []).flatMap((a) => a.files.map((f) => f.path)).filter((f) => f.endsWith(".png"));
    expect(pngs.length).toBeGreaterThan(0);
    for (const f of pngs) {
      const size = statSync(join(DEFAULT_OUT, f)).size;
      expect(size, f).toBeLessThanOrEqual(budgetOf(f));
      expect(readFileSync(join(DEFAULT_OUT, f)).byteLength).toBe(size);
    }
  });
});
