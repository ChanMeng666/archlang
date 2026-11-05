import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, THEMES } from "archlang";
import { buildReviewSheet } from "../../src/cli/review.js";
import { CHECKS_CLASS, HIGHLIGHT_CLASS, highlightMarkup, ringsOverlay, withOverlay } from "../src/checks-overlay.js";

/** A deliberate, fixable plan (the e2e spec's): a 600 mm entrance door and a store with no door. */
const PLAN = `plan "Checks" {
  units mm
  grid 100
  wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall interior thickness 100 { (4000,0) (4000,4000) }
  room id=main at (0,0) size 4000x4000 label "Living" uses living
  room id=store at (4000,0) size 2000x4000 label "Store" uses storage
  door at (2000,4000) width 600 wall exterior hinge left swing in
  window at (0,2000) width 1500 wall exterior
}`;

const sheetOf = (src: string) => {
  const s = buildReviewSheet(src);
  if ("kind" in s) throw new Error(s.kind);
  return s;
};
const viewBox = (svg: string) => /viewBox="([^"]+)"/.exec(svg)![1];

describe("the Checks overlay", () => {
  it("is the review sheet's rings and tags, byte for byte", () => {
    const sheet = sheetOf(PLAN);
    expect(sheet.marks.length).toBeGreaterThan(0);
    const o = ringsOverlay(sheet.svg);
    const rings = /<g id="rv-rings">([\s\S]*?)<\/g>/.exec(sheet.svg)![1]!;
    const tags = /<g id="rv-tags">([\s\S]*?)<\/g>/.exec(sheet.svg)![1]!;
    expect(rings.length).toBeGreaterThan(0);
    expect(o).toBe(
      `<g class="${CHECKS_CLASS}" pointer-events="none"><g class="pg-checks-rings">${rings}</g>` +
        `<g class="pg-checks-tags">${tags}</g><g class="${HIGHLIGHT_CLASS}"></g></g>`,
    );
  });

  it("refuses a sheet without its groups rather than drawing nothing", () => {
    expect(() => ringsOverlay("<svg></svg>")).toThrow(/rv-rings/);
  });

  it("goes last inside the drawing's root, and nowhere else", () => {
    const svg = compile(PLAN, { noCache: true, annotate: true }).svg;
    const out = withOverlay(svg, "<g>X</g>");
    expect(out).toBe(
      `${svg.slice(0, svg.lastIndexOf("</svg>"))}<g>X</g></svg>${svg.slice(svg.lastIndexOf("</svg>") + 6)}`,
    );
  });

  // The rings are in the review sheet's plan coordinates; they line up on screen only because the
  // drawing on screen (annotated, any render theme) has the same viewBox as the sheet's plan.
  it.each([
    ["the fixture", PLAN],
    ["laneway-house", readFileSync(new URL("../../examples/laneway-house.arch", import.meta.url), "utf8")],
    ["hillside-villa", readFileSync(new URL("../../examples/hillside-villa.arch", import.meta.url), "utf8")],
  ])("%s: the drawing on screen has the sheet's viewBox under every theme", (_, src) => {
    const sheet = sheetOf(src);
    const nested = /<svg x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" viewBox="([^"]+)">/.exec(sheet.svg)![1];
    const plain = compile(src, { noCache: true });
    const page = (c: typeof plain) => c.pages?.[0]?.svg ?? c.svg;
    for (const theme of [undefined, ...Object.values(THEMES)]) {
      const shown = compile(src, { noCache: true, annotate: true, ...(theme ? { theme } : {}) });
      expect(viewBox(page(shown))).toBe(viewBox(page(plain)));
    }
    // The sheet prints numbers through fmt2; the plan's viewBox is the same numbers.
    expect(nested.split(/\s+/).map(Number)).toEqual(viewBox(page(plain))!.split(/\s+/).map(Number));
  });

  it("highlights each box with a fixed-width outline", () => {
    expect(highlightMarkup([{ x: 1.234, y: 2, w: 3, h: 4 }])).toBe(
      `<rect x="1.23" y="2" width="3" height="4" fill="none" stroke="#1d4ed8" stroke-width="4" vector-effect="non-scaling-stroke" stroke-dasharray="8 4"/>`,
    );
    expect(highlightMarkup([])).toBe("");
  });
});
