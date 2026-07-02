import { describe, expect, it } from "vitest";
import { compile, clearCache, registerTheme, derivePoche, hexToHsl, hslToHex } from "../src/index.js";

const BASE = `plan "P" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "Room"
  furniture bed at (500,500) size 1500x2000 label "Bed"
}`;

function withDirective(d: string): string {
  return BASE.replace("grid 50", `grid 50\n  ${d}`);
}

describe("T4.4 — named theme bases", () => {
  it("`theme blueprint { }` applies the named base deterministically", () => {
    clearCache();
    const src = withDirective("theme blueprint { }");
    const a = compile(src, { noCache: true });
    const b = compile(src, { noCache: true });
    expect(a.errors).toEqual([]);
    expect(a.svg).toBe(b.svg); // deterministic
    expect(a.svg).toContain("#0b3d6b"); // blueprint background/fill colour
  });

  it("`theme blueprint` one-liner (no block) also applies", () => {
    const src = withDirective("theme blueprint");
    const { svg, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain("#0b3d6b");
  });

  it("plan `theme { }` overrides win over the named base", () => {
    const src = withDirective('theme blueprint { background: "#123456" }');
    const { svg } = compile(src, { noCache: true });
    expect(svg).toContain("#123456");
  });

  it("an unknown named base is ignored (treated as default)", () => {
    const src = withDirective("theme nonesuch { }");
    const def = compile(BASE, { noCache: true });
    const unk = compile(src, { noCache: true });
    expect(unk.svg).toBe(def.svg); // unknown base contributes nothing
  });
});

describe("T4.4 — per-element style overrides", () => {
  it("`style room { fill }` changes only the room fill", () => {
    const src = withDirective('style room { fill: "#abcdef" }');
    const { svg, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain("#abcdef");
  });

  it("CompileOptions.theme still wins over a per-element style", () => {
    const src = withDirective('style room { fill: "#abcdef" }');
    const { svg } = compile(src, { noCache: true, theme: { roomFill: "#999999" } });
    expect(svg).toContain("#999999");
    expect(svg).not.toContain("#abcdef");
  });

  it("an unknown style key warns and is skipped", () => {
    const src = withDirective('style room { bogus: "#000000" }');
    const { diagnostics } = compile(src, { noCache: true });
    expect(diagnostics.some((d) => d.code === "W_UNKNOWN_STYLE_KEY")).toBe(true);
  });
});

describe("T4.4 — opt-in poché derivation (`theme from`)", () => {
  it("derives exact pocheBase/pocheHatch deterministically", () => {
    const wall = "#1b3a5c";
    const p = derivePoche(wall);
    expect(p.wallStroke).toBe(wall);
    expect(derivePoche(wall)).toEqual(p); // pure / deterministic
    const src = withDirective(`theme from "${wall}"`);
    const a = compile(src, { noCache: true });
    const b = compile(src, { noCache: true });
    expect(a.svg).toBe(b.svg);
    expect(a.svg).toContain(p.pocheBase!.replace("&", "&amp;"));
  });

  it("does NOT fire without `theme from` — default poché is unchanged", () => {
    const { svg } = compile(BASE, { noCache: true });
    expect(svg).toContain("#e9e4db"); // the default pocheBase
  });

  it("HSL round-trips the canonical colours within rounding", () => {
    for (const hex of ["#000000", "#ffffff", "#1b3a5c", "#e9e4db"]) {
      const hsl = hexToHsl(hex)!;
      expect(hexToHsl(hslToHex(hsl.h, hsl.s, hsl.l))).toEqual(hexToHsl(hex));
    }
  });
});

describe("T4.4 — registered themes", () => {
  it("registerTheme adds a named base usable via `theme <name>` and is cache-keyed", () => {
    clearCache();
    const neon = registerTheme("neon", { bg: "#00ff88", roomFill: "#00ff88" });
    const src = withDirective("theme neon { }");
    const opts = { themes: [neon] }; // one array reference → stable identity
    const a = compile(src, opts);
    expect(a.svg).toContain("#00ff88");
    const b = compile(src, opts);
    expect(a).toBe(b); // same themes array → cache hit
    // Without the registered theme, "neon" is unknown → default (no neon colour).
    const plain = compile(src, { noCache: true });
    expect(plain.svg).not.toContain("#00ff88");
  });
});
