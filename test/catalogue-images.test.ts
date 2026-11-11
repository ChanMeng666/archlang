/**
 * The symbol catalogue's pictures (product-roadmap card RM8.5): every fixture family has its
 * generated image in `docs-site/public/catalogue/` (its 2D symbol and, in the same picture, its 3D
 * preview, by `scripts/specimen.ts catalogue`), `docs/furniture.md` shows each one once beside the
 * PS-D12 line and the limits line, and the tool stays out of the drift gate. The family list is
 * `CANONICAL_FIXTURES`, never retyped; no pixel is compared (the tool's determinism is proved by
 * running it twice, in the PR that changes it).
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PREVIEW_LABEL, PREVIEW_LIMITS } from "../packages/archlang-3d/src/replay/payload.js";
import { GENERATORS } from "../scripts/generators.js";
import { CATALOGUE_HALF, SPECIMEN_SIZE, specimen, specimenSize } from "../scripts/specimen.js";
import { CANONICAL_FIXTURES } from "../src/elements/fixtures-glyphs.js";
import { defaultFootprint } from "../src/fixtures-catalog.js";
import { compile } from "../src/index.js";

const DIR = "docs-site/public/catalogue";
const doc = readFileSync("docs/furniture.md", "utf8").replace(/\r\n/g, "\n");

/** A PNG's size from its IHDR chunk (bytes 16–23), after checking the signature. */
function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect(b.subarray(0, 8).toString("hex"), `${file} is a PNG`).toBe("89504e470d0a1a0a");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("the symbol catalogue's pictures", () => {
  it("every family has its image, and nothing else is in the folder", () => {
    const want = CANONICAL_FIXTURES.map((f) => `${f}.png`).sort();
    expect(readdirSync(DIR).sort()).toEqual(want);
    for (const f of want) {
      expect(pngSize(`${DIR}/${f}`), f).toEqual([2 * CATALOGUE_HALF.width, CATALOGUE_HALF.height]);
    }
  });

  it("docs/furniture.md shows each family's image exactly once", () => {
    for (const f of CANONICAL_FIXTURES) {
      expect(doc.split(`src="/catalogue/${f}.png"`).length - 1, f).toBe(1);
    }
    const shown = [...doc.matchAll(/src="\/catalogue\/([a-z_]+)\.png"/g)].map((m) => m[1]);
    expect(shown.length).toBe(CANONICAL_FIXTURES.length);
  });

  it("the 3D preview is introduced by its two lines, before the first picture (PS-D12)", () => {
    const first = doc.indexOf('src="/catalogue/');
    for (const line of [PREVIEW_LABEL, PREVIEW_LIMITS]) {
      const at = doc.indexOf(line);
      expect(at, line.slice(0, 40)).toBeGreaterThan(0);
      expect(at).toBeLessThan(first);
    }
    expect(doc.slice(0, first)).toContain("](https://archlang.uk/3d)");
  });

  it("every family has a specimen size, and the size table names only families without a footprint", () => {
    for (const f of CANONICAL_FIXTURES) expect(() => specimenSize(f), f).not.toThrow();
    for (const f of Object.keys(SPECIMEN_SIZE)) {
      expect(CANONICAL_FIXTURES, f).toContain(f);
      expect(defaultFootprint(f), `${f} has a catalogued footprint`).toBeNull();
    }
  });

  it("every specimen plan compiles with no error, under the scales and themes the sheets use", () => {
    for (const f of CANONICAL_FIXTURES) {
      for (const [scale, theme] of [
        [50, "default"],
        [100, "rendered"],
      ] as const) {
        const r = compile(specimen(f, scale, theme).source);
        expect(
          r.errors.map((e) => e.code),
          `${f} 1:${scale} ${theme}`,
        ).toEqual([]);
      }
    }
  });

  it("the tool is not in the drift gate (backlog D.8)", () => {
    for (const g of GENERATORS) {
      expect(g.script, g.script).not.toMatch(/specimen/);
      for (const a of g.artifacts) expect(a, g.script).not.toMatch(/catalogue\//);
    }
  });
});
