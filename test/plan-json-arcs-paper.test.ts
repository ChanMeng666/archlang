import { readdirSync, readFileSync } from "node:fs";
import { describe as group, expect, it } from "vitest";
import {
  compile,
  describe as describePlan,
  lint,
  PLAN_JSON_SCHEMA,
  planFromJson,
  planJsonToArch,
  planToJson,
  type PlanJson,
} from "../src/index.js";
import { type Args, makeNodeWorld, sourceFromJson } from "../src/cli/io.js";
import { renderArtifact } from "../src/cli/serialize.js";

/**
 * Issue #366's second half: a wall's `arc` and the plan's `paper` travel through Plan JSON, so the
 * issue's plan comes back byte for byte. The arc is a member of the point it arrives at, as the
 * `.arch` clause is; the paper a member beside `scale`. A plan with neither writes what it always
 * wrote, and an old document still loads.
 */

const ARGS: Args = { _: [] };

/** The reproduction in the issue, verbatim. */
const ISSUE_PLAN = `plan "arc round trip" {
  units mm
  paper A4 landscape
  scale 1:50
  wall id=w exterior thickness 300 { (0,0) (6000,0) (6000,4000) arc (0,4000) radius 4000 cw (0,0) close }
}
`;

const plan = (body: string): string => `plan "p" {\n  units mm\n  ${body}\n}\n`;

/** The source's drawing and facts against the same plan once through the document. */
function roundTrip(source: string): { doc: PlanJson; back: string } {
  const { json, dropped } = planToJson(source);
  expect(dropped).toBeUndefined();
  const { source: back, diagnostics } = planJsonToArch(json);
  expect(diagnostics).toEqual([]);
  expect(back).toBeDefined();
  expect(compile(back!, { noCache: true }).svg).toBe(compile(source, { noCache: true }).svg);
  const facts = (s: string): object => {
    const { freedom: _f, diagnostics: _d, ...rest } = describePlan(s) as unknown as Record<string, unknown>;
    return rest;
  };
  expect(facts(back!)).toEqual(facts(source));
  expect(lint(back!).map((d) => d.code)).toEqual(lint(source).map((d) => d.code));
  return { doc: json!, back: back! };
}

/**
 * The drawing of a flattened `place` row, re-solved from the document. A dotted id does not parse,
 * so the row goes back under a plain one: the arc is what is under test.
 */
function rowDraws(source: string): string {
  const doc = planToJson(source).json!;
  const walls = doc.walls.map((w) => ({ ...w, id: "row" }));
  return compile(planJsonToArch({ ...doc, walls }).source!, { noCache: true }).svg;
}

group("the issue's plan", () => {
  it("writes the arc on the point it arrives at, and the paper beside the scale", () => {
    const { json, dropped } = planToJson(ISSUE_PLAN);
    expect(dropped).toBeUndefined();
    expect(json?.paper).toEqual({ size: "A4", orientation: "landscape" });
    expect(json?.scale).toBe("1:50");
    expect(json?.walls[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000, arc: { radius: 4000, dir: "cw" } },
      { x: 0, y: 0 },
    ]);
  });

  it("comes back byte for byte, `bbox_outer` and `sheet` included", () => {
    const { back } = roundTrip(ISSUE_PLAN);
    expect(back).toContain("arc (0,4000) radius 4000 cw");
    expect(back).toContain("paper A4 landscape");
    const want = describePlan(ISSUE_PLAN);
    const got = describePlan(back);
    expect(got.bbox_outer).toEqual(want.bbox_outer);
    expect(got.bbox_outer?.h).toBeCloseTo(5654.25, 2);
    expect(got.sheet).toEqual(want.sheet);
    expect(got.sheet).toMatchObject({
      paper: "A4",
      orientation: "landscape",
      scale_denominator: 50,
      scale_auto: false,
    });
  });

  it("does the same through the CLI's own seam, with no note", async () => {
    const out = await renderArtifact(ISSUE_PLAN, "json", ARGS, ".", "all");
    expect(out.notes).toBeUndefined();
    expect(out.dropped).toBeUndefined();
    const conv = sourceFromJson(out.bytes as string);
    if ("error" in conv) throw new Error("--from-json refused the document");
    const back = await renderArtifact(conv.source, "svg", ARGS, ".", "first");
    const direct = await renderArtifact(ISSUE_PLAN, "svg", ARGS, ".", "first");
    expect(back.bytes).toBe(direct.bytes);
  });
});

group("an arc carries its clause", () => {
  it.each([
    ["no word: ccw, the default", "arc (2000,2000) radius 1500", { radius: 1500, dir: "ccw" }],
    ["cw", "arc (2000,2000) radius 1500 cw", { radius: 1500, dir: "cw" }],
    ["major", "arc (2000,2000) radius 1500 major", { radius: 1500, dir: "ccw", major: true }],
    ["cw major", "arc (2000,2000) radius 1500 cw major", { radius: 1500, dir: "cw", major: true }],
    // An exact tie, so a semicircle: `major` adds nothing to it, and the drawing says so.
    ["a semicircle", "arc (2000,2000) radius 1000", { radius: 1000, dir: "ccw" }],
    ["a semicircle written major", "arc (2000,2000) radius 1000 major", { radius: 1000, dir: "ccw" }],
    ["a fractional radius", "arc (2000,2000) radius 1234.5678", { radius: 1234.5678, dir: "ccw" }],
  ])("%s", (_, clause, arc) => {
    const { doc } = roundTrip(plan(`wall id=w exterior thickness 200 { (0,0) (2000,0) ${clause} (0,2000) }`));
    expect(doc.walls[0]?.points[2]).toEqual({ x: 2000, y: 2000, arc });
  });

  it("every arc of a wall, on a demolished wall too", () => {
    const a = plan(
      "wall id=w exterior thickness 200 { (0,0) (2000,0) arc (2000,2000) radius 1000 arc (0,2000) radius 1000 }",
    );
    expect(roundTrip(a).doc.walls[0]?.points.filter((p) => p.arc)).toHaveLength(2);
    const b = plan("wall id=w exterior thickness 200 status demolish { (0,0) (2000,0) arc (2000,2000) radius 1000 }");
    expect(roundTrip(b).doc.walls[0]).toMatchObject({ status: "demolish" });
  });

  it("a radius the grid moved is written as the grid left it", () => {
    const { doc } = roundTrip(
      `plan "p" {\n  units mm\n  grid 100\n  wall id=w exterior thickness 200 { (0,0) (2000,0) arc (2000,2000) radius 1520 }\n}\n`,
    );
    expect(doc.walls[0]?.points[2]?.arc?.radius).toBe(1500);
  });

  it("a door and a window on the curve, and `dim radius`, stay on it", () => {
    roundTrip(
      plan(`wall id=w exterior thickness 200 { (0,0) (4000,0) arc (4000,4000) radius 2200 cw (0,4000) close }
  door id=d on w at 7000 width 900
  window id=v on w at 5300 width 1200
  dim radius w`),
    );
  });

  it("read off the arc, not the clause: a reflecting frame turns it the other way", () => {
    const local = "wall id=w exterior thickness 200 { (0,0) (2000,0) arc (2000,2000) radius 1500 cw }";
    const source = plan(`component c() { ${local} }\n  place c() as a at (0,0) mirror x`);
    const point = planToJson(source).json?.walls[0]?.points[2];
    expect(point?.arc).toEqual({ radius: 1500, dir: "ccw" });
    expect(rowDraws(source)).toBe(compile(source, { noCache: true }).svg);
  });

  it("a quarter-turned `place` keeps the sense", () => {
    const source = plan(
      "component c() { wall id=w exterior thickness 200 { (0,0) (2000,0) arc (2000,2000) radius 1500 cw } }\n  place c() as a at (0,0) rotate 90",
    );
    expect(planToJson(source).json?.walls[0]?.points[2]?.arc).toEqual({ radius: 1500, dir: "cw" });
    expect(rowDraws(source)).toBe(compile(source, { noCache: true }).svg);
  });

  it("a curved wall inside a carried component body travels with it", () => {
    const source = plan(`component c() {
    room id=r at (0,0) size 3000x3000 label "R"
    walls from rooms exterior 200 partition 100
    wall id=w exterior thickness 200 { (0,3000) arc (3000,3000) radius 2000 cw }
  }
  place c() as a at (0,0)`);
    const { json } = planToJson(source);
    expect(json?.components?.[0]?.body.walls[0]?.points[1]?.arc).toEqual({ radius: 2000, dir: "cw" });
    expect(compile(planJsonToArch(json).source!, { noCache: true }).svg).toBe(compile(source, { noCache: true }).svg);
  });
});

group("the sheet", () => {
  it.each(["paper A3 portrait", "paper A1 landscape", "paper A0"])("%s, no scale: auto-fitted both ways", (line) => {
    const source = plan(`${line}\n  wall id=w exterior thickness 200 { (0,0) (9000,0) }`);
    const { doc, back } = roundTrip(source);
    expect(doc.paper?.scale_auto).toBe(true);
    // The document reports the fit, and the way back fits again rather than writing it down.
    expect(doc.scale).toBe(describePlan(source).scale);
    expect(back).not.toMatch(/^\s*scale /m);
    expect(describePlan(back).sheet?.scale_auto).toBe(true);
  });

  it("an authored scale stays authored, even one that does not fit", () => {
    const source = plan("paper A4\n  scale 1:10\n  wall id=w exterior thickness 200 { (0,0) (90000,0) }");
    const { doc, back } = roundTrip(source);
    expect(doc.paper).toEqual({ size: "A4", orientation: "landscape" });
    expect(back).toContain("scale 1:10");
    expect(compile(back, { noCache: true }).diagnostics.map((d) => d.code)).toContain("W_SCALE_OVERFLOW");
  });

  it("every storey's document carries the one sheet", () => {
    const source = `plan "t" {
  units mm
  paper A3
  level 1 { wall id=a exterior thickness 200 { (0,0) (2000,0) } }
  level 2 { wall id=b exterior thickness 200 { (0,0) (3000,0) } }
}
`;
    const { pages, json } = planToJson(source);
    expect(json?.paper?.size).toBe("A3");
    expect(pages?.map((p) => p.json.paper?.size)).toEqual(["A3", "A3"]);
  });

  it("a hand-written document may leave out the orientation, as `.arch` does", () => {
    const { source } = planJsonToArch({
      plan: "p",
      paper: { size: "A2" },
      rooms: [],
      walls: [],
      openings: [],
      furniture: [],
    });
    expect(source).toContain("paper A2 landscape");
  });
});

group("what was there before stays", () => {
  const world = makeNodeWorld("examples");

  it("no document gains a key unless the plan has an arc or a paper", () => {
    for (const name of readdirSync("examples").filter((f) => f.endsWith(".arch"))) {
      const src = readFileSync(`examples/${name}`, "utf8");
      const curved = /\barc\s*\(/.test(src);
      const sheet = /^\s*paper\b/m.test(src);
      const r = planToJson(src, { world });
      for (const doc of [r.json, ...(r.pages ?? []).map((p) => p.json)]) {
        if (!doc) continue;
        if (!sheet) expect(doc, name).not.toHaveProperty("paper");
        if (!curved) expect(JSON.stringify(doc.walls), name).not.toContain('"arc"');
      }
    }
  });

  it("an old document loads: bare points, no paper, a bare scale", () => {
    const old = {
      version: 1,
      plan: "old",
      units: "mm",
      scale: "1:50",
      rooms: [{ id: "r", x: 0, y: 0, width: 4000, height: 3000, room_type: "LivingRoom" }],
      walls: [
        {
          id: "w",
          category: "exterior",
          points: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
          ],
          thickness: 200,
          closed: false,
        },
      ],
      openings: [],
      furniture: [],
    };
    const { source, diagnostics } = planFromJson(old);
    expect(diagnostics).toEqual([]);
    expect(source).toContain("scale 1:50");
    expect(source).not.toContain("paper");
    expect(source).toContain("{ (0,0) (4000,0) }");
  });
});

group("a bad member is a diagnostic with its path, never a throw", () => {
  const wall = (points: unknown[]): unknown => ({
    plan: "p",
    rooms: [],
    walls: [{ points, thickness: 200 }],
    openings: [],
    furniture: [],
  });
  const refused = (json: unknown): string[] => {
    const { source, diagnostics } = planJsonToArch(json);
    expect(source).toBeUndefined();
    return diagnostics.map((d) => `${d.code} ${d.message}`);
  };
  const A = { x: 0, y: 0 };

  it.each([
    ["on the first point", { ...A, arc: { radius: 100 } }, A, "/walls/0/points/0/arc"],
    ["no radius", A, { x: 9, y: 0, arc: { dir: "cw" } }, "/walls/0/points/1/arc/radius"],
    ["a zero radius", A, { x: 9, y: 0, arc: { radius: 0 } }, "/walls/0/points/1/arc/radius"],
    ["a text radius", A, { x: 9, y: 0, arc: { radius: "5" } }, "/walls/0/points/1/arc/radius"],
    ["a bad dir", A, { x: 9, y: 0, arc: { radius: 5, dir: "left" } }, "/walls/0/points/1/arc/dir"],
    ["a bad major", A, { x: 9, y: 0, arc: { radius: 5, major: 1 } }, "/walls/0/points/1/arc/major"],
    ["an unknown key", A, { x: 9, y: 0, arc: { radius: 5, side: "cw" } }, "/walls/0/points/1/arc/side"],
    ["not an object", A, { x: 9, y: 0, arc: 5 }, "/walls/0/points/1/arc"],
  ])("arc: %s", (_, a, b, path) => {
    const out = refused(wall([a, b]));
    expect(out[0]).toContain(`E_JSON_SCHEMA plan JSON ${path}:`);
  });

  it.each([
    ["no size", {}, "/paper/size"],
    ["a bad size", { size: "B5" }, "/paper/size"],
    ["a bad orientation", { size: "A4", orientation: "sideways" }, "/paper/orientation"],
    ["a bad flag", { size: "A4", scale_auto: "yes" }, "/paper/scale_auto"],
    ["an unknown key", { size: "A4", margin: 5 }, "/paper/margin"],
  ])("paper: %s", (_, paper, path) => {
    const out = refused({ plan: "p", paper, rooms: [], walls: [], openings: [], furniture: [] });
    expect(out[0]).toContain(`E_JSON_SCHEMA plan JSON ${path}:`);
  });

  it("a radius too small for its chord reaches the arc's own error, with its fix", () => {
    const { source } = planJsonToArch(wall([A, { x: 4000, y: 0, arc: { radius: 100 } }]));
    const c = compile(source!, { noCache: true });
    expect(c.diagnostics.map((d) => d.code)).toContain("E_ARC_RADIUS");
  });
});

group("the schema says so", () => {
  const props = PLAN_JSON_SCHEMA.properties;

  it("names the new members, and derives their words from the language", () => {
    expect(props.paper.properties.size.enum).toEqual(["A4", "A3", "A2", "A1", "A0"]);
    expect(props.paper.properties.orientation.enum).toEqual(["landscape", "portrait"]);
    const point = props.walls.items.properties.points.items;
    expect(point.properties.arc.properties.dir.enum).toEqual(["cw", "ccw"]);
    expect(point.required).toEqual(["x", "y"]);
  });

  it("every other point stays a bare point", () => {
    expect(props.rooms.items.properties.polygon.items.properties).not.toHaveProperty("arc");
  });
});
