/** T4.1 — cache key reflects plugin identity. */

import { describe, expect, it } from "vitest";
import { compile, clearCache, registerElement } from "../src/index.js";
import type { ElementDef, ParseCtx, ResolveCtx, RenderCtx } from "../src/index.js";
import { BUILTIN_DEFS } from "../src/elements/defs.js";
import { evaluateIn, evaluatorOf, markNativeEvaluator } from "../src/evaluator.js";

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
    // `evaluate` existed would) is still assignable; the computed key keeps the text free of the
    // scanned call pattern.
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

  it("type level: the alias stays a METHOD, so a narrower-parameter implementation is assignable (as before)", () => {
    // A method's parameter checks bivariantly; a function-typed property's would not, and this
    // assignment would then fail under strictFunctionTypes. Before `evaluate` existed the member
    // was a method, and it still is.
    type NumExpr = Extract<Expr, { t: "num" }>;
    const narrow: Pick<ResolveCtx, "eval"> = { eval: (e: NumExpr) => e.value };
    const legacy = narrow[OLD];
    expect(legacy({ t: "num", value: 7 })).toBe(7);
  });
});

/**
 * A plugin may wrap a built-in element and hand it a context of its own. Before `evaluate`
 * existed a wrapper replaced the old member and the built-in honoured it; it still does, and a
 * wrapper that replaces `evaluate` is honoured too (`evaluatorOf`, `src/evaluator.ts`).
 */
describe("a plugin wrapping a built-in can replace either evaluator member", () => {
  const OLD = "eval" as const;
  type Expr = Parameters<ResolveCtx["evaluate"]>[0];
  const COLUMN = BUILTIN_DEFS.find((d) => d.kind === "column")!;
  const PLAN = `plan "P" {
  units mm
  grid 50
  room at (0,0) size 4000x3000 label "R"
  column at (1000,1000) size 300x300
}`;
  /** `column`, resolved by the built-in with the context `wrap` makes of the one it is given. */
  const wrapped = (wrap: (ctx: ResolveCtx) => ResolveCtx): ElementDef =>
    registerElement({ ...COLUMN, resolve: (node, ctx) => COLUMN.resolve(node, wrap(ctx)) });
  /** Compile {@link PLAN} with `plugins`, asserting it has no error. */
  const compileWith = (plugins: ElementDef[]) => {
    const r = compile(PLAN, { plugins, noCache: true });
    expect(r.errors).toEqual([]);
    return r;
  };

  it("unwrapped: a plain compile and a pass-through wrapper draw the same bytes", () => {
    const plain = compile(PLAN, { noCache: true });
    expect(plain.errors).toEqual([]);
    expect(plain.svg).toContain("<svg");
    expect(compileWith([wrapped((ctx) => ({ ...ctx }))]).svg).toBe(plain.svg);
  });

  it("a wrapper that replaces only the old member is honoured (as it was before `evaluate`)", () => {
    const plain = compile(PLAN, { noCache: true }).svg;
    const doubled = compileWith([wrapped((ctx) => ({ ...ctx, [OLD]: (e: Expr) => 2 * ctx[OLD](e) }))]).svg;
    expect(doubled).not.toBe(plain);
    // Doubling the written size is the same drawing as writing it doubled.
    const written = compile(PLAN.replace("size 300x300", "size 600x600"), { noCache: true }).svg;
    expect(doubled).toBe(written);
  });

  it("a wrapper that replaces only `evaluate` is honoured", () => {
    const doubled = compileWith([wrapped((ctx) => ({ ...ctx, evaluate: (e: Expr) => 2 * ctx.evaluate(e) }))]).svg;
    const written = compile(PLAN.replace("size 300x300", "size 600x600"), { noCache: true }).svg;
    expect(doubled).toBe(written);
  });

  it("the rule, member by member (`evaluatorOf`)", () => {
    const native = markNativeEvaluator((_e: Expr) => 0);
    const a = (_e: Expr) => 1;
    const b = (_e: Expr) => 2;
    const pick = (evaluate: unknown, legacy: unknown) => evaluatorOf({ evaluate, [OLD]: legacy });
    expect(pick(a, undefined)).toBe(a); // only one is a function: that one
    expect(pick(undefined, b)).toBe(b);
    expect(pick(native, native)).toBe(native); // the same function: it
    expect(pick(native, b)).toBe(b); // different: the one that is not the compiler's
    expect(pick(a, native)).toBe(a);
    expect(pick(a, b)).toBe(a); // neither is the compiler's: `evaluate`
    // Called on the context, as a member call is.
    const host = {
      scale: 3,
      evaluate(this: { scale: number }, _e: Expr) {
        return this.scale;
      },
    };
    expect(evaluateIn(host, { t: "num", value: 0 })).toBe(3);
  });

  it("a context with only the old member (no `evaluate`) compiles, nothing thrown", () => {
    const plain = compile(PLAN, { noCache: true }).svg;
    const onlyOld = (ctx: ResolveCtx): ResolveCtx => {
      const { evaluate: _drop, ...rest } = ctx;
      return rest as ResolveCtx;
    };
    let svg = "";
    expect(() => {
      svg = compileWith([wrapped(onlyOld)]).svg;
    }).not.toThrow();
    expect(svg).toBe(plain);
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
