import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";

function elements(src: string): any[] {
  const { plan } = parse(src);
  const { ir } = resolve(plan!);
  return ir.elements as any[];
}
function diags(src: string): any[] {
  const { plan } = parse(src);
  return resolve(plan!).diagnostics as any[];
}

describe("let bindings", () => {
  it("binds a name usable by later statements", () => {
    const r = elements(`plan "P" { let W = 3000 room id=r at (0,0) size W x W }`).find((e) => e.kind === "room");
    expect(r.size).toEqual({ w: 3000, h: 3000 });
  });

  it("supports arithmetic over bindings", () => {
    const r = elements(`plan "P" { let W = 3000 let H = W - 500 room at (0,0) size W x H }`).find((e) => e.kind === "room");
    expect(r.size).toEqual({ w: 3000, h: 2500 });
  });

  it("reports an unknown name with a did-you-mean hint", () => {
    const d = diags(`plan "P" { let width = 3000 room at (0,0) size widht x 1000 }`);
    const unknown = d.find((x) => x.code === "E_UNKNOWN_REF");
    expect(unknown).toBeDefined();
    expect(unknown.hints).toEqual(['did you mean "width"?']);
  });

  it("rejects redefining a name in the same scope", () => {
    expect(diags(`plan "P" { let W = 1 let W = 2 room at (0,0) size W x W }`).map((d) => d.code)).toContain("E_REDEF");
  });

  it("disallows forward references (use before definition)", () => {
    expect(diags(`plan "P" { room at (0,0) size W x W let W = 3000 }`).map((d) => d.code)).toContain("E_UNKNOWN_REF");
  });
});

describe("components", () => {
  const src = `plan "P" {
    grid 100
    component bath(x, y) {
      room at (x, y) size 2000x2000 label "Bath"
      furniture wc at (x+200, y+200) size 400x600
    }
    bath(0, 0)
    bath(3000, 0)
  }`;

  it("instantiates twice into uniquely-ided, correctly-placed groups", () => {
    const els = elements(src);
    const rooms = els.filter((e) => e.kind === "room");
    expect(rooms.map((r) => [r.id, r.at.x, r.at.y])).toEqual([
      ["room_1", 0, 0],
      ["room_2", 3000, 0],
    ]);
    const furn = els.filter((e) => e.kind === "furniture");
    expect(furn.map((f) => f.id)).toEqual(["wc_1", "wc_2"]);
  });

  it("renders without errors", () => {
    const { svg, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("reports an argument-count mismatch", () => {
    expect(diags(`plan "P" { component c(x) { room at (x,0) size 100x100 } c(1, 2) }`).map((d) => d.code)).toContain(
      "E_ARGCOUNT",
    );
  });

  it("bounds infinite recursion with a diagnostic", () => {
    expect(diags(`plan "P" { component a() { a() } a() }`).map((d) => d.code)).toContain("E_RECURSION");
  });

  it("composes: one component may instantiate an earlier one", () => {
    const els = elements(`plan "P" {
      component leg(x) { column at (x, 0) size 100x100 }
      component table(x) { leg(x) leg(x+1000) }
      table(0)
    }`);
    expect(els.filter((e) => e.kind === "column").map((c) => c.at.x)).toEqual([0, 1000]);
  });
});
