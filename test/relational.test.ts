import { describe, expect, it } from "vitest";
import { compile, describe as describePlan } from "../src/index.js";

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

/**
 * The `align` × direction matrix, exhaustively — all 4 directions × all 6 edges.
 *
 * `alignOffset` answers an axis-mismatched edge by returning the LEADING edge, which is
 * the same thing it returns for no `align` at all. That made `right-of a align left` and
 * `right-of a align top` byte-identical plans with zero diagnostics: a derived position
 * silently wrong, the class AGENTS.md names, one level below the geometry cases. The
 * membership check in `1213e08` could not see it — `left` IS in `REL_ALIGNS`.
 *
 * A per-case matrix rather than a few examples because the accept-sets are **4/4, not
 * 3/3**: `alignOffset` tests `middle`/`center` before it tests the axis, so the centring
 * edge is honoured under both spellings on both axes. An implementation that "obviously"
 * splits the six words three and three refuses two forms that draw correctly today, and
 * only a full sweep of the grid catches that.
 */
describe("relational placement — the align/direction axis rule", () => {
  /** `b`'s resolved top-left, read from `describe()` rather than the SVG — the question
   *  here is where the room LANDED, and that is a semantic fact, not a rendering one. */
  const posOf = (source: string): string => {
    const r = describePlan(source).rooms.find((x) => x.id === "b");
    return r ? `${r.bbox.x},${r.bbox.y}` : "none";
  };
  const src = (dir: string, edge: string | null) =>
    `plan "P" {\n  units mm\n  room id=a at (3000,3000) size 2000x1000\n` +
    `  room id=b ${dir} a${edge ? ` align ${edge}` : ""} size 500x400\n}`;

  // dir → the edges it legitimately honours. Written out LITERALLY on purpose: this is
  // the assertion, so deriving it from the same table the implementation reads would make
  // the test agree with the code by construction rather than by observation.
  const HONOURED: Record<string, string[]> = {
    "right-of": ["top", "middle", "bottom", "center"],
    "left-of": ["top", "middle", "bottom", "center"],
    below: ["left", "center", "right", "middle"],
    above: ["left", "center", "right", "middle"],
  };
  const ALL = ["top", "middle", "bottom", "left", "center", "right"];

  for (const dir of Object.keys(HONOURED)) {
    for (const edge of ALL) {
      const legal = HONOURED[dir]!.includes(edge);
      it(`${dir} + align ${edge} ${legal ? "compiles" : "is E_ROOM_ALIGN_AXIS"}`, () => {
        const s = src(dir, edge);
        const cs = codes(s).filter(Boolean);
        if (legal) {
          expect(cs).toEqual([]);
          expect(posOf(s)).not.toBe("none");
          return;
        }
        expect(cs).toContain("E_ROOM_ALIGN_AXIS");
        // Errors are RETURNED, never thrown, and the span is on the offending WORD — not
        // the clause, not the statement — so an editor underlines the edge alone and the
        // fix rewrites exactly those bytes, leaving any label/`gap`/expression intact.
        const d = compile(s, { noCache: true }).diagnostics.find((x) => x.code === "E_ROOM_ALIGN_AXIS");
        expect(d?.severity).toBe("error");
        expect(s.slice(d?.span?.start, d?.span?.end)).toBe(edge);
        // …and it always carries a machine-applicable fix. Unlike the typo case there is
        // nothing to guess — the counterpart is positional (leading↔leading,
        // trailing↔trailing) — so there is no branch where it declines to offer one.
        const fix = d?.fixes?.[0];
        expect(fix?.applicability).toBe("machine-applicable");
        expect(fix?.edits[0]?.newText).toBe(
          { top: "left", bottom: "right", left: "top", right: "bottom" }[edge as "top" | "bottom" | "left" | "right"],
        );
      });
    }
  }

  it("a centring edge means the same thing under either spelling, on either axis", () => {
    // The 4/4 overlap is not merely tolerated, it is EQUAL: `center` and `middle` must
    // resolve to the identical coordinate, or "honoured on both axes" would be hiding a
    // second silent fallback rather than ruling one out.
    expect(posOf(src("right-of", "center"))).toBe(posOf(src("right-of", "middle")));
    expect(posOf(src("below", "middle"))).toBe(posOf(src("below", "center")));
    // …and centring is a real offset, not the leading edge wearing a different name.
    expect(posOf(src("right-of", "center"))).not.toBe(posOf(src("right-of", null)));
    expect(posOf(src("below", "middle"))).not.toBe(posOf(src("below", null)));
  });

  it("applying the fix leaves a LEADING mismatch drawing exactly as it did before", () => {
    // The half of this change that moves no pixels, pinned so the claim is checkable. The
    // silent fallback was the leading edge, so `right-of … align left` was ALREADY drawing
    // what `align top` means; the fix relabels it and the geometry is untouched. It is the
    // trailing mismatches that were drawn wrong, and the next case is their counterpart.
    expect(posOf(src("right-of", "top"))).toBe(posOf(src("right-of", null)));
    expect(posOf(src("below", "left"))).toBe(posOf(src("below", null)));
  });

  it("a TRAILING mismatch was the one drawing the wrong plan", () => {
    // `right-of a align right` fell through to the top edge; its counterpart `bottom` is
    // 600mm away. This is the pixel difference the silent fallback was hiding, and the
    // reason the fix is worth applying rather than merely worth reporting.
    expect(posOf(src("right-of", "bottom"))).not.toBe(posOf(src("right-of", null)));
    expect(posOf(src("below", "right"))).not.toBe(posOf(src("below", null)));
  });
});
