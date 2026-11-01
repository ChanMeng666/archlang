/**
 * Plan-soundness PS2.12: `W_ANNOTATION_OVERLAP` and `W_TITLE_OVERFLOW` (`src/lint/rules/annotations.ts`).
 *
 * Each rule is pinned on a minimal plan that must fire and its one-clause twin that must not, the
 * wording on what a person reads (labels and kinds, never ids), the thresholds at their edges, the
 * once-per-plan title report on a multi-storey plan, and the renderer change that came with it
 * (the `dims auto` thickness figure keeps off a stair). That the rules leave `describe()`, the SVG
 * and Plan JSON alone is the digest suites' job; here the shared text and dimension placement the
 * rule reads is checked against the Scene the compiler draws.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, lint } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { autoDimensions, toScene } from "../src/scene-build.js";
import { dimTextPrim } from "../src/elements/dim.js";
import { BUILTIN_RUNTIME } from "../src/registry.js";
import { fmt2 } from "../src/num-format.js";
import { SKIP_WHY } from "../src/lint/coverage.js";
import { lintCoverage, lintWithCoverage } from "../src/lint.js";
import { MAX_ANNOTATION_WORK } from "../src/lint/rules/annotations.js";

const OVERLAP = "W_ANNOTATION_OVERLAP";
const TITLE = "W_TITLE_OVERFLOW";
const of = (src: string, code: string) => lint(src).filter((d) => d.code === code);

const bedroom = (bed: string, label = 'label "Bedroom 4"') => `plan "b" {
  units mm
  grid 50
  paper A4 landscape
  scale 1:100
  wall id=shell exterior thickness 200 { (0,0) (3250,0) (3250,3000) (0,3000) close }
  room id=r_bed4 at (0,0) size 3250x3000 ${label} uses bedroom
  door at (0,1500) width 800 wall shell hinge left swing in
  window at (3250,1000) width 1600 wall shell
  ${bed}
  furniture wardrobe at (100,100) size 1800x600
}`;

const pavilion = (extra: string, labelAt = "(3000,4300)") => `plan "p" {
  units mm
  grid 50
  paper A4 landscape
  scale 1:50
  dims auto overall
  wall id=drum exterior thickness 200 {
    (6000,3000)
    arc (0,3000) radius 3000
    arc (6000,3000) radius 3000
  }
  room id=r_pav circle at (3000,3000) radius 3000 label "Pavilion" at ${labelAt} uses living
  door on drum at 75% width 900
  window on drum at 25% width 1200
  ${extra}
}`;

const titled = (project: string, levels = false) => `plan "t" {
  units mm
  grid 50
  title {
    project "${project}"
  }
  ${
    levels
      ? `level 1 "Ground" {
    wall id=s1 exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r1 at (0,0) size 4000x3000 label "Hall" uses hall
    door at (2000,3000) width 900 wall s1
    stair id=st at (200,200) size 900x2600 dir up
  }
  level 2 "First" {
    wall id=s2 exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r2 at (0,0) size 4000x3000 label "Landing" uses hall
    stair id=st at (200,200) size 900x2600 dir down
  }`
      : `wall id=s exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "Studio" uses living
  door at (2000,3000) width 900 wall s`
  }
}`;

suite("W_ANNOTATION_OVERLAP — a room label over a symbol", () => {
  it("fires once for a name left on the bed, naming the room and the piece", () => {
    // The bed fills the floor, so neither a place nor a smaller height clears the name.
    const ds = of(bedroom("furniture bed at (150,150) size 2950x2700"), OVERLAP);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toContain('The name "Bedroom 4"');
    expect(ds[0]!.message).toContain("the bed");
    expect(ds[0]!.message).not.toContain("r_bed4");
    expect(ds[0]!.fixes ?? []).toEqual([]);
  });

  it("is silent when a narrower bed leaves the label clear", () => {
    expect(of(bedroom("furniture bed at (2250,900) size 900x2000"), OVERLAP)).toEqual([]);
  });

  it("says the label is pinned when it is, and points at the pin", () => {
    const src = bedroom("furniture bed at (1650,900) size 1500x2000", 'label "Bedroom 4" at (2400,1900)');
    const [d] = of(src, OVERLAP);
    expect(d?.hints?.[0]).toContain('`label "Bedroom 4" at (x,y)`');
    expect(d?.hints?.[0]).toContain("pinned");
  });

  it("does not count a rug: it is floor finish, and a name on it reads", () => {
    // Pinned in the middle of the rug, so the placer cannot have moved it elsewhere.
    const src = bedroom("furniture rug at (300,1000) size 2700x1800", 'label "Bedroom 4" at (1650,1900)');
    expect(of(src, OVERLAP)).toEqual([]);
    expect(
      of(bedroom("furniture bed at (300,1000) size 2700x1800", 'label "Bedroom 4" at (1650,1900)'), OVERLAP),
    ).toHaveLength(1);
  });
});

suite("W_ANNOTATION_OVERLAP — a `dims auto` number over a symbol or a label", () => {
  it("reports the R call-out lettered over a pinned label, at the room, with the pin as the remedy", () => {
    const src = pavilion("", "(3000,1500)");
    const ds = of(src, OVERLAP);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toContain("The radius call-out R3000");
    expect(ds[0]!.message).toContain('the name "Pavilion"');
    expect(ds[0]!.hints?.[0]).toContain('`label "Pavilion" at (x,y)`');
    const at = ds[0]!.span!;
    expect(src.slice(at.start, at.end)).toMatch(/^room id=r_pav/);
  });

  it("reports it over a table, at the table's statement, and stays silent once the table moves aside", () => {
    const src = pavilion("furniture table at (2400,1100) size 1200x800");
    const [d] = of(src, OVERLAP);
    expect(d?.message).toContain('over the table in "Pavilion"');
    expect(src.slice(d!.span!.start, d!.span!.end)).toMatch(/^furniture table/);
    expect(of(pavilion("furniture table at (3300,1700) size 1200x800"), OVERLAP)).toEqual([]);
    expect(of(pavilion(""), OVERLAP)).toEqual([]);
  });

  it("places each number exactly where the drawing letters it", () => {
    const { ir } = resolvePlan(pavilion("furniture table at (2400,1100) size 1200x800"));
    const scene = toScene(ir!);
    const drawn = scene.nodes.filter((n) => n.layer === "dims" && n.prim.t === "text").map((n) => n.prim);
    const placed = autoDimensions(ir!, scene.sizes, BUILTIN_RUNTIME.registry).map((dm) =>
      dimTextPrim(dm, scene.sizes, fmt2),
    );
    expect(placed).toEqual(drawn);
  });
});

suite("the `dims auto` thickness figure keeps off a stair", () => {
  const hall = `plan "h" {
  units mm
  grid 50
  dims auto all
  wall id=shell exterior thickness 300 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Hall" uses hall
  door at (5000,4000) width 900 wall shell
  window at (3000,0) width 1200 wall shell
  stair id=st at (150,150) size 1000x3700 dir up
}`;
  it("letters the 300 figure beside its wall but not on the stair", () => {
    expect(of(hall, OVERLAP)).toEqual([]);
    const { ir } = resolvePlan(hall);
    const scene = toScene(ir!);
    const t = scene.nodes.find((n) => n.layer === "dims" && n.prim.t === "text" && n.prim.value === "300");
    expect(t).toBeDefined();
    const at = (t!.prim as { at: { x: number; y: number } }).at;
    expect(at.x < 150 || at.x > 1150 || at.y < 150 || at.y > 3850).toBe(true);
  });
});

suite("W_TITLE_OVERFLOW", () => {
  it("fires on a 26-character value and not on a 25-character one (the row holds 25 at any scale)", () => {
    const [d] = of(titled("L-Shaped Two-Bedroom House"), TITLE);
    expect(d?.message).toContain("26 characters");
    expect(d?.message).toContain("holds about 25");
    expect(d?.hints?.[0]).toContain("25 characters or fewer");
    expect(of(titled("L-Shaped Two-Bedroom Home"), TITLE)).toEqual([]);
  });

  it("says a value past the frame runs out of it", () => {
    const [d] = of(titled("742 Evergreen Terrace, Springfield - Ground Floor General Arrangement"), TITLE);
    expect(d?.message).toContain("runs out of the block's frame");
    const [near] = of(titled("L-Shaped Two-Bedroom House"), TITLE);
    expect(near?.message).not.toContain("frame");
  });

  it("is reported once on a multi-storey plan, whose every page repeats the row", () => {
    expect(of(titled("L-Shaped Two-Bedroom House", true), TITLE)).toHaveLength(1);
  });

  it("changes nothing the compiler emits", () => {
    const src = titled("L-Shaped Two-Bedroom House");
    expect(compile(src, { noCache: true }).diagnostics.map((d) => d.code)).not.toContain(TITLE);
  });
});

suite("bounds", () => {
  it("has a coverage reason for a storey too large to measure", () => {
    expect(SKIP_WHY["annotation-budget"]).toBeTruthy();
    expect(lintCoverage(pavilion(""))).not.toBeNull();
  });

  /** `n` walls of `n` distinct thicknesses (so `dims auto walls` letters `n` figures) and `n`
   *  chairs: `n` numbers × `n` symbols, plus the room's two label texts, compared pairwise. */
  const crowd = (n: number): string => {
    const walls = Array.from(
      { length: n },
      (_, i) => `  wall partition thickness ${10 + i} { (${i * 3000},-20000) (${i * 3000 + 2000},-20000) }`,
    );
    const chairs = Array.from(
      { length: n },
      (_, i) => `  furniture chair at (${(i % 40) * 500},${Math.floor(i / 40) * 500}) size 400x400`,
    );
    return `plan "B" {\n  units mm\n  dims auto walls\n  room id=r at (0,0) size 20000x20000 label "Hall" uses hall\n${walls.join("\n")}\n${chairs.join("\n")}\n}\n`;
  };
  const pairs = (n: number): number => (n + 2) * n + n * 2;
  const budgetSkip = (src: string): boolean =>
    (lintWithCoverage(src).coverage?.families ?? []).some((f) =>
      (f.skipped ?? []).some((s) => s.reason === "annotation-budget"),
    );

  it("skips a storey past MAX_ANNOTATION_WORK with an `annotation-budget` note, and lint still returns", () => {
    expect(pairs(1001)).toBeGreaterThan(MAX_ANNOTATION_WORK);
    const src = crowd(1001);
    const { diagnostics } = lintWithCoverage(src);
    expect(Array.isArray(diagnostics)).toBe(true);
    expect(diagnostics.some((d) => d.code === OVERLAP)).toBe(false);
    expect(budgetSkip(src)).toBe(true);
  }, 60_000);

  it("measures the same storey just inside the count", () => {
    expect(pairs(900)).toBeLessThan(MAX_ANNOTATION_WORK);
    expect(budgetSkip(crowd(900))).toBe(false);
  }, 60_000);
});
