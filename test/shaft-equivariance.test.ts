/**
 * The multi-storey equivariance law for circulation on storeys reached only by a shaft.
 *
 * `test/equivariance-corpus.test.ts` cannot see a `level` plan (a whole-file import drops the
 * `level` blocks), so nothing held a stair-reached storey to D4. Here each building's storeys
 * are components placed with the SAME frame on every storey (`place sN() as g at (t, t)
 * rotate … mirror …`; see `./shaft-equivariance-models.ts`), and every storey's
 * `describe().levels[*].circulation` under each of the eight frames is compared with the
 * identity's.
 *
 * Two laws, by grid:
 *
 *  - **Lattice-aligned** (a 100 mm cell, or one that happens to divide the plan): exactly
 *    equal, every field.
 *  - **Not lattice-aligned** (`navCellSizeMm` above 100 mm, the plan not a whole number of
 *    cells): the last cell spills past one edge and a turn moves the spill, so a walk may
 *    differ by whole cells — the known class circulation v2 left open (ADR 0008, "compared
 *    only under translation"). The bounds are MEASURED per building and pinned at the
 *    measured value, never a blanket exclusion and not a proven bound of the mechanism: the
 *    spill alone moved walks by 1–2 cells here with bottlenecks exact, and where the landing
 *    row has no free cell in some frames, `landingCells`' nearest-cell fallback starts the
 *    walk beside the flight in those frames, which can add up to two cells of spill on its
 *    own (and, on random buildings, the red team measured walks spilling up to 6 cells on
 *    this rule against 4 before it).
 *
 * And one law for every grid: **the landing never flips**. In every frame the same storeys
 * have a model, the same rooms are measured, and the same rooms are `unmeasured`, for the
 * same reasons. Whether a landing exists is decided on the plan's geometry
 * (`landingProbe`), never on cell centres: before that, the 120 m × 100 m shell (220 mm
 * cells) read `unmeasured: unreachable` upstairs in half the frames, and a side table, a
 * partition at the head or a wall pierced by an opening at the head (the red team's p3
 * cases, below) flipped too.
 */

import { describe, expect, it } from "vitest";
import type { CirculationModel } from "../src/analyze/circulation.js";
import { describe as describePlan } from "../src/index.js";
import { type Building, FRAMES, hillside, P3, placed, shell, townhouse } from "./shaft-equivariance-models.js";

/** How far one frame may differ from the identity, for one building. */
interface Bound {
  /** The identity frame measures the shaft-reached storeys (false: they are sealed). */
  measured?: boolean;
  /** Largest walk difference, in cells (0: exact). */
  walkCells: number;
  /** Largest bottleneck difference, mm (0: exact). */
  bottleneckMm: number;
  /** Every field equal (the lattice-aligned law). */
  exact: boolean;
}

const EXACT: Bound = { walkCells: 0, bottleneckMm: 0, exact: true };
/** The non-lattice spill alone. */
const spill = (walkCells: number): Bound => ({ walkCells, bottleneckMm: 0, exact: false });

const CASES: ReadonlyArray<[Building, Bound]> = [
  [townhouse(1), EXACT],
  [hillside(1), EXACT],
  [shell(20000, 15000, 300, true), EXACT],
  [townhouse(8), spill(2)], // 118 mm cells
  [hillside(5), spill(2)], // 119 mm cells
  [shell(100000, 80000, 300, true), spill(1)], // 179 mm cells
  [shell(120000, 100000, 200, true), spill(1)], // 220 mm cells
  // 220 mm cells, the stair's head 200 mm off the shell: the landing row lies in the wall's
  // raster in half the frames, and the walk starts at the nearest free cell instead, beside
  // the flight. Room `b`'s widest way in is then 820 mm, not the 840 mm of its 900 mm door:
  // the route past the flight crosses a cell one hop from its halo,
  // centreFreedomToClearWidth(1, 220, 300) = 220 + 600 = 820. So 840 − 820 = 20 mm.
  [shell(120000, 100000, 300, true), { walkCells: 3, bottleneckMm: 20, exact: false }],
  // The red team's p3 cases (220 mm cells; see `P3`).
  [P3.halfTable, spill(1)],
  [P3.partitionAtHead, { ...spill(0), measured: false }],
  [P3.openingAtHead, spill(1)],
];

const facts = (c: CirculationModel | null) =>
  c && {
    measured: c.rooms.map((r) => r.roomId).sort(),
    unmeasured: (c.unmeasured ?? []).map((u) => `${u.roomId}:${u.reason}`).sort(),
    blocked: (c.blocked ?? []).map((u) => u.roomId).sort(),
    entrances: [c.entranceId, ...c.rooms.map((r) => `${r.roomId}:${r.entranceId ?? ""}`)].sort(),
  };

describe("multi-storey equivariance: a shaft-reached storey under every frame of D4", () => {
  for (const [b, bound] of CASES) {
    it(`${b.name}: ${bound.exact ? "exactly equal" : `walks within ${bound.walkCells} cell(s)`}; the landing never flips`, () => {
      const runs = FRAMES.map((f) => describePlan(placed(b, f)));
      const id = runs[0]!;
      // A shaft-reached storey is really measured (or, where pinned, really sealed) in the
      // identity frame.
      expect(id.levels!.slice(1).every((l) => l.circulation !== null && l.circulation.rooms.length > 0)).toBe(
        bound.measured ?? true,
      );
      for (let i = 1; i < runs.length; i++) {
        const frame = FRAMES[i]!.trim();
        for (const l of id.levels!) {
          const got = runs[i]!.levels!.find((x) => x.level === l.level)!.circulation;
          const want = l.circulation;
          const where = `${frame} level ${l.level}`;
          expect(facts(got), where).toEqual(facts(want));
          if (bound.exact) {
            expect(got, where).toEqual(want);
            continue;
          }
          for (const r of want!.rooms) {
            const q = got!.rooms.find((x) => x.roomId === r.roomId)!;
            const cell = want!.cellSizeMm;
            expect(Math.abs(q.walkDistanceMm - r.walkDistanceMm), `${where} ${r.roomId} walk`).toBeLessThanOrEqual(
              bound.walkCells * cell,
            );
            expect(
              Math.abs(q.bottleneckClearWidthMm - r.bottleneckClearWidthMm),
              `${where} ${r.roomId} bottleneck`,
            ).toBeLessThanOrEqual(bound.bottleneckMm);
          }
        }
      }
    }, 300_000);
  }
});
