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
import { makeFrame, transformElement } from "../src/frame.js";
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
      ["W_ROOM_OVERLAP", null],
    ]);
  });
});
