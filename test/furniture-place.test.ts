import { describe, expect, it } from "vitest";
import { compile, format } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RFurniture } from "../src/ir.js";

/**
 * T1c — furniture room-relative placement (`in <room> centered` /
 * `in <room> anchor <a> [inset N]`). Closed-form: the fixture's top-left corner is
 * derived from the resolved room box; the `in <room>` also owns the fixture.
 */

// A room r at (1000, 2000), 4000 x 3000. Fixtures placed relative to it.
const plan = (body: string) => `plan "P" {
  units mm
  grid 1
  room id=r at (1000,2000) size 4000x3000 label "R"
  ${body}
}`;

const furnOf = (src: string): RFurniture =>
  resolve(parse(src).plan!).ir.elements.find((e) => e.kind === "furniture") as RFurniture;

describe("T1c — furniture in <room> centered", () => {
  it("centres the fixture in the room box (byte-identical to the absolute equivalent)", () => {
    // room centre = (3000, 3500); 1500x2000 fixture → at (2250, 2500).
    const f = furnOf(plan(`furniture bed in r centered size 1500x2000`));
    expect(f.at).toEqual({ x: 2250, y: 2500 });
    expect(f.room).toBe("r");
    const rel = compile(plan(`furniture bed in r centered size 1500x2000`), { noCache: true });
    const abs = compile(plan(`furniture bed at (2250,2500) size 1500x2000 in r`), { noCache: true });
    expect(rel.svg).toBe(abs.svg);
  });

  it("rotation is independent of centred placement (no E_FURN_AGAINST)", () => {
    const { diagnostics } = compile(plan(`furniture bed in r centered size 1500x2000 rotate 90`), { noCache: true });
    expect(diagnostics.some((d) => d.code === "E_FURN_AGAINST")).toBe(false);
    expect(furnOf(plan(`furniture bed in r centered size 1500x2000 rotate 90`)).rotate).toBe(90);
  });
});

describe("T1c — furniture in <room> anchor", () => {
  it("places corners with an inset (default 0)", () => {
    const tl = furnOf(plan(`furniture desk in r anchor top-left size 600x400`));
    expect(tl.at).toEqual({ x: 1000, y: 2000 }); // room origin
    const br = furnOf(plan(`furniture desk in r anchor bottom-right size 600x400`));
    expect(br.at).toEqual({ x: 1000 + 4000 - 600, y: 2000 + 3000 - 400 });
    const tlInset = furnOf(plan(`furniture desk in r anchor top-left inset 100 size 600x400`));
    expect(tlInset.at).toEqual({ x: 1100, y: 2100 });
  });

  it("edge anchors centre on the free axis", () => {
    // `top` → horizontally centred, flush to the top edge.
    const top = furnOf(plan(`furniture desk in r anchor top size 600x400`));
    expect(top.at).toEqual({ x: 3000 - 300, y: 2000 });
    // `right` → vertically centred, flush to the right edge.
    const right = furnOf(plan(`furniture desk in r anchor right size 600x400`));
    expect(right.at).toEqual({ x: 1000 + 4000 - 600, y: 3500 - 200 });
  });

  it("`anchor center` equals `centered`", () => {
    expect(furnOf(plan(`furniture desk in r anchor center size 600x400`)).at).toEqual(
      furnOf(plan(`furniture desk in r centered size 600x400`)).at,
    );
  });

  it("raises E_PLACE_REF for an unknown room", () => {
    const { diagnostics } = compile(plan(`furniture bed in ghost centered size 1500x2000`), { noCache: true });
    expect(diagnostics.some((d) => d.code === "E_PLACE_REF")).toBe(true);
    // and does NOT also raise E_FURN_ROOM (no double-report)
    expect(diagnostics.some((d) => d.code === "E_FURN_ROOM")).toBe(false);
  });

  it("raises E_PLACE_REF when the room is placed relationally (box not yet fixed)", () => {
    const src = `plan "P" {
      units mm
      grid 1
      room id=a at (0,0) size 2000x2000
      room id=b right-of a size 2000x2000
      furniture bed in b centered size 500x500
    }`;
    expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_PLACE_REF")).toBe(true);
  });

  it("round-trips centered/anchor/inset through the formatter", () => {
    expect(format(plan(`furniture bed in r centered size 1500x2000`))).toContain("in r centered");
    const out = format(plan(`furniture desk in r anchor top-left inset 100 size 600x400`));
    expect(out).toContain("in r anchor top-left inset 100");
    // ownership tail is not duplicated
    expect(out.match(/in r/g)!.length).toBe(1);
  });
});
