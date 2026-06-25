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

  it("sees plan-level (global) bindings inside a component body", () => {
    const els = elements(`plan "P" {
      let SZ = 1200
      component pad(x) { column at (x, 0) size SZ x SZ }
      pad(0)
    }`);
    const col = els.find((e) => e.kind === "column");
    expect(col.size).toEqual({ w: 1200, h: 1200 });
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

describe("control flow (T2.3)", () => {
  it("for-over-range expands into the element stream (DoD)", () => {
    const cols = elements(`plan "P" { for i in 0..3 { column at (i*600, 0) size 300x300 } }`).filter((e) => e.kind === "column");
    expect(cols.length).toBe(3);
    expect(cols.map((c) => c.at.x)).toEqual([0, 600, 1200]);
  });

  it("for-over-array literal", () => {
    const cols = elements(`plan "P" { for x in [100, 400, 900] { column at (x, 0) size 50x50 } }`).filter((e) => e.kind === "column");
    expect(cols.map((c) => c.at.x)).toEqual([100, 400, 900]);
  });

  it("for body is a fresh scope each iteration (loop-local let, no redefinition)", () => {
    const d = diags(`plan "P" { for i in 0..2 { let w = i*100 column at (i*200, 0) size w x w } }`);
    expect(d.map((x) => x.code)).not.toContain("E_REDEF");
    const cols = elements(`plan "P" { for i in 0..2 { let w = (i+1)*100 column at (i*200, 0) size w x w } }`).filter((e) => e.kind === "column");
    expect(cols.map((c) => c.size.w)).toEqual([100, 200]);
  });

  it("if/else expands only the taken branch", () => {
    const yes = elements(`plan "P" { let big = 5000 if big > 3000 { room at (0,0) size 100x100 label "Big" } else { room at (0,0) size 50x50 label "Small" } }`).filter((e) => e.kind === "room");
    expect(yes.map((r) => r.label)).toEqual(["Big"]);
    const no = elements(`plan "P" { if 1 > 2 { column at (0,0) size 9x9 } else { column at (5,5) size 1x1 } }`).filter((e) => e.kind === "column");
    expect(no.map((c) => [c.at.x, c.at.y])).toEqual([[5, 5]]);
  });

  it("if without else and a false condition expands nothing", () => {
    const cols = elements(`plan "P" { column at (0,0) size 1x1 if false { column at (9,9) size 1x1 } }`).filter((e) => e.kind === "column");
    expect(cols.length).toBe(1);
  });

  it("while with reassignment terminates naturally (DoD)", () => {
    const cols = elements(`plan "P" { let i = 0 while i < 4 { column at (i*300, 0) size 100x100 i = i + 1 } }`).filter((e) => e.kind === "column");
    expect(cols.map((c) => c.at.x)).toEqual([0, 300, 600, 900]);
  });

  it("while caps a runaway loop with a diagnostic", () => {
    expect(diags(`plan "P" { while true { column at (0,0) size 1x1 } }`).map((d) => d.code)).toContain("E_WHILE_LIMIT");
  });

  it("assignment to an undefined name is a diagnostic", () => {
    expect(diags(`plan "P" { x = 5 column at (x,0) size 1x1 }`).map((d) => d.code)).toContain("E_ASSIGN_UNDEF");
  });

  it("for over a non-iterable is a type error", () => {
    expect(diags(`plan "P" { for i in 5 { column at (i,0) size 1x1 } }`).map((d) => d.code)).toContain("E_TYPE");
  });

  it("nested control flow composes (for containing if)", () => {
    const cols = elements(`plan "P" { for i in 0..4 { if i % 2 == 0 { column at (i*100, 0) size 50x50 } } }`).filter((e) => e.kind === "column");
    expect(cols.map((c) => c.at.x)).toEqual([0, 200]); // only even i
  });

  it("control flow is deterministic (byte-identical output)", () => {
    const src = `plan "P" { grid 50 for i in 0..5 { column at (i*500, 0) size 200x200 } }`;
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  it("control flow works inside a component body", () => {
    const cols = elements(`plan "P" {
      component row(y) { for i in 0..3 { column at (i*400, y) size 100x100 } }
      row(0)
      row(1000)
    }`).filter((e) => e.kind === "column");
    expect(cols.length).toBe(6);
  });
});

describe("scope chain (T2.4)", () => {
  it("a for-variable shadows an outer binding and is restored after the loop", () => {
    const cols = elements(`plan "P" {
      let x = 10
      column at (x, 0) size 1x1
      for x in [99] { column at (x, 0) size 1x1 }
      column at (x, 0) size 1x1
    }`).filter((e) => e.kind === "column");
    expect(cols.map((c) => c.at.x)).toEqual([10, 99, 10]);
  });

  it("a block-local let shadows an outer let without an E_REDEF", () => {
    const src = `plan "P" {
      let w = 5
      if true { let w = 50 column at (w, 0) size 1x1 }
      column at (w, 0) size 1x1
    }`;
    expect(diags(src).map((d) => d.code)).not.toContain("E_REDEF");
    const cols = elements(src).filter((e) => e.kind === "column");
    expect(cols.map((c) => c.at.x)).toEqual([50, 5]); // inner shadow, then outer restored
  });

  it("redefinition in the SAME scope is still caught", () => {
    expect(diags(`plan "P" { let a = 1 let a = 2 column at (a,0) size 1x1 }`).map((d) => d.code)).toContain("E_REDEF");
  });

  it("a component body sees globals + params but not the caller's locals", () => {
    // Globals + params resolve fine.
    const d = diags(`plan "P" {
      let G = 7
      component c(p) { column at (G + p, 0) size 1x1 }
      c(1)
    }`);
    expect(d.map((x) => x.code)).not.toContain("E_UNKNOWN_REF");
    // A local of the CALLING component is invisible to the callee (parent = global).
    const d2 = diags(`plan "P" {
      component c(p) { column at (callerLocal + p, 0) size 1x1 }
      component caller() { let callerLocal = 5 c(1) }
      caller()
    }`);
    expect(d2.map((x) => x.code)).toContain("E_UNKNOWN_REF");
  });
});
