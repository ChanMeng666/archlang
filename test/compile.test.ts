import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, clearCache } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const studio = readFileSync(join(__dirname, "..", "examples", "studio.arch"), "utf8");

describe("compile — valid studio", () => {
  it("produces SVG with no errors", () => {
    const { svg, errors } = compile(studio, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("renders the expected professional elements", () => {
    const { svg } = compile(studio, { noCache: true });
    expect(svg).toContain("Bedroom"); // room label
    expect(svg).toContain('id="poche"'); // wall poché pattern
    expect(svg).toContain('<path d="M '); // door swing arc
    expect(svg).toMatch(/A \d/); // SVG elliptical-arc command in the swing
    expect(svg).toContain(" m</text>"); // scale bar label
    expect(svg).toContain(">N</text>"); // north arrow
    expect(svg).toContain("Studio Apartment"); // title block
    expect(svg).toContain("m²"); // computed room area
  });

  it("computes room area from dimensions", () => {
    const { svg } = compile(studio, { noCache: true });
    // Bedroom 3000x4000 mm = 12.0 m²
    expect(svg).toContain("12.0 m²");
  });
});

describe("compile — determinism", () => {
  it("is byte-for-byte stable across calls", () => {
    clearCache();
    const a = compile(studio, { noCache: true });
    const b = compile(studio, { noCache: true });
    expect(a.svg).toBe(b.svg);
  });

  it("returns the cached object on repeat (no noCache)", () => {
    clearCache();
    const a = compile(studio);
    const b = compile(studio);
    expect(a).toBe(b);
  });
});

describe("compile — grid snap", () => {
  const src = `plan "G" { grid 100 room id=r at (123,77) size 2960x1010 label "R" }`;

  it("snaps off-grid coordinates to the module in the IR", () => {
    const { plan } = parse(src);
    const { ir, diagnostics } = resolve(plan!);
    expect(diagnostics).toEqual([]);
    const room = ir.elements.find((e) => e.kind === "room") as { at: unknown; size: unknown };
    expect(room.at).toEqual({ x: 100, y: 100 });
    expect(room.size).toEqual({ w: 3000, h: 1000 });
  });

  it("does not mutate the input AST (resolve is pure)", () => {
    const { plan } = parse(src);
    resolve(plan!);
    // AST holds expressions; resolve never writes snapped numbers back into it.
    const room = plan!.body[0] as { at: { x: unknown; y: unknown }; size: { w: unknown; h: unknown } };
    expect(room.at.x).toEqual({ t: "num", value: 123 });
    expect(room.at.y).toEqual({ t: "num", value: 77 });
    expect(room.size.w).toEqual({ t: "num", value: 2960 });
    expect(room.size.h).toEqual({ t: "num", value: 1010 });
  });
});

describe("compile — string escaping", () => {
  it("XML-escapes user-supplied labels", () => {
    const src = `plan "X" { room id=r at (0,0) size 1000x1000 label "A & B <\\"C\\">" }`;
    const { svg, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain("A &amp; B &lt;&quot;C&quot;&gt;");
    expect(svg).not.toContain("A & B <");
  });
});

describe("compile — error cases", () => {
  it("reports an unterminated wall with a line number", () => {
    const src = [
      'plan "E" {',
      "  wall exterior thickness 200 {",
      "    (0,0) (1000,0)",
      "}", // closes wall body; plan brace missing -> EOF error
    ].join("\n");
    const { errors, svg } = compile(src, { noCache: true });
    expect(svg).toBe("");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].line).toBeTypeOf("number");
  });

  it("errors on a non-positive room size", () => {
    const src = `plan "E" { room id=r at (0,0) size 0x1000 label "R" }`;
    const { errors } = compile(src, { noCache: true });
    expect(errors.some((e) => /positive size/.test(e.message))).toBe(true);
  });

  it("warns when a door does not lie on any wall", () => {
    const src = [
      'plan "E" {',
      "  wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }",
      "  door id=d at (2000,2000) width 900",
      "}",
    ].join("\n");
    const { warnings, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => /does not lie on any wall/.test(w.message))).toBe(true);
    expect(warnings[0].line).toBeTypeOf("number");
  });

  it("warns on overlapping rooms", () => {
    const src = [
      'plan "E" {',
      "  room id=a at (0,0) size 3000x3000 label \"A\"",
      "  room id=b at (1000,1000) size 3000x3000 label \"B\"",
      "}",
    ].join("\n");
    const { warnings } = compile(src, { noCache: true });
    expect(warnings.some((w) => /overlap/.test(w.message))).toBe(true);
  });

  it("reports a clear message on unknown statements", () => {
    const src = `plan "E" { kitchen at (0,0) }`;
    const { errors } = compile(src, { noCache: true });
    expect(errors[0].message).toMatch(/Unknown statement "kitchen"/);
  });
});
