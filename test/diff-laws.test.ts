/**
 * Laws `diffPlans` (`src/diff.ts`) must hold regardless of which side is "before":
 *
 *  - **Reflexivity.** `diffPlans(A, A)` reports no change of any kind.
 *  - **Antisymmetry.** `diffPlans(B, A)` is `diffPlans(A, B)` with every change INVERTED
 *    (added↔removed swapped, before/after swapped, signed deltas negated) — keyed by
 *    `kind:id` so the comparison does not depend on array order. This is what the
 *    `src/diff.ts` `matchRooms` rescue fix (rescue a leftover-before room by label only when the label
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
import { describe as describePlan } from "../src/describe.js";
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

  it("an ambiguous same-label rescue is refused symmetrically (the diff.ts `matchRooms` rescue fix)", () => {
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

// ---------------------------------------------------------------------------
// Auto-id rooms under insertion, deletion and permutation.
//
// `room_<n>` is positional, so an inserted, deleted or reordered room shifts every later
// auto-id; `diffPlans` pairs a room whose label is unique on each side BY LABEL first, unless
// its id is authored on both sides (src/diff.ts `matchRooms`, passes 0 and 1). Such a pair's two ids
// can differ, and a "resized"/"relabeled" change carries the AFTER side's id — so the
// `room:id` key the laws above use names a label-paired room by a different id in each
// direction. That is not an antisymmetry failure but a keying one: the PAIRING is what must
// invert. So the rooms here are matched pair-wise — an add/remove by its one id; a resize/
// relabel by its label when one side's change carries a label the other's shares (a label
// pair), else by its id (an id pair, whose ids are equal by construction). Under this
// generator (every id auto, every label unique on its side) that match is unambiguous: a
// label on both sides of an auto-id pair is always consumed by pass 1, so an id pair never
// carries a label the reverse direction also carries.
//
// No entrance is modelled, so `circulation` is null on both sides and the circulation law
// is vacuous here; `test/diff.test.ts` pins circulation following the pairing.
// ---------------------------------------------------------------------------

/** Room `i` of a fixed universe of eight: slot `i` of a 4×2 grid of 3000 mm cells, labelled
 *  `R<i>` or unlabelled, its width optionally reduced. Slots never overlap. */
interface AutoRoom {
  i: number;
  labelled: boolean;
  shrink: number;
}

function autoIdPlan(rooms: AutoRoom[]): string {
  const lines = rooms.map(({ i, labelled, shrink }) => {
    const at = `(${(i % 4) * 3000},${Math.floor(i / 4) * 3000})`;
    return `  room at ${at} size ${3000 - shrink}x3000${labelled ? ` label "R${i}"` : ""}`;
  });
  return (
    `plan "P" {\n  units mm\n` +
    `  wall exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }\n` +
    `${lines.join("\n")}\n}\n`
  );
}

/** The rooms half of the antisymmetry law, matched by pairing (see the block header). */
function assertRoomsInvertPairwise(ab: RoomChange[], ba: RoomChange[]): void {
  expect(ba.length, "room change counts differ").toBe(ab.length);
  const used = new Set<RoomChange>();
  for (const s of ab) {
    const inv = invertRoom(s);
    const free = ba.filter((d) => !used.has(d) && d.change === inv.change);
    let hit: RoomChange | undefined;
    if (s.change === "added" || s.change === "removed") hit = free.find((d) => d.id === s.id);
    else hit = (s.label ? free.find((d) => d.label === s.label) : undefined) ?? free.find((d) => d.id === s.id);
    expect(hit, `no counterpart for ${s.change} ${s.id} (${s.label ?? "-"})`).toBeDefined();
    used.add(hit!);
    // `id` is the after side's in each direction (and so differs for a label pair) and
    // `label` too for resized/relabeled — compare the rest.
    const strip = (r: RoomChange): unknown => {
      const copy: Partial<RoomChange> = { ...r };
      if (r.change === "resized" || r.change === "relabeled") {
        delete copy.id;
        delete copy.label;
      }
      return roundFloats(copy);
    };
    expect(strip(inv), `mismatch for ${s.change} ${s.id}`).toEqual(strip(hit!));
  }
}

describe("diffPlans — auto-id rooms under insertion, deletion and permutation", () => {
  const roomArb = (i: number) =>
    fc.record({ i: fc.constant(i), labelled: fc.boolean(), shrink: fc.constantFrom(0, 0, 500, 1000) });
  const universe = fc.tuple(...[0, 1, 2, 3, 4, 5, 6, 7].map(roomArb));
  // Two independent shuffled subsets of the universe: rooms inserted, deleted and reordered
  // between the sides. On side B a room may also lose its label (`unlabelB`) or change width.
  const pairArb = fc.record({
    rooms: universe,
    a: fc.shuffledSubarray([0, 1, 2, 3, 4, 5, 6, 7], { minLength: 1 }),
    b: fc.shuffledSubarray([0, 1, 2, 3, 4, 5, 6, 7], { minLength: 1 }),
    unlabelB: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
    shrinkB: fc.array(fc.constantFrom(0, 0, 0, 500), { minLength: 8, maxLength: 8 }),
  });
  const sides = (p: {
    rooms: AutoRoom[];
    a: number[];
    b: number[];
    unlabelB: boolean[];
    shrinkB: number[];
  }): { srcA: string; srcB: string } => ({
    srcA: autoIdPlan(p.a.map((i) => p.rooms[i]!)),
    srcB: autoIdPlan(
      p.b.map((i) => ({
        ...p.rooms[i]!,
        labelled: p.rooms[i]!.labelled && !p.unlabelB[i],
        shrink: p.rooms[i]!.shrink + p.shrinkB[i]!,
      })),
    ),
  });

  it("antisymmetry: diffPlans(B, A) is diffPlans(A, B) inverted, pair by pair", () => {
    fc.assert(
      fc.property(pairArb, (p) => {
        const { srcA, srcB } = sides(p);
        const ab = diffPlans(srcA, srcB);
        const ba = diffPlans(srcB, srcA);
        expect(ab.ok && ba.ok, "a generated plan failed to resolve").toBe(true);
        assertRoomsInvertPairwise(ab.rooms, ba.rooms);
        expect(ab.circulation).toEqual([]);
        expect(ba.circulation).toEqual([]);
        expect(roundFloats(ba.totals)).toEqual(
          roundFloats({
            floorAreaBeforeM2: ab.totals.floorAreaAfterM2,
            floorAreaAfterM2: ab.totals.floorAreaBeforeM2,
            roomsBefore: ab.totals.roomsAfter,
            roomsAfter: ab.totals.roomsBefore,
          }),
        );
      }),
      { numRuns: 120, seed: 20261001 },
    );
  });

  it("a permutation alone is an empty diff whenever every room is labelled", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([0, 1, 2, 3, 4, 5, 6, 7], { minLength: 1 }),
        fc.func(fc.integer()),
        (order, rank) => {
          const rooms = order.map((i) => ({ i, labelled: true, shrink: 0 }));
          const permuted = [...rooms].sort((x, y) => rank(x.i) - rank(y.i) || x.i - y.i);
          const d = diffPlans(autoIdPlan(rooms), autoIdPlan(permuted));
          expect(d.ok).toBe(true);
          expect(d.rooms).toEqual([]);
          expect(d.summary).toEqual([]);
        },
      ),
      { numRuns: 60, seed: 20261001 },
    );
  });

  it("identity: diffPlans(A, A) is empty for every generated plan", () => {
    fc.assert(
      fc.property(pairArb, (p) => {
        const { srcA, srcB } = sides(p);
        for (const src of [srcA, srcB]) {
          const d = diffPlans(src, src);
          expect(d.ok).toBe(true);
          expect(d.rooms).toEqual([]);
          expect(d.openings).toEqual([]);
          expect(d.furniture).toEqual([]);
          expect(d.circulation).toEqual([]);
          expect(d.summary).toEqual([]);
        }
      }),
      { numRuns: 40, seed: 20261001 },
    );
  });

  it("an insertion ahead of every room reports exactly one added room, in both directions", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([1, 2, 3, 4, 5, 6, 7], { minLength: 1 }), (order) => {
        const rest = order.map((i) => ({ i, labelled: true, shrink: 0 }));
        const withNew = [{ i: 0, labelled: true, shrink: 0 }, ...rest];
        const fwd = diffPlans(autoIdPlan(rest), autoIdPlan(withNew));
        expect(fwd.rooms).toEqual([{ id: "room_1", label: "R0", change: "added", areaAfterM2: 9 }]);
        const back = diffPlans(autoIdPlan(withNew), autoIdPlan(rest));
        expect(back.rooms).toEqual([{ id: "room_1", label: "R0", change: "removed", areaBeforeM2: 9 }]);
      }),
      { numRuns: 30, seed: 20261001 },
    );
  });
});

// ---------------------------------------------------------------------------
// Mixed authored and auto ids, unique and repeated labels (backlog M.7).
//
// The generator above has every id auto and every label unique, the one shape in which
// "label first only when auto on both sides" and "label first" agree, so it could not see
// an insertion plus a newly authored `id=` pairing the wrong rooms. Here each room of the
// same eight-slot universe carries an authored id `r<i>` or none, and no label, its own
// label `R<i>`, or one of two shared labels; side B may toggle the id between authored and
// auto (an `id=` added or dropped) and change the label. Every pair `diffPlans` forms has
// an equal id or an equal label on both sides (pass 0 and the id loop pair equal ids, pass 1
// and the rescue equal labels), so a resize is matched to its counterpart by either key with
// equal content; a relabel (labels differ) only by id.
// ---------------------------------------------------------------------------

type LabelMode = "none" | "own" | "Dup" | "Twin";
interface MixedRoom {
  i: number;
  authored: boolean;
  label: LabelMode;
  shrink: number;
}

function mixedPlan(rooms: MixedRoom[]): string {
  const lines = rooms.map(({ i, authored, label, shrink }) => {
    const at = `(${(i % 4) * 3000},${Math.floor(i / 4) * 3000})`;
    const text = label === "none" ? "" : ` label "${label === "own" ? `R${i}` : label}"`;
    return `  room${authored ? ` id=r${i}` : ""} at ${at} size ${3000 - shrink}x3000${text}`;
  });
  return (
    `plan "P" {\n  units mm\n` +
    `  wall exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }\n` +
    `${lines.join("\n")}\n}\n`
  );
}

/** The rooms half of the antisymmetry law over pairs that may cross ids (see above). */
function assertMixedRoomsInvert(ab: RoomChange[], ba: RoomChange[]): void {
  expect(ba.length, "room change counts differ").toBe(ab.length);
  const strip = (r: RoomChange): unknown => {
    const copy: Partial<RoomChange> = { ...r };
    if (r.change === "resized" || r.change === "relabeled") {
      delete copy.id;
      delete copy.label;
    }
    return roundFloats(copy);
  };
  // Key-order- and `undefined`-insensitive, like `toEqual`.
  const canon = (v: unknown): string =>
    JSON.stringify(v, (_k, x: unknown) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)))
        : x,
    );
  const used = new Set<RoomChange>();
  for (const s of ab) {
    const inv = invertRoom(s);
    const fits = (d: RoomChange): boolean =>
      !used.has(d) && d.change === inv.change && canon(strip(d)) === canon(strip(inv));
    let hit = ba.find((d) => fits(d) && d.id === s.id);
    if (!hit && s.change === "resized" && s.label) hit = ba.find((d) => fits(d) && d.label === s.label);
    expect(hit, `no inverted counterpart for ${s.change} ${s.id} (${s.label ?? "-"})`).toBeDefined();
    used.add(hit!);
  }
}

const labelModeArb = fc.constantFrom<LabelMode>("none", "own", "own", "Dup", "Twin");
const mixedRoomArb = (i: number) =>
  fc.record({ i: fc.constant(i), authored: fc.boolean(), label: labelModeArb, shrink: fc.constantFrom(0, 0, 500) });
const mixedPairArb = fc.record({
  rooms: fc.tuple(...[0, 1, 2, 3, 4, 5, 6, 7].map(mixedRoomArb)),
  a: fc.shuffledSubarray([0, 1, 2, 3, 4, 5, 6, 7], { minLength: 1 }),
  b: fc.shuffledSubarray([0, 1, 2, 3, 4, 5, 6, 7], { minLength: 1 }),
  toggleIdB: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
  labelB: fc.array(fc.option(labelModeArb, { freq: 3 }), { minLength: 8, maxLength: 8 }),
  shrinkB: fc.array(fc.constantFrom(0, 0, 0, 500), { minLength: 8, maxLength: 8 }),
});
type MixedPair = typeof mixedPairArb extends fc.Arbitrary<infer T> ? T : never;
const mixedSides = (p: MixedPair): { srcA: string; srcB: string } => ({
  srcA: mixedPlan(p.a.map((i) => p.rooms[i]!)),
  srcB: mixedPlan(
    p.b.map((i) => ({
      i,
      authored: p.rooms[i]!.authored !== p.toggleIdB[i],
      label: p.labelB[i] ?? p.rooms[i]!.label,
      shrink: p.rooms[i]!.shrink + p.shrinkB[i]!,
    })),
  ),
});

describe("diffPlans — mixed authored/auto ids, unique and repeated labels", () => {
  it("antisymmetry: diffPlans(B, A) is diffPlans(A, B) inverted, pair by pair", () => {
    fc.assert(
      fc.property(mixedPairArb, (p) => {
        const { srcA, srcB } = mixedSides(p);
        const ab = diffPlans(srcA, srcB);
        const ba = diffPlans(srcB, srcA);
        expect(ab.ok && ba.ok, "a generated plan failed to resolve").toBe(true);
        assertMixedRoomsInvert(ab.rooms, ba.rooms);
        expect(roundFloats(ba.totals)).toEqual(
          roundFloats({
            floorAreaBeforeM2: ab.totals.floorAreaAfterM2,
            floorAreaAfterM2: ab.totals.floorAreaBeforeM2,
            roomsBefore: ab.totals.roomsAfter,
            roomsAfter: ab.totals.roomsBefore,
          }),
        );
      }),
      { numRuns: 200, seed: 20261003 },
    );
  });

  it("identity: diffPlans(A, A) is empty for every generated plan", () => {
    fc.assert(
      fc.property(mixedPairArb, (p) => {
        const { srcA, srcB } = mixedSides(p);
        for (const src of [srcA, srcB]) {
          const d = diffPlans(src, src);
          expect(d.ok).toBe(true);
          expect(d.rooms).toEqual([]);
          expect(d.summary).toEqual([]);
        }
      }),
      { numRuns: 60, seed: 20261003 },
    );
  });

  it("a room kept unchanged under a uniquely-held label is never reported, whatever its id does", () => {
    // Side B inserts, deletes and reorders rooms and adds or drops `id=` freely, but every
    // room holds its own label and keeps its geometry, so a room on both sides is kept and
    // must appear in no change. (A room on one side only may still pair positionally with
    // another such room, as a move plus relabel — the diff cannot tell that from an add
    // plus a remove, and this law does not ask it to.) Under the old matching, a kept room
    // that gained or lost an `id=` fell back to its positional id and paired with a stranger.
    fc.assert(
      fc.property(mixedPairArb, (p) => {
        const own = (i: number, authored: boolean): MixedRoom => ({ i, authored, label: "own", shrink: 0 });
        const srcA = mixedPlan(p.a.map((i) => own(i, p.rooms[i]!.authored)));
        const srcB = mixedPlan(p.b.map((i) => own(i, p.rooms[i]!.authored !== p.toggleIdB[i])));
        const d = diffPlans(srcA, srcB);
        expect(d.ok).toBe(true);
        const kept = new Set(p.a.filter((i) => p.b.includes(i)).map((i) => `R${i}`));
        const ids = (s: string) =>
          new Set(
            describePlan(s)
              .rooms.filter((r) => kept.has(r.label ?? ""))
              .map((r) => r.id),
          );
        const [keptA, keptB] = [ids(srcA), ids(srcB)];
        // A change names a kept room when it carries its label, or (removed) its A-side id
        // or (otherwise) its B-side id — the id each change kind reports under.
        const touched = d.rooms.filter(
          (r) => kept.has(r.label ?? "") || (r.change === "removed" ? keptA : keptB).has(r.id),
        );
        expect(touched).toEqual([]);
        expect(d.rooms.length).toBeLessThanOrEqual(p.a.length + p.b.length - 2 * kept.size);
      }),
      { numRuns: 120, seed: 20261003 },
    );
  });
});
