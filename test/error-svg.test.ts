import { describe, expect, it } from "vitest";
import { compile, renderErrorSvg } from "../src/index.js";

/**
 * `onError: "svg"` — the opt-in error card (T2.1).
 *
 * The contract mirrors ADR 0007's `annotate`: the new rendering is reachable ONLY
 * through the explicit opt-in. With `onError` unset the default behavior is
 * byte-identical — a broken plan yields `svg: ""`, an error-free plan renders
 * exactly as before. The card itself is pure, deterministic, and lists every
 * diagnostic (code / severity / message / fix).
 */

// A plan with a single, catalogued error (zero-size room).
const BROKEN = `plan "x" {
  room id=r at (0,0) size 0x0
}`;

// A plan with two distinct errors, to check every code reaches the card.
const BROKEN_MULTI = `plan "y" {
  room id=a at (0,0) size 0x0
  room id=b at (0,0) size -5x-5
}`;

// A valid, renderable plan.
const VALID = `plan "ok" {
  units mm
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r1 at (0,0) size 4000x3000 label "Room"
}`;

describe("onError: 'svg' (opt-in error card)", () => {
  it("default (no onError) leaves svg empty on a broken plan — the invariant", () => {
    const { svg, errors } = compile(BROKEN, { noCache: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(svg).toBe("");
  });

  it("onError: 'svg' renders a card naming each diagnostic code; diagnostics unchanged", () => {
    const plain = compile(BROKEN_MULTI, { noCache: true });
    const carded = compile(BROKEN_MULTI, { onError: "svg", noCache: true });

    // The card is a real SVG mentioning every diagnostic code.
    expect(carded.svg).toContain("<svg");
    expect(carded.svg).not.toBe("");
    const codes = new Set(carded.diagnostics.map((d) => d.code).filter(Boolean));
    expect(codes.size).toBeGreaterThan(0);
    for (const code of codes) expect(carded.svg).toContain(code as string);

    // Only `svg` differs — errors/warnings/diagnostics are byte-for-byte identical.
    expect(carded.errors).toEqual(plain.errors);
    expect(carded.warnings).toEqual(plain.warnings);
    expect(carded.diagnostics).toEqual(plain.diagnostics);
  });

  it("valid source with onError: 'svg' is byte-identical to the default compile", () => {
    const plain = compile(VALID, { noCache: true });
    const carded = compile(VALID, { onError: "svg", noCache: true });
    expect(plain.svg).not.toBe("");
    expect(carded.svg).toBe(plain.svg);
    expect(carded.errors).toEqual([]);
  });

  it("is deterministic — two error-card compiles are byte-equal", () => {
    const a = compile(BROKEN_MULTI, { onError: "svg", noCache: true }).svg;
    const b = compile(BROKEN_MULTI, { onError: "svg", noCache: true }).svg;
    expect(a).toBe(b);
  });

  it("escapes user text drawn into the card", () => {
    const src = `plan "z" {
  room id=r at (0,0) size 0x0 label "<script>&amp;"
}`;
    const { svg } = compile(src, { onError: "svg", noCache: true });
    // No raw angle brackets from the label leak into the markup.
    expect(svg).not.toContain("<script>");
  });

  it("renderErrorSvg is a stable snapshot for a fixed broken source", () => {
    const { diagnostics } = compile(BROKEN, { noCache: true });
    const svg = renderErrorSvg(BROKEN, diagnostics);
    expect(svg).toMatchSnapshot();
  });
});
