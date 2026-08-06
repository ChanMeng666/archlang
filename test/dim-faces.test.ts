import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyFixes, compile, describe as describePlan, lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RDim } from "../src/ir.js";
import { format } from "../src/format.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

/** The resolved dims of a plan (hand-written ones — `dims auto` chains never enter the IR). */
function dimsOf(src: string): RDim[] {
  const { plan } = parse(src);
  return resolve(plan!).ir.elements.filter((e): e is RDim => e.kind === "dim");
}

function diagsOf(src: string, code: string) {
  const { plan } = parse(src);
  return resolve(plan!).diagnostics.filter((d) => d.code === code);
}

/** A 5000×4000 room grid inside a 200 shell → 5200×4200 outside, 4800×3800 clear. */
const shell = (dims: string) =>
  `plan "P" {\n  units mm\n  grid 50\n` +
  `  wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }\n` +
  `  room id=r at (0,0) size 5000x4000 label "Studio"\n${dims}}\n`;

describe("`dim faces` / `dim clear` — endpoint projection onto the wall faces", () => {
  it("`faces` pushes both endpoints out onto the OUTER faces (outside-to-outside)", () => {
    const [d] = dimsOf(shell(`  dim faces (0,4000)->(5000,4000) offset 600\n`));
    expect(d!.from).toEqual({ x: -100, y: 4000 });
    expect(d!.to).toEqual({ x: 5100, y: 4000 });
    // No `text` → the dim prints the projected span, the size the building really is.
    expect(compile(shell(`  dim faces (0,4000)->(5000,4000) offset 600\n`), { noCache: true }).svg).toContain(">5200<");
  });

  it("`clear` pulls both endpoints in to the INNER faces (the clear width)", () => {
    const [d] = dimsOf(shell(`  dim clear (0,2000)->(5000,2000) offset 0\n`));
    expect(d!.from).toEqual({ x: 100, y: 2000 });
    expect(d!.to).toEqual({ x: 4900, y: 2000 });
    expect(compile(shell(`  dim clear (0,2000)->(5000,2000) offset 0\n`), { noCache: true }).svg).toContain(">4800<");
  });

  it("projects on the vertical axis too, and honours the per-side thickness", () => {
    const src =
      `plan "P" { units mm ` +
      `wall id=n exterior thickness 400 { (0,0) (5000,0) } ` +
      `wall id=s exterior thickness 200 { (0,4000) (5000,4000) } ` +
      `room id=r at (0,0) size 5000x4000 ` +
      `dim faces (0,0)->(0,4000) offset 600 }`;
    const [d] = dimsOf(src);
    // North wall is 400 thick (half 200), south 200 (half 100) → 4300 overall.
    expect(d!.from).toEqual({ x: 0, y: -200 });
    expect(d!.to).toEqual({ x: 0, y: 4100 });
  });

  it("only a wall PERPENDICULAR to the measurement can bound it (a corner is unambiguous)", () => {
    // At (0,4000) both the south and the west wall are at distance 0; a horizontal
    // measurement must project onto the WEST wall, never the south one it lies along.
    const [d] = dimsOf(shell(`  dim faces (0,4000)->(5000,4000) offset 600\n`));
    expect(d!.from.y, "the endpoint must not move along the measurement's own axis").toBe(4000);
  });

  it("is idempotent — an endpoint already on the outer face stays put", () => {
    const once = dimsOf(shell(`  dim faces (0,4000)->(5000,4000) offset 600\n`))[0]!;
    const twice = dimsOf(shell(`  dim faces (-100,4000)->(5100,4000) offset 600\n`))[0]!;
    expect(twice.from).toEqual(once.from);
    expect(twice.to).toEqual(once.to);
  });

  it("warns W_DIM_NO_WALL and keeps the raw point when there is no wall across the axis", () => {
    const src = shell(`  dim faces (0,9000)->(5000,9000) offset 600\n`);
    const ds = diagsOf(src, "W_DIM_NO_WALL");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.severity).toBe("warning");
    expect(ds[0]!.message).toContain("Both endpoints");
    expect(ds[0]!.span).toBeDefined();
    // Advisory: the written points are used as-is, so the plan still renders.
    const [d] = dimsOf(src);
    expect(d!.from).toEqual({ x: 0, y: 9000 });
    expect(d!.to).toEqual({ x: 5000, y: 9000 });
    expect(compile(src, { noCache: true }).errors).toEqual([]);
  });

  it("names the single endpoint that missed", () => {
    // The left endpoint is on the west wall; the right one is 4000 past the east wall.
    const ds = diagsOf(shell(`  dim faces (0,2000)->(9000,2000) offset 600\n`), "W_DIM_NO_WALL");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toContain("The end endpoint");
  });

  it("endpoints are measured verbatim — never grid-snapped (a face is legitimately off-grid)", () => {
    // grid 100 with a 250 shell: the thickness snaps to 300, so the faces are at ±150.
    const src =
      `plan "P" { units mm grid 100 ` +
      `wall id=shell exterior thickness 250 { (0,0) (5000,0) (5000,4000) (0,4000) close } ` +
      `room id=r at (0,0) size 5000x4000 ` +
      `dim faces (0,4000)->(5000,4000) offset 600 }`;
    const [d] = dimsOf(src);
    expect(d!.from.x).toBe(-150);
    expect(d!.to.x).toBe(5150);
  });

  it("survives the formatter and the Plan JSON round-trip", () => {
    const src = shell(`  dim faces (0,4000)->(5000,4000) offset 600\n`);
    expect(format(src)).toContain("dim faces (0, 4000)->(5000, 4000) offset 600");
    // The reformatted source still projects to the same geometry (only the byte
    // spans move), so a `fmt` pass can never silently drop the projection.
    const a = dimsOf(src)[0]!;
    const b = dimsOf(format(src))[0]!;
    expect({ from: b.from, to: b.to, offset: b.offset }).toEqual({ from: a.from, to: a.to, offset: a.offset });
  });
});

describe("W_DIM_INSIDE — a hand dim whose line reads inside the building", () => {
  const inside = (src: string) => lint(src).filter((d) => d.code === "W_DIM_INSIDE");

  it("fires when the endpoint order pushes the dimension line into the plan", () => {
    // Reversed pair: the left normal of (5000,4000)→(0,4000) points UP, so the 500
    // offset lands the line at y3500 — inside the 5000×4000 room.
    const src = shell(`  dim (5000,4000)->(0,4000) offset 500 text "5000"\n`);
    const ds = inside(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.severity).toBe("warning");
    expect(ds[0]!.fixes?.[0]?.applicability).toBe("machine-applicable");
  });

  it("does NOT fire for a correctly-ordered dim, a `faces` dim, or a zero-offset call-out", () => {
    expect(inside(shell(`  dim (0,4000)->(5000,4000) offset 500\n`))).toEqual([]);
    expect(inside(shell(`  dim faces (0,4000)->(5000,4000) offset 600\n`))).toEqual([]);
    expect(inside(shell(`  dim (2400,2000)->(2600,2000) offset 0 text "200"\n`))).toEqual([]);
  });

  it("never fires on the synthesized `dims auto` chains (they are not AST dims)", () => {
    const src =
      `plan "P" { units mm dims auto all ` +
      `wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close } ` +
      `room id=r at (0,0) size 5000x4000 ` +
      `door id=d at (2500,4000) width 900 wall shell hinge left swing in }`;
    expect(inside(src)).toEqual([]);
  });

  it("round-trips: applying the fix swaps the endpoints, clears the warning, keeps the length", () => {
    const src = shell(`  dim (5000,4000)->(0,4000) offset 500 text "5000"\n`);
    const fix = inside(src)[0]!.fixes![0]!;
    const { output } = applyFixes(src, [fix]);
    expect(output).toContain(`dim (0, 4000)->(5000, 4000) offset 500 text "5000"`);
    expect(inside(output)).toEqual([]);
    // Same measured span, mirrored to the outside.
    const before = dimsOf(src)[0]!;
    const after = dimsOf(output)[0]!;
    expect(Math.hypot(after.to.x - after.from.x, after.to.y - after.from.y)).toBe(
      Math.hypot(before.to.x - before.from.x, before.to.y - before.from.y),
    );
    expect(compile(output, { noCache: true }).errors).toEqual([]);
  });

  it("keeps authored expressions in the swapped text (one warning per source statement)", () => {
    const src =
      `plan "P" { units mm let H = 4000 ` +
      `wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close } ` +
      `room id=r at (0,0) size 5000x4000 ` +
      `for i in 0..2 { dim (5000,H)->(0,H) offset 500 text "{H}" } }`;
    const ds = inside(src);
    expect(ds, "the looped statement warns once, not twice").toHaveLength(1);
    expect(ds[0]!.fixes![0]!.edits[0]!.newText).toBe(`dim (0, H)->(5000, H) offset 500 text "{H}"`);
  });

  it("is not raised for any shipped example or eval golden", () => {
    for (const name of ["studio.arch", "two-bed.arch", "themed.arch", "relational.arch", "parametric.arch"]) {
      expect(inside(example(name)), name).toEqual([]);
    }
  });
});

describe("W_DIM_OVERLAP — two hand dims drawn on top of each other", () => {
  const over = (src: string) => lint(src).filter((d) => d.code === "W_DIM_OVERLAP");

  it("fires when two parallel dims land in the same tier, and reports the LATER statement", () => {
    const src = shell(
      `  dim (0,-100)->(5000,-100) offset -400 text "5000"\n` + `  dim (0,-100)->(3000,-100) offset -400 text "3000"\n`,
    );
    const ds = over(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.severity).toBe("warning");
    // The span is the SECOND statement's — the first-written dim keeps the inner tier.
    expect(src.slice(ds[0]!.span!.start, ds[0]!.span!.end)).toContain(`(0,-100)->(3000,-100)`);
    // …and the first is named as the thing it collides with.
    expect(src.slice(ds[0]!.relatedSpans![0]!.span.start, ds[0]!.relatedSpans![0]!.span.end)).toContain(
      `(0,-100)->(5000,-100)`,
    );
    expect(ds[0]!.fixes?.[0]?.applicability).toBe("machine-applicable");
  });

  it("does NOT fire for adjacent members of one chain (they SHARE the station tick)", () => {
    // The `examples/studio.arch` pattern: two runs meeting end-to-end at one tier.
    expect(
      over(
        shell(
          `  dim (3000,-100)->(0,-100) offset 300 text "3000"\n` +
            `  dim (5000,-100)->(3000,-100) offset 300 text "2000"\n`,
        ),
      ),
    ).toEqual([]);
  });

  it("does NOT fire for two dims crossing at a corner (not parallel — a bump can't help)", () => {
    expect(
      over(shell(`  dim (0,-100)->(5000,-100) offset 300\n` + `  dim (5100,0)->(5100,4000) offset -300\n`)),
    ).toEqual([]);
  });

  it("does NOT fire between two instances of ONE `for`-generated statement", () => {
    // Both instances share the `offset` expression, so no bump could separate them —
    // offering the fix would be offering an edit that does not fix.
    const src =
      `plan "P" { units mm ` +
      `wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close } ` +
      `room id=r at (0,0) size 5000x4000 ` +
      `for i in 0..2 { dim (0,-100)->(5000 - i * 100,-100) offset -400 } }`;
    expect(over(src)).toEqual([]);
  });

  it("never fires on the synthesized `dims auto` chains (they already tier themselves)", () => {
    const src =
      `plan "P" { units mm dims auto all ` +
      `wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close } ` +
      `room id=r at (0,0) size 5000x4000 ` +
      `door id=d at (2500,4000) width 900 wall shell hinge left swing in }`;
    expect(over(src)).toEqual([]);
  });

  it("round-trips: the fix rewrites only the `offset` clause, keeps its sign, and clears the warning", () => {
    const src = shell(
      `  dim (0,-100)->(5000,-100) offset -400 text "5000"\n` + `  dim (0,-100)->(3000,-100) offset -400 text "3000"\n`,
    );
    const fix = over(src)[0]!.fixes![0]!;
    const { output } = applyFixes(src, [fix]);
    expect(output).toContain(`dim (0,-100)->(5000,-100) offset -400 text "5000"`);
    // Moved further out on the SAME side (the sign is which side it reads on), and the
    // measured endpoints/text are untouched — only the tier moved.
    const bumped = dimsOf(output)[1]!;
    expect(bumped.offset).toBeLessThan(-400);
    expect({ from: bumped.from, to: bumped.to, text: bumped.text }).toEqual({
      from: { x: 0, y: -100 },
      to: { x: 3000, y: -100 },
      text: "3000",
    });
    expect(over(output)).toEqual([]);
    expect(compile(output, { noCache: true }).errors).toEqual([]);
  });

  it("INSERTS an `offset` clause before the trailing `text` when the dim has none", () => {
    const src = shell(`  dim (0,-100)->(5000,-100)\n` + `  dim (0,-100)->(3000,-100) text "3000"\n`);
    const { output } = applyFixes(src, [over(src)[0]!.fixes![0]!]);
    expect(output).toMatch(/dim \(0,-100\)->\(3000,-100\) offset \d+ text "3000"/);
    expect(over(output)).toEqual([]);
    expect(compile(output, { noCache: true }).errors).toEqual([]);
  });

  it("bumps by as many whole tiers as it takes — one application always clears the pair", () => {
    // The neighbour already sits a little further out, so a single fixed tier would land
    // the bumped dim right back inside its band.
    const src = shell(
      `  dim (0,-100)->(5000,-100) offset -380 text "5000"\n` + `  dim (0,-100)->(3000,-100) offset -300 text "3000"\n`,
    );
    expect(over(src)).toHaveLength(1);
    const { output } = applyFixes(src, [over(src)[0]!.fixes![0]!]);
    expect(over(output), "cleared in ONE application, not left for the fixpoint").toEqual([]);
  });

  it("is not raised for any shipped example", () => {
    for (const name of [
      "studio.arch",
      "two-bed.arch",
      "themed.arch",
      "relational.arch",
      "parametric.arch",
      "museum.arch",
      "aquarium.arch",
      "gallery-l.arch",
      "accessible.arch",
      "attached.arch",
    ]) {
      expect(over(example(name)), name).toEqual([]);
    }
  });
});

describe("describe().bbox_outer — the building measured on its wall faces", () => {
  it("reports the outer-face extent alongside the (unchanged) centerline bbox", () => {
    const s = describePlan(example("studio.arch"));
    expect(s.bbox, "centerline extent is normative and unchanged").toEqual({ w: 7000, h: 6000 });
    expect(s.bbox_outer, "outer faces of the 200 shell").toEqual({ w: 7200, h: 6200 });
  });

  it("matches what `dims auto`'s overall chain prints", () => {
    const src =
      `plan "P" { units mm dims auto overall ` +
      `wall exterior thickness 300 { (0,0) (6000,0) (6000,5000) (0,5000) close } ` +
      `room id=r at (0,0) size 6000x5000 }`;
    const s = describePlan(src);
    expect(s.bbox).toEqual({ w: 6000, h: 5000 });
    expect(s.bbox_outer).toEqual({ w: 6300, h: 5300 });
    const svg = compile(src, { noCache: true }).svg;
    expect(svg).toContain(">6300<");
    expect(svg).toContain(">5300<");
  });

  it("is 0×0 for a plan that failed to resolve", () => {
    expect(describePlan("plan").bbox_outer).toEqual({ w: 0, h: 0 });
  });
});
