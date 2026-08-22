import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  IDENTITY,
  composeFrame,
  det,
  inverse,
  isIdentity,
  makeFrame,
  nsId,
  tp,
  transformDeg,
  transformElement,
  transformRect,
  type Frame,
} from "../src/frame.js";
import { compile } from "../src/index.js";
import { arcFromChord, arcPointAt } from "../src/geometry/arc.js";
import type { Arc } from "../src/geometry/arc.js";
import type { Point } from "../src/ast.js";
import type { WallSegment } from "../src/geometry.js";
import type { RColumn, RDim, RDoor, RFurniture, RRoom, RWall, ResolvedElement } from "../src/ir.js";

/**
 * Direct coverage of `src/frame.ts` — the exact-isometry layer behind `place` (and, via
 * the same resolution groups, `level`). See [ADR 0016](../docs/adr/0016-component-instances-and-frames.md):
 * an instance resolves entirely in its OWN frame, against its own walls and rooms, and
 * ONE rigid transform then carries the resolved output into plan coordinates. This file
 * tests that transform; it never pre-transforms an input, because nothing in the system
 * ever does.
 *
 * Until now `frame.ts` was imported only by `src/ir.ts` and exercised only end-to-end,
 * where a wrong sign produces a plausible-looking drawing that the goldens happily pin
 * (a mirrored wing is still a wing). Three of its exports — `inverse`, `isIdentity` and
 * `tp` — have no caller in `src/` at all, so they had literally nothing checking them.
 *
 * **There is no epsilon in this file, deliberately — with one bounded exception, named
 * below.** A frame is a 2×2 signed-permutation matrix (entries in `{-1,0,1}`, `|det| = 1`)
 * plus a translation: no trig, no float introduced, so every round trip below is asserted
 * bit-exact. The single standing concession is `nz()`, which folds `-0` to `0` before
 * comparing — `0 * -1` and `-0 / 1` are how IEEE writes zero after a reflection, and
 * `-0 === 0` is already true; that is a sign convention, not a tolerance. The exception is
 * the `transformArc` section at the foot: an `Arc` carries `start` as an ANGLE, so
 * sampling a point along a curve goes through `cos`/`sin` no matter how exact the frame
 * is. Everything a frame's integer arithmetic actually touches — the centre, the radius,
 * both endpoints, and the sign and magnitude of the sweep — is still asserted exactly
 * there; `NEAR` appears only on the two laws that walk the curve.
 */

/** Fold `-0` to `0`. NOT a tolerance — `-0 === 0` in IEEE; this only fixes the printed diff. */
const nz = (n: number): number => (Object.is(n, -0) ? 0 : n);
const pt = (p: Point): Point => ({ x: nz(p.x), y: nz(p.y) });
/** The whole linear+translation part, normalised only for signed zero. */
const mat = (f: Frame) => ({ a: nz(f.a), b: nz(f.b), c: nz(f.c), d: nz(f.d), tx: nz(f.tx), ty: nz(f.ty) });

const ROTATIONS = [0, 90, 180, 270] as const;
const MIRRORS = [undefined, "x", "y"] as const;

/** A dot-free identifier — the only kind the language lets you DECLARE (see E_DOTTED_DECL). */
const identArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("a", "b", "w", "_"), fc.stringMatching(/^[a-z0-9_]{0,3}$/))
  .map(([head, tail]) => head + tail);

/** A dotted instance PATH (`""` at the root, `west`, `west.inner`, …). */
const prefixArb: fc.Arbitrary<string> = fc
  .array(identArb, { minLength: 0, maxLength: 3 })
  .map((segs) => segs.join("."));

const frameArb = (): fc.Arbitrary<Frame> =>
  fc
    .record({
      x: fc.integer({ min: -50_000, max: 50_000 }),
      y: fc.integer({ min: -50_000, max: 50_000 }),
      rotate: fc.constantFrom(...ROTATIONS),
      mirror: fc.constantFrom(...MIRRORS),
      prefix: prefixArb,
      component: identArb,
    })
    .map(({ x, y, rotate, mirror, prefix, component }) =>
      makeFrame({ origin: { x, y }, rotate, ...(mirror ? { mirror } : {}), prefix, component }),
    );

const pointArb = (): fc.Arbitrary<Point> =>
  fc.record({ x: fc.integer({ min: -100_000, max: 100_000 }), y: fc.integer({ min: -100_000, max: 100_000 }) });

// ---------------------------------------------------------------------------
// The matrix algebra — the guarantee that makes "exact, composable, no trig" true
// ---------------------------------------------------------------------------

describe("frame algebra — signed permutation + translation", () => {
  it("IDENTITY is the identity, and nothing with a transform is", () => {
    expect(isIdentity(IDENTITY)).toBe(true);
    expect(isIdentity(makeFrame({ origin: { x: 0, y: 0 }, prefix: "", component: "c" }))).toBe(true);
    expect(isIdentity(makeFrame({ origin: { x: 1, y: 0 }, prefix: "", component: "c" }))).toBe(false);
    expect(isIdentity(makeFrame({ origin: { x: 0, y: 0 }, rotate: 90, prefix: "", component: "c" }))).toBe(false);
    expect(isIdentity(makeFrame({ origin: { x: 0, y: 0 }, mirror: "x", prefix: "", component: "c" }))).toBe(false);
  });

  it("isIdentity asks about GEOMETRY only — a namespaced instance at the origin is still the identity", () => {
    // Worth pinning because it looks like a bug and is not: `nsId` namespaces ids
    // independently of the transform, so a caller must never use `isIdentity` as a
    // licence to skip `transformElement` (it would drop the id prefix). Nothing in
    // `src/` does — `ir.ts` transforms unconditionally.
    const f = makeFrame({ origin: { x: 0, y: 0 }, prefix: "west", component: "wing" });
    expect(isIdentity(f)).toBe(true);
    expect(nsId(f, "main")).toBe("west.main");
  });

  it("every frame has |det| = 1, and det < 0 EXACTLY when it reflects", () => {
    for (const rotate of ROTATIONS) {
      for (const mirror of MIRRORS) {
        const f = makeFrame({
          origin: { x: 7, y: -3 },
          rotate,
          ...(mirror ? { mirror } : {}),
          prefix: "",
          component: "c",
        });
        expect(det(f), `rotate ${rotate} mirror ${mirror}`).toBe(mirror ? -1 : 1);
      }
    }
  });

  it("entries are always in {-1, 0, 1} — no trig, so no float is ever introduced", () => {
    fc.assert(
      fc.property(frameArb(), frameArb(), (f, g) => {
        for (const h of [f, g, composeFrame(f, g), inverse(f)]) {
          for (const v of [h.a, h.b, h.c, h.d]) expect([-1, 0, 1]).toContain(nz(v));
        }
      }),
      { numRuns: 300 },
    );
  });

  it("det is multiplicative: det(f∘g) = det(f)·det(g)", () => {
    fc.assert(
      fc.property(frameArb(), frameArb(), (f, g) => {
        expect(det(composeFrame(f, g))).toBe(det(f) * det(g));
      }),
      { numRuns: 300 },
    );
  });

  it("compose(f, inverse(f)) and compose(inverse(f), f) are both the identity — exactly", () => {
    fc.assert(
      fc.property(frameArb(), (f) => {
        expect(isIdentity(composeFrame(f, inverse(f)))).toBe(true);
        expect(isIdentity(composeFrame(inverse(f), f))).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("composition is associative", () => {
    fc.assert(
      fc.property(frameArb(), frameArb(), frameArb(), (f, g, h) => {
        expect(mat(composeFrame(composeFrame(f, g), h))).toEqual(mat(composeFrame(f, composeFrame(g, h))));
      }),
      { numRuns: 500 },
    );
  });

  it("IDENTITY is a two-sided unit for composition", () => {
    fc.assert(
      fc.property(frameArb(), (f) => {
        expect(mat(composeFrame(IDENTITY, f))).toEqual(mat(f));
        expect(mat(composeFrame(f, IDENTITY))).toEqual(mat(f));
      }),
      { numRuns: 300 },
    );
  });

  it("a composed frame's re-derived (rotate, mirror) pair rebuilds its own matrix", () => {
    // `composeFrame` re-derives the human-facing pair so `describe().instances[]` reports
    // the transform the instance actually carries. The law that makes that report
    // trustworthy is that feeding the pair back through `makeFrame` returns the same
    // matrix — including the cases where composing two `mirror y` frames has to be
    // re-expressed as some rotation plus `mirror x`.
    fc.assert(
      fc.property(frameArb(), frameArb(), (f, g) => {
        const c = composeFrame(f, g);
        const rebuilt = makeFrame({
          origin: { x: c.tx, y: c.ty },
          rotate: c.rotate,
          ...(c.mirror ? { mirror: c.mirror } : {}),
          prefix: c.prefix,
          component: c.component,
        });
        expect(mat(rebuilt)).toEqual(mat(c));
      }),
      { numRuns: 500 },
    );
  });

  it("inverse is a pure geometric inverse — it carries no instance identity", () => {
    // Deliberate: an inverse is not an instance, so namespacing an id with it would be
    // meaningless. Pinned so nobody "fixes" the empty prefix into a copy of f.prefix.
    const f = makeFrame({ origin: { x: 5, y: 5 }, rotate: 90, prefix: "west", component: "wing" });
    expect(inverse(f).prefix).toBe("");
    expect(inverse(f).rotate).toBe(0);
    expect(nsId(inverse(f), "main")).toBe("main");
  });
});

// ---------------------------------------------------------------------------
// tp / transformRect — points and boxes
// ---------------------------------------------------------------------------

describe("tp — mapping a point local → global", () => {
  it("translates by the origin when there is no turn", () => {
    const f = makeFrame({ origin: { x: 1000, y: 2000 }, prefix: "", component: "c" });
    expect(tp(f, { x: 300, y: 400 })).toEqual({ x: 1300, y: 2400 });
  });

  it("turns clockwise on screen (+x right, +y down)", () => {
    const at = (rotate: 0 | 90 | 180 | 270) =>
      pt(tp(makeFrame({ origin: { x: 0, y: 0 }, rotate, prefix: "", component: "c" }), { x: 100, y: 0 }));
    expect(at(0)).toEqual({ x: 100, y: 0 });
    expect(at(90)).toEqual({ x: 0, y: 100 }); // +x → +y is clockwise on screen
    expect(at(180)).toEqual({ x: -100, y: 0 });
    expect(at(270)).toEqual({ x: 0, y: -100 });
  });

  it("mirror x negates x, mirror y negates y (in the component's own axes)", () => {
    const m = (mirror: "x" | "y") =>
      pt(tp(makeFrame({ origin: { x: 0, y: 0 }, mirror, prefix: "", component: "c" }), { x: 30, y: 40 }));
    expect(m("x")).toEqual({ x: -30, y: 40 });
    expect(m("y")).toEqual({ x: 30, y: -40 });
  });

  it("round-trips through the inverse bit-exactly, for arbitrary frames and points", () => {
    fc.assert(
      fc.property(frameArb(), pointArb(), (f, p) => {
        expect(pt(tp(inverse(f), tp(f, p)))).toEqual(pt(p));
      }),
      { numRuns: 1000 },
    );
  });

  it("composing frames composes the mapping: tp(f∘g, p) = tp(f, tp(g, p))", () => {
    fc.assert(
      fc.property(frameArb(), frameArb(), pointArb(), (f, g, p) => {
        expect(pt(tp(composeFrame(f, g), p))).toEqual(pt(tp(f, tp(g, p))));
      }),
      { numRuns: 500 },
    );
  });

  it("preserves distance — it is an isometry, exactly (Pythagorean triple, so no rounding hides it)", () => {
    fc.assert(
      fc.property(frameArb(), pointArb(), (f, p) => {
        const q = { x: p.x + 300, y: p.y + 400 };
        expect(Math.hypot(tp(f, q).x - tp(f, p).x, tp(f, q).y - tp(f, p).y)).toBe(500);
      }),
      { numRuns: 500 },
    );
  });
});

describe("transformRect — a top-left + size box", () => {
  it("re-corners the box: a turn moves which corner is 'top left'", () => {
    // Transforming the corner alone would shift the rectangle by its own extent —
    // the bug this function's component-wise minimum exists to prevent.
    const f = makeFrame({ origin: { x: 0, y: 0 }, rotate: 180, prefix: "", component: "c" });
    const r = transformRect(f, { x: 100, y: 200 }, { w: 40, h: 60 });
    expect(pt(r.at)).toEqual({ x: -140, y: -260 });
    expect(r.size).toEqual({ w: 40, h: 60 });
  });

  it("swaps w and h on a quarter turn, and only then", () => {
    for (const rotate of ROTATIONS) {
      const f = makeFrame({ origin: { x: 0, y: 0 }, rotate, prefix: "", component: "c" });
      const { size } = transformRect(f, { x: 0, y: 0 }, { w: 40, h: 60 });
      expect(size, `rotate ${rotate}`).toEqual(rotate % 180 === 0 ? { w: 40, h: 60 } : { w: 60, h: 40 });
    }
  });

  it("a mirror never swaps the axes", () => {
    for (const mirror of ["x", "y"] as const) {
      const f = makeFrame({ origin: { x: 0, y: 0 }, mirror, prefix: "", component: "c" });
      expect(transformRect(f, { x: 0, y: 0 }, { w: 40, h: 60 }).size).toEqual({ w: 40, h: 60 });
    }
  });

  it("is the tight bounding box of the two transformed opposite corners", () => {
    fc.assert(
      fc.property(frameArb(), pointArb(), fc.nat({ max: 20_000 }), fc.nat({ max: 20_000 }), (f, at, w, h) => {
        const out = transformRect(f, at, { w, h });
        const c1 = tp(f, at);
        const c2 = tp(f, { x: at.x + w, y: at.y + h });
        expect(nz(out.at.x)).toBe(Math.min(c1.x, c2.x));
        expect(nz(out.at.y)).toBe(Math.min(c1.y, c2.y));
        expect(nz(out.at.x + out.size.w)).toBe(Math.max(c1.x, c2.x));
        expect(nz(out.at.y + out.size.h)).toBe(Math.max(c1.y, c2.y));
      }),
      { numRuns: 500 },
    );
  });

  it("preserves area, and round-trips through the inverse", () => {
    fc.assert(
      fc.property(frameArb(), pointArb(), fc.nat({ max: 20_000 }), fc.nat({ max: 20_000 }), (f, at, w, h) => {
        const out = transformRect(f, at, { w, h });
        expect(out.size.w * out.size.h).toBe(w * h);
        const back = transformRect(inverse(f), out.at, out.size);
        expect(pt(back.at)).toEqual(pt(at));
        expect(back.size).toEqual({ w, h });
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// transformDeg — a fixture symbol's quarter-turn through the frame
// ---------------------------------------------------------------------------

describe("transformDeg — carrying a fixture's quarter-turn through a frame", () => {
  const frame = (rotate: 0 | 90 | 180 | 270, mirror?: "x" | "y") =>
    makeFrame({ origin: { x: 0, y: 0 }, rotate, ...(mirror ? { mirror } : {}), prefix: "", component: "c" });

  it("treats an absent rotation as 0 and always returns a quarter-turn", () => {
    expect(transformDeg(IDENTITY, undefined)).toBe(0);
    fc.assert(
      fc.property(frameArb(), fc.integer({ min: -4, max: 4 }), (f, k) => {
        expect([0, 90, 180, 270]).toContain(transformDeg(f, k * 90));
      }),
      { numRuns: 300 },
    );
  });

  it("adds the frame's own turn to the symbol's", () => {
    for (const base of ROTATIONS) {
      for (const turn of ROTATIONS) {
        expect(transformDeg(frame(turn), base), `${base} + ${turn}`).toBe((base + turn) % 360);
      }
    }
  });

  it("normalises an out-of-range or negative authored rotation", () => {
    expect(transformDeg(IDENTITY, 360)).toBe(0);
    expect(transformDeg(IDENTITY, -90)).toBe(270);
    expect(transformDeg(IDENTITY, 450)).toBe(90);
  });

  it("a left-right mirror leaves north/south alone and swaps east/west (the handed half)", () => {
    // The drawn symbol starts back-NORTH and turns clockwise, so `mirror x` (negating x)
    // cannot change a north- or south-facing back, and must reverse an east/west one.
    expect(transformDeg(frame(0, "x"), 0)).toBe(0); // back north — unchanged
    expect(transformDeg(frame(0, "x"), 180)).toBe(180); // back south — unchanged
    expect(transformDeg(frame(0, "x"), 90)).toBe(270); // back east → back west
    expect(transformDeg(frame(0, "x"), 270)).toBe(90);
    // `mirror y` is the other axis: north↔south flips, east/west does not.
    expect(transformDeg(frame(0, "y"), 0)).toBe(180);
    expect(transformDeg(frame(0, "y"), 180)).toBe(0);
    expect(transformDeg(frame(0, "y"), 90)).toBe(90);
  });

  it("is functorial: transformDeg(f∘g, d) = transformDeg(f, transformDeg(g, d))", () => {
    fc.assert(
      fc.property(frameArb(), frameArb(), fc.constantFrom(...ROTATIONS), (f, g, d) => {
        expect(transformDeg(composeFrame(f, g), d)).toBe(transformDeg(f, transformDeg(g, d)));
      }),
      { numRuns: 500 },
    );
  });

  it("round-trips through the inverse", () => {
    fc.assert(
      fc.property(frameArb(), fc.constantFrom(...ROTATIONS), (f, d) => {
        expect(transformDeg(inverse(f), transformDeg(f, d))).toBe(d);
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// nsId — the id namespace
// ---------------------------------------------------------------------------

describe("nsId — namespacing an id with the instance path", () => {
  it("prefixes with a dot, and is the identity at the root", () => {
    expect(nsId({ ...IDENTITY, prefix: "west" }, "main")).toBe("west.main");
    expect(nsId({ ...IDENTITY, prefix: "west.inner" }, "main")).toBe("west.inner.main");
    expect(nsId(IDENTITY, "main")).toBe("main");
  });

  it("never collides for distinct (instance, id) pairs", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(prefixArb, identArb), { minLength: 2, maxLength: 40 }), (pairs) => {
        const seen = new Map<string, string>();
        for (const [prefix, id] of pairs) {
          const source = `${prefix} ${id}`;
          const out = nsId({ ...IDENTITY, prefix }, id);
          const prior = seen.get(out);
          // Same output ⇒ it must have come from the same (instance, id) pair.
          if (prior !== undefined) expect(prior).toBe(source);
          seen.set(out, source);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("is injective ONLY because a dotted name cannot be declared — which the parser enforces", () => {
    // The algebra alone does not give injectivity: a dotted id would collide outright.
    expect(nsId({ ...IDENTITY, prefix: "a" }, "b.c")).toBe(nsId({ ...IDENTITY, prefix: "a.b" }, "c"));
    expect(nsId({ ...IDENTITY, prefix: "" }, "a.b")).toBe(nsId({ ...IDENTITY, prefix: "a" }, "b"));
    // So the law above rests on the grammar rule, and this is the weld between them:
    // declaring a dotted name is an error, so those inputs never reach `nsId`.
    const { diagnostics } = compile('plan "P" { room id=a.b at (0,0) size 3000x3000 }', { noCache: true });
    expect(diagnostics.map((d) => d.code)).toContain("E_DOTTED_DECL");
  });
});

// ---------------------------------------------------------------------------
// transformElement — the one crossing from an instance's frame into the plan
// ---------------------------------------------------------------------------

const wall = (): RWall => ({
  kind: "wall",
  id: "shell",
  category: "exterior",
  thickness: 200,
  material: "poche",
  hatchScale: 1,
  hatchAngle: 0,
  points: [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
  ],
  closed: false,
  openings: [{ at: { x: 2000, y: 0 }, width: 900 }],
});

const segment = (): WallSegment => ({
  a: { x: 0, y: 0 },
  b: { x: 4000, y: 0 },
  thickness: 200,
  category: "exterior",
  wallId: "shell",
  index: 0,
});

const door = (swing: "in" | "out" = "in"): RDoor => ({
  kind: "door",
  id: "d1",
  at: { x: 2000, y: 0 },
  width: 900,
  hinge: "left",
  swing,
  host: segment(),
});

const room = (): RRoom => ({
  kind: "room",
  id: "main",
  at: { x: 100, y: 200 },
  size: { w: 4000, h: 3000 },
  labelAt: { x: 1000, y: 1000 },
  _rel: { dir: "right-of", ref: "other", gap: 0 },
});

const polyRoom = (): RRoom => ({
  kind: "room",
  id: "ell",
  at: { x: 0, y: 0 },
  size: { w: 4000, h: 3000 },
  poly: [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 1000 },
    { x: 0, y: 3000 },
  ],
});

const circleRoom = (): RRoom => ({
  kind: "room",
  id: "drum",
  at: { x: -500, y: -500 },
  size: { w: 1000, h: 1000 },
  circle: { c: { x: 0, y: 0 }, r: 500 },
});

const furniture = (rotate?: number): RFurniture => ({
  kind: "furniture",
  category: "bed",
  id: "f1",
  at: { x: 100, y: 200 },
  size: { w: 900, h: 2000 },
  room: "main",
  ...(rotate === undefined ? {} : { rotate }),
});

const dim = (offset: number): RDim => ({
  kind: "dim",
  id: "m1",
  from: { x: 0, y: 0 },
  to: { x: 4000, y: 0 },
  offset,
});

const column = (): RColumn => ({ kind: "column", id: "c1", at: { x: 1000, y: 1000 }, size: { w: 400, h: 600 } });

const F = (opts: { rotate?: 0 | 90 | 180 | 270; mirror?: "x" | "y"; at?: Point; prefix?: string }): Frame =>
  makeFrame({
    origin: opts.at ?? { x: 10_000, y: 20_000 },
    ...(opts.rotate === undefined ? {} : { rotate: opts.rotate }),
    ...(opts.mirror ? { mirror: opts.mirror } : {}),
    prefix: opts.prefix ?? "west",
    component: "wing",
  });

describe("transformElement — an instance's resolved element crossing into plan coordinates", () => {
  it("namespaces the id and stamps the instance on every element kind", () => {
    const f = F({});
    const kinds: ResolvedElement[] = [wall(), room(), door(), furniture(), dim(300), column()];
    for (const el of kinds) {
      const out = transformElement(f, el);
      expect(out.id, el.kind).toBe(`west.${el.id}`);
      expect(out._instance, el.kind).toBe("west");
      expect(out._component, el.kind).toBe("wing");
    }
  });

  it("returns a NEW element and leaves the local one intact", () => {
    // A door's `host` aliases its wall's point objects, so transforming in place would
    // double-apply the frame — the reason the function copies rather than mutates.
    const f = F({ rotate: 90 });
    const w = wall();
    const before = JSON.stringify(w);
    const out = transformElement(f, w) as RWall;
    expect(JSON.stringify(w)).toBe(before);
    expect(out).not.toBe(w);
    expect(out.points).not.toBe(w.points);
  });

  it("maps a wall's points and its openings", () => {
    const f = F({ at: { x: 1000, y: 2000 } });
    const out = transformElement(f, wall()) as RWall;
    expect(out.points.map(pt)).toEqual([
      { x: 1000, y: 2000 },
      { x: 5000, y: 2000 },
      { x: 5000, y: 5000 },
    ]);
    expect(out.openings.map((o) => pt(o.at))).toEqual([{ x: 3000, y: 2000 }]);
    expect(out.openings[0]!.width).toBe(900);
  });

  it("carries a room's ring, circle and label anchor, and discharges the relational constraint", () => {
    const f = F({ rotate: 90, at: { x: 0, y: 0 } });
    const r = transformElement(f, room()) as RRoom;
    // The relational clause was already resolved in the instance's own frame; keeping it
    // would let the plan-level pass re-place the room in global terms.
    expect(r._rel).toBeUndefined();
    expect(pt(r.labelAt!)).toEqual(pt(tp(f, { x: 1000, y: 1000 })));
    expect(r.size).toEqual({ w: 3000, h: 4000 }); // quarter turn swaps the extent

    const p = transformElement(f, polyRoom()) as RRoom;
    expect(p.poly!.map(pt)).toEqual(polyRoom().poly!.map((v) => pt(tp(f, v))));

    const c = transformElement(F({ rotate: 270, at: { x: 5, y: 7 } }), circleRoom()) as RRoom;
    expect(c.circle!.r).toBe(500); // an isometry cannot change a radius, so the area stays exact πR²
    expect(pt(c.circle!.c)).toEqual({ x: 5, y: 7 });
  });

  it("preserves a polygon room's exact area under every frame (shoelace, absolute)", () => {
    const shoelace = (ring: Point[]) => {
      let s = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        s += a.x * b.y - b.x * a.y;
      }
      return Math.abs(s) / 2;
    };
    const base = shoelace(polyRoom().poly!);
    fc.assert(
      fc.property(frameArb(), (f) => {
        expect(shoelace((transformElement(f, polyRoom()) as RRoom).poly!)).toBe(base);
      }),
      { numRuns: 300 },
    );
  });

  it("flips a door's SWING under a reflection and never under a rotation", () => {
    // Asserted directly on the field, not through a rendered snapshot: `swing` is measured
    // from the host wall's LEFT normal, which a reflection reverses.
    for (const rotate of ROTATIONS) {
      const f = F({ rotate });
      expect(det(f)).toBe(1);
      expect((transformElement(f, door("in")) as RDoor).swing, `rotate ${rotate}`).toBe("in");
      expect((transformElement(f, door("out")) as RDoor).swing, `rotate ${rotate}`).toBe("out");
    }
    for (const rotate of ROTATIONS) {
      for (const mirror of ["x", "y"] as const) {
        const f = F({ rotate, mirror });
        expect(det(f)).toBe(-1);
        expect((transformElement(f, door("in")) as RDoor).swing, `rotate ${rotate} mirror ${mirror}`).toBe("out");
        expect((transformElement(f, door("out")) as RDoor).swing).toBe("in");
      }
    }
  });

  it("does NOT flip a door's hinge — it rides the wall's traversal direction, which the transform carries", () => {
    for (const mirror of ["x", "y"] as const) {
      expect((transformElement(F({ mirror }), door()) as RDoor).hinge).toBe("left");
    }
  });

  it("transforms a door's host segment and namespaces its wallId", () => {
    const f = F({ rotate: 180, at: { x: 0, y: 0 } });
    const out = transformElement(f, door()) as RDoor;
    expect(out.host!.wallId).toBe("west.shell");
    expect(pt(out.host!.a)).toEqual({ x: 0, y: 0 });
    expect(pt(out.host!.b)).toEqual({ x: -4000, y: 0 });
    expect(out.host!.thickness).toBe(200);
  });

  it("negates a dim's signed offset under a reflection and never under a rotation", () => {
    for (const rotate of ROTATIONS) {
      expect((transformElement(F({ rotate }), dim(300)) as RDim).offset, `rotate ${rotate}`).toBe(300);
      expect((transformElement(F({ rotate, mirror: "x" }), dim(300)) as RDim).offset).toBe(-300);
    }
  });

  it("carries a fixture's quarter-turn and namespaces its owning room", () => {
    const out = transformElement(F({ rotate: 90 }), furniture(0)) as RFurniture;
    expect(out.rotate).toBe(90);
    expect(out.room).toBe("west.main");
    // A turn that lands back on 0 must DELETE the field, not write `rotate: 0` — the
    // resolver's own absent-means-zero convention, and a byte-identity concern downstream.
    const back = transformElement(F({ rotate: 270 }), furniture(90)) as RFurniture;
    expect("rotate" in back).toBe(false);
  });

  it("treats a column's `at` as its CENTRE — no corner correction, only the extents swap", () => {
    const f = F({ rotate: 90, at: { x: 0, y: 0 } });
    const out = transformElement(f, column()) as RColumn;
    expect(pt(out.at)).toEqual(pt(tp(f, { x: 1000, y: 1000 })));
    expect(out.size).toEqual({ w: 600, h: 400 });
    expect(transformElement(F({ rotate: 180 }), column()).kind).toBe("column");
    expect((transformElement(F({ rotate: 180 }), column()) as RColumn).size).toEqual({ w: 400, h: 600 });
  });

  it("is exactly invertible on geometry: transforming by f then by inverse(f) restores every coordinate", () => {
    fc.assert(
      fc.property(frameArb(), (f) => {
        const back = transformElement(inverse(f), transformElement(f, wall())) as RWall;
        expect(back.points.map(pt)).toEqual(wall().points.map(pt));
        expect(back.openings.map((o) => pt(o.at))).toEqual(wall().openings.map((o) => pt(o.at)));

        const r = transformElement(inverse(f), transformElement(f, polyRoom())) as RRoom;
        expect(r.poly!.map(pt)).toEqual(polyRoom().poly!.map(pt));
        expect(pt(r.at)).toEqual(pt(polyRoom().at));
        expect(r.size).toEqual(polyRoom().size);

        // Two reflections cancel, so the handed fields come back too.
        const d = transformElement(inverse(f), transformElement(f, door("in"))) as RDoor;
        expect(d.swing).toBe("in");
        expect((transformElement(inverse(f), transformElement(f, dim(300))) as RDim).offset).toBe(300);
      }),
      { numRuns: 400 },
    );
  });

  it("agrees with composing the frames first: t(f∘g, el) = t(f, t(g, el)) on geometry", () => {
    // This is what makes a `place` inside a component body free — the nesting is a matrix
    // multiply, not a second pass over the elements.
    fc.assert(
      fc.property(frameArb(), frameArb(), (f, g) => {
        const composed = transformElement(composeFrame(f, g), wall()) as RWall;
        const stepwise = transformElement(f, transformElement(g, wall())) as RWall;
        expect(composed.points.map(pt)).toEqual(stepwise.points.map(pt));

        const dc = transformElement(composeFrame(f, g), door("in")) as RDoor;
        const ds = transformElement(f, transformElement(g, door("in"))) as RDoor;
        expect(dc.swing).toBe(ds.swing);
        expect(pt(dc.at)).toEqual(pt(ds.at));

        const fc1 = transformElement(composeFrame(f, g), furniture(90)) as RFurniture;
        const fs1 = transformElement(f, transformElement(g, furniture(90))) as RFurniture;
        expect(fc1.rotate).toBe(fs1.rotate);
      }),
      { numRuns: 400 },
    );
  });
});

// ---------------------------------------------------------------------------
// transformArc — the same crossing, for a CURVED edge
// ---------------------------------------------------------------------------

/**
 * Millimetres of slack on the two laws below that walk the curve through `cos`/`sin` —
 * see the epsilon note in the file header. The geometry here is at the 10³ mm scale, so
 * this is ~1e-12 relative, twelve orders below `fmt()`'s 0.005 mm output quantum. It is
 * not a fudge factor: the mutations these tests exist to catch miss by hundreds of mm.
 */
const NEAR = 1e-9;

/** All twelve frames a `place` can spell, each labelled with the words that spell it. */
const PLACEMENTS: Array<{ label: string; f: Frame }> = ROTATIONS.flatMap((rotate) =>
  MIRRORS.map((mirror) => ({
    label: `rotate ${rotate}${mirror ? ` mirror ${mirror}` : ""}`,
    f: F({ rotate, ...(mirror ? { mirror } : {}) }),
  })),
);

/**
 * A deliberately LOPSIDED arc: neither endpoint sits on an axis through the centre, and
 * `|dx| !== |dy|` at both ends. A symmetric fixture would let a swapped `atan2` pass by
 * accident on the very quantity this section exists to check.
 */
const ARC: Arc = arcFromChord({ x: 0, y: 0 }, { x: 3000, y: 1000 }, 2500, "ccw", false)!;

const curvedWall = (): RWall => ({ ...wall(), points: [ARC.a, ARC.b], arcs: [ARC], openings: [] });
const arcOf = (f: Frame): Arc => (transformElement(f, curvedWall()) as RWall).arcs![0]!;

describe("transformArc — a placed component's curved edge", () => {
  it("keeps the circle: same radius, and centre and endpoints ride the frame exactly", () => {
    for (const { label, f } of PLACEMENTS) {
      const out = arcOf(f);
      // Exact, not near: all three are a plain `tp()` of a point, so the frame's integer
      // arithmetic is the only thing that has touched them.
      expect(out.r, label).toBe(ARC.r);
      expect(pt(out.center), label).toEqual(pt(tp(f, ARC.center)));
      expect(pt(out.a), label).toEqual(pt(tp(f, ARC.a)));
      expect(pt(out.b), label).toEqual(pt(tp(f, ARC.b)));
    }
  });

  it("reverses the rotational sense under a reflection and preserves it under a turn", () => {
    for (const { label, f } of PLACEMENTS) {
      // A rotation preserves orientation and a reflection reverses it, so a mirrored
      // clockwise curve reads counter-clockwise. Negation is exact, hence `toBe`.
      expect(arcOf(f).sweep, label).toBe(det(f) < 0 ? -ARC.sweep : ARC.sweep);
      expect(Math.abs(arcOf(f).sweep), label).toBe(Math.abs(ARC.sweep));
    }
  });

  it("re-derives `start` as the angle of the TRANSFORMED endpoint about the TRANSFORMED centre", () => {
    for (const { label, f } of PLACEMENTS) {
      const out = arcOf(f);
      // The non-tautological form of the claim: whatever `start` is, walking `r` out of
      // the centre along it has to arrive at `a`. Reading `start` back with the same
      // `atan2` the implementation used would assert nothing at all.
      expect(out.center.x + out.r * Math.cos(out.start), label).toBeCloseTo(out.a.x, 9);
      expect(out.center.y + out.r * Math.sin(out.start), label).toBeCloseTo(out.a.y, 9);
    }
  });

  it("carries the curve POINTWISE: every point of the image arc is the image of that point", () => {
    // The whole law in one line: `arcPointAt(t) ∘ transform === transform ∘ arcPointAt(t)`,
    // which is what "a frame is an isometry" MEANS for a curve. Endpoints alone cannot say
    // it — the two arcs of a circle through the same pair of points differ only in which
    // way round they go, which is exactly what a reflection changes and exactly what a
    // wrong `start` destroys.
    for (const { label, f } of PLACEMENTS) {
      const out = arcOf(f);
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const want = tp(f, arcPointAt(ARC, t));
        const got = arcPointAt(out, t);
        expect(Math.hypot(got.x - want.x, got.y - want.y), `${label} @ t=${t}`).toBeLessThan(NEAR);
      }
    }
  });
});

/**
 * Two placements of one semicircular bay, the second mirrored about the x axis. Round
 * numbers on purpose: the component's curve bulges 2000 mm to the LEFT of its own origin,
 * so the copy placed at x = 10000 and mirrored must bulge 2000 mm to the RIGHT of that,
 * and the two drawn faces of the 200 mm wall sit at r ∓ 100, i.e. 1900 and 2100.
 */
const TWIN_BAY = `plan "P" {
  units mm
  component bay() {
    wall id=face exterior thickness 200 { (0,0) arc (0,4000) radius 2000 }
  }
  place bay() as plain at (0,0)
  place bay() as flip at (10000,0) mirror x
}`;

describe("a mirrored bay is DRAWN as the mirror image, not as a curve that merely shares its ends", () => {
  const faces = compile(TWIN_BAY, { noCache: true })
    .scene!.nodes.filter((n) => n.layer === "wallFace" && n.prim.t === "arc")
    .map((n) => n.prim as Extract<typeof n.prim, { t: "arc" }>);
  const of = (cx: number) => faces.filter((p) => p.center.x === cx);
  /** Every x a drawn face passes through: the piece ends, which include the apex. */
  const xs = (cx: number) => of(cx).flatMap((p) => [p.start.x, p.end.x]);

  it("emits each 180° face as two ≤120° pieces, per instance and per wall face", () => {
    expect(faces).toHaveLength(8); // 2 instances × 2 faces (r ± 100) × 2 pieces
    expect(of(0)).toHaveLength(4);
    expect(of(10_000)).toHaveLength(4);
  });

  it("bulges the mirrored bay AWAY from the plan, exactly as far as the original bulges towards it", () => {
    // The original spans x ∈ [−2100, 0], so its mirror image about x = 10000 must span
    // [10000, 12100]. Keep the sweep and it spans [7900, 10000] instead — the same two
    // endpoints, the same radius, and a bay curving into the building.
    expect(Math.min(...xs(0))).toBe(-2100);
    expect(Math.max(...xs(0))).toBe(0);
    expect(Math.min(...xs(10_000))).toBe(10_000);
    expect(Math.max(...xs(10_000))).toBe(12_100);
    // The inner face lands 200 mm inside the outer one on both copies.
    expect(xs(0)).toContain(-1900);
    expect(xs(10_000)).toContain(11_900);
  });

  it("flips the SVG sweep flag on the mirrored copy — the flag every backend serializes", () => {
    // `sweep: 1` is clockwise as drawn (see the `src/geometry/arc.ts` header). The bay is
    // authored counter-clockwise, so the plain copy is 0 throughout and the mirrored copy
    // 1 throughout; a curve reversed in the IR but not in the primitive would render as
    // the other arc of its own chord.
    expect(of(0).map((p) => p.sweep)).toEqual([0, 0, 0, 0]);
    expect(of(10_000).map((p) => p.sweep)).toEqual([1, 1, 1, 1]);
  });
});
