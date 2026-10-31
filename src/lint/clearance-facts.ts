/**
 * `describe --facts clearances` (plan-soundness PS2.72): what each clearance rule measured, per
 * storey, so a reviewer can check a warning, or its absence, from the CLI instead of re-measuring
 * the resolved geometry in a script.
 *
 * Every figure is read through the measure the rule itself calls, on a context built as `lint()`
 * builds it ({@link lintStoreys}, {@link buildLintContext}, the default ruleset): a WC's sides
 * ({@link measureWcSides}, `W_WC_SIDE_CLEARANCE`), a tall unit's and a hob's cover of a window
 * ({@link windowCover}, {@link hobWindowCover}, `W_FURNITURE_OVER_WINDOW`, `W_HOB_UNDER_WINDOW`),
 * a hob's nearest tall unit ({@link hobSideGap}, `W_HOB_FRIDGE_GAP`), a doorway's approach
 * ({@link blockedApproach}, {@link openingBlock}, `W_DOORWAY_BLOCKED`) and clear width (the access
 * graph's edge, `W_PATH_TOO_NARROW`), and a stair's landings and run ({@link storeyStairs},
 * {@link minimumRun}, `W_STAIR_NO_LANDING`, `W_STAIR_TOO_STEEP`). Nothing is re-derived: a figure
 * here and the one a message quotes come from one function. Lengths are whole millimetres, rounded
 * as the messages round them ({@link mm}). Reads only; `lint()` never sees it.
 */

import { rectOf } from "../analyze.js";
import { isTallUnit } from "../fixtures-catalog.js";
import type { Obstacle } from "../furniture-relation.js";
import { DOORWAY_WIDTH_MM, doorLandingRect, openingBlock } from "../geometry/rect.js";
import type { ResolvedLevel, ResolvedPlan, RDoor, RFurniture, ROpening } from "../ir.js";
import {
  curvedNear,
  hobNearHost,
  hobSideGap,
  hobWindowCover,
  isCookingSurface,
  isServiceCounter,
  isWc,
  measureWcSides,
  roomOf,
  wcWorld,
  windowBands,
  windowCover,
} from "./clearance-measure.js";
import { buildLintContext, type LintContext } from "./context.js";
import { deficitMm, mm } from "./measure.js";
import { blockedApproach } from "./rules/doors.js";
import { landingCount, leastRun, minimumRun, runLength, storeyStairs } from "./rules/stairs.js";
import { resolveRuleset } from "./ruleset.js";
import { lintStoreys } from "./storeys.js";

/** What a measure met: a piece (its id), a wall (its id) or a door's swing (the door's id). */
export type ClearanceObstacle =
  | { kind: "furniture"; id: string }
  | { kind: "wall"; id: string }
  | { kind: "swing"; id: string };

/** One side of a WC: its centreline to what stands beside it, measured up to the figure. */
export interface WcSideFact {
  /** Centreline to the obstacle (the figure when nothing stands within it). */
  centreline_mm: number;
  /** What stands there, or `null` when the side is clear to the figure. */
  by: ClearanceObstacle | null;
}

/** A WC as `W_WC_SIDE_CLEARANCE` measured it. */
export interface WcFact {
  id: string;
  room?: string;
  need_mm: number;
  /** Both sides, or `null` when the pan is not measured: wide enough to clear the figure by
   *  itself (`"wide"`) or with a curved wall near a side (`"curved-wall"`). */
  sides: [WcSideFact, WcSideFact] | null;
  unmeasured?: "wide" | "curved-wall";
}

/** A window a piece's footprint stands in front of: the band the window's span makes within
 *  `fixtureWallTolMm` of its host's centreline, and the part of it the footprint covers. */
export interface WindowCoverFact {
  window: string;
  window_width_mm: number;
  /** The length of the window's span the footprint covers. */
  covered_mm: number;
  /** How deep across the host the covered part reaches into the band. */
  across_mm: number;
}

/** A tall unit as `W_FURNITURE_OVER_WINDOW` measured it: one row per window it covers. */
export interface TallUnitFact {
  id: string;
  category: string;
  room?: string;
  windows: WindowCoverFact[];
}

/** A window a cooking surface covers, and whether it stands against that window's host. */
export interface HobWindowFact extends WindowCoverFact {
  /** The hob's side nearest the host, past the host's face (0 when on or into it). */
  off_face_mm: number;
  /** Covered and against the host: `W_HOB_UNDER_WINDOW` reads it as under the window. */
  under: boolean;
}

/** A cooking surface as `W_HOB_UNDER_WINDOW` and `W_HOB_FRIDGE_GAP` measured it. */
export interface HobFact {
  id: string;
  category: string;
  room?: string;
  windows: HobWindowFact[];
  /** The nearest tall unit inside either side's landing strip (`hobLandingMm` deep), or `null`. */
  tall_unit_gap: { id: string; gap_mm: number; need_mm: number } | null;
}

/** A doorway's approach as `W_DOORWAY_BLOCKED` measured it, on each side of the wall. */
export interface ApproachFact {
  need_mm: number;
  /** The first piece standing in the landing and the clear depth it leaves from the wall's
   *  face, or `null` when no piece stands in it. A cased opening wider than a doorway is read by
   *  its clear stretch instead ({@link DoorwayFact.stretch}). */
  blocked_by: { id: string; clear_mm: number } | null;
}

/** A door or cased opening: its widths and its approach. */
export interface DoorwayFact {
  id: string;
  kind: "door" | "opening";
  door_kind?: string;
  width_mm: number;
  /** The clear width the access graph carries (a door's active leaf less the leaf-and-stop
   *  allowance; an opening's full width): what `W_PATH_TOO_NARROW` weighs. Absent when the
   *  connector joins no two spaces. */
  clear_width_mm?: number;
  /** `null` when the approach is not measured: a vehicle door (`"garage"`), or no straight
   *  orthogonal host (`"host"`). */
  approach: ApproachFact | null;
  unmeasured?: "garage" | "host";
  /** A cased opening wider than a doorway ({@link DOORWAY_WIDTH_MM}): the longest stretch of its
   *  span the pieces in its approach leave clear, against the doorway width it needs. */
  stretch?: { clear_mm: number; need_mm: number; pieces: string[] };
}

/** One end of a flight this storey owes a landing, as `W_STAIR_NO_LANDING` measured it. */
export interface LandingFact {
  end: "foot" | "head";
  need_mm: number;
  /** How deep the floor stands clear past the step, up to the figure (`null`: not measured,
   *  a curved wall near it). */
  clear_mm: number | null;
  /** What cuts it short: a wall, a void, no floor, or another piece of the same block stair;
   *  `null` when clear to the figure. */
  by: { kind: "wall"; id: string } | { kind: "void"; id: string } | { kind: "no-floor" } | { kind: "own-piece" } | null;
}

/** A stair: its run against the storey it climbs, and its landings. */
export interface StairFact {
  id: string;
  dir: "up" | "down";
  width_mm: number;
  /** The run along its flight; on a block stair, the sum of its flights. */
  run_mm: number;
  /** The shortest run the storey height needs (`W_STAIR_TOO_STEEP`), one going less per landing
   *  of a block stair, on a `dir up` flight of a plan that authors its heights; absent otherwise. */
  min_run_mm?: number;
  landings: LandingFact[];
}

/** One storey's clearance measures. `stairs` is `null` past the stair rules' work budget. */
export interface ClearanceFacts {
  wcs: WcFact[];
  tall_units: TallUnitFact[];
  hobs: HobFact[];
  doorways: DoorwayFact[];
  stairs: StairFact[] | null;
}

/** A length as the messages print it: whole millimetres, rounded ({@link mm}). */
const len = (x: number): number => Number(mm(x));
/** A clear depth and a figure as a shortfall message prints them ({@link deficitMm}): what is
 *  available rounded down, what is required rounded up, so the facet never reads clear where the
 *  message reads short. */
const have = (x: number): number => Number(deficitMm(0, x).available);
const want = (x: number): number => Number(deficitMm(x, 0).required);

const obstacle = (o: Obstacle): ClearanceObstacle =>
  o.kind === "furniture"
    ? { kind: "furniture", id: o.piece.id }
    : o.kind === "wall"
      ? { kind: "wall", id: o.seg.wallId }
      : { kind: "swing", id: o.door.id };

const roomKey = (f: RFurniture, ctx: LintContext): { room?: string } => {
  const r = roomOf(f, ctx);
  return r ? { room: r.id } : {};
};

function wcFacts(ctx: LintContext): WcFact[] {
  const need = ctx.rules.wcSideClearanceMm;
  if (need === null) return [];
  const wcs = ctx.furniture.filter((f) => isWc(f.category));
  if (wcs.length === 0) return [];
  const world = wcWorld(ctx.furniture, ctx);
  return wcs.map((f): WcFact => {
    const base = { id: f.id, ...roomKey(f, ctx), need_mm: want(need) };
    const m = measureWcSides(rectOf(f), f.rotate, need, world, f);
    if (m === null) return { ...base, sides: null, unmeasured: "wide" };
    if (curvedNear(ctx.wallSegs, [m.sides[0].strip, m.sides[1].strip]))
      return { ...base, sides: null, unmeasured: "curved-wall" };
    const side = (i: 0 | 1): WcSideFact => ({
      centreline_mm: have(m.half + m.sides[i].m.measured),
      by: m.sides[i].m.by === null ? null : obstacle(m.sides[i].m.by!),
    });
    return { ...base, sides: [side(0), side(1)] };
  });
}

function coverFact(w: { id: string; width: number }, c: { covered: number; across: number }): WindowCoverFact {
  return { window: w.id, window_width_mm: len(w.width), covered_mm: len(c.covered), across_mm: len(c.across) };
}

function tallUnitFacts(ctx: LintContext): TallUnitFact[] {
  const tall = ctx.furniture.filter((f) => isTallUnit(f.category));
  if (tall.length === 0) return [];
  const bands = windowBands(ctx.windows);
  const tol = ctx.rules.fixtureWallTolMm;
  return tall.map((f) => ({
    id: f.id,
    category: f.category,
    ...roomKey(f, ctx),
    windows: bands.flatMap((b) => {
      const c = windowCover(b, rectOf(f), tol);
      return c === null ? [] : [coverFact(b.w, c)];
    }),
  }));
}

function hobFacts(ctx: LintContext): HobFact[] {
  const hobs = ctx.furniture.filter((f) => isCookingSurface(f.category));
  if (hobs.length === 0) return [];
  const bands = windowBands(ctx.windows);
  const tol = ctx.rules.fixtureWallTolMm;
  const landing = ctx.rules.hobLandingMm;
  const tall = ctx.furniture.filter((f) => isTallUnit(f.category));
  return hobs.map((f) => {
    const r = rectOf(f);
    const near = landing === null || tall.length === 0 ? null : hobSideGap(ctx, f, tall, landing);
    return {
      id: f.id,
      category: f.category,
      ...roomKey(f, ctx),
      windows: bands.flatMap((b) => {
        const c = windowCover(b, r, tol);
        if (c === null) return [];
        return [
          {
            ...coverFact(b.w, c),
            off_face_mm: len(Math.max(0, hobNearHost(b, r) - b.w.host!.thickness / 2)),
            under: hobWindowCover(b, r, tol) !== null,
          },
        ];
      }),
      tall_unit_gap: near === null ? null : { id: near.piece.id, gap_mm: have(near.gap), need_mm: want(landing!) },
    };
  });
}

function doorwayFacts(ctx: LintContext): DoorwayFact[] {
  const depth = ctx.rules.doorwayLandingMm;
  const clear = new Map(ctx.access().edges.map((e) => [e.doorId, e.estimatedClearWidth] as const));
  const one = (c: RDoor | ROpening): DoorwayFact => {
    const cw = clear.get(c.id);
    const base = {
      id: c.id,
      kind: c.kind,
      ...(c.kind === "door" && c.doorKind !== undefined ? { door_kind: c.doorKind } : {}),
      width_mm: len(c.width),
      ...(cw !== undefined ? { clear_width_mm: len(cw) } : {}),
    };
    if (c.kind === "door" && c.doorKind === "garage") return { ...base, approach: null, unmeasured: "garage" };
    if (doorLandingRect(c, depth) === null) return { ...base, approach: null, unmeasured: "host" };
    if (c.kind === "opening" && c.width > DOORWAY_WIDTH_MM) {
      const pieces = ctx.furniture.filter((f) => !isServiceCounter(f.category));
      const block = openingBlock(c, depth, pieces.map(rectOf))!;
      return {
        ...base,
        approach: { need_mm: len(depth), blocked_by: null },
        stretch: {
          clear_mm: len(block.stretch),
          need_mm: len(DOORWAY_WIDTH_MM),
          pieces: block.inside.map((i) => pieces[i]!.id),
        },
      };
    }
    const hit =
      c.kind === "door" ? blockedApproach(c, ctx) : blockedApproach(c, ctx, (f) => !isServiceCounter(f.category));
    return {
      ...base,
      approach: { need_mm: len(depth), blocked_by: hit ? { id: hit.blocker.id, clear_mm: len(hit.gap) } : null },
    };
  };
  return [...ctx.doors.map(one), ...ctx.openings.map(one)];
}

function stairFacts(ctx: LintContext): StairFact[] | null {
  if (!ctx.verticals.some((v) => v.kind === "stair")) return [];
  const f = storeyStairs(ctx);
  if (f === null) return null;
  return f.stairs.map((sf) => {
    const v = sf.v;
    const run = runLength(v);
    const rise = ctx.ir.storeyHeight;
    const need = ctx.ir._heightsAuthored ? minimumRun(rise, ctx.rules, landingCount(v)) : null;
    return {
      id: v.id,
      dir: v.dir,
      width_mm: len(v.width),
      run_mm: len(run),
      ...(v.dir === "up" && need !== null ? { min_run_mm: want(leastRun(v, rise, ctx.rules, need)) } : {}),
      landings: sf.landings.map((l, i): LandingFact => {
        const b = sf.blocks[i]!;
        const need_mm = want(sf.needs[i]!);
        if (b === "curved") return { end: l.end, need_mm, clear_mm: null, by: null };
        if (b === null) return { end: l.end, need_mm, clear_mm: need_mm, by: null };
        const by: LandingFact["by"] =
          "noFloor" in b.what
            ? { kind: "no-floor" }
            : "void" in b.what
              ? { kind: "void", id: b.what.void.id }
              : "ownPiece" in b.what
                ? { kind: "own-piece" }
                : { kind: "wall", id: b.what.wall.wallId };
        return { end: l.end, need_mm, clear_mm: have(b.depth), by };
      }),
    };
  });
}

/** One storey's clearance measures, on its lint context. */
function storeyClearances(ctx: LintContext): ClearanceFacts {
  return {
    wcs: wcFacts(ctx),
    tall_units: tallUnitFacts(ctx),
    hobs: hobFacts(ctx),
    doorways: doorwayFacts(ctx),
    stairs: stairFacts(ctx),
  };
}

/**
 * The clearance measures of a resolved plan, under the default ruleset: the plan's own (its
 * lowest storey's, `levels[0].ir === ir`) and, on a multi-storey plan, each storey's by level.
 */
export function clearanceFacts(
  ir: ResolvedPlan,
  levels: readonly ResolvedLevel[],
): { top: ClearanceFacts; byLevel: Map<number, ClearanceFacts> } {
  const rules = resolveRuleset();
  const byLevel = new Map<number, ClearanceFacts>();
  let top: ClearanceFacts | undefined;
  for (const st of lintStoreys(ir, levels, rules.tolMm)) {
    const facts = storeyClearances(buildLintContext(st.ir, rules, st.building));
    if (st.level !== undefined) byLevel.set(st.level, facts);
    top ??= facts;
  }
  return { top: top!, byLevel };
}
