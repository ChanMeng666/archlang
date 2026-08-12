import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { approachGapMm, distPointToRect, frontGapMm, mm, shortfall } from "../src/lint/measure.js";
import { frontClearanceRect } from "../src/analyze.js";
import type { BBox } from "../src/geometry/rect.js";

/**
 * Direct coverage of `src/lint/measure.ts` — the measured half of the four advisory
 * placement warnings (`W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`, `W_FURN_CLEARANCE`,
 * `W_PATH_TOO_NARROW`).
 *
 * These five functions are pure arithmetic over millimetres, and they decide the
 * *numbers* a reader is told and — through `shortfall` — whether a deficit is reported
 * as a deficit at all. Until this file existed nothing imported the module: it was
 * covered only transitively, through rules whose fixtures fix one sign and one
 * magnitude each. A flipped comparison or a lost `Math.max(0, …)` would have made a
 * bad plan read clean with the whole suite green.
 *
 * The properties below are laws of the *contract*, not restatements of the code:
 * a distance is never negative and is zero exactly inside the shape; a shortfall is the
 * positive part of a difference; a clearance gap is bounded by the depth the rule asked
 * about; and `frontGapMm` agrees with `frontClearanceRect` about which way a fixture
 * faces for all four quarter-turns — which is the invariant `measure.ts`'s own doc
 * comment claims ("the two can never disagree") and the only one that cannot be checked
 * by reading either function alone.
 *
 * Every input is an INTEGER millimetre where a property compares two computed numbers,
 * so "exact" below means bit-exact — there is no epsilon anywhere in this file.
 */

/** Realistic millimetre magnitudes: a plan is metres-to-kilometres, never 1e21. */
const mmInt = (max = 1_000_000) => fc.integer({ min: -max, max });
/** A non-negative extent (a width, a height, a required clearance). */
const extent = (max = 100_000) => fc.integer({ min: 0, max });

const box = (): fc.Arbitrary<BBox> => fc.record({ x: mmInt(), y: mmInt(), w: extent(), h: extent() });

// ---------------------------------------------------------------------------
// mm() — the one place a measured number becomes prose
// ---------------------------------------------------------------------------

describe("mm — millimetre rounding into diagnostic prose", () => {
  it("rounds to whole millimetres (advisory clearances, not drawing coordinates)", () => {
    expect(mm(1234)).toBe("1234");
    expect(mm(1234.4)).toBe("1234");
    expect(mm(1234.6)).toBe("1235");
    expect(mm(0.4)).toBe("0");
  });

  it("rounds halves toward +infinity, on both signs (JS Math.round, not half-even)", () => {
    expect(mm(0.5)).toBe("1");
    expect(mm(1.5)).toBe("2");
    expect(mm(2.5)).toBe("3"); // half-even would say "2"
    expect(mm(-1.5)).toBe("-1"); // toward +inf, so -1 and not -2
    expect(mm(-2.5)).toBe("-2");
  });

  it("never prints a negative zero", () => {
    // Math.round(-0.4) and Math.round(-0.5) are both -0; fmt2 maps that to "0", which
    // is why a rule can subtract two near-equal measurements without printing "-0 mm".
    expect(mm(-0)).toBe("0");
    expect(mm(-0.4)).toBe("0");
    expect(mm(-0.5)).toBe("0");
    expect(Object.is(Math.round(-0.5), -0)).toBe(true); // the input that makes it matter
  });

  it("emits a bare integer literal — never a decimal point or an exponent", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }), (n) => {
        expect(mm(n)).toMatch(/^(0|-?[1-9]\d*)$/);
      }),
      { numRuns: 500 },
    );
  });

  it("round-trips: Number(mm(n)) is exactly Math.round(n)", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }), (n) => {
        // `=== ` rather than toBe so the -0 case (Math.round(-0.4)) compares equal to 0
        // instead of failing on the sign of zero, which mm() has deliberately erased.
        expect(Number(mm(n)) === Math.round(n)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("passes non-finite input straight through (documented boundary — the rules never produce it)", () => {
    // fmt2 is the 2 dp formatter WITHOUT `zeroNonFinite` (that is fmt3's behaviour, for
    // the expression evaluator). Every caller here feeds it a difference of two finite
    // millimetre coordinates, so this path is unreachable from lint; it is pinned only
    // so a future change to fmt2's non-finite policy is a decision, not a surprise.
    expect(mm(Number.NaN)).toBe("NaN");
    expect(mm(Number.POSITIVE_INFINITY)).toBe("Infinity");
    expect(mm(Number.NEGATIVE_INFINITY)).toBe("-Infinity");
  });
});

// ---------------------------------------------------------------------------
// shortfall() — the positive part of "required minus available"
// ---------------------------------------------------------------------------

describe("shortfall — how far `required` exceeds `available`", () => {
  it("is the deficit when short, and zero when met or exceeded", () => {
    expect(shortfall(900, 600)).toBe(300);
    expect(shortfall(900, 900)).toBe(0); // exactly met is NOT a shortfall
    expect(shortfall(900, 1200)).toBe(0); // surplus never reads as a negative deficit
  });

  it("is never negative", () => {
    fc.assert(
      fc.property(mmInt(), mmInt(), (required, available) => {
        expect(shortfall(required, available)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 500 },
    );
  });

  it("is zero exactly when the requirement is met", () => {
    fc.assert(
      fc.property(mmInt(), mmInt(), (required, available) => {
        expect(shortfall(required, available) === 0).toBe(available >= required);
      }),
      { numRuns: 500 },
    );
  });

  it("decomposes a difference into its two one-sided parts: s(r,a) - s(a,r) === r - a", () => {
    // The law that makes "600 mm available, 300 mm short" and "900 mm required" a
    // consistent triple in every message: the surplus and the deficit are the positive
    // and negative parts of one subtraction, so they can never both be non-zero and can
    // never both be zero unless the two numbers are equal.
    fc.assert(
      fc.property(mmInt(), mmInt(), (r, a) => {
        expect(shortfall(r, a) - shortfall(a, r)).toBe(r - a);
      }),
      { numRuns: 500 },
    );
  });

  it("never exceeds what was required, and required - shortfall is the smaller of the two", () => {
    fc.assert(
      fc.property(extent(), extent(), (required, available) => {
        expect(required - shortfall(required, available)).toBe(Math.min(required, available));
      }),
      { numRuns: 500 },
    );
  });

  it("is monotonically non-increasing in `available`", () => {
    fc.assert(
      fc.property(mmInt(), mmInt(), mmInt(), (required, a1, a2) => {
        const [lo, hi] = a1 <= a2 ? [a1, a2] : [a2, a1];
        expect(shortfall(required, lo)).toBeGreaterThanOrEqual(shortfall(required, hi));
      }),
      { numRuns: 500 },
    );
  });

  it("never prints as a negative zero through mm()", () => {
    expect(mm(shortfall(0, 0))).toBe("0");
    expect(mm(shortfall(-0, 0))).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// distPointToRect() — hinge-to-obstruction reach (W_SWING_OBSTRUCTED)
// ---------------------------------------------------------------------------

describe("distPointToRect — point to the nearest point of an axis-aligned rect", () => {
  const R: BBox = { x: 1000, y: 2000, w: 400, h: 600 }; // x 1000..1400, y 2000..2600

  it("is zero strictly inside", () => {
    expect(distPointToRect({ x: 1200, y: 2300 }, R)).toBe(0);
  });

  it("is zero on every edge and corner — an exactly-touching obstruction has no reach", () => {
    for (const p of [
      { x: 1000, y: 2300 }, // left edge
      { x: 1400, y: 2300 }, // right edge
      { x: 1200, y: 2000 }, // top edge
      { x: 1200, y: 2600 }, // bottom edge
      { x: 1000, y: 2000 }, // corners
      { x: 1400, y: 2600 },
    ]) {
      expect(distPointToRect(p, R)).toBe(0);
    }
  });

  it("measures the perpendicular standoff when the point is beside a face", () => {
    expect(distPointToRect({ x: 700, y: 2300 }, R)).toBe(300); // left
    expect(distPointToRect({ x: 1700, y: 2300 }, R)).toBe(300); // right
    expect(distPointToRect({ x: 1200, y: 1500 }, R)).toBe(500); // above
    expect(distPointToRect({ x: 1200, y: 3000 }, R)).toBe(400); // below
  });

  it("measures the diagonal off a corner (3-4-5, so the value is exact)", () => {
    expect(distPointToRect({ x: 1000 - 300, y: 2000 - 400 }, R)).toBe(500);
    expect(distPointToRect({ x: 1400 + 400, y: 2600 + 300 }, R)).toBe(500);
  });

  it("degenerates to point-to-point for a zero-size rect", () => {
    expect(distPointToRect({ x: 30, y: 40 }, { x: 0, y: 0, w: 0, h: 0 })).toBe(50);
  });

  it("is never negative", () => {
    fc.assert(
      fc.property(mmInt(), mmInt(), box(), (x, y, r) => {
        expect(distPointToRect({ x, y }, r)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 500 },
    );
  });

  it("is zero exactly when the point lies in the closed rect", () => {
    fc.assert(
      fc.property(mmInt(), mmInt(), box(), (x, y, r) => {
        const inside = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
        expect(distPointToRect({ x, y }, r) === 0).toBe(inside);
      }),
      { numRuns: 500 },
    );
  });

  it("is invariant under translating point and rect together (exactly, on integers)", () => {
    fc.assert(
      fc.property(mmInt(), mmInt(), box(), mmInt(1000), mmInt(1000), (x, y, r, dx, dy) => {
        const moved: BBox = { ...r, x: r.x + dx, y: r.y + dy };
        expect(distPointToRect({ x: x + dx, y: y + dy }, moved)).toBe(distPointToRect({ x, y }, r));
      }),
      { numRuns: 500 },
    );
  });

  it("is invariant under reflecting point and rect in the x axis", () => {
    // A wall's traversal direction can reverse, mirroring a hinge and its obstruction;
    // the measured reach must not depend on which way round the wall was authored.
    fc.assert(
      fc.property(mmInt(), mmInt(), box(), (x, y, r) => {
        const flipped: BBox = { ...r, x: -(r.x + r.w) };
        expect(distPointToRect({ x: -x, y }, flipped)).toBe(distPointToRect({ x, y }, r));
      }),
      { numRuns: 500 },
    );
  });

  it("grows monotonically as the point moves further out along one axis", () => {
    fc.assert(
      fc.property(box(), extent(10_000), extent(10_000), (r, d1, d2) => {
        const [near, far] = d1 <= d2 ? [d1, d2] : [d2, d1];
        const y = r.y; // on the rect's y range, so the distance is purely horizontal
        const a = distPointToRect({ x: r.x + r.w + near, y }, r);
        const b = distPointToRect({ x: r.x + r.w + far, y }, r);
        expect(b).toBeGreaterThanOrEqual(a);
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// approachGapMm() — clear depth on ONE side of a door opening (W_DOORWAY_BLOCKED)
// ---------------------------------------------------------------------------

describe("approachGapMm — clear landing depth on one side of an opening", () => {
  const DEPTH = 900;

  it("measures the standoff on whichever side the blocker sits", () => {
    // Blocker entirely before the opening line: gap is line - hi.
    expect(approachGapMm(5000, 4000, 4700, DEPTH)).toBe(300);
    // Blocker entirely after it: gap is lo - line.
    expect(approachGapMm(5000, 5250, 6000, DEPTH)).toBe(250);
  });

  it("leaves nothing when the blocker straddles the opening, or exactly touches it", () => {
    expect(approachGapMm(5000, 4800, 5200, DEPTH)).toBe(0); // straddling
    expect(approachGapMm(5000, 4000, 5000, DEPTH)).toBe(0); // far edge exactly on the line
    expect(approachGapMm(5000, 5000, 6000, DEPTH)).toBe(0); // near edge exactly on the line
  });

  it("caps at the required depth — a blocker beyond the landing is not extra credit", () => {
    expect(approachGapMm(5000, 0, 100, DEPTH)).toBe(DEPTH);
    expect(approachGapMm(5000, 99_000, 100_000, DEPTH)).toBe(DEPTH);
    expect(approachGapMm(5000, 4000, 5000 - DEPTH, DEPTH)).toBe(DEPTH); // exactly at the cap
  });

  it("stays within [0, depth]", () => {
    fc.assert(
      fc.property(mmInt(), mmInt(), extent(), extent(), (line, lo, span, depth) => {
        const gap = approachGapMm(line, lo, lo + span, depth);
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThanOrEqual(depth);
      }),
      { numRuns: 500 },
    );
  });

  it("is zero exactly when the blocker covers the opening line", () => {
    fc.assert(
      fc.property(mmInt(), mmInt(), extent(), extent(1), (line, lo, span, depth) => {
        // depth >= 1 so a genuine standoff can never round into the straddle case.
        const hi = lo + span;
        expect(approachGapMm(line, lo, hi, depth + 1) === 0).toBe(lo <= line && line <= hi);
      }),
      { numRuns: 500 },
    );
  });

  it("does not care which side of the opening the blocker is on (mirror symmetry)", () => {
    // Reflecting the whole axis about the origin swaps `before` and `after`; the clear
    // depth is a distance, so it must come back the same.
    fc.assert(
      fc.property(mmInt(), mmInt(), extent(), extent(), (line, lo, span, depth) => {
        const hi = lo + span;
        expect(approachGapMm(-line, -hi, -lo, depth)).toBe(approachGapMm(line, lo, hi, depth));
      }),
      { numRuns: 500 },
    );
  });

  it("is monotonically non-decreasing as the blocker retreats from the opening", () => {
    fc.assert(
      fc.property(mmInt(), extent(5_000), extent(20_000), extent(20_000), (line, span, d1, d2) => {
        const [near, far] = d1 <= d2 ? [d1, d2] : [d2, d1];
        // Blocker sitting `d` beyond the line, on the far side.
        const at = (d: number) => approachGapMm(line, line + d, line + d + span, 1_000);
        expect(at(far)).toBeGreaterThanOrEqual(at(near));
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// frontGapMm() — clear depth in a fixture's frontal use-space (W_FURN_CLEARANCE)
// ---------------------------------------------------------------------------

describe("frontGapMm — clear depth in a fixture's frontal use-space", () => {
  const FIXTURE: BBox = { x: 1000, y: 1000, w: 800, h: 400 };
  const CLEAR = 750;
  /** The zone `frontClearanceRect` would build for this fixture at quarter-turn `rot`. */
  const zoneAt = (rot: number) =>
    frontClearanceRect(
      { at: { x: FIXTURE.x, y: FIXTURE.y }, size: { w: FIXTURE.w, h: FIXTURE.h }, rotate: rot },
      CLEAR,
    );

  it("measures the standoff between the fixture's front face and the blocker (rot 0 = front south)", () => {
    const zone = zoneAt(0);
    const blocker: BBox = { x: 1000, y: FIXTURE.y + FIXTURE.h + 200, w: 800, h: 400 };
    expect(frontGapMm(FIXTURE, zone, blocker, CLEAR)).toBe(200);
  });

  it("leaves nothing when the blocker overlaps the fixture itself", () => {
    const zone = zoneAt(0);
    const blocker: BBox = { x: 1000, y: FIXTURE.y, w: 800, h: 1000 }; // starts inside the fixture
    expect(frontGapMm(FIXTURE, zone, blocker, CLEAR)).toBe(0);
  });

  it("is zero when the blocker is flush against the front face", () => {
    const zone = zoneAt(0);
    const blocker: BBox = { x: 1000, y: FIXTURE.y + FIXTURE.h, w: 800, h: 400 };
    expect(frontGapMm(FIXTURE, zone, blocker, CLEAR)).toBe(0);
  });

  it("caps at the required depth — floor beyond the use-space is not extra credit", () => {
    const zone = zoneAt(0);
    const far: BBox = { x: 1000, y: FIXTURE.y + FIXTURE.h + 50_000, w: 800, h: 400 };
    expect(frontGapMm(FIXTURE, zone, far, CLEAR)).toBe(CLEAR);
  });

  it("agrees with frontClearanceRect about which way the fixture faces, for all four quarter-turns", () => {
    // The law measure.ts's doc comment states: the outward direction is READ from the
    // zone's position rather than re-stating frontClearanceRect's `rotate` switch, so
    // the two can never disagree. That is only checkable across the two functions —
    // reading either one alone proves nothing. A blocker put `d` in front of the face
    // for the turn under test must measure `min(d, clearance)` for every turn.
    fc.assert(
      fc.property(
        fc.constantFrom(0, 90, 180, 270),
        mmInt(50_000),
        mmInt(50_000),
        fc.integer({ min: 1, max: 5_000 }),
        fc.integer({ min: 1, max: 5_000 }),
        fc.integer({ min: 1, max: 2_000 }),
        extent(4_000),
        (rot, fx, fy, fw, fh, clearance, d) => {
          const fixture: BBox = { x: fx, y: fy, w: fw, h: fh };
          const zone = frontClearanceRect({ at: { x: fx, y: fy }, size: { w: fw, h: fh }, rotate: rot }, clearance);
          // A generous blocker placed exactly `d` beyond the front face, spanning the zone.
          const T = 3_000;
          const blocker: BBox =
            rot === 90
              ? { x: fx - d - T, y: fy, w: T, h: fh } // front west
              : rot === 180
                ? { x: fx, y: fy - d - T, w: fw, h: T } // front north
                : rot === 270
                  ? { x: fx + fw + d, y: fy, w: T, h: fh } // front east
                  : { x: fx, y: fy + fh + d, w: fw, h: T }; // front south
          expect(frontGapMm(fixture, zone, blocker, clearance)).toBe(Math.min(d, clearance));
        },
      ),
      { numRuns: 600 },
    );
  });

  it("stays within [0, depth] for an arbitrary blocker", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0, 90, 180, 270),
        box(),
        fc.integer({ min: 1, max: 2_000 }),
        box(),
        (rot, f, clearance, blocker) => {
          const fixture: BBox = { ...f, w: Math.max(1, f.w), h: Math.max(1, f.h) };
          const zone = frontClearanceRect(
            { at: { x: fixture.x, y: fixture.y }, size: { w: fixture.w, h: fixture.h }, rotate: rot },
            clearance,
          );
          const gap = frontGapMm(fixture, zone, blocker, clearance);
          expect(gap).toBeGreaterThanOrEqual(0);
          expect(gap).toBeLessThanOrEqual(clearance);
        },
      ),
      { numRuns: 500 },
    );
  });
});
