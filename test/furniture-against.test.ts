import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { compile, lint } from "../src/index.js";
import { format } from "../src/format.js";
import type { RFurniture } from "../src/ir.js";

/**
 * `against wall <id>` closed-form furniture placement. The fixture's plan footprint
 * (at/size) and quarter-turn rotation are derived from the named wall face; size is
 * wall-relative (along×depth). Ambiguity is a fail-fast E_FURN_AGAINST, never a guess.
 */

// A 4×4 m room, exterior shell wound clockwise so each segment's LEFT normal points
// into the room. Segment 0 = north wall, 1 = east, 2 = south, 3 = west.
const room = (furn: string) =>
  `plan "P" {
    units mm
    grid 1
    wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "R"
    ${furn}
  }`;

const wcOf = (src: string): RFurniture => {
  const ir = resolve(parse(src).plan!).ir;
  return ir.elements.find((e) => e.kind === "furniture") as RFurniture;
};

describe("furniture against wall", () => {
  it("anchors a fixture flush to the north wall face with no rotation", () => {
    // wc against segment 0 (north), interior side, offset 2000; along=400, depth=700.
    const f = wcOf(room(`furniture wc against wall exterior segment 0 offset 2000 side left size 400x700`));
    expect(f.at).toEqual({ x: 1800, y: 100 }); // back edge y=100 = wall face (centerline 0 + 100)
    expect(f.size).toEqual({ w: 400, h: 700 }); // along→x, depth→y for a horizontal wall
    expect(f.rotate ?? 0).toBe(0); // back faces north
  });

  it("derives a quarter-turn against the east wall (back faces east)", () => {
    const f = wcOf(room(`furniture wc against wall exterior segment 1 offset 2000 side left size 400x700`));
    // East wall at x=4000: fixture left of it, back to the east → rotate 90.
    expect(f.rotate).toBe(90);
    expect(f.size).toEqual({ w: 700, h: 400 }); // depth→x, along→y for a vertical wall
    // Right (back) edge flush to the interior face x=3900.
    expect(f.at.x + f.size.w).toBe(3900);
  });

  it("places the fixture inside the room (no wrong-room / floating warnings)", () => {
    const codes = lint(
      room(`furniture wc against wall exterior segment 2 offset 2000 side left size 400x700 in r`),
    ).map((d) => d.code);
    expect(codes).not.toContain("W_FIXTURE_WRONG_ROOM");
    expect(codes).not.toContain("W_FIXTURE_FLOATING");
  });

  it("errors on a multi-segment wall with no `segment` selector", () => {
    const { diagnostics } = compile(room(`furniture wc against wall exterior side left size 400x700`), {
      noCache: true,
    });
    expect(diagnostics.some((d) => d.code === "E_FURN_AGAINST")).toBe(true);
  });

  it("errors on an unknown wall id", () => {
    const { diagnostics } = compile(room(`furniture wc against wall nope segment 0 side left size 400x700`), {
      noCache: true,
    });
    expect(diagnostics.some((d) => d.code === "E_FURN_AGAINST")).toBe(true);
  });

  it("errors when `side` is omitted", () => {
    const { diagnostics } = compile(room(`furniture wc against wall exterior segment 0 size 400x700`), {
      noCache: true,
    });
    expect(diagnostics.some((d) => d.code === "E_FURN_AGAINST")).toBe(true);
  });

  it("errors when an explicit rotate is combined with against", () => {
    const { diagnostics } = compile(
      room(`furniture wc against wall exterior segment 0 side left size 400x700 rotate 90`),
      { noCache: true },
    );
    expect(diagnostics.some((d) => d.code === "E_FURN_AGAINST")).toBe(true);
  });

  it("infers `side` from `in <room>` (same result as explicit side)", () => {
    const inferred = wcOf(room(`furniture wc against wall exterior segment 0 offset 2000 size 400x700 in r`));
    const explicit = wcOf(room(`furniture wc against wall exterior segment 0 offset 2000 side left size 400x700`));
    expect(inferred.at).toEqual(explicit.at);
    expect(inferred.rotate ?? 0).toBe(explicit.rotate ?? 0);
  });

  it("still errors when neither `side` nor `in <room>` is given", () => {
    const { diagnostics } = compile(room(`furniture wc against wall exterior segment 0 size 400x700`), {
      noCache: true,
    });
    expect(diagnostics.some((d) => d.code === "E_FURN_AGAINST")).toBe(true);
  });

  it("round-trips the against clause through the formatter", () => {
    const src = room(`furniture wc against wall exterior segment 0 offset 2000 side left size 400x700`);
    expect(format(src)).toContain("against wall exterior segment 0 offset 2000 side left size 400x700");
  });
});
