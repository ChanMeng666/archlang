/**
 * The D4 ⋉ Z² equivariance oracle over the shipped examples — tiers T0, T1 and T2 — and the
 * `STILL …` witness of every pinned class.
 *
 * `place c() as g at t rotate r mirror m` must carry every fact through g's action: that is
 * the premise of the whole `place` design (`src/frame.ts`). This suite measures it on the
 * real corpus and holds the result to `test/equivariance-known.ts` in BOTH directions — a
 * violation that is not pinned (by element, within its row's size bound) is a regression
 * or a new finding; a pin that no longer reproduces is a fix whose pin (and witness) must
 * now be deleted. Every pinned violation is also AUDITED: its row's class predicate must
 * account for it. See `test/d4-oracle.ts` for the construction (P₀ vs gP, both whole-file
 * imports of the example) and for what is compared, gated or excluded, each with its
 * reason.
 *
 *  - T0 — P₀ is a faithful proxy for the example P itself.
 *  - T1 — `describe()` and every lint rule, invariant or equivariant as the oracle predicts.
 *  - T2 — the circulation raster, compared when the nav-grid lattice maps onto itself and
 *    under every translation, one fact per room.
 *
 * T3 (the drawn scene) is `test/equivariance-scene.test.ts`; random plans are
 * `test/equivariance-fuzz.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { composeFrame, tp } from "../src/frame.js";
import {
  compile,
  describe as describePlan,
  type ElementDef,
  lint,
  makeVirtualWorld,
  registerElement,
} from "../src/index.js";
import { levelBlocks, type RFurniture } from "../src/ir.js";
import { LINT_RULES } from "../src/lint.js";
import { entryEdges, verticalsOf } from "../src/vertical.js";
import {
  astOf,
  canonPrim,
  compareObservations,
  CURATED_EXAMPLES,
  D4_ELEMENTS,
  D4_TEST_ELEMENTS,
  ELIGIBLE_EXAMPLES,
  EXAMPLES_WORLD,
  elementNamed,
  explain,
  idOfKey,
  frameFor,
  latticeAligned,
  lin,
  type Observed,
  observe,
  overlayOf,
  pinAudit,
  pinDiff,
  RULE_CLASS,
  type Run,
  runFacts,
  SHIPPED_EXAMPLES,
  sceneOf,
  t0Violations,
  toObserved,
  type WitnessOptions,
  witnessCase,
  witnessPair,
  wrapperSource,
} from "./d4-oracle.js";
import { type ClassName, KNOWN, KNOWN_CLASSES } from "./equivariance-known.js";

/** Generous: the heaviest example runs a dozen full describe() + lint() passes. */
const SLOW = 120_000;

/** The two-way pin assertion for one scope, then the audit, with offenders spelled out. */
function assertPinned(
  where: string,
  scope: (o: Pick<Observed, "where" | "g" | "path" | "id">) => boolean,
  runs: readonly Run[],
): void {
  const observed = runs.flatMap((r) => toObserved(where, r.tag, r.vs));
  const { added, vanished } = pinDiff(KNOWN, observed, scope);
  const detail = added
    .map((k) => {
      const [, tag, path, idAndDelta = ""] = k.split(" | ");
      const id = idAndDelta.split("  ")[0];
      const vs = runs.find((r) => r.tag === tag)?.vs.filter((v) => v.path === path && idOfKey(v.key) === id) ?? [];
      return `${k}\n${explain(vs, 3)}`;
    })
    .join("\n");
  expect(
    added,
    `NEW equivariance violation — pin it in test/equivariance-known.ts with a class, a witness and a why:\n${detail}`,
  ).toEqual([]);
  expect(vanished, `FIXED: delete the pin and its witness:\n${vanished.join("\n")}`).toEqual([]);
  const scoped = runs.map((r) => ({
    ...r,
    vs: r.vs.filter((v) => scope({ where, g: r.tag, path: v.path, id: "" })),
  }));
  expect(pinAudit(KNOWN, KNOWN_CLASSES, where, scoped), "a pin whose class does not account for it").toEqual([]);
}

describe("the oracle's own construction", () => {
  it("the corpus is COMPUTED: every shipped example with no `level` block", () => {
    const multi = SHIPPED_EXAMPLES.filter((rel) => levelBlocks(astOf(rel)).length > 0);
    expect(multi.length).toBeGreaterThan(0); // the filter has something to exclude…
    expect(ELIGIBLE_EXAMPLES.length).toBe(SHIPPED_EXAMPLES.length - multi.length);
    expect(ELIGIBLE_EXAMPLES.length).toBeGreaterThan(20); // …and leaves a real corpus
    for (const rel of CURATED_EXAMPLES) expect(ELIGIBLE_EXAMPLES).toContain(rel);
  });

  it("D4_ELEMENTS is the whole dihedral group: eight distinct matrices, closed under composition", () => {
    const key = (f: { a: number; b: number; c: number; d: number }) => `${f.a},${f.b},${f.c},${f.d}`;
    const mats = new Set(D4_ELEMENTS.map((g) => key(frameFor(g, 0))));
    expect(mats.size).toBe(8);
    for (const a of D4_ELEMENTS)
      for (const b of D4_ELEMENTS) expect(mats.has(key(composeFrame(frameFor(a, 0), frameFor(b, 0))))).toBe(true);
    expect(D4_TEST_ELEMENTS.filter((g) => g.translate)).toHaveLength(1);
  });

  it("RULE_CLASS classifies LINT_RULES exactly — no rule unclassified, no stale key", () => {
    expect(Object.keys(RULE_CLASS).sort()).toEqual(LINT_RULES.map((r) => r.name).sort());
  });

  it(
    "the per-rule fold IS lint() (so the rule a violation names is the rule that raised it)",
    () => {
      let checked = 0;
      for (const rel of ELIGIBLE_EXAMPLES) {
        const src = wrapperSource(rel, null);
        const obs = observe(src);
        if (!obs.ir) continue;
        expect(
          obs.lint.flatMap((r) => r.diags),
          rel,
        ).toEqual(lint(src, { world: EXAMPLES_WORLD }));
        checked++;
      }
      expect(checked).toBeGreaterThan(20);
    },
    SLOW,
  );

  it("the prediction can FAIL: r270 observed against r90's prediction is caught", () => {
    // Prove the sweep can go red before trusting it green (docs/testing.md §5).
    const rel = "studio.arch";
    const obs0 = observe(wrapperSource(rel, null));
    const obsG = observe(wrapperSource(rel, elementNamed("r270")));
    const wrong = frameFor(elementNamed("r90"), astOf(rel).grid);
    const gate = { raster: false, compass: false, sheet: true, scale: true };
    const vs = compareObservations(obs0, obsG, wrong, "up", gate).map((v) => v.path);
    expect(vs).toContain("rooms[].bbox");
    expect(vs).toContain("windows[].facing");
  });

  it("every pin names a known class and a corpus example, with a why and what closes it", () => {
    for (const row of KNOWN) {
      expect(Object.keys(KNOWN_CLASSES)).toContain(row.cls);
      for (const w of typeof row.where === "string" ? [row.where] : row.where) expect(ELIGIBLE_EXAMPLES).toContain(w);
      expect(row.why.length).toBeGreaterThan(10);
      expect(row.closesWith.length).toBeGreaterThan(5);
    }
  });

  it("every raster pin names its rooms and bounds its size", () => {
    // A raster row that pinned a path for every room, or any magnitude, would absorb a
    // raster regression of any size — which is what `maxDelta` and `ids` exist to stop.
    for (const row of KNOWN.filter((r) => r.path.startsWith("circulation.rooms[]"))) {
      expect(row.ids?.length ?? 0, row.why).toBeGreaterThan(0);
      expect(row.maxDelta, row.why).toBeDefined();
    }
  });
});

describe("T0 — P₀ (the example imported and placed at the origin) is faithful to P", () => {
  it.each(ELIGIBLE_EXAMPLES)(
    "%s",
    (rel) => assertPinned(rel, (o) => o.where === rel && o.g === "T0", [{ tag: "T0", vs: t0Violations(rel) }]),
    SLOW,
  );
});

describe("T1 + T2 — describe(), every lint rule, and the raster, under the group", () => {
  it.each(ELIGIBLE_EXAMPLES)(
    "%s",
    (rel) => {
      const runs = runFacts(rel);
      // A P₀ that does not resolve is T0's finding (pinned there); there is nothing to act on.
      if (runs === null) {
        const pinned = KNOWN.some((k) => k.where === rel && k.g === "T0" && k.path === "ok");
        expect(pinned, `${rel}: P₀ does not resolve and T0 does not pin it`).toBe(true);
        return;
      }
      assertPinned(rel, (o) => o.where === rel && o.g !== "T0" && !o.path.startsWith("scene."), runs);
    },
    SLOW,
  );
});

// ---------------------------------------------------------------------------
// The witnesses: one minimal plan per class, each asserting the violation STILL holds
// and that the class's own predicate still accounts for it. When a class is fixed its
// witness fails here in the same run its corpus pins vanish.
// ---------------------------------------------------------------------------

/** A single room behind a shell — the smallest plan the witnesses below decorate. */
const room = (w: number, h: number, id = "r"): string =>
  `    wall id=shell exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }
    room id=${id} at (0,0) size ${w}x${h} label "Room"`;

/**
 * Reproduce a class: run the witness under `g`, find the violation at `key`, and require
 * the class — and NO OTHER — to account for it. The exclusivity is what shows the fuzz
 * suite's predicates discriminate by mechanism rather than blanket a path: each witness is
 * a violation every other class declines. Returns the violation so the witness can pin
 * its numbers.
 */
function reproduce(cls: ClassName, body: string, gname: string, key: string, opts: WitnessOptions = {}) {
  const { vs, ctx } = witnessCase(body, elementNamed(gname), opts);
  const v = vs.find((x) => x.key === key || x.path === key);
  expect(v, `${cls}: no ${key} under ${gname}; saw ${vs.map((x) => x.key).join(", ")}`).toBeDefined();
  const covering = (Object.keys(KNOWN_CLASSES) as ClassName[]).filter((k) => KNOWN_CLASSES[k].covers(v!, ctx));
  expect(covering, `${key} under ${gname} must be ${cls}'s alone`).toEqual([cls]);
  return v!;
}

/** `MULTI_LIB` of test/lint-file-provenance.test.ts, verbatim: a WC standing with its back to
 *  the room, inside an imported component. */
const MULTI_LIB = `plan "lib" {
  component wing() {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
    room id=lounge at (0,0) size 6000x5000 label "Powder room"
    dim (0,0)->(6000,0) offset 1000
    furniture wc at (100,2000) size 700x400 rotate 180
  }
}`;

/** The `tree` plugin of test/plugins.test.ts, cut down to what reaches the frame. */
const TREE: ElementDef = registerElement({
  kind: "tree",
  keyword: "tree",
  parse(ctx) {
    const kw = ctx.eatKeyword("tree");
    const at = ctx.parsePoint();
    return { kind: "tree", id: "", at, line: kw.line } as never;
  },
  idPrefix: () => "tree",
  resolve(node, ctx) {
    const n = node as unknown as { at: Parameters<typeof ctx.evalPt>[0]; span?: unknown };
    return { kind: "tree", id: ctx.id, at: ctx.snapPt(ctx.evalPt(n.at)), span: n.span } as never;
  },
  bounds: (r) => [(r as unknown as { at: { x: number; y: number } }).at],
  render: () => [],
});

/** The drum of the float witness: a circular room behind a two-arc wall. */
const DRUM = (r: number): string =>
  `    wall id=drum exterior thickness 300 { (0,${r}) arc (${2 * r},${r}) radius ${r} arc (0,${r}) radius ${r} }
    room id=rot circle at (${r},${r}) radius ${r}
    door id=d at (${r},${2 * r}) width 1200 wall drum`;

/** One `it` per witness, keyed by class — the type makes a class without a witness a
 *  compile error, and the last test makes it a red one too. */
const WITNESSES: Record<ClassName, [string, () => void][]> = {
  "facing-tie": [
    [
      "(DECLARED) STILL resolves a corner window's tie N/S-first, so a quarter-turn changes it",
      () => {
        const body = `${room(4000, 4000)}
    window id=wc at (4000,0) width 900 wall shell`;
        const v = reproduce("facing-tie", body, "r90", "windows[g.wc].facing");
        expect(v.expected).toBe('{"facing":"E"}'); // g · N
        expect(v.actual).toBe('{"facing":"S"}'); // the tie, read N/S-first on the turned plan
        expect(KNOWN_CLASSES["facing-tie"].status).toBe("declared");
      },
    ],
  ],
  "raster-tie": [
    [
      "STILL moves a single room's walk by its endpoints' one-cell ties",
      () => {
        // No furniture, one room: the entrance (x = 2000) is on a lattice line and the room's
        // centre on a lattice corner. The walk still moves, by exactly those ties.
        const body = `${room(4000, 3000)}
    door id=d at (2000,3000) width 900 wall shell`;
        const v = reproduce("raster-tie", body, "r180", "circulation.rooms[g.r].walk");
        expect([v.expected, v.actual]).toEqual(["1500", "1400"]);
      },
    ],
    [
      "STILL measures a mirrored walk two cells apart on an ALIGNED lattice",
      () => {
        const body = `    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    wall id=mid partition thickness 100 { (3000,0) (3000,4000) }
    room id=a at (0,0) size 3000x4000 label "Hall"
    room id=b at (3000,0) size 3000x4000 label "Bed"
    door id=d_ext at (1500,4000) width 900 wall shell
    door id=d_in at (3000,2000) width 900 wall mid`;
        expect(latticeAligned(observe(witnessPair(body, elementNamed("mx")).p0).ir)).toBe(true);
        const v = reproduce("raster-tie", body, "mx", "circulation.rooms[g.b].walk");
        expect([v.expected, v.actual]).toEqual(["4800", "5000"]);
      },
    ],
  ],
  "entrance-seed-walk": [
    [
      "STILL walks a turned entrance seven cells in past a table's halo",
      () => {
        // The door (y = 1400) is on a lattice line; P₀ seeds on the row below it, gP on the
        // image of the row above, which the table's clearance halo erodes.
        const body = `    wall id=shell exterior thickness 200 { (0,0) (3200,0) (3200,2100) (0,2100) close }
    room id=r at (0,0) size 3200x2100 label "Hall"
    door id=d at (0,1400) width 700 wall shell
    furniture id=t table at (0,200) size 500x900`;
        const v = reproduce("entrance-seed-walk", body, "r90", "circulation.rooms[g.r].walk");
        expect([v.expected, v.actual]).toEqual(["1800", "1100"]);
      },
    ],
    [
      "STILL drops a sealed-on-one-side entrance's width out of a turned room's bottleneck",
      () => {
        // Three entrances side by side (fuzz seed 12, case 308). The 1400 mm opening's centre is
        // on a lattice line; in P₀ it seeds and sets the widest way in, in gP its tied cell is
        // inside the cabinets' halo and it seeds nowhere — so the bottleneck falls to the next
        // door's 740 mm. Rate: 1 case in 3000 random plans.
        const body = `    wall id=shell exterior thickness 150 { (0,0) (2200,0) (2200,2800) (0,2800) close }
    room id=r at (0,0) size 2200x2800 label "Office"
    door id=d1 on shell at 17% width 800
    opening id=wide on shell at 15% width 1400
    door id=d2 on shell at 81% width 700
    furniture id=s cabinet at (200,200) size 1200x900
    furniture id=c cabinet at (0,830) size 1200x1800`;
        const { ctx } = witnessCase(body, elementNamed("r270"));
        expect(ctx.entranceShift()).toBe(Number.POSITIVE_INFINITY);
        const v = reproduce("entrance-seed-walk", body, "r270", "circulation.rooms[g.r].bottleneck");
        expect([v.expected, v.actual]).toEqual(["1400", "740"]);
        // The class is BOUNDED to exactly this: a planted regression in the bottleneck —
        // any other value on either side — is not absorbed.
        const cls = KNOWN_CLASSES["entrance-seed-walk"];
        const { ctx: c2 } = witnessCase(body, elementNamed("r270"));
        for (const [expected, actual] of <[string, string][]>[
          ["1400", "600"], // narrower than the widest entrance seeding on both sides (740)
          ["1400", "1234"], // wider than any entrance seeding on gP's side
          ["1300", "740"], // the wider reading is no one-sided entrance's width
          ["740", "1400"], // the one-sided entrance seeds on P₀, not on gP
        ]) {
          expect(cls.covers({ ...v, expected, actual }, c2), `${expected} -> ${actual}`).toBe(false);
        }
      },
    ],
    [
      "STILL seals a turned room whose own entrance seeds on one side only",
      () => {
        // Fuzz seed 91, case 244 (with case 648: 2 in 16 000). The 800 mm barn door `o5` into
        // the utility room seeds in P₀; turned and mirrored its tied seed lands in the
        // cabinets' halo, and the room's other doorway seeds into a pocket — so the room is
        // measured on one side and sealed on the other.
        const body = `    wall id=w_shell exterior thickness 150 { (0,0) (2100,0) (2100,5400) (0,5400) close }
    wall id=w_h1 partition thickness 100 { (0,2600) (2100,2600) }
    room id=r0 at (0,0) size 2100x2600 uses utility
    room id=r1 at (0,2600) size 2100x2800 label "Bed 1"
    opening id=o1 on w_shell at 40% width 1500
    door id=o2 sliding on w_shell at 93% width 700
    door id=o5 barn on w_shell at 89% width 800 slide left
    furniture id=f1 lavatory in r0 centered size 1000x600
    furniture id=f2 shoe_cabinet in r0 centered size 1200x700`;
        const { ctx } = witnessCase(body, elementNamed("r90mx"), { grid: 100 });
        expect(ctx.entranceSides().only0.map((e) => e.id)).toEqual(["g.o5"]);
        const v = reproduce("entrance-seed-walk", body, "r90mx", "circulation.rooms[g.r0].walk", { grid: 100 });
        expect([v.expected, v.actual]).toEqual(["1200", "<absent>"]);
        reproduce("entrance-seed-walk", body, "r90mx", "circulation.blocked", { grid: 100 });
      },
    ],
  ],
  "anchor-far-tie": [
    [
      "STILL measures a turned bedroom on the far side of its bed",
      () => {
        const body = `${room(4000, 3000)}
    door id=d at (2050,3000) width 900 wall shell
    furniture id=b bed at (1300,500) size 1400x2000`;
        const { ctx } = witnessCase(body, elementNamed("r180"));
        const v = reproduce("anchor-far-tie", body, "r180", "circulation.rooms[g.r].walk");
        expect([v.expected, v.actual]).toEqual(["2500", "2300"]);
        expect(ctx.walks().get("g.r")?.anchor).toBeGreaterThan(20); // the measured cell jumped
      },
    ],
  ],
  "threshold-carve": [
    [
      "STILL seals a turned store whose only doorway carves on one side only",
      () => {
        // The inner door's centre (y = 1000) is on a lattice line, so its threshold rows
        // shift by one under r180; the one row the cabinet's halo leaves open is tried in
        // P₀ and not in gP.
        const body = `    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,2000) (0,2000) close }
    wall id=mid partition thickness 100 { (2000,0) (2000,2000) }
    room id=a at (0,0) size 2000x2000 label "Hall"
    room id=b at (2000,0) size 2000x2000 label "Store"
    door id=d_ext at (0,1050) width 900 wall shell
    door id=d_in at (2000,1000) width 900 wall mid
    furniture id=c cabinet at (2050,0) size 600x1000`;
        const v = reproduce("threshold-carve", body, "r180", "circulation.rooms[g.b].walk");
        expect([v.expected, v.actual]).toEqual(["3600", "<absent>"]);
        reproduce("threshold-carve", body, "r180", "circulation.blocked");
      },
    ],
    [
      "STILL measures a turned room split by furniture in the other part its doorway carved into",
      () => {
        // Fuzz seed 22, case 991 (with seed 43 case 447: 2 in 12 000). Furniture splits the
        // bath (r1); the opening o2 has a threshold point on a lattice line, so the part of r1
        // it carves into differs under r90mx — the room's own widest way in changes (700 →
        // 840 mm), and the cell nearest its centre is in a pocket on one side (`fallback`), so
        // that side measures to the nearest REACHABLE cell 23 cells away: no tie, +3600 mm.
        const body = `    wall id=w_shell exterior thickness 100 { (0,0) (6500,0) (6500,6300) (0,6300) close }
    wall id=w_v1 partition thickness 100 { (3000,0) (3000,6300) }
    wall id=w_h1 partition thickness 100 { (0,3500) (6500,3500) }
    room id=r0 at (0,0) size 3000x3500 label "Living" uses utility
    room id=r1 at (3000,0) size 3500x3500 label "Bed 1" uses bath
    room id=r2 at (0,3500) size 3000x2800
    room id=r3 at (3000,3500) size 3500x2800
    opening id=o0 on w_h1 at 16% width 1200
    door id=o1 garage on w_shell at 88% width 900 head 2400
    opening id=o2 on w_v1 at 29% width 1100
    furniture id=f0 urinal in r1 centered size 500x1100
    furniture id=f1 crib in r1 anchor left inset 400 size 900x600
    furniture id=f2 plant at (4136,2632) size 1800x1600 label "Hall" rotate 180 in r3
    furniture id=f3 water_heater against wall w_v1 segment 0 offset 5292 side left size 800x400
    furniture id=f4 outdoor_chair against wall w_v1 segment 0 offset 3024 side left size 900x300
    furniture id=f5 dryer at (0,2989) size 300x1400 label "Living" rotate 0 in r0
    room id=r_circ circle at (11500,8000) radius 1500
    room id=r_base at (9500,16000) size 3000x2500
    room id=r_rel left-of r_base align bottom gap 0 size 2000x2000`;
        const v = reproduce("threshold-carve", body, "r90mx", "circulation.rooms[g.r1].walk", { grid: 100 });
        expect([v.expected, v.actual]).toEqual(["4200", "7800"]);
        const { ctx } = witnessCase(body, elementNamed("r90mx"), { grid: 100 });
        expect(ctx.walks().get("g.r1")).toMatchObject({ anchorTie: false, seedMoved: false, fallback: true });
      },
    ],
  ],
  "float-translation": [
    [
      "STILL flips a pocket door's fix when 20 m of offset rounds its ulp away",
      () => {
        // `at 55%` resolves an ulp short of x = 1400 at the origin (grid 0 snaps nothing),
        // so the reversed run measures 949.999…, a hair under the 950 it needs; translated,
        // the ulp rounds away and the reverse-slide fix appears.
        const body = `    wall id=shell exterior thickness 300 { (0,0) (2000,0) (2000,4000) (0,4000) close }
    room id=r at (0,0) size 2000x4000 uses utility
    door id=p pocket on shell at 55% width 900 slide left`;
        const v = reproduce("float-translation", body, "t", "lint.pocket-run.fixes", { grid: 0 });
        expect(v.expected).toBe("[[]]");
        expect(v.actual).toContain("slide right");
      },
    ],
  ],
  "dim-tick-hand": [
    [
      "(DECLARED) STILL draws a mirrored dim's station ticks on the other diagonal — and only them",
      () => {
        const body = `${room(4000, 3000)}
    dim (0,3000)->(4000,3000) offset 400`;
        const { vs } = witnessCase(body, elementNamed("mx"));
        reproduce("dim-tick-hand", body, "mx", "scene.dim[g.dim_1].ticks");
        // The dimension line, its witness lines and (since dim-text-side closed) its number
        // are exact: the declared class is the tick hand alone.
        expect(vs.map((v) => v.key).filter((k) => k.startsWith("scene.dim"))).toEqual(["scene.dim[g.dim_1].ticks"]);
        expect(KNOWN_CLASSES["dim-tick-hand"].status).toBe("declared");
      },
    ],
  ],
};

describe("the pinned classes — each STILL reproduced by a minimal witness", () => {
  for (const [cls, witnesses] of Object.entries(WITNESSES)) {
    for (const [title, run] of witnesses) it(`${cls}: ${title}`, run);
  }

  it("every class in KNOWN_CLASSES has a witness here, and nothing else does", () => {
    expect(Object.keys(WITNESSES).sort()).toEqual(Object.keys(KNOWN_CLASSES).sort());
    for (const ws of Object.values(WITNESSES)) expect(ws.length).toBeGreaterThan(0);
  });
});

/** Closed classes: each former `STILL …` witness, inverted into the law it was waiting for. */
describe("closed classes — each former witness is now the law", () => {
  it("label-point-tie (W3b): a concave room is measured over its pole ORBIT, so no turn or flip moves its seed", () => {
    // The former witness: a U-shaped gallery whose centroid is in its notch. The pole of
    // inaccessibility scan keeps the first of two equally wide arms, so mirrored the room was
    // measured in its other arm. It is now measured to the nearest of every pole the scan
    // finds on the ring turned or flipped — a set no page order can change.
    const u = "(0,0) (6000,0) (6000,4000) (4000,4000) (4000,1000) (2000,1000) (2000,4000) (0,4000)";
    const c = "(0,0) (5000,0) (5000,1500) (1500,1500) (1500,3500) (5000,3500) (5000,5000) (0,5000)";
    for (const [ring, door] of [
      [u, "(3050,0)"],
      [c, "(0,2450)"],
    ] as const) {
      const body = `    wall id=shell exterior thickness 200 { ${ring} close }
    room id=u polygon ${ring} label "Gallery"
    door id=d at ${door} width 900 wall shell`;
      for (const g of D4_ELEMENTS) {
        const { vs, ctx } = witnessCase(body, g);
        expect(ctx.walks().get("g.u")?.seedMoved ?? false, `${ring} ${g.name}`).toBe(false);
        // Anything left is an endpoint tie of the cell measured to, never an arm swap.
        for (const v of vs.filter((x) => x.path === "circulation.rooms[].walk")) {
          expect(KNOWN_CLASSES["raster-tie"].covers(v, ctx), `${ring} ${g.name} ${v.key}`).toBe(true);
        }
      }
    }
  });

  it("label-point-tie (W3b): the PICK within the orbit is D4-symmetric — the chosen point maps to the chosen point", () => {
    // The orbit is a set; the pole the room is measured to is chosen from it by fewest hops,
    // then straight-line distance from the walk's own entrance, then the candidate's offsets
    // from the room's centre as a sorted multiset — never by cell index (that settles only a
    // tie some symmetry of the whole plan maps onto itself, where every fact is equal).
    const ring = "(0,0) (6000,0) (6000,4000) (4000,4000) (4000,1000) (2000,1000) (2000,4000) (0,4000)";
    const body = (x: number) => `    wall id=shell exterior thickness 200 { ${ring} close }
    room id=u polygon ${ring} label "Gallery"
    door id=d at (${x},0) width 900 wall shell`;
    const measured = (src: string) => overlayOf(observe(src).ir!)!.rooms.find((r) => r.roomId === "g.u")!;
    const ends = (path: readonly { x: number; y: number }[]) => [path[0], path[path.length - 1]];
    for (const g of D4_ELEMENTS) {
      const f = frameFor(g, 50);
      // A door off the lattice line: the entrance seeds without a tie, so the chosen seed and
      // the walk's two ends (entrance cell, measured cell) are exactly equivariant.
      const off = witnessPair(body(3050), g);
      const m0 = measured(off.p0);
      const mG = measured(off.gP);
      expect(mG.seed, g.name).toEqual(tp(f, m0.seed));
      expect(ends(mG.path), g.name).toEqual(ends(m0.path.map((p) => tp(f, p))));
      // A door dead on the axis of the mirror-symmetric U: the entrance itself seeds across a
      // lattice line (E.6), so the nearer arm — and the seed — follows that tie; the facts
      // (walk, detour) are still equal under every element.
      const on = witnessPair(body(3000), g);
      const c0 = observe(on.p0).summary.circulation!.rooms[0]!;
      const cG = observe(on.gP).summary.circulation!.rooms[0]!;
      expect([cG.walkDistanceMm, cG.detourRatio], g.name).toEqual([c0.walkDistanceMm, c0.detourRatio]);
      // The case the row-major pick got wrong: an asymmetric U whose pole (1015, 1000) sits
      // on a lattice line, so two cells are equally near it (rows 950 and 1050), and a
      // second pole (1015, 3000) is as many hops away as the farther of them. The first
      // cell in row-major order was taken; under a half-turn that is the image of the other
      // cell, and the walk moved by a cell. Fewest hops decides it now, under every element.
      const asym = "(0,0) (7000,0) (7000,5000) (5000,5000) (5000,1000) (2000,1000) (2000,4000) (0,4000)";
      const side = `    wall id=shell exterior thickness 200 { ${asym} close }
    room id=u polygon ${asym} label "Gallery"
    door id=d at (0,1950) width 900 wall shell`;
      const a = witnessPair(side, g);
      const a0 = measured(a.p0);
      const aG = measured(a.gP);
      expect(a0.path.at(-1), "P₀ measures to the cell fewer hops away").toEqual({ x: 1050, y: 1050 });
      expect(aG.seed, g.name).toEqual(tp(f, a0.seed));
      expect(ends(aG.path), g.name).toEqual(ends(a0.path.map((p) => tp(f, p))));
      expect(observe(a.gP).summary.circulation!.rooms[0], g.name).toEqual(observe(a.p0).summary.circulation!.rooms[0]);
    }
  });

  it("float-translation, circulation half (W3b): a curved room's walk is exactly invariant under translation", () => {
    // The former witness: a drum 20 m out measured 3200 mm against 3100 at the origin,
    // because its tessellated ring re-rounds. The nav grid now samples in its extent's own
    // frame, snapped to a dyadic lattice, so the ring reads the same numbers on both sides.
    for (const r of [3400, 2150, 5075]) {
      const { vs, ctx } = witnessCase(DRUM(r), elementNamed("t"));
      expect(
        vs.filter((v) => v.path.startsWith("circulation")).map((v) => v.key),
        `r = ${r}`,
      ).toEqual([]);
      expect(ctx.floatSensitive, `r = ${r}: the case must still re-round`).toBe(true);
      const walk = (o: typeof ctx.obs0) => o.summary.circulation?.rooms.find((x) => x.roomId === "g.rot");
      expect(walk(ctx.obsG), `r = ${r}`).toEqual(walk(ctx.obs0));
      expect(walk(ctx.obs0), `r = ${r}: the room is measured`).toBeDefined();
    }
    // …and whole-millimetre translations that are not a whole number of cells. (A
    // non-integer translation of the resolved plan is `test/circulation-translation.test.ts`.)
    const odd = (dx: number) =>
      `plan "w" {\n  units mm\n  component c() {\n${DRUM(3400)}\n  }\n  place c() as g at (${dx},${dx})\n}`;
    const at0 = describePlan(odd(0)).circulation?.rooms;
    for (const dx of [37, 20013, 123457]) expect(describePlan(odd(dx)).circulation?.rooms, `dx = ${dx}`).toEqual(at0);
  });

  it("plugin-throw (backlog E.4): a plugin element inside a placed component is E_INSTANCE_NO_TRANSFORM, never a throw", () => {
    const flat = `plan "p" {\n  units mm\n  room at (0,0) size 4000x3000\n  tree (1000,1000)\n}`;
    const placed = `plan "p" {\n  units mm\n  component c() {\n    room at (0,0) size 4000x3000\n    tree (1000,1000)\n  }\n  place c() as g at (0,0)\n}`;
    expect(compile(flat, { plugins: [TREE], noCache: true }).errors).toEqual([]); // the control
    // A user-source situation comes back as a Diagnostic (AGENTS.md), even at the IDENTITY frame.
    let out: ReturnType<typeof compile> | undefined;
    expect(() => {
      out = compile(placed, { plugins: [TREE], noCache: true });
    }).not.toThrow();
    expect(out!.diagnostics.map((d) => d.code)).toEqual(["E_INSTANCE_NO_TRANSFORM"]);
    expect(out!.diagnostics[0]).toMatchObject({ severity: "error", instance: "g", component: "c" });
  });

  it("fix-pullback (backlog E.1): a placed component's fixture fix writes the LOCAL quarter-turn, under every g", () => {
    const world = makeVirtualWorld({ "lib.arch": MULTI_LIB });
    const opts = { declare: `import "lib.arch": wing as c`, world };
    const fix = (src: string) =>
      lint(src, { world })
        .find((d) => d.code === "W_FIXTURE_BACK_TO_ROOM")
        ?.fixes?.[0]?.edits.map((e) => e.newText);
    for (const g of D4_ELEMENTS) {
      const { p0, gP } = witnessPair("", g, opts);
      // Both edits land on the same bytes of lib.arch, so they say the same thing.
      expect(fix(p0), g.name).toEqual(["rotate 270"]);
      expect(fix(gP), g.name).toEqual(["rotate 270"]);
      const { vs } = witnessCase("", g, opts);
      expect(
        vs.filter((v) => v.path === "lint.fixture-back-to-room.fixes").map((v) => v.key),
        g.name,
      ).toEqual([]);
    }
  });

  it("fix-pullback (backlog E.1): a placed component's dim bump writes the LOCAL offset, under every g", () => {
    const body = `${room(4000, 3000)}
    dim (0,3000)->(4000,3000) offset 400
    dim (0,3000)->(4000,3000) offset 450`;
    const bump = (src: string) =>
      lint(src)
        .filter((d) => d.code === "W_DIM_OVERLAP")
        .flatMap((d) => d.fixes?.[0]?.edits.map((e) => e.newText) ?? []);
    for (const g of D4_ELEMENTS) {
      const { p0, gP } = witnessPair(body, g);
      expect(bump(p0), g.name).toEqual(["offset 626"]);
      // A reflection negated the offset on the way into plan space; the fix negates it back.
      expect(bump(gP), g.name).toEqual(["offset 626"]);
      const { vs } = witnessCase(body, g);
      expect(
        vs.filter((v) => v.path === "lint.dim-overlap.fixes").map((v) => v.key),
        g.name,
      ).toEqual([]);
    }
  });

  it("nested-ref (backlog E.16): a reference into a nested instance resolves once the plan is itself placed", () => {
    const inner = `  component inner() {\n${room(4000, 3000, "main")}\n  }`;
    const ref = "furniture id=f trolley in c2.main anchor bottom-right inset 300 size 700x500";
    const flat = `plan "w" {\n  units mm\n${inner}\n  place inner() as c2 at (0,0)\n  ${ref}\n}`;
    const nested = `plan "w" {\n  units mm\n${inner}\n  component c() {\n    place inner() as c2 at (0,0)\n    ${ref}\n  }\n  place c() as g at (0,0)\n}`;
    const piece = (src: string, id: string) =>
      resolvePlan(src).ir?.elements.find((e): e is RFurniture => e.kind === "furniture" && e.id === id);
    expect(compile(flat, { noCache: true }).diagnostics).toEqual([]); // the control
    // At the IDENTITY frame: composition, not equivariance — the placed plan is the plan.
    expect(compile(nested, { noCache: true }).diagnostics).toEqual([]);
    const a = piece(flat, "f");
    const b = piece(nested, "g.f");
    // Anchored bottom-right inset 300 in the 4000×3000 room: the same footprint either way.
    expect(a?.at).toEqual({ x: 3000, y: 2200 });
    expect({ at: b?.at, size: b?.size }).toEqual({ at: a?.at, size: a?.size });
    // Every shipped example that reaches into its instances survives being placed.
    for (const rel of ["clinic.arch", "museum-wings.arch"]) expect(t0Violations(rel), rel).toEqual([]);
  });

  /** The keys of a witness's violations that start with `prefix`. */
  const keysOf = (body: string, g: string, prefix: string): string[] =>
    witnessCase(body, elementNamed(g))
      .vs.map((v) => v.key)
      .filter((k) => k.startsWith(prefix));

  it("stair-tail (backlog E.2): a turned stair is entered from the IMAGE of its authored end", () => {
    const body = `${room(6000, 4000)}
    door id=d at (3000,4000) width 900 wall shell
    stair id=st at (1000,500) size 1200x3000 dir up`;
    const g = elementNamed("r90");
    const f = frameFor(g, 50);
    const { p0, gP } = witnessPair(body, g);
    const tail = (src: string) => entryEdges(verticalsOf(observe(src).ir!)[0]!);
    const side = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const turned = tail(p0).map((e) => {
      const v = lin(f, side[e]);
      return (Object.keys(side) as (keyof typeof side)[]).find((k) => side[k].x === v.x && side[k].y === v.y);
    });
    expect(tail(p0)).toEqual(["bottom"]);
    expect(turned).toEqual(["left"]); // what the group predicts…
    expect(tail(gP)).toEqual(["left"]); // …is what the placed stair answers (the page rule said "right")
    expect(keysOf(body, "r90", "scene.stair")).toEqual([]);
  });

  it("stair-break-hand (backlog E.3): a mirrored stair's break line is the mirror image", () => {
    const body = `${room(6000, 4000)}
    stair id=st at (1000,500) size 1200x3000 dir up`;
    expect(keysOf(body, "mx", "scene.stair")).toEqual([]);
    // Not vacuous: the SAME footprint authored at the root draws the other hand, so the
    // placed stair's lines really did change.
    const { gP } = witnessPair(body, elementNamed("mx"), { fixedSheet: true });
    const root = `plan "witness" {\n  units mm\n  grid 50\n  paper A0 landscape\n  scale 1:100\n    stair id=st at (-2200,500) size 1200x3000 dir up\n}\n`;
    const lines = (src: string) =>
      sceneOf(src)
        .nodes.filter((n) => n.elementKind === "stair" && n.prim.t === "line")
        .map((n) => canonPrim(n.prim))
        .sort();
    expect(lines(gP)).not.toEqual(lines(root));
  });

  it("slide-track (backlog E.12): a mirrored sliding door's fixed panel keeps its track's side", () => {
    for (const slide of ["left", "right"]) {
      const body = `${room(4000, 3000)}
    door id=d sliding at (2000,3000) width 1600 wall shell slide ${slide} open 0.3`;
      for (const g of D4_ELEMENTS) expect(keysOf(body, g.name, "scene.door"), `${slide} ${g.name}`).toEqual([]);
    }
    // The control: a hinged door never read the track, and was already equivariant.
    const hinged = `${room(4000, 3000)}
    door id=d at (2000,3000) width 900 wall shell hinge left swing in`;
    for (const g of D4_ELEMENTS) expect(keysOf(hinged, g.name, "scene.door"), g.name).toEqual([]);
  });

  it("slide-track (backlog E.12): a mirrored door inside a mirrored component takes the UNPLACED track", () => {
    const inner = `  component inner() {\n${room(4000, 3000)}\n    door id=d sliding at (2000,3000) width 1600 wall shell slide left\n  }`;
    const src = (outer: string, child: string) =>
      `plan "n" {\n  units mm\n  grid 50\n  paper A0 landscape\n  scale 1:100\n${inner}\n  component outer() {\n    place inner() as i at (0,0)${child}\n  }\n  place outer() as g at (0,0)${outer}\n}\n`;
    const panels = (s: string) =>
      sceneOf(s)
        .nodes.filter((n) => n.elementKind === "door")
        .map((n) => canonPrim(n.prim))
        .sort();
    // mirror x ∘ mirror x is the identity, so the door is drawn exactly as never placed…
    expect(panels(src(" mirror x", " mirror x"))).toEqual(panels(src("", "")));
    // …and a single reflection is not (the check can fail).
    expect(panels(src(" mirror x", ""))).not.toEqual(panels(src("", "")));
  });

  it("column-corner (backlog E.13): a column is carried as the TOP-LEFT rectangle it is", () => {
    const body = `${room(4000, 3000)}
    column id=k at (1000,1000) size 400x600`;
    for (const g of D4_ELEMENTS) expect(keysOf(body, g.name, "scene.column"), g.name).toEqual([]);
    // Top-left (1000,1000), 400×600, turned 90°: the footprint is x ∈ [-1600,-1000].
    const { gP } = witnessPair(body, elementNamed("r90"));
    const k = observe(gP).ir!.elements.find((e) => e.kind === "column") as { at: { x: number }; size: { w: number } };
    expect([k.at.x, k.at.x + k.size.w]).toEqual([-1600, -1000]);
  });

  it("dim-text-side (backlog E.14): a ROOT dim's number rides outside its line for either sign of offset", () => {
    const at = (offset: number): { text: number; line: number } => {
      const src = `plan "root" {\n  units mm\n  paper A0 landscape\n  scale 1:100\n${room(4000, 3000)}\n    dim (0,3000)->(4000,3000) offset ${offset}\n}\n`;
      const nodes = sceneOf(src).nodes.filter((n) => n.layer === "dims");
      const text = nodes.find((n) => n.prim.t === "text");
      const line = nodes.find((n) => n.prim.t === "line" && n.prim.a.y === n.prim.b.y);
      return {
        text: text?.prim.t === "text" ? text.prim.at.y : Number.NaN,
        line: line?.prim.t === "line" ? line.prim.a.y : Number.NaN,
      };
    };
    // from→to runs +x and its left normal is (0, 1) on screen (+y down), so a positive offset
    // draws the line below the wall at y = 3000 and a negative one above it.
    const pos = at(400);
    const neg = at(-400);
    expect([pos.line, neg.line]).toEqual([3400, 2600]);
    expect(pos.text).toBeGreaterThan(3400); // outside, away from the wall
    expect(neg.text).toBeLessThan(2600); // outside, away from the wall — never between
    expect(pos.text - 3400).toBeCloseTo(2600 - neg.text, 9); // the same standoff, mirrored
  });

  it("dim-text-side (backlog E.14): a mirrored dim's number is the mirror image of its own", () => {
    const body = `${room(4000, 3000)}
    dim (0,3000)->(4000,3000) offset 400
    dim (0,0)->(4000,0) offset 0 text "4000"`;
    const { p0, gP } = witnessPair(body, elementNamed("mx"), { fixedSheet: true });
    const numberYs = (src: string): number[] =>
      sceneOf(src)
        .nodes.filter((x) => x.elementKind === "dim" && x.prim.t === "text")
        .map((n) => (n.prim.t === "text" ? n.prim.at.y : Number.NaN));
    // `mirror x` keeps y, so each number keeps its y — including the ZERO-offset call-out,
    // which has no offset sign to carry and takes the frame's handedness (`_mirror`).
    expect(numberYs(gP)).toEqual(numberYs(p0));
    expect(keysOf(body, "mx", "scene.dim").filter((k) => k.endsWith(".text"))).toEqual([]);
  });

  it("dim-text-side (backlog E.14): W_DIM_OVERLAP measures the number where it is drawn, so its verdict and bump are frame-invariant", () => {
    // Two dims on one wall, written in opposite directions with opposite offsets: the SAME
    // drawn line, and (text on `sign(offset) · n`) the same number side. Under the old +n
    // band model a reflection changed the bump (550/−550: −1100 unplaced, −825 mirrored) and
    // the verdict (550/−650: warned unplaced, not mirrored).
    const sheet = "paper A3 landscape\n  scale 1:50\n  ";
    const pair = (a: number, b: number) => {
      const body = `${room(4000, 3000)}
    dim (0,3000)->(4000,3000) offset ${a}
    dim (4000,3000)->(0,3000) offset ${b}`;
      return { body, opts: { declare: `${sheet}component c() {\n${body}\n  }` } };
    };
    const overlaps = (src: string) => lint(src).filter((d) => d.code === "W_DIM_OVERLAP");
    const bump = (src: string) => overlaps(src).flatMap((d) => d.fixes?.[0]?.edits.map((e) => e.newText) ?? []);
    for (const [a, b] of [
      [550, -550],
      [550, -650],
    ] as const) {
      const { body, opts } = pair(a, b);
      for (const g of D4_ELEMENTS) {
        const { p0, gP } = witnessPair(body, g, opts);
        expect(overlaps(p0).length, `${a}/${b} ${g.name}`).toBeGreaterThan(0);
        expect(bump(gP), `${a}/${b} ${g.name}`).toEqual(bump(p0));
        const { vs } = witnessCase(body, g, opts);
        expect(
          vs.filter((v) => v.path.startsWith("lint.dim-overlap")).map((v) => v.key),
          `${a}/${b} ${g.name}`,
        ).toEqual([]);
      }
    }
  });

  it("dim-text-side (backlog E.14): at the ROOT, every spelling of a zero offset draws `offset 0`", () => {
    // A `-0` must never pick the number's side: only a reflecting frame does (`_mirror`).
    const plan = (offset: string) =>
      `plan "root" {\n  units mm\n  let z = 0\n${room(4000, 3000)}\n    dim (0,3000)->(4000,3000) offset ${offset} text "4000"\n}\n`;
    const zero = compile(plan("0"), { noCache: true });
    expect(zero.errors).toEqual([]);
    for (const spelling of ["-0", "-z", "0 * -1", "-1 * 0", "0 / -5", "-(z)"]) {
      expect(compile(plan(spelling), { noCache: true }).svg, spelling).toBe(zero.svg);
    }
  });
});
