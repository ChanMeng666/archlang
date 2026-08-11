/**
 * Component v2 — `place <component>(…) as <name> at (x,y) [rotate] [mirror]`.
 *
 * The load-bearing properties, in the order they matter:
 *
 *  1. a `place` at the origin with no transform is EXACTLY the inline body (byte-for-byte
 *     SVG, once the ids are namespaced by hand) — the transform machinery costs nothing
 *     when it is a no-op;
 *  2. `rotate`/`mirror` are exact integer isometries, checked against hand-computed
 *     coordinates rather than against themselves;
 *  3. a mirror is PHYSICS, not decoration: the door swings come out mirror-image;
 *  4. the id namespace is per-instance and order-independent, and dotted names work in
 *     reference positions only;
 *  5. an instance is a closed world for RESOLUTION but not for ANALYSIS — cross-instance
 *     overlap still fires, because lint sees one plan.
 */

import { describe, expect, it } from "vitest";
import { applyFixes, compile, describe as describePlan, lint, makeVirtualWorld } from "../src/index.js";

/** The gallery wing used by most cases: one room inside a closed shell, with a door. */
const WING = `component wing() {
    wall id=perimeter exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=main at (0,0) size 4000x3000 label "Gallery" uses living
    door id=entry at (2000,3000) width 900 wall exterior hinge left swing in
    furniture id=cot bed at (200,200) size 1000x2000
  }`;

const planWith = (body: string, head = ""): string => `plan "t" {\n  grid 100\n${head}\n  ${WING}\n${body}\n}`;

/** Room boxes by id, with the compile asserted clean — the shape most cases check. */
const rooms = (src: string): { id: string; x: number; y: number; w: number; h: number }[] => {
  const r = compile(src, { noCache: true });
  expect(r.errors.map((e) => e.message)).toEqual([]);
  return describePlan(src)
    .rooms.map((rm) => ({ id: rm.id, x: rm.bbox.x, y: rm.bbox.y, w: rm.bbox.w, h: rm.bbox.h }))
    .sort((a, b) => a.id.localeCompare(b.id));
};

/** The first swing arc's start point, straight out of the rendered SVG. */
const arcStart = (src: string): { x: number; y: number } => {
  const svg = compile(src, { noCache: true }).svg;
  const m = /<path[^>]*d="M ([-0-9.]+),([-0-9.]+) A /.exec(svg);
  expect(m).not.toBeNull();
  return { x: Number(m![1]), y: Number(m![2]) };
};

describe("place — the identity case costs nothing", () => {
  it("`place wing() as w at (0,0)` draws exactly what the inline body draws", () => {
    const inline = `plan "t" {
  grid 100
  wall id=perimeter exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=main at (0,0) size 4000x3000 label "Gallery" uses living
  door id=entry at (2000,3000) width 900 wall exterior hinge left swing in
  furniture id=cot bed at (200,200) size 1000x2000
}`;
    const placed = planWith(`  place wing() as w at (0,0)`);
    const a = compile(inline, { noCache: true });
    const b = compile(placed, { noCache: true });
    expect(a.errors.map((e) => e.message)).toEqual([]);
    expect(b.errors.map((e) => e.message)).toEqual([]);
    // Ids differ by construction (`w.` namespace); nothing else may.
    expect(b.svg).toBe(a.svg);
  });

  it("an instance's geometry equals the same body authored at the place origin", () => {
    const placed = planWith(`  place wing() as w at (5000,2000)`);
    const authored = `plan "t" {
  grid 100
  wall id=perimeter exterior thickness 200 { (5000,2000) (9000,2000) (9000,5000) (5000,5000) close }
  room id=main at (5000,2000) size 4000x3000 label "Gallery" uses living
  door id=entry at (7000,5000) width 900 wall exterior hinge left swing in
  furniture id=cot bed at (5200,2200) size 1000x2000
}`;
    expect(compile(placed, { noCache: true }).svg).toBe(compile(authored, { noCache: true }).svg);
  });
});

describe("place — exact quarter-turns and mirrors", () => {
  // A 4000×3000 room whose local top-left is (0,0), placed at (10000, 10000).
  const at = (rot: string) => planWith(`  place wing() as w at (10000,10000) ${rot}`);

  it("rotate 0 / 90 / 180 / 270 land on hand-computed coordinates", () => {
    // rot90 maps (x,y) → (−y, x); the rect's new top-left is the component-wise min of
    // the transformed corners, and w/h swap.
    const main = (rot: string) => rooms(at(rot)).find((r) => r.id === "w.main");
    expect(main("")).toEqual({ id: "w.main", x: 10000, y: 10000, w: 4000, h: 3000 });
    expect(main("rotate 90")).toEqual({ id: "w.main", x: 10000 - 3000, y: 10000, w: 3000, h: 4000 });
    expect(main("rotate 180")).toEqual({ id: "w.main", x: 10000 - 4000, y: 10000 - 3000, w: 4000, h: 3000 });
    expect(main("rotate 270")).toEqual({ id: "w.main", x: 10000, y: 10000 - 4000, w: 3000, h: 4000 });
  });

  it("mirror x flips left↔right and mirror y flips top↔bottom (exactly)", () => {
    expect(rooms(at("mirror x")).find((r) => r.id === "w.main")).toEqual({
      id: "w.main",
      x: 10000 - 4000,
      y: 10000,
      w: 4000,
      h: 3000,
    });
    expect(rooms(at("mirror y")).find((r) => r.id === "w.main")).toEqual({
      id: "w.main",
      x: 10000,
      y: 10000 - 3000,
      w: 4000,
      h: 3000,
    });
  });

  it("a fixture's drawn quarter-turn is carried through the frame", () => {
    // `wc` is orientation-sensitive; anchored to the room's top edge its back is derived
    // as north (rotate 0). Under a 90° instance turn its back must read east (rotate 90).
    const comp = `component bathroom() {
    wall shell thickness 200 { (0,0) (2000,0) (2000,2000) (0,2000) close }
    room id=b at (0,0) size 2000x2000 uses bath
    furniture id=pan wc in b anchor top size 400x600
  }`;
    const mk = (rot: string) => `plan "t" {\n  grid 100\n  ${comp}\n  place bathroom() as h at (0,0) ${rot}\n}`;
    const rot = (src: string): number | undefined => {
      const r = compile(src, { noCache: true });
      expect(r.errors.map((e) => e.message)).toEqual([]);
      return describePlan(src).furniture.find((e) => e.id === "h.pan")?.rotate;
    };
    expect(rot(mk(""))).toBe(undefined);
    expect(rot(mk("rotate 90"))).toBe(90);
    expect(rot(mk("rotate 180"))).toBe(180);
  });
});

describe("place — a mirror is physics: the door swing mirrors too", () => {
  const bath = `component bath() {
    wall shell thickness 200 { (0,0) (3000,0) (3000,3000) (0,3000) close }
    room id=r at (0,0) size 3000x3000 uses bath
    door id=d at (1000,0) width 800 wall shell hinge left swing in
  }`;
  const mk = (t: string) => `plan "t" {\n  grid 100\n  ${bath}\n  place bath() as b at (0,0) ${t}\n}`;

  it("the mirrored leaf sweeps the mirror-image side of the wall", () => {
    expect(compile(mk(""), { noCache: true }).errors).toEqual([]);
    expect(compile(mk("mirror x"), { noCache: true }).errors).toEqual([]);
    // The room mirrors about x …
    expect(rooms(mk("mirror x"))).toEqual([{ id: "b.r", x: -3000, y: 0, w: 3000, h: 3000 }]);
    // … and so does the door leaf. The wall's traversal direction reverses under the
    // reflection, so `swing` has to flip for the physical sweep to be the mirror image:
    // proved on the RENDERED arc, not on the field that produces it.
    const plain = arcStart(mk(""));
    const flipped = arcStart(mk("mirror x"));
    expect(flipped.x).toBe(-plain.x);
    expect(flipped.y).toBe(plain.y);
    // A pure rotation must NOT flip handedness — a 180 turn negates BOTH axes.
    const turned = arcStart(mk("rotate 180"));
    expect(turned.x).toBe(-plain.x);
    expect(turned.y).toBe(-plain.y);
  });
});

describe("place — the door VOCABULARY under a mirror: `slide`'s flip is the identity", () => {
  /**
   * The iron law is "add a handed rule ⇒ add its flip to `transformElement`". The door
   * vocabulary adds exactly one — `slide left|right` — and the honest answer is that
   * its flip is the IDENTITY, for the same reason `hinge`'s is: both are measured along
   * the host wall's traversal direction, which the frame carries with it, rather than
   * against a normal. That is a claim worth nothing without a fixture, so here it is,
   * stated the strongest way available: a mirrored instance must equal a hand-authored
   * mirror-image twin, BYTE FOR BYTE.
   *
   * Read the two sources side by side. Every `slide` word is written UNCHANGED in the
   * twin and every `swing` word is written FLIPPED — which is precisely the split
   * `frame.ts` implements (`swing` reverses when `det(f) < 0`, `hinge` does not). If
   * `slide` ever needed a compensating flip this case would fail, and the reasoning
   * behind `hinge`'s existing exemption would be wrong too — a much larger finding than
   * a door kind, and one to report rather than patch around.
   */
  const wing = `component wing() {
    wall id=w partition thickness 200 { (0,0) (6000,0) }
    door id=sl sliding on w at 1500 width 1200 slide left
    door id=bn barn    on w at 3000 width 1000 swing in  slide right
    door id=bf bifold  on w at 4200 width 1400 swing out slide left
    door id=pk pocket  on w at 5200 width 700  slide right open 0.4
  }`;
  const placed = (t: string): string => `plan "t" {\n  grid 100\n  ${wing}\n  place wing() as m at (0,0) ${t}\n}`;
  /** The same body in world coordinates after `mirror x`: (x,y) → (−x,y). */
  const twin = (slide: [string, string, string, string], swing: [string, string]): string => `plan "t" {
  grid 100
  wall id=w partition thickness 200 { (0,0) (-6000,0) }
  door id=sl sliding on w at 1500 width 1200 slide ${slide[0]}
  door id=bn barn    on w at 3000 width 1000 swing ${swing[0]}  slide ${slide[1]}
  door id=bf bifold  on w at 4200 width 1400 swing ${swing[1]} slide ${slide[2]}
  door id=pk pocket  on w at 5200 width 700  slide ${slide[3]} open 0.4
}`;

  it("a mirrored instance equals the twin written with `slide` UNCHANGED and `swing` flipped", () => {
    const a = compile(placed("mirror x"), { noCache: true });
    const b = compile(twin(["left", "right", "left", "right"], ["out", "in "]), { noCache: true });
    expect(a.errors.map((e) => e.message)).toEqual([]);
    expect(b.errors.map((e) => e.message)).toEqual([]);
    expect(a.svg).toBe(b.svg);
  });

  it("is not vacuous: reversing any `slide` in the twin breaks the equality", () => {
    // If `slide` were ignored by the renderer the case above would pass for free.
    const a = compile(placed("mirror x"), { noCache: true }).svg;
    expect(compile(twin(["right", "right", "left", "right"], ["out", "in "]), { noCache: true }).svg).not.toBe(a);
    expect(compile(twin(["left", "right", "left", "left"], ["out", "in "]), { noCache: true }).svg).not.toBe(a);
    // …and `swing` genuinely does need its flip: writing it unflipped also breaks.
    expect(compile(twin(["left", "right", "left", "right"], ["in ", "out"]), { noCache: true }).svg).not.toBe(a);
  });

  it("holds under `mirror y` as well", () => {
    const a = compile(placed("mirror y"), { noCache: true });
    expect(a.errors.map((e) => e.message)).toEqual([]);
    const b = compile(
      `plan "t" {
  grid 100
  wall id=w partition thickness 200 { (0,0) (6000,0) }
  door id=sl sliding on w at 1500 width 1200 slide left
  door id=bn barn    on w at 3000 width 1000 swing out slide right
  door id=bf bifold  on w at 4200 width 1400 swing in  slide left
  door id=pk pocket  on w at 5200 width 700  slide right open 0.4
}`,
      { noCache: true },
    );
    expect(a.svg).toBe(b.svg);
  });
});

describe("place — id namespacing", () => {
  it("two instances get order-independent, per-instance auto-ids", () => {
    const anon = `component box() {
    wall shell thickness 200 { (0,0) (2000,0) (2000,2000) (0,2000) close }
    room at (0,0) size 2000x2000
  }`;
    const src = `plan "t" {\n  grid 100\n  ${anon}\n  place box() as west at (0,0)\n  place box() as east at (5000,0)\n}`;
    const ids = describePlan(src)
      .rooms.map((r) => r.id)
      .sort();
    expect(ids).toEqual(["east.room_1", "west.room_1"]);
    // Swapping the order swaps only WHICH instance is first, never the ids inside them.
    const swapped = `plan "t" {\n  grid 100\n  ${anon}\n  place box() as east at (5000,0)\n  place box() as west at (0,0)\n}`;
    expect(
      describePlan(swapped)
        .rooms.map((r) => r.id)
        .sort(),
    ).toEqual(ids);
  });

  it("dotted names resolve in REFERENCE positions from the plan", () => {
    const src = planWith(
      `  place wing() as west at (0,0)
  furniture id=d desk in west.main centered size 1200x600
  door id=side on west.perimeter at 25% width 800`,
    );
    const r = compile(src, { noCache: true });
    expect(r.errors.map((e) => e.message)).toEqual([]);
    const sum = describePlan(src);
    expect(sum.furniture.find((e) => e.id === "d")?.room).toBe("west.main");
    // The door attached to the instance's wall really is hosted — an unhosted door
    // connects nothing, so `between` would be empty.
    expect(sum.doors.find((e) => e.id === "side")?.between.length).toBeGreaterThan(0);
  });

  it("a dotted name in a DECLARATION position is E_DOTTED_DECL", () => {
    const src = `plan "t" {\n  grid 100\n  room id=west.main at (0,0) size 1000x1000\n}`;
    const r = compile(src, { noCache: true });
    expect(r.diagnostics.map((d) => d.code)).toContain("E_DOTTED_DECL");
  });

  it("reusing an instance name is E_DUP_INSTANCE", () => {
    const src = planWith(`  place wing() as west at (0,0)\n  place wing() as west at (9000,0)`);
    const r = compile(src, { noCache: true });
    expect(r.diagnostics.map((d) => d.code)).toContain("E_DUP_INSTANCE");
  });

  it("`as` and `at` are required — the legacy bare call is the other form", () => {
    const noAs = planWith(`  place wing()`);
    expect(compile(noAs, { noCache: true }).errors.length).toBeGreaterThan(0);
    const noAt = planWith(`  place wing() as w`);
    expect(compile(noAt, { noCache: true }).errors.length).toBeGreaterThan(0);
  });
});

describe("place — the plan is still ONE plan for analysis", () => {
  it("two overlapping instances raise W_ROOM_OVERLAP across the instance boundary", () => {
    const src = planWith(`  place wing() as west at (0,0)\n  place wing() as east at (2000,0)`);
    const codes = compile(src, { noCache: true }).diagnostics.map((d) => d.code);
    expect(codes).toContain("W_ROOM_OVERLAP");
    const msg = compile(src, { noCache: true }).diagnostics.find((d) => d.code === "W_ROOM_OVERLAP")?.message;
    expect(msg).toContain("west.main");
    expect(msg).toContain("east.main");
  });

  it("lint reads instance contents under their namespaced ids", () => {
    // A fixture buried in the wall solid is a whole-plan geometric fact, and lint must
    // report it against the id the plan can actually address.
    const buried = `component bad() {
    wall id=w exterior thickness 300 { (0,0) (3000,0) (3000,3000) (0,3000) close }
    room id=r at (0,0) size 3000x3000 uses bedroom
    furniture id=cot bed at (-100,500) size 1000x2000
  }`;
    const src = `plan "t" {
  grid 50
  ${buried}
  place bad() as west at (0,0)
}`;
    const found = lint(src);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((d) => d.message.includes("west."))).toBe(true);
  });
});

describe("place — describe() reports instance identity and freedom", () => {
  it("elements and rooms carry `instance` + `component`", () => {
    const src = planWith(`  place wing() as west at (0,0)`);
    const d = describePlan(src);
    const room = d.rooms.find((r) => r.id === "west.main");
    expect(room?.instance).toBe("west");
    expect(room?.component).toBe("wing");
    expect(d.instances).toEqual([{ name: "west", component: "wing", at: { x: 0, y: 0 }, rotate: 0 }]);
  });

  it("the instance placement is authored-absolute; its interior is derived", () => {
    const src = planWith(`  place wing() as west at (3000,0) rotate 90`);
    const f = describePlan(src).freedom;
    const row = f.elements.find((r) => r.id === "west.main");
    // The room is authored `at (0,0)` INSIDE its component — that is what `placement`
    // reports — but its position on the page derives from the instance frame, which is
    // the one authored-absolute degree of freedom.
    expect(row?.placement).toBe("absolute");
    expect(row?.instance).toBe("west");
    expect(describePlan(src).instances?.[0]).toEqual({
      name: "west",
      component: "wing",
      at: { x: 3000, y: 0 },
      rotate: 90,
    });
  });
});

describe("place — an instance IS a zone", () => {
  it("`place wing() as west` declares the zone `west` with the instance's rooms", () => {
    const src = planWith(`  place wing() as west at (0,0)\n  place wing() as east at (9000,0) mirror x`);
    const z = describePlan(src).zones;
    expect(z?.map((x) => x.path)).toEqual(["west", "east"]);
    expect(z?.find((x) => x.path === "west")?.rooms).toEqual(["west.main"]);
    expect(z?.find((x) => x.path === "east")?.rooms).toEqual(["east.main"]);
    // No invented label: the instance NAME is the heading, so the drawn schedule's group
    // headings read `west` / `east` rather than the same component name twice.
    expect(z?.[0]?.label).toBeUndefined();
  });

  it("the room schedule groups by the instance with no extra declaration", () => {
    const src = planWith(`  place wing() as west at (0,0)\n  place wing() as east at (9000,0)`, `  schedule rooms`);
    const rows = describePlan(src).schedule;
    expect(rows).toBeDefined();
    // Every row is attributed to the instance that drew it.
    expect(rows?.map((r) => r.id)).toContain("west.main");
    expect(rows?.map((r) => r.id)).toContain("east.main");
  });

  it("an explicit `zone` around a `place` nests, innermost (the instance) winning", () => {
    const src = planWith(`  zone north "North range" {\n    place wing() as west at (0,0)\n  }`);
    const z = describePlan(src).zones;
    expect(z?.map((x) => x.path)).toEqual(["north", "north.west"]);
    // Membership rolls up: the outer zone contains the instance's rooms too. Note the
    // ZONE path (`north.west`) and the ID namespace (`west.`) are deliberately separate —
    // a zone is metadata and never renames anything, so wrapping a `place` in a zone
    // cannot change what the plan calls its rooms.
    expect(z?.find((x) => x.path === "north")?.rooms).toEqual(["west.main"]);
    expect(z?.find((x) => x.path === "north.west")?.rooms).toEqual(["west.main"]);
  });

  it("a LEGACY bare call declares no zone — a macro is not a thing", () => {
    const src = planWith(`  wing()`);
    expect(describePlan(src).zones).toBeUndefined();
  });
});

describe("place — nesting, levels and determinism", () => {
  it("a `place` inside a component body composes the frames", () => {
    const src = `plan "t" {
  grid 100
  component leaf() {
    room id=r at (0,0) size 1000x2000
  }
  component branch() {
    place leaf() as inner at (1000,0) rotate 90
  }
  place branch() as outer at (10000,10000) rotate 90
}`;
    const r = compile(src, { noCache: true });
    expect(r.errors.map((e) => e.message)).toEqual([]);
    // leaf → rotate 90 at (1000,0) → rotate 90 at (10000,10000): the two turns compose to
    // 180, and the origin (1000,0) itself turns to (0,1000) before translating.
    expect(rooms(src)).toEqual([{ id: "outer.inner.r", x: 10000 - 1000, y: 10000 - 1000, w: 1000, h: 2000 }]);
  });

  it("`place` is legal inside a `level` block and stays on that storey", () => {
    const src = `plan "t" {
  grid 100
  ${WING}
  level 1 "Ground" { place wing() as g at (0,0) }
  level 2 "Upper"  { place wing() as u at (0,0) }
}`;
    const d = describePlan(src);
    expect(d.levels?.map((l) => l.level)).toEqual([1, 2]);
    expect(compile(src, { noCache: true }).pages?.length).toBe(2);
  });

  it("output is deterministic", () => {
    const src = planWith(`  place wing() as west at (0,0)\n  place wing() as east at (9000,0) rotate 180 mirror x`);
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});

describe('whole-file instantiation — `import "x.arch" as name`', () => {
  const wingFile = `plan "wing" {
  units mm
  grid 250
  paper A0 portrait
  wall shell thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=main at (0,0) size 4000x3000 label "Gallery" uses living
}`;

  it("the file's top-level statements become a zero-arg component", () => {
    const main = `plan "m" {
  grid 100
  import "wing.arch" as wing
  place wing() as west at (0,0)
  place wing() as east at (6000,0) mirror x
}`;
    const world = makeVirtualWorld({ "wing.arch": wingFile });
    const r = compile(main, { world, noCache: true });
    expect(r.errors.map((e) => e.message)).toEqual([]);
    const ids = describePlan(main, { world })
      .rooms.map((x) => x.id)
      .sort();
    expect(ids).toEqual(["east.main", "west.main"]);
  });

  it("the module's plan-level settings are ignored — the ROOT plan governs", () => {
    const main = `plan "m" {\n  grid 100\n  import "wing.arch" as wing\n  place wing() as west at (0,0)\n}`;
    const world = makeVirtualWorld({ "wing.arch": wingFile });
    const svg = compile(main, { world, noCache: true }).svg;
    // The module declares `paper A0 portrait`; the root does not, so no sheet is in force.
    expect(svg).not.toContain("A0");
    expect(describePlan(main, { world }).sheet).toBeUndefined();
  });

  it("a module with no drawable body warns rather than binding silence", () => {
    const world = makeVirtualWorld({ "empty.arch": `plan "e" {\n  component c() { room at (0,0) size 1x1 }\n}` });
    const main = `plan "m" {\n  import "empty.arch" as e\n  place e() as x at (0,0)\n}`;
    expect(compile(main, { world, noCache: true }).diagnostics.map((d) => d.code)).toContain("W_IMPORT_EMPTY_FILE");
  });
});

describe("cross-file diagnostics never edit the wrong file", () => {
  const lib = `plan "lib" {
  component nook() {
    wall id=w exterior thickness 200 { (0,0) (2000,0) (2000,2000) (0,2000) close }
    room id=n at (0,0) size 2000x2000
    door id=d at (99999,99999) width 800
  }
}`;
  const main = `plan "main" {
  grid 100
  import "lib.arch": nook
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  place nook() as n1 at (0,0)
}`;

  it("a diagnostic from an imported body names its FILE and its INSTANCE", () => {
    const world = makeVirtualWorld({ "lib.arch": lib });
    const d = compile(main, { world, noCache: true }).diagnostics.find((x) => x.code === "W_DOOR_OFF_WALL");
    expect(d).toBeDefined();
    expect(d?.file).toBe("lib.arch");
    expect(d?.instance).toBe("n1");
    expect(d?.component).toBe("nook");
    // The span is measured in lib.arch — and says so, instead of silently addressing
    // unrelated bytes of `main`.
    expect(lib.slice(d!.span!.start, d!.span!.end)).toContain("door id=d");
  });

  it("`arch fix` refuses a fix whose spans belong to another file", () => {
    const world = makeVirtualWorld({ "lib.arch": lib });
    const suggestions = compile(main, { world, noCache: true }).diagnostics.flatMap((x) => x.fixes ?? []);
    expect(suggestions.length).toBeGreaterThan(0);
    const report = applyFixes(main, suggestions);
    expect(report.applied).toEqual([]);
    expect(report.output).toBe(main);
    expect(report.skipped[0]?.reason).toContain("lib.arch");
  });
});

describe("legacy bare calls are untouched", () => {
  const anon = `component box() {
    wall shell thickness 200 { (0,0) (2000,0) (2000,2000) (0,2000) close }
    room at (0,0) size 2000x2000
  }`;
  const twice = `plan "t" {\n  grid 100\n  ${anon}\n  box()\n  box()\n}`;

  it("`box()` still splices inline, with the caller's GLOBAL id counters", () => {
    expect(compile(twice, { noCache: true }).errors.map((e) => e.message)).toEqual([]);
    // No namespace, and the counters keep running across the two expansions.
    expect(describePlan(twice).rooms.map((x) => x.id)).toEqual(["room_1", "room_2"]);
    expect(describePlan(twice).instances).toBeUndefined();
  });

  it("both expansions land at the SAME coordinates (the macro has no placement)", () => {
    expect(rooms(twice).map((r) => `${r.x},${r.y}`)).toEqual(["0,0", "0,0"]);
  });

  it("an explicit id inside a twice-called macro still collides (E_DUP_ID), as before", () => {
    const src = planWith(`  wing()\n  wing()`);
    expect(compile(src, { noCache: true }).diagnostics.map((d) => d.code)).toContain("E_DUP_ID");
  });
});
