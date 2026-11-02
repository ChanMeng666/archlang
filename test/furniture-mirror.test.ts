/**
 * `furniture … mirror` (issue #405): one piece's left and right swap, and its back stays.
 *
 * The clause sets the bit a reflecting `place` sets, so the laws of `test/glyph-chirality.test.ts` are
 * asked again of the statement, by consequence, on compiled drawings:
 *
 *  - a handed symbol draws the reflection of the plain one, about its own centre line, before its turn;
 *  - an unhanded symbol is byte-identical, at every catalogued footprint: nothing GAINS a hand;
 *  - the statement and a `place … mirror x` of the plain piece are one drawing, the turn paired by
 *    `M·R(l) = R(m−l)·Fx`;
 *  - under every element of D4 the drawing of the placed piece is the frame carried over the drawing of
 *    the unplaced one, and a reflecting frame composes back to the plain symbol.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, format, lint, planJsonToArch, planToJson, toDxf } from "../src/index.js";
import { CANONICAL_FIXTURES, fixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import { mapSceneNode } from "../src/elements/glyph-lib.js";
import { defaultFootprint, fixtureSpec } from "../src/fixtures-catalog.js";
import { tp } from "../src/frame.js";
import { parse } from "../src/parser.js";
import type { RenderSizes, SceneNode } from "../src/scene.js";
import { DEFAULT_THEME } from "../src/theme.js";
import { D4_ELEMENTS, frameFor } from "./d4-oracle.js";

const W = 6000;
const H = 6000;
const shell = `wall id=w exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }
  room id=r at (0,0) size ${W}x${H} label "Room"`;
const plan = (body: string): string => `plan "M" {\n  units mm\n  ${shell}\n  ${body}\n}\n`;

const furniture = (src: string): SceneNode[] => {
  const out = compile(src);
  expect(out.errors).toEqual([]);
  return out.scene!.nodes.filter((n) => n.layer === "furniture");
};

/** Any pens will do for "is this symbol handed": a glyph's marks are fractions of its footprint. */
const SIZES = compile(plan("")).scene!.sizes as RenderSizes;

/** Is the symbol handed at this footprint, by the test the renderer applies? */
const handed = (category: string, w: number, h: number): boolean => {
  const cx = (W - w) / 2 + w / 2;
  const nodes = fixtureGlyph(category, { x: (W - w) / 2, y: (H - h) / 2, w, h }, DEFAULT_THEME, SIZES);
  return (
    nodes !== null &&
    !marksEqual(
      nodes,
      nodes.map((n) => mirrorNode(n, cx)),
    )
  );
};

const footprintOf = (category: string): { w: number; h: number } => {
  const fp = defaultFootprint(category);
  return fp ? { w: fp.along, h: fp.depth } : { w: 1200, h: 800 };
};

const piece = (category: string, clause: string, w: number, h: number): string =>
  plan(`furniture ${category} at (${(W - w) / 2},${(H - h) / 2}) size ${w}x${h}${clause}`);

suite("`mirror` on one piece", () => {
  it("every family: a handed one flips, an unhanded one keeps its exact bytes", () => {
    let flipped = 0;
    for (const category of CANONICAL_FIXTURES) {
      const { w, h } = footprintOf(category);
      const plain = piece(category, "", w, h);
      const turned = piece(category, " mirror", w, h);
      if (handed(category, w, h)) {
        flipped++;
        const axis = W / 2;
        expect(
          marksEqual(
            furniture(turned),
            furniture(plain).map((n) => mirrorNode(n, axis)),
          ),
          category,
        ).toBe(true);
        expect(marksEqual(furniture(turned), furniture(plain)), category).toBe(false);
      } else expect(compile(turned).svg, category).toBe(compile(plain).svg);
    }
    expect(flipped).toBeGreaterThan(10);
  });

  it("an uncatalogued word draws its labelled rectangle, unmoved", () => {
    const src = (clause: string): string => plan(`furniture hammock at (500,500) size 2000x900 label "H"${clause}`);
    expect(compile(src(" mirror")).svg).toBe(compile(src("")).svg);
  });

  it("the back stays: every fact but the hand reads as the plain piece's", () => {
    const body = (clause: string): string =>
      plan(
        `furniture sofa_l at (700,4000) size 2600x1600 rotate 180${clause}\n  door id=d at (3000,0) width 900 wall w`,
      );
    const a = body("");
    const b = body(" mirror");
    expect(describe(b)).toEqual(describe(a));
    expect(lint(b)).toEqual(lint(a));
  });

  it("is reported as a hand in `describe --facts symmetry`", () => {
    const hands = (src: string): unknown => {
      const s = describe(src, { facts: ["symmetry"] }).symmetry;
      return s?.layers.full;
    };
    const twin = (clause: string): string =>
      plan(`furniture sofa_l at (200,200) size 2600x1600\n  furniture sofa_l at (3200,200) size 2600x1600${clause}`);
    // Two pieces mirror each other only when one of them is the mirror image.
    expect(hands(twin(" mirror"))).not.toEqual(hands(twin("")));
  });
});

suite("the statement and a `place` agree", () => {
  const body = (at: string, clause: string): string => `furniture sofa_l at ${at} size ${clause}`;
  const placed = (spot: string, frame: string, line: string): string => `plan "M" {
  units mm
  component c() {
    wall id=w exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }
    room id=r at (0,0) size ${W}x${H} label "Room"
    ${line}
  }
  place c() as a at ${spot}${frame}
}
`;

  it.each([
    [0, 0],
    [90, 270],
    [180, 180],
    [270, 90],
  ])("`rotate %i` in a `mirror x` frame is `rotate %i mirror`", (l, m) => {
    const size = l === 90 || l === 270 ? "1600x2600" : "2600x1600";
    const [w, h] = size.split("x").map(Number) as [number, number];
    const at = `(${(W - w) / 2},${(H - h) / 2})`;
    const line = (turn: number, clause: string): string => `${body(at, size)}${turn ? ` rotate ${turn}` : ""}${clause}`;
    expect(compile(placed("(0,0)", "", line(m, " mirror"))).svg).toBe(
      compile(placed(`(${W},0)`, " mirror x", line(l, ""))).svg,
    );
  });

  it("two reflections cancel: a mirrored piece in a reflecting `place` is the plain symbol", () => {
    const at = "(1700,2200)";
    const line = (clause: string): string => `${body(at, "2600x1600")}${clause}`;
    const out = compile(placed(`(${W},0)`, " mirror x", line(" mirror")));
    expect(out.svg).toBe(compile(placed("(0,0)", "", line(""))).svg);
  });

  it("under every element of D4, the drawing is the frame carried over the unplaced drawing", () => {
    const line = `furniture sofa_l at (500,700) size 1600x2600 rotate 90 mirror`;
    const alone = furniture(placed("(0,0)", "", line));
    expect(alone.length).toBeGreaterThan(3);
    for (const g of D4_ELEMENTS) {
      const clauses = `${g.rotate ? ` rotate ${g.rotate}` : ""}${g.mirror ? ` mirror ${g.mirror}` : ""}`;
      const f = frameFor(g, 0);
      const carried = alone.map((n) => mapSceneNode(n, (p) => tp(f, p), f.a * f.d - f.b * f.c < 0));
      expect(marksEqual(furniture(placed("(0,0)", clauses, line)), carried), g.name).toBe(true);
    }
  });
});

suite("the clause in the grammar", () => {
  it("stands anywhere among `rotate` and `facing`, and on every placement form", () => {
    const at = "furniture sofa_l at (500,500) size 2600x1600";
    const svg = compile(plan(`${at} rotate 180 mirror`)).svg;
    expect(compile(plan(`${at} mirror rotate 180`)).svg).toBe(svg);
    for (const form of [
      "furniture sofa_l in r anchor top-left flush size 2600x1600 mirror",
      "furniture sofa_l against r.top offset 3000 size 2600x1600 mirror",
      "furniture sofa_l against wall w segment 0 offset 3000 size 2600x1600 mirror in r",
    ]) {
      const out = compile(plan(form));
      expect(out.errors, form).toEqual([]);
      expect(
        out.scene?.nodes.some((n) => n.layer === "furniture"),
        form,
      ).toBe(true);
    }
  });

  it("refuses an axis, and says what the axis belongs to", () => {
    const out = compile(plan("furniture sofa_l at (500,500) size 2600x1600 mirror x"));
    expect(out.diagnostics.find((d) => d.code === "E_PARSE")?.message).toContain("takes no axis");
  });

  it("stands on the piece's line: on the next one it is the refused statement it was", () => {
    const out = compile(plan("furniture sofa_l at (500,500) size 2600x1600\n  mirror"));
    expect(out.diagnostics.find((d) => d.code === "E_PARSE")?.message).toContain('"mirror"');
  });

  it("leaves `x` on the next line a statement", () => {
    const src = `plan "M" {\n  units mm\n  let x = 1\n  ${shell}\n  furniture sofa_l at (500,500) size 2600x1600 mirror\n  x = 2\n}\n`;
    expect(compile(src).errors).toEqual([]);
  });

  it("prints back and stays a fixed point", () => {
    const src = plan("furniture sofa_l at (500,500) size 2600x1600 mirror rotate 90 clear front 900 in r");
    const once = format(src);
    expect(once).toContain("rotate 90 mirror clear front 900 in r");
    expect(format(once)).toBe(once);
    expect(compile(once).svg).toBe(compile(src).svg);
  });

  it("is written once: a repeat is not a second clause", () => {
    const out = compile(plan("furniture sofa_l at (500,500) size 2600x1600 mirror mirror"));
    expect(out.diagnostics.some((d) => d.code === "E_PARSE")).toBe(true);
  });

  it("the parse stage records it only when written", () => {
    const body = (clause: string) =>
      parse(plan(`furniture id=m sofa_l at (500,500) size 2600x1600${clause}`)).plan?.body.find(
        (s) => s.kind === "furniture",
      );
    expect(body("")).not.toHaveProperty("mirror");
    expect(body(" mirror")).toHaveProperty("mirror", true);
  });
});

suite("the clause in a CAD file", () => {
  it("draws another shape, so it is a block of its own beside the plain one", () => {
    const pair = (clause: string): string =>
      toDxf(
        compile(
          plan(
            `furniture sofa_l at (200,200) size 2600x1600\n  furniture sofa_l at (200,3000) size 2600x1600${clause}`,
          ),
        ).scene!,
      );
    expect(pair("")).not.toContain("FURN-SOFA_L-2600X1600-2");
    expect(pair(" mirror")).toContain("FURN-SOFA_L-2600X1600-2");
  });
});

suite("Plan JSON carries the clause", () => {
  it("a document round-trips to the same drawing", () => {
    const src = plan("furniture desk at (500,500) size 1400x700 rotate 90 mirror");
    const { json } = planToJson(src);
    expect(json?.furniture?.[0]?.mirror).toBe(true);
    const back = planJsonToArch(json);
    expect(back.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(back.source).toContain(" mirror");
    expect(compile(back.source!).svg).toBe(compile(planJsonToArch(planToJson(back.source!).json).source!).svg);
    const notes = compile(back.source!).scene!.nodes.filter((n) => n.layer === "furniture");
    expect(marksEqual(notes, furniture(src))).toBe(true);
  });

  it("a fixture of a catalogued family with no hand carries the word and draws the same", () => {
    expect(fixtureSpec("table")).toBeDefined();
    const src = plan("furniture table at (500,500) size 1600x900 mirror");
    expect(planToJson(src).json?.furniture?.[0]?.mirror).toBe(true);
  });

  it("a piece a reflecting `place` flattened stays E_JSON_MIRROR, in the shape of `hillside-villa`", () => {
    // A component with a handed piece and a door, placed twice, the second mirrored. The document has no
    // `components`, so the piece comes back as `en_m.sofa`, an id no source can declare.
    const src = `plan "Pair" {
  units mm
  component suite() {
    wall id=w exterior thickness 200 { (0,0) (3000,0) (3000,3000) (0,3000) close }
    room id=r at (0,0) size 3000x3000 label "Suite" uses bath
    furniture id=sofa desk at (300,300) size 1400x700 in r
  }
  place suite() as en at (0,0)
  place suite() as en_m at (7000,0) mirror x
}
`;
    const { json } = planToJson(src);
    const mirrored = json?.furniture?.filter((f) => f.mirror === true) ?? [];
    expect(mirrored.map((f) => f.id)).toEqual(["en_m.sofa"]);
    const back = planJsonToArch(json);
    expect(back.source).toBeUndefined();
    const codes = back.diagnostics.map((d) => d.code);
    expect(codes).toContain("E_JSON_MIRROR");
    expect(codes).not.toContain("E_DOTTED_DECL");
    // A hand-written payload's plain id is no flattened instance.
    const own = planToJson(plan("furniture id=p desk at (500,500) size 1400x700 mirror")).json;
    expect(planJsonToArch(own).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("refuses anything but a boolean", () => {
    const { json } = planToJson(plan("furniture desk at (500,500) size 1400x700"));
    const bad = { ...json, furniture: [{ ...json?.furniture?.[0], mirror: "x" }] };
    expect(planJsonToArch(bad).diagnostics.map((d) => d.code)).toContain("E_JSON_SCHEMA");
  });
});
