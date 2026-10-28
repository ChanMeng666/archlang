/**
 * Wall `status` drawn (preview-and-remodel B3b). The semantics are `wall-status.test.ts`; the
 * byte-identity law for plans that write no status is `wall-status-byte-identity.test.ts`.
 *
 * - **A demolished wall is drawn dashed, beneath the fabric that stays.** `toScene` lowers the
 *   `status demolish` walls in a call of their own, with no hatches, as one dashed outline on the
 *   `wallFill` pass ahead of the standing walls' poché (which stops the dashes at a standing
 *   wall's face); the standing walls are lowered as the plan after the demolition has them.
 * - **The sheet measures the plan after the demolition.** The drawn `schedule rooms` NET AREA and
 *   TOTAL are `describe().schedule`'s, and `--overlay circulation` walks across a demolished run.
 * - **The legend adds a `demolished` row only when a wall is demolished**; a `status new` wall
 *   draws as any wall and adds no row.
 * - **The DXF files a demolished wall on `A-WALL-DEMO` and a new one on `A-WALL-NEWW`**, through
 *   `classifyWallSet`, declaring each only when an entity lands on it.
 * - **`examples/remodel.arch` is pinned**: its SVG, DXF, `describe()` and `lint()` by SHA-256.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { compile, describe as describePlan, lint, toDxf } from "../src/index.js";
import { drawnView, type RFurniture, type ROutdoor, type RRoom } from "../src/ir.js";
import type { Scene } from "../src/scene.js";
import { legendRowCount, planTableRows, scheduleRowCount } from "../src/sheet-tables.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REMODEL = readFileSync(join(ROOT, "examples", "remodel.arch"), "utf8");
const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

const plan = (head: string, body: string) => `plan "p" {\n  units mm\n  grid 1\n${head}${body}\n}\n`;
const SHELL = `  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }`;
const ROOMS = `  room id=a at (0,0) size 4000x5000 label "Bedroom" uses bedroom
  room id=b at (4000,0) size 4000x5000 label "Study" uses office
  door id=d1 at (2000,5000) width 900 wall exterior`;
const PART = `  wall id=part partition thickness 100 status demolish { (4000,0) (4000,5000) }`;
const DEMOLISHED = (head = "") => plan(head, `${SHELL}\n${PART}\n${ROOMS}`);
const STANDING = (head = "") => DEMOLISHED(head).replace(" status demolish", "");
const FRESH = (head = "") => DEMOLISHED(head).replace(" status demolish", " status new");

/** The wall nodes of a scene: pass, primitive, line type. */
const wallNodes = (sc: Scene) =>
  sc.nodes
    .filter((n) => n.layer === "wallFill" || n.layer === "wallFace")
    .map((n) => ({ layer: n.layer, prim: n.prim, lineType: n.lineType }));

/** A DXF's group-code pairs. */
function pairs(dxf: string): Array<[number, string]> {
  const l = dxf.split("\n");
  const out: Array<[number, string]> = [];
  for (let i = 0; i + 1 < l.length; i += 2) out.push([Number(l[i]!.trim()), l[i + 1]!]);
  return out;
}

/** The names the LAYER table declares. */
function declaredLayers(dxf: string): string[] {
  const p = pairs(dxf);
  const out: string[] = [];
  for (let i = 0; i + 1 < p.length; i++) if (p[i]![0] === 0 && p[i]![1] === "LAYER") out.push(p[i + 1]![1]);
  return out;
}

/** Each entity of the ENTITIES section: its type, layer and linetype. */
function entities(dxf: string): Array<{ type: string; layer: string; ltype?: string }> {
  const p = pairs(dxf);
  const start = p.findIndex(([c, v]) => c === 2 && v === "ENTITIES");
  const out: Array<{ type: string; layer: string; ltype?: string }> = [];
  for (let i = start + 1; i < p.length; i++) {
    const [c, v] = p[i]!;
    if (c === 0 && v === "ENDSEC") break;
    if (c === 0) out.push({ type: v, layer: "" });
    else if (c === 8 && out.length > 0) out[out.length - 1]!.layer = v;
    else if (c === 6 && out.length > 0) out[out.length - 1]!.ltype = v;
  }
  return out;
}

suite("a demolished wall is drawn dashed, beneath the standing walls", () => {
  it("one dashed outline on the poché pass, ahead of the standing walls, with no poché of its own", () => {
    const sc = compile(DEMOLISHED()).scene!;
    const walls = wallNodes(sc);
    const dashed = walls.filter((n) => n.lineType === "dashed");
    expect(dashed).toHaveLength(1);
    expect(dashed[0]!.layer).toBe("wallFill");
    expect(dashed[0]!.prim.t).not.toBe("hatch");
    // First among the wall nodes, so the poché painted after it covers it inside a standing wall.
    expect(walls[0]!.lineType).toBe("dashed");
    // Its outline is the demolished wall's band alone: the partition's four sides, square-capped
    // half its thickness past each end.
    const prim = dashed[0]!.prim;
    expect(prim.t).toBe("region");
    if (prim.t !== "region") return;
    expect(prim.loops).toHaveLength(1);
    const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
    expect(prim.loops[0]!.map(key).sort()).toEqual(["3950,-50", "3950,5050", "4050,-50", "4050,5050"]);
  });

  it("the paint is the wall pen, dashed in the SVG", () => {
    const svg = compile(DEMOLISHED()).svg;
    const path = svg.split("\n").find((l) => l.includes("stroke-dasharray") && l.includes('fill="none"'));
    expect(path).toBeDefined();
    expect(compile(STANDING()).svg).not.toContain("stroke-dasharray");
  });

  it("a `status new` wall draws exactly as a wall with no status", () => {
    expect(compile(FRESH()).svg).toBe(compile(STANDING()).svg);
    expect(compile(FRESH("  legend\n")).svg).toBe(compile(STANDING("  legend\n")).svg);
  });
});

suite("the sheet measures the plan after the demolition", () => {
  it("the drawn room schedule is describe().schedule, row for row and in its TOTAL", () => {
    for (const src of [DEMOLISHED("  schedule rooms\n"), REMODEL]) {
      const d = describePlan(src);
      const sc = compile(src).scene!;
      const table = sc.chrome!.tables!.schedule!;
      expect(table.rows.map((r) => r.net_area_m2)).toEqual(d.schedule!.map((r) => r.net_area_m2));
      expect(table.rows.map((r) => r.area_m2)).toEqual(d.schedule!.map((r) => r.area_m2));
      expect(table.net_total_m2).toBe(d.totals.net_floor_area_m2);
      expect(table.total_m2).toBe(d.totals.floor_area_m2);
    }
  });

  it("`--overlay circulation` walks across the demolished run, as describe() does", () => {
    const overlay = (src: string) => {
      const plain = compile(src).scene!.nodes.length;
      return compile(src, { overlays: ["circulation"] }).scene!.nodes.slice(plain);
    };
    // describe() measures a walk to both rooms; with the wall standing the study has no door route.
    expect(describePlan(DEMOLISHED()).circulation?.rooms.map((r) => r.roomId)).toEqual(["a", "b"]);
    const demolished = overlay(DEMOLISHED());
    const standing = overlay(STANDING());
    expect(demolished.length).toBeGreaterThan(standing.length);
    // A walk segment reaches into the study (x > 4000), which no segment does with the wall up.
    const intoStudy = (ns: typeof demolished) =>
      ns.some((n) => n.prim.t === "line" && Math.max(n.prim.a.x, n.prim.b.x) > 4100);
    expect(intoStudy(demolished)).toBe(true);
    expect(intoStudy(standing)).toBe(false);
  });
});

suite("the legend's `demolished` row", () => {
  const entries = (src: string) =>
    compile(src).scene!.chrome!.tables!.legend!.entries.map((e) => `${e.kind}:${e.name}`);

  it("appears only when a wall is demolished, after the materials", () => {
    expect(entries(DEMOLISHED("  legend\n"))).toEqual(["material:poche", "demolished:demolished"]);
    expect(entries(STANDING("  legend\n"))).toEqual(["material:poche"]);
    expect(entries(FRESH("  legend\n"))).toEqual(["material:poche"]);
  });

  it("draws a dashed swatch in the wall pen", () => {
    const sc = compile(DEMOLISHED("  legend\n")).scene!;
    const swatch = sc.nodes.filter((n) => n.layer === "annotations" && n.lineType === "dashed");
    expect(swatch).toHaveLength(1);
    expect(swatch[0]!.paint).toMatchObject({ fill: "none", stroke: sc.theme.wallStroke });
  });

  it("a demolished wall's material is in no hatch list: it draws no poché", () => {
    const src = DEMOLISHED("  legend\n").replace(
      "partition thickness 100 status demolish",
      "partition thickness 100 material concrete status demolish",
    );
    expect(compile(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(compile(src).scene!.hatches.map((h) => h.material)).toEqual(["poche"]);
    expect(entries(src)).toEqual(["material:poche", "demolished:demolished"]);
  });

  it("the sheet fit reserves the rows the sheet draws", () => {
    for (const src of [DEMOLISHED("  legend\n  schedule rooms\n"), REMODEL]) {
      const ir = drawnView(resolvePlan(src).ir!);
      const tables = compile(src).scene!.chrome!.tables!;
      const drawn = Math.max(
        tables.schedule ? scheduleRowCount(tables.schedule) : 0,
        tables.legend ? legendRowCount(tables.legend.entries.length) : 0,
      );
      expect(
        planTableRows({
          schedule: ir.schedule,
          legend: ir.legend,
          rooms: ir.elements.filter((e): e is RRoom => e.kind === "room"),
          zones: ir.zones,
          walls: ir.walls,
          furniture: ir.elements.filter((e): e is RFurniture => e.kind === "furniture"),
          outdoor: ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor"),
        }),
      ).toBe(drawn);
    }
  });
});

suite("DXF: the remodel wall layers", () => {
  it("files the demolished wall on A-WALL-DEMO (dashed) and a new one on A-WALL-NEWW", () => {
    const src = plan(
      "",
      `${SHELL}\n${PART}\n  wall id=fresh partition thickness 100 status new { (0,2500) (4000,2500) }\n${ROOMS}`,
    );
    const dxf = toDxf(compile(src).scene!);
    const es = entities(dxf);
    const demo = es.filter((e) => e.layer === "A-WALL-DEMO");
    expect(demo.length).toBeGreaterThan(0);
    expect(demo.every((e) => e.ltype === "DASHED" && e.type !== "HATCH")).toBe(true);
    expect(es.filter((e) => e.layer === "A-WALL-NEWW").map((e) => e.type)).toContain("HATCH");
    expect(es.some((e) => e.layer === "A-WALL")).toBe(false);
    const declared = declaredLayers(dxf);
    expect(declared).toContain("A-WALL-DEMO");
    expect(declared).toContain("A-WALL-NEWW");
    expect(declared).not.toContain("A-WALL");
  });

  it("an `existing` wall stays where a wall with no status is, and no status layer is declared without one", () => {
    const existing = toDxf(compile(DEMOLISHED().replace(" status demolish", " status existing")).scene!);
    expect(existing).toBe(toDxf(compile(STANDING()).scene!));
    expect(declaredLayers(existing)).not.toContain("A-WALL-DEMO");
    expect(declaredLayers(existing)).not.toContain("A-WALL-NEWW");
  });
});

suite("examples/remodel.arch", () => {
  it("compiles and lints clean, and writes two demolished partitions and one new one", () => {
    expect(compile(REMODEL).diagnostics).toEqual([]);
    expect(lint(REMODEL)).toEqual([]);
    expect(describePlan(REMODEL).wall_status?.counts).toEqual({ existing: 5, demolish: 2, new: 1 });
  });

  // Pinned when the example was written (B3b). A move is a finding to explain, never a re-pin.
  it("pins its SVG, DXF, describe() and lint()", () => {
    const r = compile(REMODEL, { noCache: true });
    expect({
      svg: sha(r.svg),
      dxf: sha(toDxf(r.scene!)),
      describe: sha(JSON.stringify(describePlan(REMODEL))),
      lint: sha(JSON.stringify(lint(REMODEL))),
    }).toEqual(PINS);
  });
});

const PINS = {
  svg: "b2231d401169d8cd22d536cd78583d9f30e6c60961af4693c19d7df66666d7de",
  dxf: "437ddc35c9fe85cc1a8961dc94821163e28206af596e67688ed48cd5af867c53",
  describe: "380ede0806d4364ac4a300da8635ed7b56398aee31bea9f750c73ac2da5ddc9a",
  lint: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
};
