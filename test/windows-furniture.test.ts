import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("window — placement & hosting", () => {
  const wallOnly = 'plan "W" { wall exterior thickness 200 { (0,0) (4000,0) } }';
  const onWall =
    'plan "W" { wall exterior thickness 200 { (0,0) (4000,0) } window at (2000,0) width 1200 wall exterior }';

  it("renders glazing panes when the window lies on a wall", () => {
    const base = compile(wallOnly, { noCache: true });
    const win = compile(onWall, { noCache: true });
    expect(win.errors).toEqual([]);
    // A hosted window contributes a cover polygon + frame/pane lines, so it
    // adds <line> elements beyond the bare wall.
    expect(count(win.svg, "<line")).toBeGreaterThan(count(base.svg, "<line"));
    expect(win.warnings.some((w) => /does not lie on any wall/.test(w.message))).toBe(false);
  });

  it("warns (W_WINDOW_OFF_WALL) when the window is off every wall", () => {
    const src =
      'plan "W" { wall exterior thickness 200 { (0,0) (4000,0) } window id=w at (2000,2000) width 1200 }';
    const { warnings, errors, diagnostics } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => /Window "w" does not lie on any wall/.test(w.message))).toBe(true);
    expect(diagnostics.some((d) => d.code === "W_WINDOW_OFF_WALL")).toBe(true);
  });

  it("errors (E_WINDOW_WIDTH) on a non-positive width", () => {
    const src =
      'plan "W" { wall exterior thickness 200 { (0,0) (4000,0) } window at (2000,0) width 0 wall exterior }';
    const { errors, svg } = compile(src, { noCache: true });
    expect(svg).toBe("");
    expect(errors.some((e) => /must have a positive width/.test(e.message))).toBe(true);
  });
});

describe("furniture — rect + label", () => {
  it("draws an outlined polygon and a centered label", () => {
    const src = 'plan "F" { furniture sofa at (1000,2000) size 2000x900 label "Sofa" }';
    const { svg, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain("<polygon"); // furniture body
    expect(svg).toContain(">Sofa</text>"); // label text
    // Label is centered on the rect: cx = 1000 + 2000/2 = 2000 (user mm units,
    // then transformed to SVG space — assert the label exists with a y/x text node).
    expect(svg).toMatch(/<text x="[\d.]+" y="[\d.]+"[^>]*>Sofa<\/text>/);
  });

  it("XML-escapes furniture labels", () => {
    const src = 'plan "F" { furniture sofa at (0,0) size 1000x1000 label "A & <B>" }';
    const { svg, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain("A &amp; &lt;B&gt;");
  });

  it("errors (E_FURN_SIZE) on a non-positive size", () => {
    const src = 'plan "F" { furniture sofa at (0,0) size 0x900 label "Sofa" }';
    const { errors, svg } = compile(src, { noCache: true });
    expect(svg).toBe("");
    expect(errors.some((e) => /Furniture ".+" must have a positive size/.test(e.message))).toBe(true);
  });
});
