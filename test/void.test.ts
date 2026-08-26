/**
 * `void` — a hole in this storey's floor plate (v1.29).
 *
 * Three of the four decisions in `src/elements/void.ts` are behavioural claims that would
 * be invisible in a rendered SVG, so each is executed here rather than described:
 *
 *  1. **It obstructs circulation, and the obstruction is REAL.** Proved by a
 *     counterexample pair on the same plan — the route exists without the void and dies
 *     with it — because "the room is unreachable" is a claim a broken nav grid would also
 *     make. The complementary half matters just as much: the cells BESIDE a void stay
 *     walkable (you can stand at the railing), which is what the all-edges-open halo buys.
 *  2. **It does not touch the room's area.** Stated in the module header as a decision;
 *     pinned here so a later "improvement" that deducts it has to argue with a test.
 *  3. **The room it belongs to is found by the POLY-AWARE containment test** — a void in
 *     the notch of a U-shaped room is inside that room's bounding box and outside its
 *     floor, which is the v1.25.0 bbox-derived-position defect class exactly.
 */

import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, format, lint } from "../src/index.js";
import { resolve as resolvePlan } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import { VOID_LAYER } from "../src/elements/void.js";

const plan = (body: string): string => `plan "Void" {\n  units mm\n${body}\n}\n`;

const codesOf = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "<uncoded>");

const nodesOf = (src: string) => toScene(resolvePlan(parse(src).plan!).ir).nodes;

// ---------------------------------------------------------------------------
// What is drawn
// ---------------------------------------------------------------------------

describe("void — the Scene nodes", () => {
  const SRC = plan(`  room id=r1 at (0,0) size 6000x5000\n  void id=well at (1000,1000) size 2000x3000`);

  it("is a dashed rectangle crossed by BOTH diagonals", () => {
    const nodes = nodesOf(SRC).filter((n) => n.layerName === VOID_LAYER);
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.prim.t)).toEqual(["polygon", "line", "line"]);
    // The two diagonals really are the rectangle's, not two parallel ticks.
    const [d1, d2] = [nodes[1]!.prim, nodes[2]!.prim] as [
      { t: "line"; a: { x: number; y: number }; b: { x: number; y: number } },
      { t: "line"; a: { x: number; y: number }; b: { x: number; y: number } },
    ];
    expect([d1.a, d1.b]).toEqual([
      { x: 1000, y: 1000 },
      { x: 3000, y: 4000 },
    ]);
    expect([d2.a, d2.b]).toEqual([
      { x: 3000, y: 1000 },
      { x: 1000, y: 4000 },
    ]);
  });

  it("rides the furniture pass but keeps its own CAD layer", () => {
    for (const n of nodesOf(SRC).filter((x) => x.layerName === VOID_LAYER)) {
      expect(n.layer).toBe("furniture");
      expect(n.paint.fill).toBe("none");
      expect(n.lineWeight).toBe("thin");
    }
  });

  it("names the dashed line type AND carries the matching raw pattern", () => {
    const sizes = toScene(resolvePlan(parse(SRC).plan!).ir).sizes;
    for (const n of nodesOf(SRC).filter((x) => x.layerName === VOID_LAYER)) {
      expect(n.lineType).toBe("dashed");
      expect(n.paint.dash).toEqual([sizes.thin * 6, sizes.thin * 4]);
      expect(n.paint.width).toBe(sizes.thin);
    }
  });

  it("E_VOID_SIZE for a non-positive extent", () => {
    expect(codesOf(plan(`  room id=r1 at (0,0) size 6000x5000\n  void at (1000,1000) size 0x3000`))).toContain(
      "E_VOID_SIZE",
    );
    expect(codesOf(plan(`  room id=r1 at (0,0) size 6000x5000\n  void at (1000,1000) size 2000x0`))).toContain(
      "E_VOID_SIZE",
    );
  });
});

// ---------------------------------------------------------------------------
// describe()
// ---------------------------------------------------------------------------

describe("void — describe().voids", () => {
  it("reports id, extent and owning room", () => {
    const s = describePlan(plan(`  room id=r1 at (0,0) size 6000x5000\n  void id=well at (1000,1000) size 2000x3000`));
    expect(s.voids).toEqual([{ id: "well", at: { x: 1000, y: 1000 }, size: { w: 2000, h: 3000 }, room: "r1" }]);
  });

  it("is ABSENT on a plan that declares none", () => {
    expect(describePlan(plan(`  room id=r1 at (0,0) size 6000x5000`)).voids).toBeUndefined();
  });

  it("does NOT reduce the room's reported area", () => {
    const without = describePlan(plan(`  room id=r1 at (0,0) size 6000x5000`));
    const withVoid = describePlan(
      plan(`  room id=r1 at (0,0) size 6000x5000\n  void id=well at (1000,1000) size 2000x3000`),
    );
    expect(withVoid.rooms[0]!.area_m2).toBe(without.rooms[0]!.area_m2);
    expect(withVoid.totals.floor_area_m2).toBe(without.totals.floor_area_m2);
  });

  it("attributes by the FLOOR, not the bounding box, on a concave room", () => {
    // A U: the notch between the two legs is inside the bbox and outside the floor.
    // A void placed in the notch belongs to no room.
    const u = `  room id=u polygon (0,0) (9000,0) (9000,7000) (6000,7000) (6000,2500) (3000,2500) (3000,7000) (0,7000)`;
    const inNotch = describePlan(plan(`${u}\n  void id=v at (4000,4000) size 1000x1000`));
    expect(inNotch.voids![0]!.room).toBeNull();
    // …and one in a leg belongs to the room.
    const inLeg = describePlan(plan(`${u}\n  void id=v at (1000,4000) size 1000x1000`));
    expect(inLeg.voids![0]!.room).toBe("u");
  });
});

// ---------------------------------------------------------------------------
// Circulation
// ---------------------------------------------------------------------------

/**
 * A corridor plan: one long room entered at the left, one room off the right end. Without
 * a void the walk exists; a void spanning the corridor's full width severs it.
 */
const CORRIDOR = (extra: string): string =>
  plan(
    `  wall id=shell exterior thickness 200 { (0,0) (12000,0) (12000,2000) (0,2000) close }\n` +
      `  room id=hall at (0,0) size 8000x2000 uses circulation\n` +
      `  room id=back at (8000,0) size 4000x2000 uses living\n` +
      `  door id=front on shell at 5% width 900\n` +
      `  opening id=thru at (8000,1000) width 1200\n` +
      extra,
  );

describe("void — the nav grid", () => {
  /** The circulation walk into `back`, or null when the grid cannot reach it at all
   *  (an unreachable room is simply absent from the model's room list). */
  const walk = (src: string): number | null =>
    describePlan(src).circulation?.rooms.find((r) => r.roomId === "back")?.walkDistanceMm ?? null;

  it("a route that exists without the void dies with it (the counterexample pair)", () => {
    // The pair is the point: "unreachable" is also what a broken grid reports, so the
    // same plan must be shown routing before the hole is cut.
    expect(walk(CORRIDOR(""))).toBe(3300 + 6000);
    // A hole across the full 2 m width of the corridor, mid-run: no way past.
    expect(walk(CORRIDOR(`  void id=well at (4000,0) size 2000x2000`))).toBeNull();
  });

  it("you can still stand beside it — a partial void leaves the passage walkable", () => {
    // The same hole, 800 mm shy of the far side. The halo is suppressed on every edge, so
    // the strip along the railing stays walkable rather than being eroded away — and the
    // walk gets LONGER, which is what routing round a hole looks like.
    const detour = walk(CORRIDOR(`  void id=well at (4000,0) size 2000x1200`));
    expect(detour).not.toBeNull();
    expect(detour!).toBeGreaterThan(walk(CORRIDOR(""))!);
  });

  it("a void does NOT sever the access graph — it is a floor fact, not a door fact", () => {
    // `W_ROOM_UNREACHABLE` is a door/opening topology rule, and the opening is still
    // there. Pinning it keeps a future change from quietly making a void a connector
    // question, where it would then disagree with `describe().access`.
    const after = lint(CORRIDOR(`  void id=well at (4000,0) size 2000x2000`)).map((d) => d.code);
    expect(after).not.toContain("W_ROOM_UNREACHABLE");
  });

  it("adding a void changes nothing for the rooms it is not in", () => {
    // The obstacle list is append-only, so a hole at one end of the plan must not move
    // the walk into a room reached before it.
    const hallWalk = (src: string): number | undefined =>
      describePlan(src).circulation?.rooms.find((r) => r.roomId === "hall")?.walkDistanceMm;
    const bare = hallWalk(CORRIDOR(""));
    const far = hallWalk(CORRIDOR(`  room id=spare at (0,4000) size 2000x2000\n  void at (200,4200) size 400x400`));
    expect(bare).toBeDefined();
    expect(far).toBe(bare);
  });
});

// ---------------------------------------------------------------------------
// Composition + labels + fmt
// ---------------------------------------------------------------------------

describe("void — inside a placed component", () => {
  const COMPONENT =
    `  component unit() {\n` +
    `    room id=main at (0,0) size 4000x3000\n` +
    `    void id=well at (1000,500) size 1000x2000\n` +
    `  }\n`;

  it("rotates as an exact isometry (extents swap, corner re-derived)", () => {
    const s = describePlan(plan(`${COMPONENT}  place unit() as a at (10000,0) rotate 90`));
    const v = s.voids!.find((x) => x.id === "a.well")!;
    // (1000,500)+1000x2000, turned 90° clockwise about the local origin then translated:
    // local corners (1000,500)-(2000,2500) → (−500,1000)-(−2500,2000) → min corner
    // (−2500,1000) → +(10000,0).
    expect(v.size).toEqual({ w: 2000, h: 1000 });
    expect(v.at).toEqual({ x: 7500, y: 1000 });
  });

  it("mirrors, and the mirrored copy is the reflection of the original", () => {
    const s = describePlan(plan(`${COMPONENT}  place unit() as a at (0,0)\n  place unit() as b at (10000,0) mirror x`));
    const a = s.voids!.find((x) => x.id === "a.well")!;
    const b = s.voids!.find((x) => x.id === "b.well")!;
    expect(b.size).toEqual(a.size);
    // `mirror x` negates local x, so the opening's left edge lands at −(right edge).
    expect(b.at).toEqual({ x: 10000 - (a.at.x + a.size.w), y: a.at.y });
  });
});

describe("void — the room label gets out of its way", () => {
  it("a label centred over a void is relocated", () => {
    const labelY = (src: string): number => {
      const n = nodesOf(src).find((x) => x.layer === "labels" && x.prim.t === "text")!;
      return (n.prim as { t: "text"; at: { x: number; y: number } }).at.y;
    };
    const clear = plan(`  room id=r1 at (0,0) size 6000x5000 label "Living"`);
    // A void straddling the room's centre — where the name would otherwise sit.
    const buried = plan(`  room id=r1 at (0,0) size 6000x5000 label "Living"\n  void at (1500,1800) size 3000x1400`);
    expect(labelY(buried)).not.toBe(labelY(clear));
  });
});

describe("void — `arch fmt` round-trips it", () => {
  it("keeps the statement and is a fixpoint", () => {
    const src = plan(`  room id=r1 at (0,0) size 6000x5000\n  void id=well at (1000,1000) size 2000x3000`);
    const once = format(src);
    expect(once).toContain("void id=well at (1000, 1000) size 2000x3000");
    expect(format(once)).toBe(once);
  });
});
