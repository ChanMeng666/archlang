import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, renderPng } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

/** Skip gracefully when the optional raster dep is absent (mirrors export-pdf.test). */
async function hasResvg(): Promise<boolean> {
  try {
    await import("@resvg/resvg-js" as string);
    return true;
  } catch {
    return false;
  }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Render at a reduced scale: a full-scale plan is tens of megapixels (hundreds of
// MB of RGBA), which is wasteful here — these tests check format and determinism,
// not resolution.
const SCALE = 0.25;

describe("PNG backend (T6.3)", () => {
  it("renders a valid PNG with the right magic bytes", async () => {
    if (!(await hasResvg())) return; // optional dep absent — skip
    const { scene } = compile(example("studio.arch"), { noCache: true });
    expect(scene).toBeDefined();
    const png = await renderPng(scene!, { scale: SCALE });
    expect(png.length).toBeGreaterThan(100);
    expect(Buffer.from(png.subarray(0, 8))).toEqual(PNG_MAGIC);
  });

  it("is deterministic — same scene renders byte-identical PNG twice", async () => {
    if (!(await hasResvg())) return;
    const { scene } = compile(example("relational.arch"), { noCache: true });
    const a = await renderPng(scene!, { scale: SCALE });
    const b = await renderPng(scene!, { scale: SCALE });
    expect(Buffer.from(a)).toEqual(Buffer.from(b));
  });

  it("the happy path returns a Uint8Array (lazy optional dep present)", async () => {
    // The absent-dep path (a clear "install @resvg/resvg-js" error) is exercised
    // by the lazy import + try/catch; here we sanity-check the present path.
    if (!(await hasResvg())) return;
    const { scene } = compile(example("two-bed.arch"), { noCache: true });
    await expect(renderPng(scene!, { scale: SCALE })).resolves.toBeInstanceOf(Uint8Array);
  });
});
