import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, renderAscii } from "../src/index.js";
import type { Scene } from "../src/index.js";

/**
 * ASCII text backend (`renderAscii` / `arch compile -f txt` / `arch preview --ascii`).
 *
 * Byte-asserted goldens (like the visual suite) guard the fixed mm→cell mapping and
 * glyph choices; the rest cover determinism, the cols/charset knobs, and degenerate
 * scenes. The text renderer uses the opt-in `annotate` metadata to place furniture
 * markers, so goldens compile with `{ annotate: true }` — the same options the CLI's
 * `txt` path uses.
 *
 * Update goldens intentionally with:  ASCII_UPDATE=1 vitest run test/ascii.test.ts
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string): string => readFileSync(join(__dirname, "..", "examples", name), "utf8");
const goldenDir = join(__dirname, "__ascii__");
const goldenPath = (name: string): string => join(goldenDir, `${name}.txt`);
const UPDATE = process.env.ASCII_UPDATE === "1";

/** Compile an example to the annotated Scene the txt backend consumes. */
function sceneOf(source: string): Scene {
  const { scene, errors } = compile(source, { annotate: true, noCache: true });
  expect(errors).toEqual([]);
  return scene!;
}

const EXAMPLES = ["studio.arch", "two-bed.arch"];

describe("ascii backend — golden text plans", () => {
  for (const name of EXAMPLES) {
    it(`${name} matches its golden`, () => {
      const actual = renderAscii(sceneOf(example(name)));
      if (UPDATE) {
        mkdirSync(goldenDir, { recursive: true });
        writeFileSync(goldenPath(name), actual);
        return;
      }
      expect(actual).toBe(readFileSync(goldenPath(name), "utf8"));
    });
  }
});

describe("ascii backend — determinism & invariants", () => {
  const scene = sceneOf(example("studio.arch"));

  it("renders byte-identically across runs", () => {
    expect(renderAscii(scene)).toBe(renderAscii(scene));
  });

  it("ends with a single trailing newline", () => {
    const out = renderAscii(scene);
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  it("honours --cols (no line exceeds the requested width)", () => {
    for (const cols of [40, 60, 100]) {
      const lines = renderAscii(scene, { cols }).split("\n");
      const widest = Math.max(...lines.map((l) => [...l].length));
      expect(widest).toBeLessThanOrEqual(cols);
    }
  });

  it("caps rows and preserves aspect for a wildly tall plan", () => {
    const tall = compile(`plan "Tall" { room at (0,0) size 1000x40000 label "Shaft" }`, {
      annotate: true,
      noCache: true,
    }).scene!;
    const rows = renderAscii(tall, { cols: 80 }).replace(/\n$/, "").split("\n").length;
    expect(rows).toBeLessThanOrEqual(48); // ROW_CAP
    expect(rows).toBeGreaterThan(1);
  });

  it("unicode charset uses box-drawing glyphs; ascii charset is 7-bit", () => {
    const uni = renderAscii(scene, { charset: "unicode" });
    const asc = renderAscii(scene, { charset: "ascii" });
    expect(/[─│┼·]/.test(uni)).toBe(true);
    expect(/[─│┼·]/.test(asc)).toBe(false);
    // Every ascii-charset code point is 7-bit ASCII (labels aside — studio's are ASCII).
    expect([...asc].every((ch) => ch.charCodeAt(0) < 128)).toBe(true);
    // The ascii wall/opening glyphs are present.
    expect(asc).toContain("|");
    expect(asc).toContain("-");
  });

  it("draws room labels, wall linework, doors and windows for studio", () => {
    const out = renderAscii(scene);
    for (const label of ["Living / Kitchen", "Bedroom", "Hall", "Bath"]) expect(out).toContain(label);
    expect(out).toContain("·"); // a door opening
    expect(out).toContain("="); // a window
    expect(out).toContain("┼"); // a wall crossing
  });
});

describe("ascii backend — degenerate scenes", () => {
  it("a single room shows its label and no wall glyphs", () => {
    const scene = compile(`plan "One" { room at (0,0) size 4000x3000 label "Solo" }`, {
      annotate: true,
      noCache: true,
    }).scene!;
    const out = renderAscii(scene);
    expect(out).toContain("Solo");
    expect(out.endsWith("\n")).toBe(true);
    expect(/[─│┼]/.test(out)).toBe(false); // no walls in this plan
  });

  it("an element-free plan renders a blank grid without throwing", () => {
    const scene = compile(`plan "Empty" {}`, { annotate: true, noCache: true }).scene!;
    const out = renderAscii(scene);
    expect(typeof out).toBe("string");
    expect(out.endsWith("\n")).toBe(true);
    expect(out.trim()).toBe(""); // nothing to draw
  });
});
