/**
 * The `fence` element (v1.31).
 *
 * The load-bearing claim is a NEGATIVE one — a fence is not a thin wall — and a suite
 * that only checked "it draws a line" would pass while `fence` quietly hosted a door,
 * joined the access graph or grew a poché fill. So most of what follows asserts what a
 * fence does NOT do, by comparing a plan against the same plan with the fence deleted.
 */

import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, lint, planToJson, toDxf } from "../src/index.js";
import { renderAscii } from "../src/backends/ascii.js";
import { FENCE_STYLES } from "../src/ast.js";
import { format } from "../src/format.js";

const plan = (body: string): string => `plan "Boundary" {\n  units mm\n${body}\n}\n`;

const BOX = `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }`;
const ROOM = `  room id=r1 at (0,0) size 8000x5000 label "Hall" uses living`;
const DOOR = `  door id=d1 on w1 at 30% width 900`;

const errorsOf = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "");

// ---------------------------------------------------------------------------
// 1 — it parses, in every spelling
// ---------------------------------------------------------------------------

describe("fence — parsing", () => {
  it("takes an optional leading style word, and defaults", () => {
    for (const style of FENCE_STYLES) {
      const s = describePlan(plan(`  fence id=f ${style} { (0,0) (9000,0) }`));
      expect(s.fences![0]!.style, style).toBe(style);
    }
    // Omitted, it is the first of the closed set — and the resolver STORES it, so an
    // omitted word and an explicit one are indistinguishable downstream.
    expect(describePlan(plan(`  fence { (0,0) (9000,0) }`)).fences![0]!.style).toBe(FENCE_STYLES[0]);
  });

  it("takes an `id=` before the style word", () => {
    expect(describePlan(plan(`  fence id=north picket { (0,0) (9000,0) }`)).fences![0]!.id).toBe("north");
  });

  it("auto-ids when none is given", () => {
    const ids = describePlan(plan(`  fence { (0,0) (9,0) }\n  fence { (0,9) (9,9) }`)).fences!.map((f) => f.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("`close` makes a loop, and its absence leaves the run open", () => {
    expect(describePlan(plan(`  fence { (0,0) (9000,0) (9000,6000) close }`)).fences![0]!.closed).toBe(true);
    expect(describePlan(plan(`  fence { (0,0) (9000,0) (9000,6000) }`)).fences![0]!.closed).toBe(false);
  });

  it("needs at least two points", () => {
    const d = compile(plan(`  fence { (0,0) }`), { noCache: true }).diagnostics;
    expect(d.some((x) => /at least two points/.test(x.message))).toBe(true);
  });

  it("an unknown style word is not silently swallowed as a body", () => {
    // `chainlink` is not a style, so it is not consumed as one — and what follows is then
    // not a `{`, which is a parse error rather than a fence with a mystery word in it.
    expect(errorsOf(plan(`  fence chainlink { (0,0) (9000,0) }`)).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2 — it measures
// ---------------------------------------------------------------------------

describe("fence — describe().fences", () => {
  it("reports the summed run length", () => {
    const f = describePlan(plan(`  fence id=f { (0,0) (9000,0) (9000,6000) }`)).fences![0]!;
    expect(f.length_mm).toBe(15000);
  });

  it("counts the closing segment only when the run closes", () => {
    const open = describePlan(plan(`  fence { (0,0) (3000,0) (3000,4000) }`)).fences![0]!;
    const shut = describePlan(plan(`  fence { (0,0) (3000,0) (3000,4000) close }`)).fences![0]!;
    expect(open.length_mm).toBe(7000);
    // …plus the 5-12-13 hypotenuse back to the start.
    expect(shut.length_mm).toBe(12000);
  });

  it("measures a diagonal run exactly, not by its bounding box", () => {
    const f = describePlan(plan(`  fence { (0,0) (3000,4000) }`)).fences![0]!;
    expect(f.length_mm).toBe(5000);
  });

  it("the key is absent from a plan that declares no fence", () => {
    expect(describePlan(plan(`${BOX}\n${ROOM}`))).not.toHaveProperty("fences");
  });
});

// ---------------------------------------------------------------------------
// 3 — it is NOT a wall (the load-bearing negative)
// ---------------------------------------------------------------------------

describe("fence — is not a thin wall", () => {
  const bare = plan(`${BOX}\n${ROOM}\n${DOOR}`);
  const fenced = plan(`${BOX}\n${ROOM}\n${DOOR}\n  fence picket { (-3000,-3000) (14000,-3000) (14000,9000) close }`);

  it("adds nothing to `describe().walls`, the access graph or the input graph", () => {
    const a = describePlan(bare);
    const b = describePlan(fenced);
    expect(b.access).toEqual(a.access);
    expect(b.input_graph).toEqual(a.input_graph);
    expect(b.rooms).toEqual(a.rooms);
    expect(b.totals.floor_area_m2).toBe(a.totals.floor_area_m2);
  });

  it("cannot host an opening — `door on <fence>` finds no such wall", () => {
    // The whole "not a wall" claim in one statement: a fence is not in `ir.walls`, so an
    // opening naming it has no host. If a future change put fences in that list, this is
    // the test that would go red.
    const src = plan(`  fence id=f { (0,0) (9000,0) }\n  door id=d on f at 50% width 900`);
    expect(errorsOf(src).length).toBeGreaterThan(0);
  });

  it("draws no poché — no wall pattern fill appears for a fence-only plan", () => {
    const svg = compile(plan(`  fence picket { (0,0) (9000,0) }`), { noCache: true }).svg;
    expect(svg).not.toContain("url(#poche)");
  });

  it("does not change one byte of `planToJson`", () => {
    const a = planToJson(bare);
    const b = planToJson(fenced);
    expect(a.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(b.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(JSON.stringify(b.json)).toBe(JSON.stringify(a.json));
  });

  it("raises no lint warning of its own", () => {
    expect(lint(fenced).map((d) => d.code)).toEqual(lint(bare).map((d) => d.code));
  });
});

// ---------------------------------------------------------------------------
// 4 — it draws
// ---------------------------------------------------------------------------

describe("fence — the drawing", () => {
  it("lands on the L-SITE CAD layer in SVG and DXF", () => {
    const src = plan(`  fence picket { (0,0) (9000,0) }`);
    expect(compile(src, { noCache: true }).svg).toContain('<g id="L-SITE"');
    const { scene } = compile(src, { noCache: true });
    expect(toDxf(scene!)).toContain("L-SITE");
  });

  it("the three styles draw DIFFERENT things", () => {
    const svgOf = (style: string): string =>
      compile(plan(`  fence ${style} { (0,0) (9000,0) }`), { noCache: true }).svg;
    const [a, b, c] = FENCE_STYLES.map(svgOf);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it("`picket` is posted more densely than `post` over the same run", () => {
    const lines = (style: string): number =>
      (compile(plan(`  fence ${style} { (0,0) (18000,0) }`), { noCache: true }).svg.match(/<line /g) ?? []).length;
    expect(lines("picket")).toBeGreaterThan(lines("post"));
  });

  it("`panel` draws a double line where `post` draws one", () => {
    // The run line itself: `panel` emits two, the other two styles one.
    const horizontals = (style: string): number =>
      (
        compile(plan(`  fence ${style} { (0,0) (9000,0) }`), { noCache: true }).svg.match(
          /<line x1="[\d.-]+" y1="([\d.-]+)" x2="[\d.-]+" y2="\1"/g,
        ) ?? []
      ).length;
    expect(horizontals("panel")).toBe(2);
    expect(horizontals("post")).toBe(1);
  });

  it("a closed run draws its closing segment", () => {
    const open = compile(plan(`  fence post { (0,0) (9000,0) (9000,6000) }`), { noCache: true }).svg;
    const shut = compile(plan(`  fence post { (0,0) (9000,0) (9000,6000) close }`), { noCache: true }).svg;
    expect(shut.length).toBeGreaterThan(open.length);
  });

  it("joins the page bounds — a far-flung fence is not clipped away", () => {
    const near = compile(plan(`${BOX}\n${ROOM}`), { noCache: true }).svg;
    const far = compile(plan(`${BOX}\n${ROOM}\n  fence post { (30000,0) (30000,9000) }`), { noCache: true }).svg;
    const vb = (s: string): string => /viewBox="([^"]+)"/.exec(s)![1]!;
    expect(vb(far)).not.toBe(vb(near));
  });

  it("the ASCII backend renders a fenced plan without throwing", () => {
    const { scene } = compile(plan(`${BOX}\n${ROOM}\n  fence post { (-2000,-2000) (12000,-2000) }`), { noCache: true });
    expect(() => renderAscii(scene!)).not.toThrow();
  });

  it("renders deterministically", () => {
    const src = plan(`  fence picket { (0,0) (9000,0) (9000,6000) close }`);
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});

// ---------------------------------------------------------------------------
// 5 — the curved refusal
// ---------------------------------------------------------------------------

describe("fence — refuses a curve rather than faceting it", () => {
  it("E_FENCE_CURVED on an `arc` edge", () => {
    expect(errorsOf(plan(`  fence picket { (0,0) arc (3000,3000) radius 3000 }`))).toContain("E_FENCE_CURVED");
  });

  it("the clause is CONSUMED, so the refusal is one diagnostic and not a cascade", () => {
    // The reason `arc` is parsed and then refused rather than failed at the keyword: a
    // parser that stopped there would read the radius as the next vertex.
    const d = compile(plan(`  fence picket { (0,0) arc (3000,3000) radius 3000 (6000,3000) }`), {
      noCache: true,
    }).diagnostics.filter((x) => x.severity === "error");
    expect(d).toHaveLength(1);
    expect(d[0]!.code).toBe("E_FENCE_CURVED");
  });

  it("a straight fence raises nothing", () => {
    expect(errorsOf(plan(`  fence picket { (0,0) (3000,0) (3000,3000) }`))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6 — `arch fmt`
// ---------------------------------------------------------------------------

describe("fence — `arch fmt` round-trips every spelling", () => {
  for (const body of [
    `  fence { (0,0) (9000,0) }`,
    `  fence id=f picket { (0,0) (9000,0) (9000,6000) close }`,
    `  fence panel { (0,0) (9000,0) }`,
    `  fence post { (0,0) (9000,0) }`,
  ]) {
    it(`round-trips: ${body.trim()}`, () => {
      const src = plan(body);
      const once = format(src);
      expect(format(once)).toBe(once);
      expect(compile(once, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
      expect(JSON.stringify(describePlan(once))).toBe(JSON.stringify(describePlan(src)));
    });
  }

  it("prints the style word even when the source omitted it — lossless, and one branch fewer", () => {
    expect(format(plan(`  fence { (0,0) (9000,0) }`))).toContain(`fence ${FENCE_STYLES[0]} {`);
  });
});
