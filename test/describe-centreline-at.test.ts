/**
 * `describe()`'s `centreline_at` (issue #401): where a `between` door or cased opening landed.
 *
 * A `from start` on `between` counts from the shared run, which the source alone does not show:
 * #370's door landed at x 7000 with nothing to say so. The field is appended, read off the resolved
 * position, printed through `num-format`, and appears on no other row, so a plan with no `between`
 * opening keeps its `describe()` bytes. The D4 oracle reads it as a point (`test/d4-oracle.ts`).
 */

import { describe as suite, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { compile, describe, planToJson, type RDoor } from "../src/index.js";
import { D4_ELEMENTS, witnessCase } from "./d4-oracle.js";

const plan = (body: string): string => `plan "t" {\n  units mm\n${body}}\n`;
const W = "  walls from rooms exterior 300 partition 100\n";
const ENTRY = "  door id=e on a.left at center width 1000 swing into a\n";
const STACKED = `  room id=a at (0,0) size 6000x3000 uses living\n  room id=b at (0,3000) size 6000x3000 uses bedroom\n`;
const placedAt = (src: string, id: string) => {
  const { ir } = resolvePlan(src, {});
  return (ir!.elements.find((e) => (e as RDoor).id === id) as RDoor).at;
};

suite("describe(): `centreline_at`", () => {
  it("#370: `door between` counts from the shared run, and the row shows where it landed", () => {
    const src = plan(
      `  room id=a at (0,0) size 10000x3000 uses living\n  room id=b at (3000,3000) size 7000x3000 uses bedroom\n${W}  door id=d between a and b at 4000 from start width 900 swing into b\n${ENTRY}`,
    );
    const d = describe(src).doors.find((x) => x.id === "d")!;
    expect(d.centreline_at).toEqual({ x: 7000, y: 3000 });
    expect(d.relation).toBe("between a and b at 4000 from start");
    expect(placedAt(src, "d")).toEqual(d.centreline_at);
  });

  it("is the point Plan JSON exports, and the `at (x,y)` a hand-placed twin draws from", () => {
    const rooms = `  room id=a at (0,0) size 10000x3000 uses living\n  room id=b at (3000,3000) size 7000x3000 uses bedroom\n${W}`;
    const src = plan(`${rooms}  door id=d between a and b at 4000 from end width 900 swing into b\n${ENTRY}`);
    const { x, y } = describe(src).doors.find((d) => d.id === "d")!.centreline_at!;
    const row = planToJson(src).json!.openings.find((o) => o.id === "d")!;
    expect({ x: row.x, y: row.y }).toEqual({ x, y });
    const twin = plan(`${rooms}  door id=d at (${x},${y}) width 900 wall partition swing into b\n${ENTRY}`);
    expect(compile(twin, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
    expect({ x, y }).toEqual({ x: 6000, y: 3000 });
  });

  it("is appended after every existing key, on a door and on a cased opening", () => {
    const src = plan(
      `${STACKED}${W}  door id=d sliding between a and b at 1500 from start width 900 head 2100\n  opening id=o between a and b at 1500 from end width 900 head 2100\n${ENTRY}`,
    );
    const s = describe(src);
    expect(Object.keys(s.doors.find((x) => x.id === "d")!)).toEqual([
      "id",
      "between",
      "width",
      "relation",
      "kind",
      "head",
      "centreline_at",
    ]);
    expect(Object.keys(s.openings[0]!)).toEqual(["id", "between", "width", "relation", "head", "centreline_at"]);
    expect(s.openings[0]!.centreline_at).toEqual({ x: 4500, y: 3000 });
  });

  it("appears on nothing but a `between` door or cased opening", () => {
    const src = plan(
      `${STACKED}  walls from rooms exterior 300 partition 100 { open between a and b width 900 }\n${ENTRY}  door id=f at (0,4500) width 1000 swing into b\n  opening id=o on b.right at center width 900\n  window id=w on a.top width 1200\n`,
    );
    const s = describe(src);
    for (const row of [...s.doors, ...s.windows, ...s.openings]) expect(row).not.toHaveProperty("centreline_at");
    expect(s.openings.length).toBeGreaterThan(1); // the opening `open between` derived is among them
  });

  it("prints through num-format: no float tail on an off-lattice position", () => {
    const src = plan(
      `  let t = 1000 / 3 + 1000\n${STACKED}${W}  door id=d between a and b at t from start width 900 swing into b\n${ENTRY}`,
    );
    expect(placedAt(src, "d").x).toBe(1000 / 3 + 1000);
    expect(describe(src).doors.find((x) => x.id === "d")!.centreline_at).toEqual({ x: 1333.333, y: 3000 });
  });
});

suite("`place` frames", () => {
  const BODY = `    room id=a at (0,0) size 6000x3000 uses living\n    room id=b at (2000,3000) size 4000x3000 uses bedroom\n    walls from rooms exterior 300 partition 100\n    door id=d between a and b at 1000 from start width 800 swing into b\n    opening id=o between a and b at 1000 from end width 800\n    door id=e on a.left at center width 1000 swing into a`;

  for (const g of D4_ELEMENTS) {
    it(`${g.name}: the point turns with the plan`, () => {
      const { vs, ctx } = witnessCase(BODY, g);
      expect(
        vs.map((v) => v.key),
        g.name,
      ).toEqual([]);
      expect(ctx.obsG.summary.doors.find((d) => d.id.endsWith("d"))!.centreline_at).toBeDefined();
      expect(ctx.obsG.summary.openings[0]!.centreline_at).toBeDefined();
    });
  }

  it("a mirrored instance reports plan coordinates, beside its relation in the component's words", () => {
    const src = plan(`  component wing() {\n${BODY}\n  }\n  place wing() as w at (0,0) mirror x\n`);
    const door = describe(src).doors.find((d) => d.id.endsWith("d"))!;
    expect(door.relation).toBe("between a and b at 1000 from start");
    expect(door.centreline_at).toEqual({ x: -3000, y: 3000 });
  });
});
