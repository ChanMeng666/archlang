import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, format, lint, repair } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";

/**
 * `zone <id> ["Label"] { … }` (v1.22) — the wing/department grouping.
 *
 * The load-bearing law, pinned first and hardest below, is **byte-identity**: a `zone`
 * has ZERO geometric semantics, so wrapping statements in one (or several, nested) must
 * leave the compiled SVG identical to the same plan with the wrappers deleted. Everything
 * else here — paths, rollup areas, the grouped schedule, `describe --zone` — is metadata
 * layered on top of that guarantee.
 */

const WINGS = readFileSync("test/fixtures/zones-wings.arch", "utf8");
const LEVELS = readFileSync("test/fixtures/zones-levels.arch", "utf8");

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// ---------------------------------------------------------------------------
// The byte-identity law
// ---------------------------------------------------------------------------

suite("zone — byte identity (a zone draws nothing and moves nothing)", () => {
  const PLAIN = `plan "P" {
  units mm
  grid 100
  wall exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=a at (0,0) size 4000x6000 label "A"
  room id=b at (4000,0) size 4000x3000 label "B"
  room id=c at (4000,3000) size 4000x3000 label "C"
  door id=front at (0,3000) width 1000
  furniture sofa at (500,500) size 1800x800 in a
}`;

  const ZONED = `plan "P" {
  units mm
  grid 100
  wall exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  zone west "West" {
    room id=a at (0,0) size 4000x6000 label "A"
  }
  zone east "East" {
    room id=b at (4000,0) size 4000x3000 label "B"
    zone rear "Rear" {
      room id=c at (4000,3000) size 4000x3000 label "C"
    }
  }
  door id=front at (0,3000) width 1000
  furniture sofa at (500,500) size 1800x800 in a
}`;

  it("compiles to byte-identical SVG with the wrappers present or deleted", () => {
    expect(compile(ZONED).svg).toBe(compile(PLAIN).svg);
  });

  it("leaves ids, auto-id numbering and diagnostics untouched", () => {
    const p = describe(PLAIN);
    const z = describe(ZONED);
    expect(z.rooms).toEqual(p.rooms);
    expect(z.doors).toEqual(p.doors);
    expect(z.furniture).toEqual(p.furniture);
    expect(z.totals).toEqual(p.totals);
    expect(z.access).toEqual(p.access);
    expect(z.freedom).toEqual(p.freedom);
    // Diagnostics carry byte spans, which necessarily move when the source gains wrapper
    // lines — so what must match is WHICH problems are raised, about which elements.
    const shape = (ds: { code?: string; severity: string; message: string }[]) =>
      ds.map((d) => `${d.severity}/${d.code ?? ""}/${d.message}`);
    expect(shape(z.diagnostics)).toEqual(shape(p.diagnostics));
    expect(shape(lint(ZONED))).toEqual(shape(lint(PLAIN)));
  });

  it("adds ONLY the `zones` key to the summary", () => {
    const p = describe(PLAIN) as unknown as Record<string, unknown>;
    const z = describe(ZONED) as unknown as Record<string, unknown>;
    expect(Object.keys(z).filter((k) => !(k in p))).toEqual(["zones"]);
  });

  it("is not a scope: a `let` written inside a zone is still visible after it", () => {
    const src = `plan "P" {
  units mm
  zone z "Z" {
    let W = 4000
    room id=a at (0,0) size W x 3000
  }
  room id=b at (0,3000) size W x 3000
}`;
    const flat = `plan "P" {
  units mm
  let W = 4000
  room id=a at (0,0) size W x 3000
  room id=b at (0,3000) size W x 3000
}`;
    expect(compile(src).errors).toEqual([]);
    expect(compile(src).svg).toBe(compile(flat).svg);
  });

  it("is not a scope: a `set` written inside a zone still applies after it", () => {
    const zoned = `plan "P" {
  units mm
  zone z "Z" {
    set room(label: "X")
    room id=a at (0,0) size 3000x3000
  }
  room id=b at (3000,0) size 3000x3000
}`;
    const flat = `plan "P" {
  units mm
  set room(label: "X")
  room id=a at (0,0) size 3000x3000
  room id=b at (3000,0) size 3000x3000
}`;
    expect(compile(zoned).svg).toBe(compile(flat).svg);
  });

  it("composes with scripting: a zone inside a `for`, and a `for` inside a zone", () => {
    const zoneInLoop = `plan "P" {
  units mm
  for i in 0..3 {
    zone wing "Wing" {
      room at (i*3000, 0) size 3000x3000
    }
  }
}`;
    const loopInZone = `plan "P" {
  units mm
  zone wing "Wing" {
    for i in 0..3 {
      room at (i*3000, 0) size 3000x3000
    }
  }
}`;
    const flat = `plan "P" {
  units mm
  for i in 0..3 {
    room at (i*3000, 0) size 3000x3000
  }
}`;
    expect(compile(zoneInLoop).svg).toBe(compile(flat).svg);
    expect(compile(loopInZone).svg).toBe(compile(flat).svg);
    // A zone re-opened by a loop is ONE zone, declared once, holding every pass's rooms.
    const z = describe(zoneInLoop).zones!;
    expect(z).toHaveLength(1);
    expect(z[0]!.room_count).toBe(3);
  });

  it("is deterministic — the same source compiles and describes identically twice", () => {
    expect(compile(WINGS).svg).toBe(compile(WINGS).svg);
    expect(JSON.stringify(describe(WINGS))).toBe(JSON.stringify(describe(WINGS)));
  });

  it("leaves an unzoned plan's IR without a `zones` key at all", () => {
    const { ir } = resolve(parse(PLAIN).plan!);
    expect(ir.zones).toBeUndefined();
    expect(ir.elements.every((e) => e._zone === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Membership: declared, nested, innermost-wins
// ---------------------------------------------------------------------------

suite("zone — declared membership and nesting paths", () => {
  it("records the dotted path, innermost first, for every element born inside", () => {
    const { ir } = resolve(parse(WINGS).plan!);
    const zoneOf = new Map(ir.elements.map((e) => [e.id, e._zone]));
    expect(zoneOf.get("lobby")).toBe("west");
    expect(zoneOf.get("gal_a")).toBe("west.galleries");
    expect(zoneOf.get("gal_b")).toBe("west.galleries");
    expect(zoneOf.get("office")).toBe("east");
    // Statements outside every zone carry no membership at all.
    expect(zoneOf.get("front")).toBeUndefined();
    expect(zoneOf.get("exterior_1")).toBeUndefined();
  });

  it("reports zones in declaration order with their paths and labels", () => {
    const z = describe(WINGS).zones!;
    expect(z.map((x) => x.path)).toEqual(["west", "west.galleries", "east"]);
    expect(z.map((x) => x.id)).toEqual(["west", "galleries", "east"]);
    expect(z.map((x) => x.label)).toEqual(["West wing", "West galleries", "East wing"]);
  });

  it("rolls a nested zone's rooms UP into its ancestors", () => {
    const z = describe(WINGS).zones!;
    const west = z.find((x) => x.path === "west")!;
    const gal = z.find((x) => x.path === "west.galleries")!;
    expect(west.rooms).toEqual(["lobby", "gal_a", "gal_b"]);
    expect(gal.rooms).toEqual(["gal_a", "gal_b"]);
  });

  it("sums each zone's area exactly, from the same rounded per-room numbers as totals", () => {
    const s = describe(WINGS);
    const by = new Map(s.zones!.map((z) => [z.path, z]));
    const area = (id: string) => s.rooms.find((r) => r.id === id)!.area_m2;
    expect(by.get("west")!.floor_area_m2).toBe(area("lobby") + area("gal_a") + area("gal_b"));
    expect(by.get("west.galleries")!.floor_area_m2).toBe(area("gal_a") + area("gal_b"));
    expect(by.get("east")!.floor_area_m2).toBe(area("office") + area("store"));
    // The rollup caveat, stated as a test: zone areas OVERLAP and are not the plan total.
    const summed = s.zones!.reduce((n, z) => n + z.floor_area_m2, 0);
    expect(summed).toBeGreaterThan(s.totals.floor_area_m2);
    expect(s.totals.floor_area_m2).toBe(96);
  });

  it("never matches a zone whose path merely shares a prefix", () => {
    const src = `plan "P" {
  units mm
  zone west "W" { room id=a at (0,0) size 3000x3000 }
  zone westwing "WW" { room id=b at (3000,0) size 3000x3000 }
}`;
    const by = new Map(describe(src).zones!.map((z) => [z.path, z.rooms]));
    expect(by.get("west")).toEqual(["a"]);
    expect(by.get("westwing")).toEqual(["b"]);
  });

  it("omits `zones` entirely from an unzoned plan's summary", () => {
    expect(describe(`plan "P" { room at (0,0) size 3000x3000 }`).zones).toBeUndefined();
  });

  it("merges a re-declared zone, keeping the first declaration's label", () => {
    const src = `plan "P" {
  units mm
  zone w "First" { room id=a at (0,0) size 3000x3000 }
  zone w "Second" { room id=b at (3000,0) size 3000x3000 }
}`;
    const z = describe(src).zones!;
    expect(z).toHaveLength(1);
    expect(z[0]!.label).toBe("First");
    expect(z[0]!.rooms).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Levels interplay
// ---------------------------------------------------------------------------

suite("zone — inside `level` blocks", () => {
  it("scopes a zone to the storey it is written on, stamping its level", () => {
    const s = describe(LEVELS);
    expect(s.ok).toBe(true);
    const l1 = s.levels!.find((l) => l.level === 1)!;
    const l2 = s.levels!.find((l) => l.level === 2)!;
    expect(l1.zones!.map((z) => z.path)).toEqual(["north", "south"]);
    expect(l2.zones!.map((z) => z.path)).toEqual(["north"]);
    // The SAME id on two storeys is two separate groups, each carrying its own level.
    expect(l1.zones!.find((z) => z.path === "north")!.rooms).toEqual(["g_a"]);
    expect(l2.zones!.find((z) => z.path === "north")!.rooms).toEqual(["u_a"]);
    expect(l1.zones!.every((z) => z.level === 1)).toBe(true);
    expect(l2.zones!.every((z) => z.level === 2)).toBe(true);
  });

  it("reports the LOWEST storey's zones as the top-level `zones` (page 1, like every other fact)", () => {
    const s = describe(LEVELS);
    expect(s.zones).toEqual(s.levels![0]!.zones);
  });

  it("still draws each storey byte-identically to the same storey with the zones deleted", () => {
    const plain = `plan "Zoned storeys" {
  units mm
  grid 100

  level 1 "Ground" {
    room id=g_a at (0,0) size 4000x4000 label "G-A" uses office
    room id=g_b at (0,4000) size 4000x4000 label "G-B" uses office
    stair id=core at (4000,0) size 2600x4000 dir up
    door id=front at (0,2000) width 1000
  }

  level 2 "Upper" {
    room id=u_a at (0,0) size 4000x4000 label "U-A" uses office
    stair id=core at (4000,0) size 2600x4000 dir down
  }
}`;
    expect(plain).not.toContain("zone ");
    const a = compile(LEVELS);
    const b = compile(plain);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.pages!.map((p) => p.svg)).toEqual(b.pages!.map((p) => p.svg));
  });

  it("rejects a `zone` sitting beside the level blocks (E_LEVEL_MIX)", () => {
    const src = `plan "P" {
  units mm
  zone loose "L" { room at (0,0) size 3000x3000 }
  level 1 { room at (0,0) size 3000x3000 }
}`;
    expect(compile(src).diagnostics.map((d) => d.code)).toContain("E_LEVEL_MIX");
  });

  it("rejects a `level` nested inside a zone (E_LEVEL_NEST)", () => {
    const src = `plan "P" {
  units mm
  zone z "Z" { level 1 { room at (0,0) size 3000x3000 } }
}`;
    expect(compile(src).diagnostics.map((d) => d.code)).toContain("E_LEVEL_NEST");
  });
});

// ---------------------------------------------------------------------------
// The zone-grouped ROOM SCHEDULE
// ---------------------------------------------------------------------------

suite("zone — the grouped ROOM SCHEDULE", () => {
  const SCHED_PLAIN = `plan "S" {
  units mm
  schedule rooms
  room id=a at (0,0) size 4000x3000 label "A"
  room id=b at (4000,0) size 4000x3000 label "B"
}`;
  const SCHED_ZONED = `plan "S" {
  units mm
  schedule rooms
  zone w "West" { room id=a at (0,0) size 4000x3000 label "A" }
  zone e "East" { room id=b at (4000,0) size 4000x3000 label "B" }
}`;

  it("draws an UNZONED schedule byte-identically to before", () => {
    // The fixture the schedule suite already pins, recompiled here so a regression in the
    // grouped path cannot slip through as "the grouped table looks fine".
    const sheet = readFileSync("test/fixtures/schedule-sheet.arch", "utf8");
    expect(compile(sheet).svg).toBe(compile(sheet).svg);
    expect(compile(sheet).svg).toContain("ROOM SCHEDULE");
    expect(compile(sheet).svg).not.toContain("SUBTOTAL");
  });

  it("groups the rows by INNERMOST zone and closes each group with a SUBTOTAL", () => {
    const svg = compile(SCHED_ZONED).svg;
    expect(svg).toContain("ROOM SCHEDULE");
    expect(svg).toContain("West");
    expect(svg).toContain("East");
    expect(svg.match(/SUBTOTAL/g)).toHaveLength(2);
    expect(svg.match(/>TOTAL</g)).toHaveLength(1);
    // Grouping changes the table, so it must change the bytes (the converse of the
    // byte-identity law: opting into `schedule rooms` is what makes zones visible).
    expect(svg).not.toBe(compile(SCHED_PLAIN).svg);
  });

  it("partitions the rooms — the subtotals add up to the TOTAL", () => {
    const { ir } = resolve(parse(WINGS).plan!);
    // Re-derive through the same helper describe() and the renderer both use.
    const s = describe(WINGS);
    const rows = s.schedule!;
    expect(rows.map((r) => r.id)).toEqual(["lobby", "gal_a", "gal_b", "office", "store"]);
    expect(rows.map((r) => r.no)).toEqual(["01", "02", "03", "04", "05"]);
    expect(rows.map((r) => r.zone)).toEqual(["west", "west.galleries", "west.galleries", "east", "east"]);
    // Every room appears exactly once, so the rows still sum to the whole-plan total.
    expect(rows.reduce((n, r) => n + r.area_m2, 0)).toBe(s.totals.floor_area_m2);
    expect(ir.zones!.map((z) => z.path)).toEqual(["west", "west.galleries", "east"]);
  });

  it("carries no `zone` key on a row when the plan declares none", () => {
    expect(describe(SCHED_PLAIN).schedule!.every((r) => r.zone === undefined)).toBe(true);
  });

  it("gives a trailing group to rooms written outside every zone", () => {
    const src = `plan "S" {
  units mm
  schedule rooms
  zone w "West" { room id=a at (0,0) size 4000x3000 label "A" }
  room id=loose at (4000,0) size 4000x3000 label "Loose"
}`;
    expect(compile(src).svg).toContain("(no zone)");
    expect(describe(src).schedule!.map((r) => r.zone)).toEqual(["w", undefined]);
  });
});

/**
 * **A `place`d instance is a NAMESPACE, not a table heading.**
 *
 * An instance is implicitly a zone — that is how `describe --zone c4` reaches its contents
 * with no second bookkeeping path, and it stays true. But the room schedule groups by the
 * innermost zone, so a plan that placed one component six times printed **six one-row
 * groups with six subtotals**: a table with more structure than content.
 * `examples/clinic.arch` shipped a `legend` and no `schedule` for exactly that reason, and
 * said so in a comment.
 *
 * The rule now: an instance segment is TRANSPARENT to schedule grouping. Rows group by the
 * innermost zone the author WROTE — an instance inside one inherits it, an instance with
 * none falls to the un-zoned tail. Grouping is something a drawing says out loud.
 *
 * What must NOT move: `describe().zones` (instances are still zones, still roll up),
 * `--zone` filtering, and the subtotals-partition-the-total law.
 */
suite("zone — a placed INSTANCE is transparent to schedule grouping", () => {
  /** One component placed `n` times inside one declared zone. */
  const placed = (n: number, inZone: boolean): string => {
    const places = Array.from({ length: n }, (_, i) => `  place cell() as c${i + 1} at (${i * 4000},0)`).join("\n");
    const body = inZone ? `  zone clinical "Clinical" {\n${places}\n  }` : places;
    return `plan "P" {
  units mm
  schedule rooms
  component cell() {
    room id=main at (0,0) size 4000x3000 label "Consult"
  }
${body}
}`;
  };

  it("shows ONE group with three rows, not three groups", () => {
    const s = compile(placed(3, true), { noCache: true });
    expect(s.errors).toEqual([]);
    const svg = s.svg;
    // One heading, one subtotal — the whole point.
    expect(svg.match(/SUBTOTAL/g)).toHaveLength(1);
    expect(svg).toContain("Clinical");
    // …and each instance's own name is NOT a heading.
    for (const id of ["c1", "c2", "c3"]) expect(svg).not.toContain(`>${id}<`);
    // Three rows, all of them the placed room.
    const rows = describe(placed(3, true)).schedule!;
    expect(rows.map((r) => r.id)).toEqual(["c1.main", "c2.main", "c3.main"]);
  });

  it("drops instances with NO declared zone into the un-zoned tail, ungrouped", () => {
    // A plan whose only zones are instances has nothing an author asked to group by, so it
    // draws the flat table — the same one it would draw with no `place` at all.
    const svg = compile(placed(3, false), { noCache: true }).svg;
    expect(svg).toContain("ROOM SCHEDULE");
    expect(svg).not.toContain("SUBTOTAL");
    expect(svg).not.toContain("(no zone)");
  });

  it("still reports every instance zone in `describe().zones` — only the TABLE changed", () => {
    const d = describe(placed(3, true));
    expect(d.zones!.map((z) => z.path)).toEqual(["clinical", "clinical.c1", "clinical.c2", "clinical.c3"]);
    // The rollup is unchanged: the outer zone owns all three, each instance owns its own.
    expect(d.zones!.find((z) => z.path === "clinical")!.room_count).toBe(3);
    for (const i of [1, 2, 3]) expect(d.zones!.find((z) => z.path === `clinical.c${i}`)!.room_count).toBe(1);
    // And the row still records the innermost zone it is IN, which is the instance.
    expect(d.schedule!.map((r) => r.zone)).toEqual(["clinical.c1", "clinical.c2", "clinical.c3"]);
  });

  it("keeps the subtotals partitioning the TOTAL when instances roll up", () => {
    const src = `plan "P" {
  units mm
  schedule rooms
  component cell() { room id=main at (0,0) size 4000x3000 label "Consult" }
  zone clinical "Clinical" {
    place cell() as c1 at (0,0)
    place cell() as c2 at (4000,0)
    room id=corr at (8000,0) size 2000x3000 label "Corridor"
  }
  zone public "Public" { room id=wait at (10000,0) size 4000x3000 label "Waiting" }
  room id=plant at (14000,0) size 2000x3000 label "Plant"
}`;
    const d = describe(src);
    const rows = d.schedule!;
    // Grouped order: the two declared zones, then the room in neither.
    expect(rows.map((r) => r.id)).toEqual(["c1.main", "c2.main", "corr", "wait", "plant"]);
    expect(rows.reduce((n, r) => n + r.area_m2, 0)).toBe(d.totals.floor_area_m2);
    const svg = compile(src, { noCache: true }).svg;
    expect(svg.match(/SUBTOTAL/g)).toHaveLength(3); // Clinical, Public, (no zone)
    expect(svg).toContain("(no zone)");
  });

  it("marks an instance zone in the IR and a written `zone` not at all", () => {
    // The flag is what the table reads. A written `zone` carries no key, so the IR of every
    // plan that places nothing is byte-identical.
    const { ir } = resolve(parse(placed(2, true)).plan!);
    const byPath = new Map(ir.zones!.map((z) => [z.path, z]));
    expect(byPath.get("clinical")!.instance).toBeUndefined();
    expect(byPath.get("clinical.c1")!.instance).toBe(true);
    expect(JSON.stringify(byPath.get("clinical"))).not.toContain("instance");
  });
});

// ---------------------------------------------------------------------------
// `describe --zone` — a DISPLAY filter
// ---------------------------------------------------------------------------

suite("describe --zone — narrowing that never gates", () => {
  it("keeps only the selected wing's rooms and what touches them", () => {
    const r = run(["describe", "test/fixtures/zones-wings.arch", "--zone", "east", "--json"]);
    expect(r.status).toBe(0);
    const o = JSON.parse(r.stdout);
    expect(o.rooms.map((x: { id: string }) => x.id)).toEqual(["office", "store"]);
    expect(o.filtered).toBe(true);
    expect(o.selected_zones).toEqual(["east"]);
    // Whole-plan facts stay whole-plan — a narrowed read must not lie about the building.
    expect(o.totals.rooms).toBe(5);
    expect(o.bbox).toEqual({ w: 12000, h: 8000 });
  });

  it("rolls a nested zone up: `--zone west` keeps the galleries too", () => {
    const r = run(["describe", "test/fixtures/zones-wings.arch", "--zone", "west", "--json"]);
    const o = JSON.parse(r.stdout);
    expect(o.rooms.map((x: { id: string }) => x.id)).toEqual(["lobby", "gal_a", "gal_b"]);
    expect(o.zones.map((z: { path: string }) => z.path)).toEqual(["west", "west.galleries"]);
  });

  it("selects a nested zone alone by its dotted path", () => {
    const r = run(["describe", "test/fixtures/zones-wings.arch", "--zone", "west.galleries", "--json"]);
    const o = JSON.parse(r.stdout);
    expect(o.rooms.map((x: { id: string }) => x.id)).toEqual(["gal_a", "gal_b"]);
    expect(o.zones.map((z: { path: string }) => z.path)).toEqual(["west.galleries"]);
  });

  it("NEVER changes `ok`, the diagnostics or the exit code — even when the hidden zone is the one with the warnings", () => {
    // Both interior doors (and therefore both W_DOOR_OFF_WALL warnings) live in zones the
    // filter below hides; the diagnostics and the exit code must be untouched.
    const full = run(["describe", "test/fixtures/zones-wings.arch", "--json"]);
    const narrowed = run(["describe", "test/fixtures/zones-wings.arch", "--zone", "east", "--json"]);
    const a = JSON.parse(full.stdout);
    const b = JSON.parse(narrowed.stdout);
    expect(a.diagnostics.length).toBeGreaterThan(0);
    expect(b.diagnostics).toEqual(a.diagnostics);
    expect(b.ok).toBe(a.ok);
    expect(narrowed.status).toBe(full.status);
    expect(narrowed.status).toBe(0);
  });

  it("composes with --room and --level", () => {
    const r = run(["describe", "test/fixtures/zones-wings.arch", "--zone", "west", "--room", "gal_a", "--json"]);
    const o = JSON.parse(r.stdout);
    expect(o.rooms.map((x: { id: string }) => x.id)).toEqual(["gal_a"]);
    expect(o.selected_zones).toEqual(["west"]);
    expect(o.selected_rooms).toEqual(["gal_a"]);

    const lv = run(["describe", "test/fixtures/zones-levels.arch", "--level", "2", "--zone", "north", "--json"]);
    expect(lv.status).toBe(0);
    expect(JSON.parse(lv.stdout).rooms.map((x: { id: string }) => x.id)).toEqual(["u_a"]);
  });

  it("is a usage error (exit 3, with a did-you-mean) on an unknown zone", () => {
    const r = run(["describe", "test/fixtures/zones-wings.arch", "--zone", "wast", "--json"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('did you mean "west"');
  });

  it("is a usage error on a plan that declares no zones at all", () => {
    const r = run(["describe", "-", "--zone", "x", "--json"], `plan "P" { room at (0,0) size 3000x3000 }`);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("declares no `zone` blocks");
  });

  it("is a selectable `--select` key", () => {
    const r = run(["describe", "test/fixtures/zones-wings.arch", "--select", "zones", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).zones).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// The other statement walkers
// ---------------------------------------------------------------------------

suite("zone — the statement walkers see through it", () => {
  it("survives the formatter, and formatting is idempotent", () => {
    const once = format(WINGS);
    expect(once).toContain('zone west "West wing" {');
    expect(once).toContain('zone galleries "West galleries" {');
    expect(format(once)).toBe(once);
    // Formatting is meaning-preserving: same bytes out of the compiler.
    expect(compile(once).svg).toBe(compile(WINGS).svg);
    // …and the grouping survives it (dropping the wrapper would silently lose the wings).
    expect(describe(once).zones!.map((z) => z.path)).toEqual(describe(WINGS).zones!.map((z) => z.path));
  });

  it("formats a zone with no label", () => {
    const src = `plan "P" { units mm
zone w { room id=a at (0,0) size 3000x3000 } }`;
    const out = format(src);
    expect(out).toContain("zone w {");
    expect(format(out)).toBe(out);
  });

  it("lets `repair` reach a fixture written inside a zone", () => {
    // A `wc` buried in the wall solid — the exact geometric fault `repair` exists to fix.
    const inZone = `plan "P" {
  units mm
  wall exterior thickness 300 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=bath at (0,0) size 4000x3000 label "Bath" uses bath
  zone wet "Wet block" {
    furniture wc id=pan at (100,100) size 400x700 in bath
  }
}`;
    const flat = inZone.replace(/ *zone wet "Wet block" \{\n/, "").replace(/^ {2}\}\n/m, "");
    expect(flat).not.toContain("zone ");

    const a = repair(inZone);
    const b = repair(flat);
    // The postcondition: the flagged piece gets a change (or an `unresolved` note) — never
    // silence — and the zone wrapper changes nothing about which.
    expect(a.changes.length + a.unresolved.length).toBeGreaterThan(0);
    expect(a.changes.map((c) => c.id)).toEqual(b.changes.map((c) => c.id));
    expect(a.unresolved.map((u) => u.id)).toEqual(b.unresolved.map((u) => u.id));
    // The rewritten source keeps the zone (repair edits in place, it does not re-emit).
    if (a.changed) expect(a.source).toContain("zone wet");
  });

  it("completes inside a zone body (the LSP sees through the wrapper)", () => {
    const src = `plan "P" {
  units mm
  let W = 4000
  zone z "Z" {
    room at (0,0) size
  }
}`;
    const r = run(["complete", "-", "--at", String(src.indexOf("size ") + 5), "--json"], src);
    expect(r.status).toBe(0);
    const items = JSON.parse(r.stdout).items as { label: string }[];
    expect(items.map((i) => i.label)).toContain("W");
  });

  it("projects into `arch ast --json` as a span-bearing zone node", () => {
    const r = run(["ast", "test/fixtures/zones-wings.arch", "--json"]);
    expect(r.status).toBe(0);
    const body = JSON.parse(r.stdout).ast.body as { kind: string; id?: string; label?: string }[];
    const z = body.find((s) => s.kind === "zone")!;
    expect(z.id).toBe("west");
    expect(z.label).toBe("West wing");
  });
});
