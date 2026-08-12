import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, renderPng } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

async function hasResvg(): Promise<boolean> {
  try {
    await import("@resvg/resvg-js" as string);
    return true;
  } catch {
    return false;
  }
}

/**
 * A missing optional dep must never yield a silently-GREEN EMPTY suite. Each case here
 * used to open with `if (!(await hasResvg())) return;`, so on any machine without the
 * raster dep all three "passed" having asserted nothing about the PNG backend —
 * including a CI run whose install step had quietly stopped pulling
 * `optionalDependencies`, which is the one situation where the silence matters.
 *
 * So the dep is probed ONCE and its absence is reported, not swallowed — the same rule
 * `test/visual.test.ts` and `editors/vscode/test/stdio.test.ts` already follow, and the
 * one `docs/testing.md` §3 states:
 *   - in CI it is REQUIRED (`npm ci` installs optionalDependencies), so a missing dep
 *     FAILS loudly as the broken-install bug it is;
 *   - locally it degrades to a VISIBLE skip in the reporter, never silence.
 */
const HAS_RESVG = await hasResvg();
const RESVG_REQUIRED = !!process.env.CI;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Render at a reduced scale: a full-scale plan is tens of megapixels (hundreds of
// MB of RGBA), which is wasteful here — these tests check format and determinism,
// not resolution.
const SCALE = 0.25;

describe("PNG backend (T6.3)", () => {
  if (!HAS_RESVG) {
    const gate = "optional raster dep @resvg/resvg-js is installed";
    if (RESVG_REQUIRED) {
      it(gate, () => {
        throw new Error(
          "optional dep @resvg/resvg-js missing in CI — install step is broken. " +
            "The PNG backend was NOT exercised (format, determinism and return type all " +
            "went unasserted). Check that the install step still pulls optionalDependencies " +
            "(npm ci without --omit=optional).",
        );
      });
    } else {
      // Visible in the reporter as a skip, with the reason in the name.
      it.skip(`${gate} (absent locally — PNG backend not exercised)`, () => {});
    }
    return;
  }

  it("renders a valid PNG with the right magic bytes", async () => {
    const { scene } = compile(example("studio.arch"), { noCache: true });
    expect(scene).toBeDefined();
    const png = await renderPng(scene!, { scale: SCALE });
    expect(png.length).toBeGreaterThan(100);
    expect(Buffer.from(png.subarray(0, 8))).toEqual(PNG_MAGIC);
  });

  it("is deterministic — same scene renders byte-identical PNG twice", async () => {
    const { scene } = compile(example("relational.arch"), { noCache: true });
    const a = await renderPng(scene!, { scale: SCALE });
    const b = await renderPng(scene!, { scale: SCALE });
    expect(Buffer.from(a)).toEqual(Buffer.from(b));
  });

  it("the happy path returns a Uint8Array (lazy optional dep present)", async () => {
    // The absent-dep path (a clear "install @resvg/resvg-js" error) is exercised
    // by the lazy import + try/catch; here we sanity-check the present path.
    const { scene } = compile(example("two-bed.arch"), { noCache: true });
    await expect(renderPng(scene!, { scale: SCALE })).resolves.toBeInstanceOf(Uint8Array);
  });
});
