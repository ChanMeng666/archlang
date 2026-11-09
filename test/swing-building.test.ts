/**
 * Building-relative swing (plan-soundness card PS3.8): `swing inward|outward`.
 *
 * - **K1.** The first-contact audit's fire exit: a south wall drawn west to east, so its `out`
 *   is the wall's left (north) face, and `swing out` opened the exit INTO the building.
 *   `swing outward` opens it away from the building whichever way the wall was drawn.
 * - **Swap-back twins.** Each building word is pinned against the wall-relative word chosen BY
 *   HAND from the drawn direction (`in` = right of travel on the page, y down): the SVG,
 *   `describe()` and `lint()` are byte-identical, on a wall drawn each way, on a closed authored
 *   loop, on a derived ring and on a barn door's face.
 * - **Frames.** Inside a component placed under all eight frames, `swing outward` draws exactly
 *   what the hand-chosen `swing in` draws under the same frame, and an independent geometric
 *   oracle (the open leaf's midpoint, in plan space, is on no floor) agrees.
 * - **Refusals.** `E_SWING_SIDE` for floor on both faces and on neither, spanned on the word; a
 *   kind with no `swing` raises only `E_DOOR_KIND_CLAUSE`.
 * - **Round trips.** The printer keeps the word; Plan JSON exports it as `swing_building` beside
 *   the resolved `swing` and writes it back.
 */

import { describe as suite, expect, it } from "vitest";
import {
  compile,
  describe as describePlan,
  format,
  lint,
  planFromJson,
  planJsonToArch,
  planToJson,
} from "../src/index.js";
import type { Point } from "../src/ast.js";
import { doorSwing } from "../src/geometry.js";
import { pointInPolygon } from "../src/geometry/polygon.js";
import { link } from "../src/import.js";
import { type RDoor, type RRoom, resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { NULL_WORLD } from "../src/world.js";
import { FRAMES, framed, loop, plan, ring, SWING_BUILDING_PLANS, southWall } from "./tables/swing-building-plans.js";

const svg = (src: string): string => {
  const out = compile(src, { noCache: true });
  expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return out.svg;
};
const codes = (src: string): string[] => compile(src, { noCache: true }).diagnostics.map((d) => d.code ?? "?");

/** The resolved IR of a source, in plan space. */
function resolved(src: string): { doors: RDoor[]; rooms: RRoom[] } {
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  const linked = link(ast!, NULL_WORLD, BUILTIN_REGISTRY);
  const { ir } = resolveAll(linked.plan, BUILTIN_REGISTRY, NULL_WORLD);
  return {
    doors: ir.elements.filter((e): e is RDoor => e.kind === "door"),
    rooms: ir.elements.filter((e): e is RRoom => e.kind === "room"),
  };
}

/** Is `p` on some room's floor? The room's own shape: its ring when it has one, else its rectangle. */
const onFloor = (p: Point, rooms: readonly RRoom[]): boolean =>
  rooms.some((r) =>
    r.poly
      ? pointInPolygon(p.x, p.y, r.poly)
      : p.x >= r.at.x && p.x <= r.at.x + r.size.w && p.y >= r.at.y && p.y <= r.at.y + r.size.h,
  );

/** Where the open leaf points: the midpoint of the leaf radius, in plan space. */
function leafMid(d: RDoor): Point {
  const s = doorSwing(d)!;
  return { x: (s.hinge.x + s.leafEnd.x) / 2, y: (s.hinge.y + s.leafEnd.y) / 2 };
}

/** Byte-identical drawing, facts and lint. */
function expectTwins(building: string, wallRelative: string): void {
  expect(svg(building)).toBe(svg(wallRelative));
  expect(describePlan(building)).toEqual(describePlan(wallRelative));
  expect(lint(building)).toEqual(lint(wallRelative));
}

suite("K1: the fire exit", () => {
  it("`swing out` on a south wall drawn west to east opens INTO the building (the audit's finding)", () => {
    const { doors, rooms } = resolved(southWall("west", "swing out"));
    expect(onFloor(leafMid(doors[0]!), rooms)).toBe(true);
  });
  for (const from of ["west", "east"] as const) {
    it(`\`swing outward\` opens away from the building on a wall drawn from the ${from}`, () => {
      const { doors, rooms } = resolved(southWall(from, "swing outward"));
      expect(onFloor(leafMid(doors[0]!), rooms)).toBe(false);
    });
    it(`\`swing inward\` opens into the building on a wall drawn from the ${from}`, () => {
      const { doors, rooms } = resolved(southWall(from, "swing inward"));
      expect(onFloor(leafMid(doors[0]!), rooms)).toBe(true);
    });
  }
});

suite("swap-back twins: the building word draws, describes and lints as the hand-chosen wall word", () => {
  // West to east: the right of travel is south, outside the building.
  it("south wall drawn west to east: inward = out, outward = in", () => {
    expectTwins(southWall("west", "swing inward"), southWall("west", "swing out"));
    expectTwins(southWall("west", "swing outward"), southWall("west", "swing in"));
    // Not vacuous: the two words draw different leaves.
    expect(svg(southWall("west", "swing inward"))).not.toBe(svg(southWall("west", "swing outward")));
  });
  // East to west: the right of travel is north, inside.
  it("south wall drawn east to west: inward = in, outward = out", () => {
    expectTwins(southWall("east", "swing inward"), southWall("east", "swing in"));
    expectTwins(southWall("east", "swing outward"), southWall("east", "swing out"));
  });
  // A loop drawn clockwise on the page has the building on the right of every run.
  it("closed clockwise loop, bottom and top runs: inward = in, outward = out", () => {
    expectTwins(loop("swing inward", "swing outward"), loop("swing in", "swing out"));
    expectTwins(loop("swing outward", "swing inward"), loop("swing out", "swing in"));
  });
  // ADR 0028 §3: the derived exterior ring runs clockwise, floor on the `in` side.
  it("derived ring, including a barn door's face: inward = in, outward = out", () => {
    expectTwins(ring("swing outward", "swing inward", "swing inward"), ring("swing out", "swing in", "swing in"));
    expectTwins(ring("swing inward", "swing outward", "swing outward"), ring("swing in", "swing out", "swing out"));
  });
});

suite("frames: the building word gives the hand-chosen leaf under every `place` frame", () => {
  for (const [i, frame] of FRAMES.entries()) {
    const name = `rotate ${frame.rot}${frame.mirror ? ` mirror ${frame.mirror}` : ""}`;
    it(name, () => {
      // In the component's own frame the south run is drawn west to east: outward = in.
      expectTwins(framed("swing outward", [frame]), framed("swing in", [frame]));
      expectTwins(framed("swing inward", [frame]), framed("swing out", [frame]));
      // The oracle, independent of the twin: measured in PLAN space, after the frame.
      const out = resolved(framed("swing outward", [frame]));
      const inn = resolved(framed("swing inward", [frame]));
      expect(onFloor(leafMid(out.doors[0]!), out.rooms), `${i} outward`).toBe(false);
      expect(onFloor(leafMid(inn.doors[0]!), inn.rooms), `${i} inward`).toBe(true);
    });
  }
  it("all eight frames in one plan", () => {
    expectTwins(framed("swing outward"), framed("swing in"));
  });
});

suite("refusals", () => {
  const refused = SWING_BUILDING_PLANS.find((p) => p[0] === "refused")![1];

  it("floor on both faces, and on neither: E_SWING_SIDE spanned on the word", () => {
    const diags = compile(refused, { noCache: true }).diagnostics.filter((d) => d.code === "E_SWING_SIDE");
    expect(diags).toHaveLength(2);
    expect(diags.map((d) => refused.slice(d.span!.start, d.span!.end))).toEqual(["inward", "outward"]);
    expect(diags[0]!.message).toMatch(/floor on both faces/);
    expect(diags[0]!.hints?.[0]).toMatch(/swing into <room>/);
    expect(diags[1]!.message).toMatch(/floor on neither face/);
  });

  it("a wall free-standing inside one room says floor on both faces, not between two rooms", () => {
    const src = plan(
      "free",
      "  room id=r at (0,0) size 6000x4000\n  wall id=screen partition thickness 100 { (3000,1000) (3000,3000) }\n" +
        "  door on screen at 50% width 800 swing inward",
    );
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_SWING_SIDE")!;
    expect(d.message).toMatch(/has floor on both faces, so/);
    expect(d.message).not.toMatch(/between two rooms/);
  });

  it("a door with no host wall says so", () => {
    const src = plan("nohost", "  room id=r at (0,0) size 6000x4000\n  door at (3000,2000) width 800 swing outward");
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_SWING_SIDE")!;
    expect(d.message).toMatch(/it has no host wall/);
    expect(d.message).not.toMatch(/floor on neither face/);
    expect(src.slice(d.span!.start, d.span!.end)).toBe("outward");
  });

  it("a kind with no `swing` raises only E_DOOR_KIND_CLAUSE, not a second error", () => {
    const one = plan(
      "k",
      "  room id=a at (0,0) size 4000x5000\n  walls from rooms exterior 200 partition 100\n" +
        "  door pocket on a.bottom at center width 900 swing inward slide left",
    );
    expect(codes(one).filter((c) => c.startsWith("E_"))).toEqual(["E_DOOR_KIND_CLAUSE"]);
    // …and the clause fix deletes the word along with `swing`.
    const fixed = compile(one, { noCache: true }).diagnostics.find((d) => d.code === "E_DOOR_KIND_CLAUSE")!;
    expect(JSON.stringify(fixed.fixes)).not.toMatch(/inward/);
  });

  it("an unknown word lists every legal one", () => {
    expect(compile(southWall("west", "swing upward")).errors[0]?.message).toBe(
      'Expected swing "in" or "out" or "inward" or "outward" or `into <room>` but found "upward"',
    );
  });
});

suite("round trips", () => {
  it("the printer keeps the word", () => {
    const src = southWall("west", "swing outward");
    const formatted = format(src);
    expect(formatted).toMatch(/swing outward/);
    expect(svg(formatted)).toBe(svg(src));
  });

  it("Plan JSON exports `swing_building` beside the resolved `swing`, and writes the word back", () => {
    const src = southWall("west", "swing outward");
    const { json } = planToJson(src);
    const door = json!.openings!.find((o) => o.id === "fire")!;
    expect(door.swing).toBe("in");
    expect(door.swing_building).toBe("outward");
    const back = planJsonToArch(json);
    expect(back.source).toMatch(/swing outward/);
    expect(svg(back.source!)).toBe(svg(planJsonToArch(planToJson(southWall("west", "swing in")).json).source!));
  });

  it("a plan that writes no building word exports no `swing_building`", () => {
    const { json } = planToJson(southWall("west", "swing in"));
    expect(json!.openings!.every((o) => !("swing_building" in o))).toBe(true);
  });

  it("an instance's door is exported by its resolved swing only", () => {
    const { json } = planToJson(framed("swing outward", [FRAMES[2]!]));
    const doors = (json!.openings ?? []).filter((o) => o.kind === "door");
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every((o) => o.swing_building === undefined)).toBe(true);
  });

  it("the validator holds `swing_building` to its words and to doors", () => {
    const { json } = planToJson(southWall("west", "swing outward"));
    const bad = structuredClone(json!) as unknown as { openings: Record<string, unknown>[] };
    bad.openings.find((o) => o.id === "fire")!.swing_building = "upward";
    expect(
      planFromJson(bad)
        .diagnostics.map((d) => d.message)
        .join("\n"),
    ).toMatch(/swing_building/);
    const win = structuredClone(json!) as unknown as { openings: Record<string, unknown>[] };
    win.openings.push({ kind: "window", x: 3000, y: 0, width: 900, swing_building: "inward" });
    expect(
      planFromJson(win)
        .diagnostics.map((d) => d.message)
        .join("\n"),
    ).toMatch(/only a door swings/);
  });
});
