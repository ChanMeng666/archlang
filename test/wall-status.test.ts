/**
 * Wall `status existing|demolish|new` (preview-and-remodel B3a): the semantics, never a drawing.
 *
 * - **It draws nothing yet (B3b draws it).** Over every example, every authored wall that hosts
 *   nothing is marked `status demolish` and every `walls from rooms` statement `status new`: each
 *   storey's SVG is byte-identical to the plan without the clauses. With `status new` on every
 *   wall instead, `describe()` differs only by its `wall_status` block and `lint()` not at all.
 * - **A demolished wall encloses nothing, hosts nothing and counts in no area.** The card's
 *   acceptance fixture: one demolished partition between two rooms. The two rooms lie in one
 *   walled face, the access graph joins them across the run (so the study is reachable and its
 *   walk is measured), and each room's net area is the one it has with no partition at all. A
 *   door in the demolished wall is `E_OPENING_ON_DEMOLISHED_WALL`.
 * - **The printer and Plan JSON round-trip the status**, and the schema holds its values.
 *
 * The byte-identity law for plans that write no `status` is `wall-status-byte-identity.test.ts`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { wallFaces } from "../src/analyze/wall-faces.js";
import {
  compile,
  describe as describePlan,
  format,
  lint,
  type PlanJson,
  planFromJson,
  planToJson,
} from "../src/index.js";
import type { RWall, ResolvedPlan } from "../src/ir.js";
import { PLAN_JSON_SCHEMA } from "../src/plan-json.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = readdirSync(join(ROOT, "examples"))
  .filter((f) => f.endsWith(".arch"))
  .sort();

/** Every storey's SVG (the pages of a multi-storey plan, else the one drawing). */
function svgs(src: string): string[] {
  const r = compile(src);
  return r.pages ? r.pages.map((p) => p.svg) : [r.svg];
}

/** The storeys of a resolved plan: its levels, else the one IR. */
function storeys(src: string): ResolvedPlan[] {
  const r = resolvePlan(src);
  return r.levels.length > 0 ? r.levels.map((l) => l.ir) : r.ir ? [r.ir] : [];
}

/** Insert ` status <s>` into the head of the statement starting at `start` (a `wall` or a
 *  `walls from rooms`), before its body, its pairwise form or the end of its line. */
function withStatus(src: string, start: number, status: string): { src: string; at: number } {
  const eol = src.indexOf("\n", start);
  const line = src.slice(start, eol < 0 ? src.length : eol);
  const cut = line.search(/ (\{|between |around |#)/);
  const at = start + (cut < 0 ? line.replace(/\s+$/, "").length : cut);
  return { src: `${src.slice(0, at)} status ${status}${src.slice(at)}`, at };
}

/** Apply many insertions, last offset first so earlier offsets stay valid. */
function insertAll(src: string, edits: Array<[number, string]>): string {
  let out = src;
  for (const [start, status] of [...edits].sort((a, b) => b[0] - a[0])) out = withStatus(out, start, status).src;
  return out;
}

/** The statement offsets of the root file's authored walls (`hostless`: none hosts an opening in
 *  any instance or storey) and of its `walls from rooms` statements. */
function wallStatements(src: string): { hostless: number[]; hosting: number[]; derivers: number[] } {
  const hosts = new Set<number>();
  const all = new Set<number>();
  const derivers = new Set<number>();
  for (const ir of storeys(src)) {
    for (const e of ir.elements) {
      const span = (e as { span?: { start: number } }).span;
      if (!span || (e as { _file?: string })._file !== undefined) continue;
      if (e.kind === "walls") derivers.add(span.start);
      if (e.kind !== "wall") continue;
      const w = e as RWall;
      if (!src.startsWith("wall", span.start)) continue;
      all.add(span.start);
      if (w.openings.length > 0) hosts.add(span.start);
    }
  }
  return {
    hostless: [...all].filter((s) => !hosts.has(s)),
    hosting: [...hosts],
    derivers: [...derivers].filter((s) => src.startsWith("walls from rooms", s)),
  };
}

suite("status draws nothing (until B3b)", () => {
  /** How much of the corpus the demolish sweep really marked (non-vacuity, checked last). */
  const swept = { plans: 0, demolished: 0 };

  it.each(EXAMPLES)("%s: demolishing every wall that hosts nothing moves no SVG byte", (file) => {
    const src = readFileSync(join(ROOT, "examples", file), "utf8");
    const plain = svgs(src);
    if (plain.some((s) => s === "")) return; // a plan that needs a world (imports) draws nothing here
    const { hostless, derivers } = wallStatements(src);
    const edits: Array<[number, string]> = [
      ...hostless.map((s): [number, string] => [s, "demolish"]),
      ...derivers.map((s): [number, string] => [s, "new"]),
    ];
    if (edits.length === 0) return;
    const marked = insertAll(src, edits);
    expect(compile(marked).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(svgs(marked)).toEqual(plain);
    // The analysis really dropped them: the plan after the demolition has fewer walls.
    if (hostless.length > 0) {
      const before = storeys(src).reduce((n, ir) => n + ir.walls.length, 0);
      const after = storeys(marked).reduce((n, ir) => n + ir.walls.length, 0);
      expect(after).toBeLessThan(before);
      swept.plans++;
      swept.demolished += hostless.length;
    }
  });

  it("the demolish sweep was not vacuous", () => {
    // Measured when the sweep was written: 25 plans, 84 hostless authored walls.
    expect(swept.plans).toBeGreaterThanOrEqual(20);
    expect(swept.demolished).toBeGreaterThanOrEqual(60);
  });

  it.each(EXAMPLES)("%s: `status new` on every wall moves only describe().wall_status", (file) => {
    const src = readFileSync(join(ROOT, "examples", file), "utf8");
    if (svgs(src).some((s) => s === "")) return;
    const { hostless, hosting, derivers } = wallStatements(src);
    const all = [...hostless, ...hosting, ...derivers];
    if (all.length === 0) return;
    const marked = insertAll(
      src,
      all.map((s): [number, string] => [s, "new"]),
    );
    expect(svgs(marked)).toEqual(svgs(src));
    // `lint()` diagnostics carry byte spans: the inserted words shift every span after them, so
    // compare the codes and messages, which is everything a status could move.
    const view = (ds: ReturnType<typeof lint>) => ds.map((d) => [d.code, d.severity, d.message]);
    expect(view(lint(marked))).toEqual(view(lint(src)));
    const d = describePlan(marked) as unknown as Record<string, unknown>;
    expect(d.wall_status).toBeDefined();
    const counts = (d.wall_status as { counts: Record<string, number> }).counts;
    expect(counts.demolish).toBe(0);
    expect(counts.existing).toBe(0);
    const strip = (x: Record<string, unknown>) => {
      const { wall_status: _w, levels, ...rest } = x as Record<string, unknown> & { levels?: unknown[] };
      return {
        ...rest,
        ...(levels ? { levels: (levels as Record<string, unknown>[]).map(({ wall_status: _l, ...l }) => l) } : {}),
      };
    };
    const noSpans = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "span" ? undefined : v)));
    expect(noSpans(strip(d))).toEqual(noSpans(strip(describePlan(src) as unknown as Record<string, unknown>)));
  });
});

const plan = (body: string) => `plan "p" {\n  units mm\n  grid 1\n${body}\n}\n`;
const SHELL = `  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }`;
const ROOMS = `  room id=a at (0,0) size 4000x5000 label "Bedroom" uses bedroom
  room id=b at (4000,0) size 4000x5000 label "Study" uses office
  door id=d1 at (2000,5000) width 900 wall exterior`;
const DEMOLISHED = plan(
  `${SHELL}\n  wall id=part partition thickness 100 status demolish { (4000,0) (4000,5000) }\n${ROOMS}`,
);
const STANDING = DEMOLISHED.replace(" status demolish", "");
const NO_PARTITION = plan(`${SHELL}\n${ROOMS}`);

suite("the acceptance fixture: one demolished partition", () => {
  it("draws exactly what the standing partition draws", () => {
    expect(compile(DEMOLISHED).diagnostics).toEqual([]);
    expect(compile(DEMOLISHED).svg).toBe(compile(STANDING).svg);
  });

  it("encloses nothing: the two rooms lie in one walled face", () => {
    const faceOf = (src: string) => {
      const ir = resolvePlan(src).ir!;
      const wf = wallFaces(ir.walls);
      if (!wf || "refused" in wf) throw new Error("no faces");
      return [wf.faceAt({ x: 2000, y: 2500 }), wf.faceAt({ x: 6000, y: 2500 })];
    };
    const [fa, fb] = faceOf(DEMOLISHED);
    expect(fa).toBeGreaterThanOrEqual(0);
    expect(fa).toBe(fb);
    const [sa, sb] = faceOf(STANDING);
    expect(sa).not.toBe(sb);
    // The analysis IR is the plan after the demolition; the drawing keeps the wall.
    const ir = resolvePlan(DEMOLISHED).ir!;
    expect(ir.walls.map((w) => w.id)).toEqual(["shell"]);
    expect(ir.elements.some((e) => e.id === "part")).toBe(false);
    expect(ir.drawn?.walls.map((w) => w.id)).toEqual(["shell", "part"]);
    expect(resolvePlan(STANDING).ir!.drawn).toBeUndefined();
  });

  it("reachability treats it as open: the access graph joins the rooms across the run", () => {
    const d = describePlan(DEMOLISHED);
    const run = d.access.edges.find((e) => e.doorId === "part");
    expect(run).toMatchObject({ kind: "opening", between: ["a", "b"], nominalWidth: 5000, exterior: false });
    expect(d.access.rooms).toEqual([
      { id: "a", depthFromEntrance: 1, reachable: true, bottleneckClearWidth: 840 },
      { id: "b", depthFromEntrance: 2, reachable: true, bottleneckClearWidth: 840 },
    ]);
    // The circulation walk measures the study; with the wall standing it has no door route.
    expect(d.circulation?.rooms.map((r) => r.roomId)).toEqual(["a", "b"]);
    expect(describePlan(STANDING).circulation?.unmeasured).toEqual([{ roomId: "b", reason: "no_door_route" }]);
    expect(d.input_graph).toEqual({ a: ["b"], b: ["a"] });
  });

  it("counts in no area: each room's net area is the one it has with no partition at all", () => {
    const net = (src: string) => describePlan(src).rooms.map((r) => r.net_area_m2);
    expect(net(DEMOLISHED)).toEqual(net(NO_PARTITION));
    expect(net(DEMOLISHED)).toEqual([18.72, 18.72]);
    expect(net(STANDING)).toEqual([18.48, 18.48]);
    expect(describePlan(DEMOLISHED).totals.net_floor_area_m2).toBe(37.44);
  });

  it("lints the run as open: no missing wall, no disconnected room", () => {
    const codes = (src: string) => lint(src).map((d) => d.code);
    expect(codes(STANDING)).toContain("W_ROOM_DISCONNECTED");
    expect(codes(NO_PARTITION)).toContain("W_BOUNDARY_NO_WALL");
    expect(codes(DEMOLISHED)).not.toContain("W_ROOM_DISCONNECTED");
    expect(codes(DEMOLISHED)).not.toContain("W_BOUNDARY_NO_WALL");
    expect(codes(DEMOLISHED)).not.toContain("W_ROOM_UNREACHABLE");
  });

  it("describe() reports each wall's status and the count by status", () => {
    const d = describePlan(DEMOLISHED);
    expect(d.wall_status).toEqual({
      counts: { existing: 1, demolish: 1, new: 0 },
      walls: [
        { id: "shell", category: "exterior", status: "existing" },
        { id: "part", category: "partition", status: "demolish" },
      ],
    });
    expect(describePlan(STANDING).wall_status).toBeUndefined();
  });

  it("a `new` wall is a wall", () => {
    const fresh = DEMOLISHED.replace("status demolish", "status new");
    const strip = ({ wall_status: _w, ...rest }: ReturnType<typeof describePlan>) => rest;
    expect(strip(describePlan(fresh))).toEqual(strip(describePlan(STANDING)));
    expect(lint(fresh).map((d) => d.code)).toEqual(lint(STANDING).map((d) => d.code));
    expect(compile(fresh).svg).toBe(compile(STANDING).svg);
  });
});

suite("a demolished wall hosts nothing: E_OPENING_ON_DEMOLISHED_WALL", () => {
  const door = DEMOLISHED.replace(
    "  door id=d1",
    "  door id=d2 on part at 50% width 800\n  window id=w1 at (4000,1000) width 600 wall part\n  door id=d1",
  );

  it("refuses a door and a window in the wall, naming neither by id in the message", () => {
    const errs = compile(door).diagnostics.filter((d) => d.code === "E_OPENING_ON_DEMOLISHED_WALL");
    expect(errs).toHaveLength(2);
    expect(errs[0]!.message).toBe(
      "A door stands in the partition at x 4000, which is marked `status demolish`: a demolished wall hosts nothing",
    );
    expect(errs[1]!.message).toContain("A window stands in the partition at x 4000");
    for (const e of errs) {
      expect(e.message).not.toMatch(/"(d2|w1|part)"/);
      expect(e.hints?.[0]).toContain('"part"');
      expect(door.slice(e.span!.start, e.span!.end)).toMatch(/^(door id=d2|window id=w1)/);
    }
    expect(compile(door).svg).toBe("");
  });

  it("a door between two rooms whose derived partition is demolished is refused too", () => {
    const src = plan(`  room id=a at (0,0) size 4000x5000
  room id=b at (4000,0) size 4000x5000
  walls from rooms exterior 200 partition 100 status demolish
  door between a and b at 1000 from start width 800`);
    expect(compile(src).diagnostics.map((d) => d.code)).toContain("E_OPENING_ON_DEMOLISHED_WALL");
  });
});

suite("`walls from rooms … status`", () => {
  const src = plan(`  room id=a at (0,0) size 4000x5000
  room id=b at (4000,0) size 4000x5000
  walls from rooms exterior 200 partition 100 status new { open between a and b }
  door on a.bottom at center width 900`);

  it("gives every derived wall the statement's status, and draws nothing differently", () => {
    const d = describePlan(src);
    expect(d.wall_status?.counts).toEqual({ existing: 0, demolish: 0, new: 2 });
    expect(d.wall_status?.walls.every((w) => w.status === "new")).toBe(true);
    expect(compile(src).svg).toBe(compile(src.replace(" status new", "")).svg);
  });

  it("round-trips through the printer and Plan JSON", () => {
    expect(format(src)).toContain("walls from rooms exterior 200 partition 100 status new { open between a and b }");
    const j = planToJson(src).json as PlanJson;
    expect(j.walls_from_rooms?.status).toBe("new");
    const back = planFromJson(j);
    expect(back.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    expect(compile(back.source!).svg).toBe(compile(src).svg);
    expect(back.source).toContain("partition 100 status new");
  });
});

suite("the printer and Plan JSON round-trip a wall's status", () => {
  it("`fmt` keeps the clause, after `height`, and is a fixed point", () => {
    const src = plan(
      "  wall id=w exterior thickness 200 material brick height 2800 status demolish { (0,0) (4000,0) }\n  wall id=v partition thickness 100 status new between a and b\n  room id=a at (0,0) size 2000x2000\n  room id=b at (2000,0) size 2000x2000",
    );
    const once = format(src);
    expect(once).toContain("wall id=w exterior thickness 200 material brick height 2800 status demolish {");
    expect(once).toContain("wall id=v partition thickness 100 status new between a and b");
    expect(format(once)).toBe(once);
  });

  it("Plan JSON carries `status` only where written, and planFromJson reads it back", () => {
    const j = planToJson(DEMOLISHED).json as PlanJson;
    expect(j.walls.map((w) => [w.id, w.status])).toEqual([
      ["shell", undefined],
      ["part", "demolish"],
    ]);
    expect("status" in j.walls[0]!).toBe(false);
    expect(JSON.stringify(planToJson(STANDING).json)).not.toContain('"status"');
    const back = planFromJson(j);
    expect(back.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    expect(back.source).toContain("status demolish");
    expect(describePlan(back.source!).wall_status).toEqual(describePlan(DEMOLISHED).wall_status);
    expect(compile(back.source!).svg).toBe(compile(DEMOLISHED).svg);
  });

  it("the schema and the validator hold the status to its three values", () => {
    expect(PLAN_JSON_SCHEMA.properties.walls.items.properties.status.enum).toEqual(["existing", "demolish", "new"]);
    expect(PLAN_JSON_SCHEMA.properties.walls_from_rooms.properties.status.enum).toEqual([
      "existing",
      "demolish",
      "new",
    ]);
    const j = planToJson(DEMOLISHED).json as PlanJson;
    const bad = { ...j, walls: j.walls.map((w) => (w.id === "part" ? { ...w, status: "removed" } : w)) };
    const codes = planFromJson(bad).diagnostics.map((d) => d.code);
    expect(codes).toContain("E_JSON_SCHEMA");
  });

  it("an unknown status word is a parse error naming the three", () => {
    const r = compile(plan("  wall partition thickness 100 status gone { (0,0) (4000,0) }"));
    expect(r.diagnostics[0]?.code).toBe("E_PARSE");
    expect(r.diagnostics[0]?.message).toContain('"existing" or "demolish" or "new"');
  });
});

// ---------------------------------------------------------------------------------------------
// Review round 1
// ---------------------------------------------------------------------------------------------

suite("round 1 · M2: an opening the hosting rule gave a demolished wall is re-hosted on a standing one", () => {
  // A demolished partition and a `new` one on the same line: the door is placed by position.
  const coincident = (door: string) =>
    plan(
      `${SHELL}\n  wall id=part partition thickness 100 status demolish { (4000,0) (4000,5000) }\n` +
        `  wall id=fresh partition thickness 100 status new { (4000,0) (4000,5000) }\n${ROOMS}\n${door}`,
    );

  it("by position: hosted on the `new` wall for the analysis, drawn as before", () => {
    const src = coincident("  door id=d2 at (4000,2500) width 800");
    expect(compile(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const ir = resolvePlan(src).ir!;
    const d2 = ir.elements.find((e) => e.id === "d2") as { host?: { wallId: string } };
    expect(d2.host?.wallId).toBe("fresh");
    expect(ir.walls.find((w) => w.id === "fresh")!.openings.map((o) => o.ownerId)).toEqual(["d2"]);
    // The drawn objects keep the hosting the drawing always had.
    const drawnD2 = ir.drawn!.elements.find((e) => e.id === "d2") as { host?: { wallId: string } };
    expect(drawnD2.host?.wallId).toBe("part");
    expect(ir.drawn!.walls.find((w) => w.id === "fresh")!.openings).toEqual([]);
    expect(compile(src).svg).toBe(compile(src.replace(" status demolish", "").replace(" status new", "")).svg);
    // And it is the door the access graph walks through.
    expect(describePlan(src).access.edges.find((e) => e.doorId === "d2")?.between).toEqual(["a", "b"]);
  });

  it("by category: `wall partition` re-hosts on the standing partition", () => {
    const src = coincident("  door id=d2 at (4000,2500) width 800 wall partition");
    expect(compile(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("refused when only the demolished wall is there", () => {
    const src = DEMOLISHED.replace("  door id=d1", "  door id=d2 at (4000,2500) width 800\n  door id=d1");
    expect(compile(src).diagnostics.map((d) => d.code)).toContain("E_OPENING_ON_DEMOLISHED_WALL");
  });

  it("refused when the statement names the demolished wall by id, standing wall or not", () => {
    for (const door of ["  door id=d2 on part at 50% width 800", "  door id=d2 at (4000,2500) width 800 wall part"]) {
      expect(compile(coincident(door)).diagnostics.map((d) => d.code)).toContain("E_OPENING_ON_DEMOLISHED_WALL");
    }
  });
});

suite("round 1 · M3: a run a demolished wall leaves open closes a wet room's perimeter", () => {
  // A WC beside the living room; the partition between them is demolished.
  const wc = (status: string) =>
    plan(`  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
${status === "gone" ? "" : `  wall id=part partition thickness 100${status} { (4000,0) (4000,4000) }\n`}  room id=liv at (0,0) size 4000x4000 label "Living" uses living
  room id=wc at (4000,0) size 2000x4000 label "WC" uses wc
  door id=d1 at (2000,4000) width 900 wall exterior
  furniture toilet at (5300,300) size 400x700
  furniture basin at (5300,3000) size 500x400`);

  it("W_ROOM_NOT_ENCLOSED agrees with the reachability and boundary rules", () => {
    const codes = (src: string) => lint(src).map((d) => d.code);
    // With the wall gone from the source the WC is open on a whole side: the rule fires.
    expect(codes(wc("gone"))).toContain("W_ROOM_NOT_ENCLOSED");
    // Demolished, the side is an open run joining it to the living room: no rule calls it unwalled.
    const demolished = codes(wc(" status demolish"));
    expect(demolished).not.toContain("W_ROOM_NOT_ENCLOSED");
    expect(demolished).not.toContain("W_BOUNDARY_NO_WALL");
    expect(demolished).not.toContain("W_ROOM_DISCONNECTED");
  });
});

suite("round 1 · M4: the drawn room schedule measures the plan as drawn until B3b", () => {
  it("states the exception: describe().schedule is after the demolition, the drawn table is not", () => {
    const src = DEMOLISHED.replace("  units mm", "  units mm\n  schedule rooms");
    const rows = describePlan(src).schedule!;
    expect(rows.map((r) => r.net_area_m2)).toEqual([18.72, 18.72]);
    // The drawn NET AREA still subtracts the demolished partition's band (B3b flips this).
    const svg = compile(src).svg;
    expect(svg).toContain(">18.48<");
    expect(svg).not.toContain(">18.72<");
    expect(svg).toBe(compile(STANDING.replace("  units mm", "  units mm\n  schedule rooms")).svg);
  });
});

suite("round 1 · minors", () => {
  it("m1: a keep naming a demolished wall is refused by its status", () => {
    const src = DEMOLISHED.replace("  door id=d1", "  keep fixed part at 4000\n  door id=d1");
    const d = compile(src).diagnostics.find((x) => x.code === "E_KEEP_TARGET");
    expect(d?.message).toBe("This keep names a wall marked `status demolish`, which stands in no measure of the plan");
    expect(d?.hints?.[0]).toContain("`part`");
  });

  it("m2: an `open between` opening of a demolished statement leaves the analysis with its wall", () => {
    const src = plan(`  room id=a at (0,0) size 4000x5000
  room id=b at (4000,0) size 4000x5000
  walls from rooms exterior 200 partition 100 status demolish { open id=ab between a and b }`);
    const ir = resolvePlan(src).ir!;
    expect(ir.elements.some((e) => e.id === "ab")).toBe(false);
    expect(ir.drawn!.elements.some((e) => e.id === "ab")).toBe(true);
    expect(describePlan(src).openings.map((o) => o.id)).toEqual([]);
    expect(compile(src).svg).toBe(compile(src.replace(" status demolish", "")).svg);
  });

  it("m4: a demolished derived wall is in no `depends` or `derived_walls` fact, like an authored one", () => {
    const src = plan(`  room id=a at (0,0) size 4000x5000
  room id=b at (4000,0) size 4000x5000
  walls from rooms exterior 200 partition 100 status demolish`);
    const d = describePlan(src, { facts: ["depends"] });
    expect(d.depends?.derived_walls).toEqual([]);
    expect(d.derived_walls).toBeUndefined();
    expect(d.wall_status?.counts.demolish).toBe(2);
  });
});
