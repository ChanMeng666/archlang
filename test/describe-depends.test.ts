/**
 * `describe --facts depends` (plan-soundness card PS4.1, `src/analyze/depends.ts`).
 *
 * - one case per `on` source and per kind of `params` name;
 * - the derived-wall rule: `on` never holds a derived wall's internal name (ADR 0028 §3); an
 *   opening reaches its derived host through `hostWallId`, a piece through the host's rooms;
 * - `examples/relational.arch` and `examples/two-bed.arch` pinned whole, every row explained;
 * - over the examples corpus: every `on` id names an element of that storey, and the lists
 *   are sorted and repeat nothing;
 * - equivariance: placing a plan turned, mirrored or translated changes neither `on` nor
 *   `params` (the oracle's own wrapper over the corpus, and the random-plan arbitrary), and
 *   moves each `contacts` edge exactly as the frame moves a side (PS4.5: an edge is named in
 *   the resolved plan's frame, so `g` acts on it; the room set is unchanged).
 *
 * That a summary NOT asking for the fact is byte-identical is `test/describe-facts.test.ts`
 * (every example, `strip` of the opt-in keys); SVG and `lint()` never see the option, and the
 * corpus digest suites (`byte-identity-*`, `*-digests`) hold them.
 */

import fc from "fast-check";
import { describe as suite, expect, it } from "vitest";
import { actOnSide, fromSpelling } from "../src/algebra/d4.js";
import { type DependsEntry, type DependsFacts, describe, type SceneSummary } from "../src/index.js";
import { buildManifest } from "../src/manifest.js";
import { planSpec, withInstance } from "./arbitrary-plan.js";
import {
  corpusElements,
  D4_TEST_ELEMENTS,
  ELIGIBLE_EXAMPLES,
  EXAMPLE_FILES,
  EXAMPLES_WORLD,
  translationFor,
  wrapperSource,
} from "./d4-oracle.js";

const plan = (body: string, head = "grid 50"): string => `plan "t" {\n  units mm\n  ${head}\n${body}\n}\n`;

function depends(src: string): DependsFacts {
  const s = describe(src, { facts: ["depends"] });
  expect(
    s.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code}: ${d.message}`),
    src,
  ).toEqual([]);
  return s.depends!;
}

const entry = (f: DependsFacts, id: string): DependsEntry => {
  const e = f.elements.find((x) => x.id === id);
  if (!e) throw new Error(`no element ${id} in ${f.elements.map((x) => x.id).join(", ")}`);
  return e;
};

const wallOf = (f: DependsFacts, name: string) => {
  const w = f.derived_walls.find((x) => x.name === name);
  if (!w) throw new Error(`no derived wall ${name} in ${f.derived_walls.map((x) => x.name).join(", ")}`);
  return w;
};

const ROOMS = `  room id=a at (0,0) size 4000x3000 label "A"
  room id=b at (4000,0) size 3000x3000 label "B"`;
const DERIVED = `${ROOMS}\n  walls from rooms exterior 200 partition 100`;
const RING = `${ROOMS}
  wall id=ring exterior thickness 200 { (0,0) (7000,0) (7000,3000) (0,3000) close }
  wall id=p partition thickness 100 { (4000,0) (4000,3000) }`;

suite("`on`: one case per source", () => {
  it("a relational room reads its reference room", () => {
    const f = depends(plan(`  room id=a at (0,0) size 4000x3000\n  room id=b right-of a align top size 2000x3000`));
    expect(entry(f, "b").on).toEqual(["a"]);
    expect(entry(f, "a").on).toEqual([]);
  });

  it("`door between A and B` reads both rooms; its derived host is `hostWallId` only", () => {
    const f = depends(plan(`${DERIVED}\n  door id=d between a and b at center width 800`));
    expect(entry(f, "d")).toEqual({ id: "d", kind: "door", on: ["a", "b"], params: [], axes: [], hostWallId: "a|b" });
  });

  it("`on <room>.<edge>` reads the room; an authored host is in `on` as well", () => {
    const derived = depends(plan(`${DERIVED}\n  window id=w on a.top width 1200`));
    expect(entry(derived, "w")).toEqual({
      id: "w",
      kind: "window",
      on: ["a"],
      params: [],
      axes: [],
      hostWallId: "exterior",
    });
    const authored = depends(plan(`${RING}\n  window id=w on a.top width 1200`));
    expect(entry(authored, "w")).toEqual({
      id: "w",
      kind: "window",
      on: ["a", "ring"],
      params: [],
      axes: [],
      hostWallId: "ring",
    });
  });

  it("`<mm> from <room>.<edge>` on a hosted opening reads the room and the host", () => {
    const f = depends(
      plan(
        `${ROOMS}\n  wall id=h partition thickness 100 { (0,1500) (7000,1500) }\n  door id=d on h at 600 from b.left width 800`,
      ),
    );
    expect(entry(f, "d")).toEqual({ id: "d", kind: "door", on: ["b", "h"], params: [], axes: [], hostWallId: "h" });
  });

  it("`swing into <room>` reads the room", () => {
    const f = depends(plan(`${RING}\n  door id=d on p at center width 800 swing into b`));
    expect(entry(f, "d").on).toEqual(["b", "p"]);
  });

  it("`against <room>.<edge>` reads the room", () => {
    const f = depends(plan(`${DERIVED}\n  furniture id=w wardrobe against a.left offset 1500 size 1200x600 in a`));
    expect(entry(f, "w").on).toEqual(["a"]);
  });

  it("`facing <id>` reads its target, and `in <room> anchor` the room", () => {
    const f = depends(
      plan(`${DERIVED}
  furniture id=tv tv_unit in a anchor top size 1200x400
  furniture id=s sofa in a anchor bottom size 2000x900 facing tv`),
    );
    expect(entry(f, "tv").on).toEqual(["a"]);
    expect(entry(f, "s").on).toEqual(["a", "tv"]);
  });

  it("`at (x,y) in <room>` only says whose the piece is: no dependency", () => {
    const f = depends(plan(`${DERIVED}\n  furniture id=t table at (1000,1000) size 800x800 in a`));
    expect(entry(f, "t").on).toEqual([]);
  });

  it("`against wall <id>` reads the wall, and the `in` room only when it picks the face", () => {
    const inferred = depends(plan(`${RING}\n  furniture id=k wardrobe against wall p offset 1500 size 1200x600 in a`));
    expect(entry(inferred, "k").on).toEqual(["a", "p"]);
    expect(entry(inferred, "k").hostWallId).toBe("p");
    const stated = depends(
      plan(`${RING}\n  furniture id=k wardrobe against wall p offset 1500 side left size 1200x600`),
    );
    expect(entry(stated, "k").on).toEqual(["p"]);
  });

  it("`segment containing <room>.<edge>` reads the room", () => {
    const f = depends(
      plan(
        `${RING}\n  furniture id=k wardrobe against wall ring segment containing b.top offset 1000 side right size 1200x600`,
      ),
    );
    expect(entry(f, "k").on).toEqual(["b", "ring"]);
  });

  it("a piece backed onto a DERIVED wall names it as `hostWallId` only; `on` keeps the face room", () => {
    const f = depends(
      plan(`${DERIVED}\n  furniture id=k wardrobe against wall exterior segment 0 offset 1000 size 1200x600 in a`),
    );
    expect(entry(f, "k")).toEqual({
      id: "k",
      kind: "furniture",
      on: ["a"],
      params: [],
      axes: [],
      hostWallId: "exterior",
    });
    // The ring's rooms are listed once, in its own row, not copied into the piece's.
    expect(wallOf(f, "exterior").on).toEqual(["a", "b"]);
  });

  it("a datum read in an expression reads the room", () => {
    const f = depends(plan(`${DERIVED}\n  dim (a.left, a.bottom) -> (b.right, b.bottom) offset 600`));
    expect(entry(f, "dim_1").on).toEqual(["a", "b"]);
    expect(entry(f, "dim_1").params).toEqual([]);
  });

  it("a pairwise wall reads its rooms", () => {
    const f = depends(
      plan(`${ROOMS}
  wall id=p partition thickness 100 between a and b
  wall id=e exterior thickness 200 around [a b]`),
    );
    expect(entry(f, "p").on).toEqual(["a", "b"]);
    expect(entry(f, "e").on).toEqual(["a", "b"]);
  });

  it("`open between` derives an opening on its pair, hosted on the pair's partition", () => {
    const f = depends(
      plan(
        `${ROOMS}\n  let OW = 1200\n  walls from rooms exterior 200 partition 100 { open between a and b width OW }`,
      ),
    );
    expect(entry(f, "a|b:open")).toEqual({
      id: "a|b:open",
      kind: "opening",
      on: ["a", "b"],
      params: ["OW"],
      axes: [],
      hostWallId: "a|b",
    });
  });

  it("a roof follows its ring: `hostWallId`, and `on` too when the ring is authored", () => {
    const f = depends(plan(`${DERIVED}\n  roof overhang 500`));
    expect(entry(f, "roof_1").on).toEqual([]);
    expect(entry(f, "roof_1").hostWallId).toBe("exterior");
    const named = depends(plan(`${RING}\n  roof overhang 500 wall ring`));
    expect(entry(named, "roof_1").on).toEqual(["ring"]);
    expect(entry(named, "roof_1").hostWallId).toBe("ring");
  });

  it("`at axis <label>` lists the axis in `axes` (pinned row)", () => {
    const f = depends(
      plan(`  axes {
    x at 2000
    y at 1000
  }
${RING}
  window id=w on a.top at axis 1 width 1200
  door id=d between a and b at axis A width 800`),
    );
    expect(entry(f, "w")).toEqual({
      id: "w",
      kind: "window",
      on: ["a", "ring"],
      params: [],
      axes: ["1"],
      hostWallId: "ring",
    });
    expect(entry(f, "d")).toEqual({
      id: "d",
      kind: "door",
      on: ["a", "b", "p"],
      params: [],
      axes: ["A"],
      hostWallId: "p",
    });
  });

  it("`dim radius <wall>` reads the wall", () => {
    const f = depends(
      plan(`  wall id=c exterior thickness 200 { (0,0) (4000,0) arc (4000,4000) radius 2000 (0,4000) close }
  dim radius c segment 1 offset 0`),
    );
    expect(entry(f, "dim_1").on).toEqual(["c"]);
  });
});

suite("derived walls (ADR 0028 §3)", () => {
  it("a ring derives from the whole room set less `except`; a partition from its pair", () => {
    const f = depends(
      plan(`${ROOMS}
  room id=c at (7000,0) size 2000x3000 label "C"
  let T = 150
  walls from rooms exterior 200 partition 100 { between a and b thickness T }`),
    );
    expect(wallOf(f, "exterior")).toEqual({ name: "exterior", on: ["a", "b", "c"], params: [] });
    expect(wallOf(f, "a|b")).toEqual({ name: "a|b", on: ["a", "b"], params: ["T"] });
    expect(wallOf(f, "b|c")).toEqual({ name: "b|c", on: ["b", "c"], params: [] });
  });

  it("a ring and the default partition read the statement's thickness names", () => {
    const f = depends(plan(`${ROOMS}\n  let E = 200\n  let P = 100\n  walls from rooms exterior E partition P`));
    expect(wallOf(f, "exterior").params).toEqual(["E"]);
    expect(wallOf(f, "a|b").params).toEqual(["P"]);
  });

  it("an authored wall that took a span over is a dependency of the remainder", () => {
    const f = depends(
      plan(`${ROOMS}
  walls from rooms exterior 200 partition 100
  wall id=q partition thickness 100 { (4000,0) (4000,1500) }`),
    );
    const rest = f.derived_walls.filter((w) => w.name.startsWith("a|b"));
    expect(rest.length).toBeGreaterThan(0);
    for (const w of rest) expect(w.on).toEqual(["a", "b", "q"]);
  });

  it("no `on` or `axes` entry has the SHAPE of a derived wall's name, unless it is an authored id", () => {
    // Independent of `derived_walls[]`: a derived wall is `A|B`, `exterior`, `exterior#n`, or a
    // run split off one (`~n`), possibly under an instance prefix. `|`, `#` and `~` cannot be
    // spelled by an identifier; `exterior` can, so an authored element of that id is allowed.
    const DERIVED_SHAPE = /\||(^|\.)exterior(#\d+)?$|~\d+$/;
    let checked = 0;
    const sources = [
      ...Object.entries(EXAMPLE_FILES),
      ...ELIGIBLE_EXAMPLES.map((rel) => [`placed ${rel}`, wrapperSource(rel, null)] as const),
    ];
    for (const [rel, src] of sources) {
      const s = describe(src, { world: EXAMPLES_WORLD, facts: ["depends"] });
      for (const storey of storeys(s)) {
        if (!storey.depends) continue;
        const authored = new Set(storey.depends.elements.map((e) => e.id));
        for (const e of storey.depends.elements)
          for (const id of [...e.on, ...e.axes]) {
            checked++;
            expect(DERIVED_SHAPE.test(id) && !authored.has(id), `${rel}: ${e.id} → ${id}`).toBe(false);
          }
      }
    }
    expect(checked, "the sweep read real entries").toBeGreaterThan(1000);
  });

  it("no `on` list in the corpus names a derived wall", () => {
    for (const [rel, src] of Object.entries(EXAMPLE_FILES)) {
      const s = describe(src, { world: EXAMPLES_WORLD, facts: ["depends"] });
      for (const storey of storeys(s)) {
        const derived = new Set(storey.depends!.derived_walls.map((w) => w.name));
        for (const e of storey.depends!.elements)
          for (const id of e.on) expect(derived.has(id), `${rel}: ${e.id} names derived wall ${id}`).toBe(false);
      }
    }
  });
});

suite("`params`: the bound names an element's expressions read", () => {
  it("a `let`, a user function, never a built-in, never a datum", () => {
    const f = depends(
      plan(`  let W = 4000
  let D = 3000
  let half(x) = x / 2
  let a_depth() = 3000
  room id=a at (0,0) size max(W, 3000) x D
  room id=b at (W, 0) size half(W) x a_depth()`),
    );
    expect(entry(f, "a").params).toEqual(["D", "W"]);
    expect(entry(f, "b").params).toEqual(["W", "a_depth", "half"]);
  });

  it("a component parameter and a `for` variable", () => {
    const f = depends(
      plan(`  component bay(w) {
    room id=r at (0,0) size w x 3000
  }
  place bay(4000) as west at (0,0)
  for i in 0..2 {
    furniture table at (1000 * i, 5000) size 800x800
  }`),
    );
    expect(entry(f, "west.r")).toEqual({ id: "west.r", kind: "room", on: [], params: ["w"], axes: [] });
    expect(entry(f, "table_1").params).toEqual(["i"]);
    expect(entry(f, "table_2").params).toEqual(["i"]);
  });

  it("the clauses the LSP table does not walk yet: `against <room>.<edge> offset`, `clear`", () => {
    const f = depends(
      plan(`${DERIVED}
  let O = 1500
  let C = 900
  furniture id=w wardrobe against a.left offset O size 1200x600 clear front C in a`),
    );
    expect(entry(f, "w").params).toEqual(["C", "O"]);
  });

  it("a height clause's names are params and never `on` (heights draw nothing)", () => {
    const f = depends(
      plan(`${ROOMS}
  let H = 2700
  let S = 1000
  wall id=e exterior thickness 200 height H { (0,0) (7000,0) (7000,3000) (0,3000) close }
  window id=w on e at center width 1200 sill S`),
    );
    // The ring lies on every outer edge of a and b (PS4.5 `contacts`); a height reads no room.
    expect(entry(f, "e")).toEqual({
      id: "e",
      kind: "wall",
      on: [],
      params: ["H"],
      axes: [],
      contacts: [
        { room: "a", edge: "bottom" },
        { room: "a", edge: "left" },
        { room: "a", edge: "top" },
        { room: "b", edge: "bottom" },
        { room: "b", edge: "right" },
        { room: "b", edge: "top" },
      ],
    });
    expect(entry(f, "w")).toEqual({ id: "w", kind: "window", on: ["e"], params: ["S"], axes: [], hostWallId: "e" });
  });
});

suite("the corpus", () => {
  it.each(Object.keys(EXAMPLE_FILES))("%s: sorted, no repeats, every `on` id is on the storey", (rel) => {
    const s = describe(EXAMPLE_FILES[rel]!, { world: EXAMPLES_WORLD, facts: ["depends"] });
    if (!s.ok) return;
    for (const storey of storeys(s)) {
      const d = storey.depends!;
      const ids = d.elements.map((e) => e.id);
      expect(ids, "elements by id").toEqual([...ids].sort(byCode));
      const names = d.derived_walls.map((w) => w.name);
      expect(names, "derived walls by name").toEqual([...names].sort(byCode));
      const known = new Set(ids);
      for (const e of [...d.elements, ...d.derived_walls]) {
        for (const list of [e.on, e.params]) expect(list).toEqual([...new Set(list)].sort(byCode));
        for (const id of e.on) expect(known.has(id), `${rel}: ${"id" in e ? e.id : e.name} → ${id}`).toBe(true);
      }
    }
  });
});

suite("`--view` cannot reach it", () => {
  it("`describe` takes no `--view` (only `compile`/`preview` do), and the option has no view", () => {
    const m = buildManifest("0.0.0");
    const flags = m.commands.find((c) => c.name === "describe")!.flags.map((f) => f.flag);
    expect(flags).toContain("--facts");
    expect(flags).not.toContain("--view");
  });
});

// ---------------------------------------------------------------------------
// Pinned: every row of two examples, each explained
// ---------------------------------------------------------------------------

/** One line per row: `id kind on=[…] params=[…] host=…`. */
function rows(f: DependsFacts): string[] {
  return [
    ...f.elements.map(
      (e) =>
        `${e.id} ${e.kind} on=[${e.on.join(" ")}] params=[${e.params.join(" ")}]${e.axes.length > 0 ? ` axes=[${e.axes.join(" ")}]` : ""}${e.hostWallId !== undefined ? ` host=${e.hostWallId}` : ""}`,
    ),
    ...f.derived_walls.map((w) => `wall ${w.name} on=[${w.on.join(" ")}] params=[${w.params.join(" ")}]`),
  ];
}

const ALL_RELATIONAL = "bath bed hall kitchen living";
const ALL_TWO_BED = "r_bath r_bed1 r_bed2 r_hall r_living";

suite("pinned", () => {
  it("examples/relational.arch", () => {
    expect(rows(describe(EXAMPLE_FILES["relational.arch"]!, { facts: ["depends"] }).depends!)).toEqual([
      // `against wall exterior segment 1 … in bath`, no `side`: the face is picked from `bath`;
      // the ring is derived, so it is `host` only and its rooms are in its own row below.
      "basin_8 furniture on=[bath] params=[] host=exterior",
      "bath room on=[bed] params=[]", // `right-of bed`
      "bed room on=[hall] params=[]", // `below hall`
      "bed_1 furniture on=[bed] params=[]", // `in bed anchor bottom-right`
      "coffee_table_3 furniture on=[living] params=[]", // `in living anchor left`
      "counter_5 furniture on=[kitchen] params=[] host=exterior", // as basin_8, `in kitchen`
      "dim_1 dim on=[] params=[]", // literal points; `faces` projects by geometry, not by id
      "dining_table_4 furniture on=[kitchen] params=[]", // `in kitchen anchor left`
      "door_1 door on=[hall] params=[] host=exterior", // `on hall.left`, `swing into hall`; derived host
      "door_2 door on=[bed hall] params=[] host=hall|bed", // `between hall and bed`, `swing into bed`
      "door_3 door on=[bath hall] params=[] host=hall|bath", // `between hall and bath`, `swing into bath`
      "fridge furniture on=[kitchen] params=[] host=exterior", // fix/examples-sound (2026-10-27): the kitchen's fridge, as counter_5
      "hall room on=[living] params=[]", // `below living`
      "kitchen room on=[living] params=[]", // `right-of living`
      "living room on=[] params=[]", // the anchor: `at (0,0)`
      "living|hall:open opening on=[hall living] params=[] host=living|hall", // `open between living and hall`
      "living|kitchen:open opening on=[kitchen living] params=[] host=living|kitchen", // `open between living and kitchen`
      "shower_10 furniture on=[bath] params=[]", // `in bath anchor bottom-left`
      "sink_6 furniture on=[kitchen] params=[] host=exterior", // as basin_8, `in kitchen`
      "sofa_2 furniture on=[living] params=[]", // `in living anchor bottom-left`
      "stove_7 furniture on=[kitchen] params=[] host=exterior", // as basin_8, `in kitchen`
      "wc_9 furniture on=[bath] params=[] host=exterior", // as basin_8, `in bath`
      "window_1 window on=[living] params=[] host=exterior", // `on living.top`
      "window_2 window on=[kitchen] params=[] host=exterior", // `on kitchen.top`
      "window_3 window on=[bed] params=[] host=exterior", // `on bed.bottom`
      // The derived walls: each partition from its pair, the ring from every room.
      "wall bed|bath on=[bath bed] params=[]",
      `wall exterior on=[${ALL_RELATIONAL}] params=[]`,
      "wall hall|bath on=[bath hall] params=[]",
      "wall hall|bed on=[bed hall] params=[]",
      "wall kitchen|hall on=[hall kitchen] params=[]",
      "wall living|hall on=[hall living] params=[]",
      "wall living|kitchen on=[kitchen living] params=[]",
    ]);
  });

  it("examples/two-bed.arch", () => {
    expect(rows(describe(EXAMPLE_FILES["two-bed.arch"]!, { facts: ["depends"] }).depends!)).toEqual([
      "basin_13 furniture on=[r_bath] params=[]", // `in r_bath anchor right`
      "bed_1 furniture on=[r_bed1] params=[]", // `in r_bed1 anchor top-left`
      "bed_3 furniture on=[r_bed2] params=[]", // `in r_bed2 anchor bottom-right`
      // `against wall exterior segment 3 … in r_living`, no `side`: the face is picked from
      // `r_living`; the derived ring is `host` only, its rooms in its own row below.
      "counter_8 furniture on=[r_living] params=[] host=exterior",
      "d_front door on=[r_hall] params=[] host=exterior", // `on r_hall.right`, `swing into r_hall`
      "dim_1 dim on=[] params=[]", // literal points
      "dim_2 dim on=[] params=[]", // literal points
      "door_2 door on=[r_bed1 r_hall] params=[] host=r_bed1|r_hall", // `between r_hall and r_bed1`
      "door_3 door on=[r_bath r_hall] params=[] host=r_hall|r_bath", // `between r_hall and r_bath`
      "door_4 door on=[r_bed2 r_hall] params=[] host=r_hall|r_bed2", // `between r_hall and r_bed2`
      "fridge_5 furniture on=[r_living] params=[] host=exterior", // as counter_8
      "kitchen_sink_7 furniture on=[r_living] params=[] host=exterior", // as counter_8
      "r_bath room on=[] params=[]", // `at (4000,5000)`
      "r_bed1 room on=[] params=[]", // `at (4000,0)`
      "r_bed2 room on=[r_bath] params=[]", // `right-of r_bath`
      "r_hall room on=[] params=[]", // `at (4000,3600)`
      "r_living room on=[] params=[]", // `at (0,0)`
      "r_living|r_hall:open opening on=[r_hall r_living] params=[] host=r_living|r_hall", // `open between r_hall and r_living`
      "roof_1 roof on=[] params=[] host=exterior", // `roof overhang 500` follows the derived ring
      "shower_11 furniture on=[r_bath] params=[]", // `in r_bath anchor bottom-left`
      "sofa_9 furniture on=[] params=[]", // `at (2850,5400) … in r_living`: membership only
      "stove_6 furniture on=[r_living] params=[] host=exterior", // as counter_8
      "table_10 furniture on=[] params=[]", // `at (800,5800) … in r_living`: membership only
      "wardrobe_2 furniture on=[r_bed1] params=[]", // `in r_bed1 anchor top-right`
      "wardrobe_4 furniture on=[r_bed2] params=[]", // `in r_bed2 anchor bottom-left`
      "wc_12 furniture on=[r_bath] params=[]", // `in r_bath anchor bottom`
      "window_1 window on=[r_living] params=[] host=exterior", // `on r_living.top`
      "window_2 window on=[r_living] params=[] host=exterior", // `on r_living.left`
      "window_3 window on=[r_bed1] params=[] host=exterior", // `on r_bed1.top`
      "window_4 window on=[r_bed2] params=[] host=exterior", // `on r_bed2.bottom`
      // The derived walls: each partition from its pair, the ring from every room.
      `wall exterior on=[${ALL_TWO_BED}] params=[]`,
      "wall r_bath|r_bed2 on=[r_bath r_bed2] params=[]",
      "wall r_bed1|r_hall on=[r_bed1 r_hall] params=[]",
      "wall r_hall|r_bath on=[r_bath r_hall] params=[]",
      "wall r_hall|r_bed2 on=[r_bed2 r_hall] params=[]",
      "wall r_living|r_bath on=[r_bath r_living] params=[]",
      "wall r_living|r_bed1 on=[r_bed1 r_living] params=[]",
      "wall r_living|r_hall on=[r_hall r_living] params=[]",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Equivariance: a frame moves coordinates, never a dependency
// ---------------------------------------------------------------------------

/**
 * `depends` as `p0` would read under `g`: every contact's edge acted on by `g` (`actOnSide`, the
 * frame's linear part), re-sorted by room then edge; everything else as it is.
 */
function underFrame(d: DependsFacts | undefined, g: { rotate: 0 | 90 | 180 | 270; mirror?: "x" }): string {
  const el = fromSpelling(g.rotate, g.mirror);
  const elements = (d?.elements ?? []).map((e) =>
    e.contacts
      ? {
          ...e,
          contacts: e.contacts
            .map((c) => ({ room: c.room, edge: actOnSide(el, c.edge) }))
            .sort((p, q) => byCode(p.room, q.room) || byCode(p.edge, q.edge)),
        }
      : e,
  );
  return JSON.stringify(d ? { ...d, elements } : d);
}

suite("equivariance: `on` and `params` do not move with the frame", () => {
  it.each(ELIGIBLE_EXAMPLES)(
    "%s",
    (rel) => {
      const p0 = describe(wrapperSource(rel, null), { world: EXAMPLES_WORLD, facts: ["depends"] });
      // Non-vacuous: every eligible example resolves as a placed instance (measured: 30 of 30,
      // each with at least one row that depends on something).
      expect(p0.ok, `${rel} placed`).toBe(true);
      // Every id is namespaced into the instance exactly as the element ids are.
      const known = new Set(p0.depends!.elements.map((e) => e.id));
      for (const e of p0.depends!.elements) for (const id of e.on) expect(known.has(id), `${e.id} → ${id}`).toBe(true);
      for (const g of corpusElements(rel)) {
        const gP = describe(wrapperSource(rel, g), { world: EXAMPLES_WORLD, facts: ["depends"] });
        expect(JSON.stringify(gP.depends), `${rel} under ${g.name}`).toBe(underFrame(p0.depends, g));
      }
    },
    120_000,
  );

  it("random plans placed by a random element", () => {
    const element = fc.constantFrom(...D4_TEST_ELEMENTS.filter((g) => g.name !== "e"));
    fc.assert(
      fc.property(planSpec, element, (spec, g) => {
        const t = g.translate ? translationFor(spec.grid ?? 0) : 0;
        const at = (r: 0 | 90 | 180 | 270, mirror?: "x") =>
          withInstance(spec, { rotate: r, ...(mirror ? { mirror } : {}), at: { x: t, y: t } });
        const p0 = describe(withInstance(spec, { rotate: 0, at: { x: 0, y: 0 } }), { facts: ["depends"] });
        const gP = describe(at(g.rotate, g.mirror), { facts: ["depends"] });
        expect(p0.depends, "the instance variant emits only plans that resolve").toBeDefined();
        expect(JSON.stringify(gP.depends)).toBe(underFrame(p0.depends, g));
      }),
      { numRuns: 30 },
    );
  }, 120_000);
});

const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function storeys(s: SceneSummary): Array<Pick<SceneSummary, "depends">> {
  return s.levels && s.levels.length > 0 ? s.levels : [s];
}
