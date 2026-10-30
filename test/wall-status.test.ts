/**
 * Wall `status existing|demolish|new` (preview-and-remodel B3a): the semantics. The drawing
 * (B3b) is `wall-status-drawing.test.ts`.
 *
 * - **A demolished wall moves no standing wall.** Over every example, every authored wall that
 *   hosts nothing is marked `status demolish` and every `walls from rooms` statement `status new`:
 *   each storey draws exactly the standing walls the plan draws with those statements deleted,
 *   plus one dashed outline, and places every piece of furniture where that plan places it. With `status new` on every wall instead, the SVG is unchanged,
 *   `describe()` differs only by its `wall_status` block and `lint()` not at all.
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
  toDxf,
} from "../src/index.js";
import { MAX_EVAL_STEPS, standingWalls, withStepMeter } from "../src/expr.js";
import type { RFurniture, RRoof, RWall, ResolvedPlan } from "../src/ir.js";
import type { Scene } from "../src/scene.js";
import { PLAN_JSON_SCHEMA } from "../src/plan-json.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The examples that write no `status` (the sweeps below write one into each); `remodel.arch`
 *  writes its own and is pinned by `wall-status-drawing.test.ts`. */
const EXAMPLES = readdirSync(join(ROOT, "examples"))
  .filter((f) => f.endsWith(".arch"))
  .filter((f) => !/\bstatus\s+(existing|demolish|new)\b/.test(readFileSync(join(ROOT, "examples", f), "utf8")))
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

/** Of the wall statements at `starts`, the ones no piece of furniture backs onto (A8: a demolished
 *  wall holds nothing, `E_FURN_AGAINST_DEMOLISHED_WALL`). Read off the compiler's own refusal:
 *  mark them all demolished, drop every statement whose wall a refusal's hint names (by id, or as
 *  a component instance names it, `<instance>.<id>`), and repeat until nothing is refused. */
function backsNoPiece(src: string, starts: readonly number[]): number[] {
  let kept = [...starts];
  for (let pass = 0; pass < 8 && kept.length > 0; pass++) {
    const marked = insertAll(
      src,
      kept.map((s): [number, string] => [s, "demolish"]),
    );
    const named = new Set<string>();
    for (const d of compile(marked).diagnostics) {
      const id =
        d.code === "E_FURN_AGAINST_DEMOLISHED_WALL" ? /the wall "([^"]+)"/.exec(d.hints?.[0] ?? "")?.[1] : undefined;
      if (id !== undefined) named.add(id);
    }
    if (named.size === 0) return kept;
    // The walls by id in the unmarked plan, whose offsets `kept` holds.
    const backed = new Set<number>();
    for (const ir of storeys(src)) {
      for (const e of ir.elements) {
        const span = (e as { span?: { start: number } }).span;
        if (e.kind !== "wall" || !span) continue;
        if ([...named].some((id) => e.id === id || e.id.endsWith(`.${id}`))) backed.add(span.start);
      }
    }
    const before = kept.length;
    kept = kept.filter((s) => !backed.has(s));
    if (kept.length === before) throw new Error(`a refusal named no marked wall: ${[...named].join(", ")}`);
  }
  return kept;
}

/** Every storey's Scene (the pages of a multi-storey plan, else the one drawing). */
function scenes(src: string): Scene[] {
  const r = compile(src);
  return r.pages ? r.pages.map((p) => p.scene) : r.scene ? [r.scene] : [];
}

/** A storey's wall drawing as geometry: each wall node's pass, primitive and line type. The paint
 *  is left out, because a pen width is a fraction of the drawing's extent, which a deleted wall
 *  can shrink. */
const wallPrims = (sc: Scene) =>
  sc.nodes
    .filter((n) => n.layer === "wallFill" || n.layer === "wallFace")
    .map((n) => ({ layer: n.layer, prim: n.prim, lineType: n.lineType }));

/** Every storey's furniture as placed: id, footprint, turn and mirror, in source order. */
function furniturePlacements(src: string) {
  return storeys(src).map((ir) =>
    ir.elements
      .filter((e) => e.kind === "furniture")
      .map((e) => {
        const f = e as RFurniture;
        return { id: f.id, at: f.at, size: f.size, rotate: f.rotate, mirror: f._mirror };
      }),
  );
}

/** Blank the wall statements starting at `starts` (their whole spans) with spaces, keeping every
 *  newline, so every other statement keeps its byte offsets. */
function blankStatements(src: string, starts: readonly number[]): string {
  const spans = new Map<number, number>();
  for (const ir of storeys(src)) {
    for (const e of ir.drawn?.elements ?? ir.elements) {
      const span = (e as { span?: { start: number; end: number } }).span;
      if (e.kind === "wall" && span && starts.includes(span.start)) spans.set(span.start, span.end);
    }
  }
  let out = src;
  for (const [a, b] of spans) out = out.slice(0, a) + out.slice(a, b).replace(/[^\n]/g, " ") + out.slice(b);
  return out;
}

suite("status demolish draws the standing walls unchanged, and itself dashed", () => {
  /** How much of the corpus the demolish sweep really marked (non-vacuity, checked last). */
  const swept = { plans: 0, demolished: 0, compared: 0, furniture: 0 };

  it.each(EXAMPLES)(
    "%s: demolishing every wall that hosts nothing draws what deleting it draws, plus a dashed outline",
    (file) => {
      const src = readFileSync(join(ROOT, "examples", file), "utf8");
      const plain = svgs(src);
      if (plain.some((s) => s === "")) return; // a plan that needs a world (imports) draws nothing here
      const { hostless: hostsNoOpening, derivers } = wallStatements(src);
      const hostless = backsNoPiece(src, hostsNoOpening);
      const edits: Array<[number, string]> = [
        ...hostless.map((s): [number, string] => [s, "demolish"]),
        ...derivers.map((s): [number, string] => [s, "new"]),
      ];
      if (edits.length === 0) return;
      const marked = insertAll(src, edits);
      expect(compile(marked).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      if (hostless.length === 0) {
        expect(svgs(marked)).toEqual(plain);
        return;
      }
      const markedScenes = scenes(marked);
      // A storey that demolishes a wall draws exactly one dashed outline, on the poche pass.
      for (const sc of markedScenes) {
        const dashed = wallPrims(sc).filter((n) => n.lineType === "dashed");
        expect(dashed.length).toBeLessThanOrEqual(1);
        for (const d of dashed) expect(d.layer).toBe("wallFill");
      }
      expect(markedScenes.some((sc) => wallPrims(sc).some((n) => n.lineType === "dashed"))).toBe(true);
      // The same walls deleted instead (blanked in `src`, so no other statement moves): the
      // standing walls are drawn exactly as that plan draws them, with the same patterns.
      const deleted = blankStatements(src, hostless);
      if (compile(deleted).diagnostics.every((d) => d.severity !== "error")) {
        const deletedScenes = scenes(deleted);
        expect(markedScenes).toHaveLength(deletedScenes.length);
        markedScenes.forEach((sc, i) => {
          expect(wallPrims(sc).filter((n) => n.lineType === undefined)).toEqual(wallPrims(deletedScenes[i]!));
          expect(sc.hatches).toEqual(deletedScenes[i]!.hatches);
        });
        // And every piece of furniture is placed where the deleted twin places it (A9): a piece
        // resolved against a wall (`flush`, a derived turn, `against <room>.<edge>`) reads only
        // the walls that stand.
        const markedFurniture = furniturePlacements(marked);
        expect(markedFurniture).toEqual(furniturePlacements(deleted));
        swept.furniture += markedFurniture.flat().length;
        swept.compared++;
      }
      // The analysis really dropped them: the plan after the demolition has fewer walls.
      if (hostless.length > 0) {
        const before = storeys(src).reduce((n, ir) => n + ir.walls.length, 0);
        const after = storeys(marked).reduce((n, ir) => n + ir.walls.length, 0);
        expect(after).toBeLessThan(before);
        swept.plans++;
        swept.demolished += hostless.length;
      }
    },
  );

  it("the demolish sweep was not vacuous", () => {
    // Measured when the sweep was written: 25 plans, 84 hostless authored walls. Since A8 a wall
    // that backs a piece hosts something too (`backsNoPiece`): 21 plans, 54 walls, and the
    // deletion comparison then runs on all 21 (a deleted twin no longer loses a piece's wall).
    expect(swept.plans, JSON.stringify(swept)).toBeGreaterThanOrEqual(20);
    expect(swept.demolished, JSON.stringify(swept)).toBeGreaterThanOrEqual(45);
    // And the deletion comparison really ran (B3b; measured: 13 plans, the others' deleted twin
    // does not compile because a statement names a deleted wall).
    expect(swept.compared, JSON.stringify(swept)).toBeGreaterThanOrEqual(12);
    // And it compared furniture (A9; measured: 440 pieces over the 21 plans). With `anchor …
    // flush` and the derived turn reading a demolished wall again, 8 of the 21 went red
    // (bungalow's piece moved x 4900 → 4850, half the demolished wall's thickness); with the
    // derived turn alone, 4.
    expect(swept.furniture, JSON.stringify(swept)).toBeGreaterThanOrEqual(400);
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
  it("draws the shell the plan with no partition draws, and the partition dashed (B3b)", () => {
    expect(compile(DEMOLISHED).diagnostics).toEqual([]);
    const walls = wallPrims(compile(DEMOLISHED).scene!);
    expect(walls.filter((n) => n.lineType === undefined)).toEqual(wallPrims(compile(NO_PARTITION).scene!));
    expect(walls.filter((n) => n.lineType === "dashed")).toHaveLength(1);
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

  it("by position: hosted on the `new` wall for the analysis, and cut through it in the drawing", () => {
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
    // The standing walls are drawn as the analysis has them (B3b): the `new` wall carries the
    // door's cut, exactly as a plan with no demolished partition draws it, and the demolished
    // partition is the one dashed outline.
    const walls = wallPrims(compile(src).scene!);
    const alone = src.replace(/ {2}wall id=part [^\n]*\n/, "");
    expect(alone).not.toContain("id=part");
    expect(walls.filter((n) => n.lineType === undefined)).toEqual(wallPrims(compile(alone).scene!));
    expect(walls.filter((n) => n.lineType === "dashed")).toHaveLength(1);
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

suite("round 1 · M4: the drawn room schedule measures the plan after the demolition (B3b)", () => {
  it("the drawn table is describe().schedule: no exception", () => {
    const src = DEMOLISHED.replace("  units mm", "  units mm\n  schedule rooms");
    const rows = describePlan(src).schedule!;
    expect(rows.map((r) => r.net_area_m2)).toEqual([18.72, 18.72]);
    // The drawn NET AREA no longer subtracts the demolished partition's band, and the TOTAL is
    // describe()'s.
    const svg = compile(src).svg;
    expect(svg).toContain(">18.72<");
    expect(svg).not.toContain(">18.48<");
    expect(svg).toContain(">37.44<");
    expect(describePlan(src).totals.net_floor_area_m2).toBe(37.44);
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
    // ... and leaves the drawing with it too (A8): the sheet draws no opening describe() lacks.
    expect(ir.drawn!.elements.some((e) => e.id === "ab")).toBe(false);
    expect(describePlan(src).openings.map((o) => o.id)).toEqual([]);
    // Every wall demolished: no poche, one dashed outline (B3b).
    const walls = wallPrims(compile(src).scene!);
    expect(walls).toHaveLength(1);
    expect(walls[0]).toMatchObject({ layer: "wallFill", lineType: "dashed" });
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

suite("A8: the drawing agrees with the analysis on a demolished wall's opening", () => {
  const OPEN = (status: string) =>
    plan(`  room id=a at (0,0) size 4000x5000
  room id=b at (4000,0) size 4000x5000
  walls from rooms exterior 200 partition 100${status} { open id=ab between a and b width 1000 }`);
  const openingNodes = (src: string) => compile(src).scene!.nodes.filter((n) => n.layer === "openings");

  it("an `open between` of a demolished statement is not drawn, scheduled or exported", () => {
    const src = OPEN(" status demolish");
    expect(compile(src).diagnostics).toEqual([]);
    expect(openingNodes(src)).toEqual([]);
    const svg = compile(src).svg;
    expect(svg).not.toContain('id="A-DOOR"');
    // The DXF files no entity on the openings layer: as many mentions as the statement with no
    // `open between` at all (the layer table's own).
    const doorLayer = (s: string) => toDxf(compile(s).scene!).split("A-DOOR").length - 1;
    expect(doorLayer(src)).toBe(doorLayer(src.replace(" { open id=ab between a and b width 1000 }", "")));
    expect(doorLayer(OPEN(""))).toBeGreaterThan(doorLayer(src));
    expect(describePlan(src).openings).toEqual([]);
  });

  it("the demolished wall keeps the gap the opening cut: its outline as it stands before the works", () => {
    const svg = compile(OPEN(" status demolish")).svg;
    // The dashed outline runs round the 1000 mm gap at y 2000–3000 on the partition at x 4000.
    expect(svg).toContain("L 3950,3000 L 4050,3000 L 4050,4900");
    expect(svg).toContain("L 4050,2000 L 3950,2000 L 3950,100");
    const walls = wallPrims(compile(OPEN(" status demolish")).scene!);
    expect(walls).toEqual([expect.objectContaining({ layer: "wallFill", lineType: "dashed" })]);
  });

  it("a standing statement still draws its opening (only a demolished host drops it)", () => {
    for (const status of ["", " status existing", " status new"]) {
      expect(openingNodes(OPEN(status))).toHaveLength(1);
      expect(resolvePlan(OPEN(status)).ir!.drawn).toBeUndefined();
    }
  });
});

type RFurnitureLike = { at: { x: number; y: number }; size: { w: number; h: number }; rotate?: number };

suite("A8: a piece backed onto a demolished wall is E_FURN_AGAINST_DEMOLISHED_WALL", () => {
  const PART = `  wall id=part partition thickness 100 status demolish { (4000,0) (4000,5000) }`;
  const PLAN = (furniture: string, extra = "") => plan(`${SHELL}\n${PART}\n${extra}${ROOMS}\n  ${furniture}`);
  const codes = (src: string) => compile(src).diagnostics.map((d) => d.code);

  it("`against wall <id>` naming it is refused, named as a person would, ids in the hint", () => {
    const src = PLAN("furniture id=wr wardrobe against wall part side left size 1200x600");
    const d = compile(src).diagnostics;
    expect(d.map((x) => x.code)).toEqual(["E_FURN_AGAINST_DEMOLISHED_WALL"]);
    expect(d[0]!.severity).toBe("error");
    expect(d[0]!.message).toBe(
      "A piece of furniture backs onto the partition at x 4000, which is marked `status demolish`: a demolished wall holds nothing",
    );
    expect(d[0]!.message).not.toMatch(/"wr"|"part"|\bpart\b/);
    expect(d[0]!.hints?.[0]).toContain('"wr"');
    expect(d[0]!.hints?.[0]).toContain('"part"');
    // The same statement on the standing wall places as it always did.
    expect(codes(src.replace(" status demolish", ""))).toEqual([]);
  });

  it("`against wall <id>` naming it is refused even with a `new` wall on the same line", () => {
    const fresh = `  wall id=fresh partition thickness 100 status new { (4000,0) (4000,5000) }\n`;
    expect(codes(PLAN("furniture wardrobe against wall part side left size 1200x600", fresh))).toEqual([
      "E_FURN_AGAINST_DEMOLISHED_WALL",
    ]);
    // ... while naming the new wall places against it.
    expect(codes(PLAN("furniture wardrobe against wall fresh side left size 1200x600", fresh))).toEqual([]);
  });

  it("`against wall <category>` names only the walls that stay", () => {
    // The only partition is coming out: refused.
    expect(codes(PLAN("furniture wardrobe against wall partition side left size 1200x600"))).toEqual([
      "E_FURN_AGAINST_DEMOLISHED_WALL",
    ]);
    // With one standing partition beside it, the category names that one (no "matches 2 walls").
    const other = `  wall id=keep partition thickness 100 { (6000,0) (6000,5000) }\n`;
    const src = PLAN("furniture id=wr wardrobe against wall partition side left size 1200x600", other);
    expect(codes(src)).toEqual([]);
    const at = (s: string) => (resolvePlan(s).ir!.elements.find((e) => e.id === "wr") as { at: unknown }).at;
    expect(at(src)).toEqual(at(src.replace("against wall partition", "against wall keep")));
  });

  it("`against <room>.<edge>` where the demolished wall is the only wall on the edge is refused", () => {
    expect(codes(PLAN("furniture desk against a.right size 1200x600"))).toEqual(["E_FURN_AGAINST_DEMOLISHED_WALL"]);
    // A standing wall on the same line backs it, as an edge with that wall alone does.
    const fresh = `  wall id=fresh partition thickness 100 status new { (4000,0) (4000,5000) }\n`;
    const both = PLAN("furniture id=dk desk against a.right size 1200x600", fresh);
    const alone = plan(`${SHELL}\n${fresh}${ROOMS}\n  furniture id=dk desk against a.right size 1200x600`);
    expect(codes(both)).toEqual([]);
    const at = (src: string) => (resolvePlan(src).ir!.elements.find((e) => e.id === "dk") as { at: unknown }).at;
    expect(at(both)).toEqual(at(alone));
  });

  it("a demolished wall BESIDE the edge line (within the tolerance) is ignored, as if deleted", () => {
    // Red-team round 1: the near-line scan admits walls within 300 mm of the edge; one at x 4200
    // beside `a.right` (x 4000) is not on the edge and must not be blamed.
    const beside = `  wall id=p partition thickness 100 status demolish { (4200,0) (4200,5000) }\n`;
    const piece = "furniture id=dk desk against a.right size 1200x600";
    const marked = plan(`${SHELL}\n${beside}${ROOMS}\n  ${piece}`);
    const deleted = plan(`${SHELL}\n${ROOMS}\n  ${piece}`);
    const diags = (src: string) => compile(src).diagnostics.map((d) => [d.code, d.message]);
    expect(diags(marked)).toEqual(diags(deleted));
    const dk = (src: string) => resolvePlan(src).ir!.elements.find((e) => e.id === "dk") as RFurnitureLike;
    expect(dk(marked)).toBeDefined();
    expect({ at: dk(marked).at, size: dk(marked).size, rotate: dk(marked).rotate }).toEqual({
      at: dk(deleted).at,
      size: dk(deleted).size,
      rotate: dk(deleted).rotate,
    });
    expect(dk(deleted).at).toEqual({ x: 3400, y: 1900 });
  });

  it("inside a `place`d component, by the component's own wall id", () => {
    const src = plan(`${SHELL}
  component bay() {
    wall id=p partition thickness 100 status demolish { (2000,0) (2000,5000) }
    room id=r at (0,0) size 2000x5000
    furniture wardrobe against wall p size 1200x600 in r
  }
  place bay() as k at (0,0)`);
    const d = compile(src).diagnostics.filter((x) => x.code === "E_FURN_AGAINST_DEMOLISHED_WALL");
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toBe(
      "A piece of furniture backs onto the partition at x 2000, which is marked `status demolish`: a demolished wall holds nothing",
    );
    expect(codes(src.replace(" status demolish", "")).filter((c) => c?.startsWith("E_"))).toEqual([]);
  });
});

suite("A9: what resolves against a wall reads the walls that stand", () => {
  const part = (status: string) => `  wall id=part partition thickness 100${status} { (4000,0) (4000,5000) }\n`;
  /** The plan with the partition standing (""), demolished, or deleted (null). */
  const PLAN = (status: string | null, furniture: string) =>
    plan(`${SHELL}\n${status === null ? "" : part(status)}${ROOMS}\n  ${furniture}`);
  const piece = (src: string) => {
    const f = resolvePlan(src).ir!.elements.find((e) => e.id === "wr") as RFurnitureLike;
    return { at: f.at, size: f.size, rotate: f.rotate };
  };

  it("the by-id refusal points at the wall reference, not the whole statement", () => {
    for (const [furniture, word] of [
      ["furniture id=wr wardrobe against wall part side left size 1200x600", "part"],
      ["furniture id=wr wardrobe against wall partition side left size 1200x600", "partition"],
    ] as const) {
      const src = PLAN(" status demolish", furniture);
      const [d] = compile(src).diagnostics;
      expect(d?.code).toBe("E_FURN_AGAINST_DEMOLISHED_WALL");
      expect(src.slice(d!.span!.start, d!.span!.end)).toBe(word);
      expect(d!.span!.start).toBe(src.indexOf(`against wall ${word}`) + "against wall ".length);
    }
    // The by-edge refusal keeps the span of its `against <room>.<edge>` clause.
    const edge = PLAN(" status demolish", "furniture id=wr desk against a.right size 1200x600");
    const [e] = compile(edge).diagnostics;
    expect(edge.slice(e!.span!.start, e!.span!.end)).toBe("against a.right");
  });

  it("`anchor … flush` on an edge whose only wall is demolished measures from the room edge", () => {
    const f = "furniture id=wr sofa in a anchor right flush size 900x2000";
    expect(piece(PLAN(" status demolish", f))).toEqual(piece(PLAN(null, f)));
    expect(piece(PLAN(" status demolish", f)).at).toEqual({ x: 3100, y: 1500 });
    // Standing (or new), the partition's face is 50 mm in.
    expect(piece(PLAN("", f)).at).toEqual({ x: 3050, y: 1500 });
    expect(piece(PLAN(" status new", f))).toEqual(piece(PLAN("", f)));
  });

  it("the turn an anchor derives reads no demolished wall", () => {
    const f = "furniture id=wr bed in a anchor right size 2000x1600";
    expect(piece(PLAN("", f)).rotate).toBe(90);
    expect(piece(PLAN(" status demolish", f))).toEqual(piece(PLAN(null, f)));
    expect(piece(PLAN(" status demolish", f)).rotate).toBeUndefined();
  });

  const OLD = `  wall id=shell exterior thickness 200 status demolish { (0,0) (8000,0) (8000,5000) (0,5000) close }`;
  const NEW = `  wall id=ext exterior thickness 200 status new { (0,0) (9000,0) (9000,5000) (0,5000) close }`;
  const roofPlan = (walls: string, roof: string) => plan(`${walls}\n  room id=a at (0,0) size 8000x5000\n  ${roof}`);
  const roofNode = (src: string) => {
    const r = resolvePlan(src).ir!.elements.find((e) => e.kind === "roof") as RRoof | undefined;
    return r ? { ring: r.ring, follows: r._follows } : undefined;
  };

  it("`roof overhang` follows the closed exterior wall that stays, not a demolished one", () => {
    const both = roofPlan(`${OLD}\n${NEW}`, "roof overhang 600");
    expect(compile(both).diagnostics).toEqual([]);
    // The ring it follows is the new one's: the same roof as naming it, or as the plan without the old shell.
    expect(roofNode(both)).toEqual(roofNode(roofPlan(`${OLD}\n${NEW}`, "roof overhang 600 wall ext")));
    expect(roofNode(both)).toEqual(roofNode(roofPlan(NEW, "roof overhang 600")));
    expect(roofNode(both)?.follows).toBe("ext");
    // With the old shell standing, the two rings are ambiguous, as they always were.
    const standing = roofPlan(`${OLD.replace(" status demolish", "")}\n${NEW}`, "roof overhang 600");
    expect(compile(standing).diagnostics.map((d) => d.code)).toEqual(["E_ROOF_AMBIGUOUS"]);
  });

  it("a roof over a demolished ring is refused: by id E_ROOF_WALL, as the only ring E_ROOF_AMBIGUOUS", () => {
    const named = compile(roofPlan(`${OLD}\n${NEW}`, "roof overhang 600 wall shell")).diagnostics;
    expect(named.map((d) => d.code)).toEqual(["E_ROOF_WALL"]);
    expect(named[0]!.message).toContain("marked `status demolish`");
    const only = compile(roofPlan(OLD, "roof overhang 600")).diagnostics;
    expect(only.map((d) => d.code)).toEqual(["E_ROOF_AMBIGUOUS"]);
    expect(only[0]!.message).toContain("no closed `exterior` wall that stays");
    // The same plans with the shell standing roof it as before.
    expect(compile(roofPlan(OLD.replace(" status demolish", ""), "roof overhang 600")).diagnostics).toEqual([]);
  });
});

suite("G8: the derived rail, `dim faces|clear`, and category references read the walls that stand", () => {
  // Each probe is a plan with a demolished wall against the same plan with that wall deleted
  // (the A9 / B3a law). The twin is compared on every non-wall element and on the diagnostics.
  const GONE = " status demolish";
  const body = (wall: string, rest: string) =>
    plan(`${SHELL}\n  room id=a at (0,0) size 8000x5000 label "Hall" uses hall\n${wall}\n${rest}`);
  const noSpans = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (/span$/i.test(k) ? undefined : v)));
  const facts = (src: string) => ({
    diags: noSpans(compile(src).diagnostics.map((d) => [d.code, d.message])),
    elements: noSpans((resolvePlan(src).ir?.elements ?? []).filter((e) => e.kind !== "wall")),
  });
  const twin = (wall: string, rest: string) => {
    const marked = facts(body(wall.replace("{", `${GONE.trim()} {`), rest));
    const deleted = facts(body("", rest));
    return { marked, deleted };
  };

  it("a balcony beside a demolished wall rails the edge, as beside no wall", () => {
    const wall = "  wall id=gone partition thickness 100 { (6000,500) (6000,3500) }";
    const rest = "  outdoor id=b balcony at (6000,1000) size 1500x2000";
    const { marked, deleted } = twin(wall, rest);
    expect(marked).toEqual(deleted);
    const rail = (src: string) => describePlan(src).outdoor?.[0]?.rail;
    expect(rail(body(wall.replace("{", `${GONE.trim()} {`), rest))).toEqual(["top", "bottom", "left", "right"]);
    // The same wall standing does take its edge's railing.
    expect(rail(body(wall, rest))).toEqual(["top", "bottom", "right"]);
  });

  it("`dim faces` and `dim clear` do not measure to a demolished face: W_DIM_NO_WALL, as the twin", () => {
    const wall = "  wall id=gone partition thickness 100 { (4000,0) (4000,5000) }";
    for (const mode of ["faces", "clear"]) {
      const rest = `  dim ${mode} (0,2500)->(4000,2500) offset 600`;
      const { marked, deleted } = twin(wall, rest);
      expect(marked).toEqual(deleted);
      expect(marked.diags.map((d: string[]) => d[0])).toContain("W_DIM_NO_WALL");
      // Standing, the wall is measured to (no warning).
      expect(facts(body(wall, rest)).diags.map((d: string[]) => d[0])).not.toContain("W_DIM_NO_WALL");
    }
  });

  it("a category reference names the standing walls: one demolished and one standing partition is one", () => {
    const gone = "  wall id=gone partition thickness 100 { (3000,0) (3000,5000) }";
    const keep = "  wall id=keep partition thickness 100 { (6000,0) (6000,5000) }";
    const rest = "  door id=d on partition at 50% width 900";
    const marked = facts(body(`${gone.replace("{", `${GONE.trim()} {`)}\n${keep}`, rest));
    const deleted = facts(body(keep, rest));
    expect(marked.diags).toEqual([]);
    expect(marked).toEqual(deleted);
    // Two standing partitions are still ambiguous.
    expect(facts(body(`${gone}\n${keep}`, rest)).diags.map((d: string[]) => d[0])).toEqual(["E_ATTACH_WALL_REF"]);
    // Only demolished ones: the wall is on the sheet, so the honest error names it.
    const alone = facts(body(gone.replace("{", `${GONE.trim()} {`), rest));
    expect(alone.diags.map((d: string[]) => d[0])).toEqual(["E_OPENING_ON_DEMOLISHED_WALL"]);
  });

  it("a demolished wall whose id is the category's name leaves the category unambiguous", () => {
    const gone = `  wall id=partition partition thickness 100${GONE} { (3000,0) (3000,5000) }`;
    const keep = "  wall id=keep partition thickness 100 { (6000,0) (6000,5000) }";
    const rest = "  door id=d on partition at 50% width 900";
    expect(facts(body(`${gone}\n${keep}`, rest))).toEqual(facts(body(keep, rest)));
  });

  it("a balcony beside `walls from rooms … status demolish` is railed by the second pass too", () => {
    const rooms = (st: string) => `plan "T" {
  units mm
  grid 100
  room id=a at (0,0) size 4000x4000 label "A" uses living
  room id=b at (4000,0) size 4000x4000 label "B" uses bedroom
  walls from rooms exterior 200 partition 100${st}
  outdoor id=o balcony at (8000,1000) size 1500x2000
}`;
    const rail = (src: string) => describePlan(src).outdoor?.[0]?.rail;
    expect(rail(rooms(""))).toEqual(["top", "bottom", "right"]);
    expect(rail(rooms(GONE))).toEqual(["top", "bottom", "left", "right"]);
  });

  it("the copy of the wall list is charged to the step meter; nothing demolished pays nothing", () => {
    const walls = [{ status: "demolish" }, {}, {}];
    const run = withStepMeter(0, () => standingWalls(walls));
    expect(run.used).toBe(3);
    expect(run).toMatchObject({ value: [{}, {}] });
    const none = [{}, {}];
    expect(withStepMeter(0, () => standingWalls(none))).toEqual({ value: none, used: 0 });
    expect("signal" in withStepMeter(MAX_EVAL_STEPS - 2, () => standingWalls(walls))).toBe(true);
  });

  it("a door written on a demolished wall's own id is still E_OPENING_ON_DEMOLISHED_WALL", () => {
    const wall = `  wall id=gone partition thickness 100${GONE} { (3000,0) (3000,5000) }`;
    const codes = compile(body(wall, "  door id=d on gone at 50% width 900")).diagnostics.map((d) => d.code);
    expect(codes).toContain("E_OPENING_ON_DEMOLISHED_WALL");
  });

  it("`dim radius <category>` names the standing arc wall, not the demolished one", () => {
    const arc = (id: string, x: number, st: string) =>
      `  wall id=${id} partition thickness 100${st} { (${x},1000) arc (${x + 2000},1000) radius 1000 }`;
    const rest = "  dim radius partition";
    const marked = facts(body(`${arc("gone", 1000, GONE)}\n${arc("keep", 4000, "")}`, rest));
    const deleted = facts(body(arc("keep", 4000, ""), rest));
    expect(marked.diags).toEqual(deleted.diags);
    expect(marked.diags.map((d: string[]) => d[0])).not.toContain("E_DIM_REF");
    expect(marked).toEqual(deleted);
    // Only demolished, by category or by id: refused, and the message does not deny the wall.
    for (const ref of ["partition", "gone"]) {
      const alone = facts(body(arc("gone", 1000, GONE), `  dim radius ${ref}`));
      expect(alone.diags).toEqual([
        [
          "E_DIM_CURVE_REF",
          `\`dim radius ${ref}\` names a wall marked \`status demolish\`, and a wall coming out has no arc to measure`,
        ],
      ]);
    }
  });
});
