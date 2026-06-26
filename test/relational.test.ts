import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

/**
 * T6.2 — deterministic relational placement.
 *
 * A relational clause (`right-of`/`left-of`/`below`/`above` + optional
 * `align`/`gap`) resolves a room's top-left corner by *pure arithmetic* in
 * dependency order (topological sort over references). The absolute/"manual"
 * `at (x,y)` path is unchanged and stays byte-identical, so the core guard here
 * is: a relational plan compiles to the *same SVG* as the hand-computed manual
 * plan.
 */

const svgOf = (src: string) => compile(src, { noCache: true });
const codes = (src: string) => compile(src, { noCache: true }).diagnostics.map((d) => d.code);

describe("relational placement — equivalence with manual coords", () => {
  it("right-of + align top reduces to absolute coordinates", () => {
    const rel = svgOf(`plan "P" {
      units mm
      grid 50
      room id=living at (0,0) size 4000x6000 label "Living"
      room id=kitchen right-of living align top gap 100 size 3000x4000 label "Kitchen"
    }`);
    const manual = svgOf(`plan "P" {
      units mm
      grid 50
      room id=living at (0,0) size 4000x6000 label "Living"
      room id=kitchen at (4100,0) size 3000x4000 label "Kitchen"
    }`);
    expect(rel.errors).toEqual([]);
    expect(manual.errors).toEqual([]);
    expect(rel.svg).toBe(manual.svg);
  });

  it("below + align left reduces to absolute coordinates", () => {
    const rel = svgOf(`plan "P" {
      units mm
      grid 50
      room id=a at (0,0) size 4000x6000
      room id=b below a align left gap 200 size 3000x4000
    }`);
    const manual = svgOf(`plan "P" {
      units mm
      grid 50
      room id=a at (0,0) size 4000x6000
      room id=b at (0,6200) size 3000x4000
    }`);
    expect(rel.errors).toEqual([]);
    expect(rel.svg).toBe(manual.svg);
  });

  it("left-of / above place on the leading side", () => {
    const rel = svgOf(`plan "P" {
      units mm
      grid 50
      room id=anchor at (5000,5000) size 2000x2000
      room id=west left-of anchor gap 100 size 1000x2000
      room id=north above anchor gap 100 size 2000x1000
    }`);
    const manual = svgOf(`plan "P" {
      units mm
      grid 50
      room id=anchor at (5000,5000) size 2000x2000
      room id=west at (3900,5000) size 1000x2000
      room id=north at (5000,3900) size 2000x1000
    }`);
    expect(rel.errors).toEqual([]);
    expect(rel.svg).toBe(manual.svg);
  });

  it("resolves transitively in dependency order, not declaration order", () => {
    // `c` is declared before `b` but depends on it — a topological sort must
    // place `b` first. gap 0 keeps the arithmetic obvious.
    const rel = svgOf(`plan "P" {
      units mm
      grid 50
      room id=a at (0,0) size 1000x1000
      room id=c right-of b gap 0 size 1000x1000
      room id=b right-of a gap 0 size 1000x1000
    }`);
    const manual = svgOf(`plan "P" {
      units mm
      grid 50
      room id=a at (0,0) size 1000x1000
      room id=c at (2000,0) size 1000x1000
      room id=b at (1000,0) size 1000x1000
    }`);
    expect(rel.errors).toEqual([]);
    expect(rel.svg).toBe(manual.svg);
  });
});

describe("relational placement — determinism", () => {
  it("compile(s) === compile(s) for a relational plan", () => {
    const src = `plan "P" {
      units mm
      grid 50
      room id=living at (0,0) size 4000x6000
      room id=kitchen right-of living align top gap 100 size 3000x4000
      room id=hall below living align left gap 100 size 7100x1500
    }`;
    expect(svgOf(src).svg).toBe(svgOf(src).svg);
  });
});

describe("relational placement — diagnostics", () => {
  it("a cycle reports E_LAYOUT_CYCLE", () => {
    const src = `plan "P" {
      units mm
      room id=a right-of b size 100x100
      room id=b left-of a size 100x100
    }`;
    expect(codes(src)).toContain("E_LAYOUT_CYCLE");
    expect(svgOf(src).svg).toBe("");
  });

  it("an unknown reference reports E_LAYOUT_REF", () => {
    const src = `plan "P" {
      units mm
      room id=k right-of ghost size 100x100
    }`;
    expect(codes(src)).toContain("E_LAYOUT_REF");
  });
});
