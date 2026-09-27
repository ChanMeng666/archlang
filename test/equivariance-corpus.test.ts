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
import { composeFrame } from "../src/frame.js";
import { compile, type ElementDef, lint, makeVirtualWorld, registerElement } from "../src/index.js";
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
  "label-point-tie": [
    [
      "STILL measures a mirrored U-shaped room in its other arm",
      () => {
        const ring = "(0,0) (6000,0) (6000,4000) (4000,4000) (4000,1000) (2000,1000) (2000,4000) (0,4000)";
        const body = `    wall id=shell exterior thickness 200 { ${ring} close }
    room id=u polygon ${ring} label "Gallery"
    door id=d at (3050,0) width 900 wall shell`;
        const { ctx } = witnessCase(body, elementNamed("mx"));
        reproduce("label-point-tie", body, "mx", "circulation.rooms[g.u].walk");
        expect(ctx.walks().get("g.u")?.seedMoved).toBe(true);
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
  ],
  "float-translation": [
    [
      "STILL moves a curved room's walk under a pure translation",
      () => {
        const v = reproduce("float-translation", DRUM(3400), "t", "circulation.rooms[g.rot].walk");
        expect([v.expected, v.actual]).toEqual(["3100", "3200"]);
      },
    ],
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
    // whose side rides the sign bit of the `-0` the reflection leaves on its offset.
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
});
