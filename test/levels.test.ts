/**
 * v1.21 — multi-storey `level` blocks: one drawing per storey.
 *
 * The contract this suite pins:
 *  - a plan with NO `level` block compiles byte-identically (the whole shipped corpus);
 *  - a plan is either single-storey or entirely levels (`E_LEVEL_MIX`), numbers are unique
 *    (`E_LEVEL_DUP`), and a nested `level` is `E_LEVEL_NEST`;
 *  - settings/`let`/`set`/components outside the levels apply to EVERY level, and one
 *    building gets ONE sheet + one scale;
 *  - ids are unique per level, so the same id on two storeys is legal (vertical identity);
 *  - `compile().pages` is append-only, ascending, and `svg === pages[0].svg`;
 *  - `describe()`'s top-level facts are the LOWEST storey, with `levels[]` appended;
 *  - diagnostics aggregate across storeys, each tagged with its `level`;
 *  - `repair()` recurses into level bodies (a fault on the top floor is never silent).
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint, repair, resolve, resolveAll, levelBlocks } from "../src/index.js";
import { parse } from "../src/parser.js";

const TWO_STOREY = readFileSync("examples/two-storey.arch", "utf8");

/** A minimal two-level plan: same shell on both floors, one room each. */
const shell = (label: string) =>
  `wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n` +
  `room id=r at (0,0) size 4000x3000 label "${label}"`;
const TWO_LEVELS = `plan "P" {
  units mm
  level 1 "Ground" { ${shell("Down")} }
  level 2 "Upper" { ${shell("Up")} }
}`;

suite("v1.21 levels — parsing + the either/or shape", () => {
  it('parses `level <n> ["Name"] { … }` into ascending storeys', () => {
    const { plan, diagnostics } = parse(`plan "P" {\n  level 2 "Upper" { }\n  level 1 "Ground" { }\n}`);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Source order in the AST, drawing order from `levelBlocks`.
    expect(plan!.body.map((s) => s.kind)).toEqual(["level", "level"]);
    expect(levelBlocks(plan!).map((l) => [l.level, l.name])).toEqual([
      [1, "Ground"],
      [2, "Upper"],
    ]);
  });

  it("accepts 0 and negative storeys (basements), and rejects a fractional one", () => {
    const ok = parse(`plan "P" {\n  level -1 "Basement" { }\n  level 0 { }\n}`);
    expect(ok.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(levelBlocks(ok.plan!).map((l) => l.level)).toEqual([-1, 0]);

    const bad = compile(`plan "P" { level 1.5 { } }`, { noCache: true });
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.diagnostics[0]!.message).toMatch(/whole number/);
  });

  it("E_LEVEL_MIX: a drawable statement beside a level block, spanned on the offender", () => {
    const src = `plan "P" {\n  room at (0,0) size 3000x3000\n  level 1 { ${shell("A")} }\n}`;
    const r = compile(src, { noCache: true });
    const mix = r.diagnostics.filter((d) => d.code === "E_LEVEL_MIX");
    expect(mix).toHaveLength(1);
    expect(src.slice(mix[0]!.span!.start, mix[0]!.span!.end)).toBe("room at (0,0) size 3000x3000");
    expect(r.svg).toBe("");
  });

  it("E_LEVEL_MIX also covers scripting that DRAWS (for/strip/component call)", () => {
    for (const stmt of [
      "for i in 0..2 { room at (0,0) size 100x100 }",
      "strip right at (0,0) gap 0 height 100 { room size 100 }",
      "box()",
    ]) {
      const src = `plan "P" {\n  component box() { room at (0,0) size 100x100 }\n  ${stmt}\n  level 1 { ${shell("A")} }\n}`;
      expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_LEVEL_MIX")).toBe(true);
    }
  });

  it("no E_LEVEL_MIX for the plan-global scope (`let`/`set`) or the settings", () => {
    const src = `plan "P" {
      units mm
      grid 50
      paper A4 landscape
      north up
      dims auto overall
      let T = 200
      set door(swing: out)
      component box(x) { room at (x,0) size 1000x1000 }
      title { project "P" }
      level 1 { wall exterior thickness T { (0,0) (4000,0) (4000,3000) (0,3000) close } box(0) }
    }`;
    const r = compile(src, { noCache: true });
    expect(r.diagnostics.filter((d) => d.code === "E_LEVEL_MIX")).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("E_LEVEL_DUP: the same storey number twice (the second one is flagged)", () => {
    const r = compile(`plan "P" {\n  level 1 { ${shell("A")} }\n  level 1 { ${shell("B")} }\n}`, { noCache: true });
    const dup = r.diagnostics.filter((d) => d.code === "E_LEVEL_DUP");
    expect(dup).toHaveLength(1);
    expect(dup[0]!.relatedSpans?.[0]?.message).toMatch(/first declared here/);
  });

  it("E_LEVEL_NEST: a `level` inside a block or a component", () => {
    for (const src of [
      `plan "P" { level 1 { level 2 { } } }`,
      `plan "P" { component c() { level 1 { } } level 1 { ${shell("A")} } }`,
      `plan "P" { if true { level 1 { } } level 1 { ${shell("A")} } }`,
    ]) {
      expect(compile(src, { noCache: true }).diagnostics.some((d) => d.code === "E_LEVEL_NEST")).toBe(true);
    }
  });
});

suite("v1.21 levels — per-level resolution", () => {
  it("shared settings and plan-global bindings apply to EVERY level", () => {
    const src = `plan "P" {
      grid 50
      paper A3 landscape
      scale 1:100
      let W = 4000
      level 1 { wall exterior thickness 200 { (0,0) (W,0) (W,3000) (0,3000) close } room id=r at (0,0) size W x 3000 }
      level 2 { wall exterior thickness 200 { (0,0) (W,0) (W,3000) (0,3000) close } room id=r at (0,0) size W x 3000 }
    }`;
    const { levels } = resolveAll(parse(src).plan!);
    expect(levels).toHaveLength(2);
    for (const l of levels) {
      expect(l.ir.grid).toBe(50);
      expect(l.ir.scale).toBe("1:100");
      expect(l.ir.sheet?.size).toBe("A3");
      // `let W` reached the level body.
      expect(l.ir.elements.find((e) => e.kind === "room")).toMatchObject({ size: { w: 4000 } });
    }
  });

  it("one building = one sheet: auto-fit picks ONE scale for every storey", () => {
    // A big ground floor and a small upper floor. Resolved separately, auto-fit would give
    // the small floor a finer scale; the shared sheet must not let that happen.
    const src = `plan "P" {
      paper A4 landscape
      level 1 { wall exterior thickness 200 { (0,0) (18000,0) (18000,12000) (0,12000) close } room at (0,0) size 18000x12000 }
      level 2 { wall exterior thickness 200 { (0,0) (3000,0) (3000,2000) (0,2000) close } room at (0,0) size 3000x2000 }
    }`;
    const { levels } = resolveAll(parse(src).plan!);
    const denoms = levels.map((l) => l.ir.sheet!.denom);
    expect(new Set(denoms).size).toBe(1);
    expect(levels.map((l) => l.ir.scale)).toEqual([`1:${denoms[0]}`, `1:${denoms[0]}`]);
  });

  it("W_SCALE_OVERFLOW is raised ONCE for the building, not once per page", () => {
    const src = `plan "P" {
      paper A4 landscape
      scale 1:20
      level 1 { wall exterior thickness 200 { (0,0) (18000,0) (18000,12000) (0,12000) close } room at (0,0) size 18000x12000 }
      level 2 { wall exterior thickness 200 { (0,0) (18000,0) (18000,12000) (0,12000) close } room at (0,0) size 18000x12000 }
    }`;
    const over = compile(src, { noCache: true }).diagnostics.filter((d) => d.code === "W_SCALE_OVERFLOW");
    expect(over).toHaveLength(1);
    // It describes the BUILDING, so it carries no storey.
    expect(over[0]!.level).toBeUndefined();
  });

  it("ids are unique per level: the same id on two storeys is legal (vertical identity)", () => {
    const r = compile(TWO_LEVELS, { noCache: true });
    expect(r.errors).toEqual([]);
    expect(r.diagnostics.filter((d) => d.code === "E_DUP_ID")).toEqual([]);
    for (const p of r.pages!) expect(p.scene).toBeDefined();
    // …and a duplicate WITHIN one level is still an error.
    const dup = compile(`plan "P" { level 1 { room id=r at (0,0) size 100x100 room id=r at (0,0) size 100x100 } }`, {
      noCache: true,
    });
    expect(dup.diagnostics.some((d) => d.code === "E_DUP_ID")).toBe(true);
  });

  it("auto-id counters restart per level", () => {
    const { levels } = resolveAll(parse(TWO_LEVELS).plan!);
    const wallIds = levels.map((l) => l.ir.walls.map((w) => w.id));
    expect(wallIds[0]).toEqual(wallIds[1]);
  });

  it("`resolve()` on a multi-storey AST yields the LOWEST storey plus every diagnostic", () => {
    const { plan } = parse(TWO_LEVELS);
    const one = resolve(plan!);
    const all = resolveAll(plan!);
    expect(one.ir).toBe(all.levels[0]!.ir);
    expect(one.diagnostics).toEqual(all.diagnostics);
  });
});

suite("v1.21 levels — compile().pages", () => {
  it("pages are ascending, carry name + scene, and page 1 IS `svg`/`scene`", () => {
    const r = compile(TWO_LEVELS, { noCache: true });
    expect(r.errors).toEqual([]);
    expect(r.pages!.map((p) => p.level)).toEqual([1, 2]);
    expect(r.pages!.map((p) => p.name)).toEqual(["Ground", "Upper"]);
    expect(r.svg).toBe(r.pages![0]!.svg);
    expect(r.scene).toBe(r.pages![0]!.scene);
    // The storeys really are different drawings.
    expect(r.pages![1]!.svg).not.toBe(r.pages![0]!.svg);
  });

  it("`pages` is absent for a single-storey plan and for a broken one", () => {
    expect(compile(`plan "P" { ${shell("A")} }`, { noCache: true })).not.toHaveProperty("pages");
    expect(compile(`plan "P" { level 1 { room at (0,0) size 0x0 } }`, { noCache: true }).pages).toBeUndefined();
  });

  it("every page carries a LEVEL row in its title block", () => {
    const r = compile(TWO_LEVELS, { noCache: true });
    const rows = r.pages!.map((p) => p.scene.chrome.titleBlock!.rows.find((x) => x.k === "LEVEL")!.v);
    expect(rows).toEqual(["1 — Ground", "2 — Upper"]);
    // A single-storey plan gets no LEVEL row (and, with no title, no title block at all).
    const single = compile(`plan "P" { ${shell("A")} }`, { noCache: true });
    expect(single.scene!.chrome.titleBlock).toBeNull();
  });

  it("is deterministic: two compiles are byte-equal, page for page", () => {
    const a = compile(TWO_STOREY, { noCache: true });
    const b = compile(TWO_STOREY, { noCache: true });
    expect(a.pages!.map((p) => p.svg)).toEqual(b.pages!.map((p) => p.svg));
  });
});

suite("v1.21 levels — describe()/lint() per storey", () => {
  it("top-level facts are the lowest storey; `levels[]` carries every one", () => {
    const s = describePlan(TWO_STOREY);
    expect(s.ok).toBe(true);
    expect(s.levels!.map((l) => [l.level, l.name])).toEqual([
      [1, "Ground floor"],
      [2, "First floor"],
    ]);
    const first = s.levels![0]!;
    expect(s.rooms).toEqual(first.rooms);
    expect(s.totals).toEqual(first.totals);
    expect(s.input_graph).toEqual(first.input_graph);
    // Each storey is summarized with the full single-plan shape.
    const upper = s.levels![1]!;
    expect(upper.rooms.map((r) => r.id)).toEqual(["landing", "bath", "bed1", "bed2"]);
    // The upper storey has NO exterior door of its own — its own door access graph says
    // so, honestly — and is reached by the stair instead (v1.21). `access` stays a
    // per-storey fact; the cross-storey answer lives in the building's `vertical` block.
    expect(upper.access.hasEntrance).toBe(false);
    expect(s.vertical!.reachable_levels).toEqual([1, 2]);
    expect(upper.caption).toContain("Bedroom 1");
  });

  it("`levels` is absent for a single-storey plan (append-only)", () => {
    expect(describePlan(`plan "P" { ${shell("A")} }`)).not.toHaveProperty("levels");
  });

  it("lint runs per storey and tags each warning with its level", () => {
    // A windowless bedroom upstairs only: the warning must exist AND say `level 2`.
    const src = `plan "P" {
      level 1 { ${shell("Living")} }
      level 2 { wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close } room id=b at (0,0) size 4000x3000 label "Bedroom" }
    }`;
    const w = lint(src).filter((d) => d.code === "W_BEDROOM_NO_WINDOW");
    expect(w).toHaveLength(1);
    expect(w[0]!.level).toBe(2);
  });

  it("an error on an UPPER storey still fails the whole plan", () => {
    const src = `plan "P" {\n  level 1 { ${shell("A")} }\n  level 2 { room at (0,0) size 0x3000 }\n}`;
    const r = compile(src, { noCache: true });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.diagnostics.find((d) => d.code === "E_ROOM_SIZE")!.level).toBe(2);
    expect(describePlan(src).ok).toBe(false);
  });
});

suite("v1.21 levels — repair recurses into storeys", () => {
  it("a fixture buried in a wall on level 2 gets a change entry (never silence)", () => {
    const src = `plan "P" {
  level 1 {
    wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r at (0,0) size 4000x3000 label "Living"
    door id=d at (2000,0) width 900
  }
  level 2 {
    wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r at (0,0) size 4000x3000 label "Living"
    door id=d at (2000,0) width 900
    furniture id=stuck sofa at (-100,1000) size 900x600
  }
}`;
    const out = repair(src);
    const touched = [...out.changes, ...out.unresolved].filter((c) => c.id === "stuck");
    expect(touched.length).toBeGreaterThan(0);
    // Whatever it did, it must attribute it to the storey it happened on.
    for (const c of out.changes) expect(c.level).toBe(2);
    expect(out.source).not.toBe(src);
    // The level structure survives the rewrite (both storeys still compile).
    expect(compile(out.source, { noCache: true }).pages).toHaveLength(2);
  });

  it("is idempotent across storeys (repairing twice is a fixpoint)", () => {
    const once = repair(TWO_STOREY);
    expect(once.changed).toBe(false);
    expect(once.source).toBe(TWO_STOREY);
  });
});

suite("v1.21 levels — the level-free corpus is byte-identical", () => {
  const EXAMPLES = readdirSync("examples").filter((f) => f.endsWith(".arch") && f !== "two-storey.arch");
  const world = {
    read: (p: string): string | null => {
      try {
        return readFileSync(`examples/${p}`, "utf8");
      } catch {
        return null;
      }
    },
  };
  for (const name of EXAMPLES) {
    it(`${name} still compiles with no pages and no level fields`, () => {
      const r = compile(readFileSync(`examples/${name}`, "utf8"), { noCache: true, world });
      expect(r.pages).toBeUndefined();
      expect(r.scene?.chrome.titleBlock?.rows.some((x) => x.k === "LEVEL") ?? false).toBe(false);
      expect(r.diagnostics.every((d) => d.level === undefined)).toBe(true);
    });
  }
});
