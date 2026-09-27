/**
 * Laws `diffPlans` (`src/diff.ts`) must hold regardless of which side is "before":
 *
 *  - **Reflexivity.** `diffPlans(A, A)` reports no change of any kind.
 *  - **Antisymmetry.** `diffPlans(B, A)` is `diffPlans(A, B)` with every change INVERTED
 *    (added↔removed swapped, before/after swapped, signed deltas negated) — keyed by
 *    `kind:id` so the comparison does not depend on array order. This is what the
 *    `src/diff.ts:86-93` fix (rescue a leftover-before room by label only when the label
 *    is unique on BOTH sides, not just the after side) makes true: before it, a diff
 *    could rescue a same-labelled pair in one direction and refuse it in the other,
 *    reporting a "resized" room one way and an unrelated "removed"+"added" pair the
 *    other — a real answer that depended on which plan you called "before".
 *
 * `summary` (English sentences) is excluded from the antisymmetry comparison by design
 * (the task card says so): it is prose, not structured data, and is never meant to be
 * machine-inverted. An opening's `between` (which side's rooms it names varies with the
 * change kind, not with direction) is excluded for the same reason: it is a descriptive
 * field the diff does not store enough of to reconstruct the other direction's value
 * from the result alone. A room's `label` is DIFFERENT: `diffPlans` records it from the
 * one side that exists for `added`/`removed` (so it round-trips through `invert()`
 * unchanged and IS compared below), but only ever the AFTER side for `resized`/
 * `relabeled` (so those two still exclude it, for the same reason `between` is
 * excluded).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  diffPlans,
  type CirculationChange,
  type FurnitureChange,
  type OpeningChange,
  type PlanDiff,
  type RoomChange,
} from "../src/diff.js";
import { planSpec, renderPlan, type PlanSpec } from "./arbitrary-plan.js";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const A = fx("diff-a.arch");
const B = fx("diff-b.arch");
const circA = fx("diff-circ-a.arch");
const circB = fx("diff-circ-b.arch");

// ---------------------------------------------------------------------------
// invert(): the one place the "swap added/removed, before/after, negate deltas"
// rule is stated, so every property below tests the SAME transform.
// ---------------------------------------------------------------------------

function invertRoom(r: RoomChange): RoomChange {
  switch (r.change) {
    // `label` carries straight through: it describes the one room that exists on
    // either side of an add/remove, which does not change when the direction does
    // (diff.ts sets it from that same single side both ways).
    case "added":
      return { id: r.id, change: "removed", areaBeforeM2: r.areaAfterM2, label: r.label };
    case "removed":
      return { id: r.id, change: "added", areaAfterM2: r.areaBeforeM2, label: r.label };
    case "relabeled":
      return { id: r.id, change: "relabeled" };
    case "resized":
      return {
        id: r.id,
        change: "resized",
        areaBeforeM2: r.areaAfterM2,
        areaAfterM2: r.areaBeforeM2,
        edges: r.edges && {
          top: -r.edges.top,
          bottom: -r.edges.bottom,
          left: -r.edges.left,
          right: -r.edges.right,
        },
      };
  }
}

function invertOpening(o: OpeningChange): OpeningChange {
  const { kind, id } = o;
  switch (o.change) {
    case "added":
      return { id, kind, change: "removed", widthBeforeMm: o.widthAfterMm };
    case "removed":
      return { id, kind, change: "added", widthAfterMm: o.widthBeforeMm };
    case "resized":
      return { id, kind, change: "resized", widthBeforeMm: o.widthAfterMm, widthAfterMm: o.widthBeforeMm };
  }
}

function invertFurniture(f: FurnitureChange): FurnitureChange {
  return { id: f.id, category: f.category, change: f.change === "added" ? "removed" : "added" };
}

function invertCirculation(c: CirculationChange): CirculationChange {
  return {
    roomId: c.roomId,
    walkDistanceBeforeMm: c.walkDistanceAfterMm,
    walkDistanceAfterMm: c.walkDistanceBeforeMm,
    bottleneckBeforeMm: c.bottleneckAfterMm,
    bottleneckAfterMm: c.bottleneckBeforeMm,
  };
}

/** Round every float in `t` (recursively) to 6 dp, so an independently-computed `-0`/`0`
 *  or a last-bit float difference from negating a DIFFERENT computation path never fails
 *  the structural comparison. */
function roundFloats<T>(t: T): T {
  if (typeof t === "number") return (Object.is(t, -0) ? 0 : Math.round(t * 1e6) / 1e6) as unknown as T;
  if (Array.isArray(t)) return t.map(roundFloats) as unknown as T;
  if (t && typeof t === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t as Record<string, unknown>)) out[k] = roundFloats(v);
    return out as T;
  }
  return t;
}

/** `RoomChange`'s own normalizer: `label` is direction-dependent (and so excluded, per
 *  the file header) for `resized`/`relabeled` only — `added`/`removed` keep it, since it
 *  round-trips through `invertRoom` unchanged for those two kinds. */
function normalizeRoom(r: RoomChange): unknown {
  const copy: Partial<RoomChange> = { ...r };
  if (r.change === "resized" || r.change === "relabeled") delete copy.label;
  return roundFloats(copy);
}

/** `OpeningChange`'s own normalizer: `between` is excluded for every change kind (see
 *  the file header). */
function normalizeOpening(o: OpeningChange): unknown {
  const copy: Partial<OpeningChange> = { ...o };
  delete copy.between;
  return roundFloats(copy);
}

/** `dst`'s changes, keyed by `kind:id`, compared to `src`'s changes INVERTED and keyed
 *  the same way — same key set, and each pair equal after `normalizeFn` drops the
 *  direction-dependent descriptive fields from BOTH sides. */
function expectInverted<T extends object>(
  label: string,
  src: T[],
  dst: T[],
  keyOf: (t: T) => string,
  invert: (t: T) => T,
  normalizeFn: (t: T) => unknown,
): void {
  const dstByKey = new Map(dst.map((d) => [keyOf(d), d]));
  const srcKeys = new Set(src.map(keyOf));
  expect(new Set(dstByKey.keys()), `${label}: key sets differ`).toEqual(srcKeys);
  for (const s of src) {
    const counterpart = dstByKey.get(keyOf(s));
    expect(counterpart, `${label}: no counterpart for ${keyOf(s)}`).toBeDefined();
    expect(normalizeFn(invert(s)), `${label}: mismatch for ${keyOf(s)}`).toEqual(normalizeFn(counterpart!));
  }
}

/** The comparison half of the antisymmetry law, over two ALREADY-COMPUTED diffs — split
 *  out from {@link checkAntisymmetry} so a caller that can generate an invalid pair (a
 *  mutated fast-check plan) can gate on `ok` itself, with `fc.pre`, before asserting. */
function assertAntisymmetric(ab: PlanDiff, ba: PlanDiff): void {
  expectInverted("rooms", ab.rooms, ba.rooms, (r) => `room:${r.id}`, invertRoom, normalizeRoom);
  expectInverted("openings", ab.openings, ba.openings, (o) => `${o.kind}:${o.id}`, invertOpening, normalizeOpening);
  expectInverted("furniture", ab.furniture, ba.furniture, (f) => `furniture:${f.id}`, invertFurniture, roundFloats);
  expectInverted(
    "circulation",
    ab.circulation,
    ba.circulation,
    (c) => `circulation:${c.roomId}`,
    invertCirculation,
    roundFloats,
  );

  expect(roundFloats(ba.totals)).toEqual(
    roundFloats({
      floorAreaBeforeM2: ab.totals.floorAreaAfterM2,
      floorAreaAfterM2: ab.totals.floorAreaBeforeM2,
      roomsBefore: ab.totals.roomsAfter,
      roomsAfter: ab.totals.roomsBefore,
    }),
  );
}

/** The full antisymmetry law: `diffPlans(B, A)` is `diffPlans(A, B)` inverted. For a
 *  pair known to both resolve cleanly (the example fixtures; a fast-check pair should
 *  use {@link assertAntisymmetric} directly, behind its own `ok` precondition). */
function checkAntisymmetry(srcA: string, srcB: string): void {
  const ab = diffPlans(srcA, srcB);
  const ba = diffPlans(srcB, srcA);
  expect(ab.ok, "A→B failed to resolve").toBe(true);
  expect(ba.ok, "B→A failed to resolve").toBe(true);
  assertAntisymmetric(ab, ba);
}

// ---------------------------------------------------------------------------
// Reflexivity
// ---------------------------------------------------------------------------

describe("diffPlans — reflexivity", () => {
  const cases: Array<[string, string]> = [
    ["diff-a.arch vs itself", A],
    ["diff-b.arch vs itself", B],
    ["diff-circ-a.arch vs itself", circA],
    ["diff-circ-b.arch vs itself", circB],
  ];
  for (const [name, src] of cases) {
    it(`diffPlans(${name}, ${name}) reports no change`, () => {
      const d = diffPlans(src, src);
      expect(d.ok).toBe(true);
      expect(d.rooms).toEqual([]);
      expect(d.openings).toEqual([]);
      expect(d.furniture).toEqual([]);
      expect(d.circulation).toEqual([]);
      expect(d.summary).toEqual([]);
    });
  }

  it("holds over fc.sample(planSpec)", () => {
    for (const spec of fc.sample(planSpec, { numRuns: 40, seed: 20260927 })) {
      const src = renderPlan(spec);
      const d = diffPlans(src, src);
      expect(d.ok).toBe(true);
      expect(d.rooms).toEqual([]);
      expect(d.openings).toEqual([]);
      expect(d.furniture).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Antisymmetry — example pairs
// ---------------------------------------------------------------------------

describe("diffPlans — antisymmetry over the example fixture pairs", () => {
  it("diff-a.arch ⇄ diff-b.arch (resize + relabel + added window)", () => {
    checkAntisymmetry(A, B);
  });

  it("diff-circ-a.arch ⇄ diff-circ-b.arch (circulation-only delta)", () => {
    checkAntisymmetry(circA, circB);
  });
});

// ---------------------------------------------------------------------------
// Antisymmetry — fast-check-mutated pairs
//
// The mutation keeps the room COUNT (and so the room id set) fixed while perturbing
// each room's geometry (a signed shift to every column width) and flipping every
// label. A second property below targets the label-rescue fix itself directly: TWO
// before-side rooms sharing one label against a single after-side room of the same
// label (ids disjoint on both sides). `src/diff.ts`'s fix requires the label be unique
// on BOTH the leftover-before set and the unmatched-after set before rescuing a pair
// across mismatched ids; checking only the after side (the bug) rescues this pair in
// ONE direction (order-dependent: whichever of the two same-labelled rooms is visited
// first wins the single after-side candidate) and refuses it in the other — so the
// KEY SETS of `diffPlans(A, B)` and `diffPlans(B, A)` disagree (one merges a pair into
// a single "resized"/"relabeled" entry keyed by whichever id happened to win; the
// other reports three independent add/remove events) and `expectInverted`'s own
// key-set check catches it. After the fix neither direction rescues an ambiguous
// pair, so both report the same three add/remove events, which — being single-id,
// not a cross-id pairing — round-trip through the plain `id` key cleanly.
//
// The `cols + shift` mutation can land OUTSIDE `archPlan`'s validity envelope: a
// `furniture … against wall … offset` clause is written from the UNSNAPPED wall run
// (`renderPlan`'s own text, computed against the spec's raw `cols`), but the wall
// itself is drawn from the GRID-SNAPPED points, so a `shift` that is not a multiple of
// the grid can round the two away from each other by up to half a grid step — enough,
// near a wall's end, to push a percentage-derived offset past the snapped run and raise
// `E_FURN_AGAINST` on one side only (`diffPlans().ok === false`). That is a real
// interaction between the arbitrary's own text generation and grid snapping, not
// something `diffPlans` promises to handle, so the property gates on both sides
// actually resolving (`fc.pre`) rather than asserting through a compile error.
// ---------------------------------------------------------------------------

describe("diffPlans — antisymmetry over fast-check-mutated pairs", () => {
  const shiftArb = fc.integer({ min: -800, max: 800 }).filter((n) => n !== 0);

  it("same room ids, resized + relabeled geometry", () => {
    fc.assert(
      fc.property(planSpec, shiftArb, (base, shift) => {
        const mutated: PlanSpec = {
          ...base,
          cols: base.cols.map((c) => Math.max(c + shift, 100)),
          labels: base.labels.map((l) => !l),
        };
        const srcA = renderPlan(base);
        const srcB = renderPlan(mutated);
        const ab = diffPlans(srcA, srcB);
        const ba = diffPlans(srcB, srcA);
        // Discard (not fail) the rare pair the mutation pushed out of the arbitrary's
        // own validity envelope — see the header above. `diffPlans` degrading to
        // `ok: false` on a plan that no longer compiles is correct behaviour, not the
        // antisymmetry law this test states; asserting through it would be a false
        // positive on `diffPlans`'s account, and a false negative on this test's.
        fc.pre(ab.ok && ba.ok);
        assertAntisymmetric(ab, ba);
      }),
      { numRuns: 60 },
    );
  });

  it("an ambiguous same-label rescue is refused symmetrically (the diff.ts:86-93 fix)", () => {
    const room = (id: string, label: string, x: number, w: number, h: number) =>
      `  room id=${id} at (${x},0) size ${w}x${h} label "${label}"`;
    const planWith = (rooms: string[]) =>
      `plan "P" {\n  units mm\n` +
      `  wall id=w0 exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }\n` +
      `${rooms.join("\n")}\n}\n`;
    fc.assert(
      fc.property(
        fc.constantFrom("Dup", "Room"),
        fc.integer({ min: 2000, max: 5000 }),
        fc.integer({ min: 2000, max: 3500 }),
        (label, w, h) => {
          // Two before-side rooms share `label`; one after-side room carries it too.
          // Every id is disjoint, so no id-matching pairs any of them directly.
          const a = planWith([room("rA1", label, 0, 3000, 2000), room("rA2", label, 4000, 3000, 2000)]);
          const b = planWith([room("rB", label, 0, w, h)]);
          checkAntisymmetry(a, b);
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// MAJOR 2 pin — an empty-string label is "no label" everywhere in this module (the
// relabel check a few lines down reads both sides through `?? ""`), so it must not
// become a rescue key: two same-"" rooms are just as ambiguous as two same-"Dup"
// rooms, and rescuing them anyway would special-case the one label spelled "" into
// meaning something different from having none.
// ---------------------------------------------------------------------------

describe("diffPlans — an empty-string label is never a rescue key", () => {
  it('two rooms both labelled "", different ids, are removed+added — never rescued', () => {
    const room = (id: string) => `  room id=${id} at (0,0) size 3000x2000 label ""`;
    const planWith = (id: string) =>
      `plan "P" {\n  units mm\n` +
      `  wall id=w0 exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n` +
      `${room(id)}\n}\n`;
    const a = planWith("rA");
    const b = planWith("rB");

    const d = diffPlans(a, b);
    expect(d.ok).toBe(true);
    expect(d.rooms).toHaveLength(2);
    expect(d.rooms.find((r) => r.id === "rA")?.change).toBe("removed");
    expect(d.rooms.find((r) => r.id === "rB")?.change).toBe("added");
    // The two full-antisymmetry laws above cover the reverse direction generically;
    // this test pins the specific "" case concretely, by shape.
    checkAntisymmetry(a, b);
  });
});
