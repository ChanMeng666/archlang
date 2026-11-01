import { readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe as suite, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import type { LevelNode } from "../src/ast.js";
import { codesOf, STRICTER_PROFILES } from "../src/finish.js";
import { type FurnishCodes, furnishCheckBound, furnishStage, gainedCodes, NOT_GATED_DRAFTING } from "../src/furnish.js";
import { rectsOverlap } from "../src/geometry/rect.js";
import { compile, finish, lint } from "../src/index.js";
import type { RFurniture, RRoom } from "../src/ir.js";
import { parse } from "../src/parser.js";
import type { World } from "../src/world.js";

/**
 * `finish()` on a plan of `level` blocks (issue #364, part 2). Each storey is furnished as a
 * single-storey plan would be, in its own block, read with the building it stands in, and judged
 * on its own. The laws of the stage itself are in `test/finish-furnish.test.ts`; the sweep that
 * says a single-storey plan's bytes did not move is the digest table there.
 */

const EXAMPLES = resolvePath("examples");
const world: World = {
  read: (p) => {
    try {
      return readFileSync(resolvePath(EXAMPLES, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
};
const MULTI = readdirSync(EXAMPLES)
  .filter((f) => f.endsWith(".arch"))
  .map((f) => f.slice(0, -".arch".length))
  .filter((n) => /^\s*level -?\d/m.test(readFileSync(join(EXAMPLES, `${n}.arch`), "utf8")))
  .sort();
const srcOf = (name: string): string => readFileSync(join(EXAMPLES, `${name}.arch`), "utf8");

const furnish = (src: string, w?: World) => finish(src, { only: "furnish", ...(w ? { world: w } : {}) });
const errorsOf = (src: string, w?: World): string[] =>
  compile(src, { noCache: true, ...(w ? { world: w } : {}) })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => `${d.code}: ${d.message}`);

/** The authored source of each level block, by level number. */
function blocks(src: string): Map<number, string> {
  const { plan } = parse(src);
  const nodes = (plan?.body ?? []).filter((s): s is LevelNode => s.kind === "level");
  return new Map(nodes.map((l) => [l.level, src.slice(l.span!.start, l.span!.end)]));
}
const linesIn = (src: string, level: number): string[] =>
  (blocks(src).get(level) ?? "").split(/\r?\n/).filter((l) => /^\s*furniture /.test(l));

/** A storey's resolved rooms and furniture. */
function storey(src: string, level: number, w?: World): { rooms: RRoom[]; pieces: RFurniture[] } {
  const ir = resolvePlan(src, w ? { world: w } : {}).levels.find((l) => l.level === level)!.ir;
  return {
    rooms: ir.elements.filter((e): e is RRoom => e.kind === "room"),
    pieces: ir.elements.filter((e): e is RFurniture => e.kind === "furniture"),
  };
}
const rectOf = (e: { at: { x: number; y: number }; size: { w: number; h: number } }) => ({
  x: e.at.x,
  y: e.at.y,
  w: e.size.w,
  h: e.size.h,
});

/** Codes per storey, under the default ruleset and each universal profile. */
function perStorey(src: string, w?: World): Map<string, Map<string, number>> {
  const env = w ? { world: w } : {};
  const out = new Map<string, Map<string, number>>();
  const add = (ruleset: string, ds: ReadonlyArray<{ code?: string; level?: number }>): void => {
    for (const d of ds) {
      const key = `${ruleset}|${d.level ?? ""}`;
      const m = out.get(key) ?? new Map<string, number>();
      out.set(key, m);
      m.set(d.code ?? "", (m.get(d.code ?? "") ?? 0) + 1);
    }
  };
  add("", [...compile(src, { ...env, noCache: true }).diagnostics, ...lint(src, env)]);
  for (const profile of STRICTER_PROFILES) add(profile, lint(src, { ...env, profile }));
  return out;
}
/** What `after` gained over `before` on any one storey, the codes the law exempts aside. */
function gainedPerStorey(before: string, after: string, w?: World): string[] {
  const was = perStorey(before, w);
  const out: string[] = [];
  for (const [key, now] of perStorey(after, w))
    for (const [code, n] of now)
      if (!NOT_GATED_DRAFTING.has(code) && code !== "W_ROOM_MISSING_DEFINING" && n > (was.get(key)?.get(code) ?? 0))
        out.push(`${key} ${code}`);
  return out;
}

/** The issue's plan, verbatim. */
const ISSUE = `plan "Two storeys, unfurnished" {
  units mm
  level 0 "Ground" {
    room id=liv at (0,0) size 5000x4000 label "Living" uses living
    walls from rooms exterior 300 partition 100
    door on liv.bottom at 2500 from start width 1000 swing into liv
    window on liv.top width 2000
  }
  level 1 "Upper" {
    room id=bed at (0,0) size 5000x4000 label "Bedroom" uses bedroom
    walls from rooms exterior 300 partition 100
    window on bed.top width 1500
  }
}
`;

/** One room per storey, the same size, written by hand so a piece's position is easy to read. */
const shell = (level: number, room: string, use: string, extra: string, door = false): string => `  level ${level} {
    room id=${room} at (0,0) size 6000x5000 label "${use}" uses ${use}
    walls from rooms exterior 300 partition 100
${door ? `    door on ${room}.bottom at 1500 from start width 1000 swing into ${room}\n` : ""}    window on ${room}.top width 1500
${extra}  }
`;
const two = (lower: string, upper: string): string => `plan "Two" {\n  units mm\n${lower}${upper}}\n`;

suite("finish on `level` blocks — the issue's plans", () => {
  it("furnishes each storey as a single-storey plan would be, inside its own block", () => {
    const r = furnish(ISSUE);
    expect(r.changed).toBe(true);
    expect(linesIn(r.source, 0)).toEqual(["    furniture sofa in liv anchor right flush size 900x2000 rotate 90"]);
    expect(linesIn(r.source, 1).map((l) => l.trim().split(" ")[1])).toEqual(["bed", "wardrobe"]);
    expect(errorsOf(r.source)).toEqual([]);
    expect(gainedPerStorey(ISSUE, r.source)).toEqual([]);
  });

  it("writes on a storey what the same storey alone is given as a single-storey plan", () => {
    const alone = (level: number): string => {
      const block = blocks(ISSUE).get(level)!;
      const body = block
        .slice(block.indexOf("{") + 2, block.lastIndexOf("}"))
        .replace(/^ {4}/gm, "  ")
        .trimEnd();
      return `plan "One" {\n  units mm\n${body}\n}\n`;
    };
    const r = furnish(ISSUE);
    for (const level of [0, 1])
      expect(linesIn(r.source, level).map((l) => l.trim())).toEqual(furnish(alone(level)).changes.map((c) => c.text));
  });

  it("is a fixpoint, and a full run writes the sheet too", () => {
    const r = finish(ISSUE);
    expect(finish(r.source).source).toBe(r.source);
    expect(finish(r.source).changed).toBe(false);
    expect(new Set(r.changes.map((c) => c.stage))).toEqual(new Set(["furnish", "sheet"]));
    expect(r.changes.map((c) => c.stage).join(" ")).toMatch(/^(furnish )+sheet( sheet)*$/);
    expect(linesIn(r.source, 1)).toHaveLength(2);
    expect(gainedPerStorey(ISSUE, r.source)).toEqual([]);
  });

  it("the workaround's root plan, whose rooms are all placed, stays as it is, and says what to do", () => {
    const module0 = `plan "EG" {
  units mm
  room id=liv at (0,0) size 5000x4000 label "Living" uses living
  walls from rooms exterior 300 partition 100
  door on liv.bottom at 1000 from start width 1000 swing into liv
  window on liv.top width 2000
}
`;
    const module1 = `plan "OG" {
  units mm
  room id=bed at (0,0) size 5000x4000 label "Bedroom" uses bedroom
  walls from rooms exterior 300 partition 100
  window on bed.top width 1500
}
`;
    const files = new Map([
      ["eg.arch", module0],
      ["og.arch", module1],
    ]);
    const w: World = { read: (p) => files.get(p) ?? null, now: () => new Date(0) };
    const root = `plan "Two storeys via per-storey files" {
  units mm
  import "eg.arch" as eg
  import "og.arch" as og
  level 0 "Ground" { place eg() as h at (0,0) }
  level 1 "Upper"  { place og() as h at (0,0) }
}
`;
    const r = furnish(root, w);
    expect(r.changed).toBe(false);
    expect(r.source).toBe(root);
    expect(r.unresolved.map((u) => [u.room, u.level])).toEqual([
      ["h.liv", 0],
      ["h.bed", 1],
    ]);
    expect(r.unresolved[0]!.reason).toBe(
      '"h.liv" (level 0) was not furnished — it belongs to a placed component instance, which finish leaves to you: furnish the component, or write `furniture … in h.liv` in its `level` block',
    );
  });
});

suite("finish on `level` blocks — the floor a piece stands on", () => {
  const up = "    stair id=s1 at (4700,1500) size 1000x3000 dir up\n";
  const down = "    stair id=s1 at (4700,1500) size 1000x3000 dir down\n";
  const onStair = (src: string): string[] =>
    lint(src)
      .filter((d) => d.code === "W_FURNITURE_ON_STAIR")
      .map((d) => d.message);

  it("a shaft: no piece stands in the stairwell or on the landing, on either storey", () => {
    const src = two(shell(0, "liv", "living", up, true), shell(1, "bed", "bedroom", down));
    expect(errorsOf(src)).toEqual([]);
    const r = furnish(src);
    expect(r.changes.length).toBeGreaterThan(1);
    expect(onStair(r.source)).toEqual([]);
    const well = { x: 4700, y: 1500, w: 1000, h: 3000 };
    const head = { x: 4700, y: 500, w: 1000, h: 1000 }; // `dir down` is entered at the far end
    const foot = { x: 4700, y: 4500, w: 1000, h: 1000 };
    for (const f of storey(r.source, 1).pieces) {
      expect(rectsOverlap(rectOf(f), well), f.id).toBe(false);
      expect(rectsOverlap(rectOf(f), head), f.id).toBe(false);
    }
    for (const f of storey(r.source, 0).pieces) {
      expect(rectsOverlap(rectOf(f), well), f.id).toBe(false);
      expect(rectsOverlap(rectOf(f), foot), f.id).toBe(false);
    }
  });

  /**
   * A flight arrives on level 1 by its head, and the shaft leaves from elsewhere (`townhouse`'s
   * middle storey): the head is owed on level 1, and only the building says so. The head's landing
   * lies on the corner a bed would take first. Read as a storey alone the stage proposes it and the
   * gate refuses it; read with the building it is never proposed, so the room costs one check.
   */
  it("a shaft's arriving head, read on the lower flight's footprint, is never proposed", () => {
    const arrive = `    stair id=s1 at (2300,3500) size 3000x1000 dir up\n`;
    const leave = `    stair id=s1 at (2300,600) size 3000x1000 dir up\n`;
    const top = `    stair id=s1 at (2300,600) size 3000x1000 dir down\n`;
    const three = (extra: string): string =>
      `plan "Three" {\n  units mm\n${shell(0, "liv", "storage", arrive, true)}${shell(1, "bed", "bedroom", leave + extra)}${shell(2, "den", "storage", top)}}\n`;
    const src = three("");
    expect(errorsOf(src)).toEqual([]);
    // The control: that corner is on the landing, by the lint's own reading.
    const corner = "    furniture bed in bed anchor bottom-left flush size 1500x2000 rotate 180\n";
    expect(lint(three(corner)).filter((d) => d.code === "W_FURNITURE_ON_STAIR" && d.level === 1)).toHaveLength(1);
    const r = furnishStage(src, {}, (s) => codesOf(s, {}, new Map()));
    expect(r.changed).toBe(true);
    expect(onStair(r.source)).toEqual([]);
    expect(r.rooms).toBe(1);
    expect(r.checks).toBe(1);
  });

  it("a flight from the storey below with no stop here still comes through this floor", () => {
    // Where the wardrobe stands with nothing below it: the control that shows the flight moved it.
    const bare = two(shell(0, "liv", "living", "", true), shell(1, "bed", "bedroom", ""));
    const taken = furnish(bare);
    const piece = storey(taken.source, 1).pieces[0]!;
    const rise = `    stair id=gone at (${piece.at.x + 100},${piece.at.y}) size 1000x2000 dir up\n`;
    const src = two(shell(0, "liv", "living", rise, true), shell(1, "bed", "bedroom", ""));
    expect(errorsOf(src)).toEqual([]);
    const flight = { x: piece.at.x + 100, y: piece.at.y, w: 1000, h: 2000 };
    expect(rectsOverlap(rectOf(piece), flight)).toBe(true);
    const r = furnish(src);
    for (const f of storey(r.source, 1).pieces) expect(rectsOverlap(rectOf(f), flight), f.id).toBe(false);
  });

  it("a flight coming down from the storey above with no stop here lands on this floor", () => {
    const bare = two(shell(0, "liv", "living", "", true), shell(1, "bed", "bedroom", ""));
    const piece = storey(furnish(bare).source, 0).pieces[0]!;
    const flight = { x: piece.at.x + 100, y: piece.at.y, w: 700, h: 2000 };
    const fall = `    stair id=gone at (${flight.x},${flight.y}) size ${flight.w}x${flight.h} dir down\n`;
    const src = two(shell(0, "liv", "living", "", true), shell(1, "bed", "bedroom", fall));
    expect(errorsOf(src)).toEqual([]);
    expect(rectsOverlap(rectOf(piece), flight)).toBe(true);
    const r = furnish(src);
    for (const f of storey(r.source, 0).pieces) expect(rectsOverlap(rectOf(f), flight), f.id).toBe(false);
  });

  it("a `void` is a hole in its own storey's floor, and only there", () => {
    const bare = two(shell(0, "liv", "living", "", true), shell(1, "bed", "bedroom", ""));
    const lower = storey(furnish(bare).source, 0).pieces[0]!;
    const hole = (p: RFurniture): string => `    void id=v at (${p.at.x},${p.at.y}) size ${p.size.w}x${p.size.h}\n`;

    // On the storey being furnished: the piece moves off it.
    const here = two(shell(0, "liv", "living", hole(lower), true), shell(1, "bed", "bedroom", ""));
    expect(errorsOf(here)).toEqual([]);
    for (const f of storey(furnish(here).source, 0).pieces)
      expect(rectsOverlap(rectOf(f), rectOf(lower)), f.id).toBe(false);

    // On the storey above: double height here, with this storey's floor whole.
    const above = two(shell(0, "liv", "living", "", true), shell(1, "bed", "bedroom", hole(lower)));
    expect(errorsOf(above)).toEqual([]);
    expect(linesIn(furnish(above).source, 0)).toEqual(linesIn(furnish(bare).source, 0));

    // And the storey below's hole takes nothing from the floor above it.
    const upper = storey(furnish(bare).source, 1).pieces[0]!;
    const below = two(shell(0, "liv", "living", hole(upper), true), shell(1, "bed", "bedroom", ""));
    expect(linesIn(furnish(below).source, 1)).toEqual(linesIn(furnish(bare).source, 1));
  });

  it("a lift or an escalator on this storey is floor no piece stands on", () => {
    const bare = two(shell(0, "liv", "living", "", true), shell(1, "bed", "bedroom", ""));
    const piece = storey(furnish(bare).source, 0).pieces[0]!;
    for (const run of [
      `    elevator id=l at (${piece.at.x},${piece.at.y}) size 900x1500\n`,
      `    escalator id=l at (${piece.at.x},${piece.at.y}) size 900x1500 dir up\n`,
    ]) {
      const src = two(shell(0, "liv", "living", run, true), shell(1, "bed", "bedroom", run));
      expect(errorsOf(src)).toEqual([]);
      const r = furnish(src);
      const shaft = { x: piece.at.x, y: piece.at.y, w: 900, h: 1500 };
      for (const f of storey(r.source, 0).pieces) expect(rectsOverlap(rectOf(f), shaft), f.id).toBe(false);
    }
  });

  it("a room with no position left says what took its floor, with its storey", () => {
    const hole = "    void id=v at (150,150) size 5700x4700\n";
    const src = two(shell(0, "liv", "living", "", true), shell(1, "bed", "bedroom", hole));
    expect(errorsOf(src)).toEqual([]);
    const r = furnish(src);
    expect(linesIn(r.source, 1)).toEqual([]);
    expect(r.unresolved.filter((u) => u.level === 1).map((u) => u.reason)).toEqual([
      'no position for the required `bed` in "bed" (level 1) clears its walls, its doors, the voids and shafts on its floor and the pieces before it — the room was left empty',
    ]);
  });
});

suite("finish on `level` blocks — the same id on several levels", () => {
  /** Rooms named alike at different places; walls named alike; a stair on both. */
  const SAME = `plan "Same ids" {
  units mm
  level 1 "Upper, written first" {
    wall id=shell exterior thickness 200 { (2000,0) (7000,0) (7000,4000) (2000,4000) close }
    room id=r at (2000,0) size 5000x4000 label "Kitchen" uses kitchen
    window on shell at 20% width 900
    stair id=s at (5500,2000) size 1000x1800 dir down
  }
  level 0 "Ground" {
    wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
    room id=r at (0,0) size 5000x4000 label "Bedroom" uses bedroom
    door on shell at 60% width 1000 swing in
    window on shell at 20% width 900
    stair id=s at (3500,2000) size 1000x1800 dir up
  }
}
`;

  it("a piece goes in its own block, and `in r` there means that storey's room", () => {
    expect(errorsOf(SAME)).toEqual([]);
    const r = furnish(SAME);
    expect(r.changed).toBe(true);
    const kitchen = r.changes.filter((c) => c.level === 1).map((c) => c.text);
    const bedroom = r.changes.filter((c) => c.level === 0).map((c) => c.text);
    expect(kitchen.length).toBeGreaterThan(0);
    expect(bedroom.length).toBeGreaterThan(0);
    expect(linesIn(r.source, 1).map((l) => l.trim())).toEqual(kitchen);
    expect(linesIn(r.source, 0).map((l) => l.trim())).toEqual(bedroom);
    for (const level of [0, 1]) {
      const { rooms, pieces } = storey(r.source, level);
      const box = rectOf(rooms[0]!);
      for (const f of pieces) {
        expect(f.room).toBe("r");
        expect(f.at.x).toBeGreaterThanOrEqual(box.x);
        expect(f.at.x + f.size.w).toBeLessThanOrEqual(box.x + box.w);
      }
    }
    expect(lint(r.source).filter((d) => d.code === "W_FIXTURE_WRONG_ROOM")).toEqual([]);
  });

  it("each change names its storey, and its span is in that storey's block of the caller's source", () => {
    for (const only of ["furnish", undefined] as const) {
      const r = finish(SAME, only ? { only } : {});
      const { plan } = parse(SAME);
      const span = (level: number) =>
        plan!.body.find((s): s is LevelNode => s.kind === "level" && s.level === level)!.span!;
      for (const c of r.changes.filter((x) => x.stage === "furnish")) {
        expect(c.level, c.text).toBeDefined();
        const b = span(c.level!);
        expect(c.span.start).toBeGreaterThan(b.start);
        expect(c.span.end).toBeLessThan(b.end);
      }
    }
  });

  it("a room with the same id left empty on one storey and furnished on the other is told apart", () => {
    const src = SAME.replace(`label "Kitchen" uses kitchen`, `label "Store" uses storage`);
    const r = furnish(src);
    expect(new Set(r.changes.map((c) => c.level))).toEqual(new Set([0]));
    expect(r.unresolved.filter((u) => u.room === "r").map((u) => u.level)).toEqual([1]);
    expect(r.unresolved[0]!.reason).toContain('"r" (level 1) is outside the furnish table');
  });

  it("a single-storey plan's changes and notes carry no `level` key", () => {
    const flat = `plan "One" {
  units mm
  room id=a at (0,0) size 5000x4000 label "Bedroom" uses bedroom
  room id=b at (5000,0) size 2000x4000 label "Hall" uses hall
  walls from rooms exterior 300 partition 100
  door on b.bottom at center width 1000 swing into b
  door between a and b at center width 900 swing into a
  window on a.top width 1500
}
`;
    const r = furnish(flat);
    expect(r.changes.length).toBeGreaterThan(0);
    for (const entry of [...r.changes, ...r.unresolved]) expect(entry).not.toHaveProperty("level");
  });
});

suite("finish on `level` blocks — placed components", () => {
  const COMPONENT = `  component unit() {
    room id=hall at (0,0) size 2000x2000 label "Hall" uses hall
    room id=bed at (2000,0) size 3000x4000 label "Bedroom" uses bedroom
    walls from rooms exterior 200 partition 100
    door between hall and bed at center width 900 swing into bed
    door on hall.top at center width 1000 swing into hall
    window on bed.right width 1200
  }
`;
  const INSTANCE = `plan "Instance" {\n  units mm\n${COMPONENT}  place unit() as u1 at (0,0)\n}\n`;
  const LEVELS = `plan "Instance on a level" {
  units mm
${COMPONENT}  level 0 {
    place unit() as u1 at (0,0)
  }
  level 1 {
    place unit() as u1 at (0,0)
    wall id=sh exterior thickness 200 { (5000,0) (9000,0) (9000,4000) (5000,4000) close }
    room id=own at (5000,0) size 4000x4000 label "Study" uses office
    window on sh at 30% width 1200
  }
}
`;

  it("one truth: a statement in the plan body names an instance's room, and both notes say so", () => {
    const r = furnish(INSTANCE);
    expect(r.changed).toBe(false);
    const [bed, hall] = r.unresolved;
    expect(bed!.reason).toBe(
      '"u1.bed" was not furnished — it belongs to a placed component instance, which finish leaves to you: furnish the component, or write `furniture … in u1.bed` in the plan body',
    );
    expect(hall!.scope).toBe("outside-table");
    expect(hall!.reason).toContain("add furniture yourself");
    // The advice, pasted: it compiles, and the piece is in that room.
    for (const room of ["u1.bed", "u1.hall"]) {
      const pasted = INSTANCE.replace(
        "  place unit() as u1 at (0,0)\n",
        `  place unit() as u1 at (0,0)\n  furniture rug in ${room} anchor center size 800x600 rotate 0\n`,
      );
      expect(errorsOf(pasted)).toEqual([]);
      const piece = resolvePlan(pasted).ir!.elements.find((e): e is RFurniture => e.kind === "furniture")!;
      expect(piece.room).toBe(room);
    }
  });

  it("a partly furnished instance room gets the same advice", () => {
    const src = INSTANCE.replace(
      `    window on bed.right width 1200\n`,
      `    window on bed.right width 1200\n    furniture rug in bed anchor center size 800x600 rotate 0\n`,
    );
    expect(furnish(src).unresolved[0]!.reason).toBe(
      '"u1.bed" holds furniture but not every piece its use requires — bedroom: `bed` missing; it belongs to a placed component instance, which finish leaves to you: furnish the component, or write `furniture … in u1.bed` in the plan body',
    );
  });

  it("on a level the instance's rooms are reported, the block's own room is furnished in that block", () => {
    expect(errorsOf(LEVELS)).toEqual([]);
    const r = furnish(LEVELS);
    expect(r.changes.map((c) => [c.room, c.level])).toEqual(r.changes.map(() => ["own", 1]));
    expect(r.changes.length).toBeGreaterThan(0);
    expect(linesIn(r.source, 0)).toEqual([]);
    expect(linesIn(r.source, 1).length).toBe(r.changes.length);
    const notes = r.unresolved.filter((u) => u.room === "u1.bed");
    expect(notes.map((u) => u.level)).toEqual([0, 1]);
    expect(notes[1]!.reason).toContain("write `furniture … in u1.bed` in its `level` block");
    const pasted = LEVELS.replace(
      "    place unit() as u1 at (0,0)\n    wall id=sh",
      "    place unit() as u1 at (0,0)\n    furniture rug in u1.bed anchor center size 800x600 rotate 0\n    wall id=sh",
    );
    expect(errorsOf(pasted)).toEqual([]);
    expect(storey(pasted, 1).pieces.map((f) => f.room)).toEqual(["u1.bed"]);
    expect(storey(pasted, 0).pieces).toEqual([]);
  });
});

suite("finish on `level` blocks — what each storey holds", () => {
  const MIXED = `plan "Mixed" {
  units mm
  level 0 {
    wall id=w0 exterior thickness 200 { (0,0) (9000,0) (9000,4000) (0,4000) close }
    wall id=p0 partition thickness 100 { (3000,0) (3000,4000) }
    wall id=p1 partition thickness 100 { (6000,0) (6000,4000) }
    room id=a at (0,0) size 3000x4000 label "Hall" uses hall
    room id=b at (3000,0) size 3000x4000 label "Bedroom" uses bedroom
    room id=c at (6000,0) size 3000x4000 label "Spare" uses office
    door on w0 at 10% width 1000 swing in
    door on p0 at 1000 width 900 swing into b
    door on p1 at 1000 width 900 swing into c
    window on w0 at 60% width 1200
    furniture rug in c anchor center size 800x600 rotate 0
  }
  level 1 {
    wall id=w1 exterior thickness 200 { (0,0) (6000,0) (3000,5000) close }
    room id=l polygon (0,0) (6000,0) (3000,5000) label "Bedroom" uses bedroom
  }
  level 2 {
    wall id=w2 exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=d at (0,0) size 4000x4000 label "Bedroom" uses bedroom
    furniture bed in d anchor top-left flush size 1500x2000 rotate 0
    furniture wardrobe in d anchor bottom-right flush size 1800x600 rotate 180
  }
}
`;

  it("a storey is furnished beside rooms and storeys that are not, and each is reported with its level", () => {
    expect(errorsOf(MIXED)).toEqual([]);
    const r = furnish(MIXED);
    expect(new Set(r.changes.map((c) => [c.room, c.level].join("@")))).toEqual(new Set(["b@0"]));
    expect(linesIn(r.source, 0).filter((l) => l.includes("in b "))).toHaveLength(r.changes.length);
    const note = (room: string) => r.unresolved.find((u) => u.room === room);
    expect(note("l")!.reason).toContain('"l" (level 1) is a polygon room');
    expect(note("l")!.level).toBe(1);
    expect(note("c")!.reason).toContain('"c" (level 0) holds furniture but not every piece');
    expect(note("c")!.level).toBe(0);
    expect(note("a")!.scope).toBe("outside-table");
    expect(note("a")!.reason).toContain('"a" (level 0) is outside the furnish table');
    expect(note("d")).toBeUndefined();
    // A notes order that does not depend on the storeys: own, partly furnished, outside the table.
    expect(r.unresolved.map((u) => u.room)).toEqual(["l", "c", "a"]);
  });

  it("no note says the stage handles one storey", () => {
    for (const u of furnish(MIXED).unresolved) expect(u.reason).not.toContain("single-storey");
  });

  it("a storey whose rooms are all furnished gains nothing, and a plan of them is a byte no-op", () => {
    const r = furnish(MIXED);
    expect(linesIn(r.source, 2)).toEqual(linesIn(MIXED, 2));
    const done = MIXED.replace(/ {4}room id=b .*\n/, "$&    furniture rug in b anchor center size 800x600 rotate 0\n");
    expect(furnish(done).source).toBe(done);
    expect(furnish(done).changed).toBe(false);
  });

  it("a relational room on a level is reported as on a single-storey plan", () => {
    const src = two(
      shell(0, "a", "storage", '    room id=b right-of a size 3000x5000 label "Bedroom" uses bedroom\n', true),
      shell(1, "c", "storage", ""),
    );
    expect(errorsOf(src)).toEqual([]);
    const note = furnish(src).unresolved.find((u) => u.room === "b")!;
    expect(note.level).toBe(0);
    expect(note.reason).toContain('"b" (level 0) was not furnished — a relational room has no fixed `at`');
  });

  it("a plan that does not compile comes back untouched", () => {
    const broken = ISSUE.replace('size 5000x4000 label "Bedroom"', "size label");
    const r = furnish(broken);
    expect(r.source).toBe(broken);
    expect(r.changed).toBe(false);
  });
});

suite("finish on `level` blocks — where the statements are written", () => {
  it("after the block's last piece, or its last shell statement; never in a `for` of the block", () => {
    const src = ISSUE.replace(
      "    window on bed.top width 1500\n",
      "    for i in 0..0 {\n      window on bed.top width 1500\n    }\n",
    );
    expect(errorsOf(src)).toEqual([]);
    const r = furnish(src);
    expect(r.source).toContain("    walls from rooms exterior 300 partition 100\n    for i in 0..0 {");
    expect(linesIn(r.source, 1)).toHaveLength(2);
    const block = blocks(r.source).get(1)!;
    expect(block.indexOf("furniture bed")).toBeLessThan(block.indexOf("for i in"));
  });

  it("a block on one line is laid out, and the plan still compiles", () => {
    const src = `plan "One line" {
  units mm
  level 0 { wall id=w exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close } room id=a at (0,0) size 5000x4000 label "Bedroom" uses bedroom door on w at 40% width 900 swing in }
  level 1 { wall id=w exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close } room id=b at (0,0) size 5000x4000 label "Study" uses office }
}
`;
    expect(errorsOf(src)).toEqual([]);
    const r = furnish(src);
    expect(errorsOf(r.source)).toEqual([]);
    expect(r.changes.length).toBeGreaterThan(0);
    for (const c of r.changes) expect(blocks(r.source).get(c.level!)).toContain(c.text);
    expect(furnish(r.source).source).toBe(r.source);
    // The block's closing brace stands at the block's own indentation.
    expect(r.source).toMatch(/rotate \d+\n {2}\}\n {2}level 1/);
    expect(r.source).not.toMatch(/\n {3}\}/);
  });

  it("the closing brace of a one-line plan stays where a single-storey run always left it", () => {
    const src = `  plan "One line" { wall id=w exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close } room id=a at (0,0) size 5000x4000 label "Bedroom" uses bedroom door on w at 40% width 900 swing in }\n`;
    expect(errorsOf(src)).toEqual([]);
    const r = furnish(src);
    expect(r.changed).toBe(true);
    expect(r.source.endsWith("\n }\n")).toBe(true);
  });

  it("a file with CRLF line ends keeps them, and a block's own indentation", () => {
    const crlf = ISSUE.replaceAll("\n", "\r\n").replaceAll("    ", "\t\t");
    const r = furnish(crlf);
    expect(r.changed).toBe(true);
    expect(r.source.replaceAll("\r\n", "")).not.toContain("\n");
    expect(r.source).toContain("\r\n\t\tfurniture bed in bed anchor");
  });

  it("every authored byte survives: the result less the statements written is the source", () => {
    const r = furnish(ISSUE);
    const less = r.changes.reduce((s, c) => s.replace(`    ${c.text}\n`, ""), r.source);
    expect(less).toBe(ISSUE);
  });
});

suite("finish on `level` blocks — never worse, storey by storey", () => {
  const measure = (src: string): FurnishCodes => codesOf(src, {}, new Map());
  const measured = (
    storeys: Array<[string, Array<[string, number]>]>,
    whole: Array<[string, number]>,
  ): FurnishCodes => ({
    errors: false,
    codes: new Map(whole),
    profiles: new Map(),
    storeys: new Map(storeys.map(([k, v]) => [k, new Map(v)])),
  });

  it("a warning new on storey 1 is a gain, however much storey 0 improved", () => {
    const before = measured([["|0", [["W_X", 3]]]], [["W_X", 3]]);
    const after = measured(
      [
        ["|0", [["W_X", 1]]],
        ["|1", [["W_X", 2]]],
      ],
      [["W_X", 3]],
    );
    expect(gainedCodes(before, after)).toEqual(["W_X"]);
    const fair = measured(
      [
        ["|0", [["W_X", 1]]],
        ["|1", []],
      ],
      [["W_X", 1]],
    );
    expect(gainedCodes(before, fair)).toEqual([]);
  });

  it("each storey is held under each ruleset, and only a storey's own count is compared", () => {
    // A storey with nothing to report has no entry: the living room's window goes, so both do.
    const m = measure(ISSUE.replace("    window on liv.top width 2000\n", ""));
    expect([...(m.storeys?.keys() ?? [])].filter((k) => k.startsWith("|"))).toEqual(
      expect.arrayContaining(["|0", "|1"]),
    );
    for (const profile of STRICTER_PROFILES) {
      expect([...(m.storeys?.keys() ?? [])].some((k) => k.startsWith(`${profile}|`))).toBe(true);
      const before = { errors: false, codes: new Map(), storeys: new Map([[`${profile}|0`, new Map([["W_X", 1]])]]) };
      const after = {
        errors: false,
        codes: new Map(),
        storeys: new Map([
          [`${profile}|0`, new Map()],
          [`${profile}|1`, new Map([["W_X", 1]])],
        ]),
      };
      expect(gainedCodes(before, after)).toEqual(["W_X"]);
    }
  });

  it("a single-storey plan's measure has no storeys at all", () => {
    expect(
      measure(`plan "One" {\n  units mm\n  room id=a at (0,0) size 4000x4000 uses bedroom\n}\n`),
    ).not.toHaveProperty("storeys");
  });

  /**
   * The stage, with a planted code that moves between storeys: a bed on level 1 clears it on level 0
   * and raises it on level 1, so the plan's total does not move. The control drops the storeys from
   * the measure, and the same bed is kept: the storey-by-storey reading is what refused it.
   */
  it("the stage refuses a piece that moves a warning from storey 0 to storey 1", () => {
    const planted = (src: string, storeys: boolean): FurnishCodes => {
      const real = measure(src);
      const bed = src.includes("furniture bed");
      const at0 = new Map(real.storeys?.get("|0") ?? []);
      const at1 = new Map(real.storeys?.get("|1") ?? []);
      (bed ? at1 : at0).set("W_PLANTED", 1);
      const codes = new Map(real.codes);
      codes.set("W_PLANTED", 1);
      const all = new Map(real.storeys ?? []);
      all.set("|0", at0);
      all.set("|1", at1);
      return storeys ? { ...real, codes, storeys: all } : { ...real, codes, storeys: new Map() };
    };
    const held = furnishStage(ISSUE, {}, (s) => planted(s, true));
    expect(held.changes.some((c) => c.text.startsWith("furniture bed"))).toBe(false);
    const note = held.unresolved.find((u) => u.room === "bed")!;
    expect(note.level).toBe(1);
    expect(note.codes).toEqual(["W_PLANTED"]);
    const whole = furnishStage(ISSUE, {}, (s) => planted(s, false));
    expect(whole.changes.some((c) => c.text.startsWith("furniture bed"))).toBe(true);
    // Storey 0 is furnished either way: one storey's refusal costs another nothing.
    expect(held.changes.filter((c) => c.level === 0).length).toBeGreaterThan(0);
  });

  it("the compile checks of a run stay within the bound, counted over every storey", () => {
    for (const src of [ISSUE, ...MULTI.map(srcOf)]) {
      const r = furnishStage(src, { world }, (s) => codesOf(s, { world }, new Map()));
      expect(r.checks).toBeLessThanOrEqual(furnishCheckBound(r.rooms));
    }
  }, 300000);
});

suite("finish on `level` blocks — the shipped multi-storey examples", () => {
  it("the corpus reaches the path", () => {
    expect(MULTI.length).toBeGreaterThan(3);
  });

  for (const name of MULTI)
    it(`${name}: in its own blocks, a fixpoint, and no storey worse`, () => {
      const src = srcOf(name);
      const r = furnish(src, world);
      expect(errorsOf(r.source, world)).toEqual([]);
      expect(gainedPerStorey(src, r.source, world)).toEqual([]);
      const again = furnish(r.source, world);
      expect(again.source).toBe(r.source);
      expect(again.changed).toBe(false);
      for (const c of r.changes) {
        expect(c.level, c.text).toBeDefined();
        expect(blocks(r.source).get(c.level!)).toContain(c.text);
        expect(blocks(src).get(c.level!)).toBeDefined();
      }
      expect(lint(r.source, { world }).filter((d) => d.code === "W_FURNITURE_ON_STAIR").length).toBe(
        lint(src, { world }).filter((d) => d.code === "W_FURNITURE_ON_STAIR").length,
      );
      for (const c of r.changes) expect(c.text).not.toContain(" at (");
    }, 120000);
});

suite("finish on `level` blocks — generated storeys", () => {
  const room = fc.record({
    w: fc.integer({ min: 25, max: 50 }).map((n) => n * 100),
    use: fc.constantFrom("bedroom", "living", "kitchen", "bath", "office", "hall", "storage"),
    door: fc.integer({ min: 15, max: 85 }),
    stair: fc.boolean(),
    hole: fc.boolean(),
  });
  const plan = fc
    .array(fc.array(room, { minLength: 1, maxLength: 3 }), { minLength: 2, maxLength: 3 })
    .map((storeys) => {
      const out = [`plan "Generated" {`, "  units mm"];
      storeys.forEach((rooms, level) => {
        out.push(`  level ${level} {`);
        const total = rooms.reduce((s, r) => s + r.w, 0);
        out.push(`    wall id=shell exterior thickness 200 { (0,0) (${total},0) (${total},4000) (0,4000) close }`);
        if (level === 0) out.push(`    door on shell at 95% width 1000 swing in`);
        let x = 0;
        rooms.forEach((r, i) => {
          if (i > 0) out.push(`    wall id=p${i} partition thickness 100 { (${x},0) (${x},4000) }`);
          out.push(`    room id=r${i} at (${x},0) size ${r.w}x4000 label "Room" uses ${r.use}`);
          if (i > 0) out.push(`    door on p${i} at ${Math.round((4000 * r.door) / 100)} width 800 swing into r${i}`);
          if (r.hole) out.push(`    void id=v${i} at (${x + 300},300) size 900x900`);
          x += r.w;
        });
        if (rooms[0]!.stair) out.push(`    stair id=s at (400,1500) size 1000x2200 dir ${level === 0 ? "up" : "down"}`);
        out.push("  }");
      });
      out.push("}");
      return `${out.join("\n")}\n`;
    });

  it("holds the laws, and reaches rooms it furnishes", () => {
    let furnished = 0;
    fc.assert(
      fc.property(plan, (src) => {
        if (errorsOf(src).length > 0) return;
        const r = furnish(src);
        const again = furnish(r.source);
        expect(again.source, `not a fixpoint:\n${src}`).toBe(r.source);
        expect(gainedPerStorey(src, r.source), `worse:\n${src}\n→\n${r.source}`).toEqual([]);
        expect(r.changes.reduce((s, c) => s.replace(`    ${c.text}\n`, ""), r.source)).toBe(src);
        for (const c of r.changes) expect(blocks(r.source).get(c.level!)).toContain(c.text);
        for (const l of resolvePlan(r.source).levels) {
          const holes = l.ir.elements.flatMap((e) => (e.kind === "void" ? [rectOf(e)] : []));
          for (const f of l.ir.elements)
            if (f.kind === "furniture") for (const h of holes) expect(rectsOverlap(rectOf(f), h), r.source).toBe(false);
        }
        furnished += new Set(r.changes.map((c) => `${c.level}|${c.room}`)).size;
      }),
      { numRuns: 25, seed: 20261102 },
    );
    expect(furnished, "the property never furnished a room").toBeGreaterThan(15);
  }, 300000);
});
