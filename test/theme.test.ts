import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

const wallPlan = (extra = "") =>
  `plan "T" { ${extra} wall w thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close } }`;

/** The wall outline's stroke-width (the mitred union path). */
function wallStrokeWidth(svg: string): number {
  const m = svg.match(/stroke-width="([0-9.]+)" stroke-linejoin="miter"/);
  return m ? Number(m[1]) : NaN;
}

describe("theme directive", () => {
  it("recolours via friendly alias keys", () => {
    const { svg, errors } = compile(wallPlan(`theme { wall: "#ff0000" room: "#00ff00" }`), { noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain('stroke="#ff0000"'); // wall outline
  });

  it("sets the font-family", () => {
    const { svg } = compile(wallPlan(`theme { font: "Georgia, serif" }`), { noCache: true });
    expect(svg).toContain('font-family="Georgia, serif"');
  });

  it("scales stroke widths by lineWeight", () => {
    const base = wallStrokeWidth(compile(wallPlan(), { noCache: true }).svg);
    const heavy = wallStrokeWidth(compile(wallPlan(`theme { lineWeight: 2 }`), { noCache: true }).svg);
    expect(base).toBeGreaterThan(0);
    expect(heavy).toBeCloseTo(base * 2, 5);
  });

  it("warns on an unknown theme key", () => {
    const { diagnostics } = compile(wallPlan(`theme { sparkle: "#fff" }`), { noCache: true });
    expect(diagnostics.some((d) => d.code === "W_UNKNOWN_THEME_KEY")).toBe(true);
  });
});

describe("CompileOptions.theme", () => {
  it("overrides the plan directive (options win)", () => {
    const { svg } = compile(wallPlan(`theme { wall: "#ff0000" }`), {
      noCache: true,
      theme: { wallStroke: "#0000ff" },
    });
    expect(svg).toContain('stroke="#0000ff"');
    expect(svg).not.toContain('stroke="#ff0000"');
  });

  it("is keyed into the cache (different theme → different result)", () => {
    const a = compile(wallPlan(), { theme: { wallStroke: "#111111" } });
    const b = compile(wallPlan(), { theme: { wallStroke: "#222222" } });
    expect(a.svg).not.toBe(b.svg);
    expect(a.svg).toContain('stroke="#111111"');
  });

  it("is deterministic", () => {
    const opts = { noCache: true, theme: { wallStroke: "#abcdef", lineWeight: 1.5 } };
    expect(compile(wallPlan(), opts).svg).toBe(compile(wallPlan(), opts).svg);
  });
});
