import { describe, expect, it } from "vitest";
import { compile, createRegistry, describe as describePlan, lint, registerElement } from "../src/index.js";
import type { ElementDef, ParseCtx, ResolveCtx, TransformCtx } from "../src/index.js";
import { BUILTIN_DEFS } from "../src/elements/defs.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RColumn, ResolvedElement } from "../src/ir.js";

/**
 * `ElementDef.transform` — how a `place`d instance carries each resolved element into plan
 * coordinates. Each element module owns its own action (the registry, no switch), handed a
 * `TransformCtx` so it never imports `frame.ts`; `frame.ts` resolves the action as
 * `def.transform ?? <the built-in of that kind>.transform`.
 *
 * The defect this seam closes: `frame.ts` used to switch over the built-in kinds with no arm
 * for a plugin, so a plugin element inside a component body came back `undefined` and the
 * `_instance` stamp THREW inside `compile()` — breaking "diagnostics, never thrown" for a
 * plan the parser and resolver had both accepted.
 */

const GREEN = "#2e7d32";

/** `tree (x,y) r <n>` — the plugin from `test/plugins.test.ts`, optionally with a transform. */
function treePlugin(withTransform: boolean): ElementDef {
  const def: ElementDef = {
    kind: "tree",
    keyword: "tree",
    parse(ctx: ParseCtx) {
      const kw = ctx.eatKeyword("tree");
      const at = ctx.parsePoint();
      ctx.eatKeyword("r");
      const r = ctx.parseExpr();
      return { kind: "tree", id: "", at, r, line: kw.line, span: { start: kw.start, end: kw.end } } as any;
    },
    idPrefix: () => "tree",
    resolve(node: any, ctx: ResolveCtx) {
      return { kind: "tree", id: ctx.id, at: ctx.snapPt(ctx.evalPt(node.at)), r: ctx.snap(ctx.eval(node.r)) } as any;
    },
    bounds(resolved: any) {
      const { at, r } = resolved;
      return [
        { x: at.x - r, y: at.y - r },
        { x: at.x + r, y: at.y + r },
      ];
    },
    render(resolved: any) {
      const { at, r } = resolved;
      const pts = [
        { x: at.x, y: at.y - r },
        { x: at.x + r, y: at.y },
        { x: at.x, y: at.y + r },
        { x: at.x - r, y: at.y },
      ];
      return [
        { layer: "furniture", prim: { t: "polygon", pts }, paint: { fill: GREEN, stroke: "#1b5e20", width: 10 } },
      ];
    },
  };
  if (withTransform) {
    def.transform = (el: ResolvedElement, t: TransformCtx) => {
      const tree = el as unknown as { at: { x: number; y: number } };
      return { ...el, id: t.id, at: t.point(tree.at) } as ResolvedElement;
    };
  }
  return registerElement(def);
}

const placed = `plan "P" {
  units mm
  component grove() {
    room id=r at (0,0) size 4000x3000 label "Grove"
    tree (1000,500) r 300
    tree (2000,500) r 300
  }
  place grove() as a at (10000,0) rotate 90
  place grove() as b at (20000,0) mirror x
}`;

describe("ElementDef.transform — the seam", () => {
  it("every BUILTIN_DEFS entry has transform", () => {
    const missing = BUILTIN_DEFS.filter((d) => typeof d.transform !== "function").map((d) => d.kind);
    expect(missing).toEqual([]);
    expect(BUILTIN_DEFS.length).toBeGreaterThanOrEqual(15);
  });

  it("plugin in a component → E_INSTANCE_NO_TRANSFORM, never throws, not drawn", () => {
    const plugins = [treePlugin(false)];
    let out: ReturnType<typeof compile> | undefined;
    expect(() => {
      out = compile(placed, { plugins, noCache: true });
    }).not.toThrow();
    const refusals = out!.diagnostics.filter((d) => d.code === "E_INSTANCE_NO_TRANSFORM");
    // Two trees per instance, two instances: ONE report per (instance, kind).
    expect(refusals.map((d) => d.instance)).toEqual(["a", "b"]);
    for (const d of refusals) {
      expect(d.severity).toBe("error");
      expect(d.message).toBe(
        'Element kind "tree" in component "grove" cannot be placed: its plugin ElementDef has no transform()',
      );
      expect(d.component).toBe("grove");
      // No related span repeats the primary one (the `place` is already the primary span,
      // so `stampProvenance`'s "placed here" note would point at the same bytes twice).
      const selfRefs = (d.relatedSpans ?? []).filter(
        (r) => r.span.start === d.span?.start && r.span.end === d.span?.end,
      );
      expect(selfRefs).toEqual([]);
      // The span is the `place` statement that could not carry it.
      expect(placed.slice(d.span!.start, d.span!.end)).toMatch(new RegExp(`^place grove\\(\\) as ${d.instance}\\b`));
    }
    // Dropped, never drawn at its LOCAL coordinates — while the rest of the instance is
    // carried as usual. (The plan now carries an error, so `compile()` draws nothing at all;
    // the resolved element list is where "not drawn" is decided.)
    expect(out!.svg).not.toContain(GREEN);
    const registry = createRegistry(plugins);
    const { ir } = resolve(parse(placed, registry).plan!, registry);
    expect(ir.elements.map((e) => `${e.kind}:${e.id}`)).toEqual(["room:a.r", "room:b.r"]);
    // The other channels are just as safe.
    expect(() => describePlan(placed, { plugins })).not.toThrow();
    expect(() => lint(placed, { plugins })).not.toThrow();
    // Control: the same plugin at PLAN level still draws (no frame to cross).
    const flat = compile(`plan "P" {\n  units mm\n  tree (1000,500) r 300\n}`, { plugins, noCache: true });
    expect(flat.diagnostics.map((d) => d.code)).not.toContain("E_INSTANCE_NO_TRANSFORM");
    expect(flat.svg).toContain(GREEN);
  });

  it("plugin with transform is turned", () => {
    const registry = createRegistry([treePlugin(true)]);
    const { ir, diagnostics } = resolve(parse(placed, registry).plan!, registry);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // A plugin kind is outside the built-in `ResolvedElement` union, so compare as a string.
    const trees = ir.elements.filter((e) => (e.kind as string) === "tree") as unknown as {
      id: string;
      at: { x: number; y: number };
      _instance?: string;
      _component?: string;
    }[];
    expect(trees.map((t) => [t.id, t.at, t._instance, t._component])).toEqual([
      // rotate 90 (clockwise, +y down): (x, y) ↦ (−y, x), then + (10000, 0).
      ["a.tree_1", { x: 10000 - 500, y: 1000 }, "a", "grove"],
      ["a.tree_2", { x: 10000 - 500, y: 2000 }, "a", "grove"],
      // mirror x: (x, y) ↦ (−x, y), then + (20000, 0).
      ["b.tree_1", { x: 20000 - 1000, y: 500 }, "b", "grove"],
      ["b.tree_2", { x: 20000 - 2000, y: 500 }, "b", "grove"],
    ]);
    expect(compile(placed, { plugins: [treePlugin(true)], noCache: true }).svg).toContain(GREEN);
  });

  it("plugin replacing a built-in kind keeps the built-in action", () => {
    const builtinColumn = BUILTIN_DEFS.find((d) => d.kind === "column")!;
    // A plugin that REPLACES `column` (same kind and keyword) and supplies no transform.
    const { transform: _dropped, ...rest } = builtinColumn;
    const replacement = registerElement({ ...rest, doc: "a replacement column" });
    expect(replacement.transform).toBeUndefined();
    const src = `plan "P" {
  units mm
  component bay() { column id=c at (1000,500) size 400x600 }
  place bay() as a at (5000,0) rotate 90 mirror y
}`;
    const columnsOf = (defs: ElementDef[]): RColumn[] => {
      const registry = createRegistry(defs);
      const { ir, diagnostics } = resolve(parse(src, registry).plan!, registry);
      expect(diagnostics.map((d) => d.code)).not.toContain("E_INSTANCE_NO_TRANSFORM");
      return ir.elements.filter((e): e is RColumn => e.kind === "column");
    };
    const viaPlugin = columnsOf([replacement]);
    expect(viaPlugin).toEqual(columnsOf([]));
    // …and it really was turned: the 400×600 column is 600×400 after a quarter-turn.
    expect(viaPlugin.map((c) => [c.id, c.size])).toEqual([["a.c", { w: 600, h: 400 }]]);
  });

  it("plugin replacing a built-in kind with a DIFFERENT resolved shape → E_INSTANCE_NO_TRANSFORM, never throws", () => {
    // The inherited built-in `column` action reads `el.at`/`el.size`; this replacement
    // resolves to `{ centre }` instead, so the inherited action throws a TypeError on it.
    // That throw is caught at the plugin boundary and becomes the same drop + refusal as a
    // plugin kind with no transform at all.
    const builtinColumn = BUILTIN_DEFS.find((d) => d.kind === "column")!;
    const { transform: _dropped, ...rest } = builtinColumn;
    const centreColumn = registerElement({
      ...rest,
      doc: "a column that resolves to its centre",
      resolve(node, ctx) {
        const c = builtinColumn.resolve(node, ctx) as RColumn;
        return {
          kind: "column",
          id: c.id,
          centre: { x: c.at.x + c.size.w / 2, y: c.at.y + c.size.h / 2 },
        } as unknown as ResolvedElement;
      },
      bounds: (r: any) => [r.centre, r.centre],
      render: () => [],
    });
    expect(centreColumn.transform).toBeUndefined();
    const src = `plan "P" {
  units mm
  component bay() {
    room id=r at (0,0) size 4000x3000 label "Bay"
    column id=c at (1000,500) size 400x600
  }
  place bay() as a at (5000,0) rotate 90
}`;
    const plugins = [centreColumn];
    let out: ReturnType<typeof compile> | undefined;
    expect(() => {
      out = compile(src, { plugins, noCache: true });
    }).not.toThrow();
    const refusals = out!.diagnostics.filter((d) => d.code === "E_INSTANCE_NO_TRANSFORM");
    expect(refusals.map((d) => [d.instance, d.component, d.severity])).toEqual([["a", "bay", "error"]]);
    expect(refusals[0]!.message).toBe(
      'Element kind "column" in component "bay" cannot be placed: its plugin ElementDef has no transform(), ' +
        'and the built-in "column" transform() it inherits could not read the plugin\'s resolved shape — ' +
        "the plugin must define its own transform()",
    );
    expect(src.slice(refusals[0]!.span!.start, refusals[0]!.span!.end)).toMatch(/^place bay\(\) as a\b/);
    // Dropped, never drawn: the resolved element list carries the room only.
    const registry = createRegistry(plugins);
    const { ir } = resolve(parse(src, registry).plan!, registry);
    expect(ir.elements.map((e) => `${e.kind}:${e.id}`)).toEqual(["room:a.r"]);
    expect(() => describePlan(src, { plugins })).not.toThrow();
    expect(() => lint(src, { plugins })).not.toThrow();
    // Control: the same replacement at PLAN level resolves and compiles (no frame to cross).
    const flat = compile(`plan "P" {\n  units mm\n  column id=c at (1000,500) size 400x600\n}`, {
      plugins,
      noCache: true,
    });
    expect(flat.diagnostics.map((d) => d.code)).not.toContain("E_INSTANCE_NO_TRANSFORM");
  });

  it("registerElement refuses a transform that is not a function", () => {
    expect(() => registerElement({ ...treePlugin(false), transform: 42 as any })).toThrow(/transform/);
  });
});
