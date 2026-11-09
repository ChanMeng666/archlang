/**
 * The Scene memo (`src/scene-memo.ts`, engineering-health EH2.6): `lint()`'s `annotation-overlap`
 * reads the annotated Scene the compile already drew, and nothing a caller does to
 * `compile().scene` can reach lint through it.
 *
 * Byte identity over the corpus is the sweep's (SVG, `compile().diagnostics`, `describe()`,
 * `lint()` with the compile's Scene and without); this file pins the memo's own contract: a hit
 * is reached (with `noCache`, as the playground compiles), a hit equals a fresh draw, the key
 * holds every option that changes the Scene, and a mutated public Scene changes no finding.
 */
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, describe as suite, expect, it } from "vitest";
import { clearCache, compile, lint } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { memoScene, sceneMemoStats } from "../src/scene-memo.js";
import { toScene } from "../src/scene-build.js";
import type { Scene } from "../src/scene.js";

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** 31 `W_ANNOTATION_OVERLAP` findings, so lint's answer depends on the Scene it reads. */
const STAR = read("test/fixtures/star30.arch");
const STOREYS = read("examples/townhouse.arch");
const ANNOTATED = { noCache: true, annotate: true } as const;

/** The same plan as another source text (a trailing comment): a new parse and new IR objects, the same spans. */
const variant = (src: string, tag: string): string => `${src}\n# ${tag}\n`;
const hits = (): number => sceneMemoStats().hits;
const overlapCount = (src: string): number => lint(src).filter((d) => d.code === "W_ANNOTATION_OVERLAP").length;

beforeEach(() => clearCache());
afterEach(() => clearCache());

suite("lint reuses the compile's Scene", () => {
  it("is reached with noCache, as the playground compiles, once lint has asked for that Scene", () => {
    const cold = lint(STAR);
    expect(cold.filter((d) => d.code === "W_ANNOTATION_OVERLAP")).toHaveLength(31);
    // Another source text, so the hit below can only come from the compile's offer.
    const other = variant(STAR, "other");
    compile(other, ANNOTATED);
    const before = hits();
    expect(lint(other)).toEqual(cold);
    expect(hits()).toBe(before + 1);
  });

  it("keeps nothing for a compile no lint has asked for (a compile-only caller never pays the copy)", () => {
    compile(STAR, ANNOTATED);
    expect(sceneMemoStats().size).toBe(0);
  });

  it("reaches every storey of a multi-storey plan", () => {
    lint(STAR); // ask
    const pages = compile(STOREYS, ANNOTATED).pages ?? [];
    expect(pages.length).toBeGreaterThan(1);
    const before = hits();
    lint(STOREYS);
    expect(hits()).toBe(before + pages.length);
  });

  it("a hit is the Scene a miss draws, field for field, on every example", () => {
    const names = readdirSync(new URL("../examples/", import.meta.url)).filter((f) => f.endsWith(".arch"));
    let compared = 0;
    for (const name of names) {
      const src = read(`examples/${name}`);
      clearCache();
      lint(variant(STAR, "ask")); // ask for the annotated Scene
      const res = compile(src, ANNOTATED); // offer each storey
      if (res.errors.length > 0) continue;
      const { ir, levels } = resolvePlan(src); // the very IR objects the compile drew
      for (const storey of levels.length > 0 ? levels.map((l) => l.ir) : [ir!]) {
        const before = hits();
        const shared = memoScene(storey, { annotate: true });
        expect(hits(), name).toBe(before + 1);
        // The copy leaves out `walls`, the lazy DXF projection no lint reads.
        const { walls: _walls, ...drawn } = toScene(storey, { annotate: true });
        expect("walls" in shared, name).toBe(false);
        expect(shared, name).toStrictEqual(drawn);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(30);
  });
});

suite("a caller's Scene never reaches lint", () => {
  it("mutating compile().scene after the compile changes no lint finding", () => {
    const cold = lint(STAR);
    clearCache();
    lint(variant(STAR, "ask")); // ask, as the playground's previous render did
    const scene = compile(STAR, ANNOTATED).scene as Scene;
    // Everything annotation-overlap reads: the nodes, their text, their shapes, the sizes.
    for (const n of scene.nodes) {
      if (n.prim.t === "text") n.prim.value = "";
      if (n.prim.t === "hatch") n.prim.region.length = 0;
      n.elementId = undefined;
    }
    scene.nodes.length = 0;
    (scene.sizes as unknown as Record<string, number>).refDim = 1;
    const before = hits();
    expect(lint(STAR)).toEqual(cold);
    expect(hits(), "the lint read the memo, so the mutation was really tested").toBe(before + 1);
  });

  it("mutating a lint's own diagnostics changes nothing in the next lint", () => {
    const first = lint(STAR);
    const snapshot = JSON.stringify(first);
    for (const d of first) (d as { message: string }).message = "";
    expect(JSON.stringify(lint(STAR))).toBe(snapshot);
  });
});

suite("the key holds every option that changes the Scene", () => {
  it("an accessible compile does not serve lint (its Scene carries a name and caption)", () => {
    lint(STAR); // ask, and keep lint's own Scene
    const res = compile(STAR, { ...ANNOTATED, accessible: true });
    expect(res.scene?.caption).toBeDefined();
    expect(sceneMemoStats().size).toBe(1);
    const before = hits();
    lint(STAR);
    expect(hits()).toBe(before + 1); // lint's own Scene from the ask, not the accessible one
  });

  it("a compile without annotate, with the overlay or under an API theme is not kept for lint", () => {
    lint(variant(STAR, "ask"));
    compile(STAR, { noCache: true });
    compile(STAR, { ...ANNOTATED, overlays: ["circulation"] });
    compile(STAR, { ...ANNOTATED, theme: { wallStroke: "#123456" } });
    expect(sceneMemoStats().size).toBe(1);
    const before = hits();
    expect(overlapCount(STAR)).toBe(31);
    expect(hits()).toBe(before);
  });

  it("clearCache() empties it, and a fresh resolve reads no Scene drawn for another plan object", () => {
    lint(STAR);
    clearCache();
    expect(sceneMemoStats()).toEqual({ size: 0, hits: 0 });
    lint(STAR);
    expect(hits()).toBe(0);
  });

  it("is bounded", () => {
    for (let i = 0; i < 12; i++) lint(variant(STAR, `n${i}`));
    expect(sceneMemoStats().size).toBe(8);
  });
});
