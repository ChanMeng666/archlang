/**
 * The datum table (ADR 0028 §1, card PS3.2 part A): after every room of a resolution group is
 * placed — relational placement included — and before any wall resolves, the group's room
 * edges, centres and grid axes are frozen into a table (`src/room-datums.ts`). Nothing in the
 * language reads it yet (part B); these tests pin what it holds, that it is read-only, what it
 * costs on the step meter, and that walls now resolve after the rooms are final.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, type ElementDef } from "../src/index.js";
import { MAX_EVAL_STEPS, withStepMeter } from "../src/expr.js";
import { datumTablesOf, resolve, type RRoom } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { wall } from "../src/elements/wall.js";
import { buildDatumTable, type DatumTable } from "../src/room-datums.js";
import { NULL_WORLD } from "../src/world.js";

const plan = (body: string): string => `plan "D" {\n  units mm\n  grid 50\n${body}\n}\n`;

function tablesOf(src: string): ReadonlyMap<string, DatumTable> {
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) throw new Error("the test plan did not parse");
  const { ir } = resolve(link(ast, NULL_WORLD, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, NULL_WORLD);
  return datumTablesOf(ir);
}

suite("the datum table", () => {
  const SRC = plan(
    [
      "  axes { x at 4000, 0 y at 0, 3000 }",
      "  wall exterior thickness 200 { (0,0) (9000,0) (9000,6000) (0,6000) close }",
      '  room id=living at (0,0) size 5000x4000 label "Living"',
      '  room id=kitchen right-of living align top gap 0 size 3000x4050 label "Kitchen"',
      '  room id=bath below kitchen size 2000x1500 label "Bath"',
      "  room id=hex polygon (0,4000) (2000,4000) (2000,6000) (0,6000)",
      "  room id=disc circle at (7000,5000) radius 500",
      '  room id=lost right-of nobody size 1000x1000 label "Lost"',
    ].join("\n"),
  );

  it("holds each rectangular room's four edges and centre, relational rooms at their FINAL place", () => {
    const root = tablesOf(SRC).get("")!;
    expect([...root.rooms.keys()]).toEqual(["living", "kitchen", "bath"]);
    expect(root.rooms.get("living")).toEqual({ top: 0, bottom: 4000, left: 0, right: 5000, cx: 2500, cy: 2000 });
    // `right-of living align top gap 0`: placed before the table froze, not at (0,0).
    expect(root.rooms.get("kitchen")).toEqual({ top: 0, bottom: 4050, left: 5000, right: 8000, cx: 6500, cy: 2025 });
    // A chain: `below kitchen` reads kitchen's final box.
    expect(root.rooms.get("bath")).toEqual({ top: 4050, bottom: 5550, left: 5000, right: 7000, cx: 6000, cy: 4800 });
  });

  it("records why a room exposes no lines: polygon, circle, unplaced", () => {
    const root = tablesOf(SRC).get("")!;
    expect([...root.refused.entries()]).toEqual([
      ["hex", "polygon"],
      ["disc", "circle"],
      ["lost", "unplaced"],
    ]);
  });

  it("holds the plan's axes sorted and labelled as drawn", () => {
    const root = tablesOf(SRC).get("")!;
    expect(root.axes).toEqual([
      { axis: "x", label: "1", pos: 0 },
      { axis: "x", label: "2", pos: 4000 },
      // `y` axes are lettered BOTTOM to top (+y is down), as `numberAxes` draws them.
      { axis: "y", label: "A", pos: 3000 },
      { axis: "y", label: "B", pos: 0 },
    ]);
  });

  it("is frozen at every level", () => {
    const root = tablesOf(SRC).get("")!;
    expect(Object.isFrozen(root)).toBe(true);
    expect(Object.isFrozen(root.axes)).toBe(true);
    expect(Object.isFrozen(root.rooms.get("living"))).toBe(true);
    expect(() => (root.rooms as Map<string, unknown>).set("x", {})).toThrow(TypeError);
    expect(() => (root.refused as Map<string, unknown>).delete("hex")).toThrow(TypeError);
    expect(() => (root.rooms as Map<string, unknown>).clear()).toThrow(TypeError);
    expect(root.rooms.size).toBe(3);
  });

  it("is one per group: an instance's table is in its own frame, the root's in world terms", () => {
    const src = plan(
      [
        "  component unit() {",
        '    room id=main at (0,0) size 3000x2000 label "Main"',
        '    room id=side right-of main align top gap 0 size 1000x2000 label "Side"',
        "  }",
        "  place unit() as west at (10000,0) rotate 90",
        '  room id=core at (0,0) size 2000x2000 label "Core"',
      ].join("\n"),
    );
    const tables = tablesOf(src);
    expect([...tables.keys()].sort()).toEqual(["", "west"]);
    const west = tables.get("west")!;
    // Local frame: what the component says, before the turn.
    expect(west.rooms.get("main")).toEqual({ top: 0, bottom: 2000, left: 0, right: 3000, cx: 1500, cy: 1000 });
    expect(west.rooms.get("side")).toEqual({ top: 0, bottom: 2000, left: 3000, right: 4000, cx: 3500, cy: 1000 });
    expect(west.axes).toEqual([]);
    // The root sees the instance's rooms carried into the plan, under their prefixed ids.
    const root = tables.get("")!;
    expect([...root.rooms.keys()].sort()).toEqual(["core", "west.main", "west.side"]);
    const main = root.rooms.get("west.main")!;
    expect(main.right - main.left).toBe(2000); // turned a quarter: 3000 x 2000 → 2000 x 3000
    expect(main.bottom - main.top).toBe(3000);
  });

  it("refuses a room of no positive size as degenerate", () => {
    const rooms = [{ kind: "room", id: "z", at: { x: 0, y: 0 }, size: { w: 0, h: 10 } } as RRoom];
    expect([...buildDatumTable(rooms, undefined).refused]).toEqual([["z", "degenerate"]]);
  });

  it("costs one step per room and per axis, charged before it allocates", () => {
    const rooms = [1, 2, 3].map(
      (i) => ({ kind: "room", id: `r${i}`, at: { x: 0, y: 0 }, size: { w: 10, h: 10 } }) as RRoom,
    );
    const axes = [{ axis: "x" as const, pos: 0, label: "1" }];
    const run = withStepMeter(0, () => buildDatumTable(rooms, axes));
    expect(run.used).toBe(4);
    // One step short of the bill: the charge crosses before anything is built.
    const short = withStepMeter(MAX_EVAL_STEPS - 3, () => buildDatumTable(rooms, axes));
    expect("signal" in short).toBe(true);
  });
});

suite("the resolve order: rooms, then the table, then walls", () => {
  it("a wall resolves with every room already placed, relational ones included", () => {
    const seen: string[][] = [];
    const probe: ElementDef = {
      ...wall,
      resolve(node, ctx) {
        seen.push(ctx.rooms.map((r) => `${r.id}@${r.at.x},${r.at.y}`));
        return wall.resolve(node, ctx);
      },
    };
    const src = plan(
      [
        "  wall exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }",
        '  room id=a at (0,0) size 5000x4000 label "A"',
        '  room id=b right-of a align top gap 0 size 3000x4000 label "B"',
      ].join("\n"),
    );
    const out = compile(src, { plugins: [probe], noCache: true });
    expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(seen).toEqual([["a@0,0", "b@5000,0"]]);
  });

  // A resolution stopped by E_STEP_LIMIT inside the element passes (ADR 0028 §1): "diagnostics
  // do not reorder" covers a resolution that COMPLETES. A stopped one reports, deterministically,
  // the diagnostics raised before the crossing in the NEW order (rooms, placement, walls, …),
  // and that set may differ from the old walls-first pass. On main, the first plan below (one
  // `marble` wall, room `a` 0x3000, room `b` sized f(40)) gave [W_UNKNOWN_MATERIAL, E_ROOM_SIZE
  // (room a), E_STEP_LIMIT@room b]; the second (a wall at f(40), room `a` 0x3000, room `b`
  // right-of nowhere) gave [E_STEP_LIMIT@the wall] alone. Both new sequences are pinned.
  it("a resolution stopped inside the element passes keeps what was raised before the crossing", () => {
    // The budget is crossed in room `b`'s size. Rooms resolve before walls, so `a`'s
    // E_ROOM_SIZE (raised in the room pass) is buffered when the crossing comes; the buffer
    // is flushed, then the one E_STEP_LIMIT names `b`'s statement. The wall's
    // W_UNKNOWN_MATERIAL was never raised: walls had not resolved yet.
    const src = plan(
      [
        "  let f(n) = if n < 2 { 1 } else { f(n - 1) + f(n - 2) }",
        "  wall exterior thickness 200 material marble { (0,0) (8000,0) }",
        '  room id=a at (0,0) size 0x3000 label "A"',
        '  room id=b at (0,0) size f(40) x 3000 label "B"',
      ].join("\n"),
    );
    const out = compile(src, { noCache: true });
    expect(out.diagnostics.map((d) => d.code)).toEqual(["E_ROOM_SIZE", "E_STEP_LIMIT"]);
    const limit = out.diagnostics[1]!;
    expect(src.slice(limit.span!.start, limit.span!.end)).toMatch(/^room id=b /);
  }, 60_000);

  it("crossing in a WALL, after the rooms and their placement have diagnosed", () => {
    const src = plan(
      [
        "  let f(n) = if n < 2 { 1 } else { f(n - 1) + f(n - 2) }",
        "  wall exterior thickness 200 { (0,0) (f(40),0) }",
        '  room id=a at (0,0) size 0x3000 label "A"',
        '  room id=b right-of nowhere size 3000x3000 label "B"',
      ].join("\n"),
    );
    const out = compile(src, { noCache: true });
    const at = (i: number) => src.slice(out.diagnostics[i]!.span!.start).split("\n")[0]!.trim();
    expect(out.diagnostics.map((d) => d.code)).toEqual(["E_ROOM_SIZE", "E_LAYOUT_REF", "E_STEP_LIMIT"]);
    expect(at(0)).toMatch(/^room id=a /);
    expect(at(1)).toMatch(/^nowhere /); // AF2: spanned on the unknown id of room b's `right-of`
    expect(at(2)).toMatch(/^wall exterior /);
  }, 60_000);
});
