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
import { composeFrame } from "../src/frame.js";
import { compile, type ElementDef, lint, makeVirtualWorld, registerElement } from "../src/index.js";
import { levelBlocks } from "../src/ir.js";
import { LINT_RULES } from "../src/lint.js";
import { entryEdges, verticalsOf } from "../src/vertical.js";
import {
  astOf,
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
  "stair-tail": [
    [
      "STILL enters a turned stair from the fixed page end (ADR 0016: 'Limitation, inherited')",
      () => {
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
        expect(tail(gP)).toEqual(["right"]); // …and what the fixed page rule answers
        reproduce("stair-tail", body, "r90", "scene.stair[g.st]");
      },
    ],
  ],
  "stair-break-hand": [
    [
      "STILL draws a mirrored stair's break line with its original hand",
      () => {
        const body = `${room(6000, 4000)}
    stair id=st at (1000,500) size 1200x3000 dir up`;
        // Under `mirror x` the tail edge (bottom) maps to itself, so the arrow agrees and only
        // the two break-line diagonals differ.
        const v = reproduce("stair-break-hand", body, "mx", "scene.stair[g.st]");
        expect(v.expected.split(" ; ")).toHaveLength(2);
        expect(v.actual.split(" ; ")).toHaveLength(2);
        expect(KNOWN_CLASSES["stair-tail"].covers(v, witnessCase(body, elementNamed("mx")).ctx)).toBe(false);
      },
    ],
  ],
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
  "slide-track": [
    [
      "STILL swaps a mirrored sliding door's panel tracks",
      () => {
        const body = `${room(4000, 3000)}
    door id=d sliding at (2000,3000) width 1600 wall shell slide left`;
        reproduce("slide-track", body, "mx", "scene.door[g.d]");
      },
    ],
  ],
  "column-corner": [
    [
      "STILL lands a turned column one size away",
      () => {
        const body = `${room(4000, 3000)}
    column id=k at (1000,1000) size 400x600`;
        const v = reproduce("column-corner", body, "r90", "scene.column[g.k]");
        // Top-left (1000,1000), 400×600, turned 90°: the true footprint is x ∈ [-1600,-1000];
        // carried as a centre it is drawn at x ∈ [-1000,-400].
        expect(v.expected).toContain("x=-1600");
        expect(v.actual).toContain("x=-400");
      },
    ],
  ],
  "dim-text-side": [
    [
      "STILL puts a ROOT dim's number inside its line for a negative offset — no `place` at all",
      () => {
        const src = `plan "root" {\n  units mm\n  paper A0 landscape\n  scale 1:100\n${room(4000, 3000)}\n    dim (0,3000)->(4000,3000) offset -400\n}\n`;
        const nodes = sceneOf(src).nodes.filter((n) => n.layer === "dims");
        const text = nodes.find((n) => n.prim.t === "text");
        const lineY = nodes
          .map((n) => (n.prim.t === "line" && n.prim.a.y === n.prim.b.y ? n.prim.a.y : Number.NaN))
          .find((y) => y === 2600);
        // The dimension line is at y = 2600 (offset −400 from the wall at 3000); its number
        // is drawn at +n, BETWEEN the line and the wall it measures.
        expect(lineY).toBe(2600);
        const y = text?.prim.t === "text" ? text.prim.at.y : Number.NaN;
        expect(y).toBeGreaterThan(2600);
        expect(y).toBeLessThan(3000);
      },
    ],
    [
      "STILL puts a mirrored dim's number between its line and the building",
      () => {
        const body = `${room(4000, 3000)}
    dim (0,3000)->(4000,3000) offset 400`;
        const { p0, gP } = witnessPair(body, elementNamed("mx"), { fixedSheet: true });
        const numberY = (src: string): number => {
          const n = sceneOf(src).nodes.find((x) => x.elementKind === "dim" && x.prim.t === "text");
          return n?.prim.t === "text" ? n.prim.at.y : Number.NaN;
        };
        // The line sits at y = 3400 on both sides (a reflection in x keeps y). As drawn the
        // number is outside it; mirrored, it is between the line and the wall at y = 3000.
        expect(numberY(p0)).toBeGreaterThan(3400);
        expect(numberY(gP)).toBeLessThan(3400);
        expect(numberY(gP)).toBeGreaterThan(3000);
        reproduce("dim-text-side", body, "mx", "scene.dim[g.dim_1].text");
      },
    ],
    [
      "STILL measures W_DIM_OVERLAP with the text on +n, so an opposite-normal pair bumps differently mirrored",
      () => {
        // Two dims on one wall, written in opposite directions with opposite offsets: the
        // same drawn line. `W_DIM_OVERLAP`'s band carries each number on its +n side
        // whatever the offset's sign (the drawing's convention, measured), so a reflection —
        // which negates both offsets — changes which bands overlap and by how much. Each
        // offered fix clears its own warning; the VALUE is not frame-invariant. Not the
        // pullback (backlog E.1): with the text on the offset's side this closes too.
        const sheet = "paper A3 landscape\n  scale 1:50\n  ";
        const pair = (a: number, b: number) => {
          const body = `${room(4000, 3000)}
    dim (0,3000)->(4000,3000) offset ${a}
    dim (4000,3000)->(0,3000) offset ${b}`;
          return { body, opts: { declare: `${sheet}component c() {\n${body}\n  }` } };
        };
        const bump = (src: string) =>
          lint(src)
            .filter((d) => d.code === "W_DIM_OVERLAP")
            .flatMap((d) => d.fixes?.[0]?.edits.map((e) => e.newText) ?? []);
        const moved = pair(550, -550);
        const w = witnessPair(moved.body, elementNamed("mx"), moved.opts);
        expect(bump(w.p0)).toEqual(["offset -1100"]);
        expect(bump(w.gP)).toEqual(["offset -825"]);
        reproduce("dim-text-side", moved.body, "mx", "lint.dim-overlap.fixes", moved.opts);
        const fired = pair(550, -650);
        const f = witnessPair(fired.body, elementNamed("mx"), fired.opts);
        expect(lint(f.p0).filter((d) => d.code === "W_DIM_OVERLAP")).toHaveLength(1);
        expect(lint(f.gP).filter((d) => d.code === "W_DIM_OVERLAP")).toHaveLength(0);
        reproduce("dim-text-side", fired.body, "mx", "lint.dim-overlap", fired.opts);
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
        // The dimension line and its witness lines are exact: the declared class is the
        // tick hand alone, and the text side is its own (defect) class.
        expect(vs.map((v) => v.key).filter((k) => k.startsWith("scene.dim"))).toEqual([
          "scene.dim[g.dim_1].text",
          "scene.dim[g.dim_1].ticks",
        ]);
        expect(KNOWN_CLASSES["dim-tick-hand"].status).toBe("declared");
      },
    ],
  ],
  "nested-ref": [
    [
      "(COMPOSITION) STILL fails a reference into a nested instance once the plan is itself placed",
      () => {
        const inner = `  component inner() {\n${room(4000, 3000, "main")}\n  }`;
        const ref = "furniture id=f trolley in c2.main anchor bottom-right inset 300 size 700x500";
        const flat = `plan "w" {\n  units mm\n${inner}\n  place inner() as c2 at (0,0)\n  ${ref}\n}`;
        const nested = `plan "w" {\n  units mm\n${inner}\n  component c() {\n    place inner() as c2 at (0,0)\n    ${ref}\n  }\n  place c() as g at (0,0)\n}`;
        expect(compile(flat, { noCache: true }).diagnostics).toEqual([]); // the control
        // At the IDENTITY frame: this is composition, not equivariance.
        expect(compile(nested, { noCache: true }).diagnostics.map((d) => d.code)).toEqual(["E_PLACE_REF"]);
        expect(KNOWN_CLASSES["nested-ref"].law).toBe("composition");
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
});
