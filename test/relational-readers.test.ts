/**
 * Backlog PS0.5: an element that READS a relationally placed room — `furniture … against
 * wall … in <room>` (side inference), `furniture … in <room> centered|anchor`, a door's
 * `swing into <room>` and a garage door's floor probe — used to resolve while that room still
 * sat at its (0,0) placeholder, so every reader refused any room carrying `_rel`
 * (`E_FURN_AGAINST`, `E_PLACE_REF`, `W_SWING_ROOM_NOT_ADJACENT`).
 *
 * Rooms now resolve, and relational ones are placed, before every other kind (ADR 0028 §1),
 * so the readers refuse only a room that could not be placed (`_unplaced`). The law: a plan
 * whose room is placed `right-of` draws exactly what the same plan with that room written at
 * its resolved `at` draws.
 */

import { describe as suite, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { link } from "../src/import.js";
import { resolve, type RDoor, type ResolvedPlan, type RFurniture } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { NULL_WORLD } from "../src/world.js";

const plan = (kitchen: string): string =>
  [
    'plan "R" {',
    "  units mm",
    "  grid 50",
    "  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }",
    "  wall id=mid partition thickness 100 { (5000,0) (5000,4000) }",
    '  room id=living at (0,0) size 5000x4000 label "Living"',
    `  room id=kitchen ${kitchen} size 3000x4000 label "Kitchen"`,
    "  door id=d on mid at 2000 width 900 swing into kitchen",
    "  furniture id=f_counter counter against wall mid in kitchen",
    "  furniture id=f_table table in kitchen centered size 1200x800",
    "}",
    "",
  ].join("\n");

const RELATIONAL = plan("right-of living align top gap 0");
const ABSOLUTE = plan("at (5000,0)");
const UNPLACED = plan("right-of nowhere");

function irOf(src: string): ResolvedPlan {
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) throw new Error("the test plan did not parse");
  return resolve(link(ast, NULL_WORLD, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, NULL_WORLD).ir;
}

/** The resolved piece: where it was placed and how it was turned. */
function furniture(src: string, id: string): Pick<RFurniture, "at" | "size" | "rotate"> {
  const ir = irOf(src);
  const f = ir.elements.find((e): e is RFurniture => e.kind === "furniture" && e.id === id);
  if (!f) throw new Error(`no furniture ${id}`);
  return { at: f.at, size: f.size, rotate: f.rotate };
}

suite("PS0.5 — readers of a relational room", () => {
  it("the repro compiles: no reader refuses the placed relational room", () => {
    expect(compile(RELATIONAL, { noCache: true }).diagnostics).toEqual([]);
  });

  it("draws exactly what the same plan with the room written at its resolved `at` draws", () => {
    const rel = compile(RELATIONAL, { noCache: true });
    const abs = compile(ABSOLUTE, { noCache: true });
    expect(abs.diagnostics).toEqual([]);
    expect(rel.svg).toBe(abs.svg);
  });

  it("the counter backs onto `mid` on the KITCHEN side, the table sits in the kitchen", () => {
    const counter = furniture(RELATIONAL, "f_counter");
    const table = furniture(RELATIONAL, "f_table");
    expect(counter.at.x).toBeGreaterThan(5000);
    expect(table.at.x).toBeGreaterThan(5000);
    expect(counter).toEqual(furniture(ABSOLUTE, "f_counter"));
    expect(table).toEqual(furniture(ABSOLUTE, "f_table"));
  });

  it("the door swings into the relational kitchen, as it does into the absolute one", () => {
    const swing = (src: string) => irOf(src).elements.find((e): e is RDoor => e.kind === "door")!.swing;
    expect(swing(RELATIONAL)).toBe(swing(ABSOLUTE));
    // Control: naming the OTHER room flips it, so the clause was really read.
    expect(swing(RELATIONAL.replace("swing into kitchen", "swing into living"))).not.toBe(swing(RELATIONAL));
  });

  it("a room that could NOT be placed is still refused by every reader", () => {
    const codes = compile(UNPLACED, { noCache: true }).diagnostics.map((d) => d.code);
    expect(codes).toEqual(["W_SWING_ROOM_NOT_ADJACENT", "E_FURN_AGAINST", "E_PLACE_REF", "E_LAYOUT_REF"]);
    const against = compile(UNPLACED, { noCache: true }).diagnostics.find((d) => d.code === "E_FURN_AGAINST")!;
    expect(against.message).toContain("could not be placed");
  });

  it("an instance's room that could not be placed is refused when the ROOT reads it", () => {
    // `_unplaced` survives the instance transform (`room.transform`) while `_rel` does not, so
    // before this change a root reader took `u.side` for an absolute room at its (0,0)
    // placeholder: main placed the table there silently (no E_PLACE_REF) and blamed the
    // counter's faces. Every root reader now refuses it, naming the placement error.
    const src = [
      'plan "N" {',
      "  units mm",
      "  grid 50",
      "  component unit() {",
      '    room id=main at (0,0) size 3000x3000 label "Main"',
      '    room id=side right-of nowhere size 2000x3000 label "Side"',
      "  }",
      "  place unit() as u at (0,0)",
      "  wall id=w partition thickness 100 { (3000,0) (3000,3000) }",
      "  door id=d on w at 1500 width 900 swing into u.side",
      "  furniture id=f_table table in u.side centered size 1200x800",
      "  furniture id=f_counter counter against wall w in u.side",
      "}",
      "",
    ].join("\n");
    const out = compile(src, { noCache: true }).diagnostics;
    expect(out.map((d) => `${d.code}@${src.slice(d.span!.start).split(" ")[0]!.trim()}`)).toEqual([
      "E_LAYOUT_REF@nowhere", // AF2: spanned on the unknown id (it was the whole room statement)
      "W_SWING_ROOM_NOT_ADJACENT@door",
      "E_PLACE_REF@furniture",
      "E_FURN_AGAINST@furniture",
    ]);
    expect(out[2]!.message).toBe(
      'Furniture "f_table" is placed `in u.side`, but room "u.side" could not be placed (see its own error)',
    );
    expect(out[3]!.message).toContain('from room "u.side", which could not be placed');
  });
});
