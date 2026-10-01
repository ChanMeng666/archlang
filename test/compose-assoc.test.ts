/**
 * `place` composes ASSOCIATIVELY: every level reaches into its own descendants the way the
 * root does, and none reaches out (ADR 0016 §3, backlog E.16).
 *
 * A component body that references one of its own child instances (`door … on i.shell`,
 * `furniture … in i.main anchor …`, `room … right-of i.main`) must resolve exactly as the
 * same statements do when they are the plan's own root body. So a plan P and P wrapped as
 * `import "p.arch" as w` + `place w() as g at (0,0)` state the same facts modulo the `g.`
 * prefix, and a turned instance of such a component is the turn of its root spelling.
 */

import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { composeFrame, makeFrame, transformElement } from "../src/frame.js";
import { compile, describe as describePlan, lint, makeVirtualWorld, type World } from "../src/index.js";
import type { RDoor, RFurniture, ResolvedElement, RRoom } from "../src/ir.js";

const INNER = `  component inner() {
    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=main at (0,0) size 4000x3000 label "Inner" uses office
  }`;

/** mid's body: it places `inner` and reaches into it three ways — a wall a door attaches
 *  to, a room a fixture anchors in, and a room a relational placement references. */
const MID_BODY = `place inner() as i at (2000,1000)
    wall id=hall partition thickness 100 { (0,0) (0,6000) }
    room id=lobby at (0,0) size 2000x6000 label "Lobby" uses hall
    room id=annex right-of i.main align top gap 0 size 2000x3000 label "Annex" uses office
    door id=d on i.shell at 90% width 900
    furniture id=f desk in i.main anchor top-left inset 300 size 1200x600`;

const HEAD = `  units mm\n  grid 100`;

/** outer (the plan) places mid, mid places inner. */
const nest = (transform = ""): string =>
  `plan "nest" {\n${HEAD}\n${INNER}\n  component mid() {\n    ${MID_BODY}\n  }\n  place mid() as m at (10000,0)${transform}\n}\n`;

/** mid's body as a plan's own ROOT body — the spelling whose reach-in always worked. */
const ROOT_SPELLING = `plan "mid" {\n${HEAD}\n${INNER}\n    ${MID_BODY}\n}\n`;

/** The file placed one level further down, at the identity. */
const WRAP = `plan "wrap" {\n${HEAD}\n  import "p.arch" as w\n  place w() as g at (0,0)\n}\n`;

/** Strip the wrapper's `g.` namespace wherever an id or instance path is written. */
const unprefix = (v: unknown): unknown => {
  if (typeof v === "string") return v.replace(/(^|[^\w.])g\./g, "$1");
  if (Array.isArray(v)) return v.map(unprefix);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unprefix(x)]));
  return v;
};

/** An element with the keys that only say WHERE it was authored removed. */
const bare = (e: ResolvedElement, drop: readonly string[]): Record<string, unknown> => {
  const out = JSON.parse(JSON.stringify(e)) as Record<string, unknown>;
  for (const k of drop) delete out[k];
  return out;
};

/**
 * The facts a caller can observe: every resolved element and wall, `compile()`'s
 * diagnostics, `lint()`, and describe()'s rooms, doors and fixtures. Spans are left out —
 * the wrapper's point into `p.arch` by construction — and so is `_file`, which says the same.
 */
function facts(src: string, world: World): Record<string, unknown> {
  const { ir } = resolvePlan(src, { world });
  const s = describePlan(src, { world });
  const diag = (d: { code?: string; severity: string; message: string; instance?: string }) => ({
    code: d.code,
    severity: d.severity,
    message: d.message,
    instance: d.instance,
  });
  return {
    elements: ir?.elements.map((e) => bare(e, ["_file"])),
    walls: ir?.walls.map((e) => bare(e, ["_file"])),
    diagnostics: compile(src, { noCache: true, world }).diagnostics.map(diag),
    lint: lint(src, { world }).map(diag),
    rooms: s.rooms,
    doors: s.doors,
    furniture: s.furniture,
  };
}

const worldFor = (src: string): World => makeVirtualWorld({ "p.arch": src });
const ir = (src: string, world?: World) => resolvePlan(src, world ? { world } : {}).ir!;
const byId = <T extends ResolvedElement>(els: readonly ResolvedElement[], kind: T["kind"], id: string): T =>
  els.find((e): e is T => e.kind === kind && e.id === id)!;

describe("composition is associative: placing a plan changes nothing but the namespace", () => {
  it("a three-level nest whose middle level reaches into its child compiles clean", () => {
    const src = nest();
    expect(compile(src, { noCache: true }).diagnostics).toEqual([]);
    const els = ir(src).elements;
    // Hand-computed from mid's local frame, translated by (10000,0).
    expect(byId<RRoom>(els, "room", "m.i.main")).toMatchObject({
      at: { x: 12000, y: 1000 },
      size: { w: 4000, h: 3000 },
    });
    expect(byId<RRoom>(els, "room", "m.annex")).toMatchObject({
      at: { x: 16000, y: 1000 },
      size: { w: 2000, h: 3000 },
    });
    expect(byId<RFurniture>(els, "furniture", "m.f")).toMatchObject({ at: { x: 12300, y: 1300 } });
    // 90% of the 14000 mm loop is 1600 mm up its west side from (0,3000): local (0,1400).
    const d = byId<RDoor>(els, "door", "m.d");
    expect(d.at).toEqual({ x: 12000, y: 2400 });
    expect(d.host?.wallId).toBe("m.i.shell");
  });

  it("the same file placed at the identity states the same facts modulo `g.`", () => {
    const src = nest();
    const world = worldFor(src);
    const root = facts(src, world);
    const placed = facts(WRAP, world);
    expect((root.elements as unknown[]).length).toBeGreaterThan(0);
    expect(root.diagnostics).toEqual([]);
    expect(unprefix(placed)).toEqual(root);
    // …and the reach-in really went through the extra level.
    expect(byId<RDoor>(ir(WRAP, world).elements, "door", "g.m.d").host?.wallId).toBe("g.m.i.shell");
  });

  it("a TURNED middle level is the turn of its root spelling", () => {
    const src = nest(" rotate 90");
    expect(compile(src, { noCache: true }).diagnostics).toEqual([]);
    expect(compile(ROOT_SPELLING, { noCache: true }).diagnostics).toEqual([]);
    // mid's body at the ROOT (reach-in that has always worked), carried by m's frame.
    // Left out: the keys that say where a statement was authored (the two sources differ in
    // byte offsets and instance paths by construction), and a wall's `openings`, which the
    // ROOT spelling registers before this hand-applied frame could namespace their owners.
    const f = makeFrame({ origin: { x: 10000, y: 0 }, rotate: 90, prefix: "m", component: "mid" });
    const where = ["_instance", "_component", "_zone", "span", "_rotateSpan", "openings"];
    const expected = ir(ROOT_SPELLING).elements.map((e) => bare(transformElement(f, e), where));
    expect(ir(src).elements.map((e) => bare(e, where))).toEqual(expected);
    expect(byId(ir(src).elements, "wall", "m.i.shell")).toMatchObject({
      openings: [{ at: { x: 7600, y: 2000 }, width: 900, kind: "door", ownerId: "m.d" }],
    });
    // Independently, by hand: (x, y) ↦ (−y, x) + (10000, 0), a clockwise quarter-turn.
    const els = ir(src).elements;
    expect(byId<RRoom>(els, "room", "m.i.main")).toMatchObject({
      at: { x: 6000, y: 2000 },
      size: { w: 3000, h: 4000 },
    });
    expect(byId<RRoom>(els, "room", "m.annex")).toMatchObject({ at: { x: 6000, y: 6000 }, size: { w: 3000, h: 2000 } });
    expect(byId<RFurniture>(els, "furniture", "m.f")).toMatchObject({ at: { x: 8100, y: 2300 } });
    expect(byId<RDoor>(els, "door", "m.d").at).toEqual({ x: 7600, y: 2000 });
    // And one level further down it is still only a namespace.
    const world = worldFor(src);
    expect(unprefix(facts(WRAP, world))).toEqual(facts(src, world));
  });
});

describe("no level reaches out", () => {
  it("a child cannot reference its parent's wall or room (the code it always raised)", () => {
    const body = (refs: string) =>
      `plan "ro" {\n  units mm\n  component inner() {\n    wall id=own partition thickness 100 { (0,0) (4000,0) }\n    room id=main at (0,0) size 4000x3000\n${refs}\n  }\n  component mid() {\n    wall id=hall partition thickness 100 { (0,0) (0,6000) }\n    room id=lobby at (-3000,0) size 3000x6000\n    place inner() as i at (0,0)\n  }\n  place mid() as m at (0,0)\n}`;
    const out = (refs: string) =>
      compile(body(refs), { noCache: true }).diagnostics.map((d) => [d.code, d.instance] as const);
    // The control: the same statements naming the child's OWN wall and room resolve.
    expect(
      out("    door id=x on own at 50% width 900\n    furniture id=y desk in main anchor top-left size 600x600"),
    ).toEqual([]);
    expect(
      out("    door id=x on hall at 50% width 900\n    furniture id=y desk in lobby anchor top-left size 600x600"),
    ).toEqual([
      ["E_ATTACH_WALL_REF", "m.i"],
      ["E_PLACE_REF", "m.i"],
    ]);
  });

  it("a sibling instance is invisible: only the common parent can reference both", () => {
    const plan = (bBody: string, hostBody = "") =>
      `plan "sib" {\n  units mm\n  component a() {\n    room id=main at (0,0) size 3000x3000\n  }\n  component b() {\n    room id=main at (0,0) size 3000x3000\n${bBody}\n  }\n  component host() {\n    place a() as a at (0,0)\n    place b() as b at (5000,0)\n${hostBody}\n  }\n  place host() as h at (0,0)\n}`;
    const refs = (room: string) =>
      `    furniture id=y desk in ${room} anchor top-left size 600x600\n    room id=r right-of ${room} size 1000x1000`;
    const codes = (src: string) =>
      compile(src, { noCache: true }).diagnostics.map((d) => [d.code, d.instance ?? null] as const);
    // The control: the PARENT of both reaches into `a` — no reference error, the relational
    // room lands against a.main's right edge.
    const parent = plan("", refs("a.main"));
    expect(codes(parent).filter(([c]) => c?.startsWith("E_"))).toEqual([]);
    expect(byId<RRoom>(ir(parent).elements, "room", "h.r").at).toEqual({ x: 3000, y: 0 });
    // From inside `b`, `a.main` does not exist.
    expect(codes(plan(refs("a.main")))).toEqual([
      ["E_PLACE_REF", "h.b"],
      ["E_LAYOUT_REF", "h.b"],
    ]);
    // (The room that failed to place is skipped by the overlap check: its `at` is a
    // placeholder, so the former W_ROOM_OVERLAP here was phantom noise.)
  });
});

describe("a host found through a descendant is registered on its wall — by id, not by coordinates", () => {
  // With `grid 0` a descendant's wall reaches the plan through the COMPOSED frame, while a
  // door the parent hosted on it is carried by the child's frame and then the parent's —
  // the same point by two float evaluation orders. Registering the opening by endpoint
  // equality lost it silently: the wall was drawn solid across the door.
  const CASES = [
    { name: "tenths, no turn", c: ["0.2", "0.7"], p: ["0.3", "0.9"], rotate: 0, mirror: undefined },
    { name: "thirds, parent turned 90", c: ["0.1", "1000/3"], p: ["0.1", "1000/3"], rotate: 90, mirror: undefined },
    { name: "tenths and thirds, parent mirrored", c: ["0.1", "0.2"], p: ["0.2", "1000/3"], rotate: 270, mirror: "x" },
  ] as const;
  const num = (s: string): number => {
    const [a, b] = s.split("/");
    return b === undefined ? Number(a) : Number(a) / Number(b);
  };
  const INNER_TENTHS = `  component inner() {
    wall id=shell exterior thickness 200 { (0.1,0.1) (4000.1,0.1) (4000.1,3000.1) (0.1,3000.1) close }
    room id=main at (0.1,0.1) size 4000x3000
  }`;
  const xf = (rotate: number, mirror?: string) =>
    `${rotate ? ` rotate ${rotate}` : ""}${mirror ? ` mirror ${mirror}` : ""}`;
  /** The wall outline as drawn, rounded to the 1e-6 mm comparison quantum. */
  const wallFace = (src: string) =>
    JSON.stringify(
      compile(src, { noCache: true, annotate: true })
        .scene!.nodes.filter((n) => n.layer === "wallFace")
        .map((n) => n.prim),
      (_k, v: unknown) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 + 0 : v),
    );
  const openings = (src: string, id: string) => ir(src).walls.find((w) => w.id === id)?.openings ?? [];

  for (const k of CASES) {
    it(`${k.name}: one opening on the child's wall, and the hole the root spelling cuts`, () => {
      const nested = (door: boolean) =>
        `plan "h" {\n  units mm\n${INNER_TENTHS}\n  component mid() {\n    place inner() as i at (${k.c[0]},${k.c[1]})\n${door ? "    door id=d on i.shell at 50% width 900\n" : ""}  }\n  place mid() as m at (${k.p[0]},${k.p[1]})${xf(k.rotate, k.mirror)}\n}`;
      // The root spelling: the child placed at the root by the composed frame and the door
      // written at the root — the single-level path, where host and wall share one frame.
      const f = composeFrame(
        makeFrame({
          origin: { x: num(k.p[0]), y: num(k.p[1]) },
          rotate: k.rotate,
          ...(k.mirror ? { mirror: k.mirror } : {}),
          prefix: "m",
          component: "mid",
        }),
        makeFrame({ origin: { x: num(k.c[0]), y: num(k.c[1]) }, prefix: "m.i", component: "inner" }),
      );
      const flat = `plan "h" {\n  units mm\n${INNER_TENTHS}\n  place inner() as i at (${f.tx},${f.ty})${xf(f.rotate, f.mirror)}\n  door id=d on i.shell at 50% width 900\n}`;
      expect(compile(nested(true), { noCache: true }).diagnostics).toEqual([]);
      expect(compile(flat, { noCache: true }).diagnostics).toEqual([]);
      expect(openings(nested(true), "m.i.shell").map((o) => o.ownerId)).toEqual(["m.d"]);
      expect(openings(flat, "i.shell").map((o) => o.ownerId)).toEqual(["d"]);
      // The hole is really cut: the outline differs from the door-less plan's…
      expect(wallFace(nested(true))).not.toBe(wallFace(nested(false)));
      // …and is the root spelling's, to the comparison quantum.
      expect(wallFace(nested(true))).toBe(wallFace(flat));
    });
  }
});

describe("a tie between a component's own wall and its child's goes where the root sends it", () => {
  // At the root, instance walls precede the root's own (ADR 0016, Consequences) and the
  // nearest-wall host is first-wins, so a coincident INSTANCE wall wins whatever the source
  // order. Nested must be the root: a component's view lists its descendants first.
  const OWN = "wall id=own exterior thickness 200 { (0,0) (4000,0) }";
  const PLACE = "place inner() as i at (0,0)";
  for (const ref of ["", " wall exterior"])
    for (const ownFirst of [true, false]) {
      it(`${ref ? "by category" : "by position"}, own wall written ${ownFirst ? "first" : "second"}`, () => {
        const body = `${ownFirst ? OWN : PLACE}\n    ${ownFirst ? PLACE : OWN}\n    door id=d at (2000,0) width 900${ref}`;
        const nested = `plan "t" {\n  units mm\n${INNER}\n  component mid() {\n    ${body}\n  }\n  place mid() as m at (1000,1000)\n}`;
        const root = `plan "t" {\n  units mm\n${INNER}\n    ${body}\n}`;
        const host = (src: string, id: string) => byId<RDoor>(ir(src).elements, "door", id).host?.wallId;
        const cut = (src: string) => Object.fromEntries(ir(src).walls.map((w) => [w.id, w.openings.length]));
        expect(host(root, "d")).toBe("i.shell");
        expect(host(nested, "m.d")).toBe("m.i.shell");
        expect(cut(root)).toEqual({ "i.shell": 1, own: 0 });
        expect(cut(nested)).toEqual({ "m.i.shell": 1, "m.own": 0 });
        expect(compile(nested, { noCache: true }).diagnostics.map((d) => d.code)).toEqual(
          compile(root, { noCache: true }).diagnostics.map((d) => d.code),
        );
      });
    }

  it("a category search sees the child's walls too — the root's verdict, even when it is an error", () => {
    // A plan that compiled clean before W8 (the component could not see `i.shell`) and now
    // does not: `exterior` names two walls here, exactly as it does in the root spelling.
    const body = `wall id=outer exterior thickness 200 { (-3000,0) (-3000,3000) }
    room id=hall at (-3000,0) size 3000x3000
    place inner() as i at (0,0)
    furniture id=k counter against wall exterior offset 500 size 1200x600 in hall`;
    const nested = `plan "fa" {\n  units mm\n${INNER}\n  component mid() {\n    ${body}\n  }\n  place mid() as m at (0,0)\n}`;
    const root = `plan "fa" {\n  units mm\n${INNER}\n    ${body}\n}`;
    const codes = (src: string) => compile(src, { noCache: true }).diagnostics.map((d) => d.code);
    expect(codes(root)).toEqual(["E_FURN_AGAINST"]);
    expect(codes(nested)).toEqual(codes(root));
  });
});
