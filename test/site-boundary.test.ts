/**
 * The `site { … boundary … }` lot line (v1.31).
 *
 * `site` shipped in v1.25 as a block that draws NOTHING and moves nothing, and that law
 * is pinned by `test/site.test.ts`. `boundary` is the first field that breaks it — it
 * draws a property line and it grows the page — so the first thing this suite establishes
 * is that the law still holds for every `site` block that does not use it.
 */

import { describe, expect, it } from "vitest";
import { compile, describe as describePlan } from "../src/index.js";
import { format } from "../src/format.js";

const BOX = `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }`;
const ROOM = `  room id=r1 at (0,0) size 8000x5000 label "Hall" uses living`;

const plan = (site: string, body = `${BOX}\n${ROOM}`): string =>
  `plan "Lot" {\n  units mm\n  north up\n${site}${body}\n}\n`;

const errorsOf = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "");

const LOT = `  site {\n    street south\n    boundary (-4000,-4000) (14000,-4000) (14000,11000) (-4000,11000)\n  }\n`;
const NO_LOT = `  site {\n    street south\n  }\n`;

// ---------------------------------------------------------------------------
// 1 — the v1.25 law is intact
// ---------------------------------------------------------------------------

describe("site boundary — a `site` without one still draws and describes exactly as before", () => {
  it("adding `street`/`hemisphere` alone changes not one byte of the SVG", () => {
    const without = compile(plan(""), { noCache: true }).svg;
    const with_ = compile(plan(NO_LOT), { noCache: true }).svg;
    expect(with_).toBe(without);
  });

  it("…and reports no lot facts", () => {
    const s = describePlan(plan(NO_LOT));
    expect(s.site).toBeDefined();
    expect(s.site!).not.toHaveProperty("lot_area_m2");
    expect(s.site!).not.toHaveProperty("lot_bbox");
  });

  it("the five direction names are untouched by a boundary", () => {
    const a = describePlan(plan(NO_LOT)).site!;
    const b = describePlan(plan(LOT)).site!;
    for (const k of ["street", "back", "equator_side", "sunrise_side", "sunset_side", "hemisphere"] as const) {
      expect(b[k], k).toBe(a[k]);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 — it draws, as a property line
// ---------------------------------------------------------------------------

describe("site boundary — the drawing", () => {
  it("lands on the C-PROP CAD layer", () => {
    expect(compile(plan(LOT), { noCache: true }).svg).toContain('<g id="C-PROP"');
    expect(compile(plan(NO_LOT), { noCache: true }).svg).not.toContain("C-PROP");
  });

  it("draws as a dash-DOT line, not as a plain dash", () => {
    const svg = compile(plan(LOT), { noCache: true }).svg;
    const group = /<g id="C-PROP"[\s\S]*?<\/g>/.exec(svg)![0];
    const dash = /stroke-dasharray="([^"]+)"/.exec(group)![1]!;
    // The `center` line type resolves to a four-number long-short-short pattern; a plain
    // `dashed` would be two. That difference IS the property-line convention.
    expect(dash.split(" ")).toHaveLength(4);
  });

  it("every other drawn layer is byte-identical — the lot line is purely additive", () => {
    // Taken on a `paper` plan, where the render sizes come from the SHEET, so nothing
    // rescales and the claim is exact. Without that the page grows and every stroke moves,
    // which would hide a real change inside a size difference.
    const sheet = `  paper A2 landscape\n  scale 1:100\n`;
    const layers = (svg: string): Map<string, string> =>
      new Map([...svg.matchAll(/<g id="([^"]+)"[\s\S]*?<\/g>/g)].map((m) => [m[1]!, m[0]!]));
    const a = layers(compile(plan(sheet + NO_LOT), { noCache: true }).svg);
    const b = layers(compile(plan(sheet + LOT), { noCache: true }).svg);
    expect([...b.keys()].filter((k) => !a.has(k))).toEqual(["C-PROP"]);
    for (const [name, group] of a) expect(b.get(name), `layer ${name} moved`).toBe(group);
  });

  it("joins the page bounds — a lot larger than the building grows the drawing", () => {
    const vb = (src: string): string => /viewBox="([^"]+)"/.exec(compile(src, { noCache: true }).svg)![1]!;
    expect(vb(plan(LOT))).not.toBe(vb(plan(NO_LOT)));
  });

  it("renders deterministically", () => {
    expect(compile(plan(LOT), { noCache: true }).svg).toBe(compile(plan(LOT), { noCache: true }).svg);
  });
});

// ---------------------------------------------------------------------------
// 3 — it measures
// ---------------------------------------------------------------------------

describe("site boundary — the lot facts", () => {
  it("reports the EXACT shoelace area, in m² to 2 dp", () => {
    // 18 m x 15 m.
    expect(describePlan(plan(LOT)).site!.lot_area_m2).toBe(270);
  });

  it("a splayed lot is measured by its ring, not by its bounding box", () => {
    // A right triangle 12 m x 9 m = 54 m²; its bounding box is 108.
    const site = `  site {\n    street north\n    boundary (0,0) (12000,0) (0,9000)\n  }\n`;
    const s = describePlan(plan(site)).site!;
    expect(s.lot_area_m2).toBe(54);
    expect(s.lot_bbox).toEqual({ x: 0, y: 0, w: 12000, h: 9000 });
  });

  it("a concave (flag) lot is measured exactly too", () => {
    // An L: a 10x10 square with a 6x6 bite out — 100 - 36 = 64 m².
    const site =
      `  site {\n    street north\n` +
      `    boundary (0,0) (10000,0) (10000,4000) (4000,4000) (4000,10000) (0,10000)\n  }\n`;
    expect(describePlan(plan(site)).site!.lot_area_m2).toBe(64);
  });

  it("the fields come in either order inside the block", () => {
    const a = `  site {\n    street south\n    boundary (0,0) (9000,0) (9000,9000)\n  }\n`;
    const b = `  site {\n    boundary (0,0) (9000,0) (9000,9000)\n    street south\n  }\n`;
    expect(JSON.stringify(describePlan(plan(a)).site)).toBe(JSON.stringify(describePlan(plan(b)).site));
  });
});

// ---------------------------------------------------------------------------
// 4 — the two refusals
// ---------------------------------------------------------------------------

describe("site boundary — refuses rather than approximating", () => {
  it("E_SITE_BOUNDARY_DEGENERATE on an all-collinear ring", () => {
    const site = `  site {\n    street north\n    boundary (0,0) (5000,0) (10000,0)\n  }\n`;
    expect(errorsOf(plan(site))).toContain("E_SITE_BOUNDARY_DEGENERATE");
  });

  it("E_SITE_BOUNDARY_SELF_INTERSECT on a bow-tie", () => {
    const site = `  site {\n    street north\n    boundary (0,0) (10000,10000) (10000,0) (0,10000)\n  }\n`;
    expect(errorsOf(plan(site))).toContain("E_SITE_BOUNDARY_SELF_INTERSECT");
  });

  it("a refused ring draws NOTHING — no half-valid property line reaches the sheet", () => {
    const site = `  site {\n    street north\n    boundary (0,0) (10000,10000) (10000,0) (0,10000)\n  }\n`;
    expect(compile(plan(site), { noCache: true }).svg).not.toContain("C-PROP");
  });

  it("fewer than three points is a parse error, before any of that", () => {
    const site = `  site {\n    street north\n    boundary (0,0) (9000,0)\n  }\n`;
    const d = compile(plan(site), { noCache: true }).diagnostics;
    expect(d.some((x) => /at least 3 points/.test(x.message))).toBe(true);
  });

  it("an unknown site field still names all three available ones", () => {
    const site = `  site {\n    street north\n    bounds (0,0) (9000,0) (9000,9000)\n  }\n`;
    const d = compile(plan(site), { noCache: true }).diagnostics;
    expect(d.some((x) => /available: street, hemisphere, boundary/.test(x.message))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5 — `arch fmt`
// ---------------------------------------------------------------------------

describe("site boundary — `arch fmt` round-trips it", () => {
  it("re-emits the ring, and dropping it would be a semantic change", () => {
    const src = plan(LOT);
    const once = format(src);
    expect(once).toContain("boundary (");
    expect(format(once)).toBe(once);
    expect(compile(once, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
    expect(JSON.stringify(describePlan(once))).toBe(JSON.stringify(describePlan(src)));
  });

  it("a `site` with no boundary does not grow one", () => {
    expect(format(plan(NO_LOT))).not.toContain("boundary");
  });
});
