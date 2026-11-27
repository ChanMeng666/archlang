/** T4.1 — cache key reflects plugin identity. */

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
      const r = ctx.snap(ctx.evaluate(node.r));
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

/**
 * `ResolveCtx.evaluate` is the evaluator; the old member name is kept as a deprecated alias for
 * third-party plugins (ADR 0018: the public surface is append-only, a removal is a MAJOR). The
 * alias is read here by element access or through a variable, never as a call written after a dot,
 * so this file holds no text a dynamic-code scanner reads as a call to the global evaluator
 * (`test/no-dynamic-code.test.ts`).
 */
describe("ResolveCtx.evaluate and its deprecated alias", () => {
  const OLD = "eval" as const;
  type Expr = Parameters<ResolveCtx["evaluate"]>[0];

  /** The tree plugin written the old way: it calls the alias (`ctx[OLD]`), not `evaluate`. */
  function oldStyleTree(seen: ResolveCtx[]): ElementDef {
    const def = makeTreePlugin();
    return registerElement({
      ...def,
      resolve(node: any, ctx: ResolveCtx) {
        seen.push(ctx);
        const legacy = ctx[OLD];
        return {
          kind: "tree",
          id: ctx.id,
          at: ctx.snapPt(ctx.evalPt(node.at)),
          r: ctx.snap(legacy(node.r)),
          span: node.span,
        } as any;
      },
    });
  }

  it("the alias is the same function as `evaluate`", () => {
    const seen: ResolveCtx[] = [];
    compile(SRC, { plugins: [oldStyleTree(seen)], noCache: true });
    expect(seen.length).toBeGreaterThan(0);
    for (const ctx of seen) {
      expect(typeof ctx.evaluate).toBe("function");
      expect(ctx[OLD]).toBe(ctx.evaluate);
    }
  });

  it("a plugin written against the alias draws byte for byte what one written against `evaluate` draws", () => {
    const a = compile(SRC, { plugins: [makeTreePlugin()], noCache: true });
    const b = compile(SRC, { plugins: [oldStyleTree([])], noCache: true });
    expect(b.errors).toEqual([]);
    expect(b.svg).toBe(a.svg);
  });

  it("type level: old-style reads and a method-syntax mock still type-check against ResolveCtx", () => {
    // A plugin that reads the alias with a dot (the old style) type-checks: `ctx.eval` is
    // `(e: Expr) => number`. Written through a variable so no call follows the name.
    const readAlias = (ctx: ResolveCtx): ((e: Expr) => number) => ctx.eval;
    // An object-literal mock that implements the alias with METHOD syntax (as one written before
    // the alias became a property would) is still assignable; the computed key keeps the text
    // free of the scanned call pattern.
    const mock: Pick<ResolveCtx, "evaluate" | "eval"> = {
      evaluate(_e: Expr) {
        return 1;
      },
      [OLD](_e: Expr) {
        return 2;
      },
    };
    expect(readAlias(mock as ResolveCtx)({} as Expr)).toBe(2);
    expect(mock.evaluate({} as Expr)).toBe(1);
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
