/**
 * The per-room checks, run as one order-preserving composite: for each room (in
 * source order) TOO_SMALL → DISCONNECTED → NO_WINDOW → NOT_ENCLOSED → NO_FIXTURE →
 * GARAGE_TOO_NARROW → ROOM_TOO_NARROW → GARAGE_TOO_NARROW's depth finding (PS2.70), exactly the
 * interleaving `lint()` has always emitted (the output array is pinned by tests and by agents
 * diffing `--json` output). A new check is APPENDED to that sequence, never inserted into it.
 *
 * `W_ROOM_TOO_NARROW` and the double-bedroom floor of `W_ROOM_TOO_SMALL` read thresholds only
 * the residential-advisory profiles set (plan-soundness PS5.2); under the default ruleset they
 * are off, ask for no access graph and file no skip, so default `lint()` is byte-identical.
 */

import {
  EXTERIOR_NODE,
  isBedroom,
  isCirculation,
  isGarage,
  isKitchen,
  isWetRoom,
  largestPerimeterGap,
  largestPerimeterGapCircle,
  largestPerimeterGapRing,
  pointInRoomBox,
  pointOnRoomEdge,
  rectOf,
  roomAreaMm2,
  roomUses,
  windowServesRoom,
} from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { zoneFixtureCategories } from "../../fixtures-catalog.js";
import { fmt2 } from "../../num-format.js";
import { deficitMm, mm, shortfall } from "../measure.js";
import type { UseKind } from "../../ast.js";
import type { RDoor, RRoom } from "../../ir.js";
import type { LintContext, LintRule } from "../context.js";
import { capFirst } from "../../naming.js";
import { DEFAULT_RULESET, DOUBLE_BED_MIN_WIDTH_MM, type LintRuleset } from "../ruleset.js";
import { innerFaceOfRoomEdge } from "../../fixture-orientation.js";
import { memoRoomNetAreaMm2, storeyNetAreaBands } from "../../analyze/net-area-memo.js";
import { itemWords, pasteSet, roomDefiningItems } from "../defining.js";
import type { PasteFailure } from "../fixture-paste.js";

/** Furniture categories that count as a plumbing fixture for a wet room — derived
 *  from the catalog's `zones` data (single source; membership drift-tested). */
export const WET_FIX = zoneFixtureCategories("wet");
/** Furniture categories that count as a fixture/appliance for a kitchen. */
export const KITCHEN_FIX = zoneFixtureCategories("kitchen");

/** Square metres of a room (exact for a polygon too), rounded to 2 decimals. */
export const areaM2 = (r: RRoom): number => Math.round((roomAreaMm2(r) / 1_000_000) * 100) / 100;

/**
 * A room's net floor in m² (ADR 0027: its floor less every part a wall stands on), rounded to 2
 * decimals exactly as `describe().rooms[].net_area_m2` is, from the same memo; `undefined` where
 * describe omits it (past the net-area budgets).
 */
export function netAreaM2(ctx: LintContext, r: RRoom): number | undefined {
  const mm2 = memoRoomNetAreaMm2(r, storeyNetAreaBands(ctx.ir.walls));
  return mm2 === undefined ? undefined : Math.round((mm2 / 1_000_000) * 100) / 100;
}

/** The `W_ROOM_TOO_SMALL` hint when a net-area ruleset falls back to the drawn area: the net area
 *  is omitted past the edge or probe-work caps, or when the integral fails its consistency guard
 *  (`"inconsistent"`, `netAreaDetail` in `src/analyze/net-area.ts`). */
const GROSS_AREA_HINT =
  "gross-area: this room's net area could not be measured (too much wall geometry for the net-area budget, or walls crossing it in a way the exact measure cannot settle), so its drawn area, to the wall centrelines, was read instead; the clause measures net floor.";

/**
 * Does any window serve the room? The one window-attribution fact the daylight rules read
 * (`W_BEDROOM_NO_WINDOW`, `W_HABITABLE_NO_WINDOW`): {@link windowServesRoom}, a window centred
 * on the room's own perimeter, or one on an arc edge that the shape attributes to it (PS0.12) —
 * the tests `describe().windows[].room` is built from.
 */
export function roomHasWindow(ctx: LintContext, r: RRoom): boolean {
  return ctx.windows.some((win) => windowServesRoom(win, r.id, ctx.roomRects, ctx.rules.tolMm, ctx.wallSegs));
}

/**
 * Would `W_ROOM_NO_FIXTURE` report this room: a wet room or kitchen with no fixture of its
 * zone whose footprint centre is on its floor? A wet room is asked for a wet fixture, else a
 * kitchen for a kitchen fixture. False for every other room.
 */
export function lacksZoneFixture(ctx: LintContext, r: RRoom): boolean {
  const isWet = isWetRoom(r);
  if (!isWet && !isKitchen(r)) return false;
  const rect = ctx.roomRects.get(r.id)!;
  const want = isWet ? WET_FIX : KITCHEN_FIX;
  return !ctx.furniture.some((f) => {
    const fr = rectOf(f);
    const cx = fr.x + fr.w / 2;
    const cy = fr.y + fr.h / 2;
    return want.has(f.category) && pointInRoomBox({ x: cx, y: cy }, rect);
  });
}

/**
 * Clear width one parked car needs, in millimetres.
 *
 * 2700 mm is the conventional minimum single-bay clear width — body plus the room to open a
 * door on each side — and 5400 for a double, which is what the residential codes and the
 * trade both land on. It is deliberately NOT the rounder 3000: this field obeys the same
 * calibration rule the fixture catalog's clearances do ("tight enough that a normal layout
 * never trips it"), and a 5500 mm double garage is a normal, buildable layout that 3000 would
 * warn about — `examples/hillside-villa.arch`'s is exactly one. A garage that trips this is
 * genuinely too narrow to park in, not merely snug.
 */
const CAR_BAY_WIDTH_MM = 2700;

/**
 * The least width of a garage's vehicle door: one car through it, and two side by side. Common
 * practice for a sectional or roller door (a single about 2400 mm, roughly 8 ft; a double 4200-4800 mm), not
 * a published standard: no citable code source was found, and the hint says so. The opening only;
 * `W_GARAGE_TOO_NARROW` already budgets the door-swing allowance per bay.
 */
const GARAGE_DOOR_SINGLE_MM = 2400;
const GARAGE_DOOR_DOUBLE_MM = 4200;
const GARAGE_DOOR_SOURCE = `${GARAGE_DOOR_SINGLE_MM} mm (one car) and ${GARAGE_DOOR_DOUBLE_MM} mm (two side by side) are common practice for a sectional door, not a published standard.`;

/** Categories that occupy a parking bay. A bicycle or a motorcycle does not. */
const PARKED_CATEGORIES: ReadonlySet<string> = new Set(["car"]);

/** The parked cars in a garage: `car` fixtures whose centre lies in the room's rectangle. */
function parkedCars(ctx: LintContext, rect: { x: number; y: number; w: number; h: number }): number {
  return ctx.furniture.filter((f) => {
    const fr = rectOf(f);
    return PARKED_CATEGORIES.has(f.category) && pointInRoomBox({ x: fr.x + fr.w / 2, y: fr.y + fr.h / 2 }, rect);
  }).length;
}

/**
 * The `W_ROOM_NO_FIXTURE` remedy: the fixture categories are built in (no import), and the
 * example is the room's defining pieces (`src/lint/defining.ts`), each placed from the room's
 * own shape and checked clear of its walls, doors, furniture and the pieces quoted before it
 * ({@link pasteSet}). A room where one has no clear wall run gets the categories and the
 * footprint instead of statements that would trade this warning for another.
 */
function noFixtureHint(ctx: LintContext, r: RRoom): string {
  // The pieces that DEFINE the room (a bath's bathtub or shower, a WC's WC, a kitchen's sink
  // and hob), quoted together: one fixture alone would leave the room furnished and still
  // lacking its defining piece, which `W_ROOM_MISSING_DEFINING` reports — a hint that trades
  // one warning for another.
  const items = roomDefiningItems(r);
  const paste = pasteSet(ctx, r, items);
  const named = items
    .map((i) =>
      itemWords(i)
        .map((w) => `\`${w}\``)
        .join(" or "),
    )
    .join(" and ");
  if ("stmts" in paste)
    return `Place the fixtures that make it a ${noun(r)} (nothing to import) — e.g. ${paste.stmts.map((s) => `\`${s}\``).join(" and ")}.`;
  const fp = paste.footprint;
  return `Place the fixtures that make it a ${noun(r)} (nothing to import), ${named}: a \`${paste.item.category}\`${fp ? ` (${fmt2(fp.along)} along a wall, ${fmt2(fp.depth)} deep)` : ""} does not fit, because ${pasteFailureWhy(ctx, paste.failure)}.`;
}

/** What a wet room or kitchen is called in the `W_ROOM_NO_FIXTURE` hint. */
const noun = (r: RRoom): string => (isWetRoom(r) ? (roomUses(r).has("bath") ? "bathroom" : "WC") : "kitchen");

/** Why {@link pasteFixture} could quote no statement, as the clause a hint ends with. */
export function pasteFailureWhy(ctx: LintContext, failure: PasteFailure): string {
  return failure === "grid"
    ? `the plan's \`grid ${fmt2(ctx.ir.grid)}\` snaps that footprint away, so use a finer grid`
    : failure === "grid-offset"
      ? `the plan's \`grid ${fmt2(ctx.ir.grid)}\` snaps an \`at (x,y)\` placement off the wall face here, so use a finer grid or a rectangular room with \`anchor … flush\``
      : failure === "squeeze"
        ? "the placement found would squeeze the walk below its minimum clear width (`W_PATH_TOO_NARROW`), so make room first"
        : failure === "raises"
          ? "the placement found would raise another finding, so place it by hand"
          : failure === "unverified"
            ? "this lint run has checked as many quoted placements as it may (`hint-budget` in the coverage report), so none is quoted; place it by hand"
            : failure === "no-wall"
              ? "it has no straight wall running square to the page for one to back onto, so give it one or place the fixture with `at (x,y)` and `rotate`"
              : "no wall of it has a run clear of its doors and furniture for one, so make room first";
}

/** What a room held to a per-use floor is called in the `W_ROOM_TOO_SMALL` message. */
const USE_FLOOR_NOUN: Partial<Record<UseKind, string>> = {
  wc: "a WC",
  bath: "a bathroom",
  // Reached only under a ruleset that gives these uses a floor (no default does).
  bedroom: "a bedroom",
  living: "a living room",
  kitchen: "a kitchen",
  dining: "a dining room",
};

/** What `W_ROOM_TOO_NARROW` calls a room held to a per-use width. */
const USE_WIDTH_NOUN: Partial<Record<UseKind, string>> = {
  ...USE_FLOOR_NOUN,
  hall: "a hall",
  circulation: "a passage",
  entry: "an entry",
  storage: "a store",
  utility: "a utility room",
  office: "an office",
  garage: "a garage",
};

/** The pieces that count as a bedspace for the single/double reading. A `bunk_bed`, `crib` or
 *  `cot` is not read: a bunk's two bedspaces share one single-bed footprint, and a cot is no
 *  adult's bed. */
const BED_CATEGORIES: ReadonlySet<string> = new Set(["bed", "double_bed"]);

/** How a bedroom reads from its beds: `double` (sleeps two), `single`, or `no-bed`. */
export type BedReading = "single" | "double" | "no-bed";

/**
 * Whether a bedroom is a single or a double, read from the beds whose footprint centre stands
 * on its floor, never from its label (ADR 0005): a `double_bed`, a `bed` whose footprint's
 * shorter side is wider than {@link DOUBLE_BED_MIN_WIDTH_MM}, or two or more beds (a twin room,
 * which the space standards hold to the double's figures) make a double; one narrower `bed` a
 * single; none, `no-bed`.
 */
export function bedroomBeds(ctx: LintContext, r: RRoom): BedReading {
  const rect = ctx.roomRects.get(r.id)!;
  const beds = ctx.furniture.filter((f) => {
    if (!BED_CATEGORIES.has(f.category)) return false;
    const fr = rectOf(f);
    return pointInRoomBox({ x: fr.x + fr.w / 2, y: fr.y + fr.h / 2 }, rect);
  });
  if (beds.length === 0) return "no-bed";
  if (beds.length >= 2) return "double";
  const b = beds[0]!;
  return b.category === "double_bed" || Math.min(b.size.w, b.size.h) > DOUBLE_BED_MIN_WIDTH_MM ? "double" : "single";
}

/**
 * A rectangular room's CLEAR short side (mm): the least distance between the inner faces of
 * the walls on opposite edges ({@link innerFaceOfRoomEdge}, the innermost face of every wall
 * backing the edge; the drawn edge where no wall backs it). `null` for a polygon or circle room,
 * whose bounding box's short side is not its floor's width.
 */
export function roomClearShortSideMm(ctx: LintContext, r: RRoom): number | null {
  if (r.poly || r.circle) return null;
  const rect = ctx.roomRects.get(r.id)!;
  const face = (e: "top" | "bottom" | "left" | "right"): number | null =>
    innerFaceOfRoomEdge(rect, e, ctx.ir.walls, ctx.rules.fixtureWallTolMm, ctx.wallSegs);
  const left = face("left") ?? rect.x;
  const right = face("right") ?? rect.x + rect.w;
  const top = face("top") ?? rect.y;
  const bottom = face("bottom") ?? rect.y + rect.h;
  return Math.min(right - left, bottom - top);
}

/**
 * A garage's CLEAR depth along its vehicle door's axis (PS2.70): for each `door garage` on the
 * room's perimeter, the distance between the inner face of the wall on the door's edge and that
 * of the wall on the edge opposite ({@link innerFaceOfRoomEdge}; the drawn edge where no wall
 * backs it), measured from the room's own rectangle. The deepest axis wins: a car can drive in
 * through any of them. `"no-door"` when no vehicle door stands on the perimeter; `null` for a
 * polygon or circle room, whose box is not its floor.
 */
export function garageClearDepth(ctx: LintContext, r: RRoom): { mm: number; door: RDoor } | "no-door" | null {
  if (r.poly || r.circle) return null;
  const rect = ctx.roomRects.get(r.id)!;
  const tol = ctx.rules.tolMm;
  const face = (e: "top" | "bottom" | "left" | "right"): number | null =>
    innerFaceOfRoomEdge(rect, e, ctx.ir.walls, ctx.rules.fixtureWallTolMm, ctx.wallSegs);
  let best: { mm: number; door: RDoor } | null = null;
  for (const d of ctx.doors) {
    if (d.doorKind !== "garage" || !pointOnRoomEdge(d.at, rect, tol)) continue;
    const onSide = Math.abs(d.at.x - rect.x) <= tol || Math.abs(d.at.x - (rect.x + rect.w)) <= tol;
    const onEnd = Math.abs(d.at.y - rect.y) <= tol || Math.abs(d.at.y - (rect.y + rect.h)) <= tol;
    // At a corner the door stands on both edges; its host wall's run says which one it is in.
    const across =
      onSide && onEnd && d.host
        ? Math.abs(d.host.b.y - d.host.a.y) > Math.abs(d.host.b.x - d.host.a.x)
        : onSide && !onEnd;
    const mm = across
      ? (face("right") ?? rect.x + rect.w) - (face("left") ?? rect.x)
      : (face("bottom") ?? rect.y + rect.h) - (face("top") ?? rect.y);
    if (best === null || mm > best.mm) best = { mm, door: d };
  }
  return best ?? "no-door";
}

/** The source of `W_GARAGE_TOO_NARROW`'s depth figure, for the two figures cited
 *  (`LintRuleset.garageDepthMm`); a figure a caller sets has no source the rule can name. */
const GARAGE_DEPTH_SOURCE: Readonly<Record<number, string>> = {
  5000: "5000 mm is the length of a parking bay or a car port, the car alone (Buckinghamshire parking guidance 2022, Table 9: a space 5.0 × 2.8 m; Monmouthshire SPG Domestic Garages 2013 ¶21: a car port 5.0 m long).",
  6000: "6000 mm is a garage's clear internal length, room to walk round the car (Monmouthshire SPG Domestic Garages 2013 ¶12 and ¶25, citing Manual for Streets: 3.0 × 6.0 m; Buckinghamshire parking guidance 2022, Table 11).",
};

/** A clear width a profile asks of a room, and the words that say why. */
interface WidthAsk {
  mm: number;
  /** The noun phrase after "the profile asks of": `a double bedroom`, `a passage to "Bed 2"`. */
  of: string;
}

/** Does the ruleset ask any room a width (PS5.2)? Off under the default ruleset. */
const asksWidths = (rules: LintRuleset): boolean =>
  Object.keys(rules.minRoomShortSideByUseMm).length > 0 ||
  Object.keys(rules.minPathClearWidthByUseMm).length > 0 ||
  rules.minDoubleBedroomShortSideMm !== null ||
  rules.minMainDoubleBedroomShortSideMm !== null ||
  rules.minEntryPassageWidthMm !== null;

/** Does the ruleset hold a double bedroom to anything of its own (PS5.2)? */
const readsBeds = (rules: LintRuleset): boolean =>
  rules.minDoubleBedroomAreaM2 !== null ||
  rules.minDoubleBedroomShortSideMm !== null ||
  rules.minMainDoubleBedroomShortSideMm !== null;

/**
 * The highest clear width the ruleset asks of `r`, or `null`: its own uses'
 * (`minRoomShortSideByUseMm`), a double bedroom's, the main double bedroom's, and for a passage
 * the entry passage's and each neighbour's (`minPathClearWidthByUseMm`, by the use of each room
 * a door or cased opening joins it to). The first candidate in that order wins a tie.
 */
function widthAsk(
  ctx: LintContext,
  r: RRoom,
  beds: BedReading | undefined,
  mainDouble: string | null,
): WidthAsk | null {
  const { rules } = ctx;
  const uses = roomUses(r);
  const cands: WidthAsk[] = [];
  for (const u of uses) {
    const mm = rules.minRoomShortSideByUseMm[u];
    if (mm !== undefined) cands.push({ mm, of: USE_WIDTH_NOUN[u] ?? `a room used as ${u}` });
  }
  if (uses.has("bedroom") && beds === "double") {
    if (r.id === mainDouble && rules.minMainDoubleBedroomShortSideMm !== null)
      cands.push({
        mm: rules.minMainDoubleBedroomShortSideMm,
        of: "one double bedroom of every home (none here is that wide)",
      });
    else if (rules.minDoubleBedroomShortSideMm !== null)
      cands.push({ mm: rules.minDoubleBedroomShortSideMm, of: "a double bedroom" });
  }
  const byUse = rules.minPathClearWidthByUseMm;
  const entry = rules.minEntryPassageWidthMm;
  if (isCirculation(r) && (entry !== null || Object.keys(byUse).length > 0)) {
    const edges = ctx.access().edges.filter((e) => !e.ambiguous && e.between.includes(r.id));
    if (entry !== null && (uses.has("entry") || edges.some((e) => e.between.includes(EXTERIOR_NODE))))
      cands.push({ mm: entry, of: "an entry passage" });
    const byId = new Map(ctx.rooms.map((x) => [x.id, x]));
    for (const e of edges) {
      const other = byId.get(e.between[0] === r.id ? e.between[1] : e.between[0]);
      if (!other || other.id === r.id) continue;
      let best: number | undefined;
      for (const u of roomUses(other)) {
        const mm = byUse[u];
        if (mm !== undefined && (best === undefined || mm > best)) best = mm;
      }
      if (best !== undefined) cands.push({ mm: best, of: `a passage that leads to ${ctx.nameOf(other)}` });
    }
  }
  let out: WidthAsk | null = null;
  for (const c of cands) if (out === null || c.mm > out.mm) out = c;
  return out;
}

/**
 * The double bedroom held to `minMainDoubleBedroomShortSideMm` (PS5.2): when no double bedroom
 * on the storey is that wide, the widest one (the first in source order on a tie); `null` when
 * one already is, when there is none, or when one cannot be measured (a polygon double files
 * `non-rectangular-room`, and the widest is then unknown). On a multi-storey plan the bedrooms
 * of one home may stand on another storey, so the arm files `no-dwelling` and holds none.
 */
function mainDoubleOf(ctx: LintContext, beds: ReadonlyMap<string, BedReading>): string | null {
  const main = ctx.rules.minMainDoubleBedroomShortSideMm;
  if (main === null) return null;
  const doubles = ctx.rooms.filter((r) => isBedroom(r) && beds.get(r.id) === "double");
  if (doubles.length === 0) return null;
  if (ctx.building.multiStorey) {
    ctx.skip("no-dwelling");
    return null;
  }
  let widest: { id: string; mm: number } | null = null;
  for (const r of doubles) {
    const mm = roomClearShortSideMm(ctx, r);
    if (mm === null) return null;
    if (mm >= main) return null;
    if (widest === null || mm > widest.mm) widest = { id: r.id, mm };
  }
  return widest?.id ?? null;
}

/** The source line of a per-use floor's hint, for the floors `DEFAULT_RULESET` sets. A floor a
 *  profile or ruleset sets has no source the rule can name, and gets none. */
const USE_FLOOR_SOURCE: Partial<Record<UseKind, string>> = {
  wc: "GB 50096-2011 5.4.2 (read as advice) asks at least 1.10 m² for a room with a WC alone.",
  bath: "GB 50096-2011 5.4.2 (read as advice) asks at least 2.00 m² for a WC or a basin with a shower or bath, and 5.4.1 asks 2.50 m² for all three.",
};

/**
 * The area floor `W_ROOM_TOO_SMALL` holds a room to: the highest of its uses' floors
 * ({@link roomUses}; `LintRuleset.minRoomAreaByUseM2`), where a use with no entry, and a room
 * with no classified use, take the generic `minRoomAreaM2`. `null` when every use is exempt.
 *
 * `use` is the use whose own entry set the floor, or `null` when the generic floor did (it
 * wins a tie), so a room the per-use table does not lower reads exactly as it always has.
 *
 * `beds` is the bedroom's {@link bedroomBeds} reading: a `double` bedroom also has
 * `minDoubleBedroomAreaM2` as a candidate (`double: true`), when the ruleset sets one (PS5.2).
 */
export function roomAreaFloor(
  r: RRoom,
  rules: LintRuleset,
  beds?: BedReading,
): { m2: number; use: UseKind | null; double?: true } | null {
  const floor = useAreaFloor(r, rules);
  const dbl = rules.minDoubleBedroomAreaM2;
  if (beds !== "double" || dbl === null || !roomUses(r).has("bedroom")) return floor;
  return floor === null || dbl > floor.m2 ? { m2: dbl, use: "bedroom", double: true } : floor;
}

function useAreaFloor(r: RRoom, rules: LintRuleset): { m2: number; use: UseKind | null } | null {
  const uses = [...roomUses(r)];
  if (uses.length === 0) return { m2: rules.minRoomAreaM2, use: null };
  // `at-least-generic` (a profile or caller that set the generic floor): it holds every room.
  let best: { m2: number; use: UseKind | null } | null =
    rules.roomAreaFloorMode === "at-least-generic" ? { m2: rules.minRoomAreaM2, use: null } : null;
  for (const u of uses) {
    const own = Object.hasOwn(rules.minRoomAreaByUseM2, u) ? rules.minRoomAreaByUseM2[u] : undefined;
    if (own === null) continue; // exempt
    const cand = own === undefined ? { m2: rules.minRoomAreaM2, use: null } : { m2: own, use: u };
    if (best === null || cand.m2 > best.m2 || (cand.m2 === best.m2 && cand.use === null)) best = cand;
  }
  return best;
}

export const perRoomRules: LintRule = {
  name: "per-room",
  family: "rooms",
  layer: "validity",
  // One stage per code: a room's size exists with the room; a door, a window or a wall does not.
  stage: {
    W_ROOM_TOO_SMALL: "rooms",
    W_ROOM_DISCONNECTED: "openings",
    W_BEDROOM_NO_WINDOW: "openings",
    W_ROOM_NOT_ENCLOSED: "walls",
    W_ROOM_NO_FIXTURE: "fixtures",
    W_GARAGE_TOO_NARROW: "rooms",
    W_ROOM_TOO_NARROW: "walls",
    W_GARAGE_OPENING_UNDERSIZED: "openings",
  },
  codes: [
    "W_ROOM_TOO_SMALL",
    "W_ROOM_DISCONNECTED",
    "W_BEDROOM_NO_WINDOW",
    "W_ROOM_NOT_ENCLOSED",
    "W_ROOM_NO_FIXTURE",
    "W_GARAGE_TOO_NARROW",
    "W_ROOM_TOO_NARROW",
    "W_GARAGE_OPENING_UNDERSIZED",
  ],
  check(ctx: LintContext): Diagnostic[] {
    const { rules, rooms, connectors, roomRects, wallSegs, nameOf, at, ir } = ctx;
    const out: Diagnostic[] = [];
    // PS5.2: each bedroom's bed reading and the main double bedroom, only under a ruleset that
    // reads them (none by default, so nothing here runs or files a skip).
    const beds = readsBeds(rules)
      ? new Map(rooms.filter((r) => isBedroom(r)).map((r) => [r.id, bedroomBeds(ctx, r)] as const))
      : null;
    const mainDouble = beds ? mainDoubleOf(ctx, beds) : null;
    const widths = asksWidths(rules);

    for (const r of rooms) {
      const rect = roomRects.get(r.id)!;
      const onEdge = (p: { x: number; y: number }): boolean => pointOnRoomEdge(p, rect, rules.tolMm);
      // The bedroom, wet-room, kitchen and garage checks below ask a room's use; a room with
      // none is not asked (coverage, PS2.13).
      if (roomUses(r).size === 0) ctx.skip("no-uses", r);

      // Implausibly tiny room, against the floor its use asks for.
      const rBeds = beds?.get(r.id);
      const floor = roomAreaFloor(r, rules, rBeds);
      // PS5.2: under a ruleset that reads areas as net (the residential-advisory profiles), a
      // per-use floor is measured on the room's net floor (ADR 0027), as the clauses measure it;
      // the drawn area stands in, said in a hint, only where the net area is omitted.
      const byNet = rules.roomAreaMeasure === "net" && floor !== null && floor.use !== null;
      const net = byNet ? netAreaM2(ctx, r) : undefined;
      const a = net ?? areaM2(r);
      if (floor !== null && a < floor.m2) {
        const noun = floor.double
          ? "a double bedroom"
          : floor.use === null
            ? ""
            : (USE_FLOOR_NOUN[floor.use] ?? `a room used as ${floor.use}`);
        // The source is cited only for the floor it gives: the default value, still in force.
        const source =
          floor.use !== null && floor.m2 === DEFAULT_RULESET.minRoomAreaByUseM2[floor.use]
            ? USE_FLOOR_SOURCE[floor.use]
            : undefined;
        out.push({
          severity: "warning",
          code: "W_ROOM_TOO_SMALL",
          ...at(r),
          message:
            floor.use === null
              ? `${capFirst(nameOf(r, "room"))} is only ${a} m² (under ${rules.minRoomAreaM2} m²).`
              : `${capFirst(nameOf(r, "room"))} is only ${a} m²${net !== undefined ? " of net floor" : ""} (under ${fmt2(floor.m2)} m², the floor for ${noun}).`,
          hints:
            floor.use === null
              ? ["Increase its `size`, or merge it into an adjacent space."]
              : [
                  ...(source !== undefined ? [source] : []),
                  ...(byNet && net === undefined ? [GROSS_AREA_HINT] : []),
                  "Increase its `size`, or merge it into an adjacent space.",
                  floor.double
                    ? DOUBLE_HINT
                    : `If \`${r.id}\` is not ${noun}, say what it is with \`uses …\`: a room's use is read from its \`uses\`, or from its label when it has none.`,
                ],
        });
      }

      // No door or opening on its perimeter, so it can't be entered.
      if (!connectors.some((c) => onEdge(c.at))) {
        out.push({
          severity: "warning",
          code: "W_ROOM_DISCONNECTED",
          ...at(r),
          message: `${capFirst(nameOf(r, "room"))} has no door or opening — it can't be entered.`,
          hints: ["Add a `door` or a cased `opening` on one of its walls."],
        });
      }

      // A bedroom needs natural light / egress.
      if (isBedroom(r) && !roomHasWindow(ctx, r)) {
        out.push({
          severity: "warning",
          code: "W_BEDROOM_NO_WINDOW",
          ...at(r),
          message: `${capFirst(nameOf(r, "bedroom"))} has no window.`,
          hints: ["Add a `window` on an exterior wall of this room."],
        });
      }

      // A wet room not fully walled in (a partition that stops short leaves it open).
      if (isWetRoom(r)) {
        // A circle room is measured by angle against concentric arc walls (its `poly` is
        // only the tessellation, which an arc's chord never backs); a polygon room around
        // its own ring (any edge angle); a rectangle keeps the four-sided test,
        // byte-for-byte.
        const gap = r.circle
          ? largestPerimeterGapCircle(r.circle.c, r.circle.r, wallSegs, rules.tolMm)
          : r.poly
            ? largestPerimeterGapRing(r.poly, ir.walls, rules.tolMm, wallSegs)
            : largestPerimeterGap(rect, ir.walls, rules.tolMm, wallSegs);
        if (gap > rules.maxUnenclosedMm) {
          out.push({
            severity: "warning",
            code: "W_ROOM_NOT_ENCLOSED",
            ...at(r),
            message: `${capFirst(nameOf(r, "bathroom"))} is not fully enclosed (~${Math.round(gap)} mm of its perimeter has no wall).`,
            hints: ["Extend the partition so the room is walled on all sides — a door or window in the wall is fine."],
          });
        }
      }

      // A wet room or kitchen with no fixtures reads as an empty box.
      const isWet = isWetRoom(r);
      const isKit = isKitchen(r);
      if (isWet || isKit) {
        if (lacksZoneFixture(ctx, r)) {
          out.push({
            severity: "warning",
            code: "W_ROOM_NO_FIXTURE",
            ...at(r),
            message: `${capFirst(nameOf(r, isWet ? "bathroom" : "kitchen"))} has no ${isWet ? "fixtures (WC, basin, shower…)" : "fixtures (sink, counter, stove…)"}.`,
            hints: [noFixtureHint(ctx, r)],
          });
        }
      }

      // A garage too narrow to park in. Appended to the per-room sequence, never inserted.
      //
      // The measure is the ROOM's short side, and the rule DECLINES a polygon room rather
      // than approximating one: a bounding box's short side is not a concave floor's clear
      // width, and a derived measurement taken from a shape's box instead of the shape is
      // the defect class this repository has already shipped six of. A garage is a rectangle
      // in practice; an L-shaped one gets no warning rather than a wrong one.
      if (isGarage(r) && r.poly) ctx.skip("non-rectangular-room", r);
      if (isGarage(r) && !r.poly) {
        const cars = parkedCars(ctx, rect);
        // An empty garage is still a garage, so it is measured against one bay: a room you
        // could not park in does not become sound by having no car drawn in it.
        const bays = Math.max(1, cars);
        const need = bays * CAR_BAY_WIDTH_MM;
        const have = Math.min(rect.w, rect.h);
        if (have < need) {
          const drawn = cars === 0 ? "no car drawn, so one bay is assumed" : `${cars} car${cars === 1 ? "" : "s"}`;
          out.push({
            severity: "warning",
            code: "W_GARAGE_TOO_NARROW",
            ...at(r),
            message: `${capFirst(nameOf(r, "garage"))} is ${mm(have)} mm across its short side, under the ${mm(need)} mm ${bays} bay${bays === 1 ? "" : "s"} need (${drawn}) — ${mm(shortfall(need, have))} mm short.`,
            hints: [
              `A parking bay wants ${CAR_BAY_WIDTH_MM} mm of clear width — body plus a door opening each side.`,
              cars > 1
                ? "Widen the room, or park fewer cars in it."
                : "Widen the room, or drop the `uses garage` tag if it is not one.",
            ],
          });
        }
      }

      // PS5.2: a bedroom whose single/double reading the profile needs but has no bed to read.
      if (rBeds === "no-bed") ctx.skip("no-bed", r);

      // PS5.2: a room narrower, between its wall faces, than the profile asks of its use, of a
      // double bedroom, or of a passage by the rooms it leads to. Appended to the sequence.
      const ask = widths ? widthAsk(ctx, r, rBeds, mainDouble) : null;
      if (ask !== null) {
        const have = roomClearShortSideMm(ctx, r);
        if (have === null) ctx.skip("non-rectangular-room", r);
        else if (have < ask.mm) {
          const d = deficitMm(ask.mm, have);
          out.push({
            severity: "warning",
            code: "W_ROOM_TOO_NARROW",
            ...at(r),
            message: `${capFirst(nameOf(r, "room"))} is ${d.available} mm wide between its wall faces, under the ${d.required} mm the profile asks of ${ask.of} — ${d.short} mm short.`,
            hints: [
              `Widen its short side until ${d.required} mm stand clear between the walls' inner faces (the drawn size runs to the wall centrelines, so add half of each wall's thickness).`,
              ...(ask.of === "a double bedroom" || ask.of.startsWith("one double bedroom") ? [DOUBLE_HINT] : []),
              ...(ask.of === "an entry passage" ? [ENTRY_HINT] : []),
            ],
          });
        }
      }

      // PS2.70: a garage too shallow to park in, along its vehicle door's axis. Appended to the
      // sequence. A polygon garage already filed `non-rectangular-room` above; a circle one
      // files it here.
      const depthNeed = rules.garageDepthMm;
      if (isGarage(r) && depthNeed !== null && !r.poly) {
        const depth = garageClearDepth(ctx, r);
        if (depth === null) ctx.skip("non-rectangular-room", r);
        else if (depth === "no-door") ctx.skip("no-vehicle-door", r);
        else if (depth.mm < depthNeed) {
          const d = deficitMm(depthNeed, depth.mm);
          const source = GARAGE_DEPTH_SOURCE[depthNeed];
          out.push({
            severity: "warning",
            code: "W_GARAGE_TOO_NARROW",
            ...at(r),
            message: `${capFirst(nameOf(r, "garage"))} is ${d.available} mm deep from its vehicle door, between its wall faces, under the ${d.required} mm of clear depth a parked car needs — ${d.short} mm short.`,
            hints: [
              ...(source !== undefined ? [source] : []),
              `Lengthen \`${r.id}\` along the line of its vehicle door${depth.door._idAuthored === true ? ` \`${depth.door.id}\`` : ""} until ${d.required} mm stand clear between the walls' inner faces (the drawn size runs to the wall centrelines, so add half of each wall's thickness), or drop the \`uses garage\` tag if it is not one.`,
            ],
          });
        }
      }

      // B6: a garage whose vehicle doors are too narrow to drive its cars through. Appended to
      // the sequence. A polygon or circle garage already filed `non-rectangular-room` above, and
      // one with no `door garage` on its perimeter the depth finding's `no-vehicle-door`. Cars
      // are counted as the bays are; one car or none wants a door of GARAGE_DOOR_SINGLE_MM, two
      // or more want one GARAGE_DOOR_DOUBLE_MM door or two single ones (a double garage with a
      // door per bay is sound). The OPENING only: door swing per bay stays `W_GARAGE_TOO_NARROW`'s.
      if (isGarage(r) && !r.poly && !r.circle) {
        const vehicle = ctx.doors.filter((d) => d.doorKind === "garage" && onEdge(d.at));
        if (vehicle.length > 0) {
          const widest = vehicle.reduce((a, b) => (b.width > a.width ? b : a));
          const cars = parkedCars(ctx, rect);
          const singles = vehicle.filter((d) => d.width >= GARAGE_DOOR_SINGLE_MM).length;
          const need =
            widest.width < GARAGE_DOOR_SINGLE_MM
              ? GARAGE_DOOR_SINGLE_MM
              : cars >= 2 && widest.width < GARAGE_DOOR_DOUBLE_MM && singles < 2
                ? GARAGE_DOOR_DOUBLE_MM
                : null;
          if (need !== null) {
            const d = deficitMm(need, widest.width);
            const two = need === GARAGE_DOOR_DOUBLE_MM;
            const door = vehicle.length === 1 ? "a vehicle door" : "vehicle doors at most";
            out.push({
              severity: "warning",
              code: "W_GARAGE_OPENING_UNDERSIZED",
              ...at(r),
              message: `${capFirst(nameOf(r, "garage"))} has ${door} ${d.available} mm wide, under the ${d.required} mm ${two ? `its ${cars} cars need to drive through side by side` : "one car needs to drive through"} — ${d.short} mm short.`,
              hints: [
                GARAGE_DOOR_SOURCE,
                `Widen the vehicle door${widest._idAuthored === true ? ` \`${widest.id}\`` : ""} to ${d.required} mm or more${two ? `, add a second vehicle door at least ${GARAGE_DOOR_SINGLE_MM} mm wide` : ""}, ${cars > 0 ? `or park fewer cars in \`${r.id}\`` : `or drop the \`uses garage\` tag if \`${r.id}\` is not one`}.`,
              ],
            });
          }
        }
      }
    }
    return out;
  },
};

/** What makes a passage the entry passage (PS5.2), and the known over-reach (card PS2.44). */
const ENTRY_HINT =
  "It is read as the entry passage because a door from outside opens into it (or it is `uses entry`); a door onto a balcony counts too for now, which overstates a passage that is entered only from a balcony.";

/** Why a bedroom reads as a double (PS5.2): its bed, never its label. */
const DOUBLE_HINT = `It reads as a double bedroom from its bed: a \`double_bed\`, a \`bed\` wider than ${DOUBLE_BED_MIN_WIDTH_MM} mm, or two beds.`;
