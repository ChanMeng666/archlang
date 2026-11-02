/**
 * `north … hidden`, `scale … hidden`, `title hidden` (issue #405): the mark goes, the fact stays.
 *
 * Asked by consequence on compiled output, against a control that differs in that one word. The fit
 * cases are built on the arithmetic the band is reserved by, so a plan sits exactly past the fit with
 * the mark and exactly on it without.
 */

import { describe as suite, expect, it } from "vitest";
import { chromeBandDepth } from "../src/chrome-layout.js";
import { compile, describe, finish, format, lint, planToJson } from "../src/index.js";
import { parse } from "../src/parser.js";
import { SHEET_MM } from "../src/sheet.js";

const ROOM = `room id=a at (0,0) size 4000x3000 label "A"`;
const plan = (settings: string, body = ROOM): string => `plan "T" {\n  units mm\n  ${settings}\n  ${body}\n}\n`;
const svg = (src: string): string => {
  const out = compile(src);
  expect(out.errors).toEqual([]);
  return out.svg;
};

/** The arrow's group and the bar's: the backend writes each as one line of the SVG. */
type Mark = (line: string) => boolean;
const ARROW: Mark = (l) => l.startsWith("<g><polygon ") && l.includes('transform="rotate(') && l.includes(">N</text>");
const BAR: Mark = (l) =>
  l.startsWith("<g><rect ") && l.includes('text-anchor="start" dominant-baseline="central">0</text>');
const draws = (svgText: string, mark: Mark): boolean => svgText.split("\n").some(mark);
const without = (svgText: string, mark: Mark): string =>
  svgText
    .split("\n")
    .filter((l) => !mark(l))
    .join("\n");

suite("north … hidden", () => {
  it("drops the arrow and nothing else", () => {
    const plain = svg(plan("north up"));
    expect(draws(plain, ARROW)).toBe(true);
    expect(svg(plan("north up hidden"))).toBe(without(plain, ARROW));
    expect(svg(plan("north hidden"))).toBe(without(plain, ARROW));
  });

  it("keeps the bearing every fact is read from", () => {
    const body = `${ROOM}\n  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n  window at (2000,0) width 1000 wall w`;
    const bearing = describe(plan("north right", body));
    const hidden = describe(plan("north right hidden", body));
    expect(hidden).toEqual(bearing);
    expect(bearing.windows?.[0]?.facing).not.toBe(describe(plan("north up", body)).windows?.[0]?.facing);
  });

  it("is free of the order of the two statements", () => {
    const a = plan("north hidden\n  north left");
    const b = plan("north left hidden");
    expect(svg(a)).toBe(svg(b));
    expect(describe(a)).toEqual(describe(b));
  });
});

suite("scale … hidden", () => {
  it("drops the bar and frees its band, and the title row stays", () => {
    const shown = compile(plan('scale 1:50\n  title { project "P" }'));
    const hidden = compile(plan('scale 1:50 hidden\n  title { project "P" }'));
    expect(draws(shown.svg, BAR)).toBe(true);
    expect(draws(hidden.svg, BAR)).toBe(false);
    expect(hidden.scene?.chrome?.titleBlock?.rows.map((r) => r.k)).toEqual(["PROJECT", "SCALE"]);
    expect(hidden.scene?.scale).toBe("1:50");
  });

  it("alone hides the bar a plan with no scale draws", () => {
    const plain = svg(plan("north up"));
    expect(draws(plain, BAR)).toBe(true);
    expect(draws(svg(plan("scale hidden")), BAR)).toBe(false);
  });

  it("leaves the operative scale of a sheet where it was", () => {
    const facts = describe(plan("paper A4\n  scale 1:20 hidden")).sheet;
    expect(facts?.scale_denominator).toBe(20);
    expect(facts?.scale_auto).toBe(false);
  });
});

suite("title hidden", () => {
  it("drops the box and its stamped rows, and keeps the block's text in the source", () => {
    const shown = compile(plan('scale 1:50\n  title { project "P" }'));
    const hidden = compile(plan('scale 1:50\n  title { project "P" }\n  title hidden'));
    expect(shown.scene?.chrome?.titleBlock).not.toBeNull();
    expect(hidden.scene?.chrome?.titleBlock).toBeNull();
    expect(hidden.svg).not.toContain("PROJECT");
    expect(hidden.scene?.title?.project).toBe("P");
  });

  it("drops a storey's LEVEL row as well, on every page", () => {
    const level = (n: number) => `level ${n} { room id=a at (0,0) size 4000x3000 }`;
    const src = `plan "T" {\n  units mm\n  title hidden\n  ${level(1)}\n  ${level(2)}\n}\n`;
    const pages = compile(src).pages ?? [];
    expect(pages).toHaveLength(2);
    for (const p of pages) expect(p.svg).not.toContain("LEVEL");
  });

  it("silences W_TITLE_OVERFLOW: a box that is not drawn cannot overflow", () => {
    const long = `title { project "${"x".repeat(60)}" }`;
    const codes = (src: string): string[] => lint(src).map((d) => d.code ?? "");
    expect(codes(plan(long))).toContain("W_TITLE_OVERFLOW");
    expect(codes(plan(`${long}\n  title hidden`))).not.toContain("W_TITLE_OVERFLOW");
  });

  it("stops `arch finish` adding a title the plan said not to draw", () => {
    const body = `${ROOM}\n  walls from rooms exterior 200 partition 100`;
    expect(finish(plan("north up", body)).source).toContain("title {");
    expect(finish(plan("title hidden", body)).source).not.toContain("title {");
  });
});

suite("the band a hidden mark leaves is free", () => {
  // A4 landscape at 1:50: 180 mm of drawing height less the band, in plan mm.
  const SHEET = 210 - 2 * SHEET_MM.margin;
  const roomOf = (h: number): string => `room id=a at (0,0) size 4000x${h} label "A"`;
  const rows = 2; // PROJECT, SCALE
  const fullBand = chromeBandDepth(SHEET_MM.ref, rows);
  const tall = (SHEET - fullBand) * 50 + 500;

  it("the fit measures each band it draws, and none when none is drawn", () => {
    expect(chromeBandDepth(SHEET_MM.ref, 0, true)).toBe(0);
    // The bar alone holds a band open; two title rows are taller than it, so they set the depth.
    expect(chromeBandDepth(SHEET_MM.ref, 0)).toBeGreaterThan(0);
    expect(chromeBandDepth(SHEET_MM.ref, rows, true)).toBe(fullBand);
  });

  it("a plan that overflows with its marks fits without them", () => {
    const settings = (extra: string): string => `paper A4\n  scale 1:50 ${extra}\n  title { project "P" }`;
    const codes = (src: string): string[] => compile(src).diagnostics.map((d) => d.code ?? "");
    const shown = plan(settings(""), roomOf(tall));
    const none = plan(`${settings("hidden")}\n  title hidden`, roomOf(tall));
    expect(codes(shown)).toContain("W_SCALE_OVERFLOW");
    expect(describe(shown).sheet?.fits).toBe(false);
    expect(codes(none)).not.toContain("W_SCALE_OVERFLOW");
    expect(describe(none).sheet?.fits).toBe(true);
    // Not reserved, and not drawn either: the page stays the paper.
    expect(compile(none).scene?.sheet?.grown).toBe(false);
  });

  it("auto-fit chooses on the same band", () => {
    const denom = (src: string): number | undefined => describe(src).sheet?.scale_denominator;
    const shown = plan('paper A4\n  title { project "P" }', roomOf(tall));
    const none = plan('paper A4\n  scale hidden\n  title { project "P" }\n  title hidden', roomOf(tall));
    expect(denom(shown)).toBe(100);
    expect(denom(none)).toBe(50);
    // That is the one way `describe()` moves: its scale and its sheet, and nothing else.
    const rest = (src: string): unknown => {
      const { scale: _s, sheet: _h, ...others } = describe(src) as unknown as Record<string, unknown>;
      return others;
    };
    expect(rest(none)).toEqual(rest(shown));
  });

  it("a hidden bar does not hold the title box up on a sheet's corner", () => {
    const scene = compile(plan('paper A4\n  scale 1:50 hidden\n  title { project "P" }')).scene!;
    const box = scene.chrome!.titleBlock!;
    const page = scene.sheet!.page;
    expect(box.y0 + box.h).toBeCloseTo(page.y + page.h - scene.sizes.margin, 6);
  });
});

suite("the word in the grammar", () => {
  it("prints back and stays a fixed point", () => {
    const src = plan('scale 1:50 hidden\n  north 30 hidden\n  title hidden\n  title { project "P" }');
    const once = format(src);
    expect(once).toContain("scale 1:50 hidden");
    expect(once).toContain("north 30 hidden");
    expect(once).toContain("title hidden");
    expect(format(once)).toBe(once);
    expect(svg(once)).toBe(svg(src));
  });

  it("prints back a bare `scale hidden`, and `north hidden` as its default direction", () => {
    const once = format(plan("scale hidden\n  north hidden"));
    expect(once).toContain("scale hidden");
    expect(once).toContain("north up hidden");
    expect(parse(once).plan?.hide).toEqual({ scale: true, north: true });
  });

  it("leaves `title` before an assignment the error it was", () => {
    const out = compile(plan("let hidden = 1\n  title hidden = 3"));
    expect(out.diagnostics.find((d) => d.code === "E_PARSE")).toBeDefined();
  });

  it("stands on its statement's line: on the next one it is the refused statement it was", () => {
    const src = plan("north up\n  hidden");
    expect(compile(src).diagnostics.find((d) => d.code === "E_PARSE")?.message).toContain('"hidden"');
    expect(compile(plan("scale 1:50\n  hidden")).diagnostics.some((d) => d.code === "E_PARSE")).toBe(true);
    expect(compile(plan("title\n  hidden")).diagnostics.some((d) => d.code === "E_PARSE")).toBe(true);
    expect(parse(plan("north up\n  hidden")).plan?.hide).toBeUndefined();
  });

  it("is refused in a storey, as every plan-level setting is", () => {
    const src = `plan "T" {\n  units mm\n  level 1 {\n    north hidden\n    room id=a at (0,0) size 1000x1000\n  }\n}\n`;
    expect(compile(src).errors.length).toBeGreaterThan(0);
  });

  it("is listed in Plan JSON's `dropped`, with what it hid", () => {
    const row = planToJson(plan("scale hidden\n  north hidden")).dropped?.find((r) => r.clause === "hidden");
    expect(row).toEqual({ clause: "hidden", count: 2, ids: ["scale", "north"] });
  });
});
