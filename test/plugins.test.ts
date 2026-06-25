import { describe, expect, it } from "vitest";
import { compile, clearCache, registerElement } from "../src/index.js";
import type { ElementDef, ParseCtx, ResolveCtx, RenderCtx } from "../src/index.js";

/**
 * A genuine third-party element added with ZERO core edits: `tree (x,y) r <n>`
 * draws a green diamond. It introduces a NEW `kind` ("tree") and a new keyword,
 * and casts its custom node at the parse/resolve boundary (the normal plugin
 * experience — the core only ever calls the def's own methods + reads .kind/.id).
 */
function makeTreePlugin(): ElementDef {
  return registerElement({
    kind: "tree",
    keyword: "tree",
    parse(ctx: ParseCtx) {
      const kw = ctx.eatKeyword("tree");
      const at = ctx.parsePoint();
      ctx.eatKeyword("r");
      const r = ctx.parseExpr();
      // Custom node shape; the core treats it opaquely (reads only .kind/.id/.span).
      return { kind: "tree", id: "", at, r, line: kw.line } as any;
    },
    idPrefix: () => "tree",
    resolve(node: any, ctx: ResolveCtx) {
      const at = ctx.snapPt(ctx.evalPt(node.at));
      const r = ctx.snap(ctx.eval(node.r));
      return { kind: "tree", id: ctx.id, at, r, span: node.span } as any;
    },
    bounds(resolved: any) {
      const { at, r } = resolved;
      return [
        { x: at.x - r, y: at.y - r },
        { x: at.x + r, y: at.y + r },
      ];
    },
    render(resolved: any, _ctx: RenderCtx) {
      const { at, r } = resolved;
      const pts = [
        { x: at.x, y: at.y - r },
        { x: at.x + r, y: at.y },
        { x: at.x, y: at.y + r },
        { x: at.x - r, y: at.y },
      ];
      return [
        {
          layer: "furniture",
          prim: { t: "polygon", pts },
          paint: { fill: "#2e7d32", stroke: "#1b5e20", width: 10 },
        },
      ];
    },
  });
}

const SRC = `plan "P" {
  units mm
  grid 50
  room at (0,0) size 4000x3000 label "R"
  tree (1000,1000) r 400
}`;

describe("T4.1 — third-party element via { plugins }", () => {
  it("compiles a new element with zero core edits and emits its primitive", () => {
    const tree = makeTreePlugin();
    const { svg, errors } = compile(SRC, { plugins: [tree], noCache: true });
    expect(errors).toEqual([]);
    expect(svg.startsWith("<svg")).toBe(true);
    // The diamond fill colour the plugin emitted is present in the SVG.
    expect(svg).toContain("#2e7d32");
  });

  it("is an error WITHOUT the plugin (proves the keyword isn't a core builtin)", () => {
    const { errors } = compile(SRC, { noCache: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => /tree/i.test(e.message) || /unknown/i.test(e.message))).toBe(true);
  });

  it("does not mutate global state: a plugin compile never leaks into a later plain compile", () => {
    const tree = makeTreePlugin();
    compile(SRC, { plugins: [tree], noCache: true });
    const { errors } = compile(SRC, { noCache: true });
    expect(errors.length).toBeGreaterThan(0); // 'tree' is unknown again
  });

  it("registerElement rejects a malformed def", () => {
    // @ts-expect-error missing required methods
    expect(() => registerElement({ kind: "x", keyword: "x" })).toThrow();
  });
});

describe("T4.1 — cache key reflects plugin identity", () => {
  it("same plugins array → cache HIT (identical result object)", () => {
    clearCache();
    const tree = makeTreePlugin();
    const a = compile(SRC, { plugins: [tree] });
    const b = compile(SRC, { plugins: [tree] });
    expect(a).toBe(b); // reference equality = served from cache
  });

  it("a distinct (but equal) plugin object → cache MISS (no cross-plugin bleed)", () => {
    clearCache();
    const a = compile(SRC, { plugins: [makeTreePlugin()] });
    const b = compile(SRC, { plugins: [makeTreePlugin()] });
    expect(a).not.toBe(b); // different object identity → distinct key
    expect(a.svg).toBe(b.svg); // ...but the output is still identical (determinism)
  });

  it("plain compile (no plugins) is unaffected and still cached", () => {
    clearCache();
    const plain = `plan "P" { units mm grid 50 room at (0,0) size 4000x3000 label "R" }`;
    const a = compile(plain);
    const b = compile(plain);
    expect(a).toBe(b);
  });
});
