/**
 * The sides of a rectilinear `room polygon` (issue #363, cards L3 and L4; the G10 addendum of
 * 2026-11-02): `right-of` and friends, the edge datums and everything that reads one, anchored
 * furniture, and `finish`. A side is the ring's run on its outermost line, one run or a refusal, and
 * never the bounding box.
 *
 * The byte-identity law for every other plan is `test/rectilinear-rooms-byte-identity.test.ts`; the
 * plan here that uses every form is pinned in `test/rectilinear-rooms.test.ts`'s digest table.
 */

import { describe as suite, expect, it } from "vitest";
import {
  compile,
  describe,
  finish,
  lint,
  makeVirtualWorld,
  planJsonToArch,
  planToJson,
  resolvePlan,
} from "../src/index.js";
import type { Point } from "../src/ast.js";
import { anchoredAt, anchorRuns } from "../src/fixture-orientation.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { relationalClause } from "../src/opening-relation.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { extremeRuns, rectInRing } from "../src/room-tiling.js";
import { NULL_WORLD } from "../src/world.js";
import { compareScenes, D4_ELEMENTS, frameFor, sceneOf, witnessCase, witnessPair } from "./d4-oracle.js";
import { BED, L_RING, L_RING_REVERSED, SIDES_BODY, SIDES_PLAN, STATEMENT } from "./rectilinear-rooms-plans.js";

const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;
const LIV = `  room id=liv polygon ${L_RING} label "Living" uses living`;
const U = "(0,0) (2000,0) (2000,3000) (4000,3000) (4000,0) (6000,0) (6000,6000) (0,6000)";

const errors = (src: string) => compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
const codes = (src: string): string[] => errors(src).map((d) => d.code!);

const element = (src: string, id: string) => {
  const ir = resolvePlan(src).ir;
  if (!ir) throw new Error(`the plan must resolve: ${JSON.stringify(errors(src).map((d) => d.message))}`);
  const e = ir.elements.find((x) => x.id === id);
  if (!e) throw new Error(`no element ${id}`);
  return e as unknown as {
    at: Point;
    size: { w: number; h: number };
    rotate?: number;
    points?: Point[];
  };
};
const atOf = (src: string, id: string): Point => element(src, id).at;

const ringOf = (s: string): Point[] =>
  [...s.matchAll(/\((\d+),(\d+)\)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

suite("the extreme runs of a ring", () => {
  it("are the ring's edges on that line, in order along it", () => {
    const ring = ringOf(L_RING);
    expect(extremeRuns(ring, "top")).toEqual([{ vertical: false, c: 0, lo: 0, hi: 6000 }]);
    expect(extremeRuns(ring, "right")).toEqual([{ vertical: true, c: 6000, lo: 0, hi: 3000 }]);
    expect(extremeRuns(ring, "bottom")).toEqual([{ vertical: false, c: 6000, lo: 0, hi: 3000 }]);
    expect(extremeRuns(ring, "left")).toEqual([{ vertical: true, c: 0, lo: 0, hi: 6000 }]);
    expect(extremeRuns(ringOf(U), "top")).toEqual([
      { vertical: false, c: 0, lo: 0, hi: 2000 },
      { vertical: false, c: 0, lo: 4000, hi: 6000 },
    ]);
  });

  it("do not depend on where the ring starts or which way it runs", () => {
    const ring = ringOf(L_RING);
    for (const other of [ringOf(L_RING_REVERSED), [...ring.slice(3), ...ring.slice(0, 3)]]) {
      for (const side of ["top", "bottom", "left", "right"] as const) {
        expect(extremeRuns(other, side)).toEqual(extremeRuns(ring, side));
      }
    }
  });

  it("merge across a redundant vertex, and only there", () => {
    const ring = ringOf("(0,0) (1500,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000)");
    expect(extremeRuns(ring, "top")).toEqual([{ vertical: false, c: 0, lo: 0, hi: 6000 }]);
  });
});

suite("a footprint on a ring's floor", () => {
  const ring = ringOf(L_RING);
  it.each([
    ["inside a leg", { x: 100, y: 100, w: 500, h: 500 }, true],
    ["on the ring's own edges", { x: 0, y: 0, w: 6000, h: 3000 }, true],
    ["the whole of one leg", { x: 0, y: 3000, w: 3000, h: 3000 }, true],
    ["reaching the notch", { x: 2500, y: 2500, w: 1000, h: 1000 }, false],
    ["wholly in the notch", { x: 4000, y: 4000, w: 500, h: 500 }, false],
    ["across the box, over the notch", { x: 0, y: 0, w: 6000, h: 6000 }, false],
    ["outside the box", { x: 7000, y: 0, w: 500, h: 500 }, false],
    ["a ring edge through its middle", { x: 2800, y: 3100, w: 400, h: 400 }, false],
  ])("%s", (_name, rect, inside) => {
    expect(rectInRing(rect, ring)).toBe(inside);
  });

  it("is not fooled by a sum landing an ulp past the line", () => {
    const edge = 6000.1;
    const w = 2000.3;
    const notched = ringOf(L_RING).map((p) => (p.x === 6000 ? { ...p, x: edge } : p));
    expect(rectInRing({ x: edge - w, y: 0, w, h: 900 }, notched)).toBe(true);
  });
});

suite("relational placement on a polygon", () => {
  const placed = (clause: string, size = "2000x1000"): Point =>
    atOf(plan(`${LIV}\n  room id=b ${clause} size ${size} uses bath`), "b");

  it("`right-of` stands on the run: the issue's bath, at x 6000", () => {
    expect(placed("right-of liv", "2000x3000")).toEqual({ x: 6000, y: 0 });
  });

  it("`align bottom` stays on the run, not past the notch at y 6000", () => {
    expect(placed("right-of liv align bottom")).toEqual({ x: 6000, y: 2000 });
    expect(placed("right-of liv align middle")).toEqual({ x: 6000, y: 1000 });
    expect(placed("right-of liv align top")).toEqual({ x: 6000, y: 0 });
  });

  it("`below` reads the bottom run: `align right` ends at x 3000, the box's would at 6000", () => {
    expect(placed("below liv align right gap 100")).toEqual({ x: 1000, y: 6100 });
    expect(placed("below liv align center")).toEqual({ x: 500, y: 6000 });
  });

  it("`left-of` and `above` read the whole side of the L", () => {
    expect(placed("left-of liv align bottom gap 50")).toEqual({ x: -2050, y: 5000 });
    expect(placed("above liv align right")).toEqual({ x: 4000, y: -1000 });
  });

  it("every direction and alignment lands as on a rectangle with that side", () => {
    // The twin is the rectangle whose side on the clause's line is exactly the run.
    const twins: Record<string, string> = {
      "right-of": "room id=liv at (5000,0) size 1000x3000",
      "left-of": "room id=liv at (0,0) size 1000x6000",
      below: "room id=liv at (0,5000) size 3000x1000",
      above: "room id=liv at (0,0) size 6000x1000",
    };
    const aligns: Record<string, string[]> = {
      "right-of": ["top", "middle", "bottom"],
      "left-of": ["top", "middle", "bottom"],
      below: ["left", "center", "right"],
      above: ["left", "center", "right"],
    };
    let compared = 0;
    for (const [dir, twin] of Object.entries(twins)) {
      for (const align of aligns[dir]!) {
        for (const gap of [0, 250]) {
          const clause = `${dir} liv align ${align} gap ${gap}`;
          const b = `  room id=b ${clause} size 1234x567 uses bath`;
          expect(atOf(plan(`${LIV}\n${b}`), "b"), clause).toEqual(atOf(plan(`  ${twin}\n${b}`), "b"));
          compared++;
        }
      }
    }
    expect(compared).toBe(24);
  });

  it("a side of two runs refuses, naming them, and what depends on the room says so", () => {
    const src = plan(
      `  room id=u polygon ${U} uses living\n  room id=b above u size 1000x1000\n  room id=c above b size 1000x1000`,
    );
    const [poly, dep] = errors(src);
    expect(poly!.code).toBe("E_PLACE_POLY");
    expect(poly!.message).toBe(
      'Room "b" is placed `above u`, but the top side of "u" is 2 separate runs (y 0, x 0–2000 and x 4000–6000), which does not say which. Place this room with `at (x,y)` instead.',
    );
    expect(dep!.code).toBe("E_LAYOUT_UNPLACED");
  });

  it("the other three sides of that U are one run each", () => {
    expect(atOf(plan(`  room id=u polygon ${U} uses living\n  room id=b below u size 1000x1000`), "b")).toEqual({
      x: 0,
      y: 6000,
    });
  });

  it("a slanted polygon and a circle stay refused", () => {
    const slanted = plan(
      "  room id=p polygon (0,0) (4000,0) (2000,3000) uses living\n  room id=b right-of p size 1000x1000",
    );
    expect(codes(slanted)).toEqual(["E_PLACE_POLY"]);
    expect(errors(slanted)[0]!.message).toContain("a rectangular or rectilinear reference");
    const round = plan("  room id=c circle at (0,0) radius 2000 uses living\n  room id=b right-of c size 1000x1000");
    expect(codes(round)).toEqual(["E_PLACE_POLY"]);
    expect(errors(round)[0]!.message).toContain('"c" is a circle room');
  });

  it("a ring the room itself refused says so, and adds no second reading of it", () => {
    const src = plan(
      "  room id=x polygon (0,0) (2000,2000) (2000,0) (0,2000) uses living\n  room id=b right-of x size 1000x1000",
    );
    expect(codes(src)).toContain("E_ROOM_POLY_SELF_INTERSECT");
    expect(errors(src).find((d) => d.code === "E_PLACE_POLY")?.message).toContain("was refused (see its own error)");
  });
});

suite("the datums of a polygon", () => {
  it("are the lines of its sides, in an expression", () => {
    const src = plan(
      `${LIV}\n  wall id=w exterior thickness 200 { (liv.left,liv.top) (liv.right,liv.top) (liv.right,liv.bottom) }`,
    );
    expect(element(src, "w").points).toEqual([
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 6000 },
    ]);
  });

  it("compass words alias them at a north-up root", () => {
    const src = plan(`${LIV}\n  wall id=w exterior thickness 200 { (liv.west,liv.north) (liv.east,liv.north) }`);
    expect(element(src, "w").points).toEqual([
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
    ]);
  });

  it("`cx` and `cy` stay refused", () => {
    const [d] = errors(plan(`${LIV}\n  wall id=w exterior thickness 200 { (liv.cx,0) (100,0) }`));
    expect(d!.code).toBe("E_ROOM_NOT_RECTANGLE");
    expect(d!.message).toContain("the middle of its outline may not be floor");
  });

  it("a side of two runs is refused, naming them", () => {
    const [d] = errors(
      plan(`  room id=u polygon ${U} uses living\n  wall id=w exterior thickness 200 { (0,u.top) (100,0) }`),
    );
    expect(d!.code).toBe("E_ROOM_NOT_RECTANGLE");
    expect(d!.message).toContain("is 2 separate runs (y 0, x 0–2000 and x 4000–6000)");
  });

  it("a ring its room refused says so, on a datum as on a reference", () => {
    const src = plan(
      "  room id=liv polygon (0,0) (6000,0) (6000,6000) (2000,6000) (2000,2000) (4000,2000) (4000,8000) (0,8000)\n  column id=c at (liv.top, 0) size 300x300",
    );
    expect(codes(src)).toContain("E_ROOM_POLY_SELF_INTERSECT");
    const d = errors(src).find((x) => x.code === "E_ROOM_NOT_RECTANGLE");
    expect(d!.message).toBe('The outline of "liv" was refused (see its own error), so `liv.top` names no edge');
  });

  it("a slanted polygon's wording says what does expose them", () => {
    const [d] = errors(
      plan("  room id=p polygon (0,0) (4000,0) (2000,3000)\n  wall id=w exterior thickness 200 { (p.left,0) (100,0) }"),
    );
    expect(d!.code).toBe("E_ROOM_NOT_RECTANGLE");
    expect(d!.message).toContain("only a rectangular or rectilinear room exposes datums");
  });

  it("`on liv.left` stands on the run, centred on it by default", () => {
    const src = plan(
      `${LIV}\n${STATEMENT}\n  window id=w on liv.left width 1000\n  window id=x on liv.bottom width 1000`,
    );
    expect(errors(src)).toEqual([]);
    expect(atOf(src, "w")).toEqual({ x: 0, y: 3000 });
    // The middle of the run, x 1500; the middle of the box's bottom edge is in the notch.
    expect(atOf(src, "x")).toEqual({ x: 1500, y: 6000 });
  });

  it("`from liv.left` and `from start` measure along the run", () => {
    const src = plan(
      `${LIV}\n${STATEMENT}\n  door id=d on liv.bottom at 800 from liv.left width 900 swing into liv\n  window id=w on liv.right at 1000 from start width 800\n  window id=x on liv.right at 1000 from end width 800`,
    );
    expect(errors(src)).toEqual([]);
    expect(atOf(src, "d")).toEqual({ x: 800, y: 6000 });
    expect(atOf(src, "w")).toEqual({ x: 6000, y: 1000 });
    expect(atOf(src, "x")).toEqual({ x: 6000, y: 2000 });
  });

  suite("on an edge that is part exterior, part partition (#430's rule)", () => {
    const MIXED = `${LIV}\n  room id=b at (6000,0) size 2000x1500 uses bath\n${BED}\n${STATEMENT}\n`;

    it("a window landing wholly on the exterior stretch resolves", () => {
      const src = `${plan(`${MIXED}  window id=w on liv.right at 2250 from start width 800`)}`;
      expect(errors(src)).toEqual([]);
      expect(atOf(src, "w")).toEqual({ x: 6000, y: 2250 });
    });

    it("one landing on the partition is refused, and the hint it quotes resolves", () => {
      const src = plan(`${MIXED}  window id=w on liv.right at 700 from start width 800`);
      const [d] = errors(src);
      expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
      const quoted = /`on liv\.right at ([^`]+)`/.exec(d!.hints![0]!)![1]!;
      expect(errors(src.replace("at 700 from start", `at ${quoted}`))).toEqual([]);
    });
  });

  it("a polygon's side picks a run of a pair, and a hint may quote it when no rectangle does", () => {
    const body = `${LIV}\n${BED}\n${STATEMENT}\n`;
    const onSide = plan(`${body}  door id=d between liv and bed at 1200 from liv.bottom width 800 swing into bed`);
    expect(errors(onSide)).toEqual([]);
    expect(atOf(onSide, "d")).toEqual({ x: 3000, y: 4800 });
    // A rectangle's word comes first, so a hint that quoted one quotes it still.
    const [d] = errors(plan(`${body}  door id=d between liv and bed at center width 800`));
    expect(d!.hints).toEqual([
      "`between liv and bed at 1500 from bed.top` stands on the edge on x 3000, y 3000–6000.",
      "`between liv and bed at 1500 from bed.left` stands on the edge on y 3000, x 3000–6000.",
    ]);
  });

  it("two polygons: the hint quotes a side, and pasting it resolves", () => {
    const src = plan(
      `  room id=a polygon (0,0) (4000,0) (4000,2000) (2000,2000) (2000,4000) (0,4000) uses living\n  room id=b polygon (4000,0) (6000,0) (6000,6000) (2000,6000) (2000,2000) (4000,2000) uses bedroom\n  room id=c at (0,4000) size 2000x2000 uses bath\n${STATEMENT}\n  door id=d between a and b at center width 800`,
    );
    const [d] = errors(src);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.hints!.length).toBeGreaterThan(0);
    for (const hint of d!.hints!) {
      const quoted = /`between a and b at ([^`]+)`/.exec(hint)?.[1] ?? /`at (\([^`]+\))`/.exec(hint)?.[1];
      expect(quoted, hint).toBeDefined();
      const edit = quoted!.startsWith("(")
        ? src.replace("door id=d between a and b at center", `door id=d at ${quoted}`)
        : src.replace("at center", `at ${quoted}`);
      expect(errors(edit)).toEqual([]);
    }
  });

  it("a lint hint on a relational opening keeps the relational form", () => {
    const rooms = [{ id: "liv", at: { x: 0, y: 0 }, size: { w: 6000, h: 6000 }, poly: ringOf(L_RING) }];
    expect(relationalClause({ edge: "liv.left" }, rooms, { x: 0, y: 1000 })).toBe("on liv.left at 1000 from start");
    expect(relationalClause({ edge: "liv.bottom", at: "900 from end" }, rooms, { x: 1000, y: 6000 })).toBe(
      "on liv.bottom at 2000 from end",
    );
    expect(relationalClause({ edge: "liv.left", at: "900 from liv.top" }, rooms, { x: 0, y: 1000 })).toBe(
      "on liv.left at 1000 from liv.top",
    );
    const us = [{ id: "u", at: { x: 0, y: 0 }, size: { w: 6000, h: 6000 }, poly: ringOf(U) }];
    expect(relationalClause({ edge: "u.top" }, us, { x: 1000, y: 0 })).toBeUndefined();
  });

  it("`against liv.bottom` backs onto the run, in the middle of the run", () => {
    const src = plan(`${LIV}\n${STATEMENT}\n  furniture id=s bookshelf against liv.bottom size 1200x300`);
    expect(errors(src)).toEqual([]);
    expect(atOf(src, "s")).toEqual({ x: 900, y: 5600 });
  });

  it("`against` keeps the footprint on the floor, which a rectangle's edge cannot lose", () => {
    const src = plan(`${LIV}\n  furniture id=s sofa against liv.bottom offset 2800 size 2000x900`);
    const [d] = errors(src);
    expect(d!.code).toBe("E_FURN_AGAINST");
    expect(d!.message).toContain('leaves the floor of "liv"');
  });

  it("`segment containing liv.bottom` picks the segment on the run", () => {
    const src = plan(
      `${LIV}\n  wall id=w exterior thickness 200 { ${L_RING} close }\n  furniture id=s sofa against wall w segment containing liv.bottom side left size 2000x900 in liv`,
    );
    expect(errors(src)).toEqual([]);
    expect(lint(src).filter((d) => d.code === "W_FIXTURE_WRONG_ROOM")).toEqual([]);
    expect(atOf(src, "s").y).toBe(6000 - 100 - 900);
  });

  it("the pairwise walls stay rectangle-only", () => {
    expect(codes(plan(`${LIV}\n${BED}\n  wall id=w partition thickness 100 between liv and bed`))).toEqual([
      "E_ROOM_NOT_RECTANGLE",
    ]);
  });
});

suite("anchored furniture on a polygon", () => {
  const WALLS = `${LIV}\n${STATEMENT}\n`;
  const piece = (a: string, size = "1000x500", extra = ""): string =>
    plan(`${WALLS}  furniture id=p desk in liv anchor ${a}${extra} size ${size}`);

  it.each([
    ["top-left", { x: 0, y: 0 }],
    ["top", { x: 2500, y: 0 }], // centred on x 0–6000
    ["top-right", { x: 5000, y: 0 }],
    ["left", { x: 0, y: 2750 }], // centred on y 0–6000
    ["right", { x: 5000, y: 1250 }], // centred on y 0–3000, not the box's 3000
    ["bottom-left", { x: 0, y: 5500 }],
    ["bottom", { x: 1000, y: 5500 }], // centred on x 0–3000, not the box's 3000
  ])("`anchor %s` reads the ring", (a, at) => {
    expect(atOf(piece(a), "p")).toEqual(at);
  });

  it("`flush` measures from the wall on the run", () => {
    expect(atOf(piece("bottom-left", "2000x900", " flush"), "p")).toEqual({ x: 100, y: 5000 });
    expect(atOf(piece("bottom", "2000x900", " flush"), "p")).toEqual({ x: 500, y: 5000 });
    expect(atOf(piece("right", "900x2000", " flush"), "p")).toEqual({ x: 5000, y: 500 });
  });

  it("`inset` pulls in from the line, as on a rectangle", () => {
    expect(atOf(piece("bottom-left", "1000x500", " inset 200"), "p")).toEqual({ x: 200, y: 5300 });
  });

  it("`flush` reads the run, not the box: a thick wall on the box's edge past the notch is ignored", () => {
    const src = plan(
      `${LIV}\n${STATEMENT}\n  wall id=far exterior thickness 600 { (3500,6000) (6000,6000) }\n  furniture id=p desk in liv anchor bottom flush size 1000x500`,
    );
    expect(atOf(src, "p")).toEqual({ x: 1000, y: 6000 - 100 - 500 });
  });

  it("a demolished wall on the run backs nothing", () => {
    const src = plan(
      `${LIV}\n  wall id=w exterior thickness 200 status demolish { (0,6000) (3000,6000) }\n  furniture id=p desk in liv anchor bottom flush size 1000x500`,
    );
    expect(atOf(src, "p")).toEqual({ x: 1000, y: 5500 });
  });

  it("the turn is derived from the wall on the run, as on a rectangle", () => {
    const src = plan(`${WALLS}  furniture id=p bed in liv anchor bottom flush size 1500x2000`);
    expect(element(src, "p").rotate).toBe(180);
    const none = plan(`${LIV}\n  furniture id=p bed in liv anchor bottom flush size 1500x2000`);
    expect(element(none, "p").rotate).toBeUndefined();
  });

  it("a corner in the notch is refused, and so is the middle", () => {
    const [notch] = errors(piece("bottom-right"));
    expect(notch!.code).toBe("E_PLACE_POLY");
    expect(notch!.message).toContain("its bottom-right corner is not a vertex of its outline");
    for (const src of [piece("center"), plan(`${WALLS}  furniture id=p desk in liv centered size 1000x500`)]) {
      const [d] = errors(src);
      expect(d!.code).toBe("E_PLACE_POLY");
      expect(d!.message).toContain("may not be floor");
    }
  });

  it("a footprint off the ring is refused", () => {
    const [d] = errors(piece("bottom-left", "4000x900"));
    expect(d!.code).toBe("E_PLACE_POLY");
    expect(d!.message).toContain("a 4000x900 piece there leaves the floor");
    expect(atOf(piece("top-left", "4000x900"), "p")).toEqual({ x: 0, y: 0 });
  });

  it("the prongs of a U: every corner stands, and a side of two runs does not", () => {
    const body = `  room id=u polygon ${U} uses living\n${STATEMENT}\n`;
    const at = (a: string): Point =>
      atOf(plan(`${body}  furniture id=p desk in u anchor ${a} flush size 1000x500`), "p");
    expect(at("top-left")).toEqual({ x: 100, y: 100 });
    expect(at("top-right")).toEqual({ x: 4900, y: 100 });
    expect(at("bottom-left")).toEqual({ x: 100, y: 5400 });
    expect(at("bottom-right")).toEqual({ x: 4900, y: 5400 });
    const [d] = errors(plan(`${body}  furniture id=p desk in u anchor top size 1000x500`));
    expect(d!.code).toBe("E_PLACE_POLY");
    expect(d!.message).toContain("its top side is 2 separate runs (y 0, x 0–2000 and x 4000–6000)");
  });

  it("a slanted polygon and a circle stay refused", () => {
    const [d] = errors(
      plan("  room id=p polygon (0,0) (4000,0) (2000,3000)\n  furniture desk in p anchor top size 500x500"),
    );
    expect(d!.code).toBe("E_PLACE_POLY");
    expect(d!.message).toContain("a rectangular or rectilinear room");
    const [c] = errors(plan("  room id=c circle at (0,0) radius 2000\n  furniture desk in c anchor top size 500x500"));
    expect(c!.message).toContain('"c" is a circle room');
  });

  it("anchorRuns and anchoredAt are the arithmetic of a rectangle with that side", () => {
    const ring = ringOf("(0,0) (4000,0) (4000,3000) (0,3000)");
    const inRect = (a: string): Point =>
      atOf(
        plan(`  room id=r at (0,0) size 4000x3000\n  furniture id=p desk in r anchor ${a} inset 70 size 1000x500`),
        "p",
      );
    for (const a of [
      "top-left",
      "top",
      "top-right",
      "left",
      "right",
      "bottom-left",
      "bottom",
      "bottom-right",
    ] as const) {
      const runs = anchorRuns(ring, a);
      expect(typeof runs).toBe("object");
      const at = anchoredAt(runs as Exclude<typeof runs, string>, 1000, 500, 70, () => null);
      // A rectangle's side anchor takes no inset along its run, and both read the same line.
      expect(at, a).toEqual(inRect(a));
    }
  });
});

suite("the whole of it, through `place` and `import`", () => {
  it("under all eight frames every fact and every drawn primitive follows", () => {
    expect(D4_ELEMENTS).toHaveLength(8);
    for (const g of D4_ELEMENTS) {
      const { vs } = witnessCase(SIDES_BODY, g);
      expect(
        vs.map((v) => v.key),
        g.name,
      ).toEqual([]);
    }
  });

  it("the oracle can fail: the frame's image of another anchor is reported", () => {
    const g = D4_ELEMENTS.find((e) => e.mirror)!;
    const { p0 } = witnessPair(SIDES_BODY, g, { fixedSheet: true });
    const { gP } = witnessPair(SIDES_BODY.replace("anchor left flush", "anchor top flush"), g, { fixedSheet: true });
    expect(compareScenes(sceneOf(p0), sceneOf(gP), frameFor(g, 50)).length).toBeGreaterThan(0);
  });

  it("a component's words are its own: a placed room reads a turned ring in the instance's frame", () => {
    const src = `plan "P" {\n  units mm\n  component flat() {\n  ${LIV}\n    room id=b right-of liv align bottom size 2000x1000 uses bath\n    furniture id=p desk in liv anchor bottom size 1000x500\n  }\n  place flat() as f at (0,0) rotate 90\n}\n`;
    expect(errors(src)).toEqual([]);
    // Local: `b` at (6000,2000), 2000x1000; `p` at (1000,5500), 1000x500. A quarter turn about the
    // origin sends (x,y) to (-y,x), so each corner lands there and the box re-reads its corners.
    expect(element(src, "f.b").at).toEqual({ x: -3000, y: 6000 });
    expect(element(src, "f.p").at).toEqual({ x: -6000, y: 1000 });
  });

  it("from the root, a placed room's side is read in page words", () => {
    const src = `plan "P" {\n  units mm\n  component flat() {\n  ${LIV}\n  }\n  place flat() as f at (0,0) rotate 90\n  room id=r at (500,0) size 1000x1000\n  wall id=w exterior thickness 200 { (f.liv.left,f.liv.top) (f.liv.right,f.liv.top) }\n  furniture id=p desk in f.liv anchor top size 1000x500\n}\n`;
    expect(errors(src)).toEqual([]);
    // The turned L: (0,0) (0,6000) (-3000,6000) (-3000,3000) (-6000,3000) (-6000,0).
    expect(element(src, "w").points).toEqual([
      { x: -6000, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(element(src, "p").at).toEqual({ x: -3500, y: 0 });
  });

  it("from the root, a placed polygon is a reference by its page-word side", () => {
    const src = `plan "P" {\n  units mm\n  component flat() {\n  ${LIV}\n  }\n  place flat() as f at (0,0) mirror x\n  room id=r right-of f.liv align bottom size 1000x1000\n}\n`;
    expect(errors(src)).toEqual([]);
    // Mirrored in x, the L's right side is the box's whole height, x 0, y 0–6000.
    expect(element(src, "r").at).toEqual({ x: 0, y: 5000 });
  });

  it("an imported component places the same as a local one", () => {
    const body = `  room id=liv polygon ${L_RING} uses living\n  room id=b right-of liv align bottom size 2000x1000 uses bath\n  walls from rooms exterior 200 partition 100\n  window id=w on liv.left width 900\n  furniture id=p desk in liv anchor bottom flush size 1000x500`;
    const module = `plan "lib" {\n  units mm\n  component flat() {\n${body}\n  }\n}\n`;
    const importer = `plan "P" {\n  units mm\n  import "flat.arch": flat\n  place flat() as f at (1000,1000) mirror x\n}\n`;
    const local = `plan "P" {\n  units mm\n  component flat() {\n${body}\n  }\n  place flat() as f at (1000,1000) mirror x\n}\n`;
    const world = makeVirtualWorld({ "flat.arch": module });
    const out = compile(importer, { noCache: true, world });
    expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(out.svg).toBe(compile(local, { noCache: true }).svg);
  });

  it("Plan JSON carries it back to the same drawing", () => {
    const { json } = planToJson(SIDES_PLAN);
    const back = planJsonToArch(json);
    expect(compile(back.source!, { noCache: true }).svg).toBe(compile(SIDES_PLAN, { noCache: true }).svg);
  });

  it("the issue's plan as filed: the door is the one refusal, and the fix it quotes compiles", () => {
    const door = "door between liv and bed at center width 800 swing into bed";
    const filed = plan(
      `  room id=liv polygon ${L_RING} label "Living" uses living\n  room id=bed at (3000,3000) size 3000x3000 label "Bedroom" uses bedroom\n  room id=bath right-of liv size 2000x3000 label "Bath" uses bath\n  walls from rooms exterior 200 partition 100\n  ${door}\n  furniture sofa in liv anchor bottom-left flush size 2000x900`,
    );
    const refused = errors(filed);
    expect(refused.map((d) => d.code)).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
    expect(refused[0]!.hints).toHaveLength(2);
    for (const hint of refused[0]!.hints!) {
      const quoted = /`between liv and bed at ([^`]+)`/.exec(hint)![1]!;
      expect(errors(filed.replace("at center", `at ${quoted}`)), hint).toEqual([]);
    }
  });

  it("the plan with every form compiles clean of errors, with the positions it says", () => {
    expect(errors(SIDES_PLAN)).toEqual([]);
    const d = describe(SIDES_PLAN);
    expect(d.rooms.find((r) => r.id === "liv")!.area_m2).toBe(27);
    expect(d.derived_walls?.map((w) => w.name)).toContain("liv|bed#2");
  });
});

/** The steps a source's whole resolution spends. */
function stepsOf(src: string): number {
  clearResolveCache();
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return 0;
  const linked = link(ast, NULL_WORLD, BUILTIN_REGISTRY);
  return evaluationSteps(resolveAll(linked.plan, BUILTIN_REGISTRY, NULL_WORLD));
}

/** A staircase ring of `n` treads. */
function staircase(n: number): string {
  const up: string[] = [];
  for (let i = 0; i < n; i++) up.push(`(${(i + 1) * 1000},${i * 1000})`, `(${(i + 1) * 1000},${(i + 1) * 1000})`);
  return `(0,0) ${up.join(" ")} (0,${n * 1000})`;
}

suite("budgets", () => {
  const BARE = `  room id=a polygon ${L_RING} uses living\n`;

  it("a ring that nothing reads costs what it cost: charged at the read", () => {
    const steps = (ring: string): number => stepsOf(plan(`  room id=a polygon ${ring} uses living`));
    const plain = steps(L_RING);
    const reading = stepsOf(plan(`${BARE}  wall id=w exterior thickness 200 { (a.left,0) (100,0) }`));
    const twin = stepsOf(plan(`${BARE}  wall id=w exterior thickness 200 { (0,0) (100,0) }`));
    expect(plain).toBeGreaterThan(0);
    expect(reading).toBeGreaterThan(twin);
  });

  it("a read pays for the ring it reads", () => {
    const read = (n: number) =>
      stepsOf(plan(`  room id=a polygon ${staircase(n)}\n  wall id=w exterior thickness 200 { (a.left,0) (100,0) }`)) -
      stepsOf(plan(`  room id=a polygon ${staircase(n)}\n  wall id=w exterior thickness 200 { (0,0) (100,0) }`));
    expect(read(400)).toBeGreaterThan(read(20));
  });

  it("an honest plan is far from the budget: 200 reads of an L", () => {
    const reads = Array.from({ length: 200 }, (_, k) => `  dim (a.left,${k * 10})->(a.right,${k * 10})`).join("\n");
    const src = plan(`${BARE}${reads}`);
    expect(errors(src)).toEqual([]);
    expect(stepsOf(src)).toBeLessThan(500_000);
  });

  it("a hostile plan stops at the meter, at the read, where its twin that reads nothing does not", () => {
    const body = (term: string): string => {
      const e = Array.from({ length: 50 }, () => term).join(" + ");
      return plan(
        `  room id=a polygon ${staircase(400)}\n  for i in 0..2000 {\n    wall interior thickness 100 { (${e},i) (${e},i + 10) }\n  }`,
      );
    };
    const t0 = performance.now();
    expect(compile(body("a.left"), { noCache: true }).diagnostics.map((d) => d.code)).toContain("E_STEP_LIMIT");
    expect(performance.now() - t0).toBeLessThan(30_000);
    expect(compile(body("0"), { noCache: true }).diagnostics.map((d) => d.code)).not.toContain("E_STEP_LIMIT");
  }, 120_000);
});

suite("finish on an L", () => {
  const SHELL = `${LIV}\n${BED}\n  room id=bath at (6000,0) size 2000x3000 label "Bath" uses bath\n${STATEMENT}\n  door id=e on liv.left at 1500 from start width 1000 swing into liv\n  door id=d between liv and bed at 1500 from bed.top width 800 swing into bed\n  door id=b between liv and bath at center width 800 swing into bath\n  window id=w on liv.top at 1500 from start width 1500\n  window id=x on bed.bottom width 1200`;

  /** The codes `after` holds more of than `before`, drafting aside as the gate has them aside. */
  const gained = (before: string, after: string): string[] => {
    const count = (src: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (const d of lint(src)) m.set(d.code!, (m.get(d.code!) ?? 0) + 1);
      return m;
    };
    const was = count(before);
    return [...count(after)].filter(([c, n]) => n > (was.get(c) ?? 0)).map(([c]) => c);
  };

  it("the L takes its pieces on what the language can say, and is no worse", () => {
    const src = plan(SHELL);
    const r = finish(src, { only: "furnish" });
    expect(r.changes.filter((c) => c.room === "liv").map((c) => c.text)).toEqual([
      "furniture sofa in liv anchor bottom flush size 2000x900 rotate 180",
      "furniture coffee_table in liv anchor bottom flush inset 1300 size 1000x600 rotate 180",
    ]);
    expect(errors(r.source)).toEqual([]);
    expect(gained(src, r.source)).toEqual([]);
  });

  it("every piece stands on the floor of the L, where the statement says", () => {
    const r = finish(plan(SHELL), { only: "furnish" });
    const ir = resolvePlan(r.source).ir!;
    const ring = ringOf(L_RING);
    const pieces = ir.elements.filter((e) => e.kind === "furniture" && (e as { room?: string }).room === "liv");
    expect(pieces.length).toBe(2);
    for (const p of pieces) {
      const { at, size } = p as unknown as { at: Point; size: { w: number; h: number } };
      expect(rectInRing({ x: at.x, y: at.y, w: size.w, h: size.h }, ring)).toBe(true);
    }
  });

  it.each([
    ["dining", 1],
    ["bedroom", 2],
    ["bath", 3],
  ])("a %s L is furnished, no worse", (use, pieces) => {
    const src = plan(
      `  room id=a polygon ${L_RING} label "Room" uses ${use}\n${STATEMENT}\n  door id=e on a.left at 1500 from start width 1000 swing into a\n  window id=w on a.top at 1500 from start width 1500`,
    );
    const r = finish(src, { only: "furnish" });
    expect(r.changes).toHaveLength(pieces);
    for (const c of r.changes) expect(c.text).not.toContain(" at (");
    expect(errors(r.source)).toEqual([]);
    expect(gained(src, r.source)).toEqual([]);
  });

  it("a services fixture goes `against wall` where the wall has a name", () => {
    const src = plan(
      `  room id=k polygon ${L_RING} label "Kitchen" uses kitchen\n  wall id=w exterior thickness 200 { ${L_RING} close }\n  door id=d on w at 15500 width 1000\n  window id=x on w at 1500 width 1500`,
    );
    const r = finish(src, { only: "furnish" });
    expect(r.changes.map((c) => c.text.split(" ").slice(0, 4).join(" "))).toEqual([
      "furniture kitchen_sink against wall",
      "furniture stove against wall",
      "furniture counter against wall",
      "furniture fridge against wall",
    ]);
    expect(errors(r.source)).toEqual([]);
    expect(gained(src, r.source)).toEqual([]);
  });

  it("a small wet L with a named wall is furnished or reported, and is no worse", () => {
    const ring = "(0,0) (2600,0) (2600,1300) (1300,1300) (1300,2600) (0,2600)";
    const src = plan(
      `  room id=a polygon ${ring} label "WC" uses wc\n  wall id=w exterior thickness 100 { ${ring} close }\n  door id=d on w at 1950 width 800 swing into a`,
    );
    const r = finish(src, { only: "furnish" });
    expect(errors(r.source)).toEqual([]);
    expect(gained(src, r.source)).toEqual([]);
    expect(r.changes.length + r.unresolved.length).toBeGreaterThan(0);
  });

  it("a diagonal wall has no band, and the gate still judges a piece beside it", () => {
    const src = plan(
      `  room id=a polygon ${L_RING} label "Room" uses bedroom\n${STATEMENT}\n  wall id=d partition thickness 100 { (4000,500) (5000,900) }\n  door id=e on a.left at 1500 from start width 1000 swing into a\n  window id=w on a.top at 1500 from start width 1500`,
    );
    const r = finish(src, { only: "furnish" });
    expect(errors(r.source)).toEqual([]);
    expect(gained(src, r.source)).toEqual([]);
  });

  it("a room larger than the table covers is measured on its floor, not its box", () => {
    // The box is 12 × 12 m, 144 m² over the 100 m² limit; the L's floor is 108 m².
    const big = "(0,0) (12000,0) (12000,6000) (6000,6000) (6000,12000) (0,12000)";
    const small = "(0,0) (12000,0) (12000,3000) (3000,3000) (3000,12000) (0,12000)";
    const go = (ring: string): string[] => {
      const src = plan(
        `  room id=a polygon ${ring} label "Room" uses bedroom\n${STATEMENT}\n  door id=e on a.left at 1500 from start width 1000 swing into a`,
      );
      return finish(src, { only: "furnish" }).unresolved.map((u) => u.reason);
    };
    expect(go(big).join()).toContain("larger than 100 m²");
    // 63 m² of floor in the same 144 m² box: furnished.
    expect(go(small).join()).not.toContain("larger than");
  });

  it("the note stays on what is not furnished: a slanted polygon and a circle", () => {
    const src = plan(
      `  room id=p polygon (0,0) (6000,0) (3000,5000) label "Bedroom" uses bedroom\n  wall id=w exterior thickness 200 { (0,0) (6000,0) (3000,5000) close }\n  door id=e on w at 1000 width 900 swing inward`,
    );
    const r = finish(src, { only: "furnish" });
    expect(r.changed).toBe(false);
    expect(r.unresolved[0]!.reason).toContain("rectangular and rectilinear rooms only");
  });

  it("a storey's L is furnished inside its own block", () => {
    const src = `plan "P" {\n  units mm\n  level 0 {\n${SHELL}\n  }\n  level 1 {\n${SHELL}\n  }\n}\n`;
    const r = finish(src, { only: "furnish" });
    expect(r.changes.filter((c) => c.room === "liv").map((c) => c.level)).toEqual([0, 0, 1, 1]);
    expect(errors(r.source)).toEqual([]);
  });
});
